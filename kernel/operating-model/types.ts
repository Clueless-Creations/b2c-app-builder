import type { EvidenceErasureTombstone } from "./erasure-metadata.js";
/**
 * Reducer-owned operating records (KTD5). Observations are immutable snapshots.
 * Derived belief, staleness, and confidence live in projections, not in-place edits.
 */

export const operatingRecordKinds = [
  "objective",
  "metric",
  "observation",
  "evidence",
  "gap",
  "diagnosis",
  "option",
  "decision",
  "expectation",
  "hypothesis",
  "outcome",
  "learning",
] as const;

export type OperatingRecordKind = (typeof operatingRecordKinds)[number];

export const epistemicStates = ["known", "inferred", "disputed", "absent", "stale"] as const;
export type EpistemicState = (typeof epistemicStates)[number];

export const valueLoops = ["creation", "delivery", "capture", "reinvestment"] as const;
export type ValueLoop = (typeof valueLoops)[number];

export const operatingEventTypes = ["record_appended", "observation_accepted", "observation_rejected", "source_revised", "evidence_requested"] as const;
export type OperatingEventType = (typeof operatingEventTypes)[number];

export interface ConfidenceLimits {
  lower: number;
  upper: number;
}

export interface SourceCoordinates {
  uri: string;
  revision: string;
  sectionId?: string;
}

interface OperatingRecordCommon {
  id: string;
  revision: number;
  recordedAt: string;
  producer: string;
  epistemic: EpistemicState;
  supersedes?: string;
}

export type ObjectiveStatus = "proposed" | "active" | "satisfied" | "retired" | "superseded";
export type MetricStatus = "draft" | "active" | "deprecated";
export type ObservationStatus = "recorded" | "accepted" | "rejected";

export const identityLifecycles = ["anonymous", "identified", "restored", "deleted"] as const;
export type IdentityLifecycle = (typeof identityLifecycles)[number];

export const participationKinds = ["assignment", "exposure"] as const;
export type ParticipationKind = (typeof participationKinds)[number];

export const amountTreatments = ["gross", "net"] as const;
export type AmountTreatment = (typeof amountTreatments)[number];

export const costKinds = ["actual", "estimated"] as const;
export type CostKind = (typeof costKinds)[number];

export const measurementEventKinds = ["purchase", "refund", "duplicate", "correction"] as const;
export type MeasurementEventKind = (typeof measurementEventKinds)[number];

export const observationWindowMaturities = ["immature", "mature"] as const;
export type ObservationWindowMaturity = (typeof observationWindowMaturities)[number];

/**
 * Opaque subject pointer stored on observations (ARCH-12).
 * Resolvable identity mappings stay in the app/provider boundary, not on this record.
 */
export interface SubjectReference {
  opaqueRef: string;
  appId: string;
  environment: string;
}

/**
 * Session-scoped identity mapping. Do not persist this on long-lived receipts.
 */
export interface IdentityMapping {
  from: SubjectReference;
  to: SubjectReference;
  lifecycle: IdentityLifecycle;
  recordedAt: string;
}

export interface MetricDefinitionRef {
  definitionId: string;
  revision: number;
}

export interface ObservationWindow {
  start: string;
  end: string;
  timezone: string;
  maturity?: ObservationWindowMaturity;
}

export type GapStatus = "open" | "gathering" | "diagnosed" | "inconclusive" | "superseded";
export type OptionStatus = "discovered" | "eligible" | "ineligible" | "evaluated" | "selected" | "rejected" | "deferred";
export type DecisionStatus = "proposed" | "authorized" | "active" | "completed" | "revoked" | "superseded";
export type ExpectationStatus = "pending" | "observing" | "met" | "missed" | "ambiguous" | "cancelled";
export type HypothesisStatus = "tentative" | "supported" | "weakened" | "falsified" | "superseded";
export type LearningStatus = "proposed" | "accepted" | "rejected" | "superseded";
export type EvidenceRequestStatus = "open" | "gathering" | "fulfilled" | "cancelled";

export interface ObjectiveRecord extends OperatingRecordCommon {
  kind: "objective";
  status: ObjectiveStatus;
  title: string;
  valueLoop: ValueLoop;
}

export interface MetricRecord extends OperatingRecordCommon {
  kind: "metric";
  status: MetricStatus;
  objectiveId: string;
  name: string;
  metricDefinitionId?: string;
  metricDefinitionRevision?: number;
  currency?: string;
  amountUnits?: string;
  amountTreatment?: AmountTreatment;
  costKind?: CostKind;
  cohortId?: string;
  window?: ObservationWindow;
}

export interface ObservationRecord extends OperatingRecordCommon {
  kind: "observation";
  status: "recorded";
  metricId: string;
  observedAt: string;
  source: SourceCoordinates;
  independenceGroup: string;
  confidence: ConfidenceLimits;
  value: unknown;
  subjectRef?: SubjectReference;
  identityLifecycle?: IdentityLifecycle;
  participationKind?: ParticipationKind;
  metricDefinitionId?: string;
  metricDefinitionRevision?: number;
  currency?: string;
  amountUnits?: string;
  amountTreatment?: AmountTreatment;
  costKind?: CostKind;
  cohortId?: string;
  window?: ObservationWindow;
  experimentId?: string;
  experimentRevision?: number;
  eventKind?: MeasurementEventKind;
  sourceEventId?: string;
}

export interface EvidenceRecord extends OperatingRecordCommon {
  kind: "evidence";
  status: "recorded";
  observationIds: string[];
  source: SourceCoordinates;
  observedAt: string;
  independenceGroup: string;
  confidence: ConfidenceLimits;
  supportsBelief: boolean;
}

export interface GapRecord extends OperatingRecordCommon {
  kind: "gap";
  status: GapStatus;
  objectiveId: string;
  metricId: string;
  observationId?: string;
  missingEvidenceRequestId?: string;
}

export interface DiagnosisRecord extends OperatingRecordCommon {
  kind: "diagnosis";
  status: "recorded";
  gapId: string;
  evidenceIds: string[];
  sourceRevision: string;
}

export interface OptionRecord extends OperatingRecordCommon {
  kind: "option";
  status: OptionStatus;
  diagnosisId: string;
  evidenceIds: string[];
  sourceRevision: string;
}

export interface DecisionRecord extends OperatingRecordCommon {
  kind: "decision";
  status: DecisionStatus;
  optionId: string;
  evidenceIds: string[];
  dissent?: string;
  authorization?: string;
}

export interface ExpectationRecord extends OperatingRecordCommon {
  kind: "expectation";
  status: ExpectationStatus;
  decisionId: string;
  horizonAt: string;
}

export interface HypothesisRecord extends OperatingRecordCommon {
  kind: "hypothesis";
  status: HypothesisStatus;
  decisionId: string;
}

export interface OutcomeRecord extends OperatingRecordCommon {
  kind: "outcome";
  status: "recorded";
  expectationId: string;
  observationIds: string[];
  causalStatus: "unknown" | "supported" | "unsupported";
}

export interface LearningRecord extends OperatingRecordCommon {
  kind: "learning";
  status: LearningStatus;
  outcomeId: string;
}

export type OperatingRecord =
  | ObjectiveRecord
  | MetricRecord
  | ObservationRecord
  | EvidenceRecord
  | GapRecord
  | DiagnosisRecord
  | OptionRecord
  | DecisionRecord
  | ExpectationRecord
  | HypothesisRecord
  | OutcomeRecord
  | LearningRecord;

export interface EvidenceRequest {
  id: string;
  status: EvidenceRequestStatus;
  needed: string;
  recordedAt: string;
  gapId?: string;
}

export interface OperatingEvent {
  id: string;
  type: OperatingEventType;
  recordedAt: string;
  producer: string;
  payload: Record<string, unknown>;
}

export interface OperatingModel {
  erasures?: EvidenceErasureTombstone[];
  schemaVersion: "1.0.0";
  records: OperatingRecord[];
  events: OperatingEvent[];
  evidenceRequests: EvidenceRequest[];
}

export interface BeliefSupport {
  independentGroupCount: number;
  duplicateCopiesIgnored: number;
}

export interface OperatingProjection {
  clock: string;
  currentById: Record<string, OperatingRecord>;
  observationStatuses: Record<string, ObservationStatus>;
  staleIds: string[];
  beliefSupport: Record<string, BeliefSupport>;
  evidenceRequests: EvidenceRequest[];
}

export interface ReplayClock {
  now: string;
}

export function emptyOperatingModel(): OperatingModel {
  return {
    schemaVersion: "1.0.0",
    records: [],
    events: [],
    evidenceRequests: [],
  };
}

export function isOperatingRecordKind(value: string): value is OperatingRecordKind {
  return (operatingRecordKinds as readonly string[]).includes(value);
}

export function isOperatingEventType(value: string): value is OperatingEventType {
  return (operatingEventTypes as readonly string[]).includes(value);
}
