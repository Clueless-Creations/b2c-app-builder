import type { BusinessStateV2 } from "../schema/types.js";

/**
 * Route Ladder rung selection (#36), pure and I/O-free by design so it is trivial to unit test.
 *
 * knowledge/engineering/xcodebuildmcp-testing.md's rung table names five rungs; rungs 0 (Claude
 * Desktop's in-app iOS Simulator pane / Codex build-ios-apps) and 1 (CLI computer-use) are
 * interactive-agent-only capabilities with no headless process to invoke — a `tsx` subprocess has
 * no simulator pane and no computer-use tool of its own. This function NEVER returns those rungs.
 * It picks between the two rungs a script CAN actually drive: rung 2 (raw xcodebuild/xcrun
 * simctl, the same primitives XcodeBuildMCP itself wraps) for iOS on a local macOS session, and
 * rung 4 (the MobAI CLI) for Android or an explicit MobAI selection. Everything else is
 * `"blocked"`, named with a reason a founder can act on — never a silent claim that a rung ran
 * when it did not.
 */
export type ProofRung = "rung-2-xcodebuild" | "rung-4-mobai" | "blocked";
export type ProofPlatform = "ios" | "android";

/**
 * What the caller already knows about the machine and toolchain it is running on. Real values
 * come from `probeDeviceProofEnvironment` (adapters/device-proof.ts); every fixture in this
 * repo builds this object by hand instead, so `selectProofRung` itself never touches a process.
 */
export interface ProofEnvironmentProbe {
  readonly platform: NodeJS.Platform;
  readonly xcodebuildAvailable: boolean;
  readonly simctlAvailable: boolean;
  readonly mobaiAvailable: boolean;
}

export interface RungDecision {
  readonly rung: ProofRung;
  /** Founder-plain reason this rung (or "blocked") was picked — always present, on every branch. */
  readonly reason: string;
}

/**
 * Provider selection is the typed accessRoute field. Provider-specific extras do not
 * grant selection; the reducer validates accessRoute against its enum.
 */
function mobaiExplicitlySelected(state: Pick<BusinessStateV2, "providers">): boolean {
  const accessRoute = state.providers?.["mobai"]?.accessRoute;
  return accessRoute !== undefined && accessRoute !== "not_selected";
}

export function selectProofRung(
  state: Pick<BusinessStateV2, "project" | "providers">,
  probe: ProofEnvironmentProbe,
  requestedPlatform?: ProofPlatform,
): RungDecision {
  const platforms = state.project.platforms;
  const supported = (["ios", "android"] as const).filter((platform) => platforms.includes(platform));

  if (requestedPlatform && !supported.includes(requestedPlatform)) {
    return { rung: "blocked", reason: `${requestedPlatform} proof was requested, but ${requestedPlatform} is not declared in state.project.platforms.` };
  }
  if (!requestedPlatform && supported.length > 1) {
    return {
      rung: "blocked",
      reason:
        "Both iOS and Android are declared. Run one exact target at a time with --platform ios and --platform android; one platform cannot satisfy the other.",
    };
  }
  const selectedPlatform = requestedPlatform ?? supported[0];

  if (selectedPlatform === "android" || (selectedPlatform === "ios" && supported.length === 1 && mobaiExplicitlySelected(state))) {
    return probe.mobaiAvailable
      ? {
          rung: "rung-4-mobai",
          reason:
            selectedPlatform === "android"
              ? "Android is the selected proof target and the mobai CLI is on PATH."
              : "iOS is the selected proof target, MobAI is the explicit provider selection, and the mobai CLI is on PATH.",
        }
      : {
          rung: "blocked",
          reason:
            selectedPlatform === "android"
              ? "Android is the selected proof target, but the mobai CLI is not on PATH."
              : "iOS is the selected proof target and MobAI is explicit, but the mobai CLI is not on PATH.",
        };
  }

  if (selectedPlatform === "ios") {
    if (probe.platform !== "darwin") {
      return { rung: "blocked", reason: "iOS device proof needs a local macOS session; this process is not running on macOS." };
    }
    if (!probe.xcodebuildAvailable || !probe.simctlAvailable) {
      return { rung: "blocked", reason: "Xcode command line tools (xcodebuild and xcrun simctl) are not available on this Mac." };
    }
    return { rung: "rung-2-xcodebuild", reason: "iOS is declared, this is a local macOS session, and Xcode command line tools are present." };
  }

  return { rung: "blocked", reason: "No supported platform (ios or android) is declared in state.project.platforms." };
}
