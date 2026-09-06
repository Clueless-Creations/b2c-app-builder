#!/usr/bin/env node
/**
 * check-evidence-schema-drift.ts — the checked-in evidence-schema fingerprint must still match
 * the live catalog and the three evidence-dialect schemas.
 *
 * A schema edit, or a catalog change that shifts composeCatalog()'s output, without a matching
 * `npm run render:evidence-schema-version` leaves kernel/schema/evidence-schema-version.json
 * silently stale — exactly the "version bump needs a regenerated artifact, and nothing catches
 * it" gap this gate exists to close for the evidence dialect specifically.
 *
 * npm script: check:evidence-schema-drift
 * Usage: tsx checks/validation/business/research/check-evidence-schema-drift.ts [--skill-root <dir>]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH, evidenceSchemaFingerprintIsCurrent } from "../../../../kernel/schema/evidence-schema-version.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");
const flags = parseFlags(process.argv.slice(2), [{ flags: ["--skill-root", "--root"], key: "skillRoot" }]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;

const issues: Issue[] = [];
const status = evidenceSchemaFingerprintIsCurrent(skillRoot);

if (!status.checkedIn) {
  issues.push(
    issue(
      "error",
      "evidence_schema_drift.version_file_missing",
      `${EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH} is missing or unparseable. Run npm run render:evidence-schema-version and commit the result.`,
      EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH,
    ),
  );
} else if (!status.current) {
  issues.push(
    issue(
      "error",
      "evidence_schema_drift.stale",
      `${EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH} no longer matches the live catalog and evidence-dialect schemas ` +
        `(checked-in schema ${status.checkedIn.schemaSha256} / catalog ${status.checkedIn.catalogSha256}; ` +
        `live schema ${status.live.schemaSha256} / catalog ${status.live.catalogSha256}). ` +
        "Run npm run render:evidence-schema-version and commit the result.",
      EVIDENCE_SCHEMA_VERSION_RELATIVE_PATH,
    ),
  );
}

reportAndExit("Evidence schema drift check", issues);
