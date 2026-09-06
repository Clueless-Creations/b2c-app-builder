#!/usr/bin/env node
/**
 * Deterministic device-proof CLI (#36): auto-selects a Route Ladder rung from workspace state
 * (kernel/engine/proof-rung.ts), drives it through an adapter over the shared SpawnFn seam
 * (adapters/device-proof.ts), and writes a structured proof artifact under the matching
 * `<workspace>/proof/{ios-simulator,ios-device,android-emulator,android-device}/` target. An
 * unresolved target uses its platform-specific incomplete lane; mixed scope without an exact
 * platform uses `proof/platform-incomplete/`. Every artifact carries a machine-readable verdict. A passing
 * passing rung-2 run also writes a strict receipt that retains and rehashes the built and
 * installed .app bundles plus the build, install, readback, and launch transcripts.
 *
 * This is deliberately its own small script, not a mode inside kernel/session/run.ts's dispatch
 * loop: proof is one bounded action with no grants, budget ledger, or digest needs, and forcing
 * it through the autonomy-gated dispatch loop would drag in machinery it doesn't want. It mirrors
 * kernel/session/verify.ts's shape instead (parseArgs, one main(), typed exit codes).
 *
 * Rung 0 (Claude Desktop's in-app iOS Simulator pane / Codex build-ios-apps) and rung 1 (CLI
 * computer-use) are interactive-agent-only capabilities per
 * knowledge/engineering/xcodebuildmcp-testing.md — a headless `tsx` process has no simulator pane
 * and no computer-use tool of its own, so this command NEVER selects them and never claims to.
 * When neither the MobAI CLI (Android, or an explicit provider selection) nor local Xcode command
 * line tools (iOS) are reachable, the artifact's verdict is "blocked" with a plain reason, not a
 * narrated run that did not happen.
 *
 * Usage:
 *   tsx kernel/session/proof.ts --workspace <id-or-path> [--platform ios|android] [--flow <name>] [--device <name>]
 *     [--project <path>] [--scheme <name>] [--bundle-id <id>] [--app-path <path>] [--json]
 *
 * Exit codes: 0 = verdict passed; 1 = verdict failed or blocked, or invalid input/workspace.
 *
 * Test seam: set B2C_DEVICE_PROOF_ADAPTER=fixture to run the scripted fixture adapter instead of
 * a real device — steps default to one passing step; override with the
 * B2C_DEVICE_PROOF_FIXTURE_STEPS env var (a JSON array of {name, ok, screenshotPath?, error?}).
 * This mirrors kernel/session/run.ts's own `--executor fixture` idiom. No fixture, and no CI
 * invocation of this file, ever touches a real simulator or the MobAI CLI.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainModule, parseArgs } from "../lib/cli.js";
import { loadBusinessStateFile, resolveWorkspacePaths } from "./run.js";
import { selectProofRung, type ProofPlatform, type ProofRung, type RungDecision } from "../engine/proof-rung.js";
import {
  createFixtureDeviceProofAdapter,
  createMobaiCliAdapter,
  createXcodebuildSimulatorAdapter,
  inspectMobaiDevice,
  probeDeviceProofEnvironment,
  type DeviceProofAdapter,
  type DeviceProofSpawnFn,
  type DeviceProofStep,
  type MobaiDeviceIdentity,
} from "../../adapters/device-proof.js";
import { defaultSpawn } from "../../adapters/profile.js";
import { fingerprintIosDesignInputs, materializeStrictIosSimulatorProof } from "./ios-proof-receipt.js";
import { resolveCliWorkspace } from "./status.js";

export interface ProofArtifact {
  /** One exact platform per invocation. Mixed businesses run this command once per platform. */
  readonly platform: ProofPlatform | "unresolved";
  /** Target-specific output lane. It does not assert strict design acceptance. */
  readonly target: ProofOutputTarget;
  readonly rung: ProofRung;
  readonly reasonForRung: string;
  /** Operator label only. Passing means the listed adapter actions passed, not the named journey. */
  readonly flow: string;
  readonly verificationScope: "adapter-actions-only";
  readonly steps: readonly DeviceProofStep[];
  readonly verdict: "passed" | "failed" | "blocked";
  readonly failingStep?: string;
  /** Workspace-relative machine receipt when rung 2 retained both .app identities. */
  readonly strictReceiptPath?: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

const DEFAULT_FLOW = "smoke";
const PROOF_FLOW_SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export function resolveProofFlow(value?: string): string {
  const flow = value?.trim() || DEFAULT_FLOW;
  if (!PROOF_FLOW_SLUG.test(flow)) throw new Error("--flow must be a filename-safe slug of 1 to 80 letters, numbers, dots, underscores, or hyphens.");
  return flow;
}

export type ProofOutputTarget =
  "ios-simulator" | "ios-device" | "android-emulator" | "android-device" | "ios-incomplete" | "android-incomplete" | "platform-incomplete";

/** Keep every proof artifact in the platform/target lane it actually describes. */
export function resolveProofOutputTarget(
  rung: ProofRung,
  platforms: readonly ProofPlatform[],
  mobaiDevice?: MobaiDeviceIdentity,
  requestedPlatform?: ProofPlatform,
): ProofOutputTarget {
  if (rung === "rung-2-xcodebuild") return "ios-simulator";
  if (mobaiDevice?.platform === "android") return mobaiDevice.virtual ? "android-emulator" : "android-device";
  if (mobaiDevice?.platform === "ios") return mobaiDevice.virtual ? "ios-simulator" : "ios-device";
  const selectedPlatform = requestedPlatform ?? (platforms.length === 1 ? platforms[0] : undefined);
  if (selectedPlatform === "android") return "android-incomplete";
  if (selectedPlatform === "ios") return "ios-incomplete";
  return "platform-incomplete";
}

/** Pure and exported so a fixture can prove all three outcomes without a subprocess or a real adapter. */
export function deriveProofVerdict(steps: readonly DeviceProofStep[]): { verdict: "passed" | "failed"; failingStep?: string } {
  const failing = steps.find((step) => !step.ok);
  if (failing) return { verdict: "failed", failingStep: failing.name };
  return { verdict: steps.length > 0 ? "passed" : "failed" };
}

function resolveFixtureSteps(): DeviceProofStep[] {
  const raw = process.env.B2C_DEVICE_PROOF_FIXTURE_STEPS;
  if (!raw) return [{ name: "fixture_step", ok: true }];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("B2C_DEVICE_PROOF_FIXTURE_STEPS must be a JSON array of steps");
  return parsed as DeviceProofStep[];
}

/** All-available and darwin regardless of the real host, so a fixture run is deterministic on any CI machine. */
const FIXTURE_PROBE = { platform: "darwin" as NodeJS.Platform, xcodebuildAvailable: true, simctlAvailable: true, mobaiAvailable: true };

/** Injectable only for fixtures; the normal rung-2 path deliberately preserves the adapter default. */
export interface ProofAdapterFactories {
  readonly xcodebuildSimulator?: (spawn?: DeviceProofSpawnFn) => DeviceProofAdapter;
  readonly mobai?: typeof createMobaiCliAdapter;
}

export function resolveProofAdapter(rung: ProofRung, factories: ProofAdapterFactories = {}): DeviceProofAdapter | undefined {
  if (process.env.B2C_DEVICE_PROOF_ADAPTER === "fixture") return createFixtureDeviceProofAdapter(resolveFixtureSteps());
  // Do not inject profile.ts's unbounded defaultSpawn here. The Xcode adapter owns
  // its bounded Node spawnSync default, including timeout and SIGKILL behavior.
  if (rung === "rung-2-xcodebuild") return (factories.xcodebuildSimulator ?? createXcodebuildSimulatorAdapter)();
  if (rung === "rung-4-mobai") return (factories.mobai ?? createMobaiCliAdapter)(defaultSpawn);
  return undefined;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspace) {
    console.error(
      "Usage: tsx kernel/session/proof.ts --workspace <id-or-path> [--platform ios|android] [--flow <name>] [--device <name>] [--project <path>] [--scheme <name>] [--bundle-id <id>] [--app-path <path>] [--json]",
    );
    return 1;
  }
  const resolvedWorkspace = resolveCliWorkspace(args.workspace!);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  const paths = resolveWorkspacePaths(workspace);
  const businessState = loadBusinessStateFile(paths.state);
  if (!businessState) {
    console.error("ISSUE proof.workspace_not_ready: this business isn't set up yet — I couldn't find its saved progress.");
    return 1;
  }

  let flow: string;
  try {
    flow = resolveProofFlow(args.flow);
  } catch (error) {
    console.error(`ISSUE proof.invalid_flow: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const startedAt = args.now ?? new Date().toISOString();
  const platformValue = args.platform?.trim().toLowerCase();
  if (platformValue && platformValue !== "ios" && platformValue !== "android") {
    console.error("ISSUE proof.invalid_platform: --platform must be ios or android.");
    return 1;
  }
  const requestedPlatform = platformValue as ProofPlatform | undefined;
  const supportedPlatforms = businessState.project.platforms.filter((platform): platform is ProofPlatform => platform === "ios" || platform === "android");
  const selectedPlatform = requestedPlatform ?? (supportedPlatforms.length === 1 ? supportedPlatforms[0] : undefined);

  const probe = process.env.B2C_DEVICE_PROOF_ADAPTER === "fixture" ? FIXTURE_PROBE : probeDeviceProofEnvironment(defaultSpawn);
  const decision: RungDecision = selectProofRung(businessState, probe, requestedPlatform);

  let mobaiDevice: MobaiDeviceIdentity | undefined;
  let mobaiResolutionError: string | undefined;
  if (decision.rung === "rung-4-mobai" && process.env.B2C_DEVICE_PROOF_ADAPTER !== "fixture") {
    try {
      const observed = inspectMobaiDevice(defaultSpawn, args.device ?? "");
      if (selectedPlatform && observed.platform !== selectedPlatform)
        throw new Error(`MobAI resolved an ${observed.platform} device, but this proof selected ${selectedPlatform}.`);
      mobaiDevice = observed;
    } catch (error) {
      mobaiResolutionError = String(error);
    }
  }
  const outputTarget = resolveProofOutputTarget(decision.rung, supportedPlatforms, mobaiDevice, requestedPlatform);
  const outputDir = path.join(paths.root, "proof", outputTarget);
  mkdirSync(outputDir, { recursive: true });

  let iosDesignFingerprint: string | undefined;
  let iosEvidenceSessionId: string | undefined;
  if (decision.rung === "rung-2-xcodebuild" && selectedPlatform === "ios" && process.env.B2C_DEVICE_PROOF_ADAPTER !== "fixture") {
    try {
      iosEvidenceSessionId = randomUUID();
      iosDesignFingerprint = fingerprintIosDesignInputs(workspace);
    } catch (error) {
      console.error(`ISSUE proof.design_inputs: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  const adapter = decision.rung === "blocked" ? undefined : resolveProofAdapter(decision.rung);
  let steps: readonly DeviceProofStep[] = [];
  let verdict: ProofArtifact["verdict"];
  let failingStep: string | undefined;
  if (mobaiResolutionError) {
    steps = [{ name: "resolve_device", ok: false, error: mobaiResolutionError }];
    verdict = "failed";
    failingStep = "resolve_device";
  } else if (!adapter) {
    verdict = "blocked";
  } else {
    const result = adapter.runFlow({
      workspaceDir: workspace,
      deviceName: args.device ?? "",
      scheme: args.scheme,
      projectPath: args.project,
      bundleId: args["bundle-id"],
      appPath: args["app-path"],
      outputDir,
      retainedEvidenceSessionId: iosEvidenceSessionId,
      mobaiDevice,
      requiredPlatform: decision.rung === "rung-4-mobai" ? selectedPlatform : undefined,
    });
    steps = result.steps;
    const derived = deriveProofVerdict(steps);
    verdict = derived.verdict;
    failingStep = derived.failingStep;
  }

  let strictReceiptPath: string | undefined;
  if (verdict === "passed" && decision.rung === "rung-2-xcodebuild" && selectedPlatform === "ios" && process.env.B2C_DEVICE_PROOF_ADAPTER !== "fixture") {
    try {
      if (!iosDesignFingerprint) throw new Error("strict iOS proof is missing its pre-run design fingerprint");
      const retained = materializeStrictIosSimulatorProof({
        workspaceRoot: workspace,
        outputDir,
        flow,
        steps,
        startedAt,
        designFingerprint: iosDesignFingerprint,
        sessionId: iosEvidenceSessionId,
      });
      strictReceiptPath = retained.relativeReceiptPath;
      steps = [...steps, { name: "strict_receipt", ok: true }];
    } catch (error) {
      steps = [...steps, { name: "strict_receipt", ok: false, error: error instanceof Error ? error.message : String(error) }];
      verdict = "failed";
      failingStep = "strict_receipt";
    }
  }

  const finishedAt = new Date().toISOString();
  const artifact: ProofArtifact = {
    platform: selectedPlatform ?? "unresolved",
    target: outputTarget,
    rung: decision.rung,
    reasonForRung: decision.reason,
    flow,
    verificationScope: "adapter-actions-only",
    steps,
    verdict,
    ...(failingStep ? { failingStep } : {}),
    ...(strictReceiptPath ? { strictReceiptPath } : {}),
    startedAt,
    finishedAt,
  };

  const artifactPath = path.join(outputDir, `${flow}-${finishedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

  if (args.json === "true") {
    console.log(JSON.stringify({ ...artifact, artifactPath }));
  } else if (verdict === "blocked") {
    console.log(`Proof BLOCKED for "${flow}": ${decision.reason}`);
    console.log(`Artifact: ${path.relative(workspace, artifactPath)}`);
  } else {
    console.log(`Proof ${verdict.toUpperCase()} on ${decision.rung} ("${flow}"): ${decision.reason}`);
    for (const step of steps) console.log(`  ${step.ok ? "OK  " : "FAIL"} ${step.name}${step.error ? ` — ${step.error}` : ""}`);
    if (failingStep) console.log(`Failing step: ${failingStep}`);
    console.log(`Artifact: ${path.relative(workspace, artifactPath)}`);
  }

  return verdict === "passed" ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`ISSUE proof.unexpected_error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
