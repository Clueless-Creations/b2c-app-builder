import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, getLane, readState, writeState } from "./_harness.js";

/** Deterministic fixtures for the generalized onboarding system graph gate. */
export function register(h: Harness): void {
  const { makeFixture, runFixture } = h;

  const onboardingPath = (fixtureRoot: string): string => path.join(fixtureRoot, "product/ONBOARDING.md");
  const mutateOnboarding = (fixtureRoot: string, mutate: (text: string) => string): void => {
    const file = onboardingPath(fixtureRoot);
    writeFileSync(file, mutate(readFileSync(file, "utf8")), "utf8");
  };
  const mutateProductYaml = (fixtureRoot: string, mutate: (text: string) => string): void => {
    const file = path.join(fixtureRoot, "product.yaml");
    writeFileSync(file, mutate(readFileSync(file, "utf8")), "utf8");
  };
  const setFeatureScope = (text: string, featureId: string, scope: "required" | "excluded" | "non-goal"): string => {
    const pattern = new RegExp(`(- id: ${escapeRegExp(featureId)}\\n    class_id: class.feature\\n    slots:\\n      slot.feature.scope: )\\S+`);
    if (!pattern.test(text)) throw new Error(`fixture setup: feature ${featureId} not found`);
    return text.replace(pattern, `$1${scope}`);
  };
  const removeFeature = (text: string, featureId: string): string => {
    const listPattern = new RegExp(`\\n        - ${escapeRegExp(featureId)}`);
    const instancePattern = new RegExp(`\\n  - id: ${escapeRegExp(featureId)}\\n    class_id: class.feature\\n    slots:\\n      slot.feature.scope: \\S+`);
    if (!listPattern.test(text)) throw new Error(`fixture setup: feature list entry ${featureId} not found`);
    if (!instancePattern.test(text)) throw new Error(`fixture setup: feature instance ${featureId} not found`);
    return text.replace(listPattern, "").replace(instancePattern, "");
  };
  const writeWorkspaceComposition = (fixtureRoot: string, recipeId: string, presentPaywallProvider?: string): void => {
    const bindings =
      presentPaywallProvider === undefined
        ? "\n"
        : `\nbindings:\n  b2c/monetization.present-paywall:\n    provider: {id: ${presentPaywallProvider}, version: 1.0.0}\n`;
    writeFileSync(
      path.join(fixtureRoot, "b2c.yaml"),
      `apiVersion: b2c/v1\nrecipe: {id: ${recipeId}, version: 1.0.0}\ntarget: {platform: ios, runtime: swiftui}${bindings}`,
      "utf8",
    );
  };
  const studioSurface = (id: string, interaction?: string): Record<string, unknown> => ({
    id,
    name: id,
    status: "draft",
    purpose: "purpose prose must not be parsed as a technique class",
    decisions: [],
    tokenReferences: [],
    ...(interaction === undefined ? {} : { interaction }),
  });
  const writeStudioSurfaces = (
    fixtureRoot: string,
    landingPages: Array<{ id: string; interaction?: string }> = [],
    screens: Array<{ id: string; interaction?: string }> = [],
  ): void => {
    const file = path.join(fixtureRoot, "studio/seed/business.json");
    const seed = JSON.parse(readFileSync(file, "utf8")) as {
      surfaces: { landingPages: unknown[]; mobileApp: { screens: unknown[] } };
    };
    seed.surfaces.landingPages = landingPages.map((row) => studioSurface(row.id, row.interaction));
    seed.surfaces.mobileApp.screens = screens.map((row) => studioSurface(row.id, row.interaction));
    writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  };
  const writeSixtyFpsToolRow = (fixtureRoot: string, access: string, route: string): void => {
    const file = path.join(fixtureRoot, "strategy/TOOL_DECISIONS.md");
    const text = readFileSync(file, "utf8");
    const marker = "\n## Mobile Proof Route Decision";
    if (!text.includes(marker)) throw new Error("fixture setup: TOOL_DECISIONS intake marker missing");
    const row = `| 60fps.design MCP | design | ${access} | required before paid/account access | ${route} | distilled recipes are not equivalent |\n`;
    writeFileSync(file, text.replace(marker, `\n${row}${marker}`), "utf8");
  };
  const requireHeadlineFeature = (fixtureRoot: string): void => {
    mutateProductYaml(fixtureRoot, (text) => setFeatureScope(text, "feature.paywall-goal-headline", "required"));
  };
  const requireRevenueCatHeadlineBind = (fixtureRoot: string): void => {
    requireHeadlineFeature(fixtureRoot);
    writeWorkspaceComposition(fixtureRoot, "b2c/subscription-app", "b2c/revenuecat");
  };

  // Shipped markdown tables are column-aligned (prettier pads every cell to its column's widest
  // row), so a literal single-spaced row never matches them. Match rows by their cell contents
  // with padding-tolerant separators, and throw when the row is absent: a String.replace that
  // finds nothing silently leaves the fixture unmutated, which turns a "fails" case into a false
  // failure and a "passes" case into a false pass.
  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tableRowPattern = (row: string): RegExp => {
    const cells = row
      .trim()
      .slice(1, row.trim().endsWith("|") ? -1 : undefined)
      .split("|")
      .map((cell) => cell.trim());
    return new RegExp(`\\|${cells.map((cell) => `\\s*${escapeRegExp(cell)}\\s*\\|`).join("")}`);
  };
  const replaceTableRow = (text: string, row: string, replacement: string): string => {
    const pattern = tableRowPattern(row);
    if (!pattern.test(text)) throw new Error(`fixture setup: table row not found: ${row}`);
    return text.replace(pattern, replacement);
  };
  const removeTableBlock = (text: string, pattern: RegExp): string => {
    if (!pattern.test(text)) throw new Error(`fixture setup: table block not found: ${pattern}`);
    return text.replace(pattern, "");
  };

  // Mirrors check-onboarding-graph.ts's own TEMPLATE_DIRECTIVE_VERBS set: this fixture needs
  // to fill every cell the validator itself would call a placeholder, not just the ones
  // literally starting with "Record" -- the shipped template also opens cells with "Define",
  // "Choose", etc., and leaving those unfilled means this "completed" fixture was never
  // actually complete, so its assertions proved nothing about the cells it didn't touch.
  const TEMPLATE_DIRECTIVE_VERBS_PATTERN =
    /^\s*(?:add|added|capture|captured|choose|chosen|complete|completed|define|defined|describe|described|document|documented|enter|entered|fill|filled|finish|finished|include|included|insert|inserted|mark|marked|note|noted|provide|provided|record|replace|replaced|select|selected|specify|specified|update|updated|write|written)\b/i;

  const baseline = makeFixture("onboarding-graph-baseline");
  runFixture("shipped onboarding graph template passes before completion", baseline, "check-onboarding-graph.ts", 0);

  const graphNodeMissing = makeFixture("onboarding-graph-node-missing");
  mutateOnboarding(graphNodeMissing, (text) => text.replaceAll("ONB-22", "ONB-FINAL"));
  runFixture("onboarding graph missing a canonical node fails", graphNodeMissing, "check-onboarding-graph.ts", 1, "onboarding_graph.node_missing");

  const evidenceMissing = makeFixture("onboarding-graph-evidence-missing");
  mutateOnboarding(evidenceMissing, (text) => text.replace("## Onbo Hub Pattern Atlas", "## Flow Pattern Notes"));
  runFixture(
    "onboarding without the authorized Onbo Hub evidence contract fails",
    evidenceMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_onbo_hub_pattern_atlas_missing",
  );

  const commitmentFunnelMissing = makeFixture("onboarding-graph-commitment-funnel-missing");
  mutateOnboarding(commitmentFunnelMissing, (text) => text.replace("## Commitment Funnel", "## First Session Order"));
  runFixture(
    "onboarding without the Commitment Funnel section fails",
    commitmentFunnelMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_commitment_funnel_missing",
  );

  const funnelQualityMissing = makeFixture("onboarding-graph-funnel-quality-missing");
  mutateOnboarding(funnelQualityMissing, (text) => text.replace("## Funnel Quality Metrics", "## Conversion Metrics"));
  runFixture(
    "onboarding without Funnel Quality Metrics fails",
    funnelQualityMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_funnel_quality_metrics_missing",
  );

  const paywallGoalHeadlineMissing = makeFixture("onboarding-graph-paywall-goal-headline-missing");
  requireRevenueCatHeadlineBind(paywallGoalHeadlineMissing);
  mutateOnboarding(paywallGoalHeadlineMissing, (text) => text.replace("## Paywall Goal Headline", "## Paywall Copy Notes"));
  runFixture(
    "onboarding without the Paywall Goal Headline section fails",
    paywallGoalHeadlineMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_paywall_goal_headline_missing",
  );

  const paywallGoalHeadlineSelected = makeFixture("onboarding-graph-paywall-goal-headline-selected");
  requireRevenueCatHeadlineBind(paywallGoalHeadlineSelected);
  runFixture(
    "onboarding with an explicit RevenueCat present-paywall binding keeps the headline section",
    paywallGoalHeadlineSelected,
    "check-onboarding-graph.ts",
    0,
  );

  const paywallGoalHeadlineInvented = makeFixture("onboarding-graph-paywall-goal-headline-invented");
  mutateOnboarding(paywallGoalHeadlineInvented, (text) =>
    text.replace("Do not invent a goal or outcome.", "An invented outcome is allowed when it sounds more motivating than their answer."),
  );
  runFixture(
    "onboarding that allows an invented paywall outcome fails",
    paywallGoalHeadlineInvented,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.paywall_goal_headline_invented",
  );

  const paywallGoalHeadlineTableMissing = makeFixture("onboarding-graph-paywall-goal-headline-table-missing");
  requireRevenueCatHeadlineBind(paywallGoalHeadlineTableMissing);
  mutateOnboarding(paywallGoalHeadlineTableMissing, (text) =>
    removeTableBlock(
      text,
      /\|\s*Goal key\s*\|\s*User-facing prompt\s*\|\s*Headline template\s*\|\s*Fallback when skipped\s*\|[\s\S]*?\|\s*`skipped`\s*\|[^\n]*\n/,
    ),
  );
  runFixture(
    "onboarding whose Paywall Goal Headline section has no mapping table fails",
    paywallGoalHeadlineTableMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.paywall_goal_headline_table",
  );

  const refundRateMissing = makeFixture("onboarding-graph-refund-rate-missing");
  mutateOnboarding(refundRateMissing, (text) => text.replaceAll("refund rate", "churn after trial"));
  runFixture(
    "onboarding without refund rate as a funnel quality metric fails",
    refundRateMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.funnel_quality",
  );

  const commitmentFunnelExcluded = makeFixture("onboarding-graph-commitment-funnel-excluded");
  mutateProductYaml(commitmentFunnelExcluded, (text) => setFeatureScope(text, "feature.commitment-funnel", "excluded"));
  mutateOnboarding(commitmentFunnelExcluded, (text) =>
    text.replace("## Commitment Funnel", "## First Session Order").replace("## Funnel Quality Metrics", "## Conversion Metrics"),
  );
  runFixture("onboarding may omit the Commitment Funnel when feature.commitment-funnel is excluded", commitmentFunnelExcluded, "check-onboarding-graph.ts", 0);

  const paywallGoalHeadlineExcluded = makeFixture("onboarding-graph-paywall-goal-headline-excluded");
  mutateProductYaml(paywallGoalHeadlineExcluded, (text) => setFeatureScope(text, "feature.paywall-goal-headline", "excluded"));
  mutateOnboarding(paywallGoalHeadlineExcluded, (text) => text.replace("## Paywall Goal Headline", "## Paywall Copy Notes"));
  runFixture(
    "onboarding may omit the Paywall Goal Headline when feature.paywall-goal-headline is excluded",
    paywallGoalHeadlineExcluded,
    "check-onboarding-graph.ts",
    0,
  );

  const onboardingFeaturesUnresolved = makeFixture("onboarding-graph-features-unresolved");
  mutateProductYaml(onboardingFeaturesUnresolved, (text) => removeFeature(removeFeature(text, "feature.commitment-funnel"), "feature.paywall-goal-headline"));
  runFixture(
    "onboarding holds when commitment-funnel and paywall-goal-headline instances are absent",
    onboardingFeaturesUnresolved,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.commitment_funnel_unresolved",
  );

  const paywallGoalHeadlineUnresolvedComposition = makeFixture("onboarding-graph-paywall-goal-headline-unresolved-composition");
  requireHeadlineFeature(paywallGoalHeadlineUnresolvedComposition);
  runFixture(
    "onboarding holds when the headline feature is required and present-paywall is unresolved",
    paywallGoalHeadlineUnresolvedComposition,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.paywall_goal_headline_unresolved",
  );

  const paywallGoalHeadlineUnavailable = makeFixture("onboarding-graph-paywall-goal-headline-unavailable");
  requireHeadlineFeature(paywallGoalHeadlineUnavailable);
  writeWorkspaceComposition(paywallGoalHeadlineUnavailable, "b2c/subscription-app", "b2c/superwall");
  runFixture(
    "onboarding cannot invent a RevenueCat headline bind for a Superwall presenter",
    paywallGoalHeadlineUnavailable,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.paywall_goal_headline_unavailable",
  );

  const motionResearchMissing = makeFixture("onboarding-graph-motion-research-missing");
  mutateOnboarding(motionResearchMissing, (text) => text.replace("## Motion Research", "## Animation Notes"));
  runFixture(
    "onboarding without the Motion Research section fails",
    motionResearchMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_motion_research_missing",
  );

  const motionInteractionUnresolved = makeFixture("onboarding-graph-motion-interaction-unresolved");
  writeStudioSurfaces(motionInteractionUnresolved, [{ id: "privacy" }]);
  runFixture(
    "onboarding holds when a listed studio surface omits interaction",
    motionInteractionUnresolved,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.surface_interaction_unresolved",
  );

  const motionReferenceUnavailable = makeFixture("onboarding-graph-motion-reference-unavailable");
  writeStudioSurfaces(motionReferenceUnavailable, [], [{ id: "hero", interaction: "bespoke-motion" }]);
  writeSixtyFpsToolRow(motionReferenceUnavailable, "blocked", "fallback distilled recipes");
  runFixture(
    "onboarding holds when selected 60fps research is recorded as blocked",
    motionReferenceUnavailable,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.motion_reference_unavailable",
  );

  const motionReferenceSelectedMissingPhrases = makeFixture("onboarding-graph-motion-reference-selected-missing");
  writeStudioSurfaces(motionReferenceSelectedMissingPhrases, [], [{ id: "hero", interaction: "bespoke-motion" }]);
  writeSixtyFpsToolRow(motionReferenceSelectedMissingPhrases, "connected", "search_shots route");
  mutateOnboarding(motionReferenceSelectedMissingPhrases, (text) =>
    text.replaceAll("60fps MCP", "motion catalog").replaceAll("search_shots", "shot search").replaceAll("get_motion_breakdown", "motion breakdown"),
  );
  runFixture(
    "onboarding requires 60fps MCP operations when that register is selected",
    motionReferenceSelectedMissingPhrases,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.motion_reference",
  );

  const paywallGoalHeadlineSuperwallExcluded = makeFixture("onboarding-graph-paywall-goal-headline-superwall-excluded");
  mutateProductYaml(paywallGoalHeadlineSuperwallExcluded, (text) => setFeatureScope(text, "feature.paywall-goal-headline", "excluded"));
  writeWorkspaceComposition(paywallGoalHeadlineSuperwallExcluded, "b2c/subscription-app", "b2c/superwall");
  mutateOnboarding(paywallGoalHeadlineSuperwallExcluded, (text) => text.replace("## Paywall Goal Headline", "## Paywall Copy Notes"));
  runFixture(
    "onboarding may omit the headline bind when Superwall presents and the feature is excluded",
    paywallGoalHeadlineSuperwallExcluded,
    "check-onboarding-graph.ts",
    0,
  );

  const requiredSectionInFence = makeFixture("onboarding-graph-required-section-in-fence");
  mutateOnboarding(requiredSectionInFence, (text) => {
    // Relocate the entire live "## Privacy And Security" section into a fenced code sample,
    // leaving it absent from the live document -- hasHeading() has no notion of fences, so
    // before liveText was computed up front (and used for every structural check, not only the
    // deep --require-done block) this would have still been accepted as present.
    const section = text.match(/## Privacy And Security\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Privacy And Security section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n\`\`\`markdown\n${section}\n\`\`\`\n`;
  });
  runFixture(
    "a required section relocated into a fenced example still fails as missing",
    requiredSectionInFence,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_privacy_and_security_missing",
  );

  const requiredSectionInHtmlComment = makeFixture("onboarding-graph-required-section-in-html-comment");
  mutateOnboarding(requiredSectionInHtmlComment, (text) => {
    // Same relocation as requiredSectionInFence, but into an HTML comment rather than a
    // triple-backtick fence -- a comment renders nothing at all, yet stripFencedBlocks() only
    // ever stripped backtick fences, so this form stayed live and readable to every structural
    // check.
    const section = text.match(/## Performance And Observability\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Performance And Observability section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n<!--\n${section}\n-->\n`;
  });
  runFixture(
    "a required section relocated into an HTML comment still fails as missing",
    requiredSectionInHtmlComment,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_performance_and_observability_missing",
  );

  const requiredSectionInTildeFence = makeFixture("onboarding-graph-required-section-in-tilde-fence");
  mutateOnboarding(requiredSectionInTildeFence, (text) => {
    // Same relocation again, into a CommonMark tilde fence (~~~) -- an equally valid fence
    // delimiter to triple backticks, which stripFencedBlocks() never recognized at all.
    const section = text.match(/## Accessibility And Localization\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Accessibility And Localization section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n~~~markdown\n${section}\n~~~\n`;
  });
  runFixture(
    "a required section relocated into a tilde fence still fails as missing",
    requiredSectionInTildeFence,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_accessibility_and_localization_missing",
  );

  const requiredSectionInUnterminatedFence = makeFixture("onboarding-graph-required-section-in-unterminated-fence");
  mutateOnboarding(requiredSectionInUnterminatedFence, (text) => {
    // Same relocation again, but the opening fence is never closed -- CommonMark still renders
    // an unterminated fence as extending to the end of the document (code, not prose), yet the
    // old paired-delimiter regex required a closing run of backticks to match anything at all,
    // so with no closer present it stripped nothing and left the relocated heading exactly as
    // live and findable as if it had never been fenced.
    const section = text.match(/## Prototype And Design Proof\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Prototype And Design Proof section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n\`\`\`markdown\n${section}\n`;
  });
  runFixture(
    "a required section relocated into an unterminated fence still fails as missing",
    requiredSectionInUnterminatedFence,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_prototype_and_design_proof_missing",
  );

  const requiredSectionAfterShortInnerFence = makeFixture("onboarding-graph-required-section-after-short-inner-fence");
  mutateOnboarding(requiredSectionAfterShortInnerFence, (text) => {
    // Opens with a four-backtick fence, then contains a three-backtick run before the relocated
    // section and a real four-backtick closer after it. CommonMark only closes a fence with a
    // same-character run at least as long as the opener, so the inner three-backtick line is
    // literal fence content, not a closer -- the whole block, including the relocated section,
    // stays hidden until the real four-backtick closer. A naive "any run of 3+ backticks closes
    // it" strip would stop at the inner three-backtick line instead, leaving the section (and the
    // real closer line after it) live and readable.
    const section = text.match(/## Synthetic One-Star Pre-Mortem\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Synthetic One-Star Pre-Mortem section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n\`\`\`\`markdown\nA decoy line that looks like a fence close but is too short to be one.\n\`\`\`\n${section}\n\`\`\`\`\n`;
  });
  runFixture(
    "a required section placed after a shorter inner fence run (not a real closer) still fails as missing",
    requiredSectionAfterShortInnerFence,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_synthetic_one_star_pre_mortem_missing",
  );

  const requiredHeadingIndented = makeFixture("onboarding-graph-required-heading-indented");
  mutateOnboarding(requiredHeadingIndented, (text) =>
    // Indenting the heading line by 4 spaces turns it into a CommonMark indented code block (a
    // completely different construct from a heading) rather than a fence or comment -- it is
    // preceded by a blank line in the shipped template, which is what lets an indented line begin
    // a code block instead of lazily continuing a paragraph. hasHeading() has no notion of
    // indentation and only ever compares each line's own *trimmed* text, so an indented,
    // non-rendering heading line still registered as the section being present.
    text.replace("## Verification\n", "    ## Verification\n"),
  );
  runFixture(
    "a required heading indented into a CommonMark code block still fails as missing",
    requiredHeadingIndented,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_verification_missing",
  );

  const requiredSectionInScriptBlock = makeFixture("onboarding-graph-required-section-in-script-block");
  mutateOnboarding(requiredSectionInScriptBlock, (text) => {
    // Relocate the entire live "## Failure And Recovery" section into a <script type="text/plain">
    // block -- a browser never renders script content as visible page text, the same reasoning
    // already applied to HTML comments and fences, but stripNonRenderedMarkdown() had no notion of
    // raw HTML blocks at all, so before this fix the relocated heading stayed live and findable.
    const section = text.match(/## Failure And Recovery\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Failure And Recovery section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n<script type="text/plain">\n${section}\n</script>\n`;
  });
  runFixture(
    "a required section relocated into a script block still fails as missing",
    requiredSectionInScriptBlock,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_failure_and_recovery_missing",
  );

  const requiredSectionInDivBlock = makeFixture("onboarding-graph-required-section-in-div-block");
  mutateOnboarding(requiredSectionInDivBlock, (text) => {
    // Relocate the entire live "## Evidence Decision And Complaint Traceability" section into a
    // <div> block, with no blank line between the opening tag and the heading -- CommonMark's
    // HTML-block-type-6 rule (div, section, table, p, li, ... -- a different rule from the
    // script/style/template family above) runs the block through the next blank line, not until a
    // matching closing tag, so the heading line (the first line after the opener, with no blank
    // line separating them) is absorbed into the block regardless of what happens later in the
    // section body. A real renderer shows the heading as literal text beside the <div> markup,
    // never as a parsed heading, but before this fix stripNonRenderedMarkdown() had no notion of
    // this tag family at all and left it live and findable.
    const section = text.match(/## Evidence Decision And Complaint Traceability\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Evidence Decision And Complaint Traceability section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n<div>\n${section}\n</div>\n`;
  });
  runFixture(
    "a required section relocated into a div block still fails as missing",
    requiredSectionInDivBlock,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_evidence_decision_and_complaint_traceability_missing",
  );

  const requiredSectionInPreBlock = makeFixture("onboarding-graph-required-section-in-pre-block");
  mutateOnboarding(requiredSectionInPreBlock, (text) => {
    // Relocate the entire live "## Competitor Review Matrix" section into a <pre> block.
    // stripNonRenderingHtmlBlocks() originally only recognized script/style/template -- <pre>'s
    // content DOES render visibly (unlike script/style/template), which is exactly why it was
    // deliberately left unstripped, but "renders visibly" is the wrong test: a heading inside
    // <pre> displays as literal preformatted text, never as a parsed heading a real renderer or
    // this validator's own hasHeading()/graphRunRows()/countChecklistItems() would recognize.
    const section = text.match(/## Competitor Review Matrix\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Competitor Review Matrix section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n<pre>\n${section}\n</pre>\n`;
  });
  runFixture(
    "a required section relocated into a pre block still fails as missing",
    requiredSectionInPreBlock,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_competitor_review_matrix_missing",
  );

  const requiredSectionInCustomElementBlock = makeFixture("onboarding-graph-required-section-in-custom-element-block");
  mutateOnboarding(requiredSectionInCustomElementBlock, (text) => {
    // Relocate the entire live "## Permissions And Lifecycle" section into an <x-proof> custom
    // element. CommonMark's HTML-block-type-7 rule: a line consisting of a COMPLETE open or
    // closing tag and nothing else -- ANY tag name, including hyphenated custom elements, not
    // just the curated type-6 container set -- opens an HTML block that runs through the next
    // blank line. A real renderer shows the absorbed heading as inert text inside unknown
    // markup, never as a parsed heading, but stripNonRenderedMarkdown() previously recognized
    // only the five type-1 tags and the curated type-6 set, so evidence or completion structure
    // hidden in a custom element stayed live and findable.
    const section = text.match(/## Permissions And Lifecycle\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Permissions And Lifecycle section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n<x-proof>\n${section}\n</x-proof>\n`;
  });
  runFixture(
    "a required section relocated into a custom-element block still fails as missing",
    requiredSectionInCustomElementBlock,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_permissions_and_lifecycle_missing",
  );

  const requiredSectionInTextareaBlock = makeFixture("onboarding-graph-required-section-in-textarea-block");
  mutateOnboarding(requiredSectionInTextareaBlock, (text) => {
    // Same gap, <textarea> this time: a form control's raw value renders visibly too, but a
    // heading placed inside one is a literal string inside a control, never live document
    // structure -- the same "renders visibly but is not parsed Markdown" case as <pre>.
    const section = text.match(/## Internal Guidance Audit\n[\s\S]*?(?=\n## )/)?.[0];
    if (!section) throw new Error("fixture setup: could not locate the Internal Guidance Audit section to relocate");
    const withoutLiveSection = text.replace(section, "");
    return `${withoutLiveSection}\n<textarea>\n${section}\n</textarea>\n`;
  });
  runFixture(
    "a required section relocated into a textarea block still fails as missing",
    requiredSectionInTextareaBlock,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_internal_guidance_audit_missing",
  );

  const requiredHeadingTabIndented = makeFixture("onboarding-graph-required-heading-tab-indented");
  mutateOnboarding(requiredHeadingTabIndented, (text) =>
    // A single leading tab expands to CommonMark's own 4-column tab stop, the same indentation
    // threshold as four literal spaces -- it is preceded by a blank line in the shipped template,
    // so it opens an indented code block exactly like the space-indented case above. A check that
    // only recognized four literal space characters would miss this and still find the heading.
    text.replace("## Permissions And Lifecycle\n", "\t## Permissions And Lifecycle\n"),
  );
  runFixture(
    "a required heading indented with a tab into a CommonMark code block still fails as missing",
    requiredHeadingTabIndented,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.section_permissions_and_lifecycle_missing",
  );

  const reviewInsideFirstRun = makeFixture("onboarding-graph-review-inside-first-run");
  mutateOnboarding(reviewInsideFirstRun, (text) =>
    text.replace(
      "The native request happens outside first-run onboarding.",
      "Show the native review prompt immediately after first value inside first-run onboarding.",
    ),
  );
  runFixture(
    "review request immediately after first value inside onboarding fails",
    reviewInsideFirstRun,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.review_inside_first_run",
  );

  const unobservableReview = makeFixture("onboarding-graph-unobservable-review-event");
  mutateOnboarding(unobservableReview, (text) => text.replace("`review_request_returned`", "`review_prompt_shown`"));
  runFixture(
    "analytics cannot claim that the platform displayed a review prompt",
    unobservableReview,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.review_unobservable_event",
  );

  const controlContractMissing = makeFixture("onboarding-graph-control-contract-missing");
  mutateOnboarding(controlContractMissing, (text) => text.replaceAll("ONB-CTL-001", "CONTROL-TBD"));
  runFixture("onboarding without stable control IDs fails", controlContractMissing, "check-onboarding-graph.ts", 1, "onboarding_graph.design_contract");

  const targetRuntimeMissing = makeFixture("onboarding-graph-target-runtime-missing");
  mutateOnboarding(targetRuntimeMissing, (text) => text.replaceAll("Do not keep the old runtime", "Keep the old runtime"));
  runFixture(
    "replacement plan that keeps the old runtime fails",
    targetRuntimeMissing,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.replacement_contract",
  );

  const deferredWithUnscopedArtifact = makeFixture("onboarding-graph-deferred-with-unscoped-artifact");
  {
    const state = readState(deferredWithUnscopedArtifact);
    const lane = getLane(state, "onboarding");
    lane["status"] = "deferred";
    lane["blockers"] = ["2026-08-08 founder deferred onboarding until the product hypothesis is validated"];
    writeState(deferredWithUnscopedArtifact, state);
    writeFileSync(onboardingPath(deferredWithUnscopedArtifact), "# Unscoped onboarding notes\n\nRetained for history.\n", "utf8");
  }
  runFixture("explicitly deferred onboarding ignores a retained removal artifact", deferredWithUnscopedArtifact, "check-onboarding-graph.ts", 0);

  const doneWithPlaceholders = makeFixture("onboarding-graph-done-with-placeholders");
  {
    markOnboardingDone(doneWithPlaceholders);
  }
  runFixture(
    "done onboarding lane with not_started nodes and template records fails",
    doneWithPlaceholders,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
  );

  const doneWithRenamedPlaceholders = makeFixture("onboarding-graph-done-with-renamed-placeholders");
  {
    markOnboardingDone(doneWithRenamedPlaceholders);
    mutateOnboarding(doneWithRenamedPlaceholders, (text) => text.replaceAll("not_started", "done").replaceAll("Record", "Completed"));
  }
  runFixture(
    "renaming template directives does not create a completed onboarding contract",
    doneWithRenamedPlaceholders,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
  );

  const doneWithOrdinaryRecordProse = makeFixture("onboarding-graph-done-with-ordinary-record-prose");
  {
    markOnboardingDone(doneWithOrdinaryRecordProse);
    mutateOnboarding(doneWithOrdinaryRecordProse, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      return `${completed}\nThis remains the canonical execution record for the completed onboarding system.\n`;
    });
  }
  runFixture("completed onboarding may use the ordinary word record outside template cells", doneWithOrdinaryRecordProse, "check-onboarding-graph.ts", 0);
  runFixture("a genuinely completed onboarding graph also satisfies --require-done", doneWithOrdinaryRecordProse, "check-onboarding-graph.ts", 0, undefined, [
    "--require-done",
  ]);

  const doneWithTodoInInlineCodeSpan = makeFixture("onboarding-graph-done-with-todo-in-inline-code-span");
  {
    markOnboardingDone(doneWithTodoInInlineCodeSpan);
    mutateOnboarding(doneWithTodoInInlineCodeSpan, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // A triple-backtick code SPAN (CommonMark allows any run length as a code-span delimiter,
      // not just single backticks) sitting mid-line inside a sentence -- not alone on its own
      // line -- is not a fence at all; the rendered document shows TODO right there, in the open.
      // A fence-stripper that matches a run of 3+ backticks anywhere, ignoring line position,
      // cannot tell this apart from a real fence and would erase the word along with its
      // delimiters, hiding a genuine unfinished-work marker from the placeholder scan below.
      return `${completed}\nThis section still displays \`\`\`TODO\`\`\` inline as a worked example of what NOT to leave in a finished artifact.\n`;
    });
  }
  runFixture(
    "a TODO marker inside an inline triple-backtick code span still fails --require-done as incomplete",
    doneWithTodoInInlineCodeSpan,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const doneWithTodoAfterIndentedFenceLookalike = makeFixture("onboarding-graph-done-with-todo-after-indented-fence-lookalike");
  {
    markOnboardingDone(doneWithTodoAfterIndentedFenceLookalike);
    mutateOnboarding(doneWithTodoAfterIndentedFenceLookalike, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // Both backtick runs are indented 4 spaces -- CommonMark's own cutoff for "this indentation
      // starts an indented code block instead of a fence" (a fence may be indented at most 3
      // spaces). A position-blind stripper that ignores indentation would still pair these two
      // runs as an opener/closer and erase the live TODO line sitting between them; a real
      // renderer never treats either line as a fence delimiter, so the TODO stays visible.
      return `${completed}\n    \`\`\`\nThis line still visibly says TODO and sits between two over-indented backtick runs.\n    \`\`\`\n`;
    });
  }
  runFixture(
    "a TODO marker between two over-indented (4-space) backtick runs still fails --require-done as incomplete",
    doneWithTodoAfterIndentedFenceLookalike,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const doneWithTodoAfterInlineHtmlTagMention = makeFixture("onboarding-graph-done-with-todo-after-inline-html-tag-mention");
  {
    markOnboardingDone(doneWithTodoAfterInlineHtmlTagMention);
    mutateOnboarding(doneWithTodoAfterInlineHtmlTagMention, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // The tag mention sits inside an inline code span mid-sentence, not alone at the start of its
      // own line -- CommonMark never treats it as a real HTML block opener, so the rendered
      // document shows both this sentence and the later TODO line right there, in the open. A
      // position-blind stripper that matches the tag name anywhere in the raw text would still read
      // this as an unterminated opener and, finding no closing tag anywhere after it, erase
      // everything through end of document -- including the live TODO line below -- along with it.
      return `${completed}\nThis section still mentions \`<style>\` inline as a worked example of a tag name, not a real block.\nThis line still visibly says TODO, well after that inline mention.\n`;
    });
  }
  runFixture(
    "a TODO marker after an inline mid-sentence HTML tag mention still fails --require-done as incomplete",
    doneWithTodoAfterInlineHtmlTagMention,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const doneWithIndentedGraphRunTable = makeFixture("onboarding-graph-done-with-indented-graph-run-table");
  {
    markOnboardingDone(doneWithIndentedGraphRunTable);
    mutateOnboarding(doneWithIndentedGraphRunTable, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // Indenting the whole Graph Run table by 4 spaces turns it into a CommonMark indented code
      // block (preceded by the blank line right after the "## Graph Run" heading) -- a rendered
      // page shows this as inert code text, not as the graph's actual completion record.
      // graphRunRows() has no notion of indentation and only ever matches each line's own
      // *trimmed* text against "starts with |", so an indented, non-rendering table still
      // registered every node as done.
      // The header cells below are separated by \s* rather than a literal single space because
      // the shipped template's Graph Run table is column-aligned (ADR-0002 repository layout
      // move re-rendered it with padded cells) -- the same table graphRunRows() itself reads by
      // trimming each cell, not by any fixed-width assumption.
      const table = completed.match(/\|\s*Node\s*\|\s*Status\s*\|\s*Owner\s*\|\s*Result or next action\s*\|\n(?:\|.*\|\n?)+/);
      if (!table) throw new Error("fixture setup: could not locate the Graph Run table to indent");
      const indented = table[0]
        .split("\n")
        .map((line) => (line.length > 0 ? `    ${line}` : line))
        .join("\n");
      return completed.replace(table[0], indented);
    });
  }
  runFixture(
    "a Graph Run table indented into a CommonMark code block still fails every node as not done",
    doneWithIndentedGraphRunTable,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.node_not_done",
    ["--require-done"],
  );

  // ONB-22's own catalog gate (check:onboarding-graph-complete) passes --require-done
  // unconditionally -- the shipped template's Graph Run table still reads not_started for every
  // node, so this is the one case that must fail even though the lenient baseline case above
  // passes clean. This no longer depends on lanes.onboarding.status: the content checks below
  // (which --require-done always runs, regardless of that field's value) reject the unstarted
  // template on their own.
  runFixture(
    "the shipped template's own gate (--require-done) refuses to accept an unstarted onboarding lane",
    baseline,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const completeArtifactLaneNeverMarkedDone = makeFixture("onboarding-graph-complete-artifact-lane-never-marked-done");
  {
    // Deliberately does NOT call markOnboardingDone -- lanes.onboarding.status stays at the
    // shipped default (not_started), exactly as it would in a real durable-engine run: no
    // production code path ever commits lanes.onboarding.status to "done" as a *result* of
    // ONB-22's gate passing (kernel/engine/runstate.ts's reconcilePatch()/acceptVerification() only
    // mutate run-state.json, never business-state.json). Requiring that field to already say done
    // as --require-done's own precondition was therefore a deadlock the engine could never
    // legitimately clear -- this proves the artifact's own content is sufficient on its own.
    mutateOnboarding(completeArtifactLaneNeverMarkedDone, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      return `${completed}\nThis remains the canonical execution record for the completed onboarding system.\n`;
    });
  }
  runFixture(
    "ONB-22's --require-done gate passes on a genuinely complete artifact even though lanes.onboarding.status was never externally marked done",
    completeArtifactLaneNeverMarkedDone,
    "check-onboarding-graph.ts",
    0,
    undefined,
    ["--require-done"],
  );

  // A durable-engine-managed v2 workspace has no state/business-state.json at all (its canonical
  // state is state/business-state.json, per kernel/session/run.ts's resolveWorkspacePaths()) --
  // without loadLaneFromBusinessStateV2()'s fallback in check-onboarding-graph.ts, ONB-22's own
  // --require-done gate would report the lane permanently missing on every genuinely completed
  // v2 run, since loadProjectState() alone only ever reads the v1 file. buildValidBusinessStateV2
  // produces a complete, schema-valid document (loadLaneFromBusinessStateV2 runs every v2 document
  // through validateBusinessState() and fails closed on anything less -- a fixture using a partial
  // object would test a state the real validator never actually accepts).
  const ALL_LANE_KEYS = [
    "paid_tool_routing",
    "secrets",
    "security",
    "research",
    "traceability",
    "experience",
    "product",
    "design",
    "emotional_design",
    "content_assets",
    "analytics_attribution",
    "paid_user_acquisition",
    "onboarding",
    "revenue",
    "store_console",
    "apple_signing",
    "privacy_legal",
    "email",
    "orchestration",
    "engineering",
    "growth",
    "post_launch_ops",
  ];

  function buildValidBusinessStateV2(onboardingLane: { status: string; evidence: string[]; blockers: string[] }): Record<string, unknown> {
    const lanes: Record<string, unknown> = {};
    for (const key of ALL_LANE_KEYS) {
      lanes[key] = key === "onboarding" ? onboardingLane : { status: "pending", evidence: [], blockers: [] };
    }
    return {
      schemaVersion: "2.0.0",
      updatedAt: "2026-08-09T00:00:00.000Z",
      narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
      project: {
        name: "Fixture App",
        slug: "fixture-app",
        owner: "Founder",
        phase: "phase_2_build",
        launchScope: "essentials",
        kickoffDate: "",
        platforms: ["ios"],
        bundleIds: { ios: "com.example.app", android: "" },
        publicUrls: { landing: "", privacy: "", terms: "" },
      },
      lanes,
      founderGates: { pending: [] },
    };
  }

  const v2LaneComplete = makeFixture("onboarding-graph-v2-business-state-complete");
  {
    rmSync(path.join(v2LaneComplete, "state/business-state.json"), { force: true });
    writeFileSync(
      path.join(v2LaneComplete, "state/business-state.json"),
      JSON.stringify(buildValidBusinessStateV2({ status: "succeeded", evidence: ["product/ONBOARDING.md", "product/onboarding.html"], blockers: [] })),
      "utf8",
    );
    mutateOnboarding(v2LaneComplete, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      return `${completed}\nThis remains the canonical execution record for the completed onboarding system.\n`;
    });
  }
  runFixture(
    "a current workspace reads completed lanes.onboarding from business state and satisfies --require-done",
    v2LaneComplete,
    "check-onboarding-graph.ts",
    0,
    undefined,
    ["--require-done"],
  );

  const v2LanePendingIncompleteArtifact = makeFixture("onboarding-graph-v2-business-state-pending-incomplete-artifact");
  {
    rmSync(path.join(v2LanePendingIncompleteArtifact, "state/business-state.json"), { force: true });
    writeFileSync(
      path.join(v2LanePendingIncompleteArtifact, "state/business-state.json"),
      JSON.stringify(buildValidBusinessStateV2({ status: "pending", evidence: [], blockers: [] })),
      "utf8",
    );
  }
  runFixture(
    "a v2 workspace with an unfinished onboarding lane and an unfinished artifact still fails --require-done",
    v2LanePendingIncompleteArtifact,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  // lanes.onboarding.status never legitimately becomes "succeeded" as a *result* of ONB-22's own
  // gate passing under the durable engine (kernel/engine/runstate.ts's reconcilePatch()/
  // acceptVerification() only ever mutate run-state.json, never business-state.json) -- so a
  // canonical v2 lane realistically sits at "pending" for the entire run, including at the exact
  // moment ONB-22 itself finally executes. --require-done must not deadlock on that: it validates
  // the artifact's own content, not an externally-tracked field nothing ever sets to done for it.
  const v2LanePendingCompleteArtifact = makeFixture("onboarding-graph-v2-business-state-pending-complete-artifact");
  {
    rmSync(path.join(v2LanePendingCompleteArtifact, "state/business-state.json"), { force: true });
    writeFileSync(
      path.join(v2LanePendingCompleteArtifact, "state/business-state.json"),
      JSON.stringify(buildValidBusinessStateV2({ status: "pending", evidence: [], blockers: [] })),
      "utf8",
    );
    mutateOnboarding(v2LanePendingCompleteArtifact, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      return `${completed}\nThis remains the canonical execution record for the completed onboarding system.\n`;
    });
  }
  runFixture(
    "ONB-22's --require-done gate does not deadlock on a canonical v2 lane still pending once the artifact itself is genuinely complete",
    v2LanePendingCompleteArtifact,
    "check-onboarding-graph.ts",
    0,
    undefined,
    ["--require-done"],
  );

  // check-onboarding-graph.ts must fail closed on a malformed/partial business-state.json, never
  // silently extract the one field it wants from an unvalidated document -- a corrupt canonical
  // file must not quietly authorize the destructive ONB-22 cutover.
  const v2LaneInvalid = makeFixture("onboarding-graph-v2-business-state-invalid");
  {
    rmSync(path.join(v2LaneInvalid, "state/business-state.json"), { force: true });
    writeFileSync(
      path.join(v2LaneInvalid, "state/business-state.json"),
      JSON.stringify({ schemaVersion: "2.0.0", lanes: { onboarding: { status: "succeeded", evidence: [], blockers: [] } } }),
      "utf8",
    );
  }
  runFixture(
    "a malformed business-state.json (missing required top-level fields) fails closed instead of trusting its one readable field",
    v2LaneInvalid,
    "check-onboarding-graph.ts",
    1,
    "project_state.invalid_schema",
  );

  // Pending work does not claim a finished onboarding artifact.
  const pendingOnboarding = makeFixture("onboarding-pending");
  {
    writeFileSync(
      path.join(pendingOnboarding, "state/business-state.json"),
      JSON.stringify(buildValidBusinessStateV2({ status: "pending", evidence: [], blockers: [] })),
      "utf8",
    );
  }
  runFixture("pending onboarding does not trigger completion checks against an unfinished artifact", pendingOnboarding, "check-onboarding-graph.ts", 0);

  // Provider-proof checks read the same reducer-owned state as onboarding.
  const pendingOnboardingNeedsNoProof = makeFixture("onboarding-pending-no-proof");
  {
    rmSync(path.join(pendingOnboardingNeedsNoProof, "state/business-state.json"), { force: true });
    writeFileSync(
      path.join(pendingOnboardingNeedsNoProof, "state/business-state.json"),
      JSON.stringify(buildValidBusinessStateV2({ status: "pending", evidence: [], blockers: [] })),
      "utf8",
    );
  }
  runFixture("pending onboarding accepts the current state without provider proof", pendingOnboardingNeedsNoProof, "check-live-provider-proof.ts", 0);

  const completedOnboardingNeedsProof = makeFixture("onboarding-completed-needs-proof");
  {
    writeFileSync(
      path.join(completedOnboardingNeedsProof, "state/business-state.json"),
      JSON.stringify(buildValidBusinessStateV2({ status: "succeeded", evidence: ["product/ONBOARDING.md"], blockers: [] })),
      "utf8",
    );
    rmSync(path.join(completedOnboardingNeedsProof, "operations/PROVIDER_PROOF.md"), { force: true });
  }
  runFixture("completed onboarding requires provider proof", completedOnboardingNeedsProof, "check-live-provider-proof.ts", 1, "provider_proof.file_missing");

  const doneWithUncheckedVerification = makeFixture("onboarding-graph-done-with-unchecked-verification");
  {
    markOnboardingDone(doneWithUncheckedVerification);
    // Same table- and prose-filling treatment as the passing "genuinely completed" fixture
    // above, but the Verification section's own "- [ ]" checklist is deliberately left untouched.
    mutateOnboarding(doneWithUncheckedVerification, (text) => fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
  }
  runFixture(
    "a done lane with every Verification checklist item still unchecked fails",
    doneWithUncheckedVerification,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.verification_incomplete",
    ["--require-done"],
  );

  const statusColumnSpoofed = makeFixture("onboarding-graph-status-column-spoofed");
  {
    markOnboardingDone(statusColumnSpoofed);
    mutateOnboarding(statusColumnSpoofed, (text) => {
      const filled = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // ONB-01's row now reads "done" in the Status column like every other row from the blanket
      // replace above; put it back to "partial" there while planting the literal word "done" in
      // its Result cell, proving the checker reads the Status column specifically, not any cell
      // in the row. Matched by pattern rather than a literal single-spaced string because the
      // shipped table's cells are column-aligned (padded to their widest row), not fixed-width.
      return filled.replace(
        /\|\s*`ONB-01`\s*\|\s*done\s*\|\s*Engineering and product\s*\|\s*Trace the current implementation\s*\|/,
        "| `ONB-01` | partial | Engineering and product | done, this work is done |",
      );
    });
  }
  runFixture(
    "a Graph Run row's non-status cell mentioning done does not substitute for its Status column",
    statusColumnSpoofed,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.node_not_done",
    ["--require-done"],
  );

  const duplicateGraphRunRow = makeFixture("onboarding-graph-duplicate-row");
  {
    markOnboardingDone(duplicateGraphRunRow);
    mutateOnboarding(duplicateGraphRunRow, (text) => {
      const filled = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // A resumed or merged run can retain a stale row for a node alongside a freshly appended
      // one instead of updating it in place -- duplicate ONB-01's row with a conflicting status
      // to prove the checker rejects this instead of accepting the node because some row says done.
      // Matched by pattern rather than a literal single-spaced string because the shipped table's
      // cells are column-aligned (padded to their widest row), not fixed-width.
      return filled.replace(
        /\|\s*`ONB-01`\s*\|\s*done\s*\|\s*Engineering and product\s*\|\s*Trace the current implementation\s*\|/,
        "| `ONB-01` | partial | Engineering and product | Trace the current implementation |\n| `ONB-01` | done | Engineering and product | Trace the current implementation |",
      );
    });
  }
  runFixture(
    "duplicate Graph Run rows for one node fail even when one of them says done",
    duplicateGraphRunRow,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.node_duplicate_row",
    ["--require-done"],
  );

  const fencedFakeGraphRunTable = makeFixture("onboarding-graph-fenced-fake-table");
  {
    markOnboardingDone(fencedFakeGraphRunTable);
    mutateOnboarding(fencedFakeGraphRunTable, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      const graphRunSection = completed.match(/## Graph Run\n[\s\S]*?(?=\n## )/)?.[0];
      if (!graphRunSection) throw new Error("fixture setup: could not locate the Graph Run section to relocate");
      // Remove the live "## Graph Run" heading and table entirely and relocate the exact same
      // (all-done) content into a fenced code sample instead -- it is now the ONLY "## Graph Run"
      // heading anywhere in the document. sectionBody()'s own line search finds whichever "##
      // Graph Run" line comes first with no regard for fences, so before this fix this fenced
      // sample would have been picked up as the canonical run record and accepted every node as
      // done; after the fix, graphRunNodeStatus() reads only the fence-stripped live text, finds
      // no live Graph Run table at all, and correctly reports every node as not recorded.
      const withoutLiveTable = completed.replace(graphRunSection, "");
      return `${withoutLiveTable}\n\`\`\`markdown\n${graphRunSection}\n\`\`\`\n`;
    });
  }
  runFixture(
    "a fenced fake Graph Run table cannot substitute for the removed live one",
    fencedFakeGraphRunTable,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.node_not_done",
    ["--require-done"],
  );

  const verificationChecklistDeleted = makeFixture("onboarding-graph-verification-checklist-deleted");
  {
    markOnboardingDone(verificationChecklistDeleted);
    mutateOnboarding(verificationChecklistDeleted, (text) => {
      const completed = fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done")));
      // Delete every Verification checklist item outright (not just leave it unchecked) --
      // countUncheckedItems() alone reads 0 just as happily on an emptied section as on a
      // genuinely completed one, so this must be caught by a minimum-item-count check instead.
      return completed.replace(/## Verification[\s\S]*$/, "## Verification\n");
    });
  }
  runFixture(
    "deleting the Verification checklist outright still fails even though nothing is left unchecked",
    verificationChecklistDeleted,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.verification_items_missing",
    ["--require-done"],
  );

  const verificationChecklistDeletedAndDuplicated = makeFixture("onboarding-graph-verification-checklist-deleted-and-duplicated");
  {
    markOnboardingDone(verificationChecklistDeletedAndDuplicated);
    mutateOnboarding(verificationChecklistDeletedAndDuplicated, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // Delete the first canonical assertion and duplicate the second one in its place --
      // verificationItemCount still reaches 11 and countUncheckedItems() still reads 0, so a
      // count-only check would accept this even though a required assertion is now genuinely
      // missing, replaced by a copy of an unrelated one.
      return completed.replace(
        "- [x] `ONB-00` through `ONB-22` are done, or the lane is not claimed done\n- [x] Evidence, reviews, authorized Onbo Hub, internal guidance, provider, policy, seven-principle, and motion research are joined\n",
        "- [x] Evidence, reviews, authorized Onbo Hub, internal guidance, provider, policy, seven-principle, and motion research are joined\n- [x] Evidence, reviews, authorized Onbo Hub, internal guidance, provider, policy, seven-principle, and motion research are joined\n",
      );
    });
  }
  runFixture(
    "deleting one canonical assertion and duplicating another still fails even though the count and unchecked total both look correct",
    verificationChecklistDeletedAndDuplicated,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.verification_assertion_missing",
    ["--require-done"],
  );

  // Regression (round 23): the round-22 fix above still matched a fingerprint against the whole
  // section's raw text, so it passed as long as the deleted item's distinguishing text existed
  // ANYWHERE in the section -- including as ordinary prose that was never actually a checked
  // checklist line. Deleting the first item's checked line, leaving its exact text behind as a
  // floating (non-list) sentence, and duplicating the second item's checked line to keep the
  // total count at 11 used to satisfy every existing check: the item count, the unchecked count,
  // and a substring-anywhere fingerprint search all stayed green.
  const verificationFingerprintNotActuallyChecked = makeFixture("onboarding-graph-verification-fingerprint-not-actually-checked");
  {
    markOnboardingDone(verificationFingerprintNotActuallyChecked);
    mutateOnboarding(verificationFingerprintNotActuallyChecked, (text) => {
      const completed = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      return completed.replace(
        "- [x] `ONB-00` through `ONB-22` are done, or the lane is not claimed done\n- [x] Evidence, reviews, authorized Onbo Hub, internal guidance, provider, policy, seven-principle, and motion research are joined\n",
        "Historical note: `ONB-00` through `ONB-22` are done, or the lane is not claimed done -- see the retired checklist archive for detail.\n- [x] Evidence, reviews, authorized Onbo Hub, internal guidance, provider, policy, seven-principle, and motion research are joined\n- [x] Evidence, reviews, authorized Onbo Hub, internal guidance, provider, policy, seven-principle, and motion research are joined\n",
      );
    });
  }
  runFixture(
    "a deleted assertion's text surviving only as floating prose still fails, not just a fully-vanished assertion",
    verificationFingerprintNotActuallyChecked,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.verification_assertion_missing",
    ["--require-done"],
  );

  const doneWithLegitimateAnswerWords = makeFixture("onboarding-graph-done-with-legitimate-answer-words");
  {
    markOnboardingDone(doneWithLegitimateAnswerWords);
    mutateOnboarding(doneWithLegitimateAnswerWords, (text) => {
      const filled = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // The template itself prescribes these as the terminal answer format ("Yes or no" / "Pass
      // or gaps"); a real completed launch collapses them to the single chosen word.
      return filled.replaceAll("Yes or no", "Yes").replaceAll("Pass or gaps", "Pass");
    });
  }
  runFixture(
    "completed onboarding may answer Required/QA cells with the template's own prescribed Yes/Pass terminal words",
    doneWithLegitimateAnswerWords,
    "check-onboarding-graph.ts",
    0,
    undefined,
    ["--require-done"],
  );

  const doneWithUnfilledProseDirective = makeFixture("onboarding-graph-done-with-unfilled-prose-directive");
  {
    markOnboardingDone(doneWithUnfilledProseDirective);
    // Table cells, checklist, and status header are all completed, but the Execution Mode
    // section's own directive-verb-led paragraph ("Record `greenfield`, ...") is left exactly
    // as the shipped template wrote it -- table-only placeholder detection would miss this.
    mutateOnboarding(doneWithUnfilledProseDirective, (text) => checkVerificationItems(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
  }
  runFixture(
    "a done lane with an unfilled prose directive (Execution Mode, evidence trace, ...) fails",
    doneWithUnfilledProseDirective,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const staleStatusHeader = makeFixture("onboarding-graph-stale-status-header");
  {
    markOnboardingDone(staleStatusHeader);
    mutateOnboarding(staleStatusHeader, (text) => {
      const filled = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // Every node, checklist item, and table cell now says done; put only the artifact's own
      // top-of-document "Status: `done`" header back to "partial" to prove it is independently
      // required to agree, not just inferred from everything else being done.
      return filled.replace("Status: `done`", "Status: `partial`");
    });
  }
  runFixture(
    "a done lane whose artifact Status header still says partial fails",
    staleStatusHeader,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.artifact_status_not_done",
    ["--require-done"],
  );

  const deferredRequireDone = makeFixture("onboarding-graph-deferred-require-done");
  {
    const state = readState(deferredRequireDone);
    const lane = getLane(state, "onboarding");
    lane["status"] = "deferred";
    lane["blockers"] = ["2026-08-08 founder deferred onboarding until the product hypothesis is validated"];
    writeState(deferredRequireDone, state);
  }
  runFixture("the general onboarding-graph check still honors an explicit deferral", deferredRequireDone, "check-onboarding-graph.ts", 0);
  // --require-done's skip variable is deliberately `laneExempt && hasDeferralReason && !requireDone`
  // -- the deferral exemption belongs to the general (lenient) invocation only. Under
  // --require-done, ONB-22's own gate still runs the full content checks against this fixture's
  // deliberately untouched (still unstarted) artifact regardless of the deferred status, and fails
  // on the same placeholder content the baseline unstarted-template fixture does.
  runFixture(
    "a deferred onboarding lane still fails ONB-22's own --require-done gate",
    deferredRequireDone,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const deferredWithoutReason = makeFixture("onboarding-graph-deferred-without-reason");
  {
    const state = readState(deferredWithoutReason);
    const lane = getLane(state, "onboarding");
    lane["status"] = "deferred";
    // Deliberately no blockers or reason recorded -- evidence alone (already present from
    // markOnboardingDone-adjacent shipped state) is not an explanation of why the lane stopped.
    writeState(deferredWithoutReason, state);
  }
  runFixture(
    "a deferred lane with no recorded blockers or reason fails even the general check",
    deferredWithoutReason,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.deferred_without_reason",
  );

  const doneWithCounterBoilerplate = makeFixture("onboarding-graph-done-with-counter-boilerplate");
  {
    markOnboardingDone(doneWithCounterBoilerplate);
    // Every directive cell gets the exact same boilerplate sentence with only an incrementing
    // number varying -- technically unique per cellTextCounts, but not real content.
    let counter = 0;
    mutateOnboarding(doneWithCounterBoilerplate, (text) =>
      checkVerificationItems(
        fillProseDirectiveLines(
          text
            .replaceAll("not_started", "done")
            .split("\n")
            .map((line) => {
              if (!line.trim().startsWith("|")) return line;
              return line
                .split("|")
                .map((cell) => {
                  if (!TEMPLATE_DIRECTIVE_VERBS_PATTERN.test(cell)) return cell;
                  counter += 1;
                  return ` Evidence-${counter}: source-backed implementation detail dated 2026-08-08 `;
                })
                .join("|");
            })
            .join("\n"),
        ),
      ),
    );
  }
  runFixture(
    "a done lane whose table cells are all the same counter-varying boilerplate fails",
    doneWithCounterBoilerplate,
    "check-onboarding-graph.ts",
    1,
    "onboarding_graph.placeholder_complete",
    ["--require-done"],
  );

  const doneWithFixedDoctrineProse = makeFixture("onboarding-graph-done-with-fixed-doctrine-prose");
  {
    markOnboardingDone(doneWithFixedDoctrineProse);
    mutateOnboarding(doneWithFixedDoctrineProse, (text) => {
      const filled = checkVerificationItems(fillProseDirectiveLines(fillTemplateDirectiveCells(text.replaceAll("not_started", "done"))));
      // fillProseDirectiveLines swaps every directive-verb-led line's leading word, including
      // two sentences that sit directly above their own capture table (Analytics Contract's
      // "Define a machine-readable schema..." and First Value And Activation's "Define First
      // value rendered..."). Put those two back to literally "Define ..." -- exactly as shipped
      // -- while every genuine fill-in line stays filled, proving the validator's own
      // has-table-in-section exemption rather than a swapped-verb version of the same text.
      return filled
        .replace(
          "Confirmed First value rendered, First value engaged, Activation, habit signal, retention, monetization, review eligibility, and onboarding completion separately.",
          "Define First value rendered, First value engaged, Activation, habit signal, retention, monetization, review eligibility, and onboarding completion separately.",
        )
        .replace("Confirmed a machine-readable schema and typed clients.", "Define a machine-readable schema and typed clients.");
    });
  }
  runFixture(
    "fixed doctrine prose above a capture table passes even though it starts with a directive verb",
    doneWithFixedDoctrineProse,
    "check-onboarding-graph.ts",
    0,
    undefined,
    ["--require-done"],
  );

  // check-onboarding-evidence-packet.ts: ONB-03..ONB-08's own per-node deterministic gate
  // (round 5's production-verification fix). It reads --root and --path exactly the way
  // runDeterministicGates() invokes it.
  const evidenceScript = "check-onboarding-evidence-packet.ts";
  const writeEvidencePacket = (fixtureRoot: string, relativePath: string, content: string): void => {
    const filePath = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  };
  const substantiveResearchProse = (topic: string): string => {
    const sentence = `This is a substantive, source-backed paragraph describing real research into ${topic}. `;
    return `## Findings\n\nFinding: ${sentence.trim()}\n\nSource: fixture observation 2026-09-09.\nClassification: observation.\nDecision: retain the current plan for ${topic}.\nUncertainty: synthetic fixture evidence.\n\n${sentence.repeat(8)}\n`;
  };
  const conciseStructuredPacket = `## Findings

Finding: Competitor reviews name the three-step quiz as the drop-off.
Source: App Store review sample 2026-09-01 (n=40).
Classification: observation.
Decision: ONB-09 adopt a shorter quiz.
Uncertainty: sample is US-only.
`;

  const onb00PacketMissing = makeFixture("onboarding-evidence-onb00-missing");
  runFixture(
    "ONB-00's gate fails when the resume/scope packet does not exist yet",
    onb00PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-00", "--path", "product/onboarding/graph/ONB-00-resume-scope.md"],
  );

  const onb00PacketComplete = makeFixture("onboarding-evidence-onb00-complete");
  writeEvidencePacket(
    onb00PacketComplete,
    "product/onboarding/graph/ONB-00-resume-scope.md",
    substantiveResearchProse("whether this run is greenfield, replacement, audit-only, or a bounded incremental scope"),
  );
  runFixture("ONB-00's gate passes a genuinely substantive, marker-free resume/scope packet", onb00PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-00",
    "--path",
    "product/onboarding/graph/ONB-00-resume-scope.md",
  ]);

  const onb01PacketMissing = makeFixture("onboarding-evidence-onb01-missing");
  runFixture(
    "ONB-01's gate fails when the current-state trace does not exist yet",
    onb01PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-01", "--path", "product/onboarding/graph/ONB-01-current-state-trace.md"],
  );

  const onb01PacketComplete = makeFixture("onboarding-evidence-onb01-complete");
  writeEvidencePacket(
    onb01PacketComplete,
    "product/onboarding/graph/ONB-01-current-state-trace.md",
    substantiveResearchProse("the actual onboarding implementation, documents, routes, state, providers, events, failures, tests, and replaced surfaces"),
  );
  runFixture("ONB-01's gate passes a genuinely substantive, marker-free current-state trace", onb01PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-01",
    "--path",
    "product/onboarding/graph/ONB-01-current-state-trace.md",
  ]);

  const onb02PacketMissing = makeFixture("onboarding-evidence-onb02-missing");
  runFixture("ONB-02's gate fails when the evidence plan does not exist yet", onb02PacketMissing, evidenceScript, 1, "onboarding_evidence.packet_missing", [
    "--node",
    "ONB-02",
    "--path",
    "product/onboarding/graph/ONB-02-evidence-plan.md",
  ]);

  const onb02PacketComplete = makeFixture("onboarding-evidence-onb02-complete");
  writeEvidencePacket(
    onb02PacketComplete,
    "product/onboarding/graph/ONB-02-evidence-plan.md",
    substantiveResearchProse("the onboarding evidence hierarchy, access constraints, sample plan, and freshness cutoff"),
  );
  runFixture("ONB-02's gate passes a genuinely substantive, marker-free evidence plan", onb02PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-02",
    "--path",
    "product/onboarding/graph/ONB-02-evidence-plan.md",
  ]);

  const evidencePacketMissing = makeFixture("onboarding-evidence-packet-missing");
  runFixture(
    "ONB-03's gate fails when its evidence packet does not exist yet",
    evidencePacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-03", "--path", "product/onboarding/graph/ONB-03-current-guidance.md"],
  );

  const evidencePacketThin = makeFixture("onboarding-evidence-packet-thin");
  writeEvidencePacket(evidencePacketThin, "product/onboarding/graph/ONB-04-competitor-reviews.md", "## Findings\n\nDone.\n");
  runFixture(
    "ONB-04's gate rejects a stub evidence packet that lacks a source and classification",
    evidencePacketThin,
    evidenceScript,
    1,
    "onboarding_evidence.packet_record_incomplete",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketConcise = makeFixture("onboarding-evidence-packet-concise");
  writeEvidencePacket(evidencePacketConcise, "product/onboarding/graph/ONB-04-competitor-reviews.md", conciseStructuredPacket);
  runFixture("ONB-04's gate passes a concise structured record under the old length proxy", evidencePacketConcise, evidenceScript, 0, undefined, [
    "--node",
    "ONB-04",
    "--path",
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
  ]);

  const evidencePacketHtmlCommentOnly = makeFixture("onboarding-evidence-packet-html-comment-only");
  writeEvidencePacket(
    evidencePacketHtmlCommentOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    `<!--\n${substantiveResearchProse("a competitor review that was never actually written, only faked inside this comment")}\n-->\n`,
  );
  runFixture(
    "an evidence packet whose only content is inside an HTML comment still fails as thin",
    evidencePacketHtmlCommentOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketTildeFenceOnly = makeFixture("onboarding-evidence-packet-tilde-fence-only");
  writeEvidencePacket(
    evidencePacketTildeFenceOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    `~~~markdown\n${substantiveResearchProse("a competitor review that was never actually written, only faked inside this tilde fence")}\n~~~\n`,
  );
  runFixture(
    "an evidence packet whose only content is inside a tilde fence still fails as thin",
    evidencePacketTildeFenceOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketUnterminatedFenceOnly = makeFixture("onboarding-evidence-packet-unterminated-fence-only");
  writeEvidencePacket(
    evidencePacketUnterminatedFenceOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    // The opening fence is never closed. CommonMark still renders everything after it as code,
    // not prose, to the end of the document -- but the old paired-delimiter regex only stripped
    // a fence when it found a matching close, so with none present here it stripped nothing and
    // this faked content still cleared the 400-character substantive-length check.
    `\`\`\`markdown\n${substantiveResearchProse("a competitor review that was never actually written, only faked inside this unterminated fence")}\n`,
  );
  runFixture(
    "an evidence packet whose only content is inside an unterminated fence still fails as thin",
    evidencePacketUnterminatedFenceOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketShortInnerFenceOnly = makeFixture("onboarding-evidence-packet-short-inner-fence-only");
  writeEvidencePacket(
    evidencePacketShortInnerFenceOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    // Four-backtick opener, a three-backtick decoy line, the faked content, then a real
    // four-backtick closer. CommonMark requires a closer at least as long as the opener, so the
    // decoy never closes the block -- the faked content stays hidden inside the fence the entire
    // way to the real closer. A strip that accepted any run of 3+ backticks as a valid closer
    // would stop at the decoy and let everything after it, including the real closer line, count
    // as live substantive text.
    `\`\`\`\`markdown\nA decoy line that looks like a fence close but is too short to be one.\n\`\`\`\n${substantiveResearchProse(
      "a competitor review that was never actually written, only faked past a too-short inner fence run",
    )}\n\`\`\`\`\n`,
  );
  runFixture(
    "an evidence packet whose only content sits past a shorter inner fence run still fails as thin",
    evidencePacketShortInnerFenceOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketIndentedContentOnly = makeFixture("onboarding-evidence-packet-indented-content-only");
  writeEvidencePacket(
    evidencePacketIndentedContentOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    // Every line indented 4 spaces at the very start of the document is a CommonMark indented
    // code block (the document start counts the same as a preceding blank line for the "cannot
    // interrupt a paragraph" rule) -- a rendered page shows this whole packet as inert code text,
    // not as a real finding. Without stripping indented code blocks the same way fenced and
    // commented-out blocks are stripped, a packet that never actually renders as prose still
    // cleared the substantive-length check.
    substantiveResearchProse("a competitor review that was never actually written, only indented into a CommonMark code block")
      .split("\n")
      .map((line) => (line.length > 0 ? `    ${line}` : line))
      .join("\n"),
  );
  runFixture(
    "an evidence packet whose only content is indented into a CommonMark code block still fails as thin",
    evidencePacketIndentedContentOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketStyleBlockOnly = makeFixture("onboarding-evidence-packet-style-block-only");
  writeEvidencePacket(
    evidencePacketStyleBlockOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    // A browser never renders <style> content as visible page text, the same non-rendering
    // reasoning already applied to HTML comments and fences -- but stripNonRenderedMarkdown() had
    // no notion of raw HTML blocks at all, so this faked content still cleared the 400-character
    // substantive-length check before this fix.
    `<style type="text/plain">\n${substantiveResearchProse(
      "a competitor review that was never actually written, only faked inside this style block",
    )}\n</style>\n`,
  );
  runFixture(
    "an evidence packet whose only content is inside a style block still fails as thin",
    evidencePacketStyleBlockOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketTabIndentedContentOnly = makeFixture("onboarding-evidence-packet-tab-indented-content-only");
  writeEvidencePacket(
    evidencePacketTabIndentedContentOnly,
    "product/onboarding/graph/ONB-04-competitor-reviews.md",
    // A single leading tab expands to CommonMark's own 4-column tab stop, the same indentation
    // threshold as four literal spaces -- a check that only recognized literal space characters
    // would miss this and let the faked content clear the substantive-length check.
    substantiveResearchProse("a competitor review that was never actually written, only tab-indented into a CommonMark code block")
      .split("\n")
      .map((line) => (line.length > 0 ? `\t${line}` : line))
      .join("\n"),
  );
  runFixture(
    "an evidence packet whose only content is tab-indented into a CommonMark code block still fails as thin",
    evidencePacketTabIndentedContentOnly,
    evidenceScript,
    1,
    "onboarding_evidence.packet_too_thin",
    ["--node", "ONB-04", "--path", "product/onboarding/graph/ONB-04-competitor-reviews.md"],
  );

  const evidencePacketTodoInInlineCodeSpan = makeFixture("onboarding-evidence-packet-todo-in-inline-code-span");
  writeEvidencePacket(
    evidencePacketTodoInInlineCodeSpan,
    "product/onboarding/graph/ONB-05-onbo-hub-atlas.md",
    // The TODO sits inside a mid-sentence triple-backtick code span, not alone on its own line --
    // a real render shows it in the open, as inline code. A position-blind fence stripper that
    // matches any run of 3+ backticks, wherever it appears, would erase the span and the word
    // along with it, letting a packet that visibly still says TODO pass the placeholder scan.
    `${substantiveResearchProse("the authorized Onbo Hub flow atlas")}\n\nThis draft still shows \`\`\`TODO\`\`\` inline where the real citation belongs.\n`,
  );
  runFixture(
    "ONB-05's gate rejects a TODO marker hidden inside an inline triple-backtick code span",
    evidencePacketTodoInInlineCodeSpan,
    evidenceScript,
    1,
    "onboarding_evidence.packet_placeholder",
    ["--node", "ONB-05", "--path", "product/onboarding/graph/ONB-05-onbo-hub-atlas.md"],
  );

  const evidencePacketTodoAfterInlineHtmlTagMention = makeFixture("onboarding-evidence-packet-todo-after-inline-html-tag-mention");
  writeEvidencePacket(
    evidencePacketTodoAfterInlineHtmlTagMention,
    "product/onboarding/graph/ONB-05-onbo-hub-atlas.md",
    // The tag mention sits inside an inline code span mid-sentence, not alone at the start of its
    // own line -- never a real HTML block opener. A position-blind stripper that matches the tag
    // name anywhere in the raw text would still read this as an unterminated opener and, finding
    // no closing tag anywhere after it, erase everything through end of document -- including the
    // real TODO line below -- letting a packet that visibly still says TODO pass the placeholder
    // scan.
    `${substantiveResearchProse(
      "the authorized Onbo Hub flow atlas",
    )}\n\nThis draft still mentions \`<style>\` inline as a worked example of a tag name, not a real block.\nTODO: fill in the rest once access is granted.\n`,
  );
  runFixture(
    "ONB-05's gate rejects a TODO marker that follows an inline mid-sentence HTML tag mention",
    evidencePacketTodoAfterInlineHtmlTagMention,
    evidenceScript,
    1,
    "onboarding_evidence.packet_placeholder",
    ["--node", "ONB-05", "--path", "product/onboarding/graph/ONB-05-onbo-hub-atlas.md"],
  );

  const evidencePacketPlaceholder = makeFixture("onboarding-evidence-packet-placeholder");
  writeEvidencePacket(
    evidencePacketPlaceholder,
    "product/onboarding/graph/ONB-05-onbo-hub-atlas.md",
    `${substantiveResearchProse("the authorized Onbo Hub flow atlas")}\n\nTODO: fill in the rest once access is granted.\n`,
  );
  runFixture(
    "ONB-05's gate rejects a packet that still carries a TODO/TBD/PLACEHOLDER marker",
    evidencePacketPlaceholder,
    evidenceScript,
    1,
    "onboarding_evidence.packet_placeholder",
    ["--node", "ONB-05", "--path", "product/onboarding/graph/ONB-05-onbo-hub-atlas.md"],
  );

  const evidencePacketNoProse = makeFixture("onboarding-evidence-packet-no-prose");
  writeEvidencePacket(
    evidencePacketNoProse,
    "product/onboarding/graph/ONB-06-internal-guidance-audit.md",
    `## Findings\n\n| Rule | Status |\n| --- | --- |\n${"| internal-guidance-rule | resolved |\n".repeat(20)}`,
  );
  runFixture(
    "ONB-06's gate rejects a packet with a long table but no finding, source, or classification",
    evidencePacketNoProse,
    evidenceScript,
    1,
    "onboarding_evidence.packet_record_incomplete",
    ["--node", "ONB-06", "--path", "product/onboarding/graph/ONB-06-internal-guidance-audit.md"],
  );

  const evidencePacketMissingPathFlag = makeFixture("onboarding-evidence-packet-missing-path-flag");
  runFixture(
    "the evidence-packet gate refuses to run without --path",
    evidencePacketMissingPathFlag,
    evidenceScript,
    1,
    "onboarding_evidence.missing_path_flag",
    ["--node", "ONB-07"],
  );

  const evidencePacketComplete = makeFixture("onboarding-evidence-packet-complete");
  writeEvidencePacket(
    evidencePacketComplete,
    "product/onboarding/graph/ONB-08-motion-research.md",
    substantiveResearchProse("60fps motion references translated into the target framework"),
  );
  runFixture("ONB-08's gate passes a genuinely substantive, marker-free evidence packet", evidencePacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-08",
    "--path",
    "product/onboarding/graph/ONB-08-motion-research.md",
  ]);

  const onb08PacketArgs = ["--node", "ONB-08", "--path", "product/onboarding/graph/ONB-08-motion-research.md"] as const;
  const onb08MotionRegister = `${substantiveResearchProse("applicable motion research translated into the target framework")}

Motion Research uses the 60fps MCP with search_shots and get_motion_breakdown. Reference shot ID shot-fixture-001. Interruption behavior yields to the next gesture. Reduced-motion shows the complete final state without the choreography.
`;
  const onb08NotApplicableProse = `${substantiveResearchProse("applicable motion research translated into the target framework")}

The 60fps motion register is not applicable for this product.
`;

  const onb08PacketStatic = makeFixture("onboarding-evidence-onb08-static-document");
  writeStudioSurfaces(onb08PacketStatic, [{ id: "privacy", interaction: "static-document" }]);
  writeEvidencePacket(
    onb08PacketStatic,
    "product/onboarding/graph/ONB-08-motion-research.md",
    substantiveResearchProse("static legal-page motion research with no invented shot IDs"),
  );
  runFixture("ONB-08's gate passes a static-document surface without 60fps shot IDs", onb08PacketStatic, evidenceScript, 0, undefined, [...onb08PacketArgs]);

  const onb08PacketSelectedMissing = makeFixture("onboarding-evidence-onb08-selected-missing");
  writeStudioSurfaces(onb08PacketSelectedMissing, [], [{ id: "hero", interaction: "bespoke-motion" }]);
  writeSixtyFpsToolRow(onb08PacketSelectedMissing, "connected", "search_shots route");
  writeEvidencePacket(
    onb08PacketSelectedMissing,
    "product/onboarding/graph/ONB-08-motion-research.md",
    substantiveResearchProse("bespoke motion without recording any reference shot"),
  );
  runFixture(
    "ONB-08's gate fails when selected 60fps research omits shot IDs",
    onb08PacketSelectedMissing,
    evidenceScript,
    1,
    "onboarding_evidence.onb08_motion_register",
    [...onb08PacketArgs],
  );

  const onb08PacketSelectedComplete = makeFixture("onboarding-evidence-onb08-selected-complete");
  writeStudioSurfaces(onb08PacketSelectedComplete, [], [{ id: "hero", interaction: "bespoke-motion" }]);
  writeSixtyFpsToolRow(onb08PacketSelectedComplete, "connected", "search_shots route");
  writeEvidencePacket(onb08PacketSelectedComplete, "product/onboarding/graph/ONB-08-motion-research.md", onb08MotionRegister);
  runFixture("ONB-08's gate passes selected 60fps research with shot IDs", onb08PacketSelectedComplete, evidenceScript, 0, undefined, [...onb08PacketArgs]);

  const onb08PacketNotApplicableOverride = makeFixture("onboarding-evidence-onb08-not-applicable-override");
  writeStudioSurfaces(onb08PacketNotApplicableOverride, [], [{ id: "hero", interaction: "bespoke-motion" }]);
  writeSixtyFpsToolRow(onb08PacketNotApplicableOverride, "connected", "search_shots route");
  writeEvidencePacket(onb08PacketNotApplicableOverride, "product/onboarding/graph/ONB-08-motion-research.md", onb08NotApplicableProse);
  runFixture(
    "ONB-08's gate fails when packet prose claims selected 60fps research is not applicable",
    onb08PacketNotApplicableOverride,
    evidenceScript,
    1,
    "onboarding_evidence.onb08_motion_register",
    [...onb08PacketArgs],
  );

  const onb08PacketUnavailable = makeFixture("onboarding-evidence-onb08-unavailable");
  writeStudioSurfaces(onb08PacketUnavailable, [], [{ id: "hero", interaction: "bespoke-motion" }]);
  writeSixtyFpsToolRow(onb08PacketUnavailable, "blocked", "fallback distilled recipes");
  writeEvidencePacket(onb08PacketUnavailable, "product/onboarding/graph/ONB-08-motion-research.md", onb08MotionRegister);
  runFixture(
    "ONB-08's gate does not accept shot IDs when the 60fps MCP is blocked",
    onb08PacketUnavailable,
    evidenceScript,
    1,
    "onboarding_evidence.onb08_motion_reference_unavailable",
    [...onb08PacketArgs],
  );

  const onb08PacketUnresolved = makeFixture("onboarding-evidence-onb08-unresolved");
  writeStudioSurfaces(onb08PacketUnresolved, [{ id: "privacy" }]);
  writeEvidencePacket(onb08PacketUnresolved, "product/onboarding/graph/ONB-08-motion-research.md", onb08MotionRegister);
  runFixture(
    "ONB-08's gate holds when a listed studio surface omits interaction",
    onb08PacketUnresolved,
    evidenceScript,
    1,
    "onboarding_evidence.onb08_surface_interaction_unresolved",
    [...onb08PacketArgs],
  );

  const onb08PacketImplemented = makeFixture("onboarding-evidence-onb08-implemented-hooks");
  writeStudioSurfaces(onb08PacketImplemented, [{ id: "home", interaction: "conversion" }]);
  writeSixtyFpsToolRow(onb08PacketImplemented, "connected", "search_shots route");
  mkdirSync(path.join(onb08PacketImplemented, "growth/landing"), { recursive: true });
  writeFileSync(path.join(onb08PacketImplemented, "growth/landing/index.html"), "<main><h1>Landing</h1></main>\n", "utf8");
  writeFileSync(
    path.join(onb08PacketImplemented, "growth/landing/Story.tsx"),
    'export function Story() { return <section data-scrolly-step="need">Need</section>; }\n',
    "utf8",
  );
  writeEvidencePacket(
    onb08PacketImplemented,
    "product/onboarding/graph/ONB-08-motion-research.md",
    substantiveResearchProse("conversion landing that already implements scroll-linked hooks without recording shot IDs"),
  );
  runFixture(
    "ONB-08's gate fails when implemented scroll-linked hooks omit the 60fps register",
    onb08PacketImplemented,
    evidenceScript,
    1,
    "onboarding_evidence.onb08_motion_register",
    [...onb08PacketArgs],
  );

  const onb20PacketMissing = makeFixture("onboarding-evidence-onb20-missing");
  runFixture(
    "ONB-20's gate fails when the adversarial-QA packet does not exist yet",
    onb20PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-20", "--path", "product/onboarding/graph/ONB-20-adversarial-qa.md"],
  );

  const onb20PacketComplete = makeFixture("onboarding-evidence-onb20-complete");
  writeEvidencePacket(
    onb20PacketComplete,
    "product/onboarding/graph/ONB-20-adversarial-qa.md",
    substantiveResearchProse("the synthetic one-star pre-mortem, policy review, instrumentation QA, and accessibility review"),
  );
  runFixture("ONB-20's gate passes a genuinely substantive, marker-free adversarial-QA packet", onb20PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-20",
    "--path",
    "product/onboarding/graph/ONB-20-adversarial-qa.md",
  ]);

  const onb21PacketMissing = makeFixture("onboarding-evidence-onb21-missing");
  runFixture(
    "ONB-21's gate fails when the Compound Engineering plan does not exist yet",
    onb21PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-21", "--path", "product/onboarding/graph/ONB-21-compound-engineering-plan.md"],
  );

  const onb21PacketComplete = makeFixture("onboarding-evidence-onb21-complete");
  writeEvidencePacket(
    onb21PacketComplete,
    "product/onboarding/graph/ONB-21-compound-engineering-plan.md",
    substantiveResearchProse("the implementation-ready Compound Engineering plan translated from the accepted onboarding graph"),
  );
  runFixture("ONB-21's gate passes a genuinely substantive, marker-free implementation plan", onb21PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-21",
    "--path",
    "product/onboarding/graph/ONB-21-compound-engineering-plan.md",
  ]);

  const onb09PacketMissing = makeFixture("onboarding-evidence-onb09-missing");
  runFixture("ONB-09's gate fails when the evidence join does not exist yet", onb09PacketMissing, evidenceScript, 1, "onboarding_evidence.packet_missing", [
    "--node",
    "ONB-09",
    "--path",
    "product/onboarding/graph/ONB-09-evidence-join.md",
  ]);

  const onb09PacketComplete = makeFixture("onboarding-evidence-onb09-complete");
  writeEvidencePacket(
    onb09PacketComplete,
    "product/onboarding/graph/ONB-09-evidence-join.md",
    substantiveResearchProse("the joined guidance, reviews, flow evidence, internal doctrine, provider facts, policy, and motion research decisions"),
  );
  runFixture("ONB-09's gate passes a genuinely substantive, marker-free evidence join", onb09PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-09",
    "--path",
    "product/onboarding/graph/ONB-09-evidence-join.md",
  ]);

  const onb10PacketMissing = makeFixture("onboarding-evidence-onb10-missing");
  runFixture(
    "ONB-10's gate fails when the first-value and activation packet does not exist yet",
    onb10PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-10", "--path", "product/onboarding/graph/ONB-10-first-value-activation.md"],
  );

  const onb10PacketComplete = makeFixture("onboarding-evidence-onb10-complete");
  writeEvidencePacket(
    onb10PacketComplete,
    "product/onboarding/graph/ONB-10-first-value-activation.md",
    substantiveResearchProse("first value rendered, first value engaged, activation, habit, and retention hypotheses"),
  );
  runFixture("ONB-10's gate passes a genuinely substantive, marker-free first-value and activation packet", onb10PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-10",
    "--path",
    "product/onboarding/graph/ONB-10-first-value-activation.md",
  ]);

  const onb11PacketMissing = makeFixture("onboarding-evidence-onb11-missing");
  runFixture(
    "ONB-11's gate fails when the effort and question audit does not exist yet",
    onb11PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-11", "--path", "product/onboarding/graph/ONB-11-effort-question-audit.md"],
  );

  const onb11PacketComplete = makeFixture("onboarding-evidence-onb11-complete");
  writeEvidencePacket(
    onb11PacketComplete,
    "product/onboarding/graph/ONB-11-effort-question-audit.md",
    substantiveResearchProse("effort before value, question usefulness, permissions, interruption budget, and visible personalization proof"),
  );
  runFixture("ONB-11's gate passes a genuinely substantive, marker-free effort and question audit", onb11PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-11",
    "--path",
    "product/onboarding/graph/ONB-11-effort-question-audit.md",
  ]);

  const onb12PacketMissing = makeFixture("onboarding-evidence-onb12-missing");
  runFixture(
    "ONB-12's gate fails when the state and identity contract does not exist yet",
    onb12PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-12", "--path", "product/onboarding/graph/ONB-12-state-identity-contract.md"],
  );

  const onb12PacketComplete = makeFixture("onboarding-evidence-onb12-complete");
  writeEvidencePacket(
    onb12PacketComplete,
    "product/onboarding/graph/ONB-12-state-identity-contract.md",
    substantiveResearchProse("the canonical journey, profile, identity, entitlement, continuity, and cross-surface state transitions"),
  );
  runFixture("ONB-12's gate passes a genuinely substantive, marker-free state and identity contract", onb12PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-12",
    "--path",
    "product/onboarding/graph/ONB-12-state-identity-contract.md",
  ]);

  const onb13PacketMissing = makeFixture("onboarding-evidence-onb13-missing");
  runFixture(
    "ONB-13's gate fails when the analytics and experiments packet does not exist yet",
    onb13PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-13", "--path", "product/onboarding/graph/ONB-13-analytics-experiments.md"],
  );

  const onb13PacketComplete = makeFixture("onboarding-evidence-onb13-complete");
  writeEvidencePacket(
    onb13PacketComplete,
    "product/onboarding/graph/ONB-13-analytics-experiments.md",
    substantiveResearchProse(
      "typed analytics, authoritative emitters, identity stitching, deduplication, experiment assignment, exposure, and expected sequences",
    ),
  );
  runFixture("ONB-13's gate passes a genuinely substantive, marker-free analytics and experiments packet", onb13PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-13",
    "--path",
    "product/onboarding/graph/ONB-13-analytics-experiments.md",
  ]);

  const onb14PacketMissing = makeFixture("onboarding-evidence-onb14-missing");
  runFixture(
    "ONB-14's gate fails when the trust, lifecycle, and policy packet does not exist yet",
    onb14PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-14", "--path", "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md"],
  );

  const onb14PacketComplete = makeFixture("onboarding-evidence-onb14-complete");
  writeEvidencePacket(
    onb14PacketComplete,
    "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md",
    substantiveResearchProse("review timing, permissions, lifecycle, privacy, security, accessibility, and policy behavior"),
  );
  runFixture(
    "ONB-14's gate passes a genuinely substantive, marker-free trust, lifecycle, and policy packet",
    onb14PacketComplete,
    evidenceScript,
    0,
    undefined,
    ["--node", "ONB-14", "--path", "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md"],
  );

  const onb15PacketMissing = makeFixture("onboarding-evidence-onb15-missing");
  runFixture(
    "ONB-15's gate fails when the architecture decision does not exist yet",
    onb15PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-15", "--path", "product/onboarding/graph/ONB-15-architecture-decision.md"],
  );

  const onb15PacketComplete = makeFixture("onboarding-evidence-onb15-complete");
  writeEvidencePacket(
    onb15PacketComplete,
    "product/onboarding/graph/ONB-15-architecture-decision.md",
    substantiveResearchProse("the native-first, hosted-funnel-first, hybrid, web-first, and evidence-backed architecture comparison and selection"),
  );
  runFixture("ONB-15's gate passes a genuinely substantive, marker-free architecture decision", onb15PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-15",
    "--path",
    "product/onboarding/graph/ONB-15-architecture-decision.md",
  ]);

  const onb16PacketMissing = makeFixture("onboarding-evidence-onb16-missing");
  runFixture(
    "ONB-16's gate fails when the canonical journey graph does not exist yet",
    onb16PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-16", "--path", "product/onboarding/graph/ONB-16-journey-graph.md"],
  );

  const onb16PacketComplete = makeFixture("onboarding-evidence-onb16-complete");
  writeEvidencePacket(
    onb16PacketComplete,
    "product/onboarding/graph/ONB-16-journey-graph.md",
    substantiveResearchProse("the acquisition-specific journeys that converge on one semantic onboarding state graph"),
  );
  runFixture("ONB-16's gate passes a genuinely substantive, marker-free canonical journey graph", onb16PacketComplete, evidenceScript, 0, undefined, [
    "--node",
    "ONB-16",
    "--path",
    "product/onboarding/graph/ONB-16-journey-graph.md",
  ]);

  const onb17PacketMissing = makeFixture("onboarding-evidence-onb17-missing");
  runFixture(
    "ONB-17's gate fails when the screen, control, and paywall contract does not exist yet",
    onb17PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-17", "--path", "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md"],
  );

  const onb17PacketComplete = makeFixture("onboarding-evidence-onb17-complete");
  requireRevenueCatHeadlineBind(onb17PacketComplete);
  writeEvidencePacket(
    onb17PacketComplete,
    "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
    `${substantiveResearchProse("every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior")}

Paywall Goal Headline contract: the quiz writes paywall_headline_key. Keep templates in RevenueCat offering metadata and bind customVariables at present time. A skipped goal uses the fallback template.
`,
  );
  runFixture(
    "ONB-17's gate passes a genuinely substantive, marker-free screen, control, and paywall contract",
    onb17PacketComplete,
    evidenceScript,
    0,
    undefined,
    ["--node", "ONB-17", "--path", "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md"],
  );

  const onb17PacketHeadlineMissing = makeFixture("onboarding-evidence-onb17-headline-missing");
  requireRevenueCatHeadlineBind(onb17PacketHeadlineMissing);
  writeEvidencePacket(
    onb17PacketHeadlineMissing,
    "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
    substantiveResearchProse("every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior"),
  );
  runFixture(
    "ONB-17's gate fails when the screen, control, and paywall contract omits the Paywall Goal Headline bind",
    onb17PacketHeadlineMissing,
    evidenceScript,
    1,
    "onboarding_evidence.onb17_paywall_goal_headline",
    ["--node", "ONB-17", "--path", "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md"],
  );

  const onb17PacketArgs = ["--node", "ONB-17", "--path", "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md"] as const;
  const onb17HeadlineContract = `${substantiveResearchProse("every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior")}

Paywall Goal Headline contract: the quiz writes paywall_headline_key. Keep templates in RevenueCat offering metadata and bind customVariables at present time. A skipped goal uses the fallback template.
`;
  const onb17NotApplicableProse = `${substantiveResearchProse("every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior")}

The Paywall Goal Headline bind is not applicable for this product.
`;

  const onb17PacketHeadlineExcluded = makeFixture("onboarding-evidence-onb17-headline-excluded");
  mutateProductYaml(onb17PacketHeadlineExcluded, (text) => setFeatureScope(text, "feature.paywall-goal-headline", "excluded"));
  writeEvidencePacket(
    onb17PacketHeadlineExcluded,
    "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
    substantiveResearchProse("every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior"),
  );
  runFixture(
    "ONB-17's gate passes without the headline bind when feature.paywall-goal-headline is excluded",
    onb17PacketHeadlineExcluded,
    evidenceScript,
    0,
    undefined,
    [...onb17PacketArgs],
  );

  const onb17PacketNotApplicableOverride = makeFixture("onboarding-evidence-onb17-not-applicable-override");
  requireRevenueCatHeadlineBind(onb17PacketNotApplicableOverride);
  writeEvidencePacket(onb17PacketNotApplicableOverride, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md", onb17NotApplicableProse);
  runFixture(
    "ONB-17's gate fails when packet prose claims the required headline bind is not applicable",
    onb17PacketNotApplicableOverride,
    evidenceScript,
    1,
    "onboarding_evidence.onb17_paywall_goal_headline",
    [...onb17PacketArgs],
  );

  const onb17PacketHeadlineUnresolved = makeFixture("onboarding-evidence-onb17-headline-unresolved");
  mutateProductYaml(onb17PacketHeadlineUnresolved, (text) => removeFeature(text, "feature.paywall-goal-headline"));
  writeEvidencePacket(onb17PacketHeadlineUnresolved, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md", onb17HeadlineContract);
  runFixture(
    "ONB-17's gate holds when feature.paywall-goal-headline is absent",
    onb17PacketHeadlineUnresolved,
    evidenceScript,
    1,
    "onboarding_evidence.onb17_paywall_goal_headline_unresolved",
    [...onb17PacketArgs],
  );

  const onb17PacketHeadlineUnresolvedComposition = makeFixture("onboarding-evidence-onb17-headline-unresolved-composition");
  requireHeadlineFeature(onb17PacketHeadlineUnresolvedComposition);
  writeEvidencePacket(onb17PacketHeadlineUnresolvedComposition, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md", onb17HeadlineContract);
  runFixture(
    "ONB-17's gate holds when the headline feature is required and present-paywall is unresolved",
    onb17PacketHeadlineUnresolvedComposition,
    evidenceScript,
    1,
    "onboarding_evidence.onb17_paywall_goal_headline_unresolved",
    [...onb17PacketArgs],
  );

  const onb17PacketHeadlineUnavailable = makeFixture("onboarding-evidence-onb17-headline-unavailable");
  requireHeadlineFeature(onb17PacketHeadlineUnavailable);
  writeWorkspaceComposition(onb17PacketHeadlineUnavailable, "b2c/subscription-app", "b2c/superwall");
  writeEvidencePacket(onb17PacketHeadlineUnavailable, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md", onb17HeadlineContract);
  runFixture(
    "ONB-17's gate does not accept a RevenueCat headline bind for a Superwall presenter",
    onb17PacketHeadlineUnavailable,
    evidenceScript,
    1,
    "onboarding_evidence.onb17_paywall_goal_headline_unavailable",
    [...onb17PacketArgs],
  );

  const onb17PacketSuperwallExcluded = makeFixture("onboarding-evidence-onb17-superwall-excluded");
  mutateProductYaml(onb17PacketSuperwallExcluded, (text) => setFeatureScope(text, "feature.paywall-goal-headline", "excluded"));
  writeWorkspaceComposition(onb17PacketSuperwallExcluded, "b2c/subscription-app", "b2c/superwall");
  writeEvidencePacket(onb17PacketSuperwallExcluded, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md", onb17NotApplicableProse);
  runFixture("ONB-17's gate passes Superwall presentation when the headline feature is excluded", onb17PacketSuperwallExcluded, evidenceScript, 0, undefined, [
    ...onb17PacketArgs,
  ]);

  const onb17PacketRevenueCatPurchaseExcluded = makeFixture("onboarding-evidence-onb17-revenuecat-purchase-excluded");
  mutateProductYaml(onb17PacketRevenueCatPurchaseExcluded, (text) => setFeatureScope(text, "feature.paywall-goal-headline", "excluded"));
  writeWorkspaceComposition(onb17PacketRevenueCatPurchaseExcluded, "b2c/subscription-app", "b2c/revenuecat");
  writeEvidencePacket(
    onb17PacketRevenueCatPurchaseExcluded,
    "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
    substantiveResearchProse("every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior"),
  );
  runFixture(
    "ONB-17's gate passes a RevenueCat purchase owner when the headline feature is excluded",
    onb17PacketRevenueCatPurchaseExcluded,
    evidenceScript,
    0,
    undefined,
    [...onb17PacketArgs],
  );

  const onb17PacketCompleteConsumerUnavailable = makeFixture("onboarding-evidence-onb17-complete-consumer-unavailable");
  requireHeadlineFeature(onb17PacketCompleteConsumerUnavailable);
  writeWorkspaceComposition(onb17PacketCompleteConsumerUnavailable, "b2c/complete-consumer-business");
  writeEvidencePacket(onb17PacketCompleteConsumerUnavailable, "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md", onb17HeadlineContract);
  runFixture(
    "ONB-17's gate treats a required headline as unavailable when the recipe has no present-paywall operation",
    onb17PacketCompleteConsumerUnavailable,
    evidenceScript,
    1,
    "onboarding_evidence.onb17_paywall_goal_headline_unavailable",
    [...onb17PacketArgs],
  );

  const onb18PacketMissing = makeFixture("onboarding-evidence-onb18-missing");
  runFixture(
    "ONB-18's gate fails when the visual design and prototype packet does not exist yet",
    onb18PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-18", "--path", "product/onboarding/graph/ONB-18-visual-design-prototype.md"],
  );

  const onb18PacketComplete = makeFixture("onboarding-evidence-onb18-complete");
  writeEvidencePacket(
    onb18PacketComplete,
    "product/onboarding/graph/ONB-18-visual-design-prototype.md",
    substantiveResearchProse("the high-fidelity onboarding design, motion, interactive prototype, and design QA"),
  );
  runFixture(
    "ONB-18's gate passes a genuinely substantive, marker-free visual design and prototype packet",
    onb18PacketComplete,
    evidenceScript,
    0,
    undefined,
    ["--node", "ONB-18", "--path", "product/onboarding/graph/ONB-18-visual-design-prototype.md"],
  );

  const onb19PacketMissing = makeFixture("onboarding-evidence-onb19-missing");
  runFixture(
    "ONB-19's gate fails when the implementation and cutover contract does not exist yet",
    onb19PacketMissing,
    evidenceScript,
    1,
    "onboarding_evidence.packet_missing",
    ["--node", "ONB-19", "--path", "product/onboarding/graph/ONB-19-implementation-cutover-contract.md"],
  );

  const onb19PacketComplete = makeFixture("onboarding-evidence-onb19-complete");
  writeEvidencePacket(
    onb19PacketComplete,
    "product/onboarding/graph/ONB-19-implementation-cutover-contract.md",
    substantiveResearchProse("the implementation units, reliability, performance, observability, privacy, migration, hard cutover, and deletion plan"),
  );
  runFixture(
    "ONB-19's gate passes a genuinely substantive, marker-free implementation and cutover contract",
    onb19PacketComplete,
    evidenceScript,
    0,
    undefined,
    ["--node", "ONB-19", "--path", "product/onboarding/graph/ONB-19-implementation-cutover-contract.md"],
  );

  // --- check-onboarding-cutover-repository.ts ---
  // check-onboarding-graph.ts (and its --require-done variant) only ever read
  // product/ONBOARDING.md's own prose. A Removal Inventory row can claim Disposition
  // "delete" for an artifact that was never actually removed and both gates above stay
  // silent -- this is the independent, filesystem-grounded check that closes that gap.
  const cutoverScript = "check-onboarding-cutover-repository.ts";

  const cutoverBaseline = makeFixture("onboarding-cutover-baseline");
  runFixture("shipped Removal Inventory template passes base mode: its unresolved option-list row is not a deletion claim", cutoverBaseline, cutoverScript, 0);

  const cutoverUnverifiable = makeFixture("onboarding-cutover-deletion-unverifiable");
  mutateOnboarding(cutoverUnverifiable, (text) =>
    replaceTableRow(
      text,
      "| `REMOVE-001` | Record the item | Preserve durable data, transform once, recompute, archive legal history, or delete |",
      "| REMOVE-001 | Record the item | delete |",
    ),
  );
  runFixture(
    "a delete-disposition row naming no backtick-quoted artifact is unverifiable",
    cutoverUnverifiable,
    cutoverScript,
    1,
    "onboarding_cutover.deletion_unverifiable",
  );

  const cutoverNotVerified = makeFixture("onboarding-cutover-deletion-not-verified");
  mutateOnboarding(cutoverNotVerified, (text) =>
    replaceTableRow(
      text,
      "| `REMOVE-001` | Record the item | Preserve durable data, transform once, recompute, archive legal history, or delete |",
      "| `state/business-state.json` | Record the item | delete |",
    ),
  );
  runFixture(
    "a delete-disposition row naming a path that still exists on disk fails",
    cutoverNotVerified,
    cutoverScript,
    1,
    "onboarding_cutover.deletion_not_verified",
  );

  const cutoverVerified = makeFixture("onboarding-cutover-deletion-verified");
  mutateOnboarding(cutoverVerified, (text) =>
    replaceTableRow(
      text,
      "| `REMOVE-001` | Record the item | Preserve durable data, transform once, recompute, archive legal history, or delete |",
      "| `retired/old-onboarding-flow.ts` | Record the item | delete |",
    ),
  );
  runFixture("a delete-disposition row naming a path genuinely absent from disk passes", cutoverVerified, cutoverScript, 0);

  // Round 24 (PR #153 review): the shipped template row's Disposition cell is the unresolved
  // option list. A bare \bdelete\b substring test read that option list as a live deletion
  // decision, and its placeholder span (`REMOVE-001`, absent from disk by construction) then
  // counted as a verified deletion -- ONB-22 could pass without a concrete cutover inventory.
  // Base mode: an unresolved cell is NOT a deletion claim. --require-resolved (the ONB-22 gate
  // variant, check:onboarding-cutover-repository-complete): every row must resolve to exactly
  // one terminal disposition, so the shipped row itself is rejected until it is resolved.
  const cutoverUnresolvedRequire = makeFixture("onboarding-cutover-unresolved-require-resolved");
  runFixture(
    "the shipped option-list Disposition row fails --require-resolved until it records exactly one terminal disposition",
    cutoverUnresolvedRequire,
    cutoverScript,
    1,
    "onboarding_cutover.disposition_unresolved",
    ["--require-resolved"],
  );

  const cutoverResolvedRequire = makeFixture("onboarding-cutover-resolved-require-resolved");
  mutateOnboarding(cutoverResolvedRequire, (text) =>
    replaceTableRow(
      text,
      "| `REMOVE-001` | Record the item | Preserve durable data, transform once, recompute, archive legal history, or delete |",
      "| `retired/old-onboarding-flow.ts` | Record the item | delete |",
    ),
  );
  runFixture("a resolved delete row naming a genuinely absent path passes --require-resolved", cutoverResolvedRequire, cutoverScript, 0, undefined, [
    "--require-resolved",
  ]);

  const cutoverOptionListNotAClaim = makeFixture("onboarding-cutover-option-list-not-a-claim");
  mutateOnboarding(cutoverOptionListNotAClaim, (text) => replaceTableRow(text, "| `REMOVE-001` | Record the item |", "| `state` | Record the item |"));
  runFixture(
    "an unresolved option-list row is not a deletion claim in base mode, even when its span names a path that still exists",
    cutoverOptionListNotAClaim,
    cutoverScript,
    0,
  );

  // Regression: a punctuation heuristic ("must contain / or .") used to skip verifying any
  // extensionless span entirely, so a bare directory name naming a real, still-existing target
  // silently passed. `state` is a directory the fixture root always ships (copied from
  // examples/workspace/business), so this is a genuine on-disk collision, not a synthetic one.
  const cutoverExtensionlessNotVerified = makeFixture("onboarding-cutover-deletion-extensionless-not-verified");
  mutateOnboarding(cutoverExtensionlessNotVerified, (text) =>
    replaceTableRow(
      text,
      "| `REMOVE-001` | Record the item | Preserve durable data, transform once, recompute, archive legal history, or delete |",
      "| `state` | Record the item | delete |",
    ),
  );
  runFixture(
    "a delete-disposition row naming an extensionless path that still exists on disk fails",
    cutoverExtensionlessNotVerified,
    cutoverScript,
    1,
    "onboarding_cutover.deletion_not_verified",
  );

  // Regression (round 23): deletionManifestRows() used to return an empty array whenever the
  // "### Removal Inventory" heading itself was missing, and the caller's for-of loop over an
  // empty array reports zero issues -- indistinguishable from "nothing to verify". Renaming the
  // heading while leaving the phrase "Removal Inventory" elsewhere satisfies check-onboarding-
  // graph.ts's unrelated phrase-presence checks, so ONB-22 could pass both completion gates
  // without ever checking a single repository target.
  const cutoverManifestMissing = makeFixture("onboarding-cutover-manifest-missing");
  mutateOnboarding(cutoverManifestMissing, (text) =>
    text.replace("### Removal Inventory", "### Unstructured Removal Notes (see the Removal Inventory process elsewhere)"),
  );
  runFixture(
    "an artifact with no parseable Removal Inventory heading fails instead of silently passing",
    cutoverManifestMissing,
    cutoverScript,
    1,
    "onboarding_cutover.deletion_manifest_missing",
  );

  // Same silent-pass gap, reached by renaming the table's Disposition column instead of removing
  // the heading: the heading and table both still exist, but header.indexOf("disposition") ===
  // -1 also used to return an empty array.
  const cutoverManifestDispositionRenamed = makeFixture("onboarding-cutover-manifest-disposition-renamed");
  mutateOnboarding(cutoverManifestDispositionRenamed, (text) =>
    replaceTableRow(
      text,
      "| Removal ID | Code, data, config, provider, analytics, test, doc, dashboard, alert, or secret | Disposition | Delete task | Verification |",
      "| Removal ID | Code, data, config, provider, analytics, test, doc, dashboard, alert, or secret | Action | Delete task | Verification |",
    ),
  );
  runFixture(
    "a Removal Inventory table with its Disposition column renamed fails instead of silently passing",
    cutoverManifestDispositionRenamed,
    cutoverScript,
    1,
    "onboarding_cutover.deletion_manifest_unparseable",
  );

  function checkVerificationItems(text: string): string {
    return text.replace(/^-\s*\[\s*\]/gm, "- [x]");
  }

  function markOnboardingDone(fixtureRoot: string): void {
    const state = readState(fixtureRoot);
    const lane = getLane(state, "onboarding");
    lane["status"] = "succeeded";
    lane["evidence"] = ["product/ONBOARDING.md", "product/onboarding.html"];
    writeState(fixtureRoot, state);
  }

  // check-onboarding-graph.ts's tablePlaceholderCells() now also rejects boilerplate that
  // repeats with only an embedded counter varying (e.g. "Evidence-1: ...", "Evidence-2: ..."),
  // since that is exactly the shape of filler that is technically unique but carries no real
  // content. This filler derives each cell's text from its own table's column header and its
  // row's own identifying content instead of a counter, so distinct rows and columns produce
  // genuinely distinct text -- the same way a real completed launch's answers would differ
  // because they are about different things, not because of an incrementing label.
  function fillTemplateDirectiveCells(text: string): string {
    const lines = text.split("\n");
    let header: string[] | null = null;
    let pendingHeader: string[] | null = null;

    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|")) {
          header = null;
          pendingHeader = null;
          return line;
        }
        if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(trimmed)) {
          header = pendingHeader;
          pendingHeader = null;
          return line;
        }
        if (header === null) {
          pendingHeader = line.split("|").map((cell) => cell.trim());
          return line;
        }
        const rawCells = line.split("|");
        const trimmedCells = rawCells.map((cell) => cell.trim().replaceAll("`", ""));
        const rowIdentity = trimmedCells.slice(1, -1).find((cell) => cell.length > 0 && !TEMPLATE_DIRECTIVE_VERBS_PATTERN.test(cell)) || "this row";
        const resolvedHeader = header;
        return rawCells
          .map((cell, index) => {
            if (!TEMPLATE_DIRECTIVE_VERBS_PATTERN.test(cell)) return cell;
            const columnName = (resolvedHeader?.[index] || "field").toLowerCase();
            return ` Confirmed ${columnName} for ${rowIdentity} `;
          })
          .join("|");
      })
      .join("\n");
  }

  // Mirrors check-onboarding-graph.ts's own proseDirectiveLines(): fills paragraph-level
  // directive lines (Execution Mode, Source Map And Current-State Trace, ...) the table-cell
  // filler above never touches. Several of these same sentences are also where requirePhrases()
  // finds its required doctrine phrases (e.g. line 105's "Define First value rendered, First
  // value engaged, Activation, ..." carries three of onboarding_graph.activation_contract's
  // required phrases) -- replacing the whole line would make those checks fail too. Swap only
  // the leading verb for a word outside TEMPLATE_DIRECTIVE_VERBS_PATTERN, keeping the rest of
  // the sentence (and its required phrases) verbatim.
  function fillProseDirectiveLines(text: string): string {
    return text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith("|") || trimmed.startsWith("#") || trimmed.startsWith("-")) return line;
        if (!TEMPLATE_DIRECTIVE_VERBS_PATTERN.test(line)) return line;
        return line.replace(/^(\s*)[A-Za-z]+/, "$1Confirmed");
      })
      .join("\n");
  }
}
