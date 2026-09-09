# Build one complete consumer business

The workflow runtime is available through the CLI and MCP. These commands
do not apply `b2c.yaml`. The public v1 composition service separates declaration discovery from
verified installed-package planning and activation. See the [interface contract](../public-interface.md).

## Product workflow

Product work follows one short chain:

1. Capture evidence in `strategy/RESEARCH.md`.
2. Define the accepted promise, user, problem, wedge, core loop, shippable boundary,
   requirements, metrics, risks, and decisions in `product.yaml`. Render `PRODUCT.md`
   from it with `b2c render-product --workspace <id-or-path>`.
3. Route detailed journey, copy, analytics, implementation, revenue, store, and
   trust work from the links in `PRODUCT.md`.
4. Use `b2c status` and `b2c plan` for execution state. Humans and ordinary agents
   never parse reducer files.

Git records product revisions. There is no separate product revision store.

## Design workflow

Each app workspace has one design authority: root `DESIGN.md`. It describes the
product experience, visual system, tokens, component policy, and implementation
rules. It links to detailed screen and flow plans when those files add useful detail.

One mandate owns the complete design loop:

1. Research the category. Freeze product-specific reference packs and rubrics before production.
2. Explore three distinct directions. Define flows, every screen and state, copy, objects, motion, and responsive composition in `DESIGN.md`.
3. Run a fresh-context design-system audit. Its signed authority is captured from the protected founder trust store before dispatch. Failed direction work returns to the Design Room without another founder prompt.
4. Implement the accepted system in the native app and the desktop and mobile landing page. Share one identity with platform-specific composition.
5. Produce machine-bound runtime captures and interaction receipts. Run the independent craft audit against every required surface, state, locale, and frozen criterion.
6. Repair the responsible producer. Repeat production, proof, and review until the mechanical gates and the independent judgment both pass. Missing or corrupt audit evidence retries only the audit.

Shared component contracts are platform-neutral. An app maps them to its stack in
`design/platforms/<stack>.json`. Stack IDs are open strings, so one model serves
SwiftUI, Expo or React Native, Flutter, and future stacks. An absent adapter means
the component is not implemented on that stack. The bundled reference adapter
covers SwiftUI only.

The Design Room is one generated, read-only review page. It presents the current
system, flows, screens, components, and implementation maturity. It never owns
design decisions. Git owns revisions.

## Start paths

The agent selects one start path from the request. Users do not need to learn the
catalog or prepare a state file first.

| Starting point               | First path                                                                                                                                                                                             | Durable runtime                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Existing app, focused change | Inspect the affected surface, load one matching workflow, make the bounded change, and run focused proof.                                                                                              | Not required.                                                       |
| Existing app, overhaul       | Inventory the working app. Define the target in `product.yaml` and `DESIGN.md`, render `PRODUCT.md`, then rebuild in verified slices.                                                                  | Use it when the overhaul needs multi-session planning or approvals. |
| Idea supplied                | Record the hypothesis, research it, and ask for Go, Pivot, or Kill before product and design harden.                                                                                                   | Optional after the direction is accepted.                           |
| No idea, delegated build     | Research several opportunities, choose the strongest safe candidate under the opening mandate, then build and test it locally.                                                                         | Optional after opportunity selection.                               |
| Full launch program          | Load `workflow.orchestration.full-launch-program`. It records the mandate. The graph then sequences reference packs, producers, fresh-context auditors, and closeout gates to Submit-for-Review ready. | Required.                                                           |

A delegated build may choose the working name, product scope, stack, design, and
local implementation. It still pauses for credentials, spend, legal or pricing
decisions, public actions, destructive work, store submission, and production release.

## Knowledge tools

- `b2c_catalog`: browse the consumer-app workflows.
- `b2c_workflow`: load one workflow and its reference list.
- `b2c_knowledge_search`: search the expert library.
- `b2c_knowledge_get`: retrieve one versioned reference with provenance.

The local MCP and the hosted service both expose these tools. The hosted service
never resolves or changes local workspaces.

## Local workspace tools

- `b2c_status`: inspect a registered workspace.
- `b2c_plan`: compute the next bounded work for a registered workspace.
- `b2c_operate`: preview or replay an operation. It commits only in explicit write mode after its gates pass.

MCP resolves workspaces through the local registry only. The CLI may take an
explicit path. Registration gives a workspace a stable ID and makes it visible to MCP.

## Create a planning workspace

For a new complete business, create and register the planning workspace together:

```bash
b2c business-create --workspace my-app --directory ./my-app --name "Working name" --hypothesis "A short product hypothesis" --mandate "The full user request" --json
b2c business-plan --workspace my-app --json
```

The target must be absent or empty. Do not register it or add agent instructions
before creation. The command creates the planning scaffold and records the mandate
in `operations/LAUNCH_PROGRAM.md`. The CLI uses `--workspace`; the JSON schema
calls that field `workspaceId`.

Research the hypothesis. After explicit product acceptance, record it in
`product.yaml`, render `PRODUCT.md`, and read a fresh revision before initialization:

```bash
b2c render-product --workspace my-app
b2c business-plan --workspace my-app --json
b2c business-initialize --workspace my-app --revision <revision-from-plan> --json
```

Initialization grants no work authority. Use
`b2c onboard --workspace my-app --answers answers.json`
to record approved authority, then inspect `business-plan`
again before a bounded `business-run`. The plan names why work is held (`holdKind` and
bounded `detail`), includes a bounded brief on each ready item, and may include one
founder question bound to that revision. It does not grant authority.

For an existing registered workspace, resume with `business-plan`. For an existing
unregistered scaffold, use `b2c workspaces register <id> <path>`; registration does
not create its product or runtime files. Inspect an existing app before installing
workspace files and preserve its implementation. Focused changes need no runtime.

The supported legacy `b2c new` and `b2c bootstrap` commands remain available for
explicit scaffold and runtime maintenance. Use `business-create` for a new complete
business. See [creation recovery](../../contracts/public-api/REFERENCE.md#creation-recovery)
when an older attempt left a registration or occupied target.

The answers file names the business slug, a founder contact email, and a grant
level (`review-first`, `run-with-guardrails`, or `full`) per business unit
(`Product`, `Design`, `Engineering`, `Growth`, `Analytics`, `Revenue`, `Store`,
`Trust`, `Operations`). Invalid answers list the accepted values.

## Worker runtime and failed attempts

A session dispatches work to the first available agent CLI in the order `codex`,
`claude`, `cursor-agent`. `b2c doctor` lists the CLIs it found. Set
`B2C_APP_BUILDER_WORKER_RUNTIME=claude` (or `codex`, `cursor`) to select one
explicitly; an unknown value stops the session before dispatch. A CLI that
starts but cannot authenticate or run its configured model fails every attempt
until the host fixes it.

When an attempt fails, `b2c plan --workspace <id-or-path>` prints the sanitized
last error under the held step, and `b2c business-evidence` reports
`attempt.failed` plus one classified reason (`worker.runtime_unavailable`,
`worker.exited`, `worker.timeout`, `worker.output_missing`,
`worker.scope_violation`, `worker.receipt_rejected`, or `attempt.error`). Raw
worker output stays in run state.

Run `b2c --help` for the complete command list.

## Design acceptance

One founder mandate includes internal design production, independent review, and
repair. The design-system audit checks the direction before implementation. A
signed opening-mandate receipt may delegate that taste decision once for the
current run. The engine verifies the receipt against an external public-key trust
store. It binds that store and the workspace to the run before dispatch. It
captures the decision for the exact audit attempt, so the reviewer cannot grant
itself authority. A direct founder verdict binds the exact `DESIGN.md` candidate
instead. The implemented craft audit checks the native app and the landing page
against frozen reference rubrics. `check:design-acceptance` verifies complete
surface and state coverage. It binds captures, interactions, source files, and the
engine-issued reviewer identity to the current candidate.

Install the founder's Ed25519 public key before a run that may consume signed
design decisions. The key file holds canonical unpadded base64url SPKI DER text.
Preview first, then apply from the founder-controlled process:

```bash
b2c founder-key install --public-key-file /absolute/path/founder-public-key.txt
b2c founder-key install --public-key-file /absolute/path/founder-public-key.txt --apply
```

The trust store holds a public key only. Keep the private signing key outside the
workspace and every worker environment. An autonomous session runs under an OS
identity that can read the trust store but cannot create, replace, or rename files
in its directory. The founder approval process runs as the owner of the trust store
and workspace control. `B2C_APP_BUILDER_FOUNDER_TRUST_FILE` may select an absolute
launcher-controlled store path. Raw public-key environment values are ignored.

The [graph and craft audit](../research/2026-09-04-graph-and-craft-audit.md)
explains the researched principles and baseline gaps. Runtime guidance lives in
manifest-backed design knowledge. Evidence checks support independent visual
judgment. Passing schemas alone does not establish exceptional design.
