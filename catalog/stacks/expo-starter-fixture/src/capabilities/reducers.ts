/**
 * Local session, cache, permission, and notification reducers for the copied starter.
 * Same refusal rules as catalog/stacks/expo-capability-protocol.ts. Not an identity
 * provider, backend, SecureStore, or live push transport.
 */

export type LocalAuthEvent = "sign-in" | "cancelled" | "expired" | "revoked" | "malicious-callback" | "account-switch";

export interface LocalAuthState {
  signedIn: boolean;
  appUserId: string | null;
  priorUserDataPresent: boolean;
  entitled: boolean;
}

export const EMPTY_LOCAL_AUTH: LocalAuthState = {
  signedIn: false,
  appUserId: null,
  priorUserDataPresent: false,
  entitled: false,
};

export function reduceLocalAuth(input: { event: LocalAuthEvent; current: LocalAuthState; incomingUserId?: string; callbackTrusted?: boolean }): {
  next: LocalAuthState;
  leakedPriorUser: false;
  paidAccessLeaked: false;
  code?: string;
  reason: string;
} {
  const cleared = { ...EMPTY_LOCAL_AUTH };
  const sealed = (next: LocalAuthState, reason: string, code?: string) => ({
    next,
    leakedPriorUser: false as const,
    paidAccessLeaked: false as const,
    code,
    reason,
  });
  switch (input.event) {
    case "malicious-callback":
      return sealed(cleared, "Untrusted callback cannot create a session or keep prior-user data.", "malicious-callback");
    case "cancelled":
      return sealed(cleared, "Cancelled sign-in leaves no session and no entitlement.");
    case "expired":
    case "revoked":
      return sealed(cleared, "Expired or revoked session clears user-scoped data and paid access.");
    case "account-switch": {
      const nextId = input.incomingUserId?.trim() || null;
      return sealed(
        { signedIn: Boolean(nextId), appUserId: nextId, priorUserDataPresent: false, entitled: false },
        "Account switch clears prior-user data. Paid access does not follow the previous user.",
      );
    }
    case "sign-in": {
      if (input.callbackTrusted !== true) {
        return sealed(cleared, "Sign-in with an untrusted callback is refused.", "malicious-callback");
      }
      const nextId = input.incomingUserId?.trim() || null;
      if (!nextId) return sealed(cleared, "Sign-in without an app user id creates no session.");
      return sealed(
        { signedIn: true, appUserId: nextId, priorUserDataPresent: false, entitled: false },
        "Sign-in records app auth only. It does not grant a paid entitlement.",
      );
    }
    default: {
      const exhaustive: never = input.event;
      throw new Error(`unhandled local auth event: ${String(exhaustive)}`);
    }
  }
}

export function classifyLocalOffline(input: {
  event: "restart" | "reconnect" | "duplicate-request" | "migration-failure" | "interrupted-write";
  claimed: "local-cache-preserved" | "backend-success" | "write-complete";
}): { action: "accept" | "refuse"; code?: string; reason: string } {
  if (input.claimed === "backend-success") {
    return { action: "refuse", code: "sqlite-is-not-backend", reason: "A local SQLite restart or reconnect is not backend success." };
  }
  switch (input.event) {
    case "migration-failure":
    case "interrupted-write":
      if (input.claimed === "write-complete") {
        return {
          action: "refuse",
          code: input.event === "migration-failure" ? "offline-migration-claimed-success" : "interrupted-write-claimed-complete",
          reason: "An interrupted or failed local write is not completion.",
        };
      }
      return { action: "accept", reason: "Local cache semantics only. Not a backend of record." };
    case "restart":
    case "reconnect":
    case "duplicate-request":
      return { action: "accept", reason: "Local cache semantics only. Not a backend of record." };
    default: {
      const exhaustive: never = input.event;
      throw new Error(`unhandled local offline event: ${String(exhaustive)}`);
    }
  }
}

export function classifyLocalPermission(input: {
  platform: "ios" | "android" | "web";
  outcome: "granted" | "denied" | "revoked" | "unavailable";
  claimedNativeSuccess?: boolean;
}): { safeState: "proceed" | "unavailable-safe"; action: "accept" | "refuse"; reason: string } {
  if (input.platform === "web" && input.claimedNativeSuccess) {
    return { safeState: "unavailable-safe", action: "refuse", reason: "Web must not fake native permission success." };
  }
  switch (input.outcome) {
    case "granted":
      return { safeState: "proceed", action: "accept", reason: "Granted classification only. Not device runtime proof." };
    case "denied":
    case "revoked":
    case "unavailable":
      if (input.claimedNativeSuccess) {
        return { safeState: "unavailable-safe", action: "refuse", reason: `${input.outcome} is a safe unavailable state, not native success.` };
      }
      return { safeState: "unavailable-safe", action: "accept", reason: `${input.outcome} stays a useful safe state.` };
    default: {
      const exhaustive: never = input.outcome;
      throw new Error(`unhandled local permission outcome: ${String(exhaustive)}`);
    }
  }
}

export function classifyLocalNotification(input: { tokenOk: boolean; receiptOk: boolean; claimedPersonSawNotification: boolean; route: string }): {
  action: "accept" | "refuse";
  restoreRoute?: string;
  deliveredToPerson: false;
  reason: string;
} {
  if (input.claimedPersonSawNotification) {
    return { action: "refuse", deliveredToPerson: false, reason: "A push ticket or receipt is not evidence a person saw the notification." };
  }
  if (!input.tokenOk) {
    return { action: "refuse", deliveredToPerson: false, reason: "A token error is not notification delivery." };
  }
  if (!input.receiptOk) {
    return { action: "refuse", deliveredToPerson: false, reason: "A push receipt error is not delivery to a person." };
  }
  return {
    action: "accept",
    restoreRoute: input.route,
    deliveredToPerson: false,
    reason: "Handoff classification only. Token and receipt success is not person-seen proof.",
  };
}
