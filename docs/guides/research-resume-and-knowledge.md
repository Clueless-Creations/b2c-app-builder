# Research, continuation and bounded knowledge

## Start the right scope

Use `b2c business-create` with an explicit workspace ID, directory, hypothesis and opening
`--mandate` for a complete delegated business. It creates and registers a planning workspace.
Keep its provisional ID separate from the accepted product name. Do not write runtime state
by hand. A focused existing-app task does not need a complete-business installation.

Natural-language `b2c plan --utterance ... --cwd ...` and `b2c_plan` preserve explicit complete
mandates. Use `--mandate-scope complete_business` or the MCP `mandateScope` field to state the
scope explicitly. The returned journey is a view of existing dependencies, not execution or
permission. Its research successor includes independent review. Registration routes identify
the target without inventing a final brand.

Read `b2c business-plan --workspace ID --json` before work and after an interruption. Planning
responses name saved artifacts and query checkpoints. Initialized responses identify ready and
held work. `completion.deliveryAccepted` is separate from a session finishing successfully.
A research check or passing unit tests cannot establish complete delivery.

## Read the contract, not its validator source

`b2c_workflow({workflowId})` defaults to a compact route. The response includes `route.expand`,
required reference metadata, output specification calls, validator commands and a coverage warning.
It contains no reference bodies and no expanded workflow instructions by default.

Use `route.expand` when the authored workflow instructions are needed. For a required artifact,
call `b2c_knowledge_get` with the exact `route.outputs[].specifications[].get` object. It includes
`referenceId`, `sectionId` and `expectedContentSha256`. The research artifact floor is available
in the workflow call plus one section call, with no repository filesystem access.

Search results also return a matching section resolver. `view: sections` returns a paginated
heading index without a body. Follow `nextCall` for a section continuation. Offsets are Unicode
code points, relative to the selected section. Stale hashes return `revision_mismatch` and HTTP
409. Retrieve a new route/index instead of guessing a new offset.

`include: summaries` and `include: full` remain explicit workflow bundle modes. Their `tokenBudget`
field retains its historical name but measures Unicode code points, not model tokens. Incomplete
coverage stays visible. Do not request a large bundle simply to find a heading. Explicit
`brief: true` returns a worker dispatch packet and can be substantially larger than discovery.

## Checkpoint a research query

The public reference owns the full schemas. A non-secret query file can look like this:

```json
{
  "provider": "example/research",
  "providerVersion": "1.0.0",
  "connectionRef": "connection:research",
  "operation": "category-estimates",
  "parameters": {"category": "parcel-trackers", "country": "US"}
}
```

This is an illustrative provider identity, not an installed provider or an API call.

```sh
b2c research-lookup --workspace ID --query query.json --max-age 86400 --json
b2c research-record --workspace ID --revision sha256:REVISION --observation observation.json --json
```

The observation wraps that exact query, an `outcome`, and a bounded `summary`. For `observed`,
it also needs `observedAt` and `sourceRefs`; preserve useful numbers and uncertainty in the
summary and link permitted detailed artifacts. `providerRequestId` can identify remote readback.
The returned revision is the input to the next controlled write.

Record `pending` before dispatching an independently authorized paid request. Record `observed`,
`failed` or `uncertain` immediately after its result. A checkpoint does not itself perform an
external action. A process can stop after saving an intent but before dispatch: reconcile that
case rather than presuming the provider ran it. A new pending record cannot replace pending or
uncertain work, even with a refresh reason. Completed observations can be refreshed deliberately
with `refreshReason` when the new work is necessary and authorized.

Lookup returns `reusable`, `stale`, `needs_collection` or `needs_reconciliation` under the caller's
explicit freshness policy. It never calls paid APIs. Equivalent object-key ordering resolves to
the same query. Identity includes provider version and connection scope so unrelated results are
not reused across providers or businesses. Changing parameters is not permission to recollect:
read the source ledger and justify the new question.

Only registered planning workspaces accept checkpoint writes. After initialization, executor
attempts and receipts own execution. Corpus observations are not accepted proof. Their inventory
is bounded at 256 records and every read verifies identity/content. The system rejects unknown,
tampered, oversized or symlinked records. Atomic-write temporary files are not observations.
Do not place credentials or personal provider payloads in query files or summaries. Credential-key
checks are a backstop, not a claim to recognize every possible secret.

The contributor and business MCP surfaces stay read-only for this feature. `b2c_research_lookup`
reads saved results; `research-record` is CLI-only. Read-only status and lookup grant no authority.
