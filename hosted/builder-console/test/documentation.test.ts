import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { EVENTS } from "../analytics/events.js";

const lia = readFileSync(fileURLToPath(new URL("../analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md", import.meta.url)), "utf8");
const hostedReadme = readFileSync(fileURLToPath(new URL("../../knowledge-mcp/README.md", import.meta.url)), "utf8");

test("the LIA's in-scope event names are a subset of the implemented event catalog", () => {
  const row = lia.split("\n").find((line) => line.includes("Events in scope"));
  assert.ok(row, 'LIA facts table is missing an "Events in scope" row');
  const named = [...row!.matchAll(/`([a-z][a-z_]*)`/g)].map((match) => match[1]!);
  assert.ok(named.length > 0, 'no event names found in the LIA\'s "Events in scope" row');
  const implemented = new Set<string>(Object.values(EVENTS));
  const unknown = named.filter((name) => !implemented.has(name as (typeof EVENTS)[keyof typeof EVENTS]));
  assert.deepEqual(unknown, [], "the LIA names an event that is not in EVENTS — taxonomy and lawful-basis analysis have drifted");
});

test("the hosted README documents the exact analytics opt-out command", () => {
  assert.ok(
    hostedReadme.includes('wrangler kv key put --binding OAUTH_KV "analytics:optout:<subject>" 1'),
    "hosted/knowledge-mcp/README.md is missing the literal opt-out command operators need to run",
  );
});
