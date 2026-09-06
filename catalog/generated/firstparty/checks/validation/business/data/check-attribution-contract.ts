#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  asArray,
  asBoolean,
  asString,
  collectFiles,
  getPath,
  issue,
  loadProjectState,
  parseCliArgs,
  reportAndExit,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;
const canonicalEventName = "attribution_source_selected";

// ---------------------------------------------------------------------------
// TIER-1: Example-file fingerprint and byte-floor helpers
// ---------------------------------------------------------------------------

/** Minimum byte size for a proof artifact to pass the content-floor check. */
const PROOF_MIN_BYTES = 80;

/** Path to the shipped example file for posthog-proof (relative to skill root). */
const POSTHOG_PROOF_EXAMPLE_REL = "analytics/posthog-proof.example.json";

/**
 * Return true when the given file is byte-identical to the shipped example.
 * We locate the example by walking up from __dirname (checks/validation/business/data/) to the skill
 * root (business/analytics/posthog-proof.example.json).
 */
function isExampleIdentical(filePath: string): boolean {
  try {
    // __dirname is this gate's own directory inside the skill package —
    // checks/validation/business/<domain>/ — so the skill root, and business/ with it, is two levels up.
    const examplePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "business", POSTHOG_PROOF_EXAMPLE_REL);
    if (!existsSync(examplePath)) {
      return false; // can't compare — skip
    }
    const candidate = readFileSync(filePath, "utf8");
    const example = readFileSync(examplePath, "utf8");
    return candidate === example;
  } catch {
    return false;
  }
}

/**
 * Return true when the file is below the minimum byte floor (too small to be
 * a real PostHog response — a 1-byte or trivially short placeholder).
 */
function isBelowByteFloor(filePath: string): boolean {
  try {
    const size = statSync(filePath).size;
    return size < PROOF_MIN_BYTES;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Placeholder detection helpers
// ---------------------------------------------------------------------------

/** Returns true when a path string looks like a template placeholder (not yet filled in). */
function isPlaceholder(value: string): boolean {
  return /\bTODO\b|PLACEHOLDER|<[^>]+>|EXAMPLE|YOUR_PATH|your[-_]path|tbd|TBD/i.test(value) || value.trim() === "";
}

/** Resolves a path that may be relative to --root or already absolute. */
function resolveEvidence(evidencePath: string): string {
  return path.isAbsolute(evidencePath) ? evidencePath : path.join(args.root, evidencePath);
}

// ---------------------------------------------------------------------------
// operations/PROVIDER_PROOF.md cross-lane check
// ---------------------------------------------------------------------------

function checkProviderProofForPostHog(laneStatus: string): void {
  const proofCandidates = ["operations/PROVIDER_PROOF.md", "provider-proof.md", "evidence/operations/PROVIDER_PROOF.md"];
  let proofText: string | undefined;
  let proofFile: string | undefined;

  for (const candidate of proofCandidates) {
    const resolved = path.join(args.root, candidate);
    if (existsSync(resolved)) {
      proofText = readFileSync(resolved, "utf8");
      proofFile = candidate;
      break;
    }
  }

  // When the lane is done, operations/PROVIDER_PROOF.md must exist.
  if (laneStatus === "succeeded" && !proofText) {
    issues.push(
      issue(
        "error",
        "attribution.provider_proof.file_missing",
        "analytics_attribution lane is 'done' but operations/PROVIDER_PROOF.md is missing. Record PostHog live-event and person-property evidence before marking done.",
        "operations/PROVIDER_PROOF.md",
      ),
    );
    return;
  }

  if (!proofText || !proofFile) {
    if (laneStatus === "running") {
      issues.push(
        issue(
          "warning",
          "attribution.provider_proof.file_missing",
          "operations/PROVIDER_PROOF.md not found. Add it with a PostHog row including a non-placeholder evidence path before moving analytics_attribution to 'done'.",
          "operations/PROVIDER_PROOF.md",
        ),
      );
    }
    return;
  }

  // Locate the PostHog table row(s).
  const posthogRowPattern = /\|\s*PostHog\s*\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|/gi;
  let match: RegExpExecArray | null;
  let foundPostHogRow = false;

  while ((match = posthogRowPattern.exec(proofText)) !== null) {
    foundPostHogRow = true;

    // Column positions (1-indexed): provider | current status | proof command | evidence path | founder-only gate
    const currentStatus = match[1]?.trim() ?? "";
    const evidencePathCell = match[3]?.trim() ?? "";

    // Check whether the evidence path cell looks like a placeholder.
    if (isPlaceholder(evidencePathCell)) {
      issues.push(
        issue(
          laneStatus === "succeeded" ? "error" : "warning",
          "attribution.provider_proof_placeholder",
          `PostHog row in operations/PROVIDER_PROOF.md has a placeholder evidence path ("${evidencePathCell}"). Replace with the real path to your PostHog event export, capture log, or screenshot before moving analytics_attribution to 'done'.`,
          proofFile,
        ),
      );
    } else {
      if (laneStatus === "succeeded") {
        if (evidencePathCell.startsWith("http://") || evidencePathCell.startsWith("https://")) {
          // TIER-3: a remote URL in the evidence cell cannot be verified by the static
          // validator. Downgrade to a WARNING and tell the founder to attest or run the
          // probe (which writes a local artifact instead).
          issues.push(
            issue(
              "warning",
              "attribution.provider_proof_evidence_url_unverifiable",
              `PostHog evidence path "${evidencePathCell}" in operations/PROVIDER_PROOF.md is a remote URL — the static validator cannot fetch it. Founder must attest (add a comment "founder-attested: YYYY-MM-DD") or run the probe to generate analytics/posthog-proof.json: doppler run -- npx tsx tooling/probe-posthog.ts --root .`,
              proofFile,
            ),
          );
        } else {
          // Local path: must exist on disk.
          const absoluteEvidence = resolveEvidence(evidencePathCell);
          if (!existsSync(absoluteEvidence)) {
            issues.push(
              issue(
                "error",
                "attribution.provider_proof_evidence_path_missing",
                `PostHog evidence path "${evidencePathCell}" recorded in operations/PROVIDER_PROOF.md does not exist on disk. Create the file or update the path.`,
                proofFile,
              ),
            );
          }
        }
      }
    }

    // Catch rows that claim "verified" but still have placeholder status text.
    if (/\b(verified|live|confirmed)\b/i.test(currentStatus) && isPlaceholder(evidencePathCell)) {
      issues.push(
        issue(
          laneStatus === "succeeded" ? "error" : "warning",
          "attribution.provider_proof_placeholder",
          `PostHog row claims status "${currentStatus}" but still has a placeholder evidence path. Status and evidence must agree.`,
          proofFile,
        ),
      );
    }
  }

  if (!foundPostHogRow && laneStatus === "succeeded") {
    issues.push(
      issue(
        "error",
        "attribution.provider_proof.posthog_row_missing",
        "operations/PROVIDER_PROOF.md must include a PostHog row with current status, proof command, and evidence path when analytics_attribution is 'done'.",
        proofFile,
      ),
    );
  }

  if (!foundPostHogRow && laneStatus === "running") {
    issues.push(
      issue(
        "warning",
        "attribution.provider_proof.posthog_row_missing",
        "Add a PostHog row to operations/PROVIDER_PROOF.md before marking analytics_attribution done.",
        proofFile,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// PROVEN: evidence path existence check
// ---------------------------------------------------------------------------

/**
 * When analytics_attribution is "done" and attribution_contract.verified is true,
 * there must be at least one evidence artifact that:
 *   (a) is listed under lanes.analytics_attribution.evidence in state/business-state.json, AND
 *   (b) actually exists on disk (not a placeholder filename), AND
 *   (c) is not one of the planning-only docs (analytics/ANALYTICS.md, analytics/analytics-plan.html)
 *       — the lane needs at least one proof artifact beyond the plan.
 */
function checkVerifiedEvidencePaths(laneStatus: string): void {
  const planningOnlyDocs = new Set(["analytics/ANALYTICS.md", "analytics/analytics-plan.html"]);
  const evidenceList = asArray(getPath(state, "lanes.analytics_attribution.evidence"))
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item?.trim()));

  const proofArtifacts = evidenceList.filter((e) => !planningOnlyDocs.has(e));

  if (laneStatus === "succeeded") {
    if (proofArtifacts.length === 0) {
      issues.push(
        issue(
          "error",
          "attribution.verified_without_evidence_path",
          "analytics_attribution is 'done' but no proof artifact is listed under lanes.analytics_attribution.evidence beyond planning docs (analytics/ANALYTICS.md, analytics/analytics-plan.html). Add a path to a PostHog event export, on-device capture log, or equivalent live evidence.",
          "state/business-state.json",
        ),
      );
    } else {
      for (const evidencePath of proofArtifacts) {
        if (isPlaceholder(evidencePath)) {
          issues.push(
            issue(
              "error",
              "attribution.verified_without_evidence_path",
              `Evidence path "${evidencePath}" in lanes.analytics_attribution.evidence looks like a placeholder. Replace with the real path to live proof.`,
              "state/business-state.json",
            ),
          );
          continue;
        }

        // TIER-1: bare-word evidence strings (no slash or dot) are suspicious —
        // they are almost certainly copied from a template comment and will never
        // exist as real files. Downgrade to a warning rather than a silent skip.
        if (!evidencePath.includes("/") && !evidencePath.includes(".")) {
          issues.push(
            issue(
              "warning",
              "attribution.evidence_path_bare_word",
              `Evidence path "${evidencePath}" in lanes.analytics_attribution.evidence contains no slash or extension — this looks like a bare-word placeholder rather than a real file path. Provide a relative path such as "analytics/posthog-proof.json".`,
              "state/business-state.json",
            ),
          );
        }

        const absoluteEvidence = resolveEvidence(evidencePath);
        if (!existsSync(absoluteEvidence)) {
          issues.push(
            issue(
              "error",
              "attribution.verified_without_evidence_path",
              `Evidence path "${evidencePath}" listed in lanes.analytics_attribution.evidence does not exist on disk. Create the file or correct the path before marking the lane done.`,
              "state/business-state.json",
            ),
          );
        }
      }
    }
  } else if (laneStatus === "running") {
    // Warn if verified=true but no proof path exists yet.
    for (const evidencePath of proofArtifacts) {
      if (isPlaceholder(evidencePath)) {
        issues.push(
          issue(
            "warning",
            "attribution.verified_without_evidence_path",
            `Evidence path "${evidencePath}" in lanes.analytics_attribution.evidence looks like a placeholder. Fill it in before moving to 'done'.`,
            "state/business-state.json",
          ),
        );
      }
      // TIER-1: bare-word warning fires at partial too.
      if (!evidencePath.includes("/") && !evidencePath.includes(".")) {
        issues.push(
          issue(
            "warning",
            "attribution.evidence_path_bare_word",
            `Evidence path "${evidencePath}" contains no slash or extension — provide a relative path such as "analytics/posthog-proof.json".`,
            "state/business-state.json",
          ),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// TIER-3: posthog-proof.json artifact validation
// ---------------------------------------------------------------------------

/**
 * ProofRecord is the non-secret shape written by probe-posthog.ts.
 * All fields are required when the lane is done.
 */
interface ProofRecord {
  probe?: unknown;
  event_name?: unknown;
  event_count?: unknown;
  window_days?: unknown;
  window_start?: unknown;
  window_end?: unknown;
  api_host?: unknown;
  http_status?: unknown;
  recorded_at?: unknown;
}

/** Maximum age (in hours) for a posthog-proof.json to be considered fresh. */
const PROOF_MAX_AGE_HOURS = 72;

/**
 * Validates analytics/posthog-proof.json when the lane is "done".
 * Rules (all errors at done, all skipped when not_started):
 *   1. File must exist on disk.
 *   2. File must not be byte-identical to the shipped example.
 *   3. File must be above the minimum byte floor.
 *   4. File must parse as valid JSON with the required probe fingerprint.
 *   5. event_count must be a number > 0 (not 0, not "unknown", not "at_least_1").
 *   6. recorded_at must parse as a date no older than PROOF_MAX_AGE_HOURS.
 *
 * When the operations/PROVIDER_PROOF.md PostHog row's evidence cell is a bare https:// URL
 * (not a local path), the validator cannot fetch it — downgrade to a WARNING
 * and require the founder to attest or run the probe.
 */
function checkPostHogProofArtifact(laneStatus: string): void {
  if (laneStatus === "succeeded") {
    const proofFilePath = path.join(args.root, "analytics", "posthog-proof.json");

    if (!existsSync(proofFilePath)) {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.missing",
          "analytics_attribution is 'done' but analytics/posthog-proof.json does not exist. Run the founder-gated probe: doppler run -- npx tsx tooling/probe-posthog.ts --root .",
          "analytics/posthog-proof.json",
        ),
      );
      return;
    }

    // TIER-1: reject example-identical files
    if (isExampleIdentical(proofFilePath)) {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.example_copy",
          "analytics/posthog-proof.json is byte-identical to the shipped example file. Run the real probe: doppler run -- npx tsx tooling/probe-posthog.ts --root .",
          "analytics/posthog-proof.json",
        ),
      );
      return;
    }

    // TIER-1: reject sub-threshold files
    if (isBelowByteFloor(proofFilePath)) {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.too_small",
          `analytics/posthog-proof.json is below the minimum ${PROOF_MIN_BYTES}-byte floor — it is likely a placeholder. Run the real probe: doppler run -- npx tsx tooling/probe-posthog.ts --root .`,
          "analytics/posthog-proof.json",
        ),
      );
      return;
    }

    let record: ProofRecord;
    try {
      record = JSON.parse(readFileSync(proofFilePath, "utf8")) as ProofRecord;
    } catch {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.invalid_json",
          "analytics/posthog-proof.json is not valid JSON. Re-run: doppler run -- npx tsx tooling/probe-posthog.ts --root .",
          "analytics/posthog-proof.json",
        ),
      );
      return;
    }

    // TIER-3: probe fingerprint
    if (record.probe !== "posthog@1") {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.missing_fingerprint",
          `analytics/posthog-proof.json is missing the "probe":"posthog@1" fingerprint or has an unexpected value ("${String(record.probe)}"). Re-run: doppler run -- npx tsx tooling/probe-posthog.ts --root .`,
          "analytics/posthog-proof.json",
        ),
      );
      return;
    }

    // TIER-3: event count must be a positive number
    const count = record.event_count;
    if (count === "unknown" || count === null || count === undefined) {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.count_unknown",
          'analytics/posthog-proof.json records event_count="unknown" — the probe did not get a successful API response. Check PostHog credentials and re-run the probe.',
          "analytics/posthog-proof.json",
        ),
      );
    } else if (count === 0 || count === "0") {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.count_zero",
          "analytics/posthog-proof.json records event_count=0 — no attribution events have arrived in PostHog within the proof window. Keep the lane at 'partial' until real user traffic is recorded.",
          "analytics/posthog-proof.json",
        ),
      );
    } else if (count === "at_least_1") {
      // Acceptable — the probe fell back to the events list API. Warn that
      // an exact count would be more auditable.
      issues.push(
        issue(
          "warning",
          "attribution.posthog_proof.count_approximate",
          'analytics/posthog-proof.json records event_count="at_least_1" (fallback estimate from Events list API). For a more auditable exact count, re-run the probe when the HogQL Query API is reachable.',
          "analytics/posthog-proof.json",
        ),
      );
    } else if (typeof count !== "number" || count < 0) {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.count_invalid",
          `analytics/posthog-proof.json records event_count="${String(count)}" which is not a valid positive number. Re-run: doppler run -- npx tsx tooling/probe-posthog.ts --root .`,
          "analytics/posthog-proof.json",
        ),
      );
    }

    // TIER-3: freshness check
    const recordedAt = asString(record.recorded_at);
    if (!recordedAt) {
      issues.push(
        issue(
          "error",
          "attribution.posthog_proof.missing_timestamp",
          "analytics/posthog-proof.json is missing the recorded_at timestamp. Re-run the probe.",
          "analytics/posthog-proof.json",
        ),
      );
    } else {
      const recordedDate = new Date(recordedAt);
      if (isNaN(recordedDate.getTime())) {
        issues.push(
          issue(
            "error",
            "attribution.posthog_proof.invalid_timestamp",
            `analytics/posthog-proof.json has an unparseable recorded_at ("${recordedAt}"). Re-run the probe.`,
            "analytics/posthog-proof.json",
          ),
        );
      } else {
        const ageHours = (Date.now() - recordedDate.getTime()) / (1000 * 60 * 60);
        if (ageHours > PROOF_MAX_AGE_HOURS) {
          issues.push(
            issue(
              "error",
              "attribution.posthog_proof.stale",
              `analytics/posthog-proof.json was recorded ${Math.round(ageHours)}h ago (max ${PROOF_MAX_AGE_HOURS}h). Re-run: doppler run -- npx tsx tooling/probe-posthog.ts --root .`,
              "analytics/posthog-proof.json",
            ),
          );
        }
      }
    }
  }
  // Not_started and partial lanes are exempt from the proof artifact check
  // (the artifact won't exist yet — that's expected).
}

// ---------------------------------------------------------------------------
// Implementation text search (PRESENT layer)
// ---------------------------------------------------------------------------

function findImplementationText(root: string, needles: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  // Workspace bookkeeping does not establish an implementation.
  const ignoredFiles = new Set(["state/business-state.json"]);
  const extensions = new Set([".md", ".ts", ".tsx", ".js", ".jsx", ".swift", ".kt", ".java", ".dart", ".yaml", ".yml", ".html"]);

  for (const file of collectFiles(root, extensions)) {
    const relative = path.relative(root, file);
    if (
      ignoredFiles.has(relative) ||
      relative.startsWith("business/") ||
      relative.startsWith("engineering/repo-agent-entrypoints/") ||
      relative.startsWith("agents/") ||
      relative.startsWith("engineering/app-agent-roster/") ||
      ["APP_AGENTS.md", "AGENTS.md", "CLAUDE.md"].includes(relative)
    ) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) {
        const matches = found.get(needle) ?? [];
        matches.push(relative);
        found.set(needle, matches);
      }
    }
  }

  return found;
}

function checkHdyhauSurvey(laneStatus: string): void {
  const analyticsPath = path.join(args.root, "analytics/ANALYTICS.md");
  if (!existsSync(analyticsPath)) return;
  let analyticsText = "";
  try {
    analyticsText = readFileSync(analyticsPath, "utf8");
  } catch {
    return;
  }
  const severity = laneStatus === "succeeded" ? "error" : "warning";
  const requiredPhrases: ReadonlyArray<{ phrase: string; code: string; message: string }> = [
    {
      phrase: "HDYHAU",
      code: "attribution.hdyhau.missing",
      message: "analytics/ANALYTICS.md needs an HDYHAU survey section before spend-ready attribution.",
    },
    {
      phrase: "randomize",
      code: "attribution.hdyhau_randomize.missing",
      message: "HDYHAU must randomize option order so the first row does not capture bias.",
    },
    {
      phrase: "multi-select",
      code: "attribution.hdyhau_multiselect.missing",
      message: "HDYHAU must allow multi-select so mixed sources are not forced into one key.",
    },
    {
      phrase: "TV",
      code: "attribution.hdyhau_tv.missing",
      message: "HDYHAU must include TV / offline as a visible choice. Do not add tv as a stored stable key.",
    },
    {
      phrase: "mid-onboarding",
      code: "attribution.hdyhau_placement.missing",
      message: "HDYHAU must sit mid-onboarding, not only on the last screen.",
    },
  ];
  for (const item of requiredPhrases) {
    if (!analyticsText.toLowerCase().includes(item.phrase.toLowerCase())) {
      issues.push(issue(severity, item.code, item.message, "analytics/ANALYTICS.md"));
    }
  }
  const blended = analyticsText.toLowerCase().includes("blended roas") || analyticsText.toLowerCase().includes("paid-ua-report.csv");
  if (!blended) {
    issues.push(
      issue(severity, "attribution.hdyhau_blended_roas.missing", "HDYHAU must join blended ROAS to growth/paid-ua-report.csv.", "analytics/ANALYTICS.md"),
    );
  }
  if (!analyticsText.toLowerCase().includes("appsflyer")) {
    issues.push(
      issue(
        severity,
        "attribution.hdyhau_appsflyer_handoff.missing",
        "HDYHAU must record AppsFlyer handoff criteria for when this sheet can no longer explain spend.",
        "analytics/ANALYTICS.md",
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Main checks
// ---------------------------------------------------------------------------

if (state) {
  const base = "lanes.analytics_attribution.attribution_contract";
  const laneStatus = asString(getPath(state, "lanes.analytics_attribution.status")) ?? "";

  // not_started lanes are exempt entirely (nothing to attribute yet — lane-coverage
  // owns the "not_started past orient" gate). Otherwise warn at partial, error at done.
  if (laneStatus !== "not_needed" && laneStatus !== "pending") {
    const booleanSeverity = laneStatus === "succeeded" ? "error" : "warning";
    // ------------------------------------------------------------------
    // PRESENT layer: required boolean fields
    // ------------------------------------------------------------------
    const requiredBooleans = ["screen_early", "other_free_text", "backend_persistence", "anonymous_reconciliation", "verified"];

    for (const field of requiredBooleans) {
      if (asBoolean(getPath(state, `${base}.${field}`)) !== true) {
        issues.push(
          issue(
            booleanSeverity,
            `attribution.${field}.incomplete`,
            `${base}.${field} must be true before attribution is launch-ready.`,
            "state/business-state.json",
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // PRESENT layer: event name
    // ------------------------------------------------------------------
    const eventName = asString(getPath(state, `${base}.event_name`));
    const needles = [canonicalEventName, eventName ?? "", "self_reported_source"].filter((item): item is string => Boolean(item));
    const found = findImplementationText(args.root, needles);

    if (eventName !== canonicalEventName) {
      const aliasReason = asString(getPath(state, `${base}.event_alias_reason`));
      const aliasDocumented = Boolean(
        eventName &&
        found.get(eventName)?.length &&
        found.get(canonicalEventName)?.length &&
        Array.from(found.values())
          .flat()
          .some((file) => /analytics|attribution|launch_trace|tech_spec/i.test(file)),
      );
      if (!aliasReason?.trim() && !aliasDocumented) {
        issues.push(
          issue(
            "error",
            "attribution.event_name.invalid",
            "Use attribution_source_selected as the canonical event name unless the docs record a deliberate alias.",
            "state/business-state.json",
          ),
        );
      } else {
        issues.push(
          issue(
            "warning",
            "attribution.event_name.alias",
            `Using documented attribution event alias ${eventName}; keep dashboards mapped to ${canonicalEventName}.`,
            "state/business-state.json",
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // PRESENT layer: stable source keys
    // ------------------------------------------------------------------
    const stableKeys = asArray(getPath(state, `${base}.stable_source_keys`))
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
    for (const requiredKey of ["friend", "app_store_search", "creator", "ai_search", "other"]) {
      if (!stableKeys.includes(requiredKey)) {
        issues.push(
          issue("error", `attribution.stable_key.${requiredKey}.missing`, `Stable attribution key ${requiredKey} is missing.`, "state/business-state.json"),
        );
      }
    }

    // ------------------------------------------------------------------
    // PRESENT layer: person properties
    // ------------------------------------------------------------------
    const personProperties = asArray(getPath(state, `${base}.person_properties`))
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
    if (!personProperties.includes("self_reported_source")) {
      issues.push(
        issue("error", "attribution.person_property.missing", "PostHog person properties must include self_reported_source.", "state/business-state.json"),
      );
    }

    // ------------------------------------------------------------------
    // PRESENT layer: implementation text proof
    // ------------------------------------------------------------------
    const requiresImplementationProof = laneStatus === "succeeded" || asBoolean(getPath(state, `${base}.verified`)) === true;
    for (const needle of [eventName ?? canonicalEventName, "self_reported_source"]) {
      if (!found.has(needle)) {
        issues.push(
          issue(
            requiresImplementationProof ? "error" : "warning",
            `attribution.text.${needle}.not_found`,
            `${needle} was not found in implementation docs or code outside state/business-state.json. If this is generated later, keep the lane partial.`,
            args.root,
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // PROVEN layer: evidence paths and operations/PROVIDER_PROOF.md cross-check
    // ------------------------------------------------------------------
    const verifiedClaimed = asBoolean(getPath(state, `${base}.verified`)) === true;

    if (verifiedClaimed || laneStatus === "succeeded") {
      checkVerifiedEvidencePaths(laneStatus);
    } else if (laneStatus === "running") {
      // Warn if evidence list has placeholders even before done.
      checkVerifiedEvidencePaths(laneStatus);
    }

    checkProviderProofForPostHog(laneStatus);

    // ------------------------------------------------------------------
    // TIER-3: posthog-proof.json artifact validation (done only)
    // ------------------------------------------------------------------
    checkPostHogProofArtifact(laneStatus);
    checkHdyhauSurvey(laneStatus);
  }
}

reportAndExit("Attribution contract check", issues);
