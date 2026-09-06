/**
 * POST /console/interest — the interest collector behind the deferred-Checkout flag.
 *
 * Ordering is the whole design: D1 is written first and its failure rejects the submission,
 * then PostHog is captured best-effort. The row is the system of record, so a submission that
 * PostHog never sees is merely an analytics gap, while a submission PostHog sees but D1 does not
 * is a lost customer with a funnel that claims otherwise.
 *
 * Signed-out submission is supported on purpose. Most signals arrive before an account exists,
 * and refusing them would lose exactly the leads the waitlist is for.
 */

import { z } from "zod";
import type { CaptureConfig } from "../analytics/capture.js";
import { captureConsoleEvent } from "../analytics/console-capture.js";
import { emailDomain, EVENTS, INTENTS, SOURCE_KEYS, SOURCE_LABELS } from "../analytics/events.js";
import { saveInterestSignal, type D1Like } from "./repository.js";

/** Free text is bounded so one paste cannot fill a column or a log line. */
const MAX_OTHER_TEXT = 500;

/** 200, not the 255 this once used — the D1 writer is stricter and the stricter bound wins. */
const MAX_UTM = 200;

/**
 * Bounds are reconciled with the D1 writer in hosted/knowledge-mcp/db/tenant.ts, taking the stricter of
 * the two for every column.
 *
 * This matters more than it looks. Migration 0006 added these columns with a bare ALTER TABLE
 * and no CHECK constraints — retrofitting one needs a full table rebuild — so the database
 * accepts whatever its writers accept. The two schemas agreeing IS the constraint. If this side
 * were looser, a submission would validate here and be refused there.
 */
const submissionSchema = z.strictObject({
  email: z.email().max(254),
  source_key: z.enum(SOURCE_KEYS),
  source_other: z.string().max(MAX_OTHER_TEXT).optional(),
  intent: z.enum(INTENTS),
  initial_utm_source: z.string().max(MAX_UTM).optional(),
  initial_utm_medium: z.string().max(MAX_UTM).optional(),
  initial_utm_campaign: z.string().max(MAX_UTM).optional(),
  initial_referrer: z.string().max(2048).optional(),
  referral_code: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
});

export interface InterestSession {
  /** Server-resolved from the session cookie when present. A body-supplied id is never trusted. */
  readonly accountId?: string;
  readonly userId?: string;
  /** PostHog distinct_id read from the relay cookie. The only identity an anonymous signal has. */
  readonly distinctId?: string;
  /**
   * CF-IPCountry for this request. Omit it and analytics is suppressed, same as the snippet.
   *
   * This is the console's SECOND path to PostHog. Suppressing the browser snippet alone left this
   * one open, which would have made "no event is sent" false for an EEA/UK visitor who submitted
   * the form — a server-side event needs no SDK and no cookie.
   */
  readonly country?: string | null;
}

export type InterestResult = { status: 200 } | { status: 400; error: "invalid_submission" } | { status: 500; error: "storage_failed" };

/**
 * Handle one submission.
 *
 * `flow_id` and `step_id` are fixed rather than client-supplied: they identify where in the
 * product the question was asked, which the server knows and the client should not get to assert.
 */
export async function handleInterestSubmission(
  body: unknown,
  session: InterestSession,
  db: D1Like,
  analytics: CaptureConfig,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  now = new Date(),
): Promise<InterestResult> {
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: "invalid_submission" };
  const input = parsed.data;

  try {
    await saveInterestSignal(
      db,
      {
        email: input.email,
        sourceKey: input.source_key,
        intent: input.intent,
        sourceOther: input.source_other,
        accountId: session.accountId,
        userId: session.userId,
        posthogDistinctId: session.distinctId,
        initialUtmSource: input.initial_utm_source,
        initialUtmMedium: input.initial_utm_medium,
        initialUtmCampaign: input.initial_utm_campaign,
        initialReferrer: input.initial_referrer,
        referralCode: input.referral_code,
      },
      now,
    );
  } catch {
    // The row is the deliverable. Do not report success and do not emit the event.
    return { status: 500, error: "storage_failed" };
  }

  // An authenticated account id is the stable identity; otherwise the browser's own distinct_id
  // keeps the signal on the same person as the landing and upgrade-click events. With neither,
  // the event would land on a fabricated person and pollute the funnel, so it is skipped — the
  // D1 row is already durable, which is the part that matters.
  // The D1 row is written above regardless: a waitlist entry is the service this person asked
  // for, disclosed separately with its own retention, and suppressing analytics must not quietly
  // refuse their signup. Only the PostHog event is suppressed.
  const distinctId = session.accountId ?? session.distinctId;
  if (distinctId !== undefined) {
    const capturedAt = now.toISOString();
    const hasOtherText = input.source_other !== undefined && input.source_other.trim().length > 0;
    // Excluded from the objection-record check by LEGITIMATE_INTERESTS_ASSESSMENT.md's scope
    // section — `interest_submitted` needs its own basis analysis, which this document does not
    // attempt — so no `objectionSubject` here, and only the geography check applies. `flagsKv`
    // is `undefined` for the same reason `signin_started`/`signin_failed` pass it: there is
    // nothing for this call to check it against.
    captureConsoleEvent(ctx, undefined, analytics, session.country, {
      distinctId,
      event: EVENTS.interestSubmitted,
      authState: session.accountId === undefined ? "anonymous" : "authenticated",
      properties: {
        source_key: input.source_key,
        // Derived, not stored and not client-supplied — the canonical attribution contract asks
        // for a label on the event, and a point-in-time label is correct for historical analysis.
        source_label: SOURCE_LABELS[input.source_key],
        // The boolean, never the text. The raw answer stays in D1.
        other_text_present: hasOtherText,
        intent: input.intent,
        flow_id: "console_upgrade",
        step_id: "interest_collector",
        is_authenticated: session.accountId !== undefined,
        initial_utm_source: input.initial_utm_source,
        initial_utm_medium: input.initial_utm_medium,
        initial_utm_campaign: input.initial_utm_campaign,
        initial_referrer: input.initial_referrer,
        referral_code: input.referral_code,
      },
      set: {
        // The address itself is deliberately NOT sent. The published privacy policy promises
        // that no email or name ever reaches PostHog, and the Google user data statement says
        // Google-derived data reaches only Cloudflare and Stripe — an address here would make
        // both false. D1 is the system of record for it; PostHog gets the domain only, which
        // is what segmentation actually needs.
        email_domain: emailDomain(input.email),
        self_reported_source: input.source_key,
        self_reported_source_label: SOURCE_LABELS[input.source_key],
        self_reported_source_other_text_present: hasOtherText,
        self_reported_source_captured_at: capturedAt,
      },
      setOnce: {
        initial_utm_source: input.initial_utm_source,
        initial_utm_medium: input.initial_utm_medium,
        initial_utm_campaign: input.initial_utm_campaign,
        initial_referrer: input.initial_referrer,
      },
    });
  }

  return { status: 200 };
}
