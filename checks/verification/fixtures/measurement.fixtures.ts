import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import {
  catalogFromDocument,
  compareObservations,
  countsAsExposure,
  mapIdentity,
  normalizeAmountEvents,
  observationsForSubject,
  type MeasurementCatalog,
} from "../../../kernel/operating-model/measurement.js";
import { validateMetricContracts } from "../../../kernel/schema/index.js";
import type { IdentityMapping, ObservationRecord, SubjectReference } from "../../../kernel/operating-model/types.js";

const CLOCK = "2026-09-04T18:00:00.000Z";
const VALIDATOR = "checks/validation/business/operations/check-metric-contracts.ts";
const REFERENCE_CONTRACTS = path.join(skillRoot, "examples/workspace/business/operations/metric-contracts.json");

function common(id: string): Pick<ObservationRecord, "id" | "revision" | "recordedAt" | "producer" | "epistemic" | "kind" | "status"> {
  return { id, revision: 1, recordedAt: CLOCK, producer: "b2c", epistemic: "known", kind: "observation", status: "recorded" };
}

function source() {
  return { uri: "evidence://measurement", revision: "src-rev-1", sectionId: "join" };
}

function observation(partial: Partial<ObservationRecord> & Pick<ObservationRecord, "id" | "metricId" | "value">): ObservationRecord {
  return {
    ...common(partial.id),
    metricId: partial.metricId,
    observedAt: partial.observedAt ?? "2026-09-03T12:00:00.000Z",
    source: partial.source ?? source(),
    independenceGroup: partial.independenceGroup ?? "analytics.primary",
    confidence: partial.confidence ?? { lower: 0.4, upper: 0.6 },
    value: partial.value,
    subjectRef: partial.subjectRef,
    identityLifecycle: partial.identityLifecycle,
    participationKind: partial.participationKind,
    metricDefinitionId: partial.metricDefinitionId,
    metricDefinitionRevision: partial.metricDefinitionRevision,
    currency: partial.currency,
    amountUnits: partial.amountUnits,
    amountTreatment: partial.amountTreatment,
    costKind: partial.costKind,
    cohortId: partial.cohortId,
    window: partial.window ?? { start: "P0D", end: "P7D", timezone: "UTC", maturity: "mature" },
    experimentId: partial.experimentId,
    experimentRevision: partial.experimentRevision,
    eventKind: partial.eventKind,
    sourceEventId: partial.sourceEventId,
  };
}

function revenueCatalog(): MeasurementCatalog {
  return catalogFromDocument(JSON.parse(readFileSync(REFERENCE_CONTRACTS, "utf8")));
}

export function register(harness: Harness): void {
  const catalog = revenueCatalog();

  harness.check("scenario 4 firstProof: USD-gross rev1 vs EUR-net rev2 is incomparable", () => {
    const left = observation({
      id: "observation.revenue-usd-gross",
      metricId: "metric.recognized-revenue",
      value: 1200,
      metricDefinitionId: "recognized_revenue",
      metricDefinitionRevision: 1,
    });
    const right = observation({
      id: "observation.revenue-eur-net",
      metricId: "metric.recognized-revenue",
      value: 900,
      metricDefinitionId: "recognized_revenue",
      metricDefinitionRevision: 2,
    });
    const result = compareObservations(left, right, catalog);
    assert(result.status === "incomparable", `expected incomparable, got ${result.status}: ${result.reason}`);
    assert(result.reasonCodes.includes("refused"), `expected refused reason, got ${result.reasonCodes.join(",")}`);
    assert(result.reasonCodes.includes("currency_mismatch"), `expected currency_mismatch, got ${result.reasonCodes.join(",")}`);
    assert(result.reasonCodes.includes("amount_treatment_mismatch"), `expected amount_treatment_mismatch, got ${result.reasonCodes.join(",")}`);
    assert(result.reasonCodes.includes("metric_version_mismatch"), `expected metric_version_mismatch, got ${result.reasonCodes.join(",")}`);
    assert(result.leftValue === undefined && result.rightValue === undefined, "refused join must not compute or pass through values");
    assert(!("ratio" in result), "refused join must not compute a ratio");
  });

  harness.check("scenario 4: immature window refuses comparison", () => {
    const left = observation({
      id: "observation.d7-mature",
      metricId: "metric.d7",
      value: 0.31,
      metricDefinitionId: "d7_retention",
      metricDefinitionRevision: 1,
    });
    const right = observation({
      id: "observation.d7-immature",
      metricId: "metric.d7",
      value: 0.22,
      metricDefinitionId: "d7_retention",
      metricDefinitionRevision: 1,
      window: { start: "P0D", end: "P2D", timezone: "UTC", maturity: "immature" },
    });
    const immatureCatalog: MeasurementCatalog = {
      definitions: [
        {
          id: "d7_retention",
          revision: 1,
          name: "Day-7 retention",
          objectiveId: "objective.retention",
          eventSchemaVersion: "retention.d7.v1",
          numerator: "returned_by_day_7",
          units: "ratio",
          window: { start: "P0D", end: "P2D", timezone: "UTC", maturity: "immature" },
        },
      ],
    };
    const result = compareObservations(left, right, immatureCatalog);
    assert(result.status === "incomparable", `expected incomparable, got ${result.status}`);
    assert(result.reasonCodes.includes("immature_window"), `expected immature_window, got ${result.reasonCodes.join(",")}`);
  });

  harness.check("scenario 4: matching mapped contracts stay comparable without a computed ratio", () => {
    const left = observation({
      id: "observation.revenue-a",
      metricId: "metric.recognized-revenue",
      value: 1200,
      metricDefinitionId: "recognized_revenue",
      metricDefinitionRevision: 1,
    });
    const right = observation({
      id: "observation.revenue-b",
      metricId: "metric.recognized-revenue",
      value: 1500,
      metricDefinitionId: "recognized_revenue",
      metricDefinitionRevision: 1,
    });
    const result = compareObservations(left, right, catalog);
    assert(result.status === "comparable", `expected comparable, got ${result.status}: ${result.reason}`);
    assert(result.leftValue === 1200 && result.rightValue === 1500, "comparable join keeps original values");
    assert(!("ratio" in result), "join must not invent a ratio");
  });

  harness.check("scenario 1: anonymous-to-identified and restore map inside one app and environment", () => {
    const anonymous: SubjectReference = { opaqueRef: "anon-1", appId: "app.shade", environment: "production" };
    const identified: SubjectReference = { opaqueRef: "user-9", appId: "app.shade", environment: "production" };
    const restored: IdentityMapping = {
      from: { opaqueRef: "restore-device-1", appId: "app.shade", environment: "production" },
      to: identified,
      lifecycle: "restored",
      recordedAt: CLOCK,
    };
    const identifiedMap = mapIdentity({
      from: anonymous,
      to: identified,
      lifecycle: "identified",
      recordedAt: CLOCK,
    });
    const restoreMap = mapIdentity(restored);
    assert(identifiedMap.status === "mapped", `expected mapped identity, got ${identifiedMap.status}`);
    assert(restoreMap.status === "mapped", `expected mapped restore, got ${restoreMap.status}`);
    assert(identifiedMap.subjectRef?.opaqueRef === "user-9", "identified map should point at the identified subject");
  });

  harness.check("scenario 1: identity maps refuse cross-app and cross-environment contamination", () => {
    const crossApp = mapIdentity({
      from: { opaqueRef: "anon-1", appId: "app.shade", environment: "production" },
      to: { opaqueRef: "user-9", appId: "app.sibling", environment: "production" },
      lifecycle: "identified",
      recordedAt: CLOCK,
    });
    const crossEnv = mapIdentity({
      from: { opaqueRef: "anon-1", appId: "app.shade", environment: "production" },
      to: { opaqueRef: "user-9", appId: "app.shade", environment: "staging" },
      lifecycle: "identified",
      recordedAt: CLOCK,
    });
    assert(
      crossApp.status === "refused" && crossApp.reasonCodes.includes("cross_app"),
      `expected cross_app refusal, got ${crossApp.status} ${crossApp.reasonCodes.join(",")}`,
    );
    assert(
      crossEnv.status === "refused" && crossEnv.reasonCodes.includes("cross_environment"),
      `expected cross_environment refusal, got ${crossEnv.status} ${crossEnv.reasonCodes.join(",")}`,
    );
  });

  harness.check("scenario 2: assignment does not count as exposure", () => {
    const assigned = observation({
      id: "observation.assigned",
      metricId: "metric.paywall-cvr",
      value: 1,
      participationKind: "assignment",
      experimentId: "paywall-copy-rewrite",
      experimentRevision: 1,
    });
    const exposed = observation({
      id: "observation.exposed",
      metricId: "metric.paywall-cvr",
      value: 1,
      participationKind: "exposure",
      experimentId: "paywall-copy-rewrite",
      experimentRevision: 1,
    });
    assert(countsAsExposure(assigned) === false, "assignment must not count as exposure");
    assert(countsAsExposure(exposed) === true, "exposure participation must count as exposure");
  });

  harness.check("scenario 3: duplicate purchases collapse and refunds revise the net", () => {
    const result = normalizeAmountEvents([
      { sourceEventId: "txn-1", kind: "purchase", amount: 10, currency: "USD", amountTreatment: "gross" },
      { sourceEventId: "txn-1", kind: "purchase", amount: 10, currency: "USD", amountTreatment: "gross" },
      { sourceEventId: "txn-1", kind: "duplicate", amount: 10, currency: "USD", amountTreatment: "gross" },
      { sourceEventId: "txn-1", kind: "refund", amount: 4, currency: "USD", amountTreatment: "gross" },
      { sourceEventId: "txn-2", kind: "purchase", amount: 7, currency: "USD", amountTreatment: "gross" },
    ]);
    assert(result.status === "normalized", `expected normalized, got ${result.status}`);
    assert(result.netAmount === 13, `expected net 13, got ${String(result.netAmount)}`);
    assert(result.duplicateCopiesIgnored === 2, `expected 2 ignored duplicates, got ${result.duplicateCopiesIgnored}`);
    assert(result.refundsApplied === 1, `expected 1 refund, got ${result.refundsApplied}`);
  });

  harness.check("scenario 5: missing definition file stays unknown", () => {
    const left = observation({
      id: "observation.untyped-a",
      metricId: "metric.recognized-revenue",
      value: 10,
      metricDefinitionId: "recognized_revenue",
      metricDefinitionRevision: 1,
    });
    const right = observation({
      id: "observation.untyped-b",
      metricId: "metric.recognized-revenue",
      value: 12,
      metricDefinitionId: "recognized_revenue",
      metricDefinitionRevision: 1,
    });
    const result = compareObservations(left, right, { missing: true, definitions: [] });
    assert(result.status === "unknown", `expected unknown, got ${result.status}`);
    assert(result.reasonCodes.includes("missing_definition_file"), `expected missing_definition_file, got ${result.reasonCodes.join(",")}`);
  });

  harness.check("scenario 5: untyped observations stay unmapped", () => {
    const left = observation({
      id: "observation.untyped-a",
      metricId: "metric.recognized-revenue",
      value: 10,
    });
    const right = observation({
      id: "observation.untyped-b",
      metricId: "metric.recognized-revenue",
      value: 12,
    });
    const result = compareObservations(left, right, catalog);
    assert(result.status === "unmapped", `expected unmapped, got ${result.status}`);
    assert(result.reasonCodes.includes("untyped_observation"), `expected untyped_observation, got ${result.reasonCodes.join(",")}`);
  });

  harness.check("scenario 6: subject-reference coverage finds mapped observations without a reverse map on receipts", () => {
    const anonymous: SubjectReference = { opaqueRef: "anon-1", appId: "app.shade", environment: "production" };
    const identified: SubjectReference = { opaqueRef: "user-9", appId: "app.shade", environment: "production" };
    const otherApp: SubjectReference = { opaqueRef: "user-9", appId: "app.sibling", environment: "production" };
    const first = observation({
      id: "observation.anon",
      metricId: "metric.activation",
      value: 1,
      subjectRef: anonymous,
      identityLifecycle: "anonymous",
    });
    const second = observation({
      id: "observation.identified",
      metricId: "metric.paywall-cvr",
      value: 1,
      subjectRef: identified,
      identityLifecycle: "identified",
    });
    const contaminant = observation({
      id: "observation.other-app",
      metricId: "metric.paywall-cvr",
      value: 1,
      subjectRef: otherApp,
      identityLifecycle: "identified",
    });
    const covered = observationsForSubject([first, second, contaminant], identified, [
      { from: anonymous, to: identified, lifecycle: "identified", recordedAt: CLOCK },
    ]);
    assert(
      covered
        .map((item) => item.id)
        .sort()
        .join(",") === "observation.anon,observation.identified",
      `expected subject coverage of two observations, got ${covered.map((item) => item.id).join(",")}`,
    );
    assert(!("reverseIdentityMap" in first) && !("reverseIdentityMap" in second), "receipts must not embed a reverse identity map");
  });

  harness.check("contract declarations cannot mask contradictory observation metadata or prove maturity", () => {
    const base = observation({ id: "a", metricId: "revenue", value: 10, metricDefinitionId: "recognized_revenue", metricDefinitionRevision: 1 });
    for (const override of [{ amountTreatment: "net" as const }, { cohortId: "other" }, { amountUnits: "cents" }, { costKind: "estimated" as const }]) {
      assert(compareObservations(base, { ...base, ...override }, catalog).status === "incomparable", "contradictory metadata must refuse comparison");
    }
    assert(compareObservations(base, { ...base, window: undefined }, catalog).status === "unknown", "authored maturity is not observed maturity");
    assert(
      compareObservations(base, { ...base, window: { ...base.window!, maturity: "immature" } }, catalog).status === "incomparable",
      "observed immaturity cannot be masked",
    );
  });

  harness.check("declared currency conversion transforms the value and preserves conversion provenance", () => {
    const base = observation({ id: "a", metricId: "revenue", value: 10, metricDefinitionId: "recognized_revenue", metricDefinitionRevision: 1 });
    const converted = compareObservations(
      base,
      { ...base, currency: "EUR", value: 20 },
      { ...catalog, conversions: [{ fromCurrency: "EUR", toCurrency: "USD", rate: 1.2, asOf: CLOCK }] },
    );
    assert(converted.status === "comparable" && converted.rightValue === 24 && converted.comparisonCurrency === "USD", "conversion must apply to values");
    assert(converted.conversion?.asOf === CLOCK, "conversion provenance must survive");
    const invalid = compareObservations(
      base,
      { ...base, currency: "EUR" },
      { ...catalog, conversions: [{ fromCurrency: "EUR", toCurrency: "USD", rate: 1.2, asOf: "invalid" }] },
    );
    assert(invalid.status === "incomparable", "invalid conversion dates must refuse comparison");
  });

  harness.check("replayed refunds are idempotent and distinct partial refunds remain distinct", () => {
    const purchase = { sourceEventId: "txn", kind: "purchase" as const, amount: 10, currency: "USD", amountTreatment: "gross" as const };
    const refund = { ...purchase, kind: "refund" as const, amount: 2, eventId: "refund-1" };
    const result = normalizeAmountEvents([purchase, refund, refund, { ...refund, eventId: "refund-2" }]);
    assert(result.netAmount === 6 && result.refundsApplied === 2 && result.duplicateCopiesIgnored === 1, "refund replay must not reduce revenue again");
    assert(normalizeAmountEvents([{ ...purchase, amount: NaN }]).status === "unknown", "invalid amounts cannot normalize");
  });

  harness.check("subject coverage traverses mapping chains in any order without delimiter collisions", () => {
    const a = { appId: "app", environment: "test", opaqueRef: "a" };
    const b = { ...a, opaqueRef: "b" };
    const c = { ...a, opaqueRef: "c" };
    const rows = [a, b, c, { appId: "app/test", environment: "c", opaqueRef: "" }].map((subjectRef, i) =>
      observation({ id: String(i), metricId: "x", value: 1, subjectRef }),
    );
    const covered = observationsForSubject(rows, a, [
      { from: b, to: c, lifecycle: "restored", recordedAt: CLOCK },
      { from: a, to: b, lifecycle: "identified", recordedAt: CLOCK },
    ]);
    assert(covered.length === 3, "all subject aliases must be covered regardless of mapping order");
  });

  harness.check("reference metric-contracts.json validates against the skill-shipped schema", () => {
    const document = JSON.parse(readFileSync(REFERENCE_CONTRACTS, "utf8"));
    const result = validateMetricContracts(document);
    assert(result.valid, `reference metric-contracts.json failed schema: ${JSON.stringify(result.issues)}`);
    const schemaResult = harness.checkSchema("urn:b2c:core:metric-contracts-schema", document);
    assert(schemaResult.valid, `Ajv rejected reference metric-contracts.json: ${schemaResult.errors.map((error) => error.message).join("; ")}`);
  });

  const missingRoot = harness.makeTempDir("metric-contracts-missing");
  mkdirSync(path.join(missingRoot, "operations"), { recursive: true });
  harness.runScript(
    "scenario 5: validator reports unknown when the definition file is missing",
    VALIDATOR,
    ["--root", missingRoot],
    0,
    "metric_contracts.file_missing",
  );

  const referenceRoot = path.join(skillRoot, "examples/workspace/business");
  harness.runScript("reference workspace metric-contracts file passes the isolated validator", VALIDATOR, ["--root", referenceRoot], 0);

  const invalidRoot = harness.makeTempDir("metric-contracts-invalid");
  mkdirSync(path.join(invalidRoot, "operations"), { recursive: true });
  writeFileSync(path.join(invalidRoot, "operations/metric-contracts.json"), "{}\n", "utf8");
  writeFileSync(path.join(invalidRoot, "operations/metric-contracts.schema.json"), "{}\n", "utf8");
  writeFileSync(path.join(invalidRoot, "operations/METRIC_CONTRACTS.md"), "Structured source: operations/metric-contracts.json\n", "utf8");
  harness.runScript("validator refuses a schema-invalid metric-contracts file", VALIDATOR, ["--root", invalidRoot], 1, "metric_contracts.schema_invalid");
}
