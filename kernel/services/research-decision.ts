import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { parseProductInstanceDocument } from "../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../catalog/ontology/render-product.js";
import { atomicFile, durableUnlink } from "../lib/atomic-file.js";
import { acquireLock, releaseLock } from "../reducer/lock.js";
import { registeredWorkspace } from "./installed-composition.js";
import { isPlanningWorkspace } from "../session/planning-context.js";
import { workspaceRevision } from "../session/workspace-revision.js";

const JOURNAL = "strategy/.b2c-research-decision-journal.json";
const MAX_TEXT = 8 * 1024;
const DECISION_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

type DecisionInput = {
  workspaceId: string;
  expectedRevision: string;
  decisionId: string;
  verdict: "Go" | "Pivot" | "Kill";
  rationale: string;
  findingIds: string[];
  apply: boolean;
  afterWrite?: (boundary: "journal" | "product" | "rendered") => void;
};

type Proposal = {
  decisionId: string;
  verdict: DecisionInput["verdict"];
  rationale: string;
  findingIds: string[];
  proposalDigest: string;
  productBefore: string;
  productAfter: string;
  renderedBefore: string;
  renderedAfter: string;
  replayed: boolean;
};

type Journal = {
  schemaVersion: 1;
  operationId: string;
  decisionId: string;
  proposalDigest: string;
  productBefore: string;
  productAfter: string;
  renderedBefore: string;
  renderedAfter: string;
};

const sha256 = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function safeFile(root: string, relative: string): string {
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("business.research_decision_unsafe_path");
  }
  return current;
}

function readUtf8(root: string, relative: string): string {
  const file = safeFile(root, relative);
  if (!existsSync(file) || !lstatSync(file).isFile()) throw new Error(`business.research_decision_missing:${relative}`);
  return readFileSync(file, "utf8");
}

function resolvedFindingIds(root: string): Set<string> {
  const text = readUtf8(root, "strategy/RED_TEAM_FINDINGS.md");
  const ids = new Set<string>();
  let tableHasFindingId = false;
  for (const line of text.split(/\r?\n/)) {
    const labeled = line.match(/^\s*(?:[-*]\s*)?Finding ID\s*[:|]\s*([^|\s]+)\s*\|?\s*$/i);
    if (labeled?.[1] && DECISION_ID.test(labeled[1])) addFindingId(ids, labeled[1]);
    if (line.trim().startsWith("|") && /finding\s+id/i.test(line)) {
      tableHasFindingId = true;
      continue;
    }
    if (tableHasFindingId && line.trim().startsWith("|")) {
      const firstCell = line.split("|")[1]?.trim();
      if (firstCell && !/^[-:]+$/.test(firstCell) && DECISION_ID.test(firstCell)) addFindingId(ids, firstCell);
    }
  }
  return ids;
}

function addFindingId(ids: Set<string>, findingId: string): void {
  if (ids.has(findingId)) throw new Error("business.research_decision_finding_id_ambiguous");
  ids.add(findingId);
}

function parseProduct(root: string, text: string) {
  let document: YAML.Document;
  try {
    document = YAML.parseDocument(text, { uniqueKeys: true, strict: true });
  } catch (error) {
    throw new Error(`business.research_decision_product_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
  if (document.errors.length) throw new Error(`business.research_decision_product_invalid:${document.errors.map((error) => error.message).join("; ")}`);
  const parsed = document.toJS({ maxAliasCount: 0 });
  const product = parseProductInstanceDocument(parsed);
  const rendered = renderProductMarkdown(product);
  const currentRendered = readUtf8(root, "PRODUCT.md");
  if (currentRendered !== renderProductMarkdown(product)) throw new Error("business.research_decision_product_mirror_mismatch");
  return { document, product, rendered };
}

function marker(decisionId: string, proposalDigest: string): string {
  return `<!-- b2c-research-decision:v1:${decisionId}:${proposalDigest} -->`;
}

function prepare(root: string, input: DecisionInput): Proposal {
  if (!DECISION_ID.test(input.decisionId)) throw new Error("business.research_decision_id_invalid");
  if (!input.rationale.trim() || input.rationale.length > MAX_TEXT) throw new Error("business.research_decision_rationale_invalid");
  if (input.findingIds.some((id) => !DECISION_ID.test(id))) throw new Error("business.research_decision_finding_id_invalid");
  if (input.findingIds.length > 0) {
    const availableFindingIds = resolvedFindingIds(root);
    const unknownFindingIds = [...new Set(input.findingIds)].filter((id) => !availableFindingIds.has(id));
    if (unknownFindingIds.length > 0) throw new Error("business.research_decision_finding_id_unresolved");
  }
  const productBefore = readUtf8(root, "product.yaml");
  const { document, product, rendered: renderedBefore } = parseProduct(root, productBefore);
  const canonical = JSON.stringify({
    decisionId: input.decisionId,
    verdict: input.verdict,
    rationale: input.rationale.trim(),
    findingIds: [...new Set(input.findingIds)].sort(),
  });
  const proposalDigest = sha256(canonical);
  const currentLog = product.copy.decisionLog;
  const existing = [...currentLog.matchAll(/<!-- b2c-research-decision:v1:([a-z0-9][a-z0-9._-]{0,63}):(sha256:[a-f0-9]{64}) -->/g)].find(
    ([, decisionId]) => decisionId === input.decisionId,
  );
  if (existing && existing[2] !== proposalDigest) throw new Error("business.research_decision_id_reused");
  const row = `| ${new Date().toISOString().slice(0, 10)} | ${input.verdict} | ${input.rationale.trim().replaceAll("|", "\\|")} | Recorded planning checkpoint; initialization held; finding IDs: ${input.findingIds.length ? input.findingIds.join(", ") : "none"} | ${marker(input.decisionId, proposalDigest)} |`;
  const nextLog = existing ? currentLog : `${currentLog.trimEnd()}\n${row}\n`;
  if (!existing) document.setIn(["copy", "decision_log"], nextLog);
  const productAfter = document.toString();
  const parsedAfter = parseProductInstanceDocument(YAML.parse(productAfter));
  const renderedAfter = renderProductMarkdown(parsedAfter);
  return {
    decisionId: input.decisionId,
    verdict: input.verdict,
    rationale: input.rationale.trim(),
    findingIds: [...new Set(input.findingIds)].sort(),
    proposalDigest,
    productBefore,
    productAfter,
    renderedBefore,
    renderedAfter,
    replayed: Boolean(existing),
  };
}

function recover(root: string): boolean {
  const journalPath = safeFile(root, JOURNAL);
  if (!existsSync(journalPath)) return false;
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
  const productPath = safeFile(root, "product.yaml");
  const renderedPath = safeFile(root, "PRODUCT.md");
  const product = readFileSync(productPath, "utf8");
  const rendered = readFileSync(renderedPath, "utf8");
  const before = product === journal.productBefore && rendered === journal.renderedBefore;
  const after = product === journal.productAfter && rendered === journal.renderedAfter;
  const productCommitted = product === journal.productAfter && rendered === journal.renderedBefore;
  const renderedCommitted = product === journal.productBefore && rendered === journal.renderedAfter;
  if (!before && !after && !productCommitted && !renderedCommitted) throw new Error("business.research_decision_recovery_required");
  if (after) {
    durableUnlink(journalPath);
    return true;
  }
  if (!productCommitted) atomicFile(productPath, journal.productAfter);
  if (!renderedCommitted) atomicFile(renderedPath, journal.renderedAfter);
  durableUnlink(journalPath);
  return true;
}

export function recordResearchDecision(input: DecisionInput) {
  const root = registeredWorkspace(input.workspaceId);
  const lockPath = safeFile(root, "control/session.lock");
  const owner = `research-decision-${randomUUID()}`;
  const lease = acquireLock(lockPath, { ownerSessionId: owner, retries: 0 });
  if (!lease.ok) throw new Error("business.session_lock_unavailable");
  try {
    const recoveryRevision = workspaceRevision(root);
    const recovered = recover(root);
    let planning: boolean;
    try {
      planning = isPlanningWorkspace(root);
    } catch (error) {
      throw new Error(`business.research_decision_product_invalid:${error instanceof Error ? error.message : String(error)}`);
    }
    if (!planning) throw new Error("business.research_decision_requires_planning");
    if (workspaceRevision(root) !== input.expectedRevision && !(recovered && recoveryRevision === input.expectedRevision))
      throw new Error("business.stale_revision");
    const proposal = prepare(root, input);
    const response = {
      workspaceId: input.workspaceId,
      revision: workspaceRevision(root),
      decisionId: proposal.decisionId,
      proposalDigest: proposal.proposalDigest,
      verdict: proposal.verdict,
      findingIds: proposal.findingIds,
      initializationEligible: false as const,
      authorityGranted: false as const,
      applied: false,
      replayed: proposal.replayed,
      affectedFiles: ["product.yaml", "PRODUCT.md"],
      unresolvedObligations: ["Independent review and all applicable initialization requirements remain required."],
    };
    if (!input.apply || proposal.productBefore === proposal.productAfter) return response;
    const journal: Journal = {
      schemaVersion: 1,
      operationId: randomUUID(),
      decisionId: proposal.decisionId,
      proposalDigest: proposal.proposalDigest,
      productBefore: proposal.productBefore,
      productAfter: proposal.productAfter,
      renderedBefore: proposal.renderedBefore,
      renderedAfter: proposal.renderedAfter,
    };
    atomicFile(safeFile(root, JOURNAL), JSON.stringify(journal));
    input.afterWrite?.("journal");
    atomicFile(safeFile(root, "product.yaml"), proposal.productAfter);
    input.afterWrite?.("product");
    atomicFile(safeFile(root, "PRODUCT.md"), proposal.renderedAfter);
    input.afterWrite?.("rendered");
    durableUnlink(safeFile(root, JOURNAL));
    return { ...response, revision: workspaceRevision(root), applied: true as const };
  } finally {
    releaseLock(lockPath, owner);
  }
}
