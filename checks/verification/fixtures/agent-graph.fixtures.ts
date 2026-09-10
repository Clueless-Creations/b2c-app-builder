import { readFileSync } from "node:fs";
import path from "node:path";
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

  harness.check("agent-graph: an unknown phase fails closed and does not default to order zero", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const graph = cloneGraph();
    const product = graph.nodes.find((node) => node.phaseId === "phase.1");
    assert(product !== undefined, "phase.1 node must exist");
    const authoredOrder = product.order;
    assert(authoredOrder !== 0, "phase.1 must keep its catalog order so a zero default would be visible");
    product.phaseId = "phase.does-not-exist";
    const issues = validateAgentGraph(catalog, ontology, graph);
    assert(
      issues.some((issue) => issue.code === "catalog_agent.phase.unknown" && issue.message.includes("phase.does-not-exist")),
      `expected unknown phase, got ${issues.map((issue) => `${issue.code}:${issue.message}`).join(" | ")}`,
    );
    assert(product.order === authoredOrder, "unknown phase must not rewrite authored order to zero");
    assert(
      !issues.some((issue) => issue.code === "catalog_agent.phase.unknown" && issue.message.includes("order 0")),
      issues.map((issue) => issue.message).join(" | "),
    );
  });

  harness.check("agent-graph: a duplicate node id fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const ontology = loadWorldOntology(skillRoot);
    const graph = cloneGraph();
    const first = graph.nodes[0];
    const second = graph.nodes[1];
    assert(first !== undefined && second !== undefined, "overlay must have at least two nodes");
    second.id = first.id;
    const issues = validateAgentGraph(catalog, ontology, graph);
    assert(
      issues.some((issue) => issue.code === "catalog_agent.node.duplicate" && issue.message.includes(first.id)),
      `expected duplicate node, got ${issues.map((issue) => `${issue.code}:${issue.message}`).join(" | ")}`,
    );
  });

  harness.check("agent-graph: ownership table records no-change and the loader does not load the catalog", () => {
    const ownership = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/agent-graph-ownership.md"), "utf8");
    const loader = readFileSync(path.join(skillRoot, "catalog/agent-graph/load.ts"), "utf8");
    const schema = JSON.parse(readFileSync(path.join(skillRoot, "catalog/agent-graph/work.schema.json"), "utf8")) as {
      $defs?: { node?: { required?: string[] } };
    };
    const architecture = readFileSync(path.join(skillRoot, "docs/architecture.md"), "utf8");
    assert(ownership.includes("Evidence-backed **no-change**"), ownership);
    assert(ownership.includes("loadAgentGraph(skillRoot)"), ownership);
    assert(ownership.includes("kernel/") && ownership.includes("No. Runtime"), ownership);
    assert(loader.includes("export function loadAgentGraph(skillRoot: string)"), loader);
    assert(!loader.includes("composeCatalog"), "overlay loader must not import the catalog composer");
    assert(schema.$defs?.node?.required?.includes("order"), JSON.stringify(schema.$defs?.node?.required));
    assert(architecture.includes("It is not a second catalog."), architecture);
    assert(architecture.includes("Catalog phases and workflows already own runtime order."), architecture);
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
