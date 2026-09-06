# Refero UX Pattern Research And Baseline Flows

Use this before designing or auditing web/mobile screens, onboarding, signup, permissions, paywalls, restore purchases, settings, support, privacy/legal, account deletion, referral/share, empty states, loading states, error recovery, or web funnels.

Refero should improve pattern quality without replacing this skill's conversion doctrine. The onboarding playbook in `onboarding-conversion.md` remains the default unless a named experiment is approved.

## Contents

- Source Basis
- Paid-Tool Routing
- Refero Research Workflow
- Default Query Pack
- Baseline Pattern Pack
- UX Pattern Artifact Contract
- Flow Quality Gates
- Common Failures

## Source Basis

Refresh these current docs before writing setup instructions or tool calls:

- docs index: `https://doc.refero.design/llms.txt`
- MCP Getting Started: `https://doc.refero.design/mcp/getting-started`
- Tools: `https://doc.refero.design/mcp/tools`
- Data Model: `https://doc.refero.design/mcp/data-model`
- Examples: `https://doc.refero.design/mcp/examples`
- Refero Skill overview: `https://doc.refero.design/skill/overview`

Current docs state that Refero MCP connects agents to styles, real product screens, and user flows; Refero Pro is required; the MCP server URL is `https://api.refero.design/mcp`; auth may be OAuth or `Authorization: Bearer <token>`.

Current Refero screen and flow filters are `web` and `ios`. For Android launches, use Refero iOS/mobile records for journey structure only, then adapt controls, navigation, permissions, billing, and screenshots to Android conventions with Android-native references and device testing. Do not claim Android-specific UX proof from Refero alone unless Refero adds Android support and the current docs confirm it.

## Paid-Tool Routing

Refero is paid/account-gated. Missing runtime access is not permission to switch to a weaker route.

Before using any fallback:

1. Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md).
2. Ask the founder whether they have Refero, will provide an export/screenshots, want to sign up, or approve the free baseline route.
3. Record the answer in `strategy/TOOL_DECISIONS.md` and `state/business-state.json.providers.refero`.
4. If approved fallback is used, copy or adapt `business/product/experience/ux-patterns/UX_PATTERNS.md` and `business/product/experience/ux-patterns/ux-patterns.html`.

## Refero Research Workflow

Use all three layers when access exists:

1. **Styles** for visual direction.
   - `refero_search_styles`: search 3-5 directions by category, mood, audience, and visual role.
   - `refero_get_style`: inspect 1-4 strongest styles.
   - Record north star, colors, type, spacing, surfaces, components, imagery, do/don't rules, and what will not be copied.
2. **Screens** for concrete UI decisions.
   - `refero_search_screens` with `platform: "web"` or `platform: "ios"`.
   - `refero_get_screen` for selected UUIDs.
   - `refero_get_similar_screens` when one screen is especially relevant.
   - Use `refero_get_screen_image` only when metadata is not enough.
3. **Flows** for journey logic.
   - `refero_search_flows` with `platform: "web"` or `platform: "ios"`.
   - `refero_get_flow` for selected numeric flow IDs.
   - Record step count, entry point, exit point, user goal, action, system response, friction, recovery, and completion state.

Avoid old `_tool` names, `get_design_guidance`, numeric screen IDs, `limit`/`offset` search params, or copying a single source directly.

## Default Query Pack

Run or adapt these by product category:

| Surface             | Refero query examples                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual direction    | `premium consumer mobile app website`, `playful health app onboarding`, `developer tool website product screenshots`, `editorial productivity app landing` |
| Onboarding          | `signup onboarding`, `ios onboarding progress question`, `personalized plan onboarding`, `permission request onboarding`                                   |
| Attribution         | `how did you hear about us onboarding`, `signup source question`, `referral attribution onboarding`                                                        |
| Paywall             | `ios paywall annual weekly lifetime`, `subscription onboarding paywall`, `pricing page annual monthly toggle`, `trial paywall restore purchases`           |
| Restore and billing | `restore purchases settings`, `billing settings cancellation modal`, `subscription cancellation with retention offer`                                      |
| Account and trust   | `account deletion feedback`, `privacy settings`, `support contact form`, `password reset 2FA`                                                              |
| Product states      | `dashboard empty state`, `offline error state`, `loading skeleton mobile`, `permission denied state`                                                       |
| Sharing and growth  | `invite friends referral`, `share result mobile`, `social proof onboarding`                                                                                |

## Baseline Pattern Pack

If Refero is unavailable and fallback is founder-approved, still produce a useful UX pattern packet:

- Copy `business/product/experience/ux-patterns/UX_PATTERNS.md` to the app root.
- Copy `business/product/experience/ux-patterns/ux-patterns.html` or route the same pattern board into `design/design-room.html`.
- Keep `product/ONBOARDING.md` based on `onboarding-conversion.md`, not generic inspiration.
- Use public or first-party references only as evidence summaries; do not paste copyrighted screenshots unless permitted.

Baseline patterns are not a substitute for category-specific research. They are a safety net that prevents common bugs and broken UX flows.

## UX Pattern Artifact Contract

`UX_PATTERNS.md` must contain:

- **Refero Route**: docs checked, auth/MCP state, queries run, selected styles/screens/flows, and source links or IDs.
- **Fallback Route**: founder approval, fallback source, limitations, and what was not verified.
- **Pattern Inventory**: critical surfaces, platform, user goal, pattern choice, states, analytics, implementation owner, and proof artifact.
- **Flow Map**: step-by-step maps for onboarding, purchase/upgrade, restore, cancellation/retention, account deletion, support, and web funnel where relevant.
- **State Matrix**: empty, loading, error, offline, permission denied, premium locked, restored purchase, success, and destructive confirmation states.
- **Bug Traps**: known UX/UI failure modes with prevention checks.
- **Source Ledger**: which references informed each decision and which were rejected.

`ux-patterns.html` must render:

- pattern inventory table
- mobile flow strip
- web funnel strip when web is in scope
- state matrix
- bug-trap checklist
- source/fallback note

## Flow Quality Gates

Before build handoff:

- The flow has one primary job per screen.
- Every required question changes personalization, attribution, lifecycle messaging, setup, or risk control.
- No critical action is icon-only without label or accessible name.
- Back, close, restore, support, privacy, and terms behavior is explicit.
- Loading, error, offline, permission denied, and empty states are not left to implementation guesswork.
- Paywalls show restore purchases and clear price/trial/renewal language.
- Account deletion and cancellation flows avoid dark patterns and preserve confirmation/recovery steps.
- UX patterns are tied to `analytics/ANALYTICS.md` events and `engineering/PRODUCTION_READINESS.md` tests.

## Common Failures

- Refero findings are copied as aesthetics without adapting to product strategy.
- A single screenshot becomes the whole design system.
- Onboarding references remove self-reported attribution, restore purchases, privacy links, or backend persistence.
- Paywall references add urgency or scarcity that the product cannot truthfully support.
- Web funnel inspiration ignores mobile app entitlement, restore, and subscription-state edge cases.
- Pattern docs exist but no HTML proof exists, so cramped copy and missing states are discovered during implementation.
