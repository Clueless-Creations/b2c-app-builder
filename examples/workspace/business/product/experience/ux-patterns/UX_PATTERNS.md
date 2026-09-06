# {{APP_NAME}} UX Patterns

This packet records Refero or founder-approved fallback UX research. It is a pattern contract, not a mood board. Do not copy one source directly; adapt observed patterns to this product's strategy, `DESIGN.md`, analytics, privacy, and implementation constraints.

## Refero Route

- Refero docs checked: Pending
- MCP/auth state: Pending
- Route selected:
  - [ ] Refero used
  - [ ] founder-provided Refero export used
  - [ ] founder-approved fallback used
  - [ ] blocked waiting for access
- Current docs basis to refresh before live use:
  - `https://doc.refero.design/llms.txt`
  - `https://doc.refero.design/mcp/getting-started`
  - `https://doc.refero.design/mcp/tools`
  - `https://doc.refero.design/mcp/data-model`
  - `https://doc.refero.design/mcp/examples`

If Refero is unavailable, stop for founder approval before using this free baseline route. Record the approval in `strategy/TOOL_DECISIONS.md`.

For Android launches, treat Refero iOS/mobile records as journey evidence, not Android-specific proof. Adapt controls, navigation, permission copy, billing, and screenshots to Android-native expectations and verify on Android before marking the Android UX lane launch-ready.

## Pattern Inventory

| Surface | Platform | User goal | Pattern choice | Required states | Analytics | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| Onboarding value promise | iOS/Android/web | Understand the app promise quickly | Product demo or guided promise before questions | loading, reduced motion, no video | `onboarding_started`, `demo_video_viewed` | `product/onboarding.html` |
| Self-reported attribution | iOS/Android/web | Tell where they found the app | Required early source question with stable keys and `other` text | validation, other text, privacy note | `attribution_source_selected` | `product/ONBOARDING.md`, `analytics/ANALYTICS.md` |
| Personalized plan | iOS/Android/web | See answers reflected back | Plan summary that mirrors user input | loading, edit/back, empty answers | `personalized_plan_viewed` | `product/onboarding.html` |
| Paywall | iOS/Android/web | Choose whether to buy | Value-first paywall with restore, trial/renewal clarity, and close behavior | loading prices, purchase error, restore, premium active | `paywall_viewed`, `purchase_completed`, `restore_succeeded` | `revenue/REVENUE_OPS.md` |
| Closing offer | iOS/Android/web | Reconsider after dismissing | Transparent downsell/trial/shorter commitment, no fake scarcity | accepted, rejected, expired, unavailable | `closing_offer_viewed`, `closing_offer_selected` | `product/onboarding.html` |
| Permissions | iOS/Android/web | Understand why access is needed | Explain-before-native-prompt with skip/retry path | denied, limited, retry, settings link | `permission_prompt_viewed`, `permission_result` | `design.md` |
| Empty state | app/web | Know what to do first | One primary action plus example content | loading, empty, error, offline | `empty_state_viewed`, `empty_state_cta_clicked` | `design/design-room.html` |
| Error recovery | app/web | Recover without losing work | Plain-language error, retry, contact/support path | network, validation, payment, auth | `error_shown`, `retry_clicked` | `engineering/PRODUCTION_READINESS.md` |
| Settings/account | app/web | Manage account and subscription | Grouped settings with billing, privacy, support, delete account | auth expired, restore, destructive confirm | `settings_viewed`, `account_delete_started` | `design.md` |
| Support/contact | app/web/email | Get help with purchase/account issues | Support form/email path with SLA and context | sent, failed, reply expected | `support_started`, `support_submitted` | `growth/EMAIL_OPS.md` |
| Referral/share | app/web | Share useful result or invite | Native share or copy link with clear value | copied, failed, unsupported | `share_started`, `share_completed` | `growth.html` |

## Flow Map

### Mobile Onboarding Playbook

Keep this sequence unless a named experiment is approved:

1. Value promise or short product demo.
2. One or more personalization questions that change the product experience.
3. Required attribution question within the first third of onboarding.
4. Personalized plan or result preview that reflects answers.
5. Review prompt only after a real delight moment and only through platform APIs.
6. Paywall after value is clear, with restore purchases and legal links.
7. Closing offer or reverse trial if monetization strategy supports it.
8. First activation task after purchase or before paywall when the model requires it.

### Web Funnel

1. Landing page states the product category, outcome, and proof.
2. CTA routes to waitlist, web purchase, or app-store preorder.
3. Form captures email, attribution, consent, and referral code where relevant.
4. Confirmation state explains next step and sends a branded Resend email.
5. If web purchase exists, Stripe/RevenueCat entitlement mapping is verified before the app claims access.

### Account, Billing, And Trust

1. Settings exposes restore purchases, subscription management, support, privacy, terms, and account deletion.
2. Billing errors explain the next action without blaming the user.
3. Destructive actions use confirmation and recovery where platform rules allow it.
4. Account deletion links match App Store and Google Play requirements.

## State Matrix

| State | UX rule | Build proof |
| --- | --- | --- |
| Loading | Preserve layout size; use skeletons or progress, not layout jumps. | UI test or screenshot |
| Empty | Explain why it is empty and offer one primary action. | `design/design-room.html` |
| Error | State what failed, whether work is safe, and how to retry/contact support. | E2E failure path |
| Offline | Show cached state where possible and a retry path. | simulator/network test |
| Permission denied | Explain consequence, alternate path, and settings route. | device test |
| Premium locked | Show value, price path, restore, and legal links. | purchase sandbox test |
| Restored purchase | Confirm access and update profile/backend entitlement. | RevenueCat/store proof |
| Destructive confirm | Use explicit object name, consequence, and cancellation path. | UI test |

## Bug Traps

- Attribution is visible but not persisted to analytics/person/backend.
- Paywall hides restore purchases or legal links.
- `Other` attribution has no free text.
- Permission prompt appears before the user understands why.
- Loading states resize buttons or cards.
- Empty states have no useful first action.
- Web purchase does not map to mobile entitlement.
- Account deletion exists in docs but not in the app/store console.
- Mobile text fits in English but clips at larger accessibility sizes.
- HTML proof uses different tokens than `DESIGN.md`.
- Motion uses ad-hoc durations instead of the tokenized `motion.*` scale.
- framer-motion / `motion` imports leak into the mobile binary (SwiftUI/Flutter) instead of staying on web surfaces.
- Animations ignore `prefers-reduced-motion`.
- Tappable controls are flat with no press state, so they feel broken.
- Everything animates (theme-park motion) instead of motion that clarifies what just happened.
- Haptics fire on navigation/scroll/every tap until they become noise.
- Keyboard covers the input or hides the submit button; dismissal is jarring or impossible.
- Loading shows a bare spinner and layout jumps instead of a size-preserving skeleton.

## Motion Consistency And Reduced Motion

Motion is a tokenized contract, not per-screen improvisation. Every transition reads the shared motion intent in `DESIGN.md`. Promotion emits CSS variables and stack-specific Swift, TypeScript, and Dart bindings.

- **Web surfaces (landing pages, funnels, web paywall, Design Room preview):** this is where motion ships. Animate with framer-motion / the `motion` library, reading durations from the promoted `--motion-*` CSS variables. Use entrance/stagger, `AnimatePresence` for route/state changes, and `whileTap` press feedback.
- **Mobile binary (SwiftUI / Flutter / React Native):** do not import framer-motion. Use the selected stack's native animation API and promoted token binding. Equivalent names do not establish equivalent behavior; verify the implementation on that stack.
- **Motion Consistency:** one duration/easing scale across every surface; no ad-hoc millisecond values; transitions in the 150-300ms range for standard UI feedback.
- **Reduced Motion:** honor `prefers-reduced-motion` (web `useReducedMotion()` plus reduced-motion CSS; native reduce-motion settings). Replace transforms with instant or opacity-only changes and never block first paint on an animation.

When the `ui-ux-pro-max` skill is available, adapt its senior-grade pattern, motion, and anti-pattern guidance (visible focus states, smooth 150-300ms transitions, reduced-motion support). Reference it; do not copy its data verbatim into this repo.

## Premium Craft Details

Premium is not flashy; it is the compounding effect of many invisible decisions. These five details ship as platform-neutral component contracts plus a SwiftUI reference adapter. Expo or React Native, Flutter, and future stacks implement and prove their own native adapters. Full doctrine: `knowledge/design/premium-mobile-craft.md`.

| Detail | Premium bar | Boilerplate | Reduced-motion / accessibility |
| --- | --- | --- | --- |
| Press states & spring physics | Every tappable control gives ~100ms physical feedback (scale/dim spring or iOS 26 Liquid Glass), never a flat rectangle | `.buttonStyle(.premiumPress)` / `.buttonStyle(.glass)`; `PremiumMotion.press` | Keep opacity/haptic cue; drop the scale transform |
| Subtle animations | Motion only when it answers a question the user just asked; 150-300ms; tokenized, never improvised | `PremiumMotion.standard`; `.premiumAnimation(_:value:)` | Collapse to instant/opacity change; never block first paint |
| Haptics | Confirm state changes and decisions only — not navigation, scrolling, or idle taps | `.sensoryFeedback(for:trigger:)`; `Haptics.Event.play()` | Respect system Haptics setting |
| Keyboard behavior | Input/submit never covered; dismissal is intentional; focus/blur deliberate | `.premiumInteractiveKeyboardDismiss()`, `KeyboardDoneToolbar`, `.swipeFocusGesture` | Maintain visible focus order at large text sizes |
| Loading & empty states | Size-preserving skeleton/shimmer (or status text), not a bare spinner; empty states explain what/why + one action | `.skeleton(isLoading)`, `EmptyStateView` | Static skeleton, no shimmer sweep, under Reduce Motion |

These details are additive to the State Matrix above, not a replacement: the State Matrix defines *which* states each surface must handle; Premium Craft defines how they *feel*.

## Source Ledger

| Source | Type | What was learned | Adopted | Rejected |
| --- | --- | --- | --- | --- |
| Refero or fallback pending | style/screen/flow | Pending | Pending | Pending |

## Acceptance Checklist

- [ ] Refero used, export provided, blocked, or fallback approved.
- [ ] Pattern inventory covers all launch-critical surfaces.
- [ ] Flow maps preserve the onboarding playbook.
- [ ] State matrix covers loading/error/offline/permission/premium/destructive states.
- [ ] Premium Craft details (press states, subtle motion, haptics discipline, keyboard behavior, skeleton/empty states) are honored on in-app surfaces with reduced-motion handling.
- [ ] `ux-patterns.html` or `design/design-room.html` renders the flow architecture.
- [ ] Decisions map to `DESIGN.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, and `engineering/PRODUCTION_READINESS.md`.
