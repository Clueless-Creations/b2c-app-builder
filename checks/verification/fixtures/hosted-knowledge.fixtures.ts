import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { toCatalogInput } from "../../../catalog/bridge.js";
import type { Catalog, CatalogKnowledgePackage } from "../../../catalog/types.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { MAX_HOSTED_RESPONSE_BYTES, queryInput } from "../../../hosted/knowledge-mcp/http.js";
import { codePointPrefix, createKnowledgeService, KnowledgeServiceError } from "../../../kernel/knowledge-service/service.js";
import { callKnowledgeTool, KNOWLEDGE_TOOL_DEFINITIONS, toCallToolResult } from "../../../kernel/knowledge-service/tools.js";
import {
  HOSTED_KNOWLEDGE_SCHEMA_VERSION,
  MAX_HOSTED_DOCUMENT_BYTES,
  MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
  MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET,
  type HostedKnowledgeBundle,
} from "../../../kernel/knowledge-service/types.js";
import {
  buildHostedKnowledgeBundle,
  hostedBundleIsCurrent,
  HOSTED_BUNDLE_RELATIVE_PATH,
  serializeHostedKnowledgeBundle,
} from "../../../tooling/render-hosted-bundle.js";
import { HOSTED_VERSION_BUNDLE_PATH, readHostedVersionPair } from "../../../tooling/print-hosted-version.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

function fixtureBundle(): HostedKnowledgeBundle {
  const catalog: Catalog = {
    schemaVersion: "2.0.0",
    skillVersion: "0.0.0-fixture",
    areas: [],
    domains: [
      { id: "domain.research", slug: "research", name: "Research", areaIds: [], routeLabel: "Research", routeWhen: "Research before building", order: 1 },
      { id: "domain.growth", slug: "growth", name: "Growth", areaIds: [], routeLabel: "Growth", routeWhen: "Find customers", order: 2 },
    ],
    phases: [],
    lanes: [],
    roles: [],
    contextPacks: [],
    references: [
      {
        id: "reference.research.interviews",
        path: "knowledge/research/interviews.md",
        domainId: "domain.research",
        title: "Customer interviews",
        loadWhen: "Before product decisions",
        lifecycle: "active",
        applicabilityNotes: "Use before the product scope is fixed.",
        sources: [
          {
            id: "source.fixture",
            name: "Fixture source",
            sourceType: "official_docs",
            url: "https://example.com/research",
            reviewCadenceDays: 30,
            claimScope: "Interview methods",
            lastReviewDate: "2026-08-20",
            reviewer: "Fixture reviewer",
          },
        ],
        replacementIds: [],
      },
      {
        id: "reference.growth.retention",
        path: "knowledge/growth/retention.md",
        domainId: "domain.growth",
        title: "Customer retention",
        loadWhen: "After launch",
        lifecycle: "active",
        applicabilityNotes: "Use after activation.",
        sourceExemption: "Internal fixture guidance.",
        sources: [],
        replacementIds: [],
      },
    ],
    workflows: [
      {
        id: "workflow.research.interviews",
        title: "Interview customers",
        domainId: "domain.research",
        areaIds: [],
        trigger: "Before the spec is written",
        founderPhrasings: [],
        instructions: "Ask about recent behavior. Produce an evidence-backed account of the problem.",
        reads: ["strategy/BRIEF.md"],
        consults: ["PRODUCT.md"],
        referenceIds: ["reference.research.interviews"],
        roleId: "role.research",
        laneIds: [],
        phaseIds: [],
        dependencies: [],
        outputPaths: ["research/INTERVIEWS.md"],
        gateCommands: ["check:research"],
        providerIds: [],
        founderOnlyActions: ["Approve customer outreach"],
        actionClass: "draft",
        idempotent: true,
        applicability: { mode: "always" },
      },
    ],
    artifacts: [],
    gates: [],
    profiles: [],
  };
  const texts = [
    "# Customer interviews\n\nAsk about recent behavior. 🦆 Record evidence, not guesses.\n",
    "# Customer retention\n\nUse customer interviews to understand repeat value.\n",
  ];
  return {
    schemaVersion: HOSTED_KNOWLEDGE_SCHEMA_VERSION,
    engineVersion: catalog.skillVersion,
    catalogSha256: digest(JSON.stringify(catalog)),
    bundleSha256: digest("fixture-bundle"),
    catalog,
    documents: catalog.references.map((reference, index) => ({
      referenceId: reference.id,
      markdown: texts[index]!,
      summary: codePointPrefix(texts[index]!, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH),
      contentSha256: digest(texts[index]!),
      sourceMediaType: "text/markdown",
      sourceSha256: digest(texts[index]!),
      manifestPath: `catalog/knowledge/${reference.id}.yaml`,
      manifestSha256: digest(reference.id),
    })),
  };
}

function expectError(fn: () => unknown, fragment: string): void {
  let message = "";
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(fragment), `expected rejection containing ${fragment}; got ${message || "no error"}`);
}

function materialize(harness: Harness, name: string): { root: string; bundle: HostedKnowledgeBundle; packages: CatalogKnowledgePackage[] } {
  const root = harness.makeTempDir(name);
  const bundle = fixtureBundle();
  const packages = bundle.catalog.references.map((reference, index) => {
    const document = bundle.documents[index]!;
    mkdirSync(path.dirname(path.join(root, reference.path)), { recursive: true });
    mkdirSync(path.dirname(path.join(root, document.manifestPath)), { recursive: true });
    writeFileSync(path.join(root, reference.path), document.markdown, "utf8");
    writeFileSync(path.join(root, document.manifestPath), `id: ${reference.id}\nlifecycle: active\n`, "utf8");
    return { ...reference, workflowIds: [], contextPackIds: [], manifestPath: document.manifestPath };
  });
  return { root, bundle, packages };
}

export function register(harness: Harness): void {
  harness.check("hosted knowledge: catalog lookup returns the authored workflow with bounded pagination", () => {
    const service = createKnowledgeService(fixtureBundle());
    const browse = service.catalog({ limit: 1 });
    assert(browse.workflows[0]?.id === "workflow.research.interviews", "catalog browse must return workflows when query is omitted");
    const result = service.catalog({ domainId: "domain.research", query: "interview", limit: 1 });
    assert(result.workflows.length === 1 && result.workflows[0]?.id === "workflow.research.interviews", "catalog omitted the matching workflow");
    assert(result.pagination.total === 1 && result.pagination.nextOffset === null, "catalog pagination is incorrect");
    assert(service.catalog({ offset: 1 }).workflows.length === 0, "offset must not repeat the first page");
    assert(result.scope === "knowledge_only", "catalog must not claim execution");
  });

  harness.check("hosted knowledge: workflow lookup preserves instructions, artifacts, references, and authority boundaries", () => {
    const bundle = fixtureBundle();
    const result = createKnowledgeService(bundle).workflow({ workflowId: "workflow.research.interviews", include: "instructions" });
    assert(JSON.stringify(result.workflow) === JSON.stringify(bundle.catalog.workflows[0]), "workflow contract changed in transit");
    assert(result.knowledge[0]?.referenceId === "reference.research.interviews", "workflow knowledge is missing");
    assert(!result.guardrails.executionAvailable && !result.guardrails.workspacePlan, "static guidance must not become execution or a workspace plan");
    assert(result.guardrails.founderOnlyActions[0] === "Approve customer outreach", "founder-only boundary was lost");
  });

  harness.check("hosted knowledge: search is deterministic, bounded, and filters by domain", () => {
    const service = createKnowledgeService(fixtureBundle());
    const first = service.search({ query: "customer", limit: 1 });
    assert(first.results.length === 1 && first.pagination.total === 2 && first.pagination.nextOffset === 1, "search page is not bounded");
    const second = service.search({ query: "customer", limit: 1, offset: 1 });
    assert(first.results[0]?.referenceId !== second.results[0]?.referenceId && second.pagination.nextOffset === null, "search page repeated or lost results");
    assert(JSON.stringify(first) === JSON.stringify(service.search({ query: "customer", limit: 1 })), "search is not deterministic");
    const filtered = service.search({ query: "customer", domainId: "domain.growth" });
    assert(filtered.results.length === 1 && filtered.results[0]?.referenceId === "reference.growth.retention", "search ignored domain filter");
    assert(Array.from(first.results[0]?.excerpt ?? "").length <= 512, "search returned an unbounded excerpt");
  });

  harness.check("hosted knowledge: query fallback preserves strict matches and ranks partial matches deterministically", () => {
    const service = createKnowledgeService(fixtureBundle());
    const broad = service.search({ query: "evidence retention" });
    assert(broad.pagination.total === 2, "fallback did not return all partial matches");
    assert(broad.results[0]?.referenceId === "reference.growth.retention", "fallback ranking did not apply title boosts");
    assert(JSON.stringify(broad) === JSON.stringify(service.search({ query: "evidence retention" })), "fallback ranking is not deterministic");
    const strict = service.search({ query: "customer retention" });
    assert(strict.pagination.total === 1 && strict.results[0]?.referenceId === "reference.growth.retention", "strict matches were not preferred");
    assert(service.search({ query: "no-such-knowledge-term" }).pagination.total === 0, "no-match query must remain empty");
    const filtered = service.search({ query: "evidence retention", domainId: "domain.growth" });
    assert(filtered.pagination.total === 1 && filtered.results[0]?.referenceId === "reference.growth.retention", "fallback ignored domain filtering");
    const catalogFallback = service.catalog({ query: "customers repeat" });
    assert(
      catalogFallback.workflows.length === 1 && catalogFallback.workflows[0]?.id === "workflow.research.interviews",
      "catalog fallback did not match one term",
    );
    assert(service.catalog({ query: "no-such-workflow-term" }).workflows.length === 0, "catalog no-match query must remain empty");
    const natural = service.catalog({ query: "I want to interview customers before the spec is written" });
    assert(natural.pagination.total === 1 && natural.workflows[0]?.id === "workflow.research.interviews", "catalog must ignore conversational stop words");
    assert(service.catalog({ query: "the and I" }).pagination.total === 0, "a stop-word-only query must not return the full catalog");
  });

  harness.check("hosted knowledge: workflow bindings recover related guidance without changing unscoped relevance", () => {
    const bundle = fixtureBundle();
    const workflow = bundle.catalog.workflows[0]!;
    workflow.referenceIds = ["reference.research.interviews", "reference.growth.retention"];
    // An unbound document is a strong lexical hit. Explicit workflow scope must still exclude it.
    bundle.catalog.references.push({
      ...bundle.catalog.references[1]!,
      id: "reference.growth.unrelated",
      path: "knowledge/growth/unrelated.md",
      title: "Evidence outside this workflow",
    });
    const unrelated = "# Evidence\nEvidence evidence evidence from a different task.\n";
    bundle.documents.push({
      ...bundle.documents[1]!,
      referenceId: "reference.growth.unrelated",
      markdown: unrelated,
      summary: unrelated,
      contentSha256: digest(unrelated),
      sourceSha256: digest(unrelated),
    });
    const service = createKnowledgeService(bundle);
    const unscoped = service.search({ query: "evidence" });
    assert(
      unscoped.results.every((entry) => entry.referenceId !== "reference.growth.retention" && entry.match === undefined),
      "unscoped retrieval unexpectedly expanded through workflow edges",
    );
    assert(unscoped.workflowCoverage === undefined, "unscoped response gained an unrelated workflow scope");

    const first = service.search({ query: "evidence", workflowId: workflow.id, limit: 1 });
    const second = service.search({ query: "evidence", workflowId: workflow.id, limit: 1, offset: first.pagination.nextOffset! });
    assert(
      first.results[0]?.referenceId === "reference.research.interviews" && first.results[0]?.match?.kind === "lexical",
      "a direct lexical match must lead scoped retrieval",
    );
    assert(
      second.results[0]?.referenceId === "reference.growth.retention" && second.results[0]?.match?.kind === "workflow_binding",
      "bound guidance with different terminology disappeared",
    );
    assert(first.pagination.total === 2 && second.pagination.nextOffset === null, "scoped pagination duplicated, omitted, or leaked an unbound reference");
    assert(
      JSON.stringify(first) === JSON.stringify(service.search({ query: "evidence", workflowId: workflow.id, limit: 1 })),
      "scoped retrieval order is not deterministic",
    );
    assert(second.results[0]?.contentSha256 === bundle.documents[1]?.contentSha256, "related guidance lost its source document identity");

    const filtered = service.search({ query: "evidence", workflowId: workflow.id, domainId: "domain.growth" });
    assert(
      filtered.results.length === 1 && filtered.results[0]?.referenceId === "reference.growth.retention",
      "domain filtering must apply after workflow scoping",
    );
    assert(
      filtered.workflowCoverage?.requiredReferenceIds.join(",") === workflow.referenceIds.join(","),
      "a filter silently changed the required guidance set",
    );
    assert(
      filtered.workflowCoverage?.excludedByDomainReferenceIds.join(",") === "reference.research.interviews",
      "domain filtering concealed a required reference",
    );
    expectError(() => service.search({ query: "evidence", workflowId: "workflow.research.absent" }), "Workflow was not found");
    expectError(() => service.search({ query: "evidence", workflowId: "../private" }), "Invalid knowledge tool arguments");
  });

  harness.check("hosted knowledge: Markdown pages reassemble without splitting Unicode, and carry content and provenance hashes", () => {
    const bundle = fixtureBundle();
    const service = createKnowledgeService(bundle);
    let offset: number | null = 0;
    let markdown = "";
    while (offset !== null) {
      const result = service.get({ referenceId: "reference.research.interviews", offset, limit: 7 });
      assert(Array.from(result.markdown).length <= 7, "knowledge page is too large");
      assert(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(result.markdown), "page split a Unicode character");
      assert(result.reference.contentSha256 === bundle.documents[0]?.contentSha256, "content hash is missing or unstable");
      assert(result.provenance.sources[0]?.url === "https://example.com/research", "source provenance was lost");
      assert(result.provenance.manifestSha256 === bundle.documents[0]?.manifestSha256, "manifest hash was lost");
      markdown += result.markdown;
      offset = result.pagination.nextOffset;
    }
    assert(markdown === bundle.documents[0]?.markdown, "paged Markdown differs from the source");
  });

  harness.check("hosted knowledge: caller mutations cannot change the immutable service snapshot", () => {
    const bundle = fixtureBundle();
    const service = createKnowledgeService(bundle);
    bundle.documents[0]!.markdown = "changed input";
    bundle.catalog.workflows[0]!.instructions = "changed input";
    const first = service.workflow({ workflowId: "workflow.research.interviews", include: "instructions" });
    first.workflow.instructions = "changed output";
    const next = service.workflow({ workflowId: "workflow.research.interviews", include: "instructions" });
    assert(next.workflow.instructions.startsWith("Ask about recent behavior"), "input or result mutation poisoned the service");
    assert(service.get({ referenceId: "reference.research.interviews" }).markdown.startsWith("# Customer interviews"), "document input was not isolated");
  });

  harness.check("hosted knowledge: strict shared schemas reject unknown fields, traversal, type coercion, and unbounded requests", () => {
    const service = createKnowledgeService(fixtureBundle());
    const invalid: Array<[string, unknown]> = [
      ["b2c_catalog", { token: "private-fixture-value" }],
      ["b2c_catalog", { limit: "1" }],
      ["b2c_catalog", { limit: 51 }],
      ["b2c_catalog", { offset: -1 }],
      ["b2c_catalog", { offset: 0.5 }],
      ["b2c_catalog", { offset: 10_001 }],
      ["b2c_catalog", { query: "x".repeat(201) }],
      ["b2c_catalog", null],
      ["b2c_catalog", []],
      ["b2c_workflow", { workflowId: "workflow.research.interviews", workspace: "/private-fixture-value" }],
      ["b2c_workflow", { workflowId: "../catalog/workflows.ts" }],
      ["b2c_knowledge_search", { query: "   " }],
      ["b2c_knowledge_search", { query: "x", domainId: "domain...research" }],
      ["b2c_knowledge_search", { query: "x", limit: 21 }],
      ["b2c_knowledge_search", { query: "x", offset: Number.POSITIVE_INFINITY }],
      ["b2c_knowledge_get", { path: "knowledge/research/interviews.md" }],
      ["b2c_knowledge_get", { referenceId: "../../private-fixture-value" }],
      ["b2c_knowledge_get", { referenceId: "reference.research.%2e%2e%2fprivate" }],
      ["b2c_knowledge_get", { referenceId: "reference.research.interviews", offset: MAX_HOSTED_DOCUMENT_BYTES + 1 }],
      ["b2c_knowledge_get", { referenceId: "reference.research.interviews", limit: 16_385 }],
      ["b2c_knowledge_get", { referenceId: "reference.research.interviews", limit: 0 }],
    ];
    for (const [name, input] of invalid) {
      let error: unknown;
      try {
        callKnowledgeTool(service, name, input);
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof KnowledgeServiceError && error.code === "invalid_arguments", `${name} accepted invalid arguments`);
      assert(!error.message.includes("private-fixture-value"), "request values leaked into an error");
    }
    for (const definition of KNOWLEDGE_TOOL_DEFINITIONS) {
      const schema = z.toJSONSchema(definition.inputSchema);
      assert(schema.type === "object" && schema.additionalProperties === false, "published schema does not preserve strict validation");
      assert(
        definition.annotations.readOnlyHint && !definition.annotations.destructiveHint && !definition.annotations.openWorldHint,
        "read-only annotations are missing",
      );
    }
  });

  harness.check("hosted knowledge: absent IDs return not_found, and inactive or unbound documents cannot enter the service", () => {
    const service = createKnowledgeService(fixtureBundle());
    for (const [name, input] of [
      ["b2c_workflow", { workflowId: "workflow.research.absent" }],
      ["b2c_knowledge_get", { referenceId: "reference.research.absent" }],
      ["b2c_catalog", { domainId: "domain.absent" }],
      ["b2c_execute", {}],
    ] as const) {
      let error: unknown;
      try {
        callKnowledgeTool(service, name, input);
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof KnowledgeServiceError && error.code === "not_found", `${name} did not distinguish missing data from bad arguments`);
    }
    const inactive = fixtureBundle();
    inactive.catalog.references[0]!.lifecycle = "draft";
    expectError(() => createKnowledgeService(inactive), "Invalid hosted knowledge bundle");
    const missing = fixtureBundle();
    missing.documents.pop();
    expectError(() => createKnowledgeService(missing), "Invalid hosted knowledge bundle");
  });

  harness.check("hosted knowledge: build output is deterministic and excludes draft and deprecated documents without reading them", () => {
    const { root, bundle, packages } = materialize(harness, "hosted-determinism");
    const excluded: CatalogKnowledgePackage[] = ["draft", "deprecated"].map((lifecycle) => ({
      ...packages[0]!,
      id: `reference.research.${lifecycle}`,
      lifecycle: lifecycle as "draft" | "deprecated",
      path: "../must-not-read.md",
      manifestPath: "../must-not-read.yaml",
    }));
    const first = buildHostedKnowledgeBundle(root, bundle.catalog, [...packages, ...excluded]);
    const second = buildHostedKnowledgeBundle(root, bundle.catalog, [...packages].reverse());
    assert(serializeHostedKnowledgeBundle(first) === serializeHostedKnowledgeBundle(second), "bundle output depends on discovery order or inactive content");
    assert(first.documents.length === 2 && first.engineVersion === bundle.catalog.skillVersion, "bundle omitted active documents or the engine version");
    assert(
      first.documents.every((document) => document.contentSha256 === digest(document.markdown)),
      "content hashes do not match the served Markdown",
    );
    const reordered = Object.fromEntries(Object.entries(bundle.catalog).reverse()) as unknown as Catalog;
    assert(buildHostedKnowledgeBundle(root, reordered, packages).bundleSha256 === first.bundleSha256, "object key order changed the source digest");
  });

  harness.check("hosted knowledge: source Markdown, manifests, catalog, and engine version invalidate bundle freshness", () => {
    const { root, bundle, packages } = materialize(harness, "hosted-freshness");
    const original = buildHostedKnowledgeBundle(root, bundle.catalog, packages);
    const target = path.join(root, HOSTED_BUNDLE_RELATIVE_PATH);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, serializeHostedKnowledgeBundle(original), "utf8");
    assert(hostedBundleIsCurrent(root, original), "fresh generated file was reported stale");
    writeFileSync(path.join(root, packages[0]!.path), `${bundle.documents[0]!.markdown}\nNew evidence.\n`, "utf8");
    const changedContent = buildHostedKnowledgeBundle(root, bundle.catalog, packages);
    assert(
      changedContent.bundleSha256 !== original.bundleSha256 && changedContent.catalogSha256 === original.catalogSha256,
      "Markdown did not invalidate the content digest independently",
    );
    assert(!hostedBundleIsCurrent(root, changedContent), "freshness check accepted a stale generated file");
    writeFileSync(path.join(root, packages[0]!.manifestPath), "# A reviewed source manifest changed.\n", "utf8");
    const changedManifest = buildHostedKnowledgeBundle(root, bundle.catalog, packages);
    assert(changedManifest.bundleSha256 !== changedContent.bundleSha256, "manifest bytes did not invalidate the source digest");
    bundle.catalog.workflows[0]!.instructions += " Record the date.";
    const changedCatalog = buildHostedKnowledgeBundle(root, bundle.catalog, packages);
    assert(changedCatalog.catalogSha256 !== changedManifest.catalogSha256, "authored workflow changes did not invalidate the catalog digest");
    bundle.catalog.skillVersion = "0.0.1-fixture";
    const changedVersion = buildHostedKnowledgeBundle(root, bundle.catalog, packages);
    assert(
      changedVersion.bundleSha256 !== changedCatalog.bundleSha256 && changedVersion.engineVersion === "0.0.1-fixture",
      "engine version did not invalidate the bundle",
    );
    assert(readFileSync(target, "utf8") === serializeHostedKnowledgeBundle(original), "freshness checks wrote to the generated file");
  });

  harness.check("hosted knowledge: the renderer rejects traversal and symlink escapes for bound documents and manifests", () => {
    for (const binding of ["../outside.md", "/tmp/outside.md", "knowledge/../../outside.md", "knowledge/research/../outside.md", "knowledge\\outside.md"]) {
      const { root, bundle, packages } = materialize(harness, `hosted-path-${digest(binding).slice(0, 8)}`);
      bundle.catalog.references[0]!.path = binding;
      packages[0]!.path = binding;
      expectError(() => buildHostedKnowledgeBundle(root, bundle.catalog, packages), "hosted_bundle.binding_invalid");
    }
    for (const kind of ["document-outside", "document-state", "manifest"] as const) {
      const { root, bundle, packages } = materialize(harness, `hosted-symlink-${kind}`);
      const outside = kind === "document-state" ? root : harness.makeTempDir(`hosted-outside-${kind}`);
      const source = path.join(outside, "private-state.md");
      writeFileSync(source, "Must not be bundled.\n", "utf8");
      const bound = path.join(root, kind === "manifest" ? packages[0]!.manifestPath : packages[0]!.path);
      unlinkSync(bound);
      symlinkSync(source, bound);
      expectError(() => buildHostedKnowledgeBundle(root, bundle.catalog, packages), "hosted_bundle.binding_escape");
    }
  });

  harness.check("hosted knowledge: oversized documents fail, while a UTF-8 byte-order mark preserves content digest parity", () => {
    const { root, bundle, packages } = materialize(harness, "hosted-size-and-encoding");
    const target = path.join(root, packages[0]!.path);
    writeFileSync(target, "x".repeat(MAX_HOSTED_DOCUMENT_BYTES + 1), "utf8");
    expectError(() => buildHostedKnowledgeBundle(root, bundle.catalog, packages), "hosted_bundle.source_size");
    writeFileSync(target, "\uFEFF# Unicode source\n🦆\n", "utf8");
    const unicode = buildHostedKnowledgeBundle(root, bundle.catalog, packages).documents.find((document) => document.referenceId === packages[0]!.id)!;
    assert(unicode.contentSha256 === digest(unicode.markdown) && unicode.markdown.startsWith("\uFEFF"), "UTF-8 source bytes changed during bundling");
  });

  harness.check("hosted knowledge: bound YAML is fenced with distinct source and served-content provenance", () => {
    const { root, bundle, packages } = materialize(harness, "hosted-yaml");
    const documentPath = "knowledge/research/interviews.yaml";
    const yaml = "# A ``` fence must stay inside the code block.\nversion: 1\n";
    bundle.catalog.references[0]!.path = documentPath;
    packages[0]!.path = documentPath;
    writeFileSync(path.join(root, documentPath), yaml, "utf8");
    const compiled = buildHostedKnowledgeBundle(root, bundle.catalog, packages);
    const result = createKnowledgeService(compiled).get({ referenceId: packages[0]!.id });
    assert(result.markdown === `\`\`\`\`yaml\n${yaml}\`\`\`\`\n`, "YAML conversion did not preserve the source as a safe code block");
    assert(result.provenance.sourceMediaType === "application/yaml" && result.provenance.sourceSha256 === digest(yaml), "YAML source provenance is missing");
    assert(
      result.reference.contentSha256 === digest(result.markdown) && result.reference.contentSha256 !== result.provenance.sourceSha256,
      "source and served-content hashes were conflated",
    );
  });

  harness.check("hosted knowledge: real active catalog and source documents compile into the portable service", () => {
    const bundle = buildHostedKnowledgeBundle(skillRoot);
    const service = createKnowledgeService(bundle);
    const result = service.catalog({ limit: 1 });
    assert(result.counts.workflows === bundle.catalog.workflows.length && result.counts.references === bundle.documents.length, "real catalog counts changed");
    assert(result.workflows.length === 1, "real catalog browse returned no workflow");
    assert(
      bundle.documents.length > 0 && bundle.documents.every((document) => document.contentSha256 === digest(document.markdown)),
      "real Markdown hashes do not match",
    );
    const referenceId = bundle.documents[0]!.referenceId;
    assert(service.get({ referenceId, limit: 1 }).reference.referenceId === referenceId, "real reference lookup failed");
    for (const query of [
      "I have a consumer app idea and want to validate define design and build it",
      "new consumer app",
      "I have no idea choose and build a consumer app end-to-end without involvement",
    ]) {
      const routed = service.catalog({ query, limit: 5 });
      assert(
        routed.workflows[0]?.id === "workflow.research.research-backed-spec",
        `natural idea query did not lead with opportunity research: ${query} -> ${routed.workflows[0]?.id ?? "none"}`,
      );
      assert(routed.pagination.total < 20, `natural idea query remained too broad: ${query} -> ${routed.pagination.total}`);
    }
    for (const query of ["onboarding conversion", "change onboarding conversion"]) {
      const routed = service.catalog({ query, limit: 5 });
      assert(
        routed.workflows[0]?.id === "workflow.experience.onboarding-conversion",
        `focused existing-app query did not lead with the exact workflow: ${query} -> ${routed.workflows[0]?.id ?? "none"}`,
      );
    }
    const delegatedResearch = service.workflow({ workflowId: "workflow.research.research-backed-spec" });
    assert(
      delegatedResearch.guardrails.founderOnlyActions.length === 0,
      "delegated opportunity selection must not compile into an unconditional founder approval",
    );
    for (const file of ["service.ts", "tools.ts", "types.ts"]) {
      const source = readFileSync(path.join(skillRoot, "kernel/knowledge-service", file), "utf8");
      assert(!/from\s+["'](?:node:)?(?:fs|child_process|process|path)["']|\bprocess\./u.test(source), `${file} added a runtime host dependency`);
    }
  });

  // --- E1/#34: b2c_workflow bundle mode + dispatchBrief -----------------------------------------

  harness.check("hosted knowledge: an unrequested workflow call keeps knowledgeBundle and dispatchBrief present but null", () => {
    const service = createKnowledgeService(fixtureBundle());
    const result = service.workflow({ workflowId: "workflow.research.interviews" });
    assert(result.knowledgeBundle === null && result.dispatchBrief === null, "an unchanged call must not silently start returning bundle-mode data");
  });

  harness.check("hosted knowledge: tokenBudget without include is a typed error, and the schema bounds tokenBudget", () => {
    const service = createKnowledgeService(fixtureBundle());
    for (const input of [
      { workflowId: "workflow.research.interviews", tokenBudget: 1000 },
      { workflowId: "workflow.research.interviews", include: "full", tokenBudget: 255 },
      { workflowId: "workflow.research.interviews", include: "full", tokenBudget: MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET + 1 },
      { workflowId: "workflow.research.interviews", include: "everything" },
      { workflowId: "workflow.research.interviews", brief: "true" },
    ]) {
      let error: unknown;
      try {
        service.workflow(input);
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof KnowledgeServiceError && error.code === "invalid_arguments", `expected invalid_arguments for ${JSON.stringify(input)}`);
    }
    // The floor and the ceiling both pass once include is supplied.
    assert(
      service.workflow({ workflowId: "workflow.research.interviews", include: "full", tokenBudget: 256 }).knowledgeBundle !== null,
      "min tokenBudget rejected",
    );
    assert(
      service.workflow({ workflowId: "workflow.research.interviews", include: "full", tokenBudget: MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET }).knowledgeBundle !== null,
      "max tokenBudget rejected",
    );
  });

  harness.check(
    "hosted knowledge: bundle mode greedily allocates a shared budget in referenceIds order, index-aligned with knowledge[], never dropping a bound reference",
    () => {
      // Both references bound to one workflow, sized well above the schema's 256-code-point
      // tokenBudget floor, so the shared-budget spillover and mid-reference truncation are both
      // observable without violating that floor.
      const bundle = fixtureBundle();
      const textA = "A".repeat(300);
      const textB = "B".repeat(400);
      bundle.documents[0]!.markdown = textA;
      bundle.documents[0]!.summary = codePointPrefix(textA, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH);
      bundle.documents[0]!.contentSha256 = digest(textA);
      bundle.documents[1]!.markdown = textB;
      bundle.documents[1]!.summary = codePointPrefix(textB, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH);
      bundle.documents[1]!.contentSha256 = digest(textB);
      bundle.catalog.workflows[0]!.referenceIds = ["reference.research.interviews", "reference.growth.retention"];
      const service = createKnowledgeService(bundle);

      // A budget covering the first reference exactly, with nothing left for the second.
      const exhausted = service.workflow({ workflowId: "workflow.research.interviews", include: "full", tokenBudget: 300 }).knowledgeBundle!;
      assert(exhausted.references.length === 2, "every bound reference must appear, even once the budget is spent");
      assert(
        exhausted.references[0]!.markdown === textA && !exhausted.references[0]!.truncated && exhausted.references[0]!.nextOffset === null,
        "the fully-funded reference must not be marked truncated",
      );
      assert(
        exhausted.references[1]!.chars === 0 &&
          exhausted.references[1]!.markdown === "" &&
          exhausted.references[1]!.truncated &&
          exhausted.references[1]!.nextOffset === 0,
        "a budget-exhausted reference must report zero chars, truncated:true, and nextOffset:0 — never be dropped from the array",
      );
      assert(
        exhausted.references.map((entry) => entry.referenceId).join(",") ===
          service
            .workflow({ workflowId: "workflow.research.interviews", include: "instructions" })
            .knowledge.map((entry) => entry.referenceId)
            .join(","),
        "bundle references must stay index-aligned with knowledge[] (same order)",
      );
      assert(exhausted.consumedChars === 300, "consumedChars must equal the sum of what was actually returned");
      assert(!exhausted.coverage.complete && exhausted.coverage.incomplete.length === 1, "a missing required reference was reported as complete reading");
      assert(
        exhausted.coverage.incomplete[0]?.status === "omitted" && exhausted.coverage.incomplete[0]?.offset === 0,
        "omitted guidance needs an explicit continuation from its start",
      );

      // A budget covering everything: both references come back whole, untruncated.
      const generous = service.workflow({ workflowId: "workflow.research.interviews", include: "full", tokenBudget: 700 }).knowledgeBundle!;
      assert(
        generous.references.every((entry) => !entry.truncated && entry.nextOffset === null),
        "a budget covering every bound reference must leave nothing truncated",
      );
      assert(generous.consumedChars === 700, "a generous budget must consume every available code point");
      assert(generous.coverage.complete && generous.coverage.incomplete.length === 0, "full documents did not establish complete delivery coverage");

      // A tight budget split mid-reference: nextOffset must be a valid b2c_knowledge_get offset —
      // paging from it must reconstruct the untaken remainder exactly.
      const tight = service.workflow({ workflowId: "workflow.research.interviews", include: "full", tokenBudget: 256 }).knowledgeBundle!.references[0]!;
      assert(tight.depth === "full", 'include="full" must report depth:"full"');
      assert(tight.chars === 256 && tight.truncated && tight.nextOffset === 256, "a tight budget must take exactly the allowed code points and truncate");
      const rest = service.get({ referenceId: "reference.research.interviews", offset: tight.nextOffset! });
      assert(tight.markdown + rest.markdown === textA, "nextOffset must continue exactly where the bundle entry stopped");
    },
  );

  harness.check("hosted knowledge: incomplete bundle coverage identifies every unread document with matching continuation provenance", () => {
    const bundle = fixtureBundle();
    bundle.catalog.workflows[0]!.referenceIds = ["reference.research.interviews", "reference.growth.retention"];
    const firstText = "🦆 Evidence and deliberate product decisions. ".repeat(30);
    bundle.documents[0]!.markdown = firstText;
    bundle.documents[0]!.summary = codePointPrefix(firstText, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH);
    bundle.documents[0]!.contentSha256 = digest(firstText);
    bundle.documents[0]!.sourceSha256 = digest(firstText);
    const service = createKnowledgeService(bundle);
    const response = service.workflow({ workflowId: "workflow.research.interviews", include: "full", tokenBudget: 256, brief: true });
    const content = response.knowledgeBundle!;
    assert(!content.coverage.complete && content.coverage.incomplete.length === 2, "tight context must expose both truncated and omitted requirements");
    assert(
      content.coverage.incomplete[0]?.status === "truncated" && content.coverage.incomplete[1]?.status === "omitted",
      "coverage lost the difference between partial and absent guidance",
    );
    assert(
      content.coverage.requiredReferenceIds.join(",") === response.knowledge.map((entry) => entry.referenceId).join(","),
      "coverage was derived from the funded prefix instead of all authored bindings",
    );
    assert(response.dispatchBrief?.load.length === 2, "a low bundle budget removed required worker inputs");

    for (const missing of content.coverage.incomplete) {
      const entry = content.references.find((reference) => reference.referenceId === missing.referenceId)!;
      let reconstructed = entry.markdown;
      let offset: number | null = missing.offset;
      while (offset !== null) {
        const page = service.get({ referenceId: missing.referenceId, offset, limit: 53 });
        assert(
          page.reference.contentSha256 === missing.contentSha256 && missing.contentSha256 === entry.contentSha256,
          "a continuation points at a different complete document",
        );
        assert(JSON.stringify(page.provenance) === JSON.stringify(entry.provenance), "bundle and continuation provenance disagree");
        reconstructed += page.markdown;
        offset = page.pagination.nextOffset;
      }
      assert(
        digest(reconstructed) === entry.contentSha256 && Array.from(reconstructed).length === entry.contentLength,
        "bounded continuations did not reconstruct the full required guidance",
      );
    }
    assert(content.references[0]?.provenance.sources[0]?.lastReviewDate === "2026-08-20", "bundle reading dropped source review freshness metadata");
    content.references[0]!.provenance.sources[0]!.lastReviewDate = "1900-01-01";
    assert(
      service.get({ referenceId: "reference.research.interviews" }).provenance.sources[0]?.lastReviewDate === "2026-08-20",
      "returned provenance mutation poisoned the service snapshot",
    );
    // Continuing elsewhere does not make this original, still-truncated response complete.
    assert(!content.coverage.complete, "coverage must describe delivered content, not assume the caller completed follow-up reading");
  });

  harness.check("hosted knowledge: REST query coercion and MCP shaping preserve identical coverage and workflow traversal", () => {
    const bundle = fixtureBundle();
    bundle.catalog.workflows[0]!.referenceIds = ["reference.research.interviews", "reference.growth.retention"];
    const service = createKnowledgeService(bundle);
    const cases = [
      {
        tool: "b2c_workflow",
        query: "workflowId=workflow.research.interviews&include=full&tokenBudget=256&brief=true",
        args: { workflowId: "workflow.research.interviews", include: "full", tokenBudget: 256, brief: true },
      },
      {
        tool: "b2c_knowledge_search",
        query: "query=evidence&workflowId=workflow.research.interviews&limit=1&offset=1",
        args: { query: "evidence", workflowId: "workflow.research.interviews", limit: 1, offset: 1 },
      },
    ];
    for (const test of cases) {
      const rest = callKnowledgeTool(service, test.tool, queryInput(new URL(`https://knowledge.test/api?${test.query}`)));
      const mcp = toCallToolResult(() => callKnowledgeTool(service, test.tool, test.args));
      assert(JSON.stringify(rest) === JSON.stringify(mcp.structuredContent), `${test.tool} REST and MCP projections disagree`);
      const text = mcp.content[0];
      assert(text?.type === "text" && text.text === JSON.stringify(rest), `${test.tool} text output lost coverage present in structured output`);
    }
  });

  harness.check(
    'hosted knowledge: "summaries" depth is capped at the reference\'s own summary length regardless of tokenBudget, and nextOffset stays valid against the full document',
    () => {
      const longer = fixtureBundle();
      const longText = "L".repeat(1_000); // longer than MAX_HOSTED_REFERENCE_SUMMARY_LENGTH (800)
      longer.documents[0]!.markdown = longText;
      longer.documents[0]!.summary = codePointPrefix(longText, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH);
      longer.documents[0]!.contentSha256 = digest(longText);
      const service = createKnowledgeService(longer);

      const summaries = service.workflow({
        workflowId: "workflow.research.interviews",
        include: "summaries",
        tokenBudget: MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET,
      }).knowledgeBundle!;
      const entry = summaries.references[0]!;
      assert(entry.depth === "summary", 'include="summaries" must report depth:"summary"');
      assert(
        entry.chars === MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
        "a summary must never exceed MAX_HOSTED_REFERENCE_SUMMARY_LENGTH even with a huge tokenBudget",
      );
      assert(entry.markdown === longer.documents[0]!.summary, "the summary bundle entry must equal the document's own summary field");
      assert(
        !summaries.coverage.complete && summaries.coverage.incomplete[0]?.status === "truncated",
        "a fully funded summary must not imply the full required reference was read",
      );
      assert(
        entry.truncated && entry.nextOffset === MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
        "a summary of a longer document must report truncated, with nextOffset in the full document's coordinate space",
      );
      const rest = service.get({ referenceId: "reference.research.interviews", offset: entry.nextOffset! });
      assert(entry.markdown + rest.markdown === longText, "nextOffset must continue exactly where the summary stopped, into the full document");

      // A document shorter than the summary cap: its summary IS the whole document, untruncated
      // even at "summaries" depth.
      const short = createKnowledgeService(fixtureBundle()).workflow({ workflowId: "workflow.research.interviews", include: "summaries" }).knowledgeBundle!
        .references[0]!;
      assert(!short.truncated && short.nextOffset === null, "a document shorter than the summary cap must not be marked truncated at summaries depth");
    },
  );

  harness.check(
    "hosted knowledge: brief mode builds a self-contained dispatch packet from the workflow's own contract, leniently, with no workspace facet",
    () => {
      const bundle = fixtureBundle();
      bundle.catalog.roles.push({
        id: "role.research",
        name: "Research lead",
        promptPath: "agents/research.md",
        scope: "Research",
        parentPromptPaths: ["AGENTS.md"],
        contextPackIds: ["context.absent-pack"],
        skillRoutes: [{ id: "skill.customer-research", when: "before scope is fixed" }],
        toolRoutes: [{ id: "tool.survey", when: "when live data is available" }],
        capabilityIds: [],
        outputPathPrefixes: ["research/"],
      });
      const service = createKnowledgeService(bundle);
      const brief = service.workflow({ workflowId: "workflow.research.interviews", brief: true }).dispatchBrief!;
      assert(brief.workflowId === "workflow.research.interviews" && brief.title === "Interview customers", "dispatchBrief lost the workflow identity");
      assert(
        brief.role?.id === "role.research" && brief.contractFiles.join(",") === "AGENTS.md,agents/research.md",
        "dispatchBrief must resolve the owning role and its contract files",
      );
      assert(
        brief.skills[0]?.id === "skill.customer-research" && brief.tools[0]?.id === "tool.survey",
        "dispatchBrief must carry the role's skill and tool routes",
      );
      assert(brief.route.length === 0, "an unresolvable context pack id must be omitted leniently, never thrown");
      assert(
        brief.open.join(",") === "strategy/BRIEF.md" && brief.consult.join(",") === "PRODUCT.md",
        "dispatchBrief must carry authored reads/consults verbatim",
      );
      assert(
        brief.load[0]?.path === "knowledge/research/interviews.md" && brief.load[0]?.title === "Customer interviews",
        "dispatchBrief must resolve bound references to path/title/loadWhen",
      );
      assert(brief.produce.join(",") === "research/INTERVIEWS.md", "dispatchBrief.produce must be the workflow's own outputPaths");
      assert(
        brief.verify.kind === "deterministic" && brief.verify.gateCommands.join(",") === "check:research" && brief.verify.failClosed,
        "a gated workflow must verify deterministically and fail closed",
      );
      assert(brief.approvals.join(",") === "Approve customer outreach", "dispatchBrief.approvals must carry founderOnlyActions verbatim");
      assert(
        brief.tokenBudget === 20_000,
        "domain.research is a judgment domain, so the duplicated formula must apply the judgment token budget, not the plain default",
      );
      assert(brief.verify.requiresIndependentReview === true, "mechanical gates must not hide independent judgment in the worker brief");
      assert(!("workspace" in brief) && !("workspaceState" in brief), "dispatchBrief must carry no workspace or filesystem fact on the shared, pure surface");

      const noRole = createKnowledgeService(fixtureBundle()).workflow({ workflowId: "workflow.research.interviews", brief: true }).dispatchBrief!;
      assert(
        noRole.role === undefined && noRole.contractFiles.length === 0 && noRole.skills.length === 0 && noRole.tools.length === 0,
        "an unresolvable role must be omitted leniently, never thrown",
      );
    },
  );

  harness.check("hosted knowledge: a gated auditor requires independent review outside judgment domains", () => {
    const bundle = fixtureBundle();
    const workflow = bundle.catalog.workflows[0]!;
    workflow.domainId = "domain.growth";
    workflow.reviewOf = ["workflow.growth.producer"];
    const brief = createKnowledgeService(bundle).workflow({ workflowId: workflow.id, brief: true }).dispatchBrief!;
    assert(brief.verify.kind === "deterministic" && brief.verify.gateCommands.length > 0, "the public mechanical verification contract changed");
    assert(brief.verify.requiresIndependentReview === true, "a gated auditor lost its independent review requirement");
  });

  harness.check(
    "hosted knowledge: dispatchBrief's verification-kind and token-budget formula matches kernel/engine/compile.ts for every real runtime workflow",
    () => {
      // Deliberately duplicated, not imported (kernel/knowledge-service/service.ts's own comment on
      // buildDispatchBrief explains why) — this fixture is the proof that the duplicate stays exact.
      const bundle = buildHostedKnowledgeBundle(skillRoot);
      const service = createKnowledgeService(bundle);
      const compiled = compilePlan(toCatalogInput(bundle.catalog));
      const compiledByWorkflowId = new Map(compiled.nodes.map((node) => [node.workflowId, node]));
      let checked = 0;
      for (const workflow of bundle.catalog.workflows) {
        const compiledNode = compiledByWorkflowId.get(workflow.id);
        if (!compiledNode) continue; // domain.machine and non-runtime domains never enter compilePlan
        const brief = service.workflow({ workflowId: workflow.id, brief: true }).dispatchBrief!;
        assert(brief.verify.kind === compiledNode.verification.kind, `verify.kind mismatch for ${workflow.id}`);
        assert(brief.verify.failClosed === compiledNode.verification.failClosed, `verify.failClosed mismatch for ${workflow.id}`);
        assert(brief.verify.requiresIndependentReview === compiledNode.verification.freshContext, `independent review mismatch for ${workflow.id}`);
        assert(
          JSON.stringify(brief.verify.gateCommands) === JSON.stringify(compiledNode.verification.gateIds),
          `verify.gateCommands mismatch for ${workflow.id}`,
        );
        assert(brief.tokenBudget === compiledNode.tokenBudget, `tokenBudget mismatch for ${workflow.id}: ${brief.tokenBudget} vs ${compiledNode.tokenBudget}`);
        checked += 1;
      }
      assert(checked > 50, `parity check ran over too few real workflows to be meaningful: ${checked}`);
    },
  );

  harness.check("hosted knowledge: the worst real single-workflow bundle response stays well under the hosted response ceiling", () => {
    const bundle = buildHostedKnowledgeBundle(skillRoot);
    const service = createKnowledgeService(bundle);
    const docsById = new Map(bundle.documents.map((document) => [document.referenceId, document]));
    const totals = bundle.catalog.workflows.map((workflow) => ({
      id: workflow.id,
      total: workflow.referenceIds.reduce((sum, id) => sum + (docsById.get(id) ? Array.from(docsById.get(id)!.markdown).length : 0), 0),
    }));
    const worst = totals.sort((left, right) => right.total - left.total)[0]!;
    assert(worst.total > 0, "the fixture found no non-empty workflow to measure");
    const response = service.workflow({ workflowId: worst.id, include: "full", tokenBudget: MAX_WORKFLOW_BUNDLE_TOKEN_BUDGET });
    const bytes = Buffer.byteLength(JSON.stringify(response), "utf8");
    assert(
      bytes < MAX_HOSTED_RESPONSE_BYTES,
      `the real catalog's worst-case full bundle (${worst.id}, ${worst.total} chars across its references) serialized at ${bytes} bytes, at or over the ${MAX_HOSTED_RESPONSE_BYTES}-byte hosted response ceiling`,
    );
    // A wide safety margin, not just "under the line" — half the ceiling, so a modest future
    // catalog edit cannot silently tip this into a hosted 500 without the fixture threshold moving too.
    assert(bytes < MAX_HOSTED_RESPONSE_BYTES * 0.6, `the worst-case bundle used more than 60% of the hosted response ceiling: ${bytes} bytes`);
  });

  harness.check(
    "hosted knowledge: every real active document's summary is a strict prefix of its Markdown, capped at MAX_HOSTED_REFERENCE_SUMMARY_LENGTH",
    () => {
      const bundle = buildHostedKnowledgeBundle(skillRoot);
      for (const document of bundle.documents) {
        assert(Array.from(document.summary).length <= MAX_HOSTED_REFERENCE_SUMMARY_LENGTH, `${document.referenceId}'s summary exceeds the cap`);
        assert(document.markdown.startsWith(document.summary), `${document.referenceId}'s summary is not a prefix of its Markdown`);
        assert(
          codePointPrefix(document.markdown, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH) === document.summary,
          `${document.referenceId}'s summary does not match the render-time prefix function`,
        );
      }
    },
  );

  harness.check("hosted knowledge: a hand-edited summary that is not the real prefix invalidates the bundle at construction", () => {
    const tampered = fixtureBundle();
    tampered.documents[0]!.summary = "not a real prefix of the markdown below";
    expectError(() => createKnowledgeService(tampered), "Invalid hosted knowledge bundle");
  });

  harness.check("hosted knowledge: hosted:version prints the generated pair without recomputing the hash", () => {
    assert(HOSTED_VERSION_BUNDLE_PATH === HOSTED_BUNDLE_RELATIVE_PATH, "the version printer must read the same artifact the Worker hashes");
    const onDisk = JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as {
      engineVersion: string;
      bundleSha256: string;
    };
    const pin = JSON.parse(readFileSync(path.join(skillRoot, "skill-version.json"), "utf8")) as { version: string };
    const pair = readHostedVersionPair(skillRoot);
    assert(pair.engineVersion === onDisk.engineVersion && pair.bundleSha256 === onDisk.bundleSha256, "the printer must echo the generated fields");
    assert(pair.engineVersion === pin.version, "engineVersion on the generated bundle must match skill-version.json");
    const printed = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "tooling/print-hosted-version.ts")], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert(printed.status === 0, `hosted:version exited ${printed.status}: ${printed.stderr}`);
    assert(printed.stdout === `${onDisk.engineVersion} ${onDisk.bundleSha256}\n`, "hosted:version must print the on-disk pair, not a recomputed hash");
  });
}
