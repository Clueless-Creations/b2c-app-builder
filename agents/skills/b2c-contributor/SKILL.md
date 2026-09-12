---
name: b2c-contributor
description: "Route external source intake and adoption into B2C App Builder: intake map, rights review, references, and draft manifest work. Use for this repository only, not for business operation or upstream maintenance."
metadata:
  short-description: Adopt an external source into the builder
---

# B2C Contributor

This skill is a thin router for source adoption into this repository.

## Use this router

Use this router when the request is to adopt an external source (post, repo, library, screenshot utility, showcase, or provider package) into B2C App Builder.

## Route conditionally

1. **Source intake and map**

- define scope and source goals
- collect source metadata and rights posture
- split the candidate into small units

2. **Draft manifest and evidence**

- prepare manifest-backed references in the appropriate catalog location
- keep one unit per reviewed path and avoid mixing unrelated scopes

3. **Draft review**

- run the local manifest draft through `b2c contribute plan` / `b2c contribute check` / `b2c contribute preview`
- perform declared evaluations before proposing a release pull request

4. **Provider implementations**

- when source is a provider implementation or wrap, complete rights and adoption here first
- continue through `docs/guides/provider-integrations.md` and route to `b2c-maintainer` for post-adoption maintenance ownership

## Do not route here

- runtime execution, release operations, and provider uptime upkeep
- CI policy changes, version bumps, credit maintenance, and upstream support contracts

Route those to `b2c-maintainer` or `b2c-app-builder`.

## Commands

```sh
b2c contribute plan --source <https-url|path> --goal <text> [--scope contribution] [--network] [--json]
b2c contribute check --target <contribution-root> [--json]
b2c contribute preview --target <contribution-root> [--json]
b2c contribute evaluate --target <contribution-root> [--suite <id>] [--allow-commands] [--json]
```

## Boundaries

- do not run source code, generators, screenshot builders, or host installers from candidate sources
- preserve creator identity, license, and provenance in drafted manifests
- never hand-edit generated credit evidence in this router

## Handoff

Report scope, units, rights posture, required refusals, check/eval results, and required downstream maintainer handoff with evidence.
