import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { createHash } from "node:crypto";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions, type V4WorkerOptions } from "miniflare";
import { attachD1, seedAccountInto, revokeSeedKey } from "./support/d1.js";
import { sha256 } from "../auth.js";
import { hostedMcpInstructionsSuffix, parseConnectionReceipt } from "../../../contracts/public-api/connection-receipt.js";
import { HOSTED_INSTRUCTIONS } from "../instructions.js";
import type { HostedCatalogResult, HostedKnowledgeGetResult, HostedKnowledgeSearchResult } from "../../../kernel/knowledge-service/types.js";
import hostedKnowledge from "../../../catalog/generated/hosted-knowledge.json" with { type: "json" };

const origin = "https://b2c.test";
const key = `b2c_${"a".repeat(43)}`;
const deniedKey = `b2c_${"b".repeat(43)}`;
const verifier = "v".repeat(64);
let mf: Miniflare;
let options: V4WorkerOptions & { log: Log };
let database: Awaited<ReturnType<typeof attachD1>>;
const authorization = { Authorization: `Bearer ${key}` };
const mcpHeaders = { ...authorization, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };

before(async () => {
  options = {
    modules: true,
    scriptPath: fileURLToPath(new NodeURL("../.wrangler/test-bundle/worker.js", import.meta.url)),
    compatibilityDate: "2026-08-27",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    kvNamespaces: ["OAUTH_KV"],
    d1Databases: ["DB"],
    bindings: {
      B2C_APP_BUILDER_PUBLIC_ORIGIN: origin,
      B2C_APP_BUILDER_TRUSTED_REDIRECTS: [],
      B2C_APP_BUILDER_ALLOWED_ORIGINS: [],
      B2C_APP_BUILDER_AUTH_SECRET: "c".repeat(43),
    },
    ratelimits: {
      INGRESS_LIMITER: { namespace_id: "1001", simple: { limit: 10_000, period: 60 } },
      AUTH_LIMITER: { namespace_id: "1002", simple: { limit: 10_000, period: 60 } },
      API_LIMITER: { namespace_id: "1003", simple: { limit: 10_000, period: 60 } },
    },
    log: new Log(LogLevel.ERROR),
  };
  mf = new Miniflare(convertV4MiniflareOptions(options));
  await mf.ready;
  database = await seedWorker(mf);
});
after(async () => {
  await mf?.dispose();
});

async function seedWorker(worker: Miniflare) {
  const db = await attachD1(worker);
  for (const [subject, keyId, raw, entitled] of [
    ["eduardo", "owner-1", key, true],
    ["other", "other-1", deniedKey, false],
  ] as const) {
    await seedAccountInto(db, {
      accountId: `acct_${subject}`,
      userId: subject,
      googleSub: `google_${subject}`,
      email: `${subject}@example.com`,
      stripeCustomerId: `cus_${subject}`,
      keyId,
      keyDigest: await sha256(raw),
      entitled,
    });
  }
  return db;
}

function fetchPath(path: string, init?: Parameters<Miniflare["dispatchFetch"]>[1]) {
  return mf.dispatchFetch(`${origin}${path}`, { redirect: "manual", ...init });
}

async function mcpCall(name: string, args: unknown, token = key, id = 1) {
  return fetchPath("/mcp", {
    method: "POST",
    headers: { ...mcpHeaders, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
}

async function registerClient(name = "Test native client") {
  const response = await fetchPath("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: ["http://127.0.0.1:43121/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(response.status, 201);
  return response.json() as Promise<{ client_id: string }>;
}

function authPath(clientId: string) {
  return `/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: "http://127.0.0.1:43121/callback", response_type: "code", scope: "b2c:read", state: "test-state", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource: `${origin}/mcp` })}`;
}

async function consent(path: string) {
  return readConsentPage(await fetchPath(path));
}

async function readConsentPage(page: Awaited<ReturnType<typeof fetchPath>>, expectedStatus = 200) {
  assert.equal(page.status, expectedStatus);
  assert.ok(page.headers.get("content-type")?.startsWith("text/html"));
  assert.equal(page.headers.get("referrer-policy"), "same-origin", "browser form POSTs must preserve the real Origin header");
  const body = await page.text();
  const token = body.match(/name="csrf" value="([A-Za-z0-9_.-]+)"/)?.[1];
  const cookie = page.headers.get("set-cookie")?.split(";")[0];
  assert.ok(token && cookie);
  return { page, body, token, cookie };
}

async function authorize(clientId: string, apiKey = key) {
  const path = authPath(clientId);
  const { token, cookie } = await consent(path);
  const response = await fetchPath(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: cookie },
    body: new URLSearchParams({ csrf: token, api_key: apiKey, decision: "allow" }).toString(),
  });
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.searchParams.get("state"), "test-state");
  assert.equal(location.searchParams.get("iss"), origin);
  const code = location.searchParams.get("code");
  assert.ok(code);
  return code;
}

async function exchange(clientId: string, code: string, changes: Record<string, string> = {}) {
  return fetchPath("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: "http://127.0.0.1:43121/callback",
      resource: `${origin}/mcp`,
      ...changes,
    }).toString(),
  });
}

test("health and OAuth discovery are public; content requires authentication on both transports", async () => {
  const health = await fetchPath("/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: "b2c-hosted",
    engineVersion: hostedKnowledge.engineVersion,
    bundleSha256: hostedKnowledge.bundleSha256,
  });
  const metadata = (await (await fetchPath("/.well-known/oauth-protected-resource/mcp")).json()) as { resource: string; scopes_supported: string[] };
  assert.equal(metadata.resource, `${origin}/mcp`);
  assert.deepEqual(metadata.scopes_supported, ["b2c:read"]);
  for (const path of ["/api/v1", "/api/v1/catalog", "/mcp"]) {
    const response = await fetchPath(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.ok(response.headers.get("www-authenticate"));
    assert.ok(!(await response.text()).includes("workflows"));
  }
  for (const token of ["wrong", deniedKey]) {
    const expected = token === deniedKey ? 403 : 401;
    assert.equal((await fetchPath("/api/v1/catalog", { headers: { Authorization: `Bearer ${token}` } })).status, expected);
    assert.equal((await mcpCall("b2c_catalog", {}, token)).status, expected);
  }
});

test("real MCP initialization and tool discovery expose only the four read-only tools", async () => {
  const initialize = await fetchPath("/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "b2c-test", version: "1" } },
    }),
  });
  assert.equal(initialize.status, 200);
  const handshake = (await initialize.json()) as { result: { serverInfo: { name: string }; instructions: string } };
  assert.equal(handshake.result.serverInfo.name, "b2c-hosted");
  // The instructions string is the whole briefing for a client that installed nothing else, so it
  // is asserted rather than left to drift. Assert the route it must name, not the prose around it.
  const hostedInstructions = `${HOSTED_INSTRUCTIONS}${hostedMcpInstructionsSuffix(hostedKnowledge.engineVersion)}`;
  assert.equal(handshake.result.instructions, hostedInstructions);
  for (const required of ["b2c_catalog", "b2c_knowledge_search", "b2c_workflow", "route.expand", "b2c_knowledge_get"]) {
    assert.ok(HOSTED_INSTRUCTIONS.includes(required), `hosted instructions must name ${required}`);
  }
  assert.match(HOSTED_INSTRUCTIONS, /unknown here, not done and not undone/);
  assert.match(handshake.result.instructions, /b2c-hosted/);
  assert.match(handshake.result.instructions, /b2c-local/);
  const hostedReceipt = parseConnectionReceipt(handshake.result.instructions);
  assert.equal(hostedReceipt.mode, "hosted_knowledge");
  assert.equal(hostedReceipt.identity.recommended, "b2c-hosted");
  assert.equal(hostedReceipt.identity.legacy, undefined);
  assert.equal(hostedReceipt.declares.knowledge, "bundled");
  assert.equal(hostedReceipt.declares.writes, "none");
  assert.equal(hostedReceipt.providerObservation, "not_tested");
  assert.equal(hostedReceipt.observed, undefined);
  const response = await fetchPath("/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const body = (await response.json()) as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> } };
  assert.deepEqual(body.result.tools.map((tool) => tool.name).sort(), ["b2c_catalog", "b2c_knowledge_get", "b2c_knowledge_search", "b2c_workflow"]);
  assert.ok(body.result.tools.every((tool) => tool.annotations.readOnlyHint));
  const stream = await fetchPath("/mcp", { headers: { ...authorization, Accept: "text/event-stream" } });
  assert.equal(stream.status, 405);
  assert.equal(stream.headers.get("allow"), "POST");
  const local = await mcpCall("b2c_run", { workspace: "/tmp/private", asFounder: true });
  const localBody = (await local.json()) as { result?: { isError?: boolean }; error?: unknown };
  assert.ok(localBody.error || localBody.result?.isError);
});

test("MCP rejects batches promptly and still accepts individual notifications", { timeout: 5_000 }, async () => {
  for (const batch of [
    [],
    [
      { jsonrpc: "2.0", id: 7, method: "tools/list", params: {} },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } },
    ],
  ]) {
    const response = await fetchPath("/mcp", {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify(batch),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "batch_not_supported" });
  }
  const notification = await fetchPath("/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
  assert.equal((await mcpCall("b2c_catalog", { limit: 1 })).status, 200);
});

test("denied OAuth consent clears the browser challenge and never creates a grant", async () => {
  const client = await registerClient("Cancellation test");
  const path = authPath(client.client_id);
  // Miniflare's conditional worker-type replacement misidentifies this runtime proxy as Request.
  const kv = (await mf.getKVNamespace("OAUTH_KV")) as unknown as KVNamespace;
  const grantNames = async () => (await kv.list({ prefix: "grant:" })).keys.map((entry) => entry.name).sort();
  const before = await grantNames();
  for (const suppliedKey of [undefined, key]) {
    const { token, cookie } = await consent(path);
    const response = await fetchPath(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: cookie },
      body: new URLSearchParams({ csrf: token, decision: "deny", ...(suppliedKey ? { api_key: suppliedKey } : {}) }).toString(),
    });
    assert.equal(response.status, 303);
    const destination = new URL(response.headers.get("location")!);
    assert.equal(destination.origin, "http://127.0.0.1:43121");
    assert.equal(destination.searchParams.get("error"), "access_denied");
    assert.equal(destination.searchParams.get("state"), "test-state");
    assert.equal(destination.searchParams.get("iss"), origin);
    assert.equal(destination.searchParams.has("code"), false);
    assert.ok(response.headers.get("set-cookie")?.includes("=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"));
    assert.deepEqual(await grantNames(), before);
  }
});

test("HTTP and MCP share successful results and reject unknown fields", async () => {
  const args = { query: "privacy", limit: 2 };
  const rest = await fetchPath("/api/v1/tools/b2c_knowledge_search", {
    method: "POST",
    headers: { ...authorization, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const mcp = await mcpCall("b2c_knowledge_search", args);
  assert.equal(rest.status, 200);
  const result = (await mcp.json()) as { result: { structuredContent: unknown } };
  assert.deepEqual(result.result.structuredContent, await rest.json());
  assert.equal((await fetchPath("/api/v1/catalog?path=/tmp/private", { headers: authorization })).status, 400);
  assert.equal((await fetchPath("/api/v1/catalog?limit=1&limit=2", { headers: authorization })).status, 400);
  assert.equal((await fetchPath("/api/v1/knowledge/reference.not-found", { headers: authorization })).status, 404);
});

test("API discovery, workflow paths, and paged knowledge match MCP results", async () => {
  const discoveryResponse = await fetchPath("/api/v1", { headers: authorization });
  assert.equal(discoveryResponse.status, 200);
  const discovery = (await discoveryResponse.json()) as {
    tools: Array<{
      name: string;
      inputSchema: {
        type: string;
        additionalProperties: boolean;
        properties: Record<string, unknown>;
        required?: string[];
      };
    }>;
  };
  assert.deepEqual(discovery.tools.map((tool) => tool.name).sort(), ["b2c_catalog", "b2c_knowledge_get", "b2c_knowledge_search", "b2c_workflow"]);
  assert.ok(discovery.tools.every((tool) => tool.inputSchema.type === "object" && tool.inputSchema.additionalProperties === false));
  const toolsResponse = await fetchPath("/mcp", {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }),
  });
  assert.equal(toolsResponse.status, 200);
  const mcpTools = (await toolsResponse.json()) as { result: { tools: typeof discovery.tools } };
  for (const tool of discovery.tools) {
    const mcpSchema = mcpTools.result.tools.find((candidate) => candidate.name === tool.name)!.inputSchema;
    assert.equal(tool.inputSchema.type, mcpSchema.type, `${tool.name} input type`);
    assert.deepEqual(tool.inputSchema.properties, mcpSchema.properties, `${tool.name} properties`);
    assert.deepEqual(tool.inputSchema.required ?? [], mcpSchema.required ?? [], `${tool.name} required inputs`);
    assert.equal(tool.inputSchema.additionalProperties, mcpSchema.additionalProperties);
    for (const name of ["offset", "limit"]) {
      assert.ok(!(tool.inputSchema.required ?? []).includes(name), `${tool.name} ${name} is optional`);
    }
  }
  const catalog = (await (await fetchPath("/api/v1/catalog?limit=1", { headers: authorization })).json()) as HostedCatalogResult;
  const workflowId = catalog.workflows[0]!.id;
  const workflowResponse = await fetchPath(`/api/v1/workflows/${workflowId}`, { headers: authorization });
  assert.equal(workflowResponse.status, 200);
  const workflowMcp = (await (await mcpCall("b2c_workflow", { workflowId })).json()) as { result: { structuredContent: unknown } };
  assert.deepEqual(await workflowResponse.json(), workflowMcp.result.structuredContent);
  assert.equal((await fetchPath(`/api/v1/workflows/${workflowId}?workflowId=${workflowId}`, { headers: authorization })).status, 400);
  const search = (await (await fetchPath("/api/v1/knowledge/search?query=privacy&limit=20", { headers: authorization })).json()) as HostedKnowledgeSearchResult;
  const reference = [...search.results].sort((a, b) => b.contentLength - a.contentLength)[0]!;
  assert.ok(reference.contentLength > 4096, "fixture must exercise multiple pages");
  let offset: number | null = 0;
  let reconstructed = "";
  let pages = 0;
  while (offset !== null) {
    assert.ok(pages++ < 65, "paging must terminate within the document size bound");
    const response = await fetchPath(`/api/v1/knowledge/${reference.referenceId}?offset=${offset}&limit=4096`, { headers: authorization });
    assert.equal(response.status, 200);
    const page = (await response.json()) as HostedKnowledgeGetResult;
    const mcp = (await (await mcpCall("b2c_knowledge_get", { referenceId: reference.referenceId, offset, limit: 4096 })).json()) as {
      result: { structuredContent: unknown };
    };
    assert.deepEqual(mcp.result.structuredContent, page);
    assert.equal(page.paginationUnit, "unicode_code_points");
    assert.ok(page.pagination.nextOffset === null || page.pagination.nextOffset > offset);
    reconstructed += page.markdown;
    offset = page.pagination.nextOffset;
  }
  assert.equal(createHash("sha256").update(reconstructed).digest("hex"), reference.contentSha256);
  const maximum = await mcpCall("b2c_knowledge_get", { referenceId: reference.referenceId, limit: 16384 });
  assert.equal(maximum.status, 200);
  assert.ok((await maximum.arrayBuffer()).byteLength < 524_288);
});

test("allowed browser preflights return the complete CORS contract", async () => {
  for (const path of ["/mcp", "/api/v1/catalog"]) {
    const response = await fetchPath(path, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("vary"), "Origin");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
    for (const header of ["Authorization", "Content-Type", "Accept", "MCP-Protocol-Version"])
      assert.ok(response.headers.get("access-control-allow-headers")?.includes(header));
  }
  assert.equal((await fetchPath("/mcp", { method: "OPTIONS", headers: { Origin: "https://evil.test" } })).status, 403);
});

test("parallel stateless MCP requests with identical IDs remain independent", async () => {
  const queries = ["privacy", "pricing", "onboarding", "localization"];
  const responses = await Promise.all(queries.map((query) => mcpCall("b2c_knowledge_search", { query, limit: 1 }, key, 77)));
  for (let index = 0; index < responses.length; index++) {
    const wire = (await responses[index]!.json()) as { id: number; result: { structuredContent: unknown } };
    const expected = await (await fetchPath(`/api/v1/knowledge/search?query=${queries[index]}&limit=1`, { headers: authorization })).json();
    assert.equal(wire.id, 77);
    assert.deepEqual(wire.result.structuredContent, expected);
  }
});

test("host, Origin, path, method, and URL-credential checks fail closed", async () => {
  for (const [token, expected] of [
    ["invalid", 401],
    [deniedKey, 403],
  ] as const) {
    const response = await fetchPath("/api/v1/catalog", { headers: { Authorization: `Bearer ${token}`, Origin: origin } });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.ok(response.headers.get("access-control-expose-headers")?.includes("WWW-Authenticate"));
  }
  const hostile = await fetchPath("/api/v1/catalog", { headers: { ...authorization, Origin: "https://evil.test" } });
  assert.equal(hostile.status, 403);
  assert.equal(hostile.headers.get("access-control-allow-origin"), null);
  assert.equal((await mf.dispatchFetch("https://evil.test/api/v1/catalog", { headers: authorization })).status, 421);
  assert.equal((await fetchPath("/mcp", { method: "POST", headers: { ...mcpHeaders, Origin: "https://evil.test" }, body: "{}" })).status, 403);
  assert.equal((await fetchPath("/mcp-other", { headers: authorization })).status, 404);
  assert.equal((await fetchPath("/mcp?access_token=secret-value", { headers: authorization })).status, 400);
  assert.equal((await fetchPath("/api/v1/catalog", { method: "PUT", headers: authorization })).status, 405);
  assert.equal((await fetchPath("/api/v1/knowledge/%2e%2e%2fprivate", { headers: authorization })).status, 404);
});

test("workerd returns the total body deadline for a never-closed request stream", { timeout: 20_000 }, async () => {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      controller.enqueue(new TextEncoder().encode('{"jsonrpc":'));
    },
  });
  try {
    const response = await fetchPath("/mcp", {
      method: "POST",
      headers: mcpHeaders,
      body: stream,
      duplex: "half",
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 408);
    assert.deepEqual(await response.json(), { error: "request_timeout" });
  } finally {
    // The HTTP client may already have cancelled its request stream after the early response.
    try {
      controller!.close();
    } catch {
      /* already closed by the client */
    }
  }
});

test("bodies are bounded without Content-Length and malformed payloads stay generic", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(40_000)));
      controller.close();
    },
  });
  const large = await fetchPath("/mcp", { method: "POST", headers: mcpHeaders, body: stream, duplex: "half" });
  assert.equal(large.status, 413);
  const malformed = await fetchPath("/api/v1/tools/b2c_catalog", {
    method: "POST",
    headers: { ...authorization, "Content-Type": "application/json" },
    body: "secret-value-not-json",
  });
  assert.equal(malformed.status, 400);
  assert.ok(!(await malformed.text()).includes("secret-value"));
  assert.equal(
    (await fetchPath("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=a&grant_type=b" }))
      .status,
    400,
  );
});

test("OAuth registration restricts redirects; consent escapes untrusted names and requires S256", async () => {
  const rejected = await fetchPath("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://evil.test/callback"] }),
  });
  assert.equal(rejected.status, 400);
  const client = await registerClient('<script>alert("x")</script>');
  const path = authPath(client.client_id);
  const page = await consent(path);
  assert.ok(!page.body.includes("<script>alert"));
  assert.ok(page.body.includes("&lt;script&gt;"));
  assert.ok(page.body.includes("127.0.0.1"));
  assert.ok(page.page.headers.get("set-cookie")?.includes("HttpOnly"));
  assert.ok(page.page.headers.get("set-cookie")?.includes("Secure"));
  assert.ok(page.page.headers.get("content-security-policy")?.includes("default-src 'none'"));
  assert.ok(page.page.headers.get("content-security-policy")?.includes("form-action 'self' http://127.0.0.1:43121"));
  assert.equal((await fetchPath(path.replace("code_challenge_method=S256", "code_challenge_method=plain"))).status, 400);
  assert.equal((await fetchPath(`${path}&state=duplicate`)).status, 400);
});

test("OAuth consent rejects missing cookie, changed request, duplicate form fields, and unauthorized keys", async () => {
  const client = await registerClient();
  const path = authPath(client.client_id);
  const { token, cookie } = await consent(path);
  const body = new URLSearchParams({ csrf: token, api_key: key, decision: "allow" }).toString();
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: cookie };
  assert.equal((await fetchPath(path, { method: "POST", headers: { ...headers, Origin: "null" }, body })).status, 403);
  assert.equal((await fetchPath(path, { method: "POST", headers: { ...headers, Cookie: "" }, body })).status, 403);
  assert.equal((await fetchPath(path.replace("test-state", "changed-state"), { method: "POST", headers, body })).status, 403);
  assert.equal((await fetchPath(path, { method: "POST", headers, body: `${body}&api_key=other` })).status, 400);
  assert.equal(
    (await fetchPath(path, { method: "POST", headers, body: new URLSearchParams({ csrf: token, api_key: deniedKey, decision: "allow" }).toString() })).status,
    403,
  );
});

test("consent failures clear the key and offer a fresh, usable HTML retry", async () => {
  const client = await registerClient();
  const path = authPath(client.client_id);
  const initial = await consent(path);
  assert.match(initial.body, /id="api-key"[^>]*required/);
  assert.match(initial.body, /<button[^>]*formnovalidate[^>]*>Cancel<\/button>/);
  const wrongKey = "never-reflect-this-invalid-key";
  const failed = await readConsentPage(
    await fetchPath(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: initial.cookie },
      body: new URLSearchParams({ csrf: initial.token, api_key: wrongKey, decision: "allow" }).toString(),
    }),
    401,
  );
  assert.ok(!failed.body.includes(wrongKey));
  assert.ok(failed.body.includes('aria-invalid="true"'));
  assert.ok(failed.body.includes('role="alert"'));
  assert.notEqual(failed.token, initial.token);
  const stale = await readConsentPage(
    await fetchPath(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
      body: new URLSearchParams({ csrf: failed.token, api_key: key, decision: "allow" }).toString(),
    }),
    403,
  );
  assert.ok(stale.body.includes('role="alert"'));
  assert.ok(!stale.body.includes(key));
  assert.notEqual(stale.token, failed.token);
  const retry = await fetchPath(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: stale.cookie },
    body: new URLSearchParams({ csrf: stale.token, api_key: key, decision: "allow" }).toString(),
  });
  assert.equal(retry.status, 303);
  const code = new URL(retry.headers.get("location")!).searchParams.get("code")!;
  assert.equal((await exchange(client.client_id, code)).status, 200);
});

test("parallel client consent pages keep independent challenge cookies", async () => {
  const firstClient = await registerClient("First client");
  const secondClient = await registerClient("Second client");
  const firstPath = authPath(firstClient.client_id);
  const secondPath = authPath(secondClient.client_id);
  const first = await consent(firstPath);
  const second = await consent(secondPath);
  assert.notEqual(first.cookie.split("=")[0], second.cookie.split("=")[0]);
  const browserCookies = `${first.cookie}; ${second.cookie}`;
  for (const [path, page, client] of [
    [firstPath, first, firstClient],
    [secondPath, second, secondClient],
  ] as const) {
    const response = await fetchPath(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: browserCookies },
      body: new URLSearchParams({ csrf: page.token, api_key: key, decision: "allow" }).toString(),
    });
    assert.equal(response.status, 303);
    assert.ok(response.headers.get("set-cookie")?.startsWith(`${page.cookie.split("=")[0]}=;`));
    const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
    assert.equal((await exchange(client.client_id, code)).status, 200);
  }
});

test("native OAuth accepts repeated identical resources but rejects conflicting or other duplicate fields", async () => {
  const client = await registerClient("Native duplicate-resource client");
  const resource = encodeURIComponent(`${origin}/mcp`);
  const path = `${authPath(client.client_id)}&resource=${resource}`;
  const page = await consent(path);
  assert.equal((await fetchPath(`${path}&state=test-state`)).status, 400);
  assert.equal((await fetchPath(`${path}&resource=${encodeURIComponent("https://other.test/mcp")}`)).status, 400);
  assert.equal((await fetchPath(path.replaceAll(resource, encodeURIComponent("https://other.test/mcp")))).status, 400);
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, Cookie: page.cookie };
  const body = new URLSearchParams({ csrf: page.token, api_key: key, decision: "allow" }).toString();
  assert.equal((await fetchPath(path.replace("test-state", "changed-state"), { method: "POST", headers, body })).status, 403);
  const allowed = await fetchPath(`${path}&resource=${resource}`, { method: "POST", headers, body });
  assert.equal(allowed.status, 303);
  const code = new URL(allowed.headers.get("location")!).searchParams.get("code")!;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.client_id,
    code,
    code_verifier: verifier,
    redirect_uri: "http://127.0.0.1:43121/callback",
    resource: `${origin}/mcp`,
  });
  tokenBody.append("resource", `${origin}/mcp`);
  const tokenRequest = (body: string) => fetchPath("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  assert.equal((await tokenRequest(`${tokenBody}&resource=${encodeURIComponent("https://other.test/mcp")}`)).status, 400);
  assert.equal((await tokenRequest(`${tokenBody}&code=${code}`)).status, 400);
  const issued = await tokenRequest(tokenBody.toString());
  assert.equal(issued.status, 200);
  const tokens = (await issued.json()) as { access_token: string; refresh_token: string };
  assert.equal((await mcpCall("b2c_catalog", { limit: 1 }, tokens.access_token)).status, 200);
  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: client.client_id,
    refresh_token: tokens.refresh_token,
    scope: "b2c:read",
    resource: `${origin}/mcp`,
  });
  refreshBody.append("resource", `${origin}/mcp`);
  assert.equal((await tokenRequest(`${refreshBody}&scope=b2c%3Aread`)).status, 400);
  assert.equal((await tokenRequest(`${refreshBody}&resource=${encodeURIComponent("https://other.test/mcp")}`)).status, 400);
  const refreshed = await tokenRequest(refreshBody.toString());
  assert.equal(refreshed.status, 200);
  const current = (await refreshed.json()) as { access_token: string };
  assert.equal((await mcpCall("b2c_catalog", { limit: 1 }, current.access_token)).status, 200);
  assert.equal((await fetchPath("/api/v1/catalog?limit=1&limit=1", { headers: authorization })).status, 400);
});

test("OAuth code flow, exact audience, refresh, and key revocation are enforced by workerd", async () => {
  const rotationKey = `b2c_${"f".repeat(43)}`;
  await seedAccountInto(database, {
    accountId: "acct_rotation",
    userId: "user_rotation",
    googleSub: "google_rotation",
    email: "rotation@example.com",
    stripeCustomerId: "cus_rotation",
    keyId: "rotation-1",
    keyDigest: await sha256(rotationKey),
  });
  const client = await registerClient();
  const code = await authorize(client.client_id, rotationKey);
  assert.equal((await exchange(client.client_id, code, { code_verifier: "wrong".repeat(10) })).status, 400);
  assert.equal((await exchange(client.client_id, code, { resource: "https://other.test/mcp" })).status, 400);
  assert.equal((await exchange(client.client_id, code, { redirect_uri: "http://127.0.0.1:43121/other" })).status, 400);
  assert.equal((await exchange("unknown-client", code)).status, 401);
  const tokenResponse = await exchange(client.client_id, code);
  assert.equal(tokenResponse.status, 200);
  const tokens = (await tokenResponse.json()) as { access_token: string; refresh_token: string; scope: string };
  assert.equal(tokens.scope, "b2c:read");
  assert.equal((await mcpCall("b2c_catalog", { limit: 1 }, tokens.access_token)).status, 200);
  assert.equal((await fetchPath("/api/v1/catalog", { headers: { Authorization: `Bearer ${tokens.access_token}` } })).status, 401);
  const noScope = await fetchPath("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: tokens.refresh_token, scope: "" }).toString(),
  });
  assert.equal(noScope.status, 400);
  assert.equal(((await noScope.json()) as { error: string }).error, "invalid_scope");
  const refreshed = await fetchPath("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      scope: "b2c:read",
      resource: `${origin}/mcp`,
    }).toString(),
  });
  assert.equal(refreshed.status, 200);
  const current = (await refreshed.json()) as { access_token: string; refresh_token: string };
  assert.equal((await mcpCall("b2c_catalog", { limit: 1 }, current.access_token)).status, 200);
  await revokeSeedKey(database, "rotation-1");
  assert.equal((await mcpCall("b2c_catalog", {}, current.access_token)).status, 403);
  const refreshDenied = await fetchPath("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: current.refresh_token }).toString(),
  });
  assert.equal(refreshDenied.status, 400);
  assert.equal(((await refreshDenied.json()) as { error: string }).error, "invalid_grant");
});

test("authorization-code replay fails and native rate limits reject excess requests", async () => {
  const client = await registerClient();
  const code = await authorize(client.client_id);
  assert.equal((await exchange(client.client_id, code)).status, 200);
  assert.equal((await exchange(client.client_id, code)).status, 400);
  const limited = new Miniflare(
    convertV4MiniflareOptions({
      ...options,
      ratelimits: {
        INGRESS_LIMITER: { namespace_id: "999003", simple: { limit: 10, period: 60 } },
        AUTH_LIMITER: { namespace_id: "999001", simple: { limit: 1, period: 60 } },
        API_LIMITER: { namespace_id: "999002", simple: { limit: 1, period: 60 } },
      },
    }),
  );
  try {
    await limited.ready;
    await seedWorker(limited);
    // Native RateLimit.limit is permissive and eventually consistent: each isolate
    // checks a local cache and publishes the increment asynchronously
    // (https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
    // Drain each body before the next fetch so the first catalog response cannot
    // overlap the next limit() call on another isolate.
    const headers = { ...authorization, "CF-Connecting-IP": "198.51.100.64" };
    const first = await limited.dispatchFetch(`${origin}/api/v1/catalog`, { headers });
    assert.equal(first.status, 200);
    await first.arrayBuffer();
    let blocked: Awaited<ReturnType<Miniflare["dispatchFetch"]>> | undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await limited.dispatchFetch(`${origin}/api/v1/catalog`, { headers: { ...headers, Origin: origin } });
      if (response.status === 429) {
        blocked = response;
        break;
      }
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    assert.equal(blocked?.status, 429);
    assert.equal(blocked?.headers.get("retry-after"), "60");
    assert.equal(blocked?.headers.get("access-control-allow-origin"), origin);
    assert.ok(blocked?.headers.get("access-control-expose-headers")?.includes("Retry-After"));
  } finally {
    await limited.dispose();
  }
});

test("public health, index, and every preflight consume the ingress budget", async () => {
  const limited = new Miniflare(
    convertV4MiniflareOptions({
      ...options,
      ratelimits: {
        INGRESS_LIMITER: { namespace_id: "998003", simple: { limit: 1, period: 60 } },
        AUTH_LIMITER: { namespace_id: "998001", simple: { limit: 1000, period: 60 } },
        API_LIMITER: { namespace_id: "998002", simple: { limit: 1000, period: 60 } },
      },
    }),
  );
  try {
    const cases = [
      ["/", "GET", 200],
      ["/health", "GET", 200],
      ["/mcp", "OPTIONS", 204],
      ["/api/v1/catalog", "OPTIONS", 204],
      ["/.well-known/oauth-authorization-server", "OPTIONS", 204],
    ] as const;
    for (const [index, [path, method, status]] of cases.entries()) {
      const headers = { Origin: origin, "CF-Connecting-IP": `192.0.2.${index + 1}` };
      assert.equal((await limited.dispatchFetch(`${origin}${path}`, { method, headers })).status, status, path);
      const blocked = await limited.dispatchFetch(`${origin}${path}`, { method, headers });
      assert.equal(blocked.status, 429, path);
      assert.equal(blocked.headers.get("retry-after"), "60");
      assert.equal(blocked.headers.get("access-control-allow-origin"), origin);
    }
    for (let index = 0; index < 3; index++) assert.equal((await limited.dispatchFetch(`${origin}/.well-known/oauth-authorization-server`)).status, 200);
  } finally {
    await limited.dispose();
  }
});

test("browser consent rate and service failures have safe HTML recovery without changing machine errors", async () => {
  const path = "/oauth/authorize?client_id=do-not-reflect&state=private-request-value&redirect_uri=https%3A%2F%2Funtrusted.example%2Fcallback";
  const limited = new Miniflare(
    convertV4MiniflareOptions({
      ...options,
      ratelimits: {
        INGRESS_LIMITER: { namespace_id: "997003", simple: { limit: 1, period: 60 } },
        AUTH_LIMITER: { namespace_id: "997001", simple: { limit: 1000, period: 60 } },
        API_LIMITER: { namespace_id: "997002", simple: { limit: 1000, period: 60 } },
      },
    }),
  );
  const assertRecovery = async (response: Awaited<ReturnType<Miniflare["dispatchFetch"]>>, status: number) => {
    assert.equal(response.status, status);
    assert.ok(response.headers.get("content-type")?.startsWith("text/html"));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "same-origin");
    assert.ok(response.headers.get("content-security-policy")?.includes("default-src 'none'"));
    const body = await response.text();
    // The recovery PAGE carries the console brand, which the founder-voice pass moved to
    // "Clueless Creations"; the machine "service" name in http.ts/worker.ts is deliberately
    // still "B2C App Builder". This assertion is the HTML half, per this test's own name.
    assert.ok(body.includes("Clueless Creations"));
    assert.ok(/retry|try again|restart|reload|refresh/i.test(body));
    for (const value of ["do-not-reflect", "private-request-value", "untrusted.example", "<form", "<script", key]) assert.ok(!body.includes(value));
  };
  try {
    for (const [index, method] of ["GET", "POST"].entries()) {
      const headers = { Accept: "text/html", "CF-Connecting-IP": `192.0.2.${index + 30}` };
      assert.equal((await limited.dispatchFetch(`${origin}/health`, { headers })).status, 200);
      const blocked = await limited.dispatchFetch(`${origin}${path}`, { method, headers });
      assert.equal(blocked.headers.get("retry-after"), "60");
      await assertRecovery(blocked, 429);
    }
    const headers = { "CF-Connecting-IP": "192.0.2.30" };
    const machine = await limited.dispatchFetch(`${origin}${path}`, { headers });
    assert.equal(machine.status, 429);
    assert.ok(machine.headers.get("content-type")?.startsWith("application/json"));
  } finally {
    await limited.dispose();
  }
  for (const [bindings, status] of [
    [{ B2C_APP_BUILDER_AUTH_SECRET: "invalid-private-secret" }, 503],
    [{ B2C_APP_BUILDER_TRUSTED_REDIRECTS: "[]" }, 503],
    [{ B2C_APP_BUILDER_PUBLIC_ORIGIN: "invalid-private-origin" }, 500],
  ] as const) {
    const unavailable = new Miniflare(convertV4MiniflareOptions({ ...options, bindings: { ...options.bindings, ...bindings } }));
    try {
      for (const method of ["GET", "POST"]) {
        await assertRecovery(await unavailable.dispatchFetch(`${origin}${path}`, { method, headers: { Accept: "text/html" } }), status);
      }
      for (const endpoint of ["/api/v1/catalog", "/mcp"]) {
        const machine = await unavailable.dispatchFetch(`${origin}${endpoint}`, { headers: { Accept: "text/html" } });
        assert.equal(machine.status, status);
        assert.ok(machine.headers.get("content-type")?.startsWith("application/json"));
        assert.ok(!(await machine.text()).includes("invalid-private"));
      }
    } finally {
      await unavailable.dispose();
    }
  }
});

test("CIMD is advertised and an unresolvable client metadata document is a sanitized client error", async () => {
  const metadata = (await (await fetchPath("/.well-known/oauth-authorization-server")).json()) as {
    client_id_metadata_document_supported: boolean;
    token_endpoint_auth_methods_supported: string[];
  };
  // Claude selects CIMD only when both are advertised; either one missing silently falls back to DCR.
  assert.equal(metadata.client_id_metadata_document_supported, true);
  assert.ok(metadata.token_endpoint_auth_methods_supported.includes("none"));

  // A URL-formatted client_id whose document cannot be fetched must not surface as a 500:
  // that misreports the cause and makes authorize a probe for reachable hosts.
  const unresolvable = `${origin}/oauth/authorize?${new URLSearchParams({
    client_id: "https://cimd-does-not-resolve.invalid/client.json",
    redirect_uri: "http://127.0.0.1:43121/callback",
    response_type: "code",
    scope: "b2c:read",
    state: "cimd-private-state",
    code_challenge: "a".repeat(43),
    code_challenge_method: "S256",
    resource: `${origin}/mcp`,
  })}`;
  const response = await mf.dispatchFetch(unresolvable, { redirect: "manual" });
  assert.equal(response.status, 400);
  const body = await response.text();
  assert.ok(!body.includes("cimd-private-state"));
  assert.ok(!body.includes("cimd-does-not-resolve"));
});
