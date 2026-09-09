# Architecture decision records

This directory holds the architecture steward's decisions. A decision changes a
public contract, truth ownership, dependency direction, authority, or a
migration guarantee. The [conformance protocol](../architecture-conformance.md)
names when a decision is required. Compatible implementation choices inside one
unit do not need a record here.

The founding decisions are KTD1 through KTD9 in the
[migration roadmap](../plans/2026-09-04-1747-refactor-consumer-business-primitives-plan.md).
KTD1, KTD2, and KTD5 are marked `session-settled: user-approved` there. A record
in this directory refines or supersedes a KTD explicitly. It never edits the
roadmap's decision text in place.

## Index

| ID                                                            | Title                                                              | Status   | Affects                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------ | -------- | ----------------------------------------------- |
| [0001](0001-metric-contracts-validator-and-template-paths.md) | Metric-contracts validator and optional template paths             | accepted | U16, U20, U22                                   |
| [0002](0002-repository-layout.md)                             | Repository layout: the repository root is the package root         | accepted | ARCH-01, ARCH-05, U1, U4, U5, U9, U15, U16, U18 |
| [0003](0003-single-mandate-business-system.md)                | Single-mandate consumer-business system                            | accepted | ARCH-01–ARCH-15, U2–U26                         |
| [0004](0004-porchwatch-continuation-and-knowledge.md)         | Preserve complete mandates and make required knowledge retrievable | accepted | ARCH-02, 03, 07, 09, 10, 11                     |
| [0005](0005-source-adoption-and-upstream-maintenance.md)      | Source adoption and upstream maintenance                           | accepted | ARCH-05, 06, 07, 09, 10, 11, 15                 |
| [0006](0006-onboarding-foundations-before-design.md)          | Onboarding research, identity and measurement precede design       | accepted | ARCH-02, 03, 07, 09, 10, 11, 12                 |
| [0007](0007-upstream-lifecycle-and-agent-scopes.md)           | Upstream lifecycle handoff, relationship kinds, and agent scopes   | accepted | ADR-0005; ARCH-06, 07, 09                       |
| [0008](0008-agent-onboarding-entry-path.md)                   | Distinguish business creation from workspace adoption              | accepted | ARCH-07, 09, 11; U25                            |
| [0009](0009-bespoke-design-foundations.md)                    | Bespoke design foundations in existing authorities                 | accepted | ARCH-03–09, ARCH-11–15; U9, U13, U18, U19       |
| [0010](0010-first-run-honesty-owners.md)                      | First-run honesty owners for doctor, portfolio, and exclusions     | accepted | ARCH-07, 09; ADR-0005, 0007; U1, U4             |
| [0011](0011-additive-public-business-plan-projection.md)      | Additive public business-plan projection                         | proposed | ARCH-09; U25; public `business.plan`           |

## Write a record

1. Copy [0000-template.md](0000-template.md) to `NNNN-short-slug.md` with the next
   four-digit number.
2. Fill every section. Cite evidence as `path:line` or a command and its output.
3. Update the owning `ARCH-xx` rule in
   [north-star-architecture.md](../north-star-architecture.md) and the affected
   roadmap unit references in the same change.
4. Add the row to the index above. Set the status to `proposed`, `accepted`,
   `superseded by NNNN`, or `rejected`.

A record does not grant access, spend, deployment, store, or release authority.
Founder-reserved decisions keep their existing boundary. A record can only note
that such a decision is pending and who owns it.

