# {{APP_NAME}} Emotional Design Contract

This artifact defines the emotional experience contract for {{APP_NAME}}: the intended feelings the product creates, the card mechanics that produce them, ethics attestation for each applied card, measurement events, and integration with the 11-star ladder.

**Use this when:** designing or reviewing any feature that touches emotional state — onboarding, first value reveal, paywall, return session, streaks, core loop completion. Complete before engineering handoff.

**Depends on:** `11_STAR_EXPERIENCE.md`, `product/ONBOARDING.md`, `analytics/ANALYTICS.md`, `DESIGN.md`.

---

## Applicability Of This Example

The populated card blocks illustrate one product that selected these mechanics. They are not a required bundle for every app, and the intended emotional ratings are hypotheses rather than observed user outcomes. Keep the cards that serve the accepted user job; remove unused example rows and blocks. Every retained card keeps its truth, exit, accessibility and measurement obligations.

For a product that needs zero cards, remove all applied `experience_card:` blocks and record one fenced YAML mapping named `experience_card_selection` in the design artifact. Set `status` to `not_applicable` and provide product-specific `user_job`, `rationale` and `alternative` text, each at least 30 characters without placeholders. The auditor independently records the same fields in the audit artifact. See `knowledge/experience/emotional-design-system.md` for the exact shape. Do not insert that zero-card marker alongside this populated example. A score or empty map cannot replace the decision.

## Emotional North Star

The one feeling {{APP_NAME}} exists to create:

- **Target feeling:**
- **When it fires:** (which moment in the core loop produces it)
- **Why a user retells it:** (the sentence a delighted user says to a friend — the word-of-mouth trigger)
- **11-star ladder level this represents:** (reference the 7-star or 11-star label in `11_STAR_EXPERIENCE.md`)
- **What makes it specific to {{APP_NAME}}, not a generic SaaS wrapper:** (per `knowledge/design/quality-lens.md`)

Emotional North Star must survive the quality-lens test: it must describe an emotion specific to this user's emotional job-to-be-done, not a generic category statement like "users feel happy."

---

## Target Emotional Journey

The intended emotional curve across the core loop. Each row is a moment in the experience; the curve should rise to a peak at or before the paywall and end on a high or a resolved neutral. A curve that first crosses positive territory after the paywall is a conversion design failure.

Valence scale: −5 (strong negative) → 0 (neutral) → +5 (strong positive). Mark each step with a label.

**Onboarding and first session:**

| Step ID | Screen / Moment                       | Starting Emotion   | Trigger                 | Interaction                           | Friction Note                               | Resolution                       | End Emotion           | Valence  | Peak / Valley |
| ------- | ------------------------------------- | ------------------ | ----------------------- | ------------------------------------- | ------------------------------------------- | -------------------------------- | --------------------- | -------- | ------------- |
| J-01    | App launch / promise screen           | Curious, skeptical | Visual promise          | Reads or watches demo                 | Generic-looking screens increase skepticism | Specific hook or demo            | Interested            | +1       | —             |
| J-02    | Attribution question                  | Neutral            | Question prompt         | Selects source                        | None if question is fast                    | Acknowledged                     | Neutral               | 0        | —             |
| J-03    | Personalization question(s)           | Curious            | Question prompts        | Answers questions                     | Fatigue if too many                         | Sense of being seen              | Engaged               | +2       | —             |
| J-04    | **Commitment Card fires**             | Engaged            | Goal-setting question   | Names goal or selects target          | None if framed as empowerment               | Commitment acknowledged visually | Ownership             | +3       | Peak          |
| J-05    | **Perceived Effort Delay Card fires** | Expectant          | Plan generation trigger | Watches personalized processing steps | Anxiety if no progress signal               | Plan appears; relief             | Valued                | +4       | Peak          |
| J-06    | First value / value-reveal            | Valued             | Result appears          | Reads, explores result                | Disappointment if generic                   | Genuine insight or result        | Delighted or relieved | +5       | Peak          |
| J-07    | **Intent Mirroring Card fires**       | Delighted          | Pause before paywall    | Reads their own words back            | Discomfort if tone is coercive              | Clarity of purpose               | Ready                 | +4       | —             |
| J-08    | Paywall                               | Ready              | Offer presentation      | Considers offer                       | Price resistance                            | Trial / purchase                 | Committed or deferred | +2 or −1 | —             |
| J-09    | Post-purchase / activation            | Committed          | Welcome back            | First real task                       | Complexity if unclear                       | First win                        | Confident             | +4       | Peak          |

**Return session (D1+):**

| Step ID | Screen / Moment                          | Starting Emotion     | Trigger                | Interaction             | Friction Note             | Resolution            | End Emotion     | Valence | Peak / Valley |
| ------- | ---------------------------------------- | -------------------- | ---------------------- | ----------------------- | ------------------------- | --------------------- | --------------- | ------- | ------------- |
| R-01    | Session open                             | Habituated or lapsed | App icon tap or push   | Opens app               | None if fast              | Welcome state         | Neutral or warm | +1      | —             |
| R-02    | **Intent Mirroring Card fires (return)** | Neutral              | Re-engagement trigger  | Sees their stated goal  | Annoyance if nagging tone | Recognition           | Recommitted     | +3      | Peak          |
| R-03    | Core loop action                         | Recommitted          | Task prompt            | Completes core action   | Complexity                | Completion            | Accomplished    | +4      | —             |
| R-04    | **Variable Reward Card fires**           | Accomplished         | Anticipation window    | Waits for result reveal | Impatience if too long    | Surprised or rewarded | Energized       | +5      | Peak          |
| R-05    | Session end                              | Energized            | Natural stopping point | Sees progress           | None                      | Progress visible      | Satisfied       | +3      | —             |

Replace placeholder rows with product-specific steps. The rendered Emotional Curve in `emotional-design.html` must be drawn from this table's valence column. The paywall marker must be placed at step J-08.

---

## Card Application Map

Each example row maps a product moment to a selected Experience Card, the emotional beat it is designed to produce, where the producer recipe lives, the PostHog event that measures it, the bright-line guardrail, and the reduced-motion fallback.

All four cards are required. Mark a card `deferred` only with a founder-approved rationale recorded through the reducer in `state/business-state.json lanes.emotional_design.deferred_cards`.

| Feature / Moment                         | Card Applied                     | Emotional Beat Intended                                                        | Producer Recipe Ref                                                                | Measurement Event                                                         | Bright-Line Guardrail                                                                                       | Reduced-Motion Fallback                                                                          |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Goal-setting question in onboarding      | Commitment Card                  | Ownership — user feels the product is now working toward their goal            | `knowledge/experience/emotional-experience-design.md §Commitment Card`             | `commitment_made`, `commitment_echoed`                                    | Commitment editable from Settings at any time; never used as cancellation friction                          | Soft fade on echo replaced with instant text highlight; no animation                             |
| Plan generation / personalization reveal | Perceived Effort Delay Card      | Valued — user believes the plan was crafted for them                           | `knowledge/experience/emotional-experience-design.md §Perceived Effort Delay Card` | `perceived_effort_started`, `perceived_effort_completed`                  | Every displayed step corresponds to real computation; step-to-operation map in `engineering/TECH_SPEC.md` | Static step list with no animation; progress count visible without motion                        |
| First result / value reveal              | Variable Reward Card             | Energized — the result varies and the anticipation makes the reveal meaningful | `knowledge/experience/emotional-experience-design.md §Variable Reward Card`        | `variable_reward_anticipation_started`, `variable_reward_revealed`        | Variation is genuine (content differs, not only framing); no spend prompt on same screen                    | Instant reveal with static badge; no anticipation animation; plain text summary always available |
| Pre-paywall pause                        | Intent Mirroring Card            | Ready — the user sees their own goal before the purchase ask                   | `knowledge/experience/emotional-experience-design.md §Intent Mirroring Card`       | `intent_mirror_shown`, `intent_mirror_continued`                          | Mirror uses only fields the user explicitly provided; not placed on cancel/downgrade path                   | Static text block fades in instantly; no deliberate slow-fade entrance                           |
| Return session after N-day absence       | Intent Mirroring Card (return)   | Recommitted — the product remembers them without nagging                       | `knowledge/experience/emotional-experience-design.md §Intent Mirroring Card`       | `intent_mirror_shown` (surface: re_engagement), `intent_mirror_continued` | Mirror copy is warm, not guilt-laden; user can dismiss without penalty                                      | Static welcome text; no transition animation                                                     |
| Core loop completion                     | Variable Reward Card (core loop) | Surprised / rewarded — the result quality varies across a positive range       | `knowledge/experience/emotional-experience-design.md §Variable Reward Card`        | `variable_reward_anticipation_started`, `variable_reward_revealed`        | No near-miss mechanics; escape hatch in Settings > Accessibility                                            | Static reveal; plain result text without reveal animation                                        |

Add product-specific rows below. Every row must have a populated Measurement Event — unmeasured moments are not in scope per `knowledge/data/analytics-attribution.md`.

---

## Ethics Attestation

One attestation block per applied card instance. Required before engineering handoff. These blocks are machine-checked by `check:emotional-design`. Fill every field; empty fields are validator errors.

Dark-line acknowledgements, guardrails, and user-control escape hatches must be product-specific — generic text copied from references without adaptation is insufficient.

See `knowledge/experience/ethics-guardrail.md §Guardrail Contract` for the full field specification and the three-question operational test (goal alignment, truthfulness, informed exit). All three must resolve YES.

---

### Commitment Card Attestation

```yaml
experience_card:
  id: "commitment-card-goal-setting"
  mechanism: "commitment"
  applied_to: "goal-setting question in onboarding, echoed on plan-reveal and paywall screens"
  star_level: "6-7"
  posthog_event: "commitment_made"
  bright_line: >
    The user explicitly names a goal or selects a target. {{APP_NAME}} reflects it back at the
    plan-reveal screen and on the paywall, making the offer feel personally relevant. The user
    owns their stated goal — the product is a vehicle for it. Three-question test: (1) goal
    alignment YES — the echo helps the user see how the offer connects to their stated goal;
    (2) truthfulness YES — only the user's actual words are reflected back; (3) informed exit
    YES — the user can dismiss the echo and still access the paywall and product.
  dark_line: >
    Would cross the bright line if: the commitment were used to add friction to cancellation
    ("You said you'd do this every day — are you sure you want to stop?"); if it manufactured
    false social proof ("10,000 people with your exact goal started today"); if it pre-ticked
    any subscription tier. None of these patterns are permitted.
  guardrail: >
    Commitment is editable from Settings > Profile at any time without a support ticket.
    The echo is informational only — it adds no friction to skip, dismiss, or decline the paywall.
    No confirmshaming copy on any opt-out path. Prefers-reduced-motion fallback: the echo appears
    as instant static text with no fade or slide entrance. Implementation verified in engineering/PRODUCTION_READINESS.md.
```

---

### Variable Reward Card Attestation

```yaml
experience_card:
  id: "variable-reward-card-value-reveal"
  mechanism: "variable_reward"
  applied_to: "first result reveal (onboarding) and core loop completion (return sessions)"
  star_level: "6-7"
  posthog_event: "variable_reward_revealed"
  bright_line: >
    The result that appears after the anticipation window is genuinely variable in content —
    different insight quality, different personalized finding, or a different aspect of the
    user's data is foregrounded depending on their inputs and prior actions. The user always
    knows the category of result they will see. Three-question test: (1) goal alignment YES —
    the result reveals progress toward the user's stated goal; (2) truthfulness YES — variation
    is real, not cosmetic label rotation over identical backend output; (3) informed exit YES —
    user can always dismiss the reward moment and access the rest of the app.
  dark_line: >
    Would cross the bright line if: near-miss mechanics were engineered (showing "almost rare"
    results to maintain engagement); if the anticipation animation were used to time a spend
    prompt (IAP or paywall) within 30 seconds of the reveal; if variability were cosmetic
    (same backend result, different emoji or color label); if the reward gated access to
    content the user had already earned. None of these patterns are permitted.
  guardrail: >
    No spend prompt on the same screen as the reward reveal, nor within 30 seconds of it.
    Reward variation is genuine: representative controlled inputs demonstrate the actual source of variation; deterministic
    outcomes are shown directly. The method and limitations are documented in engineering/PRODUCTION_READINESS.md. Prefers-reduced-motion fallback: instant
    plain-text result with no anticipation animation. Escape hatch: Settings > Accessibility >
    Disable animated reward reveals. Documented in engineering/TECH_SPEC.md.
  user_control_escape_hatch: >
    Settings > Accessibility > Disable animated reward reveals. Plain text result always
    available as the fallback. No feature or content is hidden behind the animation.
  ethics_attestation: >
    This card serves {{APP_NAME}}'s user goal of [product-specific domain improvement].
    The mechanic creates genuine anticipation of a result the user cares about — not of a
    prize the product manufactures. The three-question operational test passes. Bright-line
    classification: confirmed. Dark-pattern watch configured in PostHog before launch.
  counter_metric: >
    variable_reward_opt_out rate, sub-500ms dismissal rate of variable_reward_revealed,
    uninstall and notification_disabled within the 48h cohort, and any negative-review cluster
    matching "addictive" / "slot machine" / "gambling". Investigated weekly while the card is live.
  reward_variation_proof: >
    engineering/PRODUCTION_READINESS.md §Experience Cards records that the PostHog property reward_variant
    corresponds to actual content differences on representative controlled inputs. The source
    of variation and deterministic cases are documented. Cosmetic-only
    variation (same backend output, different label/colour) is rejected.
```

---

### Perceived Effort Delay Card Attestation

```yaml
experience_card:
  id: "perceived-effort-delay-plan-generation"
  mechanism: "perceived_effort_delay"
  applied_to: "plan generation / personalized result assembly after onboarding answers"
  star_level: "6-7"
  posthog_event: "perceived_effort_started"
  bright_line: >
    The displayed processing steps correspond to real computational operations: a data fetch,
    a model inference call, a sorting/filtering pass, or a real UI composition step that
    incorporates the user's answers. The user sees the system working on their specific inputs
    ("Building from your 3 goals…" reflects actual fields they provided). Three-question test:
    (1) goal alignment YES — truthful progress helps explain pending work; (2) truthfulness YES —
    steps correspond to real operations (all displayed steps mapped to real operations in engineering/TECH_SPEC.md);
    (3) informed exit YES — user can cancel the processing view and see the result in a simpler
    loading state.
  dark_line: >
    Would cross the bright line if: the displayed steps were cosmetic (random progress bar over
    a pre-rendered template); if the wait time were inflated beyond what real computation
    requires without any user-visible benefit; if the step copy referenced data the user did not
    provide. None of these patterns are permitted.
  guardrail: >
    Step-to-operation map documented in engineering/TECH_SPEC.md with every displayed step verified against an actual operation
    before ship. Select only the operations this product actually performs. No
    artificial sleep timers appended after computation completes. Cancel affordance available
    during processing. Prefers-reduced-motion fallback: static step list, no transition
    animation between steps.
  effort_truthfulness_attestation: >
    Computation steps documented in engineering/TECH_SPEC.md §Perceived Effort Delay. Real operation ratio
    is complete: every displayed step maps to a real operation. Step copy keys reference actual user-provided
    fields. Verified by engineering review before launch. Attestation evidence stored in
    engineering/PRODUCTION_READINESS.md §Experience Cards.
  computation_type: real_data_processing
  max_delay_ms: 12000
```

---

### Intent Mirroring Card Attestation

```yaml
experience_card:
  id: "intent-mirroring-pre-paywall"
  mechanism: "intent_mirroring"
  applied_to: "pause screen immediately before the paywall, and return-session re-engagement"
  star_level: "7"
  posthog_event: "intent_mirror_shown"
  bright_line: >
    The mirror pause reflects the user's actual typed goal or selected preference — verbatim
    or near-verbatim — back to them at a moment that serves their interest: before a purchase,
    before a core action, or at a return after absence. The pause confirms the user is about to
    do what they meant to do. Three-question test: (1) goal alignment YES — the pause creates
    clarity, not pressure; (2) truthfulness YES — only content the user explicitly provided is
    shown; (3) informed exit YES — the user can dismiss the mirror and proceed to the paywall,
    skip the paywall, or leave the app without friction.
  dark_line: >
    Would cross the bright line if: the mirror were placed on a cancel, downgrade, or
    unsubscribe flow to add friction; if the copy were confirmshaming ("Remember why you
    started — are you sure you want to quit?"); if the mirror manufactured emotional urgency
    the user did not express; if a paywall or hard CTA appeared on the same screen as the
    mirror. None of these patterns are permitted.
  guardrail: >
    Mirror content sources only from fields the user explicitly provided (onboarding answer
    selections, free-text goal, commitment value). No inferred or manufactured emotional states.
    Not placed on cancel, downgrade, or unsubscribe flows. No paywall CTA on the same screen.
    Tone reviewed against strategy/BRAND.md §Voice before ship. Trigger source and content source
    documented in engineering/PRODUCTION_READINESS.md §Experience Cards. Prefers-reduced-motion fallback:
    static text block appears instantly; no slow-fade entrance animation.
  prohibited_surfaces: >
    Never shown on cancel, downgrade, or unsubscribe flows; never on a screen that also carries a
    paywall or hard purchase CTA. A subscription_cancelled within 24h of intent_mirror_shown on any
    cancel-adjacent surface is an immediate removal trigger.
  free_text_sanitization: >
    Free-text goals are trimmed and truncated to a safe length, HTML/markup is stripped, and the
    output is rendered as plain text (never into a web view as raw HTML). Emoji and control
    characters are normalized before the mirror is displayed.
```

---

## Measurement Plan

### Emotional Moment Events

Add all events below to `analytics/ANALYTICS.md` before implementation. Do not invent names; use the stable catalog from `knowledge/experience/emotional-experience-design.md §Analytics Events` and `knowledge/experience/emotional-experience-measurement.md §System Events`.

| Event Name                             | Trigger                                           | Required Properties                                                                                         | Counter-Metric Role  |
| -------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| `emotion_card_fired`                   | Any card activates                                | `card_id`, `surface`, `screen_id`, `flow_id`, `step_id`, `variant_id`, `session_id`, `user_has_prior_value` | System baseline      |
| `emotion_card_completed`               | User advances past the card moment                | Same + `completion_latency_ms`                                                                              | Drop-off signal      |
| `emotion_card_abandoned`               | User exits during or immediately after card fires | Same + `abandon_reason`, `rage_tap_detected`                                                                | Dark-pattern watch   |
| `emotion_card_opt_out`                 | User disables an emotional feature                | `card_id`, `opt_out_surface`, `opt_out_reason_shown`                                                        | Compulsion signal    |
| `commitment_made`                      | Commitment captured                               | `commitment_type`, `commitment_value`, `flow_id`, `step_id`                                                 | Primary              |
| `commitment_echoed`                    | Echo appears on screen                            | `surface`, `commitment_type`, `commitment_value`                                                            | Resonance signal     |
| `variable_reward_anticipation_started` | Anticipation UI begins                            | `surface`, `reward_type`, `flow_id`, `reduce_motion_active`                                                 | Engagement           |
| `variable_reward_revealed`             | Reward shown                                      | `surface`, `reward_type`, `reward_variant`, `anticipation_duration_ms`, `is_reduced_motion_fallback`        | Primary + counter    |
| `perceived_effort_started`             | Processing UI begins                              | `surface`, `effort_type`, `step_count`, `computation_type`, `user_inputs_referenced_count`                  | Primary              |
| `perceived_effort_completed`           | Processing UI ends                                | `surface`, `effort_type`, `step_count`, `total_duration_ms`, `real_step_ratio`                              | Labor illusion proof |
| `intent_mirror_shown`                  | Mirror pause displayed                            | `surface`, `mirror_type`, `source_field`, `trigger_context`, `variant_id`                                   | Primary              |
| `intent_mirror_continued`              | User taps primary CTA                             | `surface`, `next_action`, `time_to_confirm_ms`                                                              | Conversion signal    |
| `peak_moment_reached`                  | Curve step reaches valence ≥ +3                   | `surface`, `step_id`, `emotional_target`, `score_contribution`                                              | Experience quality   |

### Counter-Metrics (Dark-Pattern Backfire Signals)

These metrics detect whether an emotional card is serving users or extracting from them. Monitor weekly while any card experiment is active. If any threshold is breached for two consecutive weeks, open `experience-card-dark-pattern` from `knowledge/experience/emotional-experience-measurement.md §Failure Card Shape`.

| Counter-Metric                                                                  | Card                   | Threshold To Investigate          | Action                                   |
| ------------------------------------------------------------------------------- | ---------------------- | --------------------------------- | ---------------------------------------- |
| `emotion_card_abandoned` where `rage_tap_detected = true`                       | All                    | > 3% per card                     | Pause variant; design review             |
| `emotion_card_opt_out` rate                                                     | All                    | > 10% of activated users per card | Review mechanic intrusiveness            |
| `variable_reward_opt_out` rate                                                  | Variable Reward        | > 15%                             | Review mechanic design                   |
| `variable_reward_revealed` dismissed in < 500ms                                 | Variable Reward        | > 25%                             | Reduce intrusion                         |
| Negative review cluster: "addictive" / "slot machine" / "gambling"              | Variable Reward        | Any 3+ reviews                    | Immediate design review                  |
| `perceived_effort_cancelled` rate                                               | Perceived Effort Delay | > 10%                             | Reduce duration or add cancel affordance |
| Result dismissed in < 1000ms after `perceived_effort_completed`                 | Perceived Effort Delay | > 20%                             | Review result quality                    |
| Negative review cluster: "fake" / "just a spinner" / "doesn't actually analyze" | Perceived Effort Delay | Any 3+ reviews                    | Compliance review                        |
| `intent_mirror_dismissed` with `surface = pre_purchase`                         | Intent Mirroring       | > 30% dismiss                     | Investigate if dismiss path suppressed   |
| `intent_mirror_dismissed` with `surface = re_engagement`                        | Intent Mirroring       | > 25%                             | Rewrite copy; make warmer                |
| `subscription_cancelled` within 24 h of `intent_mirror_shown` on cancel path    | Intent Mirroring       | Any spike                         | Remove from cancel path immediately      |
| `commitment_card_abandoned` during capture                                      | Commitment             | > 20%                             | Review copy and framing                  |
| Negative review text: "guilt" / "nag" / "shame"                                 | Commitment             | Any cluster                       | Design review                            |

### PostHog Dashboard

Create dashboard named **"Emotional Experience — Card Signals"** before any card experiment goes live. Include:

1. Card Fire Rate By Surface — `emotion_card_fired` by `card_id`, daily trend
2. Card Completion vs Abandon — funnel `emotion_card_fired` → `emotion_card_completed` / `emotion_card_abandoned`
3. Rage-Tap Rate By Card — `emotion_card_abandoned` where `rage_tap_detected = true`, weekly by `card_id`
4. Opt-Out Rate By Card — `emotion_card_opt_out` / `emotion_card_fired`, weekly
5. Commitment → Paywall Conversion — `commitment_made` → `paywall_viewed` → `trial_started`
6. Variable Reward → D7 Retention — cohort by `variable_reward_revealed` at D0, retention D1/D3/D7
7. Effort Delay → Activation — `perceived_effort_completed` → `activation_task_completed` within 10 min
8. Intent Mirror → Purchase — `intent_mirror_shown` → `intent_mirror_continued` → `trial_started`
9. **Dark-Pattern Watch** — `emotion_card_abandoned` (rage tap) + `notification_disabled` (48 h cohort) + `subscription_cancelled` within 24 h of any card fire. Alert if any metric breaches threshold for 2 consecutive weeks.

---

## Integration

This artifact integrates with the following surfaces. Do not duplicate their content — this document points to them.

| Artifact                                                   | Integration Point                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `11_STAR_EXPERIENCE.md`                                    | Emotional North Star maps to the 6-star ("better than expected") and 7-star ("made for me") levels. Intent Mirroring Card is the primary 7-star mechanic. All card activations must be tagged with their star-ladder level.                                                                                                                                                                                                                                                                                                                                                                                   |
| `product/ONBOARDING.md`                                    | Commitment Card fires during onboarding personalization. Perceived Effort Delay fires at plan generation. Intent Mirroring fires before the paywall. The onboarding sequence must reflect the Target Emotional Journey curve from this document: curve peaks before the paywall marker.                                                                                                                                                                                                                                                                                                                       |
| `analytics/ANALYTICS.md`                                   | All events in the Measurement Plan must appear in `analytics/ANALYTICS.md` before implementation. Do not implement events that are absent from the catalog.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `DESIGN.md`                                                | Motion tokens for each card moment: Commitment echo uses `motion.durationFast` (120ms fade); Variable Reward anticipation uses a pulse loop timed on `motion.durationBase` + a celebrate-family spring reveal; Perceived Effort step transitions use `motion.durationFast` + a celebrate-family final reveal; Intent Mirror entrance uses `motion.durationReveal` (600ms). Web surfaces use `motion/react` with CSS `--motion-*` variables. Mobile binary uses `DesignTokens.Motion`. Every delight moment has a `prefers-reduced-motion` / OS reduce-motion fallback declared in `engineering/TECH_SPEC.md`. |
| `knowledge/experience/emotional-experience-design.md`      | Producer recipes for all four cards, Six-Lens Design Review framework, Emotional Curve artifact format, bright-line governance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `knowledge/experience/emotional-experience-measurement.md` | Full per-card event catalogs, counter-metric thresholds, A/B experiment templates, dark-pattern detection protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `knowledge/experience/ethics-guardrail.md`                 | Guardrail Contract, per-mechanism risk table, non-negotiable prohibitions, validator rules for `check:emotional-design`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `engineering/PRODUCTION_READINESS.md`                      | Evidence for each card's bright-line compliance: commitment editability verified on device; variable reward variation proven (representative controlled-input evidence and its limitations); effort step-to-operation map verified; intent mirror content sources confirmed.                                                                                                                                                                                                                                                                                                                                 |

---

## Acceptance Checklist

Before any feature that applies an Experience Card is called build-ready:

- [ ] Emotional North Star is product-specific — it describes an emotion specific to this user's job-to-be-done, not a generic category.
- [ ] Target Emotional Journey table is product-specific with named steps; valence scores assigned to each step; paywall marker placed at the correct step.
- [ ] Emotional Curve rendered in `emotional-design.html` from the journey table. Curve peaks at or before the paywall marker.
- [ ] Card Application Map covers all selected cards or records a founder-approved deferral in `state/business-state.json lanes.emotional_design.deferred_cards`.
- [ ] Every row in Card Application Map has a populated Measurement Event. Unmeasured moments are not accepted.
- [ ] Every selected card has a completed Ethics Attestation block. Every field is product-specific. `bright_line`, `dark_line`, and `guardrail` fields are non-empty.
- [ ] Variable Reward Card: `user_control_escape_hatch` and `ethics_attestation` filled (HIGH-tier card — required by `knowledge/experience/ethics-guardrail.md`).
- [ ] Perceived Effort Delay Card: `effort_truthfulness_attestation` filled with a complete map of displayed steps to actual operations.
- [ ] Three-question operational test (goal alignment, truthfulness, informed exit) resolves YES for every applied card. Recorded in attestation blocks.
- [ ] All Measurement Plan events added to `analytics/ANALYTICS.md` before implementation.
- [ ] PostHog "Emotional Experience — Card Signals" dashboard exists with Dark-Pattern Watch insight configured with alerts.
- [ ] Counter-metric thresholds recorded; weekly dark-pattern watch protocol active (`knowledge/experience/emotional-experience-measurement.md §Dark-Pattern Detection Protocol`).
- [ ] Reduced-motion fallback declared for every animated card moment in `engineering/TECH_SPEC.md`. Web: `prefers-reduced-motion` check on `motion/react` animations. Mobile: OS reduce-motion flag check via `DesignTokens.Motion`.
- [ ] Intent Mirroring: mirror content sources only from fields user explicitly provided. Not placed on cancel / downgrade / unsubscribe flows. Verified in `engineering/PRODUCTION_READINESS.md`.
- [ ] Commitment: editable by user from Settings at any time. Verified on device.
- [ ] Variable Reward: variation is real (content differs, not only cosmetic framing). Proof method in `engineering/PRODUCTION_READINESS.md`.
- [ ] Star-ladder level tagged in each card attestation block; matches `11_STAR_EXPERIENCE.md` ladder entries.
- [ ] `product/ONBOARDING.md` references this document for emotional curve sequence.
- [ ] `DESIGN.md` motion tokens for each card moment are present.
- [ ] `npm run check:emotional-design -- --root .` passes with zero errors.
- [ ] `npm run check:emotional-design -- --root .` passes or an open failure card tracks the gap.
