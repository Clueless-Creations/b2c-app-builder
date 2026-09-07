# Recommended Agent Skills

Use this before an Expo or SwiftUI implementation session.

Use it when the session needs an external agent skill pack for craft, motion, or store work.

This file is not a substitute for B2C App Builder validators. B2C App Builder owns graph execution, evidence, and done gates. External packs reduce craft mistakes inside a build session.

Do not install a vendor MCP as a B2C App Builder default. Do not vendor a pack without a LICENSE file.

## Contents

- 1. Default Expo Path
- 2. Opt-In Packs
- 3. Skip List
- 4. Install Commands
- 5. Evidence Rule
- 6. MCP Server Evaluation
- 7. Periodic Audit

## 1. Default Expo Path

Install these packs for Expo businesses after founder approval:

- `expo/skills` — Expo Router, native UI, EAS, and store guidance from Expo.
- `emilkowalski/skills` — use `animate-expo` and `review-animations` before motion evidence is accepted.

Do not install the whole Emil Kowalski pack as a hard catalog provider. Load the two named skills for polish.

## 2. Opt-In Packs

Use these packs only when the product path matches:

- `Appllama/appllama-skills` `appllama-app-design-skill` — optional implementation companion for Expo/React Native mobile craft. B2C App Builder already adapts its cross-platform flow, native-fidelity, anti-generic, motion, and verification principles in `knowledge/design/mobile-flow-craft.md`; load the upstream skill when its stack-specific recipes improve the selected implementation.
- `Appllama/appllama-skills` `appllama-usage` — only when the acting user has independently authorized Appllama MCP access and the task needs its proprietary mobile-design evidence. Let the upstream skill own provider syntax, credits, pagination, and media behavior. B2C App Builder owns the research question, evidence contract, and adoption decision.
- `vercel-labs/agent-skills` React Native skill — only after a LICENSE file exists on that repo.
- `twostraws/SwiftUI-Agent-Skill` — SwiftUI archetype or a native SwiftUI brownfield app only.

Do not install an external skill merely because B2C App Builder cites methods derived from it. The internal doctrine is sufficient when the provider/stack-specific instructions add no value.

## 3. Skip List

Do not add these to the default B2C App Builder surface:

- The full Vercel labs pack (web and deploy skills).
- Appeeky MCP or any paid UA vendor MCP.
- Appllama MCP as an automatic/default dependency. It is optional, user-authorized design evidence when available.
- Bulk install of every skill named in a social roundup.

## 4. Install Commands

Run with founder approval. Do not treat install as a done gate.

```bash
npx skills add expo/skills --skill '*' --yes
npx skills add emilkowalski/skills --skill animate-expo --skill review-animations --yes
```

Optional Appllama implementation skill for a matching Expo/React Native session:

```bash
npx skills@latest add appllama/appllama-skills --skill appllama-app-design-skill
```

If Appllama MCP is independently connected and authorized for the user, load `appllama-usage` through the host's skill mechanism. Do not install or authorize the MCP merely because a workflow can use it.

Optional ASO pack (see `aso-store-ops.md`):

```bash
npx skills add Eronred/aso-skills --skill '*' --yes
```

## 5. Evidence Rule

A skill pack cannot mark a lane done. Device proof, store evidence, and `check:*` gates remain required.

Record the installed pack name in `engineering/ENGINEERING_PLAN.md` when a session used it. When provider evidence was used, record the resolved reference through the design evidence/rubric contract rather than treating skill installation as evidence.

## 6. MCP Server Evaluation

Check five things before approving a new vendor MCP:

- a recent release
- a complete README with setup examples
- automated tests or CI
- an open-source license for any client material we intend to adopt; a hosted service may have separate terms
- a use case this repo's own MCP does not already cover

Record the actual contributor count next to any star count. Star count alone does not show maintenance health.

Before installing, compare the package's claimed capability against its unpacked size. Run `npm view <package> --json | grep unpackedSize`. A tool that claims many local capabilities in a few kilobytes is often a thin network client, not a local implementation. Read the source when the size and the claim disagree.

Prefer a familiar CLI over an unfamiliar vendor MCP schema for a standard integration. A model often already knows a familiar CLI from training data. Reserve a vendor MCP for a proprietary API or evidence corpus where the provider owns information we cannot reproduce locally.

Record the check date, outcome, contributor count, last-release date, access/terms boundary, and selected role in `strategy/TOOL_DECISIONS.md` next to the install decision.

## 7. Periodic Audit

Review installed skill packs every quarter. Drop a pack once no lane in `state/business-state.json` still names it. Record the removal in `engineering/ENGINEERING_PLAN.md`.
