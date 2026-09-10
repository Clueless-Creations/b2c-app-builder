import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
// Node's URL explicitly: in this Worker's tsconfig the global URL is Cloudflare's and is
// not assignable to fileURLToPath.
import { fileURLToPath, URL as NodeURL } from "node:url";
import { test } from "node:test";

/**
 * Pins what this Worker pulls in from outside its own directory.
 *
 * Every entry here is code that ships inside an OAuth authorization server. The list is small on
 * purpose, and it should be reviewed rather than grown: a new line in this test is a new fault
 * domain in the hot path of every MCP client. Two of the current entries live under hosted/builder-console,
 * which is a naming accident rather than an ownership claim — see the note in capture.ts.
 */
const EXPECTED_EXTERNAL_IMPORTS = [
  "../../catalog/generated/hosted-knowledge.json",
  "../../contracts/public-api/connection-receipt.js",
  "../builder-console/analytics/capture.js",
  "../builder-console/analytics/events.js",
  "../../kernel/knowledge-service/service.js",
  "../../kernel/knowledge-service/tools.js",
  "../../kernel/knowledge-service/types.js",
  "../shared/geo.js",
].sort();

test("the set of files bundled from outside hosted/knowledge-mcp has not changed", () => {
  const dir = fileURLToPath(new NodeURL("..", import.meta.url));
  const found = new Set<string>();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
    const source = readFileSync(`${dir}/${entry}`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const match of source.matchAll(/\bfrom\s+"(\.\.\/[^"]+)"/g)) found.add(match[1]!);
  }
  assert.deepEqual(
    [...found].sort(),
    EXPECTED_EXTERNAL_IMPORTS,
    "The authorization server's external bundle inputs changed. Every one of these ships inside " +
      "the OAuth server, so review the addition deliberately, then update this list and redeploy.",
  );
});
