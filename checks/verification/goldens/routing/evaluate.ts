import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileContext } from "../../../../kernel/context/compile.js";
import { resolveRoute } from "../../../../kernel/routing/resolve.js";
import { routeOutcomes, type RouteOutcome } from "../../../../kernel/routing/types.js";
import { GOLDEN_CASES, type GoldenCase } from "./v1/corpus.js";

export interface RoutingThresholds {
  version: string;
  minPrecision: number;
  minRecall: number;
  maxConfusionRate: number;
  maxAmbiguityRate: number;
  maxNoMatchRate: number;
  maxBlockedRate: number;
  maxCoverageGapRate: number;
}

export interface GoldenCaseResult {
  id: string;
  expected: RouteOutcome;
  actual: RouteOutcome;
  selectedId?: string;
  sectionIds: string[];
  confused: boolean;
  eligibleCount: number;
  candidateCount: number;
}

export interface RoutingEvaluation {
  version: string;
  thresholds: RoutingThresholds;
  results: GoldenCaseResult[];
  precision: number;
  recall: number;
  confusionRate: number;
  outcomeRates: Record<RouteOutcome, number>;
  failures: string[];
}

const thresholdsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "v1", "thresholds.json");

export function loadRoutingThresholds(): RoutingThresholds {
  const parsed = JSON.parse(readFileSync(thresholdsPath, "utf8")) as RoutingThresholds;
  return parsed;
}

function rate(results: GoldenCaseResult[], outcome: RouteOutcome): number {
  if (results.length === 0) return 0;
  return results.filter((result) => result.actual === outcome).length / results.length;
}

export function evaluateRoutingGoldens(cases: readonly GoldenCase[] = GOLDEN_CASES): RoutingEvaluation {
  const thresholds = loadRoutingThresholds();
  const results: GoldenCaseResult[] = [];
  for (const item of cases) {
    const decision = resolveRoute(item.request, item.candidates);
    let sectionIds: string[] = [];
    if (item.compileContext && decision.outcome === "selected") {
      const selected = item.candidates.find((candidate) => candidate.id === decision.selectedId);
      const capsule = compileContext({
        request: item.request,
        decision,
        sections: selected?.knowledgeSections ?? [],
        liveRevisions: item.liveRevisions,
      });
      sectionIds = capsule.sections.map((section) => section.sectionId);
    }
    results.push({
      id: item.id,
      expected: item.expectedOutcome,
      actual: decision.outcome,
      selectedId: decision.selectedId,
      sectionIds,
      confused: decision.outcome !== item.expectedOutcome || (item.expectedSelectedId !== undefined && decision.selectedId !== item.expectedSelectedId),
      eligibleCount: decision.eligibleIds.length,
      candidateCount: item.candidates.length,
    });
  }

  const expectedSelected = results.filter((result) => result.expected === "selected");
  const predictedSelected = results.filter((result) => result.actual === "selected");
  const trueSelected = results.filter((result) => result.expected === "selected" && result.actual === "selected" && !result.confused);
  const precision = predictedSelected.length === 0 ? 1 : trueSelected.length / predictedSelected.length;
  const recall = expectedSelected.length === 0 ? 1 : trueSelected.length / expectedSelected.length;
  const confusionRate = results.filter((result) => result.confused).length / results.length;
  const outcomeRates = Object.fromEntries(routeOutcomes.map((outcome) => [outcome, rate(results, outcome)])) as Record<RouteOutcome, number>;

  const failures: string[] = [];
  if (thresholds.minPrecision == null || thresholds.minRecall == null || thresholds.maxConfusionRate == null) {
    failures.push("golden evaluation is missing a fail threshold");
  }
  if (precision < thresholds.minPrecision) failures.push(`precision ${precision} < ${thresholds.minPrecision}`);
  if (recall < thresholds.minRecall) failures.push(`recall ${recall} < ${thresholds.minRecall}`);
  if (confusionRate > thresholds.maxConfusionRate) failures.push(`confusion ${confusionRate} > ${thresholds.maxConfusionRate}`);
  if (outcomeRates.ambiguous > thresholds.maxAmbiguityRate) failures.push(`ambiguity rate ${outcomeRates.ambiguous} > ${thresholds.maxAmbiguityRate}`);
  if (outcomeRates.no_match > thresholds.maxNoMatchRate) failures.push(`no_match rate ${outcomeRates.no_match} > ${thresholds.maxNoMatchRate}`);
  if (outcomeRates.blocked > thresholds.maxBlockedRate) failures.push(`blocked rate ${outcomeRates.blocked} > ${thresholds.maxBlockedRate}`);
  if (outcomeRates.coverage_gap > thresholds.maxCoverageGapRate) {
    failures.push(`coverage_gap rate ${outcomeRates.coverage_gap} > ${thresholds.maxCoverageGapRate}`);
  }
  for (const result of results) {
    if (result.confused) failures.push(`${result.id}: expected ${result.expected} got ${result.actual}`);
    const item = cases.find((entry) => entry.id === result.id);
    if (item?.expectedSectionIds && item.expectedSectionIds.join(",") !== result.sectionIds.join(",")) {
      failures.push(`${result.id}: expected sections ${item.expectedSectionIds.join(",")} got ${result.sectionIds.join(",")}`);
    }
  }

  return {
    version: thresholds.version,
    thresholds,
    results,
    precision,
    recall,
    confusionRate,
    outcomeRates,
    failures,
  };
}
