import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BusinessUnit } from "../schema/types.js";

/**
 * Digest composer (R16, KTD9): every scheduled session's founder surface. Two rules this file
 * exists to enforce: (1) every exit path writes one of these — a no-op or failed run still tells
 * the founder something, never silence — and (2) PLAIN FOUNDER LANGUAGE ONLY. Internal vocabulary
 * (status enum values, node/lane/domain ids, action-class names like "mutate") never reaches this
 * text; every field the rest of the session runner hands in here is either already a human title
 * or gets translated by this module before it is ever concatenated into output.
 */

export type DigestOutcome =
  | "completed"
  | "nothing_to_do"
  | "did_not_run_lock_held"
  | "did_not_run_lock_stale"
  | "workspace_not_ready"
  | "parked_kill_switch"
  | "preflight_failed"
  | "timed_out"
  | "halted_kill_switch"
  | "halted_interactive_yield"
  | "crashed";

const OUTCOME_HEADLINE: Record<DigestOutcome, string> = {
  completed: "Here's what happened this session.",
  nothing_to_do: "Nothing was ready to work on this session.",
  did_not_run_lock_held: "I couldn't start — another session was already working on this business, so I stepped back rather than collide with it.",
  did_not_run_lock_stale: "I couldn't start, and I wasn't confident the last session ended cleanly, so I left things alone rather than guess.",
  workspace_not_ready: "This business isn't fully set up yet, so I didn't make any changes.",
  parked_kill_switch: "Autonomous work is paused for this business right now, so I didn't do anything.",
  preflight_failed: "I stopped before touching anything — something about this business's saved state doesn't match what I expected.",
  timed_out: "I ran out of time this session and stopped on purpose, partway through.",
  halted_kill_switch: "I was partway through when autonomous work got paused, so I stopped there.",
  halted_interactive_yield: "I stepped aside partway through because this business is being worked on directly right now.",
  crashed: "Something went wrong and I had to stop early.",
};

export interface DigestAdvancedItem {
  readonly nodeId: string;
  readonly title: string;
  readonly unit: BusinessUnit;
}

export interface DigestParkedItem {
  readonly nodeId: string;
  readonly title: string;
  readonly unit: BusinessUnit;
  readonly reasonText: string;
  readonly ageText?: string;
}

export interface DigestSpendLine {
  readonly unit: BusinessUnit;
  readonly period: string;
  readonly currency: string;
  readonly allocated: number;
  readonly committed: number;
  readonly spent: number;
  readonly remaining: number;
}

export interface DigestAnomaly {
  readonly message: string;
}

export interface PushOutcome {
  readonly attempted: boolean;
  readonly ok?: boolean;
  readonly id?: string;
  readonly error?: string;
  readonly skippedReason?: string;
}

export interface DigestInput {
  readonly sessionId: string;
  readonly businessSlug: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly outcome: DigestOutcome;
  readonly advanced: readonly DigestAdvancedItem[];
  readonly parked: readonly DigestParkedItem[];
  readonly spend: readonly DigestSpendLine[];
  /** Mutable on purpose: a push failure is itself an anomaly (R16), appended after the first render, before the on-disk render. */
  anomalies: DigestAnomaly[];
  push?: PushOutcome;
  /** Founder-plain Apple review watch line when an observe mandate is active. */
  appReview?: { readonly summary: string; readonly caseLines?: readonly string[] };
}

/**
 * Internal identifiers that must never reach founder-visible text. Exported so the fixture suite
 * asserts against this exact list rather than a second, driftable copy (duplicated-helpers lesson).
 */
export const internalVocabularyBlocklist: readonly string[] = [
  "run.",
  "workflow.",
  "domain.",
  "artifact.",
  "resource.",
  "autonomy.",
  "waiting_founder",
  "needs_readback",
  "not_needed",
  "review-first",
  "run-with-guardrails",
  "reasonCode",
  "actionClass",
  "grantLevel",
  "protectedCategory",
  "nodeId",
  "schemaVersion",
  "statePredicate",
  "acceptedOutputFingerprint",
  "unknown_provider_state",
  "founder_action_required",
  "capability_missing",
  "capability_shape_changed",
  "AppReviewMandate",
  "AppReviewEvent",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "UNRESOLVED_ISSUES",
  "METADATA_REJECTED",
  "INVALID_BINARY",
  "PENDING_DEVELOPER_RELEASE",
  "PROCESSING_FOR_DISTRIBUTION",
  "PROCESSING_FOR_APP_STORE",
  "READY_FOR_DISTRIBUTION",
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "web_session_required",
  "evidence_incomplete",
];

const REASON_CODE_TEXT: Record<string, string> = {
  "autonomy.system_domain_not_grantable": "This is internal bookkeeping work, not something you grant control over.",
  "autonomy.unknown_domain": "This doesn't map to any area I know how to ask you about, so I flagged it instead of guessing.",
  "autonomy.unknown_action_class": "I don't recognize what kind of action this is, so I flagged it instead of guessing.",
  "autonomy.no_grant": "You haven't told me how much I can do in this area yet.",
  "autonomy.protected_class_requires_full": "This is a bigger move than your current setting for this area allows.",
  "autonomy.above_grant_level": "This goes further than your current setting for this area allows.",
  "autonomy.prerequisite_lapsed": "Something I need to double-check before working in this area didn't check out, so I paused everything there until it does.",
  "autonomy.no_waiver": "This needs your explicit okay before I can do it, and I don't have it yet.",
  "autonomy.waiver_inactive": "Your okay for this kind of action isn't active anymore.",
  "autonomy.waiver_expired": "Your okay for this kind of action has expired.",
  "autonomy.waiver_scope_mismatch": "Your okay for this kind of action doesn't cover this specific thing.",
  "autonomy.waiver_cap_exceeded_per_action": "This costs more than you said I'm allowed to spend on one action.",
  "autonomy.waiver_cap_exceeded_per_period": "This would put spending in this area over the limit you set.",
  "autonomy.budget_unfunded": "There's no budget set aside for this area yet.",
  "autonomy.budget_currency_mismatch": "The budget set aside for this area uses a different currency than this cost.",
  "autonomy.budget_exceeded": "This would go over the budget left for this area.",
  "autonomy.spend_missing_estimate": "I don't have a cost estimate for this, so I won't spend without one.",
};

const BLOCKER_TEXT_EXACT: Record<string, string> = {
  "Founder approval required": "This needs your yes before I go ahead.",
  "A required founder approval was rejected.": "You said no to this, so I'm leaving it alone.",
  "Verification required": "I finished the work here and I'm double-checking it before calling it done.",
  "Verification rejected.": "I had this work double-checked and the check didn't agree it's finished, so it's parked for another look.",
  "Ran out of attempts for this session.": "This didn't go through after a few tries, so I stopped trying it automatically and I'm flagging it for you.",
};

/** Translates a park reason (an autonomy reasonCode when one fired, else frontier's raw blocker text) into one plain sentence. Unknown input still resolves to a safe, vocabulary-free fallback. */
export function translateParkReason(opts: { reasonCode?: string; blocker?: string }): string {
  if (opts.reasonCode) {
    const known = REASON_CODE_TEXT[opts.reasonCode];
    if (known) return known;
  }
  const blocker = opts.blocker ?? "";
  const exact = BLOCKER_TEXT_EXACT[blocker];
  if (exact) return exact;
  if (blocker.startsWith("State predicate failed")) return "This depends on progress that hasn't happened yet.";
  return "This needs your decision before I can continue.";
}

export function translateHaltReason(reason: "kill_switch" | "cooperative_yield"): string {
  return reason === "kill_switch" ? "autonomous work was paused" : "this business started being worked on directly";
}

/**
 * Renders a bare duration ("3 days", "2 hours", "just now") from an ISO timestamp, without
 * re-dating anything — the caller's createdAt is read-only here. No trailing "ago": callers
 * compose the framing (e.g. "waiting 3 days") since the same duration reads differently depending
 * on where it lands in a sentence.
 */
export function formatAge(fromIso: string, nowIso: string): string {
  const ms = Date.parse(nowIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = ms / 60_000;
  if (minutes < 1) return "just now";
  if (minutes < 60) {
    const value = Math.round(minutes);
    return `${value} minute${value === 1 ? "" : "s"}`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const value = Math.round(hours);
    return `${value} hour${value === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatMoney(amount: number, currency: string): string {
  return currency === "USD" ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency}`;
}

function pushLine(push: PushOutcome | undefined): string {
  if (!push) return "";
  if (!push.attempted) return `Sent to your inbox: skipped (${push.skippedReason ?? "no key"}).`;
  if (push.ok) return "Sent to your inbox: delivered.";
  return `Sent to your inbox: failed (${push.error ?? "unknown error"}).`;
}

interface Sections {
  headline: string;
  advanced: string[];
  parked: string[];
  spend: string[];
  anomalies: string[];
  push: string;
  appleReview: string;
}

function renderAppleReview(appReview: DigestInput["appReview"]): string {
  if (!appReview) return "No Apple review watch is active.";
  const extra = (appReview.caseLines ?? []).filter((line) => line.length > 0);
  return extra.length > 0 ? [appReview.summary, ...extra].join("\n\n") : appReview.summary;
}

function buildSections(input: DigestInput): Sections {
  const advanced = input.advanced.map((item) => `${item.title} (${item.unit})`);
  const parked = input.parked.map((item) => `${item.title} (${item.unit}) — ${item.reasonText}${item.ageText ? `, waiting ${item.ageText}` : ""}`);
  const spend = input.spend.map(
    (line) =>
      `${line.unit} — ${line.period}: ${formatMoney(line.spent, line.currency)} of ${formatMoney(line.allocated, line.currency)} spent, ${formatMoney(line.remaining, line.currency)} left`,
  );
  const anomalies = input.anomalies.map((entry) => entry.message);
  return {
    headline: OUTCOME_HEADLINE[input.outcome],
    advanced,
    parked,
    spend,
    anomalies,
    push: pushLine(input.push),
    appleReview: renderAppleReview(input.appReview),
  };
}

function renderMarkdown(input: DigestInput): string {
  const s = buildSections(input);
  const lines: string[] = [];
  lines.push(`# ${input.businessSlug} — session update`);
  lines.push("");
  lines.push(`When: ${input.startedAt} to ${input.endedAt}`);
  lines.push("");
  lines.push(s.headline);
  lines.push("");
  lines.push("## What moved forward");
  lines.push(s.advanced.length > 0 ? s.advanced.map((line) => `- ${line}`).join("\n") : "Nothing moved forward this time.");
  lines.push("");
  lines.push("## Needs your call");
  lines.push(s.parked.length > 0 ? s.parked.map((line) => `- ${line}`).join("\n") : "Nothing is waiting on you right now.");
  lines.push("");
  lines.push("## Money");
  lines.push(s.spend.length > 0 ? s.spend.map((line) => `- ${line}`).join("\n") : "No budget activity to report.");
  lines.push("");
  lines.push("## Things I'm watching");
  lines.push(s.anomalies.length > 0 ? s.anomalies.map((line) => `- ${line}`).join("\n") : "Nothing out of the ordinary.");
  lines.push("");
  lines.push("## Apple review");
  lines.push(s.appleReview);
  if (s.push) {
    lines.push("");
    lines.push("---");
    lines.push(s.push);
  }
  return `${lines.join("\n")}\n`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function htmlList(items: string[], emptyText: string): string {
  if (items.length === 0) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderHtml(input: DigestInput): string {
  const s = buildSections(input);
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(input.businessSlug)} — session update</h1>`);
  parts.push(`<p>When: ${escapeHtml(input.startedAt)} to ${escapeHtml(input.endedAt)}</p>`);
  parts.push(`<p>${escapeHtml(s.headline)}</p>`);
  parts.push("<h2>What moved forward</h2>");
  parts.push(htmlList(s.advanced, "Nothing moved forward this time."));
  parts.push("<h2>Needs your call</h2>");
  parts.push(htmlList(s.parked, "Nothing is waiting on you right now."));
  parts.push("<h2>Money</h2>");
  parts.push(htmlList(s.spend, "No budget activity to report."));
  parts.push("<h2>Things I'm watching</h2>");
  parts.push(htmlList(s.anomalies, "Nothing out of the ordinary."));
  parts.push("<h2>Apple review</h2>");
  for (const paragraph of s.appleReview.split(/\n\n/)) {
    parts.push(`<p>${escapeHtml(paragraph)}</p>`);
  }
  if (s.push) parts.push(`<hr/><p>${escapeHtml(s.push)}</p>`);
  return parts.join("\n");
}

export interface RenderedDigest {
  readonly subject: string;
  readonly markdown: string;
  readonly html: string;
}

export function renderDigest(input: DigestInput): RenderedDigest {
  return { subject: `${input.businessSlug} — session update`, markdown: renderMarkdown(input), html: renderHtml(input) };
}

export function digestFilePath(workspaceDir: string, sessionId: string): string {
  return path.join(workspaceDir, "digests", `${sessionId}.md`);
}

export function writeDigestFile(workspaceDir: string, sessionId: string, markdown: string): string {
  const filePath = digestFilePath(workspaceDir, sessionId);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, markdown, "utf8");
  return filePath;
}

// --- Resend push (KTD9) ------------------------------------------------------------------------

export interface DigestPushTransport {
  send(input: { to: string; from: string; subject: string; html: string; text: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}

/** Real HTTP send via the plain Resend REST API — no SDK dependency added for one POST. Never invoked unless a key is present (see pushDigest). */
export function createResendTransport(apiKey: string): DigestPushTransport {
  return {
    async send(input) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          return { ok: false, error: `Resend responded ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}` };
        }
        const parsed = (await response.json().catch(() => ({}))) as { id?: string };
        return { ok: true, id: parsed.id ?? "unknown" };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export interface PushDigestOptions {
  /** Defaults to process.env; fixtures pass an isolated object so a fake key never touches the real environment. */
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to a real Resend transport built from the env key; fixtures inject a fake transport so no real network call ever happens in a test. */
  readonly transport?: DigestPushTransport;
  /**
   * The verified sending address for this business. Required — there is deliberately NO
   * placeholder default (see the file header on the motivating bug: a hardcoded `@updates.
   * example.com` from-address meant every production push called the Resend API against a
   * domain nobody had verified, and it 403'd). Callers source this from the workspace's
   * provisioning config (control.provisioning.digestFromAddress — see adapters/provisioning) and
   * pass it through explicitly; pushDigest never reads that config itself.
   */
  readonly from?: string;
  readonly apiKeyEnvVar?: string;
}

/**
 * R16/KTD9: attempted only when both a from-address and RESEND_API_KEY are present; never
 * blocks or fails the session on push failure. The from-address is checked first and on its own
 * — an unconfigured from-address must never even reach the "do we have a key" question, since
 * calling the API with a guessed/placeholder from-address is exactly the failure this guards
 * against. Never send real email autonomously outside an explicit human-approved send —
 * fixtures must always inject both a fake env and a fake transport (see session.fixtures.ts).
 */
export async function pushDigest(rendered: RenderedDigest, to: string, options: PushDigestOptions = {}): Promise<PushOutcome> {
  if (!options.from) {
    return {
      attempted: false,
      skippedReason: "the digest from-address isn't configured yet — run the provisioning checklist (tsx adapters/provisioning/cli.ts plan) to set it",
    };
  }
  const env = options.env ?? process.env;
  const keyVar = options.apiKeyEnvVar ?? "RESEND_API_KEY";
  const key = env[keyVar];
  if (!key) return { attempted: false, skippedReason: "no key" };

  const transport = options.transport ?? createResendTransport(key);
  const result = await transport.send({ to, from: options.from, subject: rendered.subject, html: rendered.html, text: rendered.markdown });
  return result.ok ? { attempted: true, ok: true, id: result.id } : { attempted: true, ok: false, error: result.error };
}
