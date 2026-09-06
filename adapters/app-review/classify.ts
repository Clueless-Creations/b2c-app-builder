import type {
  AppReviewClassification,
  AppReviewClassificationKind,
  AppReviewLayerObservation,
  AppReviewRejectionPacket,
} from "./types.js";

const GUIDELINE_PATTERN = /(?:^|guideline\s*)(\d+(?:\.\d+)*)/i;

export function idleClassification(): AppReviewClassification {
  return {
    kind: "none",
    confidence: "high",
    citedFingerprints: [],
    affectedItemIds: [],
    newBuildRequired: false,
    implementationStatus: "not_started",
    rationaleKind: "unclear",
  };
}

function codeHasPrefix(code: string, prefix: string): boolean {
  return code === prefix || code.startsWith(`${prefix}.`);
}

function kindFromGuideline(code: string): AppReviewClassificationKind | undefined {
  const normalized = code.trim();
  if (codeHasPrefix(normalized, "2.3")) return "metadata_rejected";
  if (codeHasPrefix(normalized, "5.1")) return "privacy_data_disclosure";
  if (codeHasPrefix(normalized, "3.1")) return "payments_subscriptions";
  if (codeHasPrefix(normalized, "2.1")) return "missing_review_information";
  if (codeHasPrefix(normalized, "5.2") || codeHasPrefix(normalized, "5.3") || codeHasPrefix(normalized, "5.4")) {
    return "legal_policy";
  }
  if (codeHasPrefix(normalized, "4.2") || codeHasPrefix(normalized, "4.3")) return "product_scope_disagreement";
  return undefined;
}

function guidelineFromStructured(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)*$/.test(trimmed)) return trimmed;
  const match = GUIDELINE_PATTERN.exec(trimmed);
  return match?.[1];
}

function kindFromLayer(appVersion: AppReviewLayerObservation | undefined): AppReviewClassificationKind | undefined {
  if (!appVersion || appVersion.layer !== "app_version") return undefined;
  if (appVersion.normalized === "invalid_binary") return "invalid_binary";
  if (appVersion.normalized === "metadata_rejected") return "metadata_rejected";
  return undefined;
}

export function classifyAppReviewCase(input: {
  readonly appVersion: AppReviewLayerObservation;
  readonly packet?: AppReviewRejectionPacket;
}): AppReviewClassification {
  const layerKind = kindFromLayer(input.appVersion);
  if (layerKind === "invalid_binary" || layerKind === "metadata_rejected") {
    return {
      kind: layerKind,
      confidence: "high",
      citedFingerprints: [],
      affectedItemIds: [input.appVersion.providerObjectId],
      newBuildRequired: layerKind === "invalid_binary",
      implementationStatus: "not_started",
      rationaleKind: "layer_state",
    };
  }

  const packet = input.packet;
  if (!packet || packet.incomplete) {
    return {
      ...idleClassification(),
      kind: "unclear_conflicting",
      confidence: "low",
      affectedItemIds: [input.appVersion.providerObjectId],
      rationaleKind: "unclear",
    };
  }

  const cited: string[] = [];
  const kinds = new Set<AppReviewClassificationKind>();
  for (const reason of packet.reasons) {
    cited.push(reason.summaryFingerprint);
    const code = guidelineFromStructured(reason.reasonCode) ?? guidelineFromStructured(reason.guidelineSection);
    const mapped = code ? kindFromGuideline(code) : undefined;
    if (mapped) kinds.add(mapped);
  }
  for (const message of packet.messages) {
    cited.push(message.bodyFingerprint);
  }

  if (kinds.size === 1) {
    const kind = [...kinds][0]!;
    return {
      kind,
      confidence: "medium",
      citedFingerprints: cited,
      affectedItemIds: [input.appVersion.providerObjectId, ...packet.attachments.map((item) => item.attachmentId)],
      newBuildRequired: kind === "invalid_binary",
      implementationStatus: "not_started",
      rationaleKind: "structured_reason",
    };
  }

  return {
    kind: "unclear_conflicting",
    confidence: "low",
    citedFingerprints: cited,
    affectedItemIds: [input.appVersion.providerObjectId],
    newBuildRequired: false,
    implementationStatus: "not_started",
    rationaleKind: packet.reasons.length > 0 ? "structured_reason" : "unclear",
  };
}
