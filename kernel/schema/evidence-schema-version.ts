#!/usr/bin/env node
/**
 * evidence-schema-version.ts — fingerprint the evidence dialect's schemas against the catalog
 * they ship inside, exactly the way tooling/render-hosted-bundle.ts fingerprints the hosted
 * knowledge bundle against the same catalog.
 *
 * This closes the gap the user's own prior incident named: a version/catalog bump with no
 * validator to catch a stale generated artifact. Here the generated artifact is
 * kernel/schema/evidence-schema-version.json; checks/validation/business/research/check-evidence-schema-drift.ts
 * is the gate that fails when it goes stale.
 *
 * npm script: render:evidence-schema-version
 * Usage: tsx kernel/schema/evidence-schema-version.ts [--skill-root <dir>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composeCatalog } from "../../catalog/index.js";
import { digest, stableJson } from "../../tooling/lib/canonical-json.js";
import { resolveSkillRoot } from "../../tooling/lib/skill-root.js";
import { isMainModule, parseArgs } from "../lib/cli.js";

/** Parsed in this fixed order so schemaSha256 is stable regardless of directory-listing order. */
export const EVIDENCE_SCHEMA_FILES = ["research-evidence.schema.json", "signal-corpus.schema.json", "offer-test.schema.json"] as const;

export const EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH = "kernel/schema/evidence-schema-version.json";

export interface EvidenceSchemaFingerprint {
  readonly catalogSha256: string;
  readonly schemaSha256: string;
  readonly generatedAt: string;
}

const schemaDir = path.join(resolveSkillRoot(import.meta.url), "kernel", "schema");

export function computeEvidenceSchemaFingerprint(skillRoot: string, generatedAt: string): EvidenceSchemaFingerprint {
  const schemas = EVIDENCE_SCHEMA_FILES.map((file) => JSON.parse(readFileSync(path.join(schemaDir, file), "utf8")) as unknown);
  return {
    catalogSha256: digest(stableJson(composeCatalog(skillRoot))),
    schemaSha256: digest(stableJson(schemas)),
    generatedAt,
  };
}

export function readCheckedInEvidenceSchemaFingerprint(skillRoot: string): EvidenceSchemaFingerprint | undefined {
  const target = path.join(skillRoot, EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH);
  if (!existsSync(target)) return undefined;
  try {
    return JSON.parse(readFileSync(target, "utf8")) as EvidenceSchemaFingerprint;
  } catch {
    return undefined;
  }
}

export interface EvidenceSchemaFingerprintStatus {
  readonly current: boolean;
  readonly live: EvidenceSchemaFingerprint;
  readonly checkedIn?: EvidenceSchemaFingerprint;
}

/**
 * `generatedAt` is a timestamp, not a fact about the schemas or catalog — it is deliberately
 * excluded from the drift comparison so a re-render with no real change is not itself drift.
 */
export function evidenceSchemaFingerprintIsCurrent(skillRoot: string): EvidenceSchemaFingerprintStatus {
  const checkedIn = readCheckedInEvidenceSchemaFingerprint(skillRoot);
  const live = computeEvidenceSchemaFingerprint(skillRoot, checkedIn?.generatedAt ?? new Date(0).toISOString());
  const current = checkedIn !== undefined && checkedIn.catalogSha256 === live.catalogSha256 && checkedIn.schemaSha256 === live.schemaSha256;
  return { current, live, checkedIn };
}

function writeEvidenceSchemaVersion(skillRoot: string): EvidenceSchemaFingerprint {
  const fingerprint = computeEvidenceSchemaFingerprint(skillRoot, new Date().toISOString());
  writeFileSync(path.join(skillRoot, EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH), `${JSON.stringify(fingerprint, null, 2)}\n`, "utf8");
  return fingerprint;
}

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const skillRoot = args["skill-root"] ? path.resolve(args["skill-root"]) : path.resolve(schemaDir, "../..");
  const fingerprint = writeEvidenceSchemaVersion(skillRoot);
  console.log(`Wrote ${EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH} (schema ${fingerprint.schemaSha256}, catalog ${fingerprint.catalogSha256}).`);
}
