# ADR-0011: Additive public business-plan projection

- **Status:** proposed
- **Date:** 2026-09-08
- **Steward:** pending architecture-steward acceptance
- **Affected rules and contracts:** ARCH-09; public interface `business.plan`; U25
- **Affected units:** U25; consumed by #71 and #74

This record does not grant access, spend, or approval. Additive output fields
inside `b2c/v1` do not change input schemas or historical `reason` text.

## Context and evidence

Public `business.plan` called `planWorkspace(..., { observeProviders: false })`
and then replaced each hold with one generic sentence. `kernel/session/plan.ts`
already computes `HeldNode.reason`, `detail`, `reasonCode`, `lastFailure`,
`readyBriefs`, and `founderQuestion`. Agents had to reconstruct those facts from
internal files. Issue #68 records the lossy projection.

## Alternatives

1. Change the existing held `reason` string to the planner detail. That would
   alter a field meaning for saved clients.
2. Add a second planner or public diagnostic store. That duplicates the
   compiler/autonomy owner and would not stay passive.
3. **Recommended:** keep `reason` unchanged and add optional typed fields
   projected from the existing `PlanReport`.

## Decision

`contracts/public-api/contract.ts` is the single owner of the public plan shape.
`kernel/services/plan-projection.ts` is the single allowlisted projector.
Kernel types are not imported into the contract.

Initialized `business.plan` data may include:

- `held[].holdKind`: `founder_approval` | `autonomy` | `blocked` | `upstream`
- `held[].detail` and optional `detailTruncated`
- `held[].lastFailure`: `{ summary, withheld, truncated, code? }`
- `ready[].brief`: bounded workflow identity, workspace-relative paths,
  knowledge selectors, verification, and `truncated`
- `founderQuestion`: the validated engine question plus `appliesToRevision`

`reason` on held items stays the historical generic sentence. `authorityGranted`
stays `false`. `providerObservation` stays `not_requested`. Planning remains
read-only. A founder question is not an approval id and cannot be replayed
against a different revision.

When safe detail is unavailable, the response names the hold category and that
limit. It does not invent recovery steps or claim a provider is missing.

## Compatibility and migration

Existing required fields stay required. New fields are optional. Saved results
without them still parse. Clients must tolerate additive output. CLI and MCP share
this schema. #71 and #74 must consume these fields rather than invent another
report contract. No workspace pin or composition migration is required.

## Consequences

Steward acceptance should keep this record proposed until an independent review
confirms the mapping. Founder-reserved authority is unchanged. If a later
question needs a durable approval binding beyond `appliesToRevision`, that is a
separate contract decision.
