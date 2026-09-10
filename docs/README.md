# Documentation

B2C App Builder supplies consumer-business primitives through a skill, CLI, and MCP.

| I want to…                            | Start here                                                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Try the toolkit                       | [Quick start](../README.md#get-started)                                                                                                                              |
| Understand the ethos                  | [Let your agents cook](ethos.md) and its [kitchen-language boundary](ethos.md#kitchen-language-boundary) |
| Build or improve one business         | [Business-building guide](guides/build-a-business.md)                                                                                                                |
| Understand the stable interface       | [Public interface](public-interface.md) and [generated reference](../contracts/public-api/REFERENCE.md)                                                              |
| Operate or capture a mobile app       | [Mobile app operation](guides/mobile-app-operation.md)                                                                                                               |
| Add a capability, recipe, or package  | [Extension guide](guides/extend-the-system.md)                                                                                                                       |
| Implement or upgrade a provider transport | [Provider integrations](guides/provider-integrations.md) and [ADR-0013](decisions/0013-provider-integration-boundary.md)                                         |
| Work on the platform                  | [Contributing](../CONTRIBUTING.md), then [AGENTS.md](../AGENTS.md)                                                                                                   |
| Decide which scope you are in         | The three-scope table that opens [AGENTS.md](../AGENTS.md): one business, a reusable contribution, or the builder itself                                             |
| Write builder-facing or console copy  | [No-slop writing](../knowledge/words/no-slop-writing.md), including **Original: Builder house style** |
| Look up a check                       | [Validator map](validators.md)                                                                                                                                       |
| Understand founder authority grants   | [Authority envelopes](authority-envelopes.md)                                                                                                                        |
| Audit an architectural change         | [North-star architecture](north-star-architecture.md), [conformance protocol](architecture-conformance.md), and [decision records](decisions/README.md)              |
| Understand the repository layout      | [ADR-0002: repository layout](decisions/0002-repository-layout.md)                                                                                                   |
| Choose an implementation task         | [Migration roadmap](plans/2026-09-04-1747-refactor-consumer-business-primitives-plan.md), then the [dispatch board](plans/2026-09-05-architecture-dispatch-board.md) |
| Understand current internals          | [Current architecture](architecture.md) and [runtime package](guides/runtime-package.md)                                                                             |
| Edit the diagrams                     | [Assets and identity derivation](assets/README.md)                                                                                                                   |
| Adopt an external source              | [Adopt external sources](guides/adopt-external-sources.md), then the [contributor skill](../agents/skills/b2c-contributor/SKILL.md)                                  |
| Maintain an upstream relationship     | [Adopt external sources](guides/adopt-external-sources.md#upstream-relationships), [ADR-0005](decisions/0005-source-adoption-and-upstream-maintenance.md), and [ADR-0007](decisions/0007-upstream-lifecycle-and-agent-scopes.md) |
| Credit an upstream or read its support state | [Upstream reports](upstreams/README.md): the generated `ACKNOWLEDGMENTS.md`, `THIRD_PARTY_NOTICES.md`, and support report                                     |

## Authority and status

The north-star architecture defines the target. The public interface defines the
supported consumer contract. Generated schemas and the CLI and MCP parity tests
enforce that contract. The current-architecture document describes the implementation.

Plans, research, historical design records, and parked proposals are context. They
do not override those owners. A roadmap checkbox, a declaration, a reference, or a
CLI name is not proof that an integration or business works.

The public v1 surface includes discovery, declaration preview, registered status,
package snapshots, recoverable local composition activation, and market reports. The runtime commands and knowledge tools use the shared execution services. Hosted knowledge is a separate read-only surface. It does not expose local
composition or workspace operations.

[Research resume and bounded knowledge](guides/research-resume-and-knowledge.md) describes the registered planning lifecycle and route-first retrieval.
