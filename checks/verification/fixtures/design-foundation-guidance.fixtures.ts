import { readFileSync } from "node:fs";
import path from "node:path";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import { callKnowledgeTool, toCallToolResult } from "../../../kernel/knowledge-service/tools.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { HOSTED_BUNDLE_RELATIVE_PATH } from "../../../tooling/render-hosted-bundle.js";
import { checkContrastMechanical } from "../../validation/business/design/lib/worthiness-mechanical.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("design foundation: public workflow handoff resolves bounded authored specifications", () => {
    const bundle = JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
    const service = createKnowledgeService(bundle);
    const route = service.workflow({ workflowId: "workflow.design.design-room" });
    assert(
      route.workflow.gateCommands.includes("check:design-foundation"),
      "substantive design workflow must require foundation through the existing validator",
    );
    const design = route.route.outputs.find((output) => output.path === "DESIGN.md")!;
    assert(design.specificationAvailable, "DESIGN authority must have retrievable specifications");
    const sections = design.specifications.map((spec) => service.get({ ...spec.get, limit: 16384 }));
    for (const heading of [
      "Communication Brief",
      "The Derivation Chain",
      "Composition Review",
      "Communication And Composition Decisions",
      "Typography In Use",
    ]) {
      const section = sections.find((item) => item.section?.title === heading);
      assert(section !== undefined, `missing required ${heading} section`);
      assert(section.pagination.nextOffset === null, `${heading} must fit the bounded response`);
      assert(section.markdown.length > 100, `${heading} must carry usable content`);
    }
    const pointer = design.specifications[0]!.get;
    const direct = callKnowledgeTool(service, "b2c_knowledge_get", pointer);
    const mcp = toCallToolResult(() => callKnowledgeTool(service, "b2c_knowledge_get", pointer));
    assert(JSON.stringify(mcp.structuredContent) === JSON.stringify(direct), "MCP and direct handoff must carry identical guidance");
    let stale = false;
    try {
      service.get({ ...pointer, expectedContentSha256: "0".repeat(64) });
    } catch {
      stale = true;
    }
    assert(stale, "stale section pointer must refuse instead of returning a new revision silently");
    assert(route.guardrails.executionAvailable === false, "hosted retrieval cannot claim execution");
  });
  harness.check("design foundation: independent review receives diagnosis through the existing output owner", () => {
    const bundle = JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
    const service = createKnowledgeService(bundle);
    for (const [id, output] of [
      ["workflow.design.design-system-audit", "design/reviews/DESIGN_SYSTEM_REVIEW.md"],
      ["workflow.design.implementation-craft-audit", "design/reviews/IMPLEMENTATION_REVIEW.md"],
    ] as const) {
      const route = service.workflow({ workflowId: id });
      const specifications = route.route.outputs.find((item) => item.path === output)!.specifications;
      assert(
        specifications.some((item) => service.get(item.get).section?.title === "Defect diagnosis"),
        "review handoff omitted diagnosis",
      );
      if (id === "workflow.design.design-system-audit")
        assert(route.workflow.gateCommands.includes("check:design-md"), "existing design audit retains legacy-compatible validation");
      assert((route.workflow.reviewOf?.length ?? 0) > 0, "review must retain declared producer exclusion");
    }
  });
  harness.check("design foundation: decorative primary contrast does not masquerade as a proven WCAG failure", () => {
    const findings = checkContrastMechanical({ tokens: { color: { background: "#ffffff", text: "#111111", primary: "#eeeeee" } } });
    assert(
      findings.some((item) => item.code === "worthiness.contrast_primary" && item.severity === "warning"),
      "unknown primary usage requires contextual inspection",
    );
    assert(!findings.some((item) => item.severity === "error"), "decorative token alone cannot prove a violation");
    const text = checkContrastMechanical({ tokens: { color: { background: "#ffffff", text: "#eeeeee", primary: "#111111" } } });
    assert(
      text.some((item) => item.code === "worthiness.contrast_text" && item.severity === "error"),
      "actual body-text pair still fails its floor",
    );
  });
}
