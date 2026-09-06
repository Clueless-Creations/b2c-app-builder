# Emotional Experience Measurement

Use this when instrumenting the four named emotional-experience cards (Commitment Card, Variable Reward Card, Perceived Effort Delay Card, Intent Mirroring Card) so that "emotional experience" produces falsifiable PostHog signal, not vibes. Load this alongside `analytics-attribution.md`, [`eleven-star-experience.md`](eleven-star-experience.md), and `onboarding-conversion.md`. Do NOT duplicate event names from `analytics-attribution.md` — extend them.

This file is the sole canonical source for the four cards' PostHog event names and properties. `consumer-product-design-agency.md` and `emotional-experience-design.md` point here rather than restate the event contract — if either ever appears to define `commitment_made` or the other card events differently, that is drift to fix here, not a second valid definition.

The goal: every emotional moment must be traceable from a named PostHog event → a behavioral metric it moves → a counter-metric that reveals misuse → an A/B test that isolates causation.

## Contents

- 1. Scope And Governance
- 2. Psychological Grounding
- 3. System-Level Measurement Layer
- 4. Commitment Card Measurement
- 5. Variable Reward Card Measurement
- 6. Perceived Effort Delay Card Measurement
- 7. Intent Mirroring Card Measurement
- 8. Cross-Card Dashboard
- 9. Dark-Pattern Detection Protocol
- 10. Ethics Guardrails And Compliance Veto
- 11. Implementation And QA Checklist
- 12. Failure Card Shape

## 1. Scope And Governance

Scope and the bright/dark boundary for every card are defined in
[`ethics-guardrail.md`](./ethics-guardrail.md) §1 Bright-Line Vs Dark-Line Distinction. That section
includes the card-by-card bright/dark examples. This section measures the instrumentation; what is
permitted is decided there.

## 2. Psychological Grounding

The academic grounding is not restated here. Two places already carry it, and a third copy is
how citations drift:

- the Tier 1–5 knowledge ladder, each tier paired with its failure mode, in
  [`emotional-design-system.md`](./emotional-design-system.md) §Knowledge Hierarchy
- the per-card psychological basis — the specific studies behind each mechanic — at the head of
  each card in [`experience-cards/`](./experience-cards.md)

This file measures whether those mechanics are working in a running app. It does not re-argue
why they work.

## 3. System-Level Measurement Layer

### 3a. System Events

These events fire once per emotional-card firing and are additional to the base catalog in `analytics-attribution.md`.

| Event                    | Trigger                                                                                        | Required Properties                                                                                                                                                                                        | Privacy Note           |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `emotion_card_fired`     | Any of the four cards activates                                                                | `card_id` (one of: `commitment`, `variable_reward`, `perceived_effort_delay`, `intent_mirroring`), `surface`, `screen_id`, `flow_id`, `step_id`, `variant_id`, `session_id`, `user_has_prior_value` (bool) | No user-content fields |
| `emotion_card_completed` | User advances past the card's moment without rage-tap or abandon                               | Same as `emotion_card_fired` plus `completion_latency_ms`                                                                                                                                                  | None                   |
| `emotion_card_abandoned` | User exits the flow during or immediately after the card fires                                 | Same plus `abandon_reason` (timeout / back / close / rage_tap), `rage_tap_detected` (bool)                                                                                                                 | None                   |
| `emotion_card_opt_out`   | User explicitly disables an emotional feature (e.g. turns off streaks, disables notifications) | `card_id`, `opt_out_surface`, `opt_out_reason_shown` (bool)                                                                                                                                                | None                   |

### 3b. System-Level North-Star Metrics

| Metric                                                   | Direction | Threshold To Investigate |
| -------------------------------------------------------- | --------- | ------------------------ |
| Activation rate (first core action)                      | Up        |                          |
| D1 / D7 / D30 retention                                  | Up        |                          |
| Paywall conversion rate                                  | Up        |                          |
| App Review prompt acceptance rate                        | Up        |                          |
| `emotion_card_abandoned` rate per card                   | Down      | > 15 % per card → review |
| Rage-tap rate during card moments                        | Down      | > 3 % → immediate review |
| Notification disable rate (7-day cohort)                 | Down      | > 20 % → review          |
| Uninstall rate (D3 cohort)                               | Down      |                          |
| Refund/cancel rate (D7 cohort)                           | Down      |                          |
| Negative review rate ("addictive" / "manipulative" text) | Down      | Any mention → triage     |

### 3c. System-Level A/B Experiment Template

Use a PostHog feature flag named `exp_emotion_system_<app_slug>_<YYYYMM>`. Expose flag at first `app_opened` event. Track `emotion_card_fired` as exposure event. Primary metric: `activation_task_completed`. Counter-metric: `emotion_card_abandoned` with `rage_tap_detected = true`.

Minimum detectable effect: 5 % relative lift on activation before claiming a card works.

---

## 4. Commitment Card Measurement

### Psychological Basis

Robert Cialdini commitment and consistency. Nir Eyal Hook Model Investment phase. BJ Fogg B=MAP (prior micro-commitment raises motivation for the next action). Goal-gradient effect (Kivetz, Urminsky, Zheng): once a user has made even a small commitment, framing future actions as continuation rather than new effort increases completion.

### What The Card Does

A micro-choice or micro-investment moment that the app visibly acknowledges. The user names a goal, picks a preference, sets a first parameter, or completes a tiny first step — and the app echoes it back prominently before asking for payment or sustained effort. The key mechanic: the user's own words and choices appear in the UI, creating consistency pressure.

### (a) PostHog Events

| Event                       | When It Fires                                                                                                                 | Required Properties                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commitment_card_initiated` | User is shown the commitment-capture UI (goal-setting, first-choice, pledge, or onboarding answer that will be mirrored back) | `commitment_type` (`goal` / `preference` / `pledge` / `first_action`), `surface`, `flow_id`, `step_id`, `variant_id`                                                   |
| `commitment_made`           | User submits their commitment input (typed goal, selected option, completed micro-step)                                       | Same as above plus `commitment_input_type` (`text` / `selection` / `action`), `commitment_length_chars` (for text; no raw text), `has_prior_session_commitment` (bool) |
| `commitment_echo_shown`     | App displays the commitment back to the user (e.g. "Your goal: run 3x/week" on paywall or activation screen)                  | `commitment_type`, `echo_surface` (paywall / activation / dashboard / notification), `variant_id`                                                                      |
| `commitment_echo_engaged`   | User taps or interacts with the echoed commitment (expands, edits, shares)                                                    | Same as above plus `engagement_type`                                                                                                                                   |
| `commitment_reinforced`     | App surfaces the commitment again at a later session (streak screen, return notification body, lifecycle email subject)       | `commitment_type`, `session_number`, `days_since_capture`, `channel` (`push` / `in_app` / `email`)                                                                     |

### (b) Leading Behavioral Metrics

| Metric                                                     | How Commitment Card Should Move It                             | Funnel Step              |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------ |
| `onboarding_completed` rate                                | Up — commitment echo on the paywall gives a reason to continue | Onboarding → paywall     |
| `paywall_viewed` → `trial_started` or `purchase_completed` | Up — echo increases personal relevance of paywall offer        | Paywall conversion       |
| D1 retention                                               | Up — prior commitment creates fresh-start return motivation    | D1 return session        |
| `activation_task_completed`                                | Up — goal-gradient effect: user has "already started"          | First-session activation |
| Streak length (median days)                                | Up — reinforced commitment reduces streak abandonment          | Retention                |

Person property to set after `commitment_made`: `commitment_type`, `commitment_made_at`, `commitment_flow_id`. These properties allow cohort analysis: do users who captured a commitment retain better?

### (c) Counter-Metrics (Dark-Pattern Backfire Signals)

| Counter-Metric                                             | What It Reveals                                                                    | Threshold                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `commitment_card_abandoned` rate                           | Users bail when they see a commitment being extracted, not freely given            | > 20 % abandon during capture step → review copy/framing |
| `emotion_card_opt_out` where `card_id = commitment`        | Users actively turning off commitment features (e.g. "don't remind me of my goal") | > 10 % of activated users                                |
| Negative review text containing "guilt" / "nag" / "shame"  | Commitment reinforcement perceived as manipulation                                 | Any cluster → design review                              |
| Cancel/refund event within 24 h of `commitment_echo_shown` | Echo felt like a lock-in trap                                                      | Spike > baseline → review                                |
| `rage_tap_detected = true` during `commitment_echo_shown`  | User frustrated by the echo surface                                                | > 2 %                                                    |

### (d) A/B Experiment Design

**Flag key**: `exp_commitment_echo_<app_slug>_<YYYYMM>`

| Variant                      | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `control`                    | Standard onboarding and paywall — no explicit commitment capture or echo |
| `commitment_echo_paywall`    | Commitment captured in onboarding; echoed on paywall screen before price |
| `commitment_echo_activation` | Commitment captured; echoed on first activation task screen, not paywall |

**Exposure event**: `commitment_card_initiated`

**Primary metric**: `trial_started` or `purchase_completed` within the session

**Secondary metric**: D7 retention cohort

**Counter-metric**: `emotion_card_abandoned` with `abandon_reason = rage_tap` during or within 60 s of `commitment_echo_shown`

**Guardrail**: If counter-metric exceeds 3 % OR negative review cluster appears within 14 days, halt experiment, flag the `experience-card-dark-pattern` failure card, and require a design review before re-enabling.

---

## 5. Variable Reward Card Measurement

### Psychological Basis

B.F. Skinner variable-ratio reinforcement. Wolfram Schultz dopamine reward-prediction-error (1997): the dopamine response peaks at the _anticipation_ signal, not the delivery. Nir Eyal Hook Model Variable Reward phase: rewards of tribe (social recognition), hunt (resources, content), and self (mastery, progress). Kent Berridge wanting-vs-liking: the card must produce genuine liking, not just wanting — maximizing wanting alone while suppressing liking is a compliance veto.

### What The Card Does

A moment of deliberate anticipation before a reward is revealed. The user takes a triggering action, then there is a brief designed uncertainty window (visual suspense, "unlocking" animation, "processing your results") before the reward appears. The reward itself varies in magnitude or form on a genuine, not manufactured, variable schedule.

### (a) PostHog Events

| Event                                  | When It Fires                                                                                                                   | Required Properties                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variable_reward_trigger`              | User takes the action that initiates the variable-reward loop (e.g. completes a session, submits content, finishes a challenge) | `reward_pool_id` (which pool of possible rewards), `trigger_action`, `surface`, `flow_id`, `variant_id`                                                                                                               |
| `variable_reward_anticipation_started` | Anticipation UI begins (countdown, animation, "calculating," "unlocking")                                                       | `anticipation_duration_ms` (target), `animation_type`, `reduce_motion_active` (bool)                                                                                                                                  |
| `variable_reward_revealed`             | Reward is shown to user                                                                                                         | `reward_type` (tribal / hunt / self / streak / badge / content / discount / feature_unlock), `reward_rarity` (`common` / `uncommon` / `rare`), `anticipation_actual_duration_ms`, `is_reduced_motion_fallback` (bool) |
| `variable_reward_engaged`              | User taps, shares, or further interacts with the reward                                                                         | `reward_type`, `engagement_action` (`shared` / `saved` / `viewed` / `dismissed`)                                                                                                                                      |
| `variable_reward_dismissed`            | User closes or skips the reward without engagement                                                                              | `reward_type`, `time_to_dismiss_ms`                                                                                                                                                                                   |
| `variable_reward_opt_out`              | User turns off reward animations or reward notifications                                                                        | `opt_out_channel` (`animation` / `notification` / `feature`)                                                                                                                                                          |

### (b) Leading Behavioral Metrics

| Metric                                                | How Variable Reward Card Should Move It                      | Notes                                            |
| ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| D1 / D7 return rate                                   | Up — anticipation creates a "what will I get tomorrow?" pull | Schultz: anticipation primes next-session return |
| `core_action_completed` frequency (sessions per week) | Up — variable schedule drives more triggering actions        | Skinner variable-ratio                           |
| Share rate (`share_completed`)                        | Up — reward-of-tribe payoffs create social sharing           | Eyal tribe reward                                |
| `activation_task_completed` in first session          | Up — first reward reveal in onboarding raises activation     |                                                  |
| Streak length (median)                                | Up — streak itself is a variable-reward delivery channel     |                                                  |

Person property to set: `last_reward_type_received`, `reward_reveals_total`, `highest_reward_rarity_seen`. These allow personalization: adjust reward pool composition for users who have plateaued.

### (c) Counter-Metrics (Dark-Pattern Backfire Signals)

| Counter-Metric                                                                       | What It Reveals                                                                                               | Threshold                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `variable_reward_opt_out` rate                                                       | Users actively suppressing the mechanic                                                                       | > 15 % → review mechanic design                  |
| `variable_reward_dismissed` with `time_to_dismiss_ms < 500`                          | Reward felt like an interruption, not a moment                                                                | > 25 % dismissals under 0.5 s → reduce intrusion |
| Uninstall rate cohorted on `reward_reveals_total = 0` vs. high-reveal users          | If uninstall is highest in zero-reveal cohort → OK; if highest in high-reveal cohort → mechanic driving churn |                                                  |
| `notification_disabled` event within 48 h of first reward notification               | Push notification felt like an extraction, not an invitation                                                  | > 25 %                                           |
| Negative review text: "addictive" / "gambling" / "slot machine"                      | Variability perceived as extraction                                                                           | Any cluster → design review                      |
| `rage_tap_detected = true` during anticipation window                                | Anticipation phase too long or deceptive                                                                      | > 2 %                                            |
| Refund/cancel within 24 h of `variable_reward_revealed` where `reward_rarity = rare` | User felt rare reward gated real value, not extra value                                                       | Spike → review                                   |

### (d) A/B Experiment Design

**Flag key**: `exp_variable_reward_<app_slug>_<YYYYMM>`

| Variant         | Description                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `control`       | Fixed, predictable reward on every triggering action                                               |
| `variable_low`  | Variable reward with a narrow range (2 tiers: common / uncommon)                                   |
| `variable_full` | Variable reward with a wide range (3 tiers: common / uncommon / rare), with anticipation animation |

**Exposure event**: `variable_reward_trigger`

**Primary metric**: `core_action_completed` rate over next 7 days (session frequency)

**Secondary metric**: D7 retention, share rate

**Counter-metric**: `variable_reward_opt_out` rate AND `notification_disabled` rate in the 48 h cohort

**Guardrail**: If opt-out rate in `variable_full` exceeds `variable_low` by more than 10 percentage points, OR if "slot machine" / "addictive" appears in App Store reviews within 14 days, halt the experiment and file `experience-card-dark-pattern`.

---

## 6. Perceived Effort Delay Card Measurement

### Psychological Basis

Ryan Buell and Michael Norton, "The Labor Illusion," _Management Science_ (2011): users value results more — and rate service quality higher — when they can observe effort. Norton, Mochon, and Ariely IKEA effect (2012): participation in creation raises perceived value. Peter Gollwitzer implementation intentions: if the user sees the system working through _their specific inputs_, the result feels like it belongs to them. Attribution-uncertain: several 2019–2024 mobile UX studies show progress visibility reduces churn during AI-generation waits; exact authors not confirmed.

### What The Card Does

A visible, narrated processing moment that communicates _what the system is doing for this specific user_. Not a generic spinner — a personalized effort signal: "Analyzing your sleep patterns from last week…" "Building your plan based on your 3 goals…". The delay must reflect real computation (or real care in composition). Fake delays with no underlying computation are a dark-line violation.

### (a) PostHog Events

| Event                               | When It Fires                                                                       | Required Properties                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perceived_effort_started`          | Personalized processing UI begins                                                   | `surface`, `flow_id`, `step_id`, `computation_type` (`real_api_call` / `real_data_processing` / `ui_composition`), `user_inputs_referenced_count` (how many of the user's prior inputs are displayed), `target_duration_ms`, `variant_id` |
| `perceived_effort_step_shown`       | Each narration step ("Analyzing your pace…", "Calibrating intensity…") is displayed | `step_index`, `step_copy_key` (stable key, not raw copy), `inputs_personalized` (bool)                                                                                                                                                    |
| `perceived_effort_completed`        | Processing UI ends and result is revealed                                           | `actual_duration_ms`, `steps_shown`, `user_cancelled` (bool), `reduce_motion_active` (bool)                                                                                                                                               |
| `perceived_effort_cancelled`        | User cancels during the delay                                                       | `time_to_cancel_ms`, `step_at_cancel`                                                                                                                                                                                                     |
| `perceived_effort_result_engaged`   | User interacts with the revealed result (saves, shares, starts using)               | `result_type`, `time_to_first_engagement_ms`                                                                                                                                                                                              |
| `perceived_effort_result_dismissed` | User closes the result without engagement                                           | `time_to_dismiss_ms`                                                                                                                                                                                                                      |

### (b) Leading Behavioral Metrics

| Metric                                                 | How Perceived Effort Delay Should Move It                                     | Notes                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------- |
| `onboarding_completed` rate                            | Up — personalized plan reveal with visible effort reduces mid-onboarding drop | Labor Illusion                |
| `paywall_viewed` → `trial_started`                     | Up — user values the plan more when they watched it being built               | IKEA effect on plan valuation |
| `activation_task_completed` in first session           | Up — user is invested in the result the system built for them                 | Implementation intentions     |
| D7 retention                                           | Up — users return to "their plan" not "the plan"                              |                               |
| Paywall conversion on second visit (soft paywall apps) | Up — effort signal raises perceived cost of not subscribing                   |                               |

Person property to set: `plan_built_at`, `plan_inputs_count`, `plan_effort_steps_seen`. Allows cohort: users who saw more personalized effort steps vs. generic spinner.

### (c) Counter-Metrics (Dark-Pattern Backfire Signals)

| Counter-Metric                                                                                                                      | What It Reveals                                        | Threshold                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `perceived_effort_cancelled` rate                                                                                                   | Delay is too long or users sense it is fake            | > 10 % → reduce duration or add cancel affordance                         |
| `perceived_effort_result_dismissed` with `time_to_dismiss_ms < 1000`                                                                | Result did not feel worth the wait                     | > 20 % → review result quality and copy                                   |
| Rage-tap during `perceived_effort_started` or step transitions                                                                      | Animation / pacing causing frustration                 | > 2 %                                                                     |
| `refund_detected` or `subscription_cancelled` within 48 h of `perceived_effort_completed` where `computation_type = ui_composition` | User discovered delay was cosmetic, felt deceived      | Any spike → compliance review; may warrant removing that computation_type |
| Support contact (`support_contact_clicked`) cohorted to users whose `perceived_effort_actual_duration_ms > target + 3000`           | Real computation taking too long, users assume failure | > 5 % → add timeout fallback                                              |
| Negative review text: "fake" / "just a spinner" / "doesn't actually analyze"                                                        | Labor illusion perceived as manipulation               | Any cluster → design review                                               |

### (d) A/B Experiment Design

**Flag key**: `exp_perceived_effort_<app_slug>_<YYYYMM>`

| Variant                         | Description                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `control`                       | Generic loading spinner, no personalized narration                                          |
| `personalized_steps`            | Narrated steps that reference user's own inputs (e.g. their named goal, their answer count) |
| `personalized_steps_with_count` | Same as above plus a visible progress count or percentage                                   |

**Exposure event**: `perceived_effort_started`

**Primary metric**: `paywall_viewed` → `trial_started` or `purchase_completed` conversion within the same session

**Secondary metric**: `activation_task_completed` rate within first session

**Counter-metric**: `perceived_effort_cancelled` rate AND `perceived_effort_result_dismissed` (< 1 s) rate

**Guardrail**: If `computation_type = ui_composition` and cancel rate exceeds 10 % in any variant, halt, set computation_type to `real_api_call` only or reduce duration, file failure card.

---

## 7. Intent Mirroring Card Measurement

### Psychological Basis

Peter Gollwitzer implementation intentions (1999): making an intention explicit — "I will do X at time T in situation S" — dramatically increases follow-through vs. a vague goal. Daniel Kahneman and Barbara Fredrickson peak-end rule (1993): a well-designed moment of reflective pause becomes the emotional peak that the user remembers. Don Norman reflective design (_Emotional Design_, 2004): the reflective level of design creates meaning, self-image, and memory. Robert Cialdini commitment and consistency: an explicit stated intent increases behavioral follow-through. Goal-directed design (Alan Cooper): designing for user goals, not features, means pausing to surface what the user is _trying to accomplish_.

### What The Card Does

A deliberate, brief pause at a high-stakes moment (pre-purchase, first core action, goal milestone, return after absence) where the app reflects the user's stated intent back to them in the user's own language. The pause is not a barrier — it is a confirmation that turns a transactional click into a meaningful moment. Examples: "You said you want to sleep better. Starting your first sleep session now." / "You're about to commit to your 7-day plan. Ready?" The user can proceed, edit their intent, or step back — all three paths are valid.

### (a) PostHog Events

| Event                         | When It Fires                                                                   | Required Properties                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intent_mirror_shown`         | Intent mirroring UI is displayed                                                | `surface` (pre_purchase / pre_first_action / milestone / re_engagement), `intent_type` (user's intent category, not raw text), `intent_source` (`onboarding_answer` / `user_set_goal` / `prior_session_action`), `mirror_copy_key` (stable key), `variant_id` |
| `intent_mirror_continued`     | User taps the primary CTA (proceed, yes, start, commit)                         | `intent_type`, `time_to_confirm_ms`                                                                                                                                                                                                                           |
| `intent_mirror_edited`        | User taps "edit my goal" or equivalent to revise their intent before proceeding | `intent_type`, `edit_surface`                                                                                                                                                                                                                                 |
| `intent_mirror_dismissed`     | User closes without confirming (back / close / timeout)                         | `intent_type`, `dismiss_reason` (`back` / `close` / `timeout`), `time_to_dismiss_ms`                                                                                                                                                                          |
| `intent_mirror_re_engagement` | Intent mirror used for a return session after N-day absence                     | `days_absent`, `intent_type`, `session_number`                                                                                                                                                                                                                |

### (b) Leading Behavioral Metrics

| Metric                                                                                | How Intent Mirroring Should Move It                           | Notes                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `trial_started` or `purchase_completed` immediately after `intent_mirror_continued`   | Up — the mirror reframes purchase as "honoring my own intent" | Cialdini commitment                                   |
| `activation_task_completed` after first intent mirror                                 | Up — implementation intention created in-product              | Gollwitzer                                            |
| D7 / D30 retention for users who received a return-session mirror                     | Up — the pause creates a memorable peak                       | Kahneman peak-end                                     |
| Review prompt acceptance rate (`review_prompt_continued` / `review_prompt_requested`) | Up — if mirror fires just before the native review prompt     | Peak-end effect raises willingness to rate positively |
| `share_completed` rate for users who received a milestone mirror                      | Up — peak moment primes sharing                               |                                                       |

Person property to set: `intent_mirror_received_at`, `intent_mirror_count`, `intent_type_mirrored`. Allows cohort: users who received mirroring vs. not, and whether the intent type correlates with retention.

### (c) Counter-Metrics (Dark-Pattern Backfire Signals)

| Counter-Metric                                                                               | What It Reveals                                               | Threshold                                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `intent_mirror_dismissed` rate with `surface = pre_purchase`                                 | Mirror used as a purchase-pressure dark pattern; users resist | > 30 % dismiss → investigate if dismiss path is being suppressed                |
| `intent_mirror_dismissed` rate with `surface = re_engagement`                                | Return mirror feels like guilt-tripping, not a welcome back   | > 25 % → rewrite copy, make it warmer and lower-stakes                          |
| `emotion_card_opt_out` where `card_id = intent_mirroring`                                    | Users explicitly disabling intent-mirror moments              | > 10 % → mirror is intrusive                                                    |
| Rage-tap during `intent_mirror_shown`                                                        | Pause is blocking, not meaningful                             | > 3 % → shorten or make interaction lighter                                     |
| `subscription_cancelled` within 24 h of `intent_mirror_shown` where `surface = pre_purchase` | Mirror on the cancel path is perceived as guilt trap          | Any spike → remove from cancel/offboarding path; it belongs on value paths only |
| Negative review text: "manipulative" / "won't let me cancel" / "guilt"                       | Mirror used on exit paths, not value paths                    | Any cluster → immediate review                                                  |
| `paywall_dismissed` immediately after `intent_mirror_dismissed` (same session)               | Mirror is deterring purchase, not motivating it               | If > 50 % of mirror-dismissed users also dismiss paywall → mirror is backfiring |

### (d) A/B Experiment Design

**Flag key**: `exp_intent_mirror_<app_slug>_<YYYYMM>`

| Variant                  | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| `control`                | Standard pre-purchase or pre-activation screen with no intent echo          |
| `intent_mirror_generic`  | Mirror that shows a generic category statement ("Reach your fitness goals") |
| `intent_mirror_personal` | Mirror that uses the user's own language from their onboarding answer       |

**Exposure event**: `intent_mirror_shown`

**Primary metric**: `trial_started` or `purchase_completed` within the session (for `surface = pre_purchase`); `activation_task_completed` within the session (for `surface = pre_first_action`)

**Secondary metric**: D7 retention for the cohort

**Counter-metric**: `intent_mirror_dismissed` rate AND rage-tap rate during `intent_mirror_shown`

**Guardrail**: If `intent_mirror_personal` dismiss rate exceeds `control` baseline by more than 15 percentage points, the personal mirroring copy is backfiring. Halt, review copy, check that intent data is accurate (not stale or generic), re-run with corrected copy before re-enabling.

---

## 8. Cross-Card Dashboard

Create a PostHog dashboard named "Emotional Experience — Card Signals." Include the following insights:

| Insight Name                    | Type       | Definition                                                                                                                                                                                                 |
| ------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card Fire Rate By Surface       | Trend line | `emotion_card_fired` count, broken down by `card_id`, daily                                                                                                                                                |
| Card Completion vs. Abandon     | Funnel     | `emotion_card_fired` → `emotion_card_completed` / `emotion_card_abandoned`, broken down by `card_id`                                                                                                       |
| Rage-Tap Rate By Card           | Trend line | `emotion_card_abandoned` where `rage_tap_detected = true`, by `card_id`, weekly                                                                                                                            |
| Opt-Out Rate By Card            | Trend line | `emotion_card_opt_out` count / `emotion_card_fired` count, by `card_id`, weekly                                                                                                                            |
| Commitment → Paywall Conversion | Funnel     | `commitment_made` → `paywall_viewed` → `trial_started` or `purchase_completed`                                                                                                                             |
| Variable Reward → D7 Retention  | Retention  | Cohort by `variable_reward_trigger` (day 0), retention at D1/D3/D7                                                                                                                                         |
| Effort Delay → Activation       | Funnel     | `perceived_effort_completed` → `activation_task_completed` within 10 min                                                                                                                                   |
| Intent Mirror → Purchase        | Funnel     | `intent_mirror_shown` → `intent_mirror_continued` → `trial_started` or `purchase_completed`                                                                                                                |
| Dark-Pattern Watch              | Trend      | `emotion_card_abandoned` where `abandon_reason = rage_tap` + `notification_disabled` (48-h cohort) + `subscription_cancelled` within 24 h of any card fire. Weekly. Alert if any metric exceeds threshold. |

Dashboard description should state: "This dashboard is the audit surface. If any metric in Dark-Pattern Watch exceeds its threshold for two consecutive weeks, file `experience-card-dark-pattern` and pause the relevant card variant."

## 9. Dark-Pattern Detection Protocol

Run this protocol weekly while any emotional card experiment is active. Record results in `state/business-state.json` under `lanes.emotional_design.dark_pattern_watch`.

1. Pull the "Dark-Pattern Watch" dashboard for the past 7 days.
2. For each card, check all counter-metrics against their thresholds (Sections 4c, 5c, 6c, 7c).
3. Run an App Store review text scan for cluster terms: "addictive," "manipulative," "gambling," "guilt," "shame," "fake," "slot machine," "can't cancel," "won't let me," "trapped."
4. If any threshold is breached OR any text cluster appears with ≥ 3 reviews: open the `experience-card-dark-pattern` failure card (Section 12), pause the triggering experiment variant, notify the founder.
5. If all clear: record date and sign-off in `state/business-state.json`. Close any open watch cards.
6. If a card has been paused for ≥ 14 days with no resolution, escalate to a design review. Do not silently re-enable paused variants.

## 10. Ethics Guardrails And Compliance Veto

The guardrails and the compliance veto are [`ethics-guardrail.md`](./ethics-guardrail.md)
§1 Bright-Line Vs Dark-Line Distinction and §5 Guardrail Contract → Non-Negotiable Prohibitions. §9 above is the _detection_ protocol — what a dark pattern looks
like in telemetry; the prohibition itself, and the veto power, live in the guardrail file so
there is exactly one place a rule can be changed.

## 11. Implementation And QA Checklist

Add these checks to the standard analytics QA from `analytics-attribution.md`.

- All four card-level events (`emotion_card_fired`, `emotion_card_completed`, `emotion_card_abandoned`, `emotion_card_opt_out`) appear in PostHog activity on a test run of each card.
- `card_id` values are stable string constants defined in a typed enum or constant file — not inline strings.
- `reduce_motion_active` property is set correctly by reading OS-level reduce-motion preference before firing `variable_reward_anticipation_started` and `perceived_effort_started`. Verify the fallback animation (or no animation) renders when reduce-motion is on.
- Opt-out paths exist in the UI for each card where the user can disable the mechanic. Verify `emotion_card_opt_out` fires when used.
- No emotional card fires on error screens, payment failure screens, or cancel/unsubscribe flows. Verify with a code audit before any experiment is enabled.
- Each card's computation_type is documented and verified: Perceived Effort Delay steps reference only real computation or real UI composition, not arbitrary sleep timers.
- The "Dark-Pattern Watch" dashboard exists in PostHog before any card experiment goes live.
- A/B experiment flags are gated: control variant is always the safe baseline; no experiment ships without a counter-metric alert configured in PostHog.
- `state/business-state.json` `lanes.emotional_design` includes `status`, `evidence`, `active_experiments`, and `dark_pattern_watch.last_reviewed_at` fields.

Run:

```bash
npm run check:analytics -- --root .
```

Verify `emotion_card_fired` and at least one card-specific event appear in the event catalog section of `analytics/ANALYTICS.md`.

## 12. Failure Card Shape

Use this shape when a dark-pattern signal is detected. Store in `state/business-state.json` and mirror in `operations/FAILURE_CARDS.md` when the launch is large.

```yaml
id: "experience-card-dark-pattern"
severity: "critical"
owner: "product-lead"
status: "open"
detected_at: "YYYY-MM-DD"
evidence:
  - "PostHog dashboard: Emotional Experience — Card Signals"
  - "Counter-metric breached: <metric name> at <value> vs threshold <threshold>"
  - "App Store review cluster: <sample text if applicable>"
impact: "Emotional card variant is producing user resistance, perceived manipulation, or extraction behavior. Experiment paused. No re-enable until design review completes."
next_action: "Pause the triggering experiment variant. Notify founder. Conduct a design review against the bright-line rules in emotional-experience-measurement.md Section 1. Revise copy or mechanic, re-test in a controlled cohort before re-enabling."
validator: "npm run check:analytics -- --root . && PostHog dark-pattern-watch dashboard all-clear for 14 consecutive days"
```

Additionally, use this shape for a missing measurement layer:

```yaml
id: "experience-card-measurement-missing"
severity: "high"
owner: "engineering-leader"
status: "open"
detected_at: "YYYY-MM-DD"
evidence:
  - "emotion_card_fired event absent from PostHog activity"
impact: "Emotional card is live without instrumentation. Dark-pattern signals cannot be detected. Analytics audit produces no evidence."
next_action: "Implement all four system events (emotion_card_fired, emotion_card_completed, emotion_card_abandoned, emotion_card_opt_out) and at least the primary event for each active card before any experiment flag is enabled."
validator: "npm run check:analytics -- --root . shows emotion_card_fired in analytics/ANALYTICS.md event catalog"
```
