# Full Launch Program: One Loadable Mandate For An End-To-End Consumer Delivery

Use this reference when a founder asks for a complete consumer delivery: app, full web funnel, store packet, analytics, trust, revenue, and growth artifacts, carried to the point where the founder can open App Store Connect and click Submit for Review. It is the contract behind `workflow.orchestration.full-launch-program` and `workflow.orchestration.full-launch-closeout`.

The program replaces a pasted launch prompt. The founder supplies a short mandate. The catalog supplies the graph. `b2c_plan` sequences the nodes. The gates and the review ledger decide what is done.

## Contents

- What The Program Is
- The Mandate Record
- Start Path
- Phase Path
- Design-Critical Waves
- Reference Before Create
- Words Contract
- The Craft Bar
- Full Web Funnel
- Definition Of Done
- Founder Decisions
- Handoff Every Turn

## What The Program Is

The program is a top-level node with two ends:

- `workflow.orchestration.full-launch-program` opens the program. It records the mandate in `operations/LAUNCH_PROGRAM.md`, sets `project.launchScope` to `full` through the reducer, and dispatches the orient work.
- `workflow.orchestration.full-launch-closeout` closes the program. It depends on the store, trust, engineering, and growth terminal nodes and runs the definition-of-done gates.

Between the two ends, the existing catalog nodes do the work. The program adds no second router, catalog, planner, or state store. It adds the mandate, the isolated-review edges, the reference-pack edge, and the closeout gates.

The `full` launch profile parks no lane. Every lane ends `done`, `blocked` with a founder action, or `deferred` with a dated reason the founder accepted.

## The Mandate Record

Write `operations/LAUNCH_PROGRAM.md` at program start. It carries the facts a pasted prompt used to carry. Keep it short. Link, do not duplicate.

| Field                | Content                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Program              | `workflow.orchestration.full-launch-program`, catalog version, start date                                                                                                               |
| Outcome              | One sentence. Example: iOS app, full web funnel, and store packet at the stated craft bar, Submit-for-Review ready.                                                                     |
| Stop line            | The exact action the founder performs. Default: the founder clicks Submit for Review.                                                                                                   |
| Launch scope         | `full`, recorded through the reducer with a dated founder reason when it changes an existing scope                                                                                      |
| Start classification | greenfield idea, delegated build, or brownfield overhaul                                                                                                                                |
| Workspace facts      | business workspace path and registration status; app repository path, stack, scheme, bundle identifier, team, secrets project, provider projects of record, forbidden provider projects |
| Craft references     | live mechanic references and the design-evidence sources in use; mechanics transfer, identity never does                                                                                |
| Spend ceiling        | the founder's number; default is quality-first inside the ceiling, stop and ask at 80 percent                                                                                           |
| Autonomy mode        | the recorded mode and any standing envelopes                                                                                                                                            |
| Founder-only actions | Submit for Review, production release, certificates, prices, spend without a ceiling, legal as final, public posts, live domain deploy                                                  |
| Review policy        | `reference.orchestration.isolated-review` applies to every surface                                                                                                                      |

Workspace-specific identities belong here and in reducer-owned state, never in catalog knowledge.

## Start Path

1. For a new business, create and register the planning workspace together: `b2c business-create --workspace my-app --directory ./my-app --name "Working name" --hypothesis "A short product hypothesis" --mandate "The full founder request" --json`. Select an absent or empty directory; do not add files or register it first. The command records the mandate. For an existing registered workspace, resume it. For an existing unregistered scaffold, use `b2c workspaces register <id> <path>`. Inspect an existing app before installing a scaffold; preserve its files. Never create a second workspace or re-scaffold an existing one.
2. Run `workflow.orchestration.session-continuity-resume`. Read the durable artifacts before new work. Chat memory is not state.
3. Run `workflow.orchestration.orient-scaffold-and-state-cockpit-upkeep`. Write `operations/ORCHESTRATION.md` with the `## Review Ledger` section before any broad dispatch.
4. Present one start-of-workflow tool-intake AskUserQuestion from `reference.operations.paid-tool-routing` for the tools on the `research-backed-spec` compiled graph. Fold it into a pending readiness gate. Do not open a second tool gate. Do not substitute a generic fallback and call it equivalent. App Store Connect API auth and a live `asc apps list` receipt stay required; they are not optional research tools. Deferred AppKittie, XPOZ, Firecrawl, or paid ASO continue as labeled fallback.
5. Record API-key health and Apple web-session health as two proofs. A healthy API key is not "ASC connected." Refuse an `asc web auth login` handoff unless the winning `asc` is `>= 5.1.0`. Do not write a signing blocker until `asc certificates list` has been read.
6. Classify the start. A brownfield overhaul runs research in audit-and-gap-fill mode: keep, refresh, or redo each existing artifact with a dated reason. It does not silently restart. Do not dispatch `research-backed-spec` until `workflow.operations.live-app-store-portfolio` has succeeded.

## Phase Path

Parallelize inside a gate. Do not skip a gate. Node IDs are catalog IDs; `b2c_workflow` loads each one.

| Phase                   | Nodes                                                                                                                                                                                                                                                                                                                                                                                                                          | Founder gate                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 0 Orient                | `session-continuity-resume`, `orient-scaffold-and-state-cockpit-upkeep`, `founder-zero-operator-bootstrap`, `secrets-baseline-and-routing`, `paid-tool-routing-and-fallback`, `live-app-store-portfolio`, `agent-operations-ledger`, `repository-profile-contract`                                                                                                                                                               | workspace register, spend ceiling, autonomy mode, Apple API auth for the apps list |
| 1 Research to Go        | `research-backed-spec` after the live portfolio receipt and paid-tool intake succeed, then `spec-red-team-audit` in a fresh context                                                                                                                                                                                                                                                                                            | Go, Pivot, or Kill. Kill or Pivot is success. No design or build spend before Go. |
| 1b to 1g                | `analytics-and-attribution-blueprint`, `11-star-experience`, `emotional-experience-design-producer` then `emotional-design-audit-auditor`, `writing-quality-no-slop`, `launch-trace-and-build-contracts`, `security-architecture-and-release-gate`, `generative-ai-safety` when a generated preview ships, `paid-user-acquisition-system`, `viral-growth-loop`, `localization-market-research`, `launch-narrative-and-cadence` | none                                                                              |
| 2 Design                | `reference-pack-librarian`, `brand-definition`, `design-room`, then `design-system-audit`; `ux-patterns-refero`, `premium-mobile-craft`, `token-promotion`, `content-assets-remotion-generated-visuals`; the onboarding graph `onb-00` through `onb-22` with `onb-20` in a different context than `onb-18`                                                                                                                     | brand and taste on the landing story and the onboarding first screens             |
| 2 to 4 Funnel           | `geo-seo-public-visibility` before the first public-page edit, `pre-launch-funnel-landing-waitlist`, then `landing-funnel-audit`, `copy-review-audit`, `resend-email-ops`, `landing-funnel-publication-and-live-proof`                                                                                                                                                                                                         | live domain deploy                                                                |
| 3 Store                 | `app-store-listing-prep-packet`, `store-screenshots-production` after the copy review, `mobai-device-automation-and-demo-videos`, `apple-app-store-requirements-privacy-manifest`, `aso-and-store-ops`, `marketplace-regional-compliance`, `store-console-workflow`, `apple-signing-and-release-readiness`, `privacy-and-terms`, `asc-cli-automation`                                                                          | legal identity, Apple agreements, TestFlight versus submit envelope               |
| 3b Revenue              | `revenue-monetization`; `experimentation` only after a paywall ships                                                                                                                                                                                                                                                                                                                                                           | pricing                                                                           |
| 5 Engineering           | `engineering-orchestration-ce-production-readiness`, `backend-data-contract`, `native-ios-proof-route-ladder`, `accessibility-common-task-proof`, `app-quality-and-vitals`, `source-change-manifest` after each accepted slice, `security-architecture-and-release-gate` before upload, `provider-proof-verification`                                                                                                          | none                                                                              |
| 6 Growth and operations | `ugc-creator-engine`, `fastlane-growth-ops`, `post-launch-operations`, `support-queue-operations`, `retention-intervention`, `launchbench-failure-cards-coverage-audit`                                                                                                                                                                                                                                                        | ad spend, public posts                                                            |
| Close                   | `full-launch-closeout`                                                                                                                                                                                                                                                                                                                                                                                                         | Submit for Review                                                                 |

`workflow.process.change-cascade` runs after every accepted design, copy, product, or price change. The copy deck, store fields, landing, email, and marketing context are cascade surfaces.

First step after the stop line: `workflow.store.app-review-observe`, then `remediate`, then `resubmit`.

## Design-Critical Waves

After Go and before engineering becomes the critical path, run these waves. Keep each wave at five agents or fewer. Reconcile state between waves.

1. Reference librarians. Quarantined and read-only. Output: structured reference packs and frozen rubrics under `design/reference-packs/` and `design/reviews/rubrics/`.
2. Producers. Design-guru for the Design Room and the landing story map. Product-leader for onboarding evidence including `ONB-08`. Copy-specialist for the copy brief and deck. Producers consume the packs. They do not scrape live sites.
3. Auditors in fresh contexts. Emotional auditor, `ONB-20`, design-system audit, motion-contract review. The design-system audit records its structured delegated Taste Gate decision beside its findings only when the current run carries the reducer-audited `decision.design.taste.delegation: approved` founder decision.
4. Orchestrator integration, then the recorded Taste Gate decision on the landing and onboarding first screens. The founder or owner decides directly in `DESIGN.md` and binds the exact candidate through `b2c approve --design-taste`; a delegated design-system audit decides in its current engine-bound findings artifact. When the founder retains taste authority, the audit waits for that direct decision.

Engineering is not the critical path until the landing story map and the onboarding first-value screens hold a Design Room direction and an isolated auditor pass the founder can still reject.

## Reference Before Create

No generated image, no native animation, no landing motion choreography, no icon, and no empty-state art until a dated reference pack exists for that surface. The task picks the sources through the `reference.design.design-evidence-stack` router. Taste does not.

Every shipped animation has a motion register row: surface, user job, reference shot or flow IDs, adopted principle, token, haptic, interruption, reduced-motion twin, and frame budget. No row, no motion. `check:motion-contract` is the gate.

## Words Contract

Copy is one shared input. It gets a contract and gates, not per-screen improvisation.

- `product/copy/COPY_BRIEF.md`: promise, message hierarchy, voice and tone, voice benchmarks, voice-of-customer phrase bank, and the claims ledger. Freeze it before any surface copy.
- `product/copy/COPY_DECK.md`: every user-facing string as one keyed row with locale tier and allowed terms. Deck keys are the String Catalog keys. A screen with no deck row stops the builder.
- `product/copy/COPY_REVIEW.md`: auditor findings per surface, versioned against the rubric.
- String freeze before store screenshots and translations. Late edits go through the change cascade.

`workflow.words.copy-review-audit` is the isolated auditor. `check:app-copy` and `check:founder-copy` are the mechanical gates.

## The Craft Bar

Phase numbers are sequence, not permission to look unfinished. Everything that ships is designed and built at the stated bar. A surface meets the bar only when all twelve hold:

1. Three real concepts before convergence, not three tints of one idea.
2. Objects have physical presence: layers, anchors, overlap, shadow, settle. Nothing floats without a reason.
3. Motion explains structure. A slow fade is not the default response to every change.
4. Mobile is recomposed, not shrunk.
5. Each medium is native. A story supports reading. A walkthrough supports action. A video supports time, captions, and progress.
6. Restraint. Quiet space around the important thing.
7. Micro-interactions are specified with feedback, interruption, completion, spring, and a reduced-motion twin.
8. Quality facets are named per surface and compared to the current industry standard: meet, exceed, or deliberately break with a reason.
9. Every visual traces to an audience fact in `strategy/RESEARCH.md`.
10. Edge states exist: empty, loading, error, offline, reduced motion, Save-Data, and no-JS on the web.
11. Cross-surface coherence: app, landing, funnel pages, screenshots, email, ads, and store metadata share tokens, nouns, and object language.
12. Honest. Claims match what the build does today. Generated art never impersonates the product.

The generic default fails even when it is pixel-neat. `reference.design.vibecoded-tells` names the tells. `check:audience-identity` enforces the shared object language.

## Full Web Funnel

Model every funnel URL in `studio/seed/business.json` as a Design Room surface with shared token references: landing, waitlist, web-to-app worksheet, support, privacy, terms, account deletion, and any referral, campaign, or purchase page the monetization cut creates. Run GEO/SEO before the first public-page edit so the baseline is dated. Each public page gets an isolated CRO, scrollytelling, and vibecode audit before `done`.

## Definition Of Done

The founder can sit down and submit when every row holds.

| Item                                                                                                                                                                                 | Evidence                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Research audited and red-teamed in a fresh context; founder Go recorded                                                                                                              | `strategy/RED_TEAM_FINDINGS.md`; `check:research-workflow-output`                                                                                                                                                 |
| `PRODUCT.md` accepted with the north-star metric and the first-value surface; emotional design plus its isolated audit                                                               | `check:product-md`; `check:emotional-design`                                                                                                                                                                      |
| `DESIGN.md` accepted with design.md lint clean and no diff regression; Design Room; token promotion; isolated design-system audit; object map in every surface                       | `check:design-md`, `check:design-room`, `check:token-promotion`, `check:design-worthiness`, `check:audience-identity`; `design/reviews/DESIGN_SYSTEM_REVIEW.md`                                                   |
| Words: frozen brief, complete deck, isolated review per surface, string freeze dated before screenshots                                                                              | `check:app-copy`, `check:founder-copy`; `product/copy/COPY_REVIEW.md`                                                                                                                                             |
| Website and funnel: story map, semantic no-JS page, measured scrollytelling, mobile composition, every modeled URL, CRO audit, GEO/SEO baseline and post-change, email routes tested | `check:scrollytelling`, `check:landing-funnel`, `check:vibecoded-tells`, `check:email`; `growth/CRO_AUDIT.md`; `GEO_SEO.md`                                                                                       |
| Onboarding graph implemented; `ONB-08` register with shot IDs; `ONB-18` prototype with every state; `ONB-20` by a different agent                                                    | `check:onboarding-graph-complete`, `check:onboarding-evidence-onb-08`, `check:onboarding-evidence-onb-20`                                                                                                         |
| Motion register complete                                                                                                                                                             | `check:motion-contract`                                                                                                                                                                                           |
| App builds, tests, accessibility, quality and vitals, security, privacy manifest, required-reason APIs; readiness has device evidence for every declared platform                    | `check:security`, `check:secrets`, `check:apple-requirements`, `check:readiness-coverage`; iOS: `check:native-ios`; Android: `check:mobai-proof` and `check:native-android`; mixed: all three native proof checks |
| Listing packet, keywords, truthful screenshots, App Preview and demo video, What's New, review notes, age rating, privacy answers, regional compliance                               | `check:store-console`, `check:aso-evidence`, `check:store-screenshots`, `check:app-review-contract`                                                                                                               |
| Archive whose Info.plist matches the store version and build; upload when the envelope allows                                                                                        | `check:apple-release-readiness`                                                                                                                                                                                   |
| Store console click path ending at Submit for Review                                                                                                                                 | `check:app-review-contract`                                                                                                                                                                                       |
| Support, privacy, terms, and deletion URLs work; legal questions answered; legal text approved                                                                                       | `check:privacy`; `LEGAL_REVIEW.md`                                                                                                                                                                                |
| Launch narrative, paid UA, viral, UGC contracts, and post-launch operations skeleton each done or dated-deferred                                                                     | `check:paid-ua`, `check:post-launch`                                                                                                                                                                              |
| Every lane done, blocked with a founder action, or deferred with a reason; every external pack recorded in `strategy/TOOL_DECISIONS.md`                                              | `check:lane-coverage`                                                                                                                                                                                             |
| Handoff: what the founder clicks, in order, and the one remaining founder action                                                                                                     | `check:founder-copy`                                                                                                                                                                                              |
| Review ledger complete: every producer-to-auditor pair, rubric version, verdict, and artifact                                                                                        | `check:orchestration`                                                                                                                                                                                             |

A store-ready binary with a generic landing, a carousel onboarding, unaudited copy, or a self-reviewed design is not done.

## Founder Decisions

Use the founder-zero contract: two or three choices, one recommendation, consequences, a defer path, and a revisit trigger, in plain language.

The user's authorization to create or adopt a local workspace covers its registration. Pause when that authorization does not cover the target or registration, or when it would affect a different existing business.

Pause for: paid-tool access or spend, Go/Pivot/Kill, brand and taste, pricing, legal identity, Apple enrollment and agreements, the TestFlight versus submit envelope, and the live domain deploy.

The agent never submits for review, releases to production, enrolls or rotates certificates, sets prices, spends without a ceiling, publishes legal text as final, or copies another app's secrets.

## Handoff Every Turn

Report what changed, the evidence, the next parallel wave, the serialized critical path, and the one decision only the founder can make.

## Design Delivery Loop

One founder mandate includes the internal research, production, independent critique, repair, and verification rounds needed for the complete accepted design. Never substitute a partial product or a generic first draft to finish a round. Keep product scope in `product.yaml` and global design authority in `DESIGN.md`.

Use `reference.design.consumer-craft-benchmarks` to derive product-specific visual and interaction criteria. Freeze each surface rubric and its inspected references before production. The prebuild design-system audit validates the direction. After implementation, `workflow.design.implementation-craft-audit` inspects the actual native app and the landing page at phone and desktop sizes. It produces the exact-artifact evidence defined by `reference.design.design-acceptance` and runs `check:design-acceptance`.

Every required surface and state must meet every agreed floor. A strong landing page cannot compensate for a weak mobile app. An image path or a design document cannot substitute for the rendered interface and exercised interactions. Rejected findings return to the responsible producer for a bounded repair and a fresh independent review. A changed candidate or rubric invalidates the earlier acceptance. Retain the best accepted candidate while comparing repairs; do not assume a later attempt is better.
