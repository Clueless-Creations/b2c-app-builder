import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { type Harness, writeCompletePaidUserAcquisition } from "./_harness.js";

export function register(h: Harness): void {
  const { makeFixture, runFixture } = h;

  const contentFallbackUnapproved = makeFixture("content-fallback-unapproved");
  mkdirSync(path.join(contentFallbackUnapproved, "growth", "content-assets"), { recursive: true });
  writeFileSync(
    path.join(contentFallbackUnapproved, "growth", "content-assets", "CONTENT_ASSETS.md"),
    [
      "# Content Assets",
      "Route Matrix",
      "Higgsfield unavailable, using Remotion fallback.",
      "Remotion",
      "License status: Remotion license status checked before commercial use.",
      "Source Inputs",
      "Composition Manifest",
      "Render Commands",
      "Claim Review",
      "Output Registry",
      "Public Use Gates",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "Higgsfield content fallback without founder approval fails",
    contentFallbackUnapproved,
    "check-content-assets.ts",
    1,
    "content_assets.higgsfield_fallback_unapproved",
  );

  const remotionLicenseUnchecked = makeFixture("remotion-license-unchecked");
  mkdirSync(path.join(remotionLicenseUnchecked, "growth", "content-assets"), { recursive: true });
  writeFileSync(
    path.join(remotionLicenseUnchecked, "growth", "content-assets", "CONTENT_ASSETS.md"),
    [
      "# Content Assets",
      "Route Matrix",
      "Higgsfield",
      "Remotion",
      "Founder approval recorded for Remotion fallback.",
      "License status: unchecked.",
      "Source Inputs",
      "Composition Manifest",
      "Render Commands",
      "Claim Review",
      "Output Registry",
      "Public Use Gates",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(remotionLicenseUnchecked, "growth", "content-assets", "manifest.json"),
    JSON.stringify(
      {
        assets: [
          {
            asset_id: "license-thin",
            surface: "ad",
            route: "remotion",
            status: "draft",
            composition_id: "Ad",
            dimensions: "1080x1080",
            inputs: ["DESIGN.md"],
            outputs: ["growth/content-assets/out/ad.mp4"],
            truth_constraints: ["real app UI visible"],
            approvals: ["founder approval before public use"],
            render_proof: "npx remotion render Ad --output ../out/ad.mp4",
            license_status: "unchecked",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  runFixture(
    "Remotion asset without license status fails",
    remotionLicenseUnchecked,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.license_status.unchecked",
  );

  const thinContentManifest = makeFixture("content-manifest-thin");
  mkdirSync(path.join(thinContentManifest, "growth", "content-assets"), { recursive: true });
  writeFileSync(
    path.join(thinContentManifest, "growth", "content-assets", "CONTENT_ASSETS.md"),
    [
      "# Content Assets",
      "Route Matrix",
      "Higgsfield",
      "Remotion",
      "Founder approval recorded for fallback.",
      "License status: Remotion license status checked before commercial use.",
      "Source Inputs",
      "Composition Manifest",
      "Render Commands",
      "Claim Review",
      "Output Registry",
      "Public Use Gates",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(thinContentManifest, "growth", "content-assets", "manifest.json"),
    JSON.stringify({ assets: [{ asset_id: "thin", route: "remotion", status: "draft" }] }, null, 2),
    "utf8",
  );
  runFixture("thin Remotion content manifest fails", thinContentManifest, "check-content-assets.ts", 1, "content_assets.manifest.assets.0.surface.missing");

  const higgsfieldNoBrief = makeFixture("content-higgsfield-no-brief");
  mkdirSync(path.join(higgsfieldNoBrief, "growth", "content-assets"), { recursive: true });
  writeFileSync(
    path.join(higgsfieldNoBrief, "growth", "content-assets", "CONTENT_ASSETS.md"),
    [
      "# Content Assets",
      "Route Matrix",
      "Higgsfield",
      "Remotion",
      "Founder approval recorded for fallback.",
      "License status: Remotion license status checked before commercial use.",
      "Source Inputs",
      "Composition Manifest",
      "Render Commands",
      "Claim Review",
      "Output Registry",
      "Public Use Gates",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(higgsfieldNoBrief, "growth", "content-assets", "manifest.json"),
    JSON.stringify(
      {
        assets: [
          {
            asset_id: "founder-ad",
            surface: "meta_paid",
            route: "higgsfield_marketing_studio",
            status: "draft",
            dimensions: "1080x1920",
            inputs: ["DESIGN.md"],
            outputs: ["growth/content-assets/out/founder-ad.mp4"],
            truth_constraints: ["real app UI remains truthful"],
            approvals: ["founder approval before public posting"],
            license_status: "Higgsfield account/credit route",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  runFixture(
    "Higgsfield manifest asset without prompt_brief fails",
    higgsfieldNoBrief,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.prompt_brief.missing",
  );

  const ugcAsset = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    asset_id: "believable-person-ugc",
    surface: "tiktok_paid",
    route: "higgsfield_marketing_studio",
    asset_kind: "ugc",
    status: "draft",
    dimensions: "1080x1920",
    prompt_brief: "DESIGN.md palette and banned aesthetics for the app UI in frame; realism register for person and scene",
    inputs: ["DESIGN.md", "ugc/script-bank.md"],
    outputs: ["growth/content-assets/out/believable-person-ugc.mp4"],
    truth_constraints: ["spoken claims match the product"],
    approvals: ["founder approval before public posting"],
    render_proof: "higgsfield generate create marketing_studio_video --mode ugc --aspect_ratio 9:16 --wait",
    license_status: "Higgsfield account/credit route",
    ...overrides,
  });

  const writeUgcManifest = (root: string, asset: Record<string, unknown>): void => {
    mkdirSync(path.join(root, "growth", "content-assets"), { recursive: true });
    writeFileSync(path.join(root, "growth", "content-assets", "manifest.json"), JSON.stringify({ assets: [asset] }, null, 2), "utf8");
  };

  // A real surviving row (FMT-002) beside the template's placeholder FMT-001 row,
  // so done-tier fixtures can reference a script that actually passed the panel.
  const writeSurvivingScriptRow = (root: string): void => {
    mkdirSync(path.join(root, "ugc"), { recursive: true });
    writeFileSync(
      path.join(root, "ugc", "script-bank.md"),
      [
        "# UGC Script Bank",
        "",
        "| Format ID | Hook | Script | Judge verdict | Judge notes | CTA mechanic | Product insertion |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| FMT-001 | replace with the surviving hook line | replace with the surviving script text | pending | notes | app search | app screen |",
        "| FMT-002 | ur telling me this app tracked it for free | i wasnt going to post this but the screen is right there | survived — panel 2026-08-10, passed on rewrite 2 | pacing tight, vocab natural | app search | app screen visible mid-script |",
      ].join("\n"),
      "utf8",
    );
  };

  const ugcNoScript = makeFixture("content-ugc-no-script");
  writeUgcManifest(ugcNoScript, ugcAsset({}));
  runFixture(
    "UGC-family manifest asset without script_id and judge_verdict fails",
    ugcNoScript,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.script_id.missing_for_ugc",
  );

  // A Recipe 7 asset routed as bare Seedance carries no "ugc" token anywhere —
  // the exact dodge the asset_kind requirement exists to close.
  const seedanceNoKind = makeFixture("content-seedance-no-asset-kind");
  writeUgcManifest(
    seedanceNoKind,
    ugcAsset({
      asset_kind: undefined,
      route: "higgsfield_seedance_2_5",
      render_proof: "higgsfield generate create seedance_2_5 --image first-frame.png --duration 15 --aspect_ratio 9:16 --wait",
    }),
  );
  runFixture(
    "generated Seedance video without asset_kind fails",
    seedanceNoKind,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.asset_kind.missing_for_generated_video",
  );

  const ugcUnrecordedScript = makeFixture("content-ugc-unrecorded-script");
  writeUgcManifest(
    ugcUnrecordedScript,
    ugcAsset({
      script_id: "ugc/script-bank.md#FMT-999",
      judge_verdict: "survived — panel 2026-08-10",
    }),
  );
  runFixture(
    "UGC asset whose script_id names an unrecorded script fails",
    ugcUnrecordedScript,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.script_id.anchor_unrecorded",
  );

  const ugcFailedVerdict = makeFixture("content-ugc-failed-verdict");
  writeUgcManifest(
    ugcFailedVerdict,
    ugcAsset({
      script_id: "ugc/script-bank.md#FMT-001",
      judge_verdict: "rejected by the panel after rewrite 3",
    }),
  );
  runFixture(
    "UGC asset with a failing judge_verdict fails at any status",
    ugcFailedVerdict,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.judge_verdict.failed",
  );

  const ugcWrongBank = makeFixture("content-ugc-wrong-bank");
  writeUgcManifest(
    ugcWrongBank,
    ugcAsset({
      script_id: "growth/UGC_PLAYBOOK.md#FMT-001",
      judge_verdict: "survived — panel 2026-08-10",
    }),
  );
  runFixture(
    "UGC asset whose script_id points outside a script-bank file fails",
    ugcWrongBank,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.script_id.bank_not_script_bank",
  );

  const ugcPlaceholderRow = makeFixture("content-ugc-placeholder-row");
  writeUgcManifest(
    ugcPlaceholderRow,
    ugcAsset({
      status: "approved",
      script_id: "ugc/script-bank.md#FMT-001",
      judge_verdict: "survived — panel 2026-08-10",
      believability: "passed — watched by one human who did not make it",
    }),
  );
  runFixture(
    "approved UGC asset referencing the placeholder template row fails",
    ugcPlaceholderRow,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.script_id.row_placeholder",
  );

  const ugcNegatedVerdict = makeFixture("content-ugc-negated-verdict");
  writeSurvivingScriptRow(ugcNegatedVerdict);
  writeUgcManifest(
    ugcNegatedVerdict,
    ugcAsset({
      status: "approved",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "not passed — panel did not approve",
      believability: "passed — watched by one human who did not make it",
    }),
  );
  runFixture(
    "approved UGC asset with a negated pass judge_verdict fails",
    ugcNegatedVerdict,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.judge_verdict.not_passing",
  );

  const ugcNegatedBelievability = makeFixture("content-ugc-negated-believability");
  writeSurvivingScriptRow(ugcNegatedBelievability);
  writeUgcManifest(
    ugcNegatedBelievability,
    ugcAsset({
      status: "approved",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "survived — panel 2026-08-10",
      believability: "not passed — viewer identified it as AI",
    }),
  );
  runFixture(
    "approved UGC asset with a negated pass believability fails",
    ugcNegatedBelievability,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.believability.not_passing",
  );

  const escapeBankFor = (root: string): string => {
    const escapeDir = path.join(root, "..", `${path.basename(root)}-escape-ugc`);
    mkdirSync(escapeDir, { recursive: true });
    writeFileSync(
      path.join(escapeDir, "script-bank.md"),
      [
        "| Format ID | Hook | Script | Judge verdict | Judge notes | CTA mechanic | Product insertion |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| FMT-002 | outside hook | outside script | survived — panel 2026-08-10 | notes | app search | app screen |",
      ].join("\n"),
      "utf8",
    );
    return escapeDir;
  };

  const ugcTraversalBank = makeFixture("content-ugc-traversal-bank");
  const traversalEscapeDir = escapeBankFor(ugcTraversalBank);
  writeUgcManifest(
    ugcTraversalBank,
    ugcAsset({
      script_id: `../${path.basename(traversalEscapeDir)}/script-bank.md#FMT-002`,
      judge_verdict: "survived — panel 2026-08-10",
    }),
  );
  runFixture(
    "UGC asset whose script_id traverses outside the workspace fails",
    ugcTraversalBank,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.script_id.bank_outside_workspace",
  );

  const ugcSymlinkBank = makeFixture("content-ugc-symlink-bank");
  const symlinkEscapeDir = escapeBankFor(ugcSymlinkBank);
  rmSync(path.join(ugcSymlinkBank, "ugc", "script-bank.md"), { force: true });
  mkdirSync(path.join(ugcSymlinkBank, "ugc"), { recursive: true });
  symlinkSync(path.join(symlinkEscapeDir, "script-bank.md"), path.join(ugcSymlinkBank, "ugc", "script-bank.md"));
  writeUgcManifest(
    ugcSymlinkBank,
    ugcAsset({
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "survived — panel 2026-08-10",
    }),
  );
  runFixture(
    "UGC asset whose script bank is a symlink escaping the workspace fails",
    ugcSymlinkBank,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.script_id.bank_outside_workspace",
  );

  const ugcSpentDraft = makeFixture("content-ugc-spent-draft");
  writeSurvivingScriptRow(ugcSpentDraft);
  mkdirSync(path.join(ugcSpentDraft, "growth", "content-assets", "out"), { recursive: true });
  writeFileSync(path.join(ugcSpentDraft, "growth", "content-assets", "out", "believable-person-ugc.mp4"), "fixture-bytes", "utf8");
  writeUgcManifest(
    ugcSpentDraft,
    ugcAsset({
      status: "draft",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "pending — panel booked for next week",
    }),
  );
  runFixture(
    "draft UGC asset with generated output but no passing verdict fails",
    ugcSpentDraft,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.judge_verdict.not_passing",
  );

  const seedanceNoBrief = makeFixture("content-seedance-no-brief");
  writeSurvivingScriptRow(seedanceNoBrief);
  writeUgcManifest(
    seedanceNoBrief,
    ugcAsset({
      prompt_brief: undefined,
      route: "seedance_2_5",
      render_proof: "higgsfield generate create seedance_2_5 --image first-frame.png --duration 15 --aspect_ratio 9:16 --wait",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "survived — panel 2026-08-10",
    }),
  );
  runFixture(
    "bare Seedance route without prompt_brief fails",
    seedanceNoBrief,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.prompt_brief.missing",
  );

  const ugcSpentRemoteJob = makeFixture("content-ugc-spent-remote-job");
  writeSurvivingScriptRow(ugcSpentRemoteJob);
  writeUgcManifest(
    ugcSpentRemoteJob,
    ugcAsset({
      status: "draft",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "pending — panel booked for next week",
      source_job_id: "hf-job-8271",
    }),
  );
  runFixture(
    "draft UGC asset with a provider job id but no passing verdict fails",
    ugcSpentRemoteJob,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.judge_verdict.not_passing",
  );

  const ugcSpentRemoteUrl = makeFixture("content-ugc-spent-remote-url");
  writeSurvivingScriptRow(ugcSpentRemoteUrl);
  writeUgcManifest(
    ugcSpentRemoteUrl,
    ugcAsset({
      status: "draft",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "pending — panel booked for next week",
      outputs: ["https://example.com/generations/believable-person-ugc.mp4"],
    }),
  );
  runFixture(
    "draft UGC asset with a remote output URL but no passing verdict fails",
    ugcSpentRemoteUrl,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.judge_verdict.not_passing",
  );

  const ugcApprovedNoBelievability = makeFixture("content-ugc-approved-no-believability");
  writeSurvivingScriptRow(ugcApprovedNoBelievability);
  writeUgcManifest(
    ugcApprovedNoBelievability,
    ugcAsset({
      status: "approved",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "survived — panel 2026-08-10; pacing and vocabulary judges passed on rewrite 2",
    }),
  );
  runFixture(
    "approved UGC-family asset without a believability result fails",
    ugcApprovedNoBelievability,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.believability.missing_for_ugc",
  );

  const ugcFailedBelievability = makeFixture("content-ugc-failed-believability");
  writeSurvivingScriptRow(ugcFailedBelievability);
  writeUgcManifest(
    ugcFailedBelievability,
    ugcAsset({
      status: "approved",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "survived — panel 2026-08-10",
      believability: "failed — viewer identified it as AI and as an ad",
    }),
  );
  runFixture(
    "approved UGC-family asset with a failed believability result fails",
    ugcFailedBelievability,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.believability.failed",
  );

  const ugcComplete = makeFixture("content-ugc-complete");
  writeSurvivingScriptRow(ugcComplete);
  mkdirSync(path.join(ugcComplete, "growth", "content-assets", "out"), { recursive: true });
  writeFileSync(path.join(ugcComplete, "growth", "content-assets", "out", "believable-person-ugc.mp4"), "fixture-bytes", "utf8");
  writeUgcManifest(
    ugcComplete,
    ugcAsset({
      status: "approved",
      script_id: "ugc/script-bank.md#FMT-002",
      judge_verdict: "survived — panel 2026-08-10; pacing and vocabulary judges passed on rewrite 2",
      believability: "passed — watched by one human who did not make it 2026-08-10; not clocked as AI or ad",
      input_digests: {
        "DESIGN.md": createHash("sha256")
          .update(readFileSync(path.join(ugcComplete, "DESIGN.md")))
          .digest("hex"),
        "ugc/script-bank.md": createHash("sha256")
          .update(readFileSync(path.join(ugcComplete, "ugc/script-bank.md")))
          .digest("hex"),
      },
    }),
  );
  runFixture(
    "approved UGC-family asset with surviving script row, passing verdict, and passing believability passes",
    ugcComplete,
    "check-content-assets.ts",
    0,
    undefined,
    [],
    undefined,
    "_for_ugc",
  );

  const paidUaMissing = makeFixture("paid-ua-missing");
  rmSync(path.join(paidUaMissing, "growth", "PAID_UA.md"), { force: true });
  runFixture("missing paid UA packet fails", paidUaMissing, "check-paid-user-acquisition.ts", 1, "paid_ua.markdown_missing");

  const paidUaThin = makeFixture("paid-ua-thin");
  mkdirSync(path.join(paidUaThin, "growth"), { recursive: true });
  writeFileSync(
    path.join(paidUaThin, "growth", "PAID_UA.md"),
    ["# Paid User Acquisition", "Fit Gate", "Channel Choice: try Meta, TikTok, Google, and Apple Ads at the same time."].join("\n"),
    "utf8",
  );
  runFixture("thin paid UA packet fails", paidUaThin, "check-paid-user-acquisition.ts", 1, "paid_ua.creative_production.missing");

  // Stop/scale rules without recorded numbers are vibes: the four Decision
  // Thresholds must be present so a weekly report can be judged mechanically.
  const paidUaNoThresholds = makeFixture("paid-ua-no-decision-thresholds");
  writeCompletePaidUserAcquisition(paidUaNoThresholds);
  writeFileSync(
    path.join(paidUaNoThresholds, "growth", "PAID_UA.md"),
    readFileSync(path.join(paidUaNoThresholds, "growth", "PAID_UA.md"), "utf8")
      .split("\n")
      .filter((line) => !line.startsWith("Decision Thresholds:"))
      .join("\n"),
    "utf8",
  );
  runFixture("paid UA without decision thresholds fails", paidUaNoThresholds, "check-paid-user-acquisition.ts", 1, "paid_ua.decision_thresholds.missing");

  // Labels without values are not thresholds: a done lane whose numbers still
  // sit in template comments fails per label.
  const paidUaBlankThresholds = makeFixture("paid-ua-blank-threshold-values");
  writeCompletePaidUserAcquisition(paidUaBlankThresholds);
  writeFileSync(
    path.join(paidUaBlankThresholds, "growth", "PAID_UA.md"),
    readFileSync(path.join(paidUaBlankThresholds, "growth", "PAID_UA.md"), "utf8").replace(
      /^Decision Thresholds:.*$/m,
      ["Decision Thresholds:", "Attribution tolerance:", "Payback window:", "Creative signal floor:", "Scale trigger:"].join("\n"),
    ),
    "utf8",
  );
  runFixture(
    "done paid UA with valueless thresholds fails",
    paidUaBlankThresholds,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.attribution_tolerance.value_missing",
  );

  const paidUaDonePlaceholder = makeFixture("paid-ua-done-placeholder");
  writeCompletePaidUserAcquisition(paidUaDonePlaceholder);
  writeFileSync(
    path.join(paidUaDonePlaceholder, "growth", "PAID_UA.md"),
    readFileSync(path.join(paidUaDonePlaceholder, "growth", "PAID_UA.md"), "utf8") + "\nTODO: choose final weekly budget.\n",
    "utf8",
  );
  runFixture("done paid UA with placeholders fails", paidUaDonePlaceholder, "check-paid-user-acquisition.ts", 1, "paid_ua.placeholder_complete");

  const paidUaDoneReportMissing = makeFixture("paid-ua-done-report-missing");
  writeCompletePaidUserAcquisition(paidUaDoneReportMissing);
  rmSync(path.join(paidUaDoneReportMissing, "growth", "paid-ua-report.csv"), { force: true });
  runFixture("done paid UA without report fails", paidUaDoneReportMissing, "check-paid-user-acquisition.ts", 1, "paid_ua.report_missing_done");

  const paidUaNoVirality = makeFixture("paid-ua-no-virality");
  writeCompletePaidUserAcquisition(paidUaNoVirality);
  {
    const paidUaPath = path.join(paidUaNoVirality, "growth", "PAID_UA.md");
    const withoutVirality = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("Virality Predictor"))
      .join("\n");
    writeFileSync(paidUaPath, withoutVirality, "utf8");
  }
  runFixture("paid UA without virality scoring gate fails", paidUaNoVirality, "check-paid-user-acquisition.ts", 1, "paid_ua.virality_gate.missing");

  const paidUaNoMmpBeforeSpend = makeFixture("paid-ua-no-mmp-before-spend");
  writeCompletePaidUserAcquisition(paidUaNoMmpBeforeSpend);
  {
    const paidUaPath = path.join(paidUaNoMmpBeforeSpend, "growth", "PAID_UA.md");
    const withoutMmp = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("MMP Before Spend"))
      .join("\n");
    writeFileSync(paidUaPath, withoutMmp, "utf8");
  }
  runFixture("paid UA without MMP-before-spend rule fails", paidUaNoMmpBeforeSpend, "check-paid-user-acquisition.ts", 1, "paid_ua.mmp_before_spend.missing");

  const paidUaNoPausedDraft = makeFixture("paid-ua-no-paused-draft");
  writeCompletePaidUserAcquisition(paidUaNoPausedDraft);
  {
    const paidUaPath = path.join(paidUaNoPausedDraft, "growth", "PAID_UA.md");
    const withoutPaused = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("PAUSED"))
      .join("\n");
    writeFileSync(paidUaPath, withoutPaused, "utf8");
  }
  runFixture("paid UA without PAUSED draft rule fails", paidUaNoPausedDraft, "check-paid-user-acquisition.ts", 1, "paid_ua.paused_draft.missing");

  const paidUaNoKillWindow = makeFixture("paid-ua-no-kill-window");
  writeCompletePaidUserAcquisition(paidUaNoKillWindow);
  {
    const paidUaPath = path.join(paidUaNoKillWindow, "growth", "PAID_UA.md");
    const withoutKill = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("48-hour kill"))
      .join("\n");
    writeFileSync(paidUaPath, withoutKill, "utf8");
  }
  runFixture("paid UA without 48-hour kill window fails", paidUaNoKillWindow, "check-paid-user-acquisition.ts", 1, "paid_ua.48_hour_kill_window.missing");

  const paidUaNoAngleHunt = makeFixture("paid-ua-no-angle-hunt");
  writeCompletePaidUserAcquisition(paidUaNoAngleHunt);
  {
    const paidUaPath = path.join(paidUaNoAngleHunt, "growth", "PAID_UA.md");
    const withoutHunt = readFileSync(paidUaPath, "utf8").replace("## Non-Competitor Angle Hunt", "## Competitor Angle Map");
    writeFileSync(paidUaPath, withoutHunt, "utf8");
  }
  runFixture(
    "paid UA without a Non-Competitor Angle Hunt fails",
    paidUaNoAngleHunt,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.non_competitor_angle_hunt.missing",
  );

  const paidUaCloneAngles = makeFixture("paid-ua-clone-competitor-angles");
  writeCompletePaidUserAcquisition(paidUaCloneAngles);
  {
    const paidUaPath = path.join(paidUaCloneAngles, "growth", "PAID_UA.md");
    writeFileSync(paidUaPath, `${readFileSync(paidUaPath, "utf8")}\n\nFirst batch: clone competitor ads for faster learning.\n`, "utf8");
  }
  runFixture("paid UA that clones competitor ads fails", paidUaCloneAngles, "check-paid-user-acquisition.ts", 1, "paid_ua.angle_hunt.clone");

  const paidUaForbidsClone = makeFixture("paid-ua-forbids-cloned-competitor-ads");
  writeCompletePaidUserAcquisition(paidUaForbidsClone);
  {
    const paidUaPath = path.join(paidUaForbidsClone, "growth", "PAID_UA.md");
    writeFileSync(paidUaPath, `${readFileSync(paidUaPath, "utf8")}\n\nNo cloned competitor assets are permitted.\n`, "utf8");
  }
  runFixture("paid UA that records a clone prohibition still passes", paidUaForbidsClone, "check-paid-user-acquisition.ts", 0);

  const paidUaHesitateClone = makeFixture("paid-ua-do-not-hesitate-clone");
  writeCompletePaidUserAcquisition(paidUaHesitateClone);
  {
    const paidUaPath = path.join(paidUaHesitateClone, "growth", "PAID_UA.md");
    writeFileSync(paidUaPath, `${readFileSync(paidUaPath, "utf8")}\n\nDo not hesitate to clone competitor ads for faster learning.\n`, "utf8");
  }
  runFixture(
    "paid UA that says do not hesitate to clone competitor ads fails",
    paidUaHesitateClone,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.angle_hunt.clone",
  );

  const paidUaEmptyHuntRows = makeFixture("paid-ua-empty-hunt-source-rows");
  writeCompletePaidUserAcquisition(paidUaEmptyHuntRows);
  {
    const paidUaPath = path.join(paidUaEmptyHuntRows, "growth", "PAID_UA.md");
    const emptied = readFileSync(paidUaPath, "utf8")
      .replace("| UA-ANG-002 | cross-niche | travel packing ritual | weekly reset | original | no |", "| UA-ANG-002 | cross-niche | | | | |")
      .replace("| UA-ANG-003 | ad-library-adjacent | adjacent category US ads | identity | original | no |", "| UA-ANG-003 | ad-library-adjacent | | | | |")
      .replace(
        "| UA-ANG-004 | second-profile | second motivation for the same customer | clean-freak | original | yes |",
        "| UA-ANG-004 | second-profile | | | | |",
      );
    writeFileSync(paidUaPath, emptied, "utf8");
  }
  runFixture(
    "spend-ready paid UA whose extra hunt kinds are empty rows fails",
    paidUaEmptyHuntRows,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.angle_hunt.sources_missing",
  );

  const paidUaLogoSwapOnly = makeFixture("paid-ua-logo-swap-only-angles");
  writeCompletePaidUserAcquisition(paidUaLogoSwapOnly);
  {
    const paidUaPath = path.join(paidUaLogoSwapOnly, "growth", "PAID_UA.md");
    writeFileSync(paidUaPath, readFileSync(paidUaPath, "utf8").replaceAll("| original |", "| logo-swap |"), "utf8");
  }
  runFixture(
    "spend-ready paid UA whose adopted angles are all logo-swaps fails",
    paidUaLogoSwapOnly,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.angle_hunt.no_original",
  );

  const paidUaSplitOriginal = makeFixture("paid-ua-original-on-competitor-only");
  writeCompletePaidUserAcquisition(paidUaSplitOriginal);
  {
    const paidUaPath = path.join(paidUaSplitOriginal, "growth", "PAID_UA.md");
    const withSplit = `${readFileSync(paidUaPath, "utf8").replaceAll("| original | yes |", "| logo-swap | yes |")}\n| UA-ANG-005 | direct-competitor | incumbent ads | same | original | yes |\n`;
    writeFileSync(paidUaPath, withSplit, "utf8");
  }
  runFixture(
    "spend-ready paid UA whose only original adopted angle is a competitor row fails",
    paidUaSplitOriginal,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.angle_hunt.no_original",
  );

  const paidUaNoAppsflyer = makeFixture("paid-ua-spend-ready-without-appsflyer");
  writeCompletePaidUserAcquisition(paidUaNoAppsflyer);
  {
    const paidUaPath = path.join(paidUaNoAppsflyer, "growth", "PAID_UA.md");
    const withoutAppsflyer = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("AppsFlyer") && !line.includes("$appsflyerId"))
      .join("\n");
    writeFileSync(paidUaPath, withoutAppsflyer, "utf8");
  }
  runFixture(
    "spend-ready paid UA without the AppsFlyer RevenueCat bridge fails",
    paidUaNoAppsflyer,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.appsflyer_bridge.missing",
  );

  const paidUaMmpWaiver = makeFixture("paid-ua-founder-mmp-waiver");
  writeCompletePaidUserAcquisition(paidUaMmpWaiver);
  {
    const paidUaPath = path.join(paidUaMmpWaiver, "growth", "PAID_UA.md");
    const withoutAppsflyer = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("AppsFlyer") && !line.includes("$appsflyerId"))
      .join("\n");
    writeFileSync(
      paidUaPath,
      [
        withoutAppsflyer,
        "",
        "## Founder MMP Waiver",
        "",
        "| Date | Founder | Replacement stack | Approval state |",
        "| --- | --- | --- | --- |",
        "| 2026-08-20 | Ada Founder | SKAdNetwork plus RevenueCat | approved |",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "spend-ready paid UA with a founder MMP waiver passes the AppsFlyer bridge",
    paidUaMmpWaiver,
    "check-paid-user-acquisition.ts",
    0,
    undefined,
    [],
    undefined,
    "paid_ua.appsflyer",
  );

  const paidUaEmptyWaiver = makeFixture("paid-ua-empty-mmp-waiver");
  writeCompletePaidUserAcquisition(paidUaEmptyWaiver);
  {
    const paidUaPath = path.join(paidUaEmptyWaiver, "growth", "PAID_UA.md");
    const withoutAppsflyer = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("AppsFlyer") && !line.includes("$appsflyerId"))
      .join("\n");
    writeFileSync(paidUaPath, `${withoutAppsflyer}\nFounder MMP waiver:\n`, "utf8");
  }
  runFixture("spend-ready paid UA with an empty founder MMP waiver fails", paidUaEmptyWaiver, "check-paid-user-acquisition.ts", 1, "paid_ua.mmp_waiver.empty");

  const paidUaPendingWaiverProse = makeFixture("paid-ua-pending-mmp-waiver-prose");
  writeCompletePaidUserAcquisition(paidUaPendingWaiverProse);
  {
    const paidUaPath = path.join(paidUaPendingWaiverProse, "growth", "PAID_UA.md");
    const withoutAppsflyer = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("AppsFlyer") && !line.includes("$appsflyerId"))
      .join("\n");
    writeFileSync(paidUaPath, `${withoutAppsflyer}\nFounder MMP waiver: pending founder approval\n`, "utf8");
  }
  runFixture(
    "spend-ready paid UA with pending founder MMP waiver prose fails",
    paidUaPendingWaiverProse,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.mmp_waiver.unstructured",
  );

  const paidUaUnapprovedWaiver = makeFixture("paid-ua-unapproved-mmp-waiver-table");
  writeCompletePaidUserAcquisition(paidUaUnapprovedWaiver);
  {
    const paidUaPath = path.join(paidUaUnapprovedWaiver, "growth", "PAID_UA.md");
    const withoutAppsflyer = readFileSync(paidUaPath, "utf8")
      .split("\n")
      .filter((line) => !line.includes("AppsFlyer") && !line.includes("$appsflyerId"))
      .join("\n");
    writeFileSync(
      paidUaPath,
      [
        withoutAppsflyer,
        "",
        "## Founder MMP Waiver",
        "",
        "| Date | Founder | Replacement stack | Approval state |",
        "| --- | --- | --- | --- |",
        "| 2026-08-20 | Ada Founder | SKAdNetwork plus RevenueCat | pending |",
        "",
      ].join("\n"),
      "utf8",
    );
  }
  runFixture(
    "spend-ready paid UA with an unapproved founder MMP waiver table fails",
    paidUaUnapprovedWaiver,
    "check-paid-user-acquisition.ts",
    1,
    "paid_ua.mmp_waiver.unapproved",
  );

  const paidUaStubReport = makeFixture("paid-ua-stub-report");
  writeCompletePaidUserAcquisition(paidUaStubReport);
  writeFileSync(path.join(paidUaStubReport, "growth", "paid-ua-report.csv"), "done\n", "utf8");
  runFixture("done paid UA with a stub report file fails", paidUaStubReport, "check-paid-user-acquisition.ts", 1, "paid_ua.report_content_thin");

  const contentAssetMissingDigest = makeFixture("content-asset-input-digest-missing");
  mkdirSync(path.join(contentAssetMissingDigest, "growth", "content-assets"), { recursive: true });
  mkdirSync(path.join(contentAssetMissingDigest, "growth", "content-assets", "out"), { recursive: true });
  writeFileSync(path.join(contentAssetMissingDigest, "growth", "content-assets", "out", "landing-hero.webp"), "fixture-bytes", "utf8");
  writeFileSync(
    path.join(contentAssetMissingDigest, "growth", "content-assets", "CONTENT_ASSETS.md"),
    [
      "# Content Assets",
      "Route Matrix: Higgsfield or Remotion with Founder approval.",
      "License status: commercial use checked.",
      "Source Inputs",
      "Composition Manifest",
      "Render Commands",
      "Claim Review",
      "Output Registry",
      "Public Use Gates",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(contentAssetMissingDigest, "growth", "content-assets", "manifest.json"),
    JSON.stringify({
      assets: [
        {
          asset_id: "landing-hero",
          surface: "landing",
          route: "local_composition",
          status: "approved",
          license_status: "owned",
          inputs: ["DESIGN.md"],
          outputs: ["growth/content-assets/out/landing-hero.webp"],
          truth_constraints: ["no invented app UI"],
          approvals: ["founder approval before public use"],
        },
      ],
    }),
    "utf8",
  );
  runFixture(
    "generated asset without canonical input digest fails",
    contentAssetMissingDigest,
    "check-content-assets.ts",
    1,
    "content_assets.manifest.assets.0.input_digest.missing",
  );
}
