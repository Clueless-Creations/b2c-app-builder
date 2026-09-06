# Public interface

The shared `b2c/v1` operation registry owns CLI and local MCP names, input schemas,
result schemas and descriptions. The [generated reference](../contracts/public-api/REFERENCE.md)
is authoritative. Every response has `apiVersion`, `requestId`, `ok` and `warnings`;
success returns typed `data`, failure returns `error`. Request IDs correlate calls;
they are not execution receipts or authority.

| Operation              | CLI                                                                           | MCP                    | Effects                             |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------- | ----------------------------------- |
| `catalog.list`         | `b2c catalog`                                                                 | `b2c_discover`         | Bundled declarations                |
| `composition.preview`  | `b2c compose --config b2c.yaml`                                               | `b2c_compose`          | Declaration validation              |
| `business.status`      | `b2c business-status --workspace ID`                                          | `b2c_business_status`  | Registered runtime read             |
| `packages.list`        | `b2c packages --workspace ID`                                                 | `b2c_packages`         | Verified installed metadata         |
| `packages.import`      | `b2c package-import --workspace ID --source PATH`                             | CLI only               | Immutable local snapshot            |
| `composition.plan`     | `b2c composition-plan --workspace ID --packages DIGESTS`                      | `b2c_composition_plan` | Verified local activation preview   |
| `composition.activate` | `b2c composition-activate --workspace ID --packages DIGESTS --preview DIGEST` | CLI only               | Recoverable local pin transaction   |
| `composition.recover`  | `b2c composition-recover --workspace ID --mode resume`                        | CLI only               | Resume or restore staged local pins |
| `market.report`        | `b2c market-report --workspace ID --experiment ID`                            | `b2c_market_report`    | Independent business outcome read   |

Use `--json` for machine output. `DIGESTS` is a comma-separated list of exact
`sha256:` digests. Import's optional `--dependencies DIGESTS` names previously
installed dependencies. MCP accepts registered IDs and package digests, never
operator source paths. The mutation operations are absent from MCP, including when
other workspace write tools are enabled. Hosted knowledge MCP gains no local tools.

## Declaration and installed composition

A composition declares an exact recipe version, target and operation-level
provider overrides. Omitted bindings use recipe defaults. Unsupported selections
refuse; they never silently select another provider. `connection:*` references
contain no secrets. Installed activation refuses connection references until their
binding is compiled explicitly.

`compose` remains a declaration-only preview with the saved v1 semantics. Its
reserved apply mode returns `COMPOSITION_APPLY_UNAVAILABLE`. `proposalDigest`
identifies this declaration, not a workspace revision or activation approval.
Discover `b2c/mobile-app-operation` for capture declarations; current provider and
device proof remains separate from declared support.

Installed activation uses the existing package snapshots, recipe resolver,
catalog composer, compiler and runtime manifest. Initialize the accepted workspace
with the complete-business default, then author the desired `b2c.yaml` change.
Import packages explicitly, then plan with exact
digests. Package resources remain in `.b2c-launch/packages/<digest>/`; deleting the
source directory does not invalidate them. No package code runs on import or plan.

The activation preview exposes configuration revision, package digests, workflow
changes, effects and requested authority categories. It omits raw catalog/runtime
bytes and paths. Apply recomputes the preview and refuses a stale digest. It writes
only local catalog/runtime pins through the durable activation journal, grants no
authority, dispatches no work and observes no provider. Experimental declarations
without executable mappings remain unavailable even when discovery lists them.
Billing gates require an exact validation contract declared by the selected implementation. The compiler binds its ID and version into structured arguments; activation and execution verify the installed contract before running the gate.

If a journal remains after interruption, status reports `recovery_required` and
active pin readers refuse. Use `composition-recover --mode resume` or `--mode restore`.
Settled run history is reconciled by the existing run owner in the same transaction.
Changed and downstream proof reopens; removed history stays archived in the run
document. Active or uncertain attempts refuse activation. See [composition activation](guides/composition-activation.md).

## Business observations

Business status returns lifecycle and aggregate work counts from registered local
runtime state. It exposes no raw state, paths or grants and labels provider proof
as unobserved.

Market reports read authored experiments in `operations/metric-contracts.json`
and accepted observations in existing business state. Reports retain missing or
incompatible businesses as degraded rows, separate synthetic from observed outcomes,
and aggregate only comparable cohorts. They confer no allocation authority and
make no live launch claim. See [market experiments](guides/market-experiments.md).

## Contract boundaries

Authored inputs reject unknown fields. Clients tolerate additive output fields and
unknown error codes as failures. API version, entity version, engine release and
provider SDK version are distinct. CLI and MCP share service envelopes; MCP may
reject malformed protocol input before invoking the service.

Existing workspace lifecycle and execution commands retain their authority gates.
`b2c_catalog` inspects executable workflows while `b2c_discover` lists public business
declarations. The lifecycle facade derives authority internally and does not
expose caller-authored grants, reducer patches or raw planner objects.

## Business lifecycle

`business.create` creates and registers a planning workspace with a hypothesis.
It does not accept the product or grant execution authority. After research and an
explicit product decision, `business.initialize` installs the current runtime
through the existing bootstrap owner, imports the verified shipped package, and
activates `b2c/complete-consumer-business@1.0.0` for `host/agent-cli` through the
existing composition transaction. It requires the exact workspace revision and
serializes initialization with sessions. Its local intent records recoverable
stages; unknown partial installs refuse instead of silently replacing pins.
Use composition activation to change an installed execution contract.

`business.plan` is passive: it reports ready and held workflow IDs without probes,
network calls or writes. Ready means eligible at this snapshot; it does not grant
authority or promise execution. `business.evidence` reports current, stale, pending
or absent acceptance without exposing raw state or worker errors. A failed attempt
carries `attempt.failed` and one classified `worker.*` or `attempt.error` reason code. Synthetic proof
stays identified and neither response claims a live launch.

`business.run` requires the plan revision and a caller-chosen request ID. It uses
the existing bounded session executor and authority evaluator, with notifications
disabled. A completed exact request returns its recorded result without dispatch.
A changed payload with that ID refuses. An interrupted recorded request blocks
both its retry and new request IDs. After session ownership and uncertain effects
are reconciled, `business.recover` closes the exact pending request as interrupted
under the current revision and common locks. It dispatches no work and accepts no
evidence. Live sessions, stale locks without verified recovery, unresolved
readback, and active work orders refuse recovery. The original run request then
replays its terminal receipt; new work uses a new request ID and current revision.
Preflight refusal before recording a request is retryable after correcting the
cause and obtaining a current revision; it creates no completed receipt.

CLI commands are `business-create`, `business-initialize`, `business-plan`,
`business-run`, `business-recover` and `business-evidence`. Mutations are CLI-only. MCP exposes only
`b2c_business_plan` and `b2c_business_evidence` alongside status. Trusted hosts may
inject an `OperationRouteRegistry` into `callPublicOperation("business.run", input,
host)`; imported packages and public request fields cannot install callbacks.
The CLI registers only the verified shipped consumer-business worker implementations
with the existing worker adapter. Imported implementations still need explicit
trusted host registration. A selected implementation without a registered host
route refuses execution.

Provider IDs group operation implementations; they are not implementation aliases.
Discovery and recipe defaults derive from the shipped verified extension package.
An explicit provider binding resolves one exact provider version, operation and
target to one implementation. Missing or ambiguous mappings refuse. Changing a
provider group version does not imply that every implementation has that version.
