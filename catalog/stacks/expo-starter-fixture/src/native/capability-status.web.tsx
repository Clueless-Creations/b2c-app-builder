export type NativeCapabilityStatusKind = "web-unsupported" | "native-ready" | "rebuild-required";

export interface NativeCapabilityStatus {
  kind: NativeCapabilityStatusKind;
  message: string;
}

export function nativeCapabilityStatus(): NativeCapabilityStatus {
  return {
    kind: "web-unsupported",
    message: "B2cNativeCapability is native-only. This web surface must not fake iOS or Android parity.",
  };
}
