/**
 * Evaluation and measured-simplification baselines (#39, #40, #72, #73, #75, #77, #78).
 *
 * Authorized local checks only. No live providers, devices, paid batches, or dispatch.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { codePointPrefix, createKnowledgeService, KnowledgeServiceError } from "../../../kernel/knowledge-service/service.js";
import {
  MAX_HOSTED_REFERENCE_SUMMARY_LENGTH,
  type HostedKnowledgeBundle,
  type HostedKnowledgeGetResult,
  type KnowledgeResolver,
  type KnowledgeService,
} from "../../../kernel/knowledge-service/types.js";
import { matchWorkflows, type RoutableWorkflow } from "../../../kernel/session/route-utterance.js";
import { composeCatalog } from "../../../catalog/index.js";
import { loadAgentGraph } from "../../../catalog/agent-graph/load.js";
import { HOSTED_BUNDLE_RELATIVE_PATH } from "../../../tooling/render-hosted-bundle.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const COMPLETION_GUARD = "A workflow pass is not a business-completion verdict.";
const COMPLETION_WARNING =
  "A workflow pass is not a business-completion verdict. This response does not name executable next work.";
const WORKSPACE_PLAN_POINTER = "Use the selected workspace plan";
const FORBIDDEN_RETRIEVAL_INFRA = ["pinecone", "chromadb", "weaviate", "qdrant", "@xenova/transformers"] as const;
const STAGE_A_CASES_RELATIVE_PATH = "checks/verification/goldens/eval/stage-a-cases.json";

type StageAClass =
  | "explicit_apple_store"
  | "accepted_no_quiz_journey"
  | "artifact_specification"
  | "binding_not_unscoped_query"
  | "tight_optional_bundle"
  | "stale_revision"
  | "hosted_only_caller"
  | "repeated_read";

interface StageACase {
  id: string;
  class: StageAClass;
  workflowId: string;
  query?: string;
  outputPath?: string;
  requiredReferenceId?: string;
  sectionTitle?: string;
  tokenBudget?: number;
  needs: string[];
  irrelevant: string[];
  note: string;
}

interface StageACorpus {
  metadata: { heldOutUtteranceIds: string[]; actualModelUsage: "unknown" };
  cases: StageACase[];
}

interface StageACaseReport {
  id: string;
  class: StageAClass;
  ok: boolean;
  detail: string;
  uniqueRequiredSections: number;
  duplicatedDelivery: number;
  utf8Bytes: number;
  codePoints: number;
  estimatedTokens: number;
  estimatedTokenBasis: "character_derived_code_points_div_4";
  actualModelUsage: "unknown";
}

interface StoreCorpus {
  entries: Array<{ id: string; utterance: string; needs: string[] }>;
}

interface CatalogWorkflowRow {
  id: string;
  title: string;
  trigger: string;
  instructions: string;
  founderPhrasings?: string[];
  referenceIds?: string[];
}

interface FabricatedAttempt {
  id: string;
  start: string;
  end: string;
  result: "accepted" | "failed" | "blocked";
  cost: number | "unknown";
  replayOf?: string;
}

function loadBundle(): HostedKnowledgeBundle {
  return JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
}

function loadStoreCorpus(): StoreCorpus {
  return JSON.parse(readFileSync(path.join(skillRoot, "checks/verification/goldens/routing/store-utterances.json"), "utf8")) as StoreCorpus;
}

function loadStageACorpus(): StageACorpus {
  return JSON.parse(readFileSync(path.join(skillRoot, STAGE_A_CASES_RELATIVE_PATH), "utf8")) as StageACorpus;
}

function volume(markdown: string): Pick<StageACaseReport, "utf8Bytes" | "codePoints" | "estimatedTokens" | "estimatedTokenBasis" | "actualModelUsage"> {
  const codePoints = Array.from(markdown).length;
  return {
    utf8Bytes: new TextEncoder().encode(markdown).byteLength,
    codePoints,
    estimatedTokens: Math.ceil(codePoints / 4),
    estimatedTokenBasis: "character_derived_code_points_div_4",
    actualModelUsage: "unknown",
  };
}

function emptyVolume(): ReturnType<typeof volume> {
  return volume("");
}

function catalogIds(service: KnowledgeService, query: string): string[] {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = service.catalog({ query, offset, limit: 50 });
    ids.push(...page.workflows.map((workflow) => workflow.id));
    if (page.pagination.nextOffset === null) return ids;
  }
}

function searchHits(service: KnowledgeService, query: string, workflowId?: string) {
  const results: ReturnType<KnowledgeService["search"]>["results"] = [];
  let coverage: ReturnType<KnowledgeService["search"]>["workflowCoverage"];
  for (let offset = 0; ; ) {
    const page = service.search({ query, offset, limit: 20, ...(workflowId ? { workflowId } : {}) });
    results.push(...page.results);
    coverage = page.workflowCoverage;
    if (page.pagination.nextOffset === null) return { results, workflowCoverage: coverage };
    offset = page.pagination.nextOffset;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function refuseChangedRevision(original: HostedKnowledgeBundle, spec: KnowledgeResolver, prior: HostedKnowledgeGetResult): void {
  const clone = structuredClone(original);
  const document = clone.documents.find((item) => item.referenceId === spec.referenceId);
  assert(document !== undefined, `${spec.referenceId} must exist on the controlled clone`);
  const priorHash = prior.reference.contentSha256;
  assert(priorHash === document.contentSha256, "controlled clone must start at the delivered revision");
  const heading = "## `DESIGN.md`";
  assert(document.markdown.includes(heading), "controlled change must edit the pinned artifact-contract heading");
  document.markdown = document.markdown.replace(heading, `${heading}\n\nChanged Stage A revision.\n`);
  document.contentSha256 = digest(document.markdown);
  document.summary = codePointPrefix(document.markdown, MAX_HOSTED_REFERENCE_SUMMARY_LENGTH);
  delete document.sections;
  assert(document.contentSha256 !== priorHash, "changed bundle must have a new content hash");
  const changed = createKnowledgeService(clone);
  let code = "";
  try {
    changed.get({ ...spec, expectedContentSha256: priorHash, limit: 16384 });
  } catch (error) {
    code = error instanceof KnowledgeServiceError ? error.code : "";
  }
  assert(code === "revision_mismatch", `old hash must refuse the changed bundle, got ${code || "no error"}`);
  const next = changed.get({ ...spec, expectedContentSha256: document.contentSha256, limit: 16384 });
  assert(next.section?.title === prior.section?.title, "new hash must keep the pinned heading");
  assert(next.markdown.includes("Changed Stage A revision."), "new hash must deliver the changed revision");
  assert(next.markdown !== prior.markdown, "changed revision must not equal the prior section");
}

function boundSpec(
  service: KnowledgeService,
  workflowId: string,
  outputPath: string,
  requiredReferenceId: string,
  sectionTitle: string,
) {
  const route = service.workflow({ workflowId });
  const specs = route.route.outputs.find((output) => output.path === outputPath)?.specifications ?? [];
  const pinned = specs.find((spec) => spec.get.referenceId === requiredReferenceId);
  assert(pinned !== undefined, `${workflowId} must bind ${outputPath} via ${requiredReferenceId}`);
  const delivered = service.get({ ...pinned.get, limit: 16384 });
  assert(delivered.reference.referenceId === requiredReferenceId, `${requiredReferenceId} was not the delivered reference`);
  assert(delivered.section?.title === sectionTitle, `expected heading ${sectionTitle}, got ${delivered.section?.title ?? "(none)"}`);
  return { spec: pinned.get, delivered };
}

function runStageACase(
  service: KnowledgeService,
  workflows: readonly CatalogWorkflowRow[],
  item: StageACase,
  bundle: HostedKnowledgeBundle,
): StageACaseReport {
  const base = {
    id: item.id,
    class: item.class,
    uniqueRequiredSections: 0,
    duplicatedDelivery: 0,
    ...emptyVolume(),
  };
  try {
    switch (item.class) {
      case "explicit_apple_store": {
        assert(item.query !== undefined, `${item.id} needs a query`);
        const hosted = catalogIds(service, item.query);
        assert(
          item.needs.every((id) => hosted.includes(id)),
          `${item.id} missing needed workflows: ${item.needs.filter((id) => !hosted.includes(id)).join(",")}`,
        );
        assert(
          item.irrelevant.every((id) => !hosted.includes(id) || hosted[0] !== id),
          `${item.id} treated irrelevant ${item.irrelevant.join(",")} as the required first route`,
        );
        return { ...base, ok: true, detail: item.note };
      }
      case "accepted_no_quiz_journey": {
        const authored = workflows.find((workflow) => workflow.id === item.workflowId);
        assert(authored !== undefined, `${item.id} missing ${item.workflowId}`);
        assert(authored.instructions.includes("not selected, selected but unavailable"), `${item.id} lost #67 applicability language`);
        assert(!authored.instructions.includes("unconditional quiz"), `${item.id} reintroduced an unconditional quiz`);
        const expanded = service.workflow({ workflowId: item.workflowId, include: "instructions" });
        assert(expanded.workflow.instructions.length > 0, `${item.id} instruction expand was empty`);
        assert(expanded.route.mode === "instructions", `${item.id} include=instructions must set route.mode`);
        return { ...base, ...volume(expanded.workflow.instructions), ok: true, detail: item.note };
      }
      case "artifact_specification": {
        assert(item.outputPath !== undefined && item.requiredReferenceId !== undefined && item.sectionTitle !== undefined, `${item.id} needs a pinned section`);
        const { delivered } = boundSpec(service, item.workflowId, item.outputPath, item.requiredReferenceId, item.sectionTitle);
        return { ...base, ...volume(delivered.markdown), uniqueRequiredSections: 1, ok: true, detail: item.note };
      }
      case "binding_not_unscoped_query": {
        assert(item.query !== undefined && item.requiredReferenceId !== undefined, `${item.id} needs query and requiredReferenceId`);
        const unscoped = searchHits(service, item.query);
        assert(unscoped.workflowCoverage === undefined, `${item.id} unscoped search grew a workflowCoverage set`);
        assert(
          !unscoped.results.some((result) => result.referenceId === item.requiredReferenceId),
          `${item.id} unscoped search already returned ${item.requiredReferenceId}; pick a query with no lexical hit`,
        );
        const scoped = searchHits(service, item.query, item.workflowId);
        assert(scoped.workflowCoverage?.workflowId === item.workflowId, `${item.id} scoped search lost workflowCoverage`);
        assert(
          scoped.workflowCoverage?.requiredReferenceIds.some((id) => id === item.requiredReferenceId) === true,
          `${item.id} binding dropped ${item.requiredReferenceId}`,
        );
        const bound = scoped.results.find((result) => result.referenceId === item.requiredReferenceId);
        assert(bound !== undefined, `${item.id} scoped results omitted ${item.requiredReferenceId}`);
        assert(bound.match?.kind === "workflow_binding", `${item.id} expected workflow_binding, got ${bound.match?.kind ?? "none"}`);
        return { ...base, ok: true, detail: `${item.note} match=${bound.match.kind}` };
      }
      case "tight_optional_bundle": {
        const tight = service.workflow({
          workflowId: item.workflowId,
          include: "full",
          tokenBudget: item.tokenBudget ?? 256,
          brief: true,
        });
        assert(tight.dispatchBrief !== null, `${item.id} tight bundle omitted the worker brief`);
        assert(tight.knowledgeBundle !== null && tight.knowledgeBundle.coverage.complete === false, `${item.id} tight bundle claimed complete delivery`);
        assert(
          tight.knowledgeBundle.coverage.incomplete.some((entry) => entry.status === "truncated" || entry.status === "omitted"),
          `${item.id} tight bundle hid omitted/truncated entries`,
        );
        const delivered = tight.knowledgeBundle.references.map((entry) => entry.markdown).join("");
        const measured = volume(delivered);
        assert(measured.codePoints === tight.knowledgeBundle.consumedChars, `${item.id} utf-8/code-point volume drifted from consumedChars`);
        return {
          ...base,
          ...measured,
          ok: true,
          detail: `${item.note} consumedChars=${tight.knowledgeBundle.consumedChars} utf8Bytes=${measured.utf8Bytes}`,
        };
      }
      case "stale_revision": {
        assert(item.outputPath !== undefined && item.requiredReferenceId !== undefined && item.sectionTitle !== undefined, `${item.id} needs a pinned section`);
        const { spec, delivered: fresh } = boundSpec(service, item.workflowId, item.outputPath, item.requiredReferenceId, item.sectionTitle);
        const stable = service.get({ ...spec, expectedContentSha256: fresh.reference.contentSha256, limit: 16384 });
        assert(stable.markdown === fresh.markdown, `${item.id} matching hash changed the section`);
        refuseChangedRevision(bundle, spec, fresh);
        return { ...base, ...volume(fresh.markdown), uniqueRequiredSections: 1, ok: true, detail: item.note };
      }
      case "hosted_only_caller": {
        const route = service.workflow({ workflowId: item.workflowId });
        assert(route.dispatchBrief === null, `${item.id} route-only implied a brief`);
        assert(route.guardrails.executionAvailable === false && route.guardrails.workspacePlan === false, `${item.id} claimed local plan execution`);
        assert(route.route.warnings.some((warning) => warning.startsWith(COMPLETION_GUARD)), route.route.warnings.join(" | "));
        return { ...base, ok: true, detail: item.note };
      }
      case "repeated_read": {
        assert(item.outputPath !== undefined && item.requiredReferenceId !== undefined && item.sectionTitle !== undefined, `${item.id} needs a pinned section`);
        const { spec, delivered: first } = boundSpec(service, item.workflowId, item.outputPath, item.requiredReferenceId, item.sectionTitle);
        const second = service.get({ ...spec, expectedContentSha256: first.reference.contentSha256, limit: 16384 });
        assert(second.markdown === first.markdown, `${item.id} repeat read drifted`);
        const measured = volume(first.markdown);
        return {
          ...base,
          ...measured,
          uniqueRequiredSections: 1,
          duplicatedDelivery: 1,
          ok: true,
          detail: `${item.note} unique=1 duplicated=1`,
        };
      }
      default: {
        const exhaustive: never = item.class;
        throw new Error(`unhandled Stage A class ${String(exhaustive)}`);
      }
    }
  } catch (error) {
    return { ...base, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function elapsedMs(start: string, end: string): number {
  return Date.parse(end) - Date.parse(start);
}

function summedWorkMs(attempts: readonly FabricatedAttempt[]): number {
  return attempts.reduce((sum, attempt) => sum + elapsedMs(attempt.start, attempt.end), 0);
}

function toRoutable(workflows: readonly CatalogWorkflowRow[]): RoutableWorkflow[] {
  return workflows.map((workflow) => ({
    workflowId: workflow.id,
    title: workflow.title,
    trigger: workflow.trigger,
    referenceIds: workflow.referenceIds ?? [],
    instructions: workflow.instructions,
    founderPhrasings: workflow.founderPhrasings ?? [],
  }));
}

export function register(harness: Harness): void {
  harness.check("eval-baselines: fabricated receipts keep elapsed work, unknown cost, and failed denominators honest", () => {
    const attempts: FabricatedAttempt[] = [
      { id: "a1", start: "2026-09-09T12:00:00.000Z", end: "2026-09-09T12:30:00.000Z", result: "accepted", cost: 1.2 },
      { id: "a2", start: "2026-09-09T12:10:00.000Z", end: "2026-09-09T12:40:00.000Z", result: "failed", cost: "unknown" },
      { id: "a3", start: "2026-09-09T12:40:00.000Z", end: "2026-09-09T12:50:00.000Z", result: "blocked", cost: 0, replayOf: "a1" },
    ];
    const elapsed = elapsedMs(attempts[0]!.start, attempts[2]!.end);
    const summed = summedWorkMs(attempts);
    assert(elapsed === 50 * 60 * 1000, `elapsed ${elapsed}`);
    assert(summed === 70 * 60 * 1000, `summed concurrent work ${summed}`);
    assert(summed > elapsed, "overlapping attempts must not be reported as wall-clock");
    assert(attempts[1]!.cost === "unknown", "missing telemetry stays unknown");
    assert(attempts[2]!.replayOf === "a1" && attempts[2]!.cost === 0, "replay is not a second paid effect without new charge evidence");
    const denominator = attempts.length;
    const accepted = attempts.filter((attempt) => attempt.result === "accepted").length;
    assert(denominator === 3 && accepted === 1, "failed and blocked runs stay in the denominator");
    const acceptance = { deliveryAccepted: false };
    const report = { elapsedMs: elapsed, summedWorkMs: summed, acceptance };
    assert(report.acceptance.deliveryAccepted === false, "reporting must not flip acceptance");
  });

  harness.check("eval-baselines: matchWorkflows records primary vs candidates for the ASC replay", () => {
    const bundle = loadBundle();
    const corpus = loadStoreCorpus();
    const service = createKnowledgeService(bundle);
    const workflows = bundle.catalog.workflows as CatalogWorkflowRow[];
    const catalogIds = (query: string): string[] => {
      const ids: string[] = [];
      for (let offset = 0; ; offset += 50) {
        const page = service.catalog({ query, offset, limit: 50 });
        ids.push(...page.workflows.map((workflow) => workflow.id));
        if (page.pagination.nextOffset === null) return ids;
      }
    };
    const asc = corpus.entries.find((entry) => entry.id === "store-010");
    assert(asc !== undefined, "store corpus still has the ASC utterance");
    const match = matchWorkflows(asc.utterance, toRoutable(workflows));
    const hosted = catalogIds(asc.utterance);
    switch (match.kind) {
      case "insufficient_signal":
        throw new Error(`matchWorkflows must score "${asc.utterance}"`);
      case "primary":
        assert(
          asc.needs.includes(match.match.workflowId),
          `confident primary ${match.match.workflowId} is not a needed ASC workflow; keep #39 open`,
        );
        break;
      case "candidates": {
        const ids = match.candidates.map((candidate) => candidate.workflowId);
        assert(match.candidates.length >= 2, `candidates must record a tie, not a unique first rank: ${ids.join(",")}`);
        assert(
          ids.includes("workflow.store.store-console-workflow"),
          `needed store-console-workflow missing from matchWorkflows candidates: ${ids.join(",")}`,
        );
        break;
      }
      default: {
        const exhaustive: never = match;
        throw new Error(`unhandled match kind ${String(exhaustive)}`);
      }
    }
    assert(
      asc.needs.every((id) => hosted.includes(id)),
      `catalog() must still reach needed Apple workflows at some offset: missing ${asc.needs.filter((id) => !hosted.includes(id)).join(", ")}`,
    );
  });

  harness.check("eval-baselines: workflow route coverage is a delivery record and not a workspace-plan instruction", () => {
    const service = createKnowledgeService(loadBundle());
    const route = service.workflow({ workflowId: "workflow.store.asc-cli-automation" });
    assert(route.guardrails.workspacePlan === false, "workspacePlan stays the literal false");
    assert(route.route.coverage.incomplete.every((entry) => entry.status === "not_requested"), JSON.stringify(route.route.coverage.incomplete));
    assert(route.route.coverage.complete === false, "route-mode coverage stays incomplete while nothing was requested");
    assert(route.route.warnings.includes(COMPLETION_WARNING), route.route.warnings.join(" | "));
    assert(
      route.route.warnings.every((warning) => !warning.includes(WORKSPACE_PLAN_POINTER)),
      route.route.warnings.join(" | "),
    );
    assert(route.route.coverage.delivery === "required references, 0 requested in this response", route.route.coverage.delivery);
  });

  harness.check("eval-baselines: retrieval cases walk the real service, nextCall, and worker brief", () => {
    const bundle = loadBundle();
    const corpus = loadStoreCorpus();
    const workflows = bundle.catalog.workflows as CatalogWorkflowRow[];
    const service = createKnowledgeService(bundle);
    const stageA = loadStageACorpus();
    const heldOut = stageA.metadata.heldOutUtteranceIds.map((id) => {
      const entry = corpus.entries.find((item) => item.id === id);
      assert(entry !== undefined, `held-out paraphrase ${id} must stay frozen in the store corpus`);
      assert(entry.id !== "store-010", "held-out paraphrases must not be the ASC ranking utterance");
      return entry;
    });
    assert(heldOut.length === stageA.metadata.heldOutUtteranceIds.length, "held-out set must stay reserved and unused for ranking");
    const apple = service.catalog({ query: "App Store Connect screenshots", offset: 0, limit: 10 }).workflows.map((workflow) => workflow.id);
    assert(apple.includes("workflow.store.store-screenshots-production"), apple.join(","));
    assert(!apple.includes("workflow.store.google-play-release") || apple[0] !== "workflow.store.google-play-release", "Android-only release is not the required Apple route");
    const journeyAuthored = workflows.find((workflow) => workflow.id === "workflow.experience.onboarding-system.onb-16-journey-graph");
    assert(journeyAuthored !== undefined, "onboarding journey workflow must exist");
    assert(journeyAuthored.instructions.includes("not selected, selected but unavailable"), "applicability language from #67 must remain");
    assert(!journeyAuthored.instructions.includes("unconditional quiz"), journeyAuthored.instructions.slice(0, 160));
    const design = service.workflow({ workflowId: "workflow.design.design-room", brief: true });
    assert(design.dispatchBrief !== null, "Stage A must request brief:true");
    assert(design.dispatchBrief.workflowId === "workflow.design.design-room", design.dispatchBrief.workflowId);
    assert(design.dispatchBrief.instructions.length > 0, "worker brief must carry authored instructions");
    assert(design.dispatchBrief.load.length > 0, "worker brief must name load entries");
    const pin = stageA.cases.find((item) => item.class === "artifact_specification");
    assert(pin?.requiredReferenceId !== undefined && pin.sectionTitle !== undefined && pin.outputPath !== undefined, "golden must pin the artifact heading");
    const { spec, delivered: whole } = boundSpec(service, pin.workflowId, pin.outputPath, pin.requiredReferenceId, pin.sectionTitle);
    assert(whole.reference.referenceId === "reference.process.artifact-contracts", "combined walk must not take Communication Brief");
    assert(whole.section?.title === "DESIGN.md", "combined walk must stay on the artifact-contract heading");
    let page = service.get({ ...spec, limit: 96 });
    let assembled = page.markdown;
    let continuations = 0;
    while (page.nextCall) {
      assert(++continuations < 100, "nextCall must terminate");
      page = service.get({ ...page.nextCall, limit: 96 });
      assembled += page.markdown;
    }
    assert(assembled === whole.markdown, "nextCall walk must reassemble the delivered section");
    refuseChangedRevision(bundle, spec, whole);
    const tight = service.workflow({
      workflowId: "workflow.store.asc-cli-automation",
      include: "full",
      tokenBudget: 256,
      brief: true,
    });
    assert(tight.dispatchBrief !== null, "tight bundle mode still returns a worker brief");
    assert(tight.knowledgeBundle !== null && tight.knowledgeBundle.coverage.complete === false, "tight bundle must stay incomplete");
    assert(
      tight.knowledgeBundle?.coverage.incomplete.some((entry) => entry.status === "truncated" || entry.status === "omitted"),
      JSON.stringify(tight.knowledgeBundle?.coverage.incomplete),
    );
    const again = service.workflow({ workflowId: "workflow.store.asc-cli-automation" });
    assert(again.route.coverage.requiredCount > 0, "repeat route still names required references");
    assert(again.guardrails.executionAvailable === false && again.guardrails.workspacePlan === false, "hosted caller cannot execute local plan tools");
    assert(again.dispatchBrief === null, "route-only repeat must not imply a brief was requested");
  });

  harness.check("eval-baselines: Stage A per-case report walks the reviewed split without using held-out paraphrases", () => {
    const bundle = loadBundle();
    const store = loadStoreCorpus();
    const stageA = loadStageACorpus();
    const service = createKnowledgeService(bundle);
    const workflows = bundle.catalog.workflows as CatalogWorkflowRow[];
    assert(stageA.metadata.actualModelUsage === "unknown", "Stage A must not invent model usage");
    assert(stageA.cases.length === 8, `reviewed Stage A set must stay the eight issue cases, got ${stageA.cases.length}`);
    for (const id of stageA.metadata.heldOutUtteranceIds) {
      const entry = store.entries.find((item) => item.id === id);
      assert(entry !== undefined, `held-out ${id} missing from store-utterances.json`);
      assert(entry.id !== "store-010", "held-out set must not include the ASC ranking utterance");
    }
    const seen = new Set<string>();
    const reports = stageA.cases.map((item) => {
      assert(!seen.has(item.id), `duplicate Stage A case id ${item.id}`);
      seen.add(item.id);
      return runStageACase(service, workflows, item, bundle);
    });
    const failed = reports.filter((report) => !report.ok);
    assert(
      failed.length === 0,
      failed.map((report) => `${report.id}: ${report.detail}`).join(" | "),
    );
    const repeated = reports.find((report) => report.class === "repeated_read");
    assert(repeated !== undefined && repeated.uniqueRequiredSections === 1 && repeated.duplicatedDelivery === 1, JSON.stringify(repeated));
    assert(
      reports.every((report) => report.actualModelUsage === "unknown" && report.estimatedTokenBasis === "character_derived_code_points_div_4"),
      "volume units must stay separate from actual model usage",
    );
  });

  harness.check("eval-baselines: overlay order remains a checked transcription of catalog phase order", () => {
    const catalog = composeCatalog(skillRoot);
    const graph = loadAgentGraph(skillRoot);
    for (const node of graph.nodes) {
      const phase = catalog.phases.find((item) => item.id === node.phaseId);
      assert(phase !== undefined, node.phaseId);
      assert(phase.order === node.order, `${node.id} ${node.order} vs ${phase.order}`);
    }
    const protocol = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/eval-baselines.md"), "utf8");
    const ownership = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/agent-graph-ownership.md"), "utf8");
    assert(protocol.includes("#77"), "protocol records the no-change");
    assert(protocol.includes("checked transcription"), protocol);
    assert(ownership.includes("Why derivation is not worth it"), ownership);
  });

  harness.check("eval-baselines: Stage A evidence records a no-change recommendation on retrieval infrastructure", () => {
    const protocol = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/eval-baselines.md"), "utf8");
    const catalogSource = readFileSync(path.join(skillRoot, "catalog/index.ts"), "utf8");
    const serviceSource = readFileSync(path.join(skillRoot, "kernel/knowledge-service/service.ts"), "utf8");
    const packageJson = readFileSync(path.join(skillRoot, "package.json"), "utf8");
    assert(protocol.includes("no-change recommendation"), protocol);
    assert(protocol.includes("No vector store, embeddings, or graph database"), protocol);
    assert(protocol.includes("Do not extract `matchWorkflows` into hosted `catalog()`"), protocol);
    assert(!catalogSource.includes("matchWorkflows"), "hosted catalog composition must not import the session scorer");
    assert(serviceSource.includes("BM25"), "existing BM25 search stays the retrieval owner");
    for (const name of FORBIDDEN_RETRIEVAL_INFRA) {
      assert(!packageJson.includes(name), `package.json must not add ${name}`);
    }
  });

  harness.check("eval-baselines: #78 sample keeps existing proposal fields and is not a runtime gate", () => {
    const protocol = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/eval-baselines.md"), "utf8");
    const sample = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/complexity-sample.md"), "utf8");
    const contributing = readFileSync(path.join(skillRoot, "CONTRIBUTING.md"), "utf8");
    const adoption = readFileSync(path.join(skillRoot, "docs/guides/adopt-external-sources.md"), "utf8");
    const template = readFileSync(path.join(skillRoot, ".github/ISSUE_TEMPLATE/feature_request.yml"), "utf8");
    assert(protocol.includes("existing fields suffice"), protocol);
    assert(protocol.includes("Not a runtime gate"), protocol);
    assert(sample.includes("No schema expansion"), sample);
    assert(sample.includes("#156"), "sample must include the #40 runtime change");
    assert(sample.includes("#165"), "sample must include the Stage A pin");
    assert(sample.includes("#151"), "sample must include the eval-baseline scorer ownership");
    assert(sample.includes("#77"), "sample must include the overlay-order no-change");
    assert(sample.includes("#88"), "sample must include the optional Expo hold");
    assert(contributing.includes("Adding default-path cost or a new architectural boundary"), contributing);
    assert(contributing.includes("Ordinary fixes, optional citations, and"), contributing);
    assert(adoption.includes("Default-path cost or a new architectural boundary"), adoption);
    assert(template.includes("id: problem") && template.includes("id: proposal") && template.includes("id: enforcement"), template);
    assert(template.includes("A competitor having a similar feature is not enough"), template);
    assert(template.includes("The least-complex change at the existing owner"), template);
    assert(template.includes("Named baseline and how you will observe benefit"), template);
    assert(!template.includes("anti-complexity"), "do not add a parallel policy form");
  });
}
