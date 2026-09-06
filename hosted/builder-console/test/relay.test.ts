import assert from "node:assert/strict";
import { test } from "node:test";
import { API_HOST, ASSET_HOST, handleRelay, isRelayPath } from "../analytics/relay.js";

function stubFetch(response = new Response("ok", { status: 200 })) {
  const calls: Request[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    calls.push(input as Request);
    return response.clone();
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("recognises only its own prefix", () => {
  assert.equal(isRelayPath("/relay"), true);
  assert.equal(isRelayPath("/relay/i/v0/e"), true);
  assert.equal(isRelayPath("/relayed"), false);
  assert.equal(isRelayPath("/console"), false);
});

test("the session cookie never leaves our origin", async () => {
  const stub = stubFetch();
  try {
    await handleRelay(
      new Request("https://app.clueless-creations.com/relay/i/v0/e", {
        method: "POST",
        headers: { cookie: "__Host-session=super-secret", authorization: "Bearer abc", "content-type": "application/json" },
        body: "{}",
      }),
    );
    const forwarded = stub.calls[0]!;
    // __Host- cookies are Path=/, so the browser attaches them here. Forwarding would leak them.
    assert.equal(forwarded.headers.get("cookie"), null);
    assert.equal(forwarded.headers.get("authorization"), null);
    // Our own origin must never travel upstream as Host; the runtime derives it from the target.
    assert.notEqual(forwarded.headers.get("host"), "app.clueless-creations.com");
    assert.equal(forwarded.headers.get("content-type"), "application/json");
  } finally {
    stub.restore();
  }
});

test("ingestion goes to the API host and the prefix is stripped", async () => {
  const stub = stubFetch();
  try {
    await handleRelay(new Request("https://app.clueless-creations.com/relay/i/v0/e?ver=1", { method: "POST", body: "{}" }));
    assert.equal(stub.calls[0]!.url, `https://${API_HOST}/i/v0/e?ver=1`);
  } finally {
    stub.restore();
  }
});

test("SDK bundles go to the asset host and are cached", async () => {
  const stub = stubFetch();
  try {
    const response = await handleRelay(new Request("https://app.clueless-creations.com/relay/static/array.js"));
    assert.equal(stub.calls[0]!.url, `https://${ASSET_HOST}/static/array.js`);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=86400");
  } finally {
    stub.restore();
  }
});

test("PostHog cannot set cookies on our registrable domain", async () => {
  const stub = stubFetch(new Response("ok", { status: 200, headers: { "set-cookie": "ph_id=1; Domain=.clueless-creations.com" } }));
  try {
    const response = await handleRelay(new Request("https://app.clueless-creations.com/relay/i/v0/e", { method: "POST", body: "{}" }));
    assert.equal(response.headers.get("set-cookie"), null);
  } finally {
    stub.restore();
  }
});

test("non-relay paths and disallowed methods are refused", async () => {
  assert.equal((await handleRelay(new Request("https://app.clueless-creations.com/console"))).status, 404);
  assert.equal((await handleRelay(new Request("https://app.clueless-creations.com/relay/i/v0/e", { method: "DELETE" }))).status, 405);
});

test("an upstream outage degrades to 204, never a console error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("posthog unreachable");
  }) as typeof fetch;
  try {
    assert.equal((await handleRelay(new Request("https://app.clueless-creations.com/relay/i/v0/e", { method: "POST", body: "{}" }))).status, 204);
  } finally {
    globalThis.fetch = original;
  }
});
