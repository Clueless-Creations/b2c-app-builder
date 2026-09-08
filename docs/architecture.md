# B2C App Builder architecture

The [public interface](public-interface.md) is the consumer contract.
`contracts/public-api/` owns its versioned declarations and schemas.
`kernel/services/business.ts` implements the shared service. CLI and local MCP
project that service through the same operation registry.

This document describes current system mechanisms. The [north-star architecture](north-star-architecture.md)
owns the target boundaries and stable `ARCH-xx` rules. Use the [migration roadmap](plans/2026-09-04-1747-refactor-consumer-business-primitives-plan.md)
for refactoring units and the [conformance protocol](architecture-conformance.md)
for reviews. The implementation inventory names source and verified behavior;
target rules alone do not establish implemented support.

## Purpose

B2C App Builder is a local expert system for consumer apps. It turns a product goal into a versioned workflow, plans the work, and supports CLI-approved execution with evidence.

This repository is the live product. The skill, MCP server, and CLI live here. GitHub does not archive this repository. A later successor experiment named Planes is parked in `docs/timeouts/planes.md`. Do not route current work through that experiment.

The system is local-first. Durable app work has its own workspace. A focused
change can use the expert knowledge library without installing the operating graph. MCP
resolves only registered workspaces. The CLI may use an explicit operator-supplied
path; registration gives a stable ID and MCP allowlisting.

## System context

```text
Agent
  -> thin b2c-app-builder skill
  -> b2c-app-builder MCP for discovery and planning
  -> b2c CLI for approved workspace changes
  -> shared service over the typed catalog and manifest-backed knowledge
  -> session runtime and reducer
  -> validators and independent verification
  -> workspace state, evidence, and handoff
```

The product separates guidance from authority. A workflow can recommend an action. It cannot approve spend, expose a secret, submit an app, or prove that an external action succeeded.

### Product authority

Root `product.yaml` is the authored product store in each app workspace. Rendered
`PRODUCT.md` is the readable index. It owns the promise, user, problem, wedge,
core loop, complete accepted scope, and acceptance. It also owns requirements, metrics,
monetization posture, risks, and decisions. It links to (and does not duplicate)
`strategy/RESEARCH.md`, `product/ONBOARDING.md`, copy, analytics, design,
engineering, revenue, store, and trust contracts. Do not hand-edit `PRODUCT.md`.

`state/business-state.json` and `state/current-truth.json` are reducer-owned
execution bookkeeping. CLI/MCP status and plan consume them; they are never the
product source of truth.

The normal product route is `RESEARCH.md` -> `product.yaml` -> rendered
`PRODUCT.md` -> linked detailed contracts. The normal state route is `b2c status`
or `b2c plan`. Raw reducer documents are an implementation detail used for
recovery, verification, and runtime development.

A planning workspace has no runtime state. After `product.yaml` is accepted and
`PRODUCT.md` matches its rendered content, `b2c bootstrap` creates the current
`state/business-state.json` and activates the verified default business recipe. Runtime readers accept the current schema only. Invalid
or missing pins stop execution before workspace effects.

### Start paths

The skill classifies four starts. This is routing, not another state model.

| Start              | First work                                                       | Runtime point                             |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| Existing, focused  | Inspect one affected surface and load one workflow.              | No runtime required.                      |
| Existing, overhaul | Inventory the app and define the target product and design.      | Add when multi-session control is useful. |
| Idea supplied      | Record and research the hypothesis.                              | Optional after the direction is accepted. |
| No idea, delegated | Research opportunities and select one under the opening mandate. | Optional after selection.                 |

The opening mandate can delegate reversible product, design, code, and local test
work. Protected actions still require exact authority. After runtime setup, the
optional authority handoff can remain held without blocking local work. Provider
and store actions cannot cross their boundary until that handoff is complete.

## Simplicity constraints

- One thin skill routes agents.
- One typed catalog owns workflow IDs, order, dependencies, gates, roles, and knowledge bindings.
- One manifest-backed knowledge library owns durable expertise and provenance.
- One core runtime serves CLI and MCP. One reducer owns controlled workspace state.
- Generated files are projections. They are not another source of truth.
- Extend these layers. Do not add a second router, catalog, knowledge store, planner, reducer, or workspace state store.
- Do not give a roster role prompt its own Claude Code agent-memory scope. A subagent's own auto memory is a separate directory, so this creates a second knowledge store. (Source: https://code.claude.com/docs/en/memory.)

## Product interfaces

### Skill

`SKILL.md` is a small router. It detects broad consumer-app work and points the agent to MCP or CLI. It does not duplicate the knowledge library.

### MCP

`entrypoints/mcp/b2c-app-builder-mcp.mjs` starts the local MCP server (`entrypoints/mcp/server.ts`). The default server exposes:

- workflow catalog discovery
- workflow retrieval
- knowledge search and retrieval
- registered workspace status
- registered workspace planning
- operation preview and replay

The MCP is read-only by default. `b2c_operate` supports preview and replay. `B2C_APP_BUILDER_MCP_WRITE=1` adds bootstrap, run, approvals, verify, and schedule tools and permits gated operate commits for an explicitly approved session.

### CLI

`entrypoints/cli/b2c.mjs` is the explicit command interface. It creates and registers
workspaces. It reports status, bootstraps state, computes plans, and runs
sessions. It also records approvals, verifies work, and manages supported tasks.

The CLI and MCP call the same kernel services. `kernel/session/status.ts` owns the
workspace status reader and its text forms. The interfaces do not implement
separate status or workflow rules.

### Hosted knowledge adapter

`hosted/knowledge-mcp/` packages a read-only knowledge service for an authorized hosted environment. `hosted/builder-console/` is the separate console Worker; neither is a local engine prerequisite. It publishes catalog and reference content. It does not expose local workspace execution or local authority.

Local setup does not deploy this adapter.

### Design Room

Root `DESIGN.md` is the authored design authority in each app workspace. It defines the global system and routes agents to detailed design work.

Root `product.yaml` is the authored product store. Root `PRODUCT.md` is the
rendered index and routes agents to detailed product work.

The design structure stays small:

```text
DESIGN.md                              global design system and index
design/flows/<flow-id>.md              optional detailed flow plan
design/screens/<screen-id>.md          optional detailed screen and state plan
design/components/<component-id>.md    optional app-specific component contract
design/platforms/<stack>.json          selected native implementation map
design/system/                         generated platform token outputs
studio/seed/business.json              structured screen and flow routes
design/design-room.html                generated read-only review page
```

The Design Room is one review page. It shows the current system, routes, component maturity, and adapter coverage. It does not own design state or revision history. Git owns revisions.

The human workflow is brief, journeys, flows, screens and states, components, prototype, critique, approval, implementation, and QA. `DESIGN.md` keeps that work connected. Detailed files exist only when they improve review or implementation.

Reusable component contracts live in `surfaces/ui-library/components/`. `surfaces/ui-library/component-index.json` routes tools to them. They define purpose, states, accessibility, token use, and maturity without binding to one framework.

Native manifests live in `surfaces/ui-library/adapters/<adapter-id>.json`. They record real implementations and proof. Stack IDs are free-form. SwiftUI, Expo or React Native, Flutter, and future stacks use the same contract model.

The reference library currently includes a SwiftUI adapter. An app selects only the adapters it uses. Missing adapter coverage means not implemented. The system never infers parity from a shared contract.

## Source layers

[ADR-0002](decisions/0002-repository-layout.md) sets the layout. The repository
root is the package root. Each top-level directory is one layer of the
north-star diagram, in dependency order.

| Layer       | Path                                                                                             | Responsibility                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Routing     | `SKILL.md`, `agents/`                                                                            | Agent discovery and setup                                                                           |
| Entrypoints | `entrypoints/cli/`, `entrypoints/mcp/`                                                           | CLI dispatcher, MCP launcher and server                                                             |
| Contracts   | `contracts/public-api/`                                                                          | `b2c/v1` registry, schemas, generated reference, examples                                           |
| Kernel      | `kernel/`                                                                                        | Engine, reducer, sessions, work orders, operating model, autonomy, knowledge service, schema        |
| Definitions | `catalog/`                                                                                       | Workflows, domains, gates, roles, world ontology, agent-graph overlay, packs, generated projections |
| Expertise   | `knowledge/`                                                                                     | Consumer-app methods and source provenance                                                          |
| Adapters    | `adapters/`                                                                                      | Worker, provider, provisioning, and app-review adapters                                             |
| Surfaces    | `surfaces/starters/`, `surfaces/ui-library/`, `surfaces/workspace-template/`, `surfaces/studio/` | Runnable starting points, component contracts, installed workspace files, Design Room renderer      |
| Hosted      | `hosted/knowledge-mcp/`, `hosted/builder-console/`, `hosted/shared/`                             | Separately deployed Workers and the one module they share                                           |
| Examples    | `examples/workspace/`, `examples/tuck/`                                                          | Reference artifacts and the Tuck app and web showcase                                               |
| Proof       | `checks/validation/`, `checks/verification/`                                                     | Deterministic checks and behavior tests                                                             |
| Maintenance | `tooling/`                                                                                       | Rendering, audit runner, capture, and maintenance tools                                             |

`contracts` imports nothing internal. `kernel` and `catalog` import `contracts`.
`adapters` imports those. `entrypoints` and `hosted` import services. `knowledge`,
`surfaces`, and `examples` import no runtime. `checks` and `tooling` may import
anything; nothing imports `checks`.

Root files beside the layers are not layers. The package manifests
(`package.json`, `package-lock.json`, `tsconfig.json`, `skill-version.json`),
the tool dotfiles, and the entry documents (`README.md`, `AGENTS.md`,
`CLAUDE.md`, `CONTRIBUTING.md`, `LICENSE`, and the generated
`ACKNOWLEDGMENTS.md` and `THIRD_PARTY_NOTICES.md`) sit at the root.
`check:repository-boundary` allowlists exactly these files and the layer
directories. When `--repo-root` is a git toplevel, that walk uses tracked paths
and untracked paths git would absorb; ignored local files are not repository
contents. A new root file needs a note here or a decision record in the same
change. Being allowed at the root is a separate decision from being exempt from
the version gate: the Versioning section of `CONTRIBUTING.md` owns the list of
repository-only paths that need no version bump.

## Catalog and knowledge

The catalog is a typed definition graph. It owns workflow order and stable IDs. Durable expertise belongs only in manifest-backed knowledge.

Each knowledge reference has a manifest. The manifest records its stable ID, lifecycle, applicability, sources, review state, and catalog bindings. Generated projections contain only catalog-bound content.

Edit source definitions first. Do not edit generated catalog files by hand.

The knowledge service returns bounded content:

1. Search or browse the catalog.
2. Select one workflow.
3. Load the references named by that workflow.
4. Keep unrelated references out of the agent context.

## External sources and upstream maintenance

External material enters through one contribution service,
`kernel/contribution/service.ts`. The CLI (`b2c contribute`) and the opt-in
contributor MCP project it. The contract is `b2c.contribution/v1` in
`contracts/contribution/contract.ts`. It describes sources, units with
dispositions, derivations, evaluations, notices, upstream manifests, and
observations. It grants nothing and executes no source code.

Upstream identity lives in `catalog/upstreams/<id>.yaml`, with verbatim notices
under `notices/` and dated observations under `observations/`. Knowledge
manifests reference an upstream through `upstream_id` and record derivations.
Extension packages declare `notice` resources and a `thirdParty` block.
`npm run render:credits` generates `ACKNOWLEDGMENTS.md`,
`THIRD_PARTY_NOTICES.md`, and `docs/upstreams/support-report.md`.

The contributor proposes the manifest with the contribution that first reuses
the project. `kernel/contribution/accepted-upstreams.ts` refuses to accept
adapted, reused, wrapped, or vendored repository material without one. After
release, maintenance owns the manifest. `check-agent-entrypoints.ts` under
`checks/validation/repository/` keeps the routers, the thin adapters, and the
workspace templates inside the three-scope contract.

The contributor MCP registers only with `B2C_APP_BUILDER_MCP_CONTRIBUTOR=1`. It
is read-only and reads local paths inside `B2C_APP_BUILDER_CONTRIBUTION_ROOTS`
only. Business workers never receive contribution tools or results. See
[ADR-0005](decisions/0005-source-adoption-and-upstream-maintenance.md) and the
[adoption guide](guides/adopt-external-sources.md).

## Knowledge graph and agent graph

The **knowledge graph** is a map of the world. It names what a consumer-app company knows: customer, problem, feature, price, decision, and related classes. It lives at `catalog/ontology/`. Instances live in workspace files (`product.yaml`, `strategy/RESEARCH.md`, `DESIGN.md`). `PRODUCT.md` is rendered from `product.yaml`. It is not the expert method library in `knowledge/`.

Commercial facts of running that company sit on this map. Price, offer, channel, and entitlement are world classes. Founder accounts, Doppler, paid tools, secrets, and delegated access are not. Those belong to the operator plane in `operations/business-access.json`. Agent execution belongs to the operating graph. These fact planes are not the parked Planes successor repository.

Author `product.yaml` as the world instance document and render `PRODUCT.md` from it. One authority. Do not hand-edit `PRODUCT.md`.

The **agent graph** is a map of the work. It names who does what, in what order. Catalog phases and workflows already own runtime order. `catalog/agent-graph/` overlays each phase with the roles that act and the ontology classes they read and write. It also names the founder gate before the next step. It is not a second catalog.

`catalog/taxonomy/` is the SKOS thesaurus for work vocabulary (domains, lanes, phases, roles). It is not the world ontology.

The operating graph (reducer, work orders, grants) records execution. An operating-model `decision` record is not the same object as a product decision in `product.yaml`.

## Workspace model

`~/.b2c-app-builder/workspaces.json` is the MCP workspace allowlist and local address book. MCP requires a registered ID or the exact registered path. CLI commands accept explicit paths. A CLI command that supports workspace IDs resolves them from this registry.

A workspace contains:

- product and business state
- an installed catalog pin
- control and authority records
- run state and checkpoints
- evidence and verification records
- generated consumer-app artifacts

The runtime refuses an unknown MCP workspace. MCP never probes an arbitrary path to resolve or act on it as a workspace. The CLI acts only on the explicit path supplied by the operator.

Registry resolution stays the only path to a workspace the runtime will act on. A second, bounded, read-only path exists for a folder that is not registered yet. `kernel/session/inspect.ts` classifies it against a fixed marker-file allowlist, for pre-registration orientation only. It never joins a caller's path through the registry lookup. It never follows a symlinked marker or reaches a write tool. `b2c_plan` and `b2c_status` both call this one inspector, so they cannot disagree about the same folder.

## Execution model

A bounded session follows this sequence:

1. Load the registered workspace and its catalog pin.
2. Check reducer state, the audit chain, the kill switch, and active authority.
3. Compile the current ready work from the dependency graph.
4. Dispatch only work whose dependencies and authority gates pass.
5. Run deterministic validators for produced artifacts.
6. Require a separate verifier for judgment-based acceptance.
7. Record state, evidence, and the user-facing handoff.

The runtime resumes from durable state. Resource-conflict-free workers run
concurrently within the configured limit. Authority checks, budget reservations,
and run-state updates execute serially in the session owner. Every worker in a
started batch settles before review or session-lock release. A failed sibling
cannot release ownership while another worker is still producing output.

Explicit device and provider-project identities acquire cross-workspace claims
before an attempt begins. Contention consumes no attempt. An expired claim or an
uncertain external effect requires reconciliation; expiry never grants takeover.
Chat history is not execution state.

### Isolated review as data

A surface that a second agent must accept has an auditor node in the catalog. The auditor node
depends on its producer, declares `reviewOf: [producer]`, and writes only a findings artifact.
`catalog/validate.ts` rejects an auditor that lacks the dependency or writes a producer path.
Each role lists `reviewedBy`, the fresh-context roles that audit its work. Both fields cross the
bridge into the node brief. `b2c_workflow` with `brief: true` and `b2c plan` then tell the
dispatcher to spawn the auditor in a fresh context with read-only tools. `check:orchestration`
verifies the review ledger in `operations/ORCHESTRATION.md`. The contract is
`knowledge/orchestration/isolated-review.md`.

`workflow.orchestration.full-launch-program` is the loadable entry for a complete consumer
delivery. It replaces a pasted launch prompt with a mandate record
(`operations/LAUNCH_PROGRAM.md`). The existing nodes, the auditor edges, the reference-pack edge,
and `workflow.orchestration.full-launch-closeout`'s gates do the rest.

## State ownership

The reducer is the only writer for reducer-owned workspace documents. Direct edits fail the next integrity check.

The reducer provides two write paths:

- commit an authorized state or control patch
- reconcile current truth from a verified receipt

Every accepted write updates the manifest and hash-chained audit log.

Claude Code auto memory is a personal aid across sessions. It never substitutes for `state/business-state.json` or `state/current-truth.json`. (Source: https://code.claude.com/docs/en/memory.)

## Authority model

Work is permitted only when both conditions pass:

1. The workflow is ready.
2. The current authority covers the action.

The following actions always require explicit authority at the required scope:

- account or credential changes
- spend or billing changes
- pricing decisions
- legal decisions
- destructive actions
- public posting or hosted deployment
- store submission or production release

Access to a tool or account does not grant permission to use it.

See `docs/authority-envelopes.md` for the five standing-authority grant types a founder can extend to an agent. It also states the never-authorize list that bounds them.

## Evidence model

A completion claim must point to evidence that matches the claim:

- repository behavior: focused validator or test output
- device behavior: current simulator or device proof
- provider state: provider-native readback
- store state: App Store Connect or Google Play readback
- release state: exact artifact, version, and destination evidence

Worker reports are proposals until the primary agent verifies their outputs.

## Review layer ownership

Each review layer catches a different class of gap. Stacking layers that catch the same class only adds noise.

- `check:*` validators catch mechanical file, phrase, and state-shape gaps.
- LaunchBench catches known failure modes as scenario definitions. It does not observe live agent behavior.
- Behavioral evals catch live-agent instruction-following drift. They stay advisory.
- A founder decides what only a founder can decide.

This repo applies that split itself; the guide does not name these four layers. (Source: role-separation principle, multi-provider code review guide, https://cc.bruniaux.com/guide/workflows/multi-provider-code-review/.)

## Version and generation rules

Keep the version aligned across:

- the root package manifest and lockfile
- `skill-version.json`
- generated catalog, evidence-schema, and hosted knowledge output

The hosted Worker packages under `hosted/` version independently. A catalog or
knowledge change must update its generated projections. A behavior change must
update its focused tests. An instruction change must keep the skill, agent
metadata, package guide, and repository guide consistent.

## Repository layout

```text
AGENTS.md                         maintainer contract
CLAUDE.md                         Claude-specific addendum
README.md                         product and setup guide
SKILL.md                          thin router (the skill entrypoint)
agents/                           Codex skill metadata
skill-version.json                release manifest for the package
package.json                      the one package manifest
docs/                             architecture, decisions, plans, guides
entrypoints/
  cli/b2c.mjs                     CLI dispatcher
  mcp/                            MCP launcher and server
contracts/public-api/             b2c/v1 registry, schemas, reference, examples
kernel/                           engine, reducer, sessions, work orders, schema
catalog/                          typed definitions and generated projections
knowledge/                        expert consumer-app references
adapters/                         worker, provider, provisioning, app-review adapters
surfaces/
  starters/                       runnable app archetypes
  ui-library/                     component contracts and native adapter manifests
  workspace-template/             small day-zero workspace files
  studio/                         Design Room schema and read-only renderer
hosted/
  knowledge-mcp/                  hosted knowledge MCP Worker
  builder-console/                builder console Worker
  shared/                         the one module both Workers share
examples/
  workspace/                      full reference and validator artifacts
  tuck/                           app and web showcase
checks/
  validation/                     deterministic checks
  verification/                   runtime and boundary proofs
tooling/                          renderers and maintenance commands
```

## Development checks

Use Node.js 24. Start with checks that match the change:

```bash
npm run validate:skill
npm run check:catalog
npm run check:package-parity
npm run test:fixtures
```

Use the broader audit suites for runtime, reducer, trust, or catalog changes. Also use them for provider or release behavior.

## Design evidence and independent acceptance

Deterministic gates and independent judgment are conjunctive obligations. Review receipts bind the exact attempt, producer and reviewer contexts, output inventory, and frozen criteria. A changed artifact, rubric, or workflow contract invalidates acceptance. Rejected judgment creates bounded repair work through existing run state. Protected side effects require current readback and authority before replay.

Design taste authority crosses a separate signed boundary. The authenticated founder UI or keychain broker signs an Ed25519 decision receipt. The runtime pins the public-key identity before dispatch. It keeps the private key outside the repository and worker environment. A direct verdict binds the exact `DESIGN.md` bytes. Delegation binds the current run and is captured on the audit attempt before its worker starts. Later delegation cannot authorize an earlier review artifact. Session labels, Markdown rows, and `asFounder` flags are attribution only.

The prebuild design audit judges the direction. The implemented craft audit judges the native and landing runtimes. It uses the accepted DESIGN.md scope, frozen rubrics, reference artifacts, and current implementation. Retrieval preserves bounded context while reporting every omitted or truncated required reference and its continuation. This adds no planner, graph database, or state owner.

See [research resume and bounded knowledge](guides/research-resume-and-knowledge.md) for planning checkpoints, section retrieval, and complete-mandate continuation.
