import { indexKnowledgeSections, type KnowledgeSection } from "./sections.js";
import { z } from "zod";
import type { CatalogContextPack, CatalogReference, CatalogRole, CatalogWorkflowDef } from "../../catalog/types.js";
import type { NodeBrief } from "../engine/node-brief.js";
import { reviewFacet } from "../engine/review-facet.js";
import { isLaterGuidance } from "../lib/later-guidance.js";
import {
  DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET,
  HOSTED_KNOWLEDGE_SCHEMA_VERSION,
  MAX_HOSTED_BUNDLE_BYTES,
  MAX_HOSTED_DOCUMENT_BYTES,
  MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
  MAX_KNOWLEDGE_EXCERPT_LENGTH,
  MAX_KNOWLEDGE_PAGE_LENGTH,
  MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET,
  type HostedKnowledgeBundle,
  type HostedKnowledgeDocument,
  type HostedReferenceSummary,
  type HostedWorkflowBundleReference,
  type HostedWorkflowKnowledgeBundle,
  type KnowledgePagination,
  type KnowledgeService,
  type KnowledgeResolver,
  type WorkflowKnowledgeRoute,
} from "./types.js";

const stableId = (prefix: string) =>
  z
    .string()
    .max(180)
    .regex(new RegExp(`^${prefix}\\.[a-z0-9]+(?:[.-][a-z0-9]+)*$`, "u"));
const domainId = stableId("domain").optional();
const query = z.string().trim().min(1).max(200);
const offset = z.number().int().min(0).max(10_000).default(0);

export const catalogInputSchema = z
  .object({ query: query.optional(), domainId, offset, limit: z.number().int().min(1).max(50).default(20), include: z.enum(["domains"]).optional() })
  .strict();
/**
 * Plain (unrefined) ZodObject so entrypoints/mcp/server.ts's local-only extended b2c_workflow tool can
 * `.extend()` it with a `workspace` field and keep every rule below — Zod v4's `.extend()` stays
 * an object schema even after `.strict()`, so exporting the strict object directly (no
 * `.superRefine()` chained on) is what keeps it extendable. The "tokenBudget requires include"
 * rule that would otherwise live in a refinement is instead a plain runtime check in `workflow()`
 * below — matching this repo's established idiom (entrypoints/mcp/server.ts's workspace/utterance and
 * workspace/cwd pairs) rather than introducing this codebase's first Zod-level refinement.
 */
export const workflowInputSchema = z
  .object({
    workflowId: stableId("workflow"),
    /** Bundle mode (E1/#34): named references at this depth, greedily allocated against tokenBudget. Requires no other field; omitted entirely, the result is unchanged from before this tool grew bundle mode. */
    include: z.enum(["route", "instructions", "summaries", "full"]).optional(),
    /** Unicode code points shared across every reference this workflow binds. Requires `include`; defaults to DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET when `include` is set and this is omitted. */
    tokenBudget: z.number().int().min(256).max(MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET).optional(),
    /** Adds a self-contained subagent dispatch packet (dispatchBrief) alongside the workflow. Independent of include/tokenBudget. */
    brief: z.boolean().optional(),
  })
  .strict();
export const knowledgeSearchInputSchema = z
  .object({
    query,
    domainId,
    /** Traverse this workflow's authored reference bindings. Lexical matches lead; related bound guidance follows. */
    workflowId: stableId("workflow").optional(),
    offset,
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
export const knowledgeGetInputSchema = z
  .object({
    referenceId: stableId("reference"),
    sectionId: z.string().min(1).max(160).optional(),
    expectedContentSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    view: z.enum(["content", "sections"]).optional(),
    sectionOffset: z.number().int().min(0).max(10_000).default(0),
    sectionLimit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(MAX_HOSTED_DOCUMENT_BYTES).default(0),
    limit: z.number().int().min(1).max(MAX_KNOWLEDGE_PAGE_LENGTH).default(8_192),
  })
  .strict();

export class KnowledgeServiceError extends Error {
  constructor(
    public readonly code: "invalid_arguments" | "not_found" | "revision_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeServiceError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  // Do not echo values, unknown field names, or paths from an untrusted request.
  if (!parsed.success) throw new KnowledgeServiceError("invalid_arguments", "Invalid knowledge tool arguments. Use the published input schema.");
  return parsed.data;
}

const compareId = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "change",
  "for",
  "from",
  "had",
  "has",
  "have",
  "i",
  "in",
  "is",
  "it",
  "my",
  "of",
  "on",
  "our",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "want",
  "wants",
  "you",
]);
export const terms = (value: string): string[] => {
  const tokens = value.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
  return [...new Set(tokens.filter((term) => term.length > 1 && !STOP_WORDS.has(term)))];
};

/** Same tokenizer as `terms()`, but keeps every occurrence — BM25 needs raw term frequency, not a deduped set. */
function tokenCounts(value: string): Map<string, number> {
  const tokens = value.toLowerCase().match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [];
  const counts = new Map<string, number>();
  for (const token of tokens) {
    if (token.length <= 1 || STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function partialMatchFloor(queryTerms: string[]): number {
  if (queryTerms.length <= 2) return 1;
  return Math.min(3, Math.max(2, Math.ceil(queryTerms.length / 3)));
}

export function matchRank(searchText: string, title: string, loadWhen: string, queryTerms: string[]) {
  const matchedTermCount = queryTerms.filter((term) => searchText.includes(term)).length;
  const titleLower = title.toLowerCase();
  const loadWhenLower = loadWhen.toLowerCase();
  const boost = queryTerms.reduce((score, term) => score + (titleLower.includes(term) ? 5 : 0) + (loadWhenLower.includes(term) ? 2 : 0), 0);
  return { matchedTermCount, boost };
}

function paginate(total: number, start: number, limit: number): KnowledgePagination {
  return { offset: start, limit, total, nextOffset: start + limit < total ? start + limit : null };
}

interface IndexedDocument {
  reference: CatalogReference;
  document: HostedKnowledgeDocument;
  length: number;
  /** Array.from(document.summary).length — the ceiling a "summaries"-depth bundle entry can take from this reference. */
  summaryLength: number;
  sections: KnowledgeSection[];
  searchText: string;
  markdownLower: string;
  /** Raw per-term occurrence counts over searchText, for BM25 scoring in search() — never deduped like terms(). */
  termCounts: Map<string, number>;
  /** Sum of termCounts values — this document's length in BM25's own unit (matched terms, not characters). */
  termTotal: number;
}

function summary(item: IndexedDocument): HostedReferenceSummary {
  return {
    referenceId: item.reference.id,
    title: item.reference.title,
    domainId: item.reference.domainId,
    loadWhen: item.reference.loadWhen,
    contentSha256: item.document.contentSha256,
    contentLength: item.length,
  };
}

function provenance(item: IndexedDocument): HostedWorkflowBundleReference["provenance"] {
  return {
    documentPath: item.reference.path,
    manifestPath: item.document.manifestPath,
    manifestSha256: item.document.manifestSha256,
    sourceMediaType: item.document.sourceMediaType,
    sourceSha256: item.document.sourceSha256,
    ...(item.reference.applicabilityNotes ? { applicabilityNotes: item.reference.applicabilityNotes } : {}),
    ...(item.reference.sourceExemption ? { sourceExemption: item.reference.sourceExemption } : {}),
    sources: structuredClone(item.reference.sources),
  };
}

function excerpt(item: IndexedDocument, queryTerms: string[]): { excerpt: string; excerptOffset: number } {
  const matches = queryTerms.map((term) => item.markdownLower.indexOf(term)).filter((position) => position >= 0);
  const position = matches.length ? Math.min(...matches) : 0;
  const start = Math.max(0, Array.from(item.document.markdown.slice(0, position)).length - 80);
  return {
    excerpt: Array.from(item.document.markdown)
      .slice(start, start + MAX_KNOWLEDGE_EXCERPT_LENGTH)
      .join(""),
    excerptOffset: start,
  };
}

function codePointSlice(text: string, offset: number, limit: number): string {
  let index = 0;
  let result = "";
  for (const point of text) {
    if (index >= offset + limit) break;
    if (index >= offset) result += point;
    index += 1;
  }
  return result;
}

/** The exact prefix a document's `summary` field must equal. Exported so tooling/render-hosted-bundle.ts computes summaries with this same function at render time — one definition of "prefix", never two that could drift. */
export function codePointPrefix(text: string, limit: number): string {
  return codePointSlice(text, 0, limit);
}

/** No filesystem, workspace, clock, network, or execution dependency is allowed here. */
export function createKnowledgeService(bundle: HostedKnowledgeBundle): KnowledgeService {
  const encoder = new TextEncoder();
  const validHash = (value: string): boolean => /^[a-f0-9]{64}$/u.test(value);
  const invalidBundle = (): never => {
    throw new Error("Invalid hosted knowledge bundle. Regenerate the build-time artifact.");
  };
  if (
    bundle.schemaVersion !== HOSTED_KNOWLEDGE_SCHEMA_VERSION ||
    bundle.engineVersion !== bundle.catalog.skillVersion ||
    !validHash(bundle.catalogSha256) ||
    !validHash(bundle.bundleSha256) ||
    encoder.encode(JSON.stringify(bundle)).length > MAX_HOSTED_BUNDLE_BYTES
  ) {
    invalidBundle();
  }
  // The caller cannot mutate the catalog or documents after this snapshot is made.
  const snapshot = structuredClone(bundle);
  const catalog = snapshot.catalog;
  const metadata = Object.freeze({
    schemaVersion: snapshot.schemaVersion,
    engineVersion: snapshot.engineVersion,
    catalogSha256: snapshot.catalogSha256,
    bundleSha256: snapshot.bundleSha256,
  });
  const references = new Map(catalog.references.map((reference) => [reference.id, reference]));
  const documents = new Map<string, IndexedDocument>();
  const domainIds = new Set<string>(catalog.domains.map((domain) => domain.id));
  if (references.size !== catalog.references.length || catalog.references.some((reference) => reference.lifecycle !== "active")) invalidBundle();
  for (const document of snapshot.documents) {
    const reference = references.get(document.referenceId);
    if (
      !reference ||
      documents.has(document.referenceId) ||
      !validHash(document.contentSha256) ||
      !validHash(document.sourceSha256) ||
      !["text/markdown", "application/yaml"].includes(document.sourceMediaType) ||
      !validHash(document.manifestSha256) ||
      encoder.encode(document.markdown).length > MAX_HOSTED_DOCUMENT_BYTES ||
      // Defense in depth: `summary` must be exactly the render-time prefix of `markdown`, never
      // hand-edited, truncated differently, or left over from a longer prior document — otherwise
      // a "summaries" bundle could serve content b2c_knowledge_get's nextOffset cannot continue.
      document.summary !== codePointPrefix(document.markdown, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH)
    ) {
      invalidBundle();
    }
    const sections = indexKnowledgeSections(document.markdown);
    if (
      document.sections &&
      (document.sections.length !== sections.length ||
        document.sections.some((entry, index) => {
          const expected = sections[index]!;
          return (
            entry.id !== expected.id ||
            entry.title !== expected.title ||
            entry.level !== expected.level ||
            entry.parentId !== expected.parentId ||
            entry.start !== expected.start ||
            entry.end !== expected.end
          );
        }))
    )
      invalidBundle();
    const resolved = reference!;
    for (const spec of resolved.specifies ?? []) {
      if (sections.filter((entry) => entry.title === spec.heading).length !== 1) invalidBundle();
    }
    const searchText = [resolved.id, resolved.title, resolved.loadWhen, resolved.applicabilityNotes, document.markdown]
      .filter((part): part is string => typeof part === "string")
      .join("\n")
      .toLowerCase();
    const termCounts = tokenCounts(searchText);
    documents.set(document.referenceId, {
      reference: resolved,
      document,
      length: Array.from(document.markdown).length,
      summaryLength: Array.from(document.summary).length,
      sections,
      searchText,
      markdownLower: document.markdown.toLowerCase(),
      termCounts,
      termTotal: [...termCounts.values()].reduce((sum, count) => sum + count, 0),
    });
  }
  if (documents.size !== references.size || catalog.workflows.some((workflow) => workflow.referenceIds.some((id) => !documents.has(id)))) invalidBundle();
  const workflows = [...catalog.workflows].sort((left, right) => compareId(left.id, right.id));
  const workflowsById = new Map<string, (typeof workflows)[number]>(workflows.map((workflow) => [workflow.id, workflow]));
  if (workflowsById.size !== workflows.length) invalidBundle();
  const workflowIndex = workflows.map((workflow) => {
    const searchText = [workflow.id, workflow.title, workflow.trigger, workflow.instructions].join("\n").toLowerCase();
    return {
      workflow,
      searchText,
      /**
       * Ranking-only text: `searchText` plus the authored `founderPhrasings`. Deliberately NOT
       * merged into `searchText`, which `catalog()` also uses for its every-term strict partition.
       * Merging them lets a term borrowed from one workflow's phrasing bind a narrow strict set
       * that suppresses every other workflow — measured, it erased the store-screenshot workflow
       * from "make store screenshots" outright. Feeding phrasings to `matchRank` alone keeps the
       * strict set byte-identical and makes matchedTermCount monotone non-decreasing, so the
       * result set can only grow.
       */
      rankText: [searchText, ...workflow.founderPhrasings].join("\n").toLowerCase(),
    };
  });
  const domainSummaries = [...catalog.domains]
    .sort((left, right) => left.order - right.order || compareId(left.id, right.id))
    .map((domain) => ({ domainId: domain.id, title: domain.name, routeWhen: domain.routeWhen }));
  // Counted over every workflow in the catalog, not the current page, so domainCounts stays
  // correct regardless of query, domainId filter, offset, or limit.
  const domainWorkflowCounts = new Map<string, number>();
  for (const workflow of workflows) domainWorkflowCounts.set(workflow.domainId, (domainWorkflowCounts.get(workflow.domainId) ?? 0) + 1);
  const domainCounts = domainSummaries.map((domain) => ({ domainId: domain.domainId, workflowCount: domainWorkflowCounts.get(domain.domainId) ?? 0 }));
  const indexed = [...documents.values()].sort((left, right) => compareId(left.reference.id, right.reference.id));
  // BM25 corpus statistics, built once over the whole knowledge bundle: how many documents carry
  // each term (documentFrequency), and the average document length in terms (avgDocLength). Real
  // lexical ranking, not a new dependency — no vector store, index stays in memory.
  const bm25DocumentCount = indexed.length;
  const bm25DocumentFrequency = new Map<string, number>();
  let bm25TotalTermLength = 0;
  for (const item of indexed) {
    bm25TotalTermLength += item.termTotal;
    for (const term of item.termCounts.keys()) bm25DocumentFrequency.set(term, (bm25DocumentFrequency.get(term) ?? 0) + 1);
  }
  const bm25AvgDocLength = bm25DocumentCount > 0 ? bm25TotalTermLength / bm25DocumentCount : 0;
  const BM25_K1 = 1.5;
  const BM25_B = 0.75;
  /** BM25 relevance score for one document against a query's terms — higher is more relevant. */
  function bm25Score(item: IndexedDocument, queryTerms: string[]): number {
    if (bm25AvgDocLength === 0) return 0;
    let score = 0;
    for (const term of queryTerms) {
      const frequency = item.termCounts.get(term) ?? 0;
      if (frequency === 0) continue;
      const documentFrequency = bm25DocumentFrequency.get(term) ?? 0;
      const inverseDocumentFrequency = Math.log((bm25DocumentCount - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1);
      const lengthNorm = 1 - BM25_B + (BM25_B * item.termTotal) / bm25AvgDocLength;
      score += inverseDocumentFrequency * ((frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * lengthNorm));
    }
    return score;
  }
  const requireDomain = (id: string | undefined): void => {
    if (id !== undefined && !domainIds.has(id)) throw new KnowledgeServiceError("not_found", "Domain was not found in this knowledge bundle.");
  };
  // Already sitting unindexed on `catalog` in memory (U8's bridge, catalog/bridge.ts, indexes the
  // same two maps for the same purpose) — no new I/O, just a lookup structure for buildDispatchBrief.
  const rolesById = new Map<string, CatalogRole>(catalog.roles.map((role) => [role.id, role]));
  const contextPacksById = new Map<string, CatalogContextPack>(catalog.contextPacks.map((pack) => [pack.id, pack]));

  /**
   * E1/#34 bundle mode: greedily allocate `tokenBudget` unicode code points across
   * `workflow.referenceIds`, IN THAT ORDER — the same order `knowledge[]` already uses (a
   * byproduct of catalog composition, not an authored priority), so the two arrays stay
   * index-aligned. Every bound reference appears; once the budget is spent, later references
   * report zero chars rather than disappearing (a truncated bundle must say so, never omit).
   *
   * A tight budget drops the LAST references first, so a workflow's referenceIds order is a real
   * allocation priority, not incidental. A catalog author should list the most load-bearing
   * reference first. See docs/architecture.md's Catalog and knowledge section.
   */
  function buildKnowledgeBundle(workflow: CatalogWorkflowDef, include: "summaries" | "full", tokenBudget: number): HostedWorkflowKnowledgeBundle {
    let remaining = tokenBudget;
    const references: HostedWorkflowBundleReference[] = workflow.referenceIds.map((referenceId) => {
      const item = documents.get(referenceId)!;
      const ceiling = include === "summaries" ? item.summaryLength : item.length;
      const take = Math.min(remaining, ceiling);
      const markdown = codePointSlice(item.document.markdown, 0, take);
      // Always paginated against the FULL document length, at both depths: `summary` is a strict
      // prefix of `markdown` (construction-time invariant above), so nextOffset is directly usable
      // as b2c_knowledge_get's `offset` regardless of which depth produced this entry.
      const pagination = paginate(item.length, 0, take);
      remaining -= take;
      return {
        referenceId,
        contentSha256: item.document.contentSha256,
        contentLength: item.length,
        provenance: provenance(item),
        depth: include === "summaries" ? "summary" : "full",
        markdown,
        chars: Array.from(markdown).length,
        truncated: pagination.nextOffset !== null,
        nextOffset: pagination.nextOffset,
      };
    });
    const incomplete: HostedWorkflowKnowledgeBundle["coverage"]["incomplete"] = references.flatMap((entry) =>
      entry.nextOffset === null
        ? []
        : [
            {
              referenceId: entry.referenceId,
              status: entry.chars === 0 ? ("omitted" as const) : ("truncated" as const),
              offset: entry.nextOffset,
              contentSha256: entry.contentSha256,
            },
          ],
    );
    return {
      requestedInclude: include,
      tokenBudget,
      budgetUnit: "unicode_code_points",
      consumedChars: references.reduce((sum, entry) => sum + entry.chars, 0),
      references,
      coverage: {
        complete: incomplete.length === 0,
        requiredReferenceIds: [...workflow.referenceIds],
        incomplete,
      },
    };
  }

  function resolver(item: IndexedDocument, sectionId?: string): KnowledgeResolver {
    return { referenceId: item.reference.id, expectedContentSha256: item.document.contentSha256, ...(sectionId ? { sectionId } : {}) };
  }

  function bestSection(item: IndexedDocument, queryTerms: string[]) {
    const ranked = item.sections
      .map((section) => {
        const title = section.title.toLowerCase();
        const body = codePointSlice(item.document.markdown, section.start, section.end - section.start).toLowerCase();
        return { section, score: queryTerms.reduce((sum, term) => sum + (title.includes(term) ? 10 : body.includes(term) ? 1 : 0), 0) };
      })
      .sort((a, b) => b.score - a.score || a.section.end - a.section.start - (b.section.end - b.section.start));
    const section = ranked[0]?.section;
    return section ? { id: section.id, title: section.title, get: resolver(item, section.id) } : undefined;
  }

  function workflowRoute(
    workflow: CatalogWorkflowDef,
    mode: WorkflowKnowledgeRoute["mode"],
    bundle: HostedWorkflowKnowledgeBundle | null,
  ): WorkflowKnowledgeRoute {
    const outputs = workflow.outputPaths.map((outputPath) => {
      const specifications = indexed.flatMap((item) =>
        (item.reference.specifies ?? [])
          .filter((spec) => spec.artifact === outputPath)
          .map((spec) => {
            const section = item.sections.find((candidate) => candidate.title === spec.heading)!;
            return { get: resolver(item, section.id) };
          }),
      );
      return {
        path: outputPath,
        specifications,
        specificationAvailable: specifications.length > 0,
        validators: workflow.gateCommands.map((gate) => `b2c check ${gate.replace(/^check:/, "")} --workspace <registered-workspace> --json`),
      };
    });
    const laterIds = new Set(workflow.referenceIds.filter((id) => isLaterGuidance(documents.get(id)!.reference.loadWhen)));
    const currentIds = workflow.referenceIds.filter((id) => !laterIds.has(id));
    const listedIds = mode === "route" ? currentIds : workflow.referenceIds;
    const incomplete =
      mode === "route"
        ? currentIds.map((id) => ({ referenceId: id, status: "not_requested" as const }))
        : (bundle?.coverage.incomplete ?? workflow.referenceIds.map((id) => ({ referenceId: id, status: "not_requested" as const })));
    const requiredCount = mode === "route" ? currentIds.length : workflow.referenceIds.length;
    const requestedInThisResponse = requiredCount - incomplete.filter((entry) => entry.status === "not_requested").length;
    return {
      mode,
      instructionsIncluded: mode !== "route",
      expand: { workflowId: workflow.id, include: "instructions" },
      references: listedIds.map((id) => {
        const item = documents.get(id)!;
        // Artifact selectors take precedence; never dump a book's entire table of contents.
        const relevant = outputs
          .flatMap((output) => output.specifications)
          .filter((spec) => spec.get.referenceId === id)
          .map((spec) => spec.get.sectionId);
        const selected = relevant.length
          ? item.sections.filter((section) => relevant.includes(section.id))
          : item.sections.filter((section) => section.level === 2 && !/^(contents|table of contents)$/i.test(section.title)).slice(0, 2);
        return { purpose: item.reference.loadWhen, get: resolver(item), sections: selected.map((section) => ({ id: section.id, title: section.title })) };
      }),
      outputs,
      continuation: {
        dependencies: [...workflow.dependencies],
        successors: workflows.filter((candidate) => candidate.dependencies.includes(workflow.id)).map((candidate) => candidate.id),
        executionAvailable: false,
        businessComplete: false,
      },
      coverage: {
        complete: incomplete.length === 0,
        requiredCount,
        delivery: `required references, ${requestedInThisResponse} requested in this response`,
        incomplete,
      },
      warnings: [
        ...(mode === "route" && laterIds.size
          ? [`${String(laterIds.size)} later-horizon references remain discoverable. They are not current reading.`]
          : []),
        ...(incomplete.length
          ? [
              mode === "route"
                ? "Bound references remain discoverable. Expand the current task with route.expand and load only the sections that task names. Later launch, design, and provider references are not an immediate reading list."
                : mode === "instructions"
                  ? "Required guidance is available but has not been delivered. Resolve the listed references or relevant contract sections before the work."
                  : "Required guidance was truncated. Follow coverage.incomplete before the work.",
            ]
          : []),
        ...(outputs.some((output) => !output.specificationAvailable)
          ? ["Some outputs do not yet have an indexed artifact specification; do not infer acceptance from file existence."]
          : []),
        "A workflow pass is not a business-completion verdict. This response does not name executable next work.",
      ],
    };
  }

  // Duplicated (NOT imported) from kernel/engine/compile.ts:186-188,279-289's verification-kind and
  // token-budget formula, with a parity fixture (checks/verification/fixtures/hosted-knowledge.fixtures.ts)
  // that runs the real catalog through both compilePlan() and buildDispatchBrief() for every
  // workflow and asserts `verify`/`tokenBudget` agree. Importing compile.ts as a VALUE here would pull its
  // schema/domain-authority dependency graph into the hosted OAuth Worker's actual bundle without
  // tripping hosted/knowledge-mcp/test/bundle-inputs.test.ts's one-hop import pin (see that test's own
  // header on why a new fault domain in that hot path deserves a deliberate look, not an accident).
  const NODE_DEFAULT_TOKEN_BUDGET = 8_000;
  const NODE_JUDGMENT_TOKEN_BUDGET = 20_000;
  const JUDGMENT_DOMAIN_IDS: readonly string[] = ["domain.research", "domain.words", "domain.design"];

  /**
   * A NodeBrief built directly from a workflow's own authored contract plus `rolesById` /
   * `contextPacksById` / `references` — no compiled plan, no workspace. `produce` uses
   * `workflow.outputPaths` verbatim (compile.ts's own `outputs` field is these same paths
   * resolved to artifact ids one-for-one — catalog/artifacts.ts derives exactly one artifact per
   * outputPath — so there is nothing further to resolve here). Role and context-pack resolution
   * stays LENIENT (an unresolvable role or pack is omitted, never thrown): this runs on every
   * `brief: true` call, and a real catalog's role/pack graph must never 500 a previously-working
   * b2c_workflow call the moment a caller asks for a brief.
   */
  function buildDispatchBrief(workflow: CatalogWorkflowDef): NodeBrief {
    const judgment = JUDGMENT_DOMAIN_IDS.includes(workflow.domainId);
    const gateIds = workflow.gateCommands;
    const bound = workflow.referenceIds.map((referenceId) => {
      const reference = references.get(referenceId)!;
      return {
        path: reference.path,
        title: reference.title,
        loadWhen: reference.loadWhen,
        ...(reference.sectionId ? { sectionId: reference.sectionId } : {}),
        ...(reference.revision ? { revision: reference.revision } : {}),
      };
    });
    const load = bound.filter((entry) => !isLaterGuidance(entry.loadWhen));
    const seenPaths = new Set(bound.map((entry) => entry.path));
    const role = rolesById.get(workflow.roleId);
    const route = role
      ? role.contextPackIds.flatMap((packId) => {
          const pack = contextPacksById.get(packId);
          if (!pack) return [];
          return pack.referenceIds.flatMap((referenceId) => {
            const reference = references.get(referenceId);
            if (!reference || seenPaths.has(reference.path)) return [];
            seenPaths.add(reference.path);
            // referenceId alongside path (ARCH-06: pin resources, not paths). A hosted reader has
            // no filesystem and b2c_knowledge_get refuses a path by construction, so a pack entry
            // carrying only `path` is unfetchable there — and unlike the `load` entries, these
            // have no id anywhere else in the response to recover it from.
            return [{ packId: pack.id, packTitle: pack.title, referenceId: reference.id, path: reference.path, title: reference.title, loadWhen: reference.loadWhen }];
          });
        })
      : [];
    return {
      workflowId: workflow.id,
      title: workflow.title,
      ...(role ? { role: { id: role.id, name: role.name, promptPath: role.promptPath } } : {}),
      contractFiles: role ? [...role.parentPromptPaths, role.promptPath] : [],
      instructions: workflow.instructions,
      open: [...workflow.reads],
      consult: [...workflow.consults],
      load,
      route,
      skills: role ? [...role.skillRoutes] : [],
      tools: role ? [...role.toolRoutes] : [],
      produce: [...workflow.outputPaths],
      verify: {
        kind: gateIds.length > 0 ? "deterministic" : judgment || workflow.outputPaths.length > 0 ? "fresh_context" : "none",
        requiresIndependentReview: judgment || Boolean(workflow.reviewOf?.length) || (gateIds.length === 0 && workflow.outputPaths.length > 0),
        gateCommands: [...gateIds],
        failClosed: gateIds.length > 0 || judgment || workflow.outputPaths.length > 0,
      },
      approvals: [...workflow.founderOnlyActions],
      tokenBudget: workflow.tokenBudget ?? (judgment ? NODE_JUDGMENT_TOKEN_BUDGET : NODE_DEFAULT_TOKEN_BUDGET),
      ...(() => {
        const review = reviewFacet(workflow.reviewOf, role?.reviewedBy);
        return review ? { review } : {};
      })(),
    };
  }

  return {
    metadata,
    catalog(input) {
      const args = parseInput(catalogInputSchema, input);
      requireDomain(args.domainId);
      const queryTerms = args.query ? terms(args.query) : [];
      const candidates = workflowIndex.filter(({ workflow }) => !args.domainId || workflow.domainId === args.domainId);
      const strict = candidates.filter(({ searchText }) => queryTerms.every((term) => searchText.includes(term)));
      const matching =
        args.query === undefined
          ? candidates
          : queryTerms.length === 0
            ? []
            : (strict.length > 0 ? strict : candidates)
                .map((entry) => ({
                  ...entry,
                  // rankText, not searchText: `strict` above owns the every-term partition and
                  // keeps the narrower field. See rankText's own comment for why they differ.
                  rank: matchRank(entry.rankText, entry.workflow.title, entry.workflow.trigger, queryTerms),
                }))
                .filter((entry) => strict.length > 0 || entry.rank.matchedTermCount >= partialMatchFloor(queryTerms))
                .sort(
                  (left, right) =>
                    right.rank.matchedTermCount - left.rank.matchedTermCount ||
                    right.rank.boost - left.rank.boost ||
                    compareId(left.workflow.id, right.workflow.id),
                );
      return {
        ...metadata,
        kind: "catalog",
        scope: "knowledge_only",
        // Full domain objects ship only under include=domains (R14/KTD10): the key stays present
        // so existing consumers never read undefined, but the 15-domain preamble is opt-in.
        domains: args.include === "domains" ? domainSummaries.map((domain) => ({ ...domain })) : [],
        domainCounts: domainCounts.map((entry) => ({ ...entry })),
        counts: { workflows: workflows.length, references: references.size },
        workflows: matching.slice(args.offset, args.offset + args.limit).map(({ workflow }) => ({
          id: workflow.id,
          title: workflow.title,
          domainId: workflow.domainId,
          trigger: workflow.trigger,
          referenceIds: [...workflow.referenceIds],
        })),
        pagination: paginate(matching.length, args.offset, args.limit),
      };
    },
    workflow(input) {
      const args = parseInput(workflowInputSchema, input);
      // A typed error, not a Zod refinement (see workflowInputSchema's own comment on why): a
      // tokenBudget with no include is a request that names a knob for a mode it never turned on.
      if (args.tokenBudget !== undefined && args.include !== "summaries" && args.include !== "full") {
        throw new KnowledgeServiceError("invalid_arguments", "tokenBudget requires include=summaries or include=full.");
      }
      const workflow = workflowsById.get(args.workflowId);
      if (!workflow) throw new KnowledgeServiceError("not_found", "Workflow was not found in this knowledge bundle.");
      const mode = args.include ?? "route";
      const knowledgeBundle =
        mode === "summaries" || mode === "full" ? buildKnowledgeBundle(workflow, mode, args.tokenBudget ?? DEFAULT_WORKFLOW_BUNDLE_TOKEN_BUDGET) : null;
      return {
        ...metadata,
        kind: "workflow",
        scope: "knowledge_only",
        // Keep the legacy metadata keys. Empty instructions in route mode are explicit in route.instructionsIncluded.
        workflow: { ...structuredClone(workflow), instructions: mode === "route" ? "" : workflow.instructions },
        route: workflowRoute(workflow, mode, knowledgeBundle),
        knowledge: mode === "route" ? [] : workflow.referenceIds.map((id) => summary(documents.get(id)!)),
        guardrails: {
          executionAvailable: false,
          workspacePlan: false,
          founderOnlyActions: [...workflow.founderOnlyActions],
          actionClass: workflow.actionClass,
          ...(workflow.protectedCategory ? { protectedCategory: workflow.protectedCategory } : {}),
        },
        knowledgeBundle,
        dispatchBrief: args.brief ? buildDispatchBrief(workflow) : null,
      };
    },
    search(input) {
      const args = parseInput(knowledgeSearchInputSchema, input);
      requireDomain(args.domainId);
      const workflow = args.workflowId === undefined ? undefined : workflowsById.get(args.workflowId);
      if (args.workflowId !== undefined && !workflow) throw new KnowledgeServiceError("not_found", "Workflow was not found in this knowledge bundle.");
      const boundIds = workflow ? new Set(workflow.referenceIds) : undefined;
      const queryTerms = terms(args.query);
      const candidates = indexed.filter(
        (item) => (!args.domainId || item.reference.domainId === args.domainId) && (!boundIds || boundIds.has(item.reference.id)),
      );
      const strict = candidates.filter((item) => queryTerms.every((term) => item.searchText.includes(term)));
      const partial = candidates.filter(
        (item) => matchRank(item.searchText, item.reference.title, item.reference.loadWhen, queryTerms).matchedTermCount >= partialMatchFloor(queryTerms),
      );
      const matches = (queryTerms.length === 0 ? [] : strict.length ? strict : partial)
        .map((item) => ({
          item,
          rank: matchRank(item.searchText, item.reference.title, item.reference.loadWhen, queryTerms),
          bm25: bm25Score(item, queryTerms),
        }))
        .sort(
          (left, right) =>
            right.rank.matchedTermCount - left.rank.matchedTermCount ||
            // Real lexical ranking (term frequency weighted by corpus rarity, length-normalized)
            // beats the flat title/loadWhen boost for query shapes with high term overlap.
            right.bm25 - left.bm25 ||
            compareId(left.item.reference.id, right.item.reference.id),
        );
      // Only an explicit workflow scope widens lexical retrieval. Use the catalog's existing
      // edges, never inferred similarity or shared hub references. This prevents an unscoped
      // search from unexpectedly loading unrelated domains while retaining required guidance
      // whose terminology differs from the query.
      const lexicalIds = new Set(matches.map(({ item }) => item.reference.id));
      const related = workflow
        ? workflow.referenceIds.flatMap((referenceId) => {
            const item = documents.get(referenceId)!;
            return lexicalIds.has(referenceId) || (args.domainId && item.reference.domainId !== args.domainId) ? [] : [{ item }];
          })
        : [];
      const ranked = [...matches, ...related];
      return {
        ...metadata,
        kind: "knowledge_search",
        scope: "knowledge_only",
        query: args.query,
        results: ranked.slice(args.offset, args.offset + args.limit).map(({ item }) => ({
          ...summary(item),
          ...excerpt(item, queryTerms),
          section: bestSection(item, queryTerms),
          ...(workflow
            ? { match: { kind: lexicalIds.has(item.reference.id) ? ("lexical" as const) : ("workflow_binding" as const), workflowId: workflow.id } }
            : {}),
        })),
        pagination: paginate(ranked.length, args.offset, args.limit),
        ...(workflow
          ? {
              workflowCoverage: {
                workflowId: workflow.id,
                requiredReferenceIds: [...workflow.referenceIds],
                excludedByDomainReferenceIds: workflow.referenceIds.filter((id) => args.domainId && documents.get(id)!.reference.domainId !== args.domainId),
              },
            }
          : {}),
      };
    },
    get(input) {
      const args = parseInput(knowledgeGetInputSchema, input);
      const item = documents.get(args.referenceId);
      if (!item) throw new KnowledgeServiceError("not_found", "Reference was not found in this knowledge bundle.");
      if ((args.sectionId || args.view === "sections") && !args.expectedContentSha256)
        throw new KnowledgeServiceError("invalid_arguments", "Section requests require the expectedContentSha256 returned by discovery.");
      if (args.expectedContentSha256 && args.expectedContentSha256 !== item.document.contentSha256)
        throw new KnowledgeServiceError("revision_mismatch", "The reference changed. Discover its current section IDs before continuing.");
      if (args.view === "sections" && (args.sectionId || args.offset !== 0))
        throw new KnowledgeServiceError("invalid_arguments", "Section discovery uses sectionOffset, not sectionId or a content offset.");
      const section = args.sectionId ? item.sections.find((entry) => entry.id === args.sectionId) : undefined;
      if (args.sectionId && !section) throw new KnowledgeServiceError("not_found", "The section does not exist at this reference revision.");
      const length = section ? section.end - section.start : item.length;
      const start = section?.start ?? 0;
      if (args.offset > length) throw new KnowledgeServiceError("invalid_arguments", "Offset exceeds the selected content range.");
      const indexOnly = args.view === "sections";
      if (indexOnly && args.sectionOffset > item.sections.length) throw new KnowledgeServiceError("invalid_arguments", "Offset exceeds the heading index.");
      const sectionPage = paginate(item.sections.length, args.sectionOffset, args.sectionLimit);
      const pagination = indexOnly ? { offset: 0, limit: 0, total: 0, nextOffset: null } : paginate(length, args.offset, args.limit);
      return {
        ...metadata,
        kind: "knowledge",
        scope: "knowledge_only",
        reference: summary(item),
        markdown: indexOnly ? "" : codePointSlice(item.document.markdown, start + args.offset, Math.min(args.limit, length - args.offset)),
        pagination,
        paginationUnit: "unicode_code_points",
        documentOffset: start + args.offset,
        ...(section ? { section: structuredClone(section) } : {}),
        ...(indexOnly
          ? {
              sections: {
                items: structuredClone(item.sections.slice(args.sectionOffset, args.sectionOffset + args.sectionLimit)),
                pagination: sectionPage,
                paginationUnit: "sections" as const,
              },
            }
          : {}),
        nextCall: indexOnly
          ? sectionPage.nextOffset === null
            ? null
            : { ...resolver(item), view: "sections" as const, sectionOffset: sectionPage.nextOffset, sectionLimit: args.sectionLimit }
          : pagination.nextOffset === null
            ? null
            : { ...resolver(item, args.sectionId), offset: pagination.nextOffset },
        provenance: provenance(item),
      };
    },
  };
}
