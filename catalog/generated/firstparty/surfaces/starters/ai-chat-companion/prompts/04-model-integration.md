# 04 — Model Integration (Claude API)

This is where product quality lives. The Claude API key is **server-side only**. Before writing this, refresh current model IDs, streaming, and prompt-caching syntax via the `claude-api` skill — do not hardcode model names or pricing from memory.

```
Wire the chat to the Claude API through a server route (the API key stays
server-side, never exposed to the client).

Requirements:
- A server route/edge function that accepts a conversation, calls the Claude
  Messages API with streaming, and streams tokens back to the client (SSE)
- A versioned system prompt that encodes the product's persona, voice, domain
  boundaries, and the "what it must refuse/defer" rules
- Context-window management: include recent messages within a token budget; when
  a conversation grows long, summarize older turns into a running summary that is
  prepended instead of sending the full history
- Use prompt caching for the system prompt (and long memory, if present) to cut
  latency and cost
- Keep the cached system-prompt block stable across requests. Do not put
  today's date, per-turn memories, or other changing values inside it. One
  changed token breaks the cache for every token after it. Put per-request
  memory and other dynamic values in a later message block, after the
  cached prefix
- Record input/output token counts and the model used on each assistant message
- Graceful handling of API errors, timeouts, and rate limits with a user-visible
  retry; never leak raw provider errors to the client

Tell me the exact current Claude model ID and parameters to use (confirm against
current Anthropic docs), and keep the model name in one config constant.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Follow the `claude-api` skill** for current model IDs, Messages API shape, streaming, tool use, and prompt caching. Keep the model ID in one config constant so model upgrades are a one-line change (and a `change-cascade.md` event).
- The Claude API key routes through `SECRETS.md`. The inference endpoint is the top abuse/cost surface — add per-user rate limits and quotas (coordinate with prompt 06) and prompt-injection handling to `trust/SECURITY.md`.
- The **system prompt is a product asset**: version it, review it against `strategy/BRAND.md §Voice`, and trace persona/boundary changes through `change-cascade.md`.
- Context summarization is a real backend step — document it in `engineering/TECH_SPEC.md` (it also justifies an honest "thinking/summarizing" perceived-effort moment, not a fake loader; see `consumer-product-design-agency.md`).
- Add `model_response_succeeded`, `model_response_errored`, `context_summarized` (with token counts) to `analytics/ANALYTICS.md`.
</content>
