# Skill Versioning And Runtime Freshness

This skill must detect when the installed runtime copy is behind the latest local source copy before starting substantial launch, design, store, revenue, or build work.

## Runtime Freshness Loop

1. Read `skill-version.json` from the installed skill runtime.
2. Compare it with the latest source copy when available.
3. If the installed runtime is current, continue the original request.
4. If the installed runtime is stale, pause before continuing the original request and use the AskUserQuestion flow when available:

```text
A newer B2C App Builder skill is available: installed <installed_version>, latest <latest_version>.
Do you want me to update the local skill runtime now so I can use the latest launch and Design Room features, or continue with the installed version for this request?
```

If AskUserQuestion is unavailable, ask the same question plainly and wait for the founder's answer.
Unavailable source content does not prove freshness. Report the failed check and obtain an
explicit decision before continuing without verification.

## Commands

From the source repo:

```bash
npm run check:skill-version -- --source . --installed ~/.codex/skills/b2c-app-builder
npm run check:version-discipline -- --repo-root . --skill-root .
```

Local checks, including `--all-runtimes`, are offline. Only `--remote` or `--remote-url` requests
a remote comparison. The flag must have a non-empty URL value, not another flag.

For an authorized comparison with the private repository, supply `GH_TOKEN` or `GITHUB_TOKEN`
through the approved secret runtime. `GH_TOKEN` takes precedence. Do not put a token in the URL
or extract one from `gh auth`. Then run:

```bash
npm run check:skill-version -- \
  --installed ~/.codex/skills/b2c-app-builder \
  --remote-url https://raw.githubusercontent.com/Emuthmartinez/b2c-app-builder/main/skill-version.json
```

Known first-party raw and blob URLs map to the GitHub contents API with the raw media type.
Only exact allowlisted repository content paths receive the token. GitHub HTML, repository
roots, issues, security pages, Shields, and foreign hosts do not receive it. Unsupported
private links remain blocked. The reader refuses redirects and checks HTTP 200 before reading
the body. A denied response never falls back to anonymous access.

Missing credentials, denial, timeout, and other fetch failures produce
`ERROR skill_version.remote_unavailable` with exit status 1. They do not produce a current or
stale comparison. Errors omit supplied URLs and response text. An invalid remote manifest
also fails verification.

From the installed runtime:

```bash
cd ~/.codex/skills/b2c-app-builder
# replace the --source path with your local clone of this repo
npm run check:skill-version -- --source "$HOME/code/b2c-app-builder" --installed .
```

When the founder approves an upgrade on this machine, run the ownership-tracked sync from the repo root:

```bash
npm run runtime:check
```

```bash
npm run runtime:sync -- --all-clients
```

`runtime:sync` computes its plan from git-tracked source files against the manifest that the previous sync wrote (`.runtime-sync-manifest.json` in the runtime). It copies changed files, deletes only files that a previous sync wrote and the source no longer ships, preserves unowned files, and refuses to overwrite runtime files edited since the last sync. Resolve those conflicts in source or pass `--force` deliberately. On the first run without a manifest, pass `--adopt` after you confirm that no runtime-only fixes must return to source. After writing, it installs dependencies when required, runs runtime verification, and reports whether the `~/.claude/skills/b2c-app-builder`, `~/.agents/skills/b2c-app-builder`, and `~/.cursor/skills/b2c-app-builder` links resolve to the synced runtime.

Use `runtime:sync` for installed copies. It tracks ownership, protects runtime edits, and preserves unowned files.

Managed-file cleanup follows the same ownership rules. An unchanged managed file can be
deleted; a hand-edited file blocks sync before any planned write. An unowned file remains.
For temporary installation tests, always supply both `--installed <temporary-runtime>` and
`--runtimes-root <temporary-client-root>`. Alias diagnostics use that client root. Without the
flag, they use the normal machine home. Do not override `HOME` or `CODEX_HOME` for tests.

The runtime includes `catalog/generated/knowledge-freshness.json`. This pin carries the
reviewed source snapshot date and digest. Installed catalog checks use that pin without
reading documents above the installed directory. Missing or invalid pins fail the audit.
Repository checks also compare the pin with the canonical source snapshot. Do not copy
repository documents into a client directory to repair a missing pin; render and sync the
owned source file.

## Rules

- `skill-version.json` is the version source of truth for installed-runtime freshness.
- `check-skill-version.ts` must return a nonzero status when the installed runtime is older than the source copy.
- `check-version-discipline.ts` must pass before committing skill behavior changes; it enforces that meaningful skill edits and `skill-version.json` move together.
- A stale installed runtime is a founder decision gate, not a silent warning.
- If the source copy or remote manifest is unavailable, report the failure. Continue without verification only after an explicit human decision.
- Runtime upgrades must preserve user work. `runtime:sync` writes only git-tracked source files and never touches unowned runtime files. It stops on conflicting runtime edits instead of overwriting them.
