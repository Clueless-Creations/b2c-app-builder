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
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTsxBin, tsxBinResolves } from "../../tooling/lib/tsx-bin.js";
import { detectWorkerRuntimes } from "./executor.js";
import { b2cAppBuilderHome, loadRegistry, registryPath } from "../../adapters/registry.js";
import { isMainModule } from "../lib/cli.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface DoctorFinding {
  readonly severity: "ok" | "warn" | "error";
  readonly code: string;
  readonly message: string;
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

export function runDoctor(): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const finding = (severity: DoctorFinding["severity"], code: string, message: string): void => {
    findings.push({ severity, code, message });
  };

  const requiredMajor = requiredNodeMajor(skillRoot);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(nodeMajor) && nodeMajor >= requiredMajor) finding("ok", "doctor.node", `node ${process.versions.node}`);
  else finding("error", "doctor.node_too_old", `node ${process.versions.node} — the engine needs node ${requiredMajor} or newer`);

  const tsxBin = resolveTsxBin(skillRoot);
  if (tsxBinResolves(tsxBin)) finding("ok", "doctor.tsx", `tsx at ${tsxBin}`);
  else
    finding(
      "error",
      "doctor.tsx_missing",
      `tsx is not installed — no local node_modules/.bin/tsx was found, so "${tsxBin}" was taken from PATH, and PATH does not provide it either. Run npm ci in this checkout.`,
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
  if (!existsSync(b2cAppBuilderHome())) finding("warn", "doctor.home_missing", `${b2cAppBuilderHome()} does not exist yet — b2c setup creates it`);

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

  return findings;
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
