/**
 * Shared measurement join and comparison (ARCH-12 / U16).
 * Invalid or missing joins stay explicit. This module does not store observations
 * and does not invent currency, cohort, version, or identity semantics.
 */

import {
  type AmountTreatment,
  type CostKind,
  type IdentityMapping,
  type MeasurementEventKind,
  type ObservationRecord,
  type ObservationWindow,
  type ObservationWindowMaturity,
  type SubjectReference,
} from "./types.js";

export const measurementComparisonStatuses = ["comparable", "incomparable", "unknown", "unmapped"] as const;
export type MeasurementComparisonStatus = (typeof measurementComparisonStatuses)[number];

export const identityMapStatuses = ["mapped", "refused"] as const;
export type IdentityMapStatus = (typeof identityMapStatuses)[number];

export interface MetricContractDefinition {
  id: string;
  revision: number;
  name: string;
  objectiveId: string;
  eventSchemaVersion: string;
  numerator: string;
  denominator?: string;
  units: string;
  currency?: string;
  amountUnits?: string;
  amountTreatment?: AmountTreatment;
  refundTreatment?: string;
  costKind?: CostKind;
  cohortId?: string;
  window?: ObservationWindow;
  exclusions?: string[];
}

export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf: string;
}

export interface ExperimentContract {
  id: string;
  revision: number;
  hypothesis: string;
  treatment: string;
  assignmentUnit: string;
  assignmentOwner: string;
  eligibility: string;
  exposureRule: string;
  decisionHorizon: string;
  primaryMetricDefinitionId: string;
  primaryMetricDefinitionRevision: number;
  guardrails: string[];
  stoppingPolicy: string;
  requiredObservationWindow?: string;
  eligiblePopulation?: string;
  exposedPopulation?: string;
  minimumUsableSample?: number;
  allowedMissingJoinCoverage?: string;
}

export interface MeasurementCatalog {
  missing?: boolean;
  definitions: readonly MetricContractDefinition[];
  conversions?: readonly CurrencyConversion[];
}

export interface MeasurementComparison {
  status: MeasurementComparisonStatus;
  reasonCodes: string[];
  reason: string;
  leftValue?: unknown;
  rightValue?: unknown;
  comparisonCurrency?: string;
  conversion?: CurrencyConversion;
}

export interface IdentityMapResult {
  status: IdentityMapStatus;
  reasonCodes: string[];
  reason: string;
  subjectRef?: SubjectReference;
}

export interface AmountEvent {
  sourceEventId: string;
  kind: MeasurementEventKind;
  amount: number;
  /** Provider event identity, separate from the transaction being adjusted. */
  eventId?: string;
  currency: string;
  amountTreatment: AmountTreatment;
}

export interface NormalizedAmountResult {
  status: "normalized" | "incomparable" | "unknown";
  reasonCodes: string[];
  reason: string;
  netAmount?: number;
  currency?: string;
  amountTreatment?: AmountTreatment;
  duplicateCopiesIgnored: number;
  refundsApplied: number;
}

interface EffectiveSemantics {
  definitionId: string;
  revision: number;
  currency?: string;
  units: string;
  amountTreatment?: AmountTreatment;
  cohortId?: string;
  windowMaturity?: ObservationWindowMaturity;
  window?: ObservationWindow;
  amountUnits?: string;
  costKind?: CostKind;
}

type ResolvedSemantics =
  | { status: "mapped"; semantics: EffectiveSemantics }
  | { status: "incomparable"; reasonCodes: string[]; reason: string }
  | { status: "unknown"; reasonCodes: string[]; reason: string }
  | { status: "unmapped"; reasonCodes: string[]; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function subjectReferenceKey(subject: SubjectReference): string {
  return JSON.stringify([subject.appId, subject.environment, subject.opaqueRef]);
}

export function sameSubjectReference(left: SubjectReference, right: SubjectReference): boolean {
  return subjectReferenceKey(left) === subjectReferenceKey(right);
}

export function catalogFromDocument(value: unknown): MeasurementCatalog {
  if (!isRecord(value)) return { missing: true, definitions: [] };
  const definitions = Array.isArray(value.definitions)
    ? value.definitions.flatMap((entry) => {
        const parsed = parseDefinition(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  const conversions = Array.isArray(value.conversions)
    ? value.conversions.flatMap((entry) => {
        const parsed = parseConversion(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  return { definitions, conversions };
}

function parseDefinition(value: unknown): MetricContractDefinition | undefined {
  if (!isRecord(value)) return undefined;
  const id = asNonEmptyString(value.id);
  const name = asNonEmptyString(value.name);
  const objective = isRecord(value.objective) ? asNonEmptyString(value.objective.id) : asNonEmptyString(value.objectiveId);
  const eventSchemaVersion = asNonEmptyString(value.eventSchemaVersion);
  const numerator = asNonEmptyString(value.numerator);
  const units = asNonEmptyString(value.units);
  const revision = value.revision;
  if (!id || !name || !objective || !eventSchemaVersion || !numerator || !units) return undefined;
  if (!Number.isInteger(revision) || Number(revision) < 1) return undefined;
  const window = parseWindow(value.window);
  const amountTreatment = value.amountTreatment === "gross" || value.amountTreatment === "net" ? value.amountTreatment : undefined;
  const costKind = value.costKind === "actual" || value.costKind === "estimated" ? value.costKind : undefined;
  return {
    id,
    revision: Number(revision),
    name,
    objectiveId: objective,
    eventSchemaVersion,
    numerator,
    denominator: asNonEmptyString(value.denominator),
    units,
    currency: asNonEmptyString(value.currency),
    amountUnits: asNonEmptyString(value.amountUnits),
    amountTreatment,
    refundTreatment: asNonEmptyString(value.refundTreatment),
    costKind,
    cohortId: asNonEmptyString(value.cohortId),
    window,
    exclusions: Array.isArray(value.exclusions) ? value.exclusions.filter((item): item is string => typeof item === "string") : undefined,
  };
}

function parseConversion(value: unknown): CurrencyConversion | undefined {
  if (!isRecord(value)) return undefined;
  const fromCurrency = asNonEmptyString(value.fromCurrency);
  const toCurrency = asNonEmptyString(value.toCurrency);
  const asOf = asNonEmptyString(value.asOf);
  const rate = value.rate;
  if (!fromCurrency || !toCurrency || !asOf || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return undefined;
  }
  return { fromCurrency, toCurrency, rate, asOf };
}

function parseWindow(value: unknown): ObservationWindow | undefined {
  if (!isRecord(value)) return undefined;
  const start = asNonEmptyString(value.start);
  const end = asNonEmptyString(value.end);
  const timezone = asNonEmptyString(value.timezone);
  if (!start || !end || !timezone) return undefined;
  const maturity = value.maturity === "immature" || value.maturity === "mature" ? value.maturity : undefined;
  return { start, end, timezone, maturity };
}

function resolveSemantics(observation: ObservationRecord, catalog: MeasurementCatalog): ResolvedSemantics {
  if (catalog.missing) {
    return {
      status: "unknown",
      reasonCodes: ["missing_definition_file"],
      reason: "Metric definition file is missing; the observation stays unknown.",
    };
  }
  const definitionId = asNonEmptyString(observation.metricDefinitionId);
  const revision = observation.metricDefinitionRevision;
  if (!definitionId || !Number.isInteger(revision) || Number(revision) < 1) {
    return {
      status: "unmapped",
      reasonCodes: ["untyped_observation"],
      reason: "Observation has no metric-definition id and revision; it stays unmapped.",
    };
  }
  const matches = catalog.definitions.filter((entry) => entry.id === definitionId && entry.revision === revision);
  if (matches.length > 1) return { status: "unknown", reasonCodes: ["ambiguous_definition"], reason: "Metric definition identity must resolve uniquely." };
  const definition = matches[0];
  if (!definition) {
    return {
      status: "unknown",
      reasonCodes: ["definition_unmapped"],
      reason: `No metric contract matches ${definitionId}@${revision}.`,
    };
  }
  const conflicts: string[] = [];
  for (const key of ["amountTreatment", "amountUnits", "costKind", "cohortId"] as const) {
    if (definition[key] !== undefined && observation[key] !== undefined && definition[key] !== observation[key]) {
      conflicts.push(`${key}_contract_mismatch`);
    }
  }
  if (
    definition.currency &&
    observation.currency &&
    definition.currency !== observation.currency &&
    !findConversion(observation.currency, definition.currency, catalog.conversions ?? [])
  )
    conflicts.push("currency_contract_mismatch");
  if (conflicts.length)
    return { status: "incomparable", reasonCodes: ["refused", ...conflicts], reason: "Observation metadata contradicts its metric contract." };
  return {
    status: "mapped",
    semantics: {
      definitionId: definition.id,
      revision: definition.revision,
      currency: observation.currency ?? definition.currency,
      units: definition.units,
      amountTreatment: definition.amountTreatment ?? observation.amountTreatment,
      cohortId: definition.cohortId ?? observation.cohortId,
      windowMaturity: observation.window?.maturity,
      window: observation.window ?? definition.window,
      amountUnits: observation.amountUnits ?? definition.amountUnits,
      costKind: observation.costKind ?? definition.costKind,
    },
  };
}

function findConversion(from: string, to: string, conversions: readonly CurrencyConversion[]): CurrencyConversion | undefined {
  const matches = conversions.filter(
    (entry) =>
      entry.fromCurrency === from && entry.toCurrency === to && Number.isFinite(entry.rate) && entry.rate > 0 && Number.isFinite(Date.parse(entry.asOf)),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function compareObservations(left: ObservationRecord, right: ObservationRecord, catalog: MeasurementCatalog): MeasurementComparison {
  const leftResolved = resolveSemantics(left, catalog);
  const rightResolved = resolveSemantics(right, catalog);
  if (leftResolved.status === "unknown") {
    return { status: "unknown", reasonCodes: leftResolved.reasonCodes, reason: leftResolved.reason };
  }
  if (rightResolved.status === "unknown") {
    return { status: "unknown", reasonCodes: rightResolved.reasonCodes, reason: rightResolved.reason };
  }
  if (leftResolved.status === "unmapped") {
    return { status: "unmapped", reasonCodes: leftResolved.reasonCodes, reason: leftResolved.reason };
  }
  if (rightResolved.status === "unmapped") {
    return { status: "unmapped", reasonCodes: rightResolved.reasonCodes, reason: rightResolved.reason };
  }

  for (const resolved of [leftResolved, rightResolved]) {
    if (resolved.status === "incomparable") return { status: resolved.status, reasonCodes: resolved.reasonCodes, reason: resolved.reason };
  }
  if (leftResolved.status !== "mapped" || rightResolved.status !== "mapped") throw new Error("Unresolved measurement semantics");
  const reasonCodes: string[] = [];
  const leftSemantics = leftResolved.semantics;
  const rightSemantics = rightResolved.semantics;
  if (leftSemantics.definitionId !== rightSemantics.definitionId || leftSemantics.revision !== rightSemantics.revision) {
    reasonCodes.push("metric_version_mismatch");
  }
  if ((leftSemantics.currency ?? "") !== (rightSemantics.currency ?? "")) {
    const leftCurrency = leftSemantics.currency;
    const rightCurrency = rightSemantics.currency;
    if (!leftCurrency || !rightCurrency || !findConversion(rightCurrency, leftCurrency, catalog.conversions ?? [])) {
      reasonCodes.push("currency_mismatch");
    }
  }
  if ((leftSemantics.amountTreatment ?? "") !== (rightSemantics.amountTreatment ?? "")) {
    reasonCodes.push("amount_treatment_mismatch");
  }
  if (leftSemantics.units !== rightSemantics.units) {
    reasonCodes.push("units_mismatch");
  }
  if ((leftSemantics.cohortId ?? "") !== (rightSemantics.cohortId ?? "")) {
    reasonCodes.push("cohort_mismatch");
  }
  if (leftSemantics.amountUnits !== rightSemantics.amountUnits) reasonCodes.push("amount_units_mismatch");
  if (leftSemantics.costKind !== rightSemantics.costKind) reasonCodes.push("cost_kind_mismatch");
  if (left.experimentId !== right.experimentId || left.experimentRevision !== right.experimentRevision) reasonCodes.push("experiment_mismatch");
  if (left.participationKind !== right.participationKind) reasonCodes.push("participation_mismatch");
  if (left.subjectRef && right.subjectRef && (left.subjectRef.appId !== right.subjectRef.appId || left.subjectRef.environment !== right.subjectRef.environment))
    reasonCodes.push("identity_boundary_mismatch");
  if (
    JSON.stringify(leftSemantics.window && [leftSemantics.window.start, leftSemantics.window.end, leftSemantics.window.timezone]) !==
    JSON.stringify(rightSemantics.window && [rightSemantics.window.start, rightSemantics.window.end, rightSemantics.window.timezone])
  )
    reasonCodes.push("window_mismatch");
  if (leftSemantics.windowMaturity === "immature" || rightSemantics.windowMaturity === "immature") {
    reasonCodes.push("immature_window");
  }

  if (reasonCodes.length > 0) {
    return {
      status: "incomparable",
      reasonCodes: ["refused", ...reasonCodes],
      reason: "Observations are incomparable; comparison is refused rather than computed.",
    };
  }

  if (!leftSemantics.windowMaturity || !rightSemantics.windowMaturity) {
    return { status: "unknown", reasonCodes: ["window_maturity_unknown"], reason: "Observed window maturity is required; a definition cannot prove it." };
  }
  const conversion =
    leftSemantics.currency && rightSemantics.currency && leftSemantics.currency !== rightSemantics.currency
      ? findConversion(rightSemantics.currency, leftSemantics.currency, catalog.conversions ?? [])
      : undefined;
  if (conversion && (typeof right.value !== "number" || !Number.isFinite(right.value) || !Number.isFinite(right.value * conversion.rate))) {
    return { status: "incomparable", reasonCodes: ["refused", "conversion_value_invalid"], reason: "Currency conversion requires a finite numeric amount." };
  }
  return {
    status: "comparable",
    reasonCodes: [],
    reason: "Observations share a mapped metric contract and comparable semantics.",
    leftValue: left.value,
    rightValue: conversion ? (right.value as number) * conversion.rate : right.value,
    comparisonCurrency: leftSemantics.currency,
    conversion,
  };
}

export function mapIdentity(mapping: IdentityMapping): IdentityMapResult {
  const fromApp = mapping.from.appId.trim();
  const toApp = mapping.to.appId.trim();
  const fromEnv = mapping.from.environment.trim();
  const toEnv = mapping.to.environment.trim();
  const fromRef = mapping.from.opaqueRef.trim();
  const toRef = mapping.to.opaqueRef.trim();
  if (!fromApp || !toApp || fromApp !== toApp) {
    return {
      status: "refused",
      reasonCodes: ["cross_app"],
      reason: "Identity mapping cannot cross app identities.",
    };
  }
  if (!fromEnv || !toEnv || fromEnv !== toEnv) {
    return {
      status: "refused",
      reasonCodes: ["cross_environment"],
      reason: "Identity mapping cannot cross environments.",
    };
  }
  if (!fromRef || !toRef) {
    return {
      status: "refused",
      reasonCodes: ["missing_subject_ref"],
      reason: "Identity mapping needs opaque subject references on both sides.",
    };
  }
  if (mapping.lifecycle === "deleted") {
    return {
      status: "refused",
      reasonCodes: ["deleted_identity"],
      reason: "A deleted identity is not a join source.",
    };
  }
  return {
    status: "mapped",
    reasonCodes: [],
    reason: "Identity maps inside one app and environment.",
    subjectRef: mapping.to,
  };
}

export function countsAsExposure(observation: ObservationRecord): boolean {
  return observation.participationKind === "exposure";
}

export function normalizeAmountEvents(events: readonly AmountEvent[]): NormalizedAmountResult {
  if (events.length === 0) {
    return {
      status: "unknown",
      reasonCodes: ["no_events"],
      reason: "No amount events were supplied.",
      duplicateCopiesIgnored: 0,
      refundsApplied: 0,
    };
  }

  if (events.some((event) => !event.sourceEventId.trim() || !Number.isFinite(event.amount) || event.amount < 0 || !/^[A-Z]{3}$/.test(event.currency))) {
    return {
      status: "unknown",
      reasonCodes: ["invalid_amount_event"],
      reason: "Amount events require valid identities, currency and finite nonnegative amounts.",
      duplicateCopiesIgnored: 0,
      refundsApplied: 0,
    };
  }
  const currencies = new Set(events.map((event) => event.currency));
  const treatments = new Set(events.map((event) => event.amountTreatment));
  if (currencies.size !== 1 || treatments.size !== 1) {
    return {
      status: "incomparable",
      reasonCodes: ["refused", ...(currencies.size !== 1 ? ["currency_mismatch"] : []), ...(treatments.size !== 1 ? ["amount_treatment_mismatch"] : [])],
      reason: "Amount events do not share currency and gross/net treatment.",
      duplicateCopiesIgnored: 0,
      refundsApplied: 0,
    };
  }

  const bySource = new Map<string, AmountEvent[]>();
  for (const event of events) {
    const current = bySource.get(event.sourceEventId) ?? [];
    current.push(event);
    bySource.set(event.sourceEventId, current);
  }

  let netAmount = 0;
  let duplicateCopiesIgnored = 0;
  let refundsApplied = 0;
  for (const group of bySource.values()) {
    const purchases = group.filter((event) => event.kind === "purchase");
    const refunds = group.filter((event) => event.kind === "refund");
    const corrections = group.filter((event) => event.kind === "correction");
    const duplicates = group.filter((event) => event.kind === "duplicate");
    if (purchases.length > 1) duplicateCopiesIgnored += purchases.length - 1;
    duplicateCopiesIgnored += duplicates.length;
    const base = corrections.at(-1)?.amount ?? purchases[0]?.amount ?? 0;
    const uniqueRefunds = new Map<string, AmountEvent>();
    for (const refund of refunds) {
      const eventKey = refund.eventId ?? `${refund.sourceEventId}:refund`;
      const previous = uniqueRefunds.get(eventKey);
      if (previous && previous.amount !== refund.amount)
        return {
          status: "incomparable",
          reasonCodes: ["refused", "conflicting_refund"],
          reason: "One refund event identity carries conflicting amounts.",
          duplicateCopiesIgnored,
          refundsApplied,
        };
      if (previous) duplicateCopiesIgnored += 1;
      uniqueRefunds.set(eventKey, refund);
    }
    if (purchases.some((purchase) => purchase.amount !== purchases[0]?.amount) || corrections.length > 1) {
      return {
        status: "incomparable",
        reasonCodes: ["refused", "conflicting_source_event"],
        reason: "Conflicting purchases or unordered corrections cannot be normalized.",
        duplicateCopiesIgnored,
        refundsApplied,
      };
    }
    const refundTotal = [...uniqueRefunds.values()].reduce((sum, event) => sum + event.amount, 0);
    refundsApplied += uniqueRefunds.size;
    netAmount += base - refundTotal;
  }

  const currency = events[0]?.currency;
  const amountTreatment = events[0]?.amountTreatment;
  return {
    status: "normalized",
    reasonCodes: [],
    reason: "Duplicate purchases collapse; refunds revise the net amount.",
    netAmount,
    currency,
    amountTreatment,
    duplicateCopiesIgnored,
    refundsApplied,
  };
}

export function observationsForSubject(
  observations: readonly ObservationRecord[],
  subject: SubjectReference,
  sessionMappings: readonly IdentityMapping[] = [],
): ObservationRecord[] {
  const aliases = new Set<string>([subjectReferenceKey(subject)]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const mapping of sessionMappings) {
      if (mapIdentity(mapping).status !== "mapped") continue;
      const from = subjectReferenceKey(mapping.from);
      const to = subjectReferenceKey(mapping.to);
      if (aliases.has(from) || aliases.has(to)) {
        const previousSize = aliases.size;
        aliases.add(from);
        aliases.add(to);
        expanded ||= aliases.size !== previousSize;
      }
    }
  }

  return observations.filter((observation) => {
    if (!observation.subjectRef) return false;
    return aliases.has(subjectReferenceKey(observation.subjectRef));
  });
}
