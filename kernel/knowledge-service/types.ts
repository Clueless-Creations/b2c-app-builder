import type { KnowledgeSection } from "./sections.js";
import type { Catalog, CatalogDomainId, CatalogKnowledgeSource, CatalogWorkflowDef, ReferenceId } from "../../catalog/types.js";
// Type-only: erased at compile time, so importing the NodeBrief shape costs the hosted Worker's
// actual bundle nothing (kernel/engine/compile.ts, the module NodeBrief's own definition depends on
// by type, is never pulled in as a value here — see service.ts's buildDispatchBrief for why its
// verification-policy formula is duplicated rather than imported).
import type { NodeBrief } from "../engine/node-brief.js";

// 2.0.0 makes workflow discovery route-first and adds revision-bound section addressing.
// Explicit include="instructions" restores authored workflow instructions; body modes remain opt-in.
export const HOSTED_KNOWLEDGE_SCHEMA_VERSION = "2.0.0" as const;
export const MAX_HOSTED_DOCUMENT_BYTES = 256 * 1024;
export const MAX_HOSTED_BUNDLE_BYTES = 8 * 1024 * 1024;
export const MAX_KNOWLEDGE_PAGE_LENGTH = 16_384;
export const MAX_KNOWLEDGE_EXCERPT_LENGTH = 512;
/** Unicode code points. A summary is a strict prefix of `markdown`, generated once at render time (tooling/render-hosted-bundle.ts) and pinned into bundleSha256 — never computed per request. */
export const MAX_HOSTED_REFERENCE_SUMMARY_LENGTH = 800;
/**
 * Unicode code points. Applied when a b2c_workflow bundle request (`include`) omits `tokenBudget`.
 * Matches kernel/engine/compile.ts's DEFAULT_TOKEN_BUDGET (a distinct unit — that one estimates real
 * LLM tokens for a dispatched node's execution budget) only by coincidence of a round number; the
 * two are not the same measurement and are not kept in sync.
 */
export const DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET = 8_000;
/**
 * Unicode code points. Schema ceiling on `tokenBudget`, chosen so the worst real single-workflow
 * bundle stays safely under hosted/knowledge-mcp/http.ts's MAX_HOSTED_RESPONSE_BYTES (524,288 bytes) —
 * measured: at this budget, the whole b2c_workflow response for the catalog's largest
 * reference-total workflow (workflow, guardrails, knowledge[] summaries, and the full
 * knowledgeBundle together) serializes at 207,942 bytes, under 40% of the ceiling (see the
 * hosted-knowledge fixture that pins this exact measurement). Not imported from
 * hosted/knowledge-mcp/http.ts: this module allows no such dependency (see createKnowledgeService's own
 * "no filesystem, workspace, clock, network, or execution dependency" invariant below).
 */
export const MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET = 200_000;

export interface HostedKnowledgeDocument {
  referenceId: ReferenceId;
  markdown: string;
  /** A strict code-point prefix of `markdown`, capped at MAX_HOSTED_REFERENCE_SUMMARY_LENGTH — never a heading extraction, so `nextOffset` continuation into the full document (via b2c_knowledge_get) stays valid at any depth. */
  summary: string;
  contentSha256: string;
  sections?: KnowledgeSection[];
  sourceMediaType: "text/markdown" | "application/yaml";
  sourceSha256: string;
  manifestPath: string;
  manifestSha256: string;
}

export interface HostedKnowledgeMetadata {
  schemaVersion: typeof HOSTED_KNOWLEDGE_SCHEMA_VERSION;
  engineVersion: string;
  catalogSha256: string;
  bundleSha256: string;
}

/** Build-time data only. Sources and reference metadata occur once, in the catalog. */
export interface HostedKnowledgeBundle extends HostedKnowledgeMetadata {
  catalog: Catalog;
  documents: HostedKnowledgeDocument[];
}

export interface KnowledgePagination {
  offset: number;
  limit: number;
  total: number;
  nextOffset: number | null;
}

export interface HostedReferenceSummary {
  referenceId: ReferenceId;
  title: string;
  domainId: CatalogDomainId;
  loadWhen: string;
  contentSha256: string;
  contentLength: number;
}

export interface HostedCatalogResult extends HostedKnowledgeMetadata {
  kind: "catalog";
  scope: "knowledge_only";
  /** Empty unless the request set include="domains"; always present so undefined is never read. */
  domains: Array<{ domainId: CatalogDomainId; title: string; routeWhen: string }>;
  /** Always present, counted over every workflow in the catalog, not just the current page. */
  domainCounts: Array<{ domainId: CatalogDomainId; workflowCount: number }>;
  counts: { workflows: number; references: number };
  workflows: Array<Pick<CatalogWorkflowDef, "id" | "title" | "domainId" | "trigger" | "referenceIds">>;
  pagination: KnowledgePagination;
}

/** One bound reference at the requested depth, sliced from a shared per-workflow token budget. */
export interface HostedWorkflowBundleReference {
  referenceId: ReferenceId;
  /** Fingerprint of the complete document, not the prefix returned in this bundle. */
  contentSha256: string;
  contentLength: number;
  /** Includes source review dates. This is provenance, not a live source freshness claim. */
  provenance: HostedKnowledgeGetResult["provenance"];
  depth: "summary" | "full";
  /** A prefix of the reference's Markdown; may be shorter than the full text at this depth once the shared budget is spent. */
  markdown: string;
  /** Unicode code points in `markdown` above — always Array.from(markdown).length, never a byte count. */
  chars: number;
  /** True whenever more content exists beyond `markdown` at offset `nextOffset` in the full document — including a fully-delivered summary of a longer document. */
  truncated: boolean;
  /** Pass straight to b2c_knowledge_get({ referenceId, offset: nextOffset }) to continue into the full document; null once nothing remains. */
  nextOffset: number | null;
}

/** A workflow's bound-reference content, greedily allocated in workflow.referenceIds order against one shared token budget. Every bound reference appears — a budget-exhausted entry reports zero chars, never a silent omission. */
export interface HostedWorkflowKnowledgeBundle {
  requestedInclude: "summaries" | "full";
  tokenBudget: number;
  budgetUnit: "unicode_code_points";
  /** Sum of every reference's `chars` in this bundle. */
  consumedChars: number;
  references: HostedWorkflowBundleReference[];
  /** Full-document delivery coverage. Summaries and prefixes never establish complete reading. */
  coverage: {
    complete: boolean;
    /** Every directly bound reference is required; catalog order is not a permission to omit one. */
    requiredReferenceIds: ReferenceId[];
    incomplete: Array<{
      referenceId: ReferenceId;
      status: "omitted" | "truncated";
      /** Continue with b2c_knowledge_get({ referenceId, offset }); compare the complete-document hash. */
      offset: number;
      contentSha256: string;
    }>;
  };
}

export interface KnowledgeResolver {
  referenceId: ReferenceId;
  expectedContentSha256: string;
  sectionId?: string;
  offset?: number;
  view?: "sections";
  sectionOffset?: number;
  sectionLimit?: number;
}

export interface WorkflowKnowledgeRoute {
  mode: "route" | "instructions" | "summaries" | "full";
  instructionsIncluded: boolean;
  expand: { workflowId: string; include: "instructions" };
  references: Array<{ purpose: string; get: KnowledgeResolver; sections: Array<{ id: string; title: string }> }>;
  outputs: Array<{ path: string; specifications: Array<{ get: KnowledgeResolver }>; validators: string[]; specificationAvailable: boolean }>;
  continuation: { dependencies: string[]; successors: string[]; executionAvailable: false; businessComplete: false };
  coverage: {
    /** True when this response delivered every required reference in full. Not a caller-reading ledger. */
    complete: boolean;
    requiredCount: number;
    /** Per-response delivery statement. Does not say whether the caller read or finished the work. */
    delivery: string;
    incomplete: Array<
      | { referenceId: ReferenceId; status: "not_requested" }
      | { referenceId: ReferenceId; status: "omitted" | "truncated"; offset: number; contentSha256: string }
    >;
  };
  warnings: string[];
}

export interface HostedWorkflowResult extends HostedKnowledgeMetadata {
  kind: "workflow";
  scope: "knowledge_only";
  workflow: CatalogWorkflowDef;
  knowledge: HostedReferenceSummary[];
  route: WorkflowKnowledgeRoute;
  guardrails: {
    executionAvailable: false;
    workspacePlan: false;
    founderOnlyActions: string[];
    actionClass: CatalogWorkflowDef["actionClass"];
    protectedCategory?: CatalogWorkflowDef["protectedCategory"];
  };
  /** Present only when the request set `include`; null so existing consumers never read undefined. */
  knowledgeBundle: HostedWorkflowKnowledgeBundle | null;
  /** Present only when the request set `brief: true`; null so existing consumers never read undefined. Workspace-free — never carries a cwd, a workspace id, or any filesystem fact (that facet exists only on the local-only extended b2c_workflow tool, entrypoints/mcp/server.ts). */
  dispatchBrief: NodeBrief | null;
}

export interface HostedKnowledgeSearchResult extends HostedKnowledgeMetadata {
  kind: "knowledge_search";
  scope: "knowledge_only";
  query: string;
  results: Array<
    HostedReferenceSummary & {
      excerpt: string;
      excerptOffset: number;
      section?: { id: string; title: string; get: KnowledgeResolver };
      /** Present for an explicit workflow scope; a binding match is related guidance, not a lexical hit. */
      match?: { kind: "lexical" | "workflow_binding"; workflowId: string };
    }
  >;
  pagination: KnowledgePagination;
  /** Present only for workflow-scoped retrieval; domain filtering must not silently hide bound guidance. */
  workflowCoverage?: {
    workflowId: string;
    requiredReferenceIds: ReferenceId[];
    excludedByDomainReferenceIds: ReferenceId[];
  };
}

export interface HostedKnowledgeGetResult extends HostedKnowledgeMetadata {
  kind: "knowledge";
  scope: "knowledge_only";
  reference: HostedReferenceSummary;
  markdown: string;
  pagination: KnowledgePagination;
  paginationUnit: "unicode_code_points";
  section?: KnowledgeSection;
  sections?: { items: KnowledgeSection[]; pagination: KnowledgePagination; paginationUnit: "sections" };
  documentOffset?: number;
  nextCall?: KnowledgeResolver | null;
  provenance: {
    documentPath: string;
    manifestPath: string;
    manifestSha256: string;
    sourceMediaType: HostedKnowledgeDocument["sourceMediaType"];
    sourceSha256: string;
    applicabilityNotes?: string;
    sourceExemption?: string;
    sources: CatalogKnowledgeSource[];
  };
}

export type HostedKnowledgeResult = HostedCatalogResult | HostedWorkflowResult | HostedKnowledgeSearchResult | HostedKnowledgeGetResult;

export interface KnowledgeService {
  readonly metadata: HostedKnowledgeMetadata;
  catalog(input: unknown): HostedCatalogResult;
  workflow(input: unknown): HostedWorkflowResult;
  search(input: unknown): HostedKnowledgeSearchResult;
  get(input: unknown): HostedKnowledgeGetResult;
}
