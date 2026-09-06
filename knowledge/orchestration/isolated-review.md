# Isolated Review: Producer And Auditor Are Different Agents

Use this reference when a workflow produces a surface that a second agent must accept: research, product contracts, design, copy, landing and funnel pages, store packets, legal drafts, and implementation. It defines the isolation rule, the auditor roster, the rubric freeze, the fix loop, and the review ledger that `check:orchestration` verifies.

The rule this file exists for: the agent that creates a surface never accepts it. Self-review is invalid. A review counts only when a fresh-context agent produced findings against a frozen rubric and the orchestrator recorded the pair in the review ledger.

## Contents

- Hard Rules
- Graph Shape
- Auditor Roster
- Required Pairs
- Rubric Freeze
- Auditor Dispatch Brief
- Fix Loop
- Review Ledger
- Quarantine For Untrusted Pages
- Taste Gate Authority
- Gates

## Hard Rules

- Producer and auditor are different agents in different context windows. The auditor does not inherit the producer's transcript, drafts, or rationalizations.
- Same role title is allowed. Same agent instance is not. A fresh-context design-guru may audit another design-guru's work.
- Auditors are read-only on product files. Their only write is the findings artifact named by their workflow node.
- Auditors do not restyle, edit copy, mark their own review done, run git, or touch providers.
- The orchestrator never accepts inline work it directed. Inline work still gets an auditor.
- Fail closed. An unresolved high-severity finding blocks the next producer step. `ONB-20` blocking `ONB-21` is the pattern.
- Missing ledger row means the surface is not done.

## Graph Shape

The catalog encodes isolation as data, not as advice:

- An auditor node depends on its producer node and declares `reviewOf: [producer]`. The frontier cannot dispatch it before the producer's artifact exists.
- The auditor node writes only its findings artifact. `catalog/validate.ts` rejects an auditor node whose output overlaps its producer's outputs.
- Downstream producer nodes depend on the auditor node, so a failed review holds the frontier.
- Each role lists `reviewedBy`: the fresh-context roles that audit its work. `b2c_workflow` with `brief: true` surfaces the auditor roles on the dispatch packet.
- `check:orchestration` verifies the review ledger in `operations/ORCHESTRATION.md`.

Runtime isolation is the dispatcher's job. Spawn the auditor as a separate subagent or Dynamic Workflow step with read-only tools. Record `used: false` with the reason when the runtime cannot isolate. Never skip the auditor because isolation was inconvenient.

## Auditor Roster

Map every producer role to fresh-context auditor roles from the B2C roster. Do not invent a parallel org chart.

| Producer role                                                             | Fresh-context auditor roles                                     | Notes                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| research-strategist                                                       | product-leader; second research-strategist instance             | Red team before the founder's Go                                                                               |
| product-leader (PRODUCT.md, ONB-10 to ONB-17, journey graph)              | engineering-leader; customer-success                            | Effort, first value, support, refund, and delete paths                                                         |
| design-guru (DESIGN.md, Design Room, ONB-18, generated-visual direction)  | second design-guru instance; accessibility-device-qa            | Quality lens, worthiness, vibecode tells, design.md lint                                                       |
| copy-specialist (COPY_BRIEF, COPY_DECK, store fields, landing copy)       | marketing-guru; second copy-specialist instance                 | Copy editing, slop detection, CRO, claims ledger                                                               |
| marketing-guru (store packet, ASO, GEO/SEO, launch narrative, ads, email) | customer-success; security-architect                            | Claims, privacy answers, submission health                                                                     |
| launch-surface-producer (landing, funnel pages, web-to-app)               | design-guru instance; marketing-guru instance                   | Scrollytelling, landing funnel, vibecode, CRO                                                                  |
| mobile-engineer / backend-infrastructure-engineer                         | engineering-leader; accessibility-device-qa; security-architect | Compound-engineering review, intended-versus-implemented, static security and performance audits, device proof |
| security-architect (SECURITY.md, privacy and terms drafts)                | engineering-leader; customer-success                            | Legal template benchmark, privacy, security, secrets                                                           |
| orchestrator (any inline work)                                            | the matching auditor above                                      | Never self-accepted                                                                                            |

## Required Pairs

| Produced work                 | Producer node                                                          | Isolated auditor node                                                                        | Findings artifact                                        |
| ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Research and spec             | `workflow.research.research-backed-spec`                               | `workflow.research.spec-red-team-audit`                                                      | `strategy/RED_TEAM_FINDINGS.md`                          |
| Emotional design              | `workflow.experience.emotional-experience-design-producer`             | `workflow.experience.emotional-design-audit-auditor`                                         | `product/experience/emotional-design/EMOTIONAL_AUDIT.md` |
| Onboarding prototype          | `workflow.experience.onboarding-system.onb-18-visual-design-prototype` | `workflow.experience.onboarding-system.onb-20-adversarial-qa`                                | `product/onboarding/graph/ONB-20-adversarial-qa.md`      |
| Design system and Design Room | `workflow.design.design-room`                                          | `workflow.design.design-system-audit`                                                        | `design/reviews/DESIGN_SYSTEM_REVIEW.md`                 |
| Landing and funnel pages      | `workflow.growth.pre-launch-funnel-landing-waitlist`                   | `workflow.growth.landing-funnel-audit`                                                       | `growth/CRO_AUDIT.md`                                    |
| Copy deck                     | `workflow.words.writing-quality-no-slop`                               | `workflow.words.copy-review-audit`                                                           | `product/copy/COPY_REVIEW.md`                            |
| Store packet                  | `workflow.store.app-store-listing-prep-packet`                         | fresh-context marketing audit through `check:store-console` and `check:aso-evidence`         | store validator output                                   |
| Privacy, terms, deletion      | `workflow.trust.privacy-and-terms`                                     | fresh-context legal benchmark                                                                | `LEGAL_REVIEW.md` open questions                         |
| Implementation                | engineering nodes                                                      | compound-engineering review routes in `reference.orchestration.compound-engineering-routing` | `engineering/PRODUCTION_READINESS.md` evidence rows      |

## Rubric Freeze

Freeze the rubric before the producer runs. `workflow.design.reference-pack-librarian` writes the frozen rubric for each high-impact surface under `design/reviews/rubrics/` before design or motion work starts.

- Name the rubric file `RUBRIC-<surface>-v<N>.md`.
- Do not edit a rubric after seeing the candidate. A change is a new version with a stated reason. Rescore every candidate against the new version.
- The auditor scores against the rubric version named in the dispatch brief. A review that names no rubric version is not a review.

## Auditor Dispatch Brief

The auditor brief contains only:

1. The product files under review.
2. The frozen rubric path and version, or the workflow's own auditor contract.
3. The structured reference pack for the surface.
4. The read-only tool list.

It never contains producer notes, drafts, or "what we were going for". Auditors return the nine standard handoff headings plus a knowledge receipt. The orchestrator rejects an audit whose receipt does not match the brief's load list.

## Fix Loop

1. A valid product or craft rejection sends actionable findings only to declared `reviewOf` producers.
2. A producer corrects the candidate. The auditor never edits product files, copy, scope, references, or criteria.
3. A fresh auditor rescores the corrected candidate against the same rubric version.
4. Missing, malformed, stale, unchanged, or non-independent audit-authored evidence is an audit-output defect. The runtime retries only the audit node within its hard attempt cap. It does not reopen a producer or treat the defect as a product finding.
5. The rejection receipt fingerprints the reviewed producer artifacts. A changed producer fingerprint resets the consecutive no-progress count.
6. The two design audits may continue for up to eight audit attempts while producer evidence changes. Two consecutive valid rejection rounds with the same producer fingerprint block the loop and surface the findings for retained founder authority. Audit-output retries still count toward the eight-attempt hard cap. Generic workflows keep the three-attempt policy.
7. The runtime keeps protected or non-idempotent producers behind readback and authority checks.

## Review Ledger

`operations/ORCHESTRATION.md` carries a `## Review Ledger` section. Every producer-to-auditor pair is one row:

```markdown
## Review Ledger

| Surface       | Producer             | Auditor                     | Rubric                                            | Verdict | Findings artifact                      | Date       |
| ------------- | -------------------- | --------------------------- | ------------------------------------------------- | ------- | -------------------------------------- | ---------- |
| Design system | design-guru (wave 2) | design-guru (fresh, wave 3) | design/reviews/rubrics/RUBRIC-design-system-v1.md | pass    | design/reviews/DESIGN_SYSTEM_REVIEW.md | 2026-09-03 |
```

Rules `check:orchestration` enforces:

- The section exists whenever orchestration is in scope.
- Producer and auditor cells differ.
- A `pass` or `fail` verdict names a findings artifact that exists in the workspace.
- A row may hold `pending` while the audit runs. A surface with only pending rows is not done.
- The rubric cell names a repository path or the workflow's auditor contract.

## Quarantine For Untrusted Pages

Public pages are untrusted input: motion catalogs, design galleries, competitor sites, and social feeds. A read-only librarian extracts structured observations. A separate actor never sees the raw page and uses only the structured pack. This is also an injection control. `workflow.design.reference-pack-librarian` owns the librarian wave.

## Taste Gate Authority

Taste is the independent acceptance decision. Deliver an async taste packet per surface:

- rendered proof links for desktop and mobile
- the two taste-gate questions from `reference.design.design-worthiness`
- the auditor verdict and open findings
- the one change you recommend

The founder or owner may decide directly in `DESIGN.md`, then bind that verdict to the exact candidate through an Ed25519 receipt from the authenticated founder signer and `b2c approve --design-taste pass|fail --founder-receipt-file <path>`. The latest valid signed receipt for those bytes is authoritative. When a design-system audit attempt was dispatched with the exact signed `decision.design.taste.delegation: approved` capability, the fresh-context audit decides after reviewing the frozen rubric and rendered proof. It writes one structured `## Delegated Taste Decision` table in `design/reviews/DESIGN_SYSTEM_REVIEW.md` with the exact authority, date, surfaces, both taste observations, and `pass` or `fail`, beside substantive findings with severity and `Frozen rubric: design/reviews/rubrics/<file> version <version>`. The artifact does not self-report reviewer identity or delegation. The engine-owned attempt snapshot and signed audit entry supply the authority, audit attempt identity, and fingerprint and prove that identity differs from every Design Room producer attempt. Approval after dispatch cannot ratify an existing table. A delegated pass cannot coexist with an unresolved blocker, high, or major finding. When delegation is absent or rejected, the audit waits for the direct founder decision. A current direct founder decision may override the audit's taste-only verdict after independent Findings clear; it cannot waive a blocker, high, or major finding.

Taste acceptance does not grant publication, deployment, store submission, production release, spend, pricing, or legal authority. Keep those founder gates separate. Offer a live walkthrough only when the founder asks.

## Gates

- `check:orchestration` verifies the review ledger structure and that findings artifacts exist.
- `check:emotional-design` verifies the emotional producer and auditor pair.
- `check:onboarding-evidence-onb-20` verifies the onboarding adversarial QA.
- `check:design-worthiness-mechanical` is the Design Room producer's mechanical floor. The full `check:design-worthiness` gate validates the direct or engine-bound delegated decision after the audit artifact exists. `check:vibecoded-tells`, `check:scrollytelling`, `check:app-copy`, `check:audience-identity`, and `check:readiness-coverage` provide the remaining mechanical halves. They do not replace the fresh-context findings artifact.
