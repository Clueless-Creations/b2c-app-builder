# Runtime rehearsal evidence

Current source verification lives in the executable fixtures:

- [Public initialization](../public-api/initialization.test.ts) checks accepted product authority, interrupted initialization, recovery and workspace path boundaries.
- [Trusted worker host](../fixtures/firstparty-worker-host.fixtures.ts) exercises the shipped worker route with a fake CLI executable. Invalid execution and verification proof is refused.
- [Business lifecycle](../public-api/lifecycle.test.ts) exercises the public create, initialize, passive plan, run and evidence operations.

Evaluation and measured-simplification baselines live in
[eval-baselines.md](./eval-baselines.md). The #78 sample lives in
[complexity-sample.md](./complexity-sample.md). The #77 overlay ownership
table lives in [agent-graph-ownership.md](./agent-graph-ownership.md). They
are protocols and fabricated-receipt checks, not live-provider, device,
purchase, or complete-business proof.

Run the relevant fixtures against the current checkout before claiming source conformance. These fixtures use isolated workspaces and synthetic execution. They do not establish a live provider, device, purchase, store release or complete consumer-business outcome.
