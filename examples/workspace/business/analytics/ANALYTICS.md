# Analytics

Status: partial until live provider proof is recorded in `operations/PROVIDER_PROOF.md`.

## Definition of Good

This section defines what "done" means for the `analytics_attribution` lane across three enforcement layers. The validator `check:attribution` enforces PRESENT and PROVEN as hard errors; OPTIMIZED items fire as warnings (taste stays human).

### PRESENT — artifact exists

The following must exist before the attribution lane can advance past "partial":

- `analytics/ANALYTICS.md` created and non-empty.
- `analytics/analytics-plan.html` created and non-empty.
- `state/business-state.json` contains `lanes.analytics_attribution.attribution_contract` with all five boolean fields (`screen_early`, `other_free_text`, `backend_persistence`, `anonymous_reconciliation`, `verified`) set to `true`.
- `attribution_source_selected` (or a documented alias) appears in implementation code or docs outside `state/business-state.json`.
- `self_reported_source` appears in implementation code or docs.
- Stable source keys include at minimum: `friend`, `app_store_search`, `creator`, `ai_search`, `other`.
- `self_reported_source` is in `person_properties`.

### PROVEN — objective on-disk or live evidence the work happened

The following are hard errors when `analytics_attribution.status` is `"done"`:

- At least one evidence path beyond `analytics/ANALYTICS.md` and `analytics/analytics-plan.html` is listed under `lanes.analytics_attribution.evidence` in `state/business-state.json`. Planning docs alone are not proof.
- Evidence paths must be relative file paths (containing `/` or `.`), not bare words. A bare word such as `posthog` with no slash or extension fires a warning — it is treated as a probable copy-paste from a template comment.
- Every non-placeholder local evidence path listed there must exist on disk. A path like `analytics/posthog-proof.json` means the file is present in the repo.
- `operations/PROVIDER_PROOF.md` exists and contains a PostHog row with a non-placeholder evidence path. The `check:attribution` validator cross-checks the PostHog row's evidence path cell for placeholder text (`TODO`, `PLACEHOLDER`, `<…>`, `tbd`, etc.) and, when the path is local (not `https://…`), verifies it exists on disk.
- The PostHog row in `operations/PROVIDER_PROOF.md` must not simultaneously claim a verified/live status while still carrying a placeholder evidence path.
- **Remote URL bypass is NOT accepted.** If the PostHog evidence cell in `operations/PROVIDER_PROOF.md` is an `https://` URL, the static validator cannot fetch it and will fire a warning: `attribution.provider_proof_evidence_url_unverifiable`. The founder must either attest in-line (`founder-attested: YYYY-MM-DD`) or run the probe tool below to generate a local artifact instead.
- `analytics/posthog-proof.json` must exist, parse as valid JSON, carry the `"probe":"posthog@1"` fingerprint, record `event_count > 0`, and be no older than 72 hours. This file is produced by the founder-gated probe tool (see below). It must **not** be byte-identical to `analytics/posthog-proof.example.json` or below the 80-byte floor.

These checks also fire as warnings when the lane is `"partial"` and `attribution_contract.verified` is `true`, so placeholder drift is caught early.

Cross-lane gap: `check:attribution` is the single place that bridges the attribution boolean contract in `state/business-state.json` and the evidence ledger in `operations/PROVIDER_PROOF.md`. Both must agree before the lane can be marked done.

### FOUNDER-GATED PROBE — required before marking done

The static validator cannot verify live PostHog data — a human must run the probe with real credentials. This must happen **after** real user traffic has arrived (not during development with synthetic test events).

**Step 1 — Ensure credentials are in Doppler**

```
doppler secrets set POSTHOG_PERSONAL_API_KEY=phc_...   # personal API key from PostHog Project Settings
doppler secrets set POSTHOG_PROJECT_ID=12345  # numeric project ID from the PostHog URL
# Optional — only for self-hosted deployments:
doppler secrets set POSTHOG_HOST=https://posthog.your-domain.com
```

**Step 2 — Run the probe (founder or designated team member only)**

```
doppler run -- npm run probe:posthog -- --root /path/to/business-repo
```

The probe queries PostHog for the `attribution_source_selected` event (or the custom event recorded in `state/business-state.json`) and writes `analytics/posthog-proof.json` with non-secret facts only: event name, count, query window, HTTP status, API host, and ISO timestamp. No API key is written to disk.

**Step 3 — Commit `analytics/posthog-proof.json`**

Commit the generated artifact. The `check:attribution` validator will verify its shape, fingerprint, count (`> 0`), and freshness (no older than 72 hours at audit time).

**Step 4 — Update `operations/PROVIDER_PROOF.md`**

Change the PostHog row's evidence path cell from `analytics/posthog-proof.md` to `analytics/posthog-proof.json` and mark current status as `verified`.

**Security note:** The probe fingerprint `"probe":"posthog@1"` raises the bar versus hand-typed JSON but is not cryptographically unforgeable. Founder approval remains the ultimate backstop — only the founder who ran the probe can attest the count is real.

### OPTIMIZED — quality bar (warning only, taste stays human)

Record the following when optimizing attribution quality. These do not block launch but improve signal over time:

- Attribution dashboard in PostHog shows self-reported source breakdown with at least one full week of post-launch data.
- `other` free-text responses are reviewed and new source keys are added to the stable enum when a pattern emerges (e.g. a creator or community drives >5% of installs).
- Anonymous-to-identified stitching is verified in PostHog person timelines for at least five representative users.
- Backend/profile records for `self_reported_source` are exported and spot-checked after the first 100 signups.
- Attribution funnel (landing UTM → onboarding question → `attribution_source_selected` event → backend profile write) is documented in `analytics/ANALYTICS.md` with a verified percentage of users who complete each step.

### Validator issue codes

| Code                                                   | Layer   | Severity (done / partial)        |
| ------------------------------------------------------ | ------- | -------------------------------- |
| `attribution.verified_without_evidence_path`           | PROVEN  | error / warning                  |
| `attribution.evidence_path_bare_word`                  | TIER-1  | warning / warning                |
| `attribution.provider_proof_placeholder`               | PROVEN  | error / warning                  |
| `attribution.provider_proof_evidence_path_missing`     | PROVEN  | error / —                        |
| `attribution.provider_proof_evidence_url_unverifiable` | TIER-3  | warning / —                      |
| `attribution.provider_proof.file_missing`              | PROVEN  | error / warning                  |
| `attribution.provider_proof.posthog_row_missing`       | PROVEN  | error / warning                  |
| `attribution.posthog_proof.missing`                    | TIER-3  | error / —                        |
| `attribution.posthog_proof.example_copy`               | TIER-1  | error / —                        |
| `attribution.posthog_proof.too_small`                  | TIER-1  | error / —                        |
| `attribution.posthog_proof.invalid_json`               | TIER-3  | error / —                        |
| `attribution.posthog_proof.missing_fingerprint`        | TIER-3  | error / —                        |
| `attribution.posthog_proof.count_unknown`              | TIER-3  | error / —                        |
| `attribution.posthog_proof.count_zero`                 | TIER-3  | error / —                        |
| `attribution.posthog_proof.count_approximate`          | TIER-3  | warning / —                      |
| `attribution.posthog_proof.count_invalid`              | TIER-3  | error / —                        |
| `attribution.posthog_proof.missing_timestamp`          | TIER-3  | error / —                        |
| `attribution.posthog_proof.invalid_timestamp`          | TIER-3  | error / —                        |
| `attribution.posthog_proof.stale`                      | TIER-3  | error / —                        |
| `attribution.screen_early.incomplete`                  | PRESENT | error                            |
| `attribution.verified.incomplete`                      | PRESENT | error                            |
| `attribution.backend_persistence.incomplete`           | PRESENT | error                            |
| `attribution.anonymous_reconciliation.incomplete`      | PRESENT | error                            |
| `attribution.event_name.invalid`                       | PRESENT | error                            |
| `attribution.event_name.alias`                         | PRESENT | warning                          |
| `attribution.stable_key.*.missing`                     | PRESENT | error                            |
| `attribution.person_property.missing`                  | PRESENT | error                            |
| `attribution.text.*.not_found`                         | PRESENT | error (done) / warning (partial) |
| `attribution.hdyhau.missing`                           | PRESENT | error (done) / warning (partial) |

## HDYHAU Survey

Self-reported source is a bias check, not an MMP. Place the survey mid-onboarding. Randomize option order. Allow multi-select. Include TV / offline. Do not add `tv` as a stored stable key.

| Rule                   | Record                                                   |
| ---------------------- | -------------------------------------------------------- |
| Randomize option order | yes                                                      |
| Multi-select allowed   | yes                                                      |
| Include TV / offline   | yes                                                      |
| Placement              | mid-onboarding, not only the last screen                 |
| Blended ROAS           | growth/paid-ua-report.csv plus self-reported source      |
| MMP handoff            | AppsFlyer `$appsflyerId` when spend-ready; see issue 220 |

Graduate to AppsFlyer when paid UA is in scope and this sheet cannot explain spend.

## Event Contract

| Event                         | When                                                   | Properties                                        | Provider proof                             |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------ |
| attribution_source_selected   | early onboarding source screen                         | self_reported_source, self_reported_source_label  | PostHog event and person property evidence |
| cold_launch_viewed            | a paged cold-open (R14) with real page content mounts  | recipe_id, page_id                                | onboarding proof                           |
| review_prompt_eligible        | after first value is visible                           | first_value_id, surface                           | onboarding proof                           |
| review_prompt_requested       | native review API called                               | platform, surface                                 | onboarding proof                           |
| onboarding_started            | first onboarding screen mounts                         | flow_id, step_id                                  | onboarding proof                           |
| onboarding_step_viewed        | each onboarding step renders                           | flow_id, step_id                                  | onboarding proof                           |
| onboarding_answer_selected    | personalization question answered                      | question_id, answer_id                            | onboarding proof                           |
| personalized_plan_viewed      | first value / value-reveal screen                      | plan_id, surface                                  | onboarding proof                           |
| activation_task_completed     | first core action completed                            | task_id, surface                                  | onboarding proof                           |
| paywall_viewed                | paywall or offer screen renders                        | surface, offer_id, placement                      | revenue proof                              |
| purchase_completed            | purchase confirmed by store/provider                   | product_id, plan_duration, surface                | RevenueCat/Stripe webhook evidence         |
| entitlement_active            | entitlement granted/projected to backend               | entitlement_id, source                            | RevenueCat webhook/projection evidence     |
| referral_invite_started       | user opens the invite flow                             | surface, channel                                  | growth proof                               |
| referral_invite_completed     | invitee accepts/redeems                                | inviter_id_hash, channel                          | growth proof                               |
| referral_unlock_earned        | referral reward granted                                | reward_id, threshold                              | growth proof                               |
| share_started                 | share sheet/composer opened                            | surface, format                                   | growth proof                               |
| share_completed               | share confirmed by OS/platform callback                | surface, format                                   | growth proof                               |
| creator_code_applied          | creator/referral code redeemed                         | code_source, campaign                             | growth proof                               |
| viral_format_signal_detected  | a content format shows outlier traction                | format_id, platform                               | growth proof                               |
| billing_issue_detected        | RevenueCat billing-issue webhook received              | platform, store, grace_state, failure_reason      | revenue proof                              |
| billing_recovery_prompt_shown | in-app banner or push before the grace period ends     | platform, grace_state, surface                    | revenue proof                              |
| push_permission_primed        | soft-prime screen shown before the system dialog       | placement, session_number                         | push proof                                 |
| push_permission_granted       | system push dialog accepted                            | placement, session_number                         | push proof                                 |
| push_permission_denied        | system push dialog declined                            | placement, session_number                         | push proof                                 |
| push_sent                     | server-side dispatch of a lifecycle push               | trigger, campaign_id                              | push proof                                 |
| notification_opened           | user opened a push notification                        | trigger, campaign_id, surface                     | push proof                                 |
| notification_disabled         | pushes turned off in Settings or in-app                | source_surface                                    | push proof                                 |
| payment_method_update_started | user opens the update-payment path                     | platform, store                                   | revenue proof                              |
| billing_recovered             | failed renewal recovered inside grace/hold             | platform, store, days_in_grace                    | revenue proof                              |
| billing_issue_churned         | grace/hold lapsed without recovery                     | platform, store, failure_reason                   | revenue proof                              |
| cancellation_reason_selected  | reason picked in the in-app cancellation or pause flow | reason_code, plan_duration, surface               | revenue proof                              |
| subscription_paused           | user chooses pause instead of cancel                   | prior_plan_duration, surface                      | revenue proof                              |
| reactivation_offer_shown      | win-back offer rendered to a churned subscriber        | prior_plan_duration, days_since_churn, price_tier | revenue proof                              |
| reactivated                   | churned subscriber becomes active again                | prior_plan_duration, days_since_churn, price_tier | revenue proof                              |

Cross-doc rule: every event named in `product/ONBOARDING.md`, `EMOTIONAL_DESIGN.md`, `VIRAL_GROWTH.md`, or `revenue/REVENUE_OPS.md` must have a row here first — `check:analytics-catalog` reconciles them (warning while the analytics lane is partial, error at done).

## Emotion Card Events

Required when the Emotional Experience System is in scope (`EMOTIONAL_DESIGN.md`). Every card applied in the Card Application Map must name one of these events here before implementation; see `knowledge/experience/emotional-experience-measurement.md` for the full per-card catalog and counter-metrics. Do not invent new names — extend this table.

| Event                                                 | When                                       | Properties                                                                                 | Counter-metric role                        |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| emotion_card_fired                                    | any Experience Card activates              | card_id, surface, screen_id, flow_id, step_id, variant_id, session_id                      | system baseline                            |
| emotion_card_completed                                | user advances past the card moment         | + completion_latency_ms                                                                    | drop-off signal                            |
| emotion_card_abandoned                                | user exits during/just after a card fires  | + abandon_reason, rage_tap_detected                                                        | dark-pattern watch                         |
| emotion_card_opt_out                                  | user disables an emotional feature         | card_id, opt_out_surface, opt_out_reason_shown                                             | compulsion signal                          |
| commitment_made                                       | commitment captured                        | commitment_type, commitment_value, flow_id, step_id                                        | primary                                    |
| commitment_echoed                                     | the product reflects the commitment back   | commitment_type, surface                                                                   | reinforcement signal                       |
| peak_moment_reached                                   | the designed session peak fires            | surface, peak_type, session_id                                                             | peak-end proof                             |
| variable_reward_anticipation_started                  | anticipation moment begins before a reveal | surface, reward_type                                                                       | pairing proof for variable_reward_revealed |
| variable_reward_revealed                              | reward shown after anticipation            | surface, reward_type, reward_variant, anticipation_duration_ms, is_reduced_motion_fallback | primary + counter                          |
| perceived_effort_started / perceived_effort_completed | processing UI begins / ends                | surface, effort_type, step_count, computation_type, real_step_ratio                        | labor-illusion proof                       |
| intent_mirror_shown / intent_mirror_continued         | mirror pause displayed / user continues    | surface, mirror_type, source_field, trigger_context                                        | primary + conversion                       |

**Dark-Pattern Watch insight:** build a PostHog dashboard tile combining `emotion_card_abandoned` where `rage_tap_detected = true`, `emotion_card_opt_out` rate, sub-500ms reveal dismissals, `notification_disabled` (48h cohort), and `subscription_cancelled` within 24h of any card fire. Alert if any breaches its threshold for two consecutive weeks.
