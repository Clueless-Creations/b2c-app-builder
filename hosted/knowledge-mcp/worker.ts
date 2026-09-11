import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import bundle from "../../catalog/generated/hosted-knowledge.json";
import { createKnowledgeService } from "../../kernel/knowledge-service/service.js";
import { registerKnowledgeTools } from "../../kernel/knowledge-service/tools.js";
import type { HostedKnowledgeBundle, KnowledgeService } from "../../kernel/knowledge-service/types.js";
import { resolveApiKeyAccess, resolveGrantAccess } from "./access.js";
import { recordMcpActivation } from "./analytics.js";
import { AccessError, isConsentSecret, READ_SCOPE } from "./auth.js";
import {
  boundedBody,
  failure,
  handleApi,
  hostedWrongSurfaceMcpResponse,
  json,
  MAX_HOSTED_RESPONSE_BYTES,
  normalizeOAuthResources,
  readBearer,
  RequestError,
  secureResponse,
  uniqueParams,
} from "./http.js";
import {
  connectionReceipt,
  HOSTED_CLIENT_NAME,
  hostedMcpInstructionsSuffix,
  interpretConfiguredConnection,
} from "../../contracts/public-api/connection-receipt.js";
import { HOSTED_INSTRUCTIONS } from "./instructions.js";
import { browserAuthorizationFailure, createOAuthProvider } from "./oauth.js";

// Only immutable authored knowledge is shared. Servers, transports and auth props are request-local.
const knowledgeBundle = bundle as unknown as HostedKnowledgeBundle;
/** What /health reports. Read straight off the bundle so a health check never builds the service. */
const bundleMetadata = Object.freeze({ engineVersion: knowledgeBundle.engineVersion, bundleSha256: knowledgeBundle.bundleSha256 });
let knowledgeService: KnowledgeService | undefined;
/**
 * Built on first use, never at module evaluation. Constructing the service parses and indexes
 * every document in the bundle (140 references, about 3 MB of Markdown as of 0.216.0) — roughly
 * 700 ms of CPU — and Cloudflare caps a Worker's startup at 400 ms of CPU, so the eager build
 * this replaced stopped deploying once the bundle grew (error 10021, 2026-09-06). Inside a request
 * the cost is charged to that request's own budget, once per isolate; the bundle is immutable, so
 * there is nothing to invalidate afterwards.
 */
function getService(): KnowledgeService {
  return (knowledgeService ??= createKnowledgeService(knowledgeBundle));
}
const metadataPaths = ["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"];

const authPaths = ["/oauth/authorize", "/oauth/register", "/oauth/token"];

function stringList(raw: unknown): string[] {
  try {
    return z.array(z.string().url().max(2048)).max(32).parse(raw);
  } catch {
    throw new AccessError(503);
  }
}

async function checkRate(limiter: RateLimit, key: string): Promise<void> {
  if (!(await limiter.limit({ key })).success) throw new RequestError(429, "rate_limited");
}

async function mcpResponse(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { principal } = await resolveGrantAccess(env, ctx.props);
  await checkRate(env.API_LIMITER, principal.subject);
  // Stateless clients use POST. GET would open an unbounded SSE stream in the SDK.
  if (request.method !== "POST") return failure(405, "method_not_allowed", { Allow: "POST" });
  const service = getService();
  const wrongSurface = hostedWrongSurfaceMcpResponse(await request.clone().text(), service.metadata.engineVersion);
  if (wrongSurface) return json(wrongSurface);
  const server = new McpServer(
    { name: "b2c-hosted", version: service.metadata.engineVersion },
    {
      // Pinned by hosted/knowledge-mcp/test/worker.test.ts. This is the only orientation a client
      // that installed nothing else ever receives, so it names the whole route rather than just
      // the first call, and it states what the service cannot observe — ARCH-11: a prerequisite
      // this service does not report is unknown, not satisfied and not absent.
      instructions: `${HOSTED_INSTRUCTIONS}${hostedMcpInstructionsSuffix(service.metadata.engineVersion)}`,
    },
  );
  registerKnowledgeTools(server, service);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // JSON-only, stateless transport: drain before closing request-local resources.
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_HOSTED_RESPONSE_BYTES) throw new RequestError(500, "response_too_large");
    // Activation signal. No-op unless POSTHOG_PROJECT_TOKEN is set; cannot throw, delay, or alter this response.
    if (response.ok) recordMcpActivation(env, ctx, request, principal.subject, service.metadata.engineVersion);
    return new Response(body.byteLength ? body : null, { status: response.status, headers: response.headers });
  } finally {
    await server.close();
  }
}

async function dispatch(request: Request, env: Env, ctx: ExecutionContext, cors: { origin: string | null }): Promise<Response> {
  const url = new URL(request.url);
  if (new URL(env.B2C_APP_BUILDER_PUBLIC_ORIGIN).origin !== env.B2C_APP_BUILDER_PUBLIC_ORIGIN || !env.B2C_APP_BUILDER_PUBLIC_ORIGIN.startsWith("https://"))
    throw new AccessError(503);
  if (url.origin !== env.B2C_APP_BUILDER_PUBLIC_ORIGIN || url.username || url.password) throw new RequestError(421, "misdirected_request");
  if (request.url.length > 8192) throw new RequestError(414, "uri_too_long");
  const trusted = stringList(env.B2C_APP_BUILDER_TRUSTED_REDIRECTS);
  const allowedOrigins = stringList(env.B2C_APP_BUILDER_ALLOWED_ORIGINS);
  const origin = request.headers.get("origin");
  if (origin && origin !== env.B2C_APP_BUILDER_PUBLIC_ORIGIN && !allowedOrigins.includes(origin)) throw new RequestError(403, "origin_denied");
  cors.origin = origin;
  const path = url.pathname;
  const isApi = path === "/api/v1" || path.startsWith("/api/v1/");
  const isMcp = path === "/mcp";
  const isAuth = authPaths.includes(path);
  const isMetadata = metadataPaths.includes(path);
  // Only GET discovery is exempt; public routes and preflights must pass ingress checks.
  if (!(isMetadata && request.method === "GET")) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    await checkRate(env.INGRESS_LIMITER, ip);
    if (isAuth) await checkRate(env.AUTH_LIMITER, ip);
  }
  if (!isApi && !isMcp && !isAuth && !isMetadata && path !== "/" && path !== "/health") throw new RequestError(404, "not_found");
  if (!["GET", "POST", "OPTIONS"].includes(request.method)) throw new RequestError(405, "method_not_allowed");
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.search && !isApi && path !== "/oauth/authorize") throw new RequestError(400, "invalid_request");
  if ([...url.searchParams.keys()].some((key) => /^(access_token|api_key|token|authorization)$/i.test(key))) throw new RequestError(400, "invalid_request");
  if ((path === "/" || path === "/health" || isMetadata) && request.method !== "GET") throw new RequestError(405, "method_not_allowed");
  if (["/oauth/register", "/oauth/token"].includes(path) && request.method !== "POST") throw new RequestError(405, "method_not_allowed");
  if (!isConsentSecret(env.B2C_APP_BUILDER_AUTH_SECRET)) throw new AccessError(503);
  if (path === "/health")
    return json({ status: "ok", service: "b2c-hosted", engineVersion: bundleMetadata.engineVersion, bundleSha256: bundleMetadata.bundleSha256 });
  if (path === "/")
    return json({
      service: "B2C App Builder",
      access: "api_key",
      scope: "knowledge_only",
      mcp: `${url.origin}/mcp`,
      api: `${url.origin}/api/v1`,
      connection: interpretConfiguredConnection({
        clientName: HOSTED_CLIENT_NAME,
        receipt: connectionReceipt({ mode: "hosted_knowledge", engineVersion: bundleMetadata.engineVersion }),
      }),
    });
  const canonicalResource = `${env.B2C_APP_BUILDER_PUBLIC_ORIGIN}/mcp`;
  // GET and POST must bind consent challenges to the same normalized authorization query.
  if (path === "/oauth/authorize" && normalizeOAuthResources(url.searchParams, canonicalResource)) request = new Request(url.toString(), request);
  if (request.method === "POST") {
    const form = path === "/oauth/token" || path === "/oauth/authorize";
    const expected = form ? "application/x-www-form-urlencoded" : "application/json";
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== expected) throw new RequestError(415, "unsupported_media_type");
    let body = await boundedBody(request, isAuth ? 8192 : 32_768);
    // One MCP message per request. A request/cancellation batch can strand the SDK response.
    if (isMcp && body.trimStart().startsWith("[")) throw new RequestError(400, "batch_not_supported");
    if (form) {
      const params = new URLSearchParams(body);
      if (path === "/oauth/token" && normalizeOAuthResources(params, canonicalResource)) body = params.toString();
      const values = uniqueParams(params);
      // Empty scope is not omission. The provider otherwise treats it as the full grant.
      if (path === "/oauth/token" && "scope" in values && values.scope !== READ_SCOPE) throw new RequestError(400, "invalid_scope");
    }
    request = new Request(request, { body });
  }
  if (isApi) {
    const { principal } = await resolveApiKeyAccess(env, readBearer(request));
    await checkRate(env.API_LIMITER, principal.subject);
    return handleApi(request, getService());
  }
  if (isMcp && request.headers.has("authorization")) readBearer(request);
  const provider = createOAuthProvider(env, trusted, {
    fetch: (incoming, incomingEnv, incomingCtx) => mcpResponse(incoming, incomingEnv, incomingCtx),
  });
  // The OAuth library injects helpers into env. A fresh object prevents cross-request reuse.
  return provider.fetch(request, { ...env }, ctx);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const cors = { origin: null as string | null };
    try {
      return secureResponse(await dispatch(request, env, ctx, cors), cors.origin);
    } catch (error) {
      const status = error instanceof AccessError || error instanceof RequestError ? error.status : 500;
      let code = "internal_error";
      if (error instanceof RequestError) code = error.code;
      else if (error instanceof AccessError) code = status === 503 ? "unavailable" : "access_denied";
      const headers = new Headers();
      if (status === 401)
        headers.set("WWW-Authenticate", `Bearer resource_metadata="${env.B2C_APP_BUILDER_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp"`);
      if (status === 429) headers.set("Retry-After", "60");
      return secureResponse(browserAuthorizationFailure(request, status, headers) ?? failure(status, code, headers), cors.origin);
    }
  },
} satisfies ExportedHandler<Env>;
