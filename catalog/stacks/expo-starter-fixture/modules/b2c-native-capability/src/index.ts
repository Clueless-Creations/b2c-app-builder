export const MODULE_NAME = "B2cNativeCapability";
export const NATIVE_ADDITION_REQUIRES_NEW_BINARY = true;
export const AUTOLINKING_VERIFIED = false;
export const MODULE_EVENTS = ["onCapabilityError"] as const;
export const MODULE_LIFECYCLE = ["OnCreate", "OnDestroy"] as const;

export type NativeHost = "ios" | "android";
export type CapabilityHost = NativeHost | "web";

export type CapabilityErrorCode = "unsupported-on-web" | "rebuild-required" | "native-failure";

export interface CapabilityError {
  code: CapabilityErrorCode;
  message: string;
  retryInJavaScript: false;
}

export type NativeCapabilityResult =
  | { ok: true; platform: NativeHost; value: string; nativeCompileStatus: "not-run"; autolinkingVerified: false }
  | { ok: false; reason: CapabilityErrorCode; error: CapabilityError; nativeCompileStatus: "not-run"; autolinkingVerified: false };

export function unsupportedOnWeb(): NativeCapabilityResult {
  return {
    ok: false,
    reason: "unsupported-on-web",
    error: {
      code: "unsupported-on-web",
      message: "B2cNativeCapability is native-only. Web has no equivalent and must not fake iOS or Android parity.",
      retryInJavaScript: false,
    },
    nativeCompileStatus: "not-run",
    autolinkingVerified: false,
  };
}

export function missingNativeModuleInBinary(): NativeCapabilityResult {
  return {
    ok: false,
    reason: "rebuild-required",
    error: {
      code: "rebuild-required",
      message: "B2cNativeCapability is missing from this binary. Rebuild a development client. JavaScript cannot substitute for the native module.",
      retryInJavaScript: false,
    },
    nativeCompileStatus: "not-run",
    autolinkingVerified: false,
  };
}
