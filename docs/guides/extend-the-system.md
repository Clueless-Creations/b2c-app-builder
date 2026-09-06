# Extend the system

Start with a consumer-business responsibility. A capability defines an operation,
a provider implements it, and a recipe arranges its work and review. The
[north-star architecture](../north-star-architecture.md) owns these boundaries.

## Package contract

Author `extension.yaml` using `contracts/extensions/contract.ts`. Export namespaced
IDs and exact versions. Declare schema, knowledge, prompt, adapter, asset and
catalog-pack resources as relative paths. Declare dependencies and imports
explicitly. Undeclared references, conflicting versions and unsafe paths refuse.

A package that copies someone else's material declares a `notice` resource with
the verbatim license text and a `thirdParty` entry that names it and the
resources it covers. Validation refuses an entry whose notice is not a `notice`
resource or whose cover is undeclared. `kernel/composition/notices.ts` is a
library: it reads the entries from verified snapshots, refuses an uncovered
`font/*` asset, and renders `THIRD_PARTY_NOTICES.md` into an output directory
on request. The `package-notices` suite proves that path. No composition,
starter, or render path calls it yet; wiring it into an output path is a
follow-up owned by the composition activation owner. See the
[synthetic SwiftUI creator example](../../examples/contributions/synthetic-swiftui-creator/README.md).

The [support example](../../examples/extensions/support-case/README.md) contains a
self-contained package, custom request/result/evidence schemas, a workflow and
review policy. Its conformance scenario copies the package to another directory,
installs an immutable snapshot, deletes the source, and executes against the
retained bytes through an explicitly registered fake transport. It verifies real
local artifacts and independent observation. It proves no live support service.

```sh
node --import tsx checks/verification/scenarios/extension-conformance.ts
```

## Install and activate

Use an existing registered workspace with its runtime installed and authored
`b2c.yaml`. Import dependencies first, then the selected package:

```sh
b2c package-import --workspace my-app --source ./my-package --json
b2c packages --workspace my-app --json
b2c composition-plan --workspace my-app --packages sha256:PACKAGE_DIGEST --json
b2c composition-activate --workspace my-app --packages sha256:PACKAGE_DIGEST --preview sha256:PREVIEW_DIGEST --json
```

Use exact digests returned by import and plan. Import copies declared bytes into
workspace-local content-addressed storage. It runs no install hooks, package code,
provider calls or secrets. Planning verifies the closure and compiles only the
selected recipe and required dependencies. Required missing bindings refuse;
optional exclusions stay visible. Activation applies the checked local revision
through the existing journal. See [composition activation](composition-activation.md).

## Execute and verify

A host registers executable callbacks through `OperationRouteRegistry`. A package
manifest cannot install callbacks. The route matches the exact operation,
implementation and package digest. The existing runtime checks authority before
dispatch, retains a dispatch intent before effects, validates custom schemas and
requires independent observation. An interrupted effect requires readback.

Keep vendor SDK types inside the selected adapter. Preserve neutral knowledge
when substituting a provider. Claim support separately for each platform/runtime,
configuration, execution route, authority and observed proof. An SDK range match
is not a device test or provider round-trip.

The operation registry in `contracts/public-api/contract.ts` defines consumer
inputs and results. Add public operations there before projecting CLI or MCP.
Never expose reducer patches, caller-authored grants or raw runtime state as a
business API. Run focused conformance, boundary and public parity checks, then
regenerate the public reference and catalog projections.

Mobile app operation follows the same path. Raw captures, functional acceptance,
accessibility review and finished marketing creative are separate outputs. See
[mobile operation](mobile-app-operation.md). Keep one composer, executor and
workspace evidence owner for bundled and external packages.
