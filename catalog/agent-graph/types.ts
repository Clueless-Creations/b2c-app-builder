/**
 * Agent graph: who does what, in what order — a map of the work.
 * Order is catalog phase order. This overlay does not replace the catalog.
 */

import type { OntologyClassId } from "../ontology/types.js";
import type { PhaseId, RoleId } from "../types.js";

export const AGENT_ACTOR_KINDS = ["agent", "human"] as const;
export type AgentActorKind = (typeof AGENT_ACTOR_KINDS)[number];

export const AGENT_GATE_OUTCOMES = ["go-pivot-kill", "price", "submit", "ship"] as const;
export type AgentGateOutcome = (typeof AGENT_GATE_OUTCOMES)[number];

export type AgentWorkId = `work.${string}`;

export interface AgentHumanGate {
  authority: "founder";
  writes: OntologyClassId[];
  outcome: AgentGateOutcome;
}

export interface AgentWorkNode {
  id: AgentWorkId;
  order: number;
  phaseId: PhaseId;
  actorKind: AgentActorKind;
  roleIds: RoleId[];
  reads: OntologyClassId[];
  writes: OntologyClassId[];
  humanGate?: AgentHumanGate;
}

export interface AgentGraph {
  schemaVersion: number;
  id: string;
  uri: string;
  prefLabel: string;
  definition: string;
  nodes: AgentWorkNode[];
}

export function isAgentActorKind(value: string): value is AgentActorKind {
  return (AGENT_ACTOR_KINDS as readonly string[]).includes(value);
}

export function isAgentGateOutcome(value: string): value is AgentGateOutcome {
  return (AGENT_GATE_OUTCOMES as readonly string[]).includes(value);
}

export function isAgentWorkId(value: string): value is AgentWorkId {
  return /^work\.[a-z][a-z0-9.-]*$/.test(value);
}
