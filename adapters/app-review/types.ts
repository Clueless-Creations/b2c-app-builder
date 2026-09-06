/**
 * App Review state contract (issue #212 Slice 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4).
 *
 * Three Apple layers stay separate. Raw provider values persist. Unknown states
 * stay `unknown_provider_state`. This module never collapses layers into one
 * approved boolean. Phase 1 adds a quarantined rejection packet, web-session
 * readiness, and typed classification. Phase 2 adds signed webhook wake-up.
 * A webhook payload is not layer truth. Phase 3 adds a bounded remediation
 * plan, consumer-repo implementation, verification rejection recovery, and
 * archive inspection. Phase 4 adds a capped resubmission loop behind an exact
 * standing envelope. Observe mandates still refuse `asc review submit`.
 * Readers validate the current state contract before using its authority.
 */

export const APP_REVIEW_SCHEMA_VERSION = "1.4.0";
export const APP_REVIEW_REMEDIATE_WORKFLOW_ID = "workflow.store.app-review-remediate";
export const APP_REVIEW_RESUBMIT_WORKFLOW_ID = "workflow.store.app-review-resubmit";
export const APP_REVIEW_RESUBMIT_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
export const APP_REVIEW_RESUBMIT_DEFAULT_MAX_CYCLES = 3;

export const APP_REVIEW_CAPABILITY_IDS = [
  "asc.version",
  "asc.capabilities",
  "asc.review.status",
  "asc.metadata.validate",
  "asc.metadata.push.dry_run",
  "asc.web.agreements.status",
] as const;

export type AppReviewCapabilityId = (typeof APP_REVIEW_CAPABILITY_IDS)[number];

export const APP_REVIEW_WEB_SESSION_CAPABILITY_IDS = ["asc.web.auth.status", "asc.web.review.list", "asc.web.review.show"] as const;

export type AppReviewWebSessionCapabilityId = (typeof APP_REVIEW_WEB_SESSION_CAPABILITY_IDS)[number];

export const APP_REVIEW_WEBHOOK_OPERATION_IDS = ["asc.webhooks.list", "asc.webhooks.view", "asc.webhooks.ping", "asc.webhooks.deliveries"] as const;

export type AppReviewWebhookOperationId = (typeof APP_REVIEW_WEBHOOK_OPERATION_IDS)[number];

export const APP_REVIEW_SCHEMA_IDS = ["APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "AppStoreVersion", "ReviewSubmission", "ReviewSubmissionItem"] as const;

export type AppReviewSchemaId = (typeof APP_REVIEW_SCHEMA_IDS)[number];

export const ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS = [
  "asc web agreements accept",
  "asc webhooks serve",
  "asc webhooks serve --allow-remote",
  "asc publish appstore --submit",
] as const;

export const OBSERVE_FORBIDDEN_APP_REVIEW_COMMANDS = [...ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS, "asc review submit"] as const;

export const FORBIDDEN_APP_REVIEW_COMMANDS = OBSERVE_FORBIDDEN_APP_REVIEW_COMMANDS;

export type AlwaysForbiddenAppReviewCommand = (typeof ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS)[number];
export type ForbiddenAppReviewCommand = (typeof FORBIDDEN_APP_REVIEW_COMMANDS)[number];

export const OBSERVE_APP_REVIEW_COMMANDS = [
  "asc --version",
  "asc capabilities",
  "asc review status",
  "asc metadata validate",
  "asc metadata push --dry-run",
  "asc web agreements status",
  "asc web auth status",
  "asc web review list",
  "asc web review show",
  "asc webhooks list",
  "asc webhooks view",
  "asc webhooks ping",
  "asc webhooks deliveries",
] as const;

export type AppReviewMandateMode = "observe" | "resubmit";
export type AppReviewMandateStatus = "active" | "expired" | "revoked";
export type AppReviewPlatform = "IOS" | "MAC_OS" | "TV_OS" | "VISION_OS";

export type AppReviewLayerKind = "app_version" | "review_submission" | "submission_item";

export type AppVersionNormalized =
  | "prepare"
  | "ready_for_review"
  | "waiting_for_review"
  | "in_review"
  | "waiting_for_export_compliance"
  | "invalid_binary"
  | "rejected"
  | "metadata_rejected"
  | "developer_rejected"
  | "pending_developer_release"
  | "pending_apple_release"
  | "processing"
  | "ready_for_distribution"
  | "ready_for_sale"
  | "removed"
  | "replaced"
  | "accepted"
  | "unknown_provider_state";

export type ReviewSubmissionNormalized =
  "ready_for_review" | "waiting_for_review" | "in_review" | "unresolved_issues" | "canceling" | "completing" | "complete" | "unknown_provider_state";

export type SubmissionItemNormalized = "ready_for_review" | "waiting_for_review" | "in_review" | "accepted" | "rejected" | "removed" | "unknown_provider_state";

export type AppReviewNormalized = AppVersionNormalized | ReviewSubmissionNormalized | SubmissionItemNormalized;

export type AgreementNormalized = "none" | "pending" | "unknown";

export type AppReviewBlocker =
  | "none"
  | "unknown_provider_state"
  | "capability_missing"
  | "capability_shape_changed"
  | "founder_action_required"
  | "web_session_required"
  | "evidence_incomplete"
  | "unresolved_issues"
  | "rejected"
  | "metadata_rejected"
  | "invalid_binary"
  | "pending_developer_release";

export type AppReviewCaseStatus = "observing" | "blocked" | "closed";

export type AppReviewEventKind =
  | "observation"
  | "duplicate_ignored"
  | "out_of_order_ignored"
  | "capability_probe"
  | "packet_recorded"
  | "handoff_recorded"
  | "webhook_accepted"
  | "webhook_duplicate_ignored"
  | "webhook_unknown_payload"
  | "plan_recorded"
  | "implementation_applied"
  | "verification_recorded"
  | "archive_inspected"
  | "parked"
  | "resubmit_authorized"
  | "resubmit_recorded"
  | "resubmit_timeout_readback"
  | "cycle_opened"
  | "cycle_exhausted"
  | "review_accepted";

export type AppReviewFounderBlockerKind = "none" | "unknown" | "capability" | "agreement" | "review";

export type AppReviewWebhookIngressMode = "poll_only" | "signed_receiver";

export type AppReviewWebhookHealth = "poll_only" | "unregistered" | "healthy" | "silent" | "unknown_payload";

export type AppReviewWebSessionStatus = "resumable" | "missing" | "expired" | "unknown";

export type AppReviewAuthHandoff = "none" | "web_session_required" | "public_api_required";

export type AppReviewClassificationKind =
  | "none"
  | "metadata_rejected"
  | "invalid_binary"
  | "missing_review_information"
  | "privacy_data_disclosure"
  | "payments_subscriptions"
  | "login_review_access"
  | "legal_policy"
  | "product_scope_disagreement"
  | "unclear_conflicting";

export type AppReviewClassificationConfidence = "high" | "medium" | "low";

export type AppReviewClassificationRationale = "layer_state" | "structured_reason" | "unclear";

export type AppReviewImplementationStatus = "not_started" | "planned" | "applied" | "verified" | "parked" | "verification_rejected";

export type AppReviewRemediationRoute = "none" | "same_build_metadata" | "new_binary" | "review_notes" | "review_access" | "parked";

export type AppReviewRemediationDisposition = "implement" | "park";

export type AppReviewParkReason = "legal_policy" | "product_scope" | "privacy_promise" | "payments" | "unclear" | "protected_policy";

export type AppReviewOccurrenceStatus = "authorized" | "running" | "proved" | "exhausted" | "refused";

export type AppReviewResubmissionStatus =
  "not_started" | "authorized" | "awaiting_readback" | "submitted" | "timed_out" | "accepted" | "rejected_again" | "exhausted" | "refused";

export type AppReviewPacketIncompleteReason = "web_session_missing" | "web_session_capability" | "packet_mismatch" | "download_failed" | "untrusted_path";

export type AppReviewPacketSelection = "explicit" | "latest-unresolved" | "latest" | "unknown";

export interface AppReviewCapabilityProbe {
  readonly id: AppReviewCapabilityId;
  readonly available: boolean;
  readonly shapeOk: boolean;
  readonly evidence: string;
}

export interface AppReviewWebSessionCapabilityProbe {
  readonly id: AppReviewWebSessionCapabilityId;
  readonly available: boolean;
  readonly shapeOk: boolean;
  readonly evidence: string;
}

export interface AppReviewSchemaProbe {
  readonly id: AppReviewSchemaId;
  readonly available: boolean;
}

export interface AppReviewWebSessionReceipt {
  readonly capabilities: readonly AppReviewWebSessionCapabilityProbe[];
  readonly failClosed: boolean;
}

export interface AppReviewWebhookOperationProbe {
  readonly id: AppReviewWebhookOperationId;
  readonly available: boolean;
  readonly shapeOk: boolean;
  readonly evidence: string;
}

export interface AppReviewWebhookOperationsReceipt {
  readonly capabilities: readonly AppReviewWebhookOperationProbe[];
  readonly failClosed: boolean;
}

export interface AppReviewWebhookRegistration {
  readonly resourceId: string;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly urlDigest: string;
  readonly observedAt: string;
}

export interface AppReviewWebhookLastEnvelope {
  readonly providerEventId: string;
  readonly eventType: string;
  readonly providerTimestamp: string;
  readonly rawBodySha256: string;
  readonly receivedAt: string;
  readonly secretId: string;
}

export interface AppReviewWebhookIngress {
  readonly mode: AppReviewWebhookIngressMode;
  readonly health: AppReviewWebhookHealth;
  readonly operations: AppReviewWebhookOperationsReceipt;
  readonly acceptedEventIds: readonly string[];
  readonly registration?: AppReviewWebhookRegistration;
  readonly lastVerifiedAt?: string;
  readonly lastEnvelope?: AppReviewWebhookLastEnvelope;
}

export interface AppReviewCapabilityReceipt {
  readonly observedCliVersion: string;
  readonly probedAt: string;
  readonly capabilities: readonly AppReviewCapabilityProbe[];
  readonly schemas: readonly AppReviewSchemaProbe[];
  readonly failClosed: boolean;
  readonly webSession: AppReviewWebSessionReceipt;
}

export interface AppReviewMandate {
  readonly mandateId: string;
  readonly mode: AppReviewMandateMode;
  readonly status: AppReviewMandateStatus;
  readonly appleTeamId: string;
  readonly appId: string;
  readonly bundleId: string;
  readonly platform: AppReviewPlatform;
  readonly marketingVersion: string;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly forbiddenCommands: readonly ForbiddenAppReviewCommand[];
  readonly maxCycles?: number;
  readonly resubmitEnvelope?: AppReviewResubmitEnvelope;
}

export interface AppReviewLayerObservation {
  readonly layer: AppReviewLayerKind;
  readonly rawValue: string;
  readonly providerObjectId: string;
  readonly observedAt: string;
  readonly cliVersion: string;
  readonly schemaId: AppReviewSchemaId;
  readonly normalized: AppReviewNormalized;
}

export interface AppReviewAgreementObservation {
  readonly rawStatus: string;
  readonly pending: boolean;
  readonly normalized: AgreementNormalized;
}

export interface AppReviewAuthReadiness {
  readonly publicApiReady: boolean;
  readonly webSessionReady: boolean;
  readonly webSessionStatus: AppReviewWebSessionStatus;
  readonly handoff: AppReviewAuthHandoff;
  readonly probedAt: string;
}

export interface AppReviewMessageEvidence {
  readonly messageId: string;
  readonly threadId: string;
  readonly fromReviewer: boolean;
  readonly createdAt?: string;
  readonly bodyFingerprint: string;
  readonly bodyByteLength: number;
  readonly attachmentIds: readonly string[];
  readonly rejectionIds: readonly string[];
}

export interface AppReviewReasonEvidence {
  readonly reasonId: string;
  readonly guidelineSection?: string;
  readonly reasonCode?: string;
  readonly summaryFingerprint: string;
  readonly relatedItemIds: readonly string[];
}

export interface AppReviewAttachmentEvidence {
  readonly attachmentId: string;
  readonly sourceType: string;
  readonly originalFileNameFingerprint: string;
  readonly storedRelativePath: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly downloadFailed: boolean;
  readonly pathRejected: boolean;
}

export interface AppReviewRejectionPacket {
  readonly packetId: string;
  readonly appId: string;
  readonly submissionId: string;
  readonly selection: AppReviewPacketSelection;
  readonly selectionIsDurable: boolean;
  readonly retrievedAt: string;
  readonly cliVersion: string;
  readonly packetFingerprint: string;
  readonly incomplete: boolean;
  readonly incompleteReason?: AppReviewPacketIncompleteReason;
  readonly evidenceDirectory?: string;
  readonly threads: readonly { readonly threadId: string; readonly messageIds: readonly string[] }[];
  readonly messages: readonly AppReviewMessageEvidence[];
  readonly reasons: readonly AppReviewReasonEvidence[];
  readonly attachments: readonly AppReviewAttachmentEvidence[];
}

export interface AppReviewClassification {
  readonly kind: AppReviewClassificationKind;
  readonly confidence: AppReviewClassificationConfidence;
  readonly citedFingerprints: readonly string[];
  readonly affectedItemIds: readonly string[];
  readonly newBuildRequired: boolean;
  readonly implementationStatus: AppReviewImplementationStatus;
  readonly rationaleKind: AppReviewClassificationRationale;
}

export interface AppReviewConsumerPatch {
  readonly relativePath: string;
  readonly kind: "create" | "replace";
  readonly contents: string;
}

export interface AppReviewRemediationPlan {
  readonly planId: string;
  readonly route: AppReviewRemediationRoute;
  readonly disposition: AppReviewRemediationDisposition;
  readonly parkReason?: AppReviewParkReason;
  readonly newBinaryRequired: boolean;
  readonly citedGuideline?: string;
  readonly affectedPaths: readonly string[];
  readonly patches: readonly AppReviewConsumerPatch[];
  readonly testsAndValidators: readonly string[];
  readonly authorizationNeeded: readonly string[];
  readonly rollback: string;
}

export interface AppReviewRemediationOccurrence {
  readonly workflowId: typeof APP_REVIEW_REMEDIATE_WORKFLOW_ID;
  readonly occurrenceId: string;
  readonly attemptNumber: number;
  readonly attemptIds: readonly string[];
  readonly status: AppReviewOccurrenceStatus;
}

export interface AppReviewConsumerImplementation {
  readonly sourceRevision: string;
  readonly appliedPaths: readonly string[];
  readonly appliedAt: string;
  readonly producerSessionId: string;
}

export interface AppReviewArchiveInspection {
  readonly archiveRelativePath: string;
  readonly bundleId: string;
  readonly marketingVersion: string;
  readonly buildNumber: string;
  readonly infoPlistSha256: string;
  readonly inspectedAt: string;
}

export interface AppReviewMetadataPreflight {
  readonly validatePassed: boolean;
  readonly dryRunPassed: boolean;
  readonly evidenceFingerprint: string;
}

export interface AppReviewVerificationRecord {
  readonly producerSessionId: string;
  readonly verifierSessionId: string;
  readonly accepted: boolean;
  readonly recordedAt: string;
}

export interface AppReviewResubmitEnvelope {
  readonly appId: string;
  readonly appStoreVersionId: string;
  readonly marketingVersion: string;
  readonly maxCycles: number;
  readonly alreadyUploaded: boolean;
  readonly confirm: true;
  readonly authorizedAt: string;
  readonly authorizedBy: string;
}

export interface AppReviewResubmitOccurrence {
  readonly workflowId: typeof APP_REVIEW_RESUBMIT_WORKFLOW_ID;
  readonly occurrenceId: string;
  readonly cycleNumber: number;
  readonly status: AppReviewOccurrenceStatus;
}

export interface AppReviewResubmission {
  readonly status: AppReviewResubmissionStatus;
  readonly envelope: AppReviewResubmitEnvelope;
  readonly envelopeFingerprint: string;
  readonly occurrence: AppReviewResubmitOccurrence;
  readonly command?: string;
  readonly submittedAt?: string;
  readonly timeoutAt?: string;
  readonly readbackAt?: string;
}

export interface AppReviewRemediation {
  readonly status: AppReviewImplementationStatus;
  readonly plan: AppReviewRemediationPlan;
  readonly occurrence: AppReviewRemediationOccurrence;
  readonly consumer?: AppReviewConsumerImplementation;
  readonly archive?: AppReviewArchiveInspection;
  readonly metadataPreflight?: AppReviewMetadataPreflight;
  readonly verification?: AppReviewVerificationRecord;
}

export interface AppReviewEvent {
  readonly eventId: string;
  readonly mandateId: string;
  readonly kind: AppReviewEventKind;
  readonly providerEventId?: string;
  readonly providerTimestamp: string;
  readonly recordedAt: string;
  readonly snapshotFingerprint: string;
  readonly layers: readonly AppReviewLayerObservation[];
  readonly agreement: AppReviewAgreementObservation;
}

export interface AppReviewCase {
  readonly caseId: string;
  readonly mandateId: string;
  readonly parentCaseId?: string;
  readonly cycleNumber: number;
  readonly status: AppReviewCaseStatus;
  readonly blocker: AppReviewBlocker;
  readonly appVersion: AppReviewLayerObservation;
  readonly reviewSubmission?: AppReviewLayerObservation;
  readonly submissionItems: readonly AppReviewLayerObservation[];
  readonly lastEventId: string;
  readonly lastProviderTimestamp: string;
  readonly authReadiness: AppReviewAuthReadiness;
  readonly rejectionPacket?: AppReviewRejectionPacket;
  readonly classification: AppReviewClassification;
  readonly remediation?: AppReviewRemediation;
  readonly resubmission?: AppReviewResubmission;
}

export interface AppReviewState {
  readonly schemaVersion: typeof APP_REVIEW_SCHEMA_VERSION;
  readonly updatedAt: string;
  readonly mandate: AppReviewMandate;
  readonly capabilityReceipt: AppReviewCapabilityReceipt;
  readonly events: readonly AppReviewEvent[];
  readonly currentCase: AppReviewCase;
  readonly webhookIngress: AppReviewWebhookIngress;
}

export interface AppReviewLayerInput {
  readonly layer: AppReviewLayerKind;
  readonly rawValue: string;
  readonly providerObjectId: string;
  readonly schemaId: AppReviewSchemaId;
}

export interface AppReviewSnapshot {
  readonly providerTimestamp: string;
  readonly providerEventId?: string;
  readonly layers: readonly AppReviewLayerInput[];
  readonly agreement: { readonly rawStatus: string; readonly pending: boolean };
}

export interface AppReviewFounderProjection {
  readonly summary: string;
  readonly watchActive: boolean;
  readonly needsFounderAction: boolean;
  readonly blockerKind: AppReviewFounderBlockerKind;
  readonly caseLines: readonly string[];
}

export interface ApplyAppReviewResult {
  readonly state: AppReviewState;
  readonly applied: boolean;
  readonly reason:
    | "recorded"
    | "duplicate_ignored"
    | "out_of_order_ignored"
    | "packet_recorded"
    | "handoff_recorded"
    | "plan_recorded"
    | "implementation_applied"
    | "verification_recorded"
    | "archive_inspected"
    | "parked"
    | "resubmit_authorized"
    | "resubmit_recorded"
    | "resubmit_timeout_readback"
    | "cycle_opened"
    | "cycle_exhausted"
    | "review_accepted"
    | "refused";
}
