#!/usr/bin/env node
/**
 * b2c doctor — is this machine able to run businesses? (layering plan R12)
 *
 * Read-only. Reports, never repairs. The one honesty rule it exists to state: the engine
 * orchestrates the machine owner's OWN agent CLIs — their subscriptions, their spend. A machine
 * with no worker CLI can still bootstrap, plan, and run fixture sessions, so that is a warning,
 * not an error; a broken engine install (missing catalog, version drift between the compiled
 * catalog and skill-version.json, unusable tsx) is an error, because every address misbehaves
 * from there.
 *
 * Exit codes: 0 = healthy (warnings allowed); 1 = the install itself is broken.
 * App Store Connect CLI findings prefer the latest observed release and never install or upgrade
 * the host `asc`. RevenueCat CLI identity uses trusted discovery (`--version` and `commands --json`)
 * because a generic `rc --version` probe cannot distinguish an unrelated binary. Expo/EAS CLI
 * identity uses `--version` only and never claims a live EAS job. A missing or stale
 * winner is a warning, same as a missing worker CLI. Doctor never authenticates, never mutates,
 * and never claims live catalog or live EAS proof.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTsxCommand, tsxBinResolves } from "../../tooling/lib/tsx-bin.js";
import { detectWorkerRuntimes } from "./executor.js";
import {
  assessRevenueCatCliHostDoctor,
  discoverRevenueCatCliForDoctor,
  REVENUECAT_CLI_DOCTOR_REVIEWED_VERSION,
  type RevenueCatCliDiscovery,
} from "../../adapters/providers/revenuecat/cli-doctor.js";
import {
  assessExpoEasHostDoctor,
  discoverExpoCliKindForDoctor,
  EAS_CLI_DOCTOR_DOCUMENTED_VERSION,
  type ExpoCliDiscovery,
} from "../../adapters/providers/expo/doctor.js";
import { b2cAppBuilderHome, loadRegistry, registryPath } from "../../adapters/registry.js";
import { observeHost, probeExecutablesOnPath, runVersionProbe, type HostObserveDependencies, type HostObservationResult } from "../contribution/host-observe.js";
import { compareSemver, parseSemver, semverSatisfies } from "../contribution/upstreams.js";
import { loadUpstreams } from "../contribution/upstreams-load.js";
import { isMainModule } from "../lib/cli.js";
import {
  sanitizeExecutablePath,
  writeDoctorHostObservation,
  type DoctorHostObservation,
  type DoctorHostRevenueCatCliObservation,
  type DoctorHostExpoEasCliObservation,
} from "./doctor-host.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface DoctorFinding {
  readonly severity: "ok" | "warn" | "error";
  readonly code: string;
  readonly message: string;
}

const ASC_UPSTREAM_ID = "rork-app-store-connect-cli";

export interface DoctorAscFacts {
  readonly latestObserved: string | null;
  readonly supportRanges: readonly { readonly range: string; readonly status: string }[];
  readonly observe: (deps: HostObserveDependencies) => HostObservationResult;
}

export interface DoctorRevenueCatFacts {
  readonly latestObserved: string;
  readonly discover: (input: { isolatedHome: string; cwd: string }) => RevenueCatCliDiscovery;
}

export interface DoctorExpoEasFacts {
  readonly latestObserved: string;
  readonly discoverEas: (input: { isolatedHome: string; cwd: string }) => ExpoCliDiscovery;
  readonly discoverExpo: (input: { isolatedHome: string; cwd: string }) => ExpoCliDiscovery;
}

export interface DoctorDependencies {
  readonly now: () => Date;
  readonly home: () => string;
  readonly userHome: () => string;
  readonly loadAscFacts: () => DoctorAscFacts | null;
  readonly loadRevenueCatFacts: () => DoctorRevenueCatFacts;
  readonly loadExpoEasFacts: () => DoctorExpoEasFacts;
  readonly persistHost: (observation: DoctorHostObservation, home: string) => { ok: true } | { ok: false; message: string };
}

function requiredNodeMajor(root: string): number {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { engines?: { node?: string } };
    const match = pkg.engines?.node?.match(/>=(\d+)/);
    if (match?.[1]) return Number(match[1]);
  } catch {
    // Fall through to the published floor when package.json is unreadable.
  }
  return 24;
}

function defaultAscFacts(): DoctorAscFacts | null {
  try {
    const loaded = loadUpstreams(skillRoot);
    const entry = loaded.upstreams.find((item) => item.manifest.id === ASC_UPSTREAM_ID);
    if (!entry?.manifest.hostProbe) return null;
    const spec = entry.manifest.hostProbe;
    return {
      latestObserved: entry.observation?.latestStable?.tag ?? null,
      supportRanges: entry.manifest.support.versions,
      observe: (deps) => observeHost(spec, deps),
    };
  } catch {
    return null;
  }
}

function defaultRevenueCatFacts(): DoctorRevenueCatFacts {
  return {
    latestObserved: REVENUECAT_CLI_DOCTOR_REVIEWED_VERSION,
    discover: ({ isolatedHome, cwd }) => discoverRevenueCatCliForDoctor({ isolatedHome, cwd }),
  };
}

function defaultExpoEasFacts(): DoctorExpoEasFacts {
  return {
    latestObserved: EAS_CLI_DOCTOR_DOCUMENTED_VERSION,
    discoverEas: ({ isolatedHome, cwd }) => discoverExpoCliKindForDoctor({ kind: "eas", isolatedHome, cwd }),
    discoverExpo: ({ isolatedHome, cwd }) => discoverExpoCliKindForDoctor({ kind: "expo", isolatedHome, cwd }),
  };
}

function defaultDoctorDependencies(): DoctorDependencies {
  return {
    now: () => new Date(),
    home: b2cAppBuilderHome,
    userHome: () => process.env.HOME ?? "",
    loadAscFacts: defaultAscFacts,
    loadRevenueCatFacts: defaultRevenueCatFacts,
    loadExpoEasFacts: defaultExpoEasFacts,
    persistHost: writeDoctorHostObservation,
  };
}

export function runDoctor(overrides: Partial<DoctorDependencies> = {}): DoctorFinding[] {
  const deps = { ...defaultDoctorDependencies(), ...overrides };
  const findings: DoctorFinding[] = [];
  const finding = (severity: DoctorFinding["severity"], code: string, message: string): void => {
    findings.push({ severity, code, message });
  };

  const requiredMajor = requiredNodeMajor(skillRoot);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(nodeMajor) && nodeMajor >= requiredMajor) finding("ok", "doctor.node", `node ${process.versions.node}`);
  else finding("error", "doctor.node_too_old", `node ${process.versions.node} — the engine needs node ${requiredMajor} or newer`);

  const command = resolveTsxCommand(skillRoot, []);
  const tsxBin = command.executable === process.execPath ? command.args[0]! : command.executable;
  if (tsxBinResolves(tsxBin)) finding("ok", "doctor.tsx", `tsx at ${tsxBin}`);
  else
    finding(
      "error",
      "doctor.tsx_missing",
      `tsx is not installed — no local or package-resolved tsx dependency was found, so "${tsxBin}" was taken from PATH, and PATH does not provide it either. Reinstall b2c-app-builder or run npm ci in a source checkout.`,
    );

  const versionFile = path.join(skillRoot, "skill-version.json");
  const catalogFile = path.join(skillRoot, "catalog", "generated", "catalog.json");
  let engineVersion: string | undefined;
  try {
    engineVersion = (JSON.parse(readFileSync(versionFile, "utf8")) as { version?: string }).version;
  } catch {
    finding("error", "doctor.version_unreadable", `${versionFile} is missing or unreadable — this is not a complete b2c install`);
  }
  if (engineVersion) {
    if (!existsSync(catalogFile)) {
      finding("error", "doctor.catalog_missing", `${catalogFile} is absent — the compiled catalog ships with the package; reinstall or re-render`);
    } else {
      try {
        const catalogVersion = (JSON.parse(readFileSync(catalogFile, "utf8")) as { skillVersion?: string }).skillVersion;
        if (catalogVersion === engineVersion) finding("ok", "doctor.catalog", `catalog compiled at ${engineVersion}`);
        else
          finding(
            "error",
            "doctor.catalog_drift",
            `compiled catalog is at ${catalogVersion ?? "(unversioned)"} but the engine is ${engineVersion} — a stale artifact; update or re-render`,
          );
      } catch {
        finding("error", "doctor.catalog_unreadable", `${catalogFile} is not valid JSON`);
      }
    }
  }

  try {
    const registry = loadRegistry();
    finding("ok", "doctor.registry", `${registry.workspaces.length} workspace(s) registered at ${registryPath()}`);
    for (const entry of registry.workspaces) {
      if (!existsSync(entry.path))
        finding(
          "warn",
          "doctor.workspace_missing",
          `registered workspace "${entry.id}" points at ${entry.path}, which no longer exists — b2c workspaces remove ${entry.id}`,
        );
    }
  } catch {
    finding("error", "doctor.registry_corrupt", `${registryPath()} exists but is not a valid registry — fix or delete it, then re-register workspaces`);
  }
  if (!existsSync(deps.home())) finding("warn", "doctor.home_missing", `${deps.home()} does not exist yet — b2c setup creates it`);

  const runtimes = detectWorkerRuntimes();
  const present = runtimes.filter((entry) => entry.available);
  if (present.length > 0) {
    finding("ok", "doctor.worker_runtimes", `worker CLI(s) on this machine: ${present.map((entry) => entry.command).join(", ")}`);
  } else {
    finding(
      "warn",
      "doctor.no_worker_runtime",
      `no worker CLI found (looked for ${runtimes.map((entry) => entry.command).join(", ")}). Real sessions dispatch YOUR agent CLIs — your subscriptions, your spend. Install at least one; fixture sessions work without any.`,
    );
  }

  const comparedAt = deps.now().toISOString();
  const asc = probeAsc(finding, deps);
  const revenuecatCli = probeRevenueCatCli(finding, deps);
  const expoEas = probeExpoEasCli(finding, deps);
  persistDoctorHost(finding, deps, comparedAt, asc, revenuecatCli, expoEas);

  return findings;
}

function persistDoctorHost(
  finding: (severity: DoctorFinding["severity"], code: string, message: string) => void,
  deps: DoctorDependencies,
  comparedAt: string,
  asc: { readonly latestObserved: string | null; readonly path: string | null; readonly version: string | null },
  revenuecatCli: DoctorHostRevenueCatCliObservation,
  expoEas: { readonly easCli: DoctorHostExpoEasCliObservation; readonly expoCli: DoctorHostExpoEasCliObservation },
): void {
  const written = deps.persistHost(
    {
      schemaVersion: "b2c.doctor-host/v1",
      comparedAt,
      latestObserved: asc.latestObserved,
      path: asc.path,
      version: asc.version,
      revenuecatCli,
      easCli: expoEas.easCli,
      expoCli: expoEas.expoCli,
    },
    deps.home(),
  );
  if (!written.ok) {
    finding("warn", "doctor.asc_host_write_failed", `could not write doctor-host.json: ${written.message}`);
    finding("warn", "doctor.revenuecat_cli_host_write_failed", `could not write doctor-host.json: ${written.message}`);
    finding("warn", "doctor.eas_cli_host_write_failed", `could not write doctor-host.json: ${written.message}`);
    finding("warn", "doctor.expo_cli_host_write_failed", `could not write doctor-host.json: ${written.message}`);
  }
}

function probeExpoEasCli(
  finding: (severity: DoctorFinding["severity"], code: string, message: string) => void,
  deps: DoctorDependencies,
): { readonly easCli: DoctorHostExpoEasCliObservation; readonly expoCli: DoctorHostExpoEasCliObservation } {
  const facts = deps.loadExpoEasFacts();
  const isolatedHome = path.join(deps.home(), "expo-eas-doctor");
  const sanitizePath = (executablePath: string) => sanitizeExecutablePath(executablePath, deps.userHome());
  const easAssessed = assessExpoEasHostDoctor({
    discovery: facts.discoverEas({ isolatedHome, cwd: isolatedHome }),
    latestObserved: facts.latestObserved,
    sanitizePath,
  });
  const expoAssessed = assessExpoEasHostDoctor({
    discovery: facts.discoverExpo({ isolatedHome, cwd: isolatedHome }),
    latestObserved: facts.latestObserved,
    sanitizePath,
  });
  for (const item of easAssessed.findings) finding(item.severity, item.code, item.message);
  for (const item of expoAssessed.findings) finding(item.severity, item.code, item.message);
  return { easCli: easAssessed.observation, expoCli: expoAssessed.observation };
}

function probeRevenueCatCli(
  finding: (severity: DoctorFinding["severity"], code: string, message: string) => void,
  deps: DoctorDependencies,
): DoctorHostRevenueCatCliObservation {
  const facts = deps.loadRevenueCatFacts();
  const isolatedHome = path.join(deps.home(), "revenuecat-cli-doctor");
  const discovery = facts.discover({ isolatedHome, cwd: isolatedHome });
  const assessed = assessRevenueCatCliHostDoctor({
    discovery,
    latestObserved: facts.latestObserved,
    sanitizePath: (executablePath) => sanitizeExecutablePath(executablePath, deps.userHome()),
  });
  for (const item of assessed.findings) finding(item.severity, item.code, item.message);
  return assessed.observation;
}

function probeAsc(
  finding: (severity: DoctorFinding["severity"], code: string, message: string) => void,
  deps: DoctorDependencies,
): { readonly latestObserved: string | null; readonly path: string | null; readonly version: string | null } {
  const facts = deps.loadAscFacts();
  const latest = facts?.latestObserved ?? null;

  if (!facts) {
    finding("warn", "doctor.asc_observation_unreadable", "could not load the App Store Connect CLI upstream observation — doctor still did not install anything");
    return { latestObserved: latest, path: null, version: null };
  }

  const observed = facts.observe({
    now: deps.now,
    probeExecutables: probeExecutablesOnPath,
    runVersion: runVersionProbe,
    hashFile: () => null,
  });

  const winner = observed.host.executables[0];
  if (!winner) {
    finding(
      "warn",
      "doctor.asc_missing",
      `no asc on PATH. Latest observed ${latest ?? "(unknown)"}. Store lanes need the App Store Connect CLI; doctor will not install it.`,
    );
    return { latestObserved: latest, path: null, version: null };
  }

  const winnerPath = sanitizeExecutablePath(winner.path, deps.userHome());
  const extras = observed.host.executables.slice(1);
  if (extras.length > 0) {
    finding(
      "warn",
      "doctor.asc_shadowed",
      `PATH also has ${extras.map((entry) => sanitizeExecutablePath(entry.path, deps.userHome())).join(", ")}; winner is ${winnerPath}`,
    );
  }

  if (!winner.version) {
    finding("warn", "doctor.asc_unparseable", `winning ${winnerPath} did not print a parseable version. Latest observed ${latest ?? "(unknown)"}.`);
    return { latestObserved: latest, path: winnerPath, version: null };
  }

  const parsed = parseSemver(winner.version);
  if (!parsed) {
    finding("warn", "doctor.asc_unparseable", `winning ${winnerPath} reports ${winner.version}, which is not semver. Latest observed ${latest ?? "(unknown)"}.`);
    return { latestObserved: latest, path: winnerPath, version: winner.version };
  }

  const unsupported = facts.supportRanges.find((range) => range.status === "unsupported" && semverSatisfies(parsed, range.range) === true);
  if (unsupported) {
    finding(
      "warn",
      "doctor.asc_unsupported",
      `winning ${winnerPath} is ${winner.version}, which is outside the builder's supported range. Latest observed ${latest ?? "(unknown)"}. Doctor will not upgrade the host.`,
    );
    return { latestObserved: latest, path: winnerPath, version: winner.version };
  }

  if (latest) {
    const latestParsed = parseSemver(latest);
    if (latestParsed && compareSemver(parsed, latestParsed) < 0) {
      finding(
        "warn",
        "doctor.asc_stale",
        `winning ${winnerPath} is ${winner.version}; latest observed is ${latest}. Prefer the latest App Store Connect CLI. Doctor will not upgrade the host.`,
      );
      return { latestObserved: latest, path: winnerPath, version: winner.version };
    }
  }

  finding("ok", "doctor.asc", `winning ${winnerPath} ${winner.version}${latest ? ` (latest observed ${latest})` : ""}`);
  return { latestObserved: latest, path: winnerPath, version: winner.version };
}

export function printFindings(findings: readonly DoctorFinding[]): number {
  for (const item of findings) console.log(`${item.severity.toUpperCase().padEnd(5)} ${item.code} — ${item.message}`);
  const errors = findings.filter((item) => item.severity === "error").length;
  const warns = findings.filter((item) => item.severity === "warn").length;
  console.log(
    errors > 0 ? `\ndoctor: ${errors} error(s), ${warns} warning(s) — this install cannot run businesses yet.` : `\ndoctor: healthy (${warns} warning(s)).`,
  );
  return errors > 0 ? 1 : 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = printFindings(runDoctor());
}
