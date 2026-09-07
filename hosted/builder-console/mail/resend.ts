/**
 * Outbound email for the console, through Resend's HTTP API
 * (https://resend.com/docs/api-reference/emails/send-email). No `resend` npm dependency, for the
 * same reason `billing/stripe.ts` carries no Stripe SDK: this Worker's bundle stays as small as
 * the repository can make it, and one `fetch` is the whole integration.
 *
 * The API key is the on/off switch. `mailConfigFromEnv` returns `null` when `RESEND_API_KEY` is
 * unset, and every sender treats `null` as "mail is off" — logged once per attempt, never an
 * error — which is the same contract `POSTHOG_PROJECT_TOKEN` already has for analytics
 * (README, Credentials). The key is set with `wrangler secret put`, from Doppler, and is not in
 * `wrangler.jsonc`'s `secrets.required`: a deployment without it must still serve the console.
 *
 * Every send carries an `Idempotency-Key` (Resend honours it for 24 hours), built by the caller
 * from the Stripe event id and the notice kind, so a retried delivery or a re-run `waitUntil`
 * cannot mail a person twice about the same moment.
 */

import { z } from "zod";

/** Resend's send endpoint (https://resend.com/docs/api-reference/emails/send-email); the one URL this module calls. */
const RESEND_SEND_URL = "https://api.resend.com/emails";

/** The one sender this console mails from. Replies go to the same inbox. */
export const MAIL_FROM = "Clueless Creations <eduardo@clueless-creations.com>";

export interface MailConfig {
  readonly apiKey: string;
  /** Injectable so tests never make a real network call, matching `billing/stripe.ts`. */
  readonly fetchImpl?: typeof fetch;
}

/** `null` when mail is off for this deployment. */
export function mailConfigFromEnv(env: { readonly RESEND_API_KEY?: string }): MailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  return apiKey ? { apiKey } : null;
}

export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Stable per (event, notice); see this file's doc comment. */
  readonly idempotencyKey: string;
  /** Resend tags: ASCII letters, digits, `_`, `-` only, in both name and value. */
  readonly tags?: readonly { readonly name: string; readonly value: string }[];
}

/** A non-2xx response, or a body that was not the JSON Resend always sends. */
export class ResendApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Resend API request failed with status ${status}`);
  }
}

const sendResponse = z.object({ id: z.string() });

/** Sends one email. Throws on failure; callers decide whether that is worth more than a log line. */
export async function sendEmail(config: MailConfig, email: OutboundEmail): Promise<{ id: string }> {
  const doFetch = config.fetchImpl ?? fetch;
  const response = await doFetch(RESEND_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.tags && email.tags.length > 0 ? { tags: email.tags } : {}),
    }),
  });
  const raw = await response.text();
  let json: unknown;
  try {
    json = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    throw new ResendApiError(response.status, raw);
  }
  if (!response.ok) throw new ResendApiError(response.status, json);
  const parsed = sendResponse.safeParse(json);
  if (!parsed.success) throw new ResendApiError(502, json);
  return { id: parsed.data.id };
}
