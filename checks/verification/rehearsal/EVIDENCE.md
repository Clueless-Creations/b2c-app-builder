# Runtime rehearsal evidence

Current source verification lives in the executable fixtures:

- [Public initialization](../public-api/initialization.test.ts) checks accepted product authority, interrupted initialization, recovery and workspace path boundaries.
- [Trusted worker host](../fixtures/firstparty-worker-host.fixtures.ts) exercises the shipped worker route with a fake CLI executable. Invalid execution and verification proof is refused.
- [Business lifecycle](../public-api/lifecycle.test.ts) exercises the public create, initialize, passive plan, run and evidence operations.

Run the relevant fixtures against the current checkout before claiming source conformance. These fixtures use isolated workspaces and synthetic execution. They do not establish a live provider, device, purchase, store release or complete consumer-business outcome.
