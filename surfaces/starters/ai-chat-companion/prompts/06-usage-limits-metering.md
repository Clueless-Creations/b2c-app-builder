# 06 — Usage Limits & Metering

Metering is the monetization spine: it both controls inference cost and creates the upgrade moment. Build it before the paywall (prompt 07).

```
Add usage metering and free-tier limits.

Requirements:
- Track per-user usage for the current period (messages and tokens) using the
  usage table from prompt 01, incremented on each assistant response
- Enforce a free-tier cap (e.g. N messages/day or M tokens/period) — checked
  server-side before each model call, never client-side only
- When a free user hits the cap, return a clear "limit reached" state with the
  reset time and an upgrade call-to-action (do not silently fail)
- Per-user rate limiting to prevent abuse/cost spikes (e.g. requests per minute)
- A small usage indicator in the UI (messages left today / resets in Xh)
- Subscribers (status = active) get a higher or unlimited cap and/or a better
  model tier

Make the cap, rate limit, and model-per-tier values config constants so they are
easy to tune.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Caps and rate limits must be enforced **server-side** at the inference route (prompt 04) — a client check is not a control. This is both cost control and a `trust/SECURITY.md` abuse control.
- The cap values, model-per-tier, and price are a monetization decision — reconcile with `revenue-monetization.md` (test caps; don't reflexively pick a number) before prompt 07. Pricing changes are founder-gated.
- The "limit reached → upgrade" state is a paywall-timing moment (`onboarding-conversion.md`): it should arrive at a real value moment (the user wanted to keep going), not on first open.
- Add `usage_incremented`, `free_limit_reached`, `upgrade_prompt_shown`, `rate_limited` to `analytics/ANALYTICS.md`. These feed the conversion funnel and the cost model.
</content>
