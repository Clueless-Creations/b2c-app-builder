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
 * command address and passes exit codes through unchanged. Grouped help and the command registry live in help.mjs.
 */
import { launchTypeScript } from "../../tooling/lib/tsx-launcher.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMANDS, renderUsage } from "./help.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function usage(code) {
  console[code === 0 ? "log" : "error"](renderUsage(COMMANDS));
  return code;
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
process.exit(
  launchTypeScript(skillRoot, [path.join(skillRoot, target.script), ...(target.prefixArgs ?? []), ...rest], {
    B2C_APP_BUILDER_CALLER_CWD: process.cwd(),
  }),
);
