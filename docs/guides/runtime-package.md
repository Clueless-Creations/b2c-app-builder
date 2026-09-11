# B2C App Builder Runtime

This package powers the `b2c` CLI, the `b2c-app-builder` MCP server, and the `b2c-app-builder` routing skill. The target is a toolkit of consumer-business capabilities, replaceable operation providers, configurable recipes, and evidence.

It turns a consumer-app goal into a bounded workflow. It loads the required references. It plans app workspace state and supports verification through the CLI. MCP verification runs only in explicit write mode.

## Public contract

Use `b2c catalog --json` or `b2c_discover` to discover primitives. Use
`b2c compose --config b2c.yaml --json` or `b2c_compose` to preview a composition.
Use `b2c business-status --workspace <registered-id> --json` or
`b2c_business_status` to read lifecycle and work counts.
They share `b2c/v1` inputs, results, errors, and support semantics. The
[generated reference](../../contracts/public-api/REFERENCE.md) ships with this
package. A declaration preview is not an applied composition or provider proof.
Use `b2c package-import`, `b2c composition-plan`, and
`b2c composition-activate` for verified local extension packages and recoverable
workspace activation. Their write operations are CLI-only. See
[composition activation](composition-activation.md) for exact inputs and recovery.
Fresh bootstrap requires accepted `product.yaml` and its exact rendered
`PRODUCT.md`. It activates the complete-business default through the recoverable
initializer. Changes to an installed recipe use composition activation. The
shipped worker routes use the selected trusted host runtime; imported manifests
cannot install executable code.

The commands below describe workspace execution. Its raw payloads and
internal files are not the stable business API. Source-checkout documentation
starts at `docs/README.md`.

Onboarding progress uses accepted run state. Before the first run, status shows
planned work and zero completed steps. Existing or copied output files do not
establish completion. Folder planning reads the verified shipped catalog package.

Mobile app operation is shared across exploration, functional and design checks,
and screenshot and video capture. The `b2c/mobile-app-capture` declaration
defaults to host-native tools. Actual availability is checked only at execution.
MobAI and other providers serve explicit selections or required coverage. Raw
captures, acceptance evidence, and finished marketing assets remain separate. The
Route Ladder implements host-native selection. See the
[mobile app operation guide](mobile-app-operation.md).

## Package surfaces

The repository root is the package root. Top-level directories name the
north-star layers in dependency order. `contracts` imports nothing internal.
`kernel` and `catalog` import `contracts`. `adapters` import those. `entrypoints`
and `hosted` import services, never adapters directly. `knowledge`, `surfaces`,
and `examples` are data and import no runtime. `checks` and `tooling` may import
anything, and nothing imports `checks`.

| Path                    | Role                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md`, `agents/`   | Skill entrypoint and Codex routing metadata                                                                                                                                                                      |
| `entrypoints/cli/`      | CLI entrypoint (`b2c.mjs`)                                                                                                                                                                                       |
| `entrypoints/mcp/`      | MCP entrypoint (`b2c-app-builder-mcp.mjs`, `server.ts`)                                                                                                                                                          |
| `contracts/public-api/` | Public `b2c/v1` schemas and operation declarations                                                                                                                                                               |
| `kernel/`               | Execution kernel and shared application services: `engine/`, `reducer/`, `session/`, `work-orders/`, `operating-model/`, `autonomy/`, `context/`, `routing/`, `knowledge-service/`, `schema/`, `lib/`            |
| `catalog/`              | Stable workflows, domains, gates, reference bindings, world ontology, and agent-graph overlay                                                                                                                    |
| `knowledge/`            | Source-backed consumer-app guidance                                                                                                                                                                              |
| `adapters/`             | Selected worker and provider adapters, including `app-review/`                                                                                                                                                   |
| `surfaces/`             | App, web, and design surfaces the runtime installs or renders: `starters/`, `ui-library/`, `workspace-template/`, `surfaces/studio/seed/schema/`                                                                 |
| `hosted/`               | The two separately deployed Cloudflare Workers: `knowledge-mcp/` (MCP/HTTP knowledge service) and `builder-console/` (the builder's own optional hosted App Worker and console; not a local engine prerequisite) |
| `examples/`             | Reference businesses: `examples/workspace/business/` and `tuck/`                                                                                                                                                 |
| `checks/`               | Deterministic validators (`validation/`) and behavioral verification (`verification/`)                                                                                                                           |
| `tooling/`              | Renderers, audit runner, maintenance scripts                                                                                                                                                                     |

## Install

Use Node.js 24. From npm:

```bash
npm install -g b2c-app-builder
b2c setup
b2c inspect
```

From a source checkout, at the repository root:

```bash
npm ci
npm run setup
b2c inspect
```

Setup creates `~/.b2c-app-builder/workspaces.json` and prints the MCP registration commands. It does not create an app workspace, add credentials, deploy a service, spend money, or submit an app.

A packed install launches compiled ESM from `dist/` and does not need `tsx`. A source checkout runs `npm run build` (also via `prepack`) or falls back to `tsx` until that build exists.

## CLI

```bash
b2c --help
b2c inspect
b2c business-create --workspace my-app --directory ./my-app --name "Working name" --hypothesis "A short product hypothesis" --mandate-file ./brief.md --json
b2c business-plan --workspace my-app --json
```

`b2c inspect` checks the builder installation and records a sanitized local host
observation. `b2c doctor` is a supported equivalent. Neither installs tools or
approves a release.

## Find a command

`b2c --help` groups commands by task. It is generated from the CLI command
registry in `entrypoints/cli/help.mjs`. Do not keep a second command table here.
Summaries wrap at 80 columns. Command names stay complete and searchable.

- Prepare the kitchen: `setup`, `inspect`, `workspaces`, `list`. `doctor` stays
  supported.
- Build and run a business: `business-create` through `business-recover` are the
  normal supported path. `new`, `bootstrap`, `status`, `plan`, `run`, and
  `schedule` remain supported session controls. They are not aliases of the
  `business-*` commands.
- Review at the pass: evidence, named gates, device and browser proof, and
  authority commands. The heading does not grant approval.
- Maintain and extend: catalog, composition, and contribution. A declaration
  preview is not activation.

Create uses an absent or empty directory and registers it as part of the same
operation. Do not pre-register it or write files into it. Use `--workspace` on
the CLI; `workspaceId` is the JSON field. Direct `--mandate` is for short requests.
`--mandate-file` preserves a complete founder brief in `operations/FOUNDER_BRIEF.md`.

Research first. After explicit acceptance, set product status to `accepted` in
`product.yaml` and render `PRODUCT.md` with `b2c render-product --workspace my-app`.
Read `b2c business-plan --workspace my-app --json`, then initialize with
`b2c business-initialize --workspace my-app --revision <revision-from-plan> --json`.
Initialization grants no work authority. Record approved authority with `b2c onboard`
and inspect the current plan before a bounded `business-run`. Initialized plan results
include hold classification, bounded ready briefs, and the current founder question.

Resume an existing registered workspace. Use `b2c workspaces register <id> <path>`
only for an existing unregistered scaffold. The legacy `b2c new` and `b2c bootstrap`
commands remain supported for explicit scaffold and runtime maintenance. An existing
app needs inspection before installing workspace files; a focused change needs no
full runtime. See [creation recovery](../../contracts/public-api/REFERENCE.md#creation-recovery)
for occupied targets and conflicting registrations.

The CLI is the preferred write surface. Provider and release actions require
their own authority checks.

New app workspaces include only the day-zero product, design, research, route, and
agent files. Later workflows create their artifacts when they become relevant.
For a focused change to an existing app, use the relevant knowledge workflow and
normal app verification. Do not install the full operating graph.

Root `PRODUCT.md` and `DESIGN.md` work with Claude, Codex, Cursor, and other coding
agents. Author product facts in `product.yaml` and render `PRODUCT.md`, the
readable product index. `DESIGN.md` is the authored visual system and design
routing index. It links detailed files under `design/flows/`, `design/screens/`,
and `design/components/`. Select the native stack through
`design/platforms/<stack>.json`. Shared contracts stay platform-neutral. Native
adapters can target SwiftUI, Expo or React Native, Flutter, or another stack. An
adapter claims parity only where an implementation exists. The package includes a
SwiftUI reference adapter and claims no others.

The Design Room is generated from the current contract and structured routes. It is a read-only review page. Git owns revisions.

## Complete design loop

One founder mandate carries design through research, production, implementation,
proof, critique, and bounded repair. Freeze reference packs and product-specific
rubrics before the Design Room produces a direction. Preserve at least three
developed concepts in `DESIGN.md`, with their reference mappings and their native,
mobile-web, and desktop-web treatments. The generated room exposes the choice and
the rejection rationale. The isolated design-system audit then judges that direction
with authority captured for its exact dispatch. Implement the accepted identity
in both the native app and responsive landing page. Produce current machine-bound
captures and interaction receipts. Run the implementation craft audit against
every required surface, state, locale, and criterion.

A valid product finding returns to its owning producer. The repair requires new proof and a fresh audit. Missing, malformed, stale, changed, or misbound audit evidence consumes only the audit's own attempt budget. Passing a schema or visual grader never substitutes for the independent judgment. Store submission and production release keep their separate founder boundary.

Signed design decisions use an external public-key trust store. Preview and install
it from the founder-controlled process before the first run that consumes design authority:

```bash
b2c founder-key install --public-key-file /absolute/path/founder-public-key.txt
b2c founder-key install --public-key-file /absolute/path/founder-public-key.txt --apply
```

The input is canonical unpadded base64url SPKI DER text for an Ed25519 public key. The private key never enters the repository, trust store, session, or worker environment. Install or maintain the store only as its founder-controlled owner. Run the autonomous session and signed-receipt consumer as the workspace-control owner. That separate OS identity can read the public store but cannot modify its directory. Set `B2C_APP_BUILDER_FOUNDER_TRUST_FILE` only to an absolute launcher-controlled override.

## MCP

Register the absolute Node command and the `entrypoints/mcp/b2c-app-builder-mcp.mjs` path that `b2c setup` prints, under the name `b2c-local`. Without a local install, register the portable form instead: command `npx`, arguments `-y b2c-app-builder`. The transport is stdio. Hosted knowledge uses `b2c-hosted`. A leftover `b2c-app-builder` client name is the legacy local registration.

### Leftover names

The leftover client name is not a capability. The handshake receipt decides local execution versus hosted knowledge. Handshake instructions, local plan routing, and hosted discovery take capability from that receipt, including a leftover name that points at hosted knowledge. A local workspace planning or execution tool name on hosted knowledge fails as `wrong_surface` with that same receipt reading.

| Client | Fresh local | Leftover name still in config | Hosted |
| --- | --- | --- | --- |
| Claude Code | `claude mcp add --scope user b2c-local --` | existing Claude user-scope name `b2c-app-builder` | `claude mcp add --transport http b2c-hosted` |
| Cursor | `"b2c-local"` in `~/.cursor/mcp.json` | existing Cursor `mcpServers` key `"b2c-app-builder"` | `"b2c-hosted"` URL entry |
| Codex | `[mcp_servers.b2c-local]` | existing Codex table `[mcp_servers.b2c-app-builder]` | `codex mcp add b2c-hosted --url` |

Setup never edits those files. Rename a leftover local entry to `b2c-local`, or a leftover hosted entry to `b2c-hosted`, only when you choose to. `b2c-local` and `b2c-hosted` may exist in one client. Do not register hosted knowledge under the leftover name.

The default server exposes public discovery and composition preview plus workspace catalog, workflow, knowledge, status, plan, and operation preview and replay tools. Registered-workspace planning can run read-only provider prerequisite probes. The server resolves workspaces only through `~/.b2c-app-builder/workspaces.json`.

Set `B2C_APP_BUILDER_MCP_WRITE=1` only for an explicitly approved local write session. It adds bootstrap, run, approvals, verify, and schedule tools and permits gated operate commits. Keep the CLI as the normal write path.

## Maintain the package

- Edit workflow definitions before generated projections.
- Put durable expert guidance in manifest-backed `knowledge/` and bind it through the catalog. Keep workflow order in `catalog/`.
- Do not add a second router, catalog, knowledge store, planner, or state store.
- Keep `SKILL.md` small.
- Preserve stable workflow and reference IDs.
- Change reducer-owned state only through `kernel/reducer/`.
- Keep versions aligned across package manifests, lockfiles, generated catalog output, and `skill-version.json`.
- Before you widen a `knowledgeBundle` default or a skill auto-trigger, check per-skill cost in `/usage` over the last 7 days. Compare it with how often matched tasks used the bundle. Record the date and the verdict. (Source: https://code.claude.com/docs/en/costs.)

Focused checks:

```bash
npm run validate:skill
npm run check:catalog
npm run check:package-parity
npm run test:fixtures
```

Run broader checks when the affected contract requires them.

When changing the Chrome browser-proof adapter, run `npm run test:browser-proof-chrome` on a host with Chrome installed. This optional check serves a local page and exercises the real observer, including screenshots, typed interactions, resource retention and refusal cases. It does not download a browser. Injected fixture observers remain useful for deterministic contract checks; the Chrome check covers the production adapter. A successful observer check does not establish an accepted engine workflow or deployment.

## Interrupted public requests

`business-recover` closes a pending public request after its session and effects
are reconciled. Supply the registered workspace ID, request ID, and current
revision. It uses the existing session owner and locks, dispatches no work, and
changes no accepted artifacts. It refuses unresolved effects and active work.
Replay the original run request to read its terminal receipt; use a new request
ID and current revision for subsequent work. See the public lifecycle contract
for the exact recovery schema.
