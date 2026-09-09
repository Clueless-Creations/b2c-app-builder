# Official RevenueCat and PostHog agent tooling

This is a contribution and upstream-maintenance guide, not an instruction to connect a business or run a provider setup wizard.

## Architecture and ownership

This contribution uses ADR-0005 and ARCH-02, ARCH-04, ARCH-06, ARCH-07, ARCH-09 and ARCH-11. It introduces no new public contract, store, scheduler, provider authority, or automatic update mechanism. Existing `catalog/upstreams` manifests own source identity and notices; knowledge manifests own the derivation and applicability; native dependency locks and host readback own actual tool versions. The existing extension `thirdParty` contract carries the notices with adapted package resources.

The canonical sources are `RevenueCat/ai-toolkit`, `RevenueCat/cli`, `PostHog/wizard`, and the unadopted `PostHog/context-mill` candidate. Their repository addresses and immutable reviewed revisions live in `catalog/upstreams`, not another editable list here. Each manifest names the selected source paths, local consumers, review owner, limitations, and verification routes.

## Adoption map

| Source                | Local use                                                                                                             | Deliberate boundary                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RevenueCat AI toolkit | Selected project, integration, identity, entitlement and testing procedures in the RevenueCat agent-tooling reference | Do not install all plugins. The separate Play Billing plugin is not adopted. App authentication and entitlement truth remain distinct.                                   |
| RevenueCat CLI        | Schema discovery, exact project selection, setup-effect review, a typed host-executable adapter, and fixture-wired catalog/verify/preview/Test Store routes | No host CLI was installed or authenticated. Support is qualified against release v0.1.1, not the later source head. `rc` is not Rork's `asc`. Live Test Store proof remains founder-gated. |
| PostHog wizard        | Setup preflight, scoped disclosure review, identity and first-session measurement procedures in the PostHog reference | No default source upload, SDK auto-configuration, replay, production project change, or generated event taxonomy.                                                        |
| PostHog context mill  | Maintainer inventory and upgrade candidates only                                                                      | The reviewed revision had no root license. No skill text, example, source or generated bundle was imported. A wizard license is not a license for this separate project. |

The adapted RevenueCat identity guidance resolves a conflict: the inspected upstream skill overstates anonymous-to-identified purchase merging and forbids direct identified-account switching. The official customer identity documentation describes conditional merging and permits direct `logIn` between identified accounts. The source baseline, correction and applicable documentation are recorded with the adaptation. Verify this again on refresh rather than blindly taking either version.

The PostHog wizard can transmit source to an AI gateway. Disabling telemetry does not disable source upload. Setup must show those effects and obtain the appropriate authority before execution. An upstream example with fake authentication is not an authentication implementation. None of the imported advice may waive the builder's onboarding foundation gates.

## Normal contribution process

Start with `b2c contribute plan` and the explicit source and target. Inspect the existing upstream identity before creating another. Preserve the source author's notices; do not relabel adapted text as original. Choose the smallest useful method or supported operation and document omissions.

Before accepting externally adopted repository material, run `b2c contribute check` against its contribution root. Accepted units must have an exact source commit, canonical upstream and source-registry mapping, a maintained acknowledgment decision, verified applicable rights, and a source-to-local derivation for adaptations. MIT-derived material must retain the correct source's notice with matching bytes and coverage. An unrelated project's notice does not satisfy this requirement. Proposed work may retain explicit unknowns; unknown rights never establish permission to redistribute.

The example under `examples/contributions/official-provider-tooling` records the real reviewed inputs and proposed adoption. Its tests exercise acceptance separately. Neither a passing manifest nor a merged guide certifies live provider support. The RevenueCat CLI wrap unit stays proposed: fake-process discovery and process-safety tests exist; host installation and authenticated execution remain founder-gated.

Update `catalog/upstreams`, source-registry entries, knowledge provenance, relevant tests and notices together. Run `npm run render:all`, `npm run render:evidence-schema-version`, `npm run check:upstreams`, `npm run check:credits` and the focused tests. The renderer derives acknowledgments and the support report from those records. It also puts required notices in the pinned package with exact resource coverage. Do not manually edit generated credits or package snapshots.

## Review upstream changes

Use `b2c contribute upstream-check` for an explicit bounded metadata check and `b2c contribute upgrade-plan` to propose a candidate. Consult command help for required arguments. Fetching is opt-in and maintainer-side; contributor MCP stays read-only and local-only. No scheduled updater or CI configuration is enabled by this contribution.

Review both releases and source commits. Skills may change between releases. A changed reviewed commit appears as unknown impact and points to mapped local consumers even when the release tag did not change. That signal does not prove ancestry, breaking behavior, or compatibility. Inspect the source diff and preserve intentional local deviations.

Keep these states distinct: latest observed release, reviewed guidance commit, builder-supported operations, workspace-selected package, and the actual executable or remote catalog used at execution. A stable release can predate a reviewed source commit. A version range is not verification. Newly advertised features remain unsupported until mapped, authorized and tested.

A generated plan does not run the wizard, update a binary, change the approved provider, remove a rights hold, or repin a business. Prepare a normal reviewed contribution for those changes. If a genuinely new host capability or authority model is required, discuss the architecture change before implementing it.

## Proof and limitations

Run `npm run test:fixtures -- official-upstreams` for source-specific acceptance, release and commit drift, notice propagation and routing tests. Existing contribution, upstream, package-notice and onboarding suites remain in force.

This contribution has source-review and fixture evidence only. It does not install RevenueCat or PostHog, upload source, exercise live credentials, prove purchases or event delivery, or upgrade existing businesses. The context-mill rights hold is intentional and visible, not incomplete work disguised as adoption.
