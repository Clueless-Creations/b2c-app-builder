import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type Harness,
  type MutableRecord,
  expectRecord,
  getLane,
  readState,
  skillRoot,
  writeBusinessEntrypoints,
  writeCompleteAppleRequirements,
  writeCompleteAttribution,
  writeCompleteContentAssets,
  writeCompleteOrchestration,
  writeCompletePaidUserAcquisition,
  writeCompleteProviderProof,
  writeCompleteSecurity,
  writeCompleteStoreConsole,
  writeCompleteStoreScreenshots,
  writeSourceRegistryFixture,
  writeState,
} from "./_harness.js";

export function register(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture, runScriptArgs } = h;

  const clean = makeFixture("clean");
  writeBusinessEntrypoints(clean);
  writeCompleteAttribution(clean);
  writeCompleteAppleRequirements(clean);
  writeCompleteStoreConsole(clean);
  writeCompleteStoreScreenshots(clean);
  writeCompleteSecurity(clean);
  writeCompleteContentAssets(clean);
  writeCompletePaidUserAcquisition(clean);
  writeCompleteOrchestration(clean);
  writeCompleteProviderProof(clean);
  runFixture("complete project state passes", clean, "validate-project-state.ts", 0);
  runFixture("complete attribution contract passes", clean, "check-attribution-contract.ts", 0);
  runFixture("clean secret routing passes", clean, "check-secret-routing.ts", 0);
  runFixture("complete security release packet passes", clean, "check-security-release.ts", 0);
  runFixture("complete content assets packet passes", clean, "check-content-assets.ts", 0);
  runFixture("complete paid UA packet passes", clean, "check-paid-user-acquisition.ts", 0);
  runFixture("complete orchestration packet passes", clean, "check-parallel-orchestration.ts", 0);
  runFixture("complete Design Room state passes", clean, "validate-state.ts", 0);
  runFixture("complete Design Room contract passes", clean, "check-design-room-contract.ts", 0);
  runFixture("complete token promotion passes", clean, "check-token-promotion.ts", 0);
  runFixture("complete provider proof passes", clean, "check-live-provider-proof.ts", 0);
  runFixture("complete Apple App Store requirements packet passes", clean, "check-apple-app-store-requirements.ts", 0);
  runFixture("complete store console packet passes", clean, "check-store-console-packet.ts", 0);
  runFixture("complete store screenshots packet passes", clean, "check-store-screenshots.ts", 0);
  const iphoneOnlyScreenshots = makeFixture("iphone-only-screenshot-matrix");
  writeCompleteStoreScreenshots(iphoneOnlyScreenshots);
  const iphoneOnlyState = readState(iphoneOnlyScreenshots);
  const iphoneOnlyProject = expectRecord(iphoneOnlyState.project, "project");
  iphoneOnlyProject.supportedDeviceFamilies = ["iphone"];
  iphoneOnlyProject.platforms = ["ios"];
  expectRecord(iphoneOnlyProject.bundleIds, "bundleIds").android = "";
  Object.assign(getLane(iphoneOnlyState, "store_console"), { status: "succeeded", evidence: ["SCREENSHOTS.md"] });
  writeState(iphoneOnlyScreenshots, iphoneOnlyState);
  const rubricExample = JSON.parse(
    readFileSync(path.join(skillRoot, "examples/workspace/business/store/app-store-listing/screenshot-rubric-scores.example.json"), "utf8"),
  ) as { slots: Array<Record<string, unknown>> };
  const iphoneSlot = {
    ...rubricExample.slots[0],
    product_page: "default",
    observed_evidence: "iPhone-only fixture shows the blue primary action and truthful headline.",
  };
  writeFileSync(
    path.join(iphoneOnlyScreenshots, "screenshot-rubric-scores.json"),
    `${JSON.stringify({ ...rubricExample, generated_at: "2026-08-17T00:00:00Z", slots: [iphoneSlot] }, null, 2)}\n`,
    "utf8",
  );
  runFixture(
    "completed iPhone-only matrix does not fabricate an iPad requirement",
    iphoneOnlyScreenshots,
    "check-store-screenshots.ts",
    1,
    "store_screenshots.rubric_final_png_missing",
    [],
    undefined,
    "store_screenshots.matrix.en-US.ipad_missing",
  );
  const ipadCapableScreenshots = makeFixture("ipad-capable-screenshot-matrix");
  writeCompleteStoreScreenshots(ipadCapableScreenshots);
  const ipadState = readState(ipadCapableScreenshots);
  expectRecord(ipadState.project, "project").supportedDeviceFamilies = ["iphone", "ipad"];
  Object.assign(getLane(ipadState, "store_console"), { status: "succeeded", evidence: ["SCREENSHOTS.md"] });
  writeState(ipadCapableScreenshots, ipadState);
  writeFileSync(
    path.join(ipadCapableScreenshots, "screenshot-rubric-scores.json"),
    `${JSON.stringify({ ...rubricExample, generated_at: "2026-08-17T00:00:00Z", slots: [iphoneSlot] }, null, 2)}\n`,
    "utf8",
  );
  runFixture(
    "completed iPad-capable matrix still requires an iPad well",
    ipadCapableScreenshots,
    "check-store-screenshots.ts",
    1,
    "store_screenshots.matrix.en-US.ipad_missing",
  );
  runFixture("complete native iOS proof packet passes", clean, "check-native-ios-proof.ts", 0);
  runFixture("complete emotional design packet passes", clean, "check-emotional-design.ts", 0);
  runFixture("landing funnel skips without landing scope", clean, "check-landing-funnel.ts", 0);
  runFixture("current skill version passes", skillRoot, "check-skill-version.ts", 0, undefined, ["--source", skillRoot, "--installed", skillRoot]);
  runFixture("current version discipline passes", skillRoot, "check-version-discipline.ts", 0, undefined, [
    "--repo-root",
    skillRoot,
    "--skill-root",
    skillRoot,
  ]);
  runFixture("artifact template coverage passes", path.join(skillRoot, "examples", "workspace", "business"), "check-artifact-templates.ts", 0, undefined, [
    "--skill-root",
    skillRoot,
  ]);
  // Skill mode takes --skill-root and nothing else, which is how package.json and the audit plan
  // invoke it. runFixture() always injects --root, and --root alone now selects business mode, so
  // this fixture has to spawn the real command shape or it silently checks the skill root for a
  // business's AGENTS.md.
  runScriptArgs("continuity contract templates pass", "check-continuity-contract.ts", ["--skill-root", skillRoot], 0);
  runFixture("generated business continuity contract passes", clean, "check-continuity-contract.ts", 0);
  const emptyBusinessForContinuity = makeEmptyFixture("continuity-empty-business");
  runScriptArgs(
    "continuity root override after skill-root checks business root",
    "check-continuity-contract.ts",
    ["--skill-root", skillRoot, "--root", emptyBusinessForContinuity],
    1,
    "continuity.file_missing",
  );
  runFixture("agent behavior eval definitions pass", path.join(skillRoot, "checks/validation/repository/evals/agent-behavior"), "run-agent-evals.ts", 0);
  runFixture("app archetype packs pass", skillRoot, "check-app-archetype.ts", 0, undefined, ["--skill-root", skillRoot]);
  const archetypeMissing = makeEmptyFixture("app-archetype-missing");
  runScriptArgs("app archetype layer missing fails", "check-app-archetype.ts", ["--skill-root", archetypeMissing], 1, "app_archetype.dir_missing");
  runFixture("compound engineering not in scope passes", clean, "check-compound-engineering-routing.ts", 0);

  const wranglerCreds = makeFixture("wrangler-toml-credentials");
  writeFileSync(
    path.join(wranglerCreds, "wrangler.toml"),
    ['name = "app-landing"', "[vars]", 'SUPABASE_ANON = "sb_publishable_abcdefghijklmnopqrstuvwx"'].join("\n"),
    "utf8",
  );
  runFixture("wrangler.toml committed credential warns", wranglerCreds, "check-secret-routing.ts", 0, "secrets.wrangler_toml_credentials");

  const sourceRegistryClean = makeEmptyFixture("source-registry-clean");
  writeSourceRegistryFixture(sourceRegistryClean);
  runFixture("source registry with registered URL passes", sourceRegistryClean, "check-source-freshness.ts", 0);

  const sourceRegistryBrackets = makeEmptyFixture("source-registry-bracket-urls");
  writeSourceRegistryFixture(sourceRegistryBrackets, false);
  const bracketUrls = [
    "https://github.com/google/fonts/blob/main/ofl/dmsans/DMSans[opsz,wght].ttf",
    "https://docs.doppler.com/docs/cli",
    "https://docs.doppler.com/docs/cli?filter=[current]",
  ];
  writeFileSync(
    path.join(sourceRegistryBrackets, "README.md"),
    [bracketUrls[0], `[${bracketUrls[1]}]`, `Query: ${bracketUrls[2]}.`, `[${bracketUrls[1]}](${bracketUrls[0]})`].join("\n"),
    "utf8",
  );
  runFixture("source scanner reports the complete bracket-containing font URL", sourceRegistryBrackets, "check-source-freshness.ts", 1, bracketUrls[0]);
  writeFileSync(
    path.join(sourceRegistryBrackets, "checks/validation/repository/source-registry.yaml"),
    JSON.stringify({
      schema_version: 1,
      sources: bracketUrls.map((url, index) => ({
        id: `bracket-source-${index}`,
        name: "Bracket source fixture",
        source_type: "docs",
        url,
        refresh_cadence_days: 7,
        owner: "source-freshness",
        locations: ["README.md"],
      })),
    }),
    "utf8",
  );
  runFixture("source scanner preserves balanced brackets and trims only a surrounding link wrapper", sourceRegistryBrackets, "check-source-freshness.ts", 0);

  // Regression pin: the weekly refresh renders source-refresh.html with
  // HTML-escaped URLs (&amp;). Re-scanning that generated artifact flagged its
  // own output as unregistered sources and kept the scheduled CI job red for
  // seven straight weeks. Generated freshness outputs are excluded from the scan.
  const sourceRegistryGenerated = makeEmptyFixture("source-registry-generated-artifact");
  writeSourceRegistryFixture(sourceRegistryGenerated);
  mkdirSync(path.join(sourceRegistryGenerated, "docs", "source-freshness"), { recursive: true });
  // The URL is assembled from parts so the repo-level registry scan cannot see
  // a literal in THIS file, while the written HTML carries a full unregistered
  // URL — the fixture only passes because the generated report is excluded.
  const escapedRefreshUrl = ["https:/", "/registry-drift.example.dev/repos?per_page=100&amp;type=public"].join("");
  writeFileSync(
    path.join(sourceRegistryGenerated, "docs", "source-freshness", "source-refresh.html"),
    `<html><body><a href="${escapedRefreshUrl}">weekly diff</a></body></html>\n`,
    "utf8",
  );
  runFixture("generated source-refresh.html is not rescanned as a new source", sourceRegistryGenerated, "check-source-freshness.ts", 0);

  const hostedGenerated = makeEmptyFixture("source-registry-hosted-projections");
  writeSourceRegistryFixture(hostedGenerated);
  const projectionUrl = ["https:/", "/hosted-projection.example.dev/reference"].join("");
  for (const relative of [
    "catalog/generated/hosted-knowledge.json",
    "hosted/knowledge-mcp/worker-configuration.d.ts",
    "hosted/knowledge-mcp/.wrangler/test-bundle/worker.js",
  ]) {
    const target = path.join(hostedGenerated, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `// Generated projection: ${projectionUrl}\n`, "utf8");
  }
  runFixture("hosted projections with dedicated freshness checks are not rescanned", hostedGenerated, "check-source-freshness.ts", 0);
  mkdirSync(path.join(hostedGenerated, "knowledge"), { recursive: true });
  writeFileSync(path.join(hostedGenerated, "knowledge", "authored.md"), `# Authored source\n${projectionUrl}\n`, "utf8");
  runFixture(
    "authored hosted knowledge still requires registered sources",
    hostedGenerated,
    "check-source-freshness.ts",
    1,
    "source_freshness.url_unregistered",
  );

  // Regression pin: `.claude/worktrees/*` are machine-local concurrent agent
  // checkouts of other branches, not this checkout's content. A sibling
  // agent's in-progress copy carrying a not-yet-registered URL turned the
  // maintainer's local audit red while CI (clean checkout) stayed green.
  // Nested worktrees are excluded from the scan.
  const sourceRegistryWorktree = makeEmptyFixture("source-registry-worktree-copy");
  writeSourceRegistryFixture(sourceRegistryWorktree);
  mkdirSync(path.join(sourceRegistryWorktree, ".claude", "worktrees", "other-agent", "knowledge"), { recursive: true });
  // Assembled from parts for the same reason as above: the worktree copy must
  // carry a full unregistered URL while THIS file stays invisible to the
  // repo-level registry scan. The fixture only passes because nested worktrees
  // are excluded.
  const worktreeUrl = ["https:/", "/worktree-drift.example.dev/design-visual-system"].join("");
  writeFileSync(
    path.join(sourceRegistryWorktree, ".claude", "worktrees", "other-agent", "knowledge", "design-visual-system.md"),
    `# Visual System Swipe File\n\nSource: ${worktreeUrl}\n`,
    "utf8",
  );
  runFixture("machine-local .claude worktree copies are not scanned as sources", sourceRegistryWorktree, "check-source-freshness.ts", 0);

  // Regression pin: the #38–#54 app-Worker PRs added 21 "recent unregistered" URLs and turned
  // audit:ci red at step 5. Every one was a template-literal fragment (`https://${host}/relay`),
  // a reserved-TLD stand-in (`.invalid`), or a fixture value inside a test file. None is a source
  // an agent could load, so the scan now ignores those three classes — and ONLY those: the
  // positive control below proves the same URL in authored code still fails.
  const sourceRegistryStandIns = makeEmptyFixture("source-registry-stand-ins");
  writeSourceRegistryFixture(sourceRegistryStandIns);
  const standInsSrc = path.join(sourceRegistryStandIns, "hosted", "builder-console", "analytics");
  const standInsTest = path.join(sourceRegistryStandIns, "hosted", "builder-console", "test");
  mkdirSync(standInsSrc, { recursive: true });
  mkdirSync(standInsTest, { recursive: true });
  // Assembled from parts, like the cases above, so THIS file never carries the literal.
  const templateFragment = ["https:/", "/${", "host}/relay/static/array.js"].join("");
  const reservedHostUrl = ["https:/", "/cimd-does-not-resolve.invalid/client.json"].join("");
  const testOnlyUrl = ["https:/", "/referrer-stand-in.example.dev/?utm_source=hacker_news"].join("");
  writeFileSync(path.join(standInsSrc, "relay.ts"), `export const relayUrl = (host: string) => \`${templateFragment}\`;\n`, "utf8");
  writeFileSync(path.join(standInsSrc, "discovery.ts"), `export const unreachable = "${reservedHostUrl}";\n`, "utf8");
  writeFileSync(path.join(standInsTest, "relay.test.ts"), `const referrer = "${testOnlyUrl}";\n`, "utf8");
  writeFileSync(path.join(standInsSrc, "snippet.test.ts"), `const referrer = "${testOnlyUrl}";\n`, "utf8");
  runFixture("template fragments, reserved hosts, and test fixtures are not sources", sourceRegistryStandIns, "check-source-freshness.ts", 0);
  writeFileSync(path.join(standInsSrc, "upstream.fixtures.ts"), `const origin = "${testOnlyUrl}";\n`, "utf8");
  runFixture("upstream fixture modules are test data rather than research sources", sourceRegistryStandIns, "check-source-freshness.ts", 0);
  writeFileSync(path.join(standInsSrc, "upstream.fixtures.md"), `# Authored guidance\n\nSource: ${testOnlyUrl}\n`, "utf8");
  runFixture(
    "a similarly named Markdown guide still requires source registration",
    sourceRegistryStandIns,
    "check-source-freshness.ts",
    1,
    "source_freshness.url_unregistered",
  );
  rmSync(path.join(standInsSrc, "upstream.fixtures.md"));
  // Positive control: the very URL the test files were allowed to carry is still a real
  // unregistered source once it appears in authored code.
  writeFileSync(path.join(standInsSrc, "referrers.ts"), `export const example = "${testOnlyUrl}";\n`, "utf8");
  runFixture(
    "the same URL in authored code beside the tests still requires registration",
    sourceRegistryStandIns,
    "check-source-freshness.ts",
    1,
    "source_freshness.url_unregistered",
  );
  runFixture("template secret docs pass from bundled template path", path.join(skillRoot, "examples", "workspace", "business"), "check-secret-routing.ts", 0);
  const continuityMissingAgents = makeFixture("continuity-missing-agents");
  writeBusinessEntrypoints(continuityMissingAgents);
  writeFileSync(
    path.join(continuityMissingAgents, "AGENTS.md"),
    readFileSync(path.join(continuityMissingAgents, "AGENTS.md"), "utf8").replaceAll("b2c status", "status unavailable"),
    "utf8",
  );
  runFixture("generated business without the status entrypoint fails", continuityMissingAgents, "check-continuity-contract.ts", 1, "continuity.term_missing");

  const missingEvidence = makeFixture("missing-evidence");
  const missingEvidenceState = readState(missingEvidence);
  const missingEvidenceDesign = getLane(missingEvidenceState, "design");
  missingEvidenceDesign["status"] = "succeeded";
  missingEvidenceDesign["evidence"] = ["MISSING.md"];
  writeState(missingEvidence, missingEvidenceState);
  runFixture("done lane with missing local evidence fails", missingEvidence, "validate-project-state.ts", 1, "done_evidence_missing");

  const blankEvidence = makeFixture("blank-evidence");
  const blankEvidenceState = readState(blankEvidence);
  const blankEvidenceDesign = getLane(blankEvidenceState, "design");
  blankEvidenceDesign["status"] = "succeeded";
  blankEvidenceDesign["evidence"] = [""];
  writeState(blankEvidence, blankEvidenceState);
  runFixture("done lane with blank evidence fails", blankEvidence, "validate-project-state.ts", 1, "evidence.0.blank");

  const placeholderDate = makeFixture("placeholder-date");
  const placeholderDateState = readState(placeholderDate);
  placeholderDateState["updatedAt"] = "YYYY-MM-DD";
  writeState(placeholderDate, placeholderDateState);
  runFixture("placeholder updated_at fails", placeholderDate, "validate-project-state.ts", 1, "project_state.invalid_schema");

  const unreasonedNotNeeded = makeFixture("unreasoned-not-needed");
  const unreasonedState = readState(unreasonedNotNeeded);
  const unreasonedRevenue = getLane(unreasonedState, "revenue");
  unreasonedRevenue["status"] = "not_needed";
  unreasonedRevenue["evidence"] = [];
  unreasonedRevenue["blockers"] = [];
  writeState(unreasonedNotNeeded, unreasonedState);
  runFixture("not_needed lane without evidence or blocker fails", unreasonedNotNeeded, "validate-project-state.ts", 1, "not_needed_without_reason");

  const missingStateEmotionalLane = makeFixture("state-missing-emotional-lane");
  {
    const state = readState(missingStateEmotionalLane);
    const lanes = expectRecord(state.lanes, "state/business-state.json lanes");
    delete lanes.emotional_design;
    writeState(missingStateEmotionalLane, state);
  }
  runFixture("project state without emotional design lane fails", missingStateEmotionalLane, "validate-project-state.ts", 1, "project_state.invalid_schema");

  const unreasonedDeferredEmotional = makeFixture("unreasoned-deferred-emotional");
  const unreasonedDeferredState = readState(unreasonedDeferredEmotional);
  const unreasonedDeferredLane = getLane(unreasonedDeferredState, "emotional_design");
  unreasonedDeferredLane["status"] = "deferred";
  unreasonedDeferredLane["evidence"] = [];
  unreasonedDeferredLane["blockers"] = [];
  writeState(unreasonedDeferredEmotional, unreasonedDeferredState);
  runFixture("deferred emotional design lane without reason fails", unreasonedDeferredEmotional, "validate-project-state.ts", 1, "deferred_without_reason");

  // not_started lanes are exempt from the attribution contract (nothing to attribute yet);
  // a "partial" lane with an incomplete contract is a WARNING (WIP), and only "done" hard-errors.
  const partialAttribution = makeFixture("partial-attribution");
  const partialAttributionState = readState(partialAttribution);
  getLane(partialAttributionState, "analytics_attribution")["status"] = "running";
  writeState(partialAttribution, partialAttributionState);
  runFixture("partial attribution contract warns", partialAttribution, "check-attribution-contract.ts", 0, "attribution.screen_early.incomplete");

  const hdyhauMissing = makeFixture("attribution-hdyhau-missing");
  const hdyhauMissingState = readState(hdyhauMissing);
  getLane(hdyhauMissingState, "analytics_attribution")["status"] = "running";
  writeState(hdyhauMissing, hdyhauMissingState);
  writeFileSync(
    path.join(hdyhauMissing, "analytics/ANALYTICS.md"),
    ["# Analytics", "Event: attribution_source_selected", "PostHog person property: self_reported_source"].join("\n"),
    "utf8",
  );
  runFixture("partial attribution without HDYHAU survey rules warns", hdyhauMissing, "check-attribution-contract.ts", 0, "attribution.hdyhau.missing");

  const attributionAlias = makeFixture("attribution-alias");
  const attributionAliasState = readState(attributionAlias);
  getLane(attributionAliasState, "analytics_attribution")["status"] = "running";
  const aliasContract = expectRecord(getLane(attributionAliasState, "analytics_attribution").attribution_contract, "attribution_contract");
  aliasContract["screen_early"] = true;
  aliasContract["other_free_text"] = true;
  aliasContract["backend_persistence"] = true;
  aliasContract["anonymous_reconciliation"] = true;
  aliasContract["verified"] = true;
  aliasContract["event_name"] = "signup_attribution_selected";
  aliasContract["event_alias_reason"] = "Existing production dashboards map signup_attribution_selected to attribution_source_selected.";
  writeState(attributionAlias, attributionAliasState);
  writeFileSync(
    path.join(attributionAlias, "analytics/ANALYTICS.md"),
    [
      "# Analytics",
      "signup_attribution_selected is the app event alias for attribution_source_selected.",
      "PostHog person property: self_reported_source.",
    ].join("\n"),
    "utf8",
  );
  runFixture("documented attribution event alias passes with warning", attributionAlias, "check-attribution-contract.ts", 0, "attribution.event_name.alias");

  const attributionMissingImplementation = makeFixture("attribution-code-missing");
  const attributionMissingState = readState(attributionMissingImplementation);
  const missingContract = expectRecord(getLane(attributionMissingState, "analytics_attribution").attribution_contract, "attribution_contract");
  const missingAttributionLane = getLane(attributionMissingState, "analytics_attribution");
  missingAttributionLane["status"] = "succeeded";
  missingAttributionLane["evidence"] = ["analytics/ANALYTICS.md"];
  missingContract["screen_early"] = true;
  missingContract["other_free_text"] = true;
  missingContract["backend_persistence"] = true;
  missingContract["anonymous_reconciliation"] = true;
  missingContract["verified"] = true;
  writeState(attributionMissingImplementation, attributionMissingState);
  writeFileSync(
    path.join(attributionMissingImplementation, "analytics/ANALYTICS.md"),
    "# Analytics\n\nAnalytics implementation details are intentionally absent in this fixture.\n",
    "utf8",
  );
  runFixture(
    "done attribution without implementation text fails",
    attributionMissingImplementation,
    "check-attribution-contract.ts",
    1,
    "attribution.text.self_reported_source.not_found",
  );

  const attributionNotNeeded = makeFixture("attribution-not-needed");
  const attributionNotNeededState = readState(attributionNotNeeded);
  const attributionNotNeededLane = getLane(attributionNotNeededState, "analytics_attribution");
  attributionNotNeededLane["status"] = "not_needed";
  attributionNotNeededLane["evidence"] = [];
  attributionNotNeededLane["blockers"] = ["No onboarding, signup, or user identity surface exists in this app."];
  writeState(attributionNotNeeded, attributionNotNeededState);
  runFixture("attribution not_needed with reason passes attribution check", attributionNotNeeded, "check-attribution-contract.ts", 0);

  // --- check-landing-funnel (in-scope paths + scope-skip exit regression) ---
  const landingGateEvidence = [
    "# Landing Deploy Log",
    "git status --porcelain was clean before deploy (no uncommitted changes).",
    "wrangler version 4 checked and current before deploy.",
    "wrangler whoami confirmed the Cloudflare token carries Pages:Edit scope.",
    "Opened the live URL in a real browser, filled the form, submitted the form, and the success state rendered.",
    "Waitlist duplicate email submits are idempotent (HTTP 200 for repeated submits).",
  ].join("\n");

  const landingInScopePass = makeEmptyFixture("landing-funnel-in-scope-pass");
  mkdirSync(path.join(landingInScopePass, "state"), { recursive: true });
  writeFileSync(
    path.join(landingInScopePass, "state/business-state.json"),
    readFileSync(path.join(skillRoot, "examples", "workspace", "business", "state/business-state.json"), "utf8"),
    "utf8",
  );
  mkdirSync(path.join(landingInScopePass, "growth", "landing"), { recursive: true });
  writeFileSync(path.join(landingInScopePass, "growth", "landing", "README.md"), landingGateEvidence, "utf8");
  mkdirSync(path.join(landingInScopePass, "public"), { recursive: true });
  for (const staticFile of ["robots.txt", "llms.txt", "sitemap.xml"]) {
    writeFileSync(path.join(landingInScopePass, "public", staticFile), "seeded by fixture\n", "utf8");
  }
  runFixture("landing funnel in scope with full gate evidence passes", landingInScopePass, "check-landing-funnel.ts", 0);

  const landingInScopeFail = makeEmptyFixture("landing-funnel-in-scope-missing-gates");
  mkdirSync(path.join(landingInScopeFail, "state"), { recursive: true });
  writeFileSync(
    path.join(landingInScopeFail, "state/business-state.json"),
    readFileSync(path.join(skillRoot, "examples", "workspace", "business", "state/business-state.json"), "utf8"),
    "utf8",
  );
  mkdirSync(path.join(landingInScopeFail, "growth", "landing"), { recursive: true });
  writeFileSync(path.join(landingInScopeFail, "growth", "landing", "index.html"), "<h1>Launch page</h1>\n", "utf8");
  writeFileSync(path.join(landingInScopeFail, "growth", "landing", "README.md"), "# Landing\nwrangler deploy completed.\n", "utf8");
  mkdirSync(path.join(landingInScopeFail, "public"), { recursive: true });
  for (const staticFile of ["robots.txt", "llms.txt", "sitemap.xml"]) {
    writeFileSync(path.join(landingInScopeFail, "public", staticFile), "seeded by fixture\n", "utf8");
  }
  runFixture("landing funnel in scope without gate evidence fails", landingInScopeFail, "check-landing-funnel.ts", 1, "landing_funnel.git_clean_gate.missing");

  const acceptedDesignNoLanding = makeFixture("accepted-design-without-landing");
  const acceptedDesignState = readState(acceptedDesignNoLanding);
  Object.assign(getLane(acceptedDesignState, "design"), { status: "succeeded", evidence: ["DESIGN.md"] });
  writeState(acceptedDesignNoLanding, acceptedDesignState);
  rmSync(path.join(acceptedDesignNoLanding, "growth", "landing"), { recursive: true, force: true });
  runFixture(
    "accepted design without a runnable landing baseline fails",
    acceptedDesignNoLanding,
    "check-landing-funnel.ts",
    1,
    "landing_funnel.design_lock.site_missing",
  );

  // A copied-in section library (no index.html/public/wrangler.toml) is not a
  // deployed site and must not trigger the deploy gates.
  const landingPackOnly = makeEmptyFixture("landing-funnel-pack-only");
  mkdirSync(path.join(landingPackOnly, "state"), { recursive: true });
  writeFileSync(
    path.join(landingPackOnly, "state/business-state.json"),
    readFileSync(path.join(skillRoot, "examples", "workspace", "business", "state/business-state.json"), "utf8"),
    "utf8",
  );
  mkdirSync(path.join(landingPackOnly, "growth", "landing", "sections"), { recursive: true });
  writeFileSync(path.join(landingPackOnly, "growth", "landing", "README.md"), "# Landing section library (not a deployed site yet).\n", "utf8");
  writeFileSync(
    path.join(landingPackOnly, "growth", "landing", "sections", "Hero.tsx"),
    '"use client";\nexport function Hero() {\n  return null;\n}\n',
    "utf8",
  );
  runFixture("landing section pack without a site stays out of scope", landingPackOnly, "check-landing-funnel.ts", 0);

  const landingNoState = makeEmptyFixture("landing-funnel-missing-state");
  mkdirSync(path.join(landingNoState, "state"), { recursive: true });
  runFixture("landing funnel fails loudly when project state is missing", landingNoState, "check-landing-funnel.ts", 1, "project_state.missing");

  // --- landing motion craft (knowledge/design/landing-motion-craft.md) ---
  const animatedIndexHtml = (options: { reducedMotion: boolean; tokenized: boolean; staticHero: boolean }): string =>
    [
      "<!doctype html>",
      "<style>",
      "@keyframes rise { to { transform: none; opacity: 1; } }",
      options.tokenized
        ? ".hero { animation: rise var(--motion-duration-reveal) var(--motion-easing-emphasis) forwards; }"
        : ".hero { animation: rise 600ms ease-out forwards; }",
      options.reducedMotion ? "@media (prefers-reduced-motion: reduce) { .hero { animation: none; opacity: 1; } }" : "",
      "</style>",
      options.staticHero ? '<h1 class="hero">Ship your launch page</h1>' : '<h1 class="hero"></h1>',
      "<p>Copy stays legible without JavaScript.</p>",
    ].join("\n");

  const withLandingSite = (root: string, html: string): void => {
    mkdirSync(path.join(root, "state"), { recursive: true });
    writeFileSync(
      path.join(root, "state/business-state.json"),
      readFileSync(path.join(skillRoot, "examples", "workspace", "business", "state/business-state.json"), "utf8"),
      "utf8",
    );
    mkdirSync(path.join(root, "growth", "landing"), { recursive: true });
    writeFileSync(path.join(root, "growth", "landing", "index.html"), html, "utf8");
    writeFileSync(path.join(root, "growth", "landing", "README.md"), landingGateEvidence, "utf8");
    mkdirSync(path.join(root, "public"), { recursive: true });
    for (const staticFile of ["robots.txt", "llms.txt", "sitemap.xml"]) {
      writeFileSync(path.join(root, "public", staticFile), "seeded by fixture\n", "utf8");
    }
  };

  const motionCompliant = makeEmptyFixture("landing-motion-compliant");
  withLandingSite(motionCompliant, animatedIndexHtml({ reducedMotion: true, tokenized: true, staticHero: true }));
  runFixture("animated landing with reduced-motion, tokens, and static hero passes", motionCompliant, "check-landing-funnel.ts", 0);

  const motionNoReduced = makeEmptyFixture("landing-motion-no-reduced");
  withLandingSite(motionNoReduced, animatedIndexHtml({ reducedMotion: false, tokenized: true, staticHero: true }));
  runFixture(
    "animated landing without reduced-motion handling fails",
    motionNoReduced,
    "check-landing-funnel.ts",
    1,
    "landing_funnel.motion.reduced_motion_missing",
  );

  const motionJsGatedHero = makeEmptyFixture("landing-motion-js-gated-hero");
  withLandingSite(motionJsGatedHero, animatedIndexHtml({ reducedMotion: true, tokenized: true, staticHero: false }));
  runFixture(
    "animated landing whose hero text is not static fails",
    motionJsGatedHero,
    "check-landing-funnel.ts",
    1,
    "landing_funnel.motion.hero_text_not_static",
  );

  const motionUntokenized = makeEmptyFixture("landing-motion-untokenized");
  withLandingSite(motionUntokenized, animatedIndexHtml({ reducedMotion: true, tokenized: false, staticHero: true }));
  runFixture(
    "animated landing with raw duration literals warns toward the token scale",
    motionUntokenized,
    "check-landing-funnel.ts",
    0,
    "landing_funnel.motion.untokenized_duration",
  );

  // Regression (verification pass): prose mentioning "transition:" in an .mdx
  // file is not animation and must not demand reduced-motion handling.
  const motionProseOnly = makeEmptyFixture("landing-motion-prose-only");
  withLandingSite(motionProseOnly, "<h1>Static launch page</h1>\n<p>No animation here.</p>\n");
  writeFileSync(
    path.join(motionProseOnly, "growth", "landing", "notes.mdx"),
    "The onboarding transition: from waitlist to full access happens at launch.\n",
    "utf8",
  );
  runFixture("landing prose mentioning transition is not treated as animation", motionProseOnly, "check-landing-funnel.ts", 0);

  // Regression (verification pass): reduced-motion handling may live outside
  // the landing tree (styles/globals.css) and still satisfies the gate.
  const motionReducedElsewhere = makeEmptyFixture("landing-motion-reduced-elsewhere");
  withLandingSite(motionReducedElsewhere, animatedIndexHtml({ reducedMotion: false, tokenized: true, staticHero: true }));
  mkdirSync(path.join(motionReducedElsewhere, "styles"), { recursive: true });
  writeFileSync(
    path.join(motionReducedElsewhere, "styles", "globals.css"),
    "@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }\n",
    "utf8",
  );
  runFixture("reduced-motion handling outside landing/ satisfies the gate", motionReducedElsewhere, "check-landing-funnel.ts", 0);

  // Regression (verification pass): JS-only animation (camelCase style keys)
  // is still detected as motion.
  const motionJsOnly = makeEmptyFixture("landing-motion-js-only");
  withLandingSite(motionJsOnly, "<h1>Static launch page</h1>\n");
  mkdirSync(path.join(motionJsOnly, "growth", "landing", "sections"), { recursive: true });
  writeFileSync(
    path.join(motionJsOnly, "growth", "landing", "sections", "Reveal.tsx"),
    'export const style = { opacity: 0, transitionDuration: "600ms" };\n',
    "utf8",
  );
  runFixture(
    "JS-only animation without reduced-motion handling fails",
    motionJsOnly,
    "check-landing-funnel.ts",
    1,
    "landing_funnel.motion.reduced_motion_missing",
  );

  // --- check-version-discipline (fail branches) ---
  const versionManifestMissing = makeEmptyFixture("version-discipline-manifest-missing");
  runScriptArgs(
    "version discipline fails when skill-version.json is missing",
    "check-version-discipline.ts",
    ["--skill-root", versionManifestMissing],
    1,
    "version_discipline.manifest_missing",
  );

  const versionManifestMalformed = makeEmptyFixture("version-discipline-manifest-malformed");
  writeFileSync(
    path.join(versionManifestMalformed, "skill-version.json"),
    JSON.stringify({ version: "not-semver", updatedAt: "13-06-2026", releaseNotes: [] }, null, 2),
    "utf8",
  );
  runScriptArgs(
    "version discipline fails on a malformed manifest",
    "check-version-discipline.ts",
    ["--skill-root", versionManifestMalformed],
    1,
    "version_discipline.semver_invalid",
  );

  // --- check-version-discipline (root layout: the skill root is the git root, ADR-0002) ---
  // Git rejects an empty pathspec, so a root-layout repository used to make every git call fail
  // and the gate pass on empty output. These two cases pin the scoped pathspec: a skill commit
  // that skipped the manifest fails, and a repository-only (docs) commit is not a skill change.
  const versionGitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.com",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.com",
  };
  const versionGit = (root: string, argv: string[]): void => {
    const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...argv], { cwd: root, env: versionGitEnv, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`fixture git ${argv.join(" ")} failed: ${result.stderr}`);
  };
  const versionRootLayoutRepo = (name: string, followUpFile: string, followUpContent: string): string => {
    const root = makeEmptyFixture(name);
    writeFileSync(
      path.join(root, "skill-version.json"),
      JSON.stringify({ version: "0.0.1", updatedAt: "2026-09-05", releaseNotes: ["fixture release note one", "fixture release note two"] }, null, 2),
      "utf8",
    );
    mkdirSync(path.join(root, "kernel"), { recursive: true });
    mkdirSync(path.join(root, "docs"), { recursive: true });
    writeFileSync(path.join(root, "kernel", "a.ts"), "export const a = 1;\n", "utf8");
    writeFileSync(path.join(root, "docs", "note.md"), "# note\n", "utf8");
    versionGit(root, ["init", "-q"]);
    versionGit(root, ["add", "-A"]);
    versionGit(root, ["commit", "-q", "--no-verify", "-m", "baseline"]);
    writeFileSync(path.join(root, followUpFile), followUpContent, "utf8");
    versionGit(root, ["add", "-A"]);
    versionGit(root, ["commit", "-q", "--no-verify", "-m", "follow-up"]);
    return root;
  };
  const versionRootSkillCommit = versionRootLayoutRepo("version-discipline-root-skill-commit", "kernel/a.ts", "export const a = 2;\n");
  runScriptArgs(
    "version discipline in the root layout fails when the latest skill commit skipped the manifest",
    "check-version-discipline.ts",
    ["--repo-root", versionRootSkillCommit, "--skill-root", versionRootSkillCommit],
    1,
    "version_discipline.manifest_not_latest",
  );
  const versionRootDocsCommit = versionRootLayoutRepo("version-discipline-root-docs-commit", "docs/note.md", "# note\n\nmore\n");
  runScriptArgs(
    "version discipline in the root layout ignores a repository-only docs commit",
    "check-version-discipline.ts",
    ["--repo-root", versionRootDocsCommit, "--skill-root", versionRootDocsCommit],
    0,
  );

  // --- check-version-discipline (monotonicity against the merge base, #147) ---
  // Nothing else in the repository asserts the version moves FORWARD: every other version_discipline
  // code is a shape or presence check, and check-skill-version compares against installed runtimes.
  // A branch holding a number chosen before a sibling merged used to pass every gate and take main
  // backwards. These pin all four outcomes, including the one that must NOT fire: a checkout sitting
  // on the base with nothing pending is the base, not a downgrade.
  const versionBranchRepo = (name: string, branchVersion: string, followUpFile = "kernel/a.ts", followUpContent = "export const a = 2;\n"): string => {
    const root = makeEmptyFixture(name);
    const manifest = (version: string): string =>
      `${JSON.stringify({ version, updatedAt: "2026-09-06", releaseNotes: ["fixture release note one", "fixture release note two"] }, null, 2)}\n`;
    writeFileSync(path.join(root, "skill-version.json"), manifest("0.1.0"), "utf8");
    mkdirSync(path.join(root, "kernel"), { recursive: true });
    writeFileSync(path.join(root, "kernel", "a.ts"), "export const a = 1;\n", "utf8");
    writeFileSync(path.join(root, "README.md"), "# fixture\n", "utf8");
    versionGit(root, ["init", "-q", "-b", "main"]);
    versionGit(root, ["add", "-A"]);
    versionGit(root, ["commit", "-q", "--no-verify", "-m", "baseline"]);
    versionGit(root, ["checkout", "-q", "-b", "feature"]);
    mkdirSync(path.dirname(path.join(root, followUpFile)), { recursive: true });
    writeFileSync(path.join(root, followUpFile), followUpContent, "utf8");
    writeFileSync(path.join(root, "skill-version.json"), manifest(branchVersion), "utf8");
    versionGit(root, ["add", "-A"]);
    versionGit(root, ["commit", "-q", "--no-verify", "-m", "feature work"]);
    return root;
  };
  const versionAhead = versionBranchRepo("version-discipline-ahead", "0.1.1");
  runScriptArgs(
    "version discipline accepts a branch whose version moves past the merge base",
    "check-version-discipline.ts",
    ["--repo-root", versionAhead, "--skill-root", versionAhead],
    0,
  );
  const versionEqual = versionBranchRepo("version-discipline-equal", "0.1.0");
  runScriptArgs(
    "version discipline rejects a branch that left the version equal to the merge base",
    "check-version-discipline.ts",
    ["--repo-root", versionEqual, "--skill-root", versionEqual],
    1,
    "version_discipline.version_not_ahead_of_base",
  );
  const versionLowered = versionBranchRepo("version-discipline-lowered", "0.0.9");
  runScriptArgs(
    "version discipline rejects a branch that would move the version backwards",
    "check-version-discipline.ts",
    ["--repo-root", versionLowered, "--skill-root", versionLowered],
    1,
    "version_discipline.version_not_ahead_of_base",
  );
  // The false positive this check must never produce: a clean checkout OF the base compares equal to
  // itself. Before the pending/ahead guard, this failed main against main.
  const versionOnBase = makeEmptyFixture("version-discipline-on-base");
  writeFileSync(
    path.join(versionOnBase, "skill-version.json"),
    `${JSON.stringify({ version: "0.1.0", updatedAt: "2026-09-06", releaseNotes: ["fixture release note one", "fixture release note two"] }, null, 2)}\n`,
    "utf8",
  );
  mkdirSync(path.join(versionOnBase, "kernel"), { recursive: true });
  writeFileSync(path.join(versionOnBase, "kernel", "a.ts"), "export const a = 1;\n", "utf8");
  versionGit(versionOnBase, ["init", "-q", "-b", "main"]);
  versionGit(versionOnBase, ["add", "-A"]);
  versionGit(versionOnBase, ["commit", "-q", "--no-verify", "-m", "baseline"]);
  runScriptArgs(
    "version discipline does not fail a clean checkout that is itself the base",
    "check-version-discipline.ts",
    ["--repo-root", versionOnBase, "--skill-root", versionOnBase],
    0,
  );

  // --- check-version-discipline (monotonicity scoped to the skill pathspec, #30) ---
  // The "ahead of base" count used to ignore which paths a commit touched, so a branch whose only
  // change was a REPOSITORY_ONLY_PATHS file (README.md, AGENTS.md, ...) was still counted as ahead
  // and forced to bump skill-version.json for a documentation-only change. versionEqual above (a
  // kernel/ change with no version bump) already proves a real skill change still fails; this pins
  // the fix: the same shape of branch, but touching only README.md, must pass.
  const versionRepoOnlyBranch = versionBranchRepo(
    "version-discipline-repo-only-branch",
    "0.1.0", // same as the base version; the manifest rewrite is then a no-op diff
    "README.md",
    "# fixture\n\nDocumentation-only change.\n",
  );
  runScriptArgs(
    "version discipline does not count a documentation-only branch as ahead of the merge base",
    "check-version-discipline.ts",
    ["--repo-root", versionRepoOnlyBranch, "--skill-root", versionRepoOnlyBranch],
    0,
  );

  // A nested skill root (skillRoot a subdirectory of gitRoot) took the OTHER branch of
  // skillPathspecs(), which had no REPOSITORY_ONLY_PATHS exclusion at all - so the same #30 bug
  // reproduced there too, just scoped under the nested skill's own directory.
  const versionNestedRepoOnly = makeEmptyFixture("version-discipline-nested-repo-only");
  const nestedSkillRoot = path.join(versionNestedRepoOnly, "skills", "my-skill");
  mkdirSync(path.join(nestedSkillRoot, "kernel"), { recursive: true });
  writeFileSync(path.join(nestedSkillRoot, "kernel", "a.ts"), "export const a = 1;\n", "utf8");
  writeFileSync(path.join(nestedSkillRoot, "README.md"), "# fixture\n", "utf8");
  writeFileSync(
    path.join(nestedSkillRoot, "skill-version.json"),
    `${JSON.stringify({ version: "0.1.0", updatedAt: "2026-09-06", releaseNotes: ["fixture release note one", "fixture release note two"] }, null, 2)}\n`,
    "utf8",
  );
  versionGit(versionNestedRepoOnly, ["init", "-q", "-b", "main"]);
  versionGit(versionNestedRepoOnly, ["add", "-A"]);
  versionGit(versionNestedRepoOnly, ["commit", "-q", "--no-verify", "-m", "baseline"]);
  versionGit(versionNestedRepoOnly, ["checkout", "-q", "-b", "feature"]);
  writeFileSync(path.join(nestedSkillRoot, "README.md"), "# fixture\n\nDocumentation-only change.\n", "utf8");
  versionGit(versionNestedRepoOnly, ["add", "-A"]);
  versionGit(versionNestedRepoOnly, ["commit", "-q", "--no-verify", "-m", "docs-only follow-up"]);
  runScriptArgs(
    "version discipline does not count a nested skill root's documentation-only branch as ahead",
    "check-version-discipline.ts",
    ["--repo-root", versionNestedRepoOnly, "--skill-root", nestedSkillRoot],
    0,
  );

  // --- validate-state (fail branch) ---
  const designStateMissing = makeEmptyFixture("design-state-missing");
  runFixture("design state validation fails when state files are missing", designStateMissing, "validate-state.ts", 1, "design_state.file_missing");

  // --- check-lane-coverage ---
  const laneCoverageBaseline = makeFixture("lane-coverage-baseline");
  runFixture("shipped template lane set passes coverage", laneCoverageBaseline, "check-lane-coverage.ts", 0);

  const laneCoverageMissingLane = makeFixture("lane-coverage-missing-lane");
  const laneCoverageState = readState(laneCoverageMissingLane);
  delete expectRecord(laneCoverageState.lanes, "state/business-state.json lanes")["revenue"];
  writeState(laneCoverageMissingLane, laneCoverageState);
  runFixture("state missing a required lane fails coverage", laneCoverageMissingLane, "check-lane-coverage.ts", 1, "project_state.invalid_schema");

  // --- check-lane-coverage: lane dependency edges ---
  // Mechanizes "Lock phase outputs before depending on them" (SKILL.md) — a lane
  // may not claim done while an upstream lane is still not_started/partial/blocked.

  /** Set a lane's status and evidence in one call, returning the mutated state. */
  const withLane = (root: string, lane: string, patch: MutableRecord): MutableRecord => {
    const state = readState(root);
    Object.assign(getLane(state, lane), patch);
    writeState(root, state);
    return state;
  };

  // done on a partial upstream = error.
  const depUnlocked = makeFixture("lane-dependency-unlocked");
  const depUnlockedState = readState(depUnlocked);
  expectRecord(depUnlockedState.project, "state/business-state.json project").phase = "phase_2_design";
  Object.assign(getLane(depUnlockedState, "design"), { status: "succeeded", evidence: ["DESIGN.md"] });
  Object.assign(getLane(depUnlockedState, "product"), { status: "running", evidence: ["PRODUCT.md"] });
  writeState(depUnlocked, depUnlockedState);
  runFixture("lane done on a partial upstream lane fails coverage", depUnlocked, "check-lane-coverage.ts", 1, "lane_coverage.design.dependency_unlocked");

  // done on a blocked upstream = error (blocked is not a resolved scope decision).
  const depBlocked = makeFixture("lane-dependency-blocked-upstream");
  const depBlockedState = readState(depBlocked);
  expectRecord(depBlockedState.project, "state/business-state.json project").phase = "phase_2_design";
  Object.assign(getLane(depBlockedState, "design"), { status: "succeeded", evidence: ["DESIGN.md"] });
  Object.assign(getLane(depBlockedState, "product"), { status: "blocked", blockers: ["Awaiting founder call on the V2 boundary."] });
  writeState(depBlocked, depBlockedState);
  runFixture("lane done on a blocked upstream lane fails coverage", depBlocked, "check-lane-coverage.ts", 1, "lane_coverage.design.dependency_unlocked");

  // --- check-lane-coverage: founder-gate re-engagement ---
  // A founder-gated blocker is a pause awaiting a decision, not a termination.
  // Undated gates warn (nobody can ever call them stale); gates older than the
  // 30-day re-engagement window warn pre-launch and error once the app is live.
  const gateIsoDaysAgo = (days: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };

  const founderGateUndated = makeFixture("founder-gate-undated");
  withLane(founderGateUndated, "paid_user_acquisition", {
    status: "deferred",
    blockers: ["founder-gated: paid campaign launch and budget spend"],
  });
  runFixture(
    "undated founder-gated blocker surfaces a warning",
    founderGateUndated,
    "check-lane-coverage.ts",
    0,
    "lane_coverage.paid_user_acquisition.founder_gate_undated",
  );

  const founderGateStalePre = makeFixture("founder-gate-stale-prelaunch");
  withLane(founderGateStalePre, "paid_user_acquisition", {
    status: "deferred",
    blockers: [`founder-gated ${gateIsoDaysAgo(45)}: paid campaign launch and budget spend`],
  });
  runFixture(
    "stale founder gate pre-launch surfaces the re-engagement warning",
    founderGateStalePre,
    "check-lane-coverage.ts",
    0,
    "lane_coverage.paid_user_acquisition.founder_gate_reengagement_due",
  );

  // Live app + a growth lever parked behind a forgotten question = the
  // distribution-never-turns-on failure mode. Error, not warning.
  const founderGateStaleLive = makeFixture("founder-gate-stale-postlaunch");
  {
    const state = readState(founderGateStaleLive);
    expectRecord(state.project, "state/business-state.json project").phase = "phase_6";
    writeState(founderGateStaleLive, state);
  }
  withLane(founderGateStaleLive, "paid_user_acquisition", {
    status: "deferred",
    blockers: [`founder-gated ${gateIsoDaysAgo(60)}: paid campaign launch and budget spend`],
  });
  runFixture(
    "stale founder gate on a live app fails coverage",
    founderGateStaleLive,
    "check-lane-coverage.ts",
    1,
    "lane_coverage.paid_user_acquisition.founder_gate_reengagement_due",
  );

  // A standing policy note is a reminder, not a presented gate: the shipped
  // template's own "Founder approval is required before..." blocker must never
  // age into a false stale-gate error on a live app. Every lane is deferred
  // with a fresh dated reason so the only possible phase_6 error would be the
  // misfire this fixture exists to rule out.
  const founderGateStandingPolicy = makeFixture("founder-gate-standing-policy");
  {
    const state = readState(founderGateStandingPolicy);
    expectRecord(state.project, "state/business-state.json project").phase = "phase_6";
    const lanes = expectRecord(state.lanes, "state/business-state.json lanes");
    for (const laneName of Object.keys(lanes)) {
      const lane = expectRecord(lanes[laneName], `lanes.${laneName}`);
      lane["status"] = "deferred";
      lane["reason"] = `${gateIsoDaysAgo(3)} scope pass: deferred while the live app runs its weekly rhythm; revisit at the day-30 retro.`;
    }
    const paidUa = expectRecord(lanes["paid_user_acquisition"], "lanes.paid_user_acquisition");
    paidUa["blockers"] = ["Founder approval is required before ad account connection, paid spend, budget changes, or live campaign launch."];
    writeState(founderGateStandingPolicy, state);
  }
  runFixture("standing policy blocker on a live app is not an aged gate", founderGateStandingPolicy, "check-lane-coverage.ts", 0);

  // Same-day east of UTC: a gate recorded with today's local date before UTC
  // midnight is fresh, not forward-dated.
  const founderGateSameDayEast = makeFixture("founder-gate-same-day-east");
  {
    const state = readState(founderGateSameDayEast);
    expectRecord(state.project, "state/business-state.json project").phase = "phase_6";
    const lanes = expectRecord(state.lanes, "state/business-state.json lanes");
    for (const laneName of Object.keys(lanes)) {
      const lane = expectRecord(lanes[laneName], `lanes.${laneName}`);
      lane["status"] = "deferred";
      lane["reason"] = `${gateIsoDaysAgo(3)} scope pass: deferred while the live app runs its weekly rhythm; revisit at the day-30 retro.`;
    }
    const paidUa = expectRecord(lanes["paid_user_acquisition"], "lanes.paid_user_acquisition");
    paidUa["blockers"] = [`founder-gated ${gateIsoDaysAgo(-1)}: paid campaign launch and budget spend`];
    writeState(founderGateSameDayEast, state);
  }
  runFixture("same-day local date east of UTC is fresh, not forward-dated", founderGateSameDayEast, "check-lane-coverage.ts", 0);

  // A date outside the documented presentation slot (between keyword and
  // colon) is a campaign date, not a presentation date.
  const founderGateDateAfterColon = makeFixture("founder-gate-date-after-colon");
  {
    const state = readState(founderGateDateAfterColon);
    expectRecord(state.project, "state/business-state.json project").phase = "phase_6";
    writeState(founderGateDateAfterColon, state);
  }
  withLane(founderGateDateAfterColon, "paid_user_acquisition", {
    status: "deferred",
    blockers: [`founder-gated: campaign prepared ${gateIsoDaysAgo(1)}; spend awaiting approval`],
  });
  runFixture(
    "a date after the colon does not count as the presentation date",
    founderGateDateAfterColon,
    "check-lane-coverage.ts",
    1,
    "lane_coverage.paid_user_acquisition.founder_gate_undated",
  );

  // A forward-dated gate would disarm the clock exactly like an undated one.
  const founderGateFutureDate = makeFixture("founder-gate-future-date");
  {
    const state = readState(founderGateFutureDate);
    expectRecord(state.project, "state/business-state.json project").phase = "phase_6";
    writeState(founderGateFutureDate, state);
  }
  withLane(founderGateFutureDate, "paid_user_acquisition", {
    status: "deferred",
    blockers: [`founder-gated ${gateIsoDaysAgo(-30)}: paid campaign launch and budget spend`],
  });
  runFixture(
    "forward-dated founder gate on a live app fails as undated",
    founderGateFutureDate,
    "check-lane-coverage.ts",
    1,
    "lane_coverage.paid_user_acquisition.founder_gate_undated",
  );

  const founderGateFresh = makeFixture("founder-gate-fresh");
  withLane(founderGateFresh, "paid_user_acquisition", {
    status: "deferred",
    blockers: [`founder-gated ${gateIsoDaysAgo(5)}: paid campaign launch and budget spend; founder chose to revisit after the day-30 retro`],
  });
  runFixture("freshly dated founder gate passes without gate findings", founderGateFresh, "check-lane-coverage.ts", 0);

  // deferred/not_needed upstream IS a resolved scope decision (launch tiers), so
  // it unblocks a downstream lane. Uses the content_assets -> design edge, whose
  // upstream chain is otherwise untouched.
  const depDeferred = makeFixture("lane-dependency-deferred-upstream");
  const depDeferredState = readState(depDeferred);
  Object.assign(getLane(depDeferredState, "design"), {
    status: "deferred",
    reason: "2026-07-25 Lite tier: shipping on the archetype starter's default system, so no bespoke design pass. Revisit at day 30.",
  });
  Object.assign(getLane(depDeferredState, "content_assets"), { status: "succeeded", evidence: ["CONTENT_ASSETS.md"] });
  writeState(depDeferred, depDeferredState);
  runFixture("deferred upstream lane does not block a downstream done lane", depDeferred, "check-lane-coverage.ts", 0);

  // A dated override downgrades the error to a warning (exit 0, still visible).
  const depOverride = makeFixture("lane-dependency-override");
  const depOverrideState = readState(depOverride);
  Object.assign(getLane(depOverrideState, "design"), {
    status: "succeeded",
    evidence: ["DESIGN.md"],
    dependency_override:
      "2026-07-25 Brand and type system locked from founder identity work; the open PRODUCT.md item is a V2 scope question that does not touch any design token.",
  });
  Object.assign(getLane(depOverrideState, "product"), { status: "running", evidence: ["PRODUCT.md"] });
  writeState(depOverride, depOverrideState);
  runFixture(
    "dated dependency_override downgrades the edge error to a warning",
    depOverride,
    "check-lane-coverage.ts",
    0,
    "lane_coverage.design.dependency_overridden",
  );

  // An undated/trivial override buys nothing: the edge error stands, and the
  // override itself is flagged as thin. Any non-empty string used to downgrade
  // the error — the exact words-not-work bypass this gate exists to refuse.
  const depOverrideThin = makeFixture("lane-dependency-override-thin");
  withLane(depOverrideThin, "product", { status: "running", evidence: ["PRODUCT.md"] });
  withLane(depOverrideThin, "design", { status: "succeeded", evidence: ["DESIGN.md"], dependency_override: "not needed" });
  runFixture("undated dependency_override does not unlock the edge", depOverrideThin, "check-lane-coverage.ts", 1, "lane_coverage.design.dependency_unlocked");
  runFixture("undated dependency_override is itself flagged as thin", depOverrideThin, "check-lane-coverage.ts", 1, "lanes.design.reason_undated_or_trivial");

  // A dated-but-stale override still downgrades (drift to revisit, not a bypass),
  // and the staleness warning rides along so it never goes quiet.
  const depOverrideStale = makeFixture("lane-dependency-override-stale");
  withLane(depOverrideStale, "product", { status: "running", evidence: ["PRODUCT.md"] });
  withLane(depOverrideStale, "design", {
    status: "succeeded",
    evidence: ["DESIGN.md"],
    dependency_override:
      "2025-01-05 Brand and type system locked from founder identity work; the open PRODUCT.md item is a V2 scope question that does not touch any design token.",
  });
  runFixture(
    "stale dated dependency_override still downgrades but surfaces staleness",
    depOverrideStale,
    "check-lane-coverage.ts",
    0,
    "lanes.design.stall_reason_stale",
  );

  // --- check-change-cascade: recorded cascade surface coverage ---
  // Grades state/business-state.json change_cascade entries against the shipped
  // knowledge/process/cascade-edges.yaml map (the data form of the Change Cascade Map).

  /** Write a change_cascade block into a fixture's state/business-state.json. */
  const withCascade = (root: string, block: unknown): void => {
    const state = readState(root);
    getLane(state, "post_launch_ops").changeCascade = block;
    writeState(root, state);
  };

  // Shipped template has an empty block — inert until a change is recorded.
  runFixture("shipped template passes the change cascade gate", makeFixture("cascade-baseline"), "check-change-cascade.ts", 0);

  // A fully accounted lexicon cascade passes: every mapped surface is either
  // updated with evidence or unaffected with a reason.
  const cascadeComplete = makeFixture("cascade-complete");
  withCascade(cascadeComplete, [
    {
      id: "rename-streaks-to-runs",
      types: ["lexicon_change"],
      recorded_at: "2026-07-25",
      surfaces: {
        app_in_app: { status: "updated", evidence: "product/ONBOARDING.md" },
        asc_listing: { status: "updated", evidence: "APP_STORE_LISTING.md" },
        google_play_listing: { status: "updated", evidence: "store/GOOGLE_PLAY_RELEASE.md" },
        asc_products: { status: "updated", evidence: "revenue/REVENUE_OPS.md", variants: [{ product: "pro_monthly", evidence: "revenue/REVENUE_OPS.md" }] },
        google_play_products: {
          status: "updated",
          evidence: "revenue/REVENUE_OPS.md",
          variants: [{ product: "pro_monthly", locale: "en-US", evidence: "revenue/REVENUE_OPS.md" }],
        },
        revenuecat_billing: { status: "updated", evidence: "revenue/REVENUE_OPS.md" },
        landing_web: { status: "updated", evidence: "growth/landing/index.html", variants: [{ locale: "en-US", evidence: "growth/landing/index.html" }] },
        landing_onboarding: { status: "unaffected", reason: "the landing has no qualification flow" },
        lifecycle_email: { status: "updated", evidence: "growth/EMAIL_OPS.md" },
        content_ugc_ads: { status: "unaffected", reason: "no ad creative names the term yet" },
      },
    },
  ]);
  runFixture("fully accounted lexicon cascade passes", cascadeComplete, "check-change-cascade.ts", 0);

  // The core miss: a mapped surface left out entirely.
  const cascadeMissingSurface = makeFixture("cascade-missing-surface");
  withCascade(cascadeMissingSurface, [
    { id: "rename", types: ["lexicon_change"], surfaces: { app_in_app: { status: "updated", evidence: "product/ONBOARDING.md" } } },
  ]);
  runFixture("cascade omitting a mapped surface fails", cascadeMissingSurface, "check-change-cascade.ts", 1, "change_cascade.rename.asc_listing.unaccounted");

  const cascadeUnclassified = makeFixture("cascade-unclassified");
  withCascade(cascadeUnclassified, [{ id: "unclassified", surfaces: {} }]);
  runFixture("a cascade without classified types refuses", cascadeUnclassified, "check-change-cascade.ts", 1, "change_cascade.unclassified.type_missing");

  const cascadeUnknownType = makeFixture("cascade-unknown-type");
  withCascade(cascadeUnknownType, [{ id: "vibes", types: ["vibes_change"], surfaces: {} }]);
  runFixture("cascade with an unclassified change type fails", cascadeUnknownType, "check-change-cascade.ts", 1, "change_cascade.vibes.unknown_type");

  // "unaffected" without a reason is an omission wearing a status.
  const cascadeNoReason = makeFixture("cascade-unaffected-no-reason");
  withCascade(cascadeNoReason, [
    {
      id: "onboard",
      types: ["onboarding_change"],
      surfaces: {
        app_in_app: { status: "unaffected" },
        asc_listing: { status: "updated", evidence: "SCREENSHOTS.md" },
        analytics: { status: "updated", evidence: "analytics/ANALYTICS.md" },
        landing_web: { status: "updated", evidence: "growth/landing/index.html" },
      },
    },
  ]);
  runFixture(
    "cascade marking a surface unaffected without a reason fails",
    cascadeNoReason,
    "check-change-cascade.ts",
    1,
    "change_cascade.onboard.app_in_app.reason_missing",
  );

  // A mistyped surface id would otherwise read as diligence while being ungraded.
  const cascadeTypo = makeFixture("cascade-typo-surface");
  withCascade(cascadeTypo, [
    {
      id: "typo",
      types: ["onboarding_change"],
      surfaces: {
        app_in_app: { status: "updated", evidence: "product/ONBOARDING.md" },
        asc_listing: { status: "updated", evidence: "SCREENSHOTS.md" },
        analytics: { status: "updated", evidence: "analytics/ANALYTICS.md" },
        landing_web: { status: "updated", evidence: "growth/landing/index.html" },
        asc_listng: { status: "updated", evidence: "typo id nobody grades" },
      },
    },
  ]);
  runFixture("cascade recording an unknown surface id fails", cascadeTypo, "check-change-cascade.ts", 1, "change_cascade.typo.asc_listng.unknown_surface");

  const cascadeMultiType = makeFixture("cascade-multi-type-union");
  withCascade(cascadeMultiType, [
    {
      id: "rename-onboarding-price",
      types: ["lexicon_change", "pricing_change", "onboarding_change"],
      surfaces: { app_in_app: { status: "updated", evidence: "product/ONBOARDING.md" } },
    },
  ]);
  runFixture(
    "multi-type cascade grades the union of all affected surfaces",
    cascadeMultiType,
    "check-change-cascade.ts",
    1,
    "change_cascade.rename-onboarding-price.google_play_products.unaccounted",
  );

  const cascadeVariantless = makeFixture("cascade-variantless-evidence");
  withCascade(cascadeVariantless, [
    {
      id: "generated-assets",
      types: ["generated_asset_change"],
      surfaces: {
        content_ugc_ads: { status: "updated", evidence: "growth/content-assets/CONTENT_ASSETS.md" },
        asc_listing: { status: "unaffected", reason: "no generated store art" },
        google_play_listing: { status: "unaffected", reason: "no generated store art" },
        asc_products: { status: "unaffected", reason: "no promoted product art" },
        google_play_products: { status: "unaffected", reason: "no generated product art" },
        lifecycle_email: { status: "unaffected", reason: "no generated email art" },
        landing_web: { status: "unaffected", reason: "no generated landing art" },
      },
    },
  ]);
  runFixture(
    "updated generated assets require asset-keyed evidence",
    cascadeVariantless,
    "check-change-cascade.ts",
    1,
    "change_cascade.generated-assets.content_ugc_ads.asset_evidence_missing",
  );
}
