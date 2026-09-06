import { createHash } from "node:crypto";
import {
  mobileRequestSchema,
  mobileResultSchema,
  mobileObservationSchema,
  normalizeMobileObservation,
  requireMobileSupport,
  type MobileObservation,
  type MobileOperation,
  type MobileRequest,
  type MobileSupport,
  type MobileTarget,
} from "../contracts/mobile-operation.js";
import type { OperationRoute } from "../kernel/session/operation-routes.js";
import type { InstalledSimulatorBuild, MobaiDeviceIdentity } from "./device-proof.js";

/** An exposed host tool or provider adapter supplies this transport. There is no default process or implicit installation. */
export interface MobileOperationTransport {
  providerId: string;
  support(): Promise<MobileSupport>;
  execute(request: MobileRequest, idempotencyKey: string): Promise<{ observation: MobileObservation; captureBytes?: Buffer }>;
  observe(request: MobileRequest, idempotencyKey: string): Promise<MobileObservation | undefined>;
}
export function targetFromInstalledSimulatorBuild(build: InstalledSimulatorBuild, osVersion: string, locale: string): MobileTarget {
  return {
    platform: "ios",
    deviceKind: "simulator",
    deviceId: build.deviceId,
    osVersion,
    locale,
    appId: build.bundleId,
    buildId: build.buildNumber,
    artifactSha256: build.bundleContentSha256,
  };
}
export function targetFromMobaiIdentity(
  device: MobaiDeviceIdentity,
  app: Pick<MobileTarget, "appId" | "buildId" | "artifactSha256">,
  locale: string,
): MobileTarget {
  return {
    ...app,
    platform: device.platform,
    deviceKind: device.virtual ? (device.platform === "ios" ? "simulator" : "emulator") : "physical",
    deviceId: device.id,
    osVersion: device.osVersion,
    locale,
  };
}
function validateCaptureBytes(observation: MobileObservation, bytes: Buffer | undefined, artifactId: string | undefined): void {
  const capture = observation.capture;
  if (!capture) {
    if (bytes !== undefined || artifactId !== undefined) throw new Error("mobile.unexpected_capture_bytes");
    return;
  }
  if (
    !artifactId ||
    capture.artifactId !== artifactId ||
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    createHash("sha256").update(bytes).digest("hex") !== capture.sha256
  )
    throw new Error("mobile.capture_bytes_mismatch");
  if (
    capture.mimeType === "image/png" &&
    (bytes.length < 24 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.readUInt32BE(16) !== capture.width ||
      bytes.readUInt32BE(20) !== capture.height)
  )
    throw new Error("mobile.capture_format_mismatch");
  if (
    capture.mimeType === "image/jpeg" &&
    (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217)
  )
    throw new Error("mobile.capture_format_mismatch");
  if (capture.mimeType === "video/mp4" && (bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp"))
    throw new Error("mobile.capture_format_mismatch");
}
/** Bind one transport to the existing host route registry. Resolver selection and authority stay outside the adapter. */
export function createMobileOperationRoute(options: {
  transport: MobileOperationTransport;
  operation: MobileOperation;
  implementationId: string;
  packageDigest: string;
  resultArtifactId: string;
  receiptArtifactId: string;
  captureArtifactId?: string;
  input: OperationRoute["input"];
  now?: () => Date;
}): OperationRoute {
  const now = options.now ?? (() => new Date());
  const isCapture = options.operation.endsWith(".capture-screenshot") || options.operation.endsWith(".record-video");
  if (isCapture !== Boolean(options.captureArtifactId)) throw new Error("mobile.capture_route_declaration_missing");
  return {
    operation: options.operation,
    implementationId: options.implementationId,
    packageDigest: options.packageDigest,
    resultArtifactId: options.resultArtifactId,
    receiptArtifactId: options.receiptArtifactId,
    ...(options.captureArtifactId ? { binaryArtifactIds: [options.captureArtifactId] } : {}),
    maxReceiptAgeMs: 60_000,
    input: options.input,
    async execute({ input, idempotencyKey }) {
      const parsed = mobileRequestSchema.parse(input);
      if (parsed.operation !== options.operation || parsed.providerId !== options.transport.providerId) throw new Error("mobile.explicit_provider_mismatch");
      const { request } = requireMobileSupport(parsed, await options.transport.support(), now());
      const response = await options.transport.execute(request, idempotencyKey);
      const output = normalizeMobileObservation(request, response.observation, now());
      validateCaptureBytes(output.observation, response.captureBytes, options.captureArtifactId);
      return {
        output,
        evidence: output.observation,
        ...(options.captureArtifactId && response.captureBytes ? { artifacts: [{ artifactId: options.captureArtifactId, bytes: response.captureBytes }] } : {}),
      };
    },
    async observe({ input, output, evidence, idempotencyKey }) {
      const request = mobileRequestSchema.parse(input);
      const recorded = mobileResultSchema.parse(output);
      if (request.operation !== options.operation || request.providerId !== options.transport.providerId) return false;
      requireMobileSupport(request, await options.transport.support(), now());
      const actual = await options.transport.observe(request, idempotencyKey);
      if (!actual) return false;
      const normalized = normalizeMobileObservation(request, actual, now());
      return (
        JSON.stringify(normalized) === JSON.stringify(recorded) &&
        JSON.stringify(normalized.observation) === JSON.stringify(mobileObservationSchema.parse(evidence))
      );
    },
  };
}
