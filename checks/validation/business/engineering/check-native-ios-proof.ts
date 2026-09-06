#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  asArray,
  asString,
  getPath,
  issue,
  loadProjectState,
  parseCliArgs,
  readText,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";
import { validateNativeIosRetainedProof } from "./native-ios-retained-proof.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues, ...validateNativeIosRetainedProof(args.root)];
const state = loaded.state;

/**
 * The in-app simulator (Claude Code Desktop's iOS Simulator pane, the CLI
 * computer-use route, and Codex's build-ios-apps plugin) is the lightest native
 * iOS proof route: no MCP install, no third-party account. That is exactly why
 * it needs its own evidence contract — it is the route an agent will reach for
 * by default, and it silently drops physical-device reach and all Android
 * coverage, while its device screenshots leave the machine.
 */
const IN_APP_SIMULATOR_TERMS = ["iOS Simulator pane", "simulator pane", "in-app simulator", "in-app iOS Simulator", "build-ios-apps", "computer-use"];

const readiness = firstExistingText(["engineering/PRODUCTION_READINESS.md", "engineering/engineering/PRODUCTION_READINESS.md"]);
const screenshots = firstExistingText(["SCREENSHOTS.md", "screenshots/SCREENSHOTS.md", "store/app-store-listing/SCREENSHOTS.md"]);

const platforms = state
  ? asArray(getPath(state, "project.platforms"))
      .map((item) => asString(item)?.toLowerCase())
      .filter(Boolean)
  : [];
const iosBundleId = state ? asString(getPath(state, "project.bundleIds.ios")) : undefined;
const hasIos = state ? platforms.includes("ios") || platforms.includes("ipados") || Boolean(iosBundleId?.trim()) : true;
const engineeringStatus = state ? asString(getPath(state, "lanes.engineering.status"))?.toLowerCase() : undefined;

if (hasIos && engineeringStatus === "succeeded" && !readiness) {
  issues.push(
    issue(
      "error",
      "native_ios_proof.readiness_missing",
      "Done iOS engineering requires engineering/PRODUCTION_READINESS.md with native iOS proof.",
      "engineering/PRODUCTION_READINESS.md",
    ),
  );
}

if (hasIos && readiness && shouldValidateReadiness(readiness.text, engineeringStatus)) {
  validateReadiness(readiness.text, readiness.relativePath);
  if (engineeringStatus === "succeeded") {
    validateCriticalMatrix(readiness.text, readiness.relativePath);
    validateGroundedEvidence(readiness.text, readiness.relativePath);
  }
}

if (hasIos && screenshots && hasReadyClaim(screenshots.text)) {
  validateScreenshotCaptureRoute(screenshots.text, screenshots.relativePath);
}

reportAndExit("Native iOS proof check", issues);

function validateReadiness(text: string, file: string): void {
  requireAny(
    text,
    ["Native iOS Proof", "native iOS proof", "iOS proof", "Apple simulator/device proof"],
    "native_ios_proof.section_missing",
    "engineering/PRODUCTION_READINESS.md must include a native iOS proof section before iOS readiness claims.",
    file,
  );
  requireAny(
    text,
    ["Native iOS Launch-Critical Test Matrix", "Launch-Critical Test Matrix"],
    "native_ios_proof.test_matrix_missing",
    "Native iOS readiness needs a launch-critical journey and risk matrix, not tool-route proof alone.",
    file,
  );
  requireAll(
    text,
    [".xctestplan", "unit", "integration", "UI", "performance"],
    "native_ios_proof.test_plan_coverage_missing",
    "Native iOS proof must name a prerelease .xctestplan and unit, integration, UI, and performance coverage.",
    file,
  );
  requireAll(
    text,
    ["device", "OS", "locale", "Dynamic Type", "light", "dark"],
    "native_ios_proof.device_locale_presentation_matrix_missing",
    "Native iOS proof must cover device/OS/locale plus Dynamic Type and light/dark appearance variants.",
    file,
  );
  requireAll(
    text,
    ["permission", "denied", "offline", "retry", "background", "foreground", "deep link", "notification", "interruption"],
    "native_ios_proof.resilience_matrix_missing",
    "Native iOS proof must cover denied permissions, offline/retry, lifecycle transitions, deep links, notifications, and interruptions.",
    file,
  );
  requireAny(
    text,
    ["performAccessibilityAudit", "accessibility audit"],
    "native_ios_proof.accessibility_audit_missing",
    "Native iOS proof must include an accessibility audit route and evidence.",
    file,
  );
  requireAll(
    text,
    ["StoreKit", "entitlement", "restore", "refund"],
    "native_ios_proof.purchase_matrix_missing",
    "Native iOS proof must cover StoreKit purchase, entitlement, restore, and refund/cancel state where monetization is in scope.",
    file,
  );
  requireAll(
    text,
    ["Release configuration", "physical device"],
    "native_ios_proof.release_device_missing",
    "Native iOS proof must record Release-configuration physical-device coverage or an explicit blocker/not-applicable reason.",
    file,
  );
  requireAny(
    text,
    ["Codex Desktop", "XcodeBuildMCP", "MobAI", "SnapshotPreviews", "serve-sim", ...IN_APP_SIMULATOR_TERMS],
    "native_ios_proof.route_missing",
    "Native iOS readiness must name the actual proof route: the in-app iOS Simulator, Codex Desktop/XcodeBuildMCP, MobAI, SnapshotPreviews, or serve-sim.",
    file,
  );
  requireAny(
    text,
    ["screenshot", "video", "UI snapshot", "test result", "xcresult", "snapshot-images", "logs"],
    "native_ios_proof.evidence_path_missing",
    "Native iOS proof must record tangible evidence paths such as screenshots, video, UI snapshots, logs, xcresults, or snapshot image outputs.",
    file,
  );
  requireAny(
    text,
    ["operations/PROVIDER_PROOF.md", "backend/provider proof", "RevenueCat", "PostHog", "Stripe", "Resend", "Sentry"],
    "native_ios_proof.provider_pairing_missing",
    "Native iOS app proof must be paired with backend/provider proof when provider-backed behavior is in scope.",
    file,
  );
  requireAny(
    text,
    ["simulator build alone is not distribution readiness", "does not prove App Store signing", "not distribution readiness", "store/APPLE_SIGNING.md"],
    "native_ios_proof.distribution_limit_missing",
    "Native iOS proof must state that simulator/preview proof does not replace Apple signing, archive, upload, or distribution readiness.",
    file,
  );

  if (includesAny(text, IN_APP_SIMULATOR_TERMS)) {
    // Scoped to the lines that actually claim the route (plus a small window)
    // so the row itself carries its gates and limits, instead of borrowing a
    // stray "Android" from an unrelated MobAI table elsewhere in the document.
    const scope = scopedLines(text, IN_APP_SIMULATOR_TERMS);
    requireAny(
      scope,
      ["local session", "not available in cloud", "cloud and SSH", "cloud/SSH", "SSH session", "local Mac"],
      "native_ios_proof.in_app_simulator_session_missing",
      "In-app simulator proof must record that it ran in a local session; the pane and computer-use routes cannot reach a Mac's simulators from cloud, SSH, or container sessions.",
      file,
    );
    requireAny(
      scope,
      ["iPhone", "iPad", "UDID", "simulator name", "device and OS"],
      "native_ios_proof.in_app_simulator_device_missing",
      "In-app simulator proof must name the simulated device and OS it ran on.",
      file,
    );
    requireAny(
      scope,
      ["fixture account", "fixture or sandbox account", "sandbox account", "test account", "no real account", "never a real"],
      "native_ios_proof.in_app_simulator_fixture_account_missing",
      "In-app simulator device screenshots leave the machine under normal conversation retention, so the proof must record that a fixture or sandbox account was used instead of a real founder, customer, or provider account.",
      file,
    );
    requireAll(
      scope,
      ["Android", "physical device"],
      "native_ios_proof.in_app_simulator_coverage_limit_missing",
      "In-app simulator proof must state the coverage it does not provide: no Android and no physical-device reach. An easier route that silently narrows platform coverage is a paid-tool-routing decision, not a convenience.",
      file,
    );
  }

  if (includesAny(text, ["Codex Desktop", "native iOS capabilities in Codex", "Codex native iOS"])) {
    requireAny(
      text,
      ["session_show_defaults"],
      "native_ios_proof.codex_desktop_session_defaults_missing",
      "Codex Desktop native iOS proof must record session_show_defaults before first build/run/test tool use.",
      file,
    );
    requireAny(
      text,
      ["build_run_sim", "test_sim", "screenshot", "UI snapshot", "logs"],
      "native_ios_proof.codex_desktop_tool_proof_missing",
      "Codex Desktop native iOS proof must record the exposed MCP tool route used for build/run/test/capture.",
      file,
    );
  }

  if (includesAny(text, ["XcodeBuildMCP", "xcodebuildmcp"])) {
    requireAny(
      text,
      ["session_show_defaults", "build_run_sim", "xcodebuildmcp --help", "xcodebuildmcp tools", "xcodebuildmcp simulator"],
      "native_ios_proof.xcodebuildmcp_route_missing",
      "XcodeBuildMCP proof must record either MCP tool names or live CLI help/tool discovery used for the run.",
      file,
    );
    requireAny(
      text,
      ["project", "workspace", "scheme"],
      "native_ios_proof.xcodebuildmcp_project_scheme_missing",
      "XcodeBuildMCP proof must record the project/workspace and scheme used.",
      file,
    );
    requireAny(
      text,
      ["simulator", "device", "UDID", "destination"],
      "native_ios_proof.xcodebuildmcp_target_missing",
      "XcodeBuildMCP proof must record the simulator/device target.",
      file,
    );
  }

  if (includesAny(text, ["SnapshotPreviews", "SnapshotTest", "PreviewLayoutTest"])) {
    requireAny(
      text,
      ["TEST_RUNNER_SNAPSHOTS_EXPORT_DIR", "snapshot-images", ".png", ".json"],
      "native_ios_proof.snapshot_previews_export_missing",
      "SnapshotPreviews proof must record exported PNG/JSON output, usually through TEST_RUNNER_SNAPSHOTS_EXPORT_DIR.",
      file,
    );
    requireAny(
      text,
      ["preview-only", "preview coverage", "does not replace runtime E2E", "not runtime E2E", "not real app E2E"],
      "native_ios_proof.snapshot_previews_limit_missing",
      "SnapshotPreviews proof must state that preview snapshots do not replace runtime E2E/device proof.",
      file,
    );
  }

  if (includesAny(text, ["serve-sim", "serve sim"])) {
    requireAny(
      text,
      ["localhost:3200", "--port", "port", "preview URL", "MJPEG", "WebSocket"],
      "native_ios_proof.serve_sim_url_missing",
      "serve-sim proof must record the preview URL/port or stream/control channel.",
      file,
    );
    requireAny(
      text,
      ["booted simulator", "booted iOS Simulator", "simctl", "device"],
      "native_ios_proof.serve_sim_booted_target_missing",
      "serve-sim proof must identify the booted simulator/device it streamed.",
      file,
    );
    requireAny(
      text,
      ["does not replace backend/provider proof", "does not replace App Store signing", "not distribution readiness", "not provider proof"],
      "native_ios_proof.serve_sim_limit_missing",
      "serve-sim proof must state that a simulator stream does not replace provider proof or App Store signing readiness.",
      file,
    );
  }
}

function validateGroundedEvidence(text: string, file: string): void {
  const candidates = Array.from(text.matchAll(/`([^`]+\.(?:xcresult|png|jpe?g|mp4|mov|log|json))`/gi))
    .map((match) => match[1])
    .filter((candidate): candidate is string => Boolean(candidate));
  const existing = candidates.filter((candidate) => isGroundedEvidence(candidate));
  if (candidates.length === 0 || existing.length === 0) {
    issues.push(
      issue(
        "error",
        "native_ios_proof.grounded_evidence_missing",
        "Done iOS engineering needs at least one repo-relative backtick-quoted .xcresult, screenshot/video, log, or JSON evidence path that exists on disk.",
        file,
      ),
    );
  }
}

function validateCriticalMatrix(text: string, file: string): void {
  const headingIndex = text.toLowerCase().indexOf("native ios launch-critical test matrix");
  if (headingIndex < 0) return;
  const lines = text.slice(headingIndex).split(/\r?\n/);
  const tableStart = lines.findIndex((line) => line.trim().startsWith("| Risk / journey"));
  const rows: string[][] = [];
  if (tableStart >= 0) {
    for (const line of lines.slice(tableStart + 2)) {
      if (!line.trim().startsWith("|")) break;
      rows.push(
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    }
  }
  const expected = [
    "cold launch",
    "account lifecycle",
    "purchase lifecycle",
    "permissions",
    "resilience",
    "accessibility",
    "localization",
    "performance",
    "release device",
  ];
  const seenEvidence = new Set<string>();
  for (const journey of expected) {
    const row = rows.find((cells) => cells[0]?.toLowerCase().includes(journey));
    if (!row) {
      issues.push(issue("error", "native_ios_proof.matrix_row_missing", `Done iOS engineering needs the ${journey} matrix row.`, file));
      continue;
    }
    const evidence = row[3] ?? "";
    const provider = row[4] ?? "";
    const result = row[5] ?? "";
    if (!result || /pending/i.test(result)) {
      issues.push(issue("error", "native_ios_proof.matrix_row_pending", `${journey} cannot remain Pending when iOS engineering is done.`, file));
      continue;
    }
    if (/^(blocked|not applicable|n-a)/i.test(result)) {
      if (!/20\d{2}-\d{2}-\d{2}/.test(result) || !/[:;-]\s*\S+/.test(result)) {
        issues.push(issue("error", "native_ios_proof.matrix_deferral_unexplained", `${journey} needs a dated blocked/not-applicable reason.`, file));
      }
      continue;
    }
    if (!/pass(?:ed)?/i.test(result)) {
      issues.push(issue("error", "native_ios_proof.matrix_result_invalid", `${journey} result must be Passed or a dated blocked/not-applicable reason.`, file));
      continue;
    }
    const evidencePath = Array.from(evidence.matchAll(/`([^`]+\.(?:xcresult|png|jpe?g|mp4|mov|log|json))`/gi))[0]?.[1];
    if (!evidencePath || !isGroundedEvidence(evidencePath)) {
      issues.push(issue("error", "native_ios_proof.matrix_evidence_missing", `${journey} needs its own existing repo-relative evidence artifact.`, file));
    } else if (seenEvidence.has(evidencePath)) {
      issues.push(issue("error", "native_ios_proof.matrix_evidence_reused", `${journey} reuses another row's evidence; attach row-specific proof.`, file));
    } else {
      seenEvidence.add(evidencePath);
    }
    if (!provider || /pending/i.test(provider)) {
      issues.push(
        issue("error", "native_ios_proof.matrix_provider_correlation_missing", `${journey} needs provider correlation or an explicit n-a reason.`, file),
      );
    }
  }
}

function isGroundedEvidence(candidate: string): boolean {
  if (path.isAbsolute(candidate) || candidate.split(/[\\/]/).includes("..")) return false;
  const fullPath = path.join(args.root, candidate);
  if (!existsSync(fullPath)) return false;
  if (/\.xcresult$/i.test(candidate)) {
    return statSync(fullPath).isDirectory();
  }
  return statSync(fullPath).isFile();
}

function validateScreenshotCaptureRoute(text: string, file: string): void {
  requireAny(
    text,
    ["MobAI", "Codex Desktop", "XcodeBuildMCP", "serve-sim", "on-device", "device capture", "real app capture", ...IN_APP_SIMULATOR_TERMS],
    "native_ios_proof.screenshot_capture_route_missing",
    "Ready iOS screenshot work must name the real app, simulator, or device capture route used for raw UI.",
    file,
  );
  if (includesAny(text, IN_APP_SIMULATOR_TERMS)) {
    // Store screenshots are the likeliest place to sign a driven device into a
    // real account "to make the flow look real" — and those device screenshots
    // leave the machine. The readiness doc carries this rule; so must this one.
    requireAny(
      scopedLines(text, IN_APP_SIMULATOR_TERMS),
      ["fixture account", "fixture or sandbox account", "sandbox account", "test account", "no real account", "never a real"],
      "native_ios_proof.screenshot_in_app_simulator_fixture_account_missing",
      "Raw captures from an agent-driven simulator must record that a fixture or sandbox account was used; the agent's device screenshots leave the machine, so a real founder, customer, store, or provider account must never appear in store artwork.",
      file,
    );
  }

  if (includesAny(text, ["SnapshotPreviews", "SnapshotTest", "PreviewLayoutTest"])) {
    requireAny(
      text,
      ["preview-only", "preview/component proof", "does not replace runtime", "not runtime", "not raw real-app UI"],
      "native_ios_proof.screenshot_snapshot_previews_limit_missing",
      "Ready iOS screenshot work that mentions SnapshotPreviews must state that it is preview-only support proof, not raw real-app UI.",
      file,
    );
  }
}

function shouldValidateReadiness(text: string, laneStatus?: string): boolean {
  return (
    laneStatus === "succeeded" ||
    hasReadyClaim(text) ||
    includesAny(text, ["Native iOS Proof", "Codex Desktop", "SnapshotPreviews", "serve-sim", ...IN_APP_SIMULATOR_TERMS])
  );
}

/**
 * Returns the lines that mention any of `terms`, plus two lines of context on
 * each side, so a route-specific requirement is checked against the claim that
 * triggered it rather than against the whole document.
 */
function scopedLines(text: string, terms: string[]): string {
  const lines = text.split(/\r?\n/);
  const keep = new Set<number>();
  for (const [index, line] of lines.entries()) {
    if (!includesAny(line, terms)) continue;
    for (let offset = -2; offset <= 2; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) keep.add(target);
    }
  }
  return Array.from(keep)
    .sort((left, right) => left - right)
    .map((index) => lines[index])
    .join("\n");
}

function hasReadyClaim(text: string): boolean {
  if (!text.trim() || /Status:\s*partial until/i.test(text)) {
    return false;
  }
  return /\b(done|ready|production[- ]ready|launch[- ]ready|implementation proof|ce-work completed|upload-ready)\b/i.test(text);
}

function firstExistingText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const fullPath = path.join(args.root, candidate);
    if (existsSync(fullPath)) {
      const text = readText(args.root, candidate);
      if (text !== undefined) {
        return { relativePath: candidate, text };
      }
    }
  }
  return undefined;
}

function requireAny(text: string, terms: string[], code: string, message: string, file: string): void {
  if (!includesAny(text, terms)) {
    issues.push(issue("error", code, message, file));
  }
}

function requireAll(text: string, terms: string[], code: string, message: string, file: string): void {
  const lower = text.toLowerCase();
  if (terms.some((term) => !lower.includes(term.toLowerCase()))) {
    issues.push(issue("error", code, message, file));
  }
}

function includesAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}
