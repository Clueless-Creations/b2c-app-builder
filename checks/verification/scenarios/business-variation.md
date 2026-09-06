# Distinct consumer-business benchmark

Status: criteria frozen; no businesses selected or graded.
Rules: ARCH-03, ARCH-13, ARCH-14. Units: U18, U19.

Bind two independently registered workspaces before running this comparison.
Record each accepted product and design revision, composition digest, code
revision, artifact hashes, and independent whole-business report. Each business
must pass the applicable criteria in `complete-business.md` on its own evidence.
One business cannot inherit another's acceptance or provider account.

| Criterion ID            | Observable condition                                                                                 | Required evidence                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| bv.product.variation    | The sibling changes the core interaction, onboarding, or delivery of value.                          | Accepted product scopes, journey recordings, and an independent explanation of the meaningful difference.                     |
| bv.composition.reuse    | Existing capabilities supply shared business responsibilities.                                       | Exact package and binding digests; reused versus app-specific code inventory; rationale for each new primitive.               |
| bv.workspace.isolation  | Activating an upgrade in one workspace leaves the other's pins, artifacts, and acceptance unchanged. | Before/after revisions and hashes from both workspaces, including a refused stale-revision activation.                        |
| bv.kernel.generality    | App-specific behavior needs no product-name conditional in the kernel.                               | Reviewed source diff and dispatch receipts through the same public contract.                                                  |
| bv.agent.repeatability  | A fresh-context agent completes applicable local work through documented entrypoints.                | Initial mandate, available skill version, public requests/results, repair history, and final independently reviewed evidence. |
| bv.effort.comparability | Reuse claims compare equivalent work.                                                                | Scope-normalized work inventory and intervention log; no effort claim from unlike product scope.                              |

Freeze criteria and category references before production. Preserve criterion IDs
in the result. Each verdict is pass, fail, ungraded, or not-applicable, with a named
independent reviewer and evidence references. A not-applicable verdict requires an
accepted scope reason. Missing external proof stays ungraded.

Record founder and maintainer interventions by purpose, duration, and affected
operation. Separate reserved business or spend decisions from undocumented setup,
missing contracts, manual repairs, and hidden orchestration. Repair and replay
undocumented technical steps before claiming repeatability. Synthetic fixtures
can prove isolation mechanics; they cannot establish either business's quality.

Write the comparison in the selected workspace's verification area. Include both
individual reports, unresolved gaps, and exact current revisions. This contract
creates no business, provider account, paid resource, or release authorization.
