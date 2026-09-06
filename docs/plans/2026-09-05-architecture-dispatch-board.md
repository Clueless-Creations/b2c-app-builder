# Architecture dispatch board

Authority: [ADR-0003](../decisions/0003-single-mandate-business-system.md).
Scope: roadmap U1–U26 in the [consumer-business plan](2026-09-04-1747-refactor-consumer-business-primitives-plan.md).

The founder authorized integrated completion with parallel agents. Dependencies
are contract and evidence requirements. A separate merge between every unit is
not required. The [implementation inventory](../architecture-migration-inventory.md)
names current source owners and proof limits; GitHub records issue disposition.

## Ownership

The primary agent owns shared-file integration, Git, external systems, and final
verification. Assign each worker a bounded owner or a read-only review. Coordinate
changes to public schemas, the package substrate, reducer types, and session
execution before editing them. Preserve concurrent work. Reuse a released agent
for an independent review outside that agent's implementation scope.

Implement independent local contracts in parallel. Integrate prerequisite
contracts before testing dependent behavior. Run focused proofs during each wave,
then regenerate projections and run the combined audit after source stabilizes.
A check that observed files changing is diagnostic evidence, not final acceptance.

## Remaining proof boundaries

The reusable whole-business and sibling benchmarks select their own workspaces.
Examples supply inspected captures and scoped evidence. They do not supply another
business's accepted product or a passing benchmark verdict. Actual device,
provider, store, acquisition, retention, and operating evidence remain separate
from package and synthetic conformance tests.

Main protection stays unchanged at the founder's direction. Access, spend,
legal text, hosted deployment, store submission, and production release retain
their stated authority boundaries. A held external action does not block safe
source implementation or justify a completed external claim.
