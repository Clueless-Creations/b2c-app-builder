import { Platform } from "react-native";

export type NativeCapabilityStatusKind = "web-unsupported" | "native-ready" | "rebuild-required";

export interface NativeCapabilityStatus {
  kind: NativeCapabilityStatusKind;
  message: string;
}

type NativeCapabilityModule = { default?: { probe?: () => string }; probe?: () => string };

function loadNativeCapabilityModule(): NativeCapabilityModule {
  // Lazy load: the native package main calls requireNativeModule at import time.
  // A missing binary must become rebuild-required, not a startup crash.
  return require("b2c-native-capability") as NativeCapabilityModule;
}

export function nativeCapabilityStatus(): NativeCapabilityStatus {
  if (Platform.OS === "web") {
    return {
      kind: "web-unsupported",
      message: "B2cNativeCapability is native-only. This web surface must not fake iOS or Android parity.",
    };
  }
  try {
    const loaded = loadNativeCapabilityModule();
    const module = loaded.default ?? loaded;
    const probe = typeof module.probe === "function" ? module.probe() : Platform.OS;
    return { kind: "native-ready", message: String(probe) };
  } catch {
    return {
      kind: "rebuild-required",
      message:
        "B2cNativeCapability is missing from this binary. Rebuild a development client. JavaScript cannot substitute for the native module.",
    };
  }
}
