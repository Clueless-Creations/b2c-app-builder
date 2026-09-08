# Consumer Product Design Agency

Use this reference when building or auditing the emotional and behavioral layer of a B2C mobile app. It translates five academic design tiers into operational decisions, artifacts, and failure modes for this skill. It is a peer reference to [`eleven-star-experience.md`](eleven-star-experience.md), `quality-lens.md`, `onboarding-conversion.md`, `analytics-attribution.md`, `design-visual-system.md`, and `failure-cards.md`. Do not duplicate those; cross-reference them.
## Applicability And Evidence Boundary

Card selection is conditional; the discipline of making and reviewing that selection is core. Calm, predictable feedback and immediate completion can be the right emotional experience. Evaluate the actual user need before selecting novelty, anticipation, a commitment, or a reveal. Do not manufacture a behavioral loop to fill a card checklist.

Psychological theories and examples below motivate hypotheses. They do not establish a universal effect size, a guaranteed star-level improvement, or a measured benefit in this product. Keep observed user response separate from intended tone. Every applied card retains its ethics, truthful progress, accessibility and measurement obligations; marking another card non-applicable waives none of them.


## Contents

- Four Experience Card Options
- Tier 1 Human-Centered Design
- Tier 2 Emotional Design
- Tier 3 Behavioral Science
- Tier 4 Service Design
- Tier 5 Human-Centered AI
- Bright-Line Guardrails
- Analytics Contract
- Acceptance Checklist

---

## Four Experience Card Options

Evaluate whether these four patterns serve the actual user job. Select applicable cards and record why the others do not apply. A quiet, direct utility may use none. There is no established universal conversion, retention or word-of-mouth penalty for omitting a card.

### Commitment Card

**Mechanism.** A user who makes a small, voluntary, public-ish action becomes more likely to continue. This is Cialdini's commitment and consistency principle (foot-in-the-door form): once a person acts, they align future behavior to match that self-image. Locke and Latham's goal-setting theory adds that a specific, user-owned goal raises sustained effort. Gollwitzer's implementation intentions research confirms that "when X happens I will do Y" phrasing dramatically closes the gap between intention and action.

**What it looks like in a mobile app.** The user names their goal, picks a cadence, or answers one personalization question early in onboarding. The app mirrors the choice back in-product (home screen, notification, session start). The user has now told the app what they want and the app remembers it explicitly, not as a generic placeholder.

**Bright line (serves the user).** The committed goal is real to the user: they chose it without pressure, the app can actually help them reach it, and the goal is revisable.

**Dark line (manipulates against the user).** The "commitment" is to a plan the user did not meaningfully choose, or it is used to guilt-trigger re-subscriptions when the user has decided to leave. This is a compliance veto.

**Deterministic guardrail.** The goal must be user-authored (free input or a real choice from ≤5 options). The app must allow the user to change or delete the goal at any time from settings. If the goal is used in a retention notification it must include the user's own words, not generic urgency copy.

**Artifact.** Record the specific commitment interaction in `product/ONBOARDING.md` (commitment step, question copy, stored key, PostHog person property, notification use). Map it to the 6-star or 7-star level in `11_STAR_EXPERIENCE.md`.

---

### Variable Reward Card

**Mechanism.** Wolfram Schultz's dopamine reward-prediction-error research shows that the dopamine pulse fires on anticipation and surprise, not on the predictable reward itself. B.F. Skinner's variable-ratio reinforcement schedule produces the most persistent behavior because the next payoff is uncertain. Nir Eyal's Hook Model (Trigger→Action→Variable Reward→Investment) names three reward types: rewards of the tribe (social recognition), rewards of the hunt (discovery/achievement), and rewards of the self (mastery/completion). Kent Berridge's wanting-vs-liking distinction warns that dopamine drives _wanting_ (approach) more than _liking_ (satisfaction) — which is why variable rewards can escalate compulsion if not bounded.

**What it looks like in a mobile app.** After a meaningful user action, the result is not fully known in advance. A streak unlocks a random insight. A generation produces a slightly different result each time. A score changes with new data. The reveal is visually distinct from ordinary feedback (animation, sound, layout shift) and maps to `DesignTokens.Motion` as specified in `design-visual-system.md`.

**Bright line.** The reward is a real product outcome the user cares about (new insight, generated asset, unlocked content). Variability is in _quality and surprise_, not in _access_ to already-paid features.

**Dark line.** Rewards are withheld artificially to drive re-opens; slots-style mechanics behind a paywall or ad gate; rewards that require social sharing or a purchase to reveal. This is a compliance veto.

**Deterministic guardrail.** Every variable reward path must have a non-empty fallback (a non-variable version of the same outcome). The reward reveal animation must respect `prefers-reduced-motion` / OS reduce-motion (per `design-visual-system.md`). The PostHog event for the reward reveal must be in `analytics/ANALYTICS.md` before build.

**Artifact.** Name every variable-reward moment in `PRODUCT.md` with the trigger action, the reward type (tribe/hunt/self), the fallback, and the PostHog event. Map each to a star level in `11_STAR_EXPERIENCE.md`. Motion spec goes in `DESIGN.md`.

---

### Perceived Effort Delay Card

**Mechanism.** Ryan Buell and Michael Norton's labor illusion / operational transparency research shows that users value a result more when they can see effort being expended on their behalf, even when that effort is invisible or instantaneous. Norton, Mochon, and Ariely's IKEA effect extends this: users overvalue outcomes they participated in creating. Kahneman and Tversky's prospect theory adds that loss aversion makes a result feel more valuable when the user perceives they invested something to get it.

**What it looks like in a mobile app.** When the app performs a computation, personalization pass, or AI generation, it shows a brief deliberate progress experience — not a spinner, but a labeled, staged, meaningful wait. Each stage names what the app is doing for the user specifically ("Analyzing your writing style…", "Building your plan…"). Show accurate progress while real work is pending; make the result available as soon as it is ready. Do not add a minimum wait to signal effort.

**Bright line.** The staged wait reflects real steps the app is performing (or did perform). Each stage label is accurate. The delay is proportional: a 3-second personalization pass, not a 12-second fake loader for a cached result.

**Dark line.** The delay is purely artificial with fabricated stage labels. The effort display implies AI sophistication that does not exist. A fake progress bar resets near 100% to extend time. This is a compliance veto.

**Deterministic guardrail.** Each stage label in the progress experience must map to an actual backend or on-device computation step documented in `engineering/TECH_SPEC.md`. If the computation is truly instant (cached), omit the delay and show the ready result. No stage may claim a specific data source the app does not actually access.

**Artifact.** Define the perceived effort sequence in `product/ONBOARDING.md` and in the relevant feature section of `PRODUCT.md`. Include stage count, label copy, duration per stage, motion spec (tokens), and true computation mapping. Add `onboarding_effort_reveal_complete` (or the feature-specific equivalent) to `analytics/ANALYTICS.md`.

---

### Intent Mirroring Card

**Mechanism.** Gollwitzer's implementation intentions research shows that making a plan explicit ("when I open the app Monday morning I will log my workout") dramatically increases follow-through. Don Norman's affordance and signifier theory (visceral/behavioral/reflective design levels) holds that a product that reflects the user's own goal language back to them creates reflective resonance — the user feels the product understands them. Alan Cooper's goal-directed design adds that designing for the user's stated goal, not the feature, is what separates tools people return to from tools people abandon. Rosalind Picard's affective computing research grounds the expectation that systems that model user intent are perceived as more trustworthy.

**What it looks like in a mobile app.** At a deliberate, calm moment in the session — often after a first result, before a paywall, or at session end — the app pauses and reflects the user's stated goal or action back to them. Not a push notification. Not a modal that demands a tap. A contextual screen, card, or inline moment that names what the user came to do and what they just accomplished or are about to accomplish. It turns a tap into a moment.

**Bright line.** The mirror uses the user's own words (from Commitment Card input or last session action). The pause is brief (non-blocking and immediately dismissible). The user feels seen, not trapped.

**Dark line.** The mirror is deployed to create guilt ("You said you'd practice every day…"), to manufacture urgency before a paywall, or to delay a user who wants to leave. This is a compliance veto.

**Deterministic guardrail.** The mirror moment must not be the gate to the next screen (it cannot block progress). It must be dismissable in ≤1 tap. It must not appear more than once per session. Copy must include at least one user-authored phrase from their committed goal or last session data, not generic filler. Review copy against `strategy/BRAND.md §Voice` (brand-voice attestation required before build).

**Artifact.** Define the mirror moment in `product/ONBOARDING.md` (where it appears) and `PRODUCT.md` (what triggers it post-onboarding). Include the data source for the user-authored phrase (PostHog person property or local state key). Add `intent_mirror_shown` to `analytics/ANALYTICS.md`. Map to 6-star or 7-star level in `11_STAR_EXPERIENCE.md`.

---

## Tier 1 Human-Centered Design

**Source institutions.** CMU HCII, Stanford HCI, MIT Media Lab, UW HCDE, Georgia Tech, Michigan.

### Ideas That Change A Launch Decision

**1. Formative research precedes assumption.** The founding insight of HCI research is that designers are not their users. Even a 5-user moderated test (Nielsen and Molich's discount usability heuristics, 1990) reveals problems that internal review misses. For a B2C mobile launch, this means the onboarding and core loop must be witnessed with real target users — not shipped and measured from crash data alone. The decision that changes: onboarding screen count, question wording, and first-value timing must be tested before paywall placement is locked, not after.

**2. Cognitive load caps conversion.** Miller's 7±2 working-memory limit (attribution-uncertain: Miller 1956 is real, but the 7±2 framing is approximate) and Hick's Law (reaction time rises with number of choices) are the HCI-side explanation for why onboarding flows with >5 choices per screen or >7 screens to paywall perform poorly. The decision that changes: every onboarding question must have a single, narrow purpose; options per screen ≤4; required decisions before first value ≤3.

**3. Accessibility is a launch gate, not a cleanup task.** WCAG 2.2 AA contrast minimums, Dynamic Type support (iOS) / Accessibility Settings (Android), and VoiceOver/TalkBack labels are correctness requirements for App Store Review, not polish. The decision that changes: token system must encode contrast-safe palettes from the start (`DESIGN.md`); motion must have OS reduce-motion fallbacks (`design-visual-system.md`); build gates must include accessibility smoke tests via `xcodebuildmcp-testing.md` or `mobai-toolbelt.md`.

### Artifact This Tier Produces

- In `product/ONBOARDING.md`: a "cognitive load audit" row for each onboarding screen listing: choices count, text density rating (low/medium/high), and the single decision the screen owns.
- In `DESIGN.md`: contrast token validation note (WCAG AA confirmed or blocked-with-evidence).
- Blocker card `hcd-formative-research-skipped` (see Failure Cards shape) if no user test or data-informed finding exists before onboarding is locked.

### Failure Mode If Tier Is Ignored

The app ships with onboarding that felt obvious to the team and confuses real users. Drop-off concentrates at the first complex decision. The fix after launch is expensive (ASO cost, UA waste, negative reviews before the product earns a rating average). The lagging signal is Day-1 retention, but the root cause is a pre-launch research gap.

---

## Tier 2 Emotional Design

**Source thinkers.** Don Norman (visceral/behavioral/reflective design levels; affordances and signifiers; emotional design trilogy), Rosalind Picard (affective computing), Alan Cooper (goal-directed design; personas; the user is not the developer), Jesse James Garrett (elements of user experience).

### Ideas That Change A Launch Decision

**1. Three design levels operate simultaneously.** Norman's visceral (appearance/feel), behavioral (usability/function), and reflective (meaning/identity) levels are not sequential — all three fire from the first frame the user sees. A B2C mobile app that nails behavioral (works) but misses visceral (looks cheap) or reflective (feels generic) fails at the 5-star level and cannot reach 6 or 7 without a visual and copy redesign. The decision that changes: `DESIGN.md` must contain a deliberate choice for each level (palette/motion = visceral, interaction pattern = behavioral, brand voice/identity = reflective) before any screen is built. The `quality-lens.md` anti-generic check enforces the reflective level.

**2. Affordances and signifiers shape whether users discover features.** Norman distinguishes affordance (the action a thing can perform) from signifier (what signals that action to the user). An icon with no label affords a tap but signals nothing. Copy that says "Start" signals differently from "Build my plan." The decision that changes: every primary CTA in onboarding and the core loop must use the user's goal verb, not a generic action verb. Signifier audit belongs in the `product/ONBOARDING.md` copy column.

**3. Reflective design is where word-of-mouth originates.** Norman's reflective level is the "made for me" feeling — the emotional resonance that makes a user tell someone about an app. Picard's affective computing research grounds this in the finding that systems that acknowledge a user's emotional state are rated higher in trustworthiness and satisfaction. The decision that changes: the Intent Mirroring Card (above) is the primary engineering surface for reflective-level design; it is not optional.

### Artifact This Tier Produces

- In `DESIGN.md`: a three-level emotional tone block (visceral target, behavioral target, reflective target) — brief, one sentence each, before the token table.
- In `product/ONBOARDING.md`: a signifier audit column for each primary CTA confirming the button label uses the user's goal domain, not a generic verb.
- In `11_STAR_EXPERIENCE.md`: the 6-star and 7-star levels must map to at least one of the three Norman levels explicitly.

### Failure Mode If Tier Is Ignored

The app is functionally correct but emotionally neutral. It sits at 5-star (expected). Users complete onboarding and then do not return because nothing signaled that the product understood their goal. The fix is a copy and motion pass — fast to spec, slow to ship because it touches every screen — which delays the first retention data by weeks.

---

## Tier 3 Behavioral Science

**Source thinkers.** BJ Fogg (Behavior Model: B=MAP, Motivation × Ability × Prompt; Tiny Habits), Daniel Kahneman and Amos Tversky (prospect theory, loss aversion, peak-end rule), Richard Thaler (nudge, endowment effect), Dan Ariely (IKEA effect, predictably irrational), Nir Eyal (Hook Model), Chip and Dan Heath (made to stick — simplicity, surprise, concreteness, credibility, emotion, story), Robert Cialdini (commitment/consistency, social proof, reciprocity, scarcity, authority, liking), Wolfram Schultz (dopamine reward-prediction-error), Kent Berridge (wanting-vs-liking), Hengchen Dai (fresh-start effect — temporal landmarks increase goal pursuit). Kahneman and Barbara Fredrickson (peak-end rule: memory of an experience is dominated by its peak and its end, not its average).

### Ideas That Change A Launch Decision

**1. Fogg's B=MAP determines whether onboarding converts.** Motivation × Ability × Prompt: if any factor is zero, the behavior does not happen. The decision that changes: onboarding must maximize Motivation (show the result before asking for effort), maximize Ability (reduce steps to the minimum viable commitment), and time Prompts precisely (eligibility for the App Review prompt is earned at the first real-value moment, but the prompt itself fires later, outside first-run onboarding at a natural success, per `onboarding-conversion.md`; never inside first-run onboarding). Tiny Habits framing: anchor new in-app habits to existing user behaviors named in the Commitment Card.

**2. Peak-end rule determines what the user remembers.** Kahneman and Fredrickson showed that memory of an experience is the average of its emotional peak and its final moment — not the duration or average quality. The decision that changes: (a) design one clear emotional peak in the core loop (the Variable Reward Card reveal is the primary engineering surface for this); (b) design the session-end moment deliberately (the Intent Mirroring Card is the session-end surface); (c) do not let the user's last interaction each session be a paywall they declined.

**3. Fresh-start effect lowers the psychological cost of starting.** Hengchen Dai's research shows that temporal landmarks (new week, new month, post-milestone) increase goal initiation. The decision that changes: lifecycle notifications and in-app re-engagement prompts sent at natural temporal landmarks ("New week, same goal") outperform generic re-engagement copy. This is a `analytics/ANALYTICS.md` segmentation and `growth/EMAIL_OPS.md` send-time decision.

### Artifact This Tier Produces

The Four Experience Card Options above (Commitment Card, Variable Reward Card, Perceived Effort Delay Card, Intent Mirroring Card) are the primary artifacts for Tier 3. Additionally:

- In `product/ONBOARDING.md`: a B=MAP audit row for the onboarding sequence: Motivation score (high/medium/low and why), Ability score, Prompt placement.
- In `analytics/ANALYTICS.md`: a peak-end event pair — one event for the emotional peak (variable reward reveal) and one for session close (intent mirror or last core action). These two events feed the north-star retention dashboard.
- In `growth/EMAIL_OPS.md` or `analytics/ANALYTICS.md`: fresh-start segment definition and send-time rule.

### Failure Mode If Tier Is Ignored

The app works but does not stick. Day-7 retention is low not because the core loop is broken but because no deliberate peak was designed and no session end was shaped. Users remember leaving more than what they accomplished. The paywall is shown before Motivation is high enough (low Ability-×-Motivation product at the prompt moment), and conversion suffers. The fix requires a Fogg audit pass and a peak/end redesign — both are mid-to-late launch fixes with 2–4 week cycles.

---

## Tier 4 Service Design

**Source thinkers.** Service blueprinting (attribution-uncertain: commonly attributed to G. Lynn Shostack, 1982), customer journey mapping (attribution-uncertain: widely attributed to Oxford consultancy practice, 1990s), systems thinking (Jay Forrester / Donella Meadows), frontstage/backstage distinction (theatrical framing applied to service design, attribution-uncertain: Tresidder and Tresidder, adapted broadly).

### Ideas That Change A Launch Decision

**1. Frontstage and backstage failures look identical to the user.** A user who cannot load their personalized plan does not know whether the failure is a UI bug (frontstage) or a missing API call / RevenueCat entitlement gap (backstage). Service blueprinting forces the team to map both layers simultaneously. The decision that changes: `engineering/TECH_SPEC.md` must trace every onboarding screen and core loop screen to its backstage dependency (API, entitlement state, analytics event, permission). A missing trace is a known launch risk. The `failure-cards.md` provider cards (RevenueCat, PostHog, Sentry) are the service-blueprint backstage failure mitigations.

**2. Journey mapping reveals the moments before and after the app.** The user's emotional job did not start when they opened the App Store. It started when something in their life created a need. Service design maps the full arc: trigger → discovery (ad/word-of-mouth/App Store) → install → onboarding → first value → retention → lapse → re-engagement → word-of-mouth. The decision that changes: the paid UA creative (`PAID_UA.md`) and UGC playbook (`ugc-creator-engine.md`) must address the trigger moment (why the user's life produced this need _today_), not just feature benefits. The viral growth loop (`viral-growth-loops.md`) must map the word-of-mouth moment and the recipient's entry point.

**3. Systems thinking surfaces feedback loops that cause launch failures.** Common loop: low Day-7 retention → lower App Store rating → lower organic conversion → higher blended CPA → founder reduces spend → lower revenue → less investment in retention. Identifying the loop before launch changes the priority order: retention infrastructure (peak-end, Commitment Card, re-engagement) must ship before the UA spend scales. The decision that changes: do not unlock paid UA at scale without a Day-7 retention baseline. Record the unlock threshold in `PAID_UA.md` stop/scale rules.

### Artifact This Tier Produces

- In `engineering/TECH_SPEC.md`: a frontstage/backstage dependency table for each onboarding screen and core loop screen (frontstage element → backstage service/API/entitlement → failure mode → fallback behavior).
- In `state/LAUNCH_TRACE.md`: a journey-map row for the trigger-to-word-of-mouth arc, linking each moment to the surface that handles it.
- In `PAID_UA.md`: the Day-7 retention unlock threshold as a hard stop/scale rule.

### Failure Mode If Tier Is Ignored

The product launches with a polished frontstage (beautiful onboarding, smooth animations) and an unverified backstage (broken entitlement on restore, silent PostHog person-property gap, RevenueCat MISSING_METADATA). The user experience fails in production for edge-case states that were never mapped. The team discovers the failure from 1-star reviews and Sentry errors, not from pre-launch validation. The specific failure mode is the `subagent-findings-unintegrated` failure card: audits happened but the service layer was never traced end-to-end.

---

## Tier 5 Human-Centered AI

**Source institutions.** Stanford HAI, MIT CSAIL (Media Lab AI thread), CMU HCII AI track.

**Core concerns for consumer AI features.** Trust calibration (the user must neither over-trust nor under-trust the AI output), transparency (what the system knows and does not know), agency (the user retains meaningful control over their experience), and explainability (the user can understand why a result was produced, at a level appropriate to their context).

### Ideas That Change A Launch Decision

**1. Trust calibration is set by the first AI result.** If the first AI output is wrong, generic, or clearly uncalibrated to the user's actual context, trust resets to zero and rarely recovers in the same session (attribution-uncertain: consistent finding across HCI/HAI research on AI assistant trust, no single canonical citation). The decision that changes: the Perceived Effort Delay Card (above) is the primary trust-calibration engineering surface — showing the user what the AI considered signals competence before the result appears. The result itself must be qualified where appropriate ("Based on what you told me…") to signal the system's knowledge boundary. This is a copy rule, not a UI component. Add it to `strategy/BRAND.md §Voice` as a hard copy constraint.

**2. User agency must be preserved at every AI-generated step.** An AI feature that removes user choice — even when its recommendation is correct — is experienced as loss of control. Kahneman and Thaler's endowment effect implies users will resist being "corrected" by a system more than they resist correcting themselves. The decision that changes: every AI-generated recommendation, plan, or result must include a visible "change this" path within ≤2 taps. The Commitment Card feeds this: the user's own committed goal is the override authority for any AI output. If the AI suggests a different goal, it must ask, not replace.

**3. Explainability at the right altitude.** Full model explainability is not required for B2C mobile. What is required is _action-level transparency_: the user knows what triggered a recommendation and can trace it to something they did or said. "We suggested this because you said you want to improve focus on weekdays" is sufficient. Picard's affective computing research supports this: users who understand why a system responded feel more in control even when they cannot change the underlying logic.

### Artifact This Tier Produces

- In `strategy/BRAND.md §Voice` (or `DESIGN.md §Copy Rules`): a hard copy rule: every AI-generated result in the UI must include one sentence attributing the result to user-provided context. No AI output may claim certainty it cannot verify.
- In `PRODUCT.md`: for every AI feature, a "user agency path" specification: the specific tap path that lets the user override, redo, or dismiss the AI result within ≤2 taps.
- In `product/ONBOARDING.md`: a "trust ramp" note on the first AI reveal screen — what the system shows to signal that it has processed the user's specific input, not a generic output.

### Failure Mode If Tier Is Ignored

The AI feature ships without trust calibration copy or an agency path. Power users feel locked in. Casual users distrust the first generic result and do not explore further. The specific outcome is a "AI feels like a gimmick" 3-star review pattern — not a crash, not a missing feature, but a perception gap that is hard to diagnose from analytics alone. The fix is a copy and UX pass on AI result screens, a 1–2 week cycle that should have been a design constraint from the start.

---

## Bright-Line Guardrails

These apply to all five tiers and all four cards. Any implementation that crosses a dark line is a compliance veto: it must be removed before the build advances.

| Mechanism              | Bright Line                                                       | Dark Line                                                                                       | Veto Test                                             |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Commitment             | User-authored goal, revisable, used to personalize                | Guilt-trigger on churn, fake defaults that require opt-out                                      | Can user delete goal from settings in ≤2 taps?        |
| Variable Reward        | Reward is a real product outcome, variability in quality/surprise | Artificial withholding, slots-style monetization, requires payment/share to reveal              | Does a non-variable fallback exist?                   |
| Perceived Effort Delay | Each stage label maps to a real computation step                  | Fabricated stages, reset-near-100% fake progress bar, implies AI capability that does not exist | Is each label in engineering/TECH_SPEC.md?            |
| Intent Mirror          | Uses user's own words, dismissable in ≤1 tap, ≤once per session   | Guilt before paywall, blocks navigation, generic urgency copy                                   | Does it use user-authored phrase from committed goal? |
| Variable Reward motion | `DesignTokens.Motion` compliant, reduce-motion fallback           | Motion plays on OS reduce-motion enabled                                                        | Is fallback in DESIGN.md?                             |
| AI results             | Attributes result to user context, ≤2-tap override                | Claims certainty it cannot verify, removes user choice silently                                 | Is attribution copy in strategy/BRAND.md §Voice?      |
| Fresh-start            | Temporal landmarks user can recognize                             | Fake scarcity timers that reset                                                                 | Is countdown enforced server-side?                    |

---

## Analytics Contract

Every emotional moment must be measurable. These events are required in `analytics/ANALYTICS.md` before any Experience Card is shipped.

The four foundational Experience Cards' PostHog event names and properties (`commitment_made`, `variable_reward_revealed`, `perceived_effort_completed`, `intent_mirror_shown`, `intent_mirror_dismissed`) are defined once, canonically, in [`emotional-experience-measurement.md`](./emotional-experience-measurement.md) §§4-7 — load that section rather than restate the property list here; a second copy is how the schema drifts.

Events unique to this tier's AI-agency work, not owned by the card measurement file:

| Event Name                     | Fires When                                   | Required Properties                    |
| ------------------------------ | -------------------------------------------- | -------------------------------------- |
| `ai_result_trust_signal_shown` | AI attribution copy renders on result screen | `feature_context`                      |
| `ai_result_overridden`         | User taps "change this" path on AI result    | `feature_context`, `steps_to_override` |

All events must follow the naming rules in `analytics/ANALYTICS.md`. Add these to the event catalog in `analytics/ANALYTICS.md` before build, not after.

---

## Acceptance Checklist

Before calling the emotional/behavioral layer build-ready:

- [ ] All selected Experience Cards are specified in `product/ONBOARDING.md` and `PRODUCT.md` with copy, data source, PostHog event, and star-level mapping.
- [ ] Each card's bright-line guardrail is met (see table above).
- [ ] Dark-line tests pass: no guilt-trigger on churn, no artificial withholding, no fabricated AI stages, no intent mirror that blocks navigation.
- [ ] Perceived Effort Delay stage labels all trace to a step in `engineering/TECH_SPEC.md`.
- [ ] Variable Reward motion has a `prefers-reduced-motion` fallback in `DESIGN.md`.
- [ ] Intent Mirror copy includes a user-authored phrase (Commitment Card stored key or last session action) — brand-voice attestation attached.
- [ ] AI result screens have attribution copy and ≤2-tap override path specified in `PRODUCT.md`.
- [ ] All seven analytics events from the Analytics Contract are in `analytics/ANALYTICS.md`.
- [ ] Three-level emotional tone block (visceral/behavioral/reflective) is in `DESIGN.md`.
- [ ] Frontstage/backstage dependency table is in `engineering/TECH_SPEC.md` for each Experience Card screen.
- [ ] Peak-end event pair (reward reveal + session close) is in `analytics/ANALYTICS.md`.
- [ ] B=MAP audit row is in `product/ONBOARDING.md`.
- [ ] Journey-map row in `state/LAUNCH_TRACE.md` covers trigger → word-of-mouth arc.
- [ ] Day-7 retention unlock threshold recorded as hard stop/scale rule in `PAID_UA.md`.
- [ ] All selected cards are mapped to a star level in `11_STAR_EXPERIENCE.md`.
