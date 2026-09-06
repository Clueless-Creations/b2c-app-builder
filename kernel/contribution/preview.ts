import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { composeCatalog } from "../../catalog/index.js";
import { loadKnowledgePackages } from "../../catalog/knowledge-packages.js";
import type { CatalogKnowledgePackage, CatalogWorkflowDef, ReferenceId, WorkflowId } from "../../catalog/types.js";
import type { ContributionUnit } from "../../contracts/contribution/contract.js";
import { DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET } from "../knowledge-service/types.js";
import { readContributionManifest } from "./manifest-io.js";
import type { PreviewData, PreviewUnit } from "./types.js";

/**
 * `contribution.preview`: what active workers would receive if the contribution were adopted.
 * Delivery follows the knowledge service's own rules: only an active package bound to a workflow
 * reaches a brief, and only for a unit the maintainer accepted with a disposition that changes
 * the reference. Drafts, reference-only inventory, deferred and rejected units, packages, and
 * resources never enter a brief through knowledge delivery. The preview changes no catalog or
 * workspace; it reads the manifest and the catalog and reports.
 *
 * Coverage mirrors `buildKnowledgeBundle` in kernel/knowledge-service/service.ts: the default
 * budget of unicode code points is allocated greedily across a workflow's `referenceIds` IN THAT
 * ORDER. So a reference's coverage depends on the references bound before it in each workflow,
 * not on its own size: a short document bound after a long one is omitted from the default
 * bundle. The preview computes that allocation per bound workflow from the composed catalog and
 * the documents on disk, in code points, never bytes.
 */
const REFERENCE_TARGETS = new Set<ContributionUnit["target"]["kind"]>(["existing-reference", "new-reference"]);
const NON_DELIVERING_DISPOSITIONS = new Set<ContributionUnit["disposition"]>(["reference", "defer", "reject"]);
const NOT_KNOWLEDGE_REASON = "packages and resources reach workers through composition activation, not knowledge delivery";

type WorkflowCoverageStatus = "complete" | "truncated" | "omitted";

interface WorkflowCoverage {
  readonly workflowId: WorkflowId;
  readonly status: WorkflowCoverageStatus;
  /** Code points the references bound before this one consume from the shared budget. */
  readonly precedingChars: number;
  /** Code points of this reference's delivered Markdown. */
  readonly length: number;
  /** Code points this reference receives inside the budget. */
  readonly deliveredChars: number;
  readonly budget: number;
  /** Bound references before this one in the workflow's allocation order. */
  readonly preceding: ReferenceId[];
}

function documentBytes(skillRoot: string, pkg: CatalogKnowledgePackage | undefined): number | undefined {
  if (!pkg) return undefined;
  const file = path.join(skillRoot, pkg.path);
  if (!existsSync(file)) return undefined;
  try {
    return statSync(file).size;
  } catch {
    return undefined;
  }
}

/**
 * The Markdown the hosted bundle delivers for a reference, derived the same way
 * tooling/render-hosted-bundle.ts derives it: a `.md` document verbatim, any other document
 * wrapped in a YAML code fence. Undefined when the document is missing or unreadable.
 */
function deliveredMarkdown(skillRoot: string, documentPath: string): string | undefined {
  const file = path.join(skillRoot, documentPath);
  let text: string;
  try {
    if (!existsSync(file)) return undefined;
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  if (documentPath.endsWith(".md")) return text;
  const fenceLength = [...text.matchAll(/`+/gu)].reduce((length, match) => Math.max(length, match[0].length + 1), 3);
  const fence = "`".repeat(fenceLength);
  return `${fence}yaml\n${text}${text.endsWith("\n") ? "" : "\n"}${fence}\n`;
}

/** Unicode code points, the unit the knowledge service budgets in. Never a byte count. */
const codePoints = (text: string): number => Array.from(text).length;

interface CoverageContext {
  readonly workflows: ReadonlyMap<WorkflowId, CatalogWorkflowDef>;
  readonly referencePaths: ReadonlyMap<ReferenceId, string>;
  readonly lengths: Map<ReferenceId, number | undefined>;
  readonly budget: number;
}

function referenceLength(context: CoverageContext, skillRoot: string, referenceId: ReferenceId): number | undefined {
  if (context.lengths.has(referenceId)) return context.lengths.get(referenceId);
  const documentPath = context.referencePaths.get(referenceId);
  const markdown = documentPath ? deliveredMarkdown(skillRoot, documentPath) : undefined;
  const length = markdown === undefined ? undefined : codePoints(markdown);
  context.lengths.set(referenceId, length);
  return length;
}

/**
 * Replay the knowledge service's greedy allocation for one workflow up to the target reference.
 * Returns undefined when the workflow is not in the composed catalog or does not bind the
 * reference (a binding the catalog composition dropped never reaches a brief).
 */
function workflowCoverage(context: CoverageContext, skillRoot: string, workflowId: WorkflowId, referenceId: ReferenceId): WorkflowCoverage | undefined {
  const workflow = context.workflows.get(workflowId);
  if (!workflow) return undefined;
  const index = workflow.referenceIds.indexOf(referenceId);
  if (index === -1) return undefined;
  const preceding = workflow.referenceIds.slice(0, index);
  let precedingChars = 0;
  for (const id of preceding) precedingChars += Math.min(referenceLength(context, skillRoot, id) ?? 0, Math.max(0, context.budget - precedingChars));
  const length = referenceLength(context, skillRoot, referenceId) ?? 0;
  const deliveredChars = Math.min(length, Math.max(0, context.budget - precedingChars));
  const status: WorkflowCoverageStatus = deliveredChars >= length ? "complete" : deliveredChars === 0 ? "omitted" : "truncated";
  return { workflowId, status, precedingChars, length, deliveredChars, budget: context.budget, preceding };
}

function describeCoverage(entry: WorkflowCoverage): string {
  const allocation = `${entry.precedingChars} of ${entry.budget} code points consumed by ${entry.preceding.length} earlier reference(s) [${entry.preceding.join(", ")}]`;
  switch (entry.status) {
    case "complete":
      return `${entry.workflowId}: complete (${entry.length} code points; ${allocation})`;
    case "truncated":
      return `${entry.workflowId}: truncated to ${entry.deliveredChars} of ${entry.length} code points (${allocation}); a worker receives a prefix unless the request raises the budget`;
    case "omitted":
      return `${entry.workflowId}: omitted (0 of ${entry.length} code points; ${allocation}); a worker receives nothing from this reference unless the request raises the budget`;
    default: {
      const exhaustive: never = entry.status;
      return String(exhaustive);
    }
  }
}

function exclusionReasons(
  unit: ContributionUnit,
  lifecycle: PreviewUnit["lifecycle"],
  pkg: CatalogKnowledgePackage | undefined,
  bytes: number | undefined,
): string[] {
  const reasons: string[] = [];
  if (lifecycle === "draft") reasons.push("draft packages never enter worker briefs");
  else if (lifecycle === "deprecated") reasons.push("deprecated packages are not delivered");
  else if (lifecycle === "unknown") reasons.push(`reference ${unit.target.id ?? "(no id)"} is not a loaded knowledge package`);
  if (unit.status !== "accepted") reasons.push(`unit not accepted (status ${unit.status})`);
  if (NON_DELIVERING_DISPOSITIONS.has(unit.disposition)) reasons.push(`disposition ${unit.disposition} changes no delivered reference`);
  if (unit.selection === "reference-only") reasons.push("reference-only material is contributor inventory");
  if (pkg && lifecycle === "active" && bytes === undefined) reasons.push(`reference document ${pkg.path} is missing, so nothing can be delivered`);
  if (pkg && lifecycle === "active" && pkg.workflowIds.length === 0 && pkg.contextPackIds.length === 0)
    reasons.push("the package is bound to no workflow or context pack");
  return reasons;
}

export function previewContribution(targetRoot: string, deps: { skillRoot: string }): PreviewData {
  const manifest = readContributionManifest(targetRoot);
  const packages = new Map<string, CatalogKnowledgePackage>(loadKnowledgePackages(deps.skillRoot).map((pkg) => [pkg.id, pkg]));
  const catalog = composeCatalog(deps.skillRoot);
  const context: CoverageContext = {
    workflows: new Map(catalog.workflows.map((workflow) => [workflow.id, workflow])),
    referencePaths: new Map(catalog.references.map((reference) => [reference.id, reference.path])),
    lengths: new Map(),
    budget: DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET,
  };
  const units: PreviewUnit[] = [];
  const excluded: PreviewData["excluded"] = [];
  const incompleteCoverage: string[] = [];
  for (const unit of manifest.units) {
    if (!REFERENCE_TARGETS.has(unit.target.kind)) {
      units.push({
        unitId: unit.id,
        kind: unit.kind,
        lifecycle: "not-a-reference",
        delivered: false,
        reason: NOT_KNOWLEDGE_REASON,
        boundWorkflowIds: [],
        contextPackIds: [],
        coverage: "not-applicable",
      });
      excluded.push({ unitId: unit.id, reason: NOT_KNOWLEDGE_REASON });
      continue;
    }
    const pkg = unit.target.id ? packages.get(unit.target.id) : undefined;
    const lifecycle: PreviewUnit["lifecycle"] = pkg ? pkg.lifecycle : unit.target.kind === "new-reference" ? "draft" : "unknown";
    const bytes = documentBytes(deps.skillRoot, pkg);
    const reasons = exclusionReasons(unit, lifecycle, pkg, bytes);
    const delivered = reasons.length === 0;
    const boundWorkflowIds = pkg ? [...pkg.workflowIds] : [];
    const contextPackIds = pkg ? [...pkg.contextPackIds] : [];
    let coverage: PreviewUnit["coverage"] = "excluded";
    let reason = reasons.join("; ");
    if (delivered && pkg) {
      const perWorkflow = boundWorkflowIds.flatMap((workflowId) => {
        const entry = workflowCoverage(context, deps.skillRoot, workflowId, pkg.id);
        return entry ? [entry] : [];
      });
      const unbound = boundWorkflowIds.filter((workflowId) => !perWorkflow.some((entry) => entry.workflowId === workflowId));
      const incomplete = perWorkflow.filter((entry) => entry.status !== "complete");
      coverage = incomplete.length === 0 ? "complete" : "truncated";
      reason = `active package ${pkg.id} is bound to ${boundWorkflowIds.length} workflow(s) and ${contextPackIds.length} context pack(s); the accepted ${unit.disposition} unit reaches those briefs`;
      const details = perWorkflow.map(describeCoverage);
      if (unbound.length) details.push(`${unbound.join(", ")}: not in the composed catalog's binding for this reference, so no default bundle includes it`);
      if (details.length) reason = `${reason}; default bundle coverage per workflow (${context.budget} code points): ${details.join("; ")}`;
      for (const entry of incomplete) incompleteCoverage.push(`${unit.id}: ${describeCoverage(entry)}`);
    } else {
      excluded.push({ unitId: unit.id, reason });
    }
    units.push({
      unitId: unit.id,
      kind: unit.kind,
      ...(unit.target.id ? { targetReferenceId: unit.target.id } : {}),
      lifecycle,
      delivered,
      reason,
      boundWorkflowIds,
      contextPackIds,
      ...(bytes !== undefined ? { bytes } : {}),
      coverage,
    });
  }
  return { target: targetRoot, manifestId: manifest.id, units, excluded, incompleteCoverage, changesCatalog: false };
}
