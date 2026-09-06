# Upstreams

One manifest per external project the builder relies on, with its notice, its observations, and the commands that read them.

## Files

- `<id>.yaml` is the authored manifest. It records identity, authors, license evidence, source-registry ids, relationships to local owners, reviewed baselines, the support claim, intentional adaptations, the read-only host probe, and the review cadence.
- `notices/<id>.txt` is the verbatim license text of the upstream. `license.evidence_sha256` in the manifest is its digest. The text keeps the original author's name.
- `observations/<id>.json` is a dated read of the upstream and the host, written by `b2c contribute upstream-check --write`. It records the latest stable release with its asset digests, the branch head, releases since the reviewed baseline, the license digest, and the executables found on PATH.

## Commands

- `b2c contribute upstreams` prints the inventory. It joins each manifest with source-registry rows, freshness snapshots, knowledge packages, provider contracts, the lockfile, and the recorded observation.
- `b2c contribute upstream-check --upstream <id> [--fetch] [--observe-host] [--write]` compares the baseline, the support claim, the latest release, the license, and the host executable. Fetching, probing, and writing happen only with the flag.
- `b2c contribute upgrade-plan --upstream <id> [--candidate <tag>] [--target <dir>]` writes a bounded upgrade plan and a contribution manifest. It changes no support claim and no workspace pin.
- `npm run check:upstreams` validates manifests, notices, owner paths, deferrals, and observation age.

## Rules

- Unknown stays unknown. A missing observation, a failed fetch, or an absent executable is recorded as an unknown, never as current.
- Nothing here executes upstream code. The host probe runs the declared version command and nothing else.
- A manifest grants nothing. Support claims, unsupported operations, and adaptations change only through review.
- Observations carry no URLs. Release notes are summarized with links replaced by a marker and author handles removed.
