# 0002 — Repository layout follows the north-star layers

- **Status:** accepted
- **Date:** 2026-09-04
- **Steward:** architecture steward session of 2026-09-04 (Claude Code), on a direct founder instruction to bring the repository into this shape
- **Affected rules and contracts:** ARCH-02, ARCH-05, ARCH-06, ARCH-09, ARCH-15; the north-star "Repository layout" section (new) and "Current gap map" path base; every roadmap unit's Files list (paths only); the dispatch board shared-path matrix; `docs/architecture.md` "Source layers" and "Repository layout"; `check:repository-boundary`; `tooling/ci-lane.mjs`
- **Affected units:** U1–U26 (path citations only); U4, U5, U9 (own Move 2); U14, U17 (need `examples/`); U15, U24 (entrypoint documents)

## Context and evidence

The repository still has the shape of a single skill. Everything lives under
`skill/b2c-app-builder/`, and the repository root is a shell around that nested
package: root `package.json` carries 167 scripts and 165 of them shell out to the
nested package, which has its own manifest, lockfile, and 163 scripts. Two
`npm ci` runs, two lockfiles, and a `check:package-parity` validator exist only
to keep the two manifests aligned.

The skill itself is two files: `SKILL.md` and `agents/openai.yaml`. The other
1,500 tracked files are the runtime, the catalog, the knowledge corpus, checks,
starters, and two Cloudflare Workers. The north-star diagram has eleven logical
boxes; the tree expresses roughly two of them.

Specific observations on main `e8d4935`:

- `skill/b2c-app-builder/core/` has twenty subdirectories. The execution kernel
  (`engine/`, `reducer/`, `session/`) sits beside two separately deployed Workers
  with their own manifests (`core/app/package.json`, `core/hosted/package.json`),
  the `b2c/v1` facade (`core/public-api/`), and three one-file directories
  (`core/mcp/`, `core/lib/`, `core/shared/`). The gap map already records that
  "optional hosted builder-console code can be mistaken for reusable app
  infrastructure" (`docs/north-star-architecture.md:497`).
- The three confirmed ARCH-02 dependency-direction violations are all runtime
  code importing `validation/business/` modules
  (`core/session/executor.ts:12`, `core/adapters/appkittie-category-revenue.ts:24`,
  `catalog/repository-profiles/compile.ts:2`). A layer rule over top-level
  directory prefixes rejects these by position; today U1 must name each file.
- `validation/repository/check-repository-boundary.ts:31-45` allowlists top-level
  entries that no longer exist (`plans/`, `design-lab/`, `STRATEGY.md`, a
  `business/` skill directory, a `platform/` special case). It froze a layout, not
  an architecture. Its error text requires "an architecture update" to change it.
- Two reference businesses live in two unrelated places:
  `workspace/business/` and `verification/examples/tuck/`.
- The roadmap requires a top-level `examples/` directory for U14 and U17
  (`docs/plans/2026-09-04-1747-refactor-consumer-business-primitives-plan.md:789-933`);
  the boundary allowlist does not permit it.
- The north-star says "current directories, commands, and internal types are not
  constraints on the target" (`docs/north-star-architecture.md:52`) but names no
  target layout, so every unit files new work into the previous tree. The dispatch
  board's shared-file rule forbids "a rename or restructure" during the wave
  (`docs/plans/2026-09-05-architecture-dispatch-board.md:32`), and issue #103 tells
  U15 to escalate any physical relocation. No unit owns the move. ARCH-15 makes it
  a steward decision.

## Alternatives

1. **Keep the nesting and document it.** Rejected. It leaves the double package,
   keeps every new unit filing into previous paths, and keeps the boundary validator
   as the only description of the layout.
2. **Split into an npm-workspaces monorepo** (`packages/kernel`, `packages/cli`,
   `packages/contracts`, and so on). Rejected for now. The north-star says to start
   as a local modular application and that a deployment boundary needs a measured
   reason (`docs/north-star-architecture.md:52-56`). The audit plan, `npm link`
   setup, `runtime:sync`, and 160-plus scripts assume one package. A publishable
   contracts package can be split later when U14's external-package proof needs
   it; nothing in this decision prevents that.
3. **One package with layered top-level directories.** Accepted. The directory
   tree names the north-star layers in dependency order, so the layout itself
   becomes the cheapest enforcement ARCH-15 has.
4. **Skill router under `entrypoints/skill/` versus the repository root.** Root
   accepted. Agent hosts address a skill by the directory that holds `SKILL.md`,
   and Codex reads `agents/openai.yaml` beside it. The install model identifies a
   runtime by the directory that holds `skill-version.json`
   (`core/providers/runtime-pin.ts:54`, `core/session/doctor.ts:56`,
   `core/session/setup.ts:36-37`, `tooling/runtime-sync.ts`). Keeping the router
   and the version manifest at the package root preserves that model with one
   root instead of inventing a skill root and a runtime root that must find each
   other through symlinks.
5. **Rename `catalog/` to `composition/` and split first-party packages now.**
   Deferred to Move 2. `catalog/` still holds first-party packs, capabilities,
   providers, and knowledge manifests that U3–U5 and U9 move behind the
   external-package resolver. Renaming before that churns every in-flight unit
   for no boundary gain. The same applies to `knowledge/`, which becomes
   package-owned content under `packages/` once U9 proves package-relative
   resources.
6. **One big-bang move versus staged moves.** Staged. Move 1 (this record) lands
   between U1 and U2, the only moment when a single implementer is in flight on
   the serial chain. Move 2 is not a separate rename: it is the content
   relocation that U4, U5, and U9 already own.

## Decision

The repository root is the package root. The nested `skill/b2c-app-builder/`
directory and its separate manifest, lockfile, and TypeScript configuration are
removed. Top-level directories name the north-star layers and are the only
allowed source layers:

| Directory                              | North-star responsibility                                                                                  | Move 1 contents                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md`, `agents/`                  | Skill entrypoint (E)                                                                                       | The router and Codex skill metadata, unchanged                                                                                                      |
| `entrypoints/cli/`, `entrypoints/mcp/` | CLI and MCP entrypoints (E)                                                                                | `b2c.mjs`, `b2c-app-builder-mcp.mjs`, `server.ts`                                                                                                   |
| `contracts/`                           | Versioned public business contracts (V1) and shared logic below runtime and checks                         | `public-api/` (b2c/v1 registry, schemas, `REFERENCE.md`, examples)                                                                                  |
| `kernel/`                              | Execution kernel, evidence store, shared application services (S, X)                                       | `engine/`, `reducer/`, `session/`, `work-orders/`, `operating-model/`, `autonomy/`, `context/`, `routing/`, `knowledge-service/`, `schema/`, `lib/` |
| `catalog/`                             | Composition resolver and compiler plus, until Move 2, first-party definitions and generated pins (C, R, P) | unchanged contents                                                                                                                                  |
| `knowledge/`                           | First-party knowledge corpus (K source) until Move 2                                                       | unchanged contents                                                                                                                                  |
| `adapters/`                            | Selected worker and provider adapters (A)                                                                  | former `core/adapters/*` files, `providers/`, `provisioning/`, `app-review/`                                                                        |
| `surfaces/`                            | App, web, and design surfaces the runtime installs or renders (O)                                          | `starters/`, `ui-library/`, `workspace-template/`, `studio/`                                                                                        |
| `hosted/`                              | Separately deployed services                                                                               | `knowledge-mcp/` (was `core/hosted/`), `builder-console/` (was `core/app/`), `shared/geo.ts`                                                        |
| `examples/`                            | Reference businesses and, later, reference extension packages                                              | `workspace/` (was `workspace/`), `tuck/` (was `verification/examples/tuck/`)                                                                        |
| `checks/`                              | Observations and verification (V)                                                                          | `validation/` (deterministic), `verification/` (behavioral)                                                                                         |
| `tooling/`                             | Renderers, audit runner, maintenance                                                                       | unchanged contents                                                                                                                                  |
| `docs/`                                | Architecture, decisions, plans, guides                                                                     | unchanged, plus `guides/runtime-package.md` (was the nested `README.md`)                                                                            |

Dependency direction, top to bottom: `contracts` imports nothing internal.
`kernel` and `catalog` import `contracts`. `adapters` imports those. `entrypoints`
and `hosted` import services, never adapters directly. `knowledge`, `surfaces`,
and `examples` are data plus subordinate instructions and import no runtime.
`checks` and `tooling` may import anything; nothing imports `checks`. U1's
`check-architecture.ts` expresses this rule over top-level prefixes.

The north-star gains a "Repository layout" section that owns this table and the
direction rule. `docs/architecture.md` describes the same tree as current
mechanism. Paths in the north-star gap map, the roadmap, the dispatch board, and
the open unit issues are rewritten with the mapping below; unit IDs, acceptance
bars, and ARCH rules do not change.

## Compatibility and migration

No `b2c/v1` input, output, error code, tool name, or CLI command changes. The
generated reference moves from `skill/b2c-app-builder/core/public-api/REFERENCE.md`
to `contracts/public-api/REFERENCE.md` with identical content. Saved v1 fixtures
keep passing unchanged.

Path mapping, old to new, relative to the repository root:

| Old                                                                                                                                      | New                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `skill/b2c-app-builder/SKILL.md`, `agents/`                                                                                              | `SKILL.md`, `agents/`                     |
| `skill/b2c-app-builder/README.md`                                                                                                        | `docs/guides/runtime-package.md`          |
| `skill/b2c-app-builder/bin/b2c.mjs`                                                                                                      | `entrypoints/cli/b2c.mjs`                 |
| `skill/b2c-app-builder/bin/b2c-app-builder-mcp.mjs`                                                                                      | `entrypoints/mcp/b2c-app-builder-mcp.mjs` |
| `skill/b2c-app-builder/core/mcp/server.ts`                                                                                               | `entrypoints/mcp/server.ts`               |
| `skill/b2c-app-builder/core/public-api/`                                                                                                 | `contracts/public-api/`                   |
| `skill/b2c-app-builder/core/{engine,reducer,session,work-orders,operating-model,autonomy,context,routing,knowledge-service,schema,lib}/` | `kernel/{same}/`                          |
| `skill/b2c-app-builder/core/adapters/*`                                                                                                  | `adapters/*`                              |
| `skill/b2c-app-builder/core/{providers,provisioning,app-review}/`                                                                        | `adapters/{same}/`                        |
| `skill/b2c-app-builder/core/hosted/`                                                                                                     | `hosted/knowledge-mcp/`                   |
| `skill/b2c-app-builder/core/app/`                                                                                                        | `hosted/builder-console/`                 |
| `skill/b2c-app-builder/core/shared/geo.ts`                                                                                               | `hosted/shared/geo.ts`                    |
| `skill/b2c-app-builder/catalog/`, `knowledge/`, `tooling/`                                                                               | `catalog/`, `knowledge/`, `tooling/`      |
| `skill/b2c-app-builder/{starters,ui-library,workspace-template,studio}/`                                                                 | `surfaces/{same}/`                        |
| `skill/b2c-app-builder/workspace/`                                                                                                       | `examples/workspace/`                     |
| `skill/b2c-app-builder/verification/examples/tuck/`                                                                                      | `examples/tuck/`                          |
| `skill/b2c-app-builder/validation/`                                                                                                      | `checks/validation/`                      |
| `skill/b2c-app-builder/verification/`                                                                                                    | `checks/verification/`                    |
| `skill/b2c-app-builder/skill-version.json`                                                                                               | `skill-version.json`                      |
| `skill/b2c-app-builder/package.json`, `package-lock.json`, `tsconfig.json`, `.prettierrc.json`                                           | merged into the root files                |

Consumers that must keep working, and how:

- **Installed clients.** Each client skill directory (`~/.claude/skills`,
  `~/.codex/skills`, `~/.agents/skills`, `~/.cursor/skills`) links to the checkout
  root, which now holds `SKILL.md`. MCP registrations point at
  `entrypoints/mcp/b2c-app-builder-mcp.mjs`; the `b2c` shim points at
  `entrypoints/cli/b2c.mjs`. `b2c setup` prints the new paths.
- **Business workspaces.** `.b2c-launch/runtime.json` records the absolute
  `skillRoot` at pin time. A pin that names the old path is stale. ARCH-08 says an
  engine update alone must not re-pin a business, so the operator re-pins each
  business explicitly with `b2c bootstrap --workspace <dir> --apply`.
- **In-flight branches.** Branches edit files by their old path. `git rebase main`
  carries the edits through rename detection; a unit re-verifies its owned paths
  against the mapping before merging. The dispatch board and the four open unit
  issues are rewritten in this change.
- **Hosted Workers.** `hosted/knowledge-mcp` and `hosted/builder-console` keep
  their own manifests, lockfiles, and Wrangler configuration. No deploy is part of
  this decision.
- **Audit and CI.** `tooling/ci-lane.mjs` classifies the new prefixes.
  `check:repository-boundary` allowlists exactly the layers above. The `repo` and
  `skill` audit layouts resolve to the same root; `check:package-parity` now
  checks the root manifest against the hosted manifests and `skill-version.json`.

## Consequences

- **Move 2 (U4, U5, U9).** First-party packs, capabilities, providers, and the
  knowledge corpus move into `packages/` in the exact shape an external package
  must have, loaded through the same package-source resolver. When only the
  compiler remains in `catalog/`, rename it `composition/`. Those units own the
  proof; this record only reserves the names.
- **U1.** `check-architecture.ts` states the dependency rule over the top-level
  prefixes in the Decision table instead of enumerating files.
- **U14, U17.** `examples/extensions/` is the home for the offer-experiment proof
  package; the boundary allowlist already permits it.
- **Follow-up.** `skill-version.json` is now a release manifest for the whole
  package. Rename it when the version gate is next touched; this record keeps the
  name to limit churn for in-flight units.
- **Proof that the decision landed.** `npm run audit:ci -- --lane fast` and the
  heavy lane pass on the moved tree; `node entrypoints/cli/b2c.mjs doctor`,
  `catalog --json`, and `compose` produce the same v1 results as before; the MCP
  server lists the same tools; `check:repository-boundary` passes with the new
  allowlist and fails on a synthetic top-level directory.

No founder-reserved decision is granted or implied by this record. Removing the
parked Planes checkout from a machine is an operator action outside this record.
