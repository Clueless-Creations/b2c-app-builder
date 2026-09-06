/**
 * Every browser page the console renders, plus the CSRF token pairs its forms use.
 *
 * House style: zero-framework inline CSS (the shared theme in `hosted/knowledge-mcp/theme.ts`,
 * laid out by `console/chrome.ts`), no client-side JavaScript, and a Content-Security-Policy
 * strict enough that a script tag could not run even if one were added by mistake.
 *
 * Voice: this is a utility surface. Use plain labels, explain consequences, and save the kitchen
 * metaphor for the marketing page where it actually helps. Follow `VOICE.md`.
 */

import { issueConsentToken, verifyConsentToken } from "../../knowledge-mcp/auth.js";
import type { AccountId, ApiKeySummary } from "../../knowledge-mcp/db/tenant.js";
import { INTENTS, SOURCE_KEYS, SOURCE_LABELS, type Intent, type SourceKey } from "../analytics/events.js";
import type { SigninFailureReason } from "../analytics/events.js";
import { PLAN_IDS, PLANS } from "../billing/plans.js";
import { escapeHtml, OFFER_PAGE_URL, renderShell, REPOSITORY_URL, SITE_ORIGIN, type ConsoleSection, type ShellNav } from "./chrome.js";

export { escapeHtml };

function formatTimestamp(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function csrfParams(accountId: AccountId): string {
  return `console-keys:${accountId}`;
}

export async function issueKeysCsrfToken(secret: string, accountId: AccountId): Promise<string> {
  return issueConsentToken(secret, csrfParams(accountId));
}

export async function verifyKeysCsrfToken(secret: string, token: string, accountId: AccountId): Promise<boolean> {
  return verifyConsentToken(secret, token, csrfParams(accountId));
}

function interestCsrfParams(accountId: AccountId): string {
  return `console-interest:${accountId}`;
}

export async function issueInterestCsrfToken(secret: string, accountId: AccountId): Promise<string> {
  return issueConsentToken(secret, interestCsrfParams(accountId));
}

export async function verifyInterestCsrfToken(secret: string, token: string, accountId: AccountId): Promise<boolean> {
  return verifyConsentToken(secret, token, interestCsrfParams(accountId));
}

function checkoutCsrfParams(accountId: AccountId): string {
  return `console-checkout:${accountId}`;
}

export async function issueCheckoutCsrfToken(secret: string, accountId: AccountId): Promise<string> {
  return issueConsentToken(secret, checkoutCsrfParams(accountId));
}

export async function verifyCheckoutCsrfToken(secret: string, token: string, accountId: AccountId): Promise<boolean> {
  return verifyConsentToken(secret, token, checkoutCsrfParams(accountId));
}

function signoutCsrfParams(accountId: AccountId): string {
  return `console-signout:${accountId}`;
}

export async function issueSignoutCsrfToken(secret: string, accountId: AccountId): Promise<string> {
  return issueConsentToken(secret, signoutCsrfParams(accountId));
}

export async function verifySignoutCsrfToken(secret: string, token: string, accountId: AccountId): Promise<boolean> {
  return verifyConsentToken(secret, token, signoutCsrfParams(accountId));
}

export interface ConsoleNavSource {
  readonly email?: string;
  readonly displayName?: string | null;
  readonly signoutCsrfToken?: string;
}

export function navFor(session: ConsoleNavSource, current: ConsoleSection): ShellNav {
  return { email: session.email ?? "", displayName: session.displayName ?? null, signoutCsrfToken: session.signoutCsrfToken ?? "", current };
}

function firstName(nav: ShellNav | undefined): string | null {
  const name = nav?.displayName?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] ?? null;
}

export const SIGNIN_NOTICES = ["signed_out", "cancelled"] as const;
export type SigninNotice = (typeof SIGNIN_NOTICES)[number];

export function isSigninNotice(value: string | null): value is SigninNotice {
  return (SIGNIN_NOTICES as readonly string[]).includes(value ?? "");
}

const SIGNIN_NOTICE_MESSAGES: Record<SigninNotice, string> = {
  signed_out: "You’re signed out.",
  cancelled: "Google sign-in was cancelled. Nothing was created.",
};

export interface SigninPageInput {
  readonly entryPoint: string;
  readonly notice: SigninNotice | null;
}

export function renderSigninPage(input: SigninPageInput): string {
  const startHref = `/auth/google/start?entry_point=${encodeURIComponent(input.entryPoint)}`;
  const notice = input.notice ? `<div class="notice" role="status"><p>${escapeHtml(SIGNIN_NOTICE_MESSAGES[input.notice])}</p></div>` : "";
  return renderShell({
    title: "Sign in",
    body: `<span class="eyebrow">Hosted access</span>
<h1>Use the agent you already have.</h1>
<p class="lede">Hosted access keeps the workflows and sourced references available without making you run the service yourself. Your agent connects here. Your repo, model, and app stay where they already are.</p>
<div class="reveal"><p><strong>$19 a month or $190 a year.</strong> There is no free tier or trial. Signing in creates your account; it does not start a paid plan.</p></div>
${notice}
<div class="actions"><a class="btn btn--wide" href="${startHref}">Continue with Google</a></div>
<p class="help">Google shares your name and email, nothing else. No card is requested until you choose a plan in Stripe.</p>
<h2>From here to connected</h2>
<ol class="steps">
<li><span class="n">01</span><div><strong>Sign in</strong><span>Create your console account with Google.</span></div></li>
<li><span class="n">02</span><div><strong>Choose a plan</strong><span>$19 monthly or $190 annually through Stripe.</span></div></li>
<li><span class="n">03</span><div><strong>Create a key</strong><span>You see it once. Revoke and replace it whenever you need to.</span></div></li>
<li><span class="n">04</span><div><strong>Connect your agent</strong><span>Copy the snippet for Claude Code, Codex, Cursor, or plain HTTP.</span></div></li>
</ol>
<p class="help">Hosted access supplies workflows and references. Model usage, coding-agent costs, infrastructure, and third-party services are separate.</p>
<div class="doors">
<div class="door"><h2>Run it yourself</h2><p>The open-source version runs on your machine. You operate it and bring the tools your project needs.</p><a class="btn btn--secondary" href="${REPOSITORY_URL}">Open source on GitHub</a></div>
<div class="door"><h2>See what you’re buying</h2><p>The public page shows the workflows, examples, a real routing trace, pricing, and exactly what hosted access can and cannot do.</p><a class="btn btn--secondary" href="${OFFER_PAGE_URL}">See how it works</a></div>
</div>
<p class="help">By continuing you agree to the <a href="${SITE_ORIGIN}/terms/">Terms</a> and <a href="${SITE_ORIGIN}/privacy/">Privacy notice</a>. The Terms include the 14-day refund policy.</p>`,
  });
}

const SIGNIN_FAILURE_MESSAGES: Record<SigninFailureReason, string> = {
  state_mismatch: "Your sign-in link expired or didn’t match this browser. Try again.",
  expired_code: "That sign-in link was already used or expired. Try again.",
  token_invalid: "Google couldn’t be verified for this sign-in. Try again.",
  email_unverified: "Sign-in needs a verified email address on your Google account.",
  internal: "Something went wrong on our side. Try again in a moment.",
};

export function renderSigninFailedPage(reason: SigninFailureReason): string {
  return renderShell({
    title: "Sign-in problem",
    body: `<span class="eyebrow">Hosted access</span><h1>We couldn’t sign you in.</h1>
<p class="lede">${escapeHtml(SIGNIN_FAILURE_MESSAGES[reason])}</p>
<div class="actions"><a class="btn" href="/signin">Try again</a></div>`,
  });
}

export function renderConsoleUnavailablePage(): string {
  return renderShell({
    title: "Console unavailable",
    body: `<span class="eyebrow">Hosted access</span><h1>The console is temporarily unavailable.</h1>
<p class="lede">Something on our side is misconfigured. Try again shortly.</p>`,
  });
}

export function renderConsoleErrorPage(): string {
  return renderShell({
    title: "Something went wrong",
    body: `<span class="eyebrow">Hosted access</span><h1>Something went wrong on our side.</h1>
<p class="lede">Try again in a moment.</p>`,
  });
}

const INTENT_LABELS: Record<Intent, string> = {
  evaluating: "Evaluating for a future project",
  ready_to_buy: "Ready to buy now",
  just_curious: "Just curious",
  need_team_plan: "Need a plan for my whole team",
};

function welcome(nav: ShellNav | undefined): string {
  const name = firstName(nav);
  return name ? `Welcome back, ${escapeHtml(name)}.` : "Welcome back.";
}

const KEYS_BLOCK = `<h2>Keys</h2>
<p>Create a key for each agent or machine you want to connect. You only see the full key once.</p>
<div class="actions"><a class="btn btn--secondary" href="/console/keys">Manage keys</a></div>`;

export interface ConsolePageInput {
  readonly csrfToken: string;
  readonly alreadySubmitted: boolean;
  readonly error?: string;
  readonly nav?: ShellNav;
}

export function renderConsolePage(input: ConsolePageInput): string {
  const errorNotice = input.error ? `<div class="notice" role="status"><p>${escapeHtml(input.error)}</p></div>` : "";
  const askForAccess = input.alreadySubmitted
    ? `${errorNotice}<div class="reveal"><p><strong>Thanks. We’ll email you a Stripe payment link for the monthly or annual plan.</strong> Access switches on when the first invoice is paid.</p></div>`
    : `<h2>Ask for access</h2>
<p>Self-serve checkout isn’t open on this account yet. Tell us what you’re building and we’ll follow up with a payment link.</p>
${errorNotice}
<form method="post" action="/console/interest">
<input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}">
<label for="interest-email">Best email for your payment link</label>
<input id="interest-email" name="email" type="email" maxlength="254" required>
<label for="interest-source">How did you hear about us?</label>
<select id="interest-source" name="source_key" required>
${SOURCE_KEYS.map((key: SourceKey) => `<option value="${escapeHtml(key)}">${escapeHtml(SOURCE_LABELS[key])}</option>`).join("")}
</select>
<label for="interest-source-other">If “Somewhere else”, tell us where (optional)</label>
<input id="interest-source-other" name="source_other" type="text" maxlength="500">
<fieldset><legend>What best describes you right now?</legend>
${INTENTS.map((intent, index) => `<label class="radio-row"><input type="radio" name="intent" value="${escapeHtml(intent)}" ${index === 0 ? "checked" : ""}>${escapeHtml(INTENT_LABELS[intent])}</label>`).join("")}
</fieldset>
<div class="actions"><button type="submit">Ask for access</button></div>
</form>`;
  return renderShell({
    title: "Console",
    nav: input.nav,
    body: `<span class="eyebrow">Console</span><h1>${welcome(input.nav)}</h1>
<p class="lede">Manage your plan, create keys, and connect the agents you actually use.</p>
${askForAccess}
${KEYS_BLOCK}`,
  });
}

export type EntitlementDisplayState = "none" | "active" | "past_due_in_grace" | "canceled";

const ENTITLEMENT_STATE_MESSAGES: Record<EntitlementDisplayState, string> = {
  none: "No active plan yet. Your keys cannot use hosted access until a plan is active.",
  active: "Your Pro plan is active. Your keys can use hosted access.",
  past_due_in_grace: "Your last payment failed. Access still works while Stripe retries it. Update your payment method before the grace period ends.",
  canceled: "Your plan is not active. Your keys cannot use hosted access until a plan is active.",
};

const ENTITLEMENT_STATE_CLASS: Record<EntitlementDisplayState, string> = {
  none: "",
  active: " on",
  past_due_in_grace: " warn",
  canceled: " warn",
};

export interface ConsolePlansPageInput {
  readonly csrfToken: string;
  readonly entitlementState: EntitlementDisplayState;
  readonly hasStripeCustomer: boolean;
  readonly checkoutQuery: "success" | "cancelled" | null;
  readonly nav?: ShellNav;
}

export function renderConsolePlansPage(input: ConsolePlansPageInput): string {
  const checkoutNotice = input.checkoutQuery === "success"
    ? `<div class="reveal"><p><strong>Payment received.</strong> Access switches on as soon as Stripe confirms it, usually within a minute.</p></div>`
    : input.checkoutQuery === "cancelled"
      ? `<div class="notice" role="status"><p>Checkout was cancelled. Nothing was charged.</p></div>`
      : "";
  const planCards = PLAN_IDS.map((id) => {
    const plan = PLANS[id];
    return `<div class="plan"><strong>${escapeHtml(plan.displayName)}</strong><div class="price">${escapeHtml(plan.displayPrice)}</div>
<form method="post" action="/console/checkout">
<input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}">
<input type="hidden" name="plan" value="${escapeHtml(id)}">
<button type="submit">Choose ${escapeHtml(plan.displayName.toLowerCase())}</button>
</form></div>`;
  }).join("");
  const manageBilling = input.hasStripeCustomer
    ? `<form class="row-form" method="post" action="/console/billing"><input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}"><button class="secondary" type="submit">Manage billing</button></form>`
    : "";
  const offersPlans = input.entitlementState === "none" || input.entitlementState === "canceled";
  const planSection = offersPlans
    ? `<div class="plans">${planCards}</div><p class="help">Checkout and receipts run on Stripe. Cancel any time from Manage billing; access continues through the period you paid for.</p>`
    : `<p class="help">To change or cancel your plan, open Manage billing. Access continues through the period you paid for.</p>`;
  return renderShell({
    title: "Console",
    nav: input.nav,
    body: `<span class="eyebrow">Console</span><h1>${welcome(input.nav)}</h1>
<p class="lede">Manage your plan, create keys, and connect the agents you actually use.</p>
${checkoutNotice}
<h2>Your plan</h2>
<div class="status${ENTITLEMENT_STATE_CLASS[input.entitlementState]}"><span class="dot" aria-hidden="true"></span><span>${escapeHtml(ENTITLEMENT_STATE_MESSAGES[input.entitlementState])}</span></div>
${planSection}
${manageBilling ? `<div class="actions">${manageBilling}</div>` : ""}
${KEYS_BLOCK}`,
  });
}

const MCP_URL = "https://mcp.clueless-creations.com/mcp";
const API_URL = "https://mcp.clueless-creations.com/api/v1";

const CONNECT_SNIPPETS: readonly { readonly name: string; readonly code: string; readonly note: string }[] = [
  {
    name: "Claude Code",
    code: `claude mcp add --transport http b2c-app-builder ${MCP_URL}`,
    note: "Then run /mcp inside Claude Code and choose the server to authorize. The authorization page asks for your key once and gives Claude Code a separate connection you can revoke.",
  },
  {
    name: "Codex",
    code: `codex mcp add b2c-hosted --url ${MCP_URL} --oauth-client-registration dcr\ncodex mcp login b2c-hosted --scopes b2c:read --oauth-client-registration dcr`,
    note: "The authorization page asks for your key once and gives Codex a separate, revocable connection. Codex never receives the owner key itself.",
  },
  {
    name: "Cursor",
    code: `{ "mcpServers": { "b2c-app-builder": { "url": "${MCP_URL}" } } }`,
    note: "Add that to ~/.cursor/mcp.json, or the project’s .cursor/mcp.json, then approve the connection from Cursor’s settings when it asks.",
  },
  {
    name: "Plain HTTP",
    code: `curl ${API_URL}/catalog \\\n  -H "Authorization: Bearer <your API key>"`,
    note: `Use the catalog and workflows directly at ${API_URL} with your key. This skips the authorization flow used by agent clients.`,
  },
];

function connectBlock(): string {
  return `<h2>Connect an agent</h2>
<p>Pick the client you use and copy its snippet. Agent clients authorize once, then keep their own connection so you can revoke it separately.</p>
${CONNECT_SNIPPETS.map((snippet) => `<h3 class="eyebrow" style="margin:22px 0 8px">${escapeHtml(snippet.name)}</h3><pre><code>${escapeHtml(snippet.code)}</code></pre><p class="help">${escapeHtml(snippet.note)}</p>`).join("")}`;
}

export interface KeysListPageInput {
  readonly keys: readonly ApiKeySummary[];
  readonly csrfToken: string;
  readonly flash?: string;
  readonly nav?: ShellNav;
}

export function renderKeysListPage(input: KeysListPageInput): string {
  const rows = input.keys.map((key) => {
    const status = key.revokedAt === null
      ? `<span class="badge active">Active</span>`
      : `<span class="badge revoked">Revoked ${escapeHtml(formatTimestamp(key.revokedAt))}</span>`;
    const revokeForm = key.revokedAt === null
      ? `<form class="row-form" method="post" action="/console/keys/${encodeURIComponent(key.id)}/revoke"><input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}"><button class="danger" type="submit">Revoke</button></form>`
      : "";
    return `<tr><td class="mono">${escapeHtml(key.keyPrefix)}…</td><td>${escapeHtml(key.label ?? "—")}</td><td>${escapeHtml(formatTimestamp(key.createdAt))}</td><td>${status}</td><td>${revokeForm}</td></tr>`;
  }).join("");
  const flashBlock = input.flash ? `<div class="notice" role="status"><p>${escapeHtml(input.flash)}</p></div>` : "";
  const table = input.keys.length === 0
    ? `<p class="help">No API keys yet. Create one below.</p>`
    : `<table><thead><tr><th>Key</th><th>Label</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  return renderShell({
    title: "Keys",
    nav: input.nav,
    body: `<span class="eyebrow">Keys</span><h1>Keys for the agents you use.</h1>
<p class="lede">Each key can connect one agent or machine to hosted access. You see the full value once, right after creating it. After that, only its digest is stored.</p>
${flashBlock}
${table}
<h2>Create a key</h2>
<form method="post" action="/console/keys">
<input type="hidden" name="csrf" value="${escapeHtml(input.csrfToken)}">
<label for="key-label">Label (optional)</label>
<input id="key-label" name="label" type="text" maxlength="120" placeholder="e.g. laptop, CI">
<p class="help">Use a label you’ll recognize later. It stays in this console.</p>
<div class="actions"><button type="submit">Create key</button></div>
</form>
${connectBlock()}
<p class="help" style="margin-top:32px"><a href="/console/audit">Audit log</a></p>`,
  });
}

export interface KeyCreatedPageInput {
  readonly rawKey: string;
  readonly summary: ApiKeySummary;
  readonly csrfToken: string;
  readonly nav?: ShellNav;
}

export function renderKeyCreatedPage(input: KeyCreatedPageInput): string {
  return renderShell({
    title: "Key created",
    nav: input.nav,
    body: `<span class="eyebrow">Key created</span><h1>Copy this before you leave.</h1>
<div class="reveal">
<p><strong>This is the only time the full key is shown.</strong> The console stores only its digest, so it cannot show you the key again later.</p>
<input type="text" class="mono" readonly aria-label="New API key" value="${escapeHtml(input.rawKey)}">
<p class="help">Select the field and copy the full value now.</p>
</div>
<p class="help">Label: ${escapeHtml(input.summary.label ?? "none")}. Created ${escapeHtml(formatTimestamp(input.summary.createdAt))}.</p>
${connectBlock()}
<p class="help" style="margin-top:32px"><a href="/console/keys">Back to your keys</a></p>`,
  });
}

export interface AuditPageInput {
  readonly events: readonly { readonly id: string; readonly action: string; readonly createdAt: string }[];
  readonly nav?: ShellNav;
}

export function renderAuditPage(input: AuditPageInput): string {
  const rows = input.events.map((event) => `<tr><td>${escapeHtml(formatTimestamp(event.createdAt))}</td><td>${escapeHtml(event.action)}</td></tr>`).join("");
  const body = input.events.length === 0
    ? `<p class="help">Nothing recorded yet. Key create and revoke are not written to the audit log until the published privacy policy is updated to disclose it.</p>`
    : `<table><thead><tr><th>When</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`;
  return renderShell({
    title: "Audit log",
    nav: input.nav,
    body: `<span class="eyebrow">Account history</span><h1>Audit log.</h1>
${body}
<p class="help"><a href="/console/keys">Back to your keys</a></p>`,
  });
}
