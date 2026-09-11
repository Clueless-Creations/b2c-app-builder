#!/usr/bin/env node
/**
 * check-validator-docs.ts — docs/validators.md must describe the shipped gate suite.
 *
 * The 2026-08 knowledge-matrix audit found the maintainer-facing validator map documenting
 * ~17 npm scripts that no longer existed while omitting the gates that actually enforce
 * routing/matrix invariants (check:catalog, catalog:render-routing, check:hub-spoke) — and
 * nothing in the pipeline checked that drift. This gate closes the loop both ways:
 *
 * - every command documented in docs/validators.md must exist as an npm script in the
 *   root package.json (no phantom rows), and
 * - every gate-shaped script (check:*, validate:*) must appear in the doc (no undocumented
 *   gates).
 *
 * Default repo root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 *
 * npm script: check:validator-docs (repo-only; the runtime ships no docs/ tree).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultRepoRoot = resolveSkillRoot(import.meta.url);

const flags = parseFlags(process.argv.slice(2), [{ flags: ["--repo-root"], key: "repoRoot" }]);
const repoRoot = flagString(flags, "repoRoot") ?? defaultRepoRoot;
const docPath = path.join(repoRoot, "docs/validators.md");
const packagePath = path.join(repoRoot, "package.json");
const issues: Issue[] = [];

const scripts = new Set(Object.keys((JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {}));
const docText = readFileSync(docPath, "utf8");

// A documented command is a backticked token shaped like an npm script id at the start of a
// table row's first cell: `check:x`, `validate:x`, `render:x`, `test:x`, `probe:x`, ... Slash
// pairs like `lint:format` / `format` document two scripts in one cell.
const documented = new Set<string>();
for (const match of docText.matchAll(/^\|\s*`([^`]+)`(?:\s*\/\s*`([^`]+)`)?\s*\|/gmu)) {
  for (const token of [match[1], match[2]]) {
    if (token && /^[a-z][\w:-]*$/u.test(token)) documented.add(token);
  }
}

if (documented.size === 0) {
  issues.push(
    issue(
      "error",
      "validator_docs.no_commands_found",
      `No documented command rows found in ${path.relative(repoRoot, docPath)} — the parser or the doc structure broke.`,
      "docs/validators.md",
    ),
  );
}

for (const command of [...documented].sort()) {
  if (!scripts.has(command)) {
    issues.push(
      issue(
        "error",
        "validator_docs.phantom_command",
        `docs/validators.md documents \`${command}\`, but no such npm script exists — drop the row or fix the name.`,
        "docs/validators.md",
      ),
    );
  }
}

for (const script of [...scripts].sort()) {
  if (!/^(check|validate):/u.test(script)) continue;
  if (!documented.has(script)) {
    issues.push(
      issue(
        "error",
        "validator_docs.gate_undocumented",
        `npm script \`${script}\` is a gate but docs/validators.md has no row for it — the validator map is the full map, not a sample.`,
        "docs/validators.md",
      ),
    );
  }
}

reportAndExit("Validator documentation drift check", issues);
