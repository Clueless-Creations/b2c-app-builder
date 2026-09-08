# {{APP_NAME}} Emotional Design Audit

Use this when you need a systematic record of the emotional quality of each user journey — onboarding, core loop, paywall, return sessions, failure states — against the selected Experience Cards and the Six-Lens Design Review Framework. Complete this artifact before marking any journey "build-ready" or "launch-ready." Discoveries map back to `eleven-star-experience.md` (star level), `analytics-attribution.md` (missing events), `failure-cards.md` (open cards), and `engineering/PRODUCTION_READINESS.md` (compliance evidence).

Load before this audit:

- `knowledge/experience/emotional-experience-design.md` — Six-Lens Framework, selected cards, bright-line checklist
- `knowledge/experience/emotional-experience-measurement.md` — per-card PostHog event catalog
- `knowledge/experience/eleven-star-experience.md` — star ladder and UX audit output contract
- `knowledge/data/analytics-attribution.md` — master event catalog; do not invent event names outside it
- `knowledge/experience/onboarding-conversion.md` — paywall timing and card sequencing rules
- `knowledge/design/design-room.md` and `knowledge/design/design-visual-system.md` — motion tokens and `prefers-reduced-motion` requirements

**Auditor:** {{AUDITOR_NAME}}
**App version audited:** {{APP_VERSION}}
**Audit date:** {{AUDIT_DATE}}
**Device / OS:** {{DEVICE_MODEL}} / {{OS_VERSION}}
**MobAI bridge active:** {{YES_NO}}

---

## Applicability Of This Example

The populated card blocks illustrate one product that selected these mechanics. They are not a required bundle for every app, and the intended emotional ratings are hypotheses rather than observed user outcomes. Keep the cards that serve the accepted user job; remove unused example rows and blocks. Every retained card keeps its truth, exit, accessibility and measurement obligations.

For a product that needs zero cards, remove all applied `experience_card:` blocks and record one fenced YAML mapping named `experience_card_selection` in the design artifact. Set `status` to `not_applicable` and provide product-specific `user_job`, `rationale` and `alternative` text, each at least 30 characters without placeholders. The auditor independently records the same fields in the audit artifact. See `knowledge/experience/emotional-design-system.md` for the exact shape. Do not insert that zero-card marker alongside this populated example. A score or empty map cannot replace the decision.

## Contents

- Audit Scope
- Scoring Rubric
- Per-Journey Audit Table
- Emotional Curve
- Top Opportunities Matrix
- Dark-Pattern Findings
- Measurement Gaps
- Open Failure Cards
- Prioritized Pathway
- Acceptance Checklist

---

## Audit Scope

### Journey Discovery Step

Do this BEFORE scoring — the ten rows below are a floor, not the scope. "Test every feature/user journey" means every reachable surface, not just the default flows.

1. Read the current MobAI MCP schema/resource (or run `mobai devices list --json`) → note the device ID → start the bridge through the exposed tool or `mobai bridge start` if needed → list installed apps through the current route.
2. Cold-start the app and walk it breadth-first: open every tab, every settings row, every empty state, every locked/upsell surface, every failure path you can trigger (airplane mode, bad input, forced logout).
3. Group the reachable screens into journeys by user intent (e.g. referral redemption, in-app event, social share, widget tap, account recovery, AI-delegation flow). Add a row per app-specific journey to the table below.
4. Confirm every journey has at least one row before you begin per-journey scoring. A journey left at "Pending" with no walk is an incomplete audit, not a pass.

List every journey audited. A journey is a named, end-to-end user flow that begins with a user intent and ends with a behavioral outcome. Walk each journey on a real device via MobAI. Capture at least one screenshot per screen transition.

| Journey ID | Journey Name                | Entry Point                           | Exit Condition                                  | Priority | Status  |
| ---------- | --------------------------- | ------------------------------------- | ----------------------------------------------- | -------- | ------- |
| J-01       | First-Launch Onboarding     | App cold-start                        | Paywall dismissed or trial started              | Critical | Pending |
| J-02       | Plan / Result Generation    | Core-loop trigger                     | Result reveal screen                            | Critical | Pending |
| J-03       | First Core-Loop Completion  | First user action inside app          | Session-close state                             | Critical | Pending |
| J-04       | Paywall (Direct)            | Paywall shown mid-session             | Purchase completed, trial started, or dismissed | Critical | Pending |
| J-05       | Return Session (Day 1–3)    | Re-open after first session           | Core action or drop                             | High     | Pending |
| J-06       | Streak / Progress Surface   | Home/dashboard view                   | User continues or closes                        | High     | Pending |
| J-07       | Lapse Re-Engagement         | Push or in-app after N-day gap        | Core action or drop                             | High     | Pending |
| J-08       | Failure / Error Recovery    | Network error, payment failure, crash | User resumes or exits                           | Medium   | Pending |
| J-09       | Subscription Management     | Settings > Billing or cancel intent   | User manages or exits                           | Medium   | Pending |
| J-10       | Milestone / Level-Up Moment | Threshold crossed                     | User continues or shares                        | Medium   | Pending |

Add or remove rows. Every journey must map to at least one step in the Per-Journey Audit Table below.

---

## Scoring Rubric

### Per-Step Score (0–10)

Each step in a journey receives a score from 0 to 10. The score is composed of two parts: a Six-Lens sub-score (0–12) converted to a 0–10 base, then adjusted by card coverage.

**Step 1: Six-Lens Sub-Score (0–12)**

Run all six lenses against the step on a real device. Sum the sub-scores.

| Lens                                | Question                                                                                                                              | Evidence Required                                                                                                           | Sub-Score |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| L1 Human Goal / JTBD                | Does this step clearly advance the user's named goal, not the product's data model?                                                   | Narration test on device: does it sound like "I am one step closer to my goal" or "I am filling a form"?                    | 0 / 1 / 2 |
| L2 Emotional Goal                   | Does the screen deliver the target emotional state named before design?                                                               | Screenshot + one-word target state + delivery rating. Check copy tone, visual weight, color, motion direction.              | 0 / 1 / 2 |
| L3 Emotional Journey                | Does the step's position on the emotional arc contribute to a rising curve that peaks before the paywall?                             | Emotional Journey table completed; valence score assigned; peak placement verified.                                         | 0 / 1 / 2 |
| L4 Behavioral Analysis (Fogg B=MAP) | Does the prompt fire at a high-motivation / high-ability / low-friction moment?                                                       | Rate Motivation (1–5), Ability (1–5), Friction (decision count, copy density, cognitive load). Flag if decision count > 2.  | 0 / 1 / 2 |
| L5 Experience Quality (Norman)      | Does the screen deliver all three tiers — visceral, behavioral, reflective — consistent with 7-star aspiration?                       | 500ms first-impression check; tap every interactive element; "Would the user show this to a friend?" test.                  | 0 / 1 / 2 |
| L6 Service Design                   | Are failure states graceful, recovery paths clear, and cross-platform touchpoints (push, email, widget) consistent with in-app voice? | Test failure path on device (network down, unexpected input, session restart). Check push/email copy for brand voice match. | 0 / 1 / 2 |

**Step 2: Convert to 0–10 Base**

Divide lens total by 12, multiply by 10, round to one decimal.

`base_score = (lens_total / 12) × 10`

**Step 3: Card Coverage Adjustment (±1.0 max)**

For each Experience Card that is present and correctly triggered at this step, add +0.25. For each card that is missing but clearly applicable, subtract −0.25. Cap the total adjustment at +1.0 / −1.0.

`step_score = clamp(base_score + card_adjustment, 0, 10)`

**Using scores in review**

Scores summarize the reviewer's observations and uncertainty. They do not establish user emotion, prescribe a card, or authorize build or launch. Diagnose each material defect and inspect its repair. A quiet, predictable flow may be appropriate without additional mechanics.

**Per-Journey Score**

A journey average can help prioritize investigation. Record the underlying findings so an average cannot conceal a serious failure or recovery defect.

**Per-App Score**

An aggregate is a discussion aid. Acceptance requires current evidence for the selected product and all critical journeys, regardless of the total.

**Score vs Star Ladder Cross-Reference**

| Step Score | Star Level | Star Label                      |
| ---------- | ---------- | ------------------------------- |
| 0.0 – 2.0  | 1–2        | Failure / Friction              |
| 3.0 – 4.9  | 3–4        | Below expected                  |
| 5.0 – 6.9  | 5–6        | Expected / Better than expected |
| 7.0 – 7.9  | 6–7        | Way beyond ("made for me")      |
| 8.0 – 10.0 | 7          | Way beyond (peak step)          |

A single step caps at **7-star**. The 10/11-star concierge / absurd-extreme designations describe the whole-product experience in `11_STAR_EXPERIENCE.md`, never an individual screen — do not record a step as 10/11-star.

---

## Six-Lens Review Summary

Roll up the per-step Six-Lens scores into one app-level read. The per-journey tables below carry the detail; this is the founder-facing summary.

| Lens                           | App-Level Read | Weakest Journey | Strongest Journey | Lift Priority |
| ------------------------------ | -------------- | --------------- | ----------------- | ------------- |
| L1 Human Goal / JTBD           | Pending        | Pending         | Pending           | Pending       |
| L2 Emotional Goal              | Pending        | Pending         | Pending           | Pending       |
| L3 Emotional Journey (curve)   | Pending        | Pending         | Pending           | Pending       |
| L4 Behavioral (Fogg B=MAP)     | Pending        | Pending         | Pending           | Pending       |
| L5 Experience Quality (Norman) | Pending        | Pending         | Pending           | Pending       |
| L6 Service Design              | Pending        | Pending         | Pending           | Pending       |

---

## Card Application Inventory

Where each selected Experience Card is currently present, missing, or misused across the audited journeys. This is the bridge from audit findings to the Card Application Map in `EMOTIONAL_DESIGN.md`. Add rows for any additional deck cards (Endowed Progress, Peak-End, Streak, etc.) that the app uses or should use.

| Experience Card             | Present At | Missing / Misused At | Star Level Affected | Dark-Pattern Flag | Pathway Priority |
| --------------------------- | ---------- | -------------------- | ------------------- | ----------------- | ---------------- |
| Commitment Card             | Pending    | Pending              | 6                   | Pending           | Pending          |
| Variable Reward Card        | Pending    | Pending              | 6                   | Pending           | Pending          |
| Perceived Effort Delay Card | Pending    | Pending              | 6                   | Pending           | Pending          |
| Intent Mirroring Card       | Pending    | Pending              | 7                   | Pending           | Pending          |

**How to fill "Pathway to Better State" (every per-journey table and opportunity row):** a pathway entry is not a one-liner. Each must name (1) which card to apply first and which lens failure it fixes, (2) the trigger moment (screen name + user state), (3) a one-sentence copy or interaction sketch in the user's own goal language, (4) the PostHog event that measures the improvement, (5) the artifact to update (`EMOTIONAL_DESIGN.md` / `analytics/ANALYTICS.md` / `engineering/TECH_SPEC.md`), and (6) the expected star-level gain. A pathway that does not name a card and an event is incomplete.

---

## Counter-Metric Summary

For every HIGH-risk card the app applies (Variable Reward, Streak, Scarcity, Urgency, Social Proof), record the dark-pattern backfire signal being watched. A HIGH-risk card with no counter-metric in production is a blocking finding, not a polish item — mirror it to `lanes.emotional_design.blockers`.

| Card                   | Counter-Metric (PostHog)                                                                                  | Threshold To Investigate                        | Currently Monitored? |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------- |
| Variable Reward Card   | `variable_reward_opt_out` rate; sub-500ms reveal dismissal; reviews mentioning "addictive"/"slot machine" | >15% opt-out; >25% fast-dismiss; any 3+ reviews | Pending              |
| Streak (if applied)    | streak-break churn; `notification_disabled` 48h cohort                                                    | any churn spike on break                        | Pending              |
| Perceived Effort Delay | `perceived_effort_cancelled`; reviews mentioning "fake"/"just a spinner"                                  | >10% cancel; any 3+ reviews                     | Pending              |
| Intent Mirroring       | `subscription_cancelled` within 24h of `intent_mirror_shown` on a cancel surface                          | any spike                                       | Pending              |

---

## Per-Journey Audit Table

One block per audited journey. Walk each on a real device (see Device Walk Protocol). The compact table is the per-step read; the **Findings & Pathway** block under each table carries the observed emotion, the friction, and the concrete **Pathway to Better State** for any step that needs one — keeping the table readable while still meeting the six-part pathway contract above.

- **Score / Band:** 0–3 Broken · 3.1–5.9 Functional · 6–7.9 Competent · 8–10 Elevated. A single step caps at **7-star** (see Scoring Rubric); the 10/11-star designation is whole-product only.
- **Valence:** −5 … +5 — this column is the data source for that journey's Emotional Curve.
- **Dark Flag:** note any bright-line concern to verify (e.g. "Check: not on same screen as paywall CTA"); a confirmed crossing opens an `experience-card-dark-pattern` failure card.

### Journey J-01: First-Launch Onboarding

**Journey brief:** Cold-start through first paywall interaction. Primary goal: user understands the product promise, makes a commitment, experiences a personalized plan reveal, and reaches the paywall having already felt value.

**Prerequisite before walking:** MobAI bridge active on the target device. Screenshot every screen transition. Assign emotional valence (−5 to +5) to each step for the Emotional Curve.

| Step | Screen                     | Human → Emotional Goal                                            | Cards Present                  | Cards Missing / Misused | Dark Flag                                | Valence | Score / Band |
| ---- | -------------------------- | ----------------------------------------------------------------- | ------------------------------ | ----------------------- | ---------------------------------------- | ------- | ------------ |
| 1    | Splash / Value Promise     | Understand what this app does for me → Curiosity, intrigue        | None                           | None observed           | None                                     | 0       | Pending      |
| 2    | Attribution Question       | Tell where I heard about this → Neutral / cooperative             | None                           | None observed           | None                                     | 0       | Pending      |
| 3    | Goal / Commitment Question | Declare my intent → Ownership, investment                         | Commitment Card                | —                       | None                                     | +1      | Pending      |
| 4    | Personalization Q2–Q4      | Answer questions about my situation → Relevance, being understood | Commitment Card (echo)         | —                       | None                                     | +1      | Pending      |
| 5    | Effort / Processing Screen | See the system work on my behalf → Trust, anticipation            | Perceived Effort Delay         | —                       | None                                     | +2      | Pending      |
| 6    | Personalized Plan Reveal   | See a plan that reflects my answers → Delight, recognition        | Variable Reward, Intent Mirror | —                       | None                                     | +3      | Pending      |
| 7    | Intent Mirror Screen       | Have my goal reflected back to me → Recognition, resonance        | Intent Mirroring               | —                       | Check: not on same screen as paywall CTA | +4      | Pending      |
| 8    | Paywall                    | Decide whether to unlock full value → Confidence, momentum        | None (intentionally)           | —                       | Check: paywall after value peak          | +2      | Pending      |

**Six-Lens Summary for J-01**

| Lens                   | Highest-friction step | Evidence | Score |
| ---------------------- | --------------------- | -------- | ----- |
| L1 Human Goal / JTBD   | Pending               | Pending  | —     |
| L2 Emotional Goal      | Pending               | Pending  | —     |
| L3 Emotional Journey   | Pending               | Pending  | —     |
| L4 Behavioral Analysis | Pending               | Pending  | —     |
| L5 Experience Quality  | Pending               | Pending  | —     |
| L6 Service Design      | Pending               | Pending  | —     |

**Findings & Pathway — J-01.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-01 Score:** Pending

---

### Journey J-02: Plan / Result Generation

**Journey brief:** User triggers the core-loop action. System processes. Result is revealed. Card sequence: Perceived Effort Delay → Variable Reward.

| Step | Screen                    | Human → Emotional Goal                                         | Cards Present                  | Cards Missing / Misused | Dark Flag | Valence | Score / Band |
| ---- | ------------------------- | -------------------------------------------------------------- | ------------------------------ | ----------------------- | --------- | ------- | ------------ |
| 1    | Core Action Trigger       | Begin the thing I came here for → Readiness, agency            | None                           | None                    | None      | 0       | Pending      |
| 2    | Processing Screen         | Trust the system is working on my inputs → Anticipation, trust | Perceived Effort Delay         | —                       | None      | +2      | Pending      |
| 3    | Anticipation Window       | The moment before result reveal → Suspense, excitement         | Variable Reward (anticipation) | —                       | None      | +3      | Pending      |
| 4    | Result Reveal             | Receive a result that feels made for me → Delight, discovery   | Variable Reward (reveal)       | —                       | None      | +4      | Pending      |
| 5    | Post-Result / Next Action | Know what to do next → Confidence, momentum                    | None                           | None                    | None      | +2      | Pending      |

**Findings & Pathway — J-02.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-02 Score:** Pending

---

### Journey J-03: First Core-Loop Completion

**Journey brief:** User completes first meaningful action. System acknowledges the completion. Session-close state is reached.

| Step | Screen                  | Human → Emotional Goal                                         | Cards Present                 | Cards Missing / Misused | Dark Flag | Valence | Score / Band |
| ---- | ----------------------- | -------------------------------------------------------------- | ----------------------------- | ----------------------- | --------- | ------- | ------------ |
| 1    | First Action Screen     | Do the thing I signed up for → Focus, readiness                | None                          | None                    | None      | +1      | Pending      |
| 2    | In-Progress State       | See I am making progress → Commitment, momentum                | Commitment Card (echo)        | —                       | None      | +2      | Pending      |
| 3    | Completion Confirmation | Hear that I succeeded → Pride, satisfaction                    | Peak-End Card (if applicable) | —                       | None      | +4      | Pending      |
| 4    | Session Close / Summary | Remember this session positively → Satisfaction, return intent | Peak-End Card                 | —                       | None      | +3      | Pending      |

**Findings & Pathway — J-03.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-03 Score:** Pending

---

### Journey J-04: Paywall (Direct)

**Journey brief:** Paywall appears mid-session or at end of onboarding. User evaluates the offer and either converts, starts a trial, or dismisses.

| Step | Screen                             | Human → Emotional Goal                                        | Cards Present                            | Cards Missing / Misused                       | Dark Flag                               | Valence | Score / Band |
| ---- | ---------------------------------- | ------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------- | --------------------------------------- | ------- | ------------ |
| 1    | Paywall Entry                      | Understand what I get and for how much → Confidence, fairness | None                                     | Check: no Experience Card should trigger here | Confirm no card CTA coupled to purchase | 0       | Pending      |
| 2    | Trial Start or Purchase            | Make a safe, reversible choice → Trust, relief                | None                                     | None                                          | None                                    | +1      | Pending      |
| 3    | Post-Purchase / Trial Confirmation | Know my choice landed → Confidence, excitement                | Commitment Card (echo of goal at unlock) | —                                             | None                                    | +2      | Pending      |

**Findings & Pathway — J-04.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-04 Score:** Pending

---

### Journey J-05: Return Session (Day 1–3)

**Journey brief:** User returns within the D1–D3 window. Product must re-establish the commitment, minimize re-entry friction, and drive the user to complete a core action.

| Step | Screen                     | Human → Emotional Goal                         | Cards Present                                     | Cards Missing / Misused | Dark Flag | Valence | Score / Band |
| ---- | -------------------------- | ---------------------------------------------- | ------------------------------------------------- | ----------------------- | --------- | ------- | ------------ |
| 1    | Home / Dashboard           | Pick up where I left off → Continuity, comfort | Commitment Card (echo), Streak Card if applicable | —                       | None      | +1      | Pending      |
| 2    | Re-entry Prompt / Push-Tap | Be reminded why I started → Recognition        | Intent Mirroring (return-session trigger)         | —                       | None      | +2      | Pending      |
| 3    | Core Action Entry          | Begin today's session → Readiness              | None                                              | None                    | None      | +1      | Pending      |

**Findings & Pathway — J-05.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-05 Score:** Pending

---

### Journey J-06: Streak / Progress Surface

**Journey brief:** User views their streak, progress indicator, or level state on the home screen or dashboard.

| Step | Screen                     | Human → Emotional Goal                              | Cards Present                           | Cards Missing / Misused | Dark Flag                          | Valence | Score / Band |
| ---- | -------------------------- | --------------------------------------------------- | --------------------------------------- | ----------------------- | ---------------------------------- | ------- | ------------ |
| 1    | Home/Dashboard Streak View | See my progress at a glance → Pride, accountability | Streak / Loss Aversion Card             | —                       | Check: no countdown panic language | +1      | Pending      |
| 2    | Streak Milestone Trigger   | Celebrate a real achievement → Pride, reinforcement | Streak Card (milestone), Peak-End Card  | —                       | None                               | +4      | Pending      |
| 3    | Streak At-Risk State       | Be nudged, not shamed → Concern without guilt       | Streak Card (at-risk), Fresh Start Card | —                       | Check: no guilt framing            | −1      | Pending      |

**Findings & Pathway — J-06.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-06 Score:** Pending

---

### Journey J-07: Lapse Re-Engagement

**Journey brief:** User has been inactive for N or more days. Product attempts re-engagement via push, email, or in-app fresh-start moment.

| Step | Screen                | Human → Emotional Goal                                 | Cards Present                                     | Cards Missing / Misused | Dark Flag                        | Valence | Score / Band |
| ---- | --------------------- | ------------------------------------------------------ | ------------------------------------------------- | ----------------------- | -------------------------------- | ------- | ------------ |
| 1    | Push / Email Re-Entry | Understand why I am being contacted → Safety, no shame | Fresh Start Card                                  | —                       | Check: no gap-duration shaming   | 0       | Pending      |
| 2    | Fresh Start Screen    | Begin fresh without penalty → Relief, agency           | Fresh Start Card, Intent Mirroring (return type)  | —                       | Check: no paywall on this screen | +2      | Pending      |
| 3    | Re-Commitment Prompt  | Recommit on my own terms → Ownership, investment       | Commitment Card (edit / re-commit), Identity Card | —                       | Check: no guilt language         | +3      | Pending      |
| 4    | Core Action Entry     | Begin immediately → Momentum                           | None                                              | None                    | None                             | +2      | Pending      |

**Findings & Pathway — J-07.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-07 Score:** Pending

---

### Journey J-08: Failure / Error Recovery

**Journey brief:** User encounters a network error, payment failure, or crash. Product must acknowledge, recover, and maintain trust.

| Step | Screen                              | Human → Emotional Goal                          | Cards Present                            | Cards Missing / Misused | Dark Flag                                         | Valence | Score / Band |
| ---- | ----------------------------------- | ----------------------------------------------- | ---------------------------------------- | ----------------------- | ------------------------------------------------- | ------- | ------------ |
| 1    | Error State                         | Understand what went wrong → Safety, clarity    | Recovery and Trust Repair Card           | —                       | Check: no paywall or spend prompt on error screen | −2      | Pending      |
| 2    | Recovery Action                     | Do something concrete to fix it → Agency, trust | Recovery and Trust Repair Card           | —                       | None                                              | 0       | Pending      |
| 3    | Restorative Gesture (if applicable) | Receive a goodwill signal → Relief, goodwill    | Recovery and Trust Repair Card (gesture) | —                       | Check: gesture is unconditional                   | +1      | Pending      |

**Findings & Pathway — J-08.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-08 Score:** Pending

---

### Journey J-09: Subscription Management

**Journey brief:** User navigates to billing settings, views subscription details, and either continues or initiates cancellation.

| Step | Screen                   | Human → Emotional Goal                                | Cards Present | Cards Missing / Misused                                 | Dark Flag                                                               | Valence | Score / Band |
| ---- | ------------------------ | ----------------------------------------------------- | ------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ------- | ------------ |
| 1    | Settings / Billing Entry | Manage my subscription clearly → Transparency, safety | None          | None                                                    | None                                                                    | 0       | Pending      |
| 2    | Cancel Intent Screen     | See my options without pressure → Autonomy, respect   | None          | Check: no Experience Card should trigger on cancel flow | Confirm no Intent Mirror or Fresh Start on cancel as retention friction | −1      | Pending      |
| 3    | Confirmation / Exit      | Complete the action cleanly → Closure, relief         | None          | None                                                    | None                                                                    | 0       | Pending      |

**Findings & Pathway — J-09.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-09 Score:** Pending

---

### Journey J-10: Milestone / Level-Up Moment

**Journey brief:** User crosses a mastery or achievement threshold. Product delivers a peak moment.

| Step | Screen            | Human → Emotional Goal                                     | Cards Present                            | Cards Missing / Misused | Dark Flag                        | Valence | Score / Band |
| ---- | ----------------- | ---------------------------------------------------------- | ---------------------------------------- | ----------------------- | -------------------------------- | ------- | ------------ |
| 1    | Milestone Trigger | Have my effort acknowledged → Pride, validation            | Mastery and Status Card, Peak-End Card   | —                       | None                             | +4      | Pending      |
| 2    | Level-Up Reveal   | Experience the peak moment → Delight, status               | Mastery and Status Card, Variable Reward | —                       | Check: no paywall on same screen | +5      | Pending      |
| 3    | Share / Continue  | Act on the peak (share or continue) → Generosity, momentum | Identity and Self-Expression Card        | —                       | None                             | +3      | Pending      |

**Findings & Pathway — J-10.** Per step: record observed emotion + friction. For any step scoring < 6 or with a missing/misused card, write a pathway entry in the six-part shape (card · lens fixed · trigger · copy sketch · `event` · artifact · +★):

- _Step N — observed: [emotion]; friction: [note]. Pathway to better state → apply **[Card]** ([lens it fixes]); trigger [screen + user state]; sketch "[copy in the user's goal language]"; event `[posthog_event]`; update `[EMOTIONAL_DESIGN.md / analytics/ANALYTICS.md / engineering/TECH_SPEC.md]`; gain [+N★]._

**Journey J-10 Score:** Pending

---

## Emotional Curve

One curve per journey, plotted from the **Valence** column of that journey's per-journey table — so curve data is collected automatically during every walk, not as a separate step. Render one line chart per journey in the dedicated `emotional-design.html` board using design tokens from `DESIGN.md` (CSS variables).

**Acceptance Rule:** the curve must cross **+2** (emotional value threshold) at or before that journey's paywall / spend marker. A journey whose first +2 crossing occurs after the paywall is a conversion design failure → open `emotional-curve-peak-after-paywall`. A journey with no rendered curve → open `emotional-curve-missing`.

**Reduced-Motion Rule:** if the rendered curve animates the line draw, a `prefers-reduced-motion` check must render a static chart instead.

### Per-Journey Curve Markers

Fill from each per-journey table. Every journey gets a row; the peak/paywall check is what gates the journey. (Return/lapse journeys mark their re-engagement paywall or any spend prompt as the paywall marker; journeys with no spend surface mark it `n/a`.)

| Journey                         | Steps | Peak Step (highest valence) | First +2 Crossing | Paywall / Spend Marker | Peak before paywall? | Valley (if negative) |
| ------------------------------- | ----- | --------------------------- | ----------------- | ---------------------- | -------------------- | -------------------- |
| J-01 First-Launch Onboarding    | 8     | Step 7 (target)             | Pending           | Step 8                 | Pending              | —                    |
| J-02 Plan / Result Generation   | 5     | Step 4 (target)             | Pending           | n/a                    | Pending              | —                    |
| J-03 First Core-Loop Completion | 4     | Step 3 (target)             | Pending           | n/a                    | Pending              | —                    |
| J-04 Paywall (Direct)           | 3     | Step 3 (target)             | Pending           | Step 1                 | Pending              | —                    |
| J-05 Return Session (D1–3)      | 3     | Step 2 (target)             | Pending           | n/a                    | Pending              | —                    |
| J-06 Streak / Progress          | 3     | Step 2 (target)             | Pending           | n/a                    | Pending              | Step 3 (at-risk)     |
| J-07 Lapse Re-Engagement        | 4     | Step 3 (target)             | Pending           | n/a                    | Pending              | —                    |
| J-08 Failure / Error Recovery   | 3     | Step 3 (target)             | Pending           | n/a                    | Pending              | Step 1 (error)       |
| J-09 Subscription Management    | 3     | Step 1 (target)             | Pending           | n/a                    | Pending              | Step 2 (cancel)      |
| J-10 Milestone / Level-Up       | 3     | Step 2 (target)             | Pending           | n/a                    | Pending              | —                    |

Label the highest-valence step `peak`, the paywall/spend step `paywall`, and any negative step `valley` in the journey's own table. Add rows for app-specific journeys discovered in the Journey Discovery step.

---

## Top Opportunities Matrix

List the highest-leverage improvements across all journeys. Rank by combined emotional impact and business impact.

| Priority | Journey | Step    | Opportunity | Card to Apply | Emotional Impact | Business Impact | Effort  | Star Level Gain |
| -------- | ------- | ------- | ----------- | ------------- | ---------------- | --------------- | ------- | --------------- |
| 1        | Pending | Pending | Pending     | Pending       | Pending          | Pending         | Pending | Pending         |
| 2        | Pending | Pending | Pending     | Pending       | Pending          | Pending         | Pending | Pending         |
| 3        | Pending | Pending | Pending     | Pending       | Pending          | Pending         | Pending | Pending         |
| 4        | Pending | Pending | Pending     | Pending       | Pending          | Pending         | Pending | Pending         |
| 5        | Pending | Pending | Pending     | Pending       | Pending          | Pending         | Pending | Pending         |

**How to complete this table:**

- Identify steps scoring below 6.0 in the Per-Journey table.
- For each, identify which card from `emotional-experience-design.md` addresses the root lens failure.
- Rate Emotional Impact (High / Medium / Low) using the lens sub-scores: a +2 swing on L2 or L3 is High.
- Rate Business Impact by mapping to funnel metrics: onboarding completion → trial start → D1 return → D7 return.
- Rate Effort as Small (< 1 day), Medium (1–3 days), Large (3+ days).

---

## Dark-Pattern Findings

Record every instance where an Experience Card trigger crosses or approaches the bright line defined in `emotional-experience-design.md §Bright Line`. Every critical finding opens a failure card of type `experience-card-dark-pattern` with severity `critical`.

| Finding ID | Journey | Step    | Card Involved | Observation | Bright-Line Crossed? | Compliance Veto? | Failure Card ID | Status  |
| ---------- | ------- | ------- | ------------- | ----------- | -------------------- | ---------------- | --------------- | ------- |
| DP-01      | Pending | Pending | Pending       | Pending     | Pending              | Pending          | Pending         | Pending |

**Bright-Line Checklist Per Finding**

Answer all six for every finding. All must be Yes to pass. Any No is a dark-pattern failure.

- [ ] The user can always choose to leave, cancel, or skip without a penalty or guilt-laden interstitial.
- [ ] The commitment is editable by the user at any time from a settings or profile screen.
- [ ] The variable reward variation is real content variation, not cosmetic (label or animation change only).
- [ ] The perceived effort steps correspond to real computational operations (complete step-to-operation mapping in `engineering/TECH_SPEC.md`).
- [ ] The intent mirror uses only fields the user explicitly provided — no inferred or manufactured emotional states.
- [ ] None of the selected card triggers are coupled to a paywall CTA on the same screen.

---

## Measurement Gaps

For each card-present or card-missing finding in the Per-Journey table, verify the named PostHog event appears in the PostHog activity view. If it is absent, record it here.

| Journey | Step | Card                   | Required Event                         | Properties Required                                                  | PostHog Status | Failure Card ID |
| ------- | ---- | ---------------------- | -------------------------------------- | -------------------------------------------------------------------- | -------------- | --------------- |
| J-01    | 3    | Commitment Card        | `commitment_made`                      | commitment_type, commitment_value, flow_id, step_id                  | Pending        | Pending         |
| J-01    | 4    | Commitment Card        | `commitment_echoed`                    | surface, commitment_type, commitment_value                           | Pending        | Pending         |
| J-01    | 5    | Perceived Effort Delay | `perceived_effort_started`             | computation_type, user_inputs_referenced_count, reduce_motion_active | Pending        | Pending         |
| J-01    | 6    | Variable Reward        | `variable_reward_anticipation_started` | surface, reward_type, flow_id                                        | Pending        | Pending         |
| J-01    | 6    | Variable Reward        | `variable_reward_revealed`             | surface, reward_type, reward_variant, anticipation_duration_ms       | Pending        | Pending         |
| J-01    | 7    | Intent Mirroring       | `intent_mirror_shown`                  | surface, mirror_type, source_field, trigger_context                  | Pending        | Pending         |
| J-01    | 7    | Intent Mirroring       | `intent_mirror_continued`              | surface, next_action                                                 | Pending        | Pending         |
| J-03    | 3    | Peak-End Card          | `peak_moment_reached`                  | surface, personalization_field, result_value, session_id             | Pending        | Pending         |
| J-03    | 4    | Peak-End Card          | `session_close_shown`                  | surface, close_type, completion_signal_present                       | Pending        | Pending         |

Add rows for each missing event discovered during the audit. Cross-reference the master catalog in `analytics/ANALYTICS.md` before naming an event. Open an `experience-card-event-missing` failure card for each row that stays blank.

---

## Open Failure Cards

List all failure cards opened during this audit. Record these through the reducer in `state/business-state.json` under the `emotional_design` lane blockers.

```yaml
# Record the card through the reducer; do not copy this YAML into runtime state.
# Link persistent blockers from operations/FAILURE_CARDS.md.

id: "{{FAILURE_CARD_ID}}"
severity: "{{critical|high|medium|low}}"
owner: "{{product-leader|engineering-leader|design-guru}}"
status: "open"
detected_at: "{{AUDIT_DATE}}"
evidence:
  - "EMOTIONAL_AUDIT.md §Dark-Pattern Findings"
  - "engineering/PRODUCTION_READINESS.md"
impact: "{{Description of emotional and business impact}}"
next_action: "{{Concrete next step with artifact and command}}"
validator: "npm run check:emotional-design -- --root ."
```

**Standard cards to open when conditions are met:**

| Condition                                                                 | Card ID                              | Severity |
| ------------------------------------------------------------------------- | ------------------------------------ | -------- |
| Any Experience Card trigger couples to a paywall CTA on the same screen   | `experience-card-dark-pattern`       | critical |
| Variable reward variation is cosmetic only                                | `experience-card-dark-pattern`       | critical |
| Perceived Effort Delay uses a sleep timer with no real computation mapped | `experience-card-dark-pattern`       | critical |
| Intent Mirror reflects inferred or manufactured emotional state           | `experience-card-dark-pattern`       | critical |
| Commitment is not editable from settings                                  | `experience-card-dark-pattern`       | critical |
| An accepted selected card is missing from its intended journey             | `experience-card-not-implemented`    | high     |
| Named PostHog event absent from activity view                             | `experience-card-event-missing`      | medium   |
| Emotional Curve not rendered in `emotional-design.html`                   | `emotional-curve-missing`            | medium   |
| Emotional Curve peaks after the paywall marker                            | `emotional-curve-missing`            | medium   |
| Animated card moment has no `prefers-reduced-motion` fallback             | `experience-card-motion-no-fallback` | medium   |

---

## Prioritized Pathway

A sequenced list of fixes from current state to the target state for this app. Ordered by: (1) compliance veto items first, (2) Critical journey improvements, (3) measurement gaps, (4) motion and polish.

### Phase 1: Compliance (Complete Before Any Launch-Ready Claim)

| #   | Finding | Fix     | Owner   | Validator                                    |
| --- | ------- | ------- | ------- | -------------------------------------------- |
| 1.1 | Pending | Pending | Pending | `npm run check:emotional-design -- --root .` |

### Phase 2: Critical Journey Improvements (Complete Before Soft Launch)

| #   | Journey | Step    | Current Score | Target Score | Fix     | Owner   |
| --- | ------- | ------- | ------------- | ------------ | ------- | ------- |
| 2.1 | Pending | Pending | Pending       | Pending      | Pending | Pending |

### Phase 3: Measurement Completeness (Complete Before Paid UA or Growth Claims)

| #   | Journey | Missing Event | Fix     | Owner   |
| --- | ------- | ------------- | ------- | ------- |
| 3.1 | Pending | Pending       | Pending | Pending |

### Phase 4: Motion and Polish (Target Before Featured-App Submission)

| #   | Journey | Step    | Issue   | Fix     | Token Reference | Owner   |
| --- | ------- | ------- | ------- | ------- | --------------- | ------- |
| 4.1 | Pending | Pending | Pending | Pending | Pending         | Pending |

---

## Acceptance Checklist

Before marking this audit complete and the emotional design lane ready:

- [ ] App-specific journeys beyond the 10 defaults are enumerated in the Audit Scope (Journey Discovery step) before the device walk begins.
- [ ] All journeys in the Audit Scope have been walked on a real device via MobAI with screenshots attached.
- [ ] Every step in every Critical AND High journey has a completed score in the Per-Journey table. At least 80% of steps in Medium journeys are scored; any gap is documented with a rationale.
- [ ] No Critical or High journey has a step below 4.0 without an open failure card.
- [ ] The Per-Journey Curve Markers table is filled for every journey (peak step + paywall/spend marker), and curves are rendered in `emotional-design.html`.
- [ ] Every journey with a paywall/spend marker peaks (first +2 crossing) at or before that marker.
- [ ] All Dark-Pattern Findings have an answer for each of the six bright-line checklist items.
- [ ] No dark-pattern finding has a "Compliance Veto? Yes" item without an open `critical` failure card.
- [ ] All required PostHog events for all implemented cards are confirmed in the PostHog activity view.
- [ ] All missing events have an `experience-card-event-missing` failure card open in `state/business-state.json`.
- [ ] All open failure cards from this audit are recorded through the reducer in `state/business-state.json` under the `emotional_design` lane blockers.
- [ ] Top Opportunities matrix is complete with at least 3 prioritized rows.
- [ ] Prioritized Pathway Phase 1 (compliance) is complete or has an open failure card blocking launch.
- [ ] `npm run check:emotional-design -- --root .` passes or its failures are accounted for in open failure cards.
- [ ] Star-ladder level for each Critical journey is recorded in `11_STAR_EXPERIENCE.md` (journey audit findings section).

---

## Device Walk Protocol (MobAI Operationalization)

Use this protocol to walk each journey on a real device and collect per-screen evidence. Follow the MobAI guidance in `knowledge/engineering/mobai-toolbelt.md` before starting. Do not pre-choreograph multi-step blocks without a clean dry-run.

### Pre-Walk Setup

1. Confirm the MobAI bridge is active through the current MCP schema or `mobai devices list --json`; identify and pin the target device ID.
2. Confirm app is installed and at a clean state (fresh install or cleared app data for onboarding journeys).
3. Start the bridge with the current exposed MobAI bridge tool, or the verified `mobai bridge start` CLI route when no connector is exposed.
4. For onboarding journeys: uninstall and reinstall to guarantee a cold-start state.

### Per-Screen Evidence Protocol

For each screen transition during a journey walk:

1. Take a screenshot with the current exposed MobAI screenshot tool, or verified `mobai screenshot DEVICE --path DIR --name FILE` CLI route, then attach it to the relevant step row.
2. Record the screen label and current state.
3. Assign emotional valence (−5 to +5) based on what a first-time user would likely feel at this moment.
4. Narrate the step from the user's perspective (Lens 1 test): write one sentence starting with "I am..."
5. Note any friction: tap targets too small, copy confusing, loading state absent, error state missing, decisions on screen > 2.
6. Note motion: is there an animation? Does it use the correct token? Is there a `prefers-reduced-motion` fallback?
7. Check card signals: does the screen reference the user's stated goal or commitment? Does a result reveal have an anticipation window?

### Journey-Specific Walk Instructions

**J-01 (Onboarding):** Walk from cold-start. Do not skip any screen. At the commitment question (Step 3), enter a specific, non-generic value (e.g. a real goal, not "test"). Verify it appears verbatim on the plan reveal screen (Step 6). At the intent mirror (Step 7), confirm the screen CTA is goal-aligned, not purchase-oriented. At the paywall (Step 8), confirm no Experience Card is triggering on the paywall screen itself.

**J-02 (Plan / Result Generation):** Trigger the core action. Time the anticipation window from action tap to result reveal. If the window is > 3s, check that a Skip or Cancel affordance exists. Verify `reward_variant` is not always the same value by triggering the flow twice on the same device.

**J-03 (First Core-Loop Completion):** Complete the first intended action end-to-end. Verify the session-close state includes a personalized completion signal, not a generic "Done" button.

**J-04 (Paywall):** Force the paywall to appear. Verify all three pricing tiers (if applicable) are visible. Check restore purchases is reachable within two taps. Confirm the paywall does not contain an Experience Card trigger (no commitment echo, no intent mirror, no perceived effort delay, no variable reward reveal on the paywall screen).

**J-05 (Return Session):** Kill the app. Re-open after a simulated D1 gap (or trigger via push notification). Verify the home screen references the user's commitment. Check push copy in the notification for the user's stated goal (not generic app copy).

**J-06 (Streak Surface):** Navigate to the streak or progress surface. Verify the streak counter is on the primary screen, not buried in profile. Confirm streak at-risk state is distinguishable from healthy state. If a milestone fires, verify it is a designed peak moment, not a toast.

**J-07 (Lapse Re-Engagement):** Simulate a lapse (disable push, wait or adjust device clock). Trigger the re-engagement flow. Verify the first screen contains no gap-duration shaming and no paywall. Confirm the fresh-start CTA leads directly to a core action, not a settings form.

**J-08 (Error Recovery):** Force a network error (airplane mode). Verify the error screen is in the product's voice. Verify a single clear CTA routes to the next recoverable action. If a restorative gesture fires, confirm it is unconditional (not gated on a purchase).

**J-09 (Subscription Management):** Navigate to billing settings. Find the cancel path. Verify no Experience Card trigger fires on the cancel-intent screen or the cancel-confirmation screen. Confirm no Intent Mirror, Fresh Start, or Commitment Echo is used as a cancel-flow retention mechanic (this is a compliance veto).

**J-10 (Milestone / Level-Up):** Trigger a milestone (may require manipulating data or using a test account at threshold). Verify the level-up fires as a full-screen or sheet moment, not a toast. Confirm no paywall CTA appears on the same screen as the level-up reveal.
