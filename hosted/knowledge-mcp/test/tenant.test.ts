/**
 * Tenant-isolation canary.
 *
 * Two accounts are seeded with identical shapes. Every repository path account A can reach
 * is then exercised and asserted never to return or mutate account B's rows. The revoke
 * paths matter most: a revoke that trusted a client-supplied id would be a direct IDOR,
 * and it is the one failure the type system cannot catch, because the id is a plain string
 * that legitimately arrives from a request.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { AccessError, sha256 } from "../auth.js";
import { ENTITLEMENT_STALENESS_CEILING_MS, tenantDb, type AccountId, type TenantDb } from "../db/tenant.js";
import { createTestDatabase, splitStatements, verifyMigration0008RebuildSurvival, type TestDatabase, SEED_STAMP } from "./support/d1.js";
import { resolveApiKeyAccess } from "../access.js";

const keyA = `b2c_${"a".repeat(43)}`;
const keyB = `b2c_${"b".repeat(43)}`;
const sessionTokenA = "a".repeat(43);
const sessionTokenB = "b".repeat(43);

let fixture: TestDatabase;
let repository: TenantDb;
let accountA: AccountId;
let accountB: AccountId;
let sessionIdA: string;
let sessionIdB: string;

before(async () => {
  fixture = await createTestDatabase();
  repository = tenantDb(fixture.db);
  sessionIdA = await sha256(sessionTokenA);
  sessionIdB = await sha256(sessionTokenB);
  await fixture.seedAccount({
    accountId: "acct_a",
    userId: "user_a",
    googleSub: "100000000000000000001",
    email: "a@example.com",
    stripeCustomerId: "cus_AAAAAAAAAAAA",
    keyId: "key_a",
    keyDigest: await sha256(keyA),
    sessionId: sessionIdA,
  });
  await fixture.seedAccount({
    accountId: "acct_b",
    userId: "user_b",
    googleSub: "100000000000000000002",
    email: "b@example.com",
    stripeCustomerId: "cus_BBBBBBBBBBBB",
    keyId: "key_b",
    keyDigest: await sha256(keyB),
    sessionId: sessionIdB,
  });
  // Both resolutions must succeed before any isolation claim means anything.
  accountA = (await repository.resolveApiKeyPrincipal(keyA)).accountId;
  accountB = (await repository.resolveApiKeyPrincipal(keyB)).accountId;
  assert.notEqual(accountA, accountB);
});

after(async () => {
  await fixture?.dispose();
});

test("a presented key resolves to its own tenant and to the strict OAuth principal shape", async () => {
  const resolved = await repository.resolveApiKeyPrincipal(keyA);
  assert.equal(resolved.accountId, "acct_a");
  // oauth.ts stores this object verbatim as grant props, and auth.ts parses it with a
  // strict schema. An extra field here would break every existing OAuth grant.
  assert.deepEqual(Object.keys(resolved.principal).sort(), ["credentialSha256", "keyId", "scopes", "subject"]);
  assert.equal(resolved.principal.subject, "user_a");
  assert.equal(resolved.principal.keyId, "key_a");
  assert.deepEqual(resolved.principal.scopes, ["b2c:read"]);
  assert.equal((await repository.resolveApiKeyPrincipal(keyB)).accountId, "acct_b");
});

test("key resolution keeps the 401 and 403 split from the secret-backed policy", async () => {
  // auth.ts:88 shape failure and auth.ts:94 unmatched digest are both 401.
  for (const invalid of ["", "invalid", "b2c_short", `b2c_${"z".repeat(43)}`])
    await assert.rejects(repository.resolveApiKeyPrincipal(invalid), (error: unknown) => error instanceof AccessError && error.status === 401);
});

test("list, read and revoke for account A never reach account B's rows", async () => {
  const listedA = await repository.listApiKeys(accountA);
  assert.deepEqual(
    listedA.map((key) => key.id),
    ["key_a"],
  );
  assert.equal(await repository.getApiKey(accountA, "key_b"), null, "account B's key id must read as absent, not as a row");
  assert.notEqual(await repository.getApiKey(accountB, "key_b"), null, "the same id must still resolve for its own tenant");

  const sessionsA = await repository.listSessions(accountA);
  assert.deepEqual(
    sessionsA.map((session) => session.id),
    [sessionIdA],
  );
  const auditA = await repository.listAuditEvents(accountA);
  assert.deepEqual(
    auditA.map((event) => event.id),
    ["audit-acct_a"],
  );
});

test("revoking account B's key id from account A mutates nothing", async () => {
  assert.equal(await fixture.readKeyRevokedAt("key_b"), null);
  assert.equal(await repository.revokeApiKey(accountA, "key_b"), false, "a cross-tenant revoke must report no change");
  assert.equal(await fixture.readKeyRevokedAt("key_b"), null, "account B's key must still be live");

  assert.equal(await repository.revokeSession(accountA, sessionIdB), false);
  const sessionsB = await repository.listSessions(accountB);
  assert.equal(sessionsB[0]?.revokedAt, null, "account B's session must still be live");

  // The same call for the owning tenant does work, so the false above is isolation and
  // not a broken revoke path.
  assert.equal(await repository.revokeApiKey(accountB, "key_b"), true);
  assert.notEqual(await fixture.readKeyRevokedAt("key_b"), null);
  // auth.ts has no path back from revoked, and the trigger enforces it.
  assert.equal(await repository.revokeApiKey(accountB, "key_b"), false, "a second revoke is a no-op, never an un-revoke");
  await assert.rejects(repository.resolveApiKeyPrincipal(keyB), (error: unknown) => error instanceof AccessError && error.status === 403);
});

test("creating a key writes into the caller's tenant only", async () => {
  const created = await repository.createApiKey(accountA, {
    id: "key_a2",
    userId: "user_a",
    sha256Hex: await sha256(`b2c_${"c".repeat(43)}`),
    keyPrefix: "b2c_ccc",
  });
  assert.equal(created.id, "key_a2");
  assert.equal(await fixture.countRows("api_keys", "acct_a"), 2);
  assert.equal(await fixture.countRows("api_keys", "acct_b"), 1, "account B's key count must not move");
  assert.equal(await repository.getApiKey(accountB, "key_a2"), null);
});

test("the composite membership foreign key rejects a key whose subject is not a member", async () => {
  // auth.ts:78 refuses a credential whose subject is not allowed. Here that rule is
  // structural, so the database refuses the row rather than the request handler refusing
  // the call. This also proves D1 is enforcing foreign keys at all.
  await assert.rejects(
    repository.createApiKey(accountA, {
      id: "key_cross",
      userId: "user_b",
      sha256Hex: await sha256(`b2c_${"d".repeat(43)}`),
      keyPrefix: "b2c_ddd",
    }),
    /FOREIGN KEY|constraint/i,
  );
  assert.equal(await repository.getApiKey(accountA, "key_cross"), null);
});

test("entitlement is the gate, and a stale entitlement fails closed rather than open", async () => {
  await repository.assertEntitled(accountA, "b2c:read");
  // A tenant with no entitlement row for the key is denied.
  await assert.rejects(repository.assertEntitled(accountA, "b2c:write"), (error: unknown) => error instanceof AccessError && error.status === 403);
  // Both sides of the staleness ceiling, so the constant cannot be changed silently.
  const syncedAt = Date.parse(SEED_STAMP);
  await assert.doesNotReject(
    repository.assertEntitled(accountA, "b2c:read", syncedAt + ENTITLEMENT_STALENESS_CEILING_MS),
    "a stale-but-active entitlement keeps serving right up to the ceiling",
  );
  // Past the ceiling the refresh path is broken, which is our fault, not the client's:
  // 503 tells the caller to retry, where 403 would wrongly claim they lack access.
  await assert.rejects(
    repository.assertEntitled(accountA, "b2c:read", syncedAt + ENTITLEMENT_STALENESS_CEILING_MS + 1),
    (error: unknown) => error instanceof AccessError && error.status === 503,
  );
});

test("any listed lookup_key satisfies the gate, a fresh plan row outranks a stale read row, and an unlisted key never counts", async () => {
  const syncedAt = Date.parse(SEED_STAMP);
  // Account A holds the seeded b2c:read row only. Asking for the plan keys alone is a refusal.
  await assert.rejects(
    repository.assertEntitledAny(accountA, ["b2c_pro_monthly", "b2c_pro_annual"]),
    (error: unknown) => error instanceof AccessError && error.status === 403,
  );
  await assert.doesNotReject(repository.assertEntitledAny(accountA, ["b2c_pro_monthly", "b2c:read"]));
  await assert.rejects(repository.assertEntitledAny(accountA, []), (error: unknown) => error instanceof AccessError && error.status === 403);

  // A paid plan row, written the way billing/webhook.ts writes it, fresh a day after the seed.
  const fresh = new Date(syncedAt + ENTITLEMENT_STALENESS_CEILING_MS).toISOString();
  await fixture.insertEntitlement({ accountId: "acct_a", lookupKey: "b2c_pro_monthly", stripeCustomerId: "cus_AAAAAAAAAAAA", stamp: fresh });
  await assert.doesNotReject(repository.assertEntitledAny(accountA, ["b2c_pro_monthly"]));
  // At a moment where the read row is past the ceiling but the plan row is not, the plan row decides.
  await assert.rejects(
    repository.assertEntitled(accountA, "b2c:read", syncedAt + ENTITLEMENT_STALENESS_CEILING_MS + 1),
    (error: unknown) => error instanceof AccessError && error.status === 503,
  );
  await assert.doesNotReject(repository.assertEntitledAny(accountA, ["b2c:read", "b2c_pro_monthly"], syncedAt + ENTITLEMENT_STALENESS_CEILING_MS + 1));
  // Both stale: an outage, not a refusal.
  await assert.rejects(
    repository.assertEntitledAny(accountA, ["b2c:read", "b2c_pro_monthly"], syncedAt + 2 * ENTITLEMENT_STALENESS_CEILING_MS + 2),
    (error: unknown) => error instanceof AccessError && error.status === 503,
  );
  // An inactive plan row grants nothing, however fresh.
  await fixture.deactivateEntitlement("acct_a", "b2c_pro_monthly");
  await assert.rejects(repository.assertEntitledAny(accountA, ["b2c_pro_monthly"]), (error: unknown) => error instanceof AccessError && error.status === 403);
  // Account B never sees account A's plan row.
  await assert.rejects(repository.assertEntitledAny(accountB, ["b2c_pro_monthly"]), (error: unknown) => error instanceof AccessError && error.status === 403);
  await fixture.deleteEntitlement("acct_a", "b2c_pro_monthly");
});

test("revocation does not wait for the staleness ceiling", async () => {
  // The point of the 24h ceiling is that it never delays a revocation. A webhook writing
  // active = 0 denies on the very next read, even with a freshly synced row.
  await fixture.deactivateEntitlement("acct_a", "b2c:read");
  await assert.rejects(repository.assertEntitled(accountA, "b2c:read"), (error: unknown) => error instanceof AccessError && error.status === 403);
  await fixture.reactivateEntitlement("acct_a", "b2c:read");
  await assert.doesNotReject(repository.assertEntitled(accountA, "b2c:read"));
});

test("findSubscription resolves within a tenant and discloses nothing across tenants or for an unknown id", async () => {
  await repository.upsertSubscription(
    accountA,
    {
      id: "sub_findme00001",
      stripeCustomerId: "cus_AAAAAAAAAAAA",
      status: "active",
      priceId: null,
      isGifted: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      observedAt: SEED_STAMP,
    },
    new Date(SEED_STAMP),
  );
  const ownRead = await repository.findSubscription(accountA, "sub_findme00001");
  assert.deepEqual(ownRead, { status: "active", pastDueSince: null });

  // The exact same subscription id, read through account B's tenant boundary: null, exactly as
  // for one that does not exist at all — not a 403, not a differently-shaped error, so a caller
  // learns nothing about whether the id exists anywhere at all from the shape of the response.
  assert.equal(await repository.findSubscription(accountB, "sub_findme00001"), null);
  assert.equal(await repository.findSubscription(accountA, "sub_doesnotexist1"), null);
});

test("listActiveEntitlementsForCustomer is scoped by account and Stripe customer together, not by either alone", async () => {
  // A second lookup_key for account A's own Stripe customer, alongside the seeded b2c:read.
  await repository.upsertEntitlement(
    accountA,
    { lookupKey: "pro_monthly", stripeCustomerId: "cus_AAAAAAAAAAAA", active: true, source: "stripe_webhook", observedAt: SEED_STAMP },
    new Date(SEED_STAMP),
  );

  const ownEntitlements = await repository.listActiveEntitlementsForCustomer(accountA, "cus_AAAAAAAAAAAA");
  assert.deepEqual(ownEntitlements.map((row) => row.lookupKey).sort(), ["b2c:read", "pro_monthly"]);

  // Account B asking about account A's Stripe customer id learns nothing — scoped by BOTH
  // columns together, the same two-column scoping upsertEntitlement's own primary key uses.
  assert.deepEqual(await repository.listActiveEntitlementsForCustomer(accountB, "cus_AAAAAAAAAAAA"), []);
});

test("a freshly created account has no Stripe Customer, and getAccountOwnerEmail resolves the signed-in owner", async () => {
  // 0008_lazy_stripe_customer.sql: createUserAndAccountFromGoogle no longer requires one.
  const { accountId: accountC } = await repository.createUserAndAccountFromGoogle({
    userId: "user_c",
    googleSub: "100000000000000000003",
    email: "c@example.com",
    emailVerified: true,
  });
  assert.equal(await repository.getAccountStripeCustomerId(accountC), null, "a new account starts with no Customer at all");
  assert.equal(await repository.getAccountOwnerEmail(accountC), "c@example.com");
  // An id this repository has never seen reads as null, the same "absent, not an error" shape
  // getApiKey and findSubscription already use for an unknown id.
  assert.equal(await repository.getAccountStripeCustomerId("acct_does_not_exist" as AccountId), null);
});

test("setAccountStripeCustomerId is set-once, and cannot be used to attach one tenant's Customer to another", async () => {
  const { accountId: accountC } = await repository.createUserAndAccountFromGoogle({
    userId: "user_d",
    googleSub: "100000000000000000004",
    email: "d@example.com",
    emailVerified: true,
  });
  assert.equal(await repository.getAccountStripeCustomerId(accountC), null);

  // account B's Customer id is already taken (seeded in before()). Account C claiming the exact
  // same id must fail outright — the UNIQUE constraint is what stops a second tenant from ever
  // billing, or being entitled, through a Customer that is not theirs.
  await assert.rejects(repository.setAccountStripeCustomerId(accountC, "cus_BBBBBBBBBBBB"), /UNIQUE|constraint/i);
  assert.equal(await repository.getAccountStripeCustomerId(accountC), null, "a rejected write must not land");
  assert.equal(await repository.getAccountStripeCustomerId(accountB), "cus_BBBBBBBBBBBB", "account B's own Customer must be untouched by account C's attempt");

  await repository.setAccountStripeCustomerId(accountC, "cus_CCCCCCCCCCCC");
  assert.equal(await repository.getAccountStripeCustomerId(accountC), "cus_CCCCCCCCCCCC");

  // Set-once: the `WHERE stripe_customer_id IS NULL` guard (db/tenant.ts's own doc comment on
  // setAccountStripeCustomerId) means a second call — a concurrent Checkout attempt racing this
  // one, say — must not overwrite the value that already won.
  await repository.setAccountStripeCustomerId(accountC, "cus_CCCCCCCCCCCD");
  assert.equal(await repository.getAccountStripeCustomerId(accountC), "cus_CCCCCCCCCCCC", "the column is set once and never overwritten");
});

test("session resolution is tenant-bound and expiry closes on equality", async () => {
  const resolved = await repository.resolveSessionPrincipal(sessionTokenA);
  assert.equal(resolved.accountId, "acct_a");
  assert.equal(resolved.userId, "user_a");
  // auth.ts:81 expires on <=. A session whose expiry equals now is already dead.
  const expiry = Date.parse("2099-01-01T00:00:00.000Z");
  await assert.rejects(repository.resolveSessionPrincipal(sessionTokenA, expiry), (error: unknown) => error instanceof AccessError && error.status === 403);
  await assert.doesNotReject(repository.resolveSessionPrincipal(sessionTokenA, expiry - 1));
});

test("the interest collector deduplicates by address and never overwrites its own history", async () => {
  await repository.recordInterestSignal({
    id: "signal_1",
    email: "Fan@Example.com",
    acquisitionSource: "x_twitter",
    intent: "wants the hosted service",
    initialUtmSource: "twitter",
    initialUtmCampaign: "launch",
  });
  await repository.recordInterestSignal({
    id: "signal_2",
    email: "fan@example.com",
    acquisitionSource: "hacker_news",
    intent: "wants team seats",
    initialUtmSource: "should-not-overwrite",
  });
  const rows = await fixture.readInterestSignals();
  assert.equal(rows.length, 1, "a resubmission updates the waitlist row rather than duplicating it");
  const row = rows[0];
  assert.ok(row);
  assert.equal(row.id, "signal_1", "the original row id is the durable identifier");
  assert.equal(row.acquisition_source, "hacker_news");
  assert.equal(row.intent, "wants team seats");
  // First-touch attribution is first-touch: a resubmission must not rewrite it.
  assert.equal(row.initial_utm_source, "twitter", "the original acquisition path must survive a resubmission");
  assert.equal(row.initial_utm_campaign, "launch");
});

test("an unknown acquisition source key is rejected before it reaches the column", async () => {
  await assert.rejects(
    repository.recordInterestSignal({
      id: "signal_bad",
      email: "nope@example.com",
      // Not in the taxonomy. Enforced in the repository so adding a real channel later
      // costs a one-line edit rather than a schema migration.
      acquisitionSource: "tiktok_dance" as never,
      intent: "x",
    }),
    /invalid|enum|expected/i,
  );
});

test("audit metadata cannot carry key material", async () => {
  await assert.rejects(
    repository.recordAuditEvent(accountA, {
      id: "audit_leak",
      actorUserId: "user_a",
      action: "api_key.create",
      metadata: { key: `b2c_${"e".repeat(43)}` },
    }),
    (error: unknown) => error instanceof AccessError && error.status === 503,
  );
  assert.equal(await fixture.countRows("audit_events", "acct_a"), 1);
});

test("a D1 outage fails closed as 503 rather than escaping as a 500", async () => {
  // Dropping the table is the cheapest faithful stand-in for D1 returning an error: the
  // statement fails at the driver, exactly where a real outage would surface.
  const broken = await createTestDatabase();
  try {
    await broken.breakApiKeysTable();
    await assert.rejects(
      resolveApiKeyAccess({ DB: broken.db } as unknown as Env, keyA),
      (error: unknown) => error instanceof AccessError && error.status === 503,
      "an infrastructure fault must not surface as 500, and must not read as a bad key",
    );
  } finally {
    await broken.dispose();
  }
});

test("the migration splitter keeps trigger bodies intact", () => {
  const statements = splitStatements(`
    CREATE TABLE t (a TEXT);
    CREATE TRIGGER g BEFORE UPDATE ON t
    BEGIN
      SELECT RAISE(ABORT, 'no');
    END;
    CREATE INDEX i ON t (a);
  `);
  assert.equal(statements.length, 3);
  assert.match(statements[1] ?? "", /BEGIN[\s\S]*RAISE\(ABORT, 'no'\)[\s\S]*END$/);
});

// ---------------------------------------------------------------------------
// 0008_lazy_stripe_customer.sql's accounts rebuild.
//
// This needs its own Miniflare instance rather than the shared `fixture` above:
// `createTestDatabase()` (support/d1.ts) applies every migration up front, so there is no way to
// seed data in the PRE-0008 shape (`accounts.stripe_customer_id` still NOT NULL) through it. Here
// every migration except 0008 is applied first, one full tenant plus a past_due subscription and
// a processed_stripe_events row is seeded by hand, and only then is 0008 applied alone — matching
// exactly how a real deploy replays this migration against a populated database.
// ---------------------------------------------------------------------------

test("0008_lazy_stripe_customer's accounts rebuild preserves every dependent row across the cascade, including a column a plain row-count check would miss", async () => {
  // All the raw D1 access lives in verifyMigration0008RebuildSurvival (test/support/d1.ts) — the
  // one other file besides db/tenant.ts this package's tenant-isolation lint permits to hold it.
  const result = await verifyMigration0008RebuildSurvival();

  assert.equal(result.accountStripeCustomerId, "cus_REBUILDTEST0001", "the account row, and its Customer id, must survive the rebuild");
  assert.equal(result.nullCustomerAccountAccepted, true, "the column must actually relax: a new account with no Customer must now be insertable");
  assert.equal(result.membershipSurvived, true, "the membership must survive the accounts rebuild's cascade and restore");
  assert.equal(result.apiKeySurvived, true, "the api_key must survive");
  assert.equal(result.sessionSurvived, true, "the session must survive");
  assert.equal(result.subscriptionStatus, "past_due");
  assert.equal(result.subscriptionPastDueSince, "2026-01-01T00:00:00.000Z", "the dunning stamp must survive the rebuild, not just the row it lives on");
  assert.equal(result.entitlementActive, 1);
  assert.equal(result.processedStripeEventResult, "applied");
  // The append-only trigger this migration must drop and recreate, verbatim, around the rebuild.
  assert.equal(result.appendOnlyTriggerStillEnforced, true, "processed_stripe_events_are_append_only must be back in force after the rebuild");
});

test("listSubscriptionsForAccount returns what the plan page needs — id, price, scheduled cancellation, period end — newest first, and nothing across tenants", async () => {
  // Later than every seeded row's SEED_STAMP (and than the row findSubscription's own test wrote
  // above), so this account's most recently observed subscription is the one written here.
  const older = new Date(Date.parse(SEED_STAMP) + 5_000);
  const newer = new Date(Date.parse(SEED_STAMP) + 10_000);
  await repository.upsertSubscription(
    accountA,
    { id: "sub_latest0000old", stripeCustomerId: "cus_AAAAAAAAAAAA", status: "canceled", priceId: "price_OLD0001", isGifted: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, observedAt: older.toISOString() },
    older,
  );
  await repository.upsertSubscription(
    accountA,
    {
      id: "sub_latest0000new",
      stripeCustomerId: "cus_AAAAAAAAAAAA",
      status: "active",
      priceId: "price_NEW0001",
      isGifted: false,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-10-05T12:00:00.000Z",
      observedAt: newer.toISOString(),
    },
    newer,
  );
  const listed = await repository.listSubscriptionsForAccount(accountA);
  assert.deepEqual(listed[0], {
    id: "sub_latest0000new",
    status: "active",
    pastDueSince: null,
    priceId: "price_NEW0001",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-10-05T12:00:00.000Z",
  });
  assert.equal(listed[1]?.id, "sub_latest0000old", "older rows follow, newest first");
  // Account B has never subscribed and must not see account A's rows through this read either.
  assert.deepEqual(await repository.listSubscriptionsForAccount(accountB), []);
});

test("releaseProcessedStripeEvent gives an event id back so the next delivery of it is a first delivery again", async () => {
  const now = new Date(SEED_STAMP);
  assert.equal(await repository.recordProcessedStripeEvent({ id: "evt_release_me_01", type: "customer.subscription.created", accountId: accountA, result: "applied" }, now), true);
  assert.equal(await repository.recordProcessedStripeEvent({ id: "evt_release_me_01", type: "customer.subscription.created", accountId: accountA, result: "applied" }, now), false, "a second insert of the same id is the duplicate case");
  await repository.releaseProcessedStripeEvent("evt_release_me_01");
  assert.equal(await repository.recordProcessedStripeEvent({ id: "evt_release_me_01", type: "customer.subscription.created", accountId: accountA, result: "applied" }, now), true, "after release the id must be claimable again");
  // A malformed id never reaches the database.
  await assert.rejects(repository.releaseProcessedStripeEvent("not-an-event-id"));
});

test("missing D1 fails closed without a credential fallback", async () => {
  await assert.rejects(resolveApiKeyAccess({} as Env, keyA), (error: unknown) => error instanceof AccessError && error.status === 503);
});
