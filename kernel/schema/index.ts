import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import { validateOperatingModel } from "../operating-model/validate.js";
import { isValidNonFutureRfc3339Instant, isValidPastIsoDate, validateSignalSupersessionGraph } from "./evidence-grammar.js";
import type {
  BudgetLedgerDocument,
  BusinessStateV2,
  CheckpointDocument,
  ControlFile,
  GrantsDocument,
  RunStateDocument,
  CurrentTruthDocument,
  Waiver,
  WaiversDocument,
} from "./types.js";

const schemaDir = path.dirname(fileURLToPath(import.meta.url));

export interface SchemaIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: SchemaIssue[];
}

function isDateTime(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(new Date(value).getTime()));
}

let registry: Ajv2020 | undefined;

function getRegistry(): Ajv2020 {
  if (registry) return registry;
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  ajv.addFormat("date-time", { type: "string", validate: isDateTime });
  for (const fileName of readdirSync(schemaDir)) {
    if (!fileName.endsWith(".schema.json")) continue;
    const schema = JSON.parse(readFileSync(path.join(schemaDir, fileName), "utf8")) as AnySchema;
    ajv.addSchema(schema);
  }
  registry = ajv;
  return ajv;
}

function issuesFromErrors(errors: ErrorObject[] | null | undefined): SchemaIssue[] {
  return (errors ?? []).map((error) => ({
    severity: "error",
    code: `schema.${error.keyword}`,
    message: error.message ?? "is invalid",
    path: error.instancePath || "/",
  }));
}

function validateAgainst<T>(schemaId: string, value: unknown): ValidationResult<T> {
  const validate: ValidateFunction | undefined = getRegistry().getSchema(schemaId);
  if (!validate) throw new Error(`Unknown schema $id: ${schemaId}`);
  const valid = Boolean(validate(value));
  return valid ? { valid: true, value: value as T, issues: [] } : { valid: false, issues: issuesFromErrors(validate.errors) };
}

export function validateBusinessState(value: unknown): ValidationResult<BusinessStateV2> {
  const structural = validateAgainst<BusinessStateV2>("urn:b2c:core:business-state-schema", value);
  if (!structural.valid || !structural.value) return structural;
  if (!structural.value.operatingModel) return structural;
  const semantic = validateOperatingModel(structural.value.operatingModel);
  return semantic.length > 0 ? { valid: false, issues: semantic } : structural;
}

export function validateGrants(value: unknown): ValidationResult<GrantsDocument> {
  return validateAgainst<GrantsDocument>("urn:b2c:core:grants-schema", value);
}

export function validateWaivers(value: unknown): ValidationResult<WaiversDocument> {
  const structural = validateAgainst<WaiversDocument>("urn:b2c:core:waivers-schema", value);
  if (!structural.valid || !structural.value) return structural;
  const semanticIssues = structural.value.waivers.flatMap((waiver, index) => validateWaiverSemantics(waiver, `/waivers/${index}`));
  return semanticIssues.length > 0 ? { valid: false, issues: semanticIssues } : structural;
}

/** protectedCategory must be consistent with actionClass per KTD4: spend->spend, release->release, destructive->destructive; mutate/publish may tag any of credentials_access/legal_pricing/public_actions. */
export function validateWaiverSemantics(waiver: Waiver, pathPrefix = ""): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const directCategories: Record<string, string> = { spend: "spend", release: "release", destructive: "destructive" };
  const expected = directCategories[waiver.actionClass];
  if (expected && waiver.protectedCategory !== expected) {
    issues.push({
      severity: "error",
      code: "waiver.action_class_category_mismatch",
      message: `actionClass "${waiver.actionClass}" must carry protectedCategory "${expected}", found "${waiver.protectedCategory}"`,
      path: `${pathPrefix}/protectedCategory`,
    });
  }
  if ((waiver.actionClass === "mutate" || waiver.actionClass === "publish") && directCategories[waiver.protectedCategory]) {
    issues.push({
      severity: "error",
      code: "waiver.action_class_category_mismatch",
      message: `actionClass "${waiver.actionClass}" cannot carry protectedCategory "${waiver.protectedCategory}"; use credentials_access, legal_pricing, or public_actions`,
      path: `${pathPrefix}/protectedCategory`,
    });
  }
  return issues;
}

export function validateBudgetLedger(value: unknown): ValidationResult<BudgetLedgerDocument> {
  return validateAgainst<BudgetLedgerDocument>("urn:b2c:core:budget-ledger-schema", value);
}

export function validateControl(value: unknown): ValidationResult<ControlFile> {
  return validateAgainst<ControlFile>("urn:b2c:core:control-schema", value);
}

export function validateRunState(value: unknown): ValidationResult<RunStateDocument> {
  return validateAgainst<RunStateDocument>("urn:b2c:core:run-state-schema", value);
}

export function validateCheckpoint(value: unknown): ValidationResult<CheckpointDocument> {
  return validateAgainst<CheckpointDocument>("urn:b2c:core:checkpoint-schema", value);
}

export function validateOperationEnvelope<T>(value: unknown): ValidationResult<T> {
  return validateAgainst<T>("urn:b2c:core:operation-envelope-schema", value);
}

export function validateAppReviewState<T>(value: unknown): ValidationResult<T> {
  return validateAgainst<T>("urn:b2c:core:app-review-schema", value);
}

export function validateAppReviewWebhookEnvelope<T>(value: unknown): ValidationResult<T> {
  return validateAgainst<T>("urn:b2c:core:app-review-webhook-envelope-schema", value);
}

export function validateCurrentTruth(value: unknown): ValidationResult<CurrentTruthDocument> {
  return validateAgainst<CurrentTruthDocument>("urn:b2c:core:current-truth-schema", value);
}

// ── Evidence dialect (research-evidence, signal-corpus, offer-test) ────────
//
// These three schemas encode STRUCTURE only. Every content-quality judgment
// (vanity Primary Response detection, generic-option-menu detection, owned-
// relationship-absence detection, placeholder scanning) stays the sole
// responsibility of checks/validation/business/research/check-research-evidence.ts.
// The semantic post-checks below are numeric/cross-referential invariants
// Ajv's declarative keywords cannot express on their own — the same kind of
// layering validateWaiverSemantics already does above — never a second copy
// of a content judgment.

export interface ResearchEvidenceSourceLedgerRow {
  source: string;
  platform: string;
  identity: string;
  observedAt: string;
  backendQuery: string;
  transcriptVisual: string;
  observation: string;
  inference: string;
  confidence: "low" | "medium" | "high";
  artifactTrace: string;
}

export interface ResearchEvidenceCategoryRevenueRow {
  rank: number;
  competitor: string;
  estAnnualRevenueUsd: number;
  sourceLabel: string;
  observedAt: string;
}

export interface ResearchEvidenceDistributionProofRow {
  audienceSegment: string;
  exactDiscoveryLocation: string;
  nativeFormat: string;
  ownedRelationship: string;
  measuredSignal: string;
  evidenceIds: string;
}

export interface ResearchEvidenceTransformationDemoRow {
  screenshotPath: string;
  fifteenSecondScript: string;
  transformationShown: string;
  whyNotVitamin: string;
}

export interface ResearchEvidenceDistributionFirstNicheRow {
  payingAudience: string;
  namedChannel: string;
  purchasesAsValidation: string;
}

export interface ResearchEvidenceVerdictRow {
  date: string;
  categoryRevenueReality: string;
  wedge: string;
  demandSignal: string;
  distributionProof: string;
  offerTest: string;
  verdict: "go" | "pivot" | "kill";
  decidedBy: string;
}

export interface ResearchEvidenceDocument {
  schemaVersion: "1.0.0";
  evidenceCaptureProtocol: string;
  untrustedContentNote: string;
  sourceLedger: ResearchEvidenceSourceLedgerRow[];
  decisionInputs: string;
  decisionLog: string;
  rejectedClaims: string;
  categoryRevenue: { rows: ResearchEvidenceCategoryRevenueRow[]; statedBar: string; passFail: "pass" | "fail" };
  distributionProof: ResearchEvidenceDistributionProofRow[];
  transformationDemo: ResearchEvidenceTransformationDemoRow[];
  distributionFirstNiche: ResearchEvidenceDistributionFirstNicheRow[];
  verdict: ResearchEvidenceVerdictRow[];
}

export function validateResearchEvidence(value: unknown): ValidationResult<ResearchEvidenceDocument> {
  const structural = validateAgainst<ResearchEvidenceDocument>("urn:b2c:core:research-evidence-schema", value);
  if (!structural.valid || !structural.value) return structural;
  const doc = structural.value;
  const issues: SchemaIssue[] = [];
  doc.sourceLedger.forEach((row, index) => {
    if (!isValidNonFutureRfc3339Instant(row.observedAt)) {
      issues.push({
        severity: "error",
        code: "schema.non_future_instant",
        message: "sourceLedger observedAt must be a real, non-future RFC3339 instant.",
        path: `/sourceLedger/${index}/observedAt`,
      });
    }
  });
  doc.categoryRevenue.rows.forEach((row, index) => {
    if (!isValidNonFutureRfc3339Instant(row.observedAt)) {
      issues.push({
        severity: "error",
        code: "schema.non_future_instant",
        message: "categoryRevenue row observedAt must be a real, non-future RFC3339 instant.",
        path: `/categoryRevenue/rows/${index}/observedAt`,
      });
    }
  });
  doc.verdict.forEach((row, index) => {
    if (!isValidPastIsoDate(row.date)) {
      issues.push({
        severity: "error",
        code: "schema.non_future_date",
        message: "verdict row date must be a real, non-future ISO date.",
        path: `/verdict/${index}/date`,
      });
    }
  });
  return issues.length > 0 ? { valid: false, issues } : structural;
}

export interface SignalCorpusInputRow {
  id: string;
  sourceType: string;
  ownerOrCreator: string;
  scope: string;
  startDate: string;
  endDate?: string;
  collectionRoute: string;
  permissionOrPublicBasis: string;
  limits: string;
}

export interface SignalCorpusRecordRow {
  id: string;
  type: string;
  claim: string;
  sourceIds: string[];
  observedAt: string;
  appliesTo: string;
  confidence: "low" | "medium" | "high";
  lifecycle: "current" | "dated" | "superseded" | "rejected" | "unverified";
  supersedes: string;
  artifactOrTrace: string;
}

export interface SignalCorpusConflictRow {
  earlierSignal: string;
  laterSignal: string;
  conflict: string;
  currentPosition: string;
  reason: string;
}

export interface SignalCorpusDerivedOutputRow {
  signalIds: string[];
  output: string;
  decisionChanged: string;
  traceId: string;
}

export type SignalCorpusDocument =
  | {
      schemaVersion: "1.0.0";
      applicable: true;
      corpusInputs: SignalCorpusInputRow[];
      signalRecords: SignalCorpusRecordRow[];
      conflicts: SignalCorpusConflictRow[];
      derivedOutputs: SignalCorpusDerivedOutputRow[];
    }
  | { schemaVersion: "1.0.0"; applicable: false; reason: string };

export function validateSignalCorpus(value: unknown): ValidationResult<SignalCorpusDocument> {
  const structural = validateAgainst<SignalCorpusDocument>("urn:b2c:core:signal-corpus-schema", value);
  if (!structural.valid || !structural.value) return structural;
  const doc = structural.value;
  if (!doc.applicable) return structural;

  const issues: SchemaIssue[] = [];
  const declaredInputIds = new Set(doc.corpusInputs.map((row) => row.id));
  doc.corpusInputs.forEach((row, index) => {
    if (row.endDate && row.startDate > row.endDate) {
      issues.push({
        severity: "error",
        code: "schema.date_range_reversed",
        message: "corpusInputs startDate must not be after endDate.",
        path: `/corpusInputs/${index}`,
      });
    }
  });
  doc.signalRecords.forEach((row, index) => {
    if (!isValidPastIsoDate(row.observedAt)) {
      issues.push({
        severity: "error",
        code: "schema.non_future_date",
        message: "signalRecords observedAt must be a real, non-future ISO date.",
        path: `/signalRecords/${index}/observedAt`,
      });
    }
    // The same cross-reference validateSignalCorpus() (check-research-evidence.ts) enforces on
    // the rendered table: every declared Source ID must resolve to a Corpus Inputs row.
    for (const sourceId of row.sourceIds) {
      if (!declaredInputIds.has(sourceId)) {
        issues.push({
          severity: "error",
          code: "schema.signal_source_unresolved",
          message: `signalRecords[${index}].sourceIds cites ${sourceId}, which is not declared in corpusInputs.`,
          path: `/signalRecords/${index}/sourceIds`,
        });
      }
    }
  });

  const declaredSignalIds = new Set(doc.signalRecords.map((row) => row.id));
  const lifecycleById = new Map(doc.signalRecords.map((row) => [row.id, row.lifecycle] as const));
  const eligibleSignalIds = new Set(doc.signalRecords.filter((row) => row.lifecycle === "current" || row.lifecycle === "dated").map((row) => row.id));

  const supersession = validateSignalSupersessionGraph(
    doc.signalRecords.map((row) => ({ id: row.id, lifecycle: row.lifecycle, replacementId: row.supersedes })),
  );
  for (const invalidId of supersession.invalidSignalIds) {
    issues.push({
      severity: "error",
      code: "schema.signal_supersession_invalid",
      message: `Signal ${invalidId} has an invalid supersession chain (cyclic, missing, or not ending at a current/dated signal).`,
      path: "/signalRecords",
    });
  }

  doc.conflicts.forEach((row, index) => {
    for (const [field, id] of [
      ["earlierSignal", row.earlierSignal],
      ["laterSignal", row.laterSignal],
    ] as const) {
      if (id.toLowerCase() === "none") continue;
      if (!declaredSignalIds.has(id)) {
        issues.push({
          severity: "error",
          code: "schema.conflict_signal_unresolved",
          message: `conflicts[${index}].${field} cites ${id}, which is not declared in signalRecords.`,
          path: `/conflicts/${index}/${field}`,
        });
      }
    }
  });

  doc.derivedOutputs.forEach((row, index) => {
    for (const signalId of row.signalIds) {
      if (!eligibleSignalIds.has(signalId)) {
        issues.push({
          severity: "error",
          code: "schema.derived_output_signal_ineligible",
          message: `derivedOutputs[${index}].signalIds cites ${signalId}, which is not a current or dated signal (lifecycle: ${lifecycleById.get(signalId) ?? "undeclared"}).`,
          path: `/derivedOutputs/${index}/signalIds`,
        });
      }
    }
  });

  return issues.length > 0 ? { valid: false, issues } : structural;
}

export interface OfferTestContract {
  audience: string;
  exactDiscoveryLocation: string;
  nativeFormat: string;
  offer: string;
  ownedRelationship: string;
  primaryResponse: string;
  stopRule: string;
}

export interface OfferTestExposureRow {
  date: string;
  channel: string;
  evidenceSource: string;
  exposureType: string;
  exposure: number;
  ctaConversions: number;
  conversionRate?: string;
  cost?: string;
  result?: string;
}

export interface OfferTestObjectionRow {
  source: string;
  objectionOrBehavior: string;
  interpretation: string;
  changeMade: string;
  signalIds?: string;
}

export interface OfferTestDecisionRow {
  status: "run" | "waived";
  date: string;
  evidence: string;
  decision: string;
  decidedBy: string;
}

export interface OfferTestWaiverRow {
  date: string;
  founder: string;
  reason: string;
  residualRiskAccepted: string;
}

export interface OfferTestDocument {
  schemaVersion: "1.0.0";
  contract: OfferTestContract;
  exposureAndConversion: OfferTestExposureRow[];
  objectionsAndLearning?: OfferTestObjectionRow[];
  decision: OfferTestDecisionRow[];
  founderWaiver?: OfferTestWaiverRow[];
}

export function validateOfferTestDoc(value: unknown): ValidationResult<OfferTestDocument> {
  const structural = validateAgainst<OfferTestDocument>("urn:b2c:core:offer-test-schema", value);
  if (!structural.valid || !structural.value) return structural;
  const doc = structural.value;
  const issues: SchemaIssue[] = [];

  doc.exposureAndConversion.forEach((row, index) => {
    if (row.ctaConversions > row.exposure) {
      issues.push({
        severity: "error",
        code: "schema.conversions_exceed_exposure",
        message: `exposureAndConversion[${index}] has ${row.ctaConversions} CTA conversions but only ${row.exposure} exposure.`,
        path: `/exposureAndConversion/${index}`,
      });
    }
    if (!isValidPastIsoDate(row.date)) {
      issues.push({
        severity: "error",
        code: "schema.non_future_date",
        message: "exposureAndConversion row date must be a real, non-future ISO date.",
        path: `/exposureAndConversion/${index}/date`,
      });
    }
  });

  doc.decision.forEach((row, index) => {
    if (!isValidPastIsoDate(row.date)) {
      issues.push({
        severity: "error",
        code: "schema.non_future_date",
        message: "decision row date must be a real, non-future ISO date.",
        path: `/decision/${index}/date`,
      });
    }
  });

  // A waived final decision needs a matching Founder Waiver row (same numeric/cross-record
  // consistency shape as validateWaiverSemantics' actionClass/protectedCategory check above) —
  // structural agreement between two records, not a judgment about their wording.
  const finalDecision = doc.decision.at(-1);
  if (finalDecision?.status === "waived") {
    const waivers = doc.founderWaiver ?? [];
    const hasMatch = waivers.some(
      (waiver) => waiver.date === finalDecision.date && waiver.founder.trim().toLowerCase() === finalDecision.decidedBy.trim().toLowerCase(),
    );
    if (!hasMatch) {
      issues.push({
        severity: "error",
        code: "schema.waiver_missing_for_waived_decision",
        message: "The final decision row is waived but founderWaiver has no row whose date and founder match it.",
        path: "/founderWaiver",
      });
    }
  }

  return issues.length > 0 ? { valid: false, issues } : structural;
}

export function validateMetricContracts(value: unknown): ValidationResult<unknown> {
  return validateAgainst("urn:b2c:core:metric-contracts-schema", value);
}
