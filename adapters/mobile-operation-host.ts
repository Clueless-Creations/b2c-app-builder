import { boundedFileBytes } from "../kernel/lib/bounded-file.js";
import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inspectIosAppBundle } from "./ios-app-evidence.js";
import type { DeviceProofSpawnFn, InstalledSimulatorBuild } from "./device-proof.js";
import { targetFromInstalledSimulatorBuild, type MobileOperationTransport } from "./mobile-operation.js";
import { requireMobileSupport, type MobileObservation, type MobileOperation, type MobileRequest, type MobileSupport } from "../contracts/mobile-operation.js";

const PROVIDER = "b2c/host-native-mobile";
const LAUNCH = "b2c/mobile-app-operation.launch";
const INSPECT = "b2c/mobile-app-operation.inspect";
const SCREENSHOT = "b2c/mobile-app-operation.capture-screenshot";
const TTL = 60_000;
const defaultSpawn: DeviceProofSpawnFn = (command, args, options) => {
  const result = spawnSync(command, [...args], { encoding: "utf8", timeout: options.timeoutMs, maxBuffer: 4 * 1024 * 1024, killSignal: "SIGKILL" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
};
export interface NativeMobileTargetProof {
  build: InstalledSimulatorBuild;
  observedAt: string;
  osVersion: string;
  locale: string;
}
export interface NativeForegroundObservation {
  deviceId: string;
  appId: string;
  observedAt: string;
}
export interface NativeMobileHostOptions {
  /** Trusted host-selected current install proof. Never populate from public caller-authored receipt fields. */
  proof: NativeMobileTargetProof;
  captureArtifactId?: string;
  /** An already-exposed host observer. Missing observer means screenshot is unsupported. */
  readForegroundApp?: () => Promise<NativeForegroundObservation>;
  spawn?: DeviceProofSpawnFn;
  now?: () => Date;
}
function fresh(value: string, now: Date): void {
  const age = now.getTime() - Date.parse(value);
  if (!Number.isFinite(age) || age < 0 || age > TTL) throw new Error("mobile.host_target_proof_stale");
}
function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Uses the existing operation route registry. No install, boot, bridge startup, fallback or persistent evidence owner. */
export function createNativeMobileOperationTransport(options: NativeMobileHostOptions): MobileOperationTransport {
  const proof = structuredClone(options.proof);
  const target = targetFromInstalledSimulatorBuild(proof.build, proof.osVersion, proof.locale);
  const spawn = options.spawn ?? defaultSpawn;
  const now = options.now ?? (() => new Date());
  const operations: MobileOperation[] = [LAUNCH, INSPECT, ...(options.readForegroundApp && options.captureArtifactId ? [SCREENSHOT as MobileOperation] : [])];
  // Ephemeral readback handles only. Existing route receipts remain the durable evidence and retry owner.
  const completed = new Map<string, { request: MobileRequest; observation: MobileObservation; pid?: string }>();
  const dispatched = new Set<string>();
  const command = (executable: string, args: readonly string[]) => {
    const result = spawn(executable, args, { timeoutMs: 15_000 });
    if (result.status !== 0 || result.error) throw new Error("mobile.host_command_failed_or_uncertain");
    return result.stdout.trim();
  };
  const inspect = () => {
    fresh(proof.observedAt, now());
    if (target.platform !== "ios" || target.deviceKind !== "simulator" || !/^[a-f0-9-]{36}$/i.test(target.deviceId))
      throw new Error("mobile.host_target_unsupported");
    const inventory = JSON.parse(command("xcrun", ["simctl", "list", "devices", "available", "--json"])) as { devices?: Record<string, unknown[]> };
    const matches = Object.entries(inventory.devices ?? {})
      .flatMap(([runtime, entries]) => entries.map((device) => ({ runtime, device })))
      .filter(({ device }) => typeof device === "object" && device !== null && (device as Record<string, unknown>).udid === target.deviceId);
    if (matches.length !== 1) throw new Error("mobile.host_device_missing_or_ambiguous");
    const match = matches[0]!;
    const device = match.device as Record<string, unknown>;
    const osVersion = match.runtime.match(/\.iOS-([0-9-]+)$/)?.[1]?.replaceAll("-", ".");
    if (device.isAvailable !== true || device.state !== "Booted" || osVersion !== target.osVersion)
      throw new Error("mobile.host_device_identity_changed_or_not_booted");
    const locale = command("xcrun", ["simctl", "spawn", target.deviceId, "defaults", "read", "-g", "AppleLocale"]);
    if (locale !== target.locale) throw new Error("mobile.host_locale_changed");
    const installedPath = command("xcrun", ["simctl", "get_app_container", target.deviceId, target.appId, "app"]);
    if (!path.isAbsolute(installedPath) || realpathSync(installedPath) !== realpathSync(proof.build.installedAppPath))
      throw new Error("mobile.host_install_changed");
    const installed = inspectIosAppBundle(installedPath);
    if (
      installed.bundleId !== target.appId ||
      installed.buildNumber !== target.buildId ||
      installed.bundleContentSha256 !== target.artifactSha256 ||
      installed.executable.sha256 !== proof.build.executable.sha256
    )
      throw new Error("mobile.host_installed_build_mismatch");
    fresh(proof.observedAt, now());
    return path.join(realpathSync(installedPath), installed.executable.path);
  };
  const foreground = async () => {
    if (!options.readForegroundApp) throw new Error("mobile.host_foreground_readback_unavailable");
    const queriedAt = now();
    const observed = await options.readForegroundApp();
    fresh(observed.observedAt, now());
    if (Date.parse(observed.observedAt) < queriedAt.getTime()) throw new Error("mobile.host_foreground_readback_stale");
    if (observed.deviceId !== target.deviceId || observed.appId !== target.appId) throw new Error("mobile.host_foreground_mismatch");
  };
  const support = async (): Promise<MobileSupport> => {
    let available = true;
    try {
      inspect();
    } catch {
      available = false;
    }
    let availableOperations = [...operations];
    if (availableOperations.includes(SCREENSHOT)) {
      try {
        await foreground();
      } catch {
        availableOperations = availableOperations.filter((operation) => operation !== SCREENSHOT);
      }
    }
    return {
      providerId: PROVIDER,
      availability: available ? "available" : "unavailable",
      checkedAt: now().toISOString(),
      source: "host-inventory",
      tuples: available ? [{ platform: "ios", deviceKind: "simulator", operations: availableOperations }] : [],
      limitations: [
        "Only an already booted, freshly proved installed iOS simulator target is supported.",
        "Inspect reads installed identity; it does not inspect UI elements.",
        "Interaction and video are unsupported.",
        "Screenshot requires explicit trusted foreground readback; raw byte identity and format headers are not decoded-image quality, acceptance or finished marketing creative.",
        "Readback handles are process-local; a restarted host refuses old execution readback.",
      ],
    };
  };
  const running = (pid: string, executable: string) => {
    const actual = command("/bin/ps", ["-p", pid, "-o", "comm="]);
    if (!path.isAbsolute(actual) || realpathSync(actual) !== realpathSync(executable)) throw new Error("mobile.host_launch_readback_mismatch");
  };
  return {
    providerId: PROVIDER,
    support,
    async execute(request, key) {
      requireMobileSupport(request, await support(), now());
      if (!equal(request.target, target)) throw new Error("mobile.host_selected_target_mismatch");
      if (!key || dispatched.has(key)) throw new Error("mobile.host_duplicate_or_empty_dispatch");
      const executable = inspect();
      dispatched.add(key);
      let pid: string | undefined;
      let captureBytes: Buffer | undefined;
      let capture: MobileObservation["capture"];
      if (request.operation === LAUNCH) {
        const output = command("xcrun", ["simctl", "launch", target.deviceId, target.appId]);
        const match = output.match(/^([^\s:]+):\s*([1-9][0-9]*)$/);
        if (!match || match[1] !== target.appId) throw new Error("mobile.host_launch_result_uncertain");
        pid = match[2]!;
        running(pid, executable);
      } else if (request.operation === SCREENSHOT) {
        await foreground();
        const temporary = mkdtempSync(path.join(tmpdir(), "b2c-native-capture-"));
        try {
          const file = path.join(temporary, "capture.png");
          command("xcrun", ["simctl", "io", target.deviceId, "screenshot", "--type=png", file]);
          captureBytes = boundedFileBytes(file, 32 * 1024 * 1024);
          if (captureBytes.length < 24) throw new Error("mobile.host_capture_invalid");
          if (!captureBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("mobile.host_capture_invalid");
          capture = {
            artifactId: options.captureArtifactId!,
            sha256: createHash("sha256").update(captureBytes).digest("hex"),
            mimeType: "image/png",
            width: captureBytes.readUInt32BE(16),
            height: captureBytes.readUInt32BE(20),
            stateId: request.stateId,
            source: "app-pixels",
          };
          await foreground();
        } finally {
          rmSync(temporary, { recursive: true, force: true });
        }
      } else if (request.operation !== INSPECT) throw new Error("mobile.unsupported_target_operation");
      inspect();
      const observation: MobileObservation = {
        providerId: PROVIDER,
        operation: request.operation,
        target: structuredClone(target),
        executionId: key,
        observedAt: now().toISOString(),
        source: "host-observation",
        completion: "completed",
        observations: [
          request.operation === INSPECT
            ? "Read back the exact installed simulator bundle, executable, build, OS and locale; UI state is unobserved."
            : request.operation === LAUNCH
              ? "Read back the launched process executable and the exact installed build."
              : "Captured native simulator PNG bytes with matching foreground app readback before and after; visual quality is unassessed.",
        ],
        actionsCompleted: 0,
        ...(capture ? { capture } : {}),
      };
      completed.set(key, { request: structuredClone(request), observation: structuredClone(observation), ...(pid ? { pid } : {}) });
      return { observation, ...(captureBytes ? { captureBytes } : {}) };
    },
    async observe(request, key) {
      const previous = completed.get(key);
      if (!previous || !equal(request, previous.request)) return undefined;
      fresh(previous.observation.observedAt, now());
      const executable = inspect();
      if (previous.pid) running(previous.pid, executable);
      if (previous.observation.capture) await foreground();
      return structuredClone(previous.observation);
    },
  };
}
