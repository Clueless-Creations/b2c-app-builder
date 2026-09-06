import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, expectRecord, getLane, readState, skillRoot, writeState } from "./_harness.js";

export function register(h: Harness): void {
  const { makeEmptyFixture, makeFixture, runFixture, runScriptArgs } = h;

  runScriptArgs("MobAI 2.5 stored contract passes", "check-mobai-proof.ts", ["--skill-root", skillRoot, "--contract-only"], 0);

  const staleContract = makeEmptyFixture("mobai-stale-version-command");
  mkdirSync(path.join(staleContract, "knowledge", "engineering"), { recursive: true });
  writeFileSync(
    path.join(staleContract, "knowledge", "engineering", "mobai-toolbelt.md"),
    readFileSync(path.join(skillRoot, "knowledge", "engineering", "mobai-toolbelt.md"), "utf8"),
    "utf8",
  );
  writeFileSync(path.join(staleContract, "TESTING.md"), "mobai --version\n", "utf8");
  runScriptArgs(
    "standalone stale MobAI version command fails",
    "check-mobai-proof.ts",
    ["--skill-root", staleContract, "--contract-only"],
    1,
    "mobai.contract.invalid_version_command",
  );

  const complete = makeFixture("mobai-proof-complete");
  writeCompleteMobaiProof(complete);
  runFixture("grounded iOS and Android MobAI proof passes", complete, "check-mobai-proof.ts", 0, undefined, ["--skill-root", skillRoot]);

  const pipedProviderCommand = makeFixture("mobai-proof-piped-provider-command");
  writeCompleteMobaiProof(pipedProviderCommand);
  replaceInFile(
    pipedProviderCommand,
    "operations/PROVIDER_PROOF.md",
    "mobai test flows/smoke.mob",
    "mobai test flows/smoke.mob | tee mobile/mobai-command.log",
  );
  runFixture("MobAI provider row with a piped command still grounds", pipedProviderCommand, "check-mobai-proof.ts", 0, undefined, ["--skill-root", skillRoot]);

  const providerInputOnly = makeFixture("mobai-proof-provider-input-only");
  writeCompleteMobaiProof(providerInputOnly);
  replaceInFile(providerInputOnly, "operations/PROVIDER_PROOF.md", "mobile/mobai-proof.md", "mobile/missing-proof.md");
  runFixture(
    "MobAI input flow cannot substitute for provider output evidence",
    providerInputOnly,
    "check-mobai-proof.ts",
    1,
    "mobai.proof.provider_row_unproven",
    ["--skill-root", skillRoot],
  );

  const tierPhraseBypass = makeFixture("mobai-proof-tier-phrase-bypass");
  writeCompleteMobaiProof(tierPhraseBypass);
  replaceInFile(tierPhraseBypass, "engineering/PRODUCTION_READINESS.md", "- Selected tier: Free", "- Selected tier: Free; paid tier not needed");
  replaceInFile(tierPhraseBypass, "engineering/PRODUCTION_READINESS.md", "- CLI package: 2.1.1", "- CLI package: Pending");
  runFixture("Free tier wording cannot bypass component proof", tierPhraseBypass, "check-mobai-proof.ts", 1, "mobai.proof.component_version_missing", [
    "--skill-root",
    skillRoot,
  ]);

  const conflated = makeFixture("mobai-proof-conflated");
  writeCompleteMobaiProof(conflated);
  replaceInFile(conflated, "engineering/PRODUCTION_READINESS.md", "- MCP server: 2.5.0", "- MCP server: 2.5.1");
  replaceInFile(conflated, "engineering/PRODUCTION_READINESS.md", "- CLI package: 2.1.1", "- CLI package: 2.5.1");
  runFixture("conflated MobAI component versions fail", conflated, "check-mobai-proof.ts", 1, "mobai.proof.component_versions_conflated", [
    "--skill-root",
    skillRoot,
  ]);

  const xcodeOnly = makeFixture("mobai-proof-xcode-only");
  writeCompleteMobaiProof(xcodeOnly);
  replaceInFile(
    xcodeOnly,
    "engineering/PRODUCTION_READINESS.md",
    "| Android | Pixel 9 / Android 16 | `flows/smoke.mob` | `mobile/android-mobai.log` | PostHog event `mobile/android-provider.json` | Passed |",
    "",
  );
  runFixture("Android support without Android MobAI proof fails", xcodeOnly, "check-mobai-proof.ts", 1, "mobai.proof.platform_row_missing", [
    "--skill-root",
    skillRoot,
  ]);
  setEngineeringStatus(xcodeOnly, "pending");
  runFixture("pending engineering preserves the default MobAI skip", xcodeOnly, "check-mobai-proof.ts", 0, undefined, ["--skill-root", skillRoot]);
  runFixture(
    "Android proof workflow cannot skip a missing MobAI platform row while engineering is pending",
    xcodeOnly,
    "check-mobai-proof.ts",
    1,
    "mobai.proof.platform_row_missing",
    ["--skill-root", skillRoot, "--proof-workflow"],
  );

  const crossPlatformSectionDeleted = makeFixture("mobai-proof-cross-platform-section-deleted");
  writeCompleteMobaiProof(crossPlatformSectionDeleted);
  writeFileSync(
    path.join(crossPlatformSectionDeleted, "engineering/PRODUCTION_READINESS.md"),
    [
      "# Production Readiness",
      "Status: ready.",
      "Implementation proof: ce-work completed. Review proof: ce-code-review passed. Proof artifact: ce-proof exists.",
      "Native iOS Proof: ran the app in the iOS Simulator pane in a local session on iPhone 17 Pro / iOS 26 with a fixture account.",
      "That route covers no Android and no physical device.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "Android in scope with no cross-platform proof section fails",
    crossPlatformSectionDeleted,
    "check-mobai-proof.ts",
    1,
    "mobai.proof.cross_platform_section_missing",
    ["--skill-root", skillRoot],
  );
  setEngineeringStatus(crossPlatformSectionDeleted, "pending");
  runFixture("pending mixed-platform engineering preserves the default MobAI skip", crossPlatformSectionDeleted, "check-mobai-proof.ts", 0, undefined, [
    "--skill-root",
    skillRoot,
  ]);
  runFixture(
    "mixed-platform proof workflow cannot skip the MobAI section while engineering is pending",
    crossPlatformSectionDeleted,
    "check-mobai-proof.ts",
    1,
    "mobai.proof.cross_platform_section_missing",
    ["--skill-root", skillRoot, "--proof-workflow"],
  );

  const healedUnreviewed = makeFixture("mobai-proof-healed-unreviewed");
  writeCompleteMobaiProof(healedUnreviewed);
  replaceInFile(healedUnreviewed, "engineering/PRODUCTION_READINESS.md", "- AI-healed flow: not used", "- AI-healed flow: generated fix accepted");
  runFixture(
    "AI-healed flow without diff review and passing rerun fails",
    healedUnreviewed,
    "check-mobai-proof.ts",
    1,
    "mobai.proof.ai_heal_review_rerun_missing",
    ["--skill-root", skillRoot],
  );

  const unsafeFlow = makeFixture("mobai-proof-unsafe-flow");
  writeCompleteMobaiProof(unsafeFlow);
  writeFileSync(
    path.join(unsafeFlow, "flows", "smoke.mob"),
    ["appId: com.example.app", 'repeat while "Loading" { delay 500 }', "eval \"const access_token = 'fixture-secret-value'; vars.ready = true\""].join("\n"),
    "utf8",
  );
  replaceInFile(
    unsafeFlow,
    "engineering/PRODUCTION_READINESS.md",
    "- Host-side script safety: not used",
    "- Host-side script safety: endpoint allowlist checked; no embedded secrets; cleanup verified; backend proof `mobile/mobai-proof.md`",
  );
  runFixture("unbounded repeat and embedded host-script secret fail", unsafeFlow, "check-mobai-proof.ts", 1, "mobai.proof.repeat_unbounded", [
    "--skill-root",
    skillRoot,
  ]);

  const plainPathUnsafeFlow = makeFixture("mobai-proof-plain-path-unsafe-flow");
  writeCompleteMobaiProof(plainPathUnsafeFlow);
  replaceInFile(plainPathUnsafeFlow, "engineering/PRODUCTION_READINESS.md", "`flows/smoke.mob`", "flows/smoke.mob");
  replaceInFile(plainPathUnsafeFlow, "engineering/PRODUCTION_READINESS.md", "`flows/smoke.mob`", "flows/smoke.mob");
  writeFileSync(path.join(plainPathUnsafeFlow, "flows", "smoke.mob"), 'appId: com.example.app\nrepeat while "Loading" { delay 500 }\n', "utf8");
  runFixture("plain-path MobAI flow still receives safety scanning", plainPathUnsafeFlow, "check-mobai-proof.ts", 1, "mobai.proof.repeat_unbounded", [
    "--skill-root",
    skillRoot,
  ]);

  const bareProviderNa = makeFixture("mobai-proof-provider-na");
  writeCompleteMobaiProof(bareProviderNa);
  replaceInFile(bareProviderNa, "engineering/PRODUCTION_READINESS.md", "PostHog event `mobile/ios-provider.json`", "N/A");
  replaceInFile(bareProviderNa, "engineering/PRODUCTION_READINESS.md", "PostHog event `mobile/android-provider.json`", "N/A");
  runFixture("bare provider n-a without dated reason fails", bareProviderNa, "check-mobai-proof.ts", 1, "mobai.proof.provider_correlation_reason_missing", [
    "--skill-root",
    skillRoot,
  ]);

  const inlinePassword = makeFixture("mobai-proof-inline-password");
  writeCompleteMobaiProof(inlinePassword);
  writeFileSync(path.join(inlinePassword, "flows", "smoke.mob"), "appId: com.example.app\neval \"const password = 'fixture-password-value'\"\n", "utf8");
  replaceInFile(
    inlinePassword,
    "engineering/PRODUCTION_READINESS.md",
    "- Host-side script safety: not used",
    "- Host-side script safety: endpoint allowlist checked; no embedded secrets; cleanup verified; backend proof `mobile/mobai-proof.md`",
  );
  runFixture("inline host-script password fails", inlinePassword, "check-mobai-proof.ts", 1, "mobai.proof.host_script_secret", ["--skill-root", skillRoot]);

  const externalScriptSecret = makeFixture("mobai-proof-external-script-secret");
  writeCompleteMobaiProof(externalScriptSecret);
  mkdirSync(path.join(externalScriptSecret, "flows", "tooling"), { recursive: true });
  writeFileSync(path.join(externalScriptSecret, "flows", "smoke.mob"), 'appId: com.example.app\nscript "tooling/seed.js"\n', "utf8");
  writeFileSync(path.join(externalScriptSecret, "flows", "tooling", "seed.js"), 'const token = "fixture-secret-value";\n', "utf8");
  replaceInFile(
    externalScriptSecret,
    "engineering/PRODUCTION_READINESS.md",
    "- Host-side script safety: not used",
    "- Host-side script safety: endpoint allowlist checked; no embedded secrets; cleanup verified; backend proof `mobile/mobai-proof.md`",
  );
  runFixture("credential in referenced host script fails", externalScriptSecret, "check-mobai-proof.ts", 1, "mobai.proof.host_script_secret", [
    "--skill-root",
    skillRoot,
  ]);
}

function writeCompleteMobaiProof(root: string): void {
  const state = readState(root);
  const project = expectRecord(state["project"], "project");
  project["platforms"] = ["ios", "android"];
  const bundleIds = expectRecord(project["bundleIds"], "project.bundleIds");
  bundleIds["android"] = "com.example.app";
  const engineering = getLane(state, "engineering");
  engineering["status"] = "succeeded";
  engineering["evidence"] = ["engineering/PRODUCTION_READINESS.md", "mobile/mobai-proof.md"];
  engineering["blockers"] = [];
  writeState(root, state);

  mkdirSync(path.join(root, "flows"), { recursive: true });
  mkdirSync(path.join(root, "mobile"), { recursive: true });
  writeFileSync(path.join(root, "flows", "smoke.mob"), "appId: com.example.app\n- assertVisible: Home\n", "utf8");
  writeFileSync(path.join(root, "mobile", "ios-mobai.log"), "iOS flow passed on physical device.\n", "utf8");
  writeFileSync(path.join(root, "mobile", "android-mobai.log"), "Android flow passed on physical device.\n", "utf8");
  writeFileSync(path.join(root, "mobile", "ios-provider.json"), '{"event":"core_value_completed"}\n', "utf8");
  writeFileSync(path.join(root, "mobile", "android-provider.json"), '{"event":"core_value_completed"}\n', "utf8");
  writeFileSync(path.join(root, "mobile", "mobai-proof.md"), "# MobAI Proof\n\nBoth platform runs and provider events were correlated.\n", "utf8");
  writeFileSync(
    path.join(root, "engineering/PRODUCTION_READINESS.md"),
    [
      "# Production Readiness",
      "Status: ready after grounded engineering proof.",
      "## MobAI Cross-Platform Proof",
      "- Docs checked: 2026-07-13",
      "- Desktop app: 2.5.1",
      "- MCP server: 2.5.0",
      "- CLI package: 2.1.1",
      "- Selected tier: Free",
      "- AI-healed flow: not used",
      "- Host-side script safety: not used",
      "| Platform | Device / OS | `.mob` flow | Evidence path | Provider correlation | Result |",
      "| --- | --- | --- | --- | --- | --- |",
      "| iOS | iPhone 16 / iOS 19 | `flows/smoke.mob` | `mobile/ios-mobai.log` | PostHog event `mobile/ios-provider.json` | Passed |",
      "| Android | Pixel 9 / Android 16 | `flows/smoke.mob` | `mobile/android-mobai.log` | PostHog event `mobile/android-provider.json` | Passed |",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "operations/PROVIDER_PROOF.md"),
    [
      "# Provider Proof",
      "| Provider | current status | proof command | evidence path | founder-only gate |",
      "| --- | --- | --- | --- | --- |",
      "| MobAI | captured and verified on iOS and Android | mobai test flows/smoke.mob | mobile/mobai-proof.md | Free tier; no spend gate |",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "strategy/TOOL_DECISIONS.md"),
    [
      "# Tool Decisions",
      "| Tool | Lane | Access status | Founder confirmation | Selected route | Fallback limitation |",
      "| --- | --- | --- | --- | --- | --- |",
      "| MobAI | engineering | Free tier available | no spend approval required | MobAI Free | one device and current quota |",
    ].join("\n"),
    "utf8",
  );
}

function replaceInFile(root: string, relative: string, from: string, to: string): void {
  const file = path.join(root, relative);
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(from, to), "utf8");
}

function setEngineeringStatus(root: string, status: string): void {
  const state = readState(root);
  getLane(state, "engineering")["status"] = status;
  writeState(root, state);
}
