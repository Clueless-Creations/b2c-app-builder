# 08 — Invite-Only Onboarding (optional)

An invite gate is a growth loop and a culture-setting tool, not just a wall. It solves the cold-start problem: pre-load value before opening the doors (build-in-public → invite-only beta → referral codes). Invitees who join through a personal invitation retain dramatically better than cold traffic.

```
Build an invite-only onboarding system.

Requirements:
- New users cannot register without an invite code
- Each user gets 5 invite codes on signup
- Invite codes are single-use, linked to the inviter
- Inviter gets notified when their invite is used
- Admin dashboard shows invitation tree (who invited whom)
- Admin can generate bulk invite codes for partnerships
- After platform opens publicly, invites become optional (just for tracking
  referrals)

Track:
- Invite acceptance rate (codes generated vs used)
- Inviter attribution (for potential referral rewards later)
- Network visualization of invitation chains

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- This is the product-led half of `viral-growth-loops.md`. Tie invite acceptance rate and inviter attribution into `VIRAL_GROWTH.md` as the loop's analytics, and add abuse controls: **single-use enforced server-side, no self-referral, rate-limited code generation**.
- Code redemption gates registration — coordinate with prompt 02 (auth): the register page must validate the code before account creation.
- "Inviter gets notified" routes through the notification system (prompt 04) and optionally an email via `resend-email-ops.md`.
- The "invites become optional after public launch" toggle is a config/feature flag — record it so it is a deliberate switch, not a code change.
- Add `invite_code_generated`, `invite_code_redeemed`, `invite_accepted` to `analytics/ANALYTICS.md`. The invitation tree feeds the launch cohort story in `growth/LAUNCH_NARRATIVE.md`.
</content>
