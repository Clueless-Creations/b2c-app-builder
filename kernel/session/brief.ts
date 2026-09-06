import { readFileSync } from "node:fs";

/**
 * A scheduled session's brief (KTD1): passed as a file, never a CLI argument — argv is visible in
 * process listings, and a founder's email address has no business sitting there. `founderContact`
 * is the digest push address; deliberately kept off business-state.json (kernel/schema/**, another
 * unit's committed surface) rather than adding a field there.
 */
export interface SessionBrief {
  readonly schemaVersion: "1.0.0";
  readonly businessSlug: string;
  readonly founderContact?: { readonly email: string };
  /** Domain ids (e.g. "domain.growth") or workflow id prefixes (e.g. "workflow.growth-") this session should focus on. Omitted/empty = no restriction. */
  readonly scopeHints?: readonly string[];
  /** Overrides the default wall-clock cap; the CLI's own --wall-clock-seconds flag outranks this. */
  readonly wallClockSecondsOverride?: number;
  readonly notes?: string;
  /** Preferred CLI for fresh-context node workers. `auto` selects the first available runtime. */
  readonly workerRuntime?: "auto" | "claude" | "codex" | "cursor";
  /** Installer-pinned catalog version. Scheduled runs reject drift instead of silently compiling stale knowledge. */
  readonly expectedCatalogVersion?: string;
}

export class BriefInvalid extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Session brief is invalid: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Structural validation only — no schema registry dependency, since brief.ts owns this shape end to end. */
export function validateBriefShape(value: unknown): string[] {
  const issues: string[] = [];
  if (!value || typeof value !== "object") return ["brief must be a JSON object"];
  const candidate = value as Record<string, unknown>;

  if (candidate.schemaVersion !== "1.0.0") issues.push('schemaVersion must be "1.0.0"');
  if (!isNonEmptyString(candidate.businessSlug)) issues.push("businessSlug is required");

  const contact = candidate.founderContact as Record<string, unknown> | undefined;
  if (contact !== undefined && (typeof contact !== "object" || contact === null || !isNonEmptyString(contact.email) || !contact.email.includes("@"))) {
    issues.push("founderContact.email must look like an email address when supplied");
  }

  if (candidate.scopeHints !== undefined) {
    const hints = candidate.scopeHints;
    if (!Array.isArray(hints) || hints.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
      issues.push("scopeHints, when present, must be an array of non-empty strings");
    }
  }

  if (candidate.wallClockSecondsOverride !== undefined) {
    const value2 = candidate.wallClockSecondsOverride;
    if (typeof value2 !== "number" || !Number.isFinite(value2) || value2 <= 0) issues.push("wallClockSecondsOverride, when present, must be a positive number");
  }

  if (candidate.notes !== undefined && typeof candidate.notes !== "string") issues.push("notes, when present, must be a string");
  if (candidate.workerRuntime !== undefined && !["auto", "claude", "codex", "cursor"].includes(String(candidate.workerRuntime))) {
    issues.push('workerRuntime, when present, must be "auto", "claude", "codex", or "cursor"');
  }
  if (candidate.expectedCatalogVersion !== undefined && !isNonEmptyString(candidate.expectedCatalogVersion)) {
    issues.push("expectedCatalogVersion, when present, must be a non-empty string");
  }

  return issues;
}

export function parseBrief(raw: string): SessionBrief {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new BriefInvalid([`brief is not valid JSON (${error instanceof Error ? error.message : String(error)})`]);
  }
  const issues = validateBriefShape(parsed);
  if (issues.length > 0) throw new BriefInvalid(issues);
  return parsed as SessionBrief;
}

export function loadBrief(briefPath: string): SessionBrief {
  const raw = readFileSync(briefPath, "utf8");
  return parseBrief(raw);
}

/** True when a compiled node falls within the brief's scope hints (domain id or workflow id prefix match). No hints declared = everything is in scope. */
export function nodeInScope(hints: readonly string[] | undefined, domainId: string, workflowId: string): boolean {
  if (!hints || hints.length === 0) return true;
  return hints.some((hint) => domainId === hint || workflowId === hint || workflowId.startsWith(hint));
}
