---
version: alpha
name: "App Name"
description: "One-sentence consumer promise still to be defined."
status: partial
---

# App Name Product

This file is generated from `product.yaml`. It records durable product
decisions and routes agents to the evidence and detailed contracts that support
them. It does not replace research, design, runtime state, or provider records.
Edit `product.yaml`, then render `PRODUCT.md`.

## Promise, user, and problem

- Promise: Replace with the one-sentence consumer promise.
- User: Define the primary user and the situation that brings them here.
- Problem: Define the costly, frequent, or meaningful problem this app solves.

## Evidence and category

Summarize the evidence that supports the promise and link the source rows. Do
not copy the evidence ledger here.

- Research: `strategy/RESEARCH.md`
- Signals and claims: `strategy/SIGNAL_CORPUS.md`
- Offer test: `strategy/OFFER_TEST.md`
- Trace: `state/LAUNCH_TRACE.md`
- Category and wedge: name the incumbent, the switching moment, and the moat.

## Core loop and first value

Name the repeated user behavior, the first valuable result, and the activation
condition. Link the detailed target and feasibility ladder in
`product/experience/11-star-experience/11_STAR_EXPERIENCE.md` and the behavior
contract in `product/ONBOARDING.md`.

## Complete product scope

- Required systems and acceptance: define every system needed to fulfill the accepted promise, with its proof route.
- Exclusions with rationale: identify capabilities outside the accepted promise; never defer a required system without an explicit founder-approved scope change.
- Non-goals: name work that is explicitly out of scope.

## Requirements and acceptance

List requirements as user outcomes, not implementation tasks. Each requirement
must have an acceptance condition and a proof route.

| ID | User outcome | Acceptance condition | Proof route |
| --- | --- | --- | --- |
| `REQ-001` | First value is useful and visible. | A new user reaches the defined result with recoverable loading and error states. | `product/ONBOARDING.md`, `engineering/PRODUCTION_READINESS.md` |

## Journey and downstream routes

The product journey is indexed here. Detailed screens, controls, copy, and
analytics stay in their owning contracts.

- Journey and screen behavior: `product/ONBOARDING.md`
- Copy brief and strings: `product/copy/COPY_BRIEF.md`, `product/copy/COPY_DECK.md`
- Design system and visual routes: `DESIGN.md`, `studio/seed/business.json`
- Event catalog: `analytics/ANALYTICS.md`
- Implementation contract: `engineering/TECH_SPEC.md`
- Monetization: `revenue/REVENUE_OPS.md`
- Store and trust constraints: `store/`, `trust/`

## Metrics and monetization posture

Define activation, retention, conversion, and the leading growth signal. The
event definitions belong in `analytics/ANALYTICS.md`. Record pricing and paywall
intent here at a decision level; exact products, terms, and provider proof belong
in `revenue/REVENUE_OPS.md`.

## Risks and open questions

Record unresolved product risks, the evidence needed, and the owner. Do not turn
an unresolved question into a requirement by implication.

## Decision log

| ID | Date | Decision | Evidence | Status or superseded by |
| --- | --- | --- | --- | --- |
| `DEC-001` | Not recorded | Initial product direction is not yet defined. | `strategy/RESEARCH.md` | Open |

## Source ownership and state boundary

`product.yaml` owns authored product meaning. `PRODUCT.md` is its rendered index.
`strategy/RESEARCH.md` owns source evidence. `DESIGN.md` owns visual and interaction
design. `state/business-state.json` and `state/current-truth.json` are reducer-owned
execution bookkeeping consumed through CLI/MCP status and plan; they are never product
truth. Git records product revisions.
