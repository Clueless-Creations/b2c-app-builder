# 04 — AI Generation Pipeline

This is where product quality and product cost live. The pipeline is **provider-agnostic by design**: which image model/provider to use is a paid, founder-gated decision — route it through `paid-tool-routing.md` and record it in `strategy/TOOL_DECISIONS.md` before filling in the provider adapter. The provider API key is server-side only, via `SECRETS.md`.

```
Build the AI generation pipeline as a server-side job system. The generation
provider is pluggable — write a single provider adapter interface
(submit(input, params) -> provider_job_id, poll(provider_job_id) -> status +
output) and ONE concrete adapter for the provider I name, keeping the provider
name, model id, and endpoint in config. Do not scatter provider calls through
the codebase.

Requirements:
- A server route that accepts {input asset id(s), preset/params}, validates
  ownership and remaining credits, creates a generations row (status=queued),
  and submits the job — the provider API key never reaches the client
- Asynchronous execution with status polling: the client polls (or subscribes
  to) the generations row; statuses queued → running → succeeded/failed; show
  honest progress states tied to the real job status, not a fake timer
- Idempotency: a client-supplied idempotency key per request so retries and
  double-taps never create duplicate jobs or double-spend credits
- On success: store the output in the owner-scoped storage path
  (<user_id>/generated/...), create the media_assets row (kind=generated,
  parent = input asset), mark the generation succeeded, and record cost
  (credits spent + estimated provider cost) in the credit ledger
- On failure: mark the generation failed with a user-readable reason, refund
  the credit spend in the ledger, and offer retry; cap automatic retries on
  transient provider errors with backoff
- Per-user rate limiting and a concurrent-jobs cap, enforced server-side
- Never leak raw provider errors or provider identity strings to the client

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Provider selection is founder-gated.** Follow `paid-tool-routing.md`: identify the candidate providers, confirm with the founder, record the decision and cost assumptions in `strategy/TOOL_DECISIONS.md`, and route the key through `SECRETS.md`. Do not hardcode a provider because it is familiar — the adapter interface exists so the decision stays swappable.
- The generation route is the top abuse/cost surface: ownership checks, credit checks, rate limits, and the concurrency cap are `trust/SECURITY.md` items, enforced server-side (a client check is not a control).
- **The reveal maps to the Variable Reward card — HIGH risk per `ethics-guardrail.md`.** Output quality genuinely varies, which is exactly the variable-ratio mechanism; the card requires `ethics_attestation`, a `user_control_escape_hatch` (the user can always stop; no "one more spin" pressure at the credit floor), a `counter_metric` (e.g. regeneration spirals per session), and `reward_variation_proof` (the variation is the model's real output variance, not engineered near-misses). The waiting state is a Perceived Effort Delay moment: progress must reflect the real job status (`computation_type: real_api_call`) — no fake work, no padded timers (`consumer-product-design-agency.md`).
- Cost tracking per generation is the unit-economics substrate for prompt 06 — without it, pricing is guesswork. Reconcile the cost model with `revenue-monetization.md`.
- Add `media_uploaded`, `generation_started`, `generation_completed`, `media_shared` to `analytics/ANALYTICS.md` (the lane's four required events; `generation_completed` carries status, duration, and credit cost as properties — counts and metadata, not image content).
- Document the queue/polling design and retry/backoff policy in `engineering/TECH_SPEC.md`; provider output retention (does the provider keep copies?) goes in `privacy-terms.md` and feeds prompt 08.
