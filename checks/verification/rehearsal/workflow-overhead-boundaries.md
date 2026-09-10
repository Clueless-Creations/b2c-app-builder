# #73 selected-subgraph boundary table

Compact keep/change table for the firstparty onboarding responsibility group
plus the #38 Apple media effect. This is catalog inspection, not a measured
#72 interval.

Builder pin: current `main` at authoring time. Observed cost is **unknown**.
Actual model usage is **unknown**. Candidate action is **keep** until a
measured interval exists.

The unit of analysis is the selected onboarding subgraph in
`FIRSTPARTY_RESPONSIBILITY_GROUPS` (Product experience), not the whole catalog.
Do not merge to reduce workflow count.

## Boundary table

| Node(s) | Consumer / output | Owner | Authority | Review role | Why separate execution is necessary | Observed cost | Candidate action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onb-16-journey-graph` | `product/onboarding/graph/ONB-16-journey-graph.md` | `role.product-leader` | Product journey map | Later ONB-17/18/20 consume this file | Independently consumed accepted output. ONB-17 and ONB-20 depend on the graph without owning it. | unknown | keep |
| `onb-17-screen-control-paywall-contract` | `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md` | `role.product-leader` | Screen / paywall contract | ONB-20 adversarial QA reads this contract | Different accepted artifact and failure semantics from the journey graph. A stub contract would let QA run against nothing. | unknown | keep |
| `onb-18-visual-design-prototype` vs `workflow.design.design-system-audit` | DESIGN.md / Design Room vs audit findings | Design producer vs design auditor | DESIGN.md is design authority | Auditor must not be the producer | Independent-review boundary. Self-acceptance is not review. | unknown | keep |
| `onb-20-adversarial-qa` | Adversarial QA packet | Experience QA | Contract under test is ONB-17 | Fresh context after producers | Different failure/recovery: QA must not also author the contract it attacks. | unknown | keep |
| `onb-12-state-identity-contract` vs `onb-13-analytics-experiments` | Identity/state contract vs experiment plan | Product vs analytics specialist | Different protected facts | Separate specialist context | Useful parallel ownership. Merging identity with experiments mixes grants and invalidation. | unknown | keep |
| `workflow.store.apple-store-media-standing-envelope` | `store/proof/apple-store-media-apply.json` | Store media apply | Live Apple mutation | Readback of the media set | #38 independent-effect boundary. Distinct grant, distinct live side effect. Not an onboarding node. | unknown | keep |

## Keep/change

**Retain the current graph.** No recipe merge, no context-reuse experiment, and
no `work-package-equivalence` suite until a #72 interval records actual
dispatch, elapsed vs summed work, and review time.

#25 / #52 CI and runner economics stay out of this table.

## What this does not do

- Does not GitHub-close the issue.
- Does not invent elapsed time, token use, or a live onboarding run.
- Does not consolidate ONB-16 with ONB-17, producer with auditor, or Apple media with listing text.
