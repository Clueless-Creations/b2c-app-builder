import { missingNativeModuleInBinary, unsupportedOnWeb, type CapabilityHost, type NativeCapabilityResult } from "./capability.js";

export function invokeNativeCapability(host: CapabilityHost, nativeModulePresentInBinary: boolean): NativeCapabilityResult {
  if (host === "web") return unsupportedOnWeb();
  if (!nativeModulePresentInBinary) return missingNativeModuleInBinary();
  return {
    ok: true,
    platform: host,
    value: "native-boundary-ready",
    nativeCompileStatus: "not-run",
    autolinkingVerified: false,
  };
}
