import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { loadKnowledgePackages, resolveKnowledgeGraph } from "../../../catalog/knowledge-packages.js";
import type { Catalog, CatalogKnowledgePackage, CatalogWorkflowDef, ReferenceId, WorkflowId } from "../../../catalog/types.js";
import { CONTRIBUTION_API_VERSION, contributionManifestSchema, type ContributionManifest } from "../../../contracts/contribution/contract.js";
import { writeContributionManifest } from "../../../kernel/contribution/manifest-io.js";
import { previewContribution } from "../../../kernel/contribution/preview.js";
import { codePointPrefix, createKnowledgeService, KnowledgeServiceError } from "../../../kernel/knowledge-service/service.js";
import {
  DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET,
  HOSTED_KNOWLEDGE_SCHEMA_VERSION,
  MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
  type HostedKnowledgeBundle,
  type HostedKnowledgeDocument,
} from "../../../kernel/knowledge-service/types.js";
import { HOSTED_BUNDLE_RELATIVE_PATH } from "../../../tooling/render-hosted-bundle.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, repoRoot, skillRoot, type Harness } from "./_harness.js";

/**
 * Runtime-context proofs for the contribution path (ADR-0005; ARCH-09 "selected knowledge must
 * reach worker briefs through the existing bounded knowledge service, with required coverage and
 * explicit truncation"; ARCH-06 "discovery parses metadata; it executes no package code").
 *
 * Proof 10: a synthetic hosted bundle, built through the same `resolveKnowledgeGraph` filter the
 * renderer uses, shows what an active worker receives: full delivery of a short reference,
 * honest truncation of a large one with a usable continuation offset, incomplete coverage that
 * names the truncated reference, and no trace of a draft package in the workflow, search, or get.
 *
 * Proof 17: the SHIPPED bundle (catalog/generated/hosted-knowledge.json) carries active references
 * only, no upstream inventory text, and a dispatch brief that loads knowledge paths only.
 *
 * Proof 1: the labeled synthetic post-to-method demo under examples/contributions/ validates
 * against the frozen contract, cites the idea without adapting it, and stays outside knowledge/
 * and outside every delivered bundle. The CLI check/preview/plan cases depend on kernel modules
 * another agent writes concurrently; a module-not-found result is recorded as a skip with the
 * pending module named, never as a pass.
 */

const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

const DEMO_RELATIVE = "examples/contributions/synthetic-post-visual-direction";
const DEMO_ROOT = path.join(repoRoot, DEMO_RELATIVE);
const DEMO_POST = path.join(DEMO_ROOT, "source/post.md");
const DEMO_CANDIDATE = path.join(DEMO_ROOT, "candidate/critique-heuristic.md");
const DEMO_GOAL = "improve the visual-direction critique method";
const DEMO_SOURCE_ID = "synthetic-designer-grayscale-post";
const DEMO_OWNER: ReferenceId = "reference.design.audience-derived-identity";
const DEMO_SECOND_OWNER: ReferenceId = "reference.design.vibecoded-tells";
/** A sentence that exists only in the candidate text; knowledge/ and the shipped bundle must never carry it. */
const CANDIDATE_SENTENCE = "Status: draft candidate.";
const POST_LABEL = "SYNTHETIC FIXTURE: an invented post, not a real creator's writing.";
const HEURISTIC_PHRASE = "survives grayscale";

/** A short shipped reference bound after a long one, so the default bundle of this workflow omits it. */
const LATE_REFERENCE: ReferenceId = "reference.growth.hdyhau-blended-roas";
const LATE_WORKFLOW: WorkflowId = "workflow.data.analytics-and-attribution-blueprint";

const FIXTURE_WORKFLOW: WorkflowId = "workflow.design.visual-direction-review";
const R1: ReferenceId = "reference.design.grayscale-rule";
const R2: ReferenceId = "reference.design.visual-direction-guide";
const R3: ReferenceId = "reference.design.draft-candidate";
/** Distinctive to the draft text so a search hit would prove a leak. */
const DRAFT_PHRASE = "zebra-stripe survivorship heuristic";
const SMALL_BUDGET = 256;

const R1_TEXT = "# Grayscale rule\n\nRender the screen in grayscale. If the reading order holds, the palette carries decoration only.\n";
const R2_TEXT = `# Visual direction guide\n\n${Array.from({ length: 48 }, (_, index) => `${index + 1}. Check type scale, spacing, and contrast on screen ${index + 1} before you judge the palette.\n`).join("")}`;
const R3_TEXT = `# Draft candidate\n\nThe ${DRAFT_PHRASE} is under review and must never reach a worker.\n`;
const FIXTURE_TEXTS = new Map<ReferenceId, string>([
  [R1, R1_TEXT],
  [R2, R2_TEXT],
  [R3, R3_TEXT],
]);

function syntheticPackage(id: ReferenceId, title: string, lifecycle: CatalogKnowledgePackage["lifecycle"]): CatalogKnowledgePackage {
  const slug = id.slice("reference.design.".length);
  return {
    id,
    title,
    domainId: "domain.design",
    path: `knowledge/design/${slug}.md`,
    loadWhen: `when the review needs the ${title.toLowerCase()}`,
    lifecycle,
    sourceExemption: "Synthetic fixture text.",
    sources: [],
    replacementIds: [],
    workflowIds: [FIXTURE_WORKFLOW],
    contextPackIds: [],
    manifestPath: `catalog/knowledge/design/design-${slug}.yaml`,
  };
}

function fixtureWorkflow(): CatalogWorkflowDef {
  return {
    id: FIXTURE_WORKFLOW,
    title: "Review the visual direction",
    domainId: "domain.design",
    areaIds: [],
    trigger: "Before a screen is marked review-ready",
    founderPhrasings: [],
    instructions: "Render the screen and check hierarchy before palette.",
    reads: ["DESIGN.md"],
    consults: [],
    referenceIds: [],
    roleId: "role.design",
    laneIds: [],
    phaseIds: [],
    dependencies: [],
    outputPaths: ["design/REVIEW.md"],
    gateCommands: [],
    providerIds: [],
    founderOnlyActions: [],
    actionClass: "draft",
    idempotent: true,
    applicability: { mode: "always" },
  };
}

function syntheticDocument(referenceId: ReferenceId, markdown: string, manifestPath: string): HostedKnowledgeDocument {
  return {
    referenceId,
    markdown,
    summary: codePointPrefix(markdown, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH),
    contentSha256: digest(markdown),
    sourceMediaType: "text/markdown",
    sourceSha256: digest(markdown),
    manifestPath,
    manifestSha256: digest(manifestPath),
  };
}

/** Three authored packages, one of them a draft. The active filter is the renderer's own `resolveKnowledgeGraph`. */
function syntheticPackages(): CatalogKnowledgePackage[] {
  return [
    syntheticPackage(R1, "Grayscale rule", "active"),
    syntheticPackage(R2, "Visual direction guide", "active"),
    syntheticPackage(R3, "Draft candidate", "draft"),
  ];
}

function syntheticBundle(packages: readonly CatalogKnowledgePackage[] = syntheticPackages()): HostedKnowledgeBundle {
  const graph = resolveKnowledgeGraph(packages, [fixtureWorkflow()], []);
  const catalog: Catalog = {
    schemaVersion: "2.0.0",
    skillVersion: "0.0.0-fixture",
    areas: [],
    domains: [{ id: "domain.design", slug: "design", name: "Design", areaIds: [], routeLabel: "Design", routeWhen: "Design a screen", order: 1 }],
    phases: [],
    lanes: [],
    roles: [],
    contextPacks: graph.contextPacks,
    references: graph.references,
    workflows: graph.workflows,
    artifacts: [],
    gates: [],
    profiles: [],
  };
  const byId = new Map(packages.map((item) => [item.id, item]));
  const documents = graph.references.map((reference) =>
    syntheticDocument(reference.id, FIXTURE_TEXTS.get(reference.id)!, byId.get(reference.id)!.manifestPath),
  );
  return {
    schemaVersion: HOSTED_KNOWLEDGE_SCHEMA_VERSION,
    engineVersion: catalog.skillVersion,
    catalogSha256: digest(JSON.stringify(catalog)),
    bundleSha256: digest(JSON.stringify(documents)),
    catalog,
    documents,
  };
}

function expectError(fn: () => unknown, fragment: string): void {
  let message = "";
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(fragment), `expected an error containing "${fragment}"; got ${message || "no error"}`);
}

let shipped: HostedKnowledgeBundle | undefined;
function shippedBundle(): HostedKnowledgeBundle {
  shipped ??= JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
  return shipped;
}

/** Mirror of the reader's snake_case to camelCase rule (kernel/contribution/upstreams-load.ts). */
function snakeToCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeToCamel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key.replace(/_([a-z0-9])/gu, (_match, char: string) => char.toUpperCase()),
        snakeToCamel(entry),
      ]),
    );
  }
  return value;
}

function demoManifest(): ContributionManifest {
  return contributionManifestSchema.parse(snakeToCamel(YAML.parse(readFileSync(path.join(DEMO_ROOT, "contribution.yaml"), "utf8"))));
}

/** Body paragraphs of the post, after the byline, so a selector such as "paragraph 2" resolves to real text. */
function postBodyParagraphs(post: string): string[] {
  const byline = post.indexOf("By Synthetic Designer");
  assert(byline >= 0, "the synthetic post lost its author line");
  return post
    .slice(post.indexOf("\n\n", byline))
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function keywordsOfMatch(match: string): string[] {
  const keywords = match
    .replace(/^keyword match:\s*/u, "")
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
  assert(keywords.length > 0 && match.startsWith("keyword match:"), `existingOwners.match must name keywords; got "${match}"`);
  return keywords;
}

function markdownFilesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
    .flatMap((entry) => {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) return markdownFilesUnder(full);
      return entry.isFile() && entry.name.endsWith(".md") ? [full] : [];
    });
}

/** Names, sizes, and mtimes of every file under a root: two equal snapshots prove a command wrote nothing there. */
function treeSnapshot(root: string): string {
  const lines: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = statSync(full);
        lines.push(`${path.relative(root, full)}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(root);
  return lines.join("\n");
}

/* ------------------------------------------------------------------------------------------ */
/* CLI runs that depend on modules other agents are still writing                              */
/* ------------------------------------------------------------------------------------------ */

const tsxBin = resolveTsxBin(skillRoot);
const contributeCli = path.join(skillRoot, "entrypoints/cli/contribute.ts");

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runContributeCli(args: string[]): CliRun {
  const result = spawnSync(tsxBin, [contributeCli, ...args], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, B2C_APP_BUILDER_CALLER_CWD: skillRoot },
  });
  if (result.error) return { status: null, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}\nspawn error: ${result.error.message}` };
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

const PENDING_OWNERS: Record<string, string> = {
  check: "intake-plan",
  evaluate: "intake-plan",
  plan: "intake-plan",
  preview: "intake-plan",
  upstreams: "upstreams",
};

/** The pending kernel/contribution module a module-not-found failure names, if that is what failed. */
function pendingModule(run: CliRun): string | undefined {
  const match = /Cannot find module '[^']*?kernel\/contribution\/(check|evaluate|plan|preview|upstreams)\.js'/u.exec(`${run.stdout}\n${run.stderr}`);
  return match?.[1];
}

function pendingReason(module: string): string {
  return `kernel/contribution/${module}.ts pending from agent ${PENDING_OWNERS[module] ?? "unknown"}`;
}

interface Envelope<T> {
  readonly ok: boolean;
  readonly warnings?: string[];
  readonly data?: T;
  readonly error?: { code: string; message: string; fields: string[] };
}

function parseEnvelope<T>(run: CliRun, label: string): Envelope<T> {
  const start = run.stdout.indexOf("{");
  assert(start >= 0, `${label} printed no JSON (exit ${run.status})\n${run.stdout.slice(-600)}\n${run.stderr.slice(-600)}`);
  try {
    return JSON.parse(run.stdout.slice(start)) as Envelope<T>;
  } catch (error) {
    throw new Error(`${label} printed unparseable JSON: ${error instanceof Error ? error.message : String(error)}\n${run.stdout.slice(-600)}`);
  }
}

/**
 * Run one CLI case: skip with the pending reason when the kernel module is absent, otherwise
 * hand the parsed envelope to the assertion. Skips are never counted as passes by the harness.
 */
function cliCase<T>(harness: Harness, label: string, args: string[], assertion: (envelope: Envelope<T>, run: CliRun) => void): void {
  const run = runContributeCli(args);
  const pending = pendingModule(run);
  if (pending) {
    harness.skip(label, pendingReason(pending));
    return;
  }
  harness.check(label, () => assertion(parseEnvelope<T>(run, `b2c contribute ${args[0]}`), run));
}

interface CheckEnvelopeData {
  readonly manifestId: string;
  readonly pass: boolean;
  readonly issues: Array<{ severity: string; code: string; message: string }>;
  readonly summary: { units: number; sources: number; copiedUnits: number; originalUnits: number };
}

interface PreviewEnvelopeData {
  readonly manifestId: string;
  readonly units: Array<{ unitId: string; delivered: boolean; reason: string; boundWorkflowIds: string[]; lifecycle: string }>;
  readonly excluded: Array<{ unitId: string; reason: string }>;
  readonly changesCatalog: boolean;
}

interface PlanEnvelopeData {
  readonly manifest: {
    synthetic: boolean;
    sources: Array<{
      publisher?: string;
      rights: { status: string; spdx?: string };
      revision?: string;
      localPath?: string;
      retrieval: { status: string };
      directives: unknown[];
      inventory: Array<{ path: string; sha256?: string }>;
    }>;
  };
  readonly written: unknown;
  readonly networkUsed: boolean;
  readonly refusedDirectives: number;
}

/* ------------------------------------------------------------------------------------------ */

export function register(harness: Harness): void {
  harness.check(
    "runtime context: a full bundle under a small budget delivers the short reference whole and truncates the large one with a usable continuation",
    () => {
      const bundle = syntheticBundle();
      const service = createKnowledgeService(bundle);
      const r1Length = Array.from(R1_TEXT).length;
      const r2Length = Array.from(R2_TEXT).length;
      assert(r1Length < SMALL_BUDGET && r2Length > SMALL_BUDGET, "fixture texts must straddle the budget for the case to mean anything");

      const result = service.workflow({ workflowId: FIXTURE_WORKFLOW, include: "full", tokenBudget: SMALL_BUDGET });
      assert(
        result.knowledge.map((entry) => entry.referenceId).join(",") === `${R1},${R2}`,
        `workflow knowledge must list the two active references only; got ${result.knowledge.map((entry) => entry.referenceId).join(",")}`,
      );
      const knowledgeBundle = result.knowledgeBundle;
      assert(knowledgeBundle !== null, "include=full must produce a knowledge bundle");
      const [first, second] = knowledgeBundle.references;
      assert(
        first?.referenceId === R1 && second?.referenceId === R2 && knowledgeBundle.references.length === 2,
        "bundle references must follow the workflow binding order",
      );
      assert(
        first.markdown === R1_TEXT && first.chars === r1Length && !first.truncated && first.nextOffset === null,
        "the short reference must arrive in full",
      );
      const remaining = SMALL_BUDGET - r1Length;
      assert(
        second.chars === remaining && second.markdown === codePointPrefix(R2_TEXT, remaining),
        `the large reference must receive exactly the remaining budget (${remaining}); got ${second.chars}`,
      );
      assert(
        second.truncated && second.nextOffset === remaining,
        `truncation must be explicit with nextOffset ${remaining}; got truncated=${second.truncated} nextOffset=${second.nextOffset}`,
      );
      assert(knowledgeBundle.consumedChars === SMALL_BUDGET, "the bundle must account for every consumed code point");
      assert(!knowledgeBundle.coverage.complete, "coverage must not claim completeness after a truncation");
      assert(knowledgeBundle.coverage.requiredReferenceIds.join(",") === `${R1},${R2}`, "required references must equal the workflow binding");
      const incomplete = knowledgeBundle.coverage.incomplete;
      assert(
        incomplete.length === 1 && incomplete[0]?.referenceId === R2 && incomplete[0].status === "truncated" && incomplete[0].offset === remaining,
        `coverage.incomplete must name the truncated reference with its offset; got ${JSON.stringify(incomplete)}`,
      );
      assert(incomplete[0].contentSha256 === digest(R2_TEXT), "the incomplete entry must carry the complete-document hash, not the prefix hash");

      const continuation = service.get({ referenceId: R2, offset: second.nextOffset, limit: 16_384 });
      assert(second.markdown + continuation.markdown === R2_TEXT, "the bundle prefix plus the continuation page must reassemble the full document");
      assert(continuation.pagination.nextOffset === null, "one continuation page must finish a document of this size");
    },
  );

  harness.check("runtime context: a draft package bound to the workflow never reaches the bundle, the workflow, search, or get", () => {
    const packages = syntheticPackages();
    const draft = packages.find((item) => item.id === R3);
    assert(
      draft?.lifecycle === "draft" && draft.workflowIds.includes(FIXTURE_WORKFLOW),
      "the draft must be bound to the workflow so exclusion is by lifecycle, not by a missing binding",
    );
    const bundle = syntheticBundle(packages);
    assert(!bundle.catalog.references.some((reference) => reference.id === R3), "the active graph must drop the draft reference");
    assert(!bundle.documents.some((document) => document.referenceId === R3), "the bundle must carry no document for the draft");
    assert(bundle.catalog.workflows[0]?.referenceIds.join(",") === `${R1},${R2}`, "the workflow binding must exclude the draft");

    const service = createKnowledgeService(bundle);
    const result = service.workflow({ workflowId: FIXTURE_WORKFLOW, include: "full", tokenBudget: 200_000 });
    assert(!result.knowledge.some((entry) => entry.referenceId === R3), "workflow knowledge leaked the draft");
    assert(!JSON.stringify(result).includes(DRAFT_PHRASE), "workflow result text leaked the draft");
    const unscoped = service.search({ query: DRAFT_PHRASE });
    assert(
      unscoped.pagination.total === 0 && unscoped.results.length === 0,
      `a search for the draft's phrase must return nothing; got ${unscoped.pagination.total}`,
    );
    const scoped = service.search({ query: DRAFT_PHRASE, workflowId: FIXTURE_WORKFLOW });
    assert(!scoped.results.some((entry) => entry.referenceId === R3 || entry.excerpt.includes(DRAFT_PHRASE)), "workflow-scoped search leaked the draft");
    assert(
      service.catalog({ query: "draft candidate" }).workflows.length === 0 || !JSON.stringify(service.catalog({})).includes(R3),
      "catalog listing leaked the draft",
    );
    let code = "";
    try {
      service.get({ referenceId: R3 });
    } catch (error) {
      code = error instanceof KnowledgeServiceError ? error.code : String(error);
    }
    assert(code === "not_found", `get on the draft must report not_found; got ${code || "a document"}`);
  });

  harness.check("runtime context: the knowledge service refuses a bundle that smuggles a draft reference or a stray document", () => {
    const withDraft = syntheticBundle();
    const draft = syntheticPackage(R3, "Draft candidate", "draft");
    withDraft.catalog.references.push({
      ...draft,
      workflowIds: undefined,
      contextPackIds: undefined,
      manifestPath: undefined,
    } as unknown as Catalog["references"][number]);
    withDraft.documents.push(syntheticDocument(R3, R3_TEXT, draft.manifestPath));
    expectError(() => createKnowledgeService(withDraft), "Invalid hosted knowledge bundle");

    const stray = syntheticBundle();
    stray.documents.push(syntheticDocument(R3, R3_TEXT, draft.manifestPath));
    expectError(() => createKnowledgeService(stray), "Invalid hosted knowledge bundle");

    const stillValid = syntheticBundle();
    assert(
      createKnowledgeService(stillValid).workflow({ workflowId: FIXTURE_WORKFLOW, include: "summaries" }).knowledge.length === 2,
      "the untouched fixture bundle must still construct",
    );
  });

  harness.check("runtime context: a summaries bundle never claims complete reading of a longer document", () => {
    const service = createKnowledgeService(syntheticBundle());
    const result = service.workflow({ workflowId: FIXTURE_WORKFLOW, include: "summaries", tokenBudget: 8_000 });
    const knowledgeBundle = result.knowledgeBundle;
    assert(knowledgeBundle !== null, "include=summaries must produce a knowledge bundle");
    const [first, second] = knowledgeBundle.references;
    assert(
      first?.referenceId === R1 && !first.truncated && first.markdown === R1_TEXT,
      "a document shorter than the summary limit arrives whole at summary depth",
    );
    assert(
      second?.referenceId === R2 &&
        second.depth === "summary" &&
        second.chars === MAX_HOSTED_REFERENCE_SUMMARY_LENGTH &&
        second.truncated &&
        second.nextOffset === MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
      `a longer document at summary depth must stop at ${MAX_HOSTED_REFERENCE_SUMMARY_LENGTH} and say so; got ${JSON.stringify({ chars: second?.chars, truncated: second?.truncated, nextOffset: second?.nextOffset })}`,
    );
    assert(
      !knowledgeBundle.coverage.complete && knowledgeBundle.coverage.incomplete[0]?.referenceId === R2,
      "summary coverage must stay incomplete for the longer document",
    );
  });

  harness.check("shipped bundle: catalog/generated/hosted-knowledge.json carries active references only and no upstream inventory text", () => {
    const bundle = shippedBundle();
    assert(
      bundle.catalog.references.length > 0 && bundle.documents.length === bundle.catalog.references.length,
      "the shipped bundle must pair every reference with a document",
    );
    const notActive = bundle.catalog.references
      .filter((reference) => reference.lifecycle !== "active")
      .map((reference) => `${reference.id}=${reference.lifecycle}`);
    assert(notActive.length === 0, `every shipped reference must be active; got ${notActive.join(", ")}`);
    const upstreamIds = bundle.documents.filter((document) => document.referenceId.includes("upstream")).map((document) => document.referenceId);
    assert(upstreamIds.length === 0, `no shipped document may be an upstream inventory; got ${upstreamIds.join(", ")}`);
    const leaks = bundle.documents
      .filter((document) => ["ACKNOWLEDGMENTS.md", "THIRD_PARTY_NOTICES.md", "catalog/upstreams"].some((needle) => document.markdown.includes(needle)))
      .map((document) => document.referenceId);
    assert(leaks.length === 0, `shipped knowledge text must not point workers at credits or upstream files; got ${leaks.join(", ")}`);
    const packages = new Map(loadKnowledgePackages(repoRoot).map((item) => [item.id, item]));
    const drafts = bundle.documents.filter((document) => packages.get(document.referenceId)?.lifecycle === "draft").map((document) => document.referenceId);
    assert(drafts.length === 0, `a package that is a draft in catalog/knowledge must not ship; got ${drafts.join(", ")}`);
  });

  harness.check(
    "shipped bundle: the asc-cli-automation dispatch brief loads knowledge paths only and carries no acknowledgments, release-history, or upstream-inventory text",
    () => {
      const service = createKnowledgeService(shippedBundle());
      const result = service.workflow({ workflowId: "workflow.store.asc-cli-automation", brief: true });
      const brief = result.dispatchBrief;
      assert(brief !== null && brief.workflowId === "workflow.store.asc-cli-automation", "brief=true must return a dispatch brief for the shipped workflow");
      assert(brief.load.length > 0, "the shipped workflow must bind at least one reference");
      const forbidden = /acknowledgments|release history|upstream inventory/iu;
      const serialized = JSON.stringify(brief);
      assert(!forbidden.test(serialized), `the dispatch brief must not carry credits or inventory text; matched ${forbidden.exec(serialized)?.[0]}`);
      assert(!forbidden.test(JSON.stringify(result.knowledge)), "the workflow knowledge summaries must not carry credits or inventory text");
      const offPath = [...brief.load, ...brief.route].map((entry) => entry.path).filter((entry) => !entry.startsWith("knowledge/"));
      assert(offPath.length === 0, `every loaded or routed path must live under knowledge/; got ${offPath.join(", ")}`);
      const full = service.workflow({ workflowId: "workflow.store.asc-cli-automation", include: "full", tokenBudget: 200_000 });
      assert(full.knowledgeBundle?.coverage.complete === true, "the largest budget must deliver the shipped workflow's references completely");
      assert(
        !forbidden.test(JSON.stringify(full.knowledgeBundle?.references.map((entry) => entry.markdown))),
        "delivered reference text must not carry credits or inventory text",
      );
    },
  );

  harness.check(
    "shipped bundle: preview's per-workflow coverage for an accepted unit equals the knowledge service's own default-budget allocation, including an omitted late reference",
    () => {
      const service = createKnowledgeService(shippedBundle());
      const result = service.workflow({ workflowId: LATE_WORKFLOW, include: "full" });
      const knowledgeBundle = result.knowledgeBundle;
      assert(
        knowledgeBundle !== null && knowledgeBundle.tokenBudget === DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET,
        "include=full without a budget uses the default budget",
      );
      const entry = knowledgeBundle.references.find((reference) => reference.referenceId === LATE_REFERENCE);
      assert(entry !== undefined, `${LATE_WORKFLOW} must bind ${LATE_REFERENCE} in the shipped bundle`);
      const omitted = knowledgeBundle.coverage.incomplete.find((item) => item.referenceId === LATE_REFERENCE);
      assert(
        entry.chars === 0 && entry.contentLength <= DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET && omitted?.status === "omitted",
        `the service must omit the short late reference under the default budget; got chars=${entry.chars} length=${entry.contentLength} status=${omitted?.status}`,
      );
      const index = knowledgeBundle.references.findIndex((reference) => reference.referenceId === LATE_REFERENCE);
      const precedingChars = knowledgeBundle.references.slice(0, index).reduce((sum, reference) => sum + reference.chars, 0);

      const root = harness.makeTempDir("preview-versus-service");
      const sourceId = "synthetic-upstream";
      writeContributionManifest(
        root,
        contributionManifestSchema.parse({
          apiVersion: CONTRIBUTION_API_VERSION,
          id: "preview-versus-service",
          goal: "compare preview coverage with the knowledge service on a synthetic manifest",
          scope: "contribution",
          routing: { intendedTarget: LATE_REFERENCE, effect: "proposal only", verdict: "contribution", reason: "targets a knowledge reference" },
          createdAt: "2026-09-05T12:00:00.000Z",
          synthetic: true,
          sources: [
            {
              id: sourceId,
              kind: "repository",
              title: "Synthetic source",
              localPath: "source",
              retrieval: { status: "complete", method: "fixture" },
              rights: { status: "verified", spdx: "MIT", evidence: "LICENSE" },
            },
          ],
          units: [
            {
              id: "u-late",
              kind: "knowledge",
              title: "late reference unit",
              upstream: { sourceId },
              target: { kind: "existing-reference", id: LATE_REFERENCE },
              disposition: "adapt",
              status: "accepted",
              rationale: "fixture unit that reaches a delivered reference bound late in its workflow",
            },
          ],
          missingCoreMechanism: { present: false },
        }),
      );
      const preview = previewContribution(root, { skillRoot });
      const previewed = preview.units.find((unit) => unit.unitId === "u-late");
      assert(previewed?.delivered === true && previewed.coverage !== "complete", `preview must not claim complete coverage; got ${JSON.stringify(previewed)}`);
      const line = preview.incompleteCoverage.find((item) => item.startsWith(`u-late: ${LATE_WORKFLOW}: omitted`));
      assert(line !== undefined, `preview must report the omission in ${LATE_WORKFLOW}; got ${JSON.stringify(preview.incompleteCoverage)}`);
      assert(
        line.includes(`0 of ${entry.contentLength} code points`) &&
          line.includes(`${precedingChars} of ${DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET} code points consumed`),
        `preview's counts must equal the service's allocation (${precedingChars} consumed before a ${entry.contentLength}-code-point document); got ${line}`,
      );
      // Every workflow the service delivers this reference into completely must be reported complete by preview, and vice versa.
      for (const workflowId of previewed.boundWorkflowIds) {
        const bundle = service.workflow({ workflowId: workflowId as WorkflowId, include: "full" }).knowledgeBundle;
        assert(bundle !== null, `${workflowId} must produce a bundle`);
        const incomplete = bundle.coverage.incomplete.find((item) => item.referenceId === LATE_REFERENCE);
        const expected = incomplete?.status ?? "complete";
        assert(previewed.reason.includes(`${workflowId}: ${expected}`), `preview must report ${workflowId} as ${expected}; got ${previewed.reason}`);
      }
    },
  );

  harness.check(
    "post-to-method demo: contribution.yaml validates against the frozen contract, cites the idea without adapting it, and pins the post it read",
    () => {
      const manifest = demoManifest();
      const post = readFileSync(DEMO_POST);
      const postText = post.toString("utf8");
      assert(postText.split(/\r?\n/u)[0] === POST_LABEL, "the synthetic post must open with its fixture label");
      assert(
        manifest.synthetic === true && manifest.scope === "contribution" && manifest.routing.verdict === "contribution",
        "the demo is a synthetic contribution-scope manifest",
      );

      const source = manifest.sources.find((entry) => entry.id === DEMO_SOURCE_ID);
      assert(source !== undefined && manifest.sources.length === 1, "the demo has exactly one source record");
      assert(
        source.kind === "post" && source.publisher === "Synthetic Designer" && source.localPath === "source/post.md",
        "the source record keeps the author and the local path",
      );
      assert(source.revision === `sha256:${digest(post)}`, `the recorded revision must equal the digest of the post actually on disk; got ${source.revision}`);
      assert(source.rights.status === "unknown" && !source.rights.spdx, "a post with no license statement stays rights-unknown with no invented SPDX id");
      assert(
        source.retrieval.status === "complete" && source.directives.length === 0,
        "the local post is retrieved completely and carries no agent directives",
      );
      assert(source.selectors.includes("paragraph 2"), "the source record names the paragraph the unit draws on");
      const paragraphs = postBodyParagraphs(postText);
      assert(
        paragraphs[1]?.includes(HEURISTIC_PHRASE) === true,
        `selector "paragraph 2" must resolve to the heuristic paragraph; got "${paragraphs[1]?.slice(0, 60)}"`,
      );

      const u1 = manifest.units.find((unit) => unit.id === "u1");
      assert(u1 !== undefined, "unit u1 is missing");
      assert(
        u1.kind === "knowledge" && u1.disposition === "reference" && u1.selection === "selected-method" && u1.status === "proposed",
        `u1 must be a proposed reference-only selected method; got ${JSON.stringify({ kind: u1.kind, disposition: u1.disposition, selection: u1.selection, status: u1.status })}`,
      );
      assert(u1.upstream?.sourceId === DEMO_SOURCE_ID && u1.upstream.selector === "paragraph 2", "u1 must point at the post's second paragraph");
      assert(u1.target.kind === "existing-reference" && u1.target.id === DEMO_OWNER, "u1 must land on the existing audience-derived-identity owner");
      for (const term of ["opinion", "mechanism", "demonstration", "evidence"])
        assert(u1.rationale.toLowerCase().includes(term), `u1 rationale must separate ${term}`);
      assert(u1.changed.length === 0, "a reference disposition adapts nothing, so nothing is listed as changed");

      const derivation = manifest.derivations.find((entry) => entry.target === DEMO_OWNER);
      assert(
        derivation !== undefined && derivation.relationship === "informed" && derivation.sourceIds.includes(DEMO_SOURCE_ID),
        "the derivation for the owner must be informed, not adapted",
      );
      assert(
        derivation.reviewer === "b2c-maintainers" && derivation.reviewedAt === source.reviewedAt && !Number.isNaN(Date.parse(derivation.reviewedAt)),
        `the derivation carries its reviewer and the review date of the source read (${source.reviewedAt}); got ${derivation.reviewer} ${derivation.reviewedAt}`,
      );
      assert(
        !manifest.derivations.some((entry) => entry.relationship === "adapted" || entry.relationship === "copied"),
        "rights-unknown material must not be adapted or copied",
      );
      assert(manifest.notices.length === 0, "no copied material means no notice");

      const u2 = manifest.units.find((unit) => unit.id === "u2");
      assert(
        u2 !== undefined && u2.kind === "evaluation" && u2.upstream === null && u2.disposition === "original",
        "u2 must be an original evaluation unit with no fabricated upstream",
      );
      const evaluation = manifest.evaluations.find((entry) => entry.unitId === "u2");
      assert(evaluation !== undefined && evaluation.kind === "counterexample", "u2 must have a counterexample evaluation case");
      assert(
        evaluation.mustFail.some((entry) => entry.includes("monochrome data-dense dashboard")),
        "the counterexample must name the data-dense dashboard the naive rule fails on",
      );
      assert(
        evaluation.mustPass.some((entry) => entry.includes("indigo-to-purple hero gradient")),
        "the counterexample must name the decorative gradient the rule passes",
      );

      assert(
        manifest.uncertainties.some((entry) => entry.includes("+4%")) && manifest.uncertainties.some((entry) => /popularity/iu.test(entry)),
        "the unsourced figure and the popularity count stay uncertainties",
      );
      assert(manifest.missingCoreMechanism.present === false, "the post states its mechanism, so nothing core is missing");
      assert(
        manifest.requiredChecks.includes("b2c contribute check") && manifest.requiredChecks.includes("b2c contribute preview"),
        "the manifest names its required checks",
      );
    },
  );

  harness.check(
    "post-to-method demo: the candidate stays outside knowledge/, outside the package graph, and outside the shipped bundle; its owners are real, active, and match on the named keywords",
    () => {
      const manifest = demoManifest();
      const candidate = readFileSync(DEMO_CANDIDATE, "utf8");
      assert(
        candidate.includes(CANDIDATE_SENTENCE) && /draft/iu.test(candidate.split(/\r?\n/u)[2] ?? ""),
        "the candidate must label itself a draft near the top",
      );
      assert(
        !path.relative(DEMO_ROOT, DEMO_CANDIDATE).startsWith("..") && !DEMO_CANDIDATE.startsWith(path.join(repoRoot, "knowledge")),
        "the candidate lives under the example root",
      );
      const knowledgeHits = markdownFilesUnder(path.join(repoRoot, "knowledge")).filter((file) => readFileSync(file, "utf8").includes(CANDIDATE_SENTENCE));
      assert(
        knowledgeHits.length === 0,
        `knowledge/ must not carry the candidate text; found in ${knowledgeHits.map((file) => path.relative(repoRoot, file)).join(", ")}`,
      );

      const packages = loadKnowledgePackages(repoRoot);
      const underExamples = packages.filter((item) => item.path.startsWith("examples/") || item.manifestPath.startsWith("examples/"));
      assert(underExamples.length === 0, `no knowledge package may point under examples/; got ${underExamples.map((item) => item.id).join(", ")}`);
      const candidateRelative = path.relative(repoRoot, DEMO_CANDIDATE);
      assert(!packages.some((item) => item.path === candidateRelative), "the candidate file is not a registered knowledge package");

      const bundle = shippedBundle();
      assert(!bundle.documents.some((document) => document.markdown.includes(CANDIDATE_SENTENCE)), "the shipped bundle must not deliver the candidate");

      const byId = new Map(packages.map((item) => [item.id, item]));
      assert(manifest.existingOwners.length === 2, "the demo names two existing owners");
      const ownerIds = manifest.existingOwners.map((owner) => owner.id);
      assert(ownerIds.includes(DEMO_OWNER) && ownerIds.includes(DEMO_SECOND_OWNER), `owners must be the two design references; got ${ownerIds.join(", ")}`);
      for (const owner of manifest.existingOwners) {
        const item = byId.get(owner.id as ReferenceId);
        assert(item !== undefined && item.lifecycle === "active", `existing owner ${owner.id} must be an active knowledge package`);
        assert(item.manifestPath === owner.path, `existing owner ${owner.id} path must be the package manifest (${item.manifestPath}); got ${owner.path}`);
        assert(item.workflowIds.length > 0, `existing owner ${owner.id} must be bound to at least one workflow`);
        const document = readFileSync(path.join(repoRoot, item.path), "utf8").toLowerCase();
        for (const keyword of keywordsOfMatch(owner.match))
          assert(document.includes(keyword), `owner ${owner.id} claims a keyword match on "${keyword}" that its document does not contain`);
      }
      const secondOwner = manifest.existingOwners.find((owner) => owner.id === DEMO_SECOND_OWNER);
      assert(secondOwner !== undefined && keywordsOfMatch(secondOwner.match).includes("gradient"), "vibecoded-tells is matched on gradient");
    },
  );

  harness.check(
    "post-to-method demo: ADOPTION_MAP.md and README.md carry the manifest's own ids, decisions, and uncertainties, and the README's re-run command is the one this suite executes",
    () => {
      const manifest = demoManifest();
      const map = readFileSync(path.join(DEMO_ROOT, "ADOPTION_MAP.md"), "utf8");
      assert(map.split(/\r?\n/u)[0] === POST_LABEL, "the adoption map must open with the synthetic label");
      assert(map.includes(`# Adoption map: ${manifest.id}`), "the adoption map must name the manifest it reads");
      const missing: string[] = [];
      const expect = (needle: string, what: string): void => {
        if (!map.includes(needle)) missing.push(`${what}: ${needle}`);
      };
      for (const source of manifest.sources) expect(source.id, "source id");
      for (const unit of manifest.units) {
        expect(`| ${unit.id} |`, "unit row");
        expect(unit.disposition, "disposition");
      }
      for (const owner of manifest.existingOwners) {
        expect(owner.id, "owner id");
        expect(owner.match, "owner match");
      }
      for (const derivation of manifest.derivations) expect(`\`${derivation.relationship}\``, "derivation relationship");
      for (const evaluation of manifest.evaluations) {
        expect(evaluation.id, "evaluation id");
        for (const entry of [...evaluation.mustFail, ...evaluation.mustPass]) expect(entry, "evaluation case");
      }
      for (const uncertainty of manifest.uncertainties) expect(`- ${uncertainty}`, "uncertainty");
      for (const check of manifest.requiredChecks) expect(check, "required check");
      assert(missing.length === 0, `ADOPTION_MAP.md is missing what the manifest states: ${missing.join("; ")}`);
      assert(!/relationship is `adapted`|relationship: adapted|\| adapt \|/u.test(map), "the map must not describe the reference unit as an adaptation");

      const readme = readFileSync(path.join(DEMO_ROOT, "README.md"), "utf8");
      const command = `b2c contribute plan --source ${DEMO_RELATIVE}/source/post.md --goal "${DEMO_GOAL}" --synthetic`;
      assert(readme.includes(command), `README.md must document the exact plan command this suite runs: ${command}`);
      assert(
        readme.includes(`b2c contribute check --target ${DEMO_RELATIVE}`) && readme.includes(`b2c contribute preview --target ${DEMO_RELATIVE}`),
        "README.md must document the check and preview commands on this root",
      );
      assert(readme.includes(DEMO_OWNER), "README.md must name the existing owner the idea lands on");
    },
  );

  const exampleBefore = treeSnapshot(DEMO_ROOT);
  const knowledgeBefore = treeSnapshot(path.join(repoRoot, "knowledge"));

  cliCase<CheckEnvelopeData>(
    harness,
    "post-to-method demo: b2c contribute check passes on the example root",
    ["check", "--target", DEMO_RELATIVE, "--json"],
    (envelope, run) => {
      assert(envelope.ok === true && envelope.data !== undefined, `check must succeed; got ${JSON.stringify(envelope.error ?? envelope)}`);
      const data = envelope.data;
      assert(data.manifestId === demoManifest().id, `check must report the demo manifest id; got ${data.manifestId}`);
      assert(data.pass === true, `check must pass; issues: ${data.issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`).join("; ")}`);
      assert(run.status === 0, `check exit code must be 0 on pass; got ${run.status}`);
      assert(data.summary.units === 2 && data.summary.sources === 1, `check must count 2 units and 1 source; got ${JSON.stringify(data.summary)}`);
      assert(
        data.summary.copiedUnits === 0 && data.summary.originalUnits >= 1,
        `check must count no copied units and the original counterexample; got ${JSON.stringify(data.summary)}`,
      );
    },
  );

  cliCase<PreviewEnvelopeData>(
    harness,
    "post-to-method demo: b2c contribute preview changes nothing and never delivers the evaluation unit",
    ["preview", "--target", DEMO_RELATIVE, "--json"],
    (envelope) => {
      assert(envelope.ok === true && envelope.data !== undefined, `preview must succeed; got ${JSON.stringify(envelope.error ?? envelope)}`);
      const data = envelope.data;
      assert(data.changesCatalog === false, "preview must declare that it changes no catalog");
      const unitIds = new Set(demoManifest().units.map((unit) => unit.id));
      const unknown = data.units.map((unit) => unit.unitId).filter((id) => !unitIds.has(id));
      assert(unknown.length === 0, `preview named units the manifest does not declare: ${unknown.join(", ")}`);
      const u2Delivered = data.units.some((unit) => unit.unitId === "u2" && unit.delivered);
      assert(!u2Delivered, "an evaluation unit is never delivered to a worker");
      const owner = loadKnowledgePackages(repoRoot).find((item) => item.id === DEMO_OWNER);
      assert(owner !== undefined, "the demo owner must exist");
      for (const unit of data.units.filter((entry) => entry.unitId === "u1" && entry.delivered)) {
        const off = unit.boundWorkflowIds.filter((id) => !owner.workflowIds.includes(id as WorkflowId));
        assert(off.length === 0, `a delivered u1 may only reach workflows bound to its owner; got ${off.join(", ")}`);
      }
      assert(treeSnapshot(DEMO_ROOT) === exampleBefore, "preview must not write under the example root");
      assert(treeSnapshot(path.join(repoRoot, "knowledge")) === knowledgeBefore, "preview must not write under knowledge/");
    },
  );

  cliCase<PlanEnvelopeData>(
    harness,
    "post-to-method demo: b2c contribute plan dry run reads the post as data, writes nothing, fetches nothing, and invents no rights or author",
    ["plan", "--source", `${DEMO_RELATIVE}/source/post.md`, "--goal", DEMO_GOAL, "--synthetic", "--json"],
    (envelope) => {
      assert(envelope.ok === true && envelope.data !== undefined, `plan must succeed; got ${JSON.stringify(envelope.error ?? envelope)}`);
      const data = envelope.data;
      assert(data.written === null, `a plan without --target is a dry run; got written=${JSON.stringify(data.written)}`);
      assert(data.networkUsed === false, "a local source never uses the network");
      assert(data.manifest.synthetic === true, "--synthetic must mark the manifest synthetic");
      assert(Number.isInteger(data.refusedDirectives) && data.refusedDirectives >= 0, "refused directives must be a count");
      const source = data.manifest.sources[0];
      assert(source !== undefined && data.manifest.sources.length === 1, "one local source yields one source record");
      assert(
        source.rights.status !== "verified" && !source.rights.spdx,
        `a post with no license text must not be recorded as verified; got ${JSON.stringify(source.rights)}`,
      );
      assert(source.publisher !== "b2c-maintainers", "intake must never replace the author with the adopter");
      assert(
        source.retrieval.status === "complete" && source.directives.length === 0,
        `a short local post is read completely and carries no directives; got ${JSON.stringify({ retrieval: source.retrieval, directives: source.directives.length })}`,
      );
      const pinned = source.inventory.find((entry) => entry.path === path.basename(DEMO_POST));
      assert(
        pinned?.sha256 === digest(readFileSync(DEMO_POST)),
        `the inventory must pin the post by the digest of the file actually read; got ${JSON.stringify(pinned)}`,
      );
      assert(
        source.revision === undefined || /^sha256:[a-f0-9]{64}$/u.test(source.revision),
        `a recorded revision must be a content fingerprint, not a guessed tag; got ${source.revision}`,
      );
      assert(treeSnapshot(DEMO_ROOT) === exampleBefore, "the dry run must not write under the example root");
      assert(treeSnapshot(path.join(repoRoot, "knowledge")) === knowledgeBefore, "the dry run must not write under knowledge/");
    },
  );
}
