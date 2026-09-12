# Use task skills

There are two ways to use the builder. Use a task skill for focused expertise, or use the main business skill to coordinate a durable business through status, plan, execution, and evidence. Both use the same catalog and sourced knowledge.

## Choose a task

The [knowledge landing page](../../knowledge/README.md) uses the same six areas as the main README. The [skill index](../../agents/skills/README.md) lists nine shipped task skills across all six areas. The expanded jobs cover product definition, implementation planning, business-performance review, broader experience review, launch planning, and target-specific release-readiness inspection.

A request to review onboarding is not a request to rebuild it. A request to evaluate pricing is not permission to change a live price. A narrow code fix should follow the application's own instructions, not start the complete-business graph.

## Use from a checkout

Open the matching `agents/skills/<name>/SKILL.md`. Its main method comes from the canonical workflow. Its references expose inputs, outputs, checks, and knowledge selectors only when needed. Onboarding exposes one skill over its existing internal stages.

Use available, authorized evidence and tools. You do not need the B2C runtime or an MCP connection for advisory work. A live provider claim still needs the actual provider tools and evidence. For a managed business, the current business plan determines executable work; a task skill is not a substitute planner.

## Export one portable skill

From a source checkout with Node.js 24 and dependencies installed:

```bash
npm run skills:export -- --skill b2c-research-opportunity --output /tmp/b2c-task-skills
```

The command creates `/tmp/b2c-task-skills/b2c-research-opportunity/`. Choose a new output directory for each export. Existing installations are never overwritten. Outside a Git checkout, add `--source-revision` with the full reviewed source commit SHA.

The directory contains `SKILL.md`, conditional workflow references, the selected bound knowledge and linked manifest-backed references, source/resource hashes, `LICENSE`, and `THIRD_PARTY_NOTICES.md`. References are packaged, not loaded at startup. Supplemental repository links retain a pinned source URL and require network access. Provider tools, the B2C runtime, workspace state, and credentials are not included. Do not copy only SKILL.md and leave its reference files behind.

Exports are derived snapshots. Change catalog or knowledge sources and export again; do not edit an installed snapshot as the new source of truth. The source manifest records the actual source bytes, not a claim of live provider compatibility or accepted business evidence.

## Install only when requested

The standard skill directory can be copied or linked into a host's supported skill location. For Codex, current documentation uses `~/.agents/skills/<name>` for a user's skills and `.agents/skills/<name>` for repository-local skills. For Claude Code, use its documented `.claude/skills` location. Confirm discovery in the actual host after installation. A common file format does not prove identical host behavior.

Keep the main business entrypoint as the default. Install a focused task when it is independently useful. Do not install every task, provider, contributor, and maintainer skill for every business. Host-specific tool dependencies belong in thin host metadata, not in the reusable method.

Official format and host references, checked September 11, 2026:

- [Agent Skills specification](https://agentskills.io/specification)
- [OpenAI skills documentation](https://developers.openai.com/codex/skills/)
- [Claude Code skills documentation](https://code.claude.com/docs/en/skills)

## Maintain the projections

Public area labels and domain mappings live in `catalog/areas.ts`. Task descriptors live in `catalog/task-skills.ts`; they bind existing workflows and contain no second method or scheduler. Instructions, output contracts, gates, and knowledge bindings come from the existing catalog and manifests.

```bash
npm run render:all
npm run check:task-skills
npm run check:agent-entrypoints
```

The checks enforce frontmatter, generated drift, required reference resolution, context budgets, provider-neutral startup methods, and portable export safety. Full CI remains required before merging. Deterministic routing expectations are not a live host-agent benchmark; use the existing behavioral evaluation harness under an approved budget for that proof.
