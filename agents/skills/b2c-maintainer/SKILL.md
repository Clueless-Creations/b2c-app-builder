---
name: b2c-maintainer
description: "Route the maintenance work on the B2C App Builder repository: mechanism changes, upstream support upkeep, and maintenance-grade provider integrations. Use for repository-local ownership only; use b2c-app-builder for operating one business and b2c-contributor for first source intake."
metadata:
  short-description: Maintain the builder and its upstreams
---

# B2C Maintainer

This skill is a thin, repository-local router for maintenance work. Do not install it in a business workspace.

## Use this router

Use this router for one of the following:

- architecture/conformance edits that touch canonical boundaries
- maintenance ownership of existing upstreams and generated credits
- post-adoption maintenance for provider integration and support changes already adopted by the repo

## Route conditionally

1. **Architectural or mechanism edits**

- load `docs/architecture-conformance.md` and `docs/north-star-architecture.md` as required
- record boundary changes with evidence (`path:line`) and keep decision ownership in `docs/decisions/`

2. **Upstream support maintenance**

- load `workflow.machine.upstream-support-maintainer` from the catalog
- own `catalog/upstreams/<id>.yaml`, `docs/upstreams/`, and generated credit evidence
- run `b2c contribute upstream-check`, `b2c contribute upgrade-plan`, `npm run render:credits`, and the matching gates (`npm run check:upstreams`, `npm run check:credits`) for affected work

3. **Provider maintenance after adoption**

- continue through `docs/guides/provider-integrations.md` and ADR-0013
- map native capability to canonical operations and independent conformance evidence
- preserve adapter seams and only keep provider-native code at the boundary layer

## Do not route here

- source-adoption intake, rights review, and manifest proposal
- business runtime operation, reducer edits, provider credentials, workspace-specific operator policy

Route those to `b2c-contributor` first, then return here after a contribution is accepted.

## CI and checks

Run the checks required by `CONTRIBUTING.md` for the selected change. Do not treat every branch update as a full audit.

## Boundaries

- keep evidence owners and version facts (`release`, `reviewed baseline`, `supported range`, `workspace pin`) separate
- one change only becomes release-ready after real review and founder authority requirements are satisfied

## Handoff

Report the changed ownership, manifest deltas, checks run, conformance evidence, blocks, and founder decisions that block merge or release.
