import { classifyLocalPermission } from "../capabilities/reducers";

export function permissionSafeState(input: {
  platform: "ios" | "android" | "web";
  outcome: "granted" | "denied" | "revoked" | "unavailable";
  claimedNativeSuccess?: boolean;
}): { kind: "ready" | "empty" | "error"; message: string } {
  const classified = classifyLocalPermission(input);
  if (classified.safeState === "unavailable-safe") return { kind: "empty", message: classified.reason };
  return { kind: classified.action === "refuse" ? "error" : "ready", message: classified.reason };
}
