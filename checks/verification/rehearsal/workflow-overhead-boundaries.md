# #73 selected-subgraph boundary table

Compact keep/change table from catalog `reads`, `dependencies`, `reviewOf`,
and `roleId`. This is not a measured #72 interval.

Builder pin: current `main` at authoring time. Observed cost is **unknown**.
Actual model usage is **unknown**. Candidate action is **keep** until a
measured interval exists.

**Selected set** (named, not the whole Product experience group):

- `onb-12-state-identity-contract`
- `onb-13-analytics-experiments`
- `onb-16-journey-graph`
- `onb-17-screen-control-paywall-contract`
- `onb-18-visual-design-prototype`
- `onb-19-implementation-cutover-contract`
- `onb-20-adversarial-qa`
- `workflow.design.design-room` and `workflow.design.design-system-audit`
- `workflow.store.apple-store-media-standing-envelope`

The authored ONB-16 comment in `catalog/workflows/product-experience.ts` matches
those `reads` / `dependencies`.

Do not merge to reduce workflow count.

## Boundary table

| Node(s) | Consumer / output | Owner | Authority | Review role | Why separate execution is necessary | Observed cost | Candidate action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `onb-16-journey-graph` | `product/onboarding/graph/ONB-16-journey-graph.md` | `role.product-leader` | Product journey map | ONB-17 and ONB-18 `reads` / `dependencies` include this file. ONB-19 also `reads` and `depends on` ONB-16. ONB-20 does not read or depend on ONB-16. | Independently consumed accepted output. Keep distinct from the screen/paywall contract. | unknown | keep |
| `onb-17-screen-control-paywall-contract` | `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md` | `role.product-leader` | Screen / paywall contract | ONB-20 `reviewOf` and `reads` this contract (with ONB-18 and ONB-19). | Different accepted artifact from ONB-16. ONB-17 `depends on` ONB-16. | unknown | keep |
| `workflow.design.design-room` vs `workflow.design.design-system-audit` | `DESIGN.md` / Design Room vs `design/reviews/DESIGN_SYSTEM_REVIEW.md` | Both `role.design-guru` | DESIGN.md is design authority | Catalog `reviewOf` is design-room → design-system-audit. Not ONB-18 vs design-system-audit. | Isolated-review pair. The producer cannot accept its own direction. | unknown | keep |
| `onb-18-visual-design-prototype` / `onb-19-implementation-cutover-contract` vs `onb-20-adversarial-qa` | ONB-18 prototype packet and ONB-19 cutover plan vs `ONB-20-adversarial-qa.md` | All three `role.product-leader` | ONB-20 reviews ONB-17, ONB-18, and ONB-19 | ONB-20 `reviewOf` those three. It `reads` their files and does not read ONB-16. ONB-18 `depends on` design-room plus ONB-16/17. | Isolated review of the delivery chain. ONB-19 stays in the selected set because ONB-20 reviews it. | unknown | keep |
| `onb-12-state-identity-contract` vs `onb-13-analytics-experiments` | `ONB-12-state-identity-contract.md` vs `ONB-13-analytics-experiments.md` | Both `role.product-leader` | Distinct artifacts | Sequential: ONB-13 `depends on` ONB-12 (and ONB-10 / ONB-14). Not parallel ownership. | Keep as distinct artifacts and invalidation, not a specialist-role split. | unknown | keep |
| `workflow.store.apple-store-media-standing-envelope` | `store/proof/apple-store-media-apply.json` | `role.marketing-guru` | Live Apple mutation | No `reviewOf` on this node. Readback of the media set. | #38 independent-effect boundary. Distinct grant, distinct live side effect. Not an onboarding node. Not in Product experience. | unknown | keep |

## Keep/change

**Retain the current graph.** No recipe merge, no context-reuse experiment, and
no `work-package-equivalence` suite until a #72 interval records actual
dispatch, elapsed vs summed work, and review time.

#25 / #52 CI and runner economics stay out of this table.

## What this does not do

- Does not GitHub-close the issue.
- Does not invent elapsed time, token use, or a live onboarding run.
- Does not consolidate ONB-16 with ONB-17, design-room with design-system-audit, ONB-18/19 with ONB-20, or Apple media with listing text.
