# Skills

Use the main business entrypoint by default. Focused task skills are optional, generated views of existing workflow contracts and supporting knowledge. They do not create another scheduler or authority model.

| Skill | Scope | Source | Business use |
| --- | --- | --- | --- |
| `b2c-app-builder` | business | [Main entrypoint](../../SKILL.md) | default |
| `b2c-contributor` | contribution | [Contributor](b2c-contributor/SKILL.md) | explicit contribution work only |
| `b2c-maintainer` | maintenance | [Maintainer](b2c-maintainer/SKILL.md) | repository-local, not a business installation |

## Focused tasks

<!-- catalog-generated:start task-skills -->
| Task | Use when |
| --- | --- |
| [Research an opportunity](b2c-research-opportunity/SKILL.md) | Validate an app opportunity |
| [Design or review onboarding](b2c-design-onboarding/SKILL.md) | Design or review onboarding |
| [Review monetization](b2c-review-monetization/SKILL.md) | Review monetization |
| [Define or refine a product](b2c-define-product/SKILL.md) | Define product scope |
| [Plan implementation](b2c-plan-implementation/SKILL.md) | Plan implementation |
| [Review business performance](b2c-review-business-performance/SKILL.md) | Review business performance |
| [Review the app experience](b2c-review-experience/SKILL.md) | Review the app experience |
| [Plan a launch](b2c-plan-launch/SKILL.md) | Plan a launch |
| [Verify release readiness](b2c-verify-release-readiness/SKILL.md) | Verify release readiness |
<!-- catalog-generated:end task-skills -->

These three task entrypoints are the initial set. [Browse all six business areas](../../knowledge/README.md) for the remaining workflows and references. Internal onboarding stages remain behind one task skill, not 23 installations.

## Installation and ownership

Read [Use task skills](../../docs/guides/task-skills.md) to export a relocatable task directory and install it explicitly in a supported host. Keep its references and notices with SKILL.md. The builder never installs a skill or edits agent configuration automatically.

The root [AGENTS.md](../../AGENTS.md) separates business, contribution, and maintenance work. Business work exits to the relevant task or business lifecycle; it does not read maintainer architecture first. Contributor and maintainer routers remain canonical authored guides. Business task skills are generated from the catalog, not authored duplicates.

Upstream relationship ownership still moves from contribution intake to maintenance after release, as defined in [ADR-0007](../../docs/decisions/0007-upstream-lifecycle-and-agent-scopes.md).
