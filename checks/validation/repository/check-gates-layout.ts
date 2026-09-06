#!/usr/bin/env node
/**
 * check-gates-layout.ts — the checks/validation/business/ tree defends its own shape.
 *
 * docs/architecture.md settled two rules when the validators split in v0.55.0:
 * `checks/validation/business/` mirrors the playbook domains, and there is no top-level exception
 * bucket — a genuinely cross-cutting gate goes to `checks/validation/business/process/`. Nothing
 * enforced either. A new gate filed under the wrong domain, or dropped at
 * `checks/validation/business/` root, was invisible to every other check.
 *
 * The duplicate-basename rule is the one that actually regressed. A FLAT
 * `checks/validation/business/` made two files with the same name structurally impossible — one
 * directory cannot hold them. Mirroring bought browsability and gave that
 * guarantee up: nothing stops `checks/validation/business/money/check-revenue.ts` and
 * `checks/validation/business/growth/check-revenue.ts` both existing after a bad merge. Callers
 * address scripts by basename alone, so a collision is not cosmetic — it makes
 * `resolveScriptPath` ambiguous, and every fixture that spawns by basename
 * starts resolving to whichever file the walk happened to reach first.
 * `indexScripts` already throws on it, but only at spawn time, which is a
 * backstop rather than a gate.
 *
 * The domain list is read from `knowledge/` rather than hardcoded, so the two
 * trees cannot drift: adding a playbook domain automatically permits the
 * matching gates folder, and deleting one immediately flags its orphaned gates.
 *
 * npm script: check:gates-layout
 * Usage: tsx checks/validation/repository/check-gates-layout.ts --skill-root /path/to/skill
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { SCRIPT_ROOTS, indexScripts } from "../../../tooling/lib/script-paths.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");
const flags = parseFlags(process.argv.slice(2), [{ flags: ["--skill-root", "--root"], key: "skillRoot" }]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
const issues: Issue[] = [];

const gatesRoot = path.join(skillRoot, "checks", "validation", "business");
const playbookRoot = path.join(skillRoot, "knowledge");

if (!existsSync(gatesRoot)) {
  issues.push(issue("error", "gates_layout.gates_missing", `checks/validation/business/ is missing under ${skillRoot}.`, "gates"));
} else if (!existsSync(playbookRoot)) {
  issues.push(
    issue(
      "error",
      "gates_layout.playbook_missing",
      "knowledge/ is missing, so the permitted gate domains cannot be derived. checks/validation/business/ mirrors knowledge/ by definition; there is no hardcoded fallback list on purpose.",
      "playbook",
    ),
  );
} else {
  const domains = new Set(
    readdirSync(playbookRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

  for (const entry of readdirSync(gatesRoot, { withFileTypes: true })) {
    // Rule 1: nothing executable sits at checks/validation/business/ root.
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      issues.push(
        issue(
          "error",
          "gates_layout.ungrouped_gate",
          `checks/validation/business/${entry.name} sits at the checks/validation/business/ root. Every gate nests in a domain folder — a genuinely cross-cutting gate belongs in checks/validation/business/process/, which docs/architecture.md defines as the cross-cutting launch-method domain. There is deliberately no top-level exception bucket.`,
          `checks/validation/business/${entry.name}`,
        ),
      );
      continue;
    }
    if (!entry.isDirectory()) continue;

    // Rule 2: every gate folder names a real playbook domain.
    if (!domains.has(entry.name)) {
      issues.push(
        issue(
          "error",
          "gates_layout.unknown_domain",
          `checks/validation/business/${entry.name}/ does not correspond to a playbook domain (${[...domains].sort().join(", ")}). checks/validation/business/ mirrors knowledge/: either add knowledge/${entry.name}/ with its README.md index, or file these gates under the domain that already owns the subject.`,
          `checks/validation/business/${entry.name}`,
        ),
      );
    }
  }
}

// Rule 3: basenames stay unique across every script root. indexScripts throws on
// a collision because a duplicate makes basename resolution ambiguous; catching
// it here turns a spawn-time crash into a reviewable audit failure.
try {
  indexScripts(skillRoot);
} catch (error) {
  issues.push(
    issue(
      "error",
      "gates_layout.duplicate_basename",
      `${error instanceof Error ? error.message : String(error)} A flat checks/validation/business/ made this impossible; the mirrored layout does not, so it is checked here instead of only at spawn time.`,
      SCRIPT_ROOTS.map((root) => `${root}/`).join(", "),
    ),
  );
}

reportAndExit("Gates layout check", issues);
