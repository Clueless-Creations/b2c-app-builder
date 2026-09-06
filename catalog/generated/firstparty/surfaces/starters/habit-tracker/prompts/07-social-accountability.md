# 07 — Social Accountability (optional)

Accountability is the strongest retention lever a habit app has that the OS reminder cannot copy — and it is also a growth loop, because joining a buddy or circle requires inviting someone. Build it as a small, abuse-aware social layer, not a social network.

```
Add social accountability to the habit app.

Buddies:
- A user can invite one person to be the accountability buddy for a specific
  habit, via an invite link (no account required to view the invite; account
  required to accept)
- A buddy sees only that habit's name and daily done/not-done status — never
  the user's other habits, stats, or history
- Optional gentle nudge: a buddy can send one pre-written encouragement per day
  ("Cheering for you") — free-text disabled by default

Shared habits / circles:
- A small group (cap it, e.g. 8 people) sharing one habit, with a circle screen
  showing today's check-in status per member
- Join by invite link only; the creator can remove members; any member can
  leave instantly
- A weekly circle summary (who showed up, no ranking by default)

Abuse and privacy controls (required):
- Habit sharing is opt-in per habit; everything is private by default
- Block and report on any participant; leaving a circle removes the user's
  data from other members' views
- Rate-limit invites and nudges; invite links expire and are revocable
- No public profiles, no discovery feed, no strangers — V1 is
  invite-only-by-relationship

Notification copy follows the prompt 04 rules: encouragement, never shame.
Never notify a circle that a member missed a day.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **This feeds `viral-growth-loops.md`**: the buddy/circle invite is the growth loop — instrument invite sent → accepted → activated (first shared check-in) with attribution, and add self-invite/abuse controls. Record acceptance rate in `VIRAL_GROWTH.md`.
- Social pressure is a dual-use mechanism (`ethics-guardrail.md` Social Proof / social-norm pressure): showing a circle who showed up is bright-line; broadcasting who *failed*, rankings by default, or shame nudges are dark-line. The "never notify a miss" rule is the boundary — keep it.
- Visibility rules are RLS policies, not client filtering: a buddy's read access is scoped to the shared habit's daily status. Extend the prompt 01 policies, test them (pgTAP per `backend-data-contract.md`), and add the sharing model to the threat model in `trust/SECURITY.md`.
- Block/report, data removal on leave, and the invite-only posture are launch gates for any social surface (`security-release-hardening.md`); reflect shared-data handling in `privacy-terms.md`.
- Free circles are the classic deliberate-freemium argument in prompt 06 — if circles drive word of mouth, that is a reason to choose freemium *on purpose*.
- Add `buddy_invite_sent`, `buddy_invite_accepted`, `circle_created`, `circle_joined`, `nudge_sent`, `member_blocked` to `analytics/ANALYTICS.md`.
