import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const COMPLETE_BUSINESS_RELATIVE_PATH = "checks/verification/scenarios/complete-business.md";
export const DESIGN_ACCEPTANCE_RELATIVE_PATH = "design/proofs/design-acceptance.json";

export const REQUIRED_CRITERION_IDS = [
  "cb.craft.coherence",
  "cb.craft.originality",
  "cb.craft.execution",
  "cb.craft.functionality",
  "cb.craft.accessibility",
  "cb.craft.motion",
  "cb.craft.cross-surface",
  "cb.loop.core-journey",
  "cb.loop.activation-return",
  "cb.state.empty",
  "cb.state.error",
  "cb.state.offline",
  "cb.access.screen-reader",
  "cb.perf.responsiveness",
  "cb.data.integrity",
  "cb.acquire.funnel",
  "cb.acquire.attribution",
  "cb.money.purchase-restore",
  "cb.money.entitlement-access",
  "cb.retain.return-use",
  "cb.support.incident-recovery",
  "cb.ops.artifact-invalidation",
  "cb.ops.improvement-cycle",
] as const;

export const REQUIRED_SCENARIO_IDS = [
  "cb.scenario.funnel-activation-return",
  "cb.scenario.purchase-restore",
  "cb.scenario.support-recovery-contract",
  "cb.scenario.operating-cycle-invalidation",
] as const;

export const PURCHASE_RESTORE_SCENARIO_ID = "cb.scenario.purchase-restore";

export const GRADING_BLOCKER_UNITS = ["U7", "U14", "U15", "U16", "U22"] as const;

export const ALLOWED_VERDICTS = ["ungraded", "pass", "fail", "not-applicable"] as const;

export type CriterionVerdict = (typeof ALLOWED_VERDICTS)[number];

export interface NamedReviewer {
  name: string;
  sessionId: string;
}

export interface CategoryReference {
  id: string;
  kind: "catalog" | "workspace-rubric" | "workspace-reference";
  path: string;
  observation: string;
}

export interface CompleteBusinessCriterion {
  id: string;
  family: string;
  condition: string;
  evidence: string;
  categoryReferenceIds: string[];
  verdict: CriterionVerdict;
  reviewer?: NamedReviewer;
  notApplicableReason?: string;
}

export interface CompleteBusinessScenario {
  id: string;
  title: string;
  criterionIds: string[];
  applicability: CriterionVerdict;
  reviewer?: NamedReviewer;
  notApplicableReason?: string;
  blockedBy?: string[];
  escalation?: string;
}

export interface DesignatedWorkspace {
  id: string;
  path: string;
  monetizationInScope: boolean;
}

export interface DesignAcceptanceGate {
  path: string;
  status: "missing" | "incomplete" | "ungraded" | "pass" | "fail";
  currentError: string;
  mayCiteAsPassing: boolean;
}

export interface VerdictSchema {
  allowedVerdicts: string[];
  passRequiresNamedReviewer: boolean;
  failRequiresNamedReviewer: boolean;
  notApplicableRequiresReason: boolean;
  ungradedForbidsCompletionClaim: boolean;
}

export interface CompleteBusinessDocument {
  schemaVersion: number;
  id: string;
  frozenAt: string;
  status: string;
  gradingStatus: string;
  designatedWorkspace: DesignatedWorkspace | null;
  designAcceptanceGate: DesignAcceptanceGate;
  requiredDependencyUnits: string[];
  verdictSchema: VerdictSchema;
  categoryReferences: CategoryReference[];
  criteria: CompleteBusinessCriterion[];
  scenarios: CompleteBusinessScenario[];
}

export interface AuthoringIssue {
  code: string;
  message: string;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const CRITERION_ID = /^cb\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const MONETIZATION_SCOPE_REASON = /purchase|subscription|monetiz|non-monetized|payment provider|out of (accepted )?scope/i;

export class CompleteBusinessParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function shippedCompleteBusinessPath(skillRoot: string): string {
  return path.join(skillRoot, COMPLETE_BUSINESS_RELATIVE_PATH);
}

export function parseCompleteBusinessMarkdown(markdown: string): CompleteBusinessDocument {
  const match = FRONTMATTER.exec(markdown);
  if (!match) {
    throw new CompleteBusinessParseError("complete_business.frontmatter_missing", "complete-business.md must start with a YAML frontmatter block.");
  }
  const parsed: unknown = parseYaml(match[1] ?? "");
  if (!isRecord(parsed)) {
    throw new CompleteBusinessParseError("complete_business.frontmatter_invalid", "complete-business.md frontmatter must be a YAML mapping.");
  }
  return asDocument(parsed);
}

export function loadShippedCompleteBusinessDocument(skillRoot: string): CompleteBusinessDocument {
  return parseCompleteBusinessMarkdown(readFileSync(shippedCompleteBusinessPath(skillRoot), "utf8"));
}

export function listCatalogReferenceIds(skillRoot: string): Set<string> {
  const ids = new Set<string>();
  const root = path.join(skillRoot, "catalog/knowledge");
  walkYaml(root, (filePath, text) => {
    const match = /^id:\s+(\S+)\s*$/m.exec(text);
    if (match?.[1]) ids.add(match[1]);
  });
  return ids;
}

export function validateCompleteBusinessAuthoring(
  document: CompleteBusinessDocument,
  options: { catalogReferenceIds: ReadonlySet<string>; allowPassVerdicts: boolean },
): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  if (document.schemaVersion !== 1) {
    issues.push(issue("complete_business.schema_version", "schemaVersion must be 1."));
  }
  if (document.id !== "scenario.complete-business.1") {
    issues.push(issue("complete_business.id", "Document id must stay scenario.complete-business.1."));
  }
  if (!ISO_DATE.test(document.frozenAt) || Number.isNaN(new Date(document.frozenAt).getTime())) {
    issues.push(issue("complete_business.frozen_at", "frozenAt must be a valid ISO date-time."));
  }
  if (document.status !== "criteria-frozen") {
    issues.push(issue("complete_business.status", "status must be criteria-frozen before any grading run."));
  }
  if (document.gradingStatus !== "ungraded") {
    issues.push(
      issue("complete_business.grading_status", "Authoring artifact gradingStatus must stay ungraded. A pass/fail report is a later workspace file."),
    );
  }
  validateVerdictSchema(document.verdictSchema, issues);
  validateDependencies(document.requiredDependencyUnits, issues);
  validateDesignatedWorkspace(document.designatedWorkspace, issues);
  validateDesignAcceptanceGate(document.designAcceptanceGate, issues);
  const referenceIds = validateCategoryReferences(document.categoryReferences, options.catalogReferenceIds, issues);
  validateCriteria(document.criteria, referenceIds, options.allowPassVerdicts, issues);
  validateScenarios(document, options.allowPassVerdicts, issues);
  return issues;
}

function validateVerdictSchema(schema: VerdictSchema, issues: AuthoringIssue[]): void {
  for (const verdict of ALLOWED_VERDICTS) {
    if (!schema.allowedVerdicts.includes(verdict)) {
      issues.push(issue("complete_business.verdict_schema", `verdictSchema must allow ${verdict}.`));
    }
  }
  if (!schema.passRequiresNamedReviewer || !schema.failRequiresNamedReviewer) {
    issues.push(issue("complete_business.verdict_schema", "pass and fail must require a named reviewer."));
  }
  if (!schema.notApplicableRequiresReason) {
    issues.push(issue("complete_business.verdict_schema", "not-applicable must require a reason."));
  }
  if (!schema.ungradedForbidsCompletionClaim) {
    issues.push(issue("complete_business.verdict_schema", "ungraded must forbid a completion claim."));
  }
}

function validateDependencies(units: string[], issues: AuthoringIssue[]): void {
  for (const unit of GRADING_BLOCKER_UNITS) {
    if (!units.includes(unit)) {
      issues.push(issue("complete_business.dependencies", `requiredDependencyUnits must name ${unit}.`));
    }
  }
}

function validateDesignatedWorkspace(workspace: DesignatedWorkspace | null, issues: AuthoringIssue[]): void {
  if (workspace === null) return;
  if (!workspace.id.trim() || !workspace.path.trim()) issues.push(issue("complete_business.workspace.binding", "A selected workspace needs an ID and root."));
}

function validateDesignAcceptanceGate(gate: DesignAcceptanceGate, issues: AuthoringIssue[]): void {
  if (gate.path !== DESIGN_ACCEPTANCE_RELATIVE_PATH)
    issues.push(issue("complete_business.design_acceptance.path", "Design evidence must be relative to the selected workspace."));
  if (gate.status === "pass" || gate.mayCiteAsPassing)
    issues.push(issue("complete_business.design_acceptance.cited_as_pass", "Authoring must not cite design acceptance as passing."));
}

function validateCategoryReferences(references: CategoryReference[], catalogReferenceIds: ReadonlySet<string>, issues: AuthoringIssue[]): Set<string> {
  const ids = new Set<string>();
  if (references.length === 0) {
    issues.push(issue("complete_business.references.empty", "categoryReferences must not be empty."));
  }
  for (const reference of references) {
    if (ids.has(reference.id)) {
      issues.push(issue("complete_business.references.duplicate", `Duplicate category reference ${reference.id}.`));
    }
    ids.add(reference.id);
    if (!reference.observation.trim()) {
      issues.push(issue("complete_business.references.observation", `${reference.id} needs an observation.`));
    }
    switch (reference.kind) {
      case "catalog":
        if (!catalogReferenceIds.has(reference.id)) {
          issues.push(issue("complete_business.references.unknown_catalog", `Unknown catalog reference ${reference.id}.`));
        }
        break;
      case "workspace-rubric":
      case "workspace-reference":
        if (path.isAbsolute(reference.path) || reference.path.split(/[\\/]/).includes("..")) {
          issues.push(issue("complete_business.references.workspace_path", `${reference.id} must point at the designated workspace rubric or reference pack.`));
        }
        break;
      default: {
        const _exhaustive: never = reference.kind;
        issues.push(issue("complete_business.references.kind", `Unsupported reference kind ${String(_exhaustive)}.`));
      }
    }
  }
  return ids;
}

function validateCriteria(
  criteria: CompleteBusinessCriterion[],
  referenceIds: ReadonlySet<string>,
  allowPassVerdicts: boolean,
  issues: AuthoringIssue[],
): void {
  const seen = new Set<string>();
  for (const required of REQUIRED_CRITERION_IDS) {
    if (!criteria.some((criterion) => criterion.id === required)) {
      issues.push(issue("complete_business.criterion.missing", `Frozen criterion ${required} is missing.`));
    }
  }
  for (const criterion of criteria) {
    if (!CRITERION_ID.test(criterion.id)) {
      issues.push(issue("complete_business.criterion.id_invalid", `Criterion id ${criterion.id} is not a stable cb.* id.`));
    }
    if (seen.has(criterion.id)) {
      issues.push(issue("complete_business.criterion.id_duplicate", `Duplicate criterion id ${criterion.id}.`));
    }
    seen.add(criterion.id);
    if (!criterion.condition.trim() || !criterion.evidence.trim()) {
      issues.push(issue("complete_business.criterion.text", `${criterion.id} needs a condition and an evidence shape.`));
    }
    if (criterion.categoryReferenceIds.length === 0) {
      issues.push(issue("complete_business.criterion.references", `${criterion.id} needs at least one category reference.`));
    }
    for (const referenceId of criterion.categoryReferenceIds) {
      if (!referenceIds.has(referenceId)) {
        issues.push(issue("complete_business.criterion.reference_unknown", `${criterion.id} cites unknown reference ${referenceId}.`));
      }
    }
    collectJudgmentIssues("criterion", criterion.id, criterion.verdict, criterion.reviewer, criterion.notApplicableReason, allowPassVerdicts, issues);
  }
}

function validateScenarios(document: CompleteBusinessDocument, allowPassVerdicts: boolean, issues: AuthoringIssue[]): void {
  const criterionIds = new Set(document.criteria.map((criterion) => criterion.id));
  const seen = new Set<string>();
  for (const required of REQUIRED_SCENARIO_IDS) {
    if (!document.scenarios.some((scenario) => scenario.id === required)) {
      issues.push(issue("complete_business.scenario.missing", `Frozen scenario ${required} is missing.`));
    }
  }
  for (const scenario of document.scenarios) {
    if (seen.has(scenario.id)) {
      issues.push(issue("complete_business.scenario.id_duplicate", `Duplicate scenario id ${scenario.id}.`));
    }
    seen.add(scenario.id);
    if (!scenario.title.trim()) {
      issues.push(issue("complete_business.scenario.title", `${scenario.id} needs a title.`));
    }
    if (scenario.criterionIds.length === 0) {
      issues.push(issue("complete_business.scenario.criteria", `${scenario.id} must name at least one criterion.`));
    }
    for (const criterionId of scenario.criterionIds) {
      if (!criterionIds.has(criterionId)) {
        issues.push(issue("complete_business.scenario.unknown_criterion", `${scenario.id} cites unknown criterion ${criterionId}.`));
      }
    }
    collectJudgmentIssues("scenario", scenario.id, scenario.applicability, scenario.reviewer, scenario.notApplicableReason, allowPassVerdicts, issues);
    if (scenario.id === PURCHASE_RESTORE_SCENARIO_ID) {
      validatePurchaseRestoreScenario(document, scenario, issues);
      continue;
    }
    validateBlockedScenario(scenario, issues);
  }
}

function validatePurchaseRestoreScenario(document: CompleteBusinessDocument, scenario: CompleteBusinessScenario, issues: AuthoringIssue[]): void {
  if (document.designatedWorkspace === null || document.designatedWorkspace.monetizationInScope) {
    validateBlockedScenario(scenario, issues);
    return;
  }
  if (scenario.applicability !== "not-applicable") {
    issues.push(
      issue(
        "complete_business.scenario.purchase_restore_not_applicable",
        "Scenario cb.scenario.purchase-restore must be not-applicable when the selected product excludes monetization.",
      ),
    );
  }
  if (!scenario.notApplicableReason || !MONETIZATION_SCOPE_REASON.test(scenario.notApplicableReason)) {
    issues.push(
      issue(
        "complete_business.scenario.purchase_restore_reason",
        "Purchase/restore not-applicable reason must state that purchase or subscription is out of accepted scope.",
      ),
    );
  }
}

function validateBlockedScenario(scenario: CompleteBusinessScenario, issues: AuthoringIssue[]): void {
  if (scenario.applicability !== "ungraded") {
    issues.push(issue("complete_business.scenario.blocked_ungraded", `${scenario.id} must stay ungraded until U7/U14/U15/U16/U22 close.`));
  }
  for (const unit of GRADING_BLOCKER_UNITS) {
    if (!(scenario.blockedBy ?? []).includes(unit)) {
      issues.push(issue("complete_business.scenario.blocked_by", `${scenario.id} must list blocker ${unit}.`));
    }
  }
}

function collectJudgmentIssues(
  kind: "criterion" | "scenario",
  id: string,
  verdict: CriterionVerdict,
  reviewer: NamedReviewer | undefined,
  notApplicableReason: string | undefined,
  allowPassVerdicts: boolean,
  issues: AuthoringIssue[],
): void {
  switch (verdict) {
    case "pass":
      if (!allowPassVerdicts) {
        issues.push(issue("complete_business.pregraded_pass", `${kind} ${id} records pass. Criteria stay frozen and ungraded in this authoring artifact.`));
      }
      if (!hasNamedReviewer(reviewer)) {
        issues.push(issue("complete_business.named_reviewer", `${kind} ${id} pass requires name and sessionId.`));
      }
      break;
    case "fail":
      if (!allowPassVerdicts) issues.push(issue("complete_business.pregraded_fail", `${kind} ${id} records fail in an ungraded authoring artifact.`));
      if (!hasNamedReviewer(reviewer)) {
        issues.push(issue("complete_business.named_reviewer", `${kind} ${id} fail requires name and sessionId.`));
      }
      break;
    case "not-applicable":
      if (!notApplicableReason || notApplicableReason.trim().length < 20) {
        issues.push(issue("complete_business.not_applicable_reason", `${kind} ${id} not-applicable needs a stated reason.`));
      }
      break;
    case "ungraded":
      if (hasNamedReviewer(reviewer)) {
        issues.push(issue("complete_business.ungraded_completion", `${kind} ${id} is ungraded and must not attach a completion reviewer.`));
      }
      break;
    default: {
      const _exhaustive: never = verdict;
      issues.push(issue("complete_business.verdict", `${kind} ${id} has unsupported verdict ${String(_exhaustive)}.`));
    }
  }
}

function walkYaml(dir: string, visit: (filePath: string, text: string) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkYaml(filePath, visit);
      continue;
    }
    if (entry.name.endsWith(".yaml")) {
      visit(filePath, readFileSync(filePath, "utf8"));
    }
  }
}

function asDocument(value: Record<string, unknown>): CompleteBusinessDocument {
  return {
    schemaVersion: asNumber(value.schemaVersion, "schemaVersion"),
    id: asString(value.id, "id"),
    frozenAt: asString(value.frozenAt, "frozenAt"),
    status: asString(value.status, "status"),
    gradingStatus: asString(value.gradingStatus, "gradingStatus"),
    designatedWorkspace: asWorkspace(value.designatedWorkspace),
    designAcceptanceGate: asGate(value.designAcceptanceGate),
    requiredDependencyUnits: asStringArray(value.requiredDependencyUnits, "requiredDependencyUnits"),
    verdictSchema: asVerdictSchema(value.verdictSchema),
    categoryReferences: asArray(value.categoryReferences, "categoryReferences").map((row, index) => asCategoryReference(row, `categoryReferences[${index}]`)),
    criteria: asArray(value.criteria, "criteria").map((row, index) => asCriterion(row, `criteria[${index}]`)),
    scenarios: asArray(value.scenarios, "scenarios").map((row, index) => asScenario(row, `scenarios[${index}]`)),
  };
}

function asWorkspace(value: unknown): DesignatedWorkspace | null {
  if (value === null) return null;
  const record = asRecord(value, "designatedWorkspace");
  return {
    id: asString(record.id, "designatedWorkspace.id"),
    path: asString(record.path, "designatedWorkspace.path"),
    monetizationInScope: asBoolean(record.monetizationInScope, "designatedWorkspace.monetizationInScope"),
  };
}

function asGate(value: unknown): DesignAcceptanceGate {
  const record = asRecord(value, "designAcceptanceGate");
  const status = asString(record.status, "designAcceptanceGate.status");
  if (status !== "missing" && status !== "incomplete" && status !== "ungraded" && status !== "pass" && status !== "fail") {
    throw new CompleteBusinessParseError("complete_business.design_acceptance.status", `Unsupported designAcceptanceGate.status ${status}.`);
  }
  return {
    path: asString(record.path, "designAcceptanceGate.path"),
    status,
    currentError: asString(record.currentError, "designAcceptanceGate.currentError"),
    mayCiteAsPassing: asBoolean(record.mayCiteAsPassing, "designAcceptanceGate.mayCiteAsPassing"),
  };
}

function asVerdictSchema(value: unknown): VerdictSchema {
  const record = asRecord(value, "verdictSchema");
  return {
    allowedVerdicts: asStringArray(record.allowedVerdicts, "verdictSchema.allowedVerdicts"),
    passRequiresNamedReviewer: asBoolean(record.passRequiresNamedReviewer, "verdictSchema.passRequiresNamedReviewer"),
    failRequiresNamedReviewer: asBoolean(record.failRequiresNamedReviewer, "verdictSchema.failRequiresNamedReviewer"),
    notApplicableRequiresReason: asBoolean(record.notApplicableRequiresReason, "verdictSchema.notApplicableRequiresReason"),
    ungradedForbidsCompletionClaim: asBoolean(record.ungradedForbidsCompletionClaim, "verdictSchema.ungradedForbidsCompletionClaim"),
  };
}

function asCategoryReference(value: unknown, label: string): CategoryReference {
  const record = asRecord(value, label);
  const kind = asString(record.kind, `${label}.kind`);
  if (kind !== "catalog" && kind !== "workspace-rubric" && kind !== "workspace-reference") {
    throw new CompleteBusinessParseError("complete_business.references.kind", `${label}.kind ${kind} is unsupported.`);
  }
  return {
    id: asString(record.id, `${label}.id`),
    kind,
    path: asString(record.path, `${label}.path`),
    observation: asString(record.observation, `${label}.observation`),
  };
}

function asCriterion(value: unknown, label: string): CompleteBusinessCriterion {
  const record = asRecord(value, label);
  return {
    id: asString(record.id, `${label}.id`),
    family: asString(record.family, `${label}.family`),
    condition: asString(record.condition, `${label}.condition`),
    evidence: asString(record.evidence, `${label}.evidence`),
    categoryReferenceIds: asStringArray(record.categoryReferenceIds, `${label}.categoryReferenceIds`),
    verdict: asVerdict(record.verdict, `${label}.verdict`),
    reviewer: optionalReviewer(record.reviewer, `${label}.reviewer`),
    notApplicableReason: record.notApplicableReason === undefined ? undefined : asString(record.notApplicableReason, `${label}.notApplicableReason`),
  };
}

function asScenario(value: unknown, label: string): CompleteBusinessScenario {
  const record = asRecord(value, label);
  return {
    id: asString(record.id, `${label}.id`),
    title: asString(record.title, `${label}.title`),
    criterionIds: asStringArray(record.criterionIds, `${label}.criterionIds`),
    applicability: asVerdict(record.applicability, `${label}.applicability`),
    reviewer: optionalReviewer(record.reviewer, `${label}.reviewer`),
    notApplicableReason: record.notApplicableReason === undefined ? undefined : asString(record.notApplicableReason, `${label}.notApplicableReason`),
    blockedBy: record.blockedBy === undefined ? undefined : asStringArray(record.blockedBy, `${label}.blockedBy`),
    escalation: record.escalation === undefined ? undefined : asString(record.escalation, `${label}.escalation`),
  };
}

function optionalReviewer(value: unknown, label: string): NamedReviewer | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value, label);
  return {
    name: asString(record.name, `${label}.name`),
    sessionId: asString(record.sessionId, `${label}.sessionId`),
  };
}

function asVerdict(value: unknown, label: string): CriterionVerdict {
  const verdict = asString(value, label);
  if (verdict === "ungraded" || verdict === "pass" || verdict === "fail" || verdict === "not-applicable") {
    return verdict;
  }
  throw new CompleteBusinessParseError("complete_business.verdict", `${label} must be ungraded, pass, fail, or not-applicable.`);
}

function hasNamedReviewer(reviewer: NamedReviewer | undefined): boolean {
  return Boolean(reviewer && reviewer.name.trim() && reviewer.sessionId.trim());
}

function issue(code: string, message: string): AuthoringIssue {
  return { code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CompleteBusinessParseError("complete_business.shape", `${label} must be a mapping.`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CompleteBusinessParseError("complete_business.shape", `${label} must be a non-empty string.`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompleteBusinessParseError("complete_business.shape", `${label} must be a number.`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new CompleteBusinessParseError("complete_business.shape", `${label} must be a boolean.`);
  }
  return value;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new CompleteBusinessParseError("complete_business.shape", `${label} must be an array.`);
  }
  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  return asArray(value, label).map((entry, index) => asString(entry, `${label}[${index}]`));
}
