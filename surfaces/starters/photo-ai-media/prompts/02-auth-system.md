# 02 — Authentication System

Identity first. Same pattern as any Supabase app; the photo-specific part is that the authenticated user ID scopes every asset, generation, and credit row — and that this category often wants a "try before signup" path, which has a real tradeoff.

```
Build the authentication system using Next.js App Router and Supabase Auth.

Requirements:
- Magic-link (email) sign-in as the primary path
- OAuth login with Google and Apple
- Protected routes that redirect to login if not authenticated
- A profile row created on first sign-in (display name, optional avatar)
- Session management with token refresh
- A lightweight first-run step (display name + what they want to make) before
  the first upload

Create:
1. Login page (/login) with magic-link form and OAuth buttons
2. Auth middleware that protects all /app/* routes (library, generation)
3. A useUser() hook that returns the current user anywhere in the app
4. The first-run profile step

Design: clean, modern, media-forward (the user's photos are the hero). Form
validation with clear error messages.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- OAuth client secrets and the Supabase service role key are secrets → route via `SECRETS.md` (`secrets-management.md`). Magic-link and lifecycle emails go through `resend-email-ops.md`.
- **Anonymous try-before-signup is a common pattern in this category** (upload a photo, see a preview, sign up to keep it). It converts well because the wow moment precedes the ask — but it is also an abuse and cost surface: anonymous generations burn real provider money and dodge per-user quotas. If the founder wants it, gate it deliberately: device-scoped quota of 1 cheap/low-res preview, server-side rate limiting, full safety screening (prompt 08) still applies, and the asset migrates to the account on signup. Surface the tradeoff to the founder; do not silently add or silently skip it.
- The first-run "what do you want to make" answer is an onboarding surface (`onboarding-conversion.md`) and seeds preset selection (prompt 05) — an Intent Mirroring input, not throwaway copy.
- Reconcile the look with Design Room tokens (`design-room.md`); don't invent a one-off style.
- Add `sign_up_completed`, `oauth_used`, `first_run_completed` (and `anonymous_preview_used` if the try-first path ships) to `analytics/ANALYTICS.md`.
