import type {
  AppReviewAgreementObservation,
  AppReviewAuthReadiness,
  AppReviewBlocker,
  AppReviewCapabilityReceipt,
  AppReviewLayerInput,
  AppReviewLayerKind,
  AppReviewLayerObservation,
  AppReviewNormalized,
  AppReviewRejectionPacket,
  AppVersionNormalized,
  ReviewSubmissionNormalized,
  SubmissionItemNormalized,
} from "./types.js";

const APP_VERSION_MAP: Readonly<Record<string, AppVersionNormalized>> = {
  PREPARE_FOR_SUBMISSION: "prepare",
  READY_FOR_REVIEW: "ready_for_review",
  WAITING_FOR_REVIEW: "waiting_for_review",
  IN_REVIEW: "in_review",
  WAITING_FOR_EXPORT_COMPLIANCE: "waiting_for_export_compliance",
  INVALID_BINARY: "invalid_binary",
  REJECTED: "rejected",
  METADATA_REJECTED: "metadata_rejected",
  DEVELOPER_REJECTED: "developer_rejected",
  PENDING_DEVELOPER_RELEASE: "pending_developer_release",
  PENDING_APPLE_RELEASE: "pending_apple_release",
  PROCESSING_FOR_APP_STORE: "processing",
  PROCESSING_FOR_DISTRIBUTION: "processing",
  READY_FOR_DISTRIBUTION: "ready_for_distribution",
  READY_FOR_SALE: "ready_for_sale",
  REMOVED_FROM_SALE: "removed",
  DEVELOPER_REMOVED_FROM_SALE: "removed",
  REPLACED_WITH_NEW_VERSION: "replaced",
  ACCEPTED: "accepted",
};

const REVIEW_SUBMISSION_MAP: Readonly<Record<string, ReviewSubmissionNormalized>> = {
  READY_FOR_REVIEW: "ready_for_review",
  WAITING_FOR_REVIEW: "waiting_for_review",
  IN_REVIEW: "in_review",
  UNRESOLVED_ISSUES: "unresolved_issues",
  CANCELING: "canceling",
  COMPLETING: "completing",
  COMPLETE: "complete",
};

const SUBMISSION_ITEM_MAP: Readonly<Record<string, SubmissionItemNormalized>> = {
  READY_FOR_REVIEW: "ready_for_review",
  WAITING_FOR_REVIEW: "waiting_for_review",
  IN_REVIEW: "in_review",
  ACCEPTED: "accepted",
  APPROVED: "accepted",
  REJECTED: "rejected",
  REMOVED: "removed",
};

export function normalizeAppVersionState(rawValue: string): AppVersionNormalized {
  return APP_VERSION_MAP[rawValue] ?? "unknown_provider_state";
}

export function normalizeReviewSubmissionState(rawValue: string): ReviewSubmissionNormalized {
  return REVIEW_SUBMISSION_MAP[rawValue] ?? "unknown_provider_state";
}

export function normalizeSubmissionItemState(rawValue: string): SubmissionItemNormalized {
  return SUBMISSION_ITEM_MAP[rawValue] ?? "unknown_provider_state";
}

export function normalizeLayerValue(layer: AppReviewLayerKind, rawValue: string): AppReviewNormalized {
  switch (layer) {
    case "app_version":
      return normalizeAppVersionState(rawValue);
    case "review_submission":
      return normalizeReviewSubmissionState(rawValue);
    case "submission_item":
      return normalizeSubmissionItemState(rawValue);
    default: {
      const exhaustive: never = layer;
      throw new Error(`Unhandled App Review layer ${String(exhaustive)}`);
    }
  }
}

export function normalizeAgreement(input: { rawStatus: string; pending: boolean }): AppReviewAgreementObservation {
  const raw = input.rawStatus.trim();
  if (raw.length === 0) {
    return { rawStatus: raw, pending: input.pending, normalized: "unknown" };
  }
  if (/^unobserved$/i.test(raw)) {
    return { rawStatus: raw, pending: false, normalized: "none" };
  }
  if (input.pending || /^pending$/i.test(raw)) {
    return { rawStatus: raw, pending: true, normalized: "pending" };
  }
  if (/^(none|signed|accepted|complete|not_pending)$/i.test(raw)) {
    return { rawStatus: raw, pending: false, normalized: "none" };
  }
  return { rawStatus: raw, pending: input.pending, normalized: "unknown" };
}

export function observeLayer(
  input: AppReviewLayerInput,
  observedAt: string,
  cliVersion: string,
): AppReviewLayerObservation {
  return {
    layer: input.layer,
    rawValue: input.rawValue,
    providerObjectId: input.providerObjectId,
    observedAt,
    cliVersion,
    schemaId: input.schemaId,
    normalized: normalizeLayerValue(input.layer, input.rawValue),
  };
}

function capabilityBlocker(receipt: AppReviewCapabilityReceipt): AppReviewBlocker | undefined {
  for (const probe of receipt.capabilities) {
    if (!probe.available) return "capability_missing";
  }
  for (const schema of receipt.schemas) {
    if (!schema.available) return "capability_missing";
  }
  for (const probe of receipt.capabilities) {
    if (!probe.shapeOk) return "capability_shape_changed";
  }
  return undefined;
}

function versionBlocker(normalized: AppVersionNormalized): AppReviewBlocker {
  switch (normalized) {
    case "unknown_provider_state":
      return "unknown_provider_state";
    case "invalid_binary":
      return "invalid_binary";
    case "rejected":
    case "developer_rejected":
      return "rejected";
    case "metadata_rejected":
      return "metadata_rejected";
    case "pending_developer_release":
      return "pending_developer_release";
    case "prepare":
    case "ready_for_review":
    case "waiting_for_review":
    case "in_review":
    case "waiting_for_export_compliance":
    case "pending_apple_release":
    case "processing":
    case "ready_for_distribution":
    case "ready_for_sale":
    case "removed":
    case "replaced":
    case "accepted":
      return "none";
    default: {
      const exhaustive: never = normalized;
      throw new Error(`Unhandled app-version state ${String(exhaustive)}`);
    }
  }
}

function submissionBlocker(normalized: ReviewSubmissionNormalized): AppReviewBlocker {
  switch (normalized) {
    case "unknown_provider_state":
      return "unknown_provider_state";
    case "unresolved_issues":
      return "unresolved_issues";
    case "ready_for_review":
    case "waiting_for_review":
    case "in_review":
    case "canceling":
    case "completing":
    case "complete":
      return "none";
    default: {
      const exhaustive: never = normalized;
      throw new Error(`Unhandled review-submission state ${String(exhaustive)}`);
    }
  }
}

function itemBlocker(normalized: SubmissionItemNormalized): AppReviewBlocker {
  switch (normalized) {
    case "unknown_provider_state":
      return "unknown_provider_state";
    case "rejected":
      return "rejected";
    case "ready_for_review":
    case "waiting_for_review":
    case "in_review":
    case "accepted":
    case "removed":
      return "none";
    default: {
      const exhaustive: never = normalized;
      throw new Error(`Unhandled submission-item state ${String(exhaustive)}`);
    }
  }
}

function firstNonNone(blockers: readonly AppReviewBlocker[]): AppReviewBlocker {
  for (const blocker of blockers) {
    if (blocker !== "none") return blocker;
  }
  return "none";
}

export function observationNeedsRejectionPacket(
  layers: readonly AppReviewLayerObservation[],
  agreement: AppReviewAgreementObservation,
  receipt: AppReviewCapabilityReceipt,
): boolean {
  if (receipt.failClosed) return false;
  if (agreement.normalized === "pending" || agreement.normalized === "unknown") return false;
  const unknownLayer = layers.find((layer) => layer.normalized === "unknown_provider_state");
  if (unknownLayer) return false;
  const appVersion = layers.find((layer) => layer.layer === "app_version");
  const submission = layers.find((layer) => layer.layer === "review_submission");
  const items = layers.filter((layer) => layer.layer === "submission_item");
  if (appVersion && (appVersion.normalized === "rejected" || appVersion.normalized === "metadata_rejected" || appVersion.normalized === "invalid_binary")) {
    return true;
  }
  if (submission && submission.normalized === "unresolved_issues") return true;
  return items.some((item) => item.normalized === "rejected");
}

export function deriveBlocker(
  receipt: AppReviewCapabilityReceipt,
  layers: readonly AppReviewLayerObservation[],
  agreement: AppReviewAgreementObservation,
  auth?: AppReviewAuthReadiness,
  packet?: AppReviewRejectionPacket,
): AppReviewBlocker {
  const fromCapability = capabilityBlocker(receipt);
  if (fromCapability) return fromCapability;
  if (agreement.normalized === "unknown") return "unknown_provider_state";

  const unknownLayer = layers.find((layer) => layer.normalized === "unknown_provider_state");
  if (unknownLayer) return "unknown_provider_state";

  if (agreement.normalized === "pending") return "founder_action_required";

  const packetNeeded = observationNeedsRejectionPacket(layers, agreement, receipt);
  if (packetNeeded && auth && !auth.webSessionReady) return "web_session_required";
  if (packetNeeded && packet?.incomplete) return "evidence_incomplete";

  const appVersion = layers.find((layer) => layer.layer === "app_version");
  const submission = layers.find((layer) => layer.layer === "review_submission");
  const items = layers.filter((layer) => layer.layer === "submission_item");

  return firstNonNone([
    appVersion ? versionBlocker(appVersion.normalized as AppVersionNormalized) : "unknown_provider_state",
    submission ? submissionBlocker(submission.normalized as ReviewSubmissionNormalized) : "none",
    ...items.map((item) => itemBlocker(item.normalized as SubmissionItemNormalized)),
  ]);
}

export function caseStatusFor(blocker: AppReviewBlocker): "observing" | "blocked" | "closed" {
  switch (blocker) {
    case "none":
      return "observing";
    case "unknown_provider_state":
    case "capability_missing":
    case "capability_shape_changed":
    case "founder_action_required":
    case "web_session_required":
    case "evidence_incomplete":
    case "unresolved_issues":
    case "rejected":
    case "metadata_rejected":
    case "invalid_binary":
    case "pending_developer_release":
      return "blocked";
    default: {
      const exhaustive: never = blocker;
      throw new Error(`Unhandled App Review blocker ${String(exhaustive)}`);
    }
  }
}
