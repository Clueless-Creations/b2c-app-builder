# Core Loop And V1 Scope (Non-Archetype Products)

The four shipped app archetypes — [`habit-tracker.md`](./habit-tracker.md),
[`photo-ai-media.md`](./photo-ai-media.md), [`social-network.md`](./social-network.md), and
[`ai-chat-companion.md`](./ai-chat-companion.md) — each give their shape a named core loop, a
confirm-the-shape question set, and a V1-vs-later scope cut. Most products a founder brings are
_not_ one of those four shapes, and until now the routing fell through with nothing to load:
`SKILL.md` names the archetype table and otherwise tells the agent to improvise schema and core
loop. This file is that missing fifth lane — not a fifth archetype, but the general method the
four archetypes already use, generalized so any product gets the same rigor instead of an
improvised one.

## Contents

- 1. When To Use
- 2. Name The Core Loop (AskUserQuestion)
- 3. The Core Systems Method
- 4. Drawing The V1 Line
- 5. Threading Into The Workflow
- 6. Acceptance Checklist

## 1. When To Use

Load this reference whenever the product does not match one of the four shipped shapes above —
a marketplace, a booking/scheduling app, a finance/budgeting tool, a niche utility, a
B2C2B tool, or any idea that is a genuine new shape rather than a variant of an existing pack.
If the product _is_ one of the four shapes, use that archetype's own reference instead; do not
run both. If it merely _contains_ a feature that resembles an archetype (a fitness app with one
streak counter, a marketplace with a chat feature) without that feature being the product's
center of gravity, this file still applies — the archetype files are explicit that they are not
for a product that only contains their feature.

## 2. Name The Core Loop (AskUserQuestion)

Before building, confirm the shape with the founder via **AskUserQuestion** (or a plain founder
choice if unavailable), the same discipline every archetype uses before schema and engineering
work starts:

1. **What is the one repeatable action the user takes that the business is built around?**
   Every archetype names this explicitly (habit-tracker: the daily check-in; photo-ai-media: the
   generation-and-reveal; social-network: the post/react loop; ai-chat-companion: the
   conversation turn). A product with no single answer to this question does not yet have a
   core loop — that is itself a finding to surface to the founder before building anything.
2. **Primary surface** — web or native. Be honest about which surface the core loop actually
   needs (background jobs, push notifications, camera/sensor access, and offline use all push
   toward native; a loop that is purely read/write over data does not).
3. **Which systems are in V1?** (multi-select, drawn from the system list built in §3 below).
4. **Niche / wedge** — who specifically is this for, and what makes them choose this over the
   nearest incumbent? Feeds `strategy/RESEARCH.md` and, when a moat claim is in scope,
   `product-moat.md`.

Record the answers in `state/business-state.json` (`lanes.product.core_loop`,
`lanes.product.primary_surface`, `lanes.product.v1_systems`) so later sessions do not
re-litigate the shape.

## 3. The Core Systems Method

Every archetype decomposes its product into 4-6 named systems, with exactly one of them
identified as _the_ core loop — the system the emotional design, analytics, and 11-star work
all center on. Use the same method for any shape:

1. **List every system a working V1 needs** — identity/auth, the data model for whatever the
   user creates or tracks, the one repeatable action from §2, a retention/return surface
   (notifications, a feed, a streak, a queue), and — if in scope — monetization and
   social/sharing.
2. **Name exactly one system as the core loop.** If two systems both seem central, the shape is
   still ambiguous — go back to §2 rather than building both half-heartedly. A product without
   one clearly primary loop is the improvisation trap this file exists to close.
3. **State what each system threads into**, mirroring the archetype "Build Sequence" tables:
   which system feeds `11_STAR_EXPERIENCE.md`'s magical moment, which feeds
   `analytics/ANALYTICS.md`, which feeds `trust/SECURITY.md` (RLS/ownership), which feeds
   `revenue-monetization.md` if monetization is in scope.

This produces the same artifact an archetype's "Core Systems" section produces — a named list
with one system marked as the loop and each system's downstream threads — just derived for this
specific product instead of pre-written for a known shape.

## 4. Drawing The V1 Line

`launch-phases.md`'s Phase 1c names the requirement — "draw the line of feasibility and name the
V1 scalable slice" — without a procedure for a non-archetype product. Here is the procedure:

1. **Every system from §3 is either in V1, deferred to V2, or cut entirely.** An archetype's
   "which optional systems are in V1" multi-select is the same decision generalized: for each
   non-core system, decide build-now / build-later / never, and record the reason for anything
   deferred or cut (a system a founder keeps re-asking about is a V2 candidate, not a maybe).
2. **The core loop from §2 is never optional.** If the core loop itself is being scoped down for
   V1, that is a different core loop — go back to §2 rather than shipping a weakened version of
   the real one.
3. **The V1 slice must be narrow enough to build and strong enough to shape every downstream
   surface** — design, onboarding, ads, screenshots, and engineering contracts all take their
   scope from this line, per `launch-phases.md`'s Phase 1c acceptance criteria. A V1 line drawn
   too wide reproduces the improvisation this file exists to prevent, just later in the process.
4. **Record the cut, not just the systems.** `PRODUCT.md` and `state/business-state.json`
   should both be able to answer "what did V1 explicitly NOT include, and why" — the absence of
   a feature is a decision, not an oversight, and a builder or `ce-plan` reading the spec later
   should never have to guess which gap was intentional.

## 5. Threading Into The Workflow

- **The core loop is the 11-star magical moment's subject.** Run [`eleven-star-experience.md`](../experience/eleven-star-experience.md)
  over the loop named in §2 — the ladder, the line of feasibility, and the scenes all describe
  this loop, exactly as an archetype's "How This Lane Threads Into The Launch Workflow" section
  points its magical moment at its own named loop.
- **Analytics before surfaces lock.** Name the loop's key events (started, completed,
  abandoned, at minimum) and get them into `analytics/ANALYTICS.md` before the loop's surface
  locks, per `analytics-attribution.md` — the same requirement every archetype states for its
  own events.
- **If a moat or differentiation claim is in scope, name the beat moment.** `product-moat.md`
  requires the specific moment in the core loop where a user who knows the incumbent would say
  "this is better" — a core loop with no candidate beat moment is itself evidence for the
  Go/Pivot/Kill checkpoint (`go-pivot-or-kill.md`), not a reason to skip the question.
- **Security follows data ownership, not the archetype.** Whatever the core loop's data model
  turns out to be, every user-data table needs a tested ownership policy referenced from
  `trust/SECURITY.md`, exactly as the archetypes require for their own schemas.
- **Revenue, if in scope, reconciles with `revenue-monetization.md`** the same way an
  archetype's monetization prompt does — pricing, plan mix, and trial length stay founder-gated
  regardless of the product's shape.

## 6. Acceptance Checklist

Before calling a non-archetype product's scope ready:

- [ ] The core loop (§2) is named as a single specific repeatable action, confirmed via
      AskUserQuestion, and recorded in `state/business-state.json`.
- [ ] The core systems list (§3) exists with exactly one system marked as the core loop and
      each system's downstream thread named.
- [ ] The V1 line (§4) is drawn: every system is build-now / build-later / never, with reasons
      recorded for anything deferred or cut, and `PRODUCT.md` states what V1 explicitly
      excludes.
- [ ] The core loop has run through `11_STAR_EXPERIENCE.md`, and its key events exist in
      `analytics/ANALYTICS.md` before the surface locks.
- [ ] If a moat/differentiation claim is in scope, a beat moment has been named and survives
      the one-week-copy test in `product-moat.md`, or the absence of one has been surfaced as
      Go/Pivot/Kill evidence.
- [ ] Every user-data table tied to the core loop has an ownership policy referenced from
      `trust/SECURITY.md`.
