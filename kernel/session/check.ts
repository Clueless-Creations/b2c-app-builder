#!/usr/bin/env node
/**
 * b2c check — run one named gate (an npm `check:*` script from the skill package) and report
 * its verdict, with structured `--json` failures naming the offending rule, path, and (when a
 * validator supplies one) location and fix hint. D1, #32: a founder should be able to fix an
 * artifact from a failure, not have to memorize each validator's own text dialect.
 *
 *   b2c check --list
 *   b2c check <name> [--workspace <id-or-path>] [--json]
 *
 * `<name>` is a `check:*` npm script name with the `check:` prefix stripped (e.g. `product-md`,
 * `no-slop`, `onboarding-evidence-onb-05`) — see catalog/gates.ts's `checkNames()`, the live
 * registry this command validates `<name>` against.
 *
 * `--workspace` targets a real business workspace exactly the way kernel/session/run.ts's
 * deterministic gates do: both share tooling/lib/audit-plan.ts's canonical per-gate argument
 * shapes (`--root`/`--state`/`--skill-root`), so a gate never runs with the wrong directory or
 * silently validates the skill's own reference workspace instead. Omit `--workspace` to self-check
 * the skill's own shipped reference business — the same target an unmodified `npm run check:<name>`
 * gives a maintainer.
 *
 * A child gate inherits this process's environment and the target workspace's content, so its raw
 * stdout/stderr must never be forwarded into a retained `--json` result — it may carry credentials,
 * customer data, or internal paths (the same stance kernel/session/run.ts takes for the same reason).
 * A gate that crashes before its reporter runs, or that exceeds the shared gate timeout, is instead
 * reported as one synthesized generic failure.
 *
 * Exit codes: 0 = the gate passed; 1 = the gate failed, the name is unknown, or execution errored.
 */
import { spawnSync } from "node:child_process";
import { checkNames } from "../../catalog/gates.js";
import { buildAuditPlan, stripAuditOnlyFlags, GATE_TIMEOUT_MS, type AuditStep } from "../../tooling/lib/audit-plan.js";
import { isMainModule } from "../lib/cli.js";
import { skillRoot } from "./reducer-cli.js";
import { resolveCliWorkspace } from "./status.js";

/**
 * A pre-parse or shape-validation refusal, printed as one JSON object on stderr — the same
 * {actionStatus, reasonCode, reason, field} shape kernel/session/operate.ts already establishes,
 * so a caller (human or MCP client) can act on the failure instead of re-reading a sentence.
 */
interface StructuredCliError {
  actionStatus: "refused";
  reasonCode: string;
  reason: string;
  field?: string;
}

function failStructured(error: StructuredCliError): never {
  console.error(JSON.stringify(error));
  process.exit(1);
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

/** Hand-rolled positional parsing (mirrors new.ts's slug parsing): the first non-flag token is the check name. */
function positionalName(argv: string[]): string | undefined {
  const valueFlags = new Set(["--workspace", "--name"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("--")) {
      if (valueFlags.has(token)) index += 1;
      continue;
    }
    return token;
  }
  return undefined;
}

/** {pass, failures} recovered from a child gate's own `--json` stdout, or undefined when it did not parse. */
function parseGateJson(stdout: string): { pass: boolean; failures: unknown[] } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return undefined;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as { pass?: unknown }).pass === "boolean" &&
    Array.isArray((parsed as { failures?: unknown }).failures)
  ) {
    return { pass: (parsed as { pass: boolean }).pass, failures: (parsed as { failures: unknown[] }).failures };
  }
  return undefined;
}

export function main(argv = process.argv.slice(2)): number {
  const json = argv.includes("--json");

  if (argv.includes("--list")) {
    const names = checkNames(skillRoot());
    console.log(json ? JSON.stringify({ checks: names }) : names.join("\n"));
    return 0;
  }

  const name = flagValue(argv, "--name") ?? positionalName(argv);
  if (!name) {
    console.error("check.missing_argument: a check name is required\nUsage: b2c check <name> [--workspace <id-or-path>] [--json]  (b2c check --list)");
    return 1;
  }

  const names = checkNames(skillRoot());
  if (!names.includes(name)) {
    failStructured({
      actionStatus: "refused",
      reasonCode: "check.unknown_name",
      reason: `"${name}" is not a known check. Run \`b2c check --list\` for the full set.`,
      field: "name",
    });
  }

  const workspaceRef = flagValue(argv, "--workspace");
  const env: NodeJS.ProcessEnv = { ...process.env };
  let plan: AuditStep[];
  if (workspaceRef !== undefined) {
    const resolved = resolveCliWorkspace(workspaceRef);
    if (!resolved.ok) {
      console.error(resolved.message);
      return 1;
    }
    plan = buildAuditPlan("repo", { businessRoot: resolved.path, skillRoot: skillRoot() });
    env.BUSINESS_ROOT = resolved.path;
  } else {
    plan = buildAuditPlan("skill");
  }
  const overrideArgs = stripAuditOnlyFlags(plan.find((step) => step.id === `check:${name}`)?.args ?? []);
  const command = `check:${name}`;
  const spawnArgs = ["run", "--silent", "--prefix", skillRoot(), command, "--", ...overrideArgs, ...(json ? ["--json"] : [])];

  if (!json) {
    // Byte-identical to a human running the npm script directly: real stdout/stderr, real exit code.
    const result = spawnSync("npm", spawnArgs, { cwd: skillRoot(), stdio: "inherit", env, timeout: GATE_TIMEOUT_MS });
    return result.status ?? 1;
  }

  const result = spawnSync("npm", spawnArgs, { cwd: skillRoot(), encoding: "utf8", env, timeout: GATE_TIMEOUT_MS });
  const parsedGate = parseGateJson(result.stdout ?? "");
  const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  const body = parsedGate ?? {
    pass: false,
    failures: [
      {
        severity: "error" as const,
        rule: timedOut ? "check.timed_out" : "check.execution_error",
        message: timedOut ? `${command} did not finish within ${GATE_TIMEOUT_MS / 1000}s.` : `${command} exited without producing a readable --json result.`,
      },
    ],
  };
  // The child's own exit code stays authoritative — never recomputed from the parsed pass field.
  console.log(JSON.stringify({ check: name, command, ...body }));
  return result.status === 0 ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
