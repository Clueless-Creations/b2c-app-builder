import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// The provider imports this runtime base class; all OAuth and KV behavior stays real.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export class WorkerEntrypoint {}", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { default: worker } = await import("../worker.js");
const origin = "https://b2c.test";
const authorizationUrl = `${origin}/oauth/authorize?${new URLSearchParams({
  client_id: "registered-client",
  redirect_uri: "http://127.0.0.1:43121/callback",
  response_type: "code",
  scope: "b2c:read",
  state: "private-state",
  code_challenge: "a".repeat(43),
  code_challenge_method: "S256",
  resource: `${origin}/mcp`,
})}`;

async function environment(get: () => Promise<null>) {
  const limiter = { limit: async () => ({ success: true }) };
  return {
    B2C_APP_BUILDER_PUBLIC_ORIGIN: origin,
    B2C_APP_BUILDER_TRUSTED_REDIRECTS: [],
    B2C_APP_BUILDER_ALLOWED_ORIGINS: [],
    B2C_APP_BUILDER_AUTH_SECRET: "c".repeat(43),
    OAUTH_KV: { get },
    INGRESS_LIMITER: limiter,
    AUTH_LIMITER: limiter,
    API_LIMITER: limiter,
  } as unknown as Env;
}
const context = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

test("OAuth KV failures retain sanitized service recovery for browsers and machines", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected external request");
  });
  const env = await environment(async () => {
    throw new Error("private-provider-detail");
  });
  for (const accept of ["text/html", "application/json"]) {
    const response = await worker.fetch(new Request(authorizationUrl, { headers: { Accept: accept } }), env, context);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    for (const privateValue of ["private-provider-detail", "private-state", "registered-client"]) assert.ok(!body.includes(privateValue));
    if (accept === "text/html") {
      assert.ok(response.headers.get("content-type")?.startsWith("text/html"));
      assert.ok(body.includes("Hosted access is unavailable."));
      assert.ok(body.includes("Clueless Creations"));
      assert.ok(!body.includes("B2C App Builder is unavailable."));
    } else assert.deepEqual(JSON.parse(body), { error: "internal_error" });
  }
});

test("OAuth invalid clients and malformed requests remain sanitized client errors", async () => {
  const env = await environment(async () => null);
  for (const url of [authorizationUrl, `${origin}/oauth/authorize?client_id=private-client`]) {
    const response = await worker.fetch(new Request(url, { headers: { Accept: "text/html" } }), env, context);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_request" });
  }
});
