# Push Notification Lifecycle

Push is the highest-leverage retention channel a mobile app owns: it reaches users who never open email, costs nothing per send, and drives same-session return at a fraction of paid re-acquisition cost. The skill builds a provider-grade email system (`resend-email-ops.md`); this reference is its push sibling, and for in-app engagement it is the primary channel — email carries receipts, digests, and win-back for users who opted out of push. Load it before onboarding hardens (the permission ask lives there), before notification-bearing Experience Cards ship (streaks, fresh-start, at-risk nudges), and again at post-launch when retention work starts.

The ethics line up front: push serves the user's stated goal, never the app's need for a session. Every trigger below must answer "what does the user get by tapping this, right now?" — a notification that only benefits the retention chart is the dark-pattern variant of this channel, and the Streak/Loss-Aversion and Variable Reward guardrails in `ethics-guardrail.md` apply to pushes exactly as they do to in-app mechanics.

## Contents

- 1. Provider Setup
- 2. Permission Priming
- 3. Lifecycle Trigger Table
- 4. Frequency Caps And Quiet Hours
- 5. Analytics Contract
- 6. Weekly Operation
- 7. Anti-Patterns

## 1. Provider Setup

- **Native default:** APNs (iOS) and FCM (Android) direct, via the app's backend. The archetype starters' Supabase backend can schedule and send through an edge function; record the route in `engineering/TECH_SPEC.md`'s data contract.
- **Provider route:** OneSignal or a comparable push provider is a paid/account-gated tool decision — route it through [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before adopting, and record the choice in `strategy/TOOL_DECISIONS.md`. A provider earns its keep at segmentation/scheduling scale; day one usually does not need one.
- Keys and certificates (APNs key, FCM service account) are server secrets: route through [`secrets-management.md`](../operations/secrets-management.md), names-only in `SECRETS.md`.
- Token lifecycle: capture the push token post-permission, refresh on app start, delete on logout and account deletion (the deletion path in `privacy-terms.md` includes push tokens).

## 2. Permission Priming

The raw iOS permission dialog converts poorly when it appears cold; a primed ask converts at multiples of an unprimed one, and a denial is nearly permanent (the user must dig through Settings to reverse it). Treat the ask as a conversion surface with one canonical placement:

- **Prime first.** A pre-permission screen in the app's own UI explains the one concrete job pushes do for this user ("your Wednesday reminder, nothing else") with the user's own goal named. Only after an affirmative tap does the system dialog appear.
- **Canonical placement:** after the first value moment at an earned point where the benefit is concrete. First-run onboarding may use the push prime when it directly supports the next user action. Native App Review requests are separate: earn eligibility after value, finish first-run onboarding, and request later at a natural success in normal product use. Never stack both interruptions in one step or session moment.
- **Denial handling:** a soft-prime decline is re-askable at the next earned moment (a streak at risk, a feature that plainly needs it); a hard system-dialog denial is not — record it and fall back to email for lifecycle sends.
- Provisional/quiet delivery (iOS) is a legitimate first rung for content apps: deliver quietly, earn the upgrade to alerts.

## 3. Lifecycle Trigger Table

Load [`no-slop-writing.md`](../words/no-slop-writing.md) (its §7 covers push/lifecycle subject-line and body limits) before drafting any Content contract copy below, and self-check each trigger's copy against it — the guilt-copy ban in this file's ethics contract is necessary but not sufficient; empty phrases and weasel language are a separate failure mode no-slop-writing.md exists to catch.

Design triggers as a segmentation table, not ad-hoc sends. The standard set, adapted per app:

| Trigger          | Segment                                                      | Timing                                             | Content contract                                                                               |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Activation nudge | signed up, core action not yet done                          | +24h after install, once                           | name the one action and its payoff; deep-link straight to it                                   |
| Habit anchor     | activated, opted into a schedule                             | user-chosen time, recurring                        | the user's own commitment mirrored back; skip silently when already done today                 |
| At-risk save     | usage declining vs own baseline                              | after 2x the user's normal gap                     | one concrete resume point, no guilt copy (ethics contract)                                     |
| Streak/milestone | earned event just occurred                                   | at the moment it happens                           | celebrate the earned thing; never a fake milestone                                             |
| Dormant win-back | no session 14–30 days, still subscribed or high prior intent | once at 14d, once at 30d, then stop                | what changed since they left; easy re-entry point                                              |
| Renewal/billing  | trial ending, payment failed                                 | per `billing-health-and-reactivation.md` §2 timing | plain statement of state and the one action; billing pushes are transactional, not promotional |

Every row deep-links to the exact screen that fulfills the promise; a push that lands on the home screen breaks the contract.

## 4. Frequency Caps And Quiet Hours

- Default cap: **one marketing/lifecycle push per day, three per week**, transactional (billing, security) exempt. Record the chosen caps here and in `operations/POST_LAUNCH_OPS.md`.
- Quiet hours by default (22:00–09:00 local) unless the user scheduled a time inside them — their explicit schedule always wins.
- Caps are enforced server-side, not promised in prose: the send path checks the user's recent-send count before dispatch.
- The notification-disable rate is the counter-metric (`emotional-experience-measurement.md` flags >20% as investigate): a rising disable rate is users telling you the caps are wrong.

## 5. Analytics Contract

Push events live in the `analytics/ANALYTICS.md` Event Contract before any builder prompt names them (`analytics-attribution.md` rule). The standard catalog rows:

- `push_permission_primed` — the soft-prime screen was shown (properties: placement, session_number)
- `push_permission_granted` / `push_permission_denied` — system dialog outcome
- `push_sent` — server-side, per send (properties: trigger, campaign_id)
- `notification_opened` — existing catalog event; properties gain trigger/campaign_id
- `notification_disabled` — user turned pushes off in Settings or in-app

The funnel that matters weekly: primed → granted rate, per-trigger open rate, opened → same-session core-action rate, and disable rate per trigger. A trigger whose open rate decays across cohorts is retired or rewritten, not louder.

## 6. Weekly Operation

In the Weekly Ops Review (`post-launch-operations.md` §2), push rides the retention step: read per-trigger open and disable rates alongside the D7/D30 cohorts, and treat a retention drop at a known step as a candidate for a new earned trigger — through [`change-cascade.md`](../process/change-cascade.md) like any product change. One trigger experiment at a time; measure against the cohort, not gross opens.

## 7. Anti-Patterns

- **Cold ask.** The system permission dialog on first launch, before any value — converting a majority of installs into permanent opt-outs to make a dashboard move.
- **Email-only lifecycle.** A full Resend automation suite with zero push strategy — the higher-open channel left unbuilt because the email one had a reference and this one did not.
- **Guilt copy.** "Your streak is dying 😢" — the ethics contract bans manufactured loss; name the real state and the real action.
- **Broadcast blasts.** Untargeted sends to the whole install base; every push is segmented by the trigger table or it does not go out.
- **Unmeasured sends.** Pushes fired without `push_sent`/`notification_opened` wiring — retention spend with no receipt.
