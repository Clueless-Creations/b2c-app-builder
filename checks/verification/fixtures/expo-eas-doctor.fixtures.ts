/**
 * #84 Expo/EAS doctor and selected-target probe. `--version` only. No live/paid EAS.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXPO_APP_RUNTIME } from "../../../catalog/stacks/expo-selection.js";
import { EAS_CLI_DOCUMENTED_VERSION } from "../../../catalog/stacks/expo-eas-commands.js";
import { REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import { discoverExpoCli, type ExpoCliDiscovery } from "../../../adapters/providers/expo/discovery.js";
import { assessExpoEasHostDoctor, probeExpoEasSelectedTarget } from "../../../adapters/providers/expo/doctor.js";
import type { ExpoEasTarget } from "../../../adapters/providers/expo/preflight.js";
import type { ExpoProcessRequest, ExpoProcessResult, ExpoProcessRunner } from "../../../adapters/providers/expo/process.js";
import { runDoctor, type DoctorAscFacts, type DoctorFinding, type DoctorExpoEasFacts } from "../../../kernel/session/doctor.js";
import {
  readDoctorHostObservation,
  renderEasCliHostBlock,
  writeDoctorHostObservation,
} from "../../../kernel/session/doctor-host.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const COMPARED_AT = "2026-09-09T21:00:00.000Z";
const DOCUMENTED = EAS_CLI_DOCUMENTED_VERSION;

function finding(findings: readonly DoctorFinding[], code: string): DoctorFinding | undefined {
  return findings.find((item) => item.code === code);
}

function identity(pathValue: string, version: string | null, extras: readonly string[] = [], kind: "eas" | "expo" = "eas"): ExpoCliDiscovery {
  const selected = { path: pathValue, version, commandName: kind, pathOrder: 0 };
  const candidates = [selected, ...extras.map((extra, index) => ({ path: extra, version, commandName: kind, pathOrder: index + 1 }))];
  return {
    code: "trusted",
    kind,
    selected,
    candidates,
    documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
    message: "trusted fixture discovery",
  };
}

function discovery(code: ExpoCliDiscovery["code"], kind: "eas" | "expo" = "eas", selectedPath: string | null = null, version: string | null = null): ExpoCliDiscovery {
  const selected = selectedPath ? { path: selectedPath, version, commandName: kind, pathOrder: 0 } : null;
  return {
    code,
    kind,
    selected,
    candidates: selected ? [selected] : [],
    documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
    message: `fixture ${code}`,
  };
}

function selectedTarget(overrides: Partial<ExpoEasTarget> = {}): ExpoEasTarget {
  return {
    compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME },
    selectedServices: ["expo-cli", "eas-cli", "eas-build"],
    approvedProjectId: "proj_approved",
    approvedProfile: "preview",
    approvedPlatform: "ios",
    hostAuthorityGranted: false,
    grantedAuthority: "observe",
    hasCredential: true,
    allowWorkflowTriggers: false,
    mode: "plan",
    host: { os: "darwin", xcodeAvailable: true, androidSdkAvailable: true },
    ...overrides,
  };
}

function writeFakeApp(root: string): string {
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fake-expo-app" }, null, 2));
  writeFileSync(path.join(root, "app.json"), JSON.stringify({ expo: { extra: { eas: { projectId: "proj_approved" } } } }, null, 2));
  writeFileSync(path.join(root, "eas.json"), JSON.stringify({ build: { preview: { distribution: "internal" } } }, null, 2));
  return root;
}

function missingAscFacts(): DoctorAscFacts {
  return {
    latestObserved: "5.1.0",
    supportRanges: [{ range: ">=5.0.0 <6.0.0", status: "supported" }],
    observe: () => ({
      host: { observedAt: COMPARED_AT, selected: null, executables: [] },
      unknowns: [],
    }),
  };
}

function missingRevenueCatFacts() {
  return {
    latestObserved: REVENUECAT_CLI_RELEASE.version,
    discover: () => ({
      code: "missing" as const,
      selected: null,
      candidates: [],
      requiredRelease: REVENUECAT_CLI_RELEASE,
      schemaCommands: [],
      message: "fixture missing rc",
    }),
  };
}

function missingExpoEasFacts(): DoctorExpoEasFacts {
  return {
    latestObserved: DOCUMENTED,
    discoverEas: () => discovery("missing", "eas"),
    discoverExpo: () => discovery("missing", "expo"),
  };
}

function ok(stdout: string): ExpoProcessResult {
  return { stdout, stderr: "", status: 0, timedOut: false, truncated: false, cancelled: false, signal: null };
}

function recordingRunner(handler: (request: ExpoProcessRequest) => ExpoProcessResult): { run: ExpoProcessRunner; calls: ExpoProcessRequest[] } {
  const calls: ExpoProcessRequest[] = [];
  return {
    calls,
    run: (request) => {
      calls.push(request);
      return handler(request);
    },
  };
}

function walkTs(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const name of readdirSync(current, { withFileTypes: true })) {
      if (name.name === "node_modules" || name.name === "dist" || name.name === ".wrangler") continue;
      const next = path.join(current, name.name);
      if (name.isDirectory()) stack.push(next);
      else if (name.name.endsWith(".ts") || name.name.endsWith(".js") || name.name.endsWith(".mjs")) out.push(next);
    }
  }
  return out;
}

export function register(harness: Harness): void {
  harness.check("expo-eas-doctor: missing CLI warns, does not install, and is not live EAS proof", () => {
    const result = assessExpoEasHostDoctor({
      discovery: discovery("missing", "eas"),
      latestObserved: DOCUMENTED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(result.liveEasProven === false, "missing CLI must not claim live EAS");
    assert(result.findings[0]?.code === "doctor.eas_cli_missing", `expected missing warn, got ${JSON.stringify(result.findings)}`);
    assert(result.findings[0]?.severity === "warn", "missing CLI is a warning, not an install error");
    assert(result.findings[0]?.message.includes("will not install"), `missing finding must refuse install: ${result.findings[0]?.message}`);
    assert(result.observation.identity === "missing" && result.observation.path === null, `observation must record missing identity, got ${JSON.stringify(result.observation)}`);
  });

  harness.check("expo-eas-doctor: unrelated PATH eas is distinct from EAS CLI", () => {
    const result = assessExpoEasHostDoctor({
      discovery: discovery("unrelated-executable", "eas", "/usr/bin/eas", "1.2.3"),
      latestObserved: DOCUMENTED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(result.findings[0]?.code === "doctor.eas_cli_unrelated", `expected unrelated finding, got ${JSON.stringify(result.findings)}`);
    assert(result.liveEasProven === false, "unrelated eas is not live EAS proof");
  });

  harness.check("expo-eas-doctor: trusted documented version is ok, shadowed extras warn, live EAS stays unproven", () => {
    const result = assessExpoEasHostDoctor({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED, ["/usr/local/bin/eas"]),
      latestObserved: DOCUMENTED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(result.findings.some((item) => item.code === "doctor.eas_cli" && item.severity === "ok"), `expected trusted ok, got ${JSON.stringify(result.findings)}`);
    assert(result.findings.some((item) => item.code === "doctor.eas_cli_shadowed"), "shadowed extras must warn");
    assert(result.liveEasProven === false, "trusted local identity is not live EAS proof");
  });

  harness.check("expo-eas-doctor: finding messages prefer inspect as the diagnostic actor", () => {
    const source = readFileSync(path.join(skillRoot, "adapters/providers/expo/doctor.ts"), "utf8");
    const missing = assessExpoEasHostDoctor({
      discovery: discovery("missing", "eas"),
      latestObserved: DOCUMENTED,
      sanitizePath: (executablePath) => executablePath,
    });
    const unrelated = assessExpoEasHostDoctor({
      discovery: discovery("unrelated-executable", "eas", "/usr/bin/eas", "1.2.3"),
      latestObserved: DOCUMENTED,
      sanitizePath: (executablePath) => executablePath,
    });
    const trusted = assessExpoEasHostDoctor({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED, ["/usr/local/bin/eas"]),
      latestObserved: DOCUMENTED,
      sanitizePath: (executablePath) => executablePath,
    });
    const trustedFinding = trusted.findings.find((item) => item.code === "doctor.eas_cli");
    const shadowed = trusted.findings.find((item) => item.code === "doctor.eas_cli_shadowed");
    assert(missing.findings[0]?.code === "doctor.eas_cli_missing", "finding codes stay doctor.*");
    assert(
      missing.findings[0]?.message.includes("inspect will not install it"),
      `missing actor copy must prefer inspect: ${missing.findings[0]?.message}`,
    );
    assert(
      unrelated.findings[0]?.message.includes("Inspect will not install a replacement"),
      `unrelated actor copy must prefer inspect: ${unrelated.findings[0]?.message}`,
    );
    assert(
      trustedFinding?.message.includes("Inspect will not install, log in, or run eas init"),
      `trusted actor copy must prefer inspect: ${trustedFinding?.message}`,
    );
    assert(
      shadowed?.message.includes("Inspect will not install or upgrade the host"),
      `shadowed actor copy must prefer inspect: ${shadowed?.message}`,
    );
    assert(source.includes("`b2c doctor` is a supported equivalent"), "Expo diagnostic copy must keep doctor supported");
    assert(!source.includes("Doctor will not"), "Expo findings must not keep Doctor as the named actor");
    assert(!source.includes("doctor will not install it"), "Expo missing copy must not keep doctor as the named actor");
  });

  harness.check("expo-eas-doctor: persist records identity once with ASC fields; write failure warns owners", () => {
    const home = harness.makeTempDir("eas-doctor-persist");
    const findings = runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => home,
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: missingAscFacts,
      loadRevenueCatFacts: missingRevenueCatFacts,
      loadExpoEasFacts: () => ({
        latestObserved: DOCUMENTED,
        discoverEas: () => identity("/Users/fixture-operator/.local/bin/eas", DOCUMENTED),
        discoverExpo: () => discovery("missing", "expo"),
      }),
      persistHost: writeDoctorHostObservation,
    });
    assert(finding(findings, "doctor.eas_cli")?.severity === "ok", `expected trusted eas ok through runDoctor, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.eas_cli")))}`);
    const stored = readDoctorHostObservation(home);
    assert(stored?.easCli?.identity === "trusted", `persisted eas identity must be trusted, got ${JSON.stringify(stored?.easCli)}`);
    assert(stored?.easCli?.path === "~/.local/bin/eas", `persisted eas path must use ~, got ${JSON.stringify(stored?.easCli)}`);
    assert(stored?.expoCli?.identity === "missing", `expo CLI missing must persist, got ${JSON.stringify(stored?.expoCli)}`);
    assert(!JSON.stringify(stored).includes("/Users/fixture-operator"), `host file must not carry a home-directory identity: ${JSON.stringify(stored)}`);
    const failed = runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => "/tmp/eas-doctor-unwritable-home",
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: missingAscFacts,
      loadRevenueCatFacts: missingRevenueCatFacts,
      loadExpoEasFacts: missingExpoEasFacts,
      persistHost: () => ({ ok: false, message: "disk full" }),
    });
    assert(finding(failed, "doctor.eas_cli_host_write_failed")?.severity === "warn", `expected eas write-failure warn, got ${JSON.stringify(finding(failed, "doctor.eas_cli_host_write_failed"))}`);
    assert(finding(failed, "doctor.asc_host_write_failed")?.severity === "warn", "ASC write-failure warn must remain");
  });

  harness.check("expo-eas-doctor: host probe only runs --version", () => {
    const recorded = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`eas-cli/${DOCUMENTED} ${DOCUMENTED}\n`);
      return ok("unexpected");
    });
    runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => harness.makeTempDir("eas-doctor-argv"),
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: missingAscFacts,
      loadRevenueCatFacts: missingRevenueCatFacts,
      loadExpoEasFacts: () => ({
        latestObserved: DOCUMENTED,
        discoverEas: ({ isolatedHome, cwd }) =>
          discoverExpoCli({
            kind: "eas",
            isolatedHome,
            cwd,
            pathEnv: "/opt/fake/bin",
            probeExecutables: (command) => (command === "eas" || command === "eas-cli" ? [{ path: "/opt/fake/bin/eas", pathOrder: 0 }] : []),
            run: recorded.run,
          }),
        discoverExpo: () => discovery("missing", "expo"),
      }),
      persistHost: writeDoctorHostObservation,
    });
    assert(recorded.calls.length > 0, "doctor must invoke eas discovery");
    for (const call of recorded.calls) {
      assert(call.argv[0] === "--version", `doctor discovery must not spawn authenticated commands, got ${JSON.stringify(call.argv)}`);
    }
  });

  harness.check("expo-eas-doctor: unselected provider skips and does not block unrelated work", () => {
    const cwd = writeFakeApp(harness.makeTempDir("eas-unselected"));
    const probe = probeExpoEasSelectedTarget({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED),
      target: selectedTarget({ selectedServices: ["expo-cli"] }),
      cwd,
    });
    assert(probe.preflight.status === "skip" && probe.preflight.code === "unselected-eas-cli", `expected skip, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.preflight.blocksUnrelatedWork === false, "unselected EAS must not block unrelated work");
    assert(probe.spawnedAuthenticatedCommand === false && probe.mutated === false && probe.liveEasProven === false, "unselected probe must not spawn, mutate, or prove EAS");
  });

  harness.check("expo-eas-doctor: selected project mismatch holds closed without spawn", () => {
    const cwd = writeFakeApp(harness.makeTempDir("eas-mismatch"));
    const probe = probeExpoEasSelectedTarget({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED),
      target: selectedTarget(),
      cwd,
      requestProjectId: "proj_attacker",
    });
    assert(probe.preflight.status === "hold" && probe.preflight.code === "wrong-project", `expected project mismatch, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.spawnedAuthenticatedCommand === false && probe.liveEasProven === false && probe.mutated === false, "mismatch must not spawn or claim live EAS");
  });

  harness.check("expo-eas-doctor: matching ids without host authority fail closed and do not spawn", () => {
    const cwd = writeFakeApp(harness.makeTempDir("eas-no-authority"));
    const probe = probeExpoEasSelectedTarget({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED),
      target: selectedTarget({ hostAuthorityGranted: false }),
      cwd,
      requestProjectId: "proj_approved",
    });
    assert(probe.preflight.status === "hold" && probe.preflight.code === "authority-missing", `expected authority-missing, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.spawnedAuthenticatedCommand === false && probe.liveEasProven === false && probe.liveEasClaim === "unproven", "authority-missing must leave EAS unproven");
  });

  harness.check("expo-eas-doctor: matching ids with authority stay locally ready and still unproven, without spawn", () => {
    const cwd = writeFakeApp(harness.makeTempDir("eas-ready"));
    const probe = probeExpoEasSelectedTarget({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED),
      target: selectedTarget({ hostAuthorityGranted: true }),
      cwd,
      requestProjectId: "proj_approved",
    });
    assert(probe.preflight.status === "ready" && probe.preflight.code === "ready", `expected ready after local id match, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.spawnedAuthenticatedCommand === false, "selected-target probe must never spawn");
    assert(probe.liveEasProven === false && probe.liveEasClaim === "unproven" && probe.mutated === false, "ready local ids are not live EAS proof");
    assert(probe.preflight.message.includes("did not spawn"), `ready message must deny spawn: ${probe.preflight.message}`);
  });

  harness.check("expo-eas-doctor: selected-target copy prefers inspect as the diagnostic actor", () => {
    const source = readFileSync(path.join(skillRoot, "adapters/providers/expo/doctor.ts"), "utf8");
    const cwd = writeFakeApp(harness.makeTempDir("eas-inspect-actor"));
    const missingAuthority = probeExpoEasSelectedTarget({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED),
      target: selectedTarget({ hostAuthorityGranted: false }),
      cwd,
      requestProjectId: "proj_approved",
    });
    const ready = probeExpoEasSelectedTarget({
      discovery: identity("/opt/fake/bin/eas", DOCUMENTED),
      target: selectedTarget({ hostAuthorityGranted: true }),
      cwd,
      requestProjectId: "proj_approved",
    });
    assert(missingAuthority.preflight.code === "authority-missing", "finding/hold codes stay doctor.* / authority-missing");
    assert(
      missingAuthority.preflight.message.includes("Inspect will not spawn authenticated eas commands"),
      `authority-missing actor copy must prefer inspect: ${missingAuthority.preflight.message}`,
    );
    assert(
      ready.preflight.message.includes("inspect did not spawn an authenticated command"),
      `ready actor copy must prefer inspect: ${ready.preflight.message}`,
    );
    assert(source.includes("`b2c doctor` is a supported equivalent"), "Expo selected-target copy must keep doctor supported");
    assert(!source.includes("Doctor/probe will not"), "selected-target copy must not keep Doctor/probe as the named actor");
    assert(!source.includes("doctor/probe did not spawn"), "ready copy must not keep doctor/probe as the named actor");
    assert(missingAuthority.spawnedAuthenticatedCommand === false && ready.spawnedAuthenticatedCommand === false, "selected-target probe must still never spawn");
  });

  harness.check("expo-eas-doctor: status sibling is last observation, not a live PATH probe or live EAS job", () => {
    const notRun = renderEasCliHostBlock(null);
    assert(notRun.includes("not a live PATH probe"), `not-run block must deny a live probe: ${notRun}`);
    assert(notRun.includes("not live EAS proof"), `not-run block must deny live EAS: ${notRun}`);
    assert(notRun.includes("last b2c inspect observation"), `not-run header must prefer inspect: ${notRun}`);
    assert(notRun.includes("inspect has not been run"), `missing file must say inspect has not been run: ${notRun}`);
    assert(notRun.includes("b2c inspect") && notRun.includes("supported `b2c doctor`"), `not-run block must prefer inspect: ${notRun}`);
    const home = harness.makeTempDir("eas-doctor-status");
    writeDoctorHostObservation(
      {
        schemaVersion: "b2c.doctor-host/v1",
        comparedAt: COMPARED_AT,
        latestObserved: "5.1.0",
        path: null,
        version: null,
        easCli: {
          latestObserved: DOCUMENTED,
          path: "/opt/fake/bin/eas",
          version: DOCUMENTED,
          identity: "trusted",
          kind: "eas",
        },
      },
      home,
    );
    const recorded = renderEasCliHostBlock(readDoctorHostObservation(home));
    assert(recorded.includes("/opt/fake/bin/eas") && recorded.includes(DOCUMENTED) && recorded.includes(COMPARED_AT), `recorded block must name winner and stamp: ${recorded}`);
    assert(recorded.includes("Live EAS is unproven"), `trusted sibling must leave EAS unproven: ${recorded}`);
    const legacy = renderEasCliHostBlock({
      schemaVersion: "b2c.doctor-host/v1",
      comparedAt: COMPARED_AT,
      latestObserved: "5.1.0",
      path: "/opt/homebrew/bin/asc",
      version: "5.1.0",
    });
    assert(legacy.includes("did not record EAS CLI"), `legacy ASC-only file must say EAS was not recorded: ${legacy}`);
  });

  harness.check("expo-eas-doctor: doctor adapter and hosted knowledge do not import mutating execute", () => {
    const doctorSource = readFileSync(path.join(skillRoot, "adapters/providers/expo/doctor.ts"), "utf8");
    assert(!doctorSource.includes("from \"./execute.js\""), "expo doctor must not import the mutating execute adapter");
    assert(!doctorSource.includes("runExpoEasCommand"), "doctor/probe must not call runExpoEasCommand");
    const kernelDoctor = readFileSync(path.join(skillRoot, "kernel/session/doctor.ts"), "utf8");
    assert(!kernelDoctor.includes("adapters/providers/expo/execute"), "host doctor must not import the mutating EAS executor");
    assert(!kernelDoctor.includes("runExpoEasCommand"), "host doctor must not call runExpoEasCommand");
    const hostedRoot = path.join(skillRoot, "hosted/knowledge-mcp");
    const knowledgeRoot = path.join(skillRoot, "kernel/knowledge-service");
    for (const root of [hostedRoot, knowledgeRoot]) {
      const hits = walkTs(root).filter((file) => {
        const text = readFileSync(file, "utf8");
        return text.includes("adapters/providers/expo/doctor") || text.includes("runExpoEasCommand");
      });
      assert(hits.length === 0, `knowledge/hosted must not import Expo doctor or execute: ${hits.join(", ")}`);
    }
  });
}
