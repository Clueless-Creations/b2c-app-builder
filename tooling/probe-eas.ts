#!/usr/bin/env node
/**
 * Founder-run live probe for Expo EAS. Paid cloud jobs and preview OTA require
 * EXPO_TOKEN. This probe never installs EAS, never runs `eas login`, and never
 * claims a live paid artifact when the token is absent.
 *
 * SECURITY RULES (do not relax):
 *   - Tokens are read ONLY from the environment.
 *   - No token, project id, or secret name-and-value pair is written to stdout.
 *
 * Usage:
 *   doppler run -- tsx tooling/probe-eas.ts
 *
 * Required for paid/public effects:
 *   EXPO_TOKEN
 *
 * Optional:
 *   B2C_EAS_CLI — absolute pinned `eas` binary (documented pin eas-cli@23.2.0)
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EAS_CLI_DOCUMENTED_VERSION } from "../catalog/stacks/expo-eas-commands.js";
import { discoverExpoCli } from "../adapters/providers/expo/discovery.js";
import { isolatedConfigHome } from "../adapters/providers/expo/preflight.js";
import { defaultExpoProcessRunner } from "../adapters/providers/expo/process.js";
import { probeExecutablesOnPath } from "../kernel/contribution/host-observe.js";

const expoToken = process.env.EXPO_TOKEN ?? "";
const pinnedCli = process.env.B2C_EAS_CLI ?? "";

if (!expoToken) {
  console.error(
    [
      "",
      "  probe-eas: EXPO_TOKEN is not set.",
      "",
      "  Paid EAS jobs, store handoff, and preview OTA cannot run without an Expo",
      "  access token. This probe will not run `eas login` (Apple web/2FA stay",
      "  human-only). Inject EXPO_TOKEN with Doppler when the founder adds it.",
      "",
      `  Documented eas-cli pin: ${EAS_CLI_DOCUMENTED_VERSION}.`,
      "",
    ].join("\n"),
  );
  process.exit(0);
}

function run(): void {
  if (pinnedCli && !path.isAbsolute(pinnedCli)) {
    console.error("  B2C_EAS_CLI must be an absolute path.");
    process.exit(1);
  }
  const workspace = mkdtempSync(path.join(tmpdir(), "b2c-eas-probe-"));
  const isolatedHome = isolatedConfigHome(workspace, "probe");
  mkdirSync(isolatedHome, { recursive: true });
  const pathEnv = pinnedCli ? `${path.dirname(pinnedCli)}${path.delimiter}${process.env.PATH ?? ""}` : (process.env.PATH ?? "");
  const discovery = discoverExpoCli({
    kind: "eas",
    isolatedHome,
    cwd: workspace,
    pathEnv,
    probeExecutables: pinnedCli
      ? (command) => (command === "eas" ? [{ path: pinnedCli, pathOrder: 0 }] : [])
      : (command) => probeExecutablesOnPath(command, { PATH: pathEnv }),
    run: defaultExpoProcessRunner,
  });
  const artifact = {
    probe: "expo-eas-live-probe",
    synthetic: false,
    live: true,
    paid_job_attempted: false,
    ota_attempted: false,
    eas_version: discovery.selected?.version ?? null,
    documented_eas_version: EAS_CLI_DOCUMENTED_VERSION,
    discovery_code: discovery.code,
    token_present: true,
  };
  const artifactPath = path.join(workspace, "eas-probe.json");
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`  Sanitized probe artifact: ${artifactPath}`);
  if (discovery.code !== "trusted") {
    console.error(`  probe-eas: EAS discovery ${discovery.code}. ${discovery.message}`);
    console.error("  No paid job and no OTA were started.");
    process.exit(1);
  }
  console.log(
    `  Trusted eas ${discovery.selected?.version}. Paid job/OTA still require an Expo app workspace and host authority; this probe stops at identity. OTA stays labeled-unavailable.`,
  );
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  probe-eas: unexpected error: ${message}\n`);
  process.exit(1);
}
