# Ethics And Dark-Pattern Guardrail

Use this before designing, implementing, or shipping any emotionally persuasive mechanism —
Commitment Cards, Variable Reward Cards, Perceived Effort Delay Cards, Intent Mirroring Cards,
streaks, social proof, scarcity/urgency, ratings prompts, or any onboarding/paywall sequence
that targets the user's emotional state.

This reference is both policy and machine-checkable contract. Every applied Experience Card
must satisfy the Guardrail Contract in section 5. The validator (`check:emotional-design`)
enforces the required section phrases and per-card attestation fields in artifact docs.

Cross-references (do NOT duplicate; integrate):

- `knowledge/experience/eleven-star-experience.md` — star-ladder mapping required for every finding
- `knowledge/data/analytics-attribution.md` — every emotional moment must emit a named PostHog event
- `knowledge/experience/onboarding-conversion.md` — paywall timing, App Review popup placement, consent
- `knowledge/process/failure-cards.md` — dark-pattern violations become failure cards
- `knowledge/design/design-room.md` / `knowledge/design/design-visual-system.md` — motion fallbacks required

## Contents

- 1. Bright-Line Vs Dark-Line Distinction
- 2. Regulatory And Platform Landscape
- 3. Per-Mechanism Risk Table
- 4. Children And Vulnerable Populations
- 5. Guardrail Contract
- 6. Failure Cards
- 7. Acceptance Checklist

---

## 1. Bright-Line Vs Dark-Line Distinction

The four required Experience Cards — Commitment, Variable Reward, Perceived Effort Delay, and
Intent Mirroring — rely on mechanisms that have a known dual-use character. Each can serve the
user's genuine goal or extract value against the user's interest. This section names the line.

### Definitional Basis

**Genuine resonance (bright-line)**: the mechanism makes the user more likely to achieve the
goal they came to the app to achieve. The signal, reward, or pause is truthful, the benefit
accrues to the user, and the user could describe what happened and feel good about it in
retrospect. Source basis: Fogg Behavior Model — behavior as a function of Motivation,
Ability, and Prompt (B=MAP); mechanisms that raise M and A toward a user-owned goal are
prosocial. BJ Fogg, _Tiny Habits_, 2019.

**Extraction / compulsion (dark-line)**: the mechanism makes the user do something that
primarily benefits the product at the user's expense — spending money they did not intend to,
continuing a session when they want to stop, consenting without understanding, or believing
something that is not true. Source basis: the FTC defines "dark patterns" as design practices
that trick or manipulate consumers into choices they would not otherwise make; EU Digital
Services Act (DSA) Art. 25 prohibits "deceptive or manipulative techniques" that distort
autonomous decision-making.

### The Operational Test

Before shipping any emotionally persuasive mechanism, apply this three-question test. All
three must be YES for bright-line classification:

1. **Goal alignment**: does the mechanism help the user move toward the goal they stated or
   implied when they opened the app? (If unclear, check the Intent Mirroring Card — did you
   pause to confirm the goal first?)
2. **Truthfulness**: is every claim, number, progress signal, scarcity signal, social-proof
   signal, and effort-display true and verifiable at the time it is shown?
3. **Informed exit**: can the user stop, dismiss, pause, or undo without penalty and without
   the app making it harder than starting? (EU Consumer Rights Directive Art. 9 requires
   cancellation to be as easy as subscription.)

If any answer is NO, the mechanism is dark-line and must be redesigned or removed. A
validator attestation field must record the test result for each applied card.

### Card-By-Card Bright/Dark Examples

**Commitment Card** (basis: Robert Cialdini, _Influence_, 1984 — commitment/consistency
principle; foot-in-the-door technique)

- Bright: user sets a goal in plain language; app reflects it back at key moments; user feels
  ownership of their own stated intent.
- Dark: app locks the user's stated goal to prevent cancellation ("you said you'd do this
  every day — are you sure you want to quit?"); confirmshaming exit copy; phantom opt-in that
  pre-ticks a paid tier.

**Variable Reward Card** (basis: B.F. Skinner, operant conditioning, variable-ratio
reinforcement schedules; Wolfram Schultz, dopamine reward-prediction-error — reward signal
fires on anticipation, not receipt, _Science_, 1997; Nir Eyal, _Hooked_, 2014 — Hook Model
rewards of tribe/hunt/self)

- Bright: unpredictable positive feedback varies the emotional quality of app interactions,
  keeping the user curious and engaged with their own progress. The user can always see what
  they are working toward.
- Dark: infinite scroll designed to prevent stopping; loot-box spending mechanics targeting
  compulsive behavior; engineered near-miss signals. Belgium and Netherlands have classified
  loot boxes as gambling (attribution-uncertain: exact statutory cite; known enforcement
  precedent from 2018-2020). UK Gambling Commission has published guidance on loot-box risks.

**Perceived Effort Delay Card** (basis: Ryan Buell and Michael Norton, "Operational
Transparency," _Harvard Business Review_, 2011; _Management Science_, 2011 — the Labor
Illusion: users value results more when they observe effort being expended; Michael Norton,
Daniel Mochon, and Dan Ariely, IKEA Effect, _Journal of Consumer Psychology_, 2012 — effort
invested raises perceived value)

- Bright: show real work being done (actual computation, data fetch, personalization pass).
  The display is honest about what is happening. User's perceived value is higher because
  real effort was invested.
- Dark: fake loading spinners with no underlying computation; artificially inflated wait
  times to manufacture value perception; deceptive "analyzing your data" screens that show
  random personalization copied from a template.

**Intent Mirroring Card** (basis: Don Norman, _The Design of Everyday Things_, 1988 —
affordances and signifiers; Alan Cooper, goal-directed design; Rosalind Picard, _Affective
Computing_, 1997 — emotional feedback loops)

- Bright: a deliberate pause that mirrors the user's stated intent back to them before a
  consequential action. The pause is for the user's benefit — it confirms they are about to
  do what they meant to do.
- Dark: a "are you sure?" prompt engineered not to confirm intent but to add friction to
  cancellation or downgrade paths (router anti-pattern); confirmshaming copy ("No thanks, I
  prefer to stay bad at this").

---

## 2. Regulatory And Platform Landscape

Agents must not cross these lines. Attribute-uncertain items are flagged.

### FTC — United States

- FTC Act Section 5 prohibits unfair or deceptive acts in commerce.
- FTC "Bringing Dark Patterns to Light" (September 2022): enforcement staff report naming
  subscription traps, difficult cancellation, hidden fees, misleading urgency, and misleading
  social proof as enforcement targets.
- FTC "Click-to-Cancel" Rule (final rule, October 2024, 16 CFR Part 425): subscription
  cancellation must be as easy as sign-up; negative-option marketing requires clear, informed
  consent before charging.
- FTC Children's Online Privacy Protection Act (COPPA, 15 U.S.C. §§ 6501-6506) and
  implementing Rule (16 CFR Part 312): verifiable parental consent before collecting
  personal data from children under 13; no behavioral advertising to under-13 users.

### EU — European Union

- Digital Services Act (DSA, Regulation (EU) 2022/2065), Art. 25: very large online
  platforms and online search engines must not use "dark patterns" — interface designs that
  "deceive, manipulate or otherwise impair or impair the ability of recipients of the service
  to make free and informed decisions." Mobile apps with significant EU reach should treat
  Art. 25 as the operational standard even when not formally a VLOP.
- Digital Markets Act (DMA, Regulation (EU) 2022/1925), Art. 13: gatekeepers must not use
  dark patterns in consent management for tracking or advertising.
- EU Consumer Rights Directive (CRD, Directive 2011/83/EU as amended): right of withdrawal
  (14 days for digital purchases), cancellation must be as easy as subscription (Art. 9,
  enforced from 2022 via national implementing law).
- GDPR (Regulation (EU) 2016/679): consent for data processing must be freely given,
  specific, informed, and unambiguous — pre-ticked boxes, consent bundled with ToS
  acceptance, and dark-pattern cookie banners are illegal (EDPB Guidelines 05/2020 on
  consent).
- EU Omnibus Directive (Directive (EU) 2019/2161), amending CRD and other directives:
  fake reviews, misleading personalized pricing not disclosed as personalized, false scarcity
  claims are unfair commercial practices.

### Apple App Store

- App Review Guidelines §2.3 (Accurate Metadata): screenshots, copy, and previews must
  not mislead users. Fake social proof, inflated download counts, and fabricated review
  excerpts are grounds for rejection.
- App Review Guidelines §3.2.2(b): apps must not manipulate users into purchasing
  subscriptions or in-app purchases through confusing or deceptive pricing presentation.
- App Review Guidelines §4.0 (Design): apps that create false urgency, exploit emotions
  (including grief, fear, or loneliness), use addictive or compulsive mechanics to extract
  money, or employ other manipulative patterns will be rejected.
- App Review Guidelines §5.1.1 (Data Collection and Storage): permission requests must
  clearly state the purpose; apps must not access permissions beyond stated purpose.
- App Review Guidelines §5.1.2 and §3.2.1: rating/review prompts must use the native
  StoreKit API only; must not solicit only positive reviews; must not interrupt users mid-
  task. Maximum three prompts per 365-day period.
- Apple Human Interface Guidelines on Ratings and Reviews (attribution-uncertain: exact
  HIG version; stable guideline): prompt only after demonstrated value.

### Google Play

- Google Play Developer Policy — Deceptive Behavior: prohibits false information, deceptive
  ads, fake social proof, and misleading subscription presentations.
- Google Play Billing Policy: subscription cancellation flow must not use dark patterns;
  downgrade or cancellation paths must be as accessible as upgrade paths.
- Google Play Families Policy: additional restrictions for apps that target children — no
  behavioral advertising, no social pressure mechanics, no loot boxes.

### Children And Teens — Additional Duty

See section 4 for the full children/teen guardrail.

### AI-Powered Manipulation And Design-Code Duties

Two further regimes apply when the app uses AI or is reachable by minors — verify current text before relying on it:

- **EU AI Act, Article 5(1)(a) (prohibited practices, applicable from Feb 2025):** bans AI systems that deploy "subliminal techniques beyond a person's consciousness" or purposefully manipulative/deceptive techniques that "materially distort behaviour" and cause significant harm. Variable-Reward near-miss engineering and Intent-Mirroring on cancel paths in an AI-powered app are the highest-risk intersection. If the app personalizes emotional triggers via AI, document that no card relies on beyond-conscious manipulation.
- **California Age-Appropriate Design Code (AB 2273) and similar state design codes:** require a Data Protection Impact Assessment (DPIA) for features likely to be accessed by under-18 users, with "best interests of the child" as the default. Any HIGH-risk card in an app reachable by minors needs a recorded DPIA before ship; `attribution-uncertain` flags are acceptable where the legal status is contested, but the duty must be acknowledged, not skipped.

---

## 3. Per-Mechanism Risk Table

For each mechanism, the risk tier is based on enforcement history and regulatory attention.
Required attestation fields are listed — these are enforced by the validator.

| Mechanism                                                                                   | Risk Tier  | Primary Risk                                           | Bright-Line Test                                                    | Required Attestation Fields                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variable Reward                                                                             | HIGH       | Compulsion loop, gambling-adjacent                     | User can always stop; no near-miss engineering; no spend compulsion | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `user_control_escape_hatch`, `ethics_attestation`, `counter_metric`, `reward_variation_proof`                                     |
| Streak / Loss Aversion                                                                      | HIGH       | Coercive retention; grief/fear exploitation            | Streak break is recoverable; no punitive streak-loss spend gates    | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `user_control_escape_hatch`, `ethics_attestation`, `counter_metric`, `streak_recovery_mechanism`                                  |
| Scarcity / Urgency                                                                          | HIGH       | Fake scarcity; countdown clock manipulation            | Scarcity is real and enforced; countdown reflects actual offer end  | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `ethics_attestation`, `counter_metric`, `scarcity_enforcement_proof`                                                              |
| Social Proof                                                                                | HIGH       | Fabricated counts; review solicitation manipulation    | Every count is real; no soliciting only positive reviews            | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `ethics_attestation`, `counter_metric`, `social_proof_truthfulness_proof`                                                         |
| Perceived Effort Delay                                                                      | MEDIUM     | Fake labor / sleep-timer illusion; deceptive spinner   | ≥50% steps map to real computation; delay capped                    | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `effort_truthfulness_attestation`, `computation_type` (∈ real_api_call \| real_data_processing \| ui_composition), `max_delay_ms` |
| Intent Mirroring                                                                            | MEDIUM     | Retention friction on cancel; reflected-text injection | Never on cancel/downgrade; free text sanitized                      | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `prohibited_surfaces` (must list cancel/downgrade), `free_text_sanitization` when reflecting free text                            |
| Endowed Progress                                                                            | LOW        | Fabricated head start                                  | Progress reflects real inputs/actions                               | `bright_line`, `dark_line`, `guardrail`, `posthog_event`, `progress_sourcing_attestation`                                                                                                   |
| Commitment / Intent Mirroring / Peak-End and other motion cards                             | —          | Missing reduced-motion fallback                        | Every animated beat has a reduce-motion fallback                    | base fields + a `prefers-reduced-motion` / `reduced_motion` declaration in `guardrail`                                                                                                      |
| All other deck cards (Reciprocity, Identity, Fresh Start, Mastery, Recovery, Rating Prompt) | LOW–MEDIUM | Card-specific (see `experience-cards.md`)              | The card's own bright-line test                                     | base fields (`bright_line`, `dark_line`, `guardrail`, `posthog_event`); rating_prompt also requires `platform_api_used`                                                                     |
| Commitment Card                                                                             | MEDIUM     | Confirmshaming; phantom opt-in; cancellation friction  | Exit path is frictionless; commitment is user-owned, not app-owned  | `bright_line`, `dark_line`, `guardrail`                                                                                                                                                     |
| Rating Prompt                                                                               | MEDIUM     | Platform policy violation; coercive placement          | Native API only; post-value; not mid-task; max 3/year               | `bright_line`, `dark_line`, `guardrail`, `platform_api_used`                                                                                                                                |
| Goal Gradient                                                                               | LOW        | False urgency on manufactured milestones               | Milestones reflect real user goals                                  | `bright_line`, `dark_line`, `guardrail`                                                                                                                                                     |

Basis for risk tiers: FTC 2022 dark-patterns report; DSA Art. 25; Apple §4.0 and §3.2.2(b);
Kahneman and Tversky, prospect theory / loss aversion (_Econometrica_, 1979); Thaler,
endowment effect (attribution-uncertain: primary cite; well-established); Hull, goal-gradient
(attribution-uncertain: primary cite); Kivetz, Urminsky, and Zheng, endowed progress effect,
_Journal of Marketing Research_, 2006.

---

## 4. Children And Vulnerable Populations

Apply additional scrutiny when the app may be used by, or marketed toward, children or teens.

### COPPA (US — under 13)

- Do not collect personal data from users under 13 without verifiable parental consent.
- Do not use behavioral advertising targeting under-13 users.
- Do not use social pressure mechanics (leaderboards, peer comparison, public shame) with
  under-13 users.
- Age-gate must be meaningful, not a single-field birth-year honesty check with no
  enforcement.

### UK Age-Appropriate Design Code (Children's Code, ICO, 2021)

- "Best interests of the child" standard overrides commercial interest.
- Nudge techniques that encourage children to provide more data or weaken privacy settings
  are prohibited.
- Profiling for behavioral advertising is off by default for users the service knows or
  should know are under 18.
- High privacy by default for all users who may be under 18.
- (attribution-uncertain: exact statutory provision number; published code is publicly
  available from ICO.)

### General Vulnerable-Population Duty

- Do not target emotionally exhausted states (grief, loneliness, health anxiety) with
  spend prompts.
- Do not use the dopamine anticipation window (Wolfram Schultz, 1997) to time spend prompts
  immediately after a streak-progress display. This combination is the highest-risk pattern
  in subscription fitness and habit apps.
- Apple §4.0 names "exploit emotions (including grief, fear, or loneliness)" as a rejection
  criterion.

---

## 5. Guardrail Contract

This section defines the machine-checkable contract. Every artifact that declares an applied
Experience Card (Commitment, Variable Reward, Perceived Effort Delay, Intent Mirroring) or
any mechanism in the risk table must satisfy all fields in this contract.

### Required Card Attestation Block

Every applied card must include an attestation block in the artifact doc
(`product/ONBOARDING.md`, `11_STAR_EXPERIENCE.md`, `PRODUCT.md`, or a dedicated `ETHICS.md`).
The validator checks for these stable phrase keys.

```yaml
# Example attestation block — paste and fill for each applied card
experience_card:
  id: "variable-reward-card" # stable id, one per card instance
  mechanism: "variable_reward" # must match mechanism column in risk table
  applied_to: "post-session result reveal" # screen/moment where the card fires
  star_level: "7" # 11-star ladder level this elevates
  posthog_event: "variable_reward_triggered" # named PostHog event (from analytics/ANALYTICS.md)
  bright_line: >
    The result reveal varies in quality and surprise to keep the user curious about
    their own progress. The user always knows what metric they are working toward.
  dark_line: >
    Would cross into dark territory if: near-miss engineering were used; if the reward
    pulse were timed to a spend prompt; if the variability were designed to prevent
    the user from stopping rather than to celebrate progress.
  guardrail: >
    No near-miss mechanics. Reward fires on real data. No spend prompt within the
    same screen or 30s after the reward reveal. Prefers-reduced-motion fallback present.
  user_control_escape_hatch: >
    User can disable animated results in Settings > Accessibility. Plain text summary
    always available.
  ethics_attestation: >
    This card serves the user's stated goal of improving at [domain]. The three-question
    operational test: (1) goal alignment YES, (2) truthfulness YES, (3) informed exit YES.
    Bright-line classification: confirmed.
  effort_truthfulness_attestation: "" # fill if mechanism is perceived_effort_delay
  scarcity_enforcement_proof: "" # fill if mechanism is scarcity/urgency
  social_proof_truthfulness_proof: "" # fill if mechanism is social_proof
  platform_api_used: "" # fill if mechanism is rating_prompt
```

### Validator-Enforced Rules

The `check:emotional-design` script enforces the following. Any violation is an `error`
unless marked as `warning`.

All codes are emitted by `checks/validation/business/experience/check-emotional-design.ts` with the prefix `emotional_design.` (audit-artifact codes use `emotional_audit.`).

| Rule ID (prefix `emotional_design.`)                                                                                                                                                                                                         | Level                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `card_missing_mechanism` / `card_missing_bright_line` / `card_missing_dark_line` / `card_missing_guardrail`                                                                                                                                  | error                                                  | An applied `experience_card:` block lacks its mechanism, bright-line, dark-line, or guardrail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `card_missing_posthog_event`                                                                                                                                                                                                                 | error                                                  | A card block has no `posthog_event` — every emotional moment must be measurable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `card_missing_reduced_motion`                                                                                                                                                                                                                | error                                                  | A motion-bearing card (commitment, variable_reward, perceived_effort_delay, intent_mirroring, peak_end) declares no prefers-reduced-motion / OS reduce-motion fallback in `guardrail` or `reduced_motion`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `variable_reward_missing_<field>`                                                                                                                                                                                                            | error                                                  | A `variable_reward` card lacks `ethics_attestation`, `user_control_escape_hatch`, `counter_metric`, or `reward_variation_proof`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `streak_missing_<field>` (and `streak_loss_aversion_*`, `loss_aversion_*`)                                                                                                                                                                   | error                                                  | A streak card lacks `ethics_attestation`, `user_control_escape_hatch`, `counter_metric`, or `streak_recovery_mechanism`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `scarcity_missing_<field>` / `urgency_missing_<field>`                                                                                                                                                                                       | error                                                  | A scarcity/urgency card lacks `ethics_attestation`, `counter_metric`, or `scarcity_enforcement_proof`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `social_proof_missing_<field>`                                                                                                                                                                                                               | error                                                  | A social-proof card lacks `ethics_attestation`, `counter_metric`, or `social_proof_truthfulness_proof`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `perceived_effort_delay_missing_<field>` / `perceived_effort_bad_computation_type` / `perceived_effort_delay_too_long`                                                                                                                       | error                                                  | A perceived-effort card lacks `effort_truthfulness_attestation` or `computation_type`, sets `computation_type` outside {real_api_call, real_data_processing, ui_composition}, or sets `max_delay_ms` over the cap (15s ui_composition / 90s otherwise).                                                                                                                                                                                                                                                                                                                                                                                                |
| `intent_mirroring_missing_prohibited_surfaces` / `intent_mirror_prohibited_surfaces_weak`                                                                                                                                                    | error                                                  | An intent-mirroring card omits `prohibited_surfaces` or fails to bar cancel/downgrade/unsubscribe flows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `intent_mirror_free_text_unsanitized`                                                                                                                                                                                                        | warning                                                | An intent mirror reflects free-text user input with no `free_text_sanitization` approach.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `endowed_progress_unsourced`                                                                                                                                                                                                                 | warning                                                | An endowed-progress card lacks `progress_sourcing_attestation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rating_prompt_missing_platform_api_used`                                                                                                                                                                                                    | error                                                  | A rating-prompt card does not name the native StoreKit / Play In-App Review API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `fake_scarcity_phrase` / `fake_social_proof_phrase`                                                                                                                                                                                          | error                                                  | Live copy (EMOTIONAL_DESIGN.md, EMOTIONAL_AUDIT.md, product/ONBOARDING.md, PRODUCT.md, APP_STORE_LISTING.md) contains scarcity/social-proof copy with no attested scarcity/social-proof card block in EMOTIONAL_DESIGN.md.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `confirmshaming_phrase` / `commitment_guilt_phrase`                                                                                                                                                                                          | error                                                  | Live copy contains a confirmshaming opt-out label or commitment-guilt copy (e.g. "are you sure you want to cancel", "remember why you started").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `spend_prompt_after_reward`                                                                                                                                                                                                                  | error                                                  | Live copy co-locates a spend prompt with a streak/reward moment and no adjacent separation statement (separate screen / one interaction between). Prohibition 4 below is non-negotiable, so the gate blocks instead of advising.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `risk_tier_conflict` / `risk_tier_duplicate_row` / `risk_tier_mismatch` / `risk_tier_unrecognized` / `risk_tier_unmapped_card` / `risk_tier_index_missing_card` / `risk_table_unparsed` / `card_index_unparsed` / `risk_table_malformed_row` | error                                                  | The §3 risk table or the routing index carries two rows for one mechanism (disagreeing tiers, agreeing duplicates, or a bucket/explicit contradiction — one tier per mechanism, one routing row per card), the `experience-cards.md` index Risk column disagrees with the §3 tier for a card, an index card resolves to no §3 row at all (deliberately unmapped cards excepted), a canonical §3 deck mechanism has no index routing row (table-only mechanisms excepted), a tier cell is not LOW/MEDIUM/HIGH or an ascending range (ranges span their intermediate tiers), a table-shaped line fails to parse as a row, or either table stops parsing. |
| `children_unreviewed`                                                                                                                                                                                                                        | error (under-13, the COPPA boundary) / warning (13–17) | The audience includes minors and no COPPA / UK AADC review is documented in `ETHICS.md`, `trust/PRIVACY.md`, or `PRIVACY_POLICY.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `contract_missing` / `section_<name>_missing` / `ref_<file>_missing` / `no_card_blocks` / `html_missing` / `placeholder_complete`                                                                                                            | error                                                  | EMOTIONAL_DESIGN.md is missing, lacks a required section, omits a required cross-reference (11_STAR_EXPERIENCE.md / analytics/ANALYTICS.md / DESIGN.md / product/ONBOARDING.md), has no card blocks, has no rendered board, or still has placeholder language while the lane is `done`. The required **Ethics Attestation** section is what satisfies the centralized-attestation rule — no separate `ETHICS.md` is required.                                                                                                                                                                                                                          |

### Non-Negotiable Prohibitions (Automatic Compliance Veto)

The following patterns are unconditional blocks. No founder approval overrides them. If found
in a live artifact, the engineering lane is blocked until removed.

1. **Fake scarcity**: countdown timers, "X spots left", or "offer expires" claims that reset
   on reload or are not enforced by real inventory or time-based backend logic.
2. **Fake social proof**: fabricated user counts, invented testimonials, stock-photo
   attributed reviews, or review excerpts not sourced from real App Store / Play reviews.
3. **Fake effort**: loading spinners or "analyzing your data" displays where no real
   computation or personalization is occurring.
4. **Spend prompts inside streak-break grief screens**: any IAP/paywall prompt displayed on
   the same screen as a streak-loss notification.
5. **Confirmshaming exit copy**: opt-out labels written in first-person self-deprecation
   designed to make the user feel bad for declining.
6. **Ratings solicitation outside native API**: any custom "rate us" prompt that routes to
   the App Store only for positive responses, or any prompt that violates the platform's
   three-per-year cap.
7. **Pre-ticked subscription boxes**: any UI where a paid tier or auto-renewing subscription
   is selected by default without affirmative user action.
8. **Hidden subscription terms**: any paywall or checkout screen where price, renewal
   cadence, trial terms, or cancellation instructions are not visible before confirmation tap.

---

## 6. Failure Cards

Dark-pattern violations become failure cards using the shape in `failure-cards.md`. Default
cards for the most common violations are provided here.

```yaml
id: "ethics-fake-scarcity"
severity: "critical"
owner: "product-lead"
status: "open"
evidence:
  - "product/ONBOARDING.md or PRODUCT.md — section containing the claim"
impact: >
  Fake scarcity claims violate FTC Click-to-Cancel/deceptive-design enforcement,
  EU Omnibus Directive unfair commercial practices, and Apple §2.3 Accurate Metadata.
  App Store rejection and FTC investigation risk.
next_action: >
  Remove the claim or add real backend enforcement (actual inventory limit or
  true time-limited pricing with a `scarcity_enforcement_proof` card block).
  Run `npm run check:emotional-design -- --root .` after fix.
validator: "npm run check:emotional-design -- --root ."
```

```yaml
id: "ethics-confirmshaming"
severity: "high"
owner: "product-lead"
status: "open"
evidence:
  - "product/ONBOARDING.md — opt-out copy"
impact: >
  Confirmshaming is a named dark pattern under EU DSA Art. 25 and FTC deceptive-design
  enforcement. Apple §4.0 (manipulative patterns) is grounds for rejection.
next_action: >
  Replace opt-out label with a neutral, non-self-deprecating alternative.
  Run `npm run check:emotional-design -- --root .` after fix.
validator: "npm run check:emotional-design -- --root ."
```

```yaml
id: "ethics-spend-prompt-in-grief-screen"
severity: "critical"
owner: "engineering-lead"
status: "open"
evidence:
  - "product/ONBOARDING.md or PRODUCT.md — streak-break screen spec"
impact: >
  Combining loss-aversion grief with a spend prompt is the highest-risk dark pattern in
  habit/fitness apps. Violates Apple §4.0 (exploit emotions). FTC enforcement target.
next_action: >
  Move any IAP/paywall prompt to a separate screen, minimum one user interaction after
  the streak-break notification resolves. Add `ethics_attestation` to the Variable Reward
  and Streak cards documenting the separation.
validator: "npm run check:emotional-design -- --root ."
```

```yaml
id: "ethics-variable-reward-missing-escape-hatch"
severity: "high"
owner: "engineering-lead"
status: "open"
evidence:
  - "Experience card block — missing user_control_escape_hatch"
impact: >
  Variable reward without a user-accessible off-switch creates compulsion risk.
  Required by Guardrail Contract for HIGH-tier cards.
next_action: >
  Add Settings > Accessibility toggle to disable animated reward reveals.
  Declare the escape hatch in the card block `user_control_escape_hatch` field.
  Run `npm run check:emotional-design -- --root .`.
validator: "npm run check:emotional-design -- --root ."
```

---

## 7. Acceptance Checklist

Before any emotionally persuasive mechanism ships:

- [ ] Every applied Experience Card has a complete attestation block with `bright_line`,
      `dark_line`, and `guardrail` fields.
- [ ] HIGH-tier cards (variable_reward, streak, scarcity, social_proof) have `ethics_attestation`
      and `user_control_escape_hatch` filled.
- [ ] Scarcity/urgency cards have `scarcity_enforcement_proof` — real inventory or real
      time-bound backend logic confirmed.
- [ ] Social proof cards have `social_proof_truthfulness_proof` — every count sourced and
      verifiable.
- [ ] Perceived effort delay cards have `effort_truthfulness_attestation` — real computation
      confirmed.
- [ ] Rating prompt cards have `platform_api_used` — native StoreKit or Play In-App Review
      API only.
- [ ] Three-question operational test (goal alignment, truthfulness, informed exit) is
      answered YES for every applied card.
- [ ] No confirmshaming copy in any opt-out label.
- [ ] No fake scarcity phrases without backend enforcement.
- [ ] No spend prompt on the same screen as a streak-loss or variable-reward reveal.
- [ ] Every emotional moment emits a named PostHog event from `analytics/ANALYTICS.md`.
- [ ] Every motion-bearing delight moment has a prefers-reduced-motion / OS reduce-motion
      fallback declared.
- [ ] App targets under-18 audience: COPPA and UK Children's Code review noted in `ETHICS.md`
      or `trust/PRIVACY.md`.
- [ ] `npm run check:emotional-design -- --root .` passes with zero errors.
