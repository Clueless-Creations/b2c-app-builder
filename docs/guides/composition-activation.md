# Composition activation

`b2c.yaml` proposes composition. `.b2c-launch/runtime.json` and `catalog.json` hold
its active pin. Editing configuration or updating the engine does not activate it.
The activation service implements the local metadata boundary in ARCH-07/ARCH-08.

The existing composer supplies a compiled catalog containing verified selected
operation bindings and immutable package snapshots. A catalog with no verified
selected recipe refuses as `composition.unresolved_configuration`. Recipe versions,
targets, defaults and provider overrides must match the selected package contracts.
Connection bindings not yet represented in compiled contracts also refuse. The installed runtime owner
supplies the next runtime manifest. Preview validates the configuration, selected
recipe and bindings, package bytes, current pin and workspace revision. It reports
retained, reopened, added and removed obligations, resource claims, entrypoints and
requested authority categories. Package declarations do not grant authority.

```typescript
import {
  previewCompositionActivation,
  applyCompositionActivation,
  recoverCompositionActivation,
  assertCompositionActivationComplete,
} from "../../kernel/composition/activation.js";

const preview = previewCompositionActivation({
  workspace,
  catalog: composedCatalog,
  runtime: installedRuntimeManifest,
});
// Show this exact preview before explicitly applying its configuration revision.
const result = applyCompositionActivation(workspace, preview, {
  ownerSessionId: sessionId,
});
```

Apply acquires `control/session.lock`, `control/manifest.json.lock` and
`state/business-state.json.lock` in that order. It rechecks the preview before writing. The runtime composition pin records
the configuration digest and revision, compiled plan ID and package digests.
No reducer-owned business state, grants or provider objects are changed.
Settled run state and its existing checkpoint are reconciled through the run owner.

The journal at `.b2c-launch/composition-activation.json` holds verified staged bytes
and previous catalog, runtime, run-state and checkpoint bytes. It is durable before either active file changes.
Readers must call `assertCompositionActivationComplete(workspace)` before reading
an active runtime or catalog. A present journal returns
`composition.activation_incomplete`; it must not look like an executable mixed pin.

```typescript
recoverCompositionActivation(workspace, "resume", { ownerSessionId: sessionId });
// Or restore the exact previous local metadata:
recoverCompositionActivation(workspace, "restore", { ownerSessionId: sessionId });
```

Resume rechecks configuration, workspace revision and package bytes. Restore writes
only previous local pin bytes. Both refuse a concurrent edit that matches neither
the staged nor prior file. Repeating a completed apply is an idempotent no-op.
Recovery does not reverse external effects or implicitly snapshot current source.
A crashed lease still needs the existing explicit stale-lease recovery procedure.

A changed plan with active or uncertain attempts refuses activation. Settled plans
use `reconcileRunPlan`: compatible proof and approvals remain current; changed work
and downstream proof reopen, and affected occurrence authorization refuses reuse.
Prior plan nodes, attempts, approvals, bindings and occurrences remain in
`run-state.json.archivedPlans`, outside current dispatch. Removed workflows remain
historical evidence. No run history is erased to make a new pin fit. Existing
checkpoints receive the same reconciled run under the journal; interrupted resume
or restore covers all four surfaces. This does not perform provider migration.
The public CLI invokes this owner through the shared operation service:

```sh
b2c package-import --workspace my-app --source ./my-package --json
b2c packages --workspace my-app --json
b2c composition-plan --workspace my-app --packages sha256:PACKAGE_DIGEST --json
b2c composition-activate --workspace my-app --packages sha256:PACKAGE_DIGEST --preview sha256:PREVIEW_DIGEST --json
b2c composition-recover --workspace my-app --mode resume --json
```

Replace digest placeholders with exact returned values. Import dependencies first
and pass their comma-separated digests with `--dependencies`. The workspace must
already have its installed runtime manifest and authored `b2c.yaml`. The service
uses that runtime's existing root, verified workspace-local package snapshots and
the existing recipe catalog compiler. It never discovers newer package versions.
Only package metadata and activation planning are exposed through read-only MCP.
Local import, activate and recover stay CLI-only. No source path is an MCP input.

Public apply recomputes the current preview: reusing an old preview after any pin
change can return `STALE_PREVIEW`; request a new plan. Direct internal apply of the
same verified staged transaction remains idempotent. Public plan requires billing
gates to use the selected implementation's exact installed `validationContract`
(ID, version and billing kind). The compiler emits separate gate argument tokens,
includes them in contract identity, and refuses altered parameters. Gate execution
validates the same selection before spawning; it never splits a shell command. Runtime-only examples use
the `host` target; this does not establish consumer device support.


Fresh accepted businesses use the same transaction through `business-initialize`
or `bootstrap --apply`. Initialization imports the shipped package and selects
`b2c/complete-consumer-business@1.0.0` for `host/agent-cli`. A durable initialization
intent keeps partial setup unavailable to normal readers. Retrying the original
request resumes known stages; altered product inputs, unknown partial state or
unverified completed-stage claims refuse. Initialization never creates grants.
Existing selected workspaces use explicit composition activation for changes.
