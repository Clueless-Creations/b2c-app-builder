# Agent-graph ownership (#77)

Evidence-backed **no-change** on deriving overlay `order` from the catalog.
This is not a second catalog, not a runtime scheduler, and not a graph database.

Builder pin: current `main` at authoring time.

## Roles

| Structure | Role | Not its role |
| --- | --- | --- |
| Knowledge library / `createKnowledgeService` | Methods, sources, bounded retrieval | Workspace execution state |
| World ontology / product instances | Typed business facts | A general reasoning service |
| Agent-graph overlay | Phase-level role, class IO, founder-gate coverage | A second runtime scheduler |
| Compiled catalog plus engine | Readiness, dependencies, dispatch, authority, evidence, recovery | Choosing a brand or provider |

`docs/architecture.md` already states this split. Runtime agents must not query
`catalog/agent-graph/work.yaml`. `check:catalog` is the only reader.

## Consumers

Inventory from `loadAgentGraph`, `validateAgentGraph`, and `AgentWorkNode`:

| Consumer | What it needs | Uses authored `order`? |
| --- | --- | --- |
| `catalog/agent-graph/load.ts` | YAML + `work.schema.json`. Signature is `loadAgentGraph(skillRoot)`. | Yes. Parser requires a nonnegative integer. No catalog argument. |
| `catalog/agent-graph/validate.ts` | Catalog phases, ontology classes, overlay nodes | Yes. Mismatch vs `phase.order` fails. Read-before-write sorts by `order`. |
| `catalog/overlays.ts` | Already-loaded catalog, then `validateAgentGraphFile` | Indirect. Does not load the catalog from the graph loader. |
| `checks/verification/fixtures/agent-graph.fixtures.ts` | Structural coverage | Yes. Drift, missing phase, unknown phase, duplicate node. |
| `checks/verification/fixtures/eval-baselines.fixtures.ts` | Transcription equality | Yes. `phase.order === node.order`. |
| `checks/validation/repository/source-registry.yaml` | Source record | Path only. |
| `kernel/`, `tooling/` | — | No. Runtime and generators do not import the overlay loader. |

Phase-level `role_ids` are not workflow-role membership. Do not replace either
with a union.

## Ownership

| Field | Authoritative owner | Overlay keeps | Derive? |
| --- | --- | --- | --- |
| Phase identity | `catalog` phases | `phase_id` must name one catalog phase | No |
| Phase order | `catalog` `phases[].order` | Authored `order` is a checked transcription | **No-change** |
| Workflow roles | Catalog workflows / roles | Overlay `role_ids` stay phase-level | No |
| Class IO | World ontology | Authored `reads` / `writes` | No |
| Founder gates | Overlay `human_gate` | Outcomes `go-pivot-kill`, `price`, `submit`, `ship` | No |

Raw and resolved types stay the same object. There is no second normalized
graph type. Schema `nodes.items.required` includes `order`. A legacy file that
omits `order` still fails parse, not a silent default of zero.

## Why derivation is not worth it

Deleting authored `order` needs all of: a schema change, a `parseNode` change,
a catalog argument on the loader or a second load inside it, and a compatibility
rule for older documents that still carry an explicit integer.

`overlays.ts` already has the catalog when it validates the overlay. Passing
that catalog into `loadAgentGraph` is possible, but the loader would then own
both parse and resolve. A contradiction would have to fail closed anyway —
which `catalog_agent.order.mismatch` already does.

No measured failure shows the transcription as the defect. The benefit is
deleting one integer per node. The cost is a dual raw/resolved contract and a
legacy path. **Keep the checked transcription.**

## What this does not do

- Does not GitHub-close the issue.
- Does not delete `order` from YAML, schema, or types.
- Does not load the catalog from the overlay loader.
- Does not add a graph database or make the overlay a runtime brain.
