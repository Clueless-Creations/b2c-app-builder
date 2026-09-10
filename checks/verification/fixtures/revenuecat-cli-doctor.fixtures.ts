import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { discoverRevenueCatCli, type RevenueCatCliDiscovery } from "../../../adapters/providers/revenuecat/cli-discovery.js";
import {
  assessRevenueCatCliHostDoctor,
  probeRevenueCatCliSelectedTarget,
} from "../../../adapters/providers/revenuecat/cli-doctor.js";
import { REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import { EAS_CLI_DOCUMENTED_VERSION } from "../../../catalog/stacks/expo-eas-commands.js";
import type { RevenueCatCliTarget } from "../../../adapters/providers/revenuecat/cli-preflight.js";
import type { CliProcessRequest, CliProcessResult, CliProcessRunner } from "../../../adapters/providers/revenuecat/cli-process.js";
import { runDoctor, type DoctorAscFacts, type DoctorFinding, type DoctorExpoEasFacts } from "../../../kernel/session/doctor.js";
import {
  readDoctorHostObservation,
  renderRevenueCatCliHostBlock,
  writeDoctorHostObservation,
} from "../../../kernel/session/doctor-host.js";

const COMPARED_AT = "2026-09-09T18:00:00.000Z";
const REVIEWED = REVENUECAT_CLI_RELEASE.version;

const COMMANDS_JSON = JSON.stringify({
  schema_version: "1",
  data: {
    commands: [
      { name: "offerings" },
      { name: "customers" },
      { name: "apps" },
      { name: "projects" },
      { name: "entitlements" },
      { name: "products" },
    ],
  },
});

function finding(findings: readonly DoctorFinding[], code: string): DoctorFinding | undefined {
  return findings.find((item) => item.code === code);
}

function identity(pathValue: string, version: string | null, extras: readonly string[] = []): RevenueCatCliDiscovery {
  const selected = { path: pathValue, version, commandName: "rc" as const, pathOrder: 0 };
  const candidates = [selected, ...extras.map((extra, index) => ({ path: extra, version, commandName: "rc" as const, pathOrder: index + 1 }))];
  return {
    code: "trusted",
    selected,
    candidates,
    requiredRelease: REVENUECAT_CLI_RELEASE,
    schemaCommands: ["offerings", "customers", "apps", "projects", "entitlements", "products"],
    message: "trusted fixture discovery",
  };
}

function discovery(code: RevenueCatCliDiscovery["code"], selectedPath: string | null = null, version: string | null = null): RevenueCatCliDiscovery {
  const selected = selectedPath ? { path: selectedPath, version, commandName: "rc" as const, pathOrder: 0 } : null;
  return {
    code,
    selected,
    candidates: selected ? [selected] : [],
    requiredRelease: REVENUECAT_CLI_RELEASE,
    schemaCommands: code === "trusted" ? ["offerings", "customers", "apps", "projects", "entitlements", "products"] : [],
    message: `fixture ${code}`,
  };
}

function selectedTarget(overrides: Partial<RevenueCatCliTarget> = {}): RevenueCatCliTarget {
  return {
    providerSelected: true,
    approvedProjectId: "proj_approved",
    approvedAppId: "app_test",
    appStoreKind: "test-store",
    hostAuthorityGranted: false,
    hasCredential: true,
    ...overrides,
  };
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

function missingExpoEasFacts(): DoctorExpoEasFacts {
  return {
    latestObserved: EAS_CLI_DOCUMENTED_VERSION,
    discoverEas: () => ({
      code: "missing",
      kind: "eas",
      selected: null,
      candidates: [],
      documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
      message: "fixture missing eas",
    }),
    discoverExpo: () => ({
      code: "missing",
      kind: "expo",
      selected: null,
      candidates: [],
      documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
      message: "fixture missing expo",
    }),
  };
}

function ok(stdout: string): CliProcessResult {
  return { stdout, stderr: "", status: 0, timedOut: false, truncated: false, cancelled: false, signal: null };
}

function recordingRunner(handler: (request: CliProcessRequest) => CliProcessResult): { run: CliProcessRunner; calls: CliProcessRequest[] } {
  const calls: CliProcessRequest[] = [];
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
  harness.check("revenuecat-cli-doctor: missing CLI warns, does not install, and is not live catalog proof", () => {
    const result = assessRevenueCatCliHostDoctor({
      discovery: discovery("missing"),
      latestObserved: REVIEWED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(result.liveCatalogProven === false, "missing CLI must not claim live catalog");
    assert(result.findings.length === 1 && result.findings[0]?.code === "doctor.revenuecat_cli_missing", `expected missing warn, got ${JSON.stringify(result.findings)}`);
    assert(result.findings[0]?.severity === "warn", "missing CLI is a warning, not an install error");
    assert(result.findings[0]?.message.includes("will not install"), `missing finding must refuse install: ${result.findings[0]?.message}`);
    assert(result.observation.identity === "missing" && result.observation.path === null, `observation must record missing identity, got ${JSON.stringify(result.observation)}`);
  });

  harness.check("revenuecat-cli-doctor: unrelated PATH rc is distinct from RevenueCat CLI", () => {
    const result = assessRevenueCatCliHostDoctor({
      discovery: discovery("unrelated-executable", "/usr/bin/rc", "1.2.3"),
      latestObserved: REVIEWED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(result.findings[0]?.code === "doctor.revenuecat_cli_unrelated", `expected unrelated finding, got ${JSON.stringify(result.findings)}`);
    assert(result.liveCatalogProven === false, "unrelated rc is not live catalog proof");
    assert(result.observation.identity === "unrelated-executable", "identity must stay unrelated");
  });

  harness.check("revenuecat-cli-doctor: unsupported version and schema warn without upgrade or live catalog claim", () => {
    const version = assessRevenueCatCliHostDoctor({
      discovery: discovery("unsupported-version", "/opt/fake/bin/rc", "0.0.9"),
      latestObserved: REVIEWED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(version.findings[0]?.code === "doctor.revenuecat_cli_unsupported", `expected unsupported version, got ${JSON.stringify(version.findings)}`);
    assert(version.findings[0]?.message.includes("will not upgrade"), `unsupported version must refuse upgrade: ${version.findings[0]?.message}`);
    const schema = assessRevenueCatCliHostDoctor({
      discovery: discovery("unsupported-schema", "/opt/fake/bin/rc", REVIEWED),
      latestObserved: REVIEWED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(schema.findings[0]?.code === "doctor.revenuecat_cli_unsupported_schema", `expected unsupported schema, got ${JSON.stringify(schema.findings)}`);
    assert(version.liveCatalogProven === false && schema.liveCatalogProven === false, "unsupported identity is not live catalog");
  });

  harness.check("revenuecat-cli-doctor: trusted 0.1.1 is ok, shadowed extras warn, live catalog stays unproven", () => {
    const result = assessRevenueCatCliHostDoctor({
      discovery: identity("/opt/fake/bin/rc", REVIEWED, ["/usr/local/bin/rc"]),
      latestObserved: REVIEWED,
      sanitizePath: (executablePath) => executablePath,
    });
    assert(result.findings.some((item) => item.code === "doctor.revenuecat_cli" && item.severity === "ok"), `expected trusted ok, got ${JSON.stringify(result.findings)}`);
    assert(result.findings.some((item) => item.code === "doctor.revenuecat_cli_shadowed"), "shadowed extras must warn");
    assert(result.liveCatalogProven === false, "trusted local identity is not live catalog proof");
    assert(result.observation.identity === "trusted" && result.observation.version === REVIEWED, `trusted observation must record 0.1.1, got ${JSON.stringify(result.observation)}`);
  });

  harness.check("revenuecat-cli-doctor: persist records identity once with ASC fields; write failure warns both owners", () => {
    const home = harness.makeTempDir("rc-doctor-persist");
    const findings = runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => home,
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: missingAscFacts,
      loadRevenueCatFacts: () => ({
        latestObserved: REVIEWED,
        discover: () => identity("/Users/fixture-operator/.local/bin/rc", REVIEWED),
      }),
      loadExpoEasFacts: missingExpoEasFacts,
      persistHost: writeDoctorHostObservation,
    });
    assert(finding(findings, "doctor.revenuecat_cli")?.severity === "ok", `expected trusted ok through runDoctor, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.revenuecat_cli")))}`);
    const stored = readDoctorHostObservation(home);
    assert(stored?.revenuecatCli?.identity === "trusted", `persisted identity must be trusted, got ${JSON.stringify(stored?.revenuecatCli)}`);
    assert(stored?.revenuecatCli?.path === "~/.local/bin/rc", `persisted RC path must use ~, got ${JSON.stringify(stored?.revenuecatCli)}`);
    assert(!JSON.stringify(stored).includes("/Users/fixture-operator"), `host file must not carry a home-directory identity: ${JSON.stringify(stored)}`);
    const failed = runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => "/tmp/rc-doctor-unwritable-home",
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: missingAscFacts,
      loadRevenueCatFacts: () => ({ latestObserved: REVIEWED, discover: () => discovery("missing") }),
      loadExpoEasFacts: missingExpoEasFacts,
      persistHost: () => ({ ok: false, message: "disk full" }),
    });
    assert(finding(failed, "doctor.revenuecat_cli_host_write_failed")?.severity === "warn", `expected RC write-failure warn, got ${JSON.stringify(finding(failed, "doctor.revenuecat_cli_host_write_failed"))}`);
    assert(finding(failed, "doctor.asc_host_write_failed")?.severity === "warn", "ASC write-failure warn must remain");
    assert(!failed.some((item) => item.severity === "error" && item.code.startsWith("doctor.revenuecat_cli")), "host write failure must not fail the install");
  });

  harness.check("revenuecat-cli-doctor: host probe only runs --version and commands --json", () => {
    const recorded = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVIEWED}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(JSON.stringify({ data: { unexpected: true }, schema_version: "1" }));
    });
    runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => harness.makeTempDir("rc-doctor-argv"),
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: missingAscFacts,
      loadRevenueCatFacts: () => ({
        latestObserved: REVIEWED,
        discover: ({ isolatedHome, cwd }) =>
          discoverRevenueCatCli({
            isolatedHome,
            cwd,
            pathEnv: "/opt/fake/bin",
            probeExecutables: (command) => (command === "rc" ? [{ path: "/opt/fake/bin/rc", pathOrder: 0 }] : []),
            run: recorded.run,
          }),
      }),
      loadExpoEasFacts: missingExpoEasFacts,
      persistHost: writeDoctorHostObservation,
    });
    assert(recorded.calls.length > 0, "doctor must invoke discovery");
    for (const call of recorded.calls) {
      assert(call.argv[0] === "--version" || call.argv[0] === "commands", `doctor discovery must not spawn authenticated commands, got ${JSON.stringify(call.argv)}`);
    }
  });

  harness.check("revenuecat-cli-doctor: unselected provider skips and does not block unrelated work", () => {
    const probe = probeRevenueCatCliSelectedTarget({
      discovery: identity("/opt/fake/bin/rc", REVIEWED),
      target: selectedTarget({ providerSelected: false }),
    });
    assert(probe.preflight.status === "skip" && probe.preflight.code === "unselected-provider", `expected skip, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.preflight.blocksUnrelatedWork === false, "unselected RevenueCat must not block unrelated work");
    assert(probe.spawnedAuthenticatedCommand === false && probe.mutated === false && probe.liveCatalogProven === false, "unselected probe must not spawn, mutate, or prove catalog");
  });

  harness.check("revenuecat-cli-doctor: selected project mismatch holds closed without spawn", () => {
    const probe = probeRevenueCatCliSelectedTarget({
      discovery: identity("/opt/fake/bin/rc", REVIEWED),
      target: selectedTarget(),
      requestProjectId: "proj_attacker",
      requestAppId: "app_test",
    });
    assert(probe.preflight.status === "hold" && probe.preflight.code === "request-project-mismatch", `expected project mismatch, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.spawnedAuthenticatedCommand === false && probe.liveCatalogProven === false && probe.mutated === false, "mismatch must not spawn or claim live catalog");
  });

  harness.check("revenuecat-cli-doctor: matching ids without host authority fail closed and do not spawn", () => {
    const probe = probeRevenueCatCliSelectedTarget({
      discovery: identity("/opt/fake/bin/rc", REVIEWED),
      target: selectedTarget({ hostAuthorityGranted: false }),
      requestProjectId: "proj_approved",
      requestAppId: "app_test",
    });
    assert(probe.preflight.status === "hold" && probe.preflight.code === "authority-missing", `expected authority-missing, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.spawnedAuthenticatedCommand === false && probe.liveCatalogProven === false && probe.liveCatalogClaim === "unproven", "authority-missing must leave catalog unproven");
    assert(probe.preflight.blocksUnrelatedWork === false, "authority hold must not block unrelated work");
  });

  harness.check("revenuecat-cli-doctor: matching ids with authority stay locally ready and still unproven, without spawn", () => {
    const probe = probeRevenueCatCliSelectedTarget({
      discovery: identity("/opt/fake/bin/rc", REVIEWED),
      target: selectedTarget({ hostAuthorityGranted: true }),
      requestProjectId: "proj_approved",
      requestAppId: "app_test",
    });
    assert(probe.preflight.status === "ready" && probe.preflight.code === "ready", `expected ready after local id match, got ${JSON.stringify(probe.preflight)}`);
    assert(probe.spawnedAuthenticatedCommand === false, "selected-target probe must never spawn");
    assert(probe.liveCatalogProven === false && probe.liveCatalogClaim === "unproven" && probe.mutated === false, "ready local ids are not live catalog proof");
    assert(probe.preflight.message.includes("did not spawn"), `ready message must deny spawn: ${probe.preflight.message}`);
  });

  harness.check("revenuecat-cli-doctor: status sibling is last observation, not a live PATH probe or live catalog", () => {
    const notRun = renderRevenueCatCliHostBlock(null);
    assert(notRun.includes("not a live PATH probe"), `not-run block must deny a live probe: ${notRun}`);
    assert(notRun.includes("not live catalog proof"), `not-run block must deny live catalog: ${notRun}`);
    assert(notRun.includes("last b2c inspect observation"), `not-run header must prefer inspect: ${notRun}`);
    assert(notRun.includes("inspect has not been run"), `missing file must say inspect has not been run: ${notRun}`);
    assert(notRun.includes("supported `b2c doctor`"), `missing file must keep doctor supported: ${notRun}`);
    const home = harness.makeTempDir("rc-doctor-status");
    writeDoctorHostObservation(
      {
        schemaVersion: "b2c.doctor-host/v1",
        comparedAt: COMPARED_AT,
        latestObserved: "5.1.0",
        path: null,
        version: null,
        revenuecatCli: {
          latestObserved: REVIEWED,
          path: "/opt/fake/bin/rc",
          version: REVIEWED,
          identity: "trusted",
        },
      },
      home,
    );
    const recorded = renderRevenueCatCliHostBlock(readDoctorHostObservation(home));
    assert(recorded.includes("/opt/fake/bin/rc") && recorded.includes(REVIEWED) && recorded.includes(COMPARED_AT), `recorded block must name winner and stamp: ${recorded}`);
    assert(recorded.includes("Live catalog is unproven"), `trusted sibling must leave catalog unproven: ${recorded}`);
    assert(!recorded.includes("inspect has not been run"), "a recorded observation is not inspect-not-run");
    const legacy = renderRevenueCatCliHostBlock({
      schemaVersion: "b2c.doctor-host/v1",
      comparedAt: COMPARED_AT,
      latestObserved: "5.1.0",
      path: "/opt/homebrew/bin/asc",
      version: "5.1.0",
    });
    assert(legacy.includes("did not record RevenueCat CLI"), `legacy ASC-only file must say RC was not recorded: ${legacy}`);
    assert(legacy.includes("not live catalog proof"), `legacy file must not claim live catalog: ${legacy}`);
  });

  harness.check("revenuecat-cli-doctor: doctor adapter and hosted knowledge do not import mutating execute", () => {
    const doctorSource = readFileSync(path.join(skillRoot, "adapters/providers/revenuecat/cli-doctor.ts"), "utf8");
    assert(!doctorSource.includes("cli-execute"), "cli-doctor must not import the mutating execute adapter");
    assert(!doctorSource.includes("runRevenueCatCli"), "doctor/probe must not call runRevenueCatCli");
    const hostedRoot = path.join(skillRoot, "hosted/knowledge-mcp");
    const knowledgeRoot = path.join(skillRoot, "kernel/knowledge-service");
    for (const root of [hostedRoot, knowledgeRoot]) {
      const hits = walkTs(root).filter((file) => {
        const text = readFileSync(file, "utf8");
        return text.includes("cli-doctor") || text.includes("runRevenueCatCli") || text.includes("adapters/providers/revenuecat/cli-execute");
      });
      assert(hits.length === 0, `knowledge/hosted must not import RevenueCat CLI doctor or execute: ${hits.join(", ")}`);
    }
  });
}
