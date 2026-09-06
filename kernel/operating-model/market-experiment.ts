import { z } from "zod";
import { digest, stableJson } from "../../tooling/lib/canonical-json.js";
import { compareObservations, type MeasurementCatalog } from "./measurement.js";
import { validateOperatingModel } from "./validate.js";
import { projectOperatingModel } from "./projections.js";
import type { OperatingModel, ObservationRecord } from "./types.js";

const text = z.string().trim().min(1);
const metric = z.strictObject({ id: text, revision: z.number().int().positive() });
const window = z.strictObject({ start: z.string().datetime(), end: z.string().datetime(), timezone: text });
export const marketExperimentSchema = z
  .strictObject({
    schemaVersion: z.literal("b2c.market-experiment/v1"),
    id: text,
    revision: z.number().int().positive(),
    hypothesis: text,
    comparisonKind: z.literal("exploratory_business_comparison"),
    primaryMetric: metric,
    costMetric: metric,
    currency: z.string().regex(/^[A-Z]{3}$/),
    window,
    decisionHorizon: z.string().datetime(),
    criteria: z.strictObject({
      revision: z.number().int().positive(),
      minimumExposed: z.number().int().positive(),
      maximumMissingJoinRate: z.number().min(0).max(1),
      maximumObservationAgeHours: z.number().positive(),
    }),
    participants: z
      .array(
        z.strictObject({
          workspaceId: text,
          appId: text,
          environment: text,
          hypothesis: text,
          treatment: text,
          allocationRecordId: text,
          primaryObservationId: text,
          costObservationId: text,
          cohortObservationId: text,
        }),
      )
      .min(2),
    founderDecisionIds: z.array(text),
  })
  .superRefine((experiment, context) => {
    if (new Set(experiment.participants.map((row) => row.workspaceId)).size !== experiment.participants.length)
      context.addIssue({ code: "custom", message: "Workspace IDs must be independent and unique." });
    if (new Set(experiment.participants.map((row) => `${row.appId}\0${row.environment}`)).size !== experiment.participants.length)
      context.addIssue({ code: "custom", message: "Business identity boundaries must be independent." });
    if (Date.parse(experiment.window.start) >= Date.parse(experiment.window.end) || Date.parse(experiment.decisionHorizon) < Date.parse(experiment.window.end))
      context.addIssue({ code: "custom", message: "Decision horizon must follow a nonempty observation window." });
  });
export type MarketExperiment = z.infer<typeof marketExperimentSchema>;
export const marketCohortSchema = z
  .strictObject({
    schemaVersion: z.literal("b2c.market-cohort/v1"),
    appId: text,
    environment: text,
    origin: z.enum(["synthetic", "observed"]),
    assignmentUnit: z.literal("business"),
    allocationRecordId: text,
    eligible: z.number().int().nonnegative(),
    exposed: z.number().int().nonnegative(),
    joined: z.number().int().nonnegative(),
    attribution: z.enum(["known", "unknown"]),
    acquisitionMix: z.array(z.strictObject({ channel: text, share: z.number().min(0).max(1) })).min(1),
    window: window.extend({ maturity: z.enum(["immature", "mature"]) }),
  })
  .superRefine((row, context) => {
    if (row.joined > row.exposed || row.exposed > row.eligible)
      context.addIssue({ code: "custom", message: "Join and exposure counts exceed their population." });
    if (
      new Set(row.acquisitionMix.map((entry) => entry.channel)).size !== row.acquisitionMix.length ||
      Math.abs(row.acquisitionMix.reduce((sum, entry) => sum + entry.share, 0) - 1) > 0.000001
    )
      context.addIssue({ code: "custom", message: "Acquisition shares must be unique and sum to one." });
  });
export interface MarketBusinessInput {
  workspaceId: string;
  appId: string;
  environment: string;
  model?: OperatingModel;
  measurement?: MeasurementCatalog;
  unavailableReason?: string;
}
export interface MarketReportRow {
  workspaceId: string;
  hypothesis: string;
  treatment: string;
  state: "ready" | "degraded";
  origin: "synthetic" | "observed" | "unknown";
  reasons: string[];
  sources: Array<{ id: string; revision: number; uri: string; sourceRevision: string }>;
  basisDigest?: string;
  value?: number;
  cost?: number;
  exposed?: number;
  missingJoinRate?: number;
}
interface Candidate {
  row: MarketReportRow;
  primary: ObservationRecord;
  cost: ObservationRecord;
  cohort: z.infer<typeof marketCohortSchema>;
  measurement: MeasurementCatalog;
}
export interface MarketExperimentReport {
  schemaVersion: "b2c.market-report/v1";
  experimentId: string;
  experimentRevision: number;
  reportDigest: string;
  generatedAt: string;
  comparisonKind: "exploratory_business_comparison";
  completion: { expected: number; ready: number; degraded: number; status: "complete" | "partial" };
  rows: MarketReportRow[];
  groups: Array<{
    origin: "synthetic" | "observed";
    workspaceIds: string[];
    comparable: boolean;
    reasons: string[];
    aggregate: null | { primaryTotal: number; actualCostTotal: number; currency: string; exposed: number };
    ranking: string[] | null;
  }>;
  authorityGranted: false;
  liveLaunchProven: false;
  limitations: string[];
}
function sameWindow(left: { start: string; end: string; timezone: string }, right: { start: string; end: string; timezone: string }): boolean {
  return left.start === right.start && left.end === right.end && left.timezone === right.timezone;
}
function definition(catalog: MeasurementCatalog, reference: { id: string; revision: number }) {
  const matches = catalog.definitions.filter((entry) => entry.id === reference.id && entry.revision === reference.revision);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Read model only: aggregate accepted cohort observations, never merge identities or authorize allocation. */
export function reportMarketExperiment(input: { experiment: unknown; businesses: readonly MarketBusinessInput[]; now: string }): MarketExperimentReport {
  const experiment = marketExperimentSchema.parse(input.experiment),
    now = Date.parse(input.now);
  if (!Number.isFinite(now)) throw new Error("market.invalid_clock");
  const candidates: Candidate[] = [];
  const rows = experiment.participants.map((participant): MarketReportRow => {
    const row: MarketReportRow = {
      workspaceId: participant.workspaceId,
      hypothesis: participant.hypothesis,
      treatment: participant.treatment,
      state: "degraded",
      origin: "unknown",
      reasons: [],
      sources: [],
    };
    const matches = input.businesses.filter((business) => business.workspaceId === participant.workspaceId);
    if (matches.length !== 1) {
      row.reasons.push("workspace_unavailable_or_ambiguous");
      return row;
    }
    const business = matches[0]!;
    if (business.unavailableReason || !business.model || !business.measurement) {
      row.reasons.push(business.unavailableReason ?? "operating_measurement_missing");
      return row;
    }
    if (business.appId !== participant.appId || business.environment !== participant.environment) {
      row.reasons.push("business_identity_mismatch");
      return row;
    }
    if (validateOperatingModel(business.model).some((issue) => issue.severity === "error")) {
      row.reasons.push("operating_records_invalid");
      return row;
    }
    const projection = projectOperatingModel(business.model, { now: input.now });
    const observation = (id: string): ObservationRecord | undefined => {
      let record = projection.currentById[id];
      const visited = new Set<string>();
      while (record) {
        if (visited.has(record.id)) {
          row.reasons.push("correction_cycle");
          return;
        }
        visited.add(record.id);
        const successors = Object.values(projection.currentById).filter((entry) => entry.supersedes === record!.id);
        if (successors.length > 1) {
          row.reasons.push("ambiguous_correction");
          return;
        }
        if (!successors.length) break;
        record = successors[0];
      }
      const referenceId = record?.id ?? id;
      if (!record || record.kind !== "observation") {
        row.reasons.push(`observation_missing:${id}`);
        return;
      }
      const acceptance = [...business.model!.events]
        .reverse()
        .find((event) => event.payload.observationId === referenceId && ["observation_accepted", "observation_rejected"].includes(event.type));
      if (!acceptance || acceptance.type !== "observation_accepted" || acceptance.payload.observationRevision !== record.revision)
        row.reasons.push(`current_revision_acceptance_missing:${id}`);
      row.sources.push({ id: referenceId, revision: record.revision, uri: record.source.uri, sourceRevision: record.source.revision });
      if (projection.observationStatuses[referenceId] !== "accepted" || projection.staleIds.includes(referenceId) || record.epistemic !== "known")
        row.reasons.push(`observation_unaccepted_or_stale:${id}`);
      const age = now - Date.parse(record.observedAt);
      if (!Number.isFinite(age) || age < 0 || age > experiment.criteria.maximumObservationAgeHours * 3600000) row.reasons.push(`observation_age_invalid:${id}`);
      if (record.subjectRef) row.reasons.push(`subject_level_observation_not_aggregate:${id}`);
      if (record.experimentId !== experiment.id || record.experimentRevision !== experiment.revision) row.reasons.push(`experiment_assignment_mismatch:${id}`);
      return record;
    };
    const primary = observation(participant.primaryObservationId),
      cost = observation(participant.costObservationId),
      cohortObservation = observation(participant.cohortObservationId);
    if (!primary || !cost || !cohortObservation) return row;
    const parsed = marketCohortSchema.safeParse(cohortObservation.value);
    if (!parsed.success) {
      row.reasons.push("cohort_evidence_invalid");
      return row;
    }
    const cohort = parsed.data;
    row.origin = cohort.origin;
    row.exposed = cohort.exposed;
    if (cohort.appId !== business.appId || cohort.environment !== business.environment) row.reasons.push("cohort_identity_mismatch");
    const allocation = projection.currentById[participant.allocationRecordId];
    if (
      cohort.allocationRecordId !== participant.allocationRecordId ||
      !allocation ||
      allocation.kind !== "decision" ||
      !["authorized", "active", "completed"].includes(allocation.status) ||
      !allocation.authorization
    )
      row.reasons.push("allocation_record_unavailable");
    if (
      !sameWindow(cohort.window, experiment.window) ||
      !primary.window ||
      !cost.window ||
      !sameWindow(primary.window, experiment.window) ||
      !sameWindow(cost.window, experiment.window)
    )
      row.reasons.push("window_mismatch");
    if (
      cohort.window.maturity !== "mature" ||
      primary.window?.maturity !== "mature" ||
      cost.window?.maturity !== "mature" ||
      now < Date.parse(experiment.decisionHorizon)
    )
      row.reasons.push("immature_decision_window");
    if (cohort.exposed < experiment.criteria.minimumExposed) row.reasons.push("insufficient_exposure");
    row.missingJoinRate = cohort.exposed ? 1 - cohort.joined / cohort.exposed : 1;
    if (row.missingJoinRate > experiment.criteria.maximumMissingJoinRate) row.reasons.push("missing_join_coverage_exceeded");
    if (cohort.attribution !== "known") row.reasons.push("attribution_unknown");
    const primaryDefinition = definition(business.measurement, experiment.primaryMetric),
      costDefinition = definition(business.measurement, experiment.costMetric);
    row.basisDigest = digest(stableJson({ primary, cost, cohortObservation, allocation, primaryDefinition, costDefinition }));
    if (
      !primaryDefinition ||
      primary.metricDefinitionId !== experiment.primaryMetric.id ||
      primary.metricDefinitionRevision !== experiment.primaryMetric.revision
    )
      row.reasons.push("primary_metric_contract_mismatch");
    if (
      !costDefinition ||
      cost.metricDefinitionId !== experiment.costMetric.id ||
      cost.metricDefinitionRevision !== experiment.costMetric.revision ||
      costDefinition.costKind !== "actual" ||
      cost.costKind !== "actual"
    )
      row.reasons.push("actual_cost_contract_missing");
    if (
      cost.currency !== experiment.currency ||
      costDefinition?.currency !== experiment.currency ||
      (primary.currency !== undefined && primary.currency !== experiment.currency)
    )
      row.reasons.push("currency_mismatch");
    if (
      typeof primary.value !== "number" ||
      !Number.isFinite(primary.value) ||
      typeof cost.value !== "number" ||
      !Number.isFinite(cost.value) ||
      cost.value < 0
    )
      row.reasons.push("finite_outcome_or_cost_missing");
    for (const record of [primary, cost]) {
      const comparison = compareObservations(record, record, business.measurement);
      if (comparison.status !== "comparable") row.reasons.push(...comparison.reasonCodes);
    }
    if (!row.reasons.length) {
      row.state = "ready";
      row.value = primary.value as number;
      row.cost = cost.value as number;
      candidates.push({ row, primary, cost, cohort, measurement: business.measurement });
    }
    row.reasons = [...new Set(row.reasons)].sort();
    return row;
  });
  const groups = (["observed", "synthetic"] as const).map((origin) => {
    const selected = candidates.filter((entry) => entry.row.origin === origin),
      reasons: string[] = [];
    if (rows.some((row) => row.origin === "unknown")) reasons.push("unclassified_missing_participant");
    if (selected.length < 2) reasons.push("fewer_than_two_comparable_businesses");
    if (rows.some((row) => row.origin === origin && row.state !== "ready")) reasons.push("partial_group");
    for (let index = 1; index < selected.length; index++) {
      const left = selected[0]!,
        right = selected[index]!;
      for (const reference of [experiment.primaryMetric, experiment.costMetric])
        if (stableJson(definition(left.measurement, reference)) !== stableJson(definition(right.measurement, reference)))
          reasons.push("metric_definition_bytes_mismatch");
      for (const key of ["primary", "cost"] as const) {
        const compared = compareObservations(left[key], right[key], left.measurement);
        if (compared.status !== "comparable") reasons.push(...compared.reasonCodes);
      }
      const mix = (entry: Candidate) => [...entry.cohort.acquisitionMix].sort((a, b) => a.channel.localeCompare(b.channel));
      if (stableJson(mix(left)) !== stableJson(mix(right))) reasons.push("acquisition_mix_mismatch");
    }
    const comparable = reasons.length === 0;
    const definitionUnits = selected[0] && definition(selected[0].measurement, experiment.primaryMetric)?.units;
    const additive =
      ["count", "currency", "money", "minor_units"].includes(definitionUnits ?? "") &&
      !definition(selected[0]!.measurement, experiment.primaryMetric)?.denominator;
    return {
      origin,
      workspaceIds: rows.filter((row) => row.origin === origin).map((row) => row.workspaceId),
      comparable,
      reasons: [...new Set(reasons)].sort(),
      aggregate:
        comparable && additive
          ? {
              primaryTotal: selected.reduce((sum, entry) => sum + entry.row.value!, 0),
              actualCostTotal: selected.reduce((sum, entry) => sum + entry.row.cost!, 0),
              currency: experiment.currency,
              exposed: selected.reduce((sum, entry) => sum + entry.cohort.exposed, 0),
            }
          : null,
      ranking: null,
    };
  });
  const ready = rows.filter((row) => row.state === "ready").length;
  const body = {
    schemaVersion: "b2c.market-report/v1" as const,
    experimentId: experiment.id,
    experimentRevision: experiment.revision,
    generatedAt: input.now,
    comparisonKind: experiment.comparisonKind,
    completion: { expected: rows.length, ready, degraded: rows.length - ready, status: ready === rows.length ? ("complete" as const) : ("partial" as const) },
    rows,
    groups,
    authorityGranted: false as const,
    liveLaunchProven: false as const,
    limitations: [
      "Exploratory independent-business comparison; no randomized causal conclusion or automatic ranking.",
      "Synthetic and recorded observations are separate. Accepted records do not prove a live launch.",
      "Allocation and spend changes require existing founder authority.",
      "Rates and non-additive metrics are never summed.",
    ],
  };
  return { ...body, reportDigest: digest(stableJson({ experiment, rows, groups })) };
}
