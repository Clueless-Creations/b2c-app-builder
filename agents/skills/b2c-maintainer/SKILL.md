---
name: b2c-maintainer
description: "Route B2C App Builder repository maintenance: core mechanism changes under the architecture conformance protocol, and upstream support maintenance (upstream checks, upgrade plans, credits, and the check:upstreams and check:credits gates). Repository-local; never copy it into a business workspace. Do not use for building or operating one business (use b2c-app-builder) or for adopting a new external source (use b2c-contributor)."
metadata:
  short-description: Maintain the builder and its upstreams
---

# B2C Maintainer

This skill is a router for work on this repository itself. It is
repository-local. Do not copy it into a business workspace. Do not install it for
a business worker.

## Core mechanism changes

Follow `docs/architecture-conformance.md`. Read the assigned ARCH rules in
`docs/north-star-architecture.md` and the unit in the migration roadmap. Declare
owned paths. A change to a public contract, truth owner, authority boundary, or
migration guarantee needs a decision record under `docs/decisions/`. Cite
evidence as `path:line`. Keep one owner per responsibility.

## Upstream support maintenance

Load `workflow.machine.upstream-support-maintainer` from the catalog. The
manifests live in `catalog/upstreams/<id>.yaml`. The guide is
`docs/guides/adopt-external-sources.md`. Ownership starts at release: the
contributor proposes a manifest with the contribution that first reuses the
project, and maintenance owns its baselines, observations, upgrade plans,
support ranges, review status, and credits from the release that ships it.

```sh
b2c contribute upstreams [--upstream <id>] [--observe-host] [--json]
b2c contribute upstream-check --upstream <id> --fetch --observe-host --write [--json]
b2c contribute upgrade-plan --upstream <id> [--candidate <tag>] [--target <dir>] [--json]
npm run render:credits
npm run check:upstreams
npm run check:credits
```

1. Run the check with `--fetch --observe-host --write` to record an observation.
2. Classify each change. The tool's classification is a candidate, not a verdict.
3. Prepare an upgrade plan. Keep every intentional adaptation the manifest lists.
4. Update the manifest baselines and review date only after a real review.
5. Regenerate credits and run both gates.
6. Before a release, read `docs/upstreams/coverage-report.md`, which `npm run render:credits` writes from active bound knowledge declarations. Route a reusable dependency, method, or tool that lacks an identity to `b2c-contributor`. Leave an informational citation as a source-registry row.

Never upgrade a host binary or repin a business as part of the check. No
scheduled upstream check exists; CI is disabled by the founder, so run it by hand.

## Source adoption

Route a new source to `workflow.machine.source-adoption-contributor` and the
`b2c-contributor` skill. The contributor proposes the manifest; review it with
the adoption map before a release includes it. Do not create a manifest for a
citation.

## Boundaries

- Maintenance reads and writes `catalog/upstreams/`, `docs/upstreams/`, and the generated credit files. It never touches reducer state, workspace pins, or provider connections.
- Unknown stays unknown. An unsuccessful check is not evidence of currency.
- Keep five version facts apart: the latest observed release, the reviewed baseline, the supported range, the workspace pin, and the executable observed on the host. A newer upstream changes none of the others until reviewed.
- Upstream guidance is subordinate to the mandate, the selected recipe, the capability contract, and the selected provider. It never widens what a business worker may do.
- A version bump needs `npm run render:all`; a bare bump stales the generated catalog.
- Founder authority covers skill-pack installation, host upgrades, provider sign-in, spend, and releases.

## Handoff

Report the observation written, the drift found, the classification per change,
the plan prepared, the gates run, and any decision that needs the founder.
