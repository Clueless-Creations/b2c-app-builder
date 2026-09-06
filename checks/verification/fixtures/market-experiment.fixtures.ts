import { callPublicOperation } from "../../../kernel/services/business.js";
import { marketReportSchema } from "../../../contracts/public-api/contract.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readMarketExperimentReport } from "../../../kernel/session/market-experiment.js";
import { validateBusinessState, validateMetricContracts } from "../../../kernel/schema/index.js";
import { reportMarketExperiment, type MarketExperiment, type MarketBusinessInput } from "../../../kernel/operating-model/market-experiment.js";
import type { ObservationRecord, OperatingModel } from "../../../kernel/operating-model/types.js";
import { assert, skillRoot, type Harness } from "./_harness.js";
const now = "2026-09-05T12:00:00.000Z";
const observedAt = "2026-09-05T11:00:00.000Z";
const window = { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z", timezone: "UTC", maturity: "mature" as const };
function experiment(): MarketExperiment {
  return {
    schemaVersion: "b2c.market-experiment/v1",
    id: "market.retention",
    revision: 1,
    hypothesis: "Independent useful habits retain consumers",
    comparisonKind: "exploratory_business_comparison",
    primaryMetric: { id: "retained", revision: 1 },
    costMetric: { id: "acquisition-cost", revision: 1 },
    currency: "USD",
    window: { start: window.start, end: window.end, timezone: window.timezone },
    decisionHorizon: "2026-09-04T00:00:00.000Z",
    criteria: { revision: 1, minimumExposed: 100, maximumMissingJoinRate: 0.05, maximumObservationAgeHours: 48 },
    participants: ["a", "b", "c"].map((id) => ({
      workspaceId: id,
      appId: `app-${id}`,
      environment: "production",
      hypothesis: `Hypothesis ${id}`,
      treatment: `Treatment ${id}`,
      allocationRecordId: "allocation",
      primaryObservationId: "outcome",
      costObservationId: "cost",
      cohortObservationId: "cohort",
    })),
    founderDecisionIds: ["decision.market-window"],
  };
}
function business(id: string, origin: "observed" | "synthetic" = "observed"): MarketBusinessInput {
  const observation = (name: string, value: unknown): ObservationRecord => ({
    id: name,
    revision: 1,
    recordedAt: observedAt,
    observedAt,
    producer: "fixture",
    epistemic: "known",
    kind: "observation",
    status: "recorded",
    metricId: `metric.${name}`,
    metricDefinitionId: name === "cost" ? "acquisition-cost" : "retained",
    metricDefinitionRevision: 1,
    source: { uri: `fixture://${id}/${name}`, revision: "source1" },
    independenceGroup: `app-${id}`,
    confidence: { lower: 0.5, upper: 0.6 },
    value,
    window,
    experimentId: "market.retention",
    experimentRevision: 1,
    participationKind: "exposure",
    ...(name === "cost" ? { currency: "USD", costKind: "actual" as const, amountUnits: "minor_units", amountTreatment: "net" as const } : {}),
  });
  const cohort = {
    schemaVersion: "b2c.market-cohort/v1",
    appId: `app-${id}`,
    environment: "production",
    origin,
    assignmentUnit: "business",
    allocationRecordId: "allocation",
    eligible: 200,
    exposed: 150,
    joined: 149,
    attribution: "known",
    acquisitionMix: [{ channel: "organic", share: 1 }],
    window,
  };
  const records: OperatingModel["records"] = [
    observation("outcome", 50),
    observation("cost", 10000),
    observation("cohort", cohort),
    {
      id: "allocation",
      revision: 1,
      recordedAt: observedAt,
      producer: "founder",
      epistemic: "known",
      kind: "decision",
      status: "authorized",
      optionId: "option.allocate",
      evidenceIds: [],
      authorization: "receipt:founder-allocation",
    },
  ];
  const common = { revision: 1, recordedAt: observedAt, producer: "fixture", epistemic: "known" as const };
  records.unshift(
    { ...common, id: "objective.retention", kind: "objective", status: "active", title: "Retention", valueLoop: "delivery" },
    ...["outcome", "cost", "cohort"].map((id) => ({
      ...common,
      id: `metric.${id}`,
      kind: "metric" as const,
      status: "active" as const,
      objectiveId: "objective.retention",
      name: id,
    })),
    { ...common, id: "gap.allocate", kind: "gap", status: "diagnosed", objectiveId: "objective.retention", metricId: "metric.outcome" },
    { ...common, id: "diagnosis.allocate", kind: "diagnosis", status: "recorded", gapId: "gap.allocate", evidenceIds: [], sourceRevision: "1" },
    { ...common, id: "option.allocate", kind: "option", status: "selected", diagnosisId: "diagnosis.allocate", evidenceIds: [], sourceRevision: "1" },
  );
  const model: OperatingModel = {
    schemaVersion: "1.0.0",
    records,
    events: ["outcome", "cost", "cohort"].map((id) => ({
      id: `accept-${id}`,
      type: "observation_accepted",
      recordedAt: observedAt,
      producer: "verifier",
      payload: { observationId: id, observationRevision: 1 },
    })),
    evidenceRequests: [],
  };
  return {
    workspaceId: id,
    appId: `app-${id}`,
    environment: "production",
    model,
    measurement: {
      definitions: [
        {
          id: "retained",
          revision: 1,
          name: "Retained consumers",
          objectiveId: "objective.retention",
          eventSchemaVersion: "1.0.0",
          numerator: "retained consumers",
          units: "count",
          window,
        },
        {
          id: "acquisition-cost",
          revision: 1,
          name: "Acquisition cost",
          objectiveId: "objective.retention",
          eventSchemaVersion: "1.0.0",
          numerator: "actual cost",
          units: "currency",
          currency: "USD",
          amountUnits: "minor_units",
          amountTreatment: "net",
          costKind: "actual",
          window,
        },
      ],
    },
  };
}
const record = (input: MarketBusinessInput, id: string) => input.model!.records.find((entry) => entry.id === id)! as ObservationRecord;
export function register(h: Harness): void {
  h.check("market report compares mature independent cohorts without granting allocation or claiming launch", () => {
    const inputs = [business("a"), business("b"), business("c")];
    const before = JSON.stringify(inputs),
      report = reportMarketExperiment({ experiment: experiment(), businesses: inputs, now });
    assert(
      report.completion.ready === 3 && report.groups[0]!.aggregate?.primaryTotal === 150 && report.groups[0]!.aggregate?.actualCostTotal === 30000,
      JSON.stringify(report),
    );
    assert(
      report.groups[0]!.ranking === null && !report.authorityGranted && !report.liveLaunchProven && JSON.stringify(inputs) === before,
      "report granted power, claimed launch or mutated evidence",
    );
  });
  h.check("identity, attribution, exposure, assignment, costs and maturity failures remain explicit degraded rows", () => {
    for (const mutate of [
      (value: MarketBusinessInput) => {
        value.appId = "wrong-app";
      },
      (value: MarketBusinessInput) => {
        (record(value, "cohort").value as any).attribution = "unknown";
      },
      (value: MarketBusinessInput) => {
        (record(value, "cohort").value as any).joined = 20;
      },
      (value: MarketBusinessInput) => {
        (record(value, "cohort").value as any).window = { ...window, maturity: "immature" };
      },
      (value: MarketBusinessInput) => {
        record(value, "outcome").experimentId = "other";
      },
      (value: MarketBusinessInput) => {
        record(value, "cost").costKind = "estimated";
      },
      (value: MarketBusinessInput) => {
        record(value, "outcome").subjectRef = { opaqueRef: "person", appId: "app-a", environment: "production" };
      },
    ]) {
      const target = business("a");
      mutate(target);
      const report = reportMarketExperiment({ experiment: experiment(), businesses: [target, business("b"), business("c")], now });
      assert(report.rows[0]!.state === "degraded" && report.rows[0]!.reasons.length > 0 && report.groups[0]!.aggregate === null, JSON.stringify(report));
    }
  });
  h.check("different acquisition mix, currency or definition bytes prevent unjustified aggregates", () => {
    for (const mutate of [
      (value: MarketBusinessInput) => {
        (record(value, "cohort").value as any).acquisitionMix = [{ channel: "paid", share: 1 }];
      },
      (value: MarketBusinessInput) => {
        record(value, "cost").currency = "EUR";
      },
      (value: MarketBusinessInput) => {
        (value.measurement!.definitions[0] as any).numerator = "different definition";
      },
    ]) {
      const target = business("a");
      mutate(target);
      const report = reportMarketExperiment({ experiment: experiment(), businesses: [target, business("b"), business("c")], now });
      assert(!report.groups[0]!.comparable && report.groups[0]!.aggregate === null, "incomparable businesses were aggregated");
    }
  });
  h.check("synthetic evidence never joins observed outcomes and missing businesses remain partial", () => {
    const report = reportMarketExperiment({ experiment: experiment(), businesses: [business("a"), business("b"), business("c", "synthetic")], now });
    assert(
      report.groups[0]!.workspaceIds.length === 2 && report.groups[0]!.aggregate?.primaryTotal === 100 && report.groups[1]!.workspaceIds[0] === "c",
      JSON.stringify(report),
    );
    const partial = reportMarketExperiment({ experiment: experiment(), businesses: [business("a"), business("b")], now });
    assert(
      partial.completion.status === "partial" &&
        partial.rows[2]!.reasons.includes("workspace_unavailable_or_ambiguous") &&
        partial.groups[0]!.aggregate === null,
      "missing business disappeared",
    );
  });
  h.check("late correction requires fresh acceptance and changes report identity without rewriting evidence", () => {
    const target = business("a"),
      inputs = [target, business("b"), business("c")];
    const before = reportMarketExperiment({ experiment: experiment(), businesses: inputs, now });
    const corrected = {
      ...record(target, "outcome"),
      id: "outcome-corrected",
      supersedes: "outcome",
      revision: 1,
      value: 40,
      source: { uri: "fixture://a/outcome", revision: "refund-correction2" },
    };
    target.model!.records.push(corrected);
    const pending = reportMarketExperiment({ experiment: experiment(), businesses: inputs, now });
    assert(pending.rows[0]!.reasons.includes("current_revision_acceptance_missing:outcome"), "old acceptance blessed corrected outcome");
    target.model!.events.push({
      id: "accept-correction",
      type: "observation_accepted",
      producer: "verifier",
      recordedAt: now,
      payload: { observationId: "outcome-corrected", observationRevision: 1 },
    });
    const after = reportMarketExperiment({ experiment: experiment(), businesses: inputs, now });
    assert(
      after.groups[0]!.aggregate?.primaryTotal === 140 &&
        before.reportDigest !== after.reportDigest &&
        target.model!.records.filter((entry) => ["outcome", "outcome-corrected"].includes(entry.id)).length === 2,
      "correction lost history or left report unchanged",
    );
  });
  h.check("market reader resolves registry identities and projects stored current operating evidence", () => {
    const workspaces = ["a", "b", "c"].map((id) => {
      const root = h.makeTempDir(`market-${id}-${randomUUID()}`),
        input = business(id);
      mkdirSync(path.join(root, "state"));
      mkdirSync(path.join(root, "operations"));
      const state = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8"));
      state.operatingModel = input.model;
      const checked = validateBusinessState(state);
      assert(checked.valid, JSON.stringify(checked.issues));
      writeFileSync(path.join(root, "state/business-state.json"), JSON.stringify(state));
      const metrics = {
        schemaVersion: "1.0.0",
        updatedAt: now,
        appId: input.appId,
        environment: input.environment,
        identityBoundary: { mappingStore: "app_provider_boundary", capturePolicy: "opaque_subject_ref_only", deletionOwner: "u22_erasure_transition" },
        definitions: input.measurement!.definitions.map(({ objectiveId, ...definition }) => ({
          ...definition,
          objective: { id: objectiveId, title: "Retention", valueLoop: "delivery" },
          applicability: { applies: true },
          owner: "operations",
        })),
        experiments: [],
        conversions: [],
        ...(id === "a" ? { marketExperiments: [experiment()] } : {}),
      };
      const valid = validateMetricContracts(metrics);
      assert(valid.valid, JSON.stringify(valid.issues));
      writeFileSync(path.join(root, "operations/metric-contracts.json"), JSON.stringify(metrics));
      return { id, path: root, registeredAt: now };
    });
    const registry = { schemaVersion: "1.0.0" as const, workspaces };
    const report = readMarketExperimentReport({ workspaceId: "a", experimentId: "market.retention", now }, registry);
    assert(report.completion.ready === 3 && report.groups[0]!.aggregate?.primaryTotal === 150, JSON.stringify(report));
    const registryHome = h.makeTempDir(`market-public-${randomUUID()}`);
    writeFileSync(path.join(registryHome, "workspaces.json"), JSON.stringify(registry));
    const previousHome = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = registryHome;
    try {
      const publicResult = callPublicOperation("market.report", { workspaceId: "a", experimentId: "market.retention" });
      assert(publicResult.ok, JSON.stringify(publicResult));
      if (publicResult.ok) {
        marketReportSchema.parse(publicResult.data);
        assert(!(publicResult.data as { liveLaunchProven: boolean }).liveLaunchProven, "public report fabricated launch");
      }
    } finally {
      if (previousHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previousHome;
    }
    const missing = readMarketExperimentReport(
      { workspaceId: "a", experimentId: "market.retention", now },
      { ...registry, workspaces: workspaces.slice(0, 2) },
    );
    assert(missing.rows[2]!.reasons.includes("market.workspace_unregistered_or_ambiguous") && missing.completion.status === "partial", JSON.stringify(missing));
    const alias = readMarketExperimentReport(
      { workspaceId: "a", experimentId: "market.retention", now },
      { ...registry, workspaces: [workspaces[0]!, workspaces[1]!, { ...workspaces[2]!, path: workspaces[1]!.path }] },
    );
    assert(
      alias.rows[1]!.reasons.includes("market.workspace_identity_alias") && alias.rows[2]!.reasons.includes("market.workspace_identity_alias"),
      "same business counted twice under registry aliases",
    );
  });
}
