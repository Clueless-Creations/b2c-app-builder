# Resend Email Operations

Use this before setting up Resend for transactional email, lifecycle automations, broadcasts, waitlist/contact sync, sender-domain DNS, webhooks, inbound email, unsubscribe handling, or deliverability monitoring.

Before marking this lane done, load [`provider-proof.md`](../process/provider-proof.md): provider-backed readiness needs live proof or a recorded founder-only decision in `operations/PROVIDER_PROOF.md`, never setup prose alone.

Load [`paid-tool-routing.md`](paid-tool-routing.md) before replacing Resend account/domain features, broadcasts, automations, webhooks, inbound email, or paid deliverability needs with local email previews, logs, Gmail, Cloudflare Email Routing, or another provider.

## Contents

- Current Sources To Refresh
- Required Artifact
- Setup Process
- Starter Template Pack
- Verification Checklist

## Current Sources To Refresh

Refresh these docs before implementation because email deliverability, bulk-sender requirements, and Resend features change:

- Resend docs index: `https://resend.com/docs`
- Resend AI docs index: `https://resend.com/docs/llms.txt`
- Next.js TypeScript quickstart: `https://resend.com/docs/send-with-nextjs`
- Send Email API: `https://resend.com/docs/api-reference/emails`
- Idempotency keys: `https://resend.com/docs/dashboard/emails/idempotency-keys`
- Domains: `https://resend.com/docs/dashboard/domains/introduction`
- Cloudflare domain setup: `https://resend.com/docs/dashboard/domains/cloudflare`
- DMARC: `https://resend.com/docs/dashboard/domains/dmarc`
- Region selection: `https://resend.com/docs/dashboard/domains/regions`
- Open/click tracking: `https://resend.com/docs/dashboard/domains/tracking`
- API keys and key handling: `https://resend.com/docs/dashboard/api-keys/introduction`, `https://resend.com/docs/knowledge-base/how-to-handle-api-keys`
- Webhooks and verification: `https://resend.com/docs/webhooks/introduction`, `https://resend.com/docs/webhooks/verify-webhooks-requests`
- Audiences, contacts, topics, and unsubscribe state: `https://resend.com/docs/dashboard/audiences/introduction`, `https://resend.com/docs/dashboard/audiences/contacts`, `https://resend.com/docs/dashboard/topics/introduction`
- Broadcasts: `https://resend.com/docs/dashboard/broadcasts/introduction`
- Automations: `https://resend.com/docs/dashboard/automations/introduction`
- Transactional unsubscribe headers: `https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails`
- Receiving/inbound email: `https://resend.com/docs/dashboard/receiving/introduction`, `https://resend.com/docs/dashboard/receiving/custom-domains`
- RevenueCat customer entitlements and API docs when support emails mention granted entitlements: `https://www.revenuecat.com/docs/dashboard-and-metrics/customer-history/active-entitlements`, `https://www.revenuecat.com/docs/api-v2`

## Required Artifact

Create `growth/EMAIL_OPS.md` when email is more than a plain waitlist notification, or when Resend is part of the stack.

Must include:

- email purpose map: auth, waitlist confirmation, welcome, onboarding nudges, trial reminders, payment recovery, receipts, product updates, marketing broadcasts, support replies, admin alerts
- sender map: from address, reply-to, domain/subdomain, purpose, owner, template, environment, and unsubscribe requirement
- domain/DNS status: sending domain, region, SPF, DKIM, custom return path, tracking subdomain, DMARC, and verification timestamps
- API key inventory: key name, permission, domain scope, environment variable, deploy target, rotation date, and owner
- code paths: server-only send wrappers, template locations, idempotency-key strategy, tags/categories, logging, and retry behavior
- webhook plan: endpoint URL, selected events, signature verification, duplicate handling via `svix-id`, storage table/log path, and alerting
- audience plan: contacts, properties, segments, topics, broadcast policy, automation triggers, unsubscribe/preference handling
- inbound/reply plan when used: receiving domain, MX conflict notes, webhook handler, attachment handling, support routing, and retention
- privacy/legal notes: vendor disclosure, email content retention, tracking, unsubscribe, and data deletion behavior
- validation log: DNS checks, test send, inbox placement/header checks, webhook replay, unsubscribe test, automation run, broadcast test, and inbound test where relevant

Acceptance:

- Production sends use a verified domain or subdomain, not `resend.dev`.
- API keys are server-only and scoped to the smallest useful permission.
- Bounces, complaints/unsubscribes, and webhooks are observable before public traffic.
- Marketing/lifecycle messages have unsubscribe handling; transactional-only messages are classified intentionally.
- Email behavior matches `trust/PRIVACY.md`, `trust/TERMS.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, and `revenue/REVENUE_OPS.md`.

## Setup Process

### 1. Decide Email Architecture

Classify each email:

- **Transactional**: auth codes, magic links, receipts, account-access reset, account deletion confirmations, billing notices, support confirmations.
- **Lifecycle/product**: welcome, onboarding nudges, trial reminders, abandoned onboarding, payment recovery, win-back, feature education.
- **Marketing/broadcast**: launch updates, newsletters, promotions, product announcements.
- **Inbound/support**: replies, forwarded attachments, support requests, human escalation.

Rules:

- Use Resend API/SDK for transactional product email.
- Use Resend Automations for event-triggered lifecycle sequences when the flow is simple enough to own in Resend.
- Use Resend Broadcasts with Contacts/Segments/Topics for marketing updates.
- Use a support inbox/tool for human support unless Resend Inbound is explicitly chosen for routing/automation.

### 2. Domain And DNS

Recommended:

- Use a purpose-specific sending subdomain such as `updates.example.com`, `mail.example.com`, or `notifications.example.com` instead of the root/apex domain.
- Use separate subdomains when reputation or region needs differ, for example `updates.example.com` for marketing and `notify.example.com` for transactional.
- Decide data region before creating domains when data residency matters.

Setup:

- Add the sending domain in Resend.
- Add the required SPF and DKIM DNS records.
- Use the Cloudflare automatic setup when available, or manually add the records exactly as Resend shows them.
- If using a custom return path, choose a credible label and record it.
- Add DMARC after SPF/DKIM verify. Start with `p=none` for monitoring, then move toward `quarantine` or `reject` only after all senders pass.
- Configure open/click tracking only if the privacy policy and analytics plan cover it. Use a custom tracking subdomain if tracking is enabled.

Do not point root-domain MX records at Resend Inbound unless the founder explicitly intends Resend to receive all mail for that domain. For custom inbound, prefer a subdomain to avoid breaking existing mailboxes or Cloudflare Email Routing.

### 3. API Keys And Secrets

Create separate keys per environment and purpose:

- `development` or `staging`
- `production-transactional`
- `production-automation` or `production-broadcast` only if needed

Rules:

- Prefer `sending_access` and domain scoping for app runtime sends.
- Use `full_access` only for admin automation that truly manages domains, contacts, webhooks, or broadcasts.
- Store keys in server-side environment variables such as `RESEND_API_KEY`; never expose them to browser code or `NEXT_PUBLIC_*`.
- Record where the key is stored: Vercel, Cloudflare Workers, Supabase Edge Functions, GitHub Actions secret, local `.env`, or another provider.
- Rotate stale or unused keys. Resend keys are visible only once and do not auto-expire.

### 4. TypeScript Send Path

Use a server-only wrapper. Keep framework-specific route handlers thin.

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(input: { userId: string; email: string; firstName?: string }) {
  return resend.emails.send(
    {
      from: "Example <welcome@updates.example.com>",
      to: [input.email],
      subject: "Welcome to Example",
      html: `<p>Welcome${input.firstName ? `, ${input.firstName}` : ""}.</p>`,
      text: `Welcome${input.firstName ? `, ${input.firstName}` : ""}.`,
      tags: [{ name: "category", value: "welcome" }],
    },
    {
      idempotencyKey: `welcome/${input.userId}`,
    },
  );
}
```

Rules:

- Include both `html` and `text` when practical.
- Use idempotency keys for signup, receipt, account, support, and lifecycle emails that may be retried.
- Use tags for categories such as `welcome`, `waitlist`, `trial_reminder`, `receipt`, `payment_failed`, `support`, and `admin_alert`.
- Surface errors to logs/monitoring; do not silently swallow send failures.

### 5. Templates

Choose one template strategy:

- React Email/TSX templates in the product repo.
- Resend hosted Templates for Automations and non-developer editing.
- Simple inline HTML/text only for tiny early-stage transactional messages.
- Starter TypeScript templates from `business/growth/resend/email-templates.ts` when the app needs common support, lifecycle, billing, entitlement, waitlist, or privacy messages quickly.

Every template needs:

- before drafting subject, preview text, or body copy: load `knowledge/words/no-slop-writing.md` — its §7 covers push/lifecycle email subject-line limits specifically; keep the tone `11_STAR_EXPERIENCE.md`/`strategy/BRAND.md` set for this product, not generic transactional-email English
- subject, preview text where supported, HTML, plain text, sender, reply-to, purpose, owner
- brand fields and required email-safe design tokens derived from `DESIGN.md`: logo, app name, accent color, text colors, surface/border colors, typography, radius, spacing, max width, logo height, and footer rules
- experience tone derived from `11_STAR_EXPERIENCE.md`, especially lifecycle copy that should feel like the product remembered the user's goal
- mobile-safe layout and accessible links/buttons
- unsubscribe/preference link for non-transactional messages
- legal footer where marketing or lifecycle messaging requires it
- test recipient and test-send record
- tags and idempotency-key strategy for retry-prone messages

### 6. Contacts, Topics, Segments, Broadcasts

Use Contacts for marketing/lifecycle audience state:

- create/update contacts on waitlist signup, account creation, purchase, cancellation, and preference changes
- use custom properties for attribution source, plan, lifecycle state, country, platform, and onboarding answers only when needed
- use Segments for internal targeting groups
- use Topics for user-facing preferences and unsubscribe control
- label Broadcasts with a Topic whenever possible

Broadcasts and Automations can use Resend unsubscribe URLs. Transactional email does not automatically inherit contact-list unsubscribe handling, so add one-click unsubscribe headers and your own preference endpoint when sending bulk or promotional transactional-like messages.

### 7. Automations

Good launch automations:

- `waitlist.joined` -> confirmation + referral/share reminder
- `user.created` -> welcome + setup nudge
- `onboarding.started` without `onboarding.completed` -> resume nudge
- `trial.started` -> value reminder sequence
- `trial.expiring` -> renewal reminder
- `payment.failed` -> billing recovery
- `subscription.cancelled` -> cancellation confirmation and optional win-back

Rules:

- Trigger Automations from product events that already exist in `analytics/ANALYTICS.md`.
- Include `{{{RESEND_UNSUBSCRIBE_URL}}}` for non-transactional product and marketing messaging.
- Monitor Automation runs for `running`, `completed`, `failed`, `cancelled`, and `skipped`.
- Record where Resend automation state overlaps with PostHog, RevenueCat, Stripe, or your backend so users do not receive duplicate lifecycle emails.

### 7a. Lifecycle Email Visual Assets

Win-back, trial-reminder, and billing-recovery emails can carry Higgsfield-generated images:

- **`hero_banner`** mode — wide email header art (use for top-of-email brand moment).
- **`lifestyle_scene`** mode — product-in-context body image (use for mid-email engagement shot).

Generate both via the `higgsfield-product-photoshoot` skill. See the **Seasonal restyle Refresh** and **Cheap-First Direction** recipes in `tool-recipes/visual-and-motion-production.md` for the generation workflow; use `--mode hero_banner` or `--mode lifestyle_scene` in the `higgsfield product-photoshoot create` call.

Rules:

- Every prompt must carry DESIGN.md brand tokens (palette, type mood, shapes, texture, banned aesthetics). DESIGN.md tokens are already pulled for email `LaunchEmailBrand.designSystem`; reuse the same token set.
- Generated images are supporting art only. They must not substitute for truthful real UI or make product claims.
- Confirm spend with the founder before each photoshoot run per `paid-tool-routing.md`; surface current credit balance.
- Record every generated asset in `CONTENT_ASSETS.md` with `prompt_brief`, output path, intended email surface (`hero_banner` / `lifestyle_scene`), and approval gate.
- Founder must approve assets before production sends. The founder approval gate in the Starter Template Pack rules applies here.

### 8. Webhooks

Create a production HTTPS webhook and select the events the product needs:

- delivery: sent, delivered, delivery delayed, bounced, complained
- engagement: opened/clicked only if tracking is enabled and disclosed
- contacts/topics/unsubscribe where lifecycle messaging depends on it
- `email.received` when using Inbound
- domain/webhook events only for admin observability if useful

TypeScript verification pattern:

```ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const payload = await req.text();

  try {
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    });

    // Store svix-id before processing to make handling idempotent.
    // Process event.type with created_at ordering rules if order matters.
    return NextResponse.json({ received: true });
  } catch {
    return new NextResponse("Invalid webhook", { status: 400 });
  }
}
```

Rules:

- Verify against the raw request body.
- Store processed `svix-id` values because Resend webhooks are at-least-once and may be duplicated.
- Do not assume event order; use `created_at` if ordering matters.
- Return 2xx only after the event is durably accepted or safely ignored.
- Test local webhooks with a tunnel, then deploy and replay from the Resend dashboard.

### 9. Inbound Email

Use Resend Inbound only when the app needs email-as-input, automated reply processing, attachment ingestion, or support routing through code.

Setup:

- Use a Resend-managed `*.resend.app` address for early tests, or a custom inbound subdomain for production.
- Add the required receiving MX record.
- Register a webhook for `email.received`.
- Verify webhook signature and store inbound metadata.
- Decide attachment size/type handling, PII retention, spam/abuse handling, and human escalation.

If the goal is ordinary support inbox forwarding, Cloudflare Email Routing, Gmail/Workspace, or a support tool may be simpler than Resend Inbound.

### 10. Compliance, Privacy, And Deliverability

Before public traffic:

- Update `trust/PRIVACY.md` with Resend as email processor, email categories, tracking if enabled, and unsubscribe/preference behavior.
- Update `trust/TERMS.md` or support docs for account/billing/support email expectations where needed.
- Add unsubscribe links to marketing/lifecycle messages and one-click unsubscribe headers where bulk-sender rules apply.
- Suppress or stop sending to bounced, complained, deleted, or unsubscribed contacts.
- Check headers on test emails for SPF, DKIM, and DMARC pass.
- Monitor Resend Emails, Logs, Webhooks, Contacts, Broadcasts, Automation Runs, and Exports as needed.

## Starter Template Pack

Use `business/growth/resend/email-templates.ts` as the out-of-the-box pack for B2C app launches. Copy it into the product repo when Resend is selected, then adapt brand copy, links, legal footer, support SLAs, `LaunchEmailBrand.designSystem` from the project's canonical `DESIGN.md`, and lifecycle tone from `11_STAR_EXPERIENCE.md`.

Included templates:

- `waitlistConfirmationEmail` - confirms waitlist signup and optional referral link.
- `supportRequestReceivedEmail` - acknowledges inbound support and sets response expectations.
- `supportReplyEmail` - wraps human or agent-assisted support replies.
- `entitlementGrantedEmail` - tells a user that beta/support access was granted.
- `restorePurchasesHelpEmail` - helps users recover app-store or web purchase access.
- `paymentFailedEmail` - sends secure billing-recovery instructions.
- `trialExpiringEmail` - warns before trial conversion or access change.
- `accountDeletionConfirmedEmail` - confirms privacy/account deletion completion.

Rules:

- Do not ship generic-looking email. `LaunchEmailBrand.designSystem` is required and must be populated from the business design system before production sends. Set `designSystem.source` to `DESIGN.md` or the project-specific design artifact used, and fill every required token group: `colors`, `typography`, `radius`, `spacing`, and `email`.
- Use email-safe interpretations of design tokens: hex colors, web-safe or hosted font stacks, conservative radii, fixed max width, accessible contrast, and inline styles.
- Treat the pack as starter implementation, not legal copy. Match `trust/PRIVACY.md`, `trust/TERMS.md`, subscription disclosures, and app-store billing rules before production.
- For `entitlementGrantedEmail`, verify the RevenueCat grant in dashboard/API proof first. Do not imply that a granted entitlement changes billing, cancels a subscription, creates a paid subscription, or issues a refund.
- For lifecycle or marketing-like messages, include preference/unsubscribe links and one-click unsubscribe headers when bulk-sender rules apply.
- For support and account-access messages, keep replies transactional unless marketing or upsell copy is added.
- Keep API keys and webhook secrets server-only through `SECRETS.md`; never generate sends from browser code.
- Use Resend tags and idempotency keys for waitlist, support, billing, entitlement, privacy, and lifecycle emails that might be retried.

## Verification Checklist

Record each result in `growth/EMAIL_OPS.md`:

- domain/subdomain verified in Resend
- SPF and DKIM pass
- DMARC record exists and current policy is justified
- optional tracking subdomain verified or deliberately disabled
- API key works in staging and production, with no browser exposure
- test transactional email sent to Gmail/iCloud/Outlook where possible
- idempotency retry does not duplicate a transactional email
- webhook signature verification succeeds with raw body
- webhook duplicate handling tested with replay
- bounce or test failure path recorded
- contact created/updated with expected properties
- Topic/unsubscribe behavior tested for Broadcasts/Automations
- Automation trigger and run status checked
- Inbound webhook tested if receiving is enabled
- privacy/terms/vendor inventory updated
- subject/preview/body copy for each template passes the `no-slop-writing.md` self-check (§6) in the project's brand voice
