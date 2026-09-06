#!/usr/bin/env node
/**
 * The B2C App Builder command-line interface.
 *
 * This dispatcher exposes the session commands in the order an app business uses them:
 *
 *   b2c bootstrap --workspace <dir> [--apply] [--answers <file>]   one-time workspace setup
 *   b2c founder-key install --public-key-file <file> [--apply]    install external founder trust
 *   b2c status    --workspace <id-or-path> [--json]               read-only run status
 *   b2c check     <name> [--workspace <id-or-path>] [--json]       run one named gate (b2c check --list)
 *   b2c plan      --workspace <dir>                                read-only frontier report
 *   b2c run       --workspace <dir> --brief <file> --session <id>  one bounded headless session
 *   b2c approve   --workspace <dir> [--list] ...                   the founder decision edge
 *   b2c verify    --workspace <dir> [--list] ...                   the operator verification edge
 *   b2c proof     --workspace <dir> [--platform ios|android] ...   one-target device proof (Route Ladder rung 2/4)
 *   b2c browser-proof --workspace <dir> --session-id <id> ...     fresh Chrome landing-runtime proof
 *   b2c onboard   --workspace <dir> --answers <file>               grants/waivers/budgets
 *   b2c schedule  --workspace <dir> --runtime <cli> --schedule "<cron>" [--apply]
 *   b2c contribute <plan|check|preview|evaluate|upstreams|upstream-check|upgrade-plan> ...   source adoption and upstream maintenance
 *
 * Every subcommand runs the TypeScript implementation under kernel/ and adapters/. This file adds one stable
 * command address and passes exit codes through unchanged.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const COMMANDS = new Map([
  ["research-lookup", { script: "entrypoints/cli/business.ts", prefixArgs: ["research-lookup"], summary: "read saved research before a new provider query" }],
  [
    "research-record",
    { script: "entrypoints/cli/business.ts", prefixArgs: ["research-record"], summary: "revision-checked checkpoint for registered planning research" },
  ],
  ["business-create", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-create"], summary: "b2c/v1: create a registered hypothesis" }],
  ["business-initialize", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-initialize"], summary: "b2c/v1: initialize accepted product" }],
  ["business-plan", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-plan"], summary: "b2c/v1: passive authorized work preview" }],
  ["business-recover", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-recover"], summary: "b2c/v1: close a reconciled interrupted request" }],
  ["business-run", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-run"], summary: "b2c/v1: bounded revision-checked session" }],
  ["business-evidence", { script: "entrypoints/cli/business.ts", prefixArgs: ["business-evidence"], summary: "b2c/v1: current accepted evidence" }],

  ["packages", { script: "entrypoints/cli/business.ts", prefixArgs: ["packages"], summary: "b2c/v1: inspect installed snapshots" }],
  ["package-import", { script: "entrypoints/cli/business.ts", prefixArgs: ["package-import"], summary: "b2c/v1: import operator-selected local package" }],
  ["composition-plan", { script: "entrypoints/cli/business.ts", prefixArgs: ["composition-plan"], summary: "b2c/v1: preview installed package activation" }],
  ["composition-activate", { script: "entrypoints/cli/business.ts", prefixArgs: ["composition-activate"], summary: "b2c/v1: activate exact preview" }],
  [
    "composition-recover",
    { script: "entrypoints/cli/business.ts", prefixArgs: ["composition-recover"], summary: "b2c/v1: resume or restore local activation" },
  ],
  ["market-report", { script: "entrypoints/cli/business.ts", prefixArgs: ["market-report"], summary: "b2c/v1: read comparable independent business outcomes" }],

  ["catalog", { script: "entrypoints/cli/business.ts", prefixArgs: ["catalog"], summary: "b2c/v1: discover capabilities, providers, and recipes (--json)" }],
  [
    "compose",
    {
      script: "entrypoints/cli/business.ts",
      prefixArgs: ["compose"],
      summary: "b2c/v1: preview a business composition (--config b2c.yaml --json); apply is unavailable",
    },
  ],
  [
    "business-status",
    {
      script: "entrypoints/cli/business.ts",
      prefixArgs: ["business-status"],
      summary: "b2c/v1: registered business lifecycle and work counts (--workspace <id> --json)",
    },
  ],
  ["setup", { script: "kernel/session/setup.ts", summary: "one-time machine preparation: b2c home, empty registry, health checks, next steps" }],
  [
    "founder-key",
    {
      script: "kernel/session/founder-key.ts",
      summary: "install the protected founder Ed25519 public-key trust store (dry-run by default)",
    },
  ],
  ["doctor", { script: "kernel/session/doctor.ts", summary: "read-only health report: node, tsx, compiled catalog, registry, and YOUR worker CLIs" }],
  ["new", { script: "kernel/session/new.ts", summary: "create a small planning workspace: b2c new <slug> [--dir <path>] [--idea <hypothesis>]" }],
  [
    "render-product",
    { script: "tooling/render-product.ts", summary: "render PRODUCT.md from product.yaml: b2c render-product --workspace <id-or-path> [--check]" },
  ],
  [
    "bootstrap",
    {
      script: "kernel/session/bootstrap.ts",
      summary: "compose entrypoints, workspace state, reducer baseline, and onboarding into a runnable workspace (dry-run by default)",
    },
  ],
  ["status", { script: "kernel/session/status.ts", summary: "read-only workspace status: durable run counts and latest founder digest" }],
  [
    "check",
    {
      script: "kernel/session/check.ts",
      summary: "run one named gate: b2c check <name> --workspace <id-or-path> [--json] (b2c check --list)",
    },
  ],
  ["plan", { script: "kernel/session/plan.ts", summary: "read-only frontier report: what would run, what is parked, and why" }],
  ["run", { script: "kernel/session/run.ts", summary: "one bounded headless session: resume durable state, dispatch, verify, digest" }],
  ["approve", { script: "kernel/session/approve.ts", summary: "record a founder approval, direct design-taste verdict, or audit delegation" }],
  ["verify", { script: "kernel/session/verify.ts", summary: "fresh-context acceptance for produced work (producer never verifies its own)" }],
  [
    "proof",
    {
      script: "kernel/session/proof.ts",
      summary: "one-target device proof: select iOS or Android, run its Route Ladder adapter, and write a bounded receipt",
    },
  ],
  [
    "browser-proof",
    {
      script: "tooling/browser-proof.ts",
      summary: "fresh Chrome landing proof from an authored, current-candidate browser-proof.json config",
    },
  ],
  [
    "scope",
    { script: "kernel/session/scope.ts", summary: "record a founder applicability verdict: answer a conditional question or override a profile deferral" },
  ],
  ["onboard", { script: "kernel/session/onboard.ts", summary: "apply founder grants, waivers, and budgets through the reducer" }],
  ["schedule", { script: "adapters/install-schedule.ts", summary: "install or remove the OS-level trigger for recurring sessions (dry-run by default)" }],
  ["workspaces", { script: "kernel/session/workspaces.ts", summary: "the machine's registry of its businesses: list, register, remove (the MCP allowlist)" }],
  ["list", { script: "kernel/session/workspaces.ts", prefixArgs: ["list"], summary: "every registered business with its live run status" }],
  ["operate", { script: "kernel/session/operate.ts", summary: "preview or commit the next operating-loop decision through one typed service" }],
  [
    "app-review-ingress",
    {
      script: "kernel/session/app-review-ingress.ts",
      summary: "verify, accept, or consume a signed App Store Connect webhook without asc webhooks serve",
    },
  ],
  [
    "update",
    {
      script: "kernel/session/update.ts",
      summary: "update the B2C App Builder install (dry-run by default); businesses re-pin separately via bootstrap --apply",
    },
  ],
  [
    "contribute",
    {
      script: "entrypoints/cli/contribute.ts",
      summary: "contributor and maintainer family: plan, check, preview, evaluate, upstreams, upstream-check, upgrade-plan (b2c contribute --help)",
    },
  ],
]);

function usage(code) {
  const lines = ["Usage: b2c <command> [options]", "", "Commands:"];
  for (const [name, meta] of COMMANDS) lines.push(`  ${name.padEnd(20)} ${meta.summary}`);
  lines.push("", "Every command prints its own usage when run without required options.");
  console[code === 0 ? "log" : "error"](lines.join("\n"));
  return code;
}

function resolveTsx() {
  const local = path.join(skillRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  return existsSync(local) ? local : "tsx";
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "--help" || command === "-h" || command === "help") {
  process.exit(usage(command ? 0 : 1));
}
const target = COMMANDS.get(command);
if (!target) {
  console.error(`b2c: unknown command "${command}"\n`);
  process.exit(usage(1));
}
// The CLIs run with cwd at the package root (their own relative reads depend on it); the
// caller's directory rides along so path arguments can resolve where the user typed them.
const runtimePath = [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(resolveTsx(), [path.join(skillRoot, target.script), ...(target.prefixArgs ?? []), ...rest], {
  stdio: "inherit",
  cwd: skillRoot,
  env: { ...process.env, PATH: runtimePath, B2C_APP_BUILDER_CALLER_CWD: process.cwd() },
});
process.exit(result.status ?? 1);
