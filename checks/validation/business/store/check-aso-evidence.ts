#!/usr/bin/env node
/**
 * check-aso-evidence.ts — official Apple keyword receipts in STORE_OPS.md.
 *
 * When STORE_OPS.md is absent, skip. When it exists, require an ASO Evidence
 * Receipt, unauthenticated rank-first routing, first-class unavailable values,
 * and a metadata mutation boundary. Do not infer rank 0 from a failed lookup.
 *
 * npm script: check:aso-evidence
 * Usage: tsx checks/validation/business/store/check-aso-evidence.ts --root <app-repo-root>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { issue, loadProjectState, missingPhraseCode, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const relativePath = "STORE_OPS.md";
const absolutePath = path.join(args.root, relativePath);

const KEYWORD_SOURCES = ["rank", "discover", "score"] as const;
type KeywordSource = (typeof KEYWORD_SOURCES)[number];
type SourceAvailability = "available" | "unavailable" | "missing";

function requirePhrases(text: string, phrases: string[]): void {
  for (const phrase of phrases) {
    if (!text.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(issue("error", missingPhraseCode("aso_evidence", phrase), `${relativePath} should include ${phrase}.`, relativePath));
    }
  }
}

function parseSourceAvailability(text: string, source: KeywordSource): SourceAvailability {
  const answers: SourceAvailability[] = [];
  const tableRow = new RegExp(`^\\|\\s*${source}\\s*\\|([^\\n]*)$`, "gim");
  for (const match of text.matchAll(tableRow)) {
    const cells = (match[1] ?? "").split("|").map((cell) => cell.trim().replaceAll("`", "").toLowerCase());
    const availability = cells[1] ?? "";
    if (availability === "available" || availability === "unavailable") answers.push(availability);
  }
  const assignment = new RegExp(`^\\s*${source}\\s*[:=]\\s*(available|unavailable)\\b`, "gim");
  for (const match of text.matchAll(assignment)) {
    const value = match[1]?.toLowerCase();
    if (value === "available" || value === "unavailable") answers.push(value);
  }
  return answers[0] ?? "missing";
}

function parseSourceRawInputs(text: string, source: KeywordSource): string {
  const tableRow = new RegExp(`^\\|\\s*${source}\\s*\\|([^\\n]*)$`, "gim");
  for (const match of text.matchAll(tableRow)) {
    const cells = (match[1] ?? "").split("|").map((cell) => cell.trim().replaceAll("`", ""));
    return cells[2] ?? "";
  }
  return "";
}

function requireSourceAvailability(text: string): void {
  const appleAdsAuthorized = /\bapple ads\b/i.test(text) && /\bauthoriz/i.test(text);

  for (const source of KEYWORD_SOURCES) {
    const availability = parseSourceAvailability(text, source);
    switch (availability) {
      case "available":
      case "unavailable":
      case "missing":
        break;
      default: {
        const exhaustive: never = availability;
        issues.push(issue("error", "aso_evidence.source_availability_unhandled", `Unhandled keyword source availability ${String(exhaustive)}.`, relativePath));
      }
    }

    if (availability === "unavailable") {
      const rawInputs = parseSourceRawInputs(text, source).trim();
      if (/^(0(?:\.0+)?|rank\s*0|no demand|no competition)$/i.test(rawInputs)) {
        issues.push(
          issue(
            "error",
            "aso_evidence.unavailable_fabricated",
            `${relativePath} records ${source} as unavailable but writes ${rawInputs}. Keep unavailable as unavailable.`,
            relativePath,
          ),
        );
      }
    }

    if ((source === "discover" || source === "score") && availability === "available" && !appleAdsAuthorized) {
      issues.push(
        issue(
          "error",
          "aso_evidence.ads_read_without_authorization",
          `${relativePath} marks ${source} available without an authorized Apple Ads profile and account.`,
          relativePath,
        ),
      );
    }
  }
}

function requireMutationBoundary(text: string): void {
  if (/\bauto-applied\b/i.test(text) || /\bautomatically applied\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "aso_evidence.auto_apply",
        `${relativePath} auto-applied metadata. Keyword evidence cannot bypass plan, approval, validation, dry-run, and readback.`,
        relativePath,
      ),
    );
  }
  if (/applied keywords without (plan|approval|validation|dry-run|readback)/i.test(text)) {
    issues.push(issue("error", "aso_evidence.auto_apply", `${relativePath} applied keywords without the metadata mutation gates.`, relativePath));
  }
}

function requireSecretAbsence(text: string): void {
  if (/-----BEGIN[ A-Z]*PRIVATE KEY-----/.test(text) || /\bASC_PRIVATE_KEY\b/.test(text)) {
    issues.push(issue("error", "aso_evidence.secret_in_artifact", `${relativePath} must not contain provider keys or private key material.`, relativePath));
  }
}

if (existsSync(absolutePath)) {
  const text = readText(args.root, relativePath) ?? "";
  if (!/^## ASO Evidence Receipt\s*$/m.test(text)) {
    issues.push(
      issue(
        "error",
        "aso_evidence.receipt_heading_missing",
        "STORE_OPS.md needs an ASO Evidence Receipt heading with storefront, locale, and source fields.",
        relativePath,
      ),
    );
  }

  requirePhrases(text, [
    "storefront",
    "platform",
    "locale",
    "query set",
    "CLI version",
    "source availability",
    "raw inputs",
    "rank-window limitation",
    "collection time",
    "unavailable",
    "asc optimize keywords rank",
    "do not auto-apply",
    "optimize keywords --help",
    "unauthenticated",
    "released",
    "deduplicate",
    "delta",
  ]);

  requireSourceAvailability(text);
  requireMutationBoundary(text);
  requireSecretAbsence(text);
}

reportAndExit("ASO evidence", issues);
