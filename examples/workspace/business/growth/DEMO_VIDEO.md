# {{APP_NAME}} Demo Video Packet

Status: partial
Owner: design-guru + marketing-guru + orchestrator

`growth/DEMO_VIDEO.md` records app-preview, launch-demo, support-demo, and social-demo proof. Use it when in-app iOS Simulator recording (Cmd+R), MobAI recorder, native iOS capture, desktop recorder, Remotion, Higgsfield reframe, or store App Preview work is in scope. Source footage must show the real app or explicitly approved prototype footage.

## Source Inputs

| Source | Role | Status |
| --- | --- | --- |
| `11_STAR_EXPERIENCE.md` | magical moment and line of feasibility | blocked |
| `EMOTIONAL_DESIGN.md` | Emotional North Star and Experience Card for the hook | blocked |
| `strategy/BRAND.md` | voice, owned words, banned claims | blocked |
| `DESIGN.md` | tokens, type, motion, caption style | blocked |
| `SCREENSHOTS.md` | App Preview and screenshot story | blocked |
| In-app iOS Simulator (Cmd+R) / MobAI / native iOS / device capture | real in-app footage | blocked |
| `CONTENT_ASSETS.md` + manifest | route, license, output registry | blocked |

## Storyboard

| Clip | Surface | First frame | 3-5s hook | Main proof | CTA/caption | Status |
| --- | --- | --- | --- | --- | --- | --- |
| App Preview 1 | App Store | Pending | magical V1 moment, muted-readable | real in-app result | Pending | blocked |
| Launch demo | landing/social/support | Pending | user problem in plain language | real flow walkthrough | Pending | blocked |

## Capture And Edit Ledger

| Step | Tool/route | Input | Output | Proof | Status |
| --- | --- | --- | --- | --- | --- |
| Raw capture | in-app iOS Simulator Cmd+R (Desktop → `demo/raw/`), MobAI recorder, Codex Desktop native iOS/XcodeBuildMCP, serve-sim, or approved fallback | device/session | `demo/raw/` | command or recording log | blocked |
| Edit/render | Remotion or approved editor | raw capture + captions | `demo/final/` | render command/log | blocked |
| Reframe | Higgsfield reframe or local render variants | master clip | store/social aspect variants | output manifest | blocked |
| QA | visual + claims review | final clips | approval notes | founder gate | blocked |

## Truth And Accessibility Checks

- [ ] First 3-5 seconds work muted and show the product payoff, not a logo/splash.
- [ ] Captions are readable on mobile and do not cover critical UI.
- [ ] No fake UI, unsupported claim, fabricated count, fake urgency, or bait-and-switch appears.
- [ ] Footage recorded from an agent-driven simulator used a fixture or sandbox account; no real account, real user data, or production credential is visible in any frame.
- [ ] Reduced-motion or low-motion alternative exists when animated effects carry meaning.
- [ ] Output paths, license status, source inputs, and approval status are mirrored in `growth/content-assets/manifest.json`.
- [ ] Founder approval is recorded before public posting, paid ads, store upload, or final App Preview submission.
