#!/usr/bin/env node
/**
 * catalog:add-workflow — the workflow scaffolder (layering plan phase E, requirement R8).
 *
 * Authoring a workflow used to mean knowing five unwritten steps by heart: which
 * catalog/workflows/*.ts file owns the area, the workflow() seed shape, the count fixture that
 * pins the catalog's totals, the projection re-render, and — when the workflow carries a new
 * gate — the whole validator registration chain. This tool does the mechanical steps itself and
 * NAMES every remaining one with its exact location, so nothing is remembered and nothing is
 * silent:
 *
 *   npm run catalog:add-workflow -- --id workflow.<domain>.<slug> --title "..." \
 *     --domain domain.<x> --areas area.<a>[,area.<b>] --role role.<r> --trigger "..." \
 *     --file <one of the six workflow files> [--action-class draft] [--gates check:x,...] \
 *     [--outputs path,...] [--reads path,...] [--depends workflow.id,...] \
 *     [--references reference.id,...] [--recurrence-days N] [--skill-root <dir>] [--no-render]
 *
 * What it writes: the workflow() seed appended to the chosen file, and the count fixture in
 * checks/verification/fixtures/catalog.fixtures.ts bumped by one. What it deliberately does NOT do:
 * write real instructions (the placeholder demands replacement), register a new gate script
 * (five registration points, printed with paths), or bind knowledge (knowledge:add owns that).
 * check:catalog is the arbiter afterwards — a scaffold with no outputs and no gates fails it by
 * design (contract_empty), because an empty contract is not a workflow.
 *
 * --skill-root and --no-render exist for the fixture suite; consumers never need them.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { areas } from "../catalog/areas.js";
import { domains } from "../catalog/domains.js";
import { roles } from "../catalog/roles.js";
import { resolveTsxCommand } from "./lib/tsx-bin.js";

const realSkillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_FILES = ["build-release.ts", "growth-revenue.ts", "maintenance.ts", "operating-system.ts", "operations-trust.ts", "product-experience.ts"];
const ACTION_CLASSES = ["observe", "draft", "mutate", "publish", "spend", "release", "destructive"];
const PROTECTED_ACTION_CLASSES = new Set(["publish", "spend", "release", "destructive"]);

function options(): Map<string, string> {
  const map = new Map<string, string>();
  const argv = process.argv;
  for (let index = 3; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag?.startsWith("--")) map.set(flag.slice(2), value ?? "true");
  }
  return map;
}

function required(map: Map<string, string>, name: string): string {
  const value = map.get(name)?.trim();
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function csv(map: Map<string, string>, name: string): string[] {
  return (map.get(name) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function addWorkflow(): void {
  const opts = options();
  const skillRoot = opts.get("skill-root") ? path.resolve(opts.get("skill-root")!) : realSkillRoot;

  const id = required(opts, "id");
  if (!/^workflow\.[a-z0-9-]+\.[a-z0-9-]+$/.test(id)) throw new Error(`--id must look like workflow.<domain>.<slug> (lowercase, hyphens), got "${id}".`);
  const title = required(opts, "title");
  const domainId = required(opts, "domain");
  if (!domains.some((domain) => domain.id === domainId))
    throw new Error(`Unknown domain: ${domainId}. Known: ${domains.map((domain) => domain.id).join(", ")}`);
  const areaIds = csv(opts, "areas");
  if (areaIds.length === 0) throw new Error("--areas is required (comma-separated area ids).");
  for (const areaId of areaIds) {
    if (!areas.some((area) => area.id === areaId)) throw new Error(`Unknown area: ${areaId}. Known: ${areas.map((area) => area.id).join(", ")}`);
  }
  const roleId = required(opts, "role");
  if (!roles.some((role) => role.id === roleId)) throw new Error(`Unknown role: ${roleId}. Known: ${roles.map((role) => role.id).join(", ")}`);
  const trigger = required(opts, "trigger");
  const file = required(opts, "file");
  if (!WORKFLOW_FILES.includes(file)) throw new Error(`--file must be one of: ${WORKFLOW_FILES.join(", ")}`);
  const actionClass = opts.get("action-class") ?? "draft";
  if (!ACTION_CLASSES.includes(actionClass)) throw new Error(`--action-class must be one of: ${ACTION_CLASSES.join(", ")}`);

  const gates = csv(opts, "gates");
  const outputs = csv(opts, "outputs");
  const reads = csv(opts, "reads");
  const depends = csv(opts, "depends");
  const references = csv(opts, "references");
  const recurrenceDays = opts.get("recurrence-days");

  // Duplicate check against the files on disk, not the compiled import — the import reflects
  // process start, the disk reflects now.
  const workflowsDir = path.join(skillRoot, "catalog", "workflows");
  for (const candidate of WORKFLOW_FILES) {
    const candidatePath = path.join(workflowsDir, candidate);
    if (existsSync(candidatePath) && readFileSync(candidatePath, "utf8").includes(`"${id}"`)) {
      throw new Error(`workflow.id_taken: "${id}" already exists in catalog/workflows/${candidate}.`);
    }
  }

  const targetPath = path.join(workflowsDir, file);
  const source = readFileSync(targetPath, "utf8");
  const anchor = "] as const;";
  if (!source.trimEnd().endsWith(anchor))
    throw new Error(`catalog/workflows/${file} does not end with "${anchor}" — the insertion anchor moved; update this scaffolder.`);

  const lines: string[] = [
    "  workflow({",
    `    id: ${JSON.stringify(id)},`,
    `    title: ${JSON.stringify(title)},`,
    `    domainId: ${JSON.stringify(domainId)},`,
    `    areaIds: [${areaIds.map((entry) => JSON.stringify(entry)).join(", ")}],`,
    `    trigger: ${JSON.stringify(trigger)},`,
    // Empty is a valid "not participating yet" default (see CatalogWorkflowDef's own doc comment,
    // issue #58) — a scaffolded workflow has no founder-facing history to phrase from until its real
    // instructions are written; author 3-6 short founderPhrasings by hand once they are.
    "    founderPhrasings: [],",
    "    instructions:",
    '      "SCAFFOLD PLACEHOLDER — replace with the real, checkable procedure for this workflow before merging; check:no-slop and review both read it.",',
  ];
  if (reads.length > 0) lines.push(`    reads: [${reads.map((entry) => JSON.stringify(entry)).join(", ")}],`);
  lines.push(`    roleId: ${JSON.stringify(roleId)},`);
  if (depends.length > 0) lines.push(`    dependencies: [${depends.map((entry) => JSON.stringify(entry)).join(", ")}],`);
  if (outputs.length > 0) lines.push(`    outputPaths: [${outputs.map((entry) => JSON.stringify(entry)).join(", ")}],`);
  if (gates.length > 0) lines.push(`    gates: [${gates.map((entry) => JSON.stringify(entry)).join(", ")}],`);
  if (references.length > 0) lines.push(`    references: [${references.map((entry) => JSON.stringify(entry)).join(", ")}],`);
  lines.push(`    actionClass: ${JSON.stringify(actionClass)},`);
  if (PROTECTED_ACTION_CLASSES.has(actionClass)) {
    lines.push('    protectedCategory: "spend", // SCAFFOLD PLACEHOLDER — pick the real ProtectedCategory for this action class.');
  }
  if (recurrenceDays) lines.push(`    recurrenceDays: ${Number(recurrenceDays)},`);
  lines.push("    idempotent: true,");
  lines.push("  }),");

  const insertion = `${lines.join("\n")}\n${anchor}`;
  writeFileSync(targetPath, `${source.trimEnd().slice(0, -anchor.length)}${insertion}\n`, "utf8");

  // The count fixture: the one place the catalog's workflow total is pinned. Bumping it here is
  // what makes the scaffold visible to the audit instead of silently failing it.
  const fixturePath = path.join(skillRoot, "checks", "verification", "fixtures", "catalog.fixtures.ts");
  const fixture = readFileSync(fixturePath, "utf8");
  const countPattern = /composition\.base\.workflows === (\d+), `expected base (\d+) workflows/;
  const match = fixture.match(countPattern);
  if (!match) throw new Error(`the workflow-count assertion moved in ${fixturePath} — update this scaffolder's pattern.`);
  const next = Number(match[1]) + 1;
  writeFileSync(fixturePath, fixture.replace(countPattern, `composition.base.workflows === ${next}, \`expected base ${next} workflows`), "utf8");

  if (!opts.has("no-render")) {
    const command = resolveTsxCommand(skillRoot, [path.join(skillRoot, "catalog", "render-routing.ts")]);
    const render = spawnSync(command.executable, command.args, { cwd: skillRoot, encoding: "utf8" });
    if (render.status !== 0) throw new Error(`catalog render failed after the insert: ${(render.stderr ?? "").slice(-400)}`);
  }

  console.log(`Created workflow ${id} in catalog/workflows/${file}; count fixture now expects ${next}.`);
  console.log("");
  console.log("What this scaffold did NOT do — each is named so nothing rots silently:");
  console.log("  1. instructions is a placeholder. Write the real, checkable procedure (>= 40 chars, not an echo of the title).");
  if (outputs.length === 0 && gates.length === 0) {
    console.log(
      "  2. No outputs and no gates were given: check:catalog will fail with contract_empty until the workflow declares at least one — an empty contract is not a workflow.",
    );
  }
  if (gates.length > 0) {
    console.log("  2. Every gate must already be a registered gate command. A NEW gate script needs the full chain:");
    console.log("     - the script under checks/validation/, plus a check:* entry in BOTH package.jsons (root + skill)");
    console.log("     - a step in tooling/lib/audit-plan.ts");
    console.log("     - a row in docs/validators.md");
    console.log("     - knownValidators in the launchbench runner");
    console.log("     - the port-ledger row and its Total line");
  }
  console.log(`  3. Knowledge bindings go through their own front door: npm run knowledge:add -- --id reference.<domain>.<name> --workflows ${id}`);
  console.log("  4. Prove it: npm run check:catalog && npm run test:fixtures, then the full npm run audit from the repository root.");
}

const command = process.argv[2];
if (command === "add-workflow") addWorkflow();
else throw new Error("Use add-workflow.");
