# Provider Proof

Status: partial until live provider evidence is captured. Do not treat planned setup as proof.

## Proof Ledger

| Provider | current status | proof command | evidence path | founder-only gate |
| --- | --- | --- | --- | --- |
| PostHog | needs live event and person-property evidence | capture event and inspect dashboard/API | analytics/posthog-proof.json | founder-only account access |
| RevenueCat | needs sandbox purchase and entitlement evidence | run sandbox purchase and entitlement check | revenue/revenuecat-proof.json | founder-only store/product setup |
| Resend | needs domain and test-send evidence | send test email and inspect delivery | email/resend-proof.md | founder-only DNS/domain access |
| App Store Connect | needs app record and metadata evidence | run ASC validation commands after approval | store/asc-proof.md | founder-only submission and account access |
| Sentry | needs release event and alert evidence | trigger handled test event | security/sentry-proof.md | founder-only project access |
| MobAI | needs grounded iOS/Android flow evidence with component versions and tier | run existing `.mob` flows, review any AI-heal diff, rerun, and correlate provider state | mobile/mobai-proof.md | device/account access; spend approval only for Plus/Pro |
| Doppler | needs config and runtime injection evidence | doppler run -- printenv APP_ENV | secrets/doppler-proof.md | founder-only secrets access |

## Rules

- Store proof artifacts without secrets, keys, screenshots of credentials, or private account data.
- If a provider cannot be accessed, record the founder-only gate and keep the related launch lane partial or blocked.
