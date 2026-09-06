import { readFileSync } from "node:fs";
import path from "node:path";
import { createKnowledgeService, KnowledgeServiceError } from "../../../kernel/knowledge-service/service.js";
import { indexKnowledgeSections } from "../../../kernel/knowledge-service/sections.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { queryInput } from "../../../hosted/knowledge-mcp/http.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(h: Harness): void {
  const bundle = JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"), "utf8")) as HostedKnowledgeBundle;
  const service = createKnowledgeService(bundle);
  const workflowId = "workflow.research.research-backed-spec";
  h.check("Porchwatch F3: default route delivers no knowledge body or expanded instructions", () => {
    const result = service.workflow({ workflowId });
    assert(result.route.mode === "route" && !result.route.instructionsIncluded, "not route-first");
    assert(result.workflow.instructions === "" && result.knowledgeBundle === null && result.dispatchBrief === null, "eager content leaked");
    assert(
      result.route.coverage.incomplete.every((entry) => entry.status === "not_requested"),
      "discovery was called truncation",
    );
    assert(result.route.warnings.length > 0, "required guidance warning missing");
    assert(Buffer.byteLength(JSON.stringify(result)) < 12000, "route exceeds measured metadata budget");
  });
  h.check("Porchwatch F4: research artifact requirements resolve in exactly two service calls without filesystem access", () => {
    const result = service.workflow({ workflowId });
    const artifact = result.route.outputs.find((entry) => entry.path === "strategy/RESEARCH.md");
    assert(artifact?.specifications.length === 1, "research specification not bound");
    const spec = artifact.specifications[0]!;
    assert(result.workflow.referenceIds.includes(spec.get.referenceId), "producer does not bind its specification");
    const section = service.get(spec.get);
    for (const required of ["Source Ledger", "Decision Inputs", "Category Revenue Reality", "SIGNAL_CORPUS.md", "OFFER_TEST.md"])
      assert(section.markdown.includes(required), `missing contract: ${required}`);
    assert(!section.markdown.includes("## `strategy/BRAND.md`"), "retrieval spilled into next artifact");
    assert(
      artifact.validators.some((command) => command.includes("research-workflow-output")),
      "validator route missing",
    );
  });
  h.check("Porchwatch F4: section identities are revision-safe and unknown selectors refuse", () => {
    const route = service.workflow({ workflowId });
    const call = route.route.outputs.find((x) => x.path === "strategy/RESEARCH.md")!.specifications[0]!.get;
    for (const [input, code] of [
      [{ ...call, expectedContentSha256: "0".repeat(64) }, "revision_mismatch"],
      [{ ...call, sectionId: "unknown" }, "not_found"],
      [{ referenceId: call.referenceId, sectionId: call.sectionId }, "invalid_arguments"],
    ] as const) {
      let actual = "";
      try {
        service.get(input);
      } catch (error) {
        actual = error instanceof KnowledgeServiceError ? error.code : "unexpected";
      }
      assert(actual === code, `expected ${code}, got ${actual}`);
    }
  });
  h.check("Porchwatch F4: paginated sections reassemble exactly with section-relative offsets", () => {
    const call = service.workflow({ workflowId }).route.outputs.find((x) => x.path === "strategy/RESEARCH.md")!.specifications[0]!.get;
    const whole = service.get(call);
    let part = service.get({ ...call, limit: 151 }),
      text = part.markdown;
    let requests = 0;
    while (part.nextCall) {
      assert(++requests < 100, "continuation did not terminate");
      part = service.get({ ...part.nextCall, limit: 151 });
      text += part.markdown;
    }
    assert(text === whole.markdown, "section paging lost or duplicated content");
  });
  h.check("Porchwatch F4: Markdown index handles fences, duplicate and nested headings, Setext and Unicode", () => {
    const source = "# 🦆 Root\n\n## Same\nA\n### Child\nB\n```md\n## Fake\n```\n\n## Same\nC\n\nSetext 🐈\n--------\nD\n";
    const sections = indexKnowledgeSections(source);
    assert(sections.length === 5 && !sections.some((s) => s.title === "Fake"), "Markdown parsing failed");
    assert(new Set(sections.map((s) => s.id)).size === sections.length, "duplicate heading IDs");
    const chars = Array.from(source);
    assert(chars.slice(sections[1]!.start, sections[1]!.end).join("").includes("### Child"), "descendants excluded");
    assert(!chars.slice(sections[1]!.start, sections[1]!.end).join("").includes("\nC\n"), "sibling included");
    assert(sections[2]!.parentId === sections[1]!.id, "hierarchy lost");
    assert(sections[4]!.title === "Setext 🐈", "Setext or Unicode lost");
    assert(indexKnowledgeSections("plain prose").length === 0, "invented heading");
  });
  h.check("Porchwatch F3/F4: explicit body modes and section-index discovery remain available", () => {
    const route = service.workflow({ workflowId });
    const ref = route.route.references[0]!;
    const index = service.get({ ...ref.get, view: "sections", sectionLimit: 1 });
    assert(
      index.markdown === "" && index.sections?.items.length === 1 && index.pagination.nextOffset === null,
      "section discovery shipped a body or misleading body continuation",
    );
    assert(
      index.nextCall?.view === "sections" && service.get(index.nextCall).sections?.items[0]?.id !== index.sections.items[0]?.id,
      "heading index cannot continue exactly",
    );
    assert(service.workflow({ workflowId, include: "instructions" }).workflow.instructions.length > 0, "instruction expansion missing");
    const full = service.workflow({ workflowId, include: "full", tokenBudget: 256 });
    assert(full.knowledgeBundle?.consumedChars === 256 && full.route.coverage.incomplete.length > 0, "legacy allocator or coverage broken");
    let refused = false;
    try {
      service.workflow({ workflowId, include: "route", tokenBudget: 256 });
    } catch {
      refused = true;
    }
    assert(refused, "ignored inapplicable body budget");
    const args = queryInput(new URL("https://example.invalid/?view=sections&sectionOffset=1&sectionLimit=2"));
    assert(args.sectionOffset === 1 && args.sectionLimit === 2, "HTTP does not share numeric schema");
  });
}
