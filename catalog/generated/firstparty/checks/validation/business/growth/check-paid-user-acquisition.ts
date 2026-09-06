#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { isEmptyEquivalentEvidenceValue } from "../../../../kernel/lib/empty-equivalent-evidence.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

function firstExistingText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const text = readText(args.root, candidate);
    if (text) {
      return { relativePath: candidate, text };
    }
  }
  return undefined;
}

function existsAny(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(path.join(args.root, candidate)));
}

function includes(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function codeFor(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function mentionsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => includes(text, term));
}

const AUTOMATION_IDENTITY = /\b(agent|codex|claude|gpt|assistant|bot|automation|autopilot|ai)\b/i;
const UNAPPROVED_STATE = /^(pending|unapproved|awaiting|unknown|placeholder|tbd|todo|not yet|replace with)(?:\b|$)/i;
const APPROVED_STATE = /^(approved|granted)$/i;

function extractSection(text: string, heading: string): string | undefined {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return undefined;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function pipeRows(section: string): { headers: string[]; rows: string[][] } {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  const parsed = lines
    .filter((line) => !/^\|?\s*:?-{3,}/.test(line.replace(/\|/g, "").trim()) && !/^\|(?:\s*:?-+:?\s*\|)+$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  const headers = parsed[0] ?? [];
  const rows = parsed.slice(1).filter((row) => row.some((cell) => cell.length > 0 && !/^-+$/.test(cell)));
  return { headers, rows };
}

function headerIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((header) => header.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"));
  for (const name of names) {
    const index = normalized.indexOf(name.toLocaleLowerCase("en-US"));
    if (index >= 0) return index;
  }
  return -1;
}

function isValidPastIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() <= Date.now();
}

function isFounderDecider(value: string): boolean {
  const candidate = value.trim();
  if (candidate.length === 0 || AUTOMATION_IDENTITY.test(candidate)) return false;
  return /\b(founder|owner)\b/i.test(candidate);
}

function isNamedStack(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.replace(/[^a-z0-9]/gi, "").length < 12) return false;
  if (UNAPPROVED_STATE.test(trimmed) || isEmptyEquivalentEvidenceValue(trimmed)) return false;
  if (/\b(pending founder approval|awaiting approval|to be decided)\b/i.test(trimmed)) return false;
  return true;
}

function parseFounderMmpWaiver(text: string): "granted" | "unapproved" | "unstructured" | "incomplete" | "empty" | undefined {
  const proseMatch = text.match(/founder MMP waiver\s*:\s*(.*)/i);
  const section = extractSection(text, "Founder MMP Waiver");
  if (!section && !proseMatch) return undefined;
  if (!section) return proseMatch && (proseMatch[1] ?? "").trim().length > 0 ? "unstructured" : "empty";

  const table = pipeRows(section);
  const dateColumn = headerIndex(table.headers, ["Date", "Decision date"]);
  const founderColumn = headerIndex(table.headers, ["Founder", "Founder identity", "Decided by"]);
  const stackColumn = headerIndex(table.headers, ["Replacement stack", "Named stack", "Stack"]);
  const stateColumn = headerIndex(table.headers, ["Approval state", "Decision", "State"]);
  if (dateColumn < 0 || founderColumn < 0 || stackColumn < 0 || stateColumn < 0 || table.rows.length === 0) {
    if (proseMatch) return (proseMatch[1] ?? "").trim().length > 0 ? "unstructured" : "empty";
    return table.rows.length === 0 ? "empty" : "incomplete";
  }

  let sawUnapproved = false;
  let sawIncomplete = false;
  for (const row of table.rows) {
    const date = (row[dateColumn] ?? "").trim();
    const founder = (row[founderColumn] ?? "").trim();
    const stack = (row[stackColumn] ?? "").trim();
    const state = (row[stateColumn] ?? "").trim();
    if (UNAPPROVED_STATE.test(state) || !APPROVED_STATE.test(state)) {
      sawUnapproved = true;
      continue;
    }
    if (!isValidPastIsoDate(date) || !isFounderDecider(founder) || !isNamedStack(stack)) {
      sawIncomplete = true;
      continue;
    }
    return "granted";
  }
  if (sawUnapproved) return "unapproved";
  if (sawIncomplete) return "incomplete";
  return "empty";
}

const HUNT_SOURCE_KINDS = ["print", "cross-niche", "ad-library-adjacent", "second-profile", "direct-competitor"] as const;
type HuntSourceKind = (typeof HUNT_SOURCE_KINDS)[number];
const REQUIRED_HUNT_KINDS = ["print", "cross-niche", "ad-library-adjacent", "second-profile"] as const;
const COMPETITOR_WRONG_RESULTS = ["original", "logo-swap"] as const;
type CompetitorWrongResult = (typeof COMPETITOR_WRONG_RESULTS)[number];

function normalizeHuntToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function parseHuntSourceKind(value: string): HuntSourceKind | "missing" {
  const normalized = normalizeHuntToken(value);
  if (normalized.length === 0) return "missing";
  for (const kind of HUNT_SOURCE_KINDS) {
    if (kind === normalized) return kind;
  }
  return "missing";
}

function parseCompetitorWrong(value: string): CompetitorWrongResult | "missing" {
  const normalized = normalizeHuntToken(value);
  if (normalized.length === 0) return "missing";
  for (const result of COMPETITOR_WRONG_RESULTS) {
    if (result === normalized) return result;
  }
  return "missing";
}

function parseAdopted(value: string): "yes" | "no" | "missing" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes") return "yes";
  if (normalized === "no") return "no";
  return "missing";
}

function endorsesCompetitorClone(text: string): boolean {
  const clonePattern = /\bclone(?:d|ing)? competitor (ads?|assets?|claims?|creatives?)\b/gi;
  for (const match of text.matchAll(clonePattern)) {
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 80), index);
    if (
      /(?:do not|don't|does not|never|must not|cannot|can't|no|not|without|rejected|rejecting|forbidden|forbids?|prohibited|prohibits?)\s+(?:ever\s+)?$/i.test(
        prefix,
      )
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function requireNonCompetitorAngleHunt(text: string, relativePath: string, spendReady: boolean): void {
  if (endorsesCompetitorClone(text)) {
    issues.push(
      issue(
        "error",
        "paid_ua.angle_hunt.clone",
        `${relativePath} clones competitor ads, assets, or claims. Adapt the trigger. Do not copy competitor creatives.`,
        relativePath,
      ),
    );
  }

  const section = extractSection(text, "Non-Competitor Angle Hunt");
  if (!section) return;

  if (spendReady) {
    if (!/\bsame icp\b/i.test(section) || !/\bnew motivation\b/i.test(section)) {
      issues.push(
        issue(
          "error",
          "paid_ua.angle_hunt.same_icp_missing",
          `${relativePath} must expand the same ICP with a new motivation after the primary profile saturates. Do not only raise budget.`,
          relativePath,
        ),
      );
    }

    const table = pipeRows(section);
    const sourceColumn = headerIndex(table.headers, ["Source kind", "Source"]);
    const noteColumn = headerIndex(table.headers, ["Source note", "Note"]);
    const motivationColumn = headerIndex(table.headers, ["Motivation"]);
    const wrongColumn = headerIndex(table.headers, ["Competitor-wrong", "Competitor wrong", "Logo-swap"]);
    const adoptedColumn = headerIndex(table.headers, ["Adopted"]);
    if (sourceColumn < 0 || noteColumn < 0 || motivationColumn < 0 || wrongColumn < 0 || adoptedColumn < 0 || table.rows.length === 0) {
      issues.push(
        issue(
          "error",
          "paid_ua.angle_hunt.table_incomplete",
          `${relativePath} needs a Non-Competitor Angle Hunt table with Source kind, Source note, Motivation, Competitor-wrong, and Adopted columns.`,
          relativePath,
        ),
      );
      return;
    }

    const kindsPresent = new Set<HuntSourceKind>();
    let adoptedOriginalNonCompetitor = false;
    let adoptedNonCompetitor = false;

    for (const row of table.rows) {
      const sourceKind = parseHuntSourceKind(row[sourceColumn] ?? "");
      const competitorWrong = parseCompetitorWrong(row[wrongColumn] ?? "");
      const adopted = parseAdopted(row[adoptedColumn] ?? "");

      switch (sourceKind) {
        case "print":
        case "cross-niche":
        case "ad-library-adjacent":
        case "second-profile":
        case "direct-competitor": {
          const note = (row[noteColumn] ?? "").trim();
          const motivation = (row[motivationColumn] ?? "").trim();
          if (competitorWrong !== "missing" && adopted !== "missing" && note.length > 0 && motivation.length > 0) {
            kindsPresent.add(sourceKind);
          }
          break;
        }
        case "missing":
          break;
        default: {
          const exhaustive: never = sourceKind;
          issues.push(issue("error", "paid_ua.angle_hunt.source_unhandled", `Unhandled angle source kind ${String(exhaustive)}.`, relativePath));
        }
      }

      switch (competitorWrong) {
        case "original":
        case "logo-swap":
        case "missing":
          break;
        default: {
          const exhaustive: never = competitorWrong;
          issues.push(
            issue("error", "paid_ua.angle_hunt.competitor_wrong_unhandled", `Unhandled competitor-wrong result ${String(exhaustive)}.`, relativePath),
          );
        }
      }

      switch (adopted) {
        case "yes": {
          const nonCompetitor = sourceKind !== "direct-competitor" && sourceKind !== "missing";
          if (nonCompetitor) adoptedNonCompetitor = true;
          if (nonCompetitor && competitorWrong === "original") adoptedOriginalNonCompetitor = true;
          break;
        }
        case "no":
        case "missing":
          break;
        default: {
          const exhaustive: never = adopted;
          issues.push(issue("error", "paid_ua.angle_hunt.adopted_unhandled", `Unhandled adopted value ${String(exhaustive)}.`, relativePath));
        }
      }
    }

    const missingKinds = REQUIRED_HUNT_KINDS.filter((kind) => !kindsPresent.has(kind));
    if (missingKinds.length > 0) {
      issues.push(
        issue(
          "error",
          "paid_ua.angle_hunt.sources_missing",
          `${relativePath} hunt must name print, cross-niche, ad-library-adjacent, and second-profile sources. Missing: ${missingKinds.join(", ")}.`,
          relativePath,
        ),
      );
    }
    if (!adoptedNonCompetitor) {
      issues.push(
        issue(
          "error",
          "paid_ua.angle_hunt.no_cross_industry",
          `${relativePath} must adopt at least one angle from a non-competitor source before first spend.`,
          relativePath,
        ),
      );
    }
    if (!adoptedOriginalNonCompetitor) {
      issues.push(
        issue(
          "error",
          "paid_ua.angle_hunt.no_original",
          `${relativePath} must adopt at least one original angle from a non-competitor source that fails a competitor-wrong / logo-swap clone test.`,
          relativePath,
        ),
      );
    }
  }
}

const status = state ? asString(getPath(state, "lanes.paid_user_acquisition.status"))?.toLowerCase() : undefined;
const skip = status === "not_needed" || status === "deferred";
const markdown = firstExistingText(["PAID_UA.md", "growth/PAID_UA.md"]);
const reportPath = existsAny(["growth/paid-ua-report.csv", "growth/paid-ua-report.md", "PAID_UA_REPORT.md"]);

if (!skip && !markdown) {
  issues.push(issue("error", "paid_ua.markdown_missing", "PAID_UA.md is required when the paid user acquisition lane is active.", "PAID_UA.md"));
}

if (markdown) {
  const requiredPhrases = [
    "Fit Gate",
    "Channel Choice",
    "Creative Production",
    "Tracking Baseline",
    "Blended Report",
    "Weekly Schedule",
    "Stop And Scale Rules",
    "Founder-Only Gates",
    "Traceability",
    // The four numbers stop/scale evaluates against — without them the rules
    // are vibes, and a weekly report cannot be judged mechanically.
    "Decision Thresholds",
    "Attribution tolerance",
    "Payback window",
    "Creative signal floor",
    "Scale trigger",
    "MMP Before Spend",
    "Draft Status And Kill Window",
    "48-hour kill window",
    "Non-Competitor Angle Hunt",
  ];
  for (const phrase of requiredPhrases) {
    if (!includes(markdown.text, phrase)) {
      issues.push(issue("error", `paid_ua.${codeFor(phrase)}.missing`, `PAID_UA.md should include ${phrase}.`, markdown.relativePath));
    }
  }

  const requiredRefs = [
    "analytics/ANALYTICS.md",
    "revenue/REVENUE_OPS.md",
    "CONTENT_ASSETS.md",
    "APP_STORE_LISTING.md",
    "state/LAUNCH_TRACE.md",
    "11_STAR_EXPERIENCE.md",
  ];
  for (const ref of requiredRefs) {
    if (!markdown.text.includes(ref)) {
      issues.push(issue("error", `paid_ua.ref_${codeFor(ref)}.missing`, `PAID_UA.md should reference ${ref}.`, markdown.relativePath));
    }
  }

  if (!mentionsAny(markdown.text, ["one-channel", "one channel", "single channel", "selected channel"])) {
    issues.push(
      issue(
        "error",
        "paid_ua.one_channel_rule.missing",
        "Paid UA should require a one-channel starting strategy or a documented exception.",
        markdown.relativePath,
      ),
    );
  }

  if (!mentionsAny(markdown.text, ["Meta", "TikTok", "Google", "Apple Ads", "Apple Search Ads"])) {
    issues.push(
      issue("error", "paid_ua.channel_options.missing", "Paid UA should consider Meta, TikTok, Google, or Apple Ads channel fit.", markdown.relativePath),
    );
  }

  if (!mentionsAny(markdown.text, ["RevenueCat", "LTV", "cohort", "trial start", "entitlement"])) {
    issues.push(
      issue(
        "error",
        "paid_ua.revenuecat_ltv.missing",
        "Paid UA should connect CPA decisions to RevenueCat LTV, cohorts, trials, purchases, or entitlements.",
        markdown.relativePath,
      ),
    );
  }

  if (!mentionsAny(markdown.text, ["App Store Connect", "Google Play", "PostHog", "self-reported attribution", "ad-network SDK", "MMP"])) {
    issues.push(
      issue(
        "error",
        "paid_ua.tracking_layers.missing",
        "Paid UA should define the store, analytics, ad-network, MMP, or self-reported attribution layers.",
        markdown.relativePath,
      ),
    );
  }

  if (!mentionsAny(markdown.text, ["baseline", "uplift", "blended report", "paid-ua-report"])) {
    issues.push(
      issue("error", "paid_ua.baseline_report.missing", "Paid UA should define baseline/uplift measurement and a blended report.", markdown.relativePath),
    );
  }

  if (!mentionsAny(markdown.text, ["3-5", "creative", "asset", "angle"])) {
    issues.push(
      issue("error", "paid_ua.creative_cadence.missing", "Paid UA should define creative cadence, asset volume, or angle testing.", markdown.relativePath),
    );
  }

  if (!mentionsAny(markdown.text, ["Monday", "Tuesday", "Wednesday", "Friday", "twice-weekly", "weekly"])) {
    issues.push(
      issue("error", "paid_ua.schedule.missing", "Paid UA should define a weekly operating cadence instead of reactive daily changes.", markdown.relativePath),
    );
  }

  if (!mentionsAny(markdown.text, ["founder approval", "founder-only", "budget", "spend"])) {
    issues.push(
      issue(
        "error",
        "paid_ua.spend_gate.missing",
        "Paid UA should keep ad spend, budget changes, and account connections as founder-only gates.",
        markdown.relativePath,
      ),
    );
  }

  const spendReady = status === "in_progress" || status === "succeeded";
  if (spendReady) {
    const waiver = parseFounderMmpWaiver(markdown.text);
    if (waiver === "empty") {
      issues.push(
        issue(
          "error",
          "paid_ua.mmp_waiver.empty",
          "Founder MMP waiver has no named stack and review trigger. An empty waiver does not replace AppsFlyer.",
          markdown.relativePath,
        ),
      );
    } else if (waiver === "unstructured") {
      issues.push(
        issue(
          "error",
          "paid_ua.mmp_waiver.unstructured",
          "A founder MMP waiver must be a Founder MMP Waiver table with date, founder identity, named replacement stack, and approval state. Prose such as pending founder approval does not replace AppsFlyer.",
          markdown.relativePath,
        ),
      );
    } else if (waiver === "unapproved") {
      issues.push(
        issue(
          "error",
          "paid_ua.mmp_waiver.unapproved",
          "Founder MMP waiver approval state must be approved. Pending or unapproved text does not bypass AppsFlyer.",
          markdown.relativePath,
        ),
      );
    } else if (waiver === "incomplete") {
      issues.push(
        issue(
          "error",
          "paid_ua.mmp_waiver.incomplete",
          "Founder MMP waiver needs a past ISO date, founder or owner identity, a named replacement stack, and approval state approved.",
          markdown.relativePath,
        ),
      );
    }
    const waiverGranted = waiver === "granted";
    if (!waiverGranted) {
      if (!includes(markdown.text, "$appsflyerId") && !includes(markdown.text, "setAppsflyerID") && !includes(markdown.text, "setAppsflyerId")) {
        issues.push(
          issue(
            "error",
            "paid_ua.appsflyer_bridge.missing",
            "A spend-ready paid-UA lane must set RevenueCat $appsflyerId before trial or purchase, or record a founder MMP waiver.",
            markdown.relativePath,
          ),
        );
      }
      if (!includes(markdown.text, "AppsFlyer")) {
        issues.push(
          issue(
            "error",
            "paid_ua.appsflyer.missing",
            "A spend-ready paid-UA lane must name AppsFlyer as the default MMP, or record a founder MMP waiver.",
            markdown.relativePath,
          ),
        );
      }
    }
  }

  if (!mentionsAny(markdown.text, ["PAUSED", "paused draft", "paused until"])) {
    issues.push(
      issue(
        "error",
        "paid_ua.paused_draft.missing",
        "Paid UA should keep campaigns as PAUSED drafts until the founder approves live delivery.",
        markdown.relativePath,
      ),
    );
  }

  if (!mentionsAny(markdown.text, ["Virality Predictor", "brain_activity", "virality score", "virality_score", "virality scoring not applicable"])) {
    issues.push(
      issue(
        "error",
        "paid_ua.virality_gate.missing",
        'Paid UA should score video creatives with the Virality Predictor (brain_activity) before paid distribution, or record an explicit "virality scoring not applicable" exception with a reason.',
        markdown.relativePath,
      ),
    );
  }

  requireNonCompetitorAngleHunt(markdown.text, markdown.relativePath, spendReady);

  if (status === "succeeded" && /\b(TODO|TBD|unknown|placeholder|pending)\b/i.test(markdown.text)) {
    issues.push(
      issue(
        "error",
        "paid_ua.placeholder_complete",
        "Paid UA cannot be done while TODO/TBD/unknown/placeholder/pending language remains.",
        markdown.relativePath,
      ),
    );
  }

  // A done lane needs threshold VALUES, not labels: the template ships the
  // defaults inside HTML comments, so label presence alone proves nothing.
  // Comments are stripped first, then each threshold must carry a number on
  // its line — ±20%, 90 days, 2x, 14 days all satisfy a bare digit check.
  if (status === "succeeded") {
    const withoutComments = markdown.text.replace(/<!--[\s\S]*?-->/g, " ");
    for (const label of ["Attribution tolerance", "Payback window", "Creative signal floor", "Scale trigger"]) {
      if (new RegExp(`${label}[^\\n]*\\d`, "i").test(withoutComments)) continue;
      issues.push(
        issue(
          "error",
          `paid_ua.${codeFor(label)}.value_missing`,
          `${label} has no recorded value. A done paid-UA lane needs the actual number (defaults live in paid-user-acquisition.md, Stop And Scale Rules) — a label with the value still in a template comment is not a threshold.`,
          markdown.relativePath,
        ),
      );
    }
  }
}

if (status === "succeeded" && !reportPath) {
  issues.push(
    issue(
      "error",
      "paid_ua.report_missing_done",
      "A done paid UA lane should include growth/paid-ua-report.csv, growth/paid-ua-report.md, or PAID_UA_REPORT.md.",
      "growth/paid-ua-report.csv",
    ),
  );
}

// Existence alone is not proof: a one-line stub at the report path used to
// satisfy the done gate. The blended report must at least carry a spend column
// and a downstream economics column, plus one row of data.
if (status === "succeeded" && reportPath) {
  const reportText = readText(args.root, reportPath) ?? "";
  const reportLines = reportText.split("\n").filter((line) => line.trim().length > 0);
  const mentionsSpend = /\bspend\b/i.test(reportText);
  const mentionsEconomics = /\b(cpa|ltv|revenue|roas|payback)\b/i.test(reportText);
  if (reportLines.length < 2 || !mentionsSpend || !mentionsEconomics) {
    issues.push(
      issue(
        "error",
        "paid_ua.report_content_thin",
        `${reportPath} exists but does not look like a blended report: it needs a header naming spend plus downstream economics (CPA/LTV/revenue/ROAS/payback) and at least one data row. A stub file cannot mark the paid UA lane done.`,
        reportPath,
      ),
    );
  }
}

reportAndExit("Paid user acquisition check", issues);
