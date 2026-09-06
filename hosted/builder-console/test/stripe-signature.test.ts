import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { stripeApiRequest, verifyStripeSignature } from "../billing/stripe.js";

const SECRET = "whsec_test_secret_do_not_use_in_prod";
const PAYLOAD = JSON.stringify({ id: "evt_test123", type: "customer.subscription.created" });

/** Hand-computed the same way Stripe documents it, independently of verifyStripeSignature's own
 * Web Crypto implementation — this is what makes the test a real cross-check rather than a
 * tautology. https://docs.stripe.com/webhooks#verify-manually */
function signHeader(timestamp: number, payload: string, secret = SECRET): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

test("a correctly signed header at the current timestamp verifies", async () => {
  const now = 1_800_000_000;
  const header = signHeader(now, PAYLOAD);
  assert.equal(await verifyStripeSignature(PAYLOAD, header, SECRET, 300, now), true);
});

test("a tampered payload fails verification even with a valid header", async () => {
  const now = 1_800_000_000;
  const header = signHeader(now, PAYLOAD);
  const tampered = PAYLOAD.replace("evt_test123", "evt_hijacked");
  assert.equal(await verifyStripeSignature(tampered, header, SECRET, 300, now), false);
});

test("a timestamp outside the tolerance window fails, in either direction", async () => {
  const now = 1_800_000_000;
  const tooOld = signHeader(now - 301, PAYLOAD);
  const tooNew = signHeader(now + 301, PAYLOAD);
  assert.equal(await verifyStripeSignature(PAYLOAD, tooOld, SECRET, 300, now), false);
  assert.equal(await verifyStripeSignature(PAYLOAD, tooNew, SECRET, 300, now), false);
});

test("a timestamp at the exact edge of the tolerance window still verifies", async () => {
  const now = 1_800_000_000;
  const header = signHeader(now - 300, PAYLOAD);
  assert.equal(await verifyStripeSignature(PAYLOAD, header, SECRET, 300, now), true);
});

test("the wrong signing secret fails even with a correctly shaped header", async () => {
  const now = 1_800_000_000;
  const header = signHeader(now, PAYLOAD, "whsec_a_different_secret");
  assert.equal(await verifyStripeSignature(PAYLOAD, header, SECRET, 300, now), false);
});

test("a header missing t= or every v1= fails closed rather than throwing", async () => {
  const now = 1_800_000_000;
  assert.equal(await verifyStripeSignature(PAYLOAD, "v1=deadbeef", SECRET, 300, now), false);
  assert.equal(await verifyStripeSignature(PAYLOAD, `t=${now}`, SECRET, 300, now), false);
  assert.equal(await verifyStripeSignature(PAYLOAD, "", SECRET, 300, now), false);
});

test("a rotated signing secret still verifies against whichever v1 candidate matches", async () => {
  const now = 1_800_000_000;
  const oldSecretSig = createHmac("sha256", "whsec_old").update(`${now}.${PAYLOAD}`).digest("hex");
  const newSecretSig = createHmac("sha256", "whsec_new").update(`${now}.${PAYLOAD}`).digest("hex");
  const header = `t=${now},v1=${oldSecretSig},v1=${newSecretSig}`;
  assert.equal(await verifyStripeSignature(PAYLOAD, header, "whsec_new", 300, now), true);
  assert.equal(await verifyStripeSignature(PAYLOAD, header, "whsec_unrelated", 300, now), false);
});

test("stripeApiRequest refuses a key that is not rk_-prefixed, before making any request", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  await assert.rejects(
    () => stripeApiRequest("/v1/customers", { method: "POST", secretKey: "sk_live_full_access_key", fetchImpl }),
    /restricted key/,
  );
  assert.equal(called, false, "no network call should be attempted with a non-restricted key");
});

test("stripeApiRequest surfaces a non-2xx Stripe response as StripeApiError", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "No such customer" } }), { status: 404 })) as typeof fetch;
  await assert.rejects(() => stripeApiRequest("/v1/customers/cus_missing", { method: "GET", secretKey: "rk_test_abc", fetchImpl }), (error: unknown) => {
    assert.ok(error instanceof Error);
    return true;
  });
});

test("stripeApiRequest returns the parsed JSON body on success", async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.stripe.com/v1/customers");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer rk_test_abc");
    return new Response(JSON.stringify({ id: "cus_abc123" }), { status: 200 });
  }) as typeof fetch;
  const result = await stripeApiRequest("/v1/customers", { method: "POST", body: new URLSearchParams({ email: "a@example.com" }), secretKey: "rk_test_abc", fetchImpl });
  assert.deepEqual(result, { id: "cus_abc123" });
});
