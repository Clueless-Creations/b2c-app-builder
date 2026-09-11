#!/usr/bin/env node
/**
 * check-pack-composition.ts — additive pack composition gate.
 *
 * Duplicate global ids, static dependency cycles, unresolved references, invalid
 * extension slots, and monotonicity violations fail closed. A workspace with no
 * packs is equivalent to the bundled catalog and must still emit a composition
 * fingerprint.
 *
 * npm script: check:pack-composition
 * Usage: tsx checks/validation/repository/check-pack-composition.ts --skill-root /path/to/skill
 *
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { composeCatalog } from "../../../catalog/index.js";
import { composePacks } from "../../../catalog/packs/compose.js";
import { parsePackYaml } from "../../../catalog/packs/load.js";
import type { PackManifest } from "../../../catalog/packs/types.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--packs-dir"], key: "packsDir" },
]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const packsDir = flagString(flags, "packsDir");
const issues: Issue[] = [];

function addError(code: string, message: string, file?: string): void {
  issues.push(issue("error", code, message, file));
}

function loadFixturePacks(root: string): PackManifest[] {
  if (!existsSync(root)) return [];
  const manifests: PackManifest[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = entry.isDirectory()
      ? path.join(root, entry.name, "pack.yaml")
      : entry.isFile() && entry.name.endsWith(".yaml")
        ? path.join(root, entry.name)
        : undefined;
    if (!file || !existsSync(file)) continue;
    try {
      manifests.push(parsePackYaml(readFileSync(file, "utf8"), path.relative(root, file)));
    } catch (error) {
      addError("pack_composition.identity_invalid", error instanceof Error ? error.message : String(error), path.relative(root, file));
    }
  }
  return manifests;
}

try {
  const packs = packsDir ? loadFixturePacks(path.resolve(packsDir)) : [];
  const base = composeCatalog(skillRoot);
  if (!base.composition?.fingerprint) {
    addError("pack_composition.pin_missing", "composeCatalog must emit a composition fingerprint");
  }
  if (packs.length === 0) {
    const owner = readFirstpartyPackage(skillRoot).snapshot.extension;
    const pins = base.composition?.packs ?? [];
    if (
      pins.length !== 1 ||
      pins[0]!.id !== "business-pack.consumer-business" ||
      pins[0]!.kind !== "business-pack" ||
      pins[0]!.version !== owner.version ||
      pins[0]!.revision !== owner.version ||
      !/^[a-f0-9]{64}$/.test(pins[0]!.contentDigest ?? "")
    ) {
      addError(
        "pack_composition.identity_invalid",
        "default composition must pin exactly the verified firstparty business pack version, revision, and content digest",
      );
    }
  } else {
    const result = composePacks(base, packs);
    for (const item of result.issues) {
      issues.push(issue(item.severity, item.code, item.message, item.path));
    }
    if (!result.catalog.composition?.fingerprint) {
      addError("pack_composition.pin_missing", "composed catalog must emit a composition fingerprint");
    }
  }
} catch (error) {
  addError("pack_composition.identity_invalid", error instanceof Error ? error.message : String(error));
}

reportAndExit("Pack composition check", issues);
