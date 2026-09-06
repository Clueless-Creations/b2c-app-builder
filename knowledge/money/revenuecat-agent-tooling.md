# RevenueCat agent tooling in a consumer business

Use this only when the selected operation uses RevenueCat. These are adapted
procedures, not an installation, a provider selection, or a claim of live support.
The reviewed upstreams are RevenueCat/ai-toolkit and RevenueCat/cli. Their exact
baselines and original notices are in the knowledge manifest and package resources.

## Contents

- Select the task and target
- Use the relevant upstream skill
- Connect identity without changing authentication
- Discover CLI commands safely
- Verify the actual integration

## Select the task and target

Read the accepted product and offer decisions, selected platform, and connection
reference before setup. Keep RevenueCat project IDs, app IDs, store IDs and bundle
IDs distinct. Resolve the existing project before proposing creation. MCP or CLI
availability does not grant authority for credentials, pricing, publishing or spend.

Do not run an upstream end-to-end setup agent during source intake. Prepare its
exact operations against `operations/business-access.json` and the authorized app
root. OAuth access to several projects does not authorize changing all of them.
Public SDK keys belong in app configuration; secret management keys do not. Do not
print secrets or place them in command arguments, generated artifacts, or analytics.

## Use the relevant upstream skill

The MIT toolkit supplies reusable procedures. Our worker owns the task; load only
the selected platform's instructions from a reviewed revision, not every skill.

| Task                      | Upstream skill               | Builder requirement                                                                     |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| Project and catalog setup | create-revenuecat-project    | Reconcile apps, products, entitlements, offerings and packages with the accepted offer. |
| SDK integration           | integrate-revenuecat         | Match the actual build owner and SDK lock; separate Test Store from production.         |
| Authentication mapping    | revenuecat-identify-user     | Apply the corrections below and the accepted identity contract.                         |
| Purchase and restore      | revenuecat-purchase-flow     | Test cancellation, pending results, failure and restore.                                |
| Paid access               | revenuecat-entitlements-gate | Use current entitlement evidence, not a paywall dismissal or auth success.              |
| Paywall presentation      | revenuecat-paywall           | Preserve the accepted design, experiment assignment and purchase owner.                 |
| Purchase testing          | revenuecat-testing-setup     | Sandbox evidence is labeled and never presented as production proof.                    |

An upstream reference to another repository or a remotely fetched skill is a new
source dependency to review. This adoption excludes the separately sourced
`revenuecat-play-billing` collection; it does not claim to have reviewed that corpus.
Do not invoke `rc skills install --all` or install global skills as a side effect.

## Connect identity without changing authentication

The app's authentication service owns verified sessions. RevenueCat `logIn` maps
the verified opaque app user ID to a customer; it is not app authentication and
neither successful auth nor identification establishes a paid entitlement.

The reviewed toolkit identity skill contains two overbroad claims. RevenueCat's
Identifying Customers documentation explicitly allows direct `logIn(newId)` when
switching between identified accounts. It also describes conditional anonymous
merging, not a guarantee that every anonymous purchase is merged. Follow that
published behavior and the selected project's restore/transfer policy. Do not copy
the skill's warning that a second `logIn` necessarily aliases two accounts.

Configure once with the approved anonymous or identified mode. After verified auth,
reconcile identity and refresh CustomerInfo before showing user-specific access.
Handle account switching atomically in the app so old customer state cannot leak.
Use `logOut` for the selected signed-out mode, not a blanket reset before every login.
Test both merge and no-merge cases; preserve the distinct store restore operation.
Reject shared placeholder IDs and personally identifying IDs such as email.

Source for these corrections:
https://www.revenuecat.com/docs/customers/identifying-customers

## Discover CLI commands safely

When the approved host exposes the CLI, record its exact executable/version and
compare it with reviewed compatibility evidence. A builder package pin does not
freeze a globally installed executable. The source review here does not certify any
host binary. `rc` and the Rork `asc` CLI are different tools.

The reviewed CLI supplies `rc commands --json`, `rc commands --schemas --json`, and
space-separated `rc schema <command> --json`. Check the chosen command schema; do
not infer flags or output shape from a similarly named MCP tool. Prefer explicit
project selection and noninteractive error handling. Never use `--yes` to create
approval. Store setup can create and upload credentials and requires its own gate.

A newly available command is a support candidate, not an automatically enabled
operation. In particular, generated paywalls and published paywalls are different
effects. Reconcile uncertain mutations before retrying.

## Verify the actual integration

Verify the first-session identity and analytics requirements in
[onboarding foundations](../experience/onboarding-foundations.md), plus the selected
[store-product procedure](./revenuecat-and-store-products.md). Test account A/B
isolation, guest transitions, failed auth, expired sessions, entitlement refresh,
pending purchases, cancellation, restore and duplicate callbacks with synthetic users.

Record the provider project, build, SDK version, current results and collector
readback where measurement is claimed. Preserve the business metric definitions;
RevenueCat owns subscription state, while analytics receives a declared projection.
Passing setup or receiving a generated snippet does not complete onboarding,
monetization, design review, store readiness, or production release.
