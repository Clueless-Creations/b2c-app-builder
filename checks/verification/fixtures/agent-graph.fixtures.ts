import { composeCatalog } from "../../../catalog/index.js";
import { loadAgentGraph } from "../../../catalog/agent-graph/load.js";
import type { AgentGraph } from "../../../catalog/agent-graph/types.js";
import { validateAgentGraph, validateAgentGraphFile } from "../../../catalog/agent-graph/validate.js";
import { loadWorldOntology } from "../../../catalog/ontology/load.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function cloneGraph(): AgentGraph {
  return structuredClone(loadAgentGraph(skillRoot));
}

export function register(harness: Harness): void {
  harness.check("agent-graph: the shipped work map matches catalog phases and the world ontology", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const issues = validateAgentGraphFile(catalog, ontology, skillRoot);
    assert(issues.length === 0, issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  });

  harness.check("agent-graph: a missing catalog phase fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const graph = cloneGraph();
    graph.nodes = graph.nodes.filter((node) => node.phaseId !== "phase.1");
    const issues = validateAgentGraph(catalog, ontology, graph);
    assert(
      issues.some((issue) => issue.code === "catalog_agent.phase.missing" && issue.message.includes("phase.1")),
      `expected missing phase.1, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("agent-graph: a read before write fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const graph = cloneGraph();
    const orient = graph.nodes.find((node) => node.id === "work.phase.0-orient");
    assert(orient !== undefined, "orient node must exist");
    orient.reads = ["class.customer"];
    const issues = validateAgentGraph(catalog, ontology, graph);
    assert(
      issues.some((issue) => issue.code === "catalog_agent.read.before_write"),
      `expected read before write, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("agent-graph: an order that drifts from the catalog phase fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const graph = cloneGraph();
    const product = graph.nodes.find((node) => node.phaseId === "phase.1");
    assert(product !== undefined, "phase.1 node must exist");
    product.order = 99;
    const issues = validateAgentGraph(catalog, ontology, graph);
    assert(
      issues.some((issue) => issue.code === "catalog_agent.order.mismatch"),
      `expected order mismatch, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("agent-graph: an unwritten concrete class fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const graph = cloneGraph();
    const product = graph.nodes.find((node) => node.phaseId === "phase.1");
    assert(product !== undefined, "phase.1 node must exist");
    product.writes = product.writes.filter((id) => id !== "class.customer");
    const issues = validateAgentGraph(catalog, ontology, graph);
    assert(
      issues.some((issue) => issue.code === "catalog_agent.class.unwritten" && issue.message.includes("class.customer")),
      `expected unwritten customer, got ${issues.map((issue) => `${issue.code}:${issue.message}`).join(" | ")}`,
    );
  });
}
