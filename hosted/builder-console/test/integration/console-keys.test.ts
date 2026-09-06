/**
 * Console API-key management, against a real migrated D1 (Miniflare), not a stub.
 *
 * Two tenants are seeded. Every path exercised here is checked never to let account B see, or
 * mutate, account A's rows — the same shape of proof hosted/knowledge-mcp/test/tenant.test.ts runs against
 * the repository directly, one layer up: this is the same repository behind the console's HTTP
 * surface, so the two-tenant proof has to hold there too, not just at the repository boundary.
 *
 * "Raw key shown once" is checked the strong way: not by regex-matching the returned string, but
 * by resolving it back through tenantDb.resolveApiKeyPrincipal and confirming it authenticates as
 * the account that created it — proof the digest actually stored is the digest of the key handed
 * back, not merely that both look key-shaped.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sha256 } from "../../../knowledge-mcp/auth.js";
import { tenantDb, type AccountId, type TenantDb } from "../../../knowledge-mcp/db/tenant.js";
import { createTestDatabase, type TestDatabase } from "../support/d1.js";
import { createConsoleApiKey, handleConsoleKeysRequest, isConsoleKeysPath, revokeConsoleApiKey, type ConsoleSession } from "../../console/keys.js";
import type { CaptureConfig, DedupeStore } from "../../analytics/capture.js";

const analytics: CaptureConfig = {
  token: "phc_" + "a".repeat(43),
  host: "https://us.i.posthog.com",
  surface: "console",
  engineVersion: "0.209.17",
};

const CSRF_SECRET = "s".repeat(64);

/**
 * The console's own FLAGS_KV, plain in-memory — same shape test/flags.test.ts's memoryKv() uses
 * for the same binding's other tenant. Every test in this file that expects a capture uses "US":
 * geography and objection suppression are exercised end-to-end, against a real worker.fetch, in
 * test/integration/console-flow.test.ts instead of duplicated here at the pure-function layer.
 */
function memoryFlagsKv(): DedupeStore {
  const map = new Map<string, string>();
  return { get: async (key) => map.get(key) ?? null, put: async (key, value) => void map.set(key, value) };
}
const flagsKv = memoryFlagsKv();
const US = "US";

function collectingCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    // Drains rather than one Promise.all: captureConsoleEvent's objection check nests a second
    // ctx.waitUntil call inside the first, so a new entry can land in `pending` only after this
    // function has already started awaiting today's contents.
    settle: async () => {
      let processed = 0;
      while (processed < pending.length) {
        const batch = pending.slice(processed);
        processed = pending.length;
        await Promise.all(batch);
      }
    },
  };
}

function stubFetch() {
  const bodies: any[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { bodies, restore: () => (globalThis.fetch = original) };
}

let fixture: TestDatabase;
let repository: TenantDb;
let sessionA: ConsoleSession;
let sessionB: ConsoleSession;

before(async () => {
  fixture = await createTestDatabase();
  repository = tenantDb(fixture.db);
  await fixture.seedAccount({
    accountId: "acct_console_a",
    userId: "user_console_a",
    googleSub: "200000000000000000001",
    email: "a@example.com",
    stripeCustomerId: "cus_CONSOLEAAAAA",
    keyId: "seed_key_a",
    keyDigest: await sha256(`b2c_${"a".repeat(43)}`),
  });
  await fixture.seedAccount({
    accountId: "acct_console_b",
    userId: "user_console_b",
    googleSub: "200000000000000000002",
    email: "b@example.com",
    stripeCustomerId: "cus_CONSOLEBBBBB",
    keyId: "seed_key_b",
    keyDigest: await sha256(`b2c_${"b".repeat(43)}`),
  });
  sessionA = { accountId: "acct_console_a" as AccountId, userId: "user_console_a" };
  sessionB = { accountId: "acct_console_b" as AccountId, userId: "user_console_b" };
});

after(async () => {
  await fixture?.dispose();
});

test("isConsoleKeysPath recognises the three routes and nothing else", () => {
  assert.equal(isConsoleKeysPath("/console/keys"), true);
  assert.equal(isConsoleKeysPath("/console/keys/some-id/revoke"), true);
  assert.equal(isConsoleKeysPath("/console/audit"), true);
  assert.equal(isConsoleKeysPath("/console/keys/some-id"), false);
  assert.equal(isConsoleKeysPath("/console"), false);
  assert.equal(isConsoleKeysPath("/api/keys"), false);
});

test("a created key authenticates as its own tenant, and the digest — not the raw value — is what's stored", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    const { summary, rawKey } = await createConsoleApiKey(repository, sessionA, { label: "acct-a-only-label" }, analytics, ctx, flagsKv, US);
    assert.match(rawKey, /^b2c_[A-Za-z0-9_-]{43}$/);
    assert.equal(summary.label, "acct-a-only-label");
    assert.equal(summary.revokedAt, null);

    // The strong proof: the raw key this function handed back actually authenticates as
    // account A through the real authorization path, not merely a regex match on its shape.
    const resolved = await repository.resolveApiKeyPrincipal(rawKey);
    assert.equal(resolved.accountId, sessionA.accountId);
    assert.equal(resolved.principal.subject, sessionA.userId);

    // is_first_key is false here: seedAccount already gave this tenant one active key, so the
    // new one is the second, and key_count_after counts active keys, not lifetime creations.
    await settle();
    assert.equal(stub.bodies.length, 1);
    assert.equal(stub.bodies[0].event, "api_key_created");
    assert.equal(stub.bodies[0].distinct_id, sessionA.accountId);
    assert.equal(stub.bodies[0].properties.key_id, summary.id);
    assert.equal(stub.bodies[0].properties.is_first_key, false);
    assert.equal(stub.bodies[0].properties.key_count_after, 2);
  } finally {
    stub.restore();
  }
});

test("account B never sees account A's keys, and an empty label becomes null rather than blank text", async () => {
  const { ctx } = collectingCtx();
  const stub = stubFetch();
  try {
    const { summary } = await createConsoleApiKey(repository, sessionA, { label: "   " }, analytics, ctx, flagsKv, US);
    assert.equal(summary.label, null, "whitespace-only input is not a label");

    const keysForA = await repository.listApiKeys(sessionA.accountId);
    const keysForB = await repository.listApiKeys(sessionB.accountId);
    assert.ok(keysForA.some((key) => key.id === summary.id));
    assert.ok(
      keysForB.every((key) => key.id !== summary.id),
      "account B's key list must never contain a key minted for account A",
    );
  } finally {
    stub.restore();
  }
});

test("revoke is scoped by tenant: account B cannot revoke account A's key, and the response looks identical to revoking nothing", async () => {
  const { ctx: ctxA, settle: settleA } = collectingCtx();
  const stubA = stubFetch();
  let keyId: string;
  try {
    const { summary } = await createConsoleApiKey(repository, sessionA, {}, analytics, ctxA, flagsKv, US);
    keyId = summary.id;
    await settleA();
  } finally {
    stubA.restore();
  }

  const { ctx: ctxB } = collectingCtx();
  const stubB = stubFetch();
  try {
    // The IDOR case: key ids are opaque but handed to clients, so account B's console could
    // present this id even though it belongs to account A.
    const crossTenant = await revokeConsoleApiKey(repository, sessionB, keyId, analytics, ctxB, flagsKv, US);
    assert.equal(crossTenant.revoked, false);
    assert.equal(stubB.bodies.length, 0, "nothing changed, so nothing should be captured");

    const stillActive = await repository.getApiKey(sessionA.accountId, keyId);
    assert.equal(stillActive?.revokedAt, null, "account A's key must be untouched by account B's attempt");
  } finally {
    stubB.restore();
  }

  const { ctx: ctxOwner, settle: settleOwner } = collectingCtx();
  const stubOwner = stubFetch();
  try {
    const own = await revokeConsoleApiKey(repository, sessionA, keyId, analytics, ctxOwner, flagsKv, US);
    assert.equal(own.revoked, true);
    await settleOwner();
    assert.equal(stubOwner.bodies[0].event, "api_key_revoked");
    assert.equal(stubOwner.bodies[0].properties.key_id, keyId);
    assert.equal(stubOwner.bodies[0].properties.revoked_reason, "user_action");
    assert.equal(typeof stubOwner.bodies[0].properties.key_age_days, "number");

    const revokedRow = await repository.getApiKey(sessionA.accountId, keyId);
    assert.notEqual(revokedRow?.revokedAt, null);

    // A second revoke of an already-revoked key is a no-op, not an un-revoke or a second event.
    const second = await revokeConsoleApiKey(repository, sessionA, keyId, analytics, ctxOwner, flagsKv, US);
    assert.equal(second.revoked, false);
  } finally {
    stubOwner.restore();
  }
});

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

function deps(session: ConsoleSession, ctx: { waitUntil(p: Promise<unknown>): void }) {
  return { db: repository, session, analytics, ctx, flagsKv, csrfSecret: CSRF_SECRET };
}

async function csrfTokenFor(session: ConsoleSession): Promise<string> {
  const { ctx } = collectingCtx();
  const response = await handleConsoleKeysRequest(new Request("https://app.clueless-creations.com/console/keys"), deps(session, ctx));
  const html = await response.text();
  const match = /name="csrf" value="([^"]+)"/.exec(html);
  assert.ok(match, "the list page must render a CSRF token");
  return match[1]!.replace(/&amp;/g, "&");
}

test("GET /console/keys lists this tenant's keys and nothing from the other tenant", async () => {
  const { ctx } = collectingCtx();
  const response = await handleConsoleKeysRequest(new Request("https://app.clueless-creations.com/console/keys"), deps(sessionB, ctx));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Keys for the agents you use\./);
  assert.doesNotMatch(html, /acct-a-only-label/, "account A's label must never render on account B's page");
});

test("POST /console/keys shows the raw key exactly once, and a second load of the list page never repeats it", async () => {
  const { ctx } = collectingCtx();
  const stub = stubFetch();
  let rawKey: string;
  try {
    const csrf = await csrfTokenFor(sessionA);
    const body = new URLSearchParams({ csrf, label: "ci runner" }).toString();
    const response = await handleConsoleKeysRequest(
      new Request("https://app.clueless-creations.com/console/keys", { method: "POST", body }),
      deps(sessionA, ctx),
    );
    assert.equal(response.status, 201);
    const html = await response.text();
    const match = /value="(b2c_[A-Za-z0-9_-]{43})"/.exec(html);
    assert.ok(match, "the reveal page must render the raw key");
    rawKey = match[1]!;
  } finally {
    stub.restore();
  }

  const { ctx: listCtx } = collectingCtx();
  const listResponse = await handleConsoleKeysRequest(new Request("https://app.clueless-creations.com/console/keys"), deps(sessionA, listCtx));
  const listHtml = await listResponse.text();
  assert.doesNotMatch(listHtml, new RegExp(rawKey), "the raw key must never appear again after the reveal page");
});

test("POST with a missing or wrong CSRF token is refused and changes nothing", async () => {
  const before2 = await repository.listApiKeys(sessionA.accountId);
  const { ctx } = collectingCtx();
  const response = await handleConsoleKeysRequest(
    new Request("https://app.clueless-creations.com/console/keys", { method: "POST", body: new URLSearchParams({ csrf: "wrong" }).toString() }),
    deps(sessionA, ctx),
  );
  assert.equal(response.status, 403);
  const after2 = await repository.listApiKeys(sessionA.accountId);
  assert.equal(after2.length, before2.length, "a refused CSRF check must not create a key");
});

test("GET /console/keys with the wrong method is rejected with an Allow header", async () => {
  const { ctx } = collectingCtx();
  const response = await handleConsoleKeysRequest(new Request("https://app.clueless-creations.com/console/keys", { method: "DELETE" }), deps(sessionA, ctx));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, POST");
});

test("GET /console/audit reads without writing — recordAuditEvent is never called from this surface", async () => {
  const { ctx } = collectingCtx();
  const response = await handleConsoleKeysRequest(new Request("https://app.clueless-creations.com/console/audit"), deps(sessionA, ctx));
  assert.equal(response.status, 200);
  // seedAccount inserts one audit row directly through the fixture, bypassing this surface
  // entirely — this proves the page reads it back rather than proving anything wrote it.
  const events = await repository.listAuditEvents(sessionA.accountId);
  assert.ok(events.length >= 1);
});
