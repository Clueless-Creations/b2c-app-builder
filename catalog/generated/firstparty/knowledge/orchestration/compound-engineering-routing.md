# Compound Engineering Routing

Use this when choosing which Compound Engineering (CE) skill to invoke for a build stage: app implementation, backend/frontend edits, generated builder handoff, or a request to "build/refactor/fix the app" from a launch package. Production-readiness substance and mobile quality bars live in [`engineering-orchestration.md`](../engineering/engineering-orchestration.md); this file routes the CE loop itself.

Compound Engineering is the default engineering operating system for this skill. Do not use a generic implementation checklist for non-trivial app work when CE skills are available.

## Required Loop

1. **Freshness**: run `ce-update` in Claude Code when available, or record the local CE skill inventory and latest-release check. The current upstream release source is `https://github.com/EveryInc/compound-engineering-plugin/releases`.
2. **Product/requirements**: run `ce-brainstorm` when product shape, scope, user behavior, onboarding, paywall, or activation still has multiple defensible directions. If skipped, record why the source docs are already decisive.
3. **Plan**: run `ce-plan` before non-trivial implementation. `engineering/ENGINEERING_PLAN.md` should identify `ce-plan` or an equivalent CE planning route as its source.
4. **Work**: run `ce-work` for bounded implementation. Use `ce-worktree` when lanes need isolation, the main checkout is dirty, or parallel implementation would collide. Before `ce-worktree` on an Expo or React Native app, set `worktree.symlinkDirectories` to `["node_modules"]` in `settings.json`, so each worktree stops reinstalling `node_modules`.
5. **Review**: run `ce-code-review` before treating non-trivial code changes as ready.
6. **Test**: run `ce-test-browser` for web surfaces and `ce-test-xcode` for iOS/macOS surfaces when applicable. Use MobAI for serialized mobile-device E2E when available.
7. **Proof**: run `ce-proof` or `ce-demo-reel` when the founder/reviewer needs visual or behavioral proof.

Tiny doc edits, typo fixes, one-file copy changes, and repo-maintenance-only validator patches do not need the full CE loop. Record `route: not_needed` with a short reason when skipping CE for those cases.

## State Contract

Record the route in the Compound Engineering Routing section of
`operations/ORCHESTRATION.md`. Business state holds the orchestration lane status
and evidence pointer; it does not copy this route record:

```yaml
compound_engineering:
  availability: "unknown" # available | unavailable | not_needed | unknown
  route: "not_evaluated" # ce_full_pipeline | ce_plan_work | ce_fallback | not_needed | not_evaluated
  latest_check:
    status: "not_checked" # checked | ce_update_run | source_registry_refresh_run | unavailable_with_reason | not_needed | not_checked
    checked_at: ""
    installed_version: ""
    latest_version: ""
    source: ""
  skills_considered: []
  brainstorm_status: "not_evaluated" # used | skipped_with_reason | fallback_equivalent | blocked | not_needed | not_evaluated
  plan_status: "not_evaluated"
  work_status: "not_evaluated"
  worktree_status: "not_evaluated"
  review_status: "not_evaluated"
  test_status: "not_evaluated"
  proof_status: "not_evaluated"
  fallback_reason: ""
```

For production-readiness claims, the route must show either:

- CE is available and planning, work, review, testing, and proof are used or intentionally not needed with a reason.
- CE is unavailable and the Standalone Engineering Loop (`engineering-orchestration.md` §1b) is recorded in `operations/ORCHESTRATION.md` and `engineering/ENGINEERING_PLAN.md` — plan, bounded slices, adversarial review, test, and proof with the same evidence bar. `check:compound-engineering` errors when CE is unavailable and `engineering/ENGINEERING_PLAN.md` does not record the loop.

## Artifact Requirements

`operations/ORCHESTRATION.md` must include:

- Compound Engineering Routing
- CE freshness check
- CE skill inventory or unavailable route
- ce-brainstorm decision
- ce-plan source
- ce-work or ce-worktree route
- ce-code-review route
- ce-test-browser, ce-test-xcode, MobAI, or equivalent E2E proof route
- ce-proof or ce-demo-reel route
- fallback reason if unavailable

`engineering/ENGINEERING_PLAN.md` must include:

- source docs and whether `ce-brainstorm` was used or intentionally skipped
- `ce-plan` or equivalent planning source
- `ce-work` execution route and `ce-worktree` decision
- review, test, and proof gates before readiness

`engineering/PRODUCTION_READINESS.md` must include:

- implementation command/proof
- CE review result or equivalent fallback
- browser/device/build proof from CE or approved equivalent
- remaining blockers and founder-only gates

## Freshness

The skill's source-freshness registry tracks the Compound Engineering plugin release page. During skill maintenance, run:

```bash
npm run check:source-freshness
npm run refresh:source-freshness
```

During an app engineering run, prefer the runtime tool:

```text
ce-update
```

If `ce-update` is unavailable because the runtime is not Claude Code, record the local CE skills present and, when `gh` is available, check:

```bash
gh release list --repo EveryInc/compound-engineering-plugin --limit 5 --json tagName,publishedAt,isLatest
```

Do not block engineering solely because the latest-release check is unavailable. Instead, record `latest_check.status: unavailable_with_reason`, keep the route visible, and proceed with the installed CE skills or an explicit fallback.
