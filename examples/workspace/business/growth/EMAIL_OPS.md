# Email Ops

Status: partial until Resend domain, SPF, DKIM, DMARC, unsubscribe, and test-send evidence are recorded.

---

## Definition of Good

### PRESENT — lane can be partial

All three artifacts must exist before the email lane leaves draft:

1. **Sender map** — every from-address, reply-to, subdomain, purpose, owner, and unsubscribe classification documented in the table below.
2. **Sending domain** — the subdomain used for production sends recorded (e.g. `mail.example.com`). `resend.dev` is not acceptable for production.
3. **Template inventory** — each email has a named template file or hosted-template reference in the table below.

### PROVEN — hard errors when lane is done

The following evidence paths must exist on disk and be non-empty before the email lane can be marked `done`. Missing paths block launch.

| Proof artifact | Expected path (relative to repo root) | What it proves |
| --- | --- | --- |
| Domain verification screenshot or CLI output | `proof/email-domain-verified.*` | Resend dashboard shows the sending domain as Verified |
| SPF + DKIM pass headers | `proof/email-spf-dkim-pass.*` | MX Toolbox / Gmail header check showing SPF=pass, DKIM=pass for the sending domain |
| Successful test-send log | `proof/email-test-send-log.*` | At least one real transactional email delivered to an external inbox (Gmail, iCloud, or Outlook) recorded |
| Keys via Doppler, not raw .env | `SECRETS.md` — must contain `RESEND_API_KEY` and reference Doppler | API keys routed through Doppler; raw `.env` with Resend keys is a secrets violation |

Accepted artifact formats: `.png`, `.jpg`, `.json`, `.txt`, `.md`, or any non-empty file matching the glob. The check uses glob `proof/email-domain-verified*`, `proof/email-spf-dkim-pass*`, `proof/email-test-send-log*`.

### OPTIMIZED — warnings (taste stays human)

The following lifecycle automations are expected for a complete B2C launch. Each missing automation fires a warning; the founder can override by adding a `<!-- email-automation-override: <reason> -->` comment in this file or by marking the lane `not_needed`.

| Automation | Trigger event | Status |
| --- | --- | --- |
| Trial expiry reminder | `trial.expiring` (24h before) | <!-- TODO: set to done/skipped --> |
| Payment failure / billing recovery | `payment.failed` | <!-- TODO: set to done/skipped --> |
| Welcome / activation | `user.created` or first value event | <!-- TODO: set to done/skipped --> |
| Onboarding resume nudge | `onboarding.started` without `onboarding.completed` | <!-- TODO: set to done/skipped --> |
| Cancellation confirmation + optional win-back | `subscription.cancelled` | <!-- TODO: set to done/skipped --> |

Automation statuses are freeform. The validator scans for the string `done` or `skipped` next to each automation name. An automation row that still reads `TODO` triggers a warning.

---

## Brand Tokens

Production templates pull their design system from `DESIGN.md` — never hardcoded hex values. `business/growth/resend/email-templates.ts` documents the contract (`LaunchEmailDesignSystem`: colors, typography, radius, spacing, email layout). Record the mapping here before production sends; `check:email` flags a missing mapping.

| LaunchEmailDesignSystem field | DESIGN.md token | Value basis |
| --- | --- | --- |
| colors.accent / accentText | <!-- e.g. color.accent.primary --> | <!-- DESIGN.md section --> |
| typography.bodyFontFamily | <!-- e.g. font.body --> | <!-- DESIGN.md section --> |
| radius.card / radius.button | <!-- e.g. radius.md --> | <!-- DESIGN.md section --> |
| spacing.* / email.maxWidth | <!-- e.g. space scale --> | <!-- DESIGN.md section --> |

---

## Sender Map

| Email | Trigger | From address | Reply-to | Template | Unsubscribe required | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| welcome | account creation or first value event | <!-- e.g. hello@mail.example.com --> | <!-- e.g. support@example.com --> | resend/email-templates.ts `welcomeEmail` | no (transactional) | operations/PROVIDER_PROOF.md |

Add one row per email type. Mark unsubscribe as `yes (lifecycle)`, `yes (marketing)`, or `no (transactional)`.

---

## Domain / DNS Status

| Field | Value |
| --- | --- |
| Sending domain/subdomain | <!-- e.g. mail.example.com --> |
| Resend region | <!-- us-east-1 or eu-west-1 --> |
| SPF record | <!-- TXT value or "pending" --> |
| DKIM record | <!-- CNAME value or "pending" --> |
| Custom return path | <!-- subdomain or "default" --> |
| DMARC record | <!-- TXT value or "pending" --> |
| Domain verification status | <!-- Verified / Pending --> |
| Verification timestamp | <!-- ISO date --> |

---

## API Key Inventory

| Key name | Permission | Domain scope | Env var | Deploy target | Rotation date | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| production-transactional | sending_access | mail.example.com | RESEND_API_KEY | Doppler → Vercel/Workers | <!-- date --> | <!-- owner --> |

API keys must be server-only (never `NEXT_PUBLIC_*` or mobile plist). Store via Doppler; record location in `SECRETS.md`.

---

## Validation Log

Record each result here after running. All items must be checked before marking the lane `done`.

- [ ] Domain/subdomain verified in Resend — evidence at `proof/email-domain-verified.*`
- [ ] SPF and DKIM pass — evidence at `proof/email-spf-dkim-pass.*`
- [ ] DMARC record exists and policy is justified
- [ ] API key works in staging and production; no browser exposure
- [ ] Test transactional email sent to Gmail/iCloud/Outlook — log at `proof/email-test-send-log.*`
- [ ] Idempotency retry does not duplicate a transactional email
- [ ] Webhook signature verification succeeds with raw body
- [ ] Bounce/complaint path tested
- [ ] Topic/unsubscribe behavior tested for lifecycle automations
- [ ] Automation trigger and run status checked
- [ ] `trust/PRIVACY.md` and `trust/TERMS.md` updated with Resend as email processor
- [ ] `SECRETS.md` lists `RESEND_API_KEY` routed via Doppler
