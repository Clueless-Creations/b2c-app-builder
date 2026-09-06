# Provider State Recipes

Use this before setting up or auditing third-party services. The skill should produce a provider state plan before provider work starts, then update it as real setup happens.

Each provider entry in `state/business-state.json` should include:

- route: intended paid/account tool, optional account tool, free fallback, blocked, or not needed
- docs checked date and URL basis when docs/CLIs are fast-moving
- required secret names only
- preflight packet: account, project, region, app ID, bundle/package ID, environment, pricing, and approval scope
- access_route: the typed route in use — mcp, api, cli, browser, native_device, skill_pack, or manual, and not_selected until chosen. It must be a route the provider's provisioning manifest declares; `validate:launch-state` enforces the vocabulary and that cross-check. `route` above records sourcing/economics; `access_route` records mechanism — they are different fields.
- validation command or dashboard proof
- fallback and limitation

## Provider Baselines

### Doppler

- refresh official install/setup docs and local `doppler --help` before writing commands
- document local, staging, production config names
- use `doppler run --` for local secret-bearing commands
- use service tokens, provider integrations, OIDC, or platform-native secrets for CI/live
- never commit raw secrets, `.env`, credential JSON, `.p8`, `.p12`, OAuth refresh tokens, or provisioning files

### Supabase Or Firebase

- record project/ref, regions, environments, auth providers, database/storage rules, service-role secret location, and local emulator/branch strategy
- validate from app action to backend state, not only SDK initialization
- require deletion, retention, export, and privacy-disclosure mapping when user data is stored

### PostHog

- refresh current docs for mobile/web SDK, identity, person properties, replay, surveys, feature flags, and experiments
- define anonymous ID, identified ID, alias/merge, group/account keys, UTM/referrer/deep-link/referral handling, and self-reported attribution
- verify event delivery and person property delivery separately

### RevenueCat

- record app IDs, public SDK keys, secret API key, entitlements, offerings, packages, store products, experiments, webhooks, sandbox users, and restore path
- verify purchase-to-access and restore-to-access in app and provider
- map RevenueCat customer ID to app auth/backend identity

### Stripe

- record checkout/web funnel scope, product/price IDs, webhook secret, tax posture, customer portal, idempotency, and entitlement projection
- do not let Stripe success alone equal app entitlement
- validate webhook signature, retry/idempotency, and RevenueCat/backend projection

### Resend

- record sending domain, SPF/DKIM/DMARC, sender identities, reply-to, inbound route, contacts/topics, unsubscribe headers, webhooks, idempotency keys, and lifecycle automations
- adapt `business/growth/resend/email-templates.ts` from `DESIGN.md`
- verify a real test send and provider log/webhook where in scope

### Sentry

- record DSN, auth token location, project/release/environment naming, PII scrubbing, source maps/dSYMs/proguard mapping, alert routing, and owner
- verify a non-production test event and alert route before claiming crash coverage

### App Store Connect

- preflight Apple Developer membership, Team ID, bundle ID/App ID, capabilities, app name, SKU, primary locale, seller/developer name, user access, and founder approval
- stop on name collision or CLI fallback names
- keep app-record mutation separate from signing/archive/upload proof

### Google Play

- preflight developer account, package name, app name, store listing, app content, Data safety, privacy policy, target audience, ads, sensitive permissions, tester tracks, and service-account access
- validate internal testing release or record the exact blocked console step

### Cloudflare

- record zone, DNS, Pages/Workers project, API token scope, email routing, redirects, security headers, caching, robots/sitemap/llms, and worker secrets
- verify HTTP 200/HTTPS, DNS TXT/MX/CNAME, headers, and external email delivery

## Acceptance

- Every provider setup has a current-doc basis, secret route, preflight, validation, and fallback limitation.
- Missing runtime access becomes a founder decision, not an automatic free fallback.
- Provider state flows into `state/business-state.json`, `SECRETS.md`, `state/LAUNCH_TRACE.md`, and `engineering/PRODUCTION_READINESS.md`.
