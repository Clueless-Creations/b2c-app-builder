import { appendOperatingRecord, applyOperatingEvent } from "../operating-model/events.js";
import type {
  DecisionRecord,
  DiagnosisRecord,
  HypothesisRecord,
  LearningRecord,
  OperatingModel,
  OperatingRecord,
  OptionRecord,
  OutcomeRecord,
  ReplayClock,
} from "../operating-model/types.js";
import type { RunStateDocument } from "../schema/types.js";
import { completeOccurrence } from "./lifecycle.js";
import type { WorkOrderOccurrence } from "./types.js";

export type OutcomeVerdict = "met" | "missed" | "ambiguous" | "missing_data";

export interface OutcomeObservation {
  metricMet: boolean;
  observationIds: readonly string[];
  independenceGroups: readonly string[];
  missingExpected: boolean;
}

export interface OutcomeReview {
  verdict: OutcomeVerdict;
  model: OperatingModel;
  diagnosisReopened: boolean;
  workFailed: boolean;
}

function nextId(prefix: string, clock: ReplayClock, occurrenceId: string): string {
  return `${prefix}.${occurrenceId}.${clock.now.replace(/[:.]/g, "")}`;
}

function latest<T extends OperatingRecord>(records: readonly OperatingRecord[], match: (record: OperatingRecord) => record is T): T | undefined {
  return records.filter(match).sort((left, right) => right.revision - left.revision || left.id.localeCompare(right.id))[0];
}

export function reviewOutcome(input: {
  run: RunStateDocument;
  occurrence: WorkOrderOccurrence;
  model: OperatingModel;
  observation: OutcomeObservation;
  clock: ReplayClock;
  producer?: string;
}): OutcomeReview {
  const producer = input.producer ?? "b2c";
  const clock = input.clock;
  if (input.occurrence.status !== "observing" && input.occurrence.status !== "proved") {
    throw new Error(`Outcome review requires an observing occurrence, got ${input.occurrence.status}`);
  }
  if (input.observation.missingExpected || input.observation.observationIds.length === 0) {
    const model = applyOperatingEvent(
      input.model,
      {
        id: nextId("event.evidence", clock, input.occurrence.id),
        type: "evidence_requested",
        recordedAt: clock.now,
        producer,
        payload: {
          request: {
            id: nextId("evidence-request", clock, input.occurrence.id),
            status: "open",
            needed: `Expected observation for ${input.occurrence.expectationId} is missing.`,
            recordedAt: clock.now,
          },
        },
      },
      clock,
    );
    return { verdict: "missing_data", model, diagnosisReopened: false, workFailed: false };
  }

  const latestById: Record<string, (typeof input.model.records)[number]> = {};
  for (const record of input.model.records) latestById[record.id] = record;
  for (const observationId of input.observation.observationIds) {
    const record = latestById[observationId];
    if (!record || record.kind !== "observation" || record.metricId !== input.occurrence.metricId) {
      throw new Error(`Outcome observation ${observationId} is not bound to occurrence metric ${input.occurrence.metricId}`);
    }
  }

  const groups = new Set(
    input.observation.observationIds.flatMap((observationId) => {
      const record = latestById[observationId];
      return record && record.kind === "observation" && record.independenceGroup.trim().length > 0 ? [record.independenceGroup] : [];
    }),
  );
  const confounded = input.observation.metricMet && input.observation.observationIds.length > 1 && groups.size < input.observation.observationIds.length;
  const verdict: "met" | "missed" | "ambiguous" = input.observation.metricMet ? (confounded ? "ambiguous" : "met") : "missed";
  const causalStatus = verdict === "met" ? "supported" : "unknown";

  let model = input.model;
  const outcome: OutcomeRecord = {
    id: nextId("outcome", clock, input.occurrence.id),
    kind: "outcome",
    revision: 1,
    recordedAt: clock.now,
    producer,
    epistemic: verdict === "met" ? "known" : "inferred",
    status: "recorded",
    expectationId: input.occurrence.expectationId,
    observationIds: [...input.observation.observationIds],
    causalStatus,
  };
  model = appendOperatingRecord(model, outcome, clock, producer, nextId("event.outcome", clock, input.occurrence.id));

  const learning: LearningRecord = {
    id: nextId("learning", clock, input.occurrence.id),
    kind: "learning",
    revision: 1,
    recordedAt: clock.now,
    producer,
    epistemic: verdict === "ambiguous" ? "disputed" : verdict === "met" ? "known" : "inferred",
    status: verdict === "met" ? "accepted" : verdict === "ambiguous" ? "rejected" : "proposed",
    outcomeId: outcome.id,
  };
  model = appendOperatingRecord(model, learning, clock, producer, nextId("event.learning", clock, input.occurrence.id));

  const hypothesis = latest(
    model.records,
    (record): record is HypothesisRecord => record.kind === "hypothesis" && record.decisionId === input.occurrence.decisionId,
  );
  if (hypothesis) {
    const nextHypothesis: HypothesisRecord = {
      ...hypothesis,
      revision: hypothesis.revision + 1,
      recordedAt: clock.now,
      status: verdict === "met" ? "supported" : verdict === "missed" ? "weakened" : "tentative",
      supersedes: `${hypothesis.id}@${hypothesis.revision}`,
    };
    model = appendOperatingRecord(model, nextHypothesis, clock, producer, nextId("event.hypothesis", clock, input.occurrence.id));
  }

  let diagnosisReopened = false;
  if (verdict === "missed") {
    const decision = latest(model.records, (record): record is DecisionRecord => record.kind === "decision" && record.id === input.occurrence.decisionId);
    const option = decision
      ? latest(model.records, (record): record is OptionRecord => record.kind === "option" && record.id === decision.optionId)
      : undefined;
    const diagnosis = option
      ? latest(model.records, (record): record is DiagnosisRecord => record.kind === "diagnosis" && record.id === option.diagnosisId)
      : undefined;
    if (diagnosis) {
      const reopened: DiagnosisRecord = {
        ...diagnosis,
        revision: diagnosis.revision + 1,
        recordedAt: clock.now,
        status: "recorded",
        supersedes: `${diagnosis.id}@${diagnosis.revision}`,
      };
      model = appendOperatingRecord(model, reopened, clock, producer, nextId("event.diagnosis", clock, input.occurrence.id));
      diagnosisReopened = true;
    }
  }

  completeOccurrence(input.run, input.occurrence.id, clock.now);
  return { verdict, model, diagnosisReopened, workFailed: false };
}
