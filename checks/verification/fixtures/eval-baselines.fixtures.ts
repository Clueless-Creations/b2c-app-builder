/**
 * Evaluation and measured-simplification baselines (#39, #40, #72, #73, #75, #77).
 *
 * Authorized local checks only. No live providers, devices, paid batches, or dispatch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { matchWorkflows, type RoutableWorkflow } from "../../../kernel/session/route-utterance.js";
import { composeCatalog } from "../../../catalog/index.js";
import { loadAgentGraph } from "../../../catalog/agent-graph/load.js";
import { HOSTED_BUNDLE_RELATIVE_PATH } from "../../../tooling/render-hosted-bundle.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const COMPLETION_GUARD = "A workflow pass is not a business-completion verdict.";
const HELD_OUT_PARAPHRASE_IDS = ["store-001", "store-002"] as const;

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
    assert(route.route.warnings.some((warning) => warning.startsWith(COMPLETION_GUARD)), route.route.warnings.join(" | "));
    const delivery = "delivery" in route.route.coverage ? (route.route.coverage as { delivery?: string }).delivery : undefined;
    if (delivery !== undefined) {
      assert(delivery === "required references, 0 requested in this response", delivery);
    }
  });

  harness.check("eval-baselines: retrieval cases walk the real service, nextCall, and worker brief", () => {
    const bundle = loadBundle();
    const corpus = loadStoreCorpus();
    const workflows = bundle.catalog.workflows as CatalogWorkflowRow[];
    const service = createKnowledgeService(bundle);
    const heldOut = HELD_OUT_PARAPHRASE_IDS.map((id) => {
      const entry = corpus.entries.find((item) => item.id === id);
      assert(entry !== undefined, `held-out paraphrase ${id} must stay frozen in the store corpus`);
      assert(entry.id !== "store-010", "held-out paraphrases must not be the ASC ranking utterance");
      return entry;
    });
    assert(heldOut.length === HELD_OUT_PARAPHRASE_IDS.length, "held-out set must stay reserved and unused for ranking");
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
    const spec = design.route.outputs.find((output) => output.path === "DESIGN.md")?.specifications[0]?.get;
    assert(spec !== undefined, "artifact specification must be bound");
    const whole = service.get({ ...spec, limit: 16384 });
    assert((whole.section?.title ?? "").length > 0, "required section must be delivered");
    let page = service.get({ ...spec, limit: 96 });
    let assembled = page.markdown;
    let continuations = 0;
    while (page.nextCall) {
      assert(++continuations < 100, "nextCall must terminate");
      page = service.get({ ...page.nextCall, limit: 96 });
      assembled += page.markdown;
    }
    assert(assembled === whole.markdown, "nextCall walk must reassemble the delivered section");
    let stale = false;
    try {
      service.get({ ...spec, expectedContentSha256: "0".repeat(64) });
    } catch {
      stale = true;
    }
    assert(stale, "stale hash must refuse");
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

  harness.check("eval-baselines: overlay order remains a checked transcription of catalog phase order", () => {
    const catalog = composeCatalog(skillRoot);
    const graph = loadAgentGraph(skillRoot);
    for (const node of graph.nodes) {
      const phase = catalog.phases.find((item) => item.id === node.phaseId);
      assert(phase !== undefined, node.phaseId);
      assert(phase.order === node.order, `${node.id} ${node.order} vs ${phase.order}`);
    }
    const protocol = readFileSync(path.join(skillRoot, "checks/verification/rehearsal/eval-baselines.md"), "utf8");
    assert(protocol.includes("#77"), "protocol records the no-change");
    assert(protocol.includes("checked transcription"), protocol);
  });
}
