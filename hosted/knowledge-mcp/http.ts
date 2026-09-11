import { z } from "zod";
import {
  connectionReceipt,
  HOSTED_CLIENT_NAME,
  hostedWrongSurfaceRefusal,
  interpretConfiguredConnection,
  isHostedWrongSurfaceTool,
} from "../../contracts/public-api/connection-receipt.js";
import { KnowledgeServiceError } from "../../kernel/knowledge-service/service.js";
import { callKnowledgeTool, KNOWLEDGE_TOOL_DEFINITIONS } from "../../kernel/knowledge-service/tools.js";
import type { KnowledgeService } from "../../kernel/knowledge-service/types.js";

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

// 500000, not 524288: aligned to the 500000-char ceiling Claude Code honors on a tool result's
// own anthropic/maxResultSizeChars _meta override (see kernel/knowledge-service/tools.ts).
export const MAX_HOSTED_RESPONSE_BYTES = 500_000;
export const HOSTED_BODY_TIMEOUT_MS = 10_000;

export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > MAX_HOSTED_RESPONSE_BYTES) throw new RequestError(500, "response_too_large");
  return new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", ...Object.fromEntries(new Headers(headers)) } });
}

export function failure(status: number, code: string, headers?: HeadersInit): Response {
  return json({ error: code }, status, headers);
}

/** Content-Length is only a hint. Bound bytes and total time through the last chunk. */
export async function boundedBody(request: Request, limit: number): Promise<string> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestError(413, "request_too_large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestError(408, "request_timeout")), HOSTED_BODY_TIMEOUT_MS);
  });
  const read = async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new RequestError(413, "request_too_large");
      }
      if (value.byteLength) chunks.push(value);
    }
  };
  try {
    await Promise.race([read(), deadline]);
  } catch (error) {
    // A stalled underlying cancel hook must not extend the response deadline.
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new RequestError(400, "invalid_request");
  }
}

export function uniqueParams(params: URLSearchParams, allowed?: readonly string[]): Record<string, string> {
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of params) {
    if (Object.hasOwn(values, key) || (allowed && !allowed.includes(key))) throw new RequestError(400, "invalid_request");
    values[key] = value;
  }
  return values;
}

/** Collapse redundant OAuth resource indicators only for the exact hosted MCP resource. */
export function normalizeOAuthResources(params: URLSearchParams, canonicalResource: string): boolean {
  const resources = params.getAll("resource");
  if (resources.length < 2) return false;
  if (resources.some((resource) => resource !== canonicalResource)) throw new RequestError(400, "invalid_request");
  params.set("resource", canonicalResource);
  return true;
}

export function readBearer(request: Request): string {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([A-Za-z0-9_:.\/-]{1,2048})$/);
  if (!match?.[1]) throw new RequestError(401, "unauthorized");
  return match[1];
}

/** MCP tools/call for a local workspace name becomes an isError result, not a protocol missing-tool guess. */
export function hostedWrongSurfaceMcpResponse(body: string, engineVersion: string): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const message = payload as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  if (message.method !== "tools/call") return null;
  if (!message.params || typeof message.params !== "object" || Array.isArray(message.params)) return null;
  const name = (message.params as { name?: unknown }).name;
  if (typeof name !== "string" || !isHostedWrongSurfaceTool(name)) return null;
  const refusal = hostedWrongSurfaceRefusal({ engineVersion, toolName: name });
  return {
    jsonrpc: "2.0",
    id: "id" in message ? message.id : null,
    result: {
      content: [{ type: "text", text: JSON.stringify(refusal) }],
      structuredContent: refusal,
      isError: true,
    },
  };
}

export function queryInput(url: URL): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = uniqueParams(url.searchParams);
  // tokenBudget joins offset/limit as a bounded-digit-string GET query param (b2c_workflow bundle
  // mode, E1/#34) — Zod would otherwise 400 the string form on this REST shortcut alone, while the
  // POST/MCP paths (which pass real JSON numbers) kept working, exactly the parity gap
  // hosted/knowledge-mcp/test/worker.test.ts's HTTP/MCP-match assertions exist to catch.
  for (const key of ["offset", "limit", "tokenBudget", "sectionOffset", "sectionLimit"]) {
    if (key in result) {
      const value = result[key];
      if (typeof value !== "string" || !/^\d{1,8}$/.test(value)) throw new RequestError(400, "invalid_arguments");
      result[key] = Number(value);
    }
  }
  if ("brief" in result) {
    const value = result.brief;
    if (value !== "true" && value !== "false") throw new RequestError(400, "invalid_arguments");
    result.brief = value === "true";
  }
  return result;
}

export async function handleApi(request: Request, service: KnowledgeService): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/api/v1" && request.method === "GET") {
      if (url.search) throw new RequestError(400, "invalid_arguments");
      return json({
        service: "B2C App Builder",
        scope: "knowledge_only",
        ...service.metadata,
        connection: interpretConfiguredConnection({
          clientName: HOSTED_CLIENT_NAME,
          receipt: connectionReceipt({ mode: "hosted_knowledge", engineVersion: service.metadata.engineVersion }),
        }),
        tools: KNOWLEDGE_TOOL_DEFINITIONS.map((tool) => ({ ...tool, inputSchema: z.toJSONSchema(tool.inputSchema, { io: "input" }) })),
      });
    }
    let name: string | undefined;
    let input: unknown;
    if (request.method === "POST" && /^\/api\/v1\/tools\/[a-z0-9_]+$/.test(url.pathname)) {
      if (url.search) throw new RequestError(400, "invalid_arguments");
      name = url.pathname.split("/").at(-1);
      if (name && isHostedWrongSurfaceTool(name)) {
        return json(hostedWrongSurfaceRefusal({ engineVersion: service.metadata.engineVersion, toolName: name }), 400);
      }
      try {
        input = JSON.parse(await request.text());
      } catch {
        throw new RequestError(400, "invalid_json");
      }
    } else if (request.method === "GET") {
      const query = queryInput(url);
      if (url.pathname === "/api/v1/catalog") {
        name = "b2c_catalog";
        input = query;
      } else if (url.pathname === "/api/v1/knowledge/search") {
        name = "b2c_knowledge_search";
        input = query;
      } else if (/^\/api\/v1\/workflows\/[a-zA-Z0-9._-]+$/.test(url.pathname)) {
        name = "b2c_workflow";
        if (Object.hasOwn(query, "workflowId")) throw new RequestError(400, "invalid_arguments");
        input = { ...query, workflowId: url.pathname.split("/").at(-1) };
      } else if (/^\/api\/v1\/knowledge\/[a-zA-Z0-9._-]+$/.test(url.pathname)) {
        name = "b2c_knowledge_get";
        if (Object.hasOwn(query, "referenceId")) throw new RequestError(400, "invalid_arguments");
        input = { ...query, referenceId: url.pathname.split("/").at(-1) };
      }
    }
    if (!name) return failure(404, "not_found");
    return json(callKnowledgeTool(service, name, input));
  } catch (error) {
    if (error instanceof KnowledgeServiceError) return failure(error.code === "not_found" ? 404 : error.code === "revision_mismatch" ? 409 : 400, error.code);
    throw error;
  }
}

export function secureResponse(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  // HTML form POSTs send Origin: null under no-referrer. Keep their same-origin
  // proof while suppressing referrers to external OAuth callbacks.
  const isHtml = headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() === "text/html";
  headers.set("Referrer-Policy", isHtml ? "same-origin" : "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  for (const key of ["Access-Control-Allow-Origin", "Access-Control-Allow-Credentials", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods"])
    headers.delete(key);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, MCP-Protocol-Version");
    headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Protocol-Version, Retry-After");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
