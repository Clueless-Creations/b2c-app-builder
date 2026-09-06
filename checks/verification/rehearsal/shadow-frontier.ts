#!/usr/bin/env node
/**
 * Read-only shadow check for a live business (U10): validate a migrated state v2 document,
 * compile the real catalog, seed a throwaway run, and print the frontier a first scheduled
 * session would see. Writes nothing into the shadow workspace's state.
 *
 * Usage: tsx checks/verification/rehearsal/shadow-frontier.ts <shadow-workspace-dir>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { allowAllAutonomyEvaluator, computeFrontier } from "../../../kernel/engine/frontier.js";
import { seedRunState } from "../../../kernel/engine/runstate.js";
import { validateBusinessState } from "../../../kernel/schema/index.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import type { CatalogInput } from "../../../kernel/engine/compile.js";

const workspace = process.argv[2];
if (!workspace) {
  console.error("Usage: tsx checks/verification/rehearsal/shadow-frontier.ts <shadow-workspace-dir>");
  process.exit(1);
}
const state = JSON.parse(readFileSync(path.join(workspace, "state/business-state.json"), "utf8")) as BusinessStateV2;
const validation = validateBusinessState(state);
const issues = validation.issues;
console.log(`shadow state valid: ${validation.valid ? "yes" : `no — ${issues.length} issue(s)`}`);
for (const issue of issues.slice(0, 5)) console.log(`  ISSUE ${issue.code}: ${issue.message}`);

const catalog = JSON.parse(readFileSync(path.join(workspace, "catalog.json"), "utf8")) as CatalogInput;
const plan = compilePlan(catalog);
const run = seedRunState(plan, state, { ownerSessionId: "shadow-readonly", ttlSeconds: 300, wallClockCapSeconds: 60, now: new Date().toISOString() });
const frontier = computeFrontier(plan, run, state, allowAllAutonomyEvaluator);
const statuses: Record<string, number> = {};
for (const node of Object.values(run.nodes)) statuses[node.status] = (statuses[node.status] ?? 0) + 1;
console.log("shadow seeded statuses:", JSON.stringify(statuses));
console.log("shadow frontier (first scheduled session would consider):");
for (const id of frontier.ready.slice(0, 10)) {
  const node = plan.nodes.find((candidate) => candidate.id === id);
  console.log(`  READY ${node?.title ?? id}`);
}
if (!validation.valid) process.exitCode = 1;
