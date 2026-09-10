# Contributing

B2C App Builder gives agents primitives for building and operating consumer-app
businesses. A contribution earns its place by making the workflows, knowledge,
execution, or evidence more useful for that job.

Start with the [documentation index](docs/README.md), the
[extension guide](docs/guides/extend-the-system.md), and the
[public interface](docs/public-interface.md).

## Start

Use Node.js 24.

```bash
npm ci
```

Read these files before editing:

1. `README.md`
2. `AGENTS.md`
3. `SKILL.md`, or the contributor or maintainer router that `AGENTS.md` names for your scope
4. `docs/guides/runtime-package.md`
5. The source and focused tests for your change

Edit the repository source. Do not edit an installed skill copy.

## Public contract

The `b2c/v1` contract is designed independently of current internals. Preserve
supported requests while changing adapters. Run `npm run test:public-api` and
`npm run check:public-api` for facade changes. Update the README, agent guides,
skill, CLI and MCP descriptions, examples, and generated schemas together.

Declared support, executable implementation, configuration, authority, and
verified business readiness are separate facts. Do not let one stand in for
another.

## Architecture-sensitive changes

Read the [north-star architecture](docs/north-star-architecture.md) and the
assigned unit in the [migration roadmap](docs/plans/2026-09-04-1747-refactor-consumer-business-primitives-plan.md).
Use the [conformance protocol](docs/architecture-conformance.md) for file
ownership, independent review, exceptions, and evidence. In the change
description, cite the ARCH rules, the unit, and the proof of conformance.

The public extension path is still under construction. First-party and community
implementations must pass the same contracts and external package tests. Do not
add a global vendor condition or a parallel runtime to work around an incomplete
boundary. Propose a bounded migration at the existing owner instead.

## Adopt an external source

A post, repository, skill, library, tool, or managed provider enters the builder
through the contribution lifecycle in
[Adopt external sources](docs/guides/adopt-external-sources.md). Inspect the
source as untrusted data, map its useful units to dispositions, record rights
and provenance, and keep the result a draft until review. `b2c contribute check`
and `b2c contribute preview` validate the draft. Upstream relationships live in
`catalog/upstreams/` and credits are generated with `npm run render:credits`.
When an accepted unit reuses repository material, propose its manifest with the
contribution; `check` refuses acceptance without one. After release, maintenance
owns that manifest.
[ADR-0005](docs/decisions/0005-source-adoption-and-upstream-maintenance.md)
records the boundary and
[ADR-0007](docs/decisions/0007-upstream-lifecycle-and-agent-scopes.md) records
the lifecycle handoff. A wrap that implements a canonical operation continues
through [provider integrations](docs/guides/provider-integrations.md) on the
maintainer router after rights review.

## Keep the product focused

In-scope work improves consumer-app research, product definition, experience
design, engineering, store readiness, growth, revenue, analytics, trust, or
operations.

Do not add a generic workflow system, B2B guidance, or internal-tool doctrine.
Keep the skill thin. Put durable expertise in `knowledge/`. Put repeatable
decisions and ordering in `catalog/`.

Write each knowledge document for one narrow decision, with a narrow `load_when`.
Gloaguen et al. (2026) found that non-essential context files raised inference
cost over 20 percent on average and did not improve task success
([arXiv:2602.11988](https://arxiv.org/abs/2602.11988)).

## Make a change

- Preserve stable workflow and reference IDs unless the contract changes.
- Edit catalog definitions before generated projections.
- Add or update a focused validator when behavior changes.
- Keep secrets, provider exports, personal data, and app workspace output out of Git.
- Refresh official documentation before changing guidance for a fast-moving provider or store.
- Preserve unrelated working-tree changes.

## Versioning

A runtime change updates:

- `skill-version.json`
- the root `package.json` version
- the lockfile root record
- the generated stamps, via `npm run render:all` and `npm run render:evidence-schema-version`

Hosted Worker packages version independently. `README.md`, `AGENTS.md`,
`CLAUDE.md`, `CONTRIBUTING.md`, and `docs/` are repository-only
paths and need no version bump.

Use a valid semantic version. Set `updatedAt` to the change date. Keep release
notes short and specific to the current version.

## Releasing to npm

[`.github/workflows/publish.yml`](.github/workflows/publish.yml) publishes the
package when a GitHub release is published. The release tag must be
`v<version>` and match `package.json` and `skill-version.json`. Authentication
is npm trusted publishing, so no npm token lives in this repository or in
Actions secrets.

```bash
gh release create "v$(node -p 'require("./package.json").version')" --generate-notes
```

The first version of a package cannot use trusted publishing. Publish it once
from a maintainer machine, then register the trusted publisher on npmjs.com
under the package settings: owner `Clueless-Creations`, repository
`b2c-app-builder`, workflow `publish.yml`.

## Checks

GitHub Actions on ordinary pull requests and pushes to `main` runs **presubmit**,
not the full audit. A green presubmit is not a full-audit pass. Full
verification still exists; it is explicit.

```text
Every change:
  npm ci
  npm run audit:ci -- --lane presubmit

Matches the change (focused, while iterating):
  npm run validate:skill          # local only; paste on the PR
  npm run check:catalog           # catalog / knowledge
  b2c contribute check --target … # contribution drafts
  npm run hosted:check            # hosted/knowledge-mcp, or files it bundles
  npm run app:check              # hosted/builder-console

Checkpoint and final verification (same as workflow_dispatch verification=full):
  npm run audit:ci               # every audit-plan step except validate:skill
  npm run hosted:check
  npm run app:check
```

`npm run audit:ci -- --lane fast` is the historical cheap pool (every non-serial
gate). It is not the ordinary PR gate. CI runs it only during full verification,
together with the heavy shards (`test:validators`, `test:fixtures`,
`test:boundaries`, `test:parity`, `check:engine-e2e`).

Trigger full CI with:

```bash
gh workflow run ci.yml --ref "$(git branch --show-current)" -f verification=full
```

Ordinary pushes cancel the previous ordinary run for the same pull request or
`main` branch. An explicit full run uses a separate concurrency group so a later
ordinary push cannot cancel it. `publish.yml` stays release-gated and does not
cancel in progress.

CI jobs (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- `presubmit`: measured allow-list (typecheck, lint, catalog/public-API/boundary
  gates, generation consistency, version discipline with enough git history).
  Extra domain checks join this job when the change reaches them (`test:boundaries`
  on kernel/contracts/adapters, `test:public-api` on contracts/entrypoints, security
  gates on the trust validators).
- `audit-fast` / `audit-heavy`: full verification only, or when the Scope job
  fails so coverage cannot be deferred safely.
- `hosted-check` / `app-check`: when the change reaches that Worker or a file it
  actually imports (generated catalog, knowledge bundles, shared contracts,
  root lockfile). Unknown scope expands these jobs.
- `ci-complete`: requires selected jobs. Intentionally deferred jobs are
  skipped, not green. Cancelled or unexpectedly missing jobs fail. The log
  says when the run was presubmit-only.

CI never runs `validate:skill`. It needs a local Python tool the runner lacks.
Record that result, and anything else CI does not reach, in the pull request.

Do not use `[skip ci]`, `continue-on-error`, or an admin merge switch to hide a
failed or deferred suite.

## Pull requests

Keep one concern per pull request. Explain:

- what changed
- why it improves B2C App Builder
- which files own the new contract
- which checks ran
- what remains unverified

Open a draft when feedback will help. Mark it ready when the focused evidence
supports the change.

## Generated files

Do not hand-edit generated catalog projections. Use the owning renderer and
include the generated diff.

When you change a workspace entrypoint, update the install source and the
reference business copy. Run the related entrypoint and continuity checks.

## Security

Report vulnerabilities through GitHub private vulnerability reporting. Do not
open a public issue for a security problem. See
[`.github/SECURITY.md`](.github/SECURITY.md) for scope.

## Official provider and skill contributions

Follow [the official agent-tooling adoption guide](docs/upstreams/official-agent-tooling.md). Accepting reusable repository material requires the existing upstream identity, exact reviewed baseline, source-specific notice coverage, and accurate generated acknowledgment. Record source-only changes as well as releases; do not auto-install or repin businesses. Run contribution checks, upstream checks, credits regeneration and the relevant behavioral tests before publishing support.

### Screenshot and capture upstreams

Follow [the screenshot toolchain adoption guide](docs/upstreams/screenshot-toolchain.md)
when adapting screenshot, ASO, preview or capture tools. Keep original captures,
editor composition, exported assets, store upload and acceptance evidence separate.
Use the source-specific notice for every covered license, including Apache-2.0;
MIT is not a default for every GitHub repository.

`npm run render:credits` also generates the
[upstream source coverage queue](docs/upstreams/coverage-report.md) from active,
bound knowledge declarations. Review gaps before adopting or crediting them.
`check:credits` detects stale projections. The scan is bounded and does not
replace package or native dependency review, install tools, or enable automatic
updates. New source commits still require a normal reviewed contribution.
