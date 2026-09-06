# {{APP_NAME}} 11-Star Experience

This artifact defines the product's extreme experience, the feasible V1 slice, and how the same magic translates across product, onboarding, ads, store, engineering, lifecycle, and support.

## Experience Thesis

- Target user:
- Ordinary world:
- Desired transformation:
- One magical moment V1 must prove:
- Why a user would retell it:

## Star Ladder

| Stars | Label | User scene | Product behavior implied | Emotional reaction | What we learn |
| --- | --- | --- | --- | --- | --- |
| 1 | Refund me | The app fails the basic promise or makes the user feel misled. | Identify failure states and trust breaks. | Regret, frustration. | What must never ship. |
| 2 | It technically works | The user can complete the task, but it feels slow, generic, or confusing. | Remove friction and explain recovery. | Tolerance, not love. | What minimum usability requires. |
| 5 | Expected experience | The app performs the promised task competently. | Deliver the core loop reliably. | "It worked." | The baseline users already expect. |
| 6 | Better than expected | The app adds clarity, polish, and one useful personalized detail. | Reflect user input, reduce uncertainty, and show progress. | Relief, trust. | The first feasible delight. |
| 7 | Way beyond | The app feels like it understood the user's context and prepared the next best step. | Use data, state, copy, and timing to personalize the moment. | "This was made for me." | The V1 magic candidate. |
| 10 | Impossible concierge | A human team manually creates the perfect end-to-end result for one user. | Identify the hidden service blueprint behind the product. | Amazement. | Which unscalable pieces might become product. |
| 11 | Absurd extreme | The product removes the user's problem so completely that the outcome feels unreal. | Reveal the emotional north star and what not to settle for. | They tell everyone. | The true ambition, not the V1 scope. |

## Line Of Feasibility

- Feasible for V1:
- Feasible with light manual/concierge help:
- Deferred inspiration:
- Explicitly not in scope:

## V1 Scalable Slice

- Experience slice to ship:
- Product behavior:
- Data/state/API requirements:
- Design and motion requirements:
  - Web delight (landing, funnel, web paywall, preview): tokenized framer-motion / `motion` micro-interactions and entrance/celebration moments.
  - Mobile delight (shipped binary): native animation from `DesignTokens.Motion` (SwiftUI/Flutter/Reanimated) — no framer-motion.
  - Reduced-motion fallback for every delight moment (`prefers-reduced-motion` / OS reduce-motion).
- Analytics proof:
- Production-readiness proof:

## Surface Matrix

| Surface | 11-star question | Product-specific answer | Artifact owner | Proof |
| --- | --- | --- | --- | --- |
| Product core loop | What result would the user retell? | Pending | `PRODUCT.md`, `state/LAUNCH_TRACE.md` | Pending |
| Onboarding | What makes the user feel understood early? | Pending | `product/ONBOARDING.md`, `product/onboarding.html` | Pending |
| Paywall | What makes purchase feel like unlocking momentum? | Pending | `revenue/REVENUE_OPS.md`, `design.md` | Pending |
| Paid UA | What tiny paid creative can truthfully preview the V1 magic and be measured against revenue? | Pending | `PAID_UA.md`, `CONTENT_ASSETS.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md` | Pending |
| Viral growth loop | What product moment would make sharing or referral feel natural? | Pending | `VIRAL_GROWTH.md`, `analytics/ANALYTICS.md`, `state/LAUNCH_TRACE.md` | Pending |
| Ad or creator hook | What tiny experience can the ad deliver by itself? | Pending | `growth/UGC_PLAYBOOK.md`, `CONTENT_ASSETS.md` | Pending |
| App Store screenshots | What three frames prove the magic? | Pending | `APP_STORE_LISTING.md`, `SCREENSHOTS.md` | Pending |
| Landing page | What scene makes the promise instantly clear? | Pending | landing page, `GEO_SEO.md` | Pending |
| Lifecycle email | What would feel like the product remembered the goal? | Pending | `growth/EMAIL_OPS.md` | Pending |
| Support | What recovery would increase trust? | Pending | support docs, customer-success role | Pending |
| Engineering | What must be real in state, data, API, permissions, and fixtures? | Pending | `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md` | Pending |

## Visual Storyboard

- Visual proof: `11-star-experience.html`
- Design-system source: `DESIGN.md`
- Screen spec source: `design.md`
- Content asset source: `CONTENT_ASSETS.md`
- Paid UA source: `PAID_UA.md`
- Viral growth source: `VIRAL_GROWTH.md`

## Traceability

| Trace ID | Experience decision | Source evidence | Product impact | Design impact | Build contract | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| EXP-001 | Pending | `strategy/RESEARCH.md` | `PRODUCT.md` | `DESIGN.md` | `engineering/TECH_SPEC.md` | `engineering/PRODUCTION_READINESS.md` |

## Engineering Contract

- State machine:
- Data model:
- API/RPC/webhook contracts:
- Permissions:
- Offline/error states:
- Analytics events:
- Test fixture:
- E2E proof path:

## Acceptance Checklist

- [ ] 1, 2, 5, 6, 7, 10, and 11-star levels are product-specific.
- [ ] `Line Of Feasibility` separates V1, manual assist, deferred inspiration, and not-in-scope ideas.
- [ ] `V1 Scalable Slice` names the magical moment the app will actually prove.
- [ ] Surface matrix covers product, onboarding, paywall, ad, App Store, landing, email, support, and engineering.
- [ ] `PRODUCT.md`, `DESIGN.md`, `product/ONBOARDING.md`, `engineering/TECH_SPEC.md`, and `state/LAUNCH_TRACE.md` reference this artifact before build handoff.
- [ ] `11-star-experience.html` renders a visual ladder that the founder can inspect.
