import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { observeMandateIsLive } from "./mandate.js";
import { incrementBuildNumber, parseInfoPlistScalarsFromBytes, renderIdentityPlist, upsertInfoPlistIdentity } from "./plist.js";
import type {
  AppReviewClassification,
  AppReviewClassificationKind,
  AppReviewConsumerPatch,
  AppReviewMandate,
  AppReviewParkReason,
  AppReviewRemediation,
  AppReviewRemediationDisposition,
  AppReviewRemediationPlan,
  AppReviewRemediationRoute,
  AppReviewState,
} from "./types.js";
import { APP_REVIEW_REMEDIATE_WORKFLOW_ID } from "./types.js";

const METADATA_LISTING_PATH = "store/app-store-listing/APP_STORE_LISTING.md";
const METADATA_REPAIR_PATH = "store/app-store-listing/APP_REVIEW_METADATA_REPAIR.md";
const REVIEW_NOTES_PATH = "store/app-store-listing/REVIEW_NOTES.md";
const REVIEW_NOTES_REPAIR_PATH = "store/app-store-listing/APP_REVIEW_NOTES_REPAIR.md";
const DEFAULT_INFO_PLIST_PATH = "app/Info.plist";

export function isProtectedAppReviewKind(kind: AppReviewClassificationKind): boolean {
  switch (kind) {
    case "legal_policy":
    case "product_scope_disagreement":
    case "privacy_data_disclosure":
    case "payments_subscriptions":
    case "unclear_conflicting":
      return true;
    case "none":
    case "metadata_rejected":
    case "invalid_binary":
    case "missing_review_information":
    case "login_review_access":
      return false;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled App Review classification ${String(exhaustive)}`);
    }
  }
}

export function parkReasonFor(kind: AppReviewClassificationKind): AppReviewParkReason | undefined {
  switch (kind) {
    case "legal_policy":
      return "legal_policy";
    case "product_scope_disagreement":
      return "product_scope";
    case "privacy_data_disclosure":
      return "privacy_promise";
    case "payments_subscriptions":
      return "payments";
    case "unclear_conflicting":
      return "unclear";
    case "none":
    case "metadata_rejected":
    case "invalid_binary":
    case "missing_review_information":
    case "login_review_access":
      return undefined;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled App Review classification ${String(exhaustive)}`);
    }
  }
}

export function routeForClassification(kind: AppReviewClassificationKind): {
  readonly route: AppReviewRemediationRoute;
  readonly disposition: AppReviewRemediationDisposition;
} {
  switch (kind) {
    case "metadata_rejected":
      return { route: "same_build_metadata", disposition: "implement" };
    case "invalid_binary":
      return { route: "new_binary", disposition: "implement" };
    case "missing_review_information":
      return { route: "review_notes", disposition: "implement" };
    case "login_review_access":
      return { route: "review_access", disposition: "implement" };
    case "legal_policy":
    case "product_scope_disagreement":
    case "privacy_data_disclosure":
    case "payments_subscriptions":
    case "unclear_conflicting":
      return { route: "parked", disposition: "park" };
    case "none":
      return { route: "none", disposition: "park" };
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled App Review classification ${String(exhaustive)}`);
    }
  }
}

function workspaceFileExists(workspaceRoot: string | undefined, relativePath: string): boolean {
  if (!workspaceRoot) return false;
  const target = path.join(workspaceRoot, relativePath);
  return existsSync(target) && statSync(target).isFile();
}

function createWithoutOverwrite(workspaceRoot: string | undefined, relativePath: string, sidecarPath: string, contents: string): AppReviewConsumerPatch {
  const targetPath = workspaceFileExists(workspaceRoot, relativePath) ? sidecarPath : relativePath;
  if (workspaceFileExists(workspaceRoot, targetPath)) {
    return { relativePath: targetPath, kind: "replace", contents };
  }
  return { relativePath: targetPath, kind: "create", contents };
}

function readJsonRecord(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function expoBuildNumber(workspaceRoot: string): string | undefined {
  for (const relative of ["app.json", "app.config.json"]) {
    const record = readJsonRecord(path.join(workspaceRoot, relative));
    if (!record) continue;
    const expo = record.expo && typeof record.expo === "object" && !Array.isArray(record.expo) ? (record.expo as Record<string, unknown>) : record;
    const ios = expo.ios && typeof expo.ios === "object" && !Array.isArray(expo.ios) ? (expo.ios as Record<string, unknown>) : undefined;
    const build = stringField(ios?.buildNumber);
    if (build) return build;
  }
  return undefined;
}

function discoverSourceInfoPlist(workspaceRoot: string): { readonly relativePath: string; readonly bytes: Buffer } | undefined {
  const candidates = [DEFAULT_INFO_PLIST_PATH, "ios/App/Info.plist", "Info.plist"];
  for (const relativePath of candidates) {
    const target = path.join(workspaceRoot, relativePath);
    if (existsSync(target) && statSync(target).isFile()) {
      return { relativePath, bytes: readFileSync(target) };
    }
  }
  const iosDirectory = path.join(workspaceRoot, "ios");
  if (!existsSync(iosDirectory) || !statSync(iosDirectory).isDirectory()) return undefined;
  for (const entry of readdirSync(iosDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const relativePath = path.posix.join("ios", entry.name, "Info.plist");
    const target = path.join(workspaceRoot, relativePath);
    if (existsSync(target) && statSync(target).isFile()) {
      return { relativePath, bytes: readFileSync(target) };
    }
  }
  return undefined;
}

function binaryRepairPatch(
  mandate: AppReviewMandate,
  options?: { readonly workspaceRoot?: string; readonly previousBuildNumber?: string },
): AppReviewConsumerPatch {
  const workspaceRoot = options?.workspaceRoot;
  const discovered = workspaceRoot ? discoverSourceInfoPlist(workspaceRoot) : undefined;
  const discoveredValues = discovered ? parseInfoPlistScalarsFromBytes(discovered.bytes) : {};
  const existingBuild = discoveredValues.CFBundleVersion || (workspaceRoot ? expoBuildNumber(workspaceRoot) : undefined) || options?.previousBuildNumber;
  const identity = {
    bundleId: mandate.bundleId,
    marketingVersion: mandate.marketingVersion,
    buildNumber: existingBuild ? incrementBuildNumber(existingBuild) : "1",
  };
  if (discovered) {
    const existingText = discovered.bytes.toString("utf8");
    const contents = /<plist\b/i.test(existingText) ? upsertInfoPlistIdentity(existingText, identity) : renderIdentityPlist(identity);
    return { relativePath: discovered.relativePath, kind: "replace", contents };
  }
  return { relativePath: DEFAULT_INFO_PLIST_PATH, kind: "create", contents: renderIdentityPlist(identity) };
}

function defaultPatches(
  route: AppReviewRemediationRoute,
  mandate: AppReviewMandate,
  options?: { readonly workspaceRoot?: string; readonly previousBuildNumber?: string },
): readonly AppReviewConsumerPatch[] {
  switch (route) {
    case "same_build_metadata":
      return [
        createWithoutOverwrite(
          options?.workspaceRoot,
          METADATA_LISTING_PATH,
          METADATA_REPAIR_PATH,
          "# App Store listing repair\n\nBounded metadata repair for this Apple review case.\nReuse the processed build. Do not replace the canonical listing packet. Do not submit from this file.\n",
        ),
      ];
    case "review_notes":
      return [
        createWithoutOverwrite(
          options?.workspaceRoot,
          REVIEW_NOTES_PATH,
          REVIEW_NOTES_REPAIR_PATH,
          "# Review notes\n\nDemo account and review information for this exact submission.\nDo not put credentials in this file.\n",
        ),
      ];
    case "review_access":
      return [
        createWithoutOverwrite(
          options?.workspaceRoot,
          REVIEW_NOTES_PATH,
          REVIEW_NOTES_REPAIR_PATH,
          "# Review access\n\nRepair demo access for Apple review without exposing credentials.\n",
        ),
      ];
    case "new_binary":
      return [binaryRepairPatch(mandate, options)];
    case "parked":
    case "none":
      return [];
    default: {
      const exhaustive: never = route;
      throw new Error(`Unhandled App Review route ${String(exhaustive)}`);
    }
  }
}

function validatorsFor(route: AppReviewRemediationRoute): readonly string[] {
  switch (route) {
    case "same_build_metadata":
      return ["check:app-review-contract", "asc metadata validate", "asc metadata push --dry-run"];
    case "new_binary":
      return ["check:app-review-contract", "check:apple-release-readiness"];
    case "review_notes":
    case "review_access":
      return ["check:app-review-contract"];
    case "parked":
    case "none":
      return ["check:app-review-contract"];
    default: {
      const exhaustive: never = route;
      throw new Error(`Unhandled App Review route ${String(exhaustive)}`);
    }
  }
}

export function buildRemediationPlan(
  classification: AppReviewClassification,
  mandate: AppReviewMandate,
  cycleNumber: number,
  options?: { readonly workspaceRoot?: string; readonly previousBuildNumber?: string },
): AppReviewRemediationPlan {
  const mapped = routeForClassification(classification.kind);
  const patches = mapped.disposition === "implement" ? defaultPatches(mapped.route, mandate, options) : [];
  const citedGuideline = classification.citedFingerprints[0];
  const parkReason = mapped.disposition === "park" ? (parkReasonFor(classification.kind) ?? "protected_policy") : undefined;
  const body = JSON.stringify({
    kind: classification.kind,
    route: mapped.route,
    cycleNumber,
    fingerprints: classification.citedFingerprints,
    identity: { bundleId: mandate.bundleId, marketingVersion: mandate.marketingVersion },
  });
  const planId = `plan.app-review.${mandate.mandateId}.${cycleNumber}.${createHash("sha256").update(body).digest("hex").slice(0, 12)}`;
  return {
    planId,
    route: mapped.route,
    disposition: mapped.disposition,
    ...(parkReason ? { parkReason } : {}),
    newBinaryRequired: mapped.route === "new_binary" || classification.newBuildRequired,
    ...(citedGuideline ? { citedGuideline } : {}),
    affectedPaths: patches.map((patch) => patch.relativePath),
    patches,
    testsAndValidators: [...validatorsFor(mapped.route)],
    authorizationNeeded: mapped.disposition === "implement" ? ["consumer-repo"] : ["founder"],
    rollback: mapped.disposition === "park" ? "Leave consumer files unchanged." : "Revert the named consumer-repo paths.",
  };
}

export function remediationOccurrenceId(mandateId: string, cycleNumber: number): string {
  return `wo.app-review.${mandateId}.${cycleNumber}`;
}

export function remediationAttemptId(mandateId: string, cycleNumber: number, attemptNumber: number): string {
  return `attempt.app-review.${mandateId}.${cycleNumber}.${attemptNumber}`;
}

export function remediationReady(state: AppReviewState, now: string): boolean {
  if (!observeMandateIsLive(state.mandate, now)) return false;
  if (state.capabilityReceipt.failClosed) return false;
  const kind = state.currentCase.classification.kind;
  if (kind === "none") return false;
  const mapped = routeForClassification(kind);
  if (mapped.disposition === "park") return true;
  if (state.currentCase.classification.rationaleKind === "layer_state") return true;
  const packet = state.currentCase.rejectionPacket;
  return Boolean(packet && !packet.incomplete && packet.selectionIsDurable && packet.selection === "explicit");
}

export function planFingerprint(plan: AppReviewRemediationPlan): string {
  return createHash("sha256")
    .update(JSON.stringify({ route: plan.route, disposition: plan.disposition, paths: plan.affectedPaths, patches: plan.patches }))
    .digest("hex");
}

export function alignRemediationWithClassification(
  classification: AppReviewClassification,
  remediation: AppReviewRemediation | undefined,
): { readonly classification: AppReviewClassification; readonly remediation?: AppReviewRemediation } {
  if (!remediation) return { classification };
  const mapped = routeForClassification(classification.kind);
  if (remediation.plan.route !== mapped.route || remediation.plan.disposition !== mapped.disposition) {
    return { classification };
  }
  return {
    classification: { ...classification, implementationStatus: remediation.status },
    remediation,
  };
}

export { APP_REVIEW_REMEDIATE_WORKFLOW_ID };
