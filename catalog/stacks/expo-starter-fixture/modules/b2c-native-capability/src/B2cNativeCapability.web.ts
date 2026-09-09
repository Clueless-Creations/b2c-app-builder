import { unsupportedOnWeb, type NativeCapabilityResult } from "./index.js";

export function invokeNativeCapability(): NativeCapabilityResult {
  return unsupportedOnWeb();
}
