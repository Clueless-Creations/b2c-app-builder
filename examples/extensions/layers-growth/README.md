# Layers Growth extension

This contribution package makes Layers (layers.com) a managed provider for one bounded loop: render a draft creative, read the job, read the result. It declares one provider, one capability with three operations, three host-tool implementations, and one recipe. The knowledge resource `integration.md` carries the onboarding contract, the effect vectors, and the job lifecycle. The `notice` resource retains the MIT license of layers/mcp, whose README the integration notes adapt.

## What it proves

- The package validates, snapshots, and resolves through the existing extension contract, snapshot store, recipe resolver, and catalog pack loader.
- Contribution inspection touches no onboarding surface. The builder repository has no `.layers/project.json`, no Layers entry in `.mcp.json`, and no `.agents/skills/layers/SKILL.md`, and the fixtures assert that stays true.
- A quote must match the exact arguments, be in credits, be fresh, and fit inside the approved credits before a charged call.
- The job ledger reconciles an uncertain response by reading the job back. It allows one replay only when the provider reports no job, and refuses a second.
- A binding mismatch blocks execution before any transport call.
- The routes register in the existing `OperationRouteRegistry` with the package digest. They never call the delivery tool and refuse a publish argument.
- Spend authority for the draft operation goes through the existing grant, waiver, and budget evaluator with no provider-specific exception.

## What it does not prove

- No onboarding. `layers setup` never runs here.
- No live call. Every fixture uses a fake transport. The live transport exists only as a descriptor with `implemented: false`.
- No idempotency claim. The documentation does not describe an idempotency key for `render_content`.
- No service-terms review.

## Inspect it without running setup

```sh
b2c contribute plan --source examples/extensions/layers-growth --goal "Adopt Layers as a draft creative provider"
```

The plan reads the package files and produces an adoption map. It executes no package code, no CLI, and no provider setup. The fixtures run with:

```sh
npx tsx checks/verification/fixtures/run.ts layers
npx tsx checks/verification/boundaries/run.ts layers-spend
```

## Boundary

The routes cover `render_content` in draft mode, a job read, and a result read. Delivery, paid campaigns, managed accounts, measurement installation, and onboarding are outside the package. Each needs its own bounded recipe and its own authority. Review is an independent step. Publication needs an explicit receipt and never happens inside the draft loop.

Sources: https://layers.com/docs/mcp, https://github.com/layers/mcp, https://github.com/layers/cli.
