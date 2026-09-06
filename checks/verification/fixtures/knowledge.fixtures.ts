import { assert, skillRoot, type Harness } from "./_harness.js";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveKnowledgeGraph } from "../../../catalog/knowledge-packages.js";
import { knowledgeFreshnessNow, loadKnowledgeFreshnessNow, validateKnowledgePackages } from "../../../catalog/knowledge-validation.js";
import {
  knowledgeFreshnessPinFromSnapshot,
  knowledgeFreshnessPinPath,
  loadKnowledgeFreshnessPin,
  loadPinnedKnowledgeFreshnessNow,
  serializeKnowledgeFreshnessPin,
  writeKnowledgeFreshnessPin,
} from "../../../tooling/lib/knowledge-freshness-pin.js";
import type { CatalogContextPack, CatalogDomain, CatalogKnowledgePackage, CatalogWorkflowDef } from "../../../catalog/types.js";

const domain: CatalogDomain = {
  id: "domain.research",
  slug: "research",
  name: "Research",
  areaIds: ["area.product-experience"],
  routeLabel: "Research",
  routeWhen: "fixture",
  order: 1,
};
const workflow: CatalogWorkflowDef = {
  id: "workflow.research.fixture-a",
  title: "Fixture",
  domainId: "domain.research",
  areaIds: ["area.product-experience"],
  trigger: "fixture",
  founderPhrasings: [],
  instructions: "Produce a fixture output with enough detail to satisfy the catalog contract.",
  reads: [],
  consults: [],
  referenceIds: [],
  roleId: "role.fixture",
  laneIds: [],
  phaseIds: [],
  dependencies: [],
  outputPaths: [],
  gateCommands: [],
  providerIds: [],
  founderOnlyActions: [],
  actionClass: "draft",
  idempotent: true,
  applicability: { mode: "always" },
};
const contextPack: Omit<CatalogContextPack, "referenceIds"> = { id: "context.fixture", title: "Fixture" };

function knowledge(overrides: Partial<CatalogKnowledgePackage> = {}): CatalogKnowledgePackage {
  return {
    id: "reference.research.fixture",
    title: "Fixture",
    domainId: "domain.research",
    path: "package.json",
    loadWhen: "during fixture work",
    lifecycle: "active",
    applicabilityNotes: "Fixture applicability.",
    sourceExemption: "Internal fixture guidance.",
    sources: [],
    replacementIds: [],
    workflowIds: [workflow.id],
    contextPackIds: [],
    manifestPath: "catalog/knowledge/research/fixture.yaml",
    ...overrides,
  };
}

function codes(packages: CatalogKnowledgePackage[]): string[] {
  return validateKnowledgePackages(packages, skillRoot, [domain], [workflow], [contextPack], [], new Date("2026-08-17T00:00:00Z")).map((issue) => issue.code);
}

function expectFailure(action: () => unknown, code: string): void {
  let message = "";
  try {
    action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(code), `expected ${code}, got ${message || "no refusal"}`);
}

export function register(harness: Harness): void {
  harness.check("knowledge: a valid active package passes", () => assert(codes([knowledge()]).length === 0, "valid package produced issues"));
  harness.check("knowledge: duplicate IDs and document paths fail", () => {
    const result = codes([knowledge(), knowledge({ id: "reference.research.second" })]);
    assert(
      result.includes("knowledge.path.duplicate") && result.includes("knowledge.id.duplicate") === false,
      "expected path duplicate only with distinct ids",
    );
    assert(codes([knowledge(), knowledge()]).includes("knowledge.id.duplicate"), "expected duplicate id");
  });
  harness.check("knowledge: missing documents and invalid domains or bindings fail", () => {
    const result = codes([
      knowledge({ path: "knowledge/absent.md", domainId: "domain.absent", workflowIds: ["workflow.research.absent"], contextPackIds: ["context.absent"] }),
    ]);
    for (const code of ["knowledge.document.missing", "knowledge.domain.invalid", "knowledge.workflow.invalid", "knowledge.context.invalid"])
      assert(result.includes(code), `missing ${code}`);
  });
  harness.check(
    "knowledge: a context-pack binding with no subscribing role or operator fails; a carried pack passes and an empty subscriber list fails",
    () => {
      const bound = knowledge({ workflowIds: [], contextPackIds: ["context.fixture"] });
      const withSubscribers = (subscribers: ReadonlyArray<{ contextPackIds: readonly string[] }>): string[] =>
        validateKnowledgePackages([bound], skillRoot, [domain], [workflow], [contextPack], subscribers, new Date("2026-08-17T00:00:00Z")).map(
          (issue) => issue.code,
        );
      assert(withSubscribers([{ contextPackIds: [] }]).includes("knowledge.context.unsubscribed"), "an uncarried pack binding must fail");
      assert(!withSubscribers([{ contextPackIds: ["context.fixture"] }]).includes("knowledge.context.unsubscribed"), "a carried pack binding must pass");
      assert(withSubscribers([]).includes("knowledge.context.unsubscribed"), "an empty subscriber list must not bypass delivery validation");
    },
  );

  harness.check("knowledge: an unbound active package fails, while a draft stays out of the resolved graph", () => {
    assert(codes([knowledge({ workflowIds: [] })]).includes("knowledge.active.unbound"), "expected unbound active error");
    const resolved = resolveKnowledgeGraph([knowledge({ lifecycle: "draft" })], [workflow], [contextPack]);
    assert(resolved.references.length === 0 && resolved.workflows[0]?.referenceIds.length === 0, "draft entered the active graph");
  });
  harness.check("knowledge: stale sources fail", () => {
    const result = codes([
      knowledge({
        sourceExemption: undefined,
        sources: [
          {
            id: "source.fixture",
            name: "Fixture",
            sourceType: "official_docs",
            url: "https://example.com",
            reviewCadenceDays: 7,
            claimScope: "Fixture",
            lastReviewDate: "2026-01-01",
            reviewer: "fixture",
          },
        ],
      }),
    ]);
    assert(result.includes("knowledge.source.stale"), "expected stale source error");
  });
  harness.check("knowledge: deprecated packages require valid replacements", () => {
    assert(
      codes([knowledge({ lifecycle: "deprecated", workflowIds: [] })]).includes("knowledge.deprecated.replacement_missing"),
      "expected missing replacement",
    );
    assert(
      codes([knowledge({ lifecycle: "deprecated", workflowIds: [], replacementIds: ["reference.research.absent"] })]).includes(
        "knowledge.deprecated.replacement_invalid",
      ),
      "expected invalid replacement",
    );
  });
  harness.check("knowledge: retired exempts a deprecated package from the replacement rule, and requires deprecation", () => {
    // A terminal deprecation (retired learning, withdrawn contract) has no successor to point at.
    assert(
      !codes([knowledge({ lifecycle: "deprecated", workflowIds: [], retired: true })]).includes("knowledge.deprecated.replacement_missing"),
      "retired: true must exempt the replacement requirement",
    );
    assert(codes([knowledge({ retired: true })]).includes("knowledge.retired.lifecycle_invalid"), "retired on a non-deprecated package must fail");
  });
  harness.check("knowledge: two active packages sharing a load_when trigger fail, and normalization defeats whitespace disguises", () => {
    const twin = knowledge({ id: "reference.research.twin", path: "package-lock.json" });
    assert(codes([knowledge(), twin]).includes("knowledge.load_when.duplicate"), "expected duplicate trigger error");
    const rewrapped = knowledge({ id: "reference.research.rewrapped", path: "package-lock.json", loadWhen: "  During   Fixture\nwork " });
    assert(codes([knowledge(), rewrapped]).includes("knowledge.load_when.duplicate"), "a re-wrapped trigger must still count as a duplicate");
    // A deprecated twin no longer competes for the trigger.
    assert(
      !codes([knowledge(), { ...twin, lifecycle: "deprecated" as const, workflowIds: [], replacementIds: [knowledge().id] }]).includes(
        "knowledge.load_when.duplicate",
      ),
      "deprecated packages must not trip the duplicate gate",
    );
    // Distinct triggers pass.
    assert(
      !codes([knowledge(), knowledge({ id: "reference.research.other", path: "package-lock.json", loadWhen: "during other fixture work" })]).includes(
        "knowledge.load_when.duplicate",
      ),
      "distinct triggers were flagged",
    );
  });
  harness.check("knowledge: a paragraph-length load_when fails the word cap while a scannable one passes", () => {
    const words = Array.from({ length: 46 }, (_unused, index) => `word${index}`).join(" ");
    assert(codes([knowledge({ loadWhen: words })]).includes("knowledge.load_when.over_length"), "expected over-length trigger error");
    assert(!codes([knowledge()]).includes("knowledge.load_when.over_length"), "a short trigger was flagged");
  });
  harness.check("knowledge: source freshness uses the snapshot pin, not the wall clock", () => {
    const wallClock = new Date("2026-08-25T00:00:00Z");
    const pin = knowledgeFreshnessNow({ generated_at: "2026-08-22T04:21:32.882Z" }, wallClock);
    assert(pin.toISOString() === "2026-08-22T04:21:32.882Z", "expected snapshot generated_at as the pin");
    assert(knowledgeFreshnessNow({}, wallClock) === wallClock, "missing generated_at must use the fallback clock");
    assert(knowledgeFreshnessNow({ generated_at: "not-a-date" }, wallClock) === wallClock, "invalid generated_at must use the fallback clock");
    assert(loadKnowledgeFreshnessNow("/no/such/source-snapshot.json", wallClock) === wallClock, "a missing snapshot file must use the fallback clock");
    const source = {
      id: "source.fixture",
      name: "Fixture",
      sourceType: "official_docs",
      url: "https://example.com",
      reviewCadenceDays: 7,
      claimScope: "Fixture",
      lastReviewDate: "2026-08-17",
      reviewer: "fixture",
    };
    const pkg = knowledge({ sourceExemption: undefined, sources: [source] });
    const againstPin = validateKnowledgePackages([pkg], skillRoot, [domain], [workflow], [contextPack], [], pin).map((issue) => issue.code);
    assert(!againstPin.includes("knowledge.source.stale"), "17 Aug vs a 22 Aug snapshot must stay current on a 7-day cadence");
    const againstWall = validateKnowledgePackages([pkg], skillRoot, [domain], [workflow], [contextPack], [], wallClock).map((issue) => issue.code);
    assert(againstWall.includes("knowledge.source.stale"), "17 Aug vs a 25 Aug wall clock must be stale on a 7-day cadence");
  });

  harness.check("knowledge freshness pin: rendering is deterministic and commits the exact authoritative snapshot bytes", () => {
    const root = harness.makeTempDir("knowledge-freshness-render");
    const snapshotPath = path.join(root, "snapshot.json");
    const snapshot = `${JSON.stringify({ generated_at: "2026-08-22T04:21:32.882Z", sources: [] }, null, 2)}\n`;
    writeFileSync(snapshotPath, snapshot);
    const expected = knowledgeFreshnessPinFromSnapshot(snapshotPath);
    assert(expected.snapshotSha256 === createHash("sha256").update(snapshot).digest("hex"), "pin must retain the snapshot byte digest");
    writeKnowledgeFreshnessPin(root, snapshotPath);
    const first = readFileSync(path.join(root, knowledgeFreshnessPinPath), "utf8");
    writeKnowledgeFreshnessPin(root, snapshotPath);
    assert(readFileSync(path.join(root, knowledgeFreshnessPinPath), "utf8") === first, "rendering must not add a wall-clock timestamp");
    assert(first === serializeKnowledgeFreshnessPin(expected), "the targeted and full render paths must share one serializer");
    assert(loadPinnedKnowledgeFreshnessNow(root, snapshotPath).toISOString() === expected.generatedAt, "source and installed reads must use the same pin");
    assert(readFileSync(snapshotPath, "utf8") === snapshot, "rendering must not change the source snapshot");

    writeFileSync(snapshotPath, `${snapshot}\n`);
    expectFailure(() => loadKnowledgeFreshnessPin(root, snapshotPath), "knowledge.freshness_pin.drift");
    assert(loadPinnedKnowledgeFreshnessNow(root).toISOString() === expected.generatedAt, "installed reads must not look for a repository snapshot");
  });

  harness.check("knowledge freshness pin: an advanced snapshot still rejects genuinely overdue sources", () => {
    const root = harness.makeTempDir("knowledge-freshness-advance");
    const snapshotPath = path.join(root, "snapshot.json");
    writeFileSync(snapshotPath, JSON.stringify({ generated_at: "2026-08-22T04:21:32.882Z" }));
    writeKnowledgeFreshnessPin(root, snapshotPath);
    const candidate = knowledge({
      sourceExemption: undefined,
      sources: [
        {
          id: "source.fixture",
          name: "Fixture",
          sourceType: "official_docs",
          url: "https://example.com",
          reviewCadenceDays: 7,
          claimScope: "Fixture",
          lastReviewDate: "2026-08-17",
          reviewer: "fixture",
        },
      ],
    });
    const evaluate = (): string[] =>
      validateKnowledgePackages([candidate], skillRoot, [domain], [workflow], [contextPack], [], loadPinnedKnowledgeFreshnessNow(root, snapshotPath)).map(
        (issue) => issue.code,
      );
    assert(!evaluate().includes("knowledge.source.stale"), "source is current against the original committed pin");
    writeFileSync(snapshotPath, JSON.stringify({ generated_at: "2026-08-28T04:21:32.882Z" }));
    expectFailure(evaluate, "knowledge.freshness_pin.drift");
    writeKnowledgeFreshnessPin(root, snapshotPath);
    assert(evaluate().includes("knowledge.source.stale"), "advancing the authoritative pin must still enforce the review cadence");
  });

  harness.check("knowledge freshness pin: missing and malformed package pins fail without a wall-clock fallback", () => {
    const root = harness.makeTempDir("knowledge-freshness-refusal");
    expectFailure(() => loadPinnedKnowledgeFreshnessNow(root), "knowledge.freshness_pin.unavailable");
    const target = path.join(root, knowledgeFreshnessPinPath);
    mkdirSync(path.dirname(target), { recursive: true });
    const valid = { schemaVersion: "1.0.0", generatedAt: "2026-08-22T04:21:32.882Z", snapshotSha256: "a".repeat(64) };
    for (const malformed of [
      "{",
      "null",
      "[]",
      "{}",
      JSON.stringify({ ...valid, schemaVersion: "2.0.0" }),
      JSON.stringify({ ...valid, generatedAt: "not-a-date" }),
      JSON.stringify({ ...valid, generatedAt: "2026-02-30T00:00:00.000Z" }),
      JSON.stringify({ ...valid, generatedAt: "2026-08-22" }),
      JSON.stringify({ ...valid, snapshotSha256: "not-a-digest" }),
      JSON.stringify({ ...valid, unexpected: "private fixture input" }),
    ]) {
      writeFileSync(target, malformed);
      expectFailure(() => loadPinnedKnowledgeFreshnessNow(root), "knowledge.freshness_pin.invalid");
    }
  });

  harness.check("knowledge freshness pin: missing and malformed authoritative snapshots cannot generate a package pin", () => {
    const root = harness.makeTempDir("knowledge-freshness-snapshot-refusal");
    const snapshotPath = path.join(root, "snapshot.json");
    expectFailure(() => writeKnowledgeFreshnessPin(root, snapshotPath), "knowledge.freshness_snapshot.unavailable");
    for (const malformed of ["{", "null", "[]", "{}", JSON.stringify({ generated_at: "not-a-date" })]) {
      writeFileSync(snapshotPath, malformed);
      expectFailure(() => writeKnowledgeFreshnessPin(root, snapshotPath), "knowledge.freshness_snapshot.invalid");
    }
  });
}
