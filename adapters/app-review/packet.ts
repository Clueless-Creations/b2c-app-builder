import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  AppReviewAttachmentEvidence,
  AppReviewMessageEvidence,
  AppReviewPacketIncompleteReason,
  AppReviewPacketSelection,
  AppReviewReasonEvidence,
  AppReviewRejectionPacket,
} from "./types.js";

export const MAX_ATTACHMENT_BYTES = 5_000_000;
export const MAX_MESSAGE_BYTES = 100_000;

export interface RawReviewActor {
  readonly id?: string;
  readonly type?: string;
  readonly actorType?: string;
  readonly name?: string;
}

export interface RawReviewRejectionReason {
  readonly reasonSection?: string;
  readonly reasonDescription?: string;
  readonly reasonCode?: string;
}

export interface RawReviewRejection {
  readonly id?: string;
  readonly reasons?: readonly RawReviewRejectionReason[];
  readonly attachmentIds?: readonly string[];
}

export interface RawResolutionCenterMessage {
  readonly id?: string;
  readonly createdDate?: string;
  readonly messageBody?: string;
  readonly messageBodyPlain?: string;
  readonly fromActor?: RawReviewActor;
  readonly rejectionIds?: readonly string[];
  readonly attachmentIds?: readonly string[];
}

export interface RawResolutionCenterThread {
  readonly id?: string;
  readonly threadType?: string;
  readonly state?: string;
  readonly reviewSubmissionId?: string;
}

export interface RawReviewThreadDetails {
  readonly thread?: RawResolutionCenterThread;
  readonly messages?: readonly RawResolutionCenterMessage[];
  readonly rejections?: readonly RawReviewRejection[];
}

export interface RawReviewAttachment {
  readonly attachmentId?: string;
  readonly sourceType?: string;
  readonly fileName?: string;
  readonly fileSize?: number;
  readonly downloadUrl?: string;
  readonly threadId?: string;
  readonly messageId?: string;
  readonly reviewRejectionId?: string;
}

export interface RawReviewDownload {
  readonly attachmentId?: string;
  readonly sourceType?: string;
  readonly fileName?: string;
  readonly path?: string;
  readonly contentBase64?: string;
}

export interface RawReviewSubmission {
  readonly id?: string;
}

export interface RawWebReviewShowOutput {
  readonly appId?: string;
  readonly selection?: string;
  readonly submission?: RawReviewSubmission;
  readonly submissionItems?: readonly { readonly id?: string }[];
  readonly threads?: readonly RawReviewThreadDetails[];
  readonly attachments?: readonly RawReviewAttachment[];
  readonly downloads?: readonly RawReviewDownload[];
  readonly downloadFailures?: readonly string[];
  readonly fixtureAttachmentBodies?: Readonly<Record<string, string>>;
}

export interface IntakeRejectionPacketOptions {
  readonly appId: string;
  readonly submissionId: string;
  readonly cliVersion: string;
  readonly retrievedAt: string;
  readonly evidenceRoot?: string;
}

export interface IntakeRejectionPacketResult {
  readonly packet: AppReviewRejectionPacket;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function selectionFromRaw(value: string | undefined): AppReviewPacketSelection {
  switch (value) {
    case "explicit":
    case "latest-unresolved":
    case "latest":
      return value;
    case undefined:
    case "":
      return "unknown";
    default:
      return "unknown";
  }
}

function actorIsReviewer(actor: RawReviewActor | undefined): boolean {
  const kind = `${actor?.actorType ?? ""} ${actor?.type ?? ""}`.toLowerCase();
  if (kind.includes("developer") || kind.includes("customer")) return false;
  return true;
}

export function sanitizeEvidenceFileName(fileName: string): {
  stored: string;
  pathRejected: boolean;
  rejected: boolean;
} {
  const sanitized = sanitizeStoredName(fileName);
  return { ...sanitized, rejected: sanitized.pathRejected };
}

function sanitizeStoredName(fileName: string): { stored: string; pathRejected: boolean } {
  const normalized = fileName.replaceAll("\\", "/");
  const base = path.basename(normalized);
  if (normalized.includes("..") || normalized.includes("/") || base.length === 0 || base === "." || base === "..") {
    return { stored: "rejected-name.bin", pathRejected: true };
  }
  return { stored: base, pathRejected: false };
}

function uniqueStoredAttachmentPath(
  attachmentId: string,
  fileName: string,
  contentDigest: string,
  usedPaths: ReadonlySet<string>,
): { stored: string; pathRejected: boolean; duplicatePath: boolean } {
  const idSanitized = sanitizeStoredName(attachmentId);
  const nameSanitized = sanitizeStoredName(fileName);
  const idPart = idSanitized.pathRejected ? `id-${sha256(attachmentId).slice(0, 12)}` : idSanitized.stored;
  let stored = `${idPart}-${nameSanitized.stored}`;
  let duplicatePath = false;
  if (usedPaths.has(stored)) {
    duplicatePath = true;
    stored = `${idPart}-${contentDigest.slice(0, 12)}-${nameSanitized.stored}`;
  }
  if (usedPaths.has(stored)) {
    duplicatePath = true;
    stored = `${idPart}-${contentDigest.slice(0, 12)}-rejected-duplicate.bin`;
  }
  return {
    stored,
    pathRejected: nameSanitized.pathRejected || idSanitized.pathRejected || duplicatePath,
    duplicatePath,
  };
}

function decodeBase64(value: string | undefined): Buffer | undefined {
  if (!value) return undefined;
  try {
    const bytes = Buffer.from(value, "base64");
    return bytes.byteLength > 0 ? bytes : undefined;
  } catch {
    return undefined;
  }
}

function decodeDownloadBytes(
  download: RawReviewDownload | undefined,
  fixtureBodies: Readonly<Record<string, string>> | undefined,
  attachmentId: string,
): Buffer | undefined {
  return decodeBase64(download?.contentBase64) ?? decodeBase64(fixtureBodies?.[attachmentId]);
}

function incompletePacketId(appId: string, submissionId: string, retrievedAt: string): string {
  return `packet.app-review.${sha256(`${appId}:${submissionId}:${retrievedAt}`).slice(0, 16)}`;
}

export function incompletePacket(input: {
  readonly appId: string;
  readonly submissionId: string;
  readonly cliVersion: string;
  readonly retrievedAt: string;
  readonly reason: AppReviewPacketIncompleteReason;
}): AppReviewRejectionPacket {
  return {
    packetId: incompletePacketId(input.appId, input.submissionId, input.retrievedAt),
    appId: input.appId,
    submissionId: input.submissionId,
    selection: "unknown",
    selectionIsDurable: false,
    retrievedAt: input.retrievedAt,
    cliVersion: input.cliVersion,
    packetFingerprint: sha256(`incomplete:${input.reason}:${input.appId}:${input.submissionId}`),
    incomplete: true,
    incompleteReason: input.reason,
    threads: [],
    messages: [],
    reasons: [],
    attachments: [],
  };
}

export function packetCorrelatesToSubmission(packet: AppReviewRejectionPacket, expected: { readonly appId: string; readonly submissionId: string }): boolean {
  return packet.appId === expected.appId && packet.submissionId === expected.submissionId && expected.submissionId.length > 0;
}

export function intakeRejectionPacket(raw: RawWebReviewShowOutput, options: IntakeRejectionPacketOptions): IntakeRejectionPacketResult {
  const appId = raw.appId ?? options.appId;
  const submissionId = raw.submission?.id ?? options.submissionId;
  const selection = selectionFromRaw(raw.selection);
  const evidenceDirectory = options.evidenceRoot ? path.join(options.evidenceRoot, "run", "app-review-evidence", submissionId || "unknown") : undefined;
  if (evidenceDirectory) {
    mkdirSync(evidenceDirectory, { recursive: true });
  }

  const threads: { threadId: string; messageIds: string[] }[] = [];
  const messages: AppReviewMessageEvidence[] = [];
  const reasons: AppReviewReasonEvidence[] = [];
  const attachments: AppReviewAttachmentEvidence[] = [];
  const downloadsById = new Map((raw.downloads ?? []).map((item) => [item.attachmentId ?? "", item]));
  let downloadFailed = false;

  for (const detail of raw.threads ?? []) {
    const threadId = detail.thread?.id ?? "thread-unknown";
    const messageIds: string[] = [];
    for (const message of detail.messages ?? []) {
      const body = message.messageBodyPlain ?? message.messageBody ?? "";
      const clipped = Buffer.from(body).subarray(0, MAX_MESSAGE_BYTES);
      const messageId = message.id ?? `message-${messages.length + 1}`;
      messageIds.push(messageId);
      messages.push({
        messageId,
        threadId,
        fromReviewer: actorIsReviewer(message.fromActor),
        ...(message.createdDate ? { createdAt: message.createdDate } : {}),
        bodyFingerprint: sha256(clipped),
        bodyByteLength: clipped.byteLength,
        attachmentIds: [...(message.attachmentIds ?? [])],
        rejectionIds: [...(message.rejectionIds ?? [])],
      });
    }
    threads.push({ threadId, messageIds });
    for (const rejection of detail.rejections ?? []) {
      const relatedItemIds = [...(rejection.attachmentIds ?? [])];
      const entries = rejection.reasons ?? [];
      if (entries.length === 0) {
        reasons.push({
          reasonId: rejection.id ?? `reason-${reasons.length + 1}`,
          summaryFingerprint: sha256(""),
          relatedItemIds,
        });
        continue;
      }
      for (const [index, reason] of entries.entries()) {
        const guidelineSection = reason.reasonSection;
        const reasonCode = reason.reasonCode;
        reasons.push({
          reasonId: `${rejection.id ?? `reason-${reasons.length + 1}`}:${reasonCode ?? String(index)}`,
          ...(guidelineSection ? { guidelineSection } : {}),
          ...(reasonCode ? { reasonCode } : {}),
          summaryFingerprint: sha256(`${reasonCode ?? ""}:${guidelineSection ?? ""}`),
          relatedItemIds,
        });
      }
    }
  }

  const listedAttachments = raw.attachments ?? [];
  const usedPaths = new Set<string>();
  for (const attachment of listedAttachments) {
    const attachmentId = attachment.attachmentId ?? `attachment-${attachments.length + 1}`;
    const fileName = attachment.fileName ?? downloadsById.get(attachmentId)?.fileName ?? "unnamed.bin";
    const download = downloadsById.get(attachmentId);
    const bytes = decodeDownloadBytes(download, raw.fixtureAttachmentBodies, attachmentId);
    let byteLength = 0;
    let digest = sha256("");
    let failed = false;
    if (!bytes) {
      failed = true;
      downloadFailed = true;
    } else if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      failed = true;
      downloadFailed = true;
    } else {
      byteLength = bytes.byteLength;
      digest = sha256(bytes);
    }
    const named = uniqueStoredAttachmentPath(attachmentId, fileName, digest, usedPaths);
    usedPaths.add(named.stored);
    if (named.duplicatePath) {
      failed = true;
      downloadFailed = true;
    } else if (bytes && !failed && evidenceDirectory) {
      writeFileSync(path.join(evidenceDirectory, named.stored), bytes);
    }
    attachments.push({
      attachmentId,
      sourceType: attachment.sourceType ?? download?.sourceType ?? "unknown",
      originalFileNameFingerprint: sha256(fileName),
      storedRelativePath: named.stored,
      sha256: digest,
      byteLength: named.duplicatePath ? 0 : byteLength,
      downloadFailed: failed,
      pathRejected: named.pathRejected,
    });
  }

  const correlated = appId === options.appId && submissionId === options.submissionId && submissionId.length > 0;
  let incomplete = false;
  let incompleteReason: AppReviewPacketIncompleteReason | undefined;
  if (!correlated) {
    incomplete = true;
    incompleteReason = "packet_mismatch";
  } else if (downloadFailed) {
    incomplete = true;
    incompleteReason = "download_failed";
  } else if ((raw.downloadFailures ?? []).length > 0) {
    incomplete = true;
    incompleteReason = "download_failed";
  }

  const packet: AppReviewRejectionPacket = {
    packetId: `packet.app-review.${sha256(`${appId}:${submissionId}:${options.retrievedAt}`).slice(0, 16)}`,
    appId,
    submissionId,
    selection,
    selectionIsDurable: correlated && !incomplete && selection === "explicit",
    retrievedAt: options.retrievedAt,
    cliVersion: options.cliVersion,
    packetFingerprint: sha256(
      JSON.stringify({
        appId,
        submissionId,
        messages: messages.map((item) => item.bodyFingerprint),
        reasons: reasons.map((item) => item.summaryFingerprint),
        attachments: attachments.map((item) => item.sha256),
      }),
    ),
    incomplete,
    ...(incompleteReason ? { incompleteReason } : {}),
    threads,
    messages,
    reasons,
    attachments,
  };
  return { packet };
}
