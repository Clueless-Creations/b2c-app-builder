# Acknowledgments

B2C App Builder is built on open-source work and adapts published methods. This file credits the projects and people that power it. It lists actual use or adaptation only, never candidates that were merely inspected. Legal notices are separate, in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Open-source projects we run or wrap

**App Store Connect CLI (asc)**

- Original author: Rudrank Riyam, original author and copyright holder (LICENSE, 2026)
- Current maintainer: Rork (github.com/rorkai), maintaining organization and release publisher
- License: MIT (verified)
- Canonical URL: https://github.com/rorkai/App-Store-Connect-CLI
- Contributes: Automates App Store Connect reads, validation, dry runs, and founder-gated store actions through the installed asc executable. The builder adapts its command procedures and refuses the commands it does not support.
- How we consume it:
  - external-executable: The `asc` executable found on the host PATH runs App Store Connect reads, validation, dry runs, and founder-gated store actions. It is not package-managed by the builder and no workspace pin freezes it.
  - adapted-method: Command procedures, the auth ladder, safe automation boundaries, and the verified command cookbook are reauthored from the CLI README, local `asc --help` output, and release notes into the builder's own vocabulary.

## Methods and guidance we adapted

**ASO and App Marketing Skills**

- Original author: Erencan, original author or copyright holder identified in the reviewed source
- License: MIT (verified)
- Canonical URL: https://github.com/Eronred/aso-skills
- Contributes: Selected ASO and App Marketing Skills methods inform knowledge/store/screenshot-toolchain.md, knowledge/store/app-store-listing-prep.md, knowledge/process/tool-recipes/growth-and-store-routing.md. Original authors and license notices are retained; no live integration is claimed.
- How we consume it:
  - adapted-method: Selected published methods and tool procedures are adapted into existing builder guidance. No whole skill, executable, native dependency or asset was installed by this contribution.

**serve-sim**

- Original author: Evan Bacon, project author identified by reviewed package metadata; no project-specific copyright line in root LICENSE
- License: Apache-2.0 (verified)
- Canonical URL: https://github.com/EvanBacon/serve-sim
- Contributes: Selected serve-sim methods inform knowledge/engineering/xcodebuildmcp-testing.md, knowledge/process/tool-recipes/device-capture-and-proof.md. Original authors and license notices are retained; no live integration is claimed.
- How we consume it:
  - adapted-method: Selected published methods and tool procedures are adapted into existing builder guidance. No whole skill, executable, native dependency or asset was installed by this contribution.

**App Store Screenshots**

- Original author: Parth Jadhav, original author or copyright holder identified in the reviewed source
- License: MIT (verified)
- Canonical URL: https://github.com/ParthJadhav/app-store-screenshots
- Contributes: Selected App Store Screenshots methods inform knowledge/store/screenshot-toolchain.md, knowledge/store/app-store-listing-prep.md, knowledge/store/store-console-workflow.md. Original authors and license notices are retained; no live integration is claimed.
- How we consume it:
  - adapted-method: Selected published methods and tool procedures are adapted into existing builder guidance. No whole skill, executable, native dependency or asset was installed by this contribution.

**PostHog wizard**

- Original author: PostHog, publishing organization and copyright holder per root LICENSE
- License: MIT (verified)
- Canonical URL: https://github.com/PostHog/wizard
- Contributes: Selected procedures inform knowledge/data/posthog-agent-tooling.md. Original notices are retained; no whole-project integration or live support is claimed.
- How we consume it:
  - adapted-method: Adapt selected setup and verification procedures as subordinate guidance; no upstream scripts, SDK binaries, or top-level skills are installed.

**RevenueCat AI Toolkit**

- Original author: RevenueCat, publishing organization and copyright holder per root LICENSE
- License: MIT (verified)
- Canonical URL: https://github.com/RevenueCat/ai-toolkit
- Contributes: Selected procedures inform knowledge/money/revenuecat-agent-tooling.md. Original notices are retained; no whole-project integration or live support is claimed.
- How we consume it:
  - adapted-method: Adapt selected setup and verification procedures as subordinate guidance; no upstream scripts, SDK binaries, or top-level skills are installed.

**RevenueCat CLI**

- Original author: RevenueCat, publishing organization and copyright holder per root LICENSE
- License: MIT (verified)
- Canonical URL: https://github.com/RevenueCat/cli
- Contributes: Selected procedures inform knowledge/money/revenuecat-agent-tooling.md. Original notices are retained; no whole-project integration or live support is claimed.
- How we consume it:
  - adapted-method: Adapt selected setup and verification procedures as subordinate guidance; no upstream scripts, SDK binaries, or top-level skills are installed.

**App Store Connect CLI skills (asc skill pack)**

- Original author: Rudrank Riyam, original author and copyright holder (LICENSE, 2026)
- Current maintainer: Rork (github.com/rorkai), maintaining organization; community-maintained, unofficial, not affiliated with Apple
- License: MIT (verified)
- Canonical URL: https://github.com/rorkai/app-store-connect-cli-skills
- Contributes: Community skill pack for the asc CLI. The builder routes selected skills by name as subordinate guidance and installs the pack only with founder approval.
- How we consume it:
  - selected-skill-guidance: Selected skill names (asc-cli-usage, asc-metadata-sync, asc-shots-pipeline, asc-screenshot-resize, asc-release-flow, asc-submission-health, asc-revenuecat-catalog-sync, asc-analytics-reports, asc-ad-hoc-distribution, and the rest of the routed list) are loaded as subordinate reference material when a store workflow selects them. Installation happens only with founder approval through `asc install-skills` (pinned by the CLI to a reviewed commit) or `npx skills add`. No SKILL.md is auto-installed as a top-level builder skill.

**SnapshotPreviews**

- Original author: Emerge Tools, original author or copyright holder identified in the reviewed source
- Current maintainer: Sentry (getsentry), current upstream maintainer
- License: MIT (verified)
- Canonical URL: https://github.com/getsentry/SnapshotPreviews
- Contributes: Selected SnapshotPreviews methods inform knowledge/engineering/xcodebuildmcp-testing.md, knowledge/process/tool-recipes/device-capture-and-proof.md. Original authors and license notices are retained; no live integration is claimed.
- How we consume it:
  - adapted-method: Selected published methods and tool procedures are adapted into existing builder guidance. No whole skill, executable, native dependency or asset was installed by this contribution.

**XcodeBuildMCP**

- Original author: Cameron Cooke, original author or copyright holder identified in the reviewed source
- Current maintainer: Sentry (getsentry), current upstream maintainer
- License: MIT (verified)
- Canonical URL: https://github.com/getsentry/XcodeBuildMCP
- Contributes: Selected XcodeBuildMCP methods inform knowledge/engineering/xcodebuildmcp-testing.md, knowledge/process/tool-recipes/device-capture-and-proof.md. Original authors and license notices are retained; no live integration is claimed.
- How we consume it:
  - adapted-method: Selected published methods and tool procedures are adapted into existing builder guidance. No whole skill, executable, native dependency or asset was installed by this contribution.

## Optional managed services

**Layers Growth MCP and CLI**

- Original author: Layers, copyright holder of the public MCP description repository (LICENSE, 2026) and operator of the hosted service
- Current maintainer: Layers (github.com/layers), maintaining organization
- License: MIT (verified)
- Canonical URL: https://github.com/layers/mcp
- Contributes: Optional managed growth provider. The builder ships a contribution package and adapter with fixtures only; it does not sign a business into Layers and its tests make no live call.
- How we consume it:
  - remote-service: The hosted MCP endpoint is reached through the `layers` CLI stdio proxy after a separately authorized business signs in. The builder ships a contribution package (examples/extensions/layers-growth) that declares draft creative generation plus job and result reads, an adapter with a fake transport, and an onboarding contract. No business is onboarded by the builder and no live call is made by its tests.
  - adapted-method: Tool names, setup steps, credit rules, and the quoteOnly behavior in examples/extensions/layers-growth/integration.md are reauthored from the layers/mcp README (MIT); the retained notice is examples/extensions/layers-growth/LICENSE-layers-mcp.txt

Generated by tooling/render-credits.ts from catalog/upstreams. Edit the manifests, not this file.
