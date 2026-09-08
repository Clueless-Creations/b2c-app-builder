# ADR-0008: Bespoke design foundations in existing authorities

- Status: accepted
- Date: 2026-09-07
- Steward: B2C architecture maintainer
- Affected rules: ARCH-03–09, ARCH-11–15
- Affected units: U9, U13, U18, U19
- Public interface: no operation changes; additive first-party design validation profile

Implementation and empirical acceptance are tracked separately.

## Decision

Extend the existing DESIGN.md authority, knowledge service, asset manifest, token adapters, and acceptance machinery. Core design work requires communication priorities, explicit decision rationale, identity invariants, reference influence, and representative-content typography. Individual visual treatments remain conditional. The decision preserves ARCH-03–09 and ARCH-11–15 and implements the relevant U9, U13, U18, and U19 responsibilities.

A quiet conventional utility is a valid result. Metaphor, asymmetry, cinematic layers, custom icons, 3D, variable rewards, or deliberate wait time cannot be mandatory aesthetics. An independent reviewer judges the effect on the accepted audience and task. Mechanical checks assert only facts they can derive. Counting aesthetic patterns cannot establish failure or superiority.

## Context and evidence

- `tooling/lib/design-md.ts` owns parsing and portable design tokens. Existing typography represented only family and weight; enhanced roles require sizes, leading, tracking, fallbacks, and resource identity.
- `tooling/promote-design-tokens.ts` owns derived platform exports. Exported fields must retain semantics and cannot claim cross-platform rendering from serialization alone.
- `checks/validation/business/design/check-content-assets.ts` owns asset readiness. Vendor-name detection did not cover new providers; versioned production and asset kinds determine the applicable requirements.
- `checks/validation/business/design/design-acceptance.ts` owns the candidate fingerprint and strict independent acceptance. Fonts, incorporated assets, and local brief dependencies must affect candidate identity even when authors omit them from implementation roots.
- `kernel/knowledge-service/service.ts` owns bounded sections and required artifact specifications. Workflow guidance selects these existing sections; no new delivery service or state store is created.
- `kernel/composition/notices.ts` owns package notice verification and rendering. Resource incorporation must carry notices through the actual output boundary; declarations alone do not prove redistribution handling.
- `knowledge/design/quality-lens.md` owns defect diagnosis. Product brief, concept, composition, identity drift, typography, implementation, and claim findings require different repairs.

## Compatibility and authority

Existing public v1 operations and valid legacy DESIGN and asset inputs retain their meanings. Additive versioned fields make the new requirements explicit. New substantive design and production workflows use the enhanced formats. The full design-room workflow selects `check:design-foundation`, an alias of the existing design validator with `--require-foundation`. Content production likewise selects `check:content-assets-foundation`, which requires schema version 2 unless the lane is explicitly deferred or not needed. Direct `check:design-md`, `check:content-assets`, and focused audits retain legacy validation. Removing the foundation cannot make a new substantive design pass as legacy. Bounded legacy maintenance stays with the Design Room owner through existing direct validation and rendering commands, with a fresh independent review. It does not execute or accept the full engine workflow, whose fixed gates remain strict. Focused repairs preserve accepted exploration and any existing foundation and load only affected guidance, while any changed bound input still invalidates global acceptance. Compatibility is not permission to omit the foundation from new work.

The existing author/reviewer separation, protected taste authority, producer receipts, and platform evidence requirements remain intact. A schema-valid record is not execution proof. A benchmark judgment is not an engine-signed product acceptance. No host tool, renderer, package, skill, or provider is installed or selected by adopted source text.

## Alternatives

A separate brand database, technique router, or broad new design skill would duplicate current owners and split review authority. Importing a creator's complete prescribed style would constrain product freedom and confuse examples with requirements. Only selected methods are adopted with source identity, rights, exclusions, and independent review.

## Acceptance

Require legacy compatibility, meaningful failure cases, local and hosted guidance parity, resource-change invalidation, truthful notices, and independent conformance review. Evaluate held-out product outcomes against both ordinary guidance and the frozen pre-change builder. Record failed and inconclusive results, repairs, and actual effort. Repository checks alone do not establish better products. Merge only after the accepted delivery criteria are met; deployment and package publication retain separate authority.

## Consequences

U9 delivers the required sections through existing output specifications. U13 verifies incorporated-resource notices and explicit visibility. U18/U19 require the frozen product comparison and actual independent repairs. The owning ARCH-13 clarification states: “Product outcomes and independent review establish suitability. Aesthetic pattern counts cannot replace that evidence.”

The existing rubric's founder-reserved classification of rules 10 and 11 remains pending its explicit decision. No other acceptance or authority boundary is relaxed by this record.
