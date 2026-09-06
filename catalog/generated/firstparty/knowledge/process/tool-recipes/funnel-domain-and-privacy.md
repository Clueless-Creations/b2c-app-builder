# Funnel, Domain, And Privacy Verification

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## Privacy And Terms Research

Use `privacy-terms.md` before drafting public policy pages or store disclosures. Always refresh official sources because privacy, subscription, and platform requirements change.

Minimum research set:

- Apple App Privacy Details and App Store Connect EULA guidance for iOS launches
- Google Play User Data and Data safety requirements for Android launches
- FTC privacy/security guidance, and COPPA guidance if children or teens may be involved
- California CCPA/CPRA and CalOPPA guidance when serving U.S. consumers
- EU GDPR transparency guidance when offering to EU/EEA users
- current subscription/negative-option rules when free trials, renewals, or recurring billing exist
- vendor docs for analytics, ads, AI, payments, crash reporting, backend, email, and push providers

Evidence to gather:

- SDK/package list
- app permissions and platform privacy manifests
- backend schema/tables/buckets
- analytics event catalog
- payment/subscription provider behavior
- AI provider data-use settings
- support/email tooling
- ad pixels and attribution tooling
- data retention/deletion implementation

Do not use generic legal-policy generators as source truth. They can help with wording only after the actual data inventory and official requirements are known.

## Cloudflare Email Routing

Use when a launch domain needs working inbound email aliases for support, privacy, security, press, or founder contact.

Important:

- Dashboard routing rules can appear active while the zone-level Email Routing status is still disabled or DNS records are not configured.
- Cloudflare Email Routing custom addresses are inbound forwarding addresses. Do not assume they can send outbound mail as the domain.
- Cloudflare requires destination address verification before a route can receive mail.
- A custom address should have one current destination rule unless a Worker handles multi-destination routing.

Setup:

- create or verify destination address
- create rules for `support@domain`, `privacy@domain`, and any `hello@domain`, `security@domain`, or founder alias
- click the Email Routing connect/enable flow and add the required `MX` and `TXT` records
- keep catch-all disabled/drop unless the founder explicitly wants a monitored catch-all
- send test emails from an external account and verify receipt
- record whether outbound send-as is covered by Gmail/Workspace, Cloudflare Email Service, Resend/Postmark/Mailgun, or another provider

Record:

- alias, destination, purpose, status, last test timestamp, and where the address is published
- DNS status and dashboard status
- outbound sending gap, if any

Founder gates:

- ask before deleting existing `MX` records or migrating mail providers
- ask before publishing a founder personal alias
- ask before enabling catch-all forwarding

## Landing Funnel Verification

Local:

- install dependencies
- run typecheck/lint/build
- run local dev server
- test desktop and mobile responsive views
- test waitlist form success and error states
- test referral URL preservation
- verify no secrets appear in public bundles

Deploy:

- deploy preview
- deploy production
- bind custom domain
- confirm cert/DNS status
- HTTP check preview and canonical domain
- verify security headers on `GET`
- verify `robots.txt`, `sitemap.xml`, `llms.txt`, schema, OG image
- verify the OG image shows current app stats, not stale hardcoded numbers
- generate the OG image at build time from live content counts when the stack supports it
- check for a stray static file at the OG-image path in the public folder
- a static file there can silently shadow a dynamic OG-image route
- submit a test signup against production or staging
- verify analytics events arrive
- remove or mark test data before public launch

Useful checks:

```bash
curl -I https://example.com
curl -s https://example.com/robots.txt
curl -s https://example.com/llms.txt
curl -s https://example.com/sitemap.xml
```

## Cloudflare/Supabase Waitlist Pattern

Use when the launch needs a simple, measurable waitlist and referral loop.

Pattern:

- browser posts email/referral/source to a server endpoint
- server rate-limits and validates input
- server calls a Supabase RPC or equivalent backend function
- database function creates/refetches waitlist row, generates referral code, increments referrer if valid
- frontend reveals share link and position
- leaderboard masks emails and never exposes PII

Security posture:

- RLS on
- direct table access denied to anonymous clients
- anonymous callers use narrow RPC functions only
- SECURITY DEFINER functions lock `search_path`
- extension functions schema-qualified
- service keys stay server-side only
- rate limits exist before public traffic

## Audit Prompt Pattern

For any public funnel, generate a reusable `AUDIT_PROMPT.md` with:

- what the site is supposed to do
- current live URLs
- stack
- brand rules
- specific audit dimensions and output format
- "do not recommend" constraints
- validation URLs/tools

The prompt is part of launch quality. It lets the founder send the site to another model or engineer for a focused review without re-explaining the business.
