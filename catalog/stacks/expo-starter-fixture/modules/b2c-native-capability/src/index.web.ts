import { unsupportedOnWeb, type NativeCapabilityResult } from "./capability.js";

export { unsupportedOnWeb } from "./capability.js";

export function invokeNativeCapability(): NativeCapabilityResult {
  return unsupportedOnWeb();
}

export default unsupportedOnWeb;
