# Skills

The canonical source of each skill is the `SKILL.md` under this directory or at the
repository root. Installation is the operator's explicit action: a symlink from
`~/.claude/skills/<name>` or `~/.codex/skills/<name>` to the skill directory. The builder
never installs a skill automatically. Route by intended target and effect, not by title.

| Skill             | Scope        | Source                                                       | Installed into business workspaces |
| ----------------- | ------------ | ------------------------------------------------------------ | ---------------------------------- |
| `b2c-app-builder` | business     | [`../../SKILL.md`](../../SKILL.md)                           | yes                                |
| `b2c-contributor` | contribution | [`b2c-contributor/SKILL.md`](b2c-contributor/SKILL.md)       | opt-in only                        |
| `b2c-maintainer`  | maintenance  | [`b2c-maintainer/SKILL.md`](b2c-maintainer/SKILL.md)         | no; repository-local               |

## Route by intent

The root [`AGENTS.md`](../../AGENTS.md) opens with the routing table. Decide the
target first: one business, reusable builder material, or the builder itself.
The three routers converge on the same architecture documents.

Ownership of an upstream relationship moves with the lifecycle. The contributor
proposes `catalog/upstreams/<id>.yaml` when an accepted unit reuses repository
material. Maintenance owns the manifest after the release that ships it.
[ADR-0007](../../docs/decisions/0007-upstream-lifecycle-and-agent-scopes.md)
records the handoff.
