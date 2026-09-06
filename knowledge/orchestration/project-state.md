# Business State And Session Updates

Use `state/business-state.json` when starting, continuing, auditing, or handing
off a consumer business. Validate it before depending on its phase or work
status. Only the reducer changes authoritative business state.

## Owners

- `state/business-state.json` owns schema version, update time, project identity,
  lane state, pending founder gates, selected providers, continuity, workflow
  applicability, and the operating model.
- `operations/business-access.json` owns account and founder access decisions.
  `operations/BUSINESS_ACCESS.md` explains its current decision and next action.
- `operations/agent-operations.json` owns scoped capability and authenticated
  action records; `operations/AGENT_OPERATIONS.md` explains those records.
- `DESIGN.md` owns accepted design decisions. `studio/seed/business.json` lists
  design surfaces. The Design Room is generated review output.
- Producer receipts and the evidence store own proof. A state status or written
  check name cannot substitute for a current provider, runtime, or store result.

Use the current example at `examples/workspace/business/state/business-state.json`
for field shape. Do not add copies of account, design, or proof records to state.
Keep credentials in Doppler or the selected provider; state contains names only.

## Current Contract

The state schema is `2.0.0`. It uses `updatedAt` and camelCase project fields:
`launchScope`, `kickoffDate`, `supportedDeviceFamilies`, `bundleIds`, and
`publicUrls`. An accepted optional `project.repositoryProfile` has `id`,
`revision`, and `acceptedAt`; it does not waive safety or trust requirements.

Each lane contains `status`, `evidence`, and `blockers`. Status uses the current
execution vocabulary: `pending`, `ready`, `running`, `waiting_founder`, `blocked`,
`succeeded`, `failed`, `not_needed`, `deferred`, `stale`, `orphaned`,
`needs_readback`, `skipped`, or `cancelled`. A succeeded lane
requires current evidence. A scope exclusion needs a reason; a deferral needs
an owner and revisit condition. Neither can conceal required work.

`project.launchScope` selects the launch profile. The built-in profiles are
`essentials` and `full`. The selected catalog defines applicable work. A smaller
scope does not make an applicable validator optional.

`providers` records selected access routes and names-only requirements using
`accessRoute`, `docsCheckedAt`, and `requiredSecrets`. Actual authority comes
from scoped grants and the operation's checks. Configured access is not live
provider evidence.

`continuity` records `lastStateReview`, `sourceFiles`, `gitStatusReviewed`, and
`nextAction`. `workflowApplicability` records explicit required or not-needed
verdicts with reasons and evidence. `operatingModel` owns the configured
business operating loop. Do not recreate these responsibilities in ad hoc
state fields.

## Updates And Recovery

At session start, recover source truth from the current checkout, state, access
ledger, and pending work. Preserve unrelated edits. Update the reducer-owned
state when evidence, blockers, scope, or the next action changes. Reconcile the
owning access ledger before and after authenticated actions. Re-read provider
or store state before asserting a release or account change succeeded.

Record real results after builds, uploads, validation, and design review. A
command that started, a template, or a plan is not a successful result. Keep
source checkpoints tied to the actual build inputs. Run `check:source-checkpoint`
before reporting engineering progress; generated output cannot replace source.

Dependencies come from the compiled workflow contract. Do not mark downstream
work succeeded while its required upstream evidence is incomplete or stale.
Repair the owning producer and obtain new proof when the candidate changes.

Pending founder gates remain pending until the authorized decision arrives.
Explain the action, available choices, effect, and safe work that can continue.
Silence grants no authority. Keep the detailed decision in its owning ledger
and only the pending gate reference in business state.

## Validation

Run the checks for the changed responsibilities, using the CLI or installed
scripts with the explicit business root. Start with `validate:launch-state` and
`check:lane-coverage`, then relevant checks such as `check:agent-operations`,
`check:founder-operator`, `check:source-checkpoint`, `check:security`,
`check:provider-proof`, or `check:store-screenshots`. Run broader checks when
new failures or changed contracts justify them.

## Session Update

Tell the founder what changed, the evidence supporting it, what happens next,
and any decision only they can make. The reply must agree with current state.
Keep exact service routes and setup details in their owning documents. Never
include secret values or imply that a saved record was communicated to them.

Use `narrative.sinceLastTime`, `narrative.rightNow`, and `narrative.yourCall` for
the concise persisted update. Set `narrative.lastCelebratedPhase` only after
that phase's milestone was actually communicated; do not repeat a recorded beat.
A future agent should be able to continue from state and its evidence pointers
without reading every document or treating historical prose as authorization.
