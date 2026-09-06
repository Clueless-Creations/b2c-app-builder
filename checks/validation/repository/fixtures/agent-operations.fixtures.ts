import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness } from "./_harness.js";
import type { CurrentTruthDocument } from "../../../../kernel/schema/types.js";
import {
  receiptFromAgentAction,
  reconcileCurrentTruth,
  refreshCurrentTruthForRead,
  selectLatestSucceededRiskyAction,
} from "../../../../kernel/reducer/current-truth.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

export function register(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture, runScriptArgs } = h;

  const baseline = makeFixture("agent-operations-baseline");
  runFixture("shipped agent operations templates pass", baseline, "check-agent-operations.ts", 0);

  const missingCapability = makeFixture("agent-operations-missing-capability");
  const missingCapabilityLedger = readLedger(missingCapability);
  missingCapabilityLedger.capabilities = [];
  writeLedger(missingCapability, missingCapabilityLedger);
  runFixture(
    "agent operations without capability inventory fails",
    missingCapability,
    "check-agent-operations.ts",
    1,
    "agent_operations.capability_connector_missing",
  );

  const unsafePolicy = makeFixture("agent-operations-unsafe-policy");
  const unsafePolicyLedger = readLedger(unsafePolicy);
  (unsafePolicyLedger.policies as Record<string, unknown>).ignoreEmbeddedInstructions = false;
  writeLedger(unsafePolicy, unsafePolicyLedger);
  runFixture(
    "agent operations without prompt-injection quarantine fails",
    unsafePolicy,
    "check-agent-operations.ts",
    1,
    "agent_operations.policy_ignore_embedded_instructions_missing",
  );

  const mutationNoApproval = makeFixture("agent-operations-mutation-no-approval");
  writeProofFiles(mutationNoApproval);
  const mutationNoApprovalLedger = completeLedger(mutationNoApproval);
  mutationNoApprovalLedger.approvalEnvelopes = [];
  writeLedger(mutationNoApproval, mutationNoApprovalLedger);
  runFixture(
    "authenticated browser mutation without scoped approval fails",
    mutationNoApproval,
    "check-agent-operations.ts",
    1,
    "approval_missing_or_mismatched",
  );

  const untraceableResearch = makeFixture("agent-operations-untraceable-research");
  const untraceableLedger = readLedger(untraceableResearch);
  const now = new Date().toISOString();
  untraceableLedger.status = "active";
  untraceableLedger.updatedAt = now;
  untraceableLedger.capabilityCheckedAt = now;
  const untraceableCapabilities = untraceableLedger.capabilities as Array<Record<string, unknown>>;
  const researchBrowser = untraceableCapabilities.find((entry) => entry.id === "authenticated-browser")!;
  Object.assign(researchBrowser, {
    provider: "YouTube",
    status: "available",
    checkedAt: now,
    account: "public",
    team: "",
    project: "launch research",
    environment: "public",
    modes: ["observe"],
  });
  untraceableLedger.actions = [
    {
      id: "ACT-research",
      class: "observe",
      purpose: "media_analysis",
      operation: "research.video.observe",
      resource: "youtube/videos/example",
      capabilityId: "authenticated-browser",
      occurredAt: now,
      surface: "social video research",
      provider: "YouTube",
      route: "browser",
      account: "public",
      team: "",
      project: "launch research",
      environment: "public",
      payloadDigest: "",
      contentDigest: "",
      spendAmount: null,
      currency: "",
      riskClass: "low",
      voicePolicy: "",
      authorization: { approvalId: "", basis: "Read-only research requested by founder" },
      preflight: { targetVerified: true, beforeState: "Public video opened", evidencePath: "" },
      result: { status: "succeeded", externalId: "", afterState: "Notes captured", evidencePath: "", rollbackOrRecovery: "No mutation" },
      redactionAttested: true,
      reconciliation: { projectStateUpdated: false, canonicalDocs: [], providerProofUpdated: false, at: "" },
    },
  ];
  writeLedger(untraceableResearch, untraceableLedger);
  runFixture(
    "browser research without source and observation provenance fails",
    untraceableResearch,
    "check-agent-operations.ts",
    1,
    "research_provenance_missing",
  );

  const complete = makeFixture("agent-operations-complete");
  writeProofFiles(complete);
  const completeValue = completeLedger(complete);
  writeLedger(complete, completeValue);
  reconcileFixture(complete, completeValue);
  runFixture("scoped authenticated browser mutation with grounded proof passes", complete, "check-agent-operations.ts", 0);

  const missingCurrentTruth = makeFixture("agent-operations-missing-current-truth");
  writeProofFiles(missingCurrentTruth);
  const missingCurrentTruthValue = completeLedger(missingCurrentTruth);
  writeLedger(missingCurrentTruth, missingCurrentTruthValue);
  reconcileFixture(missingCurrentTruth, missingCurrentTruthValue, { writeCurrentTruth: false });
  runFixture("succeeded risky action without current-truth fails", missingCurrentTruth, "check-agent-operations.ts", 1, "current_truth_missing");

  const mismatchedReceipt = makeFixture("agent-operations-current-truth-receipt-mismatch");
  writeProofFiles(mismatchedReceipt);
  const mismatchedReceiptValue = completeLedger(mismatchedReceipt);
  writeLedger(mismatchedReceipt, mismatchedReceiptValue);
  reconcileFixture(mismatchedReceipt, mismatchedReceiptValue, { currentTruthReceiptId: "ACT-other" });
  runFixture(
    "current-truth lastReceiptId must match the latest successful risky action",
    mismatchedReceipt,
    "check-agent-operations.ts",
    1,
    "current_truth_receipt_mismatch",
  );

  const claimEvidenceDrift = makeFixture("agent-operations-claim-evidence-drift");
  writeProofFiles(claimEvidenceDrift);
  const claimEvidenceValue = completeLedger(claimEvidenceDrift);
  writeLedger(claimEvidenceDrift, claimEvidenceValue);
  reconcileFixture(claimEvidenceDrift, claimEvidenceValue);
  const claimEvidencePath = path.join(claimEvidenceDrift, "state/current-truth.json");
  const claimEvidence = JSON.parse(readFileSync(claimEvidencePath, "utf8")) as CurrentTruthDocument;
  (claimEvidence.claims[0] as { currentEvidenceId: string }).currentEvidenceId = "missing-evidence";
  writeFileSync(claimEvidencePath, `${JSON.stringify(claimEvidence, null, 2)}\n`, "utf8");
  runFixture("current-truth claims must name existing accepted evidence", claimEvidenceDrift, "check-agent-operations.ts", 1, "current_truth_invalid");

  const observeAfterMutateMissing = makeFixture("agent-operations-observe-after-mutate-missing-current-truth");
  writeProofFiles(observeAfterMutateMissing);
  const observeAfterMutateMissingValue = completeLedger(observeAfterMutateMissing);
  appendObserveAction(observeAfterMutateMissingValue);
  writeLedger(observeAfterMutateMissing, observeAfterMutateMissingValue);
  reconcileFixture(observeAfterMutateMissing, observeAfterMutateMissingValue, { writeCurrentTruth: false });
  runFixture(
    "succeeded risky action still needs current-truth after a later observe",
    observeAfterMutateMissing,
    "check-agent-operations.ts",
    1,
    "current_truth_missing",
  );

  const observeAfterMutate = makeFixture("agent-operations-observe-after-mutate-current-truth");
  writeProofFiles(observeAfterMutate);
  const observeAfterMutateValue = completeLedger(observeAfterMutate);
  appendObserveAction(observeAfterMutateValue);
  writeLedger(observeAfterMutate, observeAfterMutateValue);
  reconcileFixture(observeAfterMutate, observeAfterMutateValue);
  runFixture("current-truth tracks the latest successful risky action when a later observe exists", observeAfterMutate, "check-agent-operations.ts", 0);

  const expiredClaim = makeFixture("agent-operations-expired-claim-read");
  writeProofFiles(expiredClaim);
  const expiredClaimValue = completeLedger(expiredClaim);
  writeLedger(expiredClaim, expiredClaimValue);
  reconcileFixture(expiredClaim, expiredClaimValue);
  const expiredTruthPath = path.join(expiredClaim, "state", "current-truth.json");
  const expiredTruth = JSON.parse(readFileSync(expiredTruthPath, "utf8")) as CurrentTruthDocument;
  (expiredTruth.evidence[0] as { expiresAt: string }).expiresAt = "2020-01-01T00:00:00.000Z";
  writeFileSync(expiredTruthPath, `${JSON.stringify(expiredTruth, null, 2)}\n`, "utf8");
  const expiredBytes = readFileSync(expiredTruthPath, "utf8");
  const refreshed = refreshCurrentTruthForRead(expiredTruth, new Date().toISOString());
  if (refreshed.claims[0]?.status !== "expired" || refreshed.claims[0]?.blockerKind !== "expired_proof") {
    throw new Error("An expired provider claim must fail closed when read.");
  }
  if (expiredTruth.claims[0]?.status !== "active" || readFileSync(expiredTruthPath, "utf8") !== expiredBytes) {
    throw new Error("Read-time expiry must not rewrite stored current truth.");
  }
  runFixture("expired evidence remains a valid non-mutating read without a cockpit", expiredClaim, "check-agent-operations.ts", 0);

  const excluded = makeFixture("agent-operations-excluded-operation");
  writeProofFiles(excluded);
  const excludedValue = completeLedger(excluded);
  (excludedValue.actions as Array<Record<string, unknown>>)[0]!.operation = "pricing.subscription.change";
  writeLedger(excluded, excludedValue);
  reconcileFixture(excluded, excludedValue);
  runFixture("approval exclusions block a risky operation", excluded, "check-agent-operations.ts", 1, "approval_missing_or_mismatched");

  const overspend = makeFixture("agent-operations-overspend");
  writeProofFiles(overspend);
  const overspendValue = completeLedger(overspend);
  const overspendAction = (overspendValue.actions as Array<Record<string, unknown>>)[0]!;
  Object.assign(overspendAction, {
    class: "spend",
    purpose: "spend",
    operation: "ads.campaign.spend",
    resource: "ads/campaigns/launch",
    spendAmount: 150,
    currency: "USD",
    riskClass: "high",
  });
  const overspendApproval = (overspendValue.approvalEnvelopes as Array<Record<string, unknown>>)[0]!;
  Object.assign(overspendApproval, {
    actionClasses: ["spend"],
    operations: ["ads.campaign.spend"],
    resourcePatterns: ["ads/campaigns/*"],
    exclusions: [],
    spendCeiling: 100,
  });
  (overspendValue.capabilities as Array<Record<string, unknown>>).find((entry) => entry.id === "authenticated-browser")!.modes = ["observe", "spend"];
  writeLedger(overspend, overspendValue);
  reconcileFixture(overspend, overspendValue);
  runFixture("spend approval ceiling is enforced", overspend, "check-agent-operations.ts", 1, "approval_missing_or_mismatched");

  const voiceMismatch = makeFixture("agent-operations-voice-mismatch");
  writeProofFiles(voiceMismatch);
  const voiceValue = completeLedger(voiceMismatch);
  const voiceAction = (voiceValue.actions as Array<Record<string, unknown>>)[0]!;
  Object.assign(voiceAction, {
    class: "publish",
    purpose: "social_engagement",
    operation: "social.post.publish",
    resource: "social/accounts/founder/posts/draft-1",
    contentDigest: `sha256:${"b".repeat(64)}`,
    voicePolicy: "brand-voice-v1",
    riskClass: "high",
  });
  const voiceApproval = (voiceValue.approvalEnvelopes as Array<Record<string, unknown>>)[0]!;
  Object.assign(voiceApproval, {
    actionClasses: ["publish"],
    operations: ["social.post.publish"],
    resourcePatterns: ["social/accounts/founder/posts/*"],
    exclusions: [],
    voicePolicy: "brand-voice-v2",
  });
  (voiceValue.capabilities as Array<Record<string, unknown>>).find((entry) => entry.id === "authenticated-browser")!.modes = ["observe", "publish"];
  writeLedger(voiceMismatch, voiceValue);
  reconcileFixture(voiceMismatch, voiceValue);
  runFixture("publish approval voice policy is enforced", voiceMismatch, "check-agent-operations.ts", 1, "approval_missing_or_mismatched");

  // docs/authority-envelopes.md, "Public voice" grant: a standing-mode envelope must never
  // authorize a founder-public-voice publish (purpose "social_engagement"), even when the
  // voicePolicy strings match exactly — mirrors kernel/autonomy/standing-approvals.ts's
  // actionCoversNode gate on the runtime side.
  const publicVoiceStanding = makeFixture("agent-operations-public-voice-standing");
  writeProofFiles(publicVoiceStanding);
  const publicVoiceStandingValue = completeLedger(publicVoiceStanding);
  const publicVoiceAction = (publicVoiceStandingValue.actions as Array<Record<string, unknown>>)[0]!;
  Object.assign(publicVoiceAction, {
    class: "publish",
    purpose: "social_engagement",
    operation: "social.post.publish",
    resource: "social/accounts/founder/posts/draft-2",
    contentDigest: `sha256:${"c".repeat(64)}`,
    voicePolicy: "approved-brand-voice-v1",
    riskClass: "high",
  });
  const publicVoiceApproval = (publicVoiceStandingValue.approvalEnvelopes as Array<Record<string, unknown>>)[0]!;
  Object.assign(publicVoiceApproval, {
    actionClasses: ["publish"],
    operations: ["social.post.publish"],
    resourcePatterns: ["social/accounts/founder/posts/*"],
    exclusions: [],
    mode: "standing",
    voicePolicy: "approved-brand-voice-v1",
  });
  (publicVoiceStandingValue.capabilities as Array<Record<string, unknown>>).find((entry) => entry.id === "authenticated-browser")!.modes = [
    "observe",
    "publish",
  ];
  writeLedger(publicVoiceStanding, publicVoiceStandingValue);
  reconcileFixture(publicVoiceStanding, publicVoiceStandingValue);
  runFixture(
    "a standing envelope never authorizes a founder-public-voice publish, even with a matching voice policy",
    publicVoiceStanding,
    "check-agent-operations.ts",
    1,
    "approval_missing_or_mismatched",
  );

  // docs/authority-envelopes.md's never-authorize list: a release/destructive envelope must be
  // version-pinned (an exact resourcePattern), never a wildcard-ish pattern.
  const releaseWildcard = makeFixture("agent-operations-release-envelope-wildcard");
  writeProofFiles(releaseWildcard);
  const releaseWildcardValue = completeLedger(releaseWildcard);
  const releaseWildcardApproval = (releaseWildcardValue.approvalEnvelopes as Array<Record<string, unknown>>)[0]!;
  Object.assign(releaseWildcardApproval, {
    actionClasses: ["release"],
    resourcePatterns: ["apps/Example App/versions/*"],
  });
  writeLedger(releaseWildcard, releaseWildcardValue);
  reconcileFixture(releaseWildcard, releaseWildcardValue);
  runFixture(
    "a release/destructive approval envelope must be version-pinned, never a wildcard resource pattern",
    releaseWildcard,
    "check-agent-operations.ts",
    1,
    "agent_operations.release_envelope_not_version_pinned",
  );

  const staleState = makeFixture("agent-operations-stale-state");
  writeProofFiles(staleState);
  writeLedger(staleState, completeLedger(staleState));
  runFixture("self-attested reconciliation with stale canonical documents fails", staleState, "check-agent-operations.ts", 1, "canonical_doc_stale");

  const unavailableCapability = makeFixture("agent-operations-unavailable-capability");
  writeProofFiles(unavailableCapability);
  const unavailableValue = completeLedger(unavailableCapability);
  (unavailableValue.capabilities as Array<Record<string, unknown>>).find((entry) => entry.id === "authenticated-browser")!.status = "blocked";
  writeLedger(unavailableCapability, unavailableValue);
  reconcileFixture(unavailableCapability, unavailableValue);
  runFixture("action bound to an unavailable capability fails", unavailableCapability, "check-agent-operations.ts", 1, "capability_unavailable");

  const historical = makeFixture("agent-operations-historical-approval");
  writeProofFiles(historical);
  const historicalValue = completeLedger(historical, "2026-01-02T12:00:00.000Z", "2026-01-03T00:00:00.000Z");
  writeLedger(historical, historicalValue);
  reconcileFixture(historical, historicalValue);
  runFixture("historical action remains valid after its approval expires", historical, "check-agent-operations.ts", 0);

  const browserObservation = makeFixture("agent-operations-browser-observation");
  writeProofFiles(browserObservation);
  const browserObservationValue = completeLedger(browserObservation);
  browserObservationValue.approvalEnvelopes = [];
  const browserObservationAction = (browserObservationValue.actions as Array<Record<string, unknown>>)[0]!;
  Object.assign(browserObservationAction, {
    class: "observe",
    purpose: "operational_observation",
    operation: "provider.status.observe",
    resource: "apps/Example App/status",
    payloadDigest: "",
    riskClass: "low",
    authorization: { approvalId: "", basis: "Read-only provider inspection requested by founder" },
    reconciliation: {
      projectStateUpdated: false,
      canonicalDocs: [],
      providerProofUpdated: false,
      at: "",
    },
  });
  (browserObservationValue.capabilities as Array<Record<string, unknown>>).find((entry) => entry.id === "authenticated-browser")!.modes = ["observe"];
  writeLedger(browserObservation, browserObservationValue);
  reconcileFixture(browserObservation, browserObservationValue);
  runFixture("authenticated browser provider observation does not require research provenance", browserObservation, "check-agent-operations.ts", 0);

  const reused = makeFixture("agent-operations-one-shot-reused");
  writeProofFiles(reused);
  const reusedValue = completeLedger(reused);
  const reusedActions = reusedValue.actions as Array<Record<string, unknown>>;
  reusedActions.push({ ...reusedActions[0], id: "ACT-asc-draft-second" });
  writeLedger(reused, reusedValue);
  reconcileFixture(reused, reusedValue);
  runFixture("one-shot approval cannot authorize two attempts", reused, "check-agent-operations.ts", 1, "one_shot_reused");

  const failedUnauthorized = makeFixture("agent-operations-failed-unauthorized");
  writeProofFiles(failedUnauthorized);
  const failedUnauthorizedValue = completeLedger(failedUnauthorized);
  failedUnauthorizedValue.approvalEnvelopes = [];
  const failedAction = (failedUnauthorizedValue.actions as Array<Record<string, unknown>>)[0]!;
  (failedAction.result as Record<string, unknown>).status = "failed";
  writeLedger(failedUnauthorized, failedUnauthorizedValue);
  reconcileFixture(failedUnauthorized, failedUnauthorizedValue);
  runFixture("failed risky attempt still requires scoped approval", failedUnauthorized, "check-agent-operations.ts", 1, "approval_missing_or_mismatched");

  const secretHuman = makeFixture("agent-operations-secret-human-log");
  writeFileSync(
    path.join(secretHuman, "operations/AGENT_OPERATIONS.md"),
    `${readFileSync(path.join(secretHuman, "operations/AGENT_OPERATIONS.md"), "utf8")}\npassword: \"do-not-store-me\"\n`,
    "utf8",
  );
  runFixture("raw secret in human operations log fails", secretHuman, "check-agent-operations.ts", 1, "raw_secret_detected");

  const secretProof = makeFixture("agent-operations-secret-proof");
  writeProofFiles(secretProof);
  const secretProofValue = completeLedger(secretProof);
  writeFileSync(path.join(secretProof, "operations", "proof", "after.txt"), 'token: "never-store-this-value"\n', "utf8");
  writeLedger(secretProof, secretProofValue);
  reconcileFixture(secretProof, secretProofValue);
  runFixture("raw secret in referenced proof fails", secretProof, "check-agent-operations.ts", 1, "raw_secret_detected");

  const ascContract = makeEmptyFixture("asc-command-contract");
  mkdirSync(path.join(ascContract, "knowledge", "store"), { recursive: true });
  const currentAscCommands = [
    "asc install-skills",
    "asc telemetry status",
    "asc-analytics-reports",
    "asc-ad-hoc-distribution",
    "asc apps view --id APP_ID",
    "asc status --app APP_ID",
    "asc review status --app APP_ID",
    "asc review doctor --app APP_ID",
    "asc review submissions-list --app APP_ID",
    "asc age-rating audit --app APP_ID",
    "asc optimize keywords rank",
    "asc optimize keywords discover",
    "asc optimize keywords score",
    "asc subscriptions pricing derive --dry-run",
    "asc diff localizations --app APP_ID",
    "asc metadata validate",
    "asc web agreements status",
    "asc web auth status",
    "asc web review show",
    "asc validate --app APP_ID --version VERSION_STRING or --version-id <VERSION_ID>",
  ].join("\n");
  writeFileSync(path.join(ascContract, "knowledge", "store", "app-store-connect-cli.md"), currentAscCommands, "utf8");
  runScriptArgs("current ASC command contract passes", "check-asc-command-contract.ts", ["--skill-root", ascContract], 0);
  writeFileSync(path.join(ascContract, "knowledge", "store", "app-store-connect-cli.md"), `${currentAscCommands}\nasc apps get --id APP_ID\n`, "utf8");
  runScriptArgs(
    "known-invalid ASC command fails",
    "check-asc-command-contract.ts",
    ["--skill-root", ascContract],
    1,
    "asc_command_contract.stale_asc_apps_get",
  );
}

function readLedger(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, "operations", "agent-operations.json"), "utf8")) as Record<string, unknown>;
}

function writeLedger(root: string, ledger: Record<string, unknown>): void {
  writeFileSync(path.join(root, "operations", "agent-operations.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
}

function writeProofFiles(root: string): void {
  const proofDir = path.join(root, "operations", "proof");
  mkdirSync(proofDir, { recursive: true });
  writeFileSync(path.join(proofDir, "before.txt"), "Sanitized draft metadata before state.\n", "utf8");
  writeFileSync(path.join(proofDir, "after.txt"), "Sanitized draft metadata after state and provider read-back.\n", "utf8");
}

function completeLedger(root: string, now = new Date().toISOString(), expiresAt = "2099-01-01T00:00:00.000Z"): Record<string, unknown> {
  const ledger = readLedger(root);
  ledger.status = "active";
  ledger.updatedAt = now;
  ledger.capabilityCheckedAt = now;
  const capabilities = ledger.capabilities as Array<Record<string, unknown>>;
  const browser = capabilities.find((entry) => entry.kind === "browser");
  if (browser) {
    browser.provider = "App Store Connect";
    browser.status = "available";
    browser.checkedAt = now;
    browser.account = "founder@example.invalid";
    browser.team = "Example Team";
    browser.project = "Example App";
    browser.environment = "production console";
    browser.modes = ["observe", "draft", "mutate"];
  }
  ledger.approvalEnvelopes = [
    {
      id: "APR-asc-draft",
      provider: "App Store Connect",
      account: "founder@example.invalid",
      team: "Example Team",
      project: "Example App",
      environment: "production console",
      actionClasses: ["mutate"],
      operations: ["metadata.draft.edit"],
      resourcePatterns: ["apps/Example App/versions/*/localizations/*"],
      payloadDigests: [DIGEST],
      exclusions: ["submission.*", "release.*", "pricing.*", "privacy.*"],
      mode: "one_shot",
      basis: "Current founder request authorizes one reversible draft metadata edit",
      approvedAt: now,
      expiresAt,
      status: "consumed",
      consumedByActionIds: ["ACT-asc-draft"],
      revokedAt: "",
      spendCeiling: null,
      voicePolicy: "",
    },
  ];
  ledger.actions = [
    {
      id: "ACT-asc-draft",
      class: "mutate",
      purpose: "provider_mutation",
      operation: "metadata.draft.edit",
      resource: "apps/Example App/versions/1.0/localizations/en-US",
      capabilityId: "authenticated-browser",
      occurredAt: now,
      surface: "App Store Connect draft metadata",
      provider: "App Store Connect",
      route: "browser",
      account: "founder@example.invalid",
      team: "Example Team",
      project: "Example App",
      environment: "production console",
      payloadDigest: DIGEST,
      contentDigest: "",
      spendAmount: null,
      currency: "",
      riskClass: "medium",
      voicePolicy: "",
      authorization: { approvalId: "APR-asc-draft", basis: "Current founder request exact scope" },
      preflight: {
        targetVerified: true,
        beforeState: "Correct team, app, version, locale, and draft field verified",
        evidencePath: "operations/proof/before.txt",
      },
      result: {
        status: "succeeded",
        externalId: "draft-localization-example",
        afterState: "Provider read-back matches the approved draft copy",
        evidencePath: "operations/proof/after.txt",
        rollbackOrRecovery: "Restore the before-state copy from the sanitized proof packet",
      },
      redactionAttested: true,
      reconciliation: {
        projectStateUpdated: true,
        canonicalDocs: ["store/STORE_CONSOLE.md", "operations/AGENT_OPERATIONS.md"],
        providerProofUpdated: true,
        at: now,
      },
    },
  ];
  return ledger;
}

function appendObserveAction(ledger: Record<string, unknown>): void {
  const actions = ledger.actions as Array<Record<string, unknown>>;
  const source = actions[0]!;
  actions.push({
    id: "ACT-observe-later",
    class: "observe",
    purpose: "operational_observation",
    operation: "metadata.draft.observe",
    resource: source.resource,
    capabilityId: source.capabilityId,
    occurredAt: source.occurredAt,
    surface: source.surface,
    provider: source.provider,
    route: source.route,
    account: source.account,
    team: source.team,
    project: source.project,
    environment: source.environment,
    payloadDigest: "",
    contentDigest: "",
    spendAmount: null,
    currency: "",
    riskClass: "low",
    voicePolicy: "",
    authorization: { approvalId: "", basis: "Read-only provider inspection requested by founder" },
    preflight: {
      targetVerified: true,
      beforeState: "Draft metadata visible",
      evidencePath: "operations/proof/before.txt",
    },
    result: {
      status: "succeeded",
      externalId: "",
      afterState: "Observed the draft after mutate",
      evidencePath: "operations/proof/after.txt",
      rollbackOrRecovery: "No mutation",
    },
    redactionAttested: true,
    reconciliation: {
      projectStateUpdated: false,
      canonicalDocs: [],
      providerProofUpdated: false,
      at: "",
    },
  });
}

function reconcileFixture(root: string, ledger: Record<string, unknown>, options: { writeCurrentTruth?: boolean; currentTruthReceiptId?: string } = {}): void {
  const actions = ledger.actions as Array<Record<string, unknown>>;
  const latest = actions.at(-1)!;
  const latestId = String(latest.id);
  const result = latest.result as Record<string, unknown>;
  const humanPath = path.join(root, "operations/AGENT_OPERATIONS.md");
  writeFileSync(
    humanPath,
    `${readFileSync(humanPath, "utf8").replace(/^Status:.*$/m, `Status: ${String(ledger.status)}`)}\n| ${latestId} | mutate | exact fixture target | browser | APR-asc-draft | sanitized before/after | ${String(result.status)} | yes |\n`,
    "utf8",
  );
  for (const relative of ["store/STORE_CONSOLE.md", "operations/PROVIDER_PROOF.md"]) {
    const fullPath = path.join(root, relative);
    const existing = readFileSync(fullPath, "utf8");
    writeFileSync(fullPath, `${existing}\nAgent operation proof: ${latestId}.\n`, "utf8");
  }
  const writeCurrentTruth = options.writeCurrentTruth !== false;
  const receiptSource = selectLatestSucceededRiskyAction(actions);
  if (writeCurrentTruth && receiptSource) {
    const receipt = receiptFromAgentAction(receiptSource);
    if (receipt) {
      const now = String(receiptSource.occurredAt ?? ledger.updatedAt ?? new Date().toISOString());
      const result = reconcileCurrentTruth(undefined, receipt, now);
      if (result.kind === "committed") {
        const document = {
          ...result.document,
          lastReceiptId: options.currentTruthReceiptId ?? result.document.lastReceiptId,
        };
        mkdirSync(path.join(root, "state"), { recursive: true });
        writeFileSync(path.join(root, "state", "current-truth.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
      }
    }
  }
}
