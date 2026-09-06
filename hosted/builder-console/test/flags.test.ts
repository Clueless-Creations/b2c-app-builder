import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKOUT_FLAG_KEY, KvFlagCacheReader, KvFlagCacheWriter, MAX_DEFINITION_AGE_MS, resolveCheckoutGate } from "../analytics/flags.js";

function memoryKv() {
  const map = new Map<string, string>();
  return { get: async (k: string) => map.get(k) ?? null, put: async (k: string, v: string) => void map.set(k, v), map };
}

const definitions = { flags: [{ key: CHECKOUT_FLAG_KEY }] } as never;

test("the reader never triggers a fetch from a request handler", () => {
  assert.equal(new KvFlagCacheReader(memoryKv()).shouldFetchFlagDefinitions(), false);
});

test("the writer fetches and stamps what it stores", async () => {
  const kv = memoryKv();
  const writer = new KvFlagCacheWriter(kv, () => 1_700_000_000_000);
  assert.equal(writer.shouldFetchFlagDefinitions(), true);
  await writer.onFlagDefinitionsReceived(definitions);
  const stored = JSON.parse(kv.map.get("posthog:flags:platform")!);
  assert.equal(stored.fetchedAt, 1_700_000_000_000);
  assert.deepEqual(stored.data, definitions);
  assert.deepEqual(await new KvFlagCacheReader(kv).getFlagDefinitions(), definitions);
});

test("a read-only cache silently ignores a write attempt", async () => {
  const kv = memoryKv();
  const reader = new KvFlagCacheReader(kv);
  reader.onFlagDefinitionsReceived();
  assert.equal(kv.map.size, 0);
});

test("corrupt cache content reads as absent rather than throwing", async () => {
  const kv = memoryKv();
  await kv.put("posthog:flags:platform", "{not json");
  assert.equal(await new KvFlagCacheReader(kv).getFlagDefinitions(), undefined);
});

async function seed(ageMs: number) {
  const kv = memoryKv();
  await new KvFlagCacheWriter(kv, () => Date.now() - ageMs).onFlagDefinitionsReceived(definitions);
  return kv;
}

test("checkout opens only on an explicit true from fresh definitions", async () => {
  const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => true }), await seed(0));
  assert.deepEqual(gate, { checkoutAvailable: true, reason: "flag_enabled" });
});

test("an explicit false shows the interest collector", async () => {
  const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => false }), await seed(0));
  assert.deepEqual(gate, { checkoutAvailable: false, reason: "flag_disabled" });
});

test("undefined is not true — an unevaluated flag keeps checkout closed", async () => {
  const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => undefined }), await seed(0));
  assert.equal(gate.checkoutAvailable, false);
});

test("missing definitions fail closed", async () => {
  const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => true }), memoryKv());
  assert.deepEqual(gate, { checkoutAvailable: false, reason: "definitions_missing" });
});

test("stale definitions fail closed even when the cached flag says true", async () => {
  const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => true }), await seed(MAX_DEFINITION_AGE_MS + 1_000));
  assert.deepEqual(gate, { checkoutAvailable: false, reason: "definitions_stale" });
});

test("definitions just inside the window are still served", async () => {
  const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => true }), await seed(MAX_DEFINITION_AGE_MS - 60_000));
  assert.equal(gate.checkoutAvailable, true);
});

test("a thrown evaluation fails closed with a distinguishable reason", async () => {
  const gate = await resolveCheckoutGate(
    async () => {
      throw new Error("sdk exploded");
    },
    await seed(0),
  );
  assert.deepEqual(gate, { checkoutAvailable: false, reason: "evaluation_error" });
});

test("the operator switch opens Checkout with no definitions at all, and only for the exact string on", async () => {
  const on = await resolveCheckoutGate(async () => ({ isEnabled: () => undefined }), memoryKv(), Date.now(), "on");
  assert.deepEqual(on, { checkoutAvailable: true, reason: "operator_enabled" });
  for (const other of [undefined, "", "true", "1", "ON", "off"]) {
    const gate = await resolveCheckoutGate(async () => ({ isEnabled: () => true }), memoryKv(), Date.now(), other);
    assert.equal(gate.checkoutAvailable, false, `switch value ${String(other)} must not open Checkout`);
  }
});
