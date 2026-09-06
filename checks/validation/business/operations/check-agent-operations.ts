#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema, type ErrorObject } from "ajv/dist/2020.js";
import {
  asArray,
  asString,
  isRecord,
  issue,
  loadProjectState,
  parseCliArgs,
  readText,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";
import {
  isRiskyActionClass,
  loadCurrentTruthFile,
  receiptFromAgentAction,
  reconcileCurrentTruth,
  refreshCurrentTruthForRead,
  selectLatestSucceededRiskyAction,
} from "../../../../kernel/reducer/current-truth.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const human = readText(args.root, "operations/AGENT_OPERATIONS.md");
const ledgerPath = path.join(args.root, "operations", "agent-operations.json");
const schemaPath = path.join(args.root, "operations", "agent-operations.schema.json");

if (!human) {
  issues.push(
    issue("error", "agent_operations.human_log_missing", "Seed operations/AGENT_OPERATIONS.md from the skill template.", "operations/AGENT_OPERATIONS.md"),
  );
} else {
  for (const phrase of ["Capability Summary", "Approval Envelopes", "Action Ledger", "Research And Media Provenance", "Safety Invariants"]) {
    if (!human.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(
        issue(
          "error",
          `agent_operations.human_log.${code(phrase)}_missing`,
          `operations/AGENT_OPERATIONS.md must include ${phrase}.`,
          "operations/AGENT_OPERATIONS.md",
        ),
      );
    }
  }
  scanForSecrets(human, "operations/AGENT_OPERATIONS.md");
}

if (!existsSync(ledgerPath)) {
  issues.push(
    issue(
      "error",
      "agent_operations.ledger_missing",
      "operations/agent-operations.json is required for capability, approval, and action proof.",
      path.relative(args.root, ledgerPath),
    ),
  );
}
if (!existsSync(schemaPath)) {
  issues.push(
    issue(
      "error",
      "agent_operations.schema_missing",
      "operations/agent-operations.schema.json is required so the structured ledger stays portable and machine-checkable.",
      path.relative(args.root, schemaPath),
    ),
  );
}

let ledger: Record<string, unknown> | undefined;
if (existsSync(ledgerPath)) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(ledgerPath, "utf8"));
    if (isRecord(parsed)) {
      ledger = parsed;
    } else {
      issues.push(issue("error", "agent_operations.ledger_not_object", "Agent operations ledger must be a JSON object.", path.relative(args.root, ledgerPath)));
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "agent_operations.ledger_invalid_json",
        `Agent operations ledger is invalid JSON: ${errorMessage(error)}`,
        path.relative(args.root, ledgerPath),
      ),
    );
  }
}

if (ledger && existsSync(schemaPath)) {
  validateSchema(ledger);
  validateSemantics(ledger);
  scanForSecrets(readFileSync(ledgerPath, "utf8"), path.relative(args.root, ledgerPath));
}

reportAndExit("Agent operations check", issues);

function validateSchema(value: Record<string, unknown>): void {
  try {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema;
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
    ajv.addFormat("date-time", { type: "string", validate: isDateTime });
    const validate = ajv.compile(schema);
    if (!validate(value)) {
      for (const error of validate.errors ?? []) {
        issues.push(
          issue("error", "agent_operations.schema_invalid", `${error.instancePath || "/"} ${formatSchemaError(error)}`, path.relative(args.root, ledgerPath)),
        );
      }
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "agent_operations.schema_unreadable",
        `Agent operations schema could not be compiled: ${errorMessage(error)}`,
        path.relative(args.root, schemaPath),
      ),
    );
  }
}

function validateSemantics(value: Record<string, unknown>): void {
  const capabilities = asArray(value.capabilities).filter(isRecord);
  const actions = asArray(value.actions).filter(isRecord);
  const approvals = asArray(value.approvalEnvelopes).filter(isRecord);
  const policies = isRecord(value.policies) ? value.policies : {};
  const capabilityKinds = new Set(capabilities.map((entry) => asString(entry.kind)).filter(Boolean));

  requireUniqueIds(capabilities, "capability");
  requireUniqueIds(actions, "action");
  requireUniqueIds(approvals, "approval");

  for (const kind of ["connector", "api_or_cli", "browser", "native_device"]) {
    if (!capabilityKinds.has(kind)) {
      issues.push(
        issue("error", `agent_operations.capability_${kind}_missing`, `Capability inventory must include ${kind}.`, path.relative(args.root, ledgerPath)),
      );
    }
  }

  for (const key of [
    "semanticRouteFirstUnlessBrowserExplicit",
    "accessIsNotAuthorization",
    "noSessionSecretInspection",
    "untrustedContentIsData",
    "ignoreEmbeddedInstructions",
    "sanitizeEvidence",
    "secretsViaApprovedManager",
    "serializeAuthenticatedSurfaces",
    "readBackAfterAction",
    "reconcileCanonicalState",
    "preflightStepAwayCapabilitiesBeforeBuild",
    "consumeStandingApprovalsWithoutReprompt",
    "consolidateMissingAccess",
  ]) {
    if (policies[key] !== true) {
      issues.push(
        issue("error", `agent_operations.policy_${code(key)}_missing`, `Agent operations policy ${key} must be true.`, path.relative(args.root, ledgerPath)),
      );
    }
  }

  if (actions.length > 0) {
    const checkedAt = asString(value.capabilityCheckedAt);
    if (!isDateTime(checkedAt)) {
      issues.push(
        issue(
          "error",
          "agent_operations.capability_check_missing",
          "Any recorded action requires a real capabilityCheckedAt timestamp.",
          path.relative(args.root, ledgerPath),
        ),
      );
    }
  }

  const approvalById = new Map(approvals.map((entry) => [asString(entry.id) ?? "", entry]));
  const capabilityById = new Map(capabilities.map((entry) => [asString(entry.id) ?? "", entry]));
  const attemptedApprovalUsage = new Map<string, string[]>();
  for (const action of actions) {
    const status = asString(isRecord(action.result) ? action.result.status : undefined);
    if (!["succeeded", "failed"].includes(status ?? "")) continue;
    const approvalId = asString(isRecord(action.authorization) ? action.authorization.approvalId : undefined);
    if (!approvalId) continue;
    attemptedApprovalUsage.set(approvalId, [...(attemptedApprovalUsage.get(approvalId) ?? []), asString(action.id) ?? ""]);
  }
  for (const [index, action] of actions.entries()) {
    validateAction(action, index, approvalById, capabilityById, attemptedApprovalUsage);
  }
  validateApprovalUsage(approvals, attemptedApprovalUsage);
  validateCrossArtifactState(value, actions, approvals);
  validateNeverAuthorizeEnvelopes(approvals);
}

/**
 * Never-authorize guard (docs/authority-envelopes.md): an approval envelope that authorizes a
 * release or destructive action class must scope every resourcePattern to an exact, non-wildcard
 * value — an exact app id and version, never a glob. Without this, a release/destructive envelope
 * could name a wildcard-ish pattern and stand in for an open-ended production release or deletion
 * authority, which the design doc's never-authorize list forbids regardless of mode (one_shot or
 * standing).
 */
function validateNeverAuthorizeEnvelopes(approvals: Record<string, unknown>[]): void {
  const file = path.relative(args.root, ledgerPath);
  for (const approval of approvals) {
    const actionClasses = asArray(approval.actionClasses).map(asString);
    if (!actionClasses.includes("release") && !actionClasses.includes("destructive")) continue;
    const id = asString(approval.id) ?? "(unnamed)";
    const patterns = asArray(approval.resourcePatterns)
      .map(asString)
      .filter((value): value is string => Boolean(value));
    if (patterns.length === 0 || patterns.some((pattern) => pattern.includes("*"))) {
      issues.push(
        issue(
          "error",
          "agent_operations.release_envelope_not_version_pinned",
          `Approval envelope "${id}" authorizes a release or destructive action class and must scope every resourcePattern to an exact, non-wildcard value (an exact app id and version) — never a wildcard pattern.`,
          file,
        ),
      );
    }
  }
}

function validateAction(
  action: Record<string, unknown>,
  index: number,
  approvalById: Map<string, Record<string, unknown>>,
  capabilityById: Map<string, Record<string, unknown>>,
  attemptedApprovalUsage: Map<string, string[]>,
): void {
  const file = path.relative(args.root, ledgerPath);
  const prefix = `agent_operations.action_${index}`;
  const actionClass = asString(action.class) ?? "";
  const route = asString(action.route) ?? "";
  const purpose = asString(action.purpose) ?? "";
  const occurredAt = asString(action.occurredAt);
  const result = isRecord(action.result) ? action.result : {};
  const preflight = isRecord(action.preflight) ? action.preflight : {};
  const authorization = isRecord(action.authorization) ? action.authorization : {};
  const reconciliation = isRecord(action.reconciliation) ? action.reconciliation : {};
  const succeeded = asString(result.status) === "succeeded";
  const attempted = ["succeeded", "failed"].includes(asString(result.status) ?? "");
  const risky = ["mutate", "publish", "spend", "release", "destructive"].includes(actionClass);

  if (!isDateTime(occurredAt)) {
    issues.push(issue("error", `${prefix}.occurred_at_invalid`, "Every action needs a strict RFC 3339 occurredAt timestamp.", file));
  } else if (new Date(occurredAt).getTime() > Date.now() + 5 * 60_000) {
    issues.push(issue("error", `${prefix}.occurred_at_future`, "Action occurredAt cannot be in the future.", file));
  }

  validateMatchingCapability(action, prefix, capabilityById, occurredAt);

  if (attempted && risky) {
    for (const key of ["account", "project", "environment"]) {
      const value = asString(action[key]);
      if (!value?.trim() || /^(unknown|none|n\/a|pending)$/i.test(value)) {
        issues.push(issue("error", `${prefix}.target_${key}_missing`, `Succeeded ${actionClass} action needs an exact ${key}.`, file));
      }
    }

    const approvalId = asString(authorization.approvalId) ?? "";
    const approval = approvalById.get(approvalId);
    if (!approval || !approvalMatches(approval, action, actionClass, occurredAt, attemptedApprovalUsage.get(approvalId) ?? [])) {
      issues.push(
        issue(
          "error",
          `${prefix}.approval_missing_or_mismatched`,
          `Attempted ${actionClass} action needs a matching approval envelope for its exact time, target, operation, resource, payload, spend, and voice scope.`,
          file,
        ),
      );
    }

    if (preflight.targetVerified !== true || !asString(preflight.beforeState)?.trim()) {
      issues.push(issue("error", `${prefix}.preflight_missing`, `Attempted ${actionClass} action needs verified target and before-state.`, file));
    }
    requireEvidencePath(asString(preflight.evidencePath), `${prefix}.preflight_evidence_missing`, "Preflight evidence path is missing or does not exist.");

    if (!asString(result.afterState)?.trim() || !asString(result.rollbackOrRecovery)?.trim()) {
      issues.push(
        issue(
          "error",
          `${prefix}.result_proof_missing`,
          `Attempted ${actionClass} action needs provider read-back plus rollback, recovery, or irreversibility notes.`,
          file,
        ),
      );
    }
    requireEvidencePath(asString(result.evidencePath), `${prefix}.result_evidence_missing`, "After-state evidence path is missing or does not exist.");

    if (action.redactionAttested !== true) {
      issues.push(issue("error", `${prefix}.redaction_missing`, "Attempted external mutation needs a redaction attestation.", file));
    }

    if (!asString(action.payloadDigest)?.trim()) {
      issues.push(issue("error", `${prefix}.payload_digest_missing`, "Attempted risky action needs a SHA-256 payload digest.", file));
    }
  }

  if (succeeded && risky) {
    if (
      reconciliation.projectStateUpdated !== true ||
      reconciliation.providerProofUpdated !== true ||
      asArray(reconciliation.canonicalDocs).length === 0 ||
      !isDateTime(asString(reconciliation.at))
    ) {
      issues.push(
        issue(
          "error",
          `${prefix}.reconciliation_missing`,
          `Succeeded external mutation must reconcile reducer-owned business state, canonical docs, and operations/PROVIDER_PROOF.md with a timestamp.`,
          file,
        ),
      );
    }
  }

  const researchLike = ["research", "media_analysis"].includes(purpose);
  if (succeeded && actionClass === "observe" && researchLike) {
    const provenance = isRecord(action.researchProvenance) ? action.researchProvenance : undefined;
    if (
      !provenance ||
      (!asString(provenance.canonicalUrl)?.trim() && !asString(provenance.sourceId)?.trim()) ||
      !asString(provenance.query)?.trim() ||
      !isDateTime(asString(provenance.observedAt)) ||
      !asString(provenance.toolBackend)?.trim() ||
      !asString(provenance.visualObservation)?.trim() ||
      !asString(provenance.inference)?.trim()
    ) {
      issues.push(
        issue(
          "error",
          `${prefix}.research_provenance_missing`,
          "Browser/social/video research needs canonical URL or source ID, query, backend, observed timestamp, visual observation, and separate inference.",
          file,
        ),
      );
    } else {
      if (
        purpose === "media_analysis" &&
        ["transcriptType", "transcriptLanguage", "timestampRange", "sampleLimit"].some((key) => !asString(provenance[key])?.trim())
      ) {
        issues.push(
          issue(
            "error",
            `${prefix}.media_provenance_incomplete`,
            "Video/podcast/media analysis needs transcript type, language, timestamp range, and sample limit.",
            file,
          ),
        );
      }
      requireEvidencePath(
        asString(provenance.artifactPath),
        `${prefix}.research_artifact_missing`,
        "Research provenance artifact path is missing or does not exist.",
      );
    }
  }

  if (succeeded && actionClass === "observe" && route === "browser" && purpose === "operational_observation") {
    requireEvidencePath(
      asString(result.evidencePath),
      `${prefix}.browser_observation_evidence_missing`,
      "Browser observation needs sanitized provider read-back evidence.",
    );
  }
}

function approvalMatches(
  approval: Record<string, unknown>,
  action: Record<string, unknown>,
  actionClass: string,
  occurredAt: string | undefined,
  usage: string[],
): boolean {
  if (!isDateTime(occurredAt)) {
    return false;
  }
  const actionTime = new Date(occurredAt).getTime();
  const approvedAt = asString(approval.approvedAt);
  const expiresAt = asString(approval.expiresAt);
  if (!isDateTime(approvedAt) || !isDateTime(expiresAt) || actionTime < new Date(approvedAt).getTime() || actionTime > new Date(expiresAt).getTime()) {
    return false;
  }
  const revokedAt = asString(approval.revokedAt);
  if (isDateTime(revokedAt) && actionTime >= new Date(revokedAt).getTime()) return false;
  if (!asArray(approval.actionClasses).map(asString).includes(actionClass)) {
    return false;
  }
  for (const key of ["provider", "account", "project", "environment"]) {
    if (asString(approval[key]) !== asString(action[key])) {
      return false;
    }
  }
  const approvalTeam = asString(approval.team) ?? "";
  const actionTeam = asString(action.team) ?? "";
  if (approvalTeam && approvalTeam !== actionTeam) return false;

  const operation = asString(action.operation) ?? "";
  const resource = asString(action.resource) ?? "";
  if (
    !asArray(approval.operations)
      .map(asString)
      .some((pattern) => matchesScope(pattern, operation))
  )
    return false;
  if (
    !asArray(approval.resourcePatterns)
      .map(asString)
      .some((pattern) => matchesScope(pattern, resource))
  )
    return false;
  if (
    asArray(approval.exclusions)
      .map(asString)
      .some((pattern) => matchesScope(pattern, operation) || matchesScope(pattern, resource))
  )
    return false;

  const allowedPayloads = asArray(approval.payloadDigests).map(asString).filter(Boolean);
  if (allowedPayloads.length > 0 && !allowedPayloads.includes(asString(action.payloadDigest))) return false;
  if (actionClass === "spend") {
    const ceiling = typeof approval.spendCeiling === "number" ? approval.spendCeiling : undefined;
    const amount = typeof action.spendAmount === "number" ? action.spendAmount : undefined;
    if (ceiling === undefined || amount === undefined || amount > ceiling || !/^[A-Z]{3}$/.test(asString(action.currency) ?? "")) return false;
  }
  // Founder public voice is never satisfied by a standing-mode approval, no matter how the
  // voicePolicy strings compare: a publish tagged purpose "social_engagement" (a social/public
  // post in the founder's voice) must trace to a fresh, per-item founder decision — a one_shot
  // approval, consumed by exactly the one action it names. Routine already-approved copy
  // publication (store metadata, previously-drafted landing pages) carries a different purpose
  // and is unaffected. Mirrors kernel/autonomy/standing-approvals.ts's actionCoversNode gate; see
  // docs/authority-envelopes.md, "Public voice" grant.
  if (actionClass === "publish" && asString(action.purpose) === "social_engagement" && asString(approval.mode) === "standing") {
    return false;
  }
  const approvalVoice = asString(approval.voicePolicy) ?? "";
  if (["publish", "social_engagement"].includes(actionClass) || asString(action.purpose) === "social_engagement") {
    if (!approvalVoice || approvalVoice !== (asString(action.voicePolicy) ?? "")) return false;
    if (!asString(action.contentDigest)?.trim()) return false;
  }

  const status = asString(approval.status) ?? "";
  if (asString(approval.mode) === "one_shot") {
    const actionId = asString(action.id) ?? "";
    const consumedBy = asArray(approval.consumedByActionIds)
      .map(asString)
      .filter((value): value is string => Boolean(value));
    if (usage.length !== 1 || usage[0] !== actionId || status !== "consumed" || consumedBy.length !== 1 || consumedBy[0] !== actionId) return false;
  }
  return ["active", "consumed", "expired", "revoked"].includes(status);
}

function requireEvidencePath(value: string | undefined, codeValue: string, message: string): void {
  if (!value?.trim() || path.isAbsolute(value) || value.split(/[\\/]/).includes("..") || !existsSync(path.join(args.root, value))) {
    issues.push(issue("error", codeValue, message, path.relative(args.root, ledgerPath)));
    return;
  }
  const fullPath = path.join(args.root, value);
  if (/\.(?:txt|log|json|md|csv|ya?ml)$/i.test(value)) {
    scanForSecrets(readFileSync(fullPath, "utf8"), value);
  } else if (/\.(?:png|jpe?g|mp4|mov)$/i.test(value) && !/(?:sanitized|redacted)/i.test(path.basename(value))) {
    issues.push(
      issue(
        "error",
        `${codeValue}.binary_not_redacted`,
        "Binary browser/provider evidence must use a reviewed sanitized or redacted derivative filename.",
        value,
      ),
    );
  }
}

function scanForSecrets(text: string, file: string): void {
  const secretPattern =
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk_(?:live|test)|rk_live|whsec_|phc_|gsk_|xox[baprs]-)[A-Za-z0-9_-]{8,}|["']?(?:password|token|secret|privateKey|cookie|session)["']?\s*[:=]\s*["'](?!["'])[^"'\n]+["'])/i;
  if (secretPattern.test(text)) {
    issues.push(
      issue(
        "error",
        "agent_operations.raw_secret_detected",
        "Agent operations artifacts must contain secret names/routes only, never raw credentials, cookies, sessions, or private keys.",
        file,
      ),
    );
  }
}

function isDateTime(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(new Date(value).getTime()));
}

function validateMatchingCapability(
  action: Record<string, unknown>,
  prefix: string,
  capabilityById: Map<string, Record<string, unknown>>,
  occurredAt: string | undefined,
): void {
  const file = path.relative(args.root, ledgerPath);
  const capability = capabilityById.get(asString(action.capabilityId) ?? "");
  if (!capability || capability.status !== "available") {
    issues.push(issue("error", `${prefix}.capability_unavailable`, "Action must bind to an available capability ID.", file));
    return;
  }
  if (asString(capability.kind) !== asString(action.route) || asString(capability.provider) !== asString(action.provider)) {
    issues.push(issue("error", `${prefix}.capability_route_mismatch`, "Action route/provider must match its bound capability.", file));
  }
  for (const key of ["account", "team", "project", "environment"]) {
    if (asString(capability[key]) !== asString(action[key])) {
      issues.push(issue("error", `${prefix}.capability_target_mismatch`, `Action ${key} must match its bound capability.`, file));
    }
  }
  if (!asArray(capability.modes).map(asString).includes(asString(action.class))) {
    issues.push(issue("error", `${prefix}.capability_mode_unsupported`, "Bound capability does not support this action class.", file));
  }
  const checkedAt = asString(capability.checkedAt);
  if (!isDateTime(checkedAt) || !isDateTime(occurredAt)) {
    issues.push(issue("error", `${prefix}.capability_timestamp_invalid`, "Capability checkedAt and action occurredAt must be valid timestamps.", file));
  } else {
    const ageMs = new Date(occurredAt).getTime() - new Date(checkedAt).getTime();
    if (ageMs < 0 || ageMs > 7 * 86_400_000) {
      issues.push(issue("error", `${prefix}.capability_check_stale`, "Capability must be checked no more than seven days before the action.", file));
    }
  }
}

function validateApprovalUsage(approvals: Record<string, unknown>[], usage: Map<string, string[]>): void {
  const file = path.relative(args.root, ledgerPath);
  for (const approval of approvals) {
    const id = asString(approval.id) ?? "";
    const actionIds = usage.get(id) ?? [];
    const consumedBy = asArray(approval.consumedByActionIds)
      .map(asString)
      .filter((value): value is string => Boolean(value));
    if (asString(approval.mode) === "one_shot" && actionIds.length > 1) {
      issues.push(
        issue("error", `agent_operations.approval_${code(id)}.one_shot_reused`, "One-shot approval is referenced by more than one attempted action.", file),
      );
    }
    if (asString(approval.status) === "consumed" && !sameStrings(actionIds, consumedBy)) {
      issues.push(
        issue(
          "error",
          `agent_operations.approval_${code(id)}.consumption_mismatch`,
          "Consumed approval must name exactly the attempted action IDs that used it.",
          file,
        ),
      );
    }
  }
}

function validateCrossArtifactState(value: Record<string, unknown>, actions: Record<string, unknown>[], approvals: Record<string, unknown>[]): void {
  const latest = actions.at(-1);
  if (!latest) return;
  const actionId = asString(latest.id) ?? "";
  const result = isRecord(latest.result) ? latest.result : {};
  const latestSucceededRisky = result.status === "succeeded" && isRiskyActionClass(asString(latest.class) ?? "");
  const succeededRiskyAction = selectLatestSucceededRiskyAction(actions);
  if (!human?.includes(actionId) || !human.toLowerCase().includes(asString(result.status)?.toLowerCase() ?? "")) {
    issues.push(
      issue(
        "error",
        "agent_operations.human_log_stale",
        "operations/AGENT_OPERATIONS.md must record the latest action ID and result.",
        "operations/AGENT_OPERATIONS.md",
      ),
    );
  }
  if (!new RegExp(`Status:\\s*${escapeRegex(asString(value.status) ?? "")}`, "i").test(human ?? "")) {
    issues.push(
      issue(
        "error",
        "agent_operations.human_status_stale",
        "operations/AGENT_OPERATIONS.md status must match the structured ledger.",
        "operations/AGENT_OPERATIONS.md",
      ),
    );
  }
  if (latestSucceededRisky) {
    const reconciliation = isRecord(latest.reconciliation) ? latest.reconciliation : {};
    for (const doc of [
      ...asArray(reconciliation.canonicalDocs)
        .map(asString)
        .filter((value): value is string => Boolean(value)),
      "operations/PROVIDER_PROOF.md",
    ]) {
      const content = readText(args.root, doc);
      if (!content?.includes(actionId)) {
        issues.push(issue("error", "agent_operations.canonical_doc_stale", `${doc} must exist and record ${actionId}.`, doc));
      }
    }
  }
  if (succeededRiskyAction) {
    checkCurrentTruth(succeededRiskyAction);
  }
}

function checkCurrentTruth(riskyAction: Record<string, unknown>): void {
  const file = "state/current-truth.json";
  const currentTruthPath = path.join(args.root, file);
  const loaded = loadCurrentTruthFile(currentTruthPath);
  if (!existsSync(currentTruthPath)) {
    issues.push(issue("error", "agent_operations.current_truth_missing", "Succeeded risky action must leave a reducer-owned current-truth document.", file));
    return;
  }
  if (loaded.issues.length > 0 || !loaded.document) {
    const message = loaded.issues[0]?.message ?? "Current truth is invalid.";
    const code = loaded.issues.some((item) => item.code.includes("conflict"))
      ? "agent_operations.current_truth_conflict"
      : "agent_operations.current_truth_invalid";
    issues.push(issue("error", code, message, file));
    return;
  }
  const document = loaded.document;
  const actionId = asString(riskyAction.id) ?? "";
  const now = new Date().toISOString();
  const refreshed = refreshCurrentTruthForRead(document, now);
  if (document.lastReceiptId !== actionId) {
    issues.push(
      issue(
        "error",
        "agent_operations.current_truth_receipt_mismatch",
        `Current truth lastReceiptId ${document.lastReceiptId ?? "(none)"} must match the latest successful risky action ${actionId}.`,
        file,
      ),
    );
  }
  if (refreshed.claims.some((claim) => claim.blockerKind === "conflict")) {
    issues.push(issue("error", "agent_operations.current_truth_conflict", "Current truth recorded a conflict and must fail closed.", file));
  }
  const receipt = receiptFromAgentAction(riskyAction);
  if (receipt) {
    const recomputed = reconcileCurrentTruth(document, receipt, now);
    switch (recomputed.kind) {
      case "rejected": {
        const conflict = recomputed.issues.some((item) => item.code.includes("conflict"));
        issues.push(
          issue(
            "error",
            conflict ? "agent_operations.current_truth_conflict" : "agent_operations.current_truth_invalid",
            recomputed.issues[0]?.message ?? "Current truth reconcile failed closed.",
            file,
          ),
        );
        break;
      }
      case "committed": {
        if (!recomputed.noop) {
          const clockOnly =
            recomputed.document.lastReceiptId === document.lastReceiptId &&
            JSON.stringify(recomputed.document.evidence) === JSON.stringify(document.evidence) &&
            JSON.stringify(recomputed.document.claims) === JSON.stringify(refreshed.claims);
          if (!clockOnly) {
            issues.push(issue("error", "agent_operations.projection_stale", "Current truth is stale relative to the latest successful risky action.", file));
          }
        }
        break;
      }
      default: {
        const exhaustive: never = recomputed;
        throw new Error(`Unhandled reconcile result ${String(exhaustive)}`);
      }
    }
  }
}

function requireUniqueIds(entries: Record<string, unknown>[], kind: string): void {
  const ids = entries.map((entry) => asString(entry.id) ?? "");
  if (new Set(ids).size !== ids.length) {
    issues.push(issue("error", `agent_operations.${kind}_id_duplicate`, `${kind} IDs must be unique.`, path.relative(args.root, ledgerPath)));
  }
}

function matchesScope(pattern: string | undefined, value: string): boolean {
  if (!pattern) return false;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatSchemaError(error: ErrorObject): string {
  return error.message ?? "is invalid";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function code(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
