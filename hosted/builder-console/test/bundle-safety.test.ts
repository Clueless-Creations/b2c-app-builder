import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * capture.ts and events.ts live in this directory but are BUNDLED INTO THE MCP WORKER.
 *
 * hosted/knowledge-mcp/worker.ts imports them, so whatever they import ends up inside an OAuth
 * authorization server that every MCP client depends on. The whole reason capture is a hand
 * written fetch rather than posthog-node is to keep that Worker's dependency surface at three
 * packages. One `import` line here would undo that silently: flags.ts pulls in posthog-node, so
 * `import { CHECKOUT_FLAG_KEY } from "./flags.js"` in capture.ts would ship the SDK into the
 * authorization server, and nothing would fail — it would just quietly be there.
 *
 * So the constraint is mechanical rather than a comment someone has to re-read.
 */
const SHARED_WITH_HOSTED = ["capture.ts", "events.ts"] as const;

/** The only import either file may have: each other. Everything else is a regression. */
const ALLOWED = new Set(["./events.js", "./capture.js"]);

function importsOf(file: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(`../analytics/${file}`, import.meta.url)), "utf8");
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...withoutComments.matchAll(/\bfrom\s+"([^"]+)"|\brequire\(\s*"([^"]+)"/g)].map((m) => m[1] ?? m[2]!);
}

for (const file of SHARED_WITH_HOSTED) {
  test(`${file} imports nothing that would reach the MCP Worker`, () => {
    for (const specifier of importsOf(file)) {
      assert.ok(
        ALLOWED.has(specifier),
        `${file} imports "${specifier}". That file is bundled into kernel/hosted, so this ships into ` +
          `the OAuth authorization server. If it is genuinely shared, move it to hosted/shared/; ` +
          `if it is console-only, it does not belong in ${file}.`,
      );
    }
  });
}

test("a bare npm specifier in either file would be caught", () => {
  // Guard the guard: the check must reject package imports, not just relative ones.
  const wouldReject = (specifier: string) => !ALLOWED.has(specifier);
  for (const specifier of ["posthog-node", "zod", "./flags.js", "../interest/handler.js"]) {
    assert.ok(wouldReject(specifier), `${specifier} must not be treated as allowed`);
  }
});
