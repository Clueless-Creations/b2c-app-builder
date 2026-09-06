# Privacy And Terms Pages

Use this before drafting or publishing privacy policy, terms of service, EULA, subscription terms, account deletion, privacy choices, App Store privacy answers, or Google Play Data safety answers.

This is a workflow, not legal advice. Agents may research, draft, implement pages, and prepare review packets. Founder/legal approval is required before publishing final legal terms or making material privacy promises.

When store submission is in scope, also load `store-console-workflow.md`. For Apple App Store listings, also load `app-store-listing-prep.md` and use `business/store/app-store-listing/app-privacy-questionnaire.html` or an equivalent interactive worksheet when the founder needs to review privacy answers. Privacy/terms work must produce the public pages and the console answers: Apple App Privacy data types, Google Play Data safety answers, account deletion URLs, reviewer access notes, and source evidence.

## Contents

- 1. Refresh Official Sources
- 2. Build The Data Inventory First
- 3. Privacy Policy Drafting Rules
- 4. Terms/EULA Drafting Rules
- 5. Public Pages And App Links
- 6. Review Packet
- 7. Legal & Privacy Risk Checklist

## 1. Refresh Official Sources

Always verify current requirements before drafting. Prefer official platform, regulator, and vendor docs.

Baseline sources to check:

- Apple App Privacy Details and App Store Connect EULA/custom license guidance for iOS.
- Google Play User Data and Data safety requirements for Android.
- Apple App Review Guideline 3.1.1, Google Play Payments policy, RevenueCat, Stripe, and tax/customer-portal docs when subscriptions, paid access, web checkout, or direct funnels exist.
- FTC privacy/security guidance for mobile apps, health/wellness data, children, subscriptions, advertising, and security.
- California CCPA/CPRA and CalOPPA guidance if the app serves U.S. consumers or California users.
- EU/EEA GDPR transparency guidance if the app is offered to EU/EEA users.
- Vendor docs for analytics, attribution, ads, AI providers, payment/subscription tooling, backend, email, crash reporting, and push notifications. For PostHog, refresh product analytics, web analytics, mobile SDK, anonymous vs identified events, persons/properties, feature flags/experiments, session replay privacy, surveys, and data pipeline docs when those features are used.

Record checked sources, dates, and URLs in `LEGAL_REVIEW.md`. Mirror store-specific sources and final console answers in `store/STORE_CONSOLE.md` when App Store Connect or Google Play Console submission is in scope.

## 2. Build The Data Inventory First

Do not draft from a template first. Inventory actual data flows from code and launch docs:

- Landing: email, referral code, IP/rate-limit signals, cookies/localStorage, UTM/referrer, analytics, A/B tests.
- App account: email, auth ID, profile, subscription entitlement, support IDs.
- User content: goals, notes, photos, journal entries, plans, messages, crew/social content.
- Device/platform data: push token, device ID, advertising ID, precise/coarse location, contacts, calendar, camera, microphone, HealthKit/Health Connect, files/photos.
- Backend: database tables, storage buckets, logs, edge functions, RPCs, retention jobs.
- Analytics and ads: events, PostHog person profiles, UTM/referrer/click IDs, self-reported attribution, session replay, heatmaps, surveys, feature flags, experiments, data pipelines/destinations, pixels, ad networks.
- Payments/subscriptions: RevenueCat/Stripe/Apple/Google identifiers, purchase history, refund status.
- AI: prompts, outputs, model provider, model-training settings, human review, logging/retention.
- Support/comms: email provider, CRM, feedback forms, transactional email, push providers.
- Security: audit logs, fraud prevention, abuse reports, rate limits.

For each data type, record:

- source surface
- purpose
- whether required or optional
- whether linked to identity
- whether shared with a vendor
- whether sold/shared for cross-context advertising
- retention period
- deletion path
- app-store disclosure mapping

## 3. Privacy Policy Drafting Rules

The policy must reflect actual practices, not aspirations. Include:

- effective date and last updated date
- legal/business entity, app/site names covered, and privacy contact
- what data is collected, grouped by user-understandable categories
- why each category is used
- vendors/processors and categories of recipients
- tracking, ads, analytics, attribution, and cross-app/site sharing
- AI processing and whether user content is used for model training
- subscriptions/payments and what Apple/Google/Stripe/RevenueCat process
- web checkout, web funnels, redemption links, billing portal/customer portal, tax collection, invoices/receipts, refunds, and subscription lifecycle emails when used
- Resend or other email-provider behavior: transactional email, lifecycle automations, broadcasts/newsletters, contacts/topics/segments, unsubscribe/preference handling, open/click tracking if enabled, inbound email and attachments if used, and retention/deletion behavior
- device permissions and just-in-time notices for sensitive/unexpected data
- retention and deletion, stated so it is clear that account/content deletion purges stored uploads (photos, files, media) in the object store alongside the database rows, not just a hidden flag
- account deletion and data request URL if accounts exist
- children/age posture
- health, biometrics, precise location, contacts, calendar, or other sensitive data sections when relevant
- user rights by jurisdiction where applicable
- security summary in plain language
- international transfers where applicable
- policy changes and contact

### Optional drafting benchmark

Complete the data inventory first. Then, agents may compare the draft with the [General Legal template collection](https://github.com/General-Legal/legal-templates). The collection uses CC0. It includes U.S. and GDPR-enhanced privacy policies, terms of use, cookie notices, and data-processing addenda.

Use the collection to check document structure and find possible clauses. Do not use it as current law or a complete product policy. Do not copy optional text unless the product implements the stated practice. Resolve every `<mark>` placeholder. Check the jurisdiction and each material clause against current official sources. The founder or counsel makes the final legal decision.

Platform must-haves:

- Apple requires a publicly accessible privacy policy URL and accurate App Privacy responses, including third-party partner practices.
- Google Play requires a privacy policy link in Play Console and in-app link/text; the policy must include developer/contact info, data accessed/collected/used/shared, parties shared with, secure handling, retention/deletion, and be active, public, non-geofenced, non-editable, and not a PDF.
- If accounts can be created, publish a web account-deletion path and explain retained data.
- Privacy, support, and data-deletion contact addresses must be route-tested before publishing. If using Cloudflare Email Routing, verify destination addresses, enable/connect Email Routing, configure required DNS records, and test from an external sender. Do not assume inbound forwarding also supports outbound send-as.

## 4. Terms/EULA Drafting Rules

Terms should match the product and payment behavior. Include:

- effective date, contracting entity, and contact
- who may use the service and age restrictions
- account responsibilities and acceptable use
- license to use the app/service
- user content ownership, permissions, and removal/moderation if user content exists
- AI-generated content/coaching disclaimers if AI is used
- professional-advice disclaimers for health, wellness, financial, legal, education, or productivity coaching claims where relevant
- subscription, trial, renewal, cancellation, refund, and price-change terms
- platform billing terms: Apple/Google manage in-app purchases when used
- intellectual property and feedback
- third-party services
- privacy-policy cross-reference
- warranty disclaimer, limitation of liability, indemnity, termination, changes, governing law, dispute resolution, and severability

Apple-specific:

- Decide whether Apple's standard EULA is enough or a custom EULA/terms is needed.
- If using a custom EULA in App Store Connect, keep it plain text and ensure it meets Apple's minimum terms.

Subscription-specific:

- Paywall, App Store/Play listing, terms, and in-app subscription management copy must agree on price, trial length, renewal cadence, cancellation, and what happens after cancellation.
- Do not bury trial-to-paid conversion or cancellation mechanics only in terms.
- Cancellation must be self-service and at least as easy as signing up — in-app or through the same platform (App Store, Google Play, or the account settings a subscriber already has access to) and never gated behind contacting support, a phone call, or a retention flow. This is the FTC "click to cancel" rule; several states mirror it.
- Auto-renewal disclosure states the renewal cadence and price and commits to sending a renewal-reminder notice before the charge for any trial or renewal term state auto-renewal law covers (commonly annual-or-longer terms; California and several other states require advance notice). Do not disclose auto-renewal only in terms and skip the reminder commitment.
- Web checkout/funnel pages must disclose the billing provider, renewal price, cancellation path, refund/support contact, and whether access is redeemed in app through RevenueCat or another entitlement system.

## 5. Public Pages And App Links

For launch funnels and apps, create URLs that are stable before store submission:

- `/privacy` - privacy policy
- `/terms` - terms of service or terms of use
- `/privacy/choices` or `/data` - rights, privacy choices, and account/data deletion when applicable
- `/delete-account` - direct account deletion instructions or request form when app accounts exist

Verification:

- pages return HTTP 200 on canonical domain
- linked in footer, app settings, onboarding/paywall where relevant, App Store Connect, Play Console
- contact emails listed on the pages receive mail and have an owner — before writing any `@yourdomain.com` address into copy, run `dig MX yourdomain.com +short` to confirm MX records exist; if none, use a tested fallback and open a `legal-contact-email-mx-unverified` failure card (see `knowledge/growth/geo-seo.md` section 4a)
- readable on mobile
- not blocked by robots/auth/geofencing
- not a PDF for Google Play privacy policy
- app-store labels/data safety answers match the pages

## 6. Review Packet

Before publishing final legal pages, produce `LEGAL_REVIEW.md` with:

- official sources checked
- data inventory table
- vendors and SDKs
- draft page paths
- app-store disclosure mapping
- App Store Connect App Privacy and Google Play Data safety answer mapping, with click paths and field values when submission is in scope
- interactive App Privacy questionnaire path and unanswered/manual-review items when Apple listing prep is in scope
- subscription and refund terms
- account deletion flow
- known uncertainty and legal questions
- approval checkbox for founder/counsel

Never mark legal pages final without approval. If the founder wants a fast pre-launch page, label it as a draft pending counsel review in internal docs, but do not put that disclaimer on the public policy unless counsel approves.

## 7. Legal & Privacy Risk Checklist

These are the concrete rejection and legal-exposure risks reviewers, app-store review, and regulators actually flag against consumer apps. Each has an owning artifact and, where it is mechanically checkable, a validator code. `check:privacy` enforces the checkable subset (rows 1, 2, 4, 5, 6, and — when the row's condition is in scope — 3, 8, 9, 10); everything else, including row 7, stays a judgment call owned by another audit pass so it is judged once, not twice.

| #   | Risk                                 | Requirement                                                                                                                                                                              | Owning artifact                                                               | Validator code                                                                               |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | No privacy policy                    | Publish `trust/PRIVACY.md` and `trust/TERMS.md` before launch                                                                                                                            | `trust/PRIVACY.md`, `trust/TERMS.md`                                          | `privacy.policy_missing`, `privacy.terms_missing`                                            |
| 2   | No "we collect user data" disclosure | State plainly, in a section a reader can find, what data is collected                                                                                                                    | `trust/PRIVACY.md`                                                            | `privacy.data_collection_disclosure_missing`                                                 |
| 3   | No AI mention in the privacy policy  | When the product generates content, disclose AI/model processing and whether user content trains a model                                                                                 | `trust/PRIVACY.md`                                                            | `privacy.ai_disclosure_missing`                                                              |
| 4   | No third-party data collectors named | Name vendor/processor/third-party categories and what they receive                                                                                                                       | `trust/PRIVACY.md`                                                            | `privacy.third_party_disclosure_missing`                                                     |
| 5   | Not deleting user uploads            | State the retention window, and that account/content deletion purges stored uploads, not just hides them                                                                                 | `trust/PRIVACY.md`; `engineering/TECH_SPEC.md` Data Contract retention column | `privacy.deletion_retention_missing`                                                         |
| 6   | Storage bucket set to public         | Every storage bucket is private by default, served through RLS/security rules or signed URLs — never a bare public-read bucket (see `backend-data-contract.md` §Anti-Patterns)           | `engineering/TECH_SPEC.md` Data Contract, `trust/SECURITY.md`                 | `privacy.public_storage_bucket`                                                              |
| 7   | Fake testimonials                    | Only real, sourced quotes with permission                                                                                                                                                | `product/experience/emotional-design/EMOTIONAL_DESIGN.md`                     | owned by `check:emotional-design` and `check:vibecoded-tells` (Tier 1) — not re-checked here |
| 8   | Cancellation harder than signup      | Cancellation is self-service and at least as easy as signup, per §4 above                                                                                                                | `trust/TERMS.md`                                                              | `privacy.cancellation_not_self_service`                                                      |
| 9   | Auto-renewal with no reminder        | Disclose auto-renewal terms and commit to a renewal-reminder notice before the charge, per §4 above                                                                                      | `trust/TERMS.md`                                                              | `privacy.auto_renewal_reminder_missing`                                                      |
| 10  | AI with no self-harm response        | A product with generative or conversational AI defines a self-harm/crisis detection and response path with a real crisis resource, not a generic refusal (see `generative-ai-safety.md`) | `trust/AI_SAFETY.md`                                                          | `privacy.self_harm_response_missing`                                                         |

Rows 8-9 apply only once the product sells a subscription (`lanes.revenue` in scope). Rows 3 and 10 apply only once the product generates text, images, audio, or video (`trust/AI_SAFETY.md` exists per `generative-ai-safety.md`).

Run the validator:

```bash
npm run check:privacy -- --root /path/to/app
```

`check:privacy` checks for the presence of each disclosure, not its legal correctness — pair a passing run with the founder/counsel review in `LEGAL_REVIEW.md` §6. A green gate is not legal sign-off.
