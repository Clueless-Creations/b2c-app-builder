/**
 * `b2c contribute <operation> [flags]` — the contributor and maintainer command family.
 *
 * Every subcommand calls the shared contribution service (kernel/contribution/service.ts), the
 * same service the opt-in contributor MCP projects read-only. Flags map one-to-one onto the
 * operation input schemas in contracts/contribution/contract.ts. Exit 0 means the request
 * succeeded and, for check and evaluate, that the result passed.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRIBUTION_OPERATIONS } from "../../contracts/contribution/contract.js";
import { resolveCallerPath } from "../../kernel/lib/cli.js";
import { callContributionOperation } from "../../kernel/contribution/service.js";
import type { CheckData, EvaluateData, PlanData, UpgradePlanData, UpstreamCheckData, UpstreamInventoryData } from "../../kernel/contribution/types.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const [command, ...argv] = process.argv.slice(2);
const operation = CONTRIBUTION_OPERATIONS.find((item) => item.cli === command);

const USAGE: Record<string, string> = {
  plan: "b2c contribute plan --source <https-url|path> [--source ...] --goal <text> [--scope business|contribution|maintenance] [--target <dir>] [--network] [--synthetic] [--json]",
  check: "b2c contribute check --target <contribution-root> [--json]",
  preview: "b2c contribute preview --target <contribution-root> [--json]",
  evaluate: "b2c contribute evaluate --target <contribution-root> [--suite <id>] [--allow-commands] [--json]",
  upstreams: "b2c contribute upstreams [--upstream <id>] [--observe-host] [--json]",
  "upstream-check": "b2c contribute upstream-check --upstream <id> [--fetch] [--observe-host] [--write] [--json]",
  "upgrade-plan": "b2c contribute upgrade-plan --upstream <id> [--candidate <tag>] [--target <dir>] [--json]",
};

function usage(): string {
  const lines = ["Usage: b2c contribute <operation> [flags]", "", "Operations:"];
  for (const item of CONTRIBUTION_OPERATIONS) lines.push(`  ${item.cli.padEnd(15)} ${item.title}${item.mcp ? "" : " (CLI-only)"}`);
  lines.push(
    "",
    ...Object.values(USAGE),
    "",
    "Intake never runs upstream code, hooks, generators, or provider setup. Writes happen only under --target or --write.",
  );
  return lines.join("\n");
}

if (!command || command === "--help" || command === "-h") {
  console.log(usage());
  process.exit(command ? 0 : 1);
}
if (!operation) {
  console.error(`Unknown contribute operation: ${command}\n\n${usage()}`);
  process.exit(1);
}
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${operation.description}\n\n${USAGE[operation.cli]}`);
  process.exit(0);
}

const BOOLEAN_FLAGS = new Set(["json", "network", "synthetic", "batch", "observe-host", "fetch", "write", "allow-commands"]);
const flags = new Map<string, string[] | true>();
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]!;
  if (!token.startsWith("--")) {
    console.error(`Unexpected argument: ${token}\n\n${USAGE[operation.cli]}`);
    process.exit(1);
  }
  const key = token.slice(2);
  if (BOOLEAN_FLAGS.has(key)) {
    flags.set(key, true);
    continue;
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`Flag --${key} needs a value.\n\n${USAGE[operation.cli]}`);
    process.exit(1);
  }
  index += 1;
  const current = flags.get(key);
  flags.set(key, Array.isArray(current) ? [...current, value] : [value]);
}
const one = (key: string): string | undefined => {
  const value = flags.get(key);
  return Array.isArray(value) ? value[value.length - 1] : undefined;
};
const many = (key: string): string[] => {
  const value = flags.get(key);
  return Array.isArray(value) ? value : [];
};
const bool = (key: string): boolean => flags.get(key) === true;
const json = bool("json");
const callerCwd = process.env.B2C_APP_BUILDER_CALLER_CWD?.trim() || process.cwd();
const localPath = (value: string | undefined): string | undefined => (value === undefined ? undefined : resolveCallerPath(value));

let input: Record<string, unknown>;
switch (operation.id) {
  case "contribution.plan":
    input = {
      sources: many("source").map((source) => (/^https:\/\//u.test(source) ? { url: source } : { path: resolveCallerPath(source) })),
      goal: one("goal"),
      ...(one("scope") ? { scope: one("scope") } : {}),
      ...(one("target") ? { target: localPath(one("target")) } : {}),
      ...(bool("synthetic") ? { synthetic: true } : {}),
      ...(bool("network") ? { network: true } : {}),
      ...(bool("batch") ? { batch: true } : {}),
    };
    break;
  case "contribution.check":
  case "contribution.preview":
    input = { target: localPath(one("target")) };
    break;
  case "contribution.evaluate":
    input = { target: localPath(one("target")), ...(one("suite") ? { suite: one("suite") } : {}), ...(bool("allow-commands") ? { allowCommands: true } : {}) };
    break;
  case "upstreams.list":
    input = { ...(one("upstream") ? { upstreamId: one("upstream") } : {}), ...(bool("observe-host") ? { observeHost: true } : {}) };
    break;
  case "upstreams.check":
    input = {
      upstreamId: one("upstream"),
      ...(bool("fetch") ? { fetch: true } : {}),
      ...(bool("write") ? { write: true } : {}),
      ...(bool("observe-host") ? { observeHost: true } : {}),
    };
    break;
  case "upstreams.upgrade-plan":
    input = {
      upstreamId: one("upstream"),
      ...(one("candidate") ? { candidate: one("candidate") } : {}),
      ...(one("target") ? { target: localPath(one("target")) } : {}),
    };
    break;
  default: {
    const exhaustive: never = operation;
    console.error(`Unhandled operation ${JSON.stringify(exhaustive)}`);
    process.exit(1);
  }
}

const result = await callContributionOperation(operation.id, input, { surface: "cli", skillRoot, cwd: callerCwd });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else if (!result.ok) {
  console.error(`${result.error.code}: ${result.error.message}${result.error.fields.length ? ` (${result.error.fields.join(", ")})` : ""}`);
  console.error(result.error.recovery);
} else {
  console.log(renderText(operation.id, result.data));
  for (const warning of result.warnings) console.log(`WARNING ${warning}`);
}

let exitCode = result.ok ? 0 : 1;
if (result.ok && (operation.id === "contribution.check" || operation.id === "contribution.evaluate")) {
  exitCode = (result.data as CheckData | EvaluateData).pass ? 0 : 1;
}
process.exit(exitCode);

function renderText(id: string, data: unknown): string {
  switch (id) {
    case "contribution.plan": {
      const plan = data as PlanData;
      const lines = [
        `Contribution plan ${plan.manifest.id} (${plan.manifest.scope}; routing: ${plan.routing.verdict}, ${plan.routing.reason})`,
        `Sources: ${plan.manifest.sources.length}; units: ${plan.manifest.units.length}; refused directives: ${plan.refusedDirectives}; network: ${plan.networkUsed ? "used" : "not used"}`,
      ];
      if (plan.written) lines.push(`Written: ${plan.written.contributionYaml}`, `Written: ${plan.written.adoptionMap}`);
      else lines.push("Dry run: nothing written. Pass --target <dir> to write contribution.yaml and ADOPTION_MAP.md.");
      lines.push("", plan.adoptionMapMarkdown);
      return lines.join("\n");
    }
    case "contribution.check": {
      const check = data as CheckData;
      const lines = [`Contribution check ${check.manifestId}: ${check.pass ? "PASS" : "FAIL"}`];
      for (const issue of check.issues) lines.push(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
      lines.push(
        `${check.summary.units} unit(s), ${check.summary.sources} source(s), ${check.summary.rightsVerified} rights verified, ${check.summary.rightsUnknown} rights unknown, ${check.summary.copiedUnits} copied, ${check.summary.originalUnits} original, ${check.summary.refusedDirectives} refused directive(s), ${check.summary.evaluations} evaluation(s).`,
      );
      return lines.join("\n");
    }
    case "contribution.preview": {
      const preview = data as {
        manifestId: string;
        units: Array<{ unitId: string; delivered: boolean; reason: string; coverage: string; boundWorkflowIds: string[] }>;
        excluded: Array<{ unitId: string; reason: string }>;
        incompleteCoverage: string[];
      };
      const lines = [`Runtime delivery preview for ${preview.manifestId} (no catalog or workspace change)`];
      for (const unit of preview.units)
        lines.push(
          `${unit.delivered ? "DELIVERED" : "EXCLUDED "} ${unit.unitId}: ${unit.reason}${unit.boundWorkflowIds.length ? ` [${unit.boundWorkflowIds.join(", ")}]` : ""} coverage=${unit.coverage}`,
        );
      const listed = new Set(preview.units.map((unit) => unit.unitId));
      for (const item of preview.excluded) if (!listed.has(item.unitId)) lines.push(`EXCLUDED  ${item.unitId}: ${item.reason}`);
      if (preview.incompleteCoverage.length) lines.push(`Incomplete coverage: ${preview.incompleteCoverage.join("; ")}`);
      return lines.join("\n");
    }
    case "contribution.evaluate": {
      const evaluation = data as EvaluateData;
      const lines = [`Evaluation ${evaluation.manifestId}: ${evaluation.pass ? "PASS" : "NOT PASSED"}`];
      for (const item of evaluation.cases) lines.push(`${item.status.toUpperCase().padEnd(16)} ${item.id} (${item.kind}): ${item.detail}`);
      return lines.join("\n");
    }
    case "upstreams.list": {
      const inventory = data as UpstreamInventoryData;
      const lines = [`Upstream inventory (${inventory.upstreams.length} manifest(s); ${inventory.coverage.note})`];
      for (const row of inventory.upstreams) {
        const latest = row.latestStable === "unknown" ? "latest: unknown" : `latest: ${row.latestStable.tag} (${row.latestStable.publishedAt.slice(0, 10)})`;
        const installed =
          row.installed === "unknown" || row.installed === "not-observed"
            ? `installed: ${row.installed}`
            : `installed: ${row.installed.version ?? "unknown"} at ${row.installed.path}${row.installed.shadowed.length ? ` (shadows ${row.installed.shadowed.join(", ")})` : ""}`;
        lines.push(
          `- ${row.id}: ${row.project} [${row.relationships.join(", ")}] license ${row.license.spdx}/${row.license.status}; reviewed source ${row.reviewedSource}; guidance ${row.reviewedGuidance}; ${latest}; ${installed}; review ${row.review.status}${row.review.due ? " (due)" : ""}`,
        );
        for (const unknown of row.unknowns) lines.push(`    unknown: ${unknown}`);
      }
      for (const issue of inventory.issues) lines.push(`ISSUE ${issue.code}: ${issue.message}`);
      return lines.join("\n");
    }
    case "upstreams.check": {
      const check = data as UpstreamCheckData;
      const lines = [
        `Upstream check ${check.upstreamId} (${check.networkUsed ? "fetched" : "recorded observation"}; checked ${check.observation.checkedAt})`,
        `Baseline: source ${check.baseline.reviewedSource}, guidance ${check.baseline.reviewedGuidance}`,
        `Latest stable: ${check.observation.latestStable ? `${check.observation.latestStable.tag} (${check.observation.latestStable.publishedAt.slice(0, 10)})` : "unknown"}; branch head: ${check.observation.branchHead ? `${check.observation.branchHead.sha.slice(0, 12)} (${check.observation.branchHead.committedAt.slice(0, 10)})` : "unknown"}`,
        `Installed vs supported: ${check.drift.installedVersusSupported}; installed vs latest: ${check.drift.installedVersusLatest}; shadowed: ${check.drift.shadowedExecutables.join(", ") || "none"}; license changed: ${String(check.drift.licenseChanged)}; branch ahead of release: ${String(check.drift.branchAheadOfRelease)}`,
        `Recommendation: ${check.recommendation}`,
      ];
      for (const change of check.changes)
        lines.push(
          `  ${change.tag} ${change.classification}${change.matchedOperations.length ? ` -> ${change.matchedOperations.join(", ")}` : ""}: ${change.line}`,
        );
      if (check.affectedLocalOwners.length) lines.push(`Affected local owners: ${check.affectedLocalOwners.join(", ")}`);
      for (const unknown of check.unknowns) lines.push(`unknown: ${unknown}`);
      if (check.written) lines.push(`Written: ${check.written}`);
      return lines.join("\n");
    }
    case "upstreams.upgrade-plan": {
      const plan = data as UpgradePlanData;
      const lines = [
        `Upgrade plan ${plan.upstreamId}: candidate ${plan.candidate ? plan.candidate.revision : "unknown"}; baseline source ${plan.baseline.reviewedSource}, guidance ${plan.baseline.reviewedGuidance}`,
        `Affected operations: ${plan.affectedOperations.join(", ") || "none mapped"}`,
        `New upstream features outside the support contract: ${plan.newFeaturesNotSupported.length}`,
        "Expected local diff:",
        ...plan.expectedLocalDiff.map((entry) => `  - ${entry.path}: ${entry.change}`),
        "Retained adaptations:",
        ...plan.retainedAdaptations.map((entry) => `  - ${entry.id}: ${entry.description}`),
        "Required verification:",
        ...plan.requiredVerification.map((entry) => `  - ${entry}`),
        "Adoption notes:",
        ...plan.adoptionNotes.map((entry) => `  - ${entry}`),
      ];
      for (const unknown of plan.unknowns) lines.push(`unknown: ${unknown}`);
      if (plan.written) lines.push(`Written: ${plan.written}`);
      return lines.join("\n");
    }
    default:
      return JSON.stringify(data, null, 2);
  }
}
