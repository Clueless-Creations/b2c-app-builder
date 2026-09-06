# Tool Decisions

Record paid, account-gated, and fallback tooling decisions before using or downgrading tools.

| Tool | Lane | Access status | Founder confirmation | Selected route | Fallback limitation |
| --- | --- | --- | --- | --- | --- |
| Compound Engineering | engineering | check current install | required for core engineering work | ce-update, ce-plan, ce-work, ce-code-review, ce-proof | fallback requires a written reason |
| AppKittie | research / ASO | not checked | required before paid/account access | AppKittie MCP | public research only after approval |
| Refero | design | not checked | required before paid/account access | Refero MCP | bundled patterns only after approval |
| Higgsfield | content assets | not checked | required before paid generation | Higgsfield MCP | Remotion fallback requires approval |
| In-app iOS Simulator | iOS proof (rung 0) | check the runtime's own gate: desktop app version, plan, org policy, and that this is a local session | no spend or account approval; needed only when it replaces an intended cross-platform or physical-device route | Claude Code Desktop simulator pane, Claude Code CLI `computer-use`, or Codex `build-ios-apps` | simulated devices only: no physical device, no Android, no repeatable suite/CI, no distribution proof; device screenshots leave the machine, so fixture accounts only |
| MobAI | mobile proof | tier and desktop/MCP/CLI versions not checked | Free needs no spend approval; Plus/Pro and coverage-changing fallback require confirmation | Free / Plus / Pro plus active MCP/CLI route | XcodeBuildMCP is Apple-only; record missing Android/cross-platform proof |
| Codex Desktop native iOS / XcodeBuildMCP | iOS proof | use when exposed or configured | not required for exposed local tools; required when replacing MobAI | session_show_defaults, build_run_sim/test/screenshot/log tools or CLI | Apple-only proof; not Android, provider, or distribution readiness |
| SnapshotPreviews | iOS preview proof | not checked | not required unless introducing new dependency | SnapshotTest or PreviewLayoutTest with TEST_RUNNER_SNAPSHOTS_EXPORT_DIR | preview-only PNG/JSON proof; not runtime E2E |
| serve-sim | iOS simulator stream | not checked | not required unless introducing new dependency or public tunnel | npx serve-sim / localhost preview | simulator stream; not provider or App Store signing proof |

## Mobile Proof Route Decision

One row per decision point. The ladder lives in `knowledge/engineering/xcodebuildmcp-testing.md`; this records which rung this launch actually stood on and why. Moving *down* the ladder — rung 0 instead of rung 2 or 4 — is a coverage decision, not a convenience: it must name what coverage was given up and what would force an escalation.

| Decided at | Lane / question | Rung chosen | Runtime | Why this rung | Coverage given up | Escalation trigger |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | e.g. "does onboarding look right" | 0 in-app simulator | Claude Code Desktop pane / Claude Code CLI `computer-use` / Codex `build-ios-apps` | Pending | Android, physical device, repeatable suite, CI, distribution | Pending — e.g. "Android build enters scope" or "regression suite needed" |
| Pending | cross-platform launch-critical journeys | 4 MobAI | Pending | Pending | n-a | n-a |

A rung 0 row with an unfilled "Coverage given up" cell is not a recorded decision. A launch that ships to both stores and never leaves rung 0 has no Android proof at all; say that here rather than in a lane doc's prose.
