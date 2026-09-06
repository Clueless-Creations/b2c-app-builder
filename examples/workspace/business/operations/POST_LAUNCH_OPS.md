# Post-Launch Operations

Status: partial until the weekly rhythm has run at least once on the live app and crash, review, retention, and support routes are proven with evidence.

The launch is not the end state; it is the handoff into operations. This runbook keeps the live business compounding: crash health, store reviews, retention economics, support, and growth reviewed on a fixed cadence with evidence. See `knowledge/operations/post-launch-operations.md` for the full lane playbook and `npm run check:post-launch -- --root . --state state/business-state.json` for the readiness gate.

## Weekly Operating Rhythm

One fixed weekly session, every week, in this order. Skipping a week is recorded in the log below, not silently absorbed.

| Step                                                        | Source                                                          | Output                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Metrics review (activation, conversion, retention, revenue) | PostHog dashboards, RevenueCat charts                           | deltas + one insight logged                                     |
| Crash and ANR triage                                        | Sentry (or store crash reports)                                 | severity-labeled issues, hotfix decision                        |
| Review sweep and responses                                  | App Store Connect, Play Console                                 | replies posted/queued, language mined for ASO and failure cards |
| Support inbox sweep                                         | support@ alias (Resend/Cloudflare routing)                      | tickets answered or escalated                                   |
| ASO and rankings delta                                      | AppKittie, store analytics                                      | keyword/rank movements logged                                   |
| Growth and spend review                                     | growth/PAID_UA.md stop/scale rules, growth/FASTLANE_OPS.md loop | scale/hold/stop decision                                        |
| Ship one improvement                                        | this runbook + state/business-state.json                        | release-train entry or explicit skip reason                     |

Weekly log — one dated row per session, numbers not adjectives. "unverified" is not a value; if a pull is blocked, record the dated blocker in the cell (e.g. "blocked: PostHog auth 2026-07-20") and surface it to the founder. `check:post-launch` fails a live app whose latest row is older than two weeks or whose metric cells hold no numbers. Put MRR and its delta in Notes each week.

| Date | Crash-free % | New reviews (avg rating) | D7 retention | Decision shipped | Notes |
| ---- | ------------ | ------------------------ | ------------ | ---------------- | ----- |

## Crash Triage

- Crash route: Sentry (fallback when unavailable: store crash reports in App Store Connect / Play Console vitals), with alert routing to the founder channel.
- Severity ladder: `launch_blocker` (crash on core loop or purchase path; hotfix now) / `degraded` (feature broken with workaround; next release train) / `cosmetic` (log and batch).
- Release gate: crash-free sessions must stay at or above the threshold recorded here (default 99.5%) before any staged rollout expands.
- Every `launch_blocker` becomes a failure card in `state/business-state.json` until resolved.

## Review Responses

- Response SLA: reply to every 1-3 star review within 72 hours; to 4-5 star reviews with substantive content weekly. No boilerplate; reference the user's actual words.
- Mine reviews weekly for failure-card candidates, ASO keyword language (feed `APP_STORE_LISTING.md`), and feature demand (feed `PRODUCT.md` V2 candidates).
- Review-bombing or policy-violating reviews: flag for store appeal rather than arguing in replies.
- First public reply under the business identity is founder-approved; subsequent replies follow the approved voice.

## Release And Hotfix Cadence

- Release train: weekly or biweekly (record the choice), semantic versioning, staged rollout / phased release on both stores with a monitoring window before expansion.
- Hotfix path: `launch_blocker` crashes or broken purchase/entitlement paths trigger an out-of-band release; Apple expedited review is requested only for genuine launch blockers.
- Rollback posture: phased release halt + kill-switch/feature-flag route recorded in `engineering/TECH_SPEC.md`; rolling back a live release is founder-gated.
- Post-release: watch crash-free rate, purchase success, and review sentiment for 48 hours before declaring the release healthy.

## Retention Review

- Retention cohort source: PostHog cohorts (D0 activation, D7, D30) plus RevenueCat renewal data.
- Watch the first-renewal inflection: most subscription loss happens before renewal #1 — accelerate time-to-value rather than gating harder (see `knowledge/money/revenue-monetization.md`).
- Split churn voluntary vs involuntary; involuntary churn gets the billing-recovery loop (grace period, dunning email, update-payment path), not resignation.
- Reactivation/win-back runs plan-segmented; pause-instead-of-cancel is offered before the cancel completes.
- Retention findings that change product, copy, pricing, or paywall behavior cascade through `knowledge/process/change-cascade.md`.

## Owned-Relationship Metrics

Record these values by discovery channel when they apply.

| Date | Channel | Discovery exposure | Owned contacts | Activations | Paid conversions | Revenue | External-platform share |
| ---- | ------- | -----------------: | -------------: | ----------: | ---------------: | ------: | ----------------------: |

## Manual Loop Proof

Record one successful manual run before you automate each value-producing process.
Security, compliance, backup, and monitoring controls do not require this proof.

Applicability: TODO — Record exactly one declaration: applicable, or not applicable with a specific reason.
Use `passed` or `failed` in Result. Do not hide the run outcome inside narrative text. Automation decision must begin with `automate` or `keep manual`; an `automate` row must itself be `passed`.

| Date | Process | Input | Output | Result | Cost | Failure mode | Automation decision |
| ---- | ------- | ----- | ------ | ------ | ---- | ------------ | ------------------- |

## Support Operations

- Support inbox: support@ alias routed (Resend inbound or Cloudflare Email Routing) to the founder/operator; tested end to end.
- Refund path: store-managed refunds documented per platform; out-of-store goodwill refunds are founder-gated.
- FAQ/help route: the top 10 questions answered on the landing/help page; updated when the same question arrives twice.
- Escalation ladder: support → operator → founder, with data-deletion and legal/privacy requests routed per `trust/PRIVACY.md` and the account-deletion path.

## Launch Retro

- `operations/LAUNCH_RETRO.md` is filled at launch +7 days and refreshed at day 30 and day 90.
- The retro records: which lanes were used vs skipped (and why), where the agent or founder stalled, what surprised us, and which misses should become failure cards or LaunchBench scenarios.
- Retro findings feed `state/business-state.json` failure cards and, for skill-level misses, an issue against the launch skill itself.
