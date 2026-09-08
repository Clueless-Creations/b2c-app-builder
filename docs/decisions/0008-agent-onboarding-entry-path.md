# 0008 — Distinguish business creation from workspace adoption

- **Status:** accepted
- **Date:** 2026-09-08
- **Steward:** repository maintainer
- **Affected rules:** ARCH-07, ARCH-09, ARCH-11
- **Affected unit:** U25, versioned business lifecycle facade

## Context and evidence

`createBusiness` in `kernel/services/lifecycle.ts` creates and registers a
planning workspace. A pre-existing registration refuses creation.
`createPlanningWorkspace` in `kernel/session/new.ts` refuses an occupied target.
Previously, the utterance router recommended registration for an empty target,
and registration accepted that target without a workspace scaffold. Following
that advice prevented the agent from using the creation operation afterward.

Setup output, the routing skill, and the full-launch workflow also described
different first commands. The public schema names `workspaceId`, while the CLI
maps that field to `--workspace`. Agents need that mapping in the reference.

## Decision

Use `business-create` for a new business in an empty or absent directory. This
operation remains the owner of creating and registering a planning workspace.
Recommend `workspaces register` only when adopting an existing planning or
runtime scaffold. Refuse registration of an unscaffolded directory before
writing the registry, and give an actionable creation command.

Keep supported `new` and `bootstrap` operations. A workspace created through
those operations can be adopted and resumed; it does not need to be recreated.
Keep existing registration and occupied-target refusals. Explain how to inspect
the registry, resume an existing workspace, or select an unused identity and
empty target. Never delete files or remove registrations automatically.

The shared inspector supplies the distinction to CLI and MCP routing. The skill,
setup, guides, and bound full-launch knowledge teach the same distinction.
Generate public CLI flag mappings and recovery guidance from the contract owner.

## Alternatives

- Documentation alone leaves incorrect live routing in place.
- Removing legacy creation commands breaks supported adoption workflows.
- Automatically clearing registrations or directories risks unrelated work.

## Compatibility and verification

Public operation names, schema fields, and CLI flags retain their meanings.
Registration now rejects directories that cannot be resumed as workspaces.
Existing scaffold adoption remains supported. The refusal does not modify the
registry or target.

Regression coverage must execute greenfield creation, scaffold adoption,
registration refusal, and existing-workspace re-entry. Check CLI and MCP routing,
generated documentation, and installed package behavior. A planning workspace
is a hypothesis; creation does not prove a completed or launched business.
