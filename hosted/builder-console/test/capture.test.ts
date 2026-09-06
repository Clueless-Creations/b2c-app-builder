import assert from "node:assert/strict";
import { test } from "node:test";
import { capture, firstSeenToday, isAnalyticsSuppressed, utcDay, type CaptureConfig, type DedupeStore } from "../analytics/capture.js";
import { EVENTS } from "../analytics/events.js";

const config: CaptureConfig = {
  token: "phc_" + "a".repeat(43),
  host: "https://us.i.posthog.com",
  surface: "console",
  engineVersion: "0.209.17",
};

function stubFetch(): { calls: { url: string; body: any }[]; restore(): void } {
  const calls: { url: string; body: any }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    calls.push({ url: String(input), body: JSON.parse(init.body) });
    return new Response('{"status":"Ok"}', { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("posts to the single-event endpoint with super properties attached", async () => {
  const stub = stubFetch();
  try {
    const result = await capture(config, {
      distinctId: "acct_1",
      event: EVENTS.upgradeIntentClicked,
      authState: "authenticated",
      properties: { surface_location: "console_plans", checkout_available: false },
    });
    assert.equal(result.ok, true);
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0]!.url, "https://us.i.posthog.com/i/v0/e");
    const body = stub.calls[0]!.body;
    assert.equal(body.api_key, config.token);
    assert.equal(body.distinct_id, "acct_1");
    assert.equal(body.event, "upgrade_intent_clicked");
    assert.equal(body.properties.surface, "console");
    assert.equal(body.properties.engine_version, "0.209.17");
    assert.equal(body.properties.auth_state, "authenticated");
  } finally {
    stub.restore();
  }
});

test("secret-shaped properties never reach the wire, but the event still ships", async () => {
  const stub = stubFetch();
  try {
    const result = await capture(config, {
      distinctId: "acct_1",
      event: EVENTS.apiKeyCreated,
      authState: "authenticated",
      properties: { key_id: "k_1", is_first_key: true, api_key: "b2c_" + "Z".repeat(43) },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.dropped : [], ["api_key"]);
    const props = stub.calls[0]!.body.properties;
    assert.equal(props.key_id, "k_1");
    assert.equal("api_key" in props, false);
    assert.equal(JSON.stringify(props).includes("b2c_"), false);
  } finally {
    stub.restore();
  }
});

test("person properties are split into $set and $set_once", async () => {
  const stub = stubFetch();
  try {
    await capture(config, {
      distinctId: "acct_1",
      event: EVENTS.interestSubmitted,
      authState: "authenticated",
      set: { email: "person@example.com" },
      setOnce: { initial_referrer: "https://news.ycombinator.com/" },
    });
    const props = stub.calls[0]!.body.properties;
    assert.equal(props.$set.email, "person@example.com");
    assert.equal(props.$set_once.initial_referrer, "https://news.ycombinator.com/");
  } finally {
    stub.restore();
  }
});

test("a malformed token short-circuits before any network call", async () => {
  const stub = stubFetch();
  try {
    const result = await capture(
      { ...config, token: "not-a-token" },
      {
        distinctId: "acct_1",
        event: EVENTS.landingViewed,
        authState: "anonymous",
      },
    );
    assert.deepEqual(result, { ok: false, reason: "config", dropped: [] });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test("a network failure is reported, never thrown into the request path", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("upstream down");
  }) as typeof fetch;
  try {
    const result = await capture(config, { distinctId: "acct_1", event: EVENTS.landingViewed, authState: "anonymous" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "network");
  } finally {
    globalThis.fetch = original;
  }
});

test("distinct_id is truncated to the server's 200-character limit", async () => {
  const stub = stubFetch();
  try {
    await capture(config, { distinctId: "z".repeat(300), event: EVENTS.landingViewed, authState: "anonymous" });
    assert.equal(stub.calls[0]!.body.distinct_id.length, 200);
  } finally {
    stub.restore();
  }
});

function memoryStore(): DedupeStore & { size(): number } {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    put: async (key, value) => void map.set(key, value),
    size: () => map.size,
  };
}

test("a subject is first-seen once per UTC day", async () => {
  const store = memoryStore();
  const day1 = new Date("2026-09-01T10:00:00Z");
  assert.equal(await firstSeenToday(store, "mcp", "subject-a", day1), true);
  assert.equal(await firstSeenToday(store, "mcp", "subject-a", day1), false);
  assert.equal(await firstSeenToday(store, "mcp", "subject-b", day1), true);
  assert.equal(await firstSeenToday(store, "mcp", "subject-a", new Date("2026-09-02T00:00:01Z")), true);
});

test("dedupe fails open — a KV outage duplicates events rather than dropping requests", async () => {
  const broken: DedupeStore = {
    get: async () => {
      throw new Error("kv unavailable");
    },
    put: async () => undefined,
  };
  assert.equal(await firstSeenToday(broken, "mcp", "subject-a"), true);
  assert.equal(await firstSeenToday(broken, "mcp", "subject-a"), true);
});

test("utcDay is a stable UTC date key", () => {
  assert.equal(utcDay(new Date("2026-09-01T23:59:59Z")), "2026-09-01");
});

test("a subject who has objected is suppressed", async () => {
  const store = memoryStore();
  assert.equal(await isAnalyticsSuppressed(store, "subject-a"), false);
  await store.put("analytics:optout:subject-a", "1");
  assert.equal(await isAnalyticsSuppressed(store, "subject-a"), true);
  // Objection is per subject, not global.
  assert.equal(await isAnalyticsSuppressed(store, "subject-b"), false);
});

test("suppression fails CLOSED, opposite to the dedupe", async () => {
  const broken: DedupeStore = {
    get: async () => {
      throw new Error("kv unavailable");
    },
    put: async () => undefined,
  };
  // We cannot prove the subject has not objected, so we do not capture. A suppression that
  // lapses during an outage is a broken promise; missing analytics is missing analytics.
  assert.equal(await isAnalyticsSuppressed(broken, "subject-a"), true);
  // The dedupe deliberately fails the other way — duplicates beat dropped requests.
  assert.equal(await firstSeenToday(broken, "mcp", "subject-a"), true);
});
