import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeServiceError, catalogInputSchema, knowledgeGetInputSchema, knowledgeSearchInputSchema, workflowInputSchema } from "./service.js";
import type { HostedKnowledgeResult, KnowledgeService } from "./types.js";

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Shared schemas are strict objects. HTTP must call the same service as MCP. */
export const KNOWLEDGE_TOOL_DEFINITIONS = [
  {
    name: "b2c_catalog",
    title: "Browse B2C App Builder workflows",
    description:
      "Browse the versioned workflow catalog. Filter by query or domain ID and paginate. This reads guidance; it does not plan or run a workspace. " +
      "The default page keeps domains as an empty array and adds domainCounts (per-domain workflow totals, always present, counted over the whole catalog, not the current page). " +
      'Pass include="domains" for the full domain objects, on any page or offset. ' +
      "Compatibility: domains is always present, so a reader never sees it as undefined. The response also includes a schemaVersion field. The hosted HTTP surface (GET /api/v1/catalog) returns this same JSON shape. " +
      'Measured on the shipped catalog: a default page (no query/domainId, limit=20) serializes at 9549 bytes. domainCounts adds 729 bytes to that total. The full domain array under include="domains" is 3077 bytes.',
    inputSchema: catalogInputSchema,
    annotations,
  },
  {
    name: "b2c_workflow",
    title: "Read a B2C App Builder workflow",
    description:
      "Get a compact workflow route by stable workflowId. The default include=route omits working instructions and knowledge bodies. " +
      "route.outputs links each indexed artifact specification to its exact section call and validator; route.references carries bounded section discovery and revision-pinned retrieval. " +
      "Read the required guidance before work. A route is not evidence that it was delivered or read. route.coverage and warnings name missing delivery. " +
      "Use include=instructions for the complete working instructions without a knowledge bundle. Use brief:true only when an expanded dispatch packet is needed. " +
      "Opt-in include=summaries or full retains the bounded bundle allocator. tokenBudget counts Unicode code points, not measured tokens, and is valid only for those two modes. " +
      "Follow coverage.incomplete and nextOffset on explicit bundles; prefer exact sections over a large bundle. " +
      "continuation lists dependency relationships, not an executable workspace plan or permission to skip review. A workflow pass cannot declare a business complete.",
    inputSchema: workflowInputSchema,
    annotations,
  },
  {
    name: "b2c_knowledge_search",
    title: "Search B2C App Builder knowledge",
    description:
      "Search active knowledge by a bounded query (1-200 characters) and optional domain ID. Paginate with offset (same 0-10000 offset as b2c_catalog) and limit (1-20, default 10). " +
      "Pass workflowId to traverse that workflow's authored reference bindings: lexical matches lead, followed by related guidance labelled match.kind=workflow_binding. " +
      "workflowCoverage lists all bound IDs and any excluded by a domain filter; an excerpt is never proof that the full required guidance was read. " +
      "Each result carries a bounded excerpt and, when available, section.get with exact revision-pinned retrieval arguments. An excerpt is not the full required guidance.",
    inputSchema: knowledgeSearchInputSchema,
    annotations,
  },
  {
    name: "b2c_knowledge_get",
    title: "Read B2C App Builder knowledge",
    description:
      "Get active Markdown by stable referenceId, never by path. Use a discovered sectionId plus expectedContentSha256 for exact sections, including descendant headings. " +
      "Offsets count Unicode code points within the selected section (or the whole document without sectionId). Follow nextCall. Stale hashes and unknown sections refuse. " +
      "view=sections with expectedContentSha256 returns a paginated heading index without a body; use sectionOffset and sectionLimit for that index. Returns hashes and source provenance.",
    inputSchema: knowledgeGetInputSchema,
    annotations,
  },
] as const;

export type KnowledgeToolName = (typeof KNOWLEDGE_TOOL_DEFINITIONS)[number]["name"];

export function callKnowledgeTool(service: KnowledgeService, name: string, input: unknown): HostedKnowledgeResult {
  switch (name) {
    case "b2c_catalog":
      return service.catalog(input);
    case "b2c_workflow":
      return service.workflow(input);
    case "b2c_knowledge_search":
      return service.search(input);
    case "b2c_knowledge_get":
      return service.get(input);
    default:
      throw new KnowledgeServiceError("not_found", "Knowledge tool was not found.");
  }
}

/**
 * Shared success/error shaping for a knowledge tool call — the same CallToolResult shape whether
 * `compute` is the shared per-name dispatch (`registerKnowledgeTools`'s own loop) or, on the local
 * stdio server only, a direct `service.workflow(...)` call inside the local-only extended
 * b2c_workflow tool (entrypoints/mcp/server.ts) that still needs this exact error shape.
 */
export function toCallToolResult(compute: () => HostedKnowledgeResult): CallToolResult {
  try {
    const result = compute();
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: { ...result } };
  } catch (error) {
    // isRetryable tells the calling agent whether to retry as-is. invalid_arguments and not_found
    // both need different caller input, not a retry; a future transient code (e.g. a knowledge-
    // bundle load failure) is the one that should set this true.
    const result =
      error instanceof KnowledgeServiceError
        ? { error: { code: error.code, message: error.message, isRetryable: false } }
        : { error: { code: "internal_error", message: "Knowledge request failed.", isRetryable: false } };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: true };
  }
}

/**
 * Registers every KNOWLEDGE_TOOL_DEFINITIONS entry except those named in `exclude` — the local
 * stdio server (entrypoints/mcp/server.ts) excludes "b2c_workflow" here and registers its own
 * workspace-aware superset instead, sharing this same dispatch and error-shaping for every other
 * name so there is exactly one implementation of "how a knowledge tool call is shaped", not two.
 */
export function registerKnowledgeTools(server: McpServer, service: KnowledgeService, options: { exclude?: readonly KnowledgeToolName[] } = {}): void {
  const excluded = new Set<string>(options.exclude ?? []);
  for (const definition of KNOWLEDGE_TOOL_DEFINITIONS) {
    if (excluded.has(definition.name)) continue;
    server.registerTool(
      definition.name,
      { title: definition.title, description: definition.description, inputSchema: definition.inputSchema, annotations: definition.annotations },
      async (input: unknown): Promise<CallToolResult> => {
        const result = toCallToolResult(() => callKnowledgeTool(service, definition.name, input));
        const bulk = input !== null && typeof input === "object" && ["summaries", "full"].includes(String((input as { include?: unknown }).include));
        return definition.name === "b2c_workflow" && bulk ? { ...result, _meta: { "anthropic/maxResultSizeChars": 500_000 } } : result;
      },
    );
  }
}
