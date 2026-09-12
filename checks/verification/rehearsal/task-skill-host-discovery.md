# Task-skill host-discovery rehearsal

Status: deterministic package proof passed; actual host discovery remains unverified.

## Tested artifact

- Source revision: `4310c966d8962035302cb74513919c49d9e14729`
- Package: `b2c-app-builder@0.220.20`
- Artifact mode: `npm pack --dry-run`
- Packed file count: 2,619
- Task-skill contract: 19 passed, 0 failed
- Package parity: 0 errors, 0 warnings

The packed artifact contains the generated root skill, the nine declared portable task skills,
their required references, notices, and relocation-safe resource closure. This is package proof,
not proof that a host has discovered or loaded a skill.

## Host observation

| Host | Observed version | Documented user location | Matching installed B2C skills | Result |
| --- | --- | --- | ---: | --- |
| Codex CLI | `0.149.1` | `~/.agents/skills/<name>` | 0 | Discovery not verified |
| Claude Code | `2.1.261` | `~/.claude/skills/<name>` | 0 | Discovery not verified |

No host installation, configuration change, authentication, model invocation, provider call,
or paid operation was performed. A missing installed skill is recorded as missing capability,
not as successful discovery. The next authorized rehearsal must install one isolated task per
host through the host's supported mechanism, then capture discovery output and cleanup.

## Limits

This report does not claim semantic model quality, provider readiness, offline availability of
supplemental links, or successful discovery from a source checkout. Those remain separate
acceptance criteria under #386 and #75.
