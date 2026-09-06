# 0003: Single-mandate consumer-business system

Status: accepted
Date: 2026-09-05
Authority: founder direction in the current architecture completion task
Rules: ARCH-01 through ARCH-15
Units: U2 through U26

## Decision

One mandate starts the complete consumer-business workflow. The default recipe
includes research, product, design, app, web funnel, measurement, monetization,
distribution preparation, support, independent review, and repair. The system
returns concrete outputs, their evidence, and any action waiting for authority.
It continues independent work when one external dependency is blocked.

There are no users or supported installed businesses to migrate. Remove obsolete
state formats, import tools, duplicate interfaces, and their tests. Keep one
current contract for each responsibility. Git preserves the development history.
Future revisions of an active composition still require revision checks and
recoverable writes; removing old formats does not permit corrupting current work.

The architecture steward may replace internals and revise architecture under this
mandate. Work-unit dependencies describe technical requirements, not a requirement
for a separate pull request or founder decision between every unit. Integrate
dependent changes after their prerequisite contract passes its focused proof.

Tuck belongs in examples. Its gallery contains real captures with provenance.
It demonstrates product and visual work, while verification records state which
business outcomes remain unproven. It supplies no defaults for another business's
name, audience, prices, credentials, or provider account.

## Evidence and alternatives

At e547675 the public composer returns COMPOSITION_APPLY_UNAVAILABLE for every
apply request. The package loader drops authored provider, review, and recurrence
fields. Three runtime imports of validator implementations require an audit
exception. Preserving those boundaries would preserve the gaps in the product.

Retaining format adapters and a staged consumer overlap would serve an installed
user base. The founder confirms there is none. A current-format system with
explicit unsupported-version errors is smaller and testable.

## Acceptance

Use the same contracts for bundled and external packages. Verify composition,
resource access, execution, interruption, independent review, repair, and evidence
through the CLI and MCP. A successful local fixture establishes only its tested
behavior. Provider effects, store submission, legal changes, access changes,
spend, deployment, and production release retain their authority requirements.

Do not report an entire business as complete while a required output is missing,
an independent review fails, or a required external result remains unverified.

## First-party work and public projection

Bundled and imported definitions use the same validated package format. The
shipped public projection reads the verified bundled snapshot. Authoring may use
TypeScript and YAML to produce that snapshot; runtime composition must not load
a second authored declaration table or silently rebuild a missing snapshot.

Provider identity remains distinct from an implementation of one operation.
Resolve the declared provider, exact version, operation, and target to one
implementation. Refuse missing or ambiguous mappings. Experimental recipes may
describe unavailable compositions, but cannot activate an invented workflow.

The default business recipe explicitly assigns each consumer workflow to a
business responsibility. Maintainer-only work stays outside that recipe.
Preserve the real selected implementation's instructions, knowledge, provider
prerequisites, and authority. Vendor-bearing guidance belongs to its implementation;
do not label it neutral. An override without a complete declared context
replacement refuses rather than inheriting hidden vendor assumptions.

Host-agent work uses a worker-artifact route in the existing operation registry.
It delegates to the existing worker executor and independent verifier, retaining
normal workflow artifacts, attempts, resource claims, and evidence. Its target is
`host/agent-cli`; supported app platforms remain part of the accepted product and
the actual native provider contracts. An agent's ability to write source does not
prove a native SDK, device, purchase, or release.

## Relocatable knowledge assets

Knowledge retains its authored relative paths. Its runnable starter sources,
component contracts, and linked example templates belong to the same immutable
resource closure. Verify those links after copying the package away from its
source checkout. Exclude generated build output and caches. Editorial showcase
navigation uses explicit repository links; a captured business is not a runtime
dependency of another business.

## Interrupted request completion

The public lifecycle adds `business.recover` behind the existing session owner.
A durable pending receipt previously blocked all subsequent public requests with
no supported way to close it after reconciliation. Recovery closes only that
exact receipt under revision and common lock checks. Active or uncertain effects
remain blocked. It does not run workers, accept outputs, or change authority.
The original request preserves its digest and returns the recorded terminal
result; subsequent work requires a fresh request identity and current revision.
