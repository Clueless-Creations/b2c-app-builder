import { existsSync } from "node:fs";
import { concreteClassIds } from "../ontology/query.js";
import type { WorldOntology } from "../ontology/types.js";
import type { Catalog, CatalogIssue } from "../types.js";
import { loadAgentGraph, agentGraphPath } from "./load.js";
import type { AgentGraph, AgentWorkNode } from "./types.js";

function error(code: string, message: string, issuePath?: string): CatalogIssue {
  return { severity: "error", code, message, path: issuePath };
}

const GRAPH_PATH = "catalog/agent-graph/work.yaml";

function nodeProduces(node: AgentWorkNode): string[] {
  return [...node.writes, ...(node.humanGate?.writes ?? [])];
}

export function validateAgentGraph(catalog: Catalog, ontology: WorldOntology, graph: AgentGraph): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  if (graph.schemaVersion !== 1) {
    issues.push(error("catalog_agent.schema_version", `agent graph schema_version must be 1, got ${graph.schemaVersion}`, GRAPH_PATH));
  }

  const classById = new Map(ontology.classes.map((item) => [item.id, item]));
  const phaseById = new Map(catalog.phases.map((item) => [item.id, item]));
  const roleIds = new Set(catalog.roles.map((item) => item.id));
  const nodeIds = new Set<string>();
  const phaseSeen = new Set<string>();
  const orderSeen = new Set<number>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) issues.push(error("catalog_agent.node.duplicate", `duplicate node ${node.id}`, GRAPH_PATH));
    nodeIds.add(node.id);
    if (orderSeen.has(node.order)) {
      issues.push(error("catalog_agent.order.duplicate", `order ${node.order} is used more than once`, GRAPH_PATH));
    }
    orderSeen.add(node.order);
    if (phaseSeen.has(node.phaseId)) {
      issues.push(error("catalog_agent.phase.duplicate", `phase ${node.phaseId} appears more than once`, GRAPH_PATH));
    }
    phaseSeen.add(node.phaseId);
    const phase = phaseById.get(node.phaseId);
    if (!phase) {
      issues.push(error("catalog_agent.phase.unknown", `${node.id} names unknown phase ${node.phaseId}`, GRAPH_PATH));
    } else if (phase.order !== node.order) {
      issues.push(error("catalog_agent.order.mismatch", `${node.id} order ${node.order} must match catalog ${node.phaseId} order ${phase.order}`, GRAPH_PATH));
    }
    if (node.actorKind === "agent" && node.roleIds.length === 0) {
      issues.push(error("catalog_agent.role.missing", `${node.id} is an agent node with no role`, GRAPH_PATH));
    }
    if (node.actorKind === "human" && node.roleIds.length > 0) {
      issues.push(error("catalog_agent.role.human", `${node.id} is human and must not name a role`, GRAPH_PATH));
    }
    for (const roleId of node.roleIds) {
      if (!roleIds.has(roleId)) {
        issues.push(error("catalog_agent.role.unknown", `${node.id} names unknown role ${roleId}`, GRAPH_PATH));
      }
    }
    const io = [
      ...node.reads.map((id) => ["read", id] as const),
      ...node.writes.map((id) => ["write", id] as const),
      ...(node.humanGate?.writes ?? []).map((id) => ["gate", id] as const),
    ];
    for (const [kind, classId] of io) {
      const ontologyClass = classById.get(classId);
      if (!ontologyClass) {
        issues.push(error("catalog_agent.class.unknown", `${node.id} ${kind}s unknown class ${classId}`, GRAPH_PATH));
        continue;
      }
      if (ontologyClass.abstract) {
        issues.push(error("catalog_agent.class.abstract", `${node.id} ${kind}s abstract class ${classId}`, GRAPH_PATH));
      }
    }
  }

  for (const phase of catalog.phases) {
    if (!phaseSeen.has(phase.id)) {
      issues.push(error("catalog_agent.phase.missing", `catalog phase ${phase.id} has no agent-graph node`, GRAPH_PATH));
    }
  }

  const ordered = [...graph.nodes].sort((left, right) => left.order - right.order);
  const produced = new Set<string>();
  for (const node of ordered) {
    for (const classId of node.reads) {
      const writtenHere = node.writes.includes(classId);
      if (!produced.has(classId) && !writtenHere) {
        issues.push(error("catalog_agent.read.before_write", `${node.id} reads ${classId} before any earlier node writes it`, GRAPH_PATH));
      }
    }
    for (const classId of nodeProduces(node)) produced.add(classId);
  }

  const written = new Set(graph.nodes.flatMap((node) => nodeProduces(node)));
  for (const classId of concreteClassIds(ontology)) {
    if (!written.has(classId)) {
      issues.push(error("catalog_agent.class.unwritten", `concrete class ${classId} is never written by the agent graph`, GRAPH_PATH));
    }
  }

  const outcomes = graph.nodes.map((node) => node.humanGate?.outcome).filter((item): item is NonNullable<typeof item> => item !== undefined);
  for (const required of ["go-pivot-kill", "price", "submit", "ship"] as const) {
    if (!outcomes.includes(required)) {
      issues.push(error("catalog_agent.gate.missing_outcome", `agent graph has no founder gate with outcome ${required}`, GRAPH_PATH));
    }
  }

  return issues;
}

export function validateAgentGraphFile(catalog: Catalog, ontology: WorldOntology, skillRoot: string): CatalogIssue[] {
  if (!existsSync(agentGraphPath(skillRoot))) {
    return [error("catalog_agent.missing", "agent graph is missing", GRAPH_PATH)];
  }
  try {
    return validateAgentGraph(catalog, ontology, loadAgentGraph(skillRoot));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return [error("catalog_agent.invalid", message, GRAPH_PATH)];
  }
}
