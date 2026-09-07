import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare, type V4WorkerOptions } from "miniflare";
import { sha256 } from "../auth.js";
import { attachD1, seedAccountInto } from "./support/d1.js";

const origin = "https://b2c.test";
const ownerKey = `b2c_${"a".repeat(43)}`;
/** Lives in D1 only, entitled. */
const tenantKey = `b2c_${"b".repeat(43)}`;
/** Lives in D1 only, with no entitlement row. */
const unentitledKey = `b2c_${"c".repeat(43)}`;
const planKey = `b2c_${"p".repeat(43)}`;
const revokedKey = `b2c_${"d".repeat(43)}`;
/** Known to nobody. */
const unknownKey = `b2c_${"e".repeat(43)}`;

let mf: Miniflare;

before(async () => {
  const options: V4WorkerOptions & { log: Log } = {
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
      B2C_APP_BUILDER_AUTH_SECRET: "s".repeat(43),
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
  const db = await attachD1(mf);
  await seedAccountInto(db, {
    accountId: "acct_owner",
    userId: "eduardo",
    googleSub: "100000000000000000009",
    email: "owner@example.com",
    stripeCustomerId: "cus_OWNER",
    keyId: "owner-1",
    keyDigest: await sha256(ownerKey),
  });
  await seedAccountInto(db, {
    accountId: "acct_tenant",
    userId: "user_tenant",
    googleSub: "100000000000000000010",
    email: "tenant@example.com",
    stripeCustomerId: "cus_TENANTAAAAAA",
    keyId: "key_tenant",
    keyDigest: await sha256(tenantKey),
  });
  await seedAccountInto(db, {
    accountId: "acct_unentitled",
    userId: "user_unentitled",
    googleSub: "100000000000000000011",
    email: "unentitled@example.com",
    stripeCustomerId: "cus_UNENTITLEDA",
    keyId: "key_unentitled",
    keyDigest: await sha256(unentitledKey),
    entitled: false,
  });
  await seedAccountInto(db, {
    accountId: "acct_plan",
    userId: "user_plan",
    googleSub: "100000000000000000013",
    email: "plan@example.com",
    stripeCustomerId: "cus_PLANAAAAAAAA",
    keyId: "key_plan",
    keyDigest: await sha256(planKey),
    // What billing/webhook.ts actually writes for a paid subscription: the Price's own lookup_key,
    // never "b2c:read". auth.ts's READ_SCOPE_LOOKUP_KEYS is what lets this key through.
    entitlementLookupKey: "b2c_pro_annual",
  });
  await seedAccountInto(db, {
    accountId: "acct_revoked",
    userId: "user_revoked",
    googleSub: "100000000000000000012",
    email: "revoked@example.com",
    stripeCustomerId: "cus_REVOKEDAAAAA",
    keyId: "key_revoked",
    keyDigest: await sha256(revokedKey),
    keyRevoked: true,
  });
});

after(async () => {
  await mf?.dispose();
});

function callApi(key: string) {
  return mf.dispatchFetch(`${origin}/api/v1`, { headers: { Authorization: `Bearer ${key}` }, redirect: "manual" });
}

test("an entitled owner key resolves through D1", async () => {
  const response = await callApi(ownerKey);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { scope: string };
  assert.equal(body.scope, "knowledge_only");
});

test("a D1 credential authorizes when its account is entitled", async () => {
  const response = await callApi(tenantKey);
  assert.equal(response.status, 200, "a key that exists only in D1 must reach the API");
});

test("a credential whose account holds only a paid plan's entitlement is admitted", async () => {
  const response = await callApi(planKey);
  assert.equal(response.status, 200, "a Stripe plan lookup_key must satisfy the read scope, or a paying customer is refused");
});

test("a D1 credential without an entitlement is refused", async () => {
  const response = await callApi(unentitledKey);
  assert.equal(response.status, 403, "entitlements are the gate, not mere existence of a key");
});

test("a revoked credential is refused despite active entitlement", async () => {
  // retrying against D1. The same digest is live and entitled in D1; it must still fail.
  const response = await callApi(revokedKey);
  assert.equal(response.status, 403, "D1 revocation is authoritative");
});

test("an unknown key is still a 401 with its challenge header", async () => {
  const response = await callApi(unknownKey);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /resource_metadata=/);
});

test("health and discovery are unaffected by the D1 binding", async () => {
  const response = await mf.dispatchFetch(`${origin}/health`);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { status: string }).status, "ok");
});
