import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { containsSecret, detectSecret, emailDomain, EVENTS, INTENTS, RedactionError, scrubProperties, SOURCE_KEYS } from "../analytics/events.js";

const taxonomy = readFileSync(fileURLToPath(new URL("../analytics/EVENT_TAXONOMY.md", import.meta.url)), "utf8");

test("every catalogued event appears in the taxonomy and vice versa", () => {
  // Whitespace-tolerant: prettier pads a markdown table's columns to the widest cell (here, the
  // "3b" row number), so the literal single-space spacing this regex once assumed is cosmetic,
  // not something a test should pin.
  const documented = new Set([...taxonomy.matchAll(/^\|\s*\d+[a-z]?\s*\|\s*`([a-z_]+)`\s*\|/gm)].map((match) => match[1] ?? ""));
  const implemented = new Set<string>(Object.values(EVENTS));
  assert.deepEqual(
    [...implemented].filter((name) => !documented.has(name)),
    [],
    "implemented but undocumented",
  );
  assert.deepEqual(
    [...documented].filter((name) => !implemented.has(name)),
    [],
    "documented but unimplemented",
  );
});

test("source keys and intents are documented", () => {
  for (const key of SOURCE_KEYS) assert.ok(taxonomy.includes(`\`${key}\``), `source key ${key} is undocumented`);
  for (const intent of INTENTS) assert.ok(taxonomy.includes(`\`${intent}\``), `intent ${intent} is undocumented`);
});

test("the acquisition key list matches the D1 writer's, exactly and in the same set", () => {
  // Migration 0006 added the attribution columns with no CHECK constraints, and acquisition_source
  // has no column constraint either — the enum lives in code on both sides. So the two lists
  // agreeing is the only thing stopping one writer accepting a value the other refuses.
  //
  // This reads the other Worker's file at build time rather than importing it at runtime. The app
  // Worker must not take a runtime dependency on the authorization server's D1 access module; the
  // architecture separates those two Workers so a fault in one cannot reach the other. A test that
  // fails loudly on drift buys the same safety without the coupling.
  const tenant = readFileSync(fileURLToPath(new URL("../../knowledge-mcp/db/tenant.ts", import.meta.url)), "utf8");
  const block = /export const ACQUISITION_SOURCE_KEYS = \[([\s\S]*?)\] as const;/.exec(tenant);
  assert.ok(block, "ACQUISITION_SOURCE_KEYS not found in hosted/knowledge-mcp/db/tenant.ts — did it move?");
  const theirs = [...block[1]!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
  assert.deepEqual([...theirs].sort(), [...SOURCE_KEYS].sort(), "acquisition source keys have drifted between the two writers");
});

test("detects every credential shape this platform handles", () => {
  const cases: [string, string][] = [
    // The exact shape auth.ts authorizeApiKey() accepts: b2c_ + 43 chars.
    ["b2c_" + "A".repeat(43), "b2c_api_key"],
    ["prefix b2c_" + "x1_-".repeat(10) + "abc" + " suffix", "b2c_api_key"],
    ["a".repeat(64), "sha256_digest"],
    // Synthetic. This slot briefly held a real token for an unrelated project in this org,
    // pasted from a tool response while writing the test. Harmless in itself — the value is
    // public by design — but a live token nobody chose to commit, and someone deriving a
    // published cookie name from it would have named a cookie that does not exist.
    ["phc_" + "EXAMPLEexampleEXAMPLEexampleEXAMPLE1234567", "posthog_key"],
    ["sk_live_" + "a".repeat(24), "stripe_key"],
    ["whsec_" + "b".repeat(32), "stripe_key"],
    ["eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpM", "jwt"],
    ["Bearer abcdefghijklmnopqrstuvwxyz", "bearer_header"],
    ['{"version":1,"ownerSubject":"owner","allowedSubjects":["owner"]}', "access_policy"],
  ];
  for (const [value, expected] of cases) assert.equal(detectSecret(value), expected, `missed ${expected} in ${value.slice(0, 24)}`);
});

test("does not flag ordinary analytics values", () => {
  for (const value of ["console_header", "hacker_news", "gmail.com", "key_01HZX", "0.209.17", "pk_live_abc123", "evaluating"]) {
    assert.equal(detectSecret(value), null, `false positive on ${value}`);
  }
});

test("drop mode removes secrets and keeps the event shippable", () => {
  const { properties, dropped } = scrubProperties({ key_id: "k_1", api_key: "b2c_" + "A".repeat(43), intent: "evaluating" }, "drop");
  assert.deepEqual(properties, { key_id: "k_1", intent: "evaluating" });
  assert.deepEqual(dropped.sort(), ["api_key"]);
});

test("throw mode rejects rather than silently dropping", () => {
  assert.throws(() => scrubProperties({ token: "anything" }, "throw"), RedactionError);
  // A credential-shaped value under an innocent name is still caught — the guard is structural.
  assert.throws(() => scrubProperties({ note: "sk_live_" + "a".repeat(24) }, "throw"), RedactionError);
});

test("a credential-shaped property name is dropped even when today's value looks benign", () => {
  const { dropped } = scrubProperties({ session_token: "", credential_sha256: "short" }, "drop");
  assert.deepEqual(dropped.sort(), ["credential_sha256", "session_token"]);
});

test("the guard walks nested objects and arrays, as the taxonomy claims it does", () => {
  const key = "b2c_" + "A".repeat(43);
  // The type signature says properties are primitives. A caller spreading an externally-typed
  // object ignores that, so the runtime guard must not trust it.
  assert.equal(containsSecret({ outer: { inner: { leaked: key } } }), "b2c_api_key");
  assert.equal(containsSecret([{ a: 1 }, { b: [key] }]), "b2c_api_key");
  // A credential can hide in a key as easily as in a value.
  assert.equal(containsSecret({ [key]: "harmless" }), "b2c_api_key");
  assert.equal(containsSecret({ outer: { inner: { fine: "hacker_news" } } }), null);
});

test("scrubProperties drops a nested secret rather than shipping it", () => {
  const nested = { context: { session: { jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij" } }, intent: "evaluating" } as never;
  const { properties, dropped } = scrubProperties(nested, "drop");
  assert.deepEqual(dropped, ["context"]);
  assert.deepEqual(properties, { intent: "evaluating" });
  assert.equal(JSON.stringify(properties).includes("eyJ"), false);
});

test("a pathological nesting depth is refused rather than walked forever", () => {
  let deep: Record<string, unknown> = { end: "value" };
  for (let level = 0; level < 40; level += 1) deep = { next: deep };
  assert.equal(containsSecret(deep), "max_depth_exceeded");
});

test("taxonomy property names survive the name heuristic", () => {
  // `source_key` and `key_id` contain "key" but are not credentials. If the heuristic ever
  // widens to bare "key", the acquisition breakdown and every key event silently lose their
  // discriminating property while still reporting ok.
  const props = { source_key: "hacker_news", key_id: "k_1", referral_code: "abc", mcp_client: "Claude Code", other_text_present: true };
  const { properties, dropped } = scrubProperties(props, "drop");
  assert.deepEqual(dropped, []);
  assert.deepEqual(properties, props);
});

test("undefined properties are omitted, not sent as null", () => {
  const { properties } = scrubProperties({ present: "yes", absent: undefined }, "drop");
  assert.deepEqual(Object.keys(properties), ["present"]);
});

test("emailDomain returns only the domain", () => {
  assert.equal(emailDomain("Person@Example.COM"), "example.com");
  assert.equal(emailDomain("not-an-email"), undefined);
  assert.equal(emailDomain("@nope"), undefined);
});
