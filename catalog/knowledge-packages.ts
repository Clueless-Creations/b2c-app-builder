import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  CatalogContextPack,
  CatalogKnowledgeDerivation,
  CatalogKnowledgePackage,
  CatalogKnowledgeSource,
  CatalogReference,
  CatalogWorkflowDef,
  ContextPackId,
  ReferenceId,
  WorkflowId,
} from "./types.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown, field: string, manifestPath: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${manifestPath}: ${field} must be an object.`);
  return value as RecordValue;
}

function text(value: unknown, field: string, manifestPath: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${manifestPath}: ${field} must be a non-empty string.`);
  return value.trim();
}

function optionalText(value: unknown, field: string, manifestPath: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${manifestPath}: ${field} must be a string.`);
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function list(value: unknown, field: string, manifestPath: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${manifestPath}: ${field} must be a string array.`);
  }
  return value as string[];
}

const RIGHTS_STATUSES = new Set(["verified", "unverified", "unknown", "incompatible", "not-redistributable", "not-applicable"]);
const DERIVATION_RELATIONSHIPS = new Set(["informed", "adapted", "copied", "wrapped", "dependency", "referenced"]);

function optionalList(value: unknown, field: string, manifestPath: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const items = list(value, field, manifestPath);
  return items.length ? items : undefined;
}

function rights(value: unknown, manifestPath: string): CatalogKnowledgeSource["rights"] | undefined {
  if (value === undefined || value === null) return undefined;
  const item = record(value, "sources[].rights", manifestPath);
  const status = text(item.status, "sources[].rights.status", manifestPath);
  if (!RIGHTS_STATUSES.has(status)) throw new Error(`${manifestPath}: sources[].rights.status is invalid.`);
  const evidenceSha256 = optionalText(item.evidence_sha256, "sources[].rights.evidence_sha256", manifestPath);
  if (evidenceSha256 && !/^[a-f0-9]{64}$/u.test(evidenceSha256))
    throw new Error(`${manifestPath}: sources[].rights.evidence_sha256 must be a sha256 hex digest.`);
  return {
    status: status as NonNullable<CatalogKnowledgeSource["rights"]>["status"],
    spdx: optionalText(item.spdx, "sources[].rights.spdx", manifestPath),
    evidence: optionalText(item.evidence, "sources[].rights.evidence", manifestPath),
    evidenceSha256,
    notes: optionalText(item.notes, "sources[].rights.notes", manifestPath),
  };
}

function source(value: unknown, manifestPath: string): CatalogKnowledgeSource {
  const item = record(value, "sources[]", manifestPath);
  const cadence = Number(item.review_cadence_days);
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > 3650)
    throw new Error(`${manifestPath}: source review_cadence_days must be an integer between 1 and 3650.`);
  const result: CatalogKnowledgeSource = {
    id: text(item.id, "sources[].id", manifestPath),
    name: text(item.name, "sources[].name", manifestPath),
    sourceType: text(item.source_type, "sources[].source_type", manifestPath),
    url: text(item.url, "sources[].url", manifestPath),
    reviewCadenceDays: cadence,
    claimScope: text(item.claim_scope, "sources[].claim_scope", manifestPath),
    lastReviewDate: text(String(item.last_review_date ?? ""), "sources[].last_review_date", manifestPath),
    reviewer: text(item.reviewer, "sources[].reviewer", manifestPath),
  };
  // Provenance extension (ADR-0005). Every field is optional so existing manifests are unchanged.
  const publisher = optionalText(item.publisher, "sources[].publisher", manifestPath);
  const revision = optionalText(item.revision, "sources[].revision", manifestPath);
  const publishedAt = optionalText(item.published_at === undefined ? undefined : String(item.published_at), "sources[].published_at", manifestPath);
  const retrievedAt = optionalText(item.retrieved_at === undefined ? undefined : String(item.retrieved_at), "sources[].retrieved_at", manifestPath);
  const sourceRights = rights(item.rights, manifestPath);
  const selectors = optionalList(item.selectors, "sources[].selectors", manifestPath);
  const upstreamId = optionalText(item.upstream_id, "sources[].upstream_id", manifestPath);
  if (publisher) result.publisher = publisher;
  if (revision) result.revision = revision;
  if (publishedAt) result.publishedAt = publishedAt;
  if (retrievedAt) result.retrievedAt = retrievedAt;
  if (sourceRights) result.rights = sourceRights;
  if (selectors) result.selectors = selectors;
  if (upstreamId) result.upstreamId = upstreamId;
  return result;
}

function derivation(value: unknown, manifestPath: string): CatalogKnowledgeDerivation {
  const item = record(value, "derivations[]", manifestPath);
  const relationship = text(item.relationship, "derivations[].relationship", manifestPath);
  if (!DERIVATION_RELATIONSHIPS.has(relationship)) throw new Error(`${manifestPath}: derivations[].relationship is invalid.`);
  const sourceIds = list(item.source_ids, "derivations[].source_ids", manifestPath);
  if (!sourceIds.length) throw new Error(`${manifestPath}: derivations[].source_ids must name at least one source.`);
  const reviewedAt = text(String(item.reviewed_at ?? ""), "derivations[].reviewed_at", manifestPath);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(reviewedAt)) throw new Error(`${manifestPath}: derivations[].reviewed_at must be YYYY-MM-DD.`);
  const result: CatalogKnowledgeDerivation = {
    sourceIds,
    relationship: relationship as CatalogKnowledgeDerivation["relationship"],
    rationale: text(item.rationale, "derivations[].rationale", manifestPath),
    reviewer: text(item.reviewer, "derivations[].reviewer", manifestPath),
    reviewedAt,
  };
  const baseline = optionalText(item.baseline, "derivations[].baseline", manifestPath);
  const selectors = optionalList(item.selectors, "derivations[].selectors", manifestPath);
  const omissions = optionalList(item.omissions, "derivations[].omissions", manifestPath);
  const evaluation = optionalText(item.evaluation, "derivations[].evaluation", manifestPath);
  const notice = optionalText(item.notice, "derivations[].notice", manifestPath);
  if (baseline) result.baseline = baseline;
  if (selectors) result.selectors = selectors;
  if (omissions) result.omissions = omissions;
  if (evaluation) result.evaluation = evaluation;
  if (notice) result.notice = notice;
  return result;
}

function discoverYaml(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverYaml(target);
    return entry.isFile() && /\.ya?ml$/u.test(entry.name) ? [target] : [];
  });
}

export function loadKnowledgePackages(skillRoot: string): CatalogKnowledgePackage[] {
  const directory = path.join(skillRoot, "catalog/knowledge");
  return discoverYaml(directory)
    .sort()
    .map((manifestPath) => {
      const parsed = record(YAML.parse(readFileSync(manifestPath, "utf8")), "manifest", manifestPath);
      const bindings = record(parsed.bindings, "bindings", manifestPath);
      const lifecycle = text(parsed.lifecycle, "lifecycle", manifestPath);
      if (!new Set(["draft", "active", "deprecated"]).has(lifecycle)) throw new Error(`${manifestPath}: lifecycle is invalid.`);
      const sources = Array.isArray(parsed.sources) ? parsed.sources.map((item) => source(item, manifestPath)) : [];
      const derivations = Array.isArray(parsed.derivations) ? parsed.derivations.map((item) => derivation(item, manifestPath)) : [];
      const sourceExemption = typeof parsed.source_exemption === "string" ? parsed.source_exemption.trim() : undefined;
      if (lifecycle === "active" && sources.length === 0 && !sourceExemption) {
        throw new Error(`${manifestPath}: an active package needs a source or a source_exemption.`);
      }
      return {
        id: text(parsed.id, "id", manifestPath) as ReferenceId,
        title: text(parsed.title, "title", manifestPath),
        domainId: text(parsed.domain_id, "domain_id", manifestPath) as `domain.${string}`,
        path: text(parsed.document_path, "document_path", manifestPath),
        loadWhen: text(parsed.load_when, "load_when", manifestPath),
        lifecycle: lifecycle as CatalogKnowledgePackage["lifecycle"],
        hub: parsed.hub === true || undefined,
        sessionScoped: parsed.session_scoped === true || undefined,
        applicabilityNotes: optionalText(parsed.applicability_notes, "applicability_notes", manifestPath),
        sourceExemption,
        sources,
        ...(parsed.specifies === undefined
          ? {}
          : {
              specifies: (() => {
                if (!Array.isArray(parsed.specifies)) throw new Error(`${manifestPath}: specifies must be an array.`);
                return parsed.specifies.map((value: unknown) => {
                  const spec = record(value, "specifies[]", manifestPath);
                  return {
                    artifact: text(spec.artifact, "specifies[].artifact", manifestPath),
                    heading: text(spec.heading, "specifies[].heading", manifestPath),
                  };
                });
              })(),
            }),
        ...(derivations.length ? { derivations } : {}),
        retired: parsed.retired === true || undefined,
        replacementIds: list(parsed.replacement_ids, "replacement_ids", manifestPath) as ReferenceId[],
        workflowIds: list(bindings.workflow_ids, "bindings.workflow_ids", manifestPath) as WorkflowId[],
        contextPackIds: list(bindings.context_pack_ids, "bindings.context_pack_ids", manifestPath) as ContextPackId[],
        manifestPath: path.relative(skillRoot, manifestPath),
      };
    });
}

export function resolveKnowledgeGraph(
  packages: readonly CatalogKnowledgePackage[],
  workflows: readonly CatalogWorkflowDef[],
  contextPacks: readonly Omit<CatalogContextPack, "referenceIds">[],
): { references: CatalogReference[]; workflows: CatalogWorkflowDef[]; contextPacks: CatalogContextPack[] } {
  const active = packages.filter((item) => item.lifecycle === "active");
  const byWorkflow = new Map<WorkflowId, ReferenceId[]>();
  const byContextPack = new Map<ContextPackId, ReferenceId[]>();
  for (const item of active) {
    const producerIds = workflows
      .filter((workflow) => (item.specifies ?? []).some((spec) => workflow.outputPaths.includes(spec.artifact)))
      .map((workflow) => workflow.id);
    for (const workflowId of new Set([...item.workflowIds, ...producerIds])) byWorkflow.set(workflowId, [...(byWorkflow.get(workflowId) ?? []), item.id]);
    for (const contextPackId of item.contextPackIds) byContextPack.set(contextPackId, [...(byContextPack.get(contextPackId) ?? []), item.id]);
  }
  return {
    references: active.map(({ workflowIds: _workflowIds, contextPackIds: _contextPackIds, manifestPath: _manifestPath, ...reference }) => reference),
    workflows: workflows.map((workflow) => ({ ...workflow, referenceIds: byWorkflow.get(workflow.id) ?? [] })),
    contextPacks: contextPacks.map((pack) => ({ ...pack, referenceIds: byContextPack.get(pack.id) ?? [] })),
  };
}
