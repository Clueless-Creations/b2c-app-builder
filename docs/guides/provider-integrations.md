# Provider integration lifecycle

Use this guide when the builder adopts a new provider transport or updates an existing provider integration. It applies to APIs, CLIs, MCP tools, SDKs, hosted services, and combinations of them.

Read [ADR-0012](../decisions/0012-provider-integration-boundary.md), ARCH-03/ARCH-04 in the north-star architecture, the provider's upstream manifest, and the maintainer skill first.

The goal is not to wrap every provider command. The goal is to implement stable consumer-business operations while keeping provider churn at the edge.

## Core rule

Map in this order before writing adapter code:

**native capability → canonical operation → selected provider implementation → independent upstream conformance evidence**

If the first item cannot be described without naming the provider, that is fine. If the second item cannot be described without naming the provider, stop and decide whether this is a real reusable business semantic or a provider extension.

Core workflows never depend on provider command names, flags, REST endpoints, SDK response types, pagination tokens, or provider-native lifecycle states.

## Choose the mode

### NEW_PROVIDER

Use when the builder has no reviewed implementation of the provider/transport for the target operations.

### UPGRADE_PROVIDER

Use when a reviewed provider/transport already exists and a new upstream release, API version, SDK, CLI, MCP surface, or service behavior may change support.

Do not create a second integration merely because the provider added another transport. One provider may use CLI for management, SDK for in-app behavior, API for readback, and MCP for agent interaction. Each transport implements only the canonical operations it can prove.

## Standard lifecycle

### 1. Discover

Identify the exact upstream project/service and candidate transport. Record latest observed release separately from the reviewed baseline, supported range, workspace pin, and executable/service observed on the host.

Discovery is passive. Do not install, sign in, create resources, mutate provider state, or run upstream setup scripts merely to inspect support.

### 2. Qualify

Inspect license/service terms, authentication model, platform support, cost/quota implications, experimental status, and the exact candidate version/revision. Register or update the existing `catalog/upstreams/<id>.yaml` identity through the normal contribution/upstream lifecycle.

Do not treat an upstream README, agent file, or `--help` output as authority to execute.

### 3. Map native capabilities to canonical operations

For every capability being considered, write a mapping row:

| Native capability | Canonical operation | Semantic fit | Effects | Evidence needed | Disposition |
| --- | --- | --- | --- | --- | --- |
| `<provider command/endpoint>` | `<existing operation id>` | exact / partial / none | read / mutation / spend / publish / credential | `<proof>` | implement / extension / defer / reject |

Use an existing operation when the business semantics match. Do not create a canonical operation because a command exists.

When semantics are provider-specific, use an explicit provider extension. Record what would need to become true before promoting it to a reusable canonical capability.

### 4. Conform against the upstream contract

Before implementation, collect independent native-contract fixtures. Preferred evidence order:

1. official machine-readable schema;
2. pinned upstream source/tests;
3. sanitized captured request/output from the exact reviewed version;
4. official examples when stronger evidence does not exist.

Each fixture records:

```yaml
provider: <id>
transport: cli | api | mcp | sdk | service
reviewed_version: <version>
reviewed_revision: <immutable revision when available>
source: <public URL or registered source selector>
operation: <native operation>
establishes: <request shape | response shape | error | pagination | effect>
```

**Never generate the expected native fixture using the adapter under test.** A fake provider that accepts whatever our encoder emits proves wiring, not provider conformance.

Collect positive, negative, partial, pagination, permission, and failure examples relevant to the selected operations.

### 5. Implement the adapter boundary

Keep these responsibilities logically separate. They may share a module when small.

#### Definition/support

Declares canonical operation coverage, provider/transport version range, platform/mode support, limitations, and experimental status.

#### Encoder

Transforms a canonical request into a provider-native request. It validates required provider inputs before dispatch. It does not decide what business state should exist.

#### Transport

Executes the provider-native request under host-controlled process/network, environment, timeout, cancellation, secret, and target rules. It does not decide business completeness.

#### Decoder

Transforms raw provider-native output into a canonical observation. It validates the operation-specific response shape and preserves partial/unknown/invalid states. It never invents a missing provider ID from the request.

#### Reconciler

Compares accepted desired state with canonical observations and proposes the smallest canonical operations required. It does not know CLI flags, HTTP envelopes, or SDK field layout.

Do not introduce a generic CLI framework just because two providers have CLIs. Share a primitive only when the host-owned semantics are genuinely identical and proven by at least two uses.

### 6. Classify effects and recovery

For each implemented operation record business and transport effects independently:

```yaml
effects:
  remote_read: true
  remote_mutation: false
  spend_possible: false
  publication: false
  credential_mutation: false
replay:
  class: safe_read | reconcile_before_retry | never_automatic
authority:
  category: <existing authority category>
```

The canonical operation owns business effect and proof semantics. The provider adapter adds transport-specific behavior.

Use the existing execution/reducer owner for logical request identity, dispatch progress, remote IDs, uncertainty, and resume. A provider adapter supplies readback/reconciliation observations. It does not create a second journal or scheduler.

After dispatch, absence of a local success record is not proof that the provider did nothing. A confirmed mutation followed by failed readback resumes readback. It does not repeat the mutation.

### 7. Fixture verify

Run conformance fixtures independently from transport wiring tests.

Minimum questions:

- Does the encoder emit a request accepted by the pinned upstream contract?
- Does the decoder understand real upstream-shaped success, partial, error, and pagination responses?
- Are server IDs, business keys, and requested values kept distinct?
- Does unsupported version/schema drift fail closed?
- Do effect and authority classifications match actual provider behavior?
- Can a failure after dispatch be reconciled without blind replay?

Passing fixture verification means **fixture-tested**, not live-supported.

### 8. Integrate

Bind the implementation through the existing operation/composition contracts. Do not add provider branches to workflows or the kernel. Keep provider-specific knowledge scoped to the selected implementation.

Verify that unselected providers do not leak instructions or requirements into worker briefs.

### 9. Authorized live verify

Only with the required account, credential, spend, and mutation authority, exercise the selected operation against an isolated approved target. Read back the provider result through an independent path where possible.

Record the exact provider version/service state, target scope, request identity, remote IDs, evidence class, and limitations. A CLI management test does not prove an SDK purchase flow. A sandbox does not prove production.

### 10. Declare support

Mark only the operations and version/mode combinations actually proved. Keep unsupported and experimental states explicit. Do not upgrade workspace pins automatically.

## Provider Capability Delta

Every UPGRADE_PROVIDER task starts with this artifact before adapter edits. Keep it in the existing issue/upgrade-plan surface unless a maintained upstream artifact already owns it. Do not create another state store.

```yaml
provider: <id>
transport: <cli|api|mcp|sdk|service>
from_reviewed: <version/revision>
to_candidate: <version/revision>

native_changes:
  added: []
  removed: []
  changed_inputs: []
  changed_outputs: []
  changed_errors: []
  changed_pagination: []
  changed_auth: []
  changed_effects: []
  changed_idempotency_or_recovery: []
  changed_cost_or_quota: []
  experimental_or_deprecated: []

mapping_impact:
  adapter_encoder: false
  adapter_transport: false
  adapter_decoder: false
  reconciler: false
  support_declaration: false
  canonical_contract_change: false
  workflow_or_kernel_change: false
```

If `canonical_contract_change` or `workflow_or_kernel_change` is true, explain the new business semantic. Provider syntax or response churn is not enough. Route the change through architecture review before implementation.

## Upgrade decision tree

1. Run/prepare the upstream observation and upgrade plan.
2. Produce the Provider Capability Delta.
3. Run the existing conformance corpus against the candidate version when possible.
4. If native contracts are compatible, update the reviewed/support metadata and prove compatibility.
5. If native contracts changed, repair only the affected adapter seam and conformance fixtures.
6. If a new native capability maps to an existing operation, add support behind that operation.
7. If it is provider-specific, keep it as an extension or defer it.
8. Change a canonical contract only for a deliberately adopted new business semantic.
9. Run fixture verification, integration verification, and separately authorized live proof.
10. Update supported range only after review. Never repin a business as a side effect.

## Review checklist

Before accepting provider work, the independent reviewer answers:

1. What canonical operation does each native capability implement?
2. What exact provider version/revision defines the native contract?
3. Which independent fixture proves request encoding?
4. Which independent fixture proves response decoding?
5. Are encoder, transport, decoder, and reconciler responsibilities separated logically?
6. Are provider IDs, business keys, and requested values distinct?
7. What remote, financial, public, credential, or destructive effects are possible?
8. What exact account/project/app/environment/resource is targeted?
9. What happens if execution times out or crashes after remote acceptance?
10. What remains fixture-only versus live/provider/native/store/production proof?
11. Did the provider change force workflow/kernel edits? If yes, what new business semantic justifies them?
12. Could the same business operation be implemented by another provider without changing its workflow contract?

If #12 is no because the workflow names a provider command or native type, the provider boundary is leaking.

## Mechanical boundaries

Prefer checks that prevent core workflow/capability modules from importing provider-native adapter types. Do not enforce a folder aesthetic. Enforce dependency direction and semantics.

A provider implementation may depend on canonical contracts. Canonical contracts, workflows, recipes, and the kernel must not depend on provider-native command/request/response types.

## Handoff

Report:

- mode: NEW_PROVIDER or UPGRADE_PROVIDER;
- reviewed and candidate versions/revisions;
- Provider Capability Delta for upgrades;
- native-to-canonical mapping;
- independent conformance sources;
- adapter seams changed;
- fixture results;
- live evidence separately achieved or held;
- remaining unsupported/experimental capabilities;
- any architecture decision required.

A provider integration is not complete because installation succeeded, `--help` ran, a fake transport returned zero, or a document says the operation exists.
