# {{APP_NAME}} Secrets

No raw secrets: raw secret values must not be committed, pasted into docs, or included in screenshots/logs. Record names, locations, owners, and verification only. This includes device screens: never sign a simulator the agent drives into a real account or paste a production key into it — the agent's screenshots of that device leave the machine and are retained with the conversation. Use fixture or sandbox credentials on any agent-driven device.

Founder-zero setup: the agent explains one secure action at a time and performs the project/config/routing work. Doppler stores automation secrets (API/OAuth/service/webhook/store/CI credentials), not browser passwords, passkeys, 2FA, recovery codes, cookies, or sessions; those stay with delegated platform access, the founder's password manager, or a founder-authenticated browser session.

## Provider

- Selected provider: Doppler
- Provider docs checked:
  - date: Pending
  - URLs: `https://docs.doppler.com/docs/install-cli`, `https://docs.doppler.com/docs/cli`, `https://docs.doppler.com/docs/secrets-setup-guide`, `https://docs.doppler.com/docs/service-tokens`, `https://docs.doppler.com/llms.txt`
  - install route / CLI version: Pending
  - docs-vs-local mismatch: Pending
- Doppler project/config map:
  - local: `{{DOPPLER_PROJECT}}` / `dev_personal`
  - staging: `{{DOPPLER_PROJECT}}` / `stg`
  - production: `{{DOPPLER_PROJECT}}` / `prd`
- Approved fallback provider, if any: none

## Inventory

| Name | Service | Class | Environments | Runtime surface | Public/server-only | Location | Owner | Rotation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EXAMPLE_API_KEY` | Example | server_secret | local/staging/prod | backend | server-only | Doppler project/config | founder | before public launch | blocked |

Archetype starter names (pre-routed by `starters/*/starter/.env.example`; fill rows above as each service is provisioned — values always live in Doppler, never in the repo):

| Name | Service | Public/server-only |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase | public-by-design (client) |
| `SUPABASE_SECRET_KEY` | Supabase | server-only |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | public-by-design (client) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | public-by-design (client) |
| `STRIPE_SECRET_KEY` | Stripe | server-only |
| `STRIPE_WEBHOOK_SECRET` | Stripe | server-only |
| `REVENUECAT_WEBHOOK_AUTH_TOKEN` | RevenueCat | server-only |
| `ANTHROPIC_API_KEY` | Claude API (ai-chat starter) | server-only |
| `MEDIA_GENERATION_API_KEY` | Founder-approved AI media provider (photo-ai-media starter) | server-only |

## Command Map

| Purpose | Command | Required secrets | Proof |
| --- | --- | --- | --- |
| Local dev | `doppler run -- {{DEV_COMMAND}}` | Pending | Pending |
| Tests | `doppler run -- {{TEST_COMMAND}}` | Pending | Pending |
| Build | `doppler run -- {{BUILD_COMMAND}}` | Pending | Pending |
| Deploy | `doppler run -- {{DEPLOY_COMMAND}}` | Pending | Pending |

## CI And Deploy

| Surface | Provider | Secret injection path | Config | Status |
| --- | --- | --- | --- | --- |
| CI | Pending | `DOPPLER_TOKEN` or provider integration | staging | blocked |
| Production runtime | Pending | service token/provider integration/OIDC | production | blocked |

## New-Secret Routing Log

| Date | Trigger | Secret name | Routed to | Docs/tests updated | Status |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending |

## Founder Actions

- Create or confirm Doppler project/configs.
- Add initial secret values directly in Doppler or approved provider.
- Approve any fallback to local `.env.local`, Apple Keychain, platform secrets, or manual export.
- Approve production service-token/provider-integration setup.

## Verification

- Secret scan:
- Doppler setup:
- Local command:
- CI/deploy injection:
- Bundle check:
- Rotation/revocation notes:
