# Upstream reports

This directory holds the committed snapshot of the builder's upstream relationships.

`catalog/upstreams/*.yaml` is the source of truth. Each manifest records one external project: its authors, license, retained notice text, reviewed baselines, support claim, adaptations, review cadence, and credit decision. `tooling/render-credits.ts` renders three files from those manifests, the notice texts under `catalog/upstreams/notices/`, and the observations under `catalog/upstreams/observations/`:

- `ACKNOWLEDGMENTS.md` at the repository root credits the projects and people the builder runs, wraps, or adapts.
- `THIRD_PARTY_NOTICES.md` at the repository root carries the verbatim license notices for incorporated material.
- `support-report.md` in this directory is the maintainer view: baselines, supported ranges, observations, review dates, unsupported operations, adaptations, and unknowns.

Regenerate them with `npm run render:credits`. `npm run check:credits` fails when a rendered file is stale. Edit the manifests, not the rendered files.

`b2c contribute upstreams` is the live read model over the same manifests plus the source registry, lockfiles, and recorded observations. The support report is the committed snapshot of that view at the last render. Workers never receive these files as instructions.
