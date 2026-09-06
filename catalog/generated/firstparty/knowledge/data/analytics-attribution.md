# Analytics And Attribution Planning

For the selected provider's official setup and skill procedures, use [PostHog agent tooling](./posthog-agent-tooling.md).
The provider procedure does not replace this contract or grant authority.

Use this before PostHog setup, event catalogs, attribution, dashboards, campaign links, onboarding questions, paywall experiments, referral loops, web funnels, paid UA, Fastlane campaigns, or builder prompts that mention analytics.

Before marking this lane done, load [`provider-proof.md`](../process/provider-proof.md): provider-backed readiness needs live proof or a recorded founder-only decision in `operations/PROVIDER_PROOF.md`, never setup prose alone.

The goal is to give the founder a visible measurement plan before launch work hardens. Do not bolt analytics on after the landing page, onboarding, paywall, or store CTAs are already built.

Load `paid-user-acquisition.md` before paid ads, Apple Search Ads, Meta/TikTok/Google campaigns, paid creative tests, ad-network SDK choices, MMP decisions, or paid spend-readiness claims.

Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before replacing PostHog paid/account features, GA4/ad-network tooling, MMP tooling, RevenueCat experiments, ad-network account data, or Fastlane campaign analytics with a free/manual plan. Local event logs are not proof that analytics is live.

## Contents

- 1. Refresh Current PostHog Sources
- 2. Required Artifacts
- 3. Upfront Planning Workflow
- 4. Identity Model
- 5. Attribution Model
- 6. Event Catalog
- 7. Dashboards And Insights
- 8. Experiments, Flags, Replays, And Surveys
- 9. Privacy And Governance
- 10. Implementation And QA
- 11. Runtime Research Prompt

## 1. Refresh Current PostHog Sources

At runtime, refresh the current docs before locking implementation details. Prefer PostHog docs and official SDK docs over memory.

Minimum PostHog doc map:

- Product analytics overview: `https://posthog.com/docs/product-analytics`
- Product analytics installation: `https://posthog.com/docs/product-analytics/installation`
- Capturing events: `https://posthog.com/docs/product-analytics/capture-events`
- Complete event tracking guide: `https://posthog.com/tutorials/event-tracking-guide`
- Events: `https://posthog.com/docs/data/events`
- Persons: `https://posthog.com/docs/data/persons`
- Anonymous vs identified events: `https://posthog.com/docs/data/anonymous-vs-identified-events`
- Web analytics: `https://posthog.com/docs/web-analytics`
- Performance marketing and UTMs: `https://posthog.com/tutorials/performance-marketing`
- iOS SDK: `https://posthog.com/docs/libraries/ios`
- Android SDK: `https://posthog.com/docs/libraries/android`
- React Native SDK: `https://posthog.com/docs/libraries/react-native`
- Flutter SDK: `https://posthog.com/docs/libraries/flutter`
- Feature flags: `https://posthog.com/docs/feature-flags`
- Experiments: `https://posthog.com/docs/experiments`
- Session replay: `https://posthog.com/docs/session-replay`
- Session replay privacy: `https://posthog.com/docs/session-replay/privacy`
- Surveys: `https://posthog.com/docs/surveys`
- Data pipelines/CDP: `https://posthog.com/docs/cdp`

Also refresh:

- RevenueCat docs for subscription events, customer IDs, webhooks, experiments, Web Purchase Links, Web Funnels, and redemption links.
- RevenueCat growth guidance and `paid-user-acquisition.md` when paid UA needs LTV, cohort, CPA, blended-report, or baseline-uplift planning.
- Stripe docs when web checkout, Customer Portal, or Stripe Billing is in scope.
- Apple App Analytics, Apple Search Ads, App Store privacy, and SKAdNetwork/AdAttributionKit docs when iOS paid acquisition is in scope.
- Google Play Console analytics, Play Install Referrer, Data safety, and Google Ads/GA4 docs when Android paid acquisition is in scope.
- Resend docs when email lifecycle, broadcasts, or webhooks are in scope.
- Fastlane docs/API when social content campaigns need UTM/campaign measurement.

## 2. Required Artifacts

Create `analytics/ANALYTICS.md` before implementation or builder handoff.

Update `state/business-state.json` before calling analytics ready:

- lane status and evidence paths for `analytics_attribution`
- provider state for PostHog, RevenueCat, Stripe, Resend, Sentry, or ad/MMP tools when relevant
- current-doc basis for fast-moving analytics/provider setup
- attribution contract booleans, stable keys, event name, person properties, backend persistence, anonymous reconciliation, and verification status
- active failure cards for missing analytics, attribution, privacy, replay/survey, or dashboard proof

`analytics/ANALYTICS.md`'s required sections are defined once, canonically, in [`artifact-contracts.md`](../process/artifact-contracts.md) `analytics/ANALYTICS.md` — load that section rather than a second checklist here; a second copy is how the two lists drift on exactly the details that matter (event grouping, the identity-map fields).

Create `analytics/analytics-plan.html` or an analytics section in `design/design-room.html` early:

- show the acquisition-to-revenue journey as a visual map
- include copyable event tables grouped by surface
- render funnel cards for acquisition, onboarding, paywall, activation, retention, referral, email, and post-launch social
- show an attribution matrix with UTM/source/deep-link/self-report examples
- show dashboard wireframes or screenshot placeholders
- mark founder-only decisions and blocked credentials
- use `DESIGN.md` tokens when available; otherwise label it as provisional

After analytics status changes, report what is planned, connected, and still unverified.

## 3. Upfront Planning Workflow

1. Inventory surfaces before writing events: landing, app install/open, onboarding, paywall, subscription, web checkout, paid UA, referral/share, email, support, privacy/deletion, store CTAs, Fastlane/social campaigns, backend jobs, and admin tools.
2. Define the decision the founder must see upfront: what users are doing, where they came from, where they drop, what converts, what retains, what produces revenue, and which channel is worth repeating.
3. Choose the minimum analytics stack. Default to PostHog primary, RevenueCat for subscription truth, Stripe for web payment truth, Sentry for errors, and GA4/ad-network tooling only when paid ads or Google attribution require it.
4. Decide PostHog region and project grouping before setup. PostHog recommends grouping multiple customer-facing products such as marketing site, mobile app, and web app in one project when the goal is cross-surface journey analysis.
5. Write the identity and attribution model before event names. Do not let each surface invent its own user ID or source fields.
6. Draft the event catalog and dashboards, then map each event to the exact screen, server endpoint, webhook, provider callback, or email lifecycle hook that emits it.
7. Add privacy and store-disclosure notes while planning, not after implementation.
8. Render `analytics/analytics-plan.html` so the founder can inspect the tracking plan and understand launch learning before the build starts.

## 4. Identity Model

Default identity stance:

- Start anonymous on marketing pages and pre-auth app usage.
- Call `identify` as soon as a stable logged-in user ID exists.
- Use the same internal user ID across app, backend, RevenueCat, Stripe, support, and email where possible.
- Keep PostHog person profiles to `identified_only` unless the current docs and product privacy posture justify another mode.
- Call reset/logout behavior on shared devices so events do not bleed between users.
- Treat email as a property, not the primary distinct ID, unless the product has no better stable ID.

Map these IDs explicitly:

- `anonymous_distinct_id`
- `user_id` or auth UID
- `posthog_distinct_id`
- `revenuecat_app_user_id`
- `stripe_customer_id`
- `resend_contact_id` or email hash
- `referral_code`
- `device_platform`, `app_version`, `build_number`, `locale`, `country`, `storefront`
- optional: `installation_id`, `push_token_id`, `family_or_team_id`, `group_id`

For iOS extensions, widgets, app clips, or Android instant/deep-link flows, document whether the SDK can share identity across targets or whether the first event may be anonymous.

## 5. Attribution Model

Use both technical and self-reported attribution. Neither is enough alone.

Technical attribution:

- UTMs: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- Click IDs: `gclid`, `fbclid`, `msclkid`
- Referrer and landing URL
- Initial and latest source/campaign properties
- Deep link route and campaign payload
- App Store / Google Play source where available
- Referral code, invite code, creator code, vanity URL, QR code, or coupon code
- Fastlane/social post ID and content angle where links are generated

Self-reported attribution:

- Ask "How did you hear about us?" in onboarding or signup while memory is fresh.
- Include options for friend/referral, TikTok, Instagram, YouTube, X/Twitter, Reddit, search, App Store/Google Play search, creator/influencer, newsletter/email, article/blog, podcast, ad, and other/free text.
- Store a stable stored key as a first-touch user property and event property on `attribution_source_selected`.
- Keep source keys stable; display labels may change through aliases, but stored keys must not.
- Persist the source to the backend profile, account, waitlist, or Supabase profile record when identity exists.
- Reconcile anonymous attribution into the identified PostHog person and backend profile after signup/login.

Self-reported attribution data contract:

- Stored keys: use a typed enum or equivalent constants such as `friend`, `tiktok`, `instagram_reels`, `youtube`, `x_twitter`, `reddit_search`, `app_store_search`, `play_store_search`, `creator`, `podcast`, `ai_search`, `ad`, and `other`.
- Event: emit `attribution_source_selected` with `source_key`, `source_label`, `other_text_present`, `flow_id`, `step_id`, `initial_utm_source`, `initial_utm_medium`, `initial_utm_campaign`, `initial_referrer`, `referral_code`, `creator_code`, and deep-link/store context when available.
- PostHog person properties: set `self_reported_source`, `self_reported_source_label`, `self_reported_source_other_text_present`, and `self_reported_source_captured_at`. Store raw `self_reported_source_other` only when privacy docs allow it.
- Backend/profile fields: persist `self_reported_source`, `self_reported_source_label`, `self_reported_source_other`, `self_reported_source_captured_at`, and `self_reported_source_context` or the product's named equivalents.
- Verification: prove event delivery, person-property update, backend/profile write, and anonymous-to-identified stitching. Do not call attribution wired if it only updates local state or emits a one-off event.
- State: set `state/business-state.json` attribution contract fields to true only after each corresponding implementation/proof exists.

Campaign convention:

- `utm_source`: platform or partner, e.g. `tiktok`, `instagram`, `youtube`, `reddit`, `apple_search_ads`, `creator_<handle>`
- `utm_medium`: `organic_social`, `paid_social`, `search`, `email`, `referral`, `creator`, `store`, `qr`, `fastlane`
- `utm_campaign`: launch, product, market, and date, e.g. `launch_v1_2026_06`
- `utm_content`: hook, creative, post ID, screenshot concept, or Fastlane angle
- `utm_term`: search keyword or ASA/ad keyword when applicable

Store and mobile caveats:

- Do not promise perfect attribution from app install to purchase. App-store privacy rules, browser handoffs, SKAdNetwork/AdAttributionKit, Play Install Referrer, tracking blockers, and user behavior create gaps.
- Adopting an ad-network SDK to close that gap changes privacy disclosures and ATT posture — load [`privacy-terms.md`](../trust/privacy-terms.md) and [`store-console-workflow.md`](../store/store-console-workflow.md) before enabling one, not after.
- Use self-reported attribution to catch word-of-mouth, creator, social, and AI-search discovery that UTMs miss.
- Preserve campaign context from landing page to store CTA, deep link, waitlist, web checkout, and email where the platform allows it.

## 6. Event Catalog

Rules:

- Use snake_case event names in this skill, even though PostHog examples often show object-verb names with spaces.
- Emotion Card events: when the Emotional Experience System is in scope (see [`emotional-design-system.md`](../experience/emotional-design-system.md) and [`emotional-experience-measurement.md`](../experience/emotional-experience-measurement.md)), register the system-level envelope events `emotion_card_fired`, `emotion_card_completed`, `emotion_card_abandoned`, and `emotion_card_opt_out`, plus the per-card events (`commitment_made`, `variable_reward_revealed`, `perceived_effort_started`/`perceived_effort_completed`, `intent_mirror_shown`/`intent_mirror_continued`). Every card applied in `EMOTIONAL_DESIGN.md` must name one of these here before implementation, and the HIGH-risk counter-metrics feed a "Dark-Pattern Watch" insight (rage-tap abandons, opt-outs, sub-500ms dismissals, cancels within 24h of a card fire).
- Keep event names stable; change display labels in dashboards, not emitted names.
- Every event must have: owner, surface, trigger, required properties, optional properties, privacy note, QA method, dashboard usage.
- Prefer semantic events for key decisions and allow autocapture/web analytics for exploratory web behavior.
- Server-side events should cover purchase/webhook/account truth; client-side events should cover UI behavior and timing.

Minimum B2C launch events:

- Acquisition: `landing_page_viewed`, `pricing_section_viewed`, `app_store_cta_clicked`, `waitlist_joined`, `referral_link_created`, `referral_link_opened`, `referral_invite_started`, `referral_invite_completed`, `referral_unlock_earned`, `share_started`, `share_completed`, `web_checkout_started`
- Attribution: `campaign_context_received`, `deeplink_opened`, `attribution_source_selected`, `creator_code_applied`
- App: `app_opened`, `signup_started`, `signup_completed`, `login_completed`, `permission_prompt_viewed`, `permission_granted`
- Onboarding: `onboarding_started`, `onboarding_step_viewed`, `onboarding_answer_selected`, `demo_video_viewed`, `personalized_plan_viewed`, `onboarding_completed`
- Review: `review_prompt_eligible`, `review_prompt_requested`, `review_prompt_continued`
- Paywall/revenue: `paywall_viewed`, `paywall_dismissed`, `closing_offer_viewed`, `closing_offer_selected`, `trial_started`, `purchase_started`, `purchase_completed`, `purchase_failed`, `entitlement_active`, `restore_started`, `restore_succeeded`, `subscription_cancelled`, `refund_detected`
- Activation/retention: `activation_task_started`, `activation_task_completed`, `core_action_completed`, `share_started`, `share_completed`, `notification_opened`, `return_session_started`
- Email/lifecycle: `email_subscribed`, `email_sent`, `email_delivered`, `email_clicked`, `email_unsubscribed`, `lifecycle_message_triggered`
- Support/privacy: `support_contact_clicked`, `data_deletion_requested`, `privacy_choice_updated`
- Post-launch social: `viral_format_signal_detected`, `fastlane_content_generated`, `fastlane_content_approved`, `fastlane_content_scheduled`, `social_campaign_click_received`

Core properties:

- `platform`, `device_type`, `app_version`, `build_number`, `environment`, `locale`, `country`, `storefront`
- `surface`, `screen_id`, `step_id`, `flow_id`, `variant_id`, `feature_flag_key`, `experiment_key`
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `fbclid`, `msclkid`, `referrer`, `landing_url`
- `initial_utm_source`, `initial_utm_medium`, `initial_utm_campaign`, `initial_referrer`
- `self_reported_source`, `self_reported_source_label`, `self_reported_source_other_text_present`, `referral_code`, `creator_code`, `fastlane_post_id`, `content_angle`
- `offering_id`, `package_id`, `product_id`, `price_id`, `currency`, `trial_state`, `is_intro_offer`, `entitlement_id`
- `error_code`, `error_state`, `network_state`, `privacy_consent_state`

## 7. Dashboards And Insights

Create launch dashboards before public traffic:

- Founder launch control room: visitors, waitlist joins, store clicks, app opens, onboarding starts/completions, paywall views, purchases, revenue, activation, errors.
- Attribution dashboard: first/latest UTM, referrer, self-reported source, creator/referral codes, store CTA by channel, Fastlane post/angle performance.
- Onboarding funnel: app opened -> onboarding started -> each key step -> attribution answered -> plan/demo viewed -> paywall viewed -> purchase/trial/activation.
- Revenue dashboard: paywall conversion, trial starts, Day 0 cancellations, purchase failures, restore success, entitlement active, refund/dispute signals.
- Retention dashboard: D1/D3/D7 returns, core action retention, lifecycle chart, new/returning/resurrected/dormant users.
- Quality dashboard: errors/crashes from Sentry/store reports, support clicks, session replay volume, rage/friction signals where available.
- Email lifecycle dashboard: waitlist confirmations, welcome, onboarding resume, trial reminders, payment recovery, unsubscribes, clicks.

Each dashboard definition should state:

- exact events and filters
- date range
- breakdowns
- conversion window
- success threshold or "watch only"
- owner
- what action to take when it moves

## 8. Experiments, Flags, Replays, And Surveys

Plan experiments before build:

- onboarding order and question count
- mascot/demo video presence
- attribution question wording/options
- paywall timing, package mix, trial length, closing offer, and annual highlight
- landing headline, CTA, proof block, pricing block, referral prompt
- email lifecycle timing and subject lines

Use PostHog feature flags for safe rollouts, remote config, cohort targeting, and experiment assignment when the current docs and SDK support the target stack. Use RevenueCat experiments for paywall/offering tests when RevenueCat controls the paywall surface.

Session replay:

- Enable only with documented privacy controls, masking, sampling, and consent posture.
- Use replay to inspect failed funnels, onboarding confusion, paywall dismissals, support issues, and first-session activation.
- Do not record sensitive screens unless masking and policy coverage are verified.

Surveys:

- Use self-reported attribution early.
- Use PMF/NPS/CSAT or cancellation surveys only after enough usage context exists.
- Target surveys with cohorts or events so they do not interrupt the first value moment.

## 9. Privacy And Governance

Analytics planning must update `trust/PRIVACY.md`, `LEGAL_REVIEW.md`, and store console answers.

Document:

- analytics vendor, host/region, SDKs, and whether data is linked to identity
- event categories collected
- UTM/referrer/click IDs and self-reported attribution
- session replay, heatmaps, surveys, feature flags, and experiments
- retention/deletion behavior and user opt-out path
- whether advertising IDs, device identifiers, precise location, contacts, photos, health data, or sensitive content are collected
- whether events are sent to destinations, data warehouse, webhooks, Slack, CRM, email tools, or ad platforms

Rules:

- Do not capture raw user content, prompts, photos, messages, or health/sensitive data in analytics properties unless the product requires it and legal/privacy docs cover it.
- Prefer IDs, counts, categories, and derived states over raw content.
- Keep service keys server-side. PostHog project tokens are public/write-only only when the current docs say that is acceptable for the SDK surface.
- Explicitly document opt-out or consent behavior for web and app if the market or data type requires it.

## 10. Implementation And QA

Implementation rules:

- Use one analytics wrapper/module per surface.
- Capture client UI events in the client and source-of-truth events on the server/provider webhook.
- Initialize SDKs early enough for first events, but after consent/opt-out gates where required.
- Keep environment separation: development, staging/test, production.
- Do not emit test data into production unless labeled with `environment=test` and cleaned or filtered.
- Add typed constants or generated event helpers when the repo supports TypeScript, Swift, Kotlin, Dart, or React Native typing.

QA checklist:

- PostHog project reachable, correct host/region, and correct project token.
- At least one real event appears in PostHog activity or equivalent live view.
- `app_opened` or first app event fires on real device/simulator.
- Web pageview and waitlist/store CTA events fire from the production or preview URL.
- UTM/referrer/click ID properties persist from landing to conversion where possible.
- Self-reported attribution uses stable source keys, not display labels.
- Self-reported attribution event and person properties appear after onboarding/signup.
- Self-reported attribution persists to backend/profile storage when identity exists.
- `other` attribution captures sanitized free text or a documented follow-up value when selected.
- `identify` links anonymous and known user journey after signup/login.
- Logout/reset behavior prevents identity bleed.
- RevenueCat/Stripe/webhook events reconcile with entitlement events.
- Feature flag/experiment exposure events fire once per intended exposure.
- Session replay and surveys respect masking, sampling, and consent settings.
- Privacy/terms/store data disclosures match the actual SDK/event behavior.
- `npm run check:attribution -- --root .` or the installed-skill equivalent passes when onboarding/signup/waitlist attribution exists.
- `state/business-state.json` reflects analytics provider state, proof, and blockers.

## 11. Runtime Research Prompt

Before writing `analytics/ANALYTICS.md`, run a current-doc pass like:

```text
Research current PostHog docs for this app's stack and produce an analytics/attribution plan before launch. Cover product analytics installation, event capture, web analytics, mobile SDK setup, anonymous vs identified events, persons/properties, UTM/referrer/click ID attribution, feature flags, experiments, session replay privacy, surveys, and data pipelines. Map each doc finding to this app's landing, onboarding, paywall, subscription, email, referral, store CTA, and Fastlane/social campaigns. Output analytics/ANALYTICS.md plus analytics/analytics-plan.html with funnels, event catalog, identity model, attribution model, dashboards, privacy notes, and QA gates.
```

If the product repo already exists and is ready, use the installed `setup-posthog` skill for initial project setup and first-event validation after the plan is approved. If the repo does not exist, stop at the plan, event catalog, and builder prompts.
