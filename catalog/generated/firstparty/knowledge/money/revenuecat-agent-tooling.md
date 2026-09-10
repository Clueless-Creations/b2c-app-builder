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

The executable candidate is GitHub release **v0.1.1**
(`448a9998bd2107c274b9eb1cf55ad5d5d81f6377`, published 2026-08-27). npm
`@revenuecat/cli@0.1.1` ships the same native binaries as `rc` and `revenuecat`.
The later source head is not the installed release. Do not run
`npx @revenuecat/cli@latest` at runtime.

Discovery uses a trusted absolute path, `--version`, and `commands --json` with
`--no-input --no-color`. It does not install, log in, refresh OAuth, or change
profiles. An unrelated binary named `rc` is not RevenueCat. A profile named
`staging` is not a Test Store. Test Store proof is the CLI-read `apps show`
type (for example `test_store`), not a caller `appStoreKind` label. `customers
simulate-purchase` is refused when that readback is App Store, Play, web
billing, or unresolved.

`b2c inspect` records the winning local `rc`/`revenuecat` identity in the
engine-home doctor snapshot. `b2c doctor` is a supported equivalent. Status
reprints that snapshot. It is not a live PATH probe and not live catalog proof. When a workspace selects RevenueCat,
selected-project and app checks fail closed without host authority. They do not
spawn authenticated commands, mutate, install, log in, or refresh OAuth.

Use `--json --no-input --no-color` for supported noninteractive commands. Check
the chosen command schema; do not infer flags or output shape from a similarly
named MCP tool. Prefer explicit `--project-id`. Never use `--yes` to create
approval. `--no-input` prevents prompts, not mutations.

A newly available command is a support candidate, not an automatically enabled
operation. Generated paywalls and published paywalls are different effects.
A command named `plan` can persist remote state. Reconcile uncertain mutations
before retrying. Do not invent upstream idempotency.

CLI proof uses collector `revenuecat-cli@1`. It is not the REST probe marker
`revenuecat@1`.

### Response decoding (v0.1.1)

Pinned executable: GitHub **v0.1.1** (`448a9998bd2107c274b9eb1cf55ad5d5d81f6377`), npm
`@revenuecat/cli@0.1.1`. `--json` wraps management results as
`{ "data": ..., "schema_version": 1 }` (integer `1`). Preview still uses that
envelope; the inner `data` is the SDK offerings payload, not a verify graph.

| Command | Native shape | What decode records | Not proved |
| --- | --- | --- | --- |
| `offerings preview` | `current_offering_id` + `offerings[].identifier` (SDK lookup keys). `paywall_components: null` is fallback. No `issues` field. | Protocol-valid preview, lookup key, fallback vs published components | Billing readiness, dashboard paywall publication, management `ofrng_*` id unless a `lookup_key` map is supplied |
| `offerings verify` | `{ offering, packages, paywalls, entitlements, issues }` where `issues` is a string array | Graph presence, nested `price_error`, REST id vs `lookup_key` | Desired-state repair. `{ "issues": [] }` without the graph is not complete |
| list/show/create | v2 `{ object, items, next_page }` or resource `{ id, lookup_key, object }` | Opaque remote ids, lookup keys, pagination `complete` / `partial` / `unknown` | An unread page is not an empty catalog |
| `customers simulate-purchase` | `{ app_id, app_user_id, product, fetch_token, customer_info, active_entitlements }` | Product id and store identifier, SDK entitlement identifiers, `TEST_` fetch token | Native IAP, in-app UI, App Store/Play |

Sample coverage in `checks/verification/fixtures/revenuecat-cli-decode.fixtures.ts` is the pinned preview test payload, the documented SDK packages example, the verify HTTP-mock graph, v2 list pages, and the simulate-purchase Render map. Unknown `schema_version`, invalid JSON, and feeding verify JSON to the preview decoder fail closed. Live CLI output was not captured on this host.

Protocol validity is not business completeness. Catalog repair planning is a later step. Custom presentation must not be rewritten as a forced dashboard paywall.

### Command-to-operation matrix (v0.1.1)

| Builder operation | CLI argv (v0.1.1) | Effect | Status |
| ----------------- | ----------------- | ------ | ------ |
| Local identity | `rc --version` | none | implemented, fake-process tested |
| Command tree | `rc commands --json --no-input --no-color` | none | implemented, fake-process tested |
| Command schema | `rc schema <cmd> --json --no-input --no-color` | none | implemented, fake-process tested |
| List/show catalog | `rc --project-id <id> offerings\|apps\|products\|entitlements list\|show --json --no-input --no-color` | authenticated read | argv and preflight tested; live auth not run |
| Offering verify | `rc --project-id <id> offerings verify <offering-id> --json --no-input --no-color` | authenticated read; inspect `issues` even on exit 0 | argv and result schema tested |
| Offering preview | `rc --project-id <id> offerings preview <app-id> --app-user-id <id> --json --no-input --no-color` | authenticated read that may touch a user | argv tested; not assumed effect-free |
| Test Store purchase | `rc --project-id <id> customers simulate-purchase --app-id <test-store-app> --product <id> --app-user-id <id> --yes --json --no-input --no-color` | remote mutation | refused unless `apps show` reads a Test Store and host authority is granted; caller labels are not that proof; complete only when the expected product and entitlements match the readback; not native IAP proof |
| Catalog create | `rc --project-id <id> offerings create --lookup-key <key> --display-name <name> --json --no-input --no-color` | catalog mutation | refused without host authority and pinned lookup-key/display-name flags; a positional server id is not a create operand; existing catalog is read back instead of duplicated |
| Product create | `rc --project-id <id> products create --store-id <sku> --type <type> --app-id <app> [--title <title>] [--duration P1M] --json --no-input --no-color` | catalog mutation | refused without host authority and the pinned store-id/type/app-id flags; a product id positional is not a create operand |
| Entitlement create | `rc --project-id <id> entitlements create --lookup-key <key> --display-name <name> --json --no-input --no-color` | catalog mutation | refused without host authority and pinned lookup-key/display-name flags |
| Package create | `rc --project-id <id> packages create <offering-id> --lookup-key <key> --display-name <name> --json --no-input --no-color` | catalog mutation | offering id is the parent server id; lookup-key/display-name create the package |
| Entitlement/package attach | `entitlements attach <entitlement-id> <product-id> [...]` / `packages attach <package-id> <product-id> [...]` | catalog mutation | refused without host authority and the pinned positionals |
| Paywall attach | `rc --project-id <id> paywalls attach <paywall-id> <offering-id>` | catalog mutation | refused without host authority; both ids are server-assigned |
| Project/app inspect | `rc --project-id <id> projects list` and `apps show <app-id>` | authenticated read | fixture-wired; adopt the existing project, do not create a duplicate |
| Catalog reconcile | `products\|entitlements\|offerings list`, `offerings packages <id>` | authenticated read, then authorized create | existing ids are preserved; create runs only with host authority and pinned create flags; complete and reconciled only when every expected id is present after readback |
| Paywall inspect | `rc --project-id <id> paywalls list\|show` | authenticated read | inspect only; publish/unpublish/generate/edit stay excluded |
| Scoped customer/subscription | `customers show <id>` / `subscriptions show <id>` | authenticated read | one id only; `customers list` is refused |
| Metrics/charts/audit | `metrics`, `charts show <name>`, `audit --limit <n>` | authenticated read | project-scoped; chart names are a fixed enum; audit requires an explicit limit |
| Raw `api`, `setup`, `rico`, `skills install`, signup, refunds, publish/unpublish, AI generate/edit, store plan/apply/sync/show, entitlement grant/revoke/transfer, webhooks, `auth login`, `projects use` / `profiles use`, unscoped customer lists | n/a | excluded | refused; a changed remote store plan cannot be applied on an old approval |

Selected families are implemented only through the builder's typed RevenueCat CLI
adapter. Catalog, verify, preview, paywall inspect, and authorized Test Store
routes produce collector `revenuecat-cli@1` evidence. That document is not the
REST probe, not Apple/Play purchase proof, and not in-app UI proof. Null
`paywall_components` is a fallback, not a published paywall. Store credential
setup remains experimental upstream. Nested setup must not become the builder
orchestrator. Live authenticated execution remains founder-gated.

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
