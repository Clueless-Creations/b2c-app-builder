# ADR-0013: Provider integrations implement canonical operations

- **Status:** accepted
- **Date:** 2026-09-09
- **Steward:** founder-directed architecture decision
- **Affected rules and contracts:** ARCH-02, ARCH-03, ARCH-04, ARCH-06, ARCH-09, ARCH-10, ARCH-11
- **Affected work:** provider adoption and maintenance; #109–#117; RevenueCat/EAS proving cases #101–#106; #79, #80, #84, #107, #108

This record does not grant provider access, credentials, spend, publication, deployment, or release authority. Founder direction authorizes this target. Closing #109 still needs an independent reviewer of the exact source revision.

## Context

The builder intentionally separates capabilities, operations, implementations, recipes, and bindings. Recent RevenueCat CLI and Expo/EAS work exposed a missing implementation discipline at the provider boundary. Adapter fixtures could agree with adapter code while disagreeing with the pinned upstream command or response contract. Provider-specific encoding, response interpretation, desired-state repair, and retry behavior could also become coupled inside one provider library.

That coupling makes provider upgrades expensive. A changed CLI flag or response envelope can force edits above the adapter boundary, and a newly exposed provider feature can tempt an agent to add vendor semantics directly to workflows or the kernel.

The desired property is the opposite: providers may change frequently while consumer-business semantics remain stable.

## Decision

### Canonical operation boundary

Business workflows, recipes, the kernel, and evidence semantics depend on canonical consumer-business operations. Providers implement those operations. Provider-native commands, endpoints, SDK types, response envelopes, pagination tokens, remote identifiers, and transport lifecycle states terminate at the provider adapter boundary.

A provider upgrade should normally change only:

1. its upstream observation/support metadata;
2. independent conformance fixtures;
3. its adapter implementation; and
4. its support declaration.

A workflow, business-state, kernel, or canonical-operation change caused only by provider syntax or transport churn is an architecture smell. A canonical contract changes only when the builder deliberately adopts a genuinely new business semantic. A shared kernel security or recovery defect may be repaired without inventing a new business semantic.

### Adapter responsibilities

A provider implementation may use different files or internal types, but it keeps these logical responsibilities separate:

- **definition/support:** which canonical operations, platforms, versions, modes, and feature limits are supported;
- **encoder:** canonical request to provider-native request;
- **transport:** provider-native request to raw provider-native response, with host-controlled process/network boundaries;
- **decoder:** raw provider-native response to a typed canonical observation without deciding business acceptance;
- **reconciler:** accepted desired state plus canonical observations to the smallest required canonical operations.

Encoding does not choose desired state. Transport does not interpret business completeness. Decoding does not invent missing values or decide that a business requirement is satisfied. Reconciliation does not know CLI flags or HTTP response envelopes.

These are logical seams, not a requirement for five classes, five files, inheritance, or a new generic provider framework. A small provider can implement them compactly.

### Independent conformance evidence

A provider adapter cannot prove its own native contract with fixtures generated from its encoder, decoder, local types, or fake transport. Every implemented native operation needs release-qualified conformance evidence derived independently from one or more of:

1. an official machine-readable schema;
2. pinned upstream source or upstream tests;
3. sanitized captured output from the exact reviewed executable/service version; or
4. official documented examples when stronger evidence is unavailable.

Fixtures record provider identity, reviewed version/revision, source selector, and what the fixture establishes. Fake transports remain useful for deterministic execution tests, but they consume independent native fixtures rather than defining the expected provider contract.

Fixture conformance, live provider execution, native app behavior, store behavior, and production behavior remain different evidence classes.

### Provider capability growth

When an upstream adds functionality, map the native capability to an existing canonical operation when the business semantics match. Do not add a new canonical operation merely because a provider added a command.

If the capability is useful but genuinely provider-specific, expose it as an explicit provider extension with declared requirements and support limits. It may graduate into a canonical capability after repeated product evidence shows a reusable business semantic. Do not create a supposedly generic contract that is only a vendor API with the vendor name removed.

### Effects, authority, and recovery

Canonical operations declare business effects, proof obligations, and authority categories. A provider implementation adds transport-specific effects and limitations. Non-interactive flags, API availability, MCP connectivity, or provider defaults never grant authority.

The execution kernel remains the single owner of logical request identity, effect progress, authority, interruption recovery, and reconciliation. Provider adapters return observations and provider remote identities needed for recovery. They do not create a second scheduler, acceptance store, or generic operation journal.

A mutating provider operation must distinguish at least: failure before dispatch, dispatched/unknown, remotely accepted or applied, verification pending, verified, and irreconcilably uncertain where applicable. A failed readback after a confirmed mutation resumes verification; it does not erase the effect or authorize blind replay.

### Upgrade protocol

New-provider adoption and provider upgrades use one lifecycle:

**discover → qualify → map → conform → implement → fixture verify → integrate → authorized live verify → supported**.

Qualify does not wrap by default. Compare direct reviewed SDK or API use, a thin controlled adapter, adapted guidance, and deferral. An official library that already supplies adequate types and transport does not need a second complete client.

An upgrade starts with a Provider Capability Delta before adapter edits. The delta records native operations added/removed/changed; input/output/schema changes; effects; authentication/permissions; pagination; idempotency/recovery semantics; cost or quota behavior; experimental/deprecation status; and the mapped canonical-operation impact.

If `canonical_contract_change` is true, the maintainer must explain the new business semantic and route the change through architecture review. Provider churn alone is not sufficient justification. A `workflow_or_kernel_change` for a shared security or recovery defect does not require a new business semantic.

## Dependency direction

Core workflows, capability contracts, business policy, and the kernel may depend on canonical operation contracts. They must not import provider-native request/response types or branch on provider CLI/API syntax. Provider implementations depend inward on canonical contracts and outward on their provider-native transport.

The composition root and a generated app's selected-provider SDK integration may depend on that selected provider. Legitimate composition-root wiring is not a neutrality violation. Do not globally ban selected-provider SDK imports across generated native app files.

Mechanical dependency checks should enforce this boundary where practical. The check is a guardrail, not a reason to create a new package hierarchy solely for aesthetics. Do not use it to ban composition-root or selected generated-app SDK imports.

## Compatibility and migration

Existing provider implementations migrate incrementally behind their current canonical operation bindings. Do not stop urgent correctness repairs while this boundary lands. RevenueCat and EAS follow-up issues are proving cases, not a mandate for a broad rewrite.

Where current code combines responsibilities, split only enough to make the native contract independently testable and the canonical boundary explicit. Preserve public operation IDs, workspace pins, accepted evidence, authority semantics, and historical receipts unless a separately reviewed migration requires change.

## Consequences

Provider onboarding becomes more repeatable and provider upgrades become smaller. The builder gains a standard way to absorb new upstream capabilities without turning provider releases into kernel refactors.

The tradeoff is that maintainers must do contract mapping and independent conformance work before calling an adapter implemented. That is intentional. It moves complexity to a bounded provider edge instead of distributing it through the business system.
