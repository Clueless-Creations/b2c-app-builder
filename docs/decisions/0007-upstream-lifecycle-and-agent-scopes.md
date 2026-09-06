# 0007: Upstream lifecycle handoff, relationship kinds, version facts, and agent scopes

- **Status:** accepted
- **Date:** 2026-09-06
- **Steward:** architecture steward session of 2026-09-06 (Claude Code)
- **Authority:** the founder's request to work through the 2026-09-06 review of the agent-facing architecture surfaces; merging this record is the founder's acceptance
- **Affected rules and contracts:** ARCH-06, ARCH-07, ARCH-09; refines [ADR-0005](0005-source-adoption-and-upstream-maintenance.md); no `b2c/v1` or `b2c.contribution/v1` change
- **Affected units:** none new

## Context and evidence

ADR-0005 made upstream identity a kind of truth and gave the repository three
agent scopes. Four gaps remained at `ac12b683`:

- The contract enforces an upstream identity before a reusable repository unit
  can be accepted (`kernel/contribution/accepted-upstreams.ts:29`, error
  `upstream_required`), but the maintainer router claimed the whole of
  `catalog/upstreams/` (`agents/skills/b2c-maintainer/SKILL.md:53`) and
  ADR-0005's boundary statement said the same
  (`0005-source-adoption-and-upstream-maintenance.md:167`). The contributor
  router's lifecycle never mentioned the manifest
  (`agents/skills/b2c-contributor/SKILL.md:31`). A contributor could not reach
  acceptance without writing a file the documentation assigned to someone else.
  The RevenueCat, PostHog, and screenshot adoptions each wrote the manifest with
  the contribution in practice.
- The three scopes were documented in `agents/skills/README.md:11` and in the
  adoption guide (`docs/guides/adopt-external-sources.md:12`), but the root
  `AGENTS.md` read order sent every repository agent through the business skill
  first (`AGENTS.md:35-38`). An agent adopting a screenshot library reasoned
  as a business worker before it found the contributor router.
- The seven relationship kinds exist in the contract
  (`contracts/contribution/contract.ts:252`) and every shipped manifest uses
  them, but no guide listed them or said what a kind decides. The guide named
  five version facts by example (`adopt-external-sources.md:165`) without a
  rule. ARCH-07's ownership table had no upstream row
  (`docs/north-star-architecture.md:193-205`) although ADR-0005 said it
  gained one.
- Builder-internal migration vocabulary reached business workers. The workspace
  `AGENTS.md` template told a consumer-app agent to follow ARCH-04, ARCH-09,
  ARCH-11 and roadmap U26 (`surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md:100`),
  and the template `CLAUDE.md` restated that whole section instead of pointing
  at the canonical guide (`surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md:13-21`).
  The Route Ladder workflow instructions named roadmap U26
  (`catalog/workflows/build-release.ts:564`), and one knowledge reference
  still does (`knowledge/engineering/xcodebuildmcp-testing.md:14`). No check
  kept an adapter thin or a workspace template free of repository internals.

## Alternatives

1. **Add `Upstream` as a business primitive beside capability, provider,
   recipe, knowledge, and evidence.** Rejected. A business does not care who
   maintains a screenshot utility unless compatibility or execution changes.
   Upstream is provenance and maintenance metadata for the supply side. ADR-0005
   already places it under `catalog/upstreams/`, outside the business ontology.
2. **Maintenance creates every manifest, before or after contributor
   acceptance.** Rejected. `accepted-upstreams.ts` refuses acceptance without the
   manifest, so the contributor would block on a maintainer for a file whose
   facts (source, revision, notice, rights) the contributor already holds.
3. **Extend the relationship enum with `informed-by` and `wrapped-tool`.**
   Rejected. An informational citation is a source-registry row with a
   derivation of kind `informed`; giving it a manifest would make every cited
   blog post a maintained upstream. A wrapper is an adapter over an existing
   kind (`external-executable`, `direct-dependency`, or `remote-service`);
   `credits.use` already records `wrapped`. No schema change is needed.
4. **Document the lifecycle handoff, the existing vocabulary, and the version
   facts; move the three-scope table to the root; add one repository check for
   adapters and workspace templates.** Accepted.

## Decision

Ownership of an upstream relationship follows the lifecycle. The contributor
proposes `catalog/upstreams/<id>.yaml`, its notice, and its source-registry rows
when an accepted unit adapts, reuses, wraps, or vendors repository material.
Review reads the manifest with the adoption map. From the release that ships
the manifest, maintenance owns its baselines, observations, upgrade plans,
support ranges, review status, and credits. ADR-0005's boundary statement now
reads with this qualification: maintenance writes `catalog/upstreams/` after
release; the contributor writes the initial manifest as part of a contribution
root under review. An informational citation never receives a manifest.

The relationship vocabulary is the contract's existing
`UPSTREAM_RELATIONSHIP_KINDS`: `external-executable`, `direct-dependency`,
`selected-skill-guidance`, `adapted-method`, `copied-code`, `template-or-asset`,
and `remote-service`. A project may hold several. The kind decides whether code
executes, which notice travels, what an upgrade can break, which check applies,
and whether a business worker ever sees the project.

Five version facts stay in their own fields: the latest observed release, the
reviewed baseline, the supported range, the workspace pin, and the executable or
service observed at execution. Upstream latest is not the reviewed baseline. The
reviewed baseline is not the supported range. The supported range is not a
workspace upgrade. ARCH-06 gains this paragraph.

Upstream guidance is subordinate. The mandate, then the selected recipe, then
the capability contract, then the selected provider outrank an adopted
project's README, `SKILL.md`, or agent files. Upstream guidance cannot add a
business requirement, widen provider permissions, install tooling, change
provider selection or business state, override evidence requirements, redefine
completion, publish, or spend unless the selected operation permits that
behavior. ARCH-09 gains this sentence beside its package-instruction rule.

ARCH-07 gains the row ADR-0005 promised: external project identity, license
evidence, baselines, support, and adaptations are owned by the upstream
manifest; knowledge manifests, provider contracts, and generated credits and
support reports reference it.

The root `AGENTS.md` opens with the three-scope routing table and the read order
sends each agent to its scope's router. Agent-facing files fall into three
classes: canonical authored (`AGENTS.md`, `SKILL.md`, the two routers, the
workspace `AGENTS.md` template), thin adapters (`CLAUDE.md`, the template
`CLAUDE.md`, the template Cursor rule), and generated. A workspace-facing file
may name public operations, workspace contracts, selected providers, accepted
recipes, and evidence requirements. It never names an `ARCH-xx` rule, a
roadmap unit, a repository path, an upstream-maintenance procedure, or
contributor machinery. `checks/validation/repository/check-agent-entrypoints.ts`
(`npm run check:agent-entrypoints`) enforces the router table, the adapter
pointer, no restated canonical heading or line, and the workspace-facing
exclusions.

Coverage is a maintainer invariant, not a business one: before a release, the
maintainer asks which referenced repositories still lack an upstream identity.
A reusable dependency, method, or tool needs one; a citation does not.
`kernel/contribution/upstream-coverage.ts` is the single owner of that queue. It
projects active, bound knowledge source declarations into
`docs/upstreams/coverage-report.md`; `npm run render:credits` writes the report
and `npm run check:credits` fails on drift (`67404dcb`). The report infers no
adoption, permission, or credit from a URL.

## Compatibility and migration

No `b2c/v1` input, output, error code, tool name, or CLI command changes. No
`b2c.contribution/v1` field changes; the vocabulary this record names already
validates every shipped manifest. Saved fixtures keep passing.

The workspace templates change, so the version is bumped and the generated
catalog is re-rendered. Every term `check:continuity-contract` requires of the
template `AGENTS.md`, `CLAUDE.md`, and Cursor rule is preserved. The rewritten
mobile section names the public capability `b2c/mobile-app-operation` in place
of ARCH and roadmap IDs. A business bootstrapped from the old template keeps
working; it receives the new text on its next entrypoint install.

The root `AGENTS.md` still cites ARCH rules and roadmap units for repository
work. The exclusion applies to workspace-facing files only.

## Acceptance

| #   | Proof                                                                                                                                   | Suite or gate               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | The shipped guides, routers, adapters, and templates pass; an adapter that restates a canonical heading or line fails                    | `agent-entrypoints` fixture |
| 2   | A workspace template that names an ARCH rule, a roadmap unit, a repository path, or contributor machinery fails                          | `agent-entrypoints` fixture |
| 3   | A root `AGENTS.md` that drops one router, or an adapter that drops its `AGENTS.md` pointer, fails                                        | `agent-entrypoints` fixture |
| 4   | The template entrypoints keep every required continuity term after the rewrite                                                          | `check:continuity-contract` |
| 5   | Every shipped manifest still validates against the unchanged relationship enum, and credits render without drift                        | `check:upstreams`, `check:credits` |
| 6   | The Route Ladder instruction change renders into the catalog and hosted bundle without drift                                            | `check:catalog`, `check:hosted-bundle`, `check:evidence-schema-drift` |

A passing gate proves the documented contract holds on the files it reads. It
does not prove that an agent read the right router.

## Boundary statement

This record moves no truth owner except the initial write of an upstream
manifest, which becomes part of a contribution root under review. Maintenance
still owns the manifest after release. Business execution still reads only the
active knowledge bundle for the selected workflow and its workspace pins.
Nothing here installs, upgrades, executes upstream code, or changes a workspace
pin.

## Consequences

- `AGENTS.md`, `agents/skills/README.md`, both routers,
  `docs/guides/adopt-external-sources.md`, `CONTRIBUTING.md`, `README.md`,
  `docs/README.md`, and `docs/architecture.md` carry the handoff, the vocabulary,
  the version facts, and the hierarchy. ARCH-06, ARCH-07, and ARCH-09 carry the
  rule text.
- `knowledge/engineering/xcodebuildmcp-testing.md:14` named roadmap U26 in a
  worker-facing reference. This change replaces the phrase with the mobile app
  operation contract.
- The coverage projection landed in `67404dcb`. This record names the invariant
  it serves; the maintainer router points at the generated report.
- Notice propagation into generated outputs remains the open follow-up from
  ADR-0005, owned by the composition activation owner.
- Founder-reserved decisions are unchanged.
