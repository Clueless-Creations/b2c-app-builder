import { initializeProductFixture } from "./product-fixture.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { loadSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { composeCatalog } from "../../../catalog/index.js";
import {
  APP_ONLY_TOKENS,
  FOOD_ONLY_TOKENS,
  WEB_PRESENCE_SLOTS,
  baseWorkflowsPreserved,
  forbiddenHits,
  packProjectionText,
  pinComposition,
  scanKernelBusinessIdentity,
} from "../../../catalog/packs/isolation.js";
import { loadCapabilityYaml, loadPackClosure } from "../../../catalog/packs/load.js";
import { compileContext } from "../../../kernel/context/compile.js";
import { seedOperatingModel } from "../../../kernel/operating-model/events.js";
import type { OperatingRecord, ReplayClock } from "../../../kernel/operating-model/types.js";
import { resolveRoute } from "../../../kernel/routing/resolve.js";
import type { KnowledgeSection, RouteDecision, RouteRequest } from "../../../kernel/routing/types.js";
import { operate } from "../../../kernel/session/operating-service.js";
import { linkAttempt, recordWorkOrderProof } from "../../../kernel/work-orders/lifecycle.js";
import { reviewOutcome } from "../../../kernel/work-orders/outcomes.js";
import { GOLDEN_CASES } from "../goldens/routing/v1/corpus.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { buildOperateFixture, cloneOperateInput } from "./operate.fixtures.js";

const CLOCK: ReplayClock = { now: "2026-08-22T20:00:00.000Z" };
const HORIZON = "2026-09-05T00:00:00.000Z";

function common(id: string): Pick<OperatingRecord, "id" | "revision" | "recordedAt" | "producer" | "epistemic"> {
  return { id, revision: 1, recordedAt: CLOCK.now, producer: "b2c", epistemic: "known" };
}

function loopRecords(): OperatingRecord[] {
  return [
    { ...common("objective.paid-conversion"), kind: "objective", status: "active", title: "Raise paid conversion", valueLoop: "capture" },
    { ...common("metric.paywall-cvr"), kind: "metric", status: "active", objectiveId: "objective.paid-conversion", name: "Paywall conversion rate" },
    {
      ...common("observation.paywall-weak"),
      kind: "observation",
      status: "recorded",
      metricId: "metric.paywall-cvr",
      observedAt: "2026-08-21T12:00:00.000Z",
      source: { uri: "evidence://paywall-funnel", revision: "src-rev-1", sectionId: "conversion" },
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      value: 0.02,
    },
    {
      ...common("evidence.paywall-weak"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.paywall-weak"],
      source: { uri: "evidence://paywall-funnel", revision: "src-rev-1" },
      observedAt: "2026-08-21T12:00:00.000Z",
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      supportsBelief: true,
    },
    {
      ...common("gap.paywall-weak"),
      kind: "gap",
      status: "diagnosed",
      objectiveId: "objective.paid-conversion",
      metricId: "metric.paywall-cvr",
      observationId: "observation.paywall-weak",
    },
    {
      ...common("diagnosis.paywall-copy"),
      kind: "diagnosis",
      status: "recorded",
      gapId: "gap.paywall-weak",
      evidenceIds: ["evidence.paywall-weak"],
      sourceRevision: "src-rev-1",
    },
    {
      ...common("option.rewrite-paywall"),
      kind: "option",
      status: "selected",
      diagnosisId: "diagnosis.paywall-copy",
      evidenceIds: ["evidence.paywall-weak"],
      sourceRevision: "src-rev-1",
    },
    {
      ...common("decision.rewrite-paywall"),
      kind: "decision",
      status: "authorized",
      optionId: "option.rewrite-paywall",
      evidenceIds: ["evidence.paywall-weak"],
      authorization: "agreement.rev-1",
    },
    { ...common("expectation.rewrite-paywall"), kind: "expectation", status: "pending", decisionId: "decision.rewrite-paywall", horizonAt: HORIZON },
    { ...common("hypothesis.rewrite-paywall"), kind: "hypothesis", status: "tentative", decisionId: "decision.rewrite-paywall" },
  ];
}

function packById(id: string) {
  const packs = loadPackClosure(skillRoot, [id]);
  const pack = packs.find((item) => item.id === id);
  assert(pack !== undefined, `expected to load ${id}`);
  return { packs, pack };
}

function sectionsFor(packId: string): { sections: KnowledgeSection[]; liveRevisions: Record<string, string> } {
  const { pack } = packById(packId);
  const sections: KnowledgeSection[] = pack.references.map((reference) => {
    const file = path.join(skillRoot, reference.path);
    assert(existsSync(file), `${reference.path} must exist`);
    return {
      sectionId: reference.sectionId ?? reference.id,
      revision: reference.revision ?? pack.revision,
      path: reference.path,
      domain: reference.domainId,
      text: readFileSync(file, "utf8"),
    };
  });
  const liveRevisions: Record<string, string> = {};
  for (const section of sections) liveRevisions[section.sectionId] = section.revision;
  return { sections, liveRevisions };
}

function capsuleFor(packId: string, selectedId: string) {
  const { sections, liveRevisions } = sectionsFor(packId);
  const request: RouteRequest = {
    id: `route.isolation.${packId}`,
    kind: "metric_gap",
    problem: "Compile pack-owned context",
    packId,
    requiredFacts: [],
    availableFacts: [],
    recognized: true,
    clock: CLOCK.now,
    policyRevision: "policy.operating.v1",
    ambiguityBand: 0.05,
  };
  const decision: RouteDecision = {
    outcome: "selected",
    selectedId,
    eligibleIds: [selectedId],
    exclusions: [],
    scores: { [selectedId]: 1 },
    policyRevision: request.policyRevision,
    ambiguityBand: request.ambiguityBand,
    resolutionAction: "selected",
    signals: [],
    precedent: { matchedFacts: [], differentFacts: [], evidenceStrength: "complete", transferLimits: [] },
  };
  return compileContext({ request, decision, sections, liveRevisions });
}

export function register(harness: Harness): void {
  harness.check("business-packs: default composition contains only verified shipped packs, without optional on-disk packs", () => {
    const catalog = composeCatalog(skillRoot);
    const shipped = loadSnapshotPacks([readFirstpartyPackage(skillRoot)])
      .map((pack) => pack.id)
      .sort();
    assert(shipped.length > 0, "shipped package must declare its catalog pack");
    assert(
      catalog.composition?.packs
        .map((pack) => pack.id)
        .sort()
        .join(",") === shipped.join(","),
      "default composition must pin exactly the shipped package packs",
    );
    assert(!catalog.domains.some((domain) => domain.id === "domain.food"), "food domain must not enter the default catalog");
    assert(!catalog.workflows.some((workflow) => workflow.id === "workflow.food.sku-contrast"), "food workflow must not enter the default catalog");
  });

  harness.check("business-packs: web-presence capability yaml matches the capability pack", () => {
    const fromFile = loadCapabilityYaml(skillRoot, "capability.web-presence");
    const { pack } = packById("capability.web-presence");
    const fromPack = pack.capabilities[0];
    assert(fromPack !== undefined, "web-presence pack must embed the capability");
    assert(fromFile.id === fromPack.id, "capability ids must match");
    assert(
      [...fromFile.extensionSlots].sort().join(",") === [...fromPack.extensionSlots].sort().join(","),
      "extension slots must match between capability.yaml and pack.yaml",
    );
    for (const slot of WEB_PRESENCE_SLOTS) {
      assert(fromFile.extensionSlots.includes(slot), `web-presence must declare slot ${slot}`);
    }
  });

  harness.check("business-packs: consumer-app and food reuse web-presence without leaking pack-owned facts", () => {
    const app = packById("business-pack.consumer-app");
    const food = packById("business-pack.food-product-contrast");
    assert(
      app.packs.some((item) => item.id === "capability.web-presence"),
      "consumer-app closure must include web-presence",
    );
    assert(
      food.packs.some((item) => item.id === "capability.web-presence"),
      "food closure must include web-presence",
    );
    const appText = packProjectionText(app.pack, skillRoot);
    const foodText = packProjectionText(food.pack, skillRoot);
    assert(forbiddenHits(appText, FOOD_ONLY_TOKENS).length === 0, `app pack leaked ${forbiddenHits(appText, FOOD_ONLY_TOKENS).join(", ")}`);
    assert(forbiddenHits(foodText, APP_ONLY_TOKENS).length === 0, `food pack leaked ${forbiddenHits(foodText, APP_ONLY_TOKENS).join(", ")}`);
    for (const token of APP_ONLY_TOKENS) assert(appText.includes(token), `app pack must bind ${token}`);
    for (const token of FOOD_ONLY_TOKENS) assert(foodText.includes(token), `food pack must bind ${token}`);

    const appCatalog = composeCatalog(skillRoot, app.packs);
    const foodCatalog = composeCatalog(skillRoot, food.packs);
    assert(
      foodCatalog.domains.some((domain) => domain.id === "domain.food"),
      "food composition adds domain.food",
    );
    assert(!appCatalog.workflows.some((workflow) => workflow.id === "workflow.food.sku-contrast"), "app composition must not add the food workflow");
    const missing = baseWorkflowsPreserved(composeCatalog(skillRoot), appCatalog);
    assert(missing.length === 0, `app composition dropped base workflows: ${missing.join(", ")}`);

    const appCapsule = capsuleFor("business-pack.consumer-app", "workflow.fixture.paywall-copy");
    const foodCapsule = capsuleFor("business-pack.food-product-contrast", "workflow.food.sku-contrast");
    const appCapsuleText = app.pack.references.map((reference) => readFileSync(path.join(skillRoot, reference.path), "utf8")).join("\n");
    const foodCapsuleText = food.pack.references.map((reference) => readFileSync(path.join(skillRoot, reference.path), "utf8")).join("\n");
    assert(appCapsule.sections.length === app.pack.references.length, "app capsule must include every pack reference");
    assert(foodCapsule.sections.length === food.pack.references.length, "food capsule must include every pack reference");
    assert(forbiddenHits(appCapsuleText, FOOD_ONLY_TOKENS).length === 0, "app context leaked food tokens");
    assert(forbiddenHits(foodCapsuleText, APP_ONLY_TOKENS).length === 0, "food context leaked app tokens");
  });

  harness.check("business-packs: consumer-app paid-conversion loop reopens diagnosis and keeps an option set", () => {
    const golden = GOLDEN_CASES.find((entry) => entry.id === "paid-conversion-gap");
    assert(golden !== undefined, "paid-conversion golden is missing");
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.transport.idempotencyKey = "operate.paywall.consumer-app-loop";
    const receipt = operate(input);
    assert(receipt.decision.outcome === "selected", `expected selected, got ${receipt.decision.outcome}`);
    assert(receipt.occurrenceId !== undefined, "commit must mint a work order");
    const run = input.world.run!;
    const started = linkAttempt(run, receipt.occurrenceId, "attempt.paywall-copy.1", CLOCK.now);
    assert(started.ok, `attempt must start the occurrence, got ${started.reasonCode}`);
    const proof = recordWorkOrderProof(run, receipt.occurrenceId, ["independent verifier accepted the copy"], CLOCK.now);
    assert(proof.ok, `proof should land, got ${proof.reasonCode}`);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![receipt.occurrenceId]!,
      model,
      observation: { metricMet: false, observationIds: ["observation.paywall-weak"], independenceGroups: ["analytics.primary"], missingExpected: false },
      clock: CLOCK,
    });
    assert(review.verdict === "missed", `expected missed, got ${review.verdict}`);
    assert(review.diagnosisReopened, "missed expectation must reopen diagnosis");
    const diagnoses = review.model.records.filter((record) => record.kind === "diagnosis");
    assert(
      diagnoses.some((record) => record.revision === 2),
      "reopened diagnosis must append a new revision",
    );
    const reroute = resolveRoute(golden.request, golden.candidates);
    assert(reroute.outcome === "selected", "missed metric must still leave an eligible option set");
    assert(reroute.eligibleIds.includes("workflow.fixture.paywall-copy"), "paywall rewrite must remain eligible");
  });

  harness.check("business-packs: kernel identity scan is clean and pinComposition preserves a prior pin", () => {
    const hits = scanKernelBusinessIdentity(path.join(skillRoot, "kernel"));
    assert(hits.length === 0, `kernel branched on business identity: ${hits.map((hit) => hit.file).join(", ")}`);
    const app = composeCatalog(skillRoot, packById("business-pack.consumer-app").packs);
    const unpinned = { schemaVersion: "1.0.0" as const, catalogVersion: "2.0.0+0.171.0" };
    const first = pinComposition(unpinned, app.composition!);
    assert(first.composition.previousFingerprint === "catalog:2.0.0+0.171.0", "first re-pin must keep the unpinned catalog version");
    const second = pinComposition(first, app.composition!);
    assert(second.composition.previousFingerprint === first.composition.fingerprint, "second re-pin must keep the prior composition fingerprint");
  });

  harness.check("business-packs: template installation preserves selected composition and package changes require activation", () => {
    const target = harness.makeTempDir("operating-graph-pin");
    initializeProductFixture(target, "Business Pack Fixture");
    const tsx = resolveTsxBin(skillRoot),
      script = path.join(skillRoot, "adapters/install-entrypoints.ts");
    const files = ["catalog.json", ".b2c-launch/runtime.json"];
    const before = files.map((relative) => readFileSync(path.join(target, relative), "utf8"));
    const manifest = JSON.parse(before[1]!);
    assert(Boolean(manifest.composition), "fresh initialization must select the default recipe");
    const changed = spawnSync(tsx, [script, "--target", target, "--skill-root", skillRoot, "--apply", "--packs", "business-pack.consumer-app"], {
      encoding: "utf8",
    });
    assert(
      changed.status === 1 && `${changed.stderr}${changed.stdout}`.includes("composition.activation_required"),
      "package changes must use composition activation",
    );
    assert(
      files.every((relative, index) => readFileSync(path.join(target, relative), "utf8") === before[index]),
      "refused package selection must preserve both pins",
    );
    const refresh = spawnSync(tsx, [script, "--target", target, "--skill-root", skillRoot, "--apply"], { encoding: "utf8" });
    assert(refresh.status === 0, `template refresh failed: ${refresh.stderr}${refresh.stdout}`);
    assert(
      files.every((relative, index) => readFileSync(path.join(target, relative), "utf8") === before[index]),
      "template refresh must preserve selected package bytes and compiled contract",
    );
  });
}
