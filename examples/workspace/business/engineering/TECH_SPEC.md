# Technical Spec

Status: partial until implementation contracts, data model, provider boundaries, and test proof are complete.

## Compound Engineering Route

For core engineering work, check Compound Engineering freshness, route through CE skills when available, and record plan, work, review, test, and proof evidence.

## Data Contract

The backend-agnostic contract the build must satisfy regardless of provider. See `knowledge/engineering/backend-data-contract.md`; gate with `npm run check:backend-contract -- --root . --state state/business-state.json`.

### Backend Selection

- Route: supabase (default) | firebase | custom — record the route and the reason it fits this product; switching later is a change-cascade event, never a silent substitution.
- Archetype prompt packs assume Supabase; when another route is selected, adapt the schema/auth prompts via the parity table in `knowledge/engineering/backend-data-contract.md` instead of running them verbatim.

### Data Model

| Entity | Owner | Key relationships | PII class | Retention / deletion path |
| ------ | ----- | ----------------- | --------- | ------------------------- |

- Account deletion maps to a real data-layer path (soft/hard delete per entity), reconciled with `trust/PRIVACY.md`.

### Authorization Model

- Enforcement: Postgres RLS policies (supabase) | Firestore security rules (firebase) | middleware authz (custom). Deny-by-default; every table/collection carries owner/read/write rules.
- Service-role/admin keys never ship in clients; routed per `trust/secrets/SECRETS.md`.
- Authorization rules are tested (authenticated vs anonymous vs other-user access), with proof recorded in `engineering/PRODUCTION_READINESS.md`.

### Migrations And Environments

- Migration tool and history location per route; dev/staging/prod separation with Doppler-routed secrets.
- Seed data / fixtures for tests; backup and restore posture.
- A migration has been applied to a fresh environment as proof before the engineering lane is done.

## Strings And Localization Readiness

Every user-facing string is consumed from `product/copy/COPY_DECK.md`, never invented at the keyboard, and externalized from the first commit so localization is a content decision later, not a rebuild. Rules live in `knowledge/words/conversion-copy.md` §Localization Readiness; which locales ship is `LOCALIZATION_MARKET_RESEARCH.md`'s call.

- String externalization mechanism for this stack: String Catalogs (`.xcstrings`) for iOS | `res/values/strings.xml` for native Android | i18next + `expo-localization` for React Native/Expo | ARB + `gen-l10n` for Flutter | typed strings module or `next-intl` for the web funnel. Record the choice here.
- Resource keys are the `product/copy/COPY_DECK.md` keys — unchanged where the format allows dots (String Catalogs, i18next); for ARB + `gen-l10n` and Android `strings.xml`, dots become underscores (mechanical, reversible; record the transform here).
- Full-sentence templates with named interpolations; plurals through ICU/platform plural rules; no sentence concatenation; dates, numbers, and prices through locale APIs (paywall prices from StoreKit/RevenueCat locale-formatted values).
- Pseudo-localization pass (length-doubling locale) and a string freeze before store submission, recorded in `engineering/PRODUCTION_READINESS.md`.

## Experience Card Frontstage / Backstage

Required when `EMOTIONAL_DESIGN.md` applies Experience Cards. For each card-carrying screen, name the frontstage (what the user sees) and the backstage (the real operation behind it). This is what makes the Perceived Effort Delay honest and the Variable Reward genuinely variable — the bright-line proof lives here and in `engineering/PRODUCTION_READINESS.md`.

| Screen / Moment   | Card                   | Frontstage (user sees)       | Backstage (real operation)                            | State / data           | Reduced-motion path   |
| ----------------- | ---------------------- | ---------------------------- | ----------------------------------------------------- | ---------------------- | --------------------- |
| Goal question     | Commitment             | echoed goal on later screens | persist commitment to profile; editable from Settings | `commitment` record    | instant text, no fade |
| Plan generation   | Perceived Effort Delay | narrated processing steps    | real fetch + personalization + format pass            | step-to-operation map  | static step list      |
| Result reveal     | Variable Reward        | anticipation → reveal        | content that genuinely varies by inputs/prior actions | `reward_variant` value | instant plain result  |
| Pre-paywall pause | Intent Mirroring       | user's own goal reflected    | render only user-provided fields, sanitized           | source field id        | static block          |

**Perceived Effort Delay — step-to-operation map (required):** list each displayed step and the real operation behind it; compute `real_step_ratio` (must be ≥ 0.50). No artificial sleep timer appended after computation completes; honor the `max_delay_ms` cap. `computation_type` ∈ {real_api_call, real_data_processing, ui_composition}.
