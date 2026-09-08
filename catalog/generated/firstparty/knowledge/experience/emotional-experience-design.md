# Emotional Experience Design

Use this reference before any product, onboarding, paywall, or core-loop work where the goal is to make interactions feel charged with meaning — not merely functional. Apps that anticipate, solve, and reward action retain users because they create emotional memory, not just utility.
## Applicability And Evidence Boundary

Card selection is conditional; the discipline of making and reviewing that selection is core. Calm, predictable feedback and immediate completion can be the right emotional experience. Evaluate the actual user need before selecting novelty, anticipation, a commitment, or a reveal. Do not manufacture a behavioral loop to fill a card checklist.

Psychological theories and examples below motivate hypotheses. They do not establish a universal effect size, a guaranteed star-level improvement, or a measured benefit in this product. Keep observed user response separate from intended tone. Every applied card retains its ethics, truthful progress, accessibility and measurement obligations; marking another card non-applicable waives none of them.


Load [`eleven-star-experience.md`](eleven-star-experience.md) first. The star ladder defines the target emotional state; this reference defines the mechanics and verification to reach it. Load `analytics-attribution.md` before implementation: every emotional moment named here must emit a named PostHog event or it is unmeasurable.

## Contents

- The Four Experience Card Options
- Six-Lens Design Review Framework
- Emotional Curve Artifact
- Analytics Events For Emotional Moments
- Design And Motion Rules
- Bright Line: Serve vs Exploit
- Failure Cards
- Acceptance Checklist

---

## The Four Experience Card Options

Choose cards according to the user job and current flow. Evaluate the four patterns and record a reason for non-applicability. No card is mandatory merely because the product is a consumer app; a quiet utility may use none.

For each selected card: implement the pattern, emit the named PostHog event, verify the bright line, and record evidence in `engineering/PRODUCTION_READINESS.md`.

---

### Commitment Card

**Psychological basis:** Commitment and consistency principle (Cialdini, _Influence_, 1984): people align future behavior with prior commitments, especially when the commitment was active, public, or effortful. Goal-setting theory (Locke & Latham, 1990): specific, challenging goals produce higher performance than vague intentions. Implementation intentions (Gollwitzer, 1999): if-then plans convert stated goals into automatic action.

**What it is.** A deliberate, low-stakes commitment the user makes early — a goal statement, a preference selection, a personal target, a schedule — that the product then reflects back throughout the experience. The act of choosing creates ownership. Future prompts reference it, making the product feel continuous and personal.

**When to trigger.** During onboarding, at the first personalization question, or at the first time the user declares a goal or preference. The product must echo the commitment in downstream screens (plan summary, push copy, coach responses, progress headers, milestone labels).

**Bright line.**

- Bright side: the commitment reflects the user's real intent. The product uses it to serve them better.
- Dark side: using a low-stakes commitment to lock users into a subscription they did not explicitly understand, or using it to manufacture false social proof ("10,000 people with your goal started today"). Both are veto-level dark patterns.

**Guardrail (deterministic).** The commitment must be editable at any time from a settings or profile screen. If the user cannot update or delete their stated goal/commitment without a support ticket, this card is non-compliant.

**PostHog events.** Defined once, canonically, in [`emotional-experience-measurement.md`](./emotional-experience-measurement.md) §4 (Commitment Card Measurement) — do not restate the event names or properties here.

**11-star mapping.** Moves from 5-star (neutral setup form) to 6-star (product remembers me) or 7-star (product feels made for me). The commitment is evidence for the 7-star label in `11_STAR_EXPERIENCE.md`.

---

### Variable Reward Card

**Psychological basis.** Operant conditioning / variable-ratio reinforcement schedule (B.F. Skinner, _The Behavior of Organisms_, 1938): intermittent, unpredictable rewards produce the highest response rates and greatest resistance to extinction. Dopamine reward-prediction-error signal: dopamine fires on the anticipation of reward, not on receipt — the peak is the moment before the result is revealed (Wolfram Schultz, _Science_, 1997). Wanting vs liking dissociation: the dopamine system drives wanting/seeking but is dissociated from liking/pleasure (Kent Berridge, _Neuroscience & Biobehavioral Reviews_, 1996). Hook Model: Variable Reward (rewards of tribe, hunt, and self) is step 3 in the Trigger→Action→Variable Reward→Investment loop (Nir Eyal, _Hooked_, 2014).

**What it is.** A moment where the user takes an action, experiences a beat of anticipation, and receives a result that varies across a meaningful positive range — not a guaranteed outcome. The anticipation window is the emotional lever. The variation must be real, not cosmetic: the content, match quality, insight, recommendation, or experience must genuinely differ.

**When to trigger.** On the first result reveal, plan generation, match/recommendation surface, streak milestone check, or any core-loop completion where the outcome is legitimately variable. Do not apply this pattern to transactional, predictable confirmations (e.g. "payment received").

**Bright line.**

- Bright side: the variation reflects real personalization, discovery, or learning — the user genuinely does not know which insight or result they will see, and every possible result serves their goal.
- Dark side: simulated variation (randomized label on identical outcomes), artificial delay on a pre-computed result with no real variance, or loot-box mechanics where paid money buys uncertain outcomes. Gambling-adjacent mechanics in apps rated 4+ are a platform policy violation and a skill-level compliance veto.

**Guardrail (deterministic).** The result must be genuinely variable in content, not only in cosmetic framing. Document the actual source of variation and test representative controlled inputs. A deterministic confirmation is valid and should use ordinary feedback. No fixed variation percentage establishes honesty or user value. Record the proof method in `engineering/PRODUCTION_READINESS.md`.

**PostHog events.** Defined once, canonically, in [`emotional-experience-measurement.md`](./emotional-experience-measurement.md) §5 (Variable Reward Card Measurement) — do not restate the event names or properties here.

**11-star mapping.** Moves from 5-star (expected result shown immediately) to 6-star (result delivery feels meaningful) or 7-star (result feels personally discovered). Maps directly to the "dopamine pulse" moment in the experience ladder.

---

### Perceived Effort Delay Card

**Psychological basis.** Labor illusion / operational transparency: customers who can see effort being done on their behalf are more satisfied with the outcome and willing to pay more, even when the actual processing time is identical (Ryan Buell & Michael Norton, _Management Science_, 2011). IKEA effect: users value outcomes more when they participated in producing them (Norton, Mochon & Ariely, _Journal of Consumer Psychology_, 2012). Peak-end rule: the emotional peak of an experience and its end dominate the overall memory of it (Kahneman & Fredrickson, _Psychological Science_, 1993).

**What it is.** A deliberate, honest display of processing, assembly, or effort that makes the user perceive the output as crafted for them — not instantly auto-generated. The product shows its work: scanning steps, building a plan, analyzing data, assembling pieces. The actual time is tuned to feel earned, not slow. Only pending work justifies a wait. Completed steps may be summarized without delaying the ready result. It is honest if the displayed steps correspond to real operations; it is deceptive if the steps are cosmetic progress bars over pre-computed results.

**When to trigger.** Plan generation, personalized report creation, first AI analysis, match scoring, or any high-stakes first result where the user has invested several onboarding steps. Do not apply to routine CRUD operations or paywall interactions.

**Bright line.**

- Bright side: the displayed steps correspond to real computational steps without invented steps or delayed access, and the final output is genuinely assembled from the user's inputs. Whether the presentation helps understanding requires evaluation.
- Dark side: a purely cosmetic spinner on a pre-rendered result with zero relationship between the displayed steps and the actual computation. If the product team can ship a result in 50ms but adds a 4s spinner with fake steps, that is a deceptive dark pattern even if the result is accurate.

**Guardrail (deterministic).** Every displayed processing step must correspond to a real computational operation (data fetch, model inference, sorting, filtering, formatting, or rendering). The product spec must document the step-to-operation map in `engineering/TECH_SPEC.md`. If this cannot be verified, use a simpler loading state instead.

**PostHog events.** Defined once, canonically, in [`emotional-experience-measurement.md`](./emotional-experience-measurement.md) §6 (Perceived Effort Delay Card Measurement) — do not restate the event names or properties here.

**11-star mapping.** Moves from 5-star (instant generic result) to 6-star (result feels assembled for me) or 7-star (I believe the product worked hard on my behalf). Maps to the "higher perceived value" behavior on the star ladder.

---

### Intent Mirroring Card

**Psychological basis.** Reflective design: the highest tier of emotional design, where a product makes the user reflect on themselves, their values, or their goals (Don Norman, _Emotional Design_, 2004). Affective computing: systems that recognize, interpret, and respond to human emotional state create significantly stronger engagement and trust (Rosalind Picard, _Affective Computing_, 1997). Implementation intentions amplified by mirroring: when an if-then plan is read back to the user in their own language, follow-through rates increase (Gollwitzer, 1999).

**What it is.** A deliberate pause in the interaction where the product mirrors the user's stated intent back to them — in their own words, at a quiet moment, before the next action. Not a confirmation message. Not a summary screen. A pause with meaning: "You said you want to feel more confident before your presentation. Let's build that." The intent mirror turns a transactional interaction (I answered a question) into a meaningful moment (this product understands why I am here).

**When to trigger.** After the commitment is captured, before the paywall, after the first value reveal, or at the beginning of a session when the user returns. Limit to 1-2 triggers per session — overuse converts meaning into noise.

**Bright line.**

- Bright side: the mirror reflects the user's actual stated words or selections, back to them, in a way that serves their goal. It creates recognition and trust.
- Dark side: manufactured emotional urgency ("You said you were failing — don't give up now"), manipulative guilt ("Remember why you started?"), or mirror language that escalates anxiety to drive a purchase. These are dark patterns and a compliance veto.

**Guardrail (deterministic).** The mirrored content must use only fields the user explicitly provided (answer selections, free text, goal statements, commitment values). It must never infer or manufacture emotional states the user did not express. The implementation must be reviewed against `strategy/BRAND.md §Voice` to ensure the tone is warm, not coercive. The mirror must not be followed by a paywall or hard CTA in the same screen. Record the trigger source and content source in `engineering/PRODUCTION_READINESS.md`.

**PostHog events.** Defined once, canonically, in [`emotional-experience-measurement.md`](./emotional-experience-measurement.md) §7 (Intent Mirroring Card Measurement) — do not restate the event names or properties here.

**11-star mapping.** This is the 7-star mechanic: "made for me." The mirror is the moment the user believes the product knows them, not just their data. It is the experience that produces word-of-mouth.

---

## Six-Lens Design Review Framework

Run this review per feature or per journey before build handoff. Each lens has an exact question, evidence to capture on a real device, and a sub-score (0–2). Total score: 0–12. The total is a discussion aid. It cannot establish readiness or override a material defect.

These bands are canonical in [`emotional-design-system.md`](./emotional-design-system.md) §Emotional Review Framework. This file must not restate them differently.

Use this framework as the operative tool for any UX or onboarding audit subagent. Each finding must reference its lens, its score change, and its star-ladder level per the UX And Onboarding Audit Output Contract in `eleven-star-experience.md`.

---

### Lens 1: Human Goal / Job-To-Be-Done

**Exact question.** What is the user actually trying to accomplish at this step — not what the product makes them do, but what they hired the product to do?

**Evidence to capture.** On a real device: narrate the step aloud from the user's perspective. If the narration sounds like "I am completing the app's form" rather than "I am one step closer to my goal," the job is product-centric, not user-centric.

**Sub-score.**

- 0: the step serves the product's data collection or flow logic, not the user's goal.
- 1: the step serves the user's goal but the connection is implicit — the user has to trust it.
- 2: the step clearly, explicitly advances the user's named goal. The user can see why this step exists.

**Tool.** Use Alan Cooper's goal-directed design framing: design from the user's goal back to the interaction, not forward from the data model.

---

### Lens 2: Emotional Goal

**Exact question.** What emotional state is the user seeking at this moment — and does this screen move them toward it?

**Target state taxonomy.** Confidence, belonging, relief, progress, status, safety, delight, mastery. Name the target before the screen is designed.

**Evidence to capture.** On a real device: screenshot the screen. Write the target state in one word. Rate how strongly the screen delivers that state (0 = does not deliver, 1 = partially delivers, 2 = clearly delivers). Look at copy tone, visual weight, color energy, and motion direction.

**Sub-score.**

- 0: the screen has no emotional target or moves the user toward the wrong emotion (anxiety on a relief surface, confusion on a mastery surface).
- 1: the emotional target is implicit or partially served.
- 2: the screen clearly and intentionally delivers the target emotional state.

**Tool.** Norman's emotional design tiers (visceral/behavioral/reflective). The visceral tier (appearance) sets the first emotional tone; the behavioral tier (usability) sustains it; the reflective tier (meaning) locks it into memory.

---

### Lens 3: Emotional Journey

**Exact question.** Map the sequence: starting emotion → trigger → interaction → friction → resolution → end emotion. Where are the peaks and valleys?

**Evidence to capture.** On a real device, run the feature end-to-end. At each screen transition, write the user's likely emotional state in one word. Mark the highest point (emotional peak) and the lowest point (friction valley). The journey should reach an emotional high before or at the paywall, not after.

**Emotional Journey format (required artifact input for the EMOTIONAL CURVE):**

```
step_id | screen_label | starting_emotion | trigger | interaction | friction | resolution | end_emotion | peak_valley
```

Highs are marked `peak`. Lows are marked `valley`. The Emotional Curve is plotted from this data.

**Sub-score.**

- 0: the journey descends — the user ends a worse emotional state than they started.
- 1: the journey is flat — no peaks and no significant valleys.
- 2: the journey rises — there is at least one genuine emotional peak before the paywall or primary CTA.

**Tool.** Peak-end rule (Kahneman & Fredrickson): design for the emotional peak and the end state. These dominate the user's memory of the experience, not the average.

---

### Lens 4: Behavioral Analysis

**Exact question.** For this step: what is the user's motivation level, ability level, and what friction exists? Does the product call for action at the right moment?

**Framework.** Fogg Behavior Model (BJ Fogg, _Tiny Habits_, 2019): B = MAP. Behavior occurs when Motivation, Ability, and a Prompt align. High motivation tolerates low ability (complex tasks feel worth it). Low motivation requires high ability (frictionless tasks still happen). A prompt fires at the wrong motivation-ability moment produces abandonment.

**Evidence to capture.** On a real device: rate motivation at this step (1–5), rate ability/ease at this step (1–5), and rate friction (form complexity, copy density, required decisions, cognitive load, trust signals absent). Map the result: is the prompt firing at a high-motivation/high-ability moment?

Decision fatigue and cognitive load check: count the number of decisions on the screen. More than 2 distinct decisions on one screen is a cognitive load flag.

Habit b2c check: does this action fit into a daily routine the user already has, or does it require creating a new behavior pattern entirely?

**Sub-score.**

- 0: low motivation + low ability + high friction. The prompt fires at the worst possible moment.
- 1: motivation and ability are mismatched (high motivation, low ability with complex friction; or low motivation with low-friction but no reason to act now).
- 2: high motivation + high ability + low friction. The prompt fires at the right moment and the action feels easy.

---

### Lens 5: Experience Quality

**Exact question.** What tier of experience quality does this screen deliver — visceral, behavioral, or reflective — and is it consistent with the product's 7-star aspiration?

**Framework.** Norman's three tiers:

- Visceral: the appearance, motion, and sensory first impression. Does it feel premium in the first 500ms?
- Behavioral: the interaction — does it work smoothly, with feedback on every state, and without errors?
- Reflective: the meaning — does the screen make the user feel understood, special, or proud of their choice?

**Evidence to capture.** On a real device: time the first impression (under 500ms, does it feel right?). Tap every interactive element and check for loading, error, and empty states. Ask: "Would this user feel proud to show this screen to a friend?"

**Sub-score.**

- 0: visceral quality is poor (outdated styling, generic, mismatched tokens) and/or interaction has broken/missing states.
- 1: visceral and behavioral quality is acceptable, but reflective quality is absent — nothing makes the user feel understood.
- 2: all three tiers are present. The screen looks right, works smoothly, and means something to the user.

---

### Lens 6: Service Design

**Exact question.** How does this touchpoint connect to the rest of the user's journey — across platform, session, and failure state?

**Evidence to capture.** On a real device: test the failure path (network down, unexpected input, empty state, session restart). Does the product remember the user's progress? Does the error message tell the user what to do next? Is the cross-platform experience (notification, email, web, widget) consistent with the app's voice?

**Sub-score.**

- 0: failure states are missing or hostile. The product drops the user with no recovery path.
- 1: failure states exist but are generic. Cross-platform touchpoints (email, push) feel disconnected from the in-app voice.
- 2: failure states are graceful and on-brand. The product remembers the user's state across sessions. Cross-platform touchpoints feel like the same product.

---

## Emotional Curve Artifact

The −5..+5 valence scale, the peak-before-paywall rule, and the curve artifact contract are
defined once in [`emotional-design-system.md`](./emotional-design-system.md) §Emotional Review
Framework. Load that section rather than a second copy here — a curve spec that disagrees
with itself across two files is worse than one that lives in a single place.

## Analytics Events For Emotional Moments

The four foundational Experience Cards' events and properties are defined once, canonically, in
[`emotional-experience-measurement.md`](./emotional-experience-measurement.md) §§4-7 — load that
section rather than a second copy here, for the same reason the Emotional Curve spec above lives
in one place. This file adds only the event below, which the measurement file does not own:

```
peak_moment_reached     surface, step_id, emotional_target, score_contribution
```

Cross-reference the existing catalog in `analytics-attribution.md` before adding. `peak_moment_reached` should fire when a screen reaches a +3 or above valence point in the Emotional Curve; use the step_id and emotional_target from the Lens 3 journey map.

---

## Design And Motion Rules

Every emotional moment must be expressed in motion. Motion is a delight lever per `design-visual-system.md` and `design-room.md`.

**Web surfaces.** Use tokenized `motion/*` values from `DESIGN.md` promoted to CSS `--motion-*` variables. Drive animations with `motion/react` (framer-motion successor).

**Mobile binary.** Use the selected stack's promoted motion tokens and native animation API: SwiftUI animation, Flutter animation, React Native Reanimated, or an equivalent native adapter. Do not hardcode durations or easing values.

**Reduced-motion requirement.** Every delight moment that uses animation must implement a `prefers-reduced-motion` / OS reduce-motion check. The fallback must be a functional, non-animated version of the same interaction. Record fallback implementation for each card in `engineering/TECH_SPEC.md`.

**Timing guidance for each card:**

- Commitment Card echo: use a soft fade or gentle highlight (duration: `motion.durationFast`, 120ms) when the commitment value is reflected back.
- Variable Reward anticipation: use a pulsing or breathing animation during the anticipation window (window: 1.5–3s; each pulse rides `motion.durationBase` with the standard `motion.easing` curve); reveal uses a celebrate-family spring (response 0.45–0.5, dampingFraction 0.5–0.7 — `premium-mobile-craft.md` §1).
- Perceived Effort steps: step transitions use `motion.durationFast` between steps; the final reveal uses a celebrate-family spring.
- Intent Mirror: slow fade-in with a pause (duration: `motion.durationReveal`, 600ms) to signal this is a meaningful moment, not a transition.

---

## Bright Line: Serve vs Exploit

The bright-line/dark-line test, the regulatory basis, and the unconditional vetoes live in
[`ethics-guardrail.md`](./ethics-guardrail.md) §1 Bright-Line Vs Dark-Line Distinction. This
heading is kept because other files cite it by name; the rules themselves are not restated
here, because an ethics rule that drifts between two copies is the failure it exists to prevent.

## Failure Cards

These failure cards integrate with `failure-cards.md`. Open a card when the condition is detected; close it only when the evidence and fix requirements are met.

```yaml
id: "experience-card-not-implemented"
severity: "high"
owner: "product-leader"
status: "open"
evidence:
  - "engineering/TECH_SPEC.md"
  - "engineering/PRODUCTION_READINESS.md"
impact: "App is missing a selected Experience Card required by its accepted user-job rationale."
next_action: "Implement the selected cards or correct an unsupported applicability decision. Emit named PostHog events for each. Record bright-line compliance in engineering/PRODUCTION_READINESS.md."
validator: "npm run check:emotional-design -- --root ."
```

```yaml
id: "experience-card-dark-pattern"
severity: "critical"
owner: "product-leader"
status: "open"
evidence:
  - "engineering/PRODUCTION_READINESS.md"
impact: "One or more Experience Cards cross the bright line into manipulation. Platform policy violation risk and skill-level compliance veto."
next_action: "Identify which card crosses the bright line using the checklist in emotional-experience-design.md §Bright Line. Fix or remove the mechanic. Record resolution in engineering/PRODUCTION_READINESS.md."
validator: "npm run check:emotional-design -- --root ."
```

```yaml
id: "emotional-curve-missing"
severity: "medium"
owner: "design-guru"
status: "open"
evidence:
  - "emotional-design.html"
impact: "Emotional journey not mapped for key feature or onboarding flow. Peak placement relative to paywall is unknown."
next_action: "Run Lens 3 (Emotional Journey) from the Six-Lens Design Review on a real device for the affected feature. Produce the Emotional Curve in emotional-design.html. Verify curve peaks before the paywall marker."
validator: "npm run check:emotional-design -- --root ."
```

```yaml
id: "experience-card-event-missing"
severity: "medium"
owner: "engineering-leader"
status: "open"
evidence:
  - "analytics/ANALYTICS.md"
impact: "Experience Card is implemented but emits no PostHog event. Emotional moments are unmeasurable."
next_action: "Add missing events to analytics/ANALYTICS.md. Implement event emission for each Experience Card trigger and reveal. Verify events appear in PostHog activity view."
validator: "npm run check:attribution -- --root ."
```

```yaml
id: "experience-card-motion-no-fallback"
severity: "medium"
owner: "engineering-leader"
status: "open"
evidence:
  - "engineering/TECH_SPEC.md"
impact: "Experience Card animation has no prefers-reduced-motion fallback. Accessibility non-compliance."
next_action: "Implement prefers-reduced-motion / OS reduce-motion check for each animated Experience Card moment. Record fallback behavior in engineering/TECH_SPEC.md."
validator: "npm run check:design-room -- --root ."
```

---

## Acceptance Checklist

The acceptance checklist is [`ethics-guardrail.md`](./ethics-guardrail.md) §7 Acceptance
Checklist. `check:emotional-design` is what actually enforces it — a checklist restated in a
second file drifts from the validator without anything noticing.
