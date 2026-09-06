#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isMainModule, parseArgs } from "../lib/cli.js";
import type { StatePatch } from "../reducer/patch.js";
import type { BusinessStateV2 } from "../schema/types.js";
import { runReducer } from "./reducer-cli.js";
import { resolveWorkspacePaths } from "./run.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";
import { resolveCliWorkspace } from "./status.js";

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const verdict = args.verdict;
  if (!args.workspace || !args.workflow || !args.session || !args.reason || (verdict !== "required" && verdict !== "not-needed")) {
    console.error(
      "Usage: scope.ts --workspace <id-or-path> --workflow <id> --verdict required|not-needed --reason <text> --session <id> [--evidence <comma-separated paths>]",
    );
    return 1;
  }
  const resolvedWorkspace = resolveCliWorkspace(args.workspace!);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  const compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) {
    console.error(`ISSUE scope.compatibility: ${renderCatalogRefusal(compatible.refusal)}`);
    return 1;
  }
  const paths = resolveWorkspacePaths(workspace);
  const catalog = compatible.catalog;
  const workflow = catalog.workflows.find((item) => item.id === args.workflow);
  if (!workflow) {
    console.error(`ISSUE scope.unknown_workflow: ${args.workflow}`);
    return 1;
  }
  // A verdict is recordable for a workflow that asks its own conditional question OR one a
  // launch profile can defer — the founder's recorded verdict is what outranks the profile
  // (reconcileWorkflowApplicability's precedence), so this front door must accept it.
  const profileDeferrable = (catalog.profiles ?? []).some(
    (profile) => workflow.laneIds.length > 0 && workflow.laneIds.every((laneKey) => profile.defersLaneKeys.includes(laneKey)),
  );
  if (workflow.applicability?.mode !== "conditional" && !profileDeferrable) {
    console.error(`ISSUE scope.not_conditional: ${args.workflow} neither asks a conditional question nor sits in any profile's deferred lanes`);
    return 1;
  }
  const state = JSON.parse(readFileSync(paths.state, "utf8")) as BusinessStateV2;
  const now = new Date().toISOString();
  const next = {
    ...(state.workflowApplicability ?? {}),
    [args.workflow]: {
      verdict,
      reason: args.reason,
      evidence: (args.evidence ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      updatedAt: now,
    },
  };
  const patch: StatePatch = {
    schemaVersion: "1.0.0",
    patchId: `scope:${args.session}:${args.workflow}:${Date.now()}`,
    targetDoc: "business-state",
    reason: `Record applicability for ${args.workflow}: ${args.reason}`,
    authoredBy: args.session,
    authoredAt: now,
    preconditions: [{ path: ["updatedAt"], operator: "equals", value: state.updatedAt }],
    ops: [{ op: "set", path: ["workflowApplicability"], value: next }],
    declaredOutputs: [["workflowApplicability"]],
  };
  const result = runReducer(
    ["commit", "--file", paths.state, "--manifest", paths.manifest, "--audit", paths.audit, "--session", args.session],
    JSON.stringify(patch),
  );
  if (result.code !== 0) {
    console.error(result.output.trim());
    return 1;
  }
  console.log(`RECORDED ${args.workflow} ${verdict}`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = main();
