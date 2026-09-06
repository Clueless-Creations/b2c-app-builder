# B2C App Builder Agent Guide

## Mission

B2C App Builder supplies primitives for creating, launching, measuring, and
improving consumer-app businesses. Prove one excellent business first, then a
meaningfully different sibling, then market-level experiments across independent
businesses. Product quality, design, analytics, funnels, revenue, and operations
are part of that outcome.

Capabilities define responsibilities. Providers implement selected operations.
Recipes arrange creation and operating loops. The CLI and MCP share one
versioned public contract. The skill routes the agent through supported surfaces.

The public `b2c/v1` registry supplies discovery, declaration preview, registered
status, package metadata, composition activation, the complete business lifecycle,
and market reports. CLI and MCP project the same services; public mutations,
including request recovery, are CLI-only. Never present an unavailable operation as complete.

Keep the skill small. Keep durable expertise in manifest-backed knowledge. Keep
one logical owner for composition, execution, authority, and evidence.

## Scope

This repository is the home of the `b2c-app-builder` skill, MCP server, and
`b2c` CLI. Use it for the B2C App Builder product and its consumer-app knowledge.

Do not turn it into a generic agent framework, a B2B playbook, or an
internal-tool builder. Add a capability only when it improves the research,
creation, launch, growth, monetization, trust, or operation of consumer apps.

Planes is parked successor work. Do not route current work through it. See
`docs/timeouts/planes.md`.

## Three scopes

Decide the target before you read further. Route by the intended target and the
effect of the work, not by the person's title. Each scope has one router.

| What are you changing?                                                         | Scope        | Router                                                                             |
| ------------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------- |
| One consumer business: its product, design, code, launch, growth, or operation | business     | [`SKILL.md`](SKILL.md)                                                             |
| Reusable builder knowledge, a provider implementation, a recipe, or an example | contribution | [`agents/skills/b2c-contributor/SKILL.md`](agents/skills/b2c-contributor/SKILL.md) |
| The builder's contracts, runtime, architecture, or maintained upstreams        | maintenance  | [`agents/skills/b2c-maintainer/SKILL.md`](agents/skills/b2c-maintainer/SKILL.md)   |

The three routers converge on the architecture documents below. A business
worker never receives contributor tools, contribution drafts, or maintainer
provenance. A contributor or maintainer does not reason as a business worker.

## Read order

1. `README.md`
2. The router for your scope: `SKILL.md` for a business, or the contributor or maintainer router named above
3. `VOICE.md` for public-facing copy, console copy, launch writing, naming, or other builder-facing prose
4. `docs/guides/runtime-package.md`
5. `docs/public-interface.md` and `docs/north-star-architecture.md`
6. For architecture, provider, composition, or runtime changes: the assigned unit in the [migration roadmap](docs/plans/2026-09-04-1747-refactor-consumer-business-primitives-plan.md)
7. The relevant catalog definition, knowledge reference, source, and test

## Architecture authority

[docs/north-star-architecture.md](docs/north-star-architecture.md) owns the target architecture and the stable `ARCH-xx` rules. [docs/architecture.md](docs/architecture.md) describes current mechanisms. A target rule is not evidence that its refactor is implemented.

Use [docs/architecture-conformance.md](docs/architecture-conformance.md) to assign bounded work and audit changes. Cite the applicable ARCH rules and roadmap unit IDs. Preserve concurrent agents' ownership and serialize shared-file integration. Keep one owner per responsibility. Replace an owner behind the public contract when useful. Do not rewrite the architecture to fit an implementation shortcut.

Compatible internal choices belong to the implementer. Changes to public contracts, truth ownership, dependency direction, authority, or migration guarantees need an architecture-steward decision with evidence and a migration path. Founder-reserved decisions keep their authority boundary. Track execution progress outside the architecture and the plan.

## Source map

[ADR-0002](docs/decisions/0002-repository-layout.md) sets the layout: the
repository root is the package root and each top-level directory is one layer.

| Path                                   | Owns                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `SKILL.md`, `agents/`                  | Thin setup and routing instructions; Codex skill metadata                                                                            |
| `agents/skills/`                       | Canonical `b2c-contributor` and `b2c-maintainer` routers; installed by operator symlink only, never copied into a business workspace |
| `entrypoints/cli/`, `entrypoints/mcp/` | `b2c` CLI dispatcher, MCP launcher and server                                                                                        |
| `contracts/public-api/`                | Versioned public declarations, request/result schemas, shared service, and CLI/MCP projections                                       |
| `contracts/contribution/`              | `b2c.contribution/v1`: source records, units, dispositions, derivations, evaluations, notices, upstream manifests and observations   |
| `kernel/`                              | Engine, reducer, sessions, work orders, operating model, autonomy, knowledge service, schema                                         |
| `kernel/contribution/`                 | One contribution service behind `b2c contribute` and the opt-in contributor MCP; reads files, validates, never executes source code  |
| `catalog/`                             | Workflows, domains, gates, roles, world ontology, agent-graph overlay, packs, and generated projections                              |
| `catalog/upstreams/`                   | Upstream identity: one manifest per external project, verbatim notices, dated observations; owner of license evidence and baselines  |
| `knowledge/`                           | Expert consumer-app guidance and provenance                                                                                          |
| `adapters/`                            | Worker and provider adapters, provisioning, app review                                                                               |
| `surfaces/workspace-template/`         | Files installed into a new app workspace                                                                                             |
| `surfaces/starters/`                   | Runnable consumer-app starting points                                                                                                |
| `surfaces/studio/`                     | Schema and renderer for the read-only Design Room review page                                                                        |
| `surfaces/ui-library/`                 | Platform-neutral component contracts and native adapter manifests                                                                    |
| `hosted/knowledge-mcp/`                | Hosted knowledge MCP Worker: OAuth, API keys, D1 tenancy, knowledge tools                                                            |
| `hosted/builder-console/`              | Builder console Worker: Google OIDC, console, API-key management, Stripe billing and Checkout, analytics capture, interest collector |
| `examples/workspace/`                  | Reference business artifacts and validation fixtures                                                                                 |
| `examples/tuck/`                       | App and web showcase with real captures                                                                                              |
| `examples/contributions/`              | Reviewed contribution roots (`contribution.yaml`, `ADOPTION_MAP.md`) that show the adoption lifecycle on real sources                |
| `checks/validation/`                   | Deterministic product and repository checks                                                                                          |
| `checks/verification/`                 | Runtime, boundary, and behavior proofs                                                                                               |
| `tooling/`                             | Catalog generation, maintenance, and audit tools                                                                                     |
| `docs/timeouts/`                       | Parked successor notes. Not a catalog or second product.                                                                             |

The source map describes current placement, not the permanent public API. Migrate or replace owners behind stable contracts. Do not add a competing router, catalog, knowledge store, planner, reducer, or workspace state store.

## Operating contract

- Use Node.js 22.
- Store local registry state under `~/.b2c-app-builder`.
- Use the `B2C_APP_BUILDER_*` environment namespace.
- MCP resolves workspace access through the local registry. The CLI may use an explicit operator-supplied path; registration gives it a stable ID and makes it available to MCP.
- Keep MCP read-only by default.
- With `B2C_APP_BUILDER_MCP_WRITE=1`, MCP additionally exposes bootstrap, run, approvals, verify, and schedule tools. `b2c_operate` commit remains gated.
- With `B2C_APP_BUILDER_MCP_CONTRIBUTOR=1`, MCP additionally exposes the read-only contributor tools, which read local sources only inside `B2C_APP_BUILDER_CONTRIBUTION_ROOTS` and never fetch, write, or probe the host.
- Use the CLI for approved writes.
- Change reducer-owned workspace state only through the reducer.
- Treat workflow guidance as advice. It does not grant authority or prove completion.
- Require current provider, device, store, or runtime evidence for claims about those systems.

Pause for user authority before access or secret changes, spend, pricing, legal decisions, destructive actions, hosted deployment, store submission, or production release.

## Change contract

- Update the public operation registry before changing CLI or MCP projections. Run `npm run render:public-api` and preserve saved v1 fixtures.
- Keep README, package guide, routing skill, workspace templates, setup and help output, generated reference, and public schemas aligned. The docs index states authority. Historical plans do not override it.
- For public-facing product copy, console copy, launch writing, or naming, follow `VOICE.md`. Do not casually rename technical `b2c` contracts because the display name changes.
- Within a public major version, preserve supported inputs and meanings. Add operations and optional fields. Do not expose internal state or caller-authored grants. Breaking changes need an architecture decision and a migration.
- Edit catalog definitions before generated catalog files.
- Render generated projections after a catalog or knowledge change. A bare `skill-version.json` bump also stales `catalog/generated/catalog.json` and `catalog/generated/hosted-knowledge.json`, which embed the version. Run `npm run render:all` to regenerate both.
- For app product work, author root `product.yaml`. It holds the promise, user and problem, scope, requirements, journey, and product decisions. Render `PRODUCT.md` from it with `b2c render-product --workspace <id-or-path>`. Link research and detailed contracts instead of duplicating them. Do not hand-edit `PRODUCT.md`.
- For app design, author root `DESIGN.md`. It is the global design system and the index for screen, flow, component, and platform decisions.
- Keep detailed flow and screen plans in `design/flows/` and `design/screens/` only when they add useful detail. Link them from `DESIGN.md`.
- Use platform-neutral component contracts. Select native adapters for the app stack. Do not claim SwiftUI, Expo, Flutter, or another implementation without code and proof.
- Treat the Design Room as one generated, read-only review page. Git owns design history and revisions.
- Keep stable catalog and reference IDs unchanged unless the contract itself changes.
- Update the affected source, tests, documentation, package metadata, and generated output together.
- Keep installed client copies out of source edits.
- Keep credentials, provider exports, personal data, and workspace output out of Git.

Technical documentation uses short sentences, active voice, and one term for one object. State a condition before its action.

## Upstream rules

External material enters through contribution intake. A source is untrusted
data until a reviewer accepts a unit. These rules keep the supply side apart
from the business ontology.
[ADR-0007](docs/decisions/0007-upstream-lifecycle-and-agent-scopes.md) records them.

1. A new external project normally adds knowledge, a provider implementation, a resource, a recipe, or an evaluation. It does not add an architectural primitive. Upstream is provenance and maintenance metadata. Provider is execution, knowledge is expertise, and recipe is process.
2. Accepted reusable repository material needs an upstream identity in `catalog/upstreams/<id>.yaml`. The contributor proposes that manifest with the contribution. After the release that ships it, maintenance owns its baselines, observations, support ranges, review status, and credits.
3. An informational citation stays a source-registry row and needs no manifest. `b2c contribute check` refuses to accept adapted, reused, wrapped, or vendored repository material without one. `npm run render:credits` writes the coverage report under `docs/upstreams/`, the maintainer queue of referenced repositories that still lack an identity.
4. A manifest names how the project powers the builder through `relationships[].kind`: `external-executable`, `direct-dependency`, `selected-skill-guidance`, `adapted-method`, `copied-code`, `template-or-asset`, or `remote-service`. The kind decides whether code executes, which notice travels, what an upgrade can break, and whether a business worker ever sees the project.
5. Upstream guidance is subordinate. The mandate, then the selected recipe, then the capability contract, then the selected provider outrank an adopted project's README, `SKILL.md`, or agent files. Upstream guidance cannot add a business requirement, widen provider permissions, install tooling, change provider selection or business state, override evidence requirements, redefine completion, publish, or spend.
6. Availability is not selection. Selection is not activation. Activation is not execution. Execution is not acceptance.
7. Upstream latest is not the reviewed baseline. The reviewed baseline is not the supported range. The supported range is not a workspace pin. The workspace pin is not the executable observed on the host. Keep each fact in its own field.
8. Credits and notices are generated from manifests. Do not hand-edit `ACKNOWLEDGMENTS.md` or `THIRD_PARTY_NOTICES.md`.
9. Change the architecture only when the new thing cannot be represented without changing ownership, authority, dependency direction, a public contract, or a migration guarantee. Ask where the project fits before asking how to redesign the builder for it.

## Agent documentation

Agent-facing files fall into three classes. Do not add a fourth.

- Canonical authored: this file, `SKILL.md`, the two routers under `agents/skills/`, and the workspace `AGENTS.md` template under `surfaces/workspace-template/repo-agent-entrypoints/`.
- Thin adapters: `CLAUDE.md`, the template `CLAUDE.md`, and the template Cursor rule. Each says "Read `AGENTS.md` first" and adds only host-specific invocation notes. It never restates a canonical section.
- Generated: operation lists, MCP tool lists, CLI help, the public reference, workflow IDs, the version, credits, and support reports come from contracts, the catalog, and the manifests. Render them. Do not type them.

A workspace-facing file may name public operations, workspace contracts, selected providers, accepted recipes, and evidence requirements. It never names an `ARCH-xx` rule, a roadmap unit, a repository path, an upstream-maintenance procedure, or contributor machinery. `npm run check:agent-entrypoints` enforces the adapter and workspace rules.

## Focused checks

Run checks that match the change. Start with:

```bash
npm ci
node entrypoints/cli/b2c.mjs --help
node entrypoints/cli/b2c.mjs doctor
npm run validate:skill
npm run check:catalog
```

Use focused validators while iterating. Run the larger audit suites when a runtime, catalog, reducer, provider, security, or release contract changes.

The primary agent owns integration, Git, external systems, destructive actions, releases, and final verification. Subagents receive explicit file ownership and do not perform those actions.

## Learned User Preferences

- Keep Planes in timeout until the founder reopens it. Live work uses this checkout's `b2c-app-builder` MCP, CLI, and skill.
- Treat the agent graph as an ordered map of the work, not a second knowledge graph.

## Mobile app operation routing

Treat app launch, inspection, interaction, screenshots, and recordings as a
provider-neutral capability for product work, verification, and marketing capture.
Honor explicit bindings. Otherwise prefer native tools already exposed by the
current host when they cover the task and target. Use MobAI or another provider
for requirements they cannot cover. Inspect actual support and preserve required
evidence. A capture is not automatically acceptance or finished marketing creative.
Keep vendor checks on their selected adapters. Follow ARCH-04/ARCH-09/ARCH-11 and
roadmap U26. Do not add a parallel device router or evidence store.

## Latest-model operating guidance

The following guidance keeps the agent effective with current OpenAI models,
including GPT-6 Astra. It supplements the safety, authorization, and user-
approval boundaries in this file; it does not override them.

- Infer intent and follow through on authorized, reversible work within scope.
  Complete necessary checks instead of stopping at acknowledgement or a plan.
- Before asking a clarifying question, make the authorized result concrete and
  reviewable. Reserve required approval for the final step after preparation.
- The user's instructions take precedence over skill guidance. If a skill causes
  a pause or divergence, identify the exact `SKILL.md` and relevant instruction.
- Delegate parallelizable work when it can save time or improve quality.
- Run checks appropriate to the change; broaden testing only when new changes,
  failures, or unresolved concerns justify it.
- Lead with the main point. Use concise paragraphs, plain language, active
  voice, precise verbs, and technical detail that helps comprehension.
