# ADR-0014: Research checkpoints do not grant initialization eligibility

- **Status:** accepted
- **Date:** 2026-09-12
- **Steward:** founder-directed architecture decision
- **Affected rules and contracts:** ARCH-07, ARCH-09, ARCH-10, ARCH-11, ARCH-15; research validator and initialization boundary
- **Affected work:** #395, #397, #71, #74

This record does not grant product, pricing, legal, provider, deployment, publication, or release authority. It records the narrow compatibility decision required before the research lifecycle implementation.

## Context

The research artifact carries several facts that must not collapse into one readiness bit:

| Fact                       | Current owner                                                                                 | Meaning                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Artifact contract validity | `checks/validation/business/research/check-research-evidence.ts` and `kernel/schema/index.ts` | The authored research structures parse and satisfy their required fields.                                          |
| Independent assessment     | Existing review receipts and freshness checks                                                 | A reviewer recommendation remains bound to the reviewed revision; it is not founder authority.                     |
| Experiment execution       | `strategy/OFFER_TEST.md` and its validator                                                    | `run` and `waived` retain their documented compatibility meaning; neither turns unknown demand into a measurement. |
| Founder product decision   | `product.yaml` and its rendered `PRODUCT.md`                                                  | The accepted product remains the canonical product authority.                                                      |
| Initialization eligibility | `kernel/session/bootstrap.ts`                                                                 | Durable initialization requires the accepted product and rendered projection.                                      |
| Execution authority        | Existing grants, protected-effect gates, and run receipts                                     | Initialization never grants authority to perform protected work.                                                   |

The prior validator treated a well-formed Pivot or Kill row in a completed research lane as an error. That forced a valid checkpoint to masquerade as malformed input, even though the existing initialization boundary already refuses a product whose `meta.status` is not `accepted`.

## Decision

1. A valid Go, Pivot, or Kill row is a valid research checkpoint when its required evidence, date, and founder decision fields pass structural validation.
2. A Pivot or Kill checkpoint emits the stable `research.go_pivot_kill_not_go` warning with explicit held-state guidance. It does not become a Go, improve evidence strength, or authorize initialization.
3. Initialization eligibility remains owned by `kernel/session/bootstrap.ts` and the accepted `product.yaml`/`PRODUCT.md` pair. No new readiness store, enum, or automatic migration is introduced here.
4. Existing offer-test statuses `run` and `waived` remain unchanged. A waiver changes only the permitted decision path; it does not claim measured conversion or resolve an independent finding.
5. Later lifecycle work may add a read-only checkpoint projection and one guarded authoring action, but those consumers must preserve this separation and validate current inputs before any write.

## Compatibility and migration

No public schema changes and no migration are introduced by this record. Existing Go, Pivot, Kill, `run`, and `waived` records remain parseable. The changed behavior is limited to the severity and message of the non-Go checkpoint diagnostic. Existing initialization still refuses non-accepted products, so a non-Go checkpoint cannot initialize by accident.

## Evidence

- `checks/validation/business/research/check-research-evidence.ts`: research checkpoint validation and non-Go diagnostic.
- `kernel/session/bootstrap.ts`: accepted product and rendered `PRODUCT.md` initialization gate.
- `kernel/schema/index.ts`: stable `run`/`waived` offer-test contract and waiver checks.
- `checks/validation/repository/fixtures/core-artifacts.fixtures.ts`: synthetic Kill and Pivot checkpoint regressions.
