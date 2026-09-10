/**
 * Local/disposable selected-capability runtime (#83).
 *
 * Persists a session file and a Node SQLite local cache in an authorized disposable
 * directory, then reapplies the #83 protocol reducers across a process-style reopen.
 * This is not an identity provider, not SecureStore, not a backend of record, not live
 * push delivery, and not a native store. Native purchases stay blocked.
 *
 * Consumes `catalog/stacks/expo-capability-protocol.ts` and the starter route graph.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  EMPTY_AUTH_SESSION,
  classifyNotificationHandoff,
  classifyOfflineEvent,
  classifyPermissionOutcome,
  classifyUnauthenticatedBackendRequest,
  reduceAuthSession,
  type ExpoAuthSessionEvent,
  type ExpoAuthSessionState,
  type ExpoDeviceCapability,
  type ExpoPermissionOutcome,
} from "./expo-capability-protocol.js";
import { ROUTE_HREFS } from "./expo-starter-fixture/src/navigation/route-graph.js";
import { operationFor, type ExpoSelectionResolution, type ShippingPlatform } from "./expo-selection.js";

export const EXPO_LOCAL_CAPABILITIES_PATH = "catalog/stacks/expo-local-capabilities.ts" as const;
export const LOCAL_CAPABILITY_DIRNAME = ".b2c-local-capabilities";
export const LOCAL_SESSION_BASENAME = "session.json";
export const LOCAL_CACHE_BASENAME = "cache.sqlite";
export const LOCAL_PERMISSION_BASENAME = "permissions.json";

export const LOCAL_CAPABILITY_OPERATION_IDS = ["authentication", "offline-data", "device-capabilities"] as const;

export interface LocalNote {
  id: string;
  owner: string;
  body: string;
  writeState: "complete" | "incomplete";
}

export interface LocalPermissionRecord {
  capability: ExpoDeviceCapability;
  platform: ShippingPlatform;
  outcome: ExpoPermissionOutcome;
}

export interface LocalCapabilitySnapshot {
  session: ExpoAuthSessionState;
  notes: readonly LocalNote[];
  permission?: LocalPermissionRecord;
  restoreRoute?: string;
  labeledLive: false;
  nativeStoreProof: false;
  backendOfRecord: false;
  secureStore: false;
  deliveredToPerson: false;
}

export interface LocalCapabilityStep {
  action: "accept" | "refuse";
  code?: string;
  reason: string;
  snapshot: LocalCapabilitySnapshot;
}

function capabilityDir(root: string): string {
  return path.join(root, LOCAL_CAPABILITY_DIRNAME);
}

function sessionPath(root: string): string {
  return path.join(capabilityDir(root), LOCAL_SESSION_BASENAME);
}

function cachePath(root: string): string {
  return path.join(capabilityDir(root), LOCAL_CACHE_BASENAME);
}

function permissionPath(root: string): string {
  return path.join(capabilityDir(root), LOCAL_PERMISSION_BASENAME);
}

function isSession(value: unknown): value is ExpoAuthSessionState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.signedIn === "boolean" &&
    (record.appUserId === null || typeof record.appUserId === "string") &&
    typeof record.priorUserDataPresent === "boolean" &&
    typeof record.entitled === "boolean"
  );
}

function readSession(root: string): ExpoAuthSessionState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(sessionPath(root), "utf8"));
    return isSession(parsed) ? parsed : { ...EMPTY_AUTH_SESSION };
  } catch {
    return { ...EMPTY_AUTH_SESSION };
  }
}

function writeSession(root: string, session: ExpoAuthSessionState): void {
  mkdirSync(capabilityDir(root), { recursive: true });
  writeFileSync(sessionPath(root), `${JSON.stringify(session)}\n`);
}

function readPermission(root: string): LocalPermissionRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(permissionPath(root), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    if (record.capability !== "camera" && record.capability !== "notifications" && record.capability !== "media-library") {
      return undefined;
    }
    if (record.platform !== "ios" && record.platform !== "android" && record.platform !== "web") return undefined;
    if (record.outcome !== "granted" && record.outcome !== "denied" && record.outcome !== "revoked" && record.outcome !== "unavailable") {
      return undefined;
    }
    return { capability: record.capability, platform: record.platform, outcome: record.outcome };
  } catch {
    return undefined;
  }
}

function writePermission(root: string, record: LocalPermissionRecord): void {
  mkdirSync(capabilityDir(root), { recursive: true });
  writeFileSync(permissionPath(root), `${JSON.stringify(record)}\n`);
}

function openCache(root: string): DatabaseSync {
  mkdirSync(capabilityDir(root), { recursive: true });
  const db = new DatabaseSync(cachePath(root));
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      body TEXT NOT NULL,
      write_state TEXT NOT NULL
    );
  `);
  return db;
}

function notesForOwner(root: string, owner: string | null): LocalNote[] {
  if (!owner) return [];
  const db = openCache(root);
  try {
    const rows = db.prepare("SELECT id, owner, body, write_state FROM notes WHERE owner = ? ORDER BY id").all(owner) as Array<{
      id: string;
      owner: string;
      body: string;
      write_state: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      owner: row.owner,
      body: row.body,
      writeState: row.write_state === "incomplete" ? "incomplete" : "complete",
    }));
  } finally {
    db.close();
  }
}

function snapshotOf(root: string, restoreRoute?: string): LocalCapabilitySnapshot {
  const session = readSession(root);
  return {
    session,
    notes: notesForOwner(root, session.appUserId),
    permission: readPermission(root),
    restoreRoute,
    labeledLive: false,
    nativeStoreProof: false,
    backendOfRecord: false,
    secureStore: false,
    deliveredToPerson: false,
  };
}

export function localSelectedCapabilitiesAreFixtureTested(resolution: ExpoSelectionResolution): boolean {
  return LOCAL_CAPABILITY_OPERATION_IDS.every((id) => {
    const operation = operationFor(resolution, id);
    return operation.evidenceTier === "fixture-tested" && operation.queuedIssue === 83;
  });
}

export function nativePurchasesRemainBlocked(resolution: ExpoSelectionResolution): boolean {
  const purchases = operationFor(resolution, "native-purchases");
  return purchases.evidenceTier === "blocked" && purchases.queuedIssue === 83;
}

export function applyLocalAuthEvent(
  root: string,
  event: ExpoAuthSessionEvent,
  extra?: { incomingUserId?: string; callbackTrusted?: boolean },
): LocalCapabilityStep {
  const reduced = reduceAuthSession({
    event,
    current: readSession(root),
    incomingUserId: extra?.incomingUserId,
    callbackTrusted: extra?.callbackTrusted,
  });
  writeSession(root, reduced.next);
  return {
    action: reduced.code ? "refuse" : "accept",
    code: reduced.code,
    reason: reduced.reason,
    snapshot: snapshotOf(root),
  };
}

export function writeLocalNote(
  root: string,
  input: { id: string; body: string; interrupt?: boolean; duplicate?: boolean; claimBackend?: boolean },
): LocalCapabilityStep {
  const session = readSession(root);
  if (!session.signedIn || !session.appUserId) {
    const backend = classifyUnauthenticatedBackendRequest({ authenticated: false, navigationGuardBypassed: true });
    return { action: "refuse", code: backend.code, reason: backend.reason, snapshot: snapshotOf(root) };
  }
  const event = input.interrupt ? "interrupted-write" : input.duplicate ? "duplicate-request" : "reconnect";
  const claimed = input.claimBackend ? "backend-success" : input.interrupt ? "write-complete" : "local-cache-preserved";
  const classified = classifyOfflineEvent({ event, store: "sqlite", claimed });
  if (classified.action === "refuse" && !input.interrupt) {
    return { action: "refuse", code: classified.code, reason: classified.reason, snapshot: snapshotOf(root) };
  }
  const db = openCache(root);
  try {
    if (input.duplicate) {
      const existing = db.prepare("SELECT id FROM notes WHERE id = ?").get(input.id) as { id?: string } | undefined;
      if (!existing?.id) {
        db.prepare("INSERT INTO notes (id, owner, body, write_state) VALUES (?, ?, ?, ?)").run(input.id, session.appUserId, input.body, "complete");
      }
    } else if (input.interrupt) {
      db.prepare("INSERT OR REPLACE INTO notes (id, owner, body, write_state) VALUES (?, ?, ?, ?)").run(input.id, session.appUserId, input.body, "incomplete");
      const interrupted = classifyOfflineEvent({ event: "interrupted-write", store: "sqlite", claimed: "write-complete" });
      return { action: "refuse", code: interrupted.code, reason: interrupted.reason, snapshot: snapshotOf(root) };
    } else {
      db.prepare("INSERT OR REPLACE INTO notes (id, owner, body, write_state) VALUES (?, ?, ?, ?)").run(input.id, session.appUserId, input.body, "complete");
    }
  } finally {
    db.close();
  }
  return { action: "accept", reason: classified.reason, snapshot: snapshotOf(root) };
}

export function reopenLocalCapabilities(root: string): LocalCapabilityStep {
  const classified = classifyOfflineEvent({ event: "restart", store: "sqlite", claimed: "local-cache-preserved" });
  return { action: "accept", reason: classified.reason, snapshot: snapshotOf(root) };
}

export function recordLocalPermission(
  root: string,
  input: { capability: ExpoDeviceCapability; platform: ShippingPlatform; outcome: ExpoPermissionOutcome; claimedNativeSuccess?: boolean },
): LocalCapabilityStep {
  const classified = classifyPermissionOutcome(input);
  if (classified.action === "accept-classification") writePermission(root, { capability: input.capability, platform: input.platform, outcome: input.outcome });
  return {
    action: classified.action === "refuse" ? "refuse" : "accept",
    code: classified.code,
    reason: classified.reason,
    snapshot: snapshotOf(root),
  };
}

export function restoreNotificationRoute(
  root: string,
  input: { tokenOk: boolean; receiptOk: boolean; claimedPersonSawNotification?: boolean; route: string },
): LocalCapabilityStep {
  const classified = classifyNotificationHandoff({
    tokenOk: input.tokenOk,
    receiptOk: input.receiptOk,
    claimedPersonSawNotification: Boolean(input.claimedPersonSawNotification),
    deepLinkRoute: input.route,
    selectedRestoreRoute: input.route,
  });
  return {
    action: classified.action === "refuse" ? "refuse" : "accept",
    code: classified.code,
    reason: classified.reason,
    snapshot: snapshotOf(root, classified.restoreRoute),
  };
}

export function runLocalCapabilityJourney(root: string): {
  signedIn: LocalCapabilityStep;
  persistedNote: LocalCapabilityStep;
  restarted: LocalCapabilityStep;
  expired: LocalCapabilityStep;
  switched: LocalCapabilityStep;
  isolated: boolean;
  interrupted: LocalCapabilityStep;
  denied: LocalCapabilityStep;
  restored: LocalCapabilityStep;
  labeledLive: false;
} {
  const signedIn = applyLocalAuthEvent(root, "sign-in", { incomingUserId: "user-a", callbackTrusted: true });
  const persistedNote = writeLocalNote(root, { id: "note-1", body: "local cache only" });
  const restarted = reopenLocalCapabilities(root);
  const expired = applyLocalAuthEvent(root, "expired");
  const switched = applyLocalAuthEvent(root, "account-switch", { incomingUserId: "user-b" });
  const interrupted = writeLocalNote(root, { id: "note-2", body: "partial", interrupt: true });
  const denied = recordLocalPermission(root, { capability: "notifications", platform: "web", outcome: "denied" });
  const restored = restoreNotificationRoute(root, { tokenOk: true, receiptOk: true, route: ROUTE_HREFS.detail("1") });
  const isolated = switched.snapshot.notes.every((note) => note.owner === "user-b") && restarted.snapshot.notes.some((note) => note.owner === "user-a");
  return {
    signedIn,
    persistedNote,
    restarted,
    expired,
    switched,
    isolated,
    interrupted,
    denied,
    restored,
    labeledLive: false,
  };
}
