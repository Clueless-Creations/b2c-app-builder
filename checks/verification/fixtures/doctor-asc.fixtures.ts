import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import { EAS_CLI_DOCUMENTED_VERSION } from "../../../catalog/stacks/expo-eas-commands.js";
import type { RevenueCatCliDiscovery } from "../../../adapters/providers/revenuecat/cli-discovery.js";
import { runDoctor, type DoctorAscFacts, type DoctorFinding, type DoctorRevenueCatFacts, type DoctorExpoEasFacts } from "../../../kernel/session/doctor.js";
import {
  appendDoctorHostBlock,
  readDoctorHostObservation,
  renderDoctorHostBlock,
  sanitizeExecutablePath,
  writeDoctorHostObservation,
} from "../../../kernel/session/doctor-host.js";

const LATEST = "5.1.0";
const COMPARED_AT = "2026-09-08T18:00:00.000Z";

function finding(findings: readonly DoctorFinding[], code: string): DoctorFinding | undefined {
  return findings.find((item) => item.code === code);
}

function fakeFacts(executables: ReadonlyArray<{ path: string; version: string | null; pathOrder?: number }>, latestObserved = LATEST): DoctorAscFacts {
  return {
    latestObserved,
    supportRanges: [
      { range: "<5.0.0", status: "unsupported" },
      { range: ">=5.0.0 <6.0.0", status: "supported" },
    ],
    observe: () => ({
      host: {
        observedAt: COMPARED_AT,
        selected: executables[0]?.path ?? null,
        executables: executables.map((entry, index) => ({
          path: entry.path,
          version: entry.version,
          sha256: null,
          pathOrder: entry.pathOrder ?? index,
        })),
      },
      unknowns: [],
    }),
  };
}

function missingRevenueCatFacts(): DoctorRevenueCatFacts {
  const discovery: RevenueCatCliDiscovery = {
    code: "missing",
    selected: null,
    candidates: [],
    requiredRelease: REVENUECAT_CLI_RELEASE,
    schemaCommands: [],
    message: "fixture: RevenueCat CLI absent",
  };
  return {
    latestObserved: REVENUECAT_CLI_RELEASE.version,
    discover: () => discovery,
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
      message: "fixture: EAS CLI absent",
    }),
    discoverExpo: () => ({
      code: "missing",
      kind: "expo",
      selected: null,
      candidates: [],
      documentedEasVersion: EAS_CLI_DOCUMENTED_VERSION,
      message: "fixture: Expo CLI absent",
    }),
  };
}

function runIsolated(harness: Harness, name: string, facts: DoctorAscFacts | null): { findings: DoctorFinding[]; home: string } {
  const home = harness.makeTempDir(name);
  const findings = runDoctor({
    now: () => new Date(COMPARED_AT),
    home: () => home,
    userHome: () => "/Users/fixture-operator",
    loadAscFacts: () => facts,
    loadRevenueCatFacts: missingRevenueCatFacts,
    loadExpoEasFacts: missingExpoEasFacts,
    persistHost: writeDoctorHostObservation,
  });
  return { findings, home };
}

export function register(harness: Harness): void {
  harness.check("doctor-asc: empty PATH warns missing, writes a negative host file, and does not fail the install", () => {
    const { findings, home } = runIsolated(harness, "doctor-asc-missing", fakeFacts([]));
    const missing = finding(findings, "doctor.asc_missing");
    assert(missing?.severity === "warn", `expected doctor.asc_missing warn, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    assert(missing.message.includes(LATEST), `missing finding must name latest observed: ${missing.message}`);
    assert(!findings.some((item) => item.severity === "error" && item.code.startsWith("doctor.asc")), "missing asc must not be an install error");
    const stored = readDoctorHostObservation(home);
    assert(stored !== null, "doctor must persist doctor-host.json even when asc is missing");
    assert(stored.path === null && stored.version === null, `negative observation must null path and version, got ${JSON.stringify(stored)}`);
    assert(stored.latestObserved === LATEST && stored.comparedAt === COMPARED_AT, `negative observation must keep latest + compared-at, got ${JSON.stringify(stored)}`);
    assert(stored.revenuecatCli?.identity === "missing", `ASC-only stub must still persist RevenueCat CLI identity, got ${JSON.stringify(stored.revenuecatCli)}`);
    assert(stored.easCli?.identity === "missing", `ASC-only stub must still persist EAS CLI identity, got ${JSON.stringify(stored.easCli)}`);
  });

  harness.check("doctor-asc: winner equal to latest observed is ok and names path plus version", () => {
    const { findings, home } = runIsolated(harness, "doctor-asc-current", fakeFacts([{ path: "/opt/homebrew/bin/asc", version: LATEST }]));
    const ok = finding(findings, "doctor.asc");
    assert(ok?.severity === "ok", `expected doctor.asc ok, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    assert(ok.message.includes("/opt/homebrew/bin/asc") && ok.message.includes(LATEST), `ok finding must name winner path and version: ${ok.message}`);
    const stored = readDoctorHostObservation(home);
    assert(stored?.path === "/opt/homebrew/bin/asc" && stored.version === LATEST, `host file must record winner, got ${JSON.stringify(stored)}`);
  });

  harness.check("doctor-asc: winner older than latest observed warns both versions and the winner path", () => {
    const { findings } = runIsolated(harness, "doctor-asc-stale", fakeFacts([{ path: "/usr/local/bin/asc", version: "5.0.0" }]));
    const stale = finding(findings, "doctor.asc_stale");
    assert(stale?.severity === "warn", `expected doctor.asc_stale warn, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    assert(
      stale.message.includes("/usr/local/bin/asc") && stale.message.includes("5.0.0") && stale.message.includes(LATEST),
      `stale finding must name winner path, winner version, and latest: ${stale.message}`,
    );
    assert(stale.message.includes("Inspect will not upgrade the host"), `stale finding must refuse a host upgrade in inspect copy: ${stale.message}`);
  });

  harness.check("doctor-asc: two PATH entries report the winner and a shadowed warn", () => {
    const { findings } = runIsolated(
      harness,
      "doctor-asc-shadowed",
      fakeFacts([
        { path: "/opt/homebrew/bin/asc", version: LATEST, pathOrder: 0 },
        { path: "/usr/local/bin/asc", version: "4.11.0", pathOrder: 1 },
      ]),
    );
    const shadowed = finding(findings, "doctor.asc_shadowed");
    const ok = finding(findings, "doctor.asc");
    assert(shadowed?.severity === "warn", `expected doctor.asc_shadowed warn, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    assert(shadowed.message.includes("/usr/local/bin/asc") && shadowed.message.includes("/opt/homebrew/bin/asc"), `shadowed finding must name both paths: ${shadowed.message}`);
    assert(ok?.severity === "ok", `winner matching latest stays ok beside the shadow warn, got ${JSON.stringify(ok)}`);
  });

  harness.check("doctor-asc: winner below the support floor warns and keeps the install healthy", () => {
    const { findings } = runIsolated(harness, "doctor-asc-floor", fakeFacts([{ path: "/usr/local/bin/asc", version: "4.11.0" }]));
    const unsupported = finding(findings, "doctor.asc_unsupported");
    assert(unsupported?.severity === "warn", `expected doctor.asc_unsupported warn, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    assert(unsupported.message.includes("4.11.0") && unsupported.message.includes("/usr/local/bin/asc"), `floor finding must name winner: ${unsupported.message}`);
    assert(!findings.some((item) => item.severity === "error"), `below-floor asc must not fail the engine install: ${JSON.stringify(findings.filter((item) => item.severity === "error"))}`);
  });

  harness.check("doctor-asc: unparseable winner version warns and still writes the path", () => {
    const { findings, home } = runIsolated(harness, "doctor-asc-unparseable", fakeFacts([{ path: "/opt/homebrew/bin/asc", version: null }]));
    const unparseable = finding(findings, "doctor.asc_unparseable");
    assert(unparseable?.severity === "warn", `expected doctor.asc_unparseable warn, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    const stored = readDoctorHostObservation(home);
    assert(stored?.path === "/opt/homebrew/bin/asc" && stored.version === null, `unparseable observation keeps the path, got ${JSON.stringify(stored)}`);
  });

  harness.check("doctor-asc: winner ahead of recorded latest is ok, not a warn", () => {
    const { findings } = runIsolated(harness, "doctor-asc-ahead", fakeFacts([{ path: "/opt/homebrew/bin/asc", version: "5.2.0" }]));
    assert(finding(findings, "doctor.asc")?.severity === "ok", `ahead of latest must be ok, got ${JSON.stringify(findings.filter((item) => item.code.startsWith("doctor.asc")))}`);
    assert(!finding(findings, "doctor.asc_stale"), "ahead of latest must not be labeled stale");
  });

  harness.check("doctor-asc: $HOME in the winner path is rewritten to ~ in the host file", () => {
    const { home } = runIsolated(
      harness,
      "doctor-asc-home-rewrite",
      fakeFacts([{ path: "/Users/fixture-operator/.local/bin/asc", version: LATEST }]),
    );
    const stored = readDoctorHostObservation(home);
    assert(stored?.path === "~/.local/bin/asc", `persisted path must use ~, got ${JSON.stringify(stored?.path)}`);
    assert(!JSON.stringify(stored).includes("/Users/fixture-operator"), `host file must not carry a home-directory identity: ${JSON.stringify(stored)}`);
  });

  harness.check("doctor-asc: persist failure is a warn and does not fail the install", () => {
    const findings = runDoctor({
      now: () => new Date(COMPARED_AT),
      home: () => "/tmp/doctor-asc-unwritable-home",
      userHome: () => "/Users/fixture-operator",
      loadAscFacts: () => fakeFacts([{ path: "/opt/homebrew/bin/asc", version: LATEST }]),
      loadRevenueCatFacts: missingRevenueCatFacts,
      loadExpoEasFacts: missingExpoEasFacts,
      persistHost: () => ({ ok: false, message: "disk full" }),
    });
    const writeFailed = finding(findings, "doctor.asc_host_write_failed");
    assert(writeFailed?.severity === "warn", `expected host write failure warn, got ${JSON.stringify(writeFailed)}`);
    assert(writeFailed.message.includes("disk full"), `write-failure finding must keep the cause: ${writeFailed.message}`);
    assert(!findings.some((item) => item.severity === "error" && item.code.startsWith("doctor.asc")), "host write failure must not fail the install");
  });

  harness.check("doctor-asc: status sibling with no host file says inspect has not been run", () => {
    const home = harness.makeTempDir("doctor-asc-status-not-run");
    const block = appendDoctorHostBlock("No durable run yet — bootstrap the workspace and run a session first.", home);
    assert(block.includes("not a live PATH probe"), `status block must say it is not a live PATH probe: ${block}`);
    assert(block.includes("last b2c inspect observation"), `status header must prefer inspect: ${block}`);
    assert(block.includes("inspect has not been run"), `missing file means inspect not run: ${block}`);
    assert(block.includes("supported `b2c doctor`"), `missing file must keep doctor supported: ${block}`);
    assert(!block.includes("no asc on PATH"), `missing file must not be reported as a negative observation: ${block}`);
  });

  harness.check("doctor-asc: present host file with null path is inspect ran, no asc — not inspect not run", () => {
    const home = harness.makeTempDir("doctor-asc-status-negative");
    writeDoctorHostObservation(
      { schemaVersion: "b2c.doctor-host/v1", comparedAt: COMPARED_AT, latestObserved: LATEST, path: null, version: null },
      home,
    );
    const block = renderDoctorHostBlock(readDoctorHostObservation(home));
    assert(block.includes(COMPARED_AT), `dated observation must print compared-at: ${block}`);
    assert(block.includes("not a live PATH probe"), `dated observation must say it is not a live PATH probe: ${block}`);
    assert(block.includes("inspect ran; no asc on PATH"), `null path is a negative observation: ${block}`);
    assert(!block.includes("inspect has not been run"), "a present negative file is not 'inspect not run'");
  });

  harness.check("doctor-asc: dated host file names winner, latest, and compared-at without spawning asc", () => {
    const home = harness.makeTempDir("doctor-asc-status-dated");
    writeDoctorHostObservation(
      { schemaVersion: "b2c.doctor-host/v1", comparedAt: COMPARED_AT, latestObserved: LATEST, path: "/opt/homebrew/bin/asc", version: LATEST },
      home,
    );
    const file = path.join(home, "doctor-host.json");
    assert(existsSync(file), "dated observation must be on disk");
    const raw = readFileSync(file, "utf8");
    assert(!raw.includes("sha256"), "doctor-host.json must not persist a digest");
    const block = appendDoctorHostBlock("No durable run yet — bootstrap the workspace and run a session first.", home);
    assert(block.includes("/opt/homebrew/bin/asc") && block.includes(LATEST) && block.includes(COMPARED_AT), `dated block must name winner and stamp: ${block}`);
    assert(block.includes("not a live PATH probe"), `dated block must refuse to look like a live probe: ${block}`);
  });

  harness.check("doctor-asc: first-run eval expects inspect observation copy", () => {
    const text = readFileSync(
      path.join(skillRoot, "checks", "validation", "repository", "evals", "agent-behavior", "first-run-doctor-asc-winner.yaml"),
      "utf8",
    );
    assert(text.includes("Run b2c inspect"), "first-run eval must prefer inspect");
    assert(text.includes("b2c doctor is a supported equivalent"), "first-run eval must keep doctor supported");
    assert(text.includes("last b2c inspect observation"), "first-run eval must match current status copy");
    assert(!text.includes("last doctor observation"), "first-run eval must not expect the retired doctor observation phrase");
    assert(!/^behavioral:\s*true\s*$/m.test(text), "first-run eval stays authored/linted; do not mark it live behavioral");
  });

  harness.check("doctor-asc: setup help prefers inspect health checks", () => {
    const setup = readFileSync(path.join(skillRoot, "kernel", "session", "setup.ts"), "utf8");
    assert(setup.includes("run inspect health checks"), "setup help must prefer inspect health checks");
    assert(setup.includes("b2c doctor is a supported equivalent"), "setup help must keep doctor supported");
    assert(!setup.includes("run doctor health checks"), "setup help must not keep doctor as the named health-check command");
  });

  harness.check("doctor-asc: ARCH-07 prefers inspect as the CLI host-snapshot writer", () => {
    const northStar = readFileSync(path.join(skillRoot, "docs", "north-star-architecture.md"), "utf8");
    const adr = readFileSync(path.join(skillRoot, "docs", "decisions", "0010-first-run-honesty-owners.md"), "utf8");
    assert(northStar.includes("written only by CLI `inspect`/`setup`"), "ARCH-07 must name inspect as the CLI writer");
    assert(northStar.includes("`doctor` is a supported equivalent"), "ARCH-07 must keep doctor supported");
    assert(
      !northStar.includes("written only by CLI `doctor`/`setup`"),
      "ARCH-07 must not keep doctor as the only named CLI writer",
    );
    assert(adr.includes("CLI `doctor` / `setup` write it"), "ADR-0010 historical writer sentence stays");
    assert(
      adr.includes("A doctor snapshot and a `run/` receipt are stored observations"),
      "ADR-0010 historical doctor snapshot wording stays",
    );
  });

  harness.check("doctor-asc: utterance router catalog-bundle comment prefers inspect", () => {
    const text = readFileSync(path.join(skillRoot, "kernel", "session", "route-utterance.ts"), "utf8");
    assert(text.includes("`b2c inspect` checks"), "utterance router must prefer inspect for catalog-bundle checks");
    assert(text.includes("`b2c doctor` is a supported equivalent"), "utterance router must keep doctor supported");
    assert(!text.includes("`b2c doctor` checks"), "utterance router must not keep doctor as the named catalog-bundle check");
  });

  harness.check("doctor-asc: inspect findings footer prefers inspect", () => {
    const text = readFileSync(path.join(skillRoot, "kernel", "session", "doctor.ts"), "utf8");
    assert(text.includes("inspect: healthy"), "printFindings must prefer inspect in the diagnostic footer");
    assert(text.includes("`b2c doctor` is a supported equivalent"), "printFindings must keep doctor supported");
    assert(text.includes("doctor.node"), "finding codes stay doctor.*");
    assert(!text.includes("doctor: healthy"), "printFindings must not keep doctor as the named diagnostic footer");
  });

  harness.check("doctor-asc: ASC finding messages prefer inspect as the diagnostic actor", () => {
    const text = readFileSync(path.join(skillRoot, "kernel", "session", "doctor.ts"), "utf8");
    const { findings } = runIsolated(harness, "doctor-asc-inspect-actor", fakeFacts([{ path: "/usr/local/bin/asc", version: "5.0.0" }]));
    const stale = finding(findings, "doctor.asc_stale");
    const missingFinding = finding(runIsolated(harness, "doctor-asc-inspect-actor-missing", fakeFacts([])).findings, "doctor.asc_missing");
    const unsupported = finding(
      runIsolated(harness, "doctor-asc-inspect-actor-floor", fakeFacts([{ path: "/usr/local/bin/asc", version: "4.11.0" }])).findings,
      "doctor.asc_unsupported",
    );
    assert(stale?.code === "doctor.asc_stale", "finding codes stay doctor.*");
    assert(stale.message.includes("Inspect will not upgrade the host"), `stale actor copy must prefer inspect: ${stale.message}`);
    assert(unsupported?.message.includes("Inspect will not upgrade the host"), `unsupported actor copy must prefer inspect: ${unsupported?.message}`);
    assert(missingFinding?.message.includes("inspect will not install it"), `missing actor copy must prefer inspect: ${missingFinding?.message}`);
    assert(text.includes("inspect still did not install anything"), "unreadable observation copy must prefer inspect");
    assert(text.includes("`b2c doctor` is a supported equivalent"), "ASC diagnostic copy must keep doctor supported");
    assert(!text.includes("Doctor will not"), "ASC findings must not keep Doctor as the named actor");
    assert(!text.includes("doctor will not install it"), "ASC missing copy must not keep doctor as the named actor");
    assert(!text.includes("doctor still did not install anything"), "ASC unreadable copy must not keep doctor as the named actor");
  });

  harness.check("doctor-asc: sanitizeExecutablePath rewrites only the home prefix", () => {
    assert(sanitizeExecutablePath("/Users/fixture-operator/bin/asc", "/Users/fixture-operator") === "~/bin/asc", "home prefix must become ~");
    assert(sanitizeExecutablePath("/opt/homebrew/bin/asc", "/Users/fixture-operator") === "/opt/homebrew/bin/asc", "non-home paths stay absolute");
  });
}
