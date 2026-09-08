---
title: "Consumer-business primitives architecture and roadmap - Plan"
type: refactor
date: 2026-09-04
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
depth: deep
deepened: 2026-09-04
---

# Consumer-business primitives architecture and roadmap - Plan

## Goal Capsule

Make B2C App Builder an extensible foundation for complete consumer-app
businesses. Builders use an excellent default recipe, substitute implementations
of business capabilities, and author their own creation and operating loops.
The same architecture must eventually support market experiments across
independent, materially different app businesses.

The [north-star architecture](../north-star-architecture.md) is the normative
design. Its stable ARCH rules govern every unit. This plan owns migration order,
requirements, work boundaries, and proof. The [conformance protocol](../architecture-conformance.md)
owns assignment, audit, and architecture-change procedure. Read those documents
by the IDs cited in the assigned unit; do not load all source and knowledge.

Preserve one logical owner for composition, execution, authority, and proof;
replace current implementations where the target requires it. Preserve supported
consumer behavior through adapters. Prove an external provider and recipe through the same public path
as first-party content, then complete one benchmark business and a distinct
sibling before scaling to a market portfolio. Documentation readiness means
this plan is executable; none of these units is claimed complete by this file.

## Product Contract

### Summary

The user wants to move human work from developing one consumer app to designing
and comparing complete businesses. They also want an open-source architecture
in which a contributor can add a provider such as Superwall without rewriting
the platform. They delegated architecture ownership and requested durable rules
and smaller work packages that other agents can audit and implement.

### Problem Frame

The repository already has valuable workflow, evidence, repair, authority,
catalog, knowledge, and design machinery. Its extension boundary is incomplete:
pack fields lose semantics, provider metadata does not resolve executable
operations, resource paths assume one installed skill root, and generic revenue
checks encode vendor policy. A successful fixture graph is also weaker than a
successful consumer business.

The migration must put greenfield public contracts in front of internal adapters and remove hidden first-party assumptions. It must retain convenient
defaults, product freedom, current workspaces, and independent proof.

### Requirements

#### Extension and composition

- **R1.** Preserve one logical owner under ARCH-01–ARCH-03; permit internal replacement and introduce no competing
  catalog, knowledge service, planner, reducer, or loop scheduler.
- **R2.** Publish strict versioned capability, operation, implementation,
  recipe, package, binding, and authored workspace-composition contracts.
  First-party and external declarations
  preserve equivalent compiled semantics (ARCH-04–ARCH-06). Executable extension APIs begin
  experimental; the supported consumer discovery/preview facade stabilizes first. Extension stability promotion requires external and real-business proof
  across monetization and at least one structurally different capability family.
- **R3.** Resolve selected operation/platform/version tuples deterministically.
  Missing, conflicting, and unsupported required selections are actionable
  failures; optional exclusions and provider-specific features remain visible.
- **R4.** Load a reviewed package from outside the checkout, pin all consumed
  bytes, and use its knowledge and executable resources without root-package
  modifications. Discovery executes no package code.
- **R5.** Require executable pins to satisfy the current contract; unsupported shapes fail closed. Preview and
  recoverable apply follow ARCH-07 and ARCH-08, including concurrent edits,
  interrupted writes, running attempts, pending recurrence, and uncertain effects.
- **R6.** Compile configurable creation, repair, observation, and improvement
  recipes into executable work with stable identities. Current graph nodes and occurrences are migration mechanisms.

#### Agent execution and business semantics

- **R7.** Selected operations use shared CLI/MCP services, bounded selected
  knowledge, declared resource access, and host-owned authority. Public names follow business semantics; each supported operation has one current implementation owner. Read-only public preview does not pull provider data (ARCH-09, ARCH-10).
- **R8.** Distinguish support, implementation, configuration, route, authority,
  and proof. Package conformance cannot mark a business capability verified;
  manual work has an owner and re-entry path (ARCH-11).
- **R9.** Define identity, exposure, entitlement, event, metric, and cost
  semantics sufficient for a correct acquisition-to-retention join and
  comparable experiments (ARCH-12).
- **R10.** Prove the existing default monetization composition and an iOS/SwiftUI
  Superwall paywall/assignment plus RevenueCat purchase/entitlement composition.
  Conformance, native implementation, sandbox end-to-end proof, and live
  readiness are separate outcomes.

#### Quality, scale, and maintainability

- **R11.** Demonstrate one complete consumer business against an explicit
  category quality benchmark and then a materially different sibling. Reuse
  infrastructure without prescribing the product loop or visual style (ARCH-13).
  A fresh-context agent must demonstrate the documented builder path; record
  hidden maintainer intervention and complete a real improvement cycle (ARCH-14).
- **R12.** Support a market experiment referencing independent workspace IDs,
  comparable observations, and bounded shared-resource coordination. Demonstrate
  ten-workspace orchestration separately from ten authorized public launches
  (ARCH-14).
- **R13.** Make architecture discoverable to agents and enforce applicable
  rules through independent review, narrow automated checks, extension
  conformance, and evidence-backed exceptions (ARCH-15).

- **R14.** Establish a greenfield public facade before internal refactoring.
  Preserve supported consumer contracts while implementation changes. Align all
  active entrypoints and documentation, publish generated schemas and examples,
  and prove CLI/MCP parity. Distinguish stable supported operations from planned
  execution. A compelling README must demonstrate actual behavior, explain the
  complete-business objective, and provide a short contributor path.

- **R15.** Treat mobile app operation as a provider-neutral capability for
  exploration, verification, design review, and marketing capture. Prefer available
  host-native tools when sufficient; honor explicit bindings and select other
  providers by required operation/target/evidence coverage. Keep raw captures,
  functional evidence, independent judgment, and finished creative distinct.

### Actors and flows

- **Builder:** choose a default recipe; inspect limitations; configure a binding;
  preview effects; apply local composition; perform separately authorized work.
- **Contributor:** declare an external package; run deterministic conformance;
  document coverage; implement and prove selected platform behavior.
- **Worker:** load one resolved operation and its knowledge; act within scope;
  return evidence or a structured blocker; resume without duplicating effects.
- **Architect and auditor:** assign a unit; compare code and proof against ARCH
  rules; integrate compatible changes; decide contract changes explicitly.
- **Founder:** define hypotheses and business constraints; interpret cohort and
  cost evidence; decide reserved actions and allocation.

### Acceptance examples

- **AE1.** A contributor imports a package from an external temporary directory.
  It supplies a new namespaced capability/operation, provider implementation,
  and recipe; a local workspace executes
  with fake transport, produces real local receipts, and resumes without any
  kernel edit. Editing or deleting the original source cannot change active bytes.
- **AE2.** Two agents preview and edit a composition concurrently. Stale apply
  refuses; an interrupted accepted apply exposes recoverable migration state;
  unchanged history remains intact and uncertain external effects are not retried.
- **AE3.** An anonymous user sees a Superwall treatment, signs in, purchases
  through RevenueCat, and later restores. Exposure and normalized revenue join
  through declared identity; only authoritative entitlement readback grants access.
- **AE4.** One real business meets the benchmark across app, web funnel,
  monetization, analytics, support, and operations. A sibling changes product
  approach and design while reusing capability contracts. Missing live authority
  leaves live readiness explicitly incomplete. A fresh-context agent builds the
  sibling through public entrypoints; undocumented orchestration help is recorded
  and repaired. Actual observations drive one verified change and subsequent
  measurement, even if the result is negative or inconclusive.
- **AE5.** Ten workspaces run under bounded coordination. A shared provider
  resource serializes, a crash recovers without duplicate effects, and a report
  refuses to rank incompatible or immature cohorts.

## Planning Contract

### Key Technical Decisions

- **KTD1 — Greenfield public architecture, staged internal migration.** `session-settled: user-approved`.
  Governs R1, R5, R6, R14. The user's subsequent direction explicitly supersedes
  the earlier decision to treat the current engine as a target constraint. Define
  public business contracts and logical truth owners first. Preserve working
  guarantees through adapters, but permit replacement of any internal mechanism.
  Keep one owner per responsibility; avoid parallel orchestration or truth stores.
- **KTD2 — Compose capability operations.** `session-settled: user-approved`.
  Governs R2, R3, R10. Separate capability requirements, provider implementations,
  and recipes. Whole-vendor substitution would obscure legitimate cooperation
  such as Superwall presentation with RevenueCat entitlement authority. The user
  approved extensible providers and loops; the operation contract is the
  architect's concrete realization of that direction.
- **KTD3 — Make local packages the first external boundary.** Governs R2, R4.
  Use strict schemas, explicit dependencies, package-relative resources, immutable
  snapshots, and content hashes. Keep host contract version, package version,
  and SDK compatibility distinct. A registry and package installer add trust and
  distribution concerns without proving the extension boundary first.
- **KTD4 — Separate proposed and active composition.** Governs R5.
  Introduce authored `b2c.yaml` for composition only; extend the existing generated
  installation pin for active selections. Apply uses expected revisions and a
  recoverable transition under the existing lease. Reject affected active
  attempts. This avoids silent behavior changes and a competing lock/state store.
- **KTD5 — Public contract first, shared effect boundary.** `session-settled: user-approved`.
  Governs R7, R8, R14. A versioned facade precedes internal refactoring. CLI,
  MCP, skill, README, agent guides, examples, and schemas describe the same
  supported behavior. New public names are allowed where business semantics
  require them. Remove duplicate surfaces and obsolete input formats; do not
  relabel internal payloads as the public contract. Default MCP remains read-only and
  authority is enforced at effects. Unsupported public execution fails explicitly.
- **KTD6 — Extract monetization first, with semantic proof.** Governs R3, R9,
  R10. Inventory the existing intended defaults before moving them into a recipe.
  Use the first reference composition in ARCH-04 and ARCH-12 to prove alternatives.
  iOS/SwiftUI is the first native proof target; other tuples stay unsupported.
  Provider fixture conformance is an earlier milestone than sandbox or live proof.
- **KTD7 — Separate resource access from acceptance artifacts.** Governs R7,
  R8, R11. Extend current node contracts and fingerprinting with declared reads,
  creates, and updates. Preserve immutable-input enforcement for undeclared changes.
  Making every input writable would erase an important integrity guarantee.
- **KTD8 — Prove quality before portfolio scale.** Governs R9, R11, R12.
  Use a whole-business benchmark, a distinctive sibling, then ten-workspace
  coordination. Keep a benchmark recipe additive to current design work. A
  generated app count or fixture pass is inadequate evidence of market capability.
- **KTD9 — Govern through stable rules and bounded units.** Governs R13.
  Canonical architecture plus unit-specific audit beats duplicating doctrine in
  every prompt. Introduce mechanical checks only for enforceable boundaries;
  keep product judgment and external proof explicit.

### System design and dependency direction

Use the [architecture diagram](../north-star-architecture.md#architectural-shape).
The target resolution flow is:

```text
proposed workspace composition + declared package dependency closure
  -> validate public contracts without executing extensions
  -> resolve operation bindings and package-relative resources
  -> preview against current pin and expected workspace revision
  -> explicitly apply recoverable local composition transition
  -> compile pinned workflows, resources, knowledge, and proof obligations
  -> current runtime executes scoped work and records evidence
  -> current planner and occurrence machinery select subsequent work
```

This is a data-flow specification, not implementation code. Package layout and
internal helper names may change within assigned owners; public semantics and
truth ownership follow ARCH rules. No unit may turn runtime code into a consumer
of `checks/validation/` implementation modules. Shared contract logic belongs below
both runtime and validators.

### Research and current implementation

Baseline: working tree on `feat/complete-consumer-business`, HEAD observed as
`659bd2d` on 2026-09-04. Another agent owns active design/runtime changes. Re-read
the current checkout before implementation; uncommitted work is not release proof.

| Evidence                                                                                                          | Planning consequence                                         |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `catalog/packs/load.ts` normalizes away workflow fields; `packs/types.ts` lacks some public entities              | U2–U3 precede public extension promises                      |
| `catalog/packs/compose.ts` fingerprints declared IDs/versions, not complete external bytes                        | U4 precedes resource execution and migration                 |
| `kernel/session/executor.ts` and `deterministic-gates.ts` resolve from central roots                              | U9 must prove external resources, not just package discovery |
| `kernel/session/catalog-contract.ts` and `kernel/engine/runstate.ts` already preserve pins and reconcile history     | U1 and U10 extend these mechanisms                           |
| Engineering workflows and source fingerprints incompletely describe mutable/custom roots                          | U7 precedes reliable business implementation                 |
| `adapters/providers/contract.ts`, provisioning requirements, and revenue checks contain global vendor assumptions | U12 extracts a complete slice before broad cleanup           |
| `kernel/work-orders/` already models recurring work                                                               | U11 reuses occurrences                                       |
| `check-engine-e2e.ts` uses fixture execution                                                                      | U18 requires separate whole-business evidence                |

Code paths above are relative to the repository root, per [ADR-0002](../decisions/0002-repository-layout.md). Relevant prior plans:
[operating cockpit](2026-09-02-0035-feat-operating-cockpit-plan.md) and
[current design/craft work](2026-09-04-1141-feat-complete-consumer-business-plan.md).
Preserve their shared-service, founder-decision, and design-evidence contracts.
This roadmap does not declare their work complete or overwrite their ownership.

External decisions are grounded in official sources checked during planning:
[Superwall's RevenueCat integration](https://superwall.com/docs/ios/guides/using-revenuecat),
[RevenueCat's Superwall integration](https://www.revenuecat.com/docs/integrations/third-party-integrations/superwall),
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and
[JSON Schema 2020-12](https://json-schema.org/draft/2020-12).
Pin and recheck actual SDK/API versions during U17. No implementation API or
vendor compatibility range is inferred solely from this planning snapshot.

### Roadmap and release gates

| Wave                                          | Units              | Exit evidence                                                                                                                  |
| --------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 0 — Public contract first                     | U23–U24            | Versioned discovery and preview, generated schemas, CLI/MCP parity, aligned public docs and example                            |
| A — Establish contracts and preserve behavior | U1–U3, U7          | Baseline pins protected; complete manifest semantics; explicit resource ownership                                              |
| B — Resolve and execute external composition  | U4–U6, U8–U11, U25 | External resources reach the existing runtime; recoverable configuration migration and recurring recipes                       |
| C — Prove the public extension boundary       | U12–U14, U26       | Default extraction plus an external package and alternative recipe with no kernel edits                                        |
| D — Prove business semantics and quality      | U15–U19, U22       | Clear product boundaries, metric/identity semantics, native alternate composition, one excellent business and distinct sibling |
| E — Scale the experiment                      | U20–U21            | Comparable market reports, shared-resource coordination, ten-workspace rehearsal and separately authorized live evidence       |

These are dependency gates, not calendar estimates. U15 and U16 may advance
while the composition work proceeds if they avoid shared files. U8/U10/U16
schema integration and U8/U9/U10 runtime integration are serialized by the
integrator; isolated research or new measurement modules can proceed sooner. Native, provider,
and live business proof depend on actual SDKs, credentials, evidence, and authority.
Do not block safe local implementation on those external milestones, and do not
mark the blocked milestone complete. For cross-unit dependencies, name the exact
integrated contract or proof gate: U17-local means its package/native implementation
and deterministic acceptance; U17-provider means actual sandbox round-trip evidence.
U21 local coordination depends on U17-local; its live milestone depends on
U17-provider. Complete earlier waves independently of the final market milestone.

### Assumptions and reserved decisions

The architect selects local package imports, the `b2c.yaml` composition owner,
strict public schemas, and iOS/SwiftUI as the first alternate native proof. These
are engineering decisions in this plan, not claims that the user specified exact
filenames or a permanent platform restriction.

The reusable benchmark does not designate a business. Select a workspace with
accepted product scope before grading. Example captures belong in `examples/`
and establish only the surfaces they depict. If a product excludes a required
capability, select a separate benchmark that exercises it; do not distort an
app to satisfy a checklist. The sibling must vary a meaningful product approach,
not only a color or name.

No planning-owned architectural question blocks U1. Credentials, actual pricing,
live deployment, store submission, public launch, spend, and experiment allocation
remain founder-owned decisions at their normal boundaries. Public extension
release also needs a separate license/dependency/secret review; this plan does not
select legal terms or claim open-source release readiness.

### Risks and migration treatment

| Risk                                                            | Treatment and owning units                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Concurrent work changes source contracts                        | U1 records exact baseline; U7–U10 serialize shared runtime integration                |
| A field appears supported but is silently ignored               | U2–U3 exhaustive normal-form parity and negative schema cases                         |
| An extension keeps hidden first-party privileges                | U4, U9, U14 execute from an external directory with zero root-script edits            |
| A local path or version label changes active behavior           | U4 snapshots bytes; U10 rejects stale preview and pins active composition             |
| Partial apply mixes state and executable pin                    | U10 recoverable transaction and interruption tests at every persistence boundary      |
| Provider substitution changes identity or entitlement semantics | U16–U17 explicit ownership, join rules, failure and restore scenarios                 |
| Evidence stays accepted after a material change                 | U7–U10 bind resources/contracts; retain history and reopen affected claims            |
| Broad refactor hides weak app quality                           | U12–U14 prove one slice; U18–U19 separately prove business and design outcomes        |
| Portfolio comparison presents false certainty                   | U16, U20 normalize semantics and refuse incompatible or immature cohorts              |
| A public package executes untrusted code                        | U4 discovery is data-only; U9 uses approved host execution; no invented sandbox claim |

## Implementation Units

Paths in each unit are repo-relative. Unless a path is marked **new**, it names an
existing file or module boundary. A proposed test file is explicitly marked
**new**. Every unit also owns its focused documentation updates. When editing
published skill content, the integrator owns the version, package metadata, and
generated projections required by AGENTS.md; workers do not race over them.

### Unit index

| Unit | Responsibility                                       | Depends on             |
| ---- | ---------------------------------------------------- | ---------------------- |
| U1   | Baseline and conformance guardrails                  | —                      |
| U2   | Public primitive schemas                             | U1, U23                |
| U3   | Lossless manifest normalization                      | U2                     |
| U4   | External package snapshots                           | U3                     |
| U5   | Complete catalog composition                         | U4                     |
| U6   | Operation binding resolution                         | U5                     |
| U7   | Source and artifact access contracts                 | U3                     |
| U8   | Resolved executable contracts                        | U6, U7                 |
| U9   | External resources and agent context                 | U8                     |
| U10  | Workspace configuration and recoverable migration    | U9                     |
| U11  | Configurable loop recipes                            | U10                    |
| U12  | Default monetization extraction                      | U11                    |
| U13  | Extension conformance harness                        | U9                     |
| U14  | External implementation and loop proof               | U12, U13               |
| U15  | Product boundaries and contributor entrypoints       | U1                     |
| U16  | Identity, metric, and experiment contracts           | U2                     |
| U17  | Superwall and RevenueCat native composition          | U14, U16               |
| U18  | Complete consumer-business benchmark                 | U7, U14, U15, U16, U22 |
| U19  | Distinct sibling and reuse proof                     | U18                    |
| U20  | Market experiment model and report                   | U16, U19               |
| U21  | Shared-resource coordination and ten-workspace proof | U17-local, U20         |
| U22  | Authorized evidence erasure                          | U16                    |
| U23  | Public discovery and composition facade              | None                   |
| U24  | Public documentation and release contract            | U23                    |
| U25  | Business lifecycle facade                            | U23, U1, U8, U10       |
| U26  | Mobile app operation providers                       | U1, U8, U9, U13, U23   |

U23–U24 are the immediate release-facing scope requested after the first plan.
They precede the internal migration. U1–U22 retain their IDs and acceptance bars;
this sequencing does not mark them complete. U25 introduces stable lifecycle
operations only after revision, authority, and evidence semantics are proven.

### U1 — Baseline and conformance guardrails

**Goal:** Protect existing behavior and make architectural drift reviewable.

**Requirements:** R1, R5, R13; KTD1, KTD9; ARCH-02, ARCH-08, ARCH-15.

**Dependencies:** None.

**Files:** `kernel/session/catalog-contract.ts`;
`checks/verification/fixtures/compatibility.fixtures.ts`;
`checks/verification/fixtures/packs.fixtures.ts`;
`checks/verification/boundaries/`;
`checks/validation/repository/check-architecture.ts` (**new**);
root `package.json`, `docs/validators.md`;
`docs/architecture-migration-inventory.md` (**new baseline artifact**).

**Approach:** Inventory current default contracts and active ownership. Preserve
representative current pins and their protected-category authority boundaries.
The inventory names each capability family's current owner, vendor assumptions,
intended default behavior, proof, precise debt, and next bounded migration. It is
the versioned baseline U12 consumes, not a second task-status ledger.
Add narrow import/ownership assertions to existing boundary infrastructure and
link them to ARCH rules. Record precise existing debt; do not create blanket
allowlists. Expose the new check through normal audit registration.

**Patterns:** Existing compatibility fixtures and repository boundary checks.

**Test scenarios:** (1) Read/plan an old pin without changing executable identity
or authority. (2) Runtime code importing a `checks/validation/` implementation module fails the
architecture check; validator code may consume shared runtime contracts.
(3) A scoped existing exception does not permit a new dependency violation.

**Verification:** Relevant compatibility and boundary fixtures pass; intentional
violations fail with the governing rule and path. The inventory explicitly covers
every default slice U12 extracts and every family in the architecture coverage map.
No default provider extraction.

### U2 — Public primitive schemas

Preserve the supported U23 `b2c/v1` declaration and preview fixtures. Evolve
package and execution schemas separately; do not overwrite stable consumer
semantics with internal pack types.

**Goal:** Define the smallest complete public extension API.

**Requirements:** R2, R3, R6, R8; KTD2, KTD3; ARCH-03–ARCH-06, ARCH-11.

**Dependencies:** U1, U23.

**Files:** `catalog/types.ts`;
`catalog/packs/types.ts`;
`catalog/capabilities/types.ts`;
`adapters/providers/contract.ts`;
`catalog/schemas/extension.schema.json` (**new**);
`catalog/schemas/workspace-composition.schema.json` (**new**);
`checks/verification/fixtures/extension-contract.fixtures.ts` (**new**).

**Approach:** Specify exported entities, version compatibility, operation effects,
input/output/evidence schemas, supported tuples, resource descriptors, recipe
policy, binding references, and the versioned `b2c.yaml` configuration contract.
Document host compatibility and reject unsupported schema versions. Reuse a
single normalized representation. Separate
provider freshness metadata from executable support. Keep schemas declarative;
required metadata cannot grant authority or waive host obligations.

**Patterns:** Existing catalog validation, provider contract, and JSON schemas.

**Test scenarios:** (1) Equivalent built-in/community declarations validate.
(2) Unknown fields, incompatible contract versions, undeclared imports, and
tool-availability-as-capability claims fail. (3) Supported but unconfigured and
unproven remain distinct valid states.

**Verification:** Schema and fixture coverage includes every published field and
invalid boundary case; public terminology matches the architecture glossary.

### U3 — Lossless manifest normalization

**Goal:** Make authored manifests as expressive as first-party declarations.

**Requirements:** R2; KTD3; ARCH-05.

**Dependencies:** U2.

**Files:** `catalog/packs/load.ts`;
`catalog/validate.ts`;
`checks/verification/fixtures/packs.fixtures.ts`;
`checks/verification/fixtures/catalog.fixtures.ts`.

**Approach:** Normalize YAML through U2. Preserve provider IDs, founder actions,
applicability, recurrence, attempt and cost limits, proof TTL, review relationships,
repair and refresh dependencies, roles, gates, and real knowledge provenance.
Remove production fixture exemptions and reject unsupported contracts.

**Patterns:** Current YAML loader and typed catalog normalization.

**Test scenarios:** (1) A workflow using every supported field produces the same
normalized and compiled semantics in YAML and TypeScript. (2) Misspelled fields,
missing provenance, and invalid review edges fail instead of disappearing.

**Verification:** Full-field parity fixture and existing catalog checks pass;
old pins still satisfy U1 without eager normalization.

### U4 — External package snapshots

**Goal:** Resolve packages outside the repository reproducibly.

**Requirements:** R4, R5; KTD3; ARCH-05, ARCH-06.

**Dependencies:** U3.

**Files:** `catalog/packs/load.ts`;
`catalog/packs/isolation.ts`;
`catalog/packs/package-source.ts` (**new**);
`checks/verification/fixtures/package-source.fixtures.ts` (**new**).

**Approach:** Treat explicit local paths as import sources; resolve only the
declared dependency closure. Copy consumed resources into immutable snapshots
under the existing local installation/cache boundary and hash their bytes.
Resource descriptors preserve owning-package identity. Discovery never imports
or runs package code. Exclude secrets and unrelated source files explicitly.

**Patterns:** Pack isolation and runtime pin conventions.

**Test scenarios:** (1) Import from outside checkout/workspace, then remove source;
the pinned snapshot remains usable. (2) Changed bytes invalidate a preview.
(3) Escaping paths, symlink substitution, duplicate identity, missing dependency,
and lifecycle-hook execution attempts fail deterministically. (4) A source
directory containing unrelated build output and credential files produces only
declared public resources; declared secret-bearing resources are rejected.

**Verification:** External-directory fixtures demonstrate content integrity and
zero discovery-time effects; version labels cannot mask byte changes.

### U5 — Complete catalog composition

**Goal:** Retain every public entity in one resolved catalog.

**Requirements:** R1, R2, R4; KTD1–KTD3; ARCH-02, ARCH-05, ARCH-06.

**Dependencies:** U4.

**Files:** `catalog/packs/compose.ts`;
`catalog/index.ts`;
`catalog/packs/isolation.ts`;
`checks/verification/fixtures/packs.fixtures.ts`.

**Approach:** Compose capability definitions, implementations, recipes, roles,
gates, workflows, and references through one path. Carry package provenance and
resolved dependency digests. Define explicit conflict handling and exported-ID
compatibility. Preserve host-owned acceptance obligations during replacement.

**Patterns:** Existing compose/validate/fingerprint path.

**Test scenarios:** (1) Composition order does not change resolved meaning or
digest. (2) Conflicting exports and missing declared imports fail. (3) A provider
replacement cannot remove an invariant gate or authority category.

**Verification:** External and first-party packages appear in the same catalog;
no shadow registry or discarded capability definitions remain in this path.

### U6 — Operation binding resolution

**Goal:** Resolve requirements to explicit supported implementations.

**Requirements:** R3, R8; KTD2, KTD6; ARCH-04, ARCH-07, ARCH-11.

**Dependencies:** U5.

**Files:** `catalog/capabilities/resolve-bindings.ts` (**new**);
`adapters/provisioning/resolve.ts`;
`adapters/provisioning/capability-readiness.ts`;
`checks/verification/fixtures/provisioning.fixtures.ts`;
`checks/verification/fixtures/bindings.fixtures.ts` (**new**).

**Approach:** Bind operation, implementation, platform/version, operating mode,
connection reference, and authority owner. Derive provisioning from selected
operations. Keep unselected providers out of required setup. Return structured
support/configuration/route/authority/proof gaps and explicit optional exclusions.
Connections reference the selected workspace's existing business-access entries;
references contain no secret values. Shared provider accounts need explicit
workspace-local connection authorization and a shared-resource identity.

**Patterns:** Existing provisioning resolver and capability-gap reporting.

**Test scenarios:** (1) Paywall and purchase bind to cooperating providers.
(2) Competing entitlement/assignment owners, unsupported platforms, missing
bindings, and ambiguous routes fail. (3) Empty evidence is unknown; manual
prerequisites include owner, evidence shape, and resume point. (4) An unauthorized
cross-workspace connection or inline secret fails validation.

**Verification:** Deterministic resolution and readiness fixtures pass without
credentials or provider calls; no silent provider fallback.

### U7 — Source and artifact access contracts

**Goal:** Make implementation mutations explicit without weakening input integrity.

**Requirements:** R7, R8, R11; KTD7; ARCH-10, ARCH-11.

**Dependencies:** U3; serialize with concurrent design/runtime work.

**Files:** `kernel/engine/compile.ts`;
`kernel/engine/dispatch.ts`;
`kernel/engine/source-fingerprint.ts`;
`kernel/session/input-inventory.ts`;
`catalog/workflows/build-release.ts`;
`checks/verification/fixtures/executor-inputs.fixtures.ts`.

**Approach:** Separate acceptance outputs from declared read/create/update paths.
Describe engineering source roots and intentional artifact refinement. Feed
resource claims to scheduling, worker scope, and fingerprinting. Preserve current
producer ambiguity errors and immutable reads outside an explicit update. Enforce
ARCH-10 containment on declared app writes; package snapshots and host-controlled
state remain protected even when an extension declares them writable.

**Patterns:** Existing node contracts, input inventory, source proof and dispatch.

**Test scenarios:** (1) Declared source edit succeeds; undeclared input mutation
fails. (2) Intentional TECH_SPEC refinement has a serialized versioned handoff.
(3) Changes under `native/` or `landing/` reopen affected proof. (4) Conflicting
source writes cannot execute concurrently. (5) Escaping, symlinked, engine, VCS,
or reducer-state write claims fail before dispatch.

**Verification:** Input-integrity and engine fixtures pass with custom roots and
negative mutation cases; current design acceptance remains intact.

### U8 — Resolved executable contracts

**Goal:** Carry selected semantics through the existing compiler.

**Requirements:** R3, R4, R7, R8; KTD1, KTD2, KTD7; ARCH-04, ARCH-09–ARCH-11.

**Dependencies:** U6, U7.

**Files:** `catalog/bridge.ts`;
`kernel/engine/compile.ts`;
`kernel/engine/node-brief.ts`;
`kernel/schema/types.ts`;
`checks/verification/fixtures/engine.fixtures.ts`.

**Approach:** Compile bindings into actual operation effects, resource claims,
selected knowledge, gate descriptors, and evidence dependencies. Fingerprint
resolved implementation/package/configuration meaning. Extend existing schemas
and serialization compatibly rather than introducing a parallel executable graph.

**Patterns:** Catalog bridge, compilation, artifact fingerprints and node briefs.

**Test scenarios:** (1) Changing a selected provider changes only affected contract
digests and downstream acceptance. (2) Unselected instructions never enter the
brief. (3) Invalid or incomplete resolution fails before dispatch.

**Verification:** Compiler, schema, and unsupported-contract refusal fixtures pass; node
contracts contain all data needed by execution without global vendor switches.

### U9 — External resources and agent context

**Goal:** Use verified extension resources through current execution services.

**Requirements:** R4, R7, R8; KTD3, KTD5; ARCH-06, ARCH-09–ARCH-11.

**Dependencies:** U8.

**Files:** `kernel/session/executor.ts`;
`kernel/session/worker-prompt.ts`;
`kernel/session/deterministic-gates.ts`;
`kernel/knowledge-service/`;
`checks/verification/fixtures/session.fixtures.ts`;
`checks/verification/fixtures/mcp.fixtures.ts`;
`checks/verification/parity/`.

**Approach:** Resolve prompts, knowledge, and declared gate/adapter entrypoints
from U4 snapshots. Use current executor authority and bounded output handling.
Share context and status through existing CLI/MCP services; return limitations
and re-entry information. Remove dependence on root npm scripts for external
gates while retaining explicit approved execution. Enforce ARCH-09 environment
allowlists and subordinate-reference treatment for package knowledge.

**Patterns:** Worker executor, deterministic gates, bounded knowledge retrieval.

**Test scenarios:** (1) An external package supplies a gate and reference with no
root script edit. (2) Modified snapshot bytes refuse execution. (3) Required
knowledge truncation is visible. (4) Read-only MCP performs no provider effects;
CLI/MCP report equivalent selected context and blockers. (5) An unrelated ambient
secret and vault token never reach a local gate. (6) Package text requesting an
out-of-scope effect or claiming success cannot change scope or accepted proof.

**Verification:** Session, knowledge, parity, and boundary fixtures pass; receipts
identify loaded resources and no discovery action executes package code.

### U10 — Workspace configuration and recoverable migration

**Goal:** Introduce proposed composition without silently changing active work.

**Requirements:** R5, R7, R8; AE2; KTD4, KTD5; ARCH-07–ARCH-11.

**Dependencies:** U9.

**Files:** `adapters/install-entrypoints.ts`;
`kernel/session/bootstrap.ts`;
`kernel/session/catalog-contract.ts`;
`kernel/engine/runstate.ts`;
`kernel/session/composition.ts` (**new**);
`kernel/work-orders/lifecycle.ts`;
`kernel/work-orders/types.ts`;
`kernel/schema/types.ts`;
`kernel/schema/run-state.schema.json`;
`checks/verification/fixtures/composition-migration.fixtures.ts` (**new**).

**Approach:** Validate proposed `b2c.yaml` against U2's public schema; preview
against current pin and revision;
apply under the existing lease with a recoverable transition in current runtime
persistence. Wire through existing CLI/shared operating services. Include retained,
reopened, new and removed obligations plus migration reasons. Include ARCH-08
package/entrypoint/resource/authority disclosure. Retain removed-node contracts
and receipts, retire undispatched occurrences with reasons, refuse removal with
unresolved external effects, and do not revive retired work on re-add. Do not copy product
or access truth into composition. Apply U1 contract validation and explicit re-pin rules.

**Patterns:** Current install manifest, compatibility, reducer revision, runstate
reconciliation and operate preview/commit. Entry-point integration belongs to this
unit's integrator, including `entrypoints/cli/b2c.mjs` if needed.

**Test scenarios:** (1) Concurrent config/package/revision edits reject stale
apply. (2) Affected active attempts refuse migration. (3) Interruption at each
write boundary leaves old or named recoverable state. (4) Accepted/rejected proof,
pending recurrence and uncertain provider effects retain history and proper re-entry.
(5) Remove and re-add a workflow without lost receipts or revived occurrences.
(6) Changed entrypoints/resource claims refuse a stale preview; apply grants no
additional authority.

**Verification:** AE2 and interrupted-update fixtures pass; no mixed valid-looking pin,
duplicate occurrence, eager engine repin, or duplicate protected effect.

### U11 — Configurable loop recipes

**Goal:** Let contributors arrange creation and operating loops.

**Requirements:** R1, R6, R7; KTD1, KTD5; ARCH-02, ARCH-03, ARCH-09–ARCH-11.

**Dependencies:** U10.

**Files:** `catalog/packs/`;
`kernel/work-orders/instantiate.ts`;
`kernel/work-orders/lifecycle.ts`;
`kernel/session/operating-service.ts`;
`checks/verification/fixtures/work-orders.fixtures.ts`.

**Approach:** Compile recipe parameters, dependencies, observation horizon,
decision policy, review and repair into current nodes and occurrences. Create
two small recipes using shared operations with different ordering/conditions.
Maintain bounded work, mandate references, cadence, and idempotency identity.

**Patterns:** Existing work orders and operating service; no secondary scheduler.

**Test scenarios:** (1) Two recipes produce distinct valid graphs. (2) Restart
during observation creates no duplicate occurrence. (3) A failed guardrail routes
to repair/review, while missing authority leaves protected actions held.

**Verification:** Work-order and operating fixtures prove restart, recurrence,
decision conditions, and authority without reading a second state store.

### U12 — Default monetization extraction

**Goal:** Move one complete opinionated slice onto the public path.

**Requirements:** R2, R3, R10; KTD2, KTD6; ARCH-03–ARCH-05, ARCH-11.

**Dependencies:** U11.

**Files:** `catalog/workflows/growth-revenue.ts`;
`catalog/providers/revenuecat.yaml`;
`catalog/packs/consumer-app/`;
`adapters/providers/contract.ts`;
`adapters/provisioning/requirements.ts`;
`checks/validation/business/money/check-revenue.ts`;
`checks/verification/fixtures/monetization-composition.fixtures.ts` (**new**).

**Approach:** Use U1's intended-default inventory. Move RevenueCat-specific setup,
knowledge, drift/readback procedures, and API-specific validation behind its
implementation. Generic acceptance checks capability outcomes and delegates
provider checks. Keep current default obligations in the default recipe. Update
affected catalog knowledge manifests and provisioning route maps together.

**Patterns:** U2–U11 public contracts; existing revenue validation is migration input.

**Test scenarios:** (1) Default behavior retains required revenue/authority proof.
(2) A non-RevenueCat operation implementation is not rejected merely by vendor
name. (3) Missing entitlement or experiment proof fails for every implementation.

**Verification:** Default regression scenarios pass; no global vendor requirement
remains for this slice outside its default recipe or compatibility adapter.

### U13 — Extension conformance harness

**Goal:** Give contributors a meaningful deterministic acceptance suite.

**Requirements:** R2, R4, R8, R13; KTD3, KTD9; ARCH-05, ARCH-06, ARCH-11.

**Dependencies:** U9.

**Files:** `checks/verification/scenarios/extension-conformance.ts` (**new**);
`checks/verification/fixtures/scenarios.fixtures.ts`;
`checks/validation/repository/check-extension.ts` (**new**);
`docs/validators.md`; package/audit registration through the integrator.

**Approach:** Reuse public schemas, resolver, compiler and runtime with fake
provider transport and real local artifact/receipt writes. Check semantic failure
states, idempotency, declared support, provenance and authority. Report package
conformance separately from platform implementation and live readiness.

**Patterns:** Existing verification fixtures and scenarios, not mock-only assertions
that merely repeat manifest fields.

**Test scenarios:** (1) Good external package passes without credentials.
(2) Fake success without required observation, incomplete coverage, mismatched
identity, stale receipt, or unauthorized effect fails. (3) Unsupported platform
and absent credentials remain clear limitations.

**Verification:** Harness rejects deliberately broken implementations and returns
actionable results without marking any actual business capability verified.

### U14 — External implementation and loop proof

**Goal:** Demonstrate that public extensions work without hidden privileges.

**Requirements:** R2–R4, R6, R8, R13; AE1; KTD2, KTD3, KTD6; ARCH-03–ARCH-11.

**Dependencies:** U12, U13.

**Files:** `checks/verification/scenarios/`;
`checks/verification/fixtures/packs.fixtures.ts`;
`checks/validation/repository/check-engine-e2e.ts`;
`examples/extensions/offer-experiment/` (**new contributor example**).

**Approach:** Put a new namespaced capability/operation, its deterministic
implementation, and an alternate loop in a separate source package. The capability
must be absent from the built-in catalog so this proves unknown-capability dispatch.
Use a support-case triage/review operation as the structurally different fixture
family; do not build a second real provider integration merely for this fixture. Copy it to an external temporary directory for proof;
import only through public APIs. Exercise load, plan, run, receipt, resume, and
binding migration. Document exact scope and fake transport limits. This is the
gate before extracting additional provider slices.

**Patterns:** U13 conformance and current engine E2E infrastructure.

**Test scenarios:** (1) AE1 end to end with zero kernel or root-script edits.
(2) Removing the source leaves the installed snapshot usable. (3) Rebinding
reopens affected proof; replay does not duplicate an effect. (4) The new capability
uses its own evidence schema and completes without central registration or dispatch
branches; invalid output fails that schema.

**Verification:** External-package scenario passes independently of its repository
location; contributor can explain the extension using documented contracts only.

### U15 — Product boundaries and contributor entrypoints

**Goal:** Remove misleading ownership and onboarding paths.

**Requirements:** R1, R11, R13; KTD1, KTD9; ARCH-01–ARCH-03, ARCH-07, ARCH-13.

**Dependencies:** U1.

**Files:** `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`;
`docs/guides/runtime-package.md`, `SKILL.md`;
`surfaces/studio/README.md`;
`hosted/builder-console/`; existing package boundaries and
`checks/verification/boundaries/`.

**Approach:** Align authored product/design owners and one generated Design Room.
Clarify that `hosted/builder-console/` serves the builder's own app/console; do not present it
as every consumer app's backend. Enforce that optional console deployment does
not become a local engine prerequisite. Move files only where required to remove
a demonstrated dependency; avoid a large cosmetic directory reorganization.

**Patterns:** Existing package parity and repository boundary checks.

**Test scenarios:** (1) Local discovery/planning works with console components
absent. (2) Runtime import boundaries reject an optional-console dependency.
(3) Contributor guidance identifies authored vs generated files consistently.

**Verification:** Boundary/package checks and documentation review pass; no second
product router, design revision store, or redundant authored product document.

### U16 — Identity, metric, and experiment contracts

**Goal:** Make app-business observations semantically joinable and comparable.

**Requirements:** R8, R9; KTD6, KTD8; ARCH-07, ARCH-11, ARCH-12.

**Dependencies:** U2.

**Files:** `kernel/operating-model/types.ts`;
`kernel/operating-model/measurement.ts` (**new**);
`kernel/schema/metric-contracts.schema.json` (**new**);
`kernel/schema/index.ts`;
`checks/validation/business/data/check-analytics-catalog.ts`;
`surfaces/workspace-template/operations/metric-contracts.json`
(**new optional template**, installed only when selected);
`examples/workspace/business/operations/metric-contracts.json`
(**new reference instance**);
`checks/verification/fixtures/measurement.fixtures.ts` (**new**).

**Approach:** Introduce authored `operations/metric-contracts.json`, the path
selected by the earlier cockpit plan but not yet implemented in this checkout.
Add its loader/schema and link metric-definition IDs and revisions to existing
reducer metric/observation records. Untyped observations are invalid and cannot support a comparison; never invent missing semantics.
Provider pull instructions resolve through selected implementation resources.
Do not create a new observation store. Define ARCH-12 event/exposure/identity,
metric version, cohort, currency, cost, and entitlement-owner semantics. Shared
normalization lives below runtime and validators. Invalid or missing joins remain
explicit. Limit capture and define deletion eligibility and subject-reference mapping for
ARCH-12. U22 owns the authorized erasure transition before real user data enters
benchmark acceptance.

**Patterns:** Existing operating-model metric and observation records; the earlier
cockpit plan supplies the intended authored-file path, not evidence of implementation.

**Test scenarios:** (1) Anonymous-to-identified and restore identities map without
cross-app/environment contamination. (2) Assignment without exposure does not
count as exposure. (3) Duplicate/refund events normalize correctly. (4) Different
currency units, metric versions, gross/net definitions, and immature windows
refuse comparison unless an explicit valid conversion is provided. (5) Missing
definition files and untyped observations produce explicit invalid status.
(6) Subject-reference coverage identifies all affected observations for U22 without
embedding a reverse identity map in long-lived receipts.

**Verification:** Measurement fixtures cover joins and incompatible data; stored
observations retain provenance and no empty coverage becomes ready.

### U17 — Superwall and RevenueCat native composition

**Goal:** Prove a real second monetization approach on one platform.

**Requirements:** R3, R8–R10; AE3; KTD2, KTD6; ARCH-04, ARCH-11–ARCH-13.

**Dependencies:** U14, U16.

**Integration gates:** U17-local is package/native implementation plus deterministic
acceptance. U17-provider additionally requires actual sandbox round-trip receipts.
Keep live readiness separate from both; partial gates never mark all of U17 done.

**Files:** `examples/extensions/superwall-ios/` (**new**);
selected iOS proof workspace outside engine source;
`checks/verification/scenarios/monetization-native.md` (**new**);
`checks/verification/fixtures/monetization-composition.fixtures.ts`;
selected adapter's native tests (**new within example package**).

**Approach:** Implement ARCH's reference composition with pinned SDKs. Include
native dependency locks/revisions and available checksums in the declared build
inputs, and bind toolchain/build artifact identity to proof (ARCH-06). Separate
package conformance, native build/device behavior, sandbox provider round-trip,
and live readiness in results. Normalize observations through U16. Use explicit
RevenueCat purchase delegation and entitlement authority; reject competing
assignment owners. Keep provider-specific artifacts in the extension.

**Patterns:** Official provider integration documents and native adapter contracts.

**Test scenarios:** (1) AE3. (2) Cancellation, pending purchase, provider error,
delayed entitlement, restore, duplicate callback, logout and re-sign-in produce
correct access and observations. (3) Non-iOS selection remains unsupported.

**Verification:** Deterministic tests and native proof pass; sandbox receipts must
come from actual authorized provider interaction. Missing credentials or authority
leave that gate incomplete without blocking safe local implementation.

### U18 — Complete consumer-business benchmark

**Goal:** Prove one useful and well-designed business end to end.

**Requirements:** R8, R9, R11; AE4; KTD7, KTD8; ARCH-10–ARCH-13.

**Dependencies:** U7, U14, U15, U16, U22 for platform acceptance; respect concurrent
design ownership. The benchmark audit and criteria can be authored immediately
without waiting for this chain or blocking current app work.

**Files:** `checks/verification/scenarios/complete-business.md` (**new**);
`checks/validation/repository/run-launchbench.ts`;
selected workspace evidence as input;
benchmark workspace product/design/app/web/test files under explicitly assigned
workspace ownership; scenario fixtures (**new** in `checks/verification/fixtures/`).

**Approach:** First audit the benchmark against category references and current
design acceptance. Publish the benchmark at workspace `verification/business-benchmark.md` with
stable criterion IDs, category references, pass/fail outcomes and named reviewers, owned by the benchmark
lead and independently audited.
Freeze criteria before grading the implementation. Define observable criteria
for core loop, error/empty/offline
states as applicable, accessibility, performance, data integrity, acquisition
funnel, attribution, monetization, retention, support and recovery. Implement
only gaps in bounded app-workspace tasks. The platform unit owns the benchmark
and proof integration, not all app feature development in one patch.

**Patterns:** Current design/craft plan, independent review, device and runtime
evidence; reuse its accepted outputs rather than rerunning or replacing them.

**Test scenarios:** (1) Real core journey from funnel through activation and return
use. (2) Purchase/restore and correct access if monetization is in product scope.
(3) Trace a support/incident and recovery path through the public capability
contract, exercising a real structurally different family before API stability. (4) A changed deployed artifact
invalidates relevant acceptance; screenshots alone cannot satisfy functionality.
Add a real operating cycle: identify a problem from actual observations, record
the authorized decision, run an improvement recipe, verify the change, and collect
subsequent evidence. Negative or inconclusive results are valid; fabricated
observations are not.

**Verification:** Independent benchmark report names current code/artifact,
device/provider evidence, remaining gaps, and category comparison. Local, sandbox,
and live stages are separate; live release requires actual authority and proof.

### U19 — Distinct sibling and reuse proof

[ADR-0009](../decisions/0009-bespoke-design-foundations.md) refines the design method and compatibility. The [bespoke comparison protocol](../../checks/verification/scenarios/bespoke-design.md) defines the comparative design evidence; it does not replace U18 whole-business proof.

**Goal:** Show that reusable primitives allow a different product approach.

**Requirements:** R11; AE4; KTD8; ARCH-03, ARCH-13, ARCH-14.

**Dependencies:** U18.

**Files:** `checks/verification/scenarios/business-variation.md` (**new**);
second benchmark workspace and its app-specific tests under separate ownership;
`catalog/packs/` only for demonstrated reusable gaps.

**Approach:** Choose a second hypothesis with different core interaction,
onboarding, or delivery of value. Bind existing capabilities; preserve its own
product/design authority and code. Record reused infrastructure, app-specific
work, and any kernel changes. Split a required new platform primitive into a
reviewed unit rather than hiding it in app work.

**Patterns:** U18 benchmark and ARCH-13 component/native boundary.

**Test scenarios:** (1) Different journey and design pass the same relevant
business outcomes. (2) Shared capability upgrade does not silently change the
other workspace. (3) Novel product behavior requires no new kernel branch. (4) A fresh-context agent uses documented public entrypoints
and selected knowledge to complete the sibling. Record founder/maintainer
interventions by purpose and effort, including undocumented orchestration help;
repair and replay those gaps. Compare equivalent work with the first business
without treating different product scope as an effort reduction.

**Verification:** Comparative report proves both meaningful variation and reuse;
independent acceptance applies to each business rather than copied receipts. The
repeatability gate requires no unresolved undocumented maintainer steps. Business
choices and reserved authority are not counted as integration failures.

### U20 — Market experiment model and report

**Goal:** Compare independent business hypotheses with interpretable evidence.

**Requirements:** R9, R12; AE5; KTD8; ARCH-07, ARCH-12, ARCH-14.

**Dependencies:** U16, U19.

**Files:** `kernel/operating-model/`;
`kernel/session/market-experiment.ts` (**new**);
`kernel/session/status.ts`;
`entrypoints/mcp/server.ts`;
`entrypoints/cli/b2c.mjs`;
`adapters/registry.ts`;
`kernel/session/operating-service.ts`;
`checks/validation/business/operations/check-portfolio-registry.ts`;
`checks/verification/fixtures/market-experiment.fixtures.ts` (**new**).

**Approach:** Add a versioned market experiment contract referencing workspace IDs,
hypotheses, treatment differences, allocation records, measurement definitions,
decision horizon, versioned maturity/comparability criteria, permitted missing-join
coverage, and founder decisions. Ten is the proof target within one operator's
registry; multi-owner hosting and larger-scale guarantees are outside this unit.
Add a new scoped read model over current
operating records; no implemented cockpit/portfolio reader is assumed. Use the
existing status service and MCP name with an explicit experiment selector,
registry-checked workspace references, and named degraded rows. Do not copy app
state into the registry. Preserve the earlier cockpit plan's proposed summary-only
contract. The typed registry is authoritative; a Markdown summary is generated
output and cannot establish an implemented report. Distinguish exploratory app
comparisons from randomized within-app tests.

**Patterns:** Existing registry identity, operating observations and founder decisions.

**Test scenarios:** (1) Comparable mature cohorts produce a traceable report.
(2) Mismatched definitions, missing costs, younger cohorts, unknown attribution
or different acquisition mixes remain visible and prevent unjustified ranking.
(3) Changing allocation requires existing authority, not an analytic suggestion.
(4) Late refunds or corrected identity mappings revise the report and invalidate
affected conclusions without rewriting historical evidence.

**Verification:** Deterministic report fixtures explain comparability and uncertainty;
no new workspace execution ledger or automatic scale/spend authority.

### U21 — Shared-resource coordination and ten-workspace proof

**Goal:** Safely coordinate parallel businesses and preserve experiment evidence.

**Requirements:** R7, R8, R12; AE5; KTD1, KTD8; ARCH-02, ARCH-10, ARCH-14.

**Dependencies:** U17-local, U20 for local work; U17-provider before the live milestone.

**Files:** `kernel/session/run.ts`;
`kernel/engine/dispatch.ts`;
`kernel/reducer/lock.ts`;
`kernel/engine/runstate.ts`;
`kernel/reducer/shared-claims.ts` (**new**, metadata under the
existing local runtime home; references workspace/occurrence, no copied business state);
`checks/verification/fixtures/resource-coordination.fixtures.ts` (**new**);
`checks/verification/scenarios/market-portfolio.md` (**new**).

**Approach:** Extend current leases with namespaced shared-resource claims,
bounded concurrency, ownership generations, and provider rate limits. Follow
ARCH-10 ownership-loss rules: confirm the old worker stopped and reconcile
in-flight effects before takeover; block recovery if this cannot be established.
Validate ownership before dispatch and commit. Keep reducer commits
serialized within each workspace and independent work parallel across workspaces.
Use existing idempotency and uncertain-effect readback. Rehearse ten independent
workspaces with fake external transports before any public experiment.

**Patterns:** Existing workspace leases, dispatch, receipts and recurrence.

**Test scenarios:** (1) Independent resources progress concurrently; same provider
project/device serializes. (2) Crashed worker and expired lease do not cause a
duplicate write. (3) A paused holder resumes after expiry; the successor remains
blocked until old execution and effects are reconciled, and a stale holder cannot
dispatch or commit. (4) Rate limiting backs off without losing work. (5) AE5 report
survives partial completion and clearly separates real from simulated observations.

**Verification:** Ten-workspace local proof and U20 report pass. The final live
milestone requires independently authorized launches, current operational evidence,
and mature comparable cohorts. Simulation does not close that milestone.

### U22 — Authorized evidence erasure

**Goal:** Honor approved deletion without allowing ordinary history rewriting.

**Requirements:** R8, R9, R11; KTD4, KTD7; ARCH-07, ARCH-10–ARCH-12.

**Dependencies:** U16.

**Files:** `kernel/operating-model/validate.ts`;
`kernel/operating-model/types.ts`;
`kernel/reducer/patch.ts`;
`kernel/reducer/audit.ts`;
`kernel/reducer/erasure.ts` (**new**);
`checks/verification/fixtures/evidence-erasure.fixtures.ts` (**new**).

**Approach:** Add a dedicated, authority-checked reducer transition for a named
subject and approved deletion scope. Use U16's reference mapping to identify
affected observations, snapshots, projections and stored proof. Apply deletion
or redaction required by the business's approved policy, retain non-identifying
erasure metadata, and invalidate affected acceptance/aggregates. The existing
append-only validator permits only this explicit transition; general patching,
unrelated records and ordinary observation updates retain their current rules.
Inventory every durable copy before declaring completion. Do not put the erased
payload into an audit diff, recovery journal, or generated report. Provider-side
deletion is separately scoped work with an actual completion receipt.

**Patterns:** Existing reducer authority, revision/lease handling, mutation checks
and audit; no direct file edits around reducer validation.

**Test scenarios:** (1) Ordinary observation removal or rewriting still fails.
(2) Unauthorized or cross-workspace erasure fails. (3) Authorized erasure after
accepted proof removes required subject data from all inventoried local copies,
preserves non-identifying metadata, and invalidates affected reports. (4) A crash
and resume cannot reintroduce erased data. (5) Pending provider deletion remains
incomplete and cannot be reported as global deletion success.

**Verification:** Mutation-guard regressions and erasure scenarios pass with
synthetic sensitive data; authorized erasure has bounded, independently auditable
scope. No actual customer data or legal policy change is needed for local proof.

## Public facade work units

### U23 — Public discovery and composition facade

**Goal:** Establish useful stable consumer contracts before runtime refactoring.

**Requirements:** R2, R3, R5, R13, R14; KTD1, KTD2, KTD5; ARCH-03–ARCH-05, ARCH-09.

**Dependencies:** None. Preserve concurrent runtime implementation.

**Files:** `contracts/public-api/`,
`entrypoints/cli/b2c.mjs`,
`entrypoints/mcp/server.ts`,
`tooling/render-public-api.ts`,
`checks/verification/public-api/`,
`checks/verification/fixtures/mcp.fixtures.ts`.

**Approach:** Define one strict input contract, typed result envelope, stable
operation registry, and pure declaration/preview service. Project it through
CLI and local MCP. Generate JSON Schema and reference docs. Remove unsupported entrypoints and expose only the current service contracts. Start with operation-level monetization declarations and an example
of cooperating providers; explicitly refuse apply and unimplemented execution.
Do not fabricate a provider adapter, active pin, authority, or readiness proof.

**Patterns:** Shared knowledge tool registration and typed errors; strict schemas.
Public declarations are normative metadata; U2–U5 converge loading and
compilation on those declarations.

**Tests:** Saved v1 declaration, alternate operation binding, unknown fields and
versions, incompatible provider, unsupported target, no-mutation preview,
CLI/MCP semantic parity over real stdio, packaged schema/example presence,
generated projection freshness, and compatibility tool-list regressions.

**Verification:** `test:public-api`, `check:public-api`, typecheck, focused CLI/MCP
fixtures, package parity, catalog/bundle checks, independent review. No claims of
provider execution, external package support, full-business readiness, or release.

### U24 — Public documentation and release contract

**Goal:** Make every active entrypoint reflect the same north-star architecture
and accurately demonstrate the supported release surface.

**Requirements:** R13, R14; KTD1, KTD5, KTD9; ARCH-01–ARCH-05, ARCH-09, ARCH-15.

**Dependencies:** U23.

**Files:** `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`,
`docs/README.md`, `docs/public-interface.md`, `docs/guides/`, `docs/assets/`,
`docs/north-star-architecture.md`, `docs/architecture-conformance.md`,
`docs/guides/runtime-package.md`, `SKILL.md`,
`kernel/session/setup.ts`,
`surfaces/workspace-template/repo-agent-entrypoints/`,
`surfaces/starters/habit-tracker/README.md`,
`surfaces/studio/README.md`, package metadata and generated projections.

**Approach:** Product-led README with a real runnable example, original architecture
visual, honest support table, complete-business goal, and contributor journey.
Separate supported public contract, compatibility runtime, current internals,
and target architecture. Preserve detailed design/authority guidance in the
business-building guide. Align source templates, setup output, and skill routing;
keep installed copies untouched. Historical research is context, not API authority.

**Patterns:** Documentation authority through one index; schemas generated from
code; source installation until package publication is actually verified.

**Tests:** README example, local links, generated reference freshness, package
contents, architecture ownership references, and focused template/skill checks.

**Verification:** Docs and CLI reference agree on supported behavior; no fake
screenshots, unsupported installation claims, or implied provider proof. Public
release remains a separate user-owned action after review and required CI.

### U25 — Versioned business lifecycle facade

**Entry-path decision:** [ADR-0008](../decisions/0008-agent-onboarding-entry-path.md) distinguishes greenfield creation from existing-scaffold adoption.

**Goal:** Extend the stable interface to business creation, inspection, planning,
execution, and evidence while keeping consumers independent of runtime internals.

**Requirements:** R1, R5–R8, R13, R14; KTD1, KTD5; ARCH-02, ARCH-08–ARCH-12.

**Dependencies:** U23, U1, U8, U10.

**Files:** `contracts/public-api/`,
`kernel/session/`, `entrypoints/mcp/server.ts`,
`checks/verification/public-api/`, `docs/public-interface.md`.

**Approach:** Accept business intent, registered identity, and expected revision or
plan receipt. Resolve world, authority, resources, and pinned composition inside
the service. Separate passive planning from explicit provider observation. Keep
one shared service behind transports. Replace compatibility adapters incrementally;
do not freeze raw `OperateWorld`, CLI prose, or `CatalogWorkflowDef` as public DTOs.

**Patterns:** Registry access boundary, pure status reader, shared operating
service, recoverable reducer transitions, versioned public envelope.

**Tests:** Lifecycle CLI/MCP parity; registration isolation; stale plans; denied
writes before I/O; no provider calls in passive previews; interruption and replay;
saved consumer fixtures across replacement of the underlying runtime adapter.

**Verification:** A fresh agent can inspect, plan, execute authorized work, and
read evidence through documented public interfaces with no internal-file parsing.
No consumer contract change is needed when an adapter is replaced.

### U26 — Mobile app operation providers

**Goal:** Make native tools, MobAI, and future mobile-operation providers serve the
same app exploration, verification, and marketing-capture recipes.

**Requirements:** R2–R4, R7, R8, R13–R15; KTD1, KTD2, KTD5;
ARCH-03–ARCH-06, ARCH-09–ARCH-11, ARCH-13.

**Dependencies:** U1, U8, U9, U13, U23. The declaration-only facade is available;
execution remains blocked until these contracts and conformance exist.

**Files:** `contracts/public-api/`, selected provider packages, `adapters/device-proof.ts`,
`catalog/workflows/build-release.ts`, native/MobAI knowledge and validation,
`checks/verification/public-api/`, provider conformance fixtures, and
`docs/guides/mobile-app-operation.md` (runtime paths relative to the repository root, per ADR-0002).

**Approach:** Specify launch, inspect, interact, screenshot, and video operations
with explicit target and support negotiation. A host-native adapter projects the
current host's exposed tools; provider-specific adapters project their own APIs.
Honor explicit bindings; otherwise prefer available native tools that satisfy the
request. Missing operations or evidence return a blocker or an explicit alternate
selection. Do not add a second router. Retain the current compatibility proof
checks until normalized replacements prove equivalent guarantees.

**Patterns:** Shared composer, host-owned execution route, operation-level binding,
immutable artifacts, selected knowledge, independent acceptance, bounded recovery.

**Tests:** Same capture recipe through native and alternative providers; partial
operation coverage; unavailable host tools; unsupported Android/physical target;
explicit binding refusal without silent fallback; interrupted interaction with
uncertain effects; provenance across raw and composed marketing assets; neutral
acceptance rejects stale or misbound evidence from either provider. Preserve all
saved v1 discovery and composition inputs and existing native proof fixtures.

**Verification:** Fake transports prove deterministic selection and conformance.
Current real app/build/target observations prove each advertised executable tuple.
Demonstrate a functional journey and raw marketing capture with native tools and
an alternative provider. A screenshot alone cannot pass functional, accessibility,
design, backend/provider, or release acceptance. No fabricated device receipts.

## Verification Contract

### Per-unit and integration proof

Each unit supplies its stated positive, failure, and compatibility scenarios.
Use existing fixture, boundary, parity, catalog, and package infrastructure.
Register new fixtures with the existing runner. Run only checks relevant to the
change while iterating; the integrator broadens verification for runtime, reducer,
provider, catalog, security, or release contract changes as AGENTS.md requires.

| Boundary                          | Required result                                                          | Existing check family                                                     |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Public contracts and composition  | Full-field parity, strict failures, deterministic resolution             | `check:catalog`, `check:pack-composition`, `test:fixtures`                |
| Authority and runtime ownership   | No bypass, duplicate store, validator import, or undisclosed effect      | `test:boundaries`, `test:parity`, `test:fixtures`                         |
| Packaging and published resources | First-party/external parity and generated artifact freshness             | `check:package-parity`, `check:hosted-bundle`, `check:provider-contracts` |
| Execution and migration           | Real local receipts, validated current pins, interruption/re-entry proof | `check:engine-e2e`, `test:fixtures`                                       |
| Business quality                  | Current app, web, device, provider and independent design evidence       | `launchbench`, selected business validators and native tests              |
| Cross-cutting integration         | Repository-required larger checks after affected contract changes        | `audit:ci`                                                                |

`check:architecture` (U1) and `check:extension` (U13) are planned additions, not
commands assumed available at plan creation. A green fixture or lint run is not
provider, device, store, deployed-runtime, or business-quality proof.

### Release and migration gates

Keep existing pins usable throughout extraction. For each migrated slice, compare
intended default behavior against the baseline, prove the external path, and
preview/apply a representative existing workspace migration. Preserve history
and document unavoidable incompatibilities. Never backfill a success receipt from
an imported document. No release or external mutation is authorized by this plan.

Before describing the platform as open-source ready, verify its actual license,
dependency redistribution terms, public examples, package integrity, secret
exclusion, and contributor install/use path under the existing legal authority.
The architecture does not presume that review has occurred.

## Definition of Done

- R1–R13 trace to completed unit evidence in the existing execution/task system;
  the plan remains a contract with stable IDs, not a progress ledger.
- Applicable ARCH rules pass independent conformance review. Mechanical rules
  have meaningful negative cases; judgment and live claims retain independent proof.
- A contributor can implement and import a provider plus an alternative recipe
  from outside the repository without kernel edits or hidden root privileges.
- The current default composition remains usable, and existing pins migrate only
  through a recoverable explicit change with correct history and invalidation.
- One complete business and a meaningfully distinct sibling satisfy their own
  current benchmark evidence, with shared infrastructure and independent identity.
  Fresh-agent repetition and a complete observation-to-change cycle establish
  builder leverage; unresolved undocumented maintainer work prevents that claim.
- The ten-workspace rehearsal demonstrates coordination and interpretable reports.
  Ten live businesses and market conclusions are a separate final milestone;
  it remains incomplete until authorized releases and mature observations exist.
- Documentation, package contracts, generated projections, tests, and supported
  platform claims agree. Unsupported coverage and unresolved authority are visible.
