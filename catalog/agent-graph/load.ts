import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import YAML from "yaml";
import { packageFile } from "../../tooling/lib/skill-root.js";
import { isOntologyClassId, type OntologyClassId } from "../ontology/types.js";
import type { PhaseId, RoleId } from "../types.js";
import {
  isAgentActorKind,
  isAgentGateOutcome,
  isAgentWorkId,
  type AgentActorKind,
  type AgentGateOutcome,
  type AgentGraph,
  type AgentHumanGate,
  type AgentWorkId,
  type AgentWorkNode,
} from "./types.js";

const schemaPath = packageFile(import.meta.url, "catalog/agent-graph/work.schema.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}

function asClassIds(value: unknown, field: string): OntologyClassId[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${field} must be a string array`);
  }
  return value.map((item, index) => {
    const id = (item as string).trim();
    if (!isOntologyClassId(id)) throw new Error(`${field}[${index}] "${id}" is not a class id`);
    return id;
  });
}

function parseGate(value: unknown, field: string): AgentHumanGate {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const authority = asString(value.authority, `${field}.authority`);
  if (authority !== "founder") throw new Error(`${field}.authority must be founder`);
  const outcomeRaw = asString(value.outcome, `${field}.outcome`);
  if (!isAgentGateOutcome(outcomeRaw)) throw new Error(`${field}.outcome "${outcomeRaw}" is invalid`);
  const outcome: AgentGateOutcome = outcomeRaw;
  return {
    authority: "founder",
    writes: asClassIds(value.writes, `${field}.writes`),
    outcome,
  };
}

function parseNode(value: unknown, index: number): AgentWorkNode {
  if (!isRecord(value)) throw new Error(`nodes[${index}] must be an object`);
  const idRaw = asString(value.id, `nodes[${index}].id`);
  if (!isAgentWorkId(idRaw)) throw new Error(`nodes[${index}].id "${idRaw}" is invalid`);
  const id: AgentWorkId = idRaw;
  if (typeof value.order !== "number" || !Number.isInteger(value.order) || value.order < 0) {
    throw new Error(`nodes[${index}].order must be a non-negative integer`);
  }
  const actorRaw = asString(value.actor_kind, `nodes[${index}].actor_kind`);
  if (!isAgentActorKind(actorRaw)) throw new Error(`nodes[${index}].actor_kind "${actorRaw}" is invalid`);
  const actorKind: AgentActorKind = actorRaw;
  if (!Array.isArray(value.role_ids) || value.role_ids.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`nodes[${index}].role_ids must be a string array`);
  }
  const roleIds = (value.role_ids as string[]).map((item) => item.trim() as RoleId);
  const phaseId = asString(value.phase_id, `nodes[${index}].phase_id`) as PhaseId;
  const humanGate = value.human_gate === undefined ? undefined : parseGate(value.human_gate, `nodes[${index}].human_gate`);
  return {
    id,
    order: value.order,
    phaseId,
    actorKind,
    roleIds,
    reads: asClassIds(value.reads, `nodes[${index}].reads`),
    writes: asClassIds(value.writes, `nodes[${index}].writes`),
    ...(humanGate ? { humanGate } : {}),
  };
}

export function agentGraphPath(skillRoot: string): string {
  return path.join(skillRoot, "catalog/agent-graph/work.yaml");
}

export function loadAgentGraph(skillRoot: string): AgentGraph {
  const filePath = agentGraphPath(skillRoot);
  if (!existsSync(filePath)) throw new Error(`agent graph is missing at ${filePath}`);
  const parsed: unknown = YAML.parse(readFileSync(filePath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    const detail = (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
    throw new Error(`agent graph failed JSON Schema: ${detail}`);
  }
  if (!isRecord(parsed)) throw new Error("agent graph must parse to an object");
  if (!Array.isArray(parsed.nodes)) throw new Error("nodes must be an array");
  return {
    schemaVersion: typeof parsed.schema_version === "number" ? parsed.schema_version : 0,
    id: asString(parsed.id, "id"),
    uri: asString(parsed.uri, "uri"),
    prefLabel: asString(parsed.pref_label, "pref_label"),
    definition: asString(parsed.definition, "definition"),
    nodes: parsed.nodes.map((item, index) => parseNode(item, index)),
  };
}
