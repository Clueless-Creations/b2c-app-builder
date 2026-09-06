# 0001 — Metric-contracts validator and optional template paths

- **Status:** accepted
- **Date:** 2026-09-05
- **Steward:** architecture steward session of 2026-09-05 (Claude Code), acting under the roadmap's delegated architecture ownership
- **Affected rules and contracts:** ARCH-07, ARCH-12; roadmap U16 Files list; cockpit plan `2026-09-02-0035` U3
- **Affected units:** U16, U22, U20

## Context and evidence

Roadmap U16 names `checks/validation/business/data/check-analytics-catalog.ts`
as the validator it extends. That file reconciles analytics event names declared in
product documents against `analytics/ANALYTICS.md` (`check-analytics-catalog.ts:1-21`).
It reads no operating-model record and knows nothing about metric definitions,
currency, cohorts, or identity. The earlier cockpit plan names
`checks/validation/business/operations/check-metric-contracts.ts` for the same gate
(`docs/plans/2026-09-02-0035-feat-operating-cockpit-plan.md:316`), which matches
the sibling validators already in `checks/validation/business/operations/`
(`check-agent-operations.ts`, `check-post-launch-ops.ts`, `check-portfolio-registry.ts`).

U16 also names `surfaces/workspace-template/operations/metric-contracts.json` as an optional
template. `workspace-template/` has two roots only: `new-business/` (the files a new
business workspace receives) and `repo-agent-entrypoints/`. No `operations/`
directory exists at the template root, while the reference workspace keeps its
operations artifacts under `examples/workspace/business/operations/`.

The U16 assignment audit flagged both as decisions an implementer must not make
silently.

## Alternatives

1. Extend `check-analytics-catalog.ts` as the roadmap's Files list reads. Rejected:
   it would fold metric semantics into an event-name reconciler with a different
   scope guard and issue-code family, and it contradicts the cockpit plan.
2. Create `checks/validation/business/operations/check-metric-contracts.ts`. Accepted:
   matches the sibling convention, the cockpit plan, and the reference instance's
   location under `examples/workspace/business/operations/`.
3. Put the optional template at `surfaces/workspace-template/operations/`. Rejected: no
   template root of that shape exists and nothing installs it.
4. Put the optional template at `surfaces/workspace-template/new-business/operations/metric-contracts.json`.
   Accepted: `new-business/` is the installed business template and the path mirrors
   the reference workspace layout.

## Decision

U16 creates `checks/validation/business/operations/check-metric-contracts.ts`
and does not modify `check-analytics-catalog.ts`. The optional template lives at
`surfaces/workspace-template/new-business/operations/metric-contracts.json`
and is installed only when the recipe selects it. The roadmap's U16 Files list is
read with these two substitutions; the plan text stays unchanged and this record
is the authority for the paths.

## Compatibility and migration

No public `b2c/v1` input or output changes. `check:analytics-catalog` keeps its
current behavior and fixtures. The new validator registers through the existing
audit plan, `docs/validators.md`, and validator fixtures like every sibling.

## Consequences

- U16 authors the validator, schema, reference instance, and template at the paths above.
- U22 and U20 reference `operations/metric-contracts.json` by this path.
- Gate wiring into `catalog/workflows/operations-trust.ts` waits for the integrator's
  U8/U10/U16 schema window named in the roadmap.
