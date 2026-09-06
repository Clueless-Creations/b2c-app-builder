import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createFixtureProvider, startObserveMandate, writeAppReviewState, type FixtureProviderPack } from "../../../../adapters/app-review/index.js";
import {
  type Harness,
  expectRecord,
  getLane,
  readState,
  rewriteFixtureArchiveInfoPlist,
  writeCompleteAppleRequirements,
  writeCompleteAsoOps,
  writeCompleteStoreConsole,
  writeCompleteStoreScreenshots,
  writeNewerCompetingFixtureArchive,
  writeState,
  skillRoot,
} from "./_harness.js";

export function register(h: Harness): void {
  const { makeFixture, runFixture } = h;

  const nativeIosProofThin = makeFixture("native-ios-proof-thin");
  writeFileSync(
    path.join(nativeIosProofThin, "engineering/PRODUCTION_READINESS.md"),
    [
      "# Production Readiness",
      "Status: ready.",
      "Native iOS Proof: Codex Desktop build passed. SnapshotPreviews passed. serve-sim worked.",
      "Implementation proof: ce-work completed.",
      "Review proof: ce-code-review passed.",
      "Proof artifact: ce-proof exists.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "thin native iOS proof fails without Codex Desktop session defaults",
    nativeIosProofThin,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.codex_desktop_session_defaults_missing",
  );

  // The in-app simulator is the route an agent reaches for by default, so the
  // easy path must still carry its gates: local session, named device, fixture
  // account (device screenshots leave the machine), and the coverage it drops.
  const inAppSimulatorUngated = makeFixture("native-ios-in-app-simulator-ungated");
  writeFileSync(
    path.join(inAppSimulatorUngated, "engineering/PRODUCTION_READINESS.md"),
    [
      "# Production Readiness",
      "Status: ready.",
      "Native iOS Proof: ran the app in the iOS Simulator pane and tapped through onboarding.",
      "Launch-Critical Test Matrix covers the prerelease .xctestplan with unit, integration, UI, and performance targets across device, OS, locale, Dynamic Type, light and dark.",
      "Coverage includes permission denied, offline retry, background, foreground, deep link, notification, and interruption paths, an accessibility audit, and StoreKit entitlement, restore, and refund states.",
      "Release configuration on a physical device is deferred.",
      "Screenshots at screenshots/raw/home.png. Paired with operations/PROVIDER_PROOF.md. A simulator build alone is not distribution readiness; see store/APPLE_SIGNING.md.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "in-app simulator proof without the fixture-account rule fails",
    inAppSimulatorUngated,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.in_app_simulator_fixture_account_missing",
  );
  runFixture(
    "in-app simulator proof without the local-session record fails",
    inAppSimulatorUngated,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.in_app_simulator_session_missing",
  );
  runFixture(
    "in-app simulator proof without its dropped-coverage statement fails",
    inAppSimulatorUngated,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.in_app_simulator_coverage_limit_missing",
  );
  runFixture(
    "in-app simulator proof without a named simulated device fails",
    inAppSimulatorUngated,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.in_app_simulator_device_missing",
  );

  // The template is the other witness for the happy path; this one proves a
  // hand-written in-app row passes on its own, so tightening scopedLines later
  // cannot silently start rejecting real-world readiness docs.
  const inAppSimulatorGated = makeFixture("native-ios-in-app-simulator-gated");
  writeFileSync(
    path.join(inAppSimulatorGated, "engineering/PRODUCTION_READINESS.md"),
    [
      "# Production Readiness",
      "Status: ready.",
      "Native iOS Proof: ran the app in the iOS Simulator pane in a local session on iPhone 17 Pro / iOS 26 with a fixture account, never a real founder or provider login.",
      "That route covers no Android and no physical device, so cross-platform and release-device proof stay open.",
      "Launch-Critical Test Matrix covers the prerelease .xctestplan with unit, integration, UI, and performance targets across device, OS, locale, Dynamic Type, light and dark.",
      "Coverage includes permission denied, offline retry, background, foreground, deep link, notification, and interruption paths, an accessibility audit, and StoreKit entitlement, restore, and refund states.",
      "Release configuration on a physical device is deferred.",
      "Screenshots at screenshots/raw/home.png. Paired with operations/PROVIDER_PROOF.md. A simulator build alone is not distribution readiness; see store/APPLE_SIGNING.md.",
    ].join("\n"),
    "utf8",
  );
  runFixture("fully gated in-app simulator proof passes", inAppSimulatorGated, "check-native-ios-proof.ts", 0);

  const inAppSimulatorScreenshots = makeFixture("native-ios-in-app-simulator-screenshots");
  writeFileSync(
    path.join(inAppSimulatorScreenshots, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: ready.",
      "Raw Capture Matrix: captured from the in-app simulator pane on iPhone 17 Pro / iOS 26 in a local session with a fixture account, exported to screenshots/raw/home.png.",
      "Production Composition Matrix: final upload path screenshots/final/iphone.png.",
    ].join("\n"),
    "utf8",
  );
  runFixture("in-app simulator captures satisfy the raw screenshot capture route", inAppSimulatorScreenshots, "check-native-ios-proof.ts", 0);

  const inAppSimulatorRealAccountScreenshots = makeFixture("native-ios-in-app-simulator-real-account-screenshots");
  writeFileSync(
    path.join(inAppSimulatorRealAccountScreenshots, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: ready.",
      "Raw Capture Matrix: captured from the in-app simulator pane on iPhone 17 Pro / iOS 26, signed in as the founder so the flow looks real, exported to screenshots/raw/home.png.",
      "Production Composition Matrix: final upload path screenshots/final/iphone.png.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "in-app simulator captures without the fixture-account rule fail",
    inAppSimulatorRealAccountScreenshots,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.screenshot_in_app_simulator_fixture_account_missing",
  );

  const nativeIosUngrounded = makeFixture("native-ios-proof-ungrounded");
  const nativeIosUngroundedState = readState(nativeIosUngrounded);
  getLane(nativeIosUngroundedState, "engineering")["status"] = "succeeded";
  writeState(nativeIosUngrounded, nativeIosUngroundedState);
  const ungroundedPath = path.join(nativeIosUngrounded, "engineering/PRODUCTION_READINESS.md");
  writeFileSync(ungroundedPath, readFileSync(ungroundedPath, "utf8").replace(/\bpending\b/gi, "Passed"), "utf8");
  runFixture(
    "done native iOS proof without an existing evidence artifact fails",
    nativeIosUngrounded,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.matrix_evidence_missing",
  );

  const nativeIosGrounded = makeFixture("native-ios-proof-grounded");
  const nativeIosGroundedState = readState(nativeIosGrounded);
  getLane(nativeIosGroundedState, "engineering")["status"] = "succeeded";
  writeState(nativeIosGrounded, nativeIosGroundedState);
  const groundedReadinessPath = path.join(nativeIosGrounded, "engineering/PRODUCTION_READINESS.md");
  mkdirSync(path.join(nativeIosGrounded, "mobile", "proof"), { recursive: true });
  const matrixProofs: Array<[string, string]> = [
    ["cold launch and core value journey", "cold-launch.log"],
    ["account lifecycle", "account.log"],
    ["purchase lifecycle", "purchase.log"],
    ["permissions", "permissions.log"],
    ["resilience", "resilience.log"],
    ["accessibility and presentation", "accessibility.log"],
    ["localization", "localization.log"],
    ["performance", "performance.log"],
    ["release device", "release-device.log"],
  ];
  let readinessText = readFileSync(groundedReadinessPath, "utf8");
  for (const [journey, filename] of matrixProofs) {
    writeFileSync(path.join(nativeIosGrounded, "mobile", "proof", filename), `${journey} fixture proof\n`, "utf8");
    readinessText = readinessText
      .split("\n")
      .map((line) => {
        if (line.split("|")[1]?.trim() !== journey) return line;
        const cells = line.split("|");
        cells[4] = ` \`mobile/proof/${filename}\` `;
        cells[5] = ` ${(cells[5] ?? "").replace(/pending/gi, "verified")} `;
        cells[6] = " Passed ";
        return cells.join("|");
      })
      .join("\n");
  }
  writeFileSync(groundedReadinessPath, readinessText, "utf8");
  runFixture("done native iOS proof with row-specific grounded evidence passes", nativeIosGrounded, "check-native-ios-proof.ts", 0);

  const snapshotOnlyScreenshots = makeFixture("snapshot-only-screenshots");
  writeFileSync(
    path.join(snapshotOnlyScreenshots, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: ready.",
      "Raw Capture Matrix: SnapshotPreviews exported XCTest PNG/JSON proof through TEST_RUNNER_SNAPSHOTS_EXPORT_DIR into snapshot-images.",
      "Production Composition Matrix: final upload path screenshots/final/iphone.png.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "ready iOS screenshots fail when SnapshotPreviews is the only capture route",
    snapshotOnlyScreenshots,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.screenshot_capture_route_missing",
  );

  const snapshotLimitScreenshots = makeFixture("snapshot-limit-screenshots");
  writeFileSync(
    path.join(snapshotLimitScreenshots, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: ready.",
      "Raw Capture Matrix: MobAI captured screenshots/raw/home.png from the real UI.",
      "Component regression layer: SnapshotPreviews exported SnapshotTest PNG/JSON proof through TEST_RUNNER_SNAPSHOTS_EXPORT_DIR into snapshot-images.",
      "Production Composition Matrix: final upload path screenshots/final/iphone.png.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "ready iOS screenshots fail when SnapshotPreviews limitation is missing",
    snapshotLimitScreenshots,
    "check-native-ios-proof.ts",
    1,
    "native_ios_proof.screenshot_snapshot_previews_limit_missing",
  );

  const missingAppleRequirements = makeFixture("apple-requirements-missing");
  rmSync(path.join(missingAppleRequirements, "store/APPLE_APP_STORE_REQUIREMENTS.md"), { force: true });
  runFixture(
    "missing Apple App Store requirements packet fails",
    missingAppleRequirements,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.missing",
  );

  const thinAppleRequirements = makeFixture("apple-requirements-thin");
  writeFileSync(
    path.join(thinAppleRequirements, "store/APPLE_APP_STORE_REQUIREMENTS.md"),
    ["# Apple App Store Requirements", "Privacy is handled in the policy.", "The app can be uploaded to App Store Connect."].join("\n"),
    "utf8",
  );
  runFixture(
    "thin Apple App Store requirements packet fails",
    thinAppleRequirements,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.privacyinfo_xcprivacy.missing",
  );

  const readyAppleRequirementsNoManifest = makeFixture("apple-requirements-no-manifest-file");
  writeCompleteAppleRequirements(readyAppleRequirementsNoManifest);
  rmSync(path.join(readyAppleRequirementsNoManifest, "ios"), { recursive: true, force: true });
  runFixture(
    "ready Apple requirements without PrivacyInfo file fails",
    readyAppleRequirementsNoManifest,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.privacy_manifest_file_missing",
  );

  const readyAppleRequirementsScaffoldSigning = makeFixture("apple-requirements-scaffold-signing");
  writeCompleteAppleRequirements(readyAppleRequirementsScaffoldSigning);
  writeFileSync(
    path.join(readyAppleRequirementsScaffoldSigning, "store/APPLE_SIGNING.md"),
    readFileSync(path.join(skillRoot, "examples/workspace/business/store/APPLE_SIGNING.md"), "utf8"),
    "utf8",
  );
  runFixture(
    "ready Apple requirements with unchanged signing scaffold fails",
    readyAppleRequirementsScaffoldSigning,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_unresolved_template",
  );

  const staleAppleSigning = makeFixture("apple-requirements-stale-signing");
  writeCompleteAppleRequirements(staleAppleSigning);
  const staleSigningPath = path.join(staleAppleSigning, "store/APPLE_SIGNING.md");
  const currentDate = new Date().toISOString().slice(0, 10);
  const staleDate = new Date(`${currentDate}T00:00:00Z`);
  staleDate.setUTCDate(staleDate.getUTCDate() - 1);
  writeFileSync(staleSigningPath, readFileSync(staleSigningPath, "utf8").replaceAll(currentDate, staleDate.toISOString().slice(0, 10)), "utf8");
  runFixture(
    "ready Apple requirements with stale signing evidence fails",
    staleAppleSigning,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_date_stale",
  );

  const futureAppleSigning = makeFixture("apple-requirements-future-signing");
  writeCompleteAppleRequirements(futureAppleSigning);
  const futureSigningPath = path.join(futureAppleSigning, "store/APPLE_SIGNING.md");
  const futureDate = new Date(`${currentDate}T00:00:00Z`);
  futureDate.setUTCDate(futureDate.getUTCDate() + 1);
  writeFileSync(futureSigningPath, readFileSync(futureSigningPath, "utf8").replaceAll(currentDate, futureDate.toISOString().slice(0, 10)), "utf8");
  runFixture(
    "ready Apple requirements with future signing evidence fails",
    futureAppleSigning,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_date_future",
  );

  const blockedAppleSigning = makeFixture("apple-requirements-blocked-signing-detail");
  writeCompleteAppleRequirements(blockedAppleSigning);
  const blockedSigningPath = path.join(blockedAppleSigning, "store/APPLE_SIGNING.md");
  writeFileSync(
    blockedSigningPath,
    readFileSync(blockedSigningPath, "utf8").replace("| 1.2.3 | 1.2.3 | 1.2.3 | matched |", "| 1.2.3 | 1.2.3 | 1.2.3 | BLOCKED |"),
    "utf8",
  );
  runFixture(
    "ready Apple requirements with blocked detailed signing evidence fails",
    blockedAppleSigning,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_identity_version_invalid",
  );

  const pendingAppleSigning = makeFixture("apple-requirements-pending-signing-status");
  writeCompleteAppleRequirements(pendingAppleSigning);
  const pendingSigningPath = path.join(pendingAppleSigning, "store/APPLE_SIGNING.md");
  writeFileSync(pendingSigningPath, readFileSync(pendingSigningPath, "utf8").replace("Status: ready.", "Status: pending."), "utf8");
  runFixture(
    "ready Apple requirements with pending signing status fails",
    pendingAppleSigning,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_status_unresolved",
  );

  const strictCompleteAppleSigning = makeFixture("apple-requirements-strict-complete");
  writeCompleteAppleRequirements(strictCompleteAppleSigning);
  runFixture(
    "strict Apple signing readiness accepts complete evidence with distinct archive and Info.plist mtimes",
    strictCompleteAppleSigning,
    "check-apple-app-store-requirements.ts",
    0,
    undefined,
    ["--require-signing-ready"],
  );

  const archiveIdentityMismatch = makeFixture("apple-requirements-archive-identity-mismatch");
  writeCompleteAppleRequirements(archiveIdentityMismatch);
  rewriteFixtureArchiveInfoPlist(archiveIdentityMismatch, (contents) => contents.replace("com.example.fixture", "com.example.archived"));
  runFixture(
    "Apple signing rejects identity claims that differ from the parsed archive Info.plist",
    archiveIdentityMismatch,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_identity_bundle_id_mismatch",
  );

  const archiveSdkKeyMissing = makeFixture("apple-requirements-archive-sdk-key-missing");
  writeCompleteAppleRequirements(archiveSdkKeyMissing);
  rewriteFixtureArchiveInfoPlist(archiveSdkKeyMissing, (contents) => contents.replace("<key>POSTHOG_HOST</key><string>fixture-posthog-host</string>\n", ""));
  runFixture(
    "Apple signing rejects item 7 when a named SDK key is absent from the parsed archive Info.plist",
    archiveSdkKeyMissing,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_sdk_keys_mismatch",
  );

  const archiveSdkProviderSubstringOnly = makeFixture("apple-requirements-archive-sdk-provider-substring-only");
  writeCompleteAppleRequirements(archiveSdkProviderSubstringOnly);
  rewriteFixtureArchiveInfoPlist(archiveSdkProviderSubstringOnly, (contents) => contents.replace("POSTHOG_HOST", "POSTHOG_HOSTNAME"));
  runFixture(
    "Apple signing rejects a partial provider match when the exact item 7 plist key is absent",
    archiveSdkProviderSubstringOnly,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_sdk_keys_mismatch",
  );

  const newerCompetingArchive = makeFixture("apple-requirements-newer-competing-archive");
  writeCompleteAppleRequirements(newerCompetingArchive);
  writeNewerCompetingFixtureArchive(newerCompetingArchive);
  runFixture(
    "Apple signing rejects recorded evidence when a newer root-confined archive exists",
    newerCompetingArchive,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_newer_artifact_exists",
  );

  const archiveMutatedAfterEvidence = makeFixture("apple-requirements-archive-mutated-after-evidence");
  writeCompleteAppleRequirements(archiveMutatedAfterEvidence);
  const mutatedAfterEvidenceTime = new Date(Date.now() + 10_000);
  utimesSync(
    path.join(archiveMutatedAfterEvidence, "build/FixtureRelease.xcarchive/Products/Applications/Fixture.app/Info.plist"),
    mutatedAfterEvidenceTime,
    mutatedAfterEvidenceTime,
  );
  runFixture(
    "Apple signing rejects an archive artifact modified after its evidence timestamp tolerance",
    archiveMutatedAfterEvidence,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_artifact_stale",
  );

  const strictScaffoldAppleSigning = makeFixture("apple-requirements-strict-scaffold");
  runFixture("default Apple template audit retains scaffold behavior", strictScaffoldAppleSigning, "check-apple-app-store-requirements.ts", 0);
  runFixture(
    "strict Apple signing readiness rejects unchanged scaffolds",
    strictScaffoldAppleSigning,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_unresolved_template",
    ["--require-signing-ready"],
  );

  const mismatchedBundleIdentity = makeFixture("apple-requirements-mismatched-bundle-identity");
  writeCompleteAppleRequirements(mismatchedBundleIdentity);
  const mismatchedBundleSigningPath = path.join(mismatchedBundleIdentity, "store/APPLE_SIGNING.md");
  writeFileSync(
    mismatchedBundleSigningPath,
    readFileSync(mismatchedBundleSigningPath, "utf8").replace(
      "| CFBundleIdentifier | com.example.fixture | com.example.fixture | com.example.fixture | matched |",
      "| CFBundleIdentifier | com.example.fixture | com.example.compiled | com.example.fixture | matched |",
    ),
    "utf8",
  );
  runFixture(
    "Apple signing rejects mismatched intended and compiled bundle identity",
    mismatchedBundleIdentity,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_identity_bundle_id_invalid",
  );

  const leadingZeroVersionIdentity = makeFixture("apple-requirements-leading-zero-version");
  writeCompleteAppleRequirements(leadingZeroVersionIdentity);
  const leadingZeroSigningPath = path.join(leadingZeroVersionIdentity, "store/APPLE_SIGNING.md");
  writeFileSync(
    leadingZeroSigningPath,
    readFileSync(leadingZeroSigningPath, "utf8").replace(
      "| CFBundleShortVersionString | 1.2.3 | 1.2.3 | 1.2.3 | matched |",
      "| CFBundleShortVersionString | 1.02.3 | 1.02.3 | 1.02.3 | matched |",
    ),
    "utf8",
  );
  runFixture(
    "Apple signing rejects leading zero version segments",
    leadingZeroVersionIdentity,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_identity_version_invalid",
  );

  const staleArchiveEvidence = makeFixture("apple-requirements-stale-archive-evidence");
  writeCompleteAppleRequirements(staleArchiveEvidence);
  const staleArchiveSigningPath = path.join(staleArchiveEvidence, "store/APPLE_SIGNING.md");
  const staleArchiveDate = new Date(`${currentDate}T00:00:00Z`);
  staleArchiveDate.setUTCDate(staleArchiveDate.getUTCDate() - 1);
  writeFileSync(
    staleArchiveSigningPath,
    readFileSync(staleArchiveSigningPath, "utf8").replace(
      /created_at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/,
      `created_at=${staleArchiveDate.toISOString().slice(0, 10)}T12:00:00Z`,
    ),
    "utf8",
  );
  runFixture(
    "Apple signing rejects stale post-archive evidence",
    staleArchiveEvidence,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_evidence_invalid",
  );

  const mismatchedArchiveEvidence = makeFixture("apple-requirements-mismatched-archive-evidence");
  writeCompleteAppleRequirements(mismatchedArchiveEvidence);
  const mismatchedArchiveSigningPath = path.join(mismatchedArchiveEvidence, "store/APPLE_SIGNING.md");
  writeFileSync(
    mismatchedArchiveSigningPath,
    readFileSync(mismatchedArchiveSigningPath, "utf8").replace("archive path=build/FixtureRelease.xcarchive", "archive path=build/PriorRelease.xcarchive"),
    "utf8",
  );
  runFixture(
    "Apple signing rejects item 7 evidence from a different archive",
    mismatchedArchiveEvidence,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_evidence_mismatch",
  );

  const invalidBuildIdentity = makeFixture("apple-requirements-invalid-build-identity");
  writeCompleteAppleRequirements(invalidBuildIdentity);
  const invalidBuildSigningPath = path.join(invalidBuildIdentity, "store/APPLE_SIGNING.md");
  writeFileSync(
    invalidBuildSigningPath,
    readFileSync(invalidBuildSigningPath, "utf8").replace(
      "| CFBundleVersion | 42 | 42 | available — not previously received | unique |",
      "| CFBundleVersion | invalid | invalid | available — not previously received | unique |",
    ),
    "utf8",
  );
  runFixture(
    "Apple signing rejects nonnumeric compiled build identifiers",
    invalidBuildIdentity,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_identity_build_invalid",
  );

  const missingArchiveArtifact = makeFixture("apple-requirements-missing-archive-artifact");
  writeCompleteAppleRequirements(missingArchiveArtifact);
  rmSync(path.join(missingArchiveArtifact, "build/FixtureRelease.xcarchive"), { recursive: true, force: true });
  runFixture(
    "Apple signing rejects missing recorded archive artifacts",
    missingArchiveArtifact,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_artifact_missing",
  );

  const wrongArchiveHash = makeFixture("apple-requirements-wrong-archive-hash");
  writeCompleteAppleRequirements(wrongArchiveHash);
  const wrongArchiveHashSigningPath = path.join(wrongArchiveHash, "store/APPLE_SIGNING.md");
  writeFileSync(
    wrongArchiveHashSigningPath,
    readFileSync(wrongArchiveHashSigningPath, "utf8").replaceAll(/Info\.plist SHA-256=[a-f\d]{64}/gi, `Info.plist SHA-256=${"b".repeat(64)}`),
    "utf8",
  );
  runFixture(
    "Apple signing rejects a recorded hash that does not match compiled Info.plist bytes",
    wrongArchiveHash,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_artifact_hash_mismatch",
  );

  const staleArchiveArtifact = makeFixture("apple-requirements-stale-archive-artifact");
  writeCompleteAppleRequirements(staleArchiveArtifact);
  const staleArtifactTime = new Date();
  staleArtifactTime.setUTCDate(staleArtifactTime.getUTCDate() - 1);
  utimesSync(path.join(staleArchiveArtifact, "build/FixtureRelease.xcarchive"), staleArtifactTime, staleArtifactTime);
  utimesSync(
    path.join(staleArchiveArtifact, "build/FixtureRelease.xcarchive/Products/Applications/Fixture.app/Info.plist"),
    staleArtifactTime,
    staleArtifactTime,
  );
  runFixture(
    "Apple signing rejects archive artifacts older than their recorded timestamp",
    staleArchiveArtifact,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.post_archive_artifact_stale",
  );

  for (const negatedStatus of ["not ready", "not complete"]) {
    const negatedAppleSigning = makeFixture(`apple-requirements-${negatedStatus.replace(" ", "-")}-status`);
    writeCompleteAppleRequirements(negatedAppleSigning);
    const negatedSigningPath = path.join(negatedAppleSigning, "store/APPLE_SIGNING.md");
    writeFileSync(negatedSigningPath, readFileSync(negatedSigningPath, "utf8").replace("Status: ready.", `Status: ${negatedStatus}.`), "utf8");
    runFixture(
      `Apple signing rejects ${negatedStatus} as a ready status`,
      negatedAppleSigning,
      "check-apple-app-store-requirements.ts",
      1,
      "apple_requirements.signing_status_unresolved",
    );
  }

  const mismatchedBuildIdentity = makeFixture("apple-requirements-mismatched-build-identity");
  writeCompleteAppleRequirements(mismatchedBuildIdentity);
  const mismatchedBuildSigningPath = path.join(mismatchedBuildIdentity, "store/APPLE_SIGNING.md");
  writeFileSync(
    mismatchedBuildSigningPath,
    readFileSync(mismatchedBuildSigningPath, "utf8").replace(
      "| CFBundleVersion | 42 | 42 | available — not previously received | unique |",
      "| CFBundleVersion | 42 | 43 | available — not previously received | unique |",
    ),
    "utf8",
  );
  runFixture(
    "Apple signing rejects mismatched intended and compiled build values",
    mismatchedBuildIdentity,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_identity_build_invalid",
  );

  const buildWithoutAvailability = makeFixture("apple-requirements-build-without-availability");
  writeCompleteAppleRequirements(buildWithoutAvailability);
  const buildWithoutAvailabilityPath = path.join(buildWithoutAvailability, "store/APPLE_SIGNING.md");
  writeFileSync(
    buildWithoutAvailabilityPath,
    readFileSync(buildWithoutAvailabilityPath, "utf8").replace(
      "| CFBundleVersion | 42 | 42 | available — not previously received | unique |",
      "| CFBundleVersion | 42 | 42 | 42 | unique |",
    ),
    "utf8",
  );
  runFixture(
    "Apple signing rejects ASC build equality without availability evidence",
    buildWithoutAvailability,
    "check-apple-app-store-requirements.ts",
    1,
    "apple_requirements.signing_identity_build_invalid",
  );

  const iosOnlyStore = makeFixture("store-ios-only");
  const iosOnlyStoreState = readState(iosOnlyStore);
  expectRecord(iosOnlyStoreState.project, "project")["platforms"] = ["ios"];
  expectRecord(expectRecord(iosOnlyStoreState.project, "project")["bundleIds"], "project.bundleIds")["android"] = "";
  writeState(iosOnlyStore, iosOnlyStoreState);
  writeFileSync(
    path.join(iosOnlyStore, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path and ASC CLI routes cover app creation, asc-id-resolver ID resolution, app info, SKU, primary locale, bundle ID, App Privacy, pricing, RevenueCat, asc-revenuecat-catalog-sync, subscription setup, localization, custom product page strategy, In-App Event planning, Higgsfield-backed marketing assets, screenshots, TestFlight, review status, review notes, and account deletion.",
      "App Review Information notes cover purpose and target audience, setup and access instructions, the demo account decision (including an explicit no-login confirmation when there is no account system), the list of test devices and OS versions, and the external services used.",
      "Age Rating Questionnaire records socialMedia, messagingAndChat, socialMediaAgeRestricted, ageAssurance, and userGeneratedContent from product evidence.",
      "Run asc age-rating audit before submission.",
      "Do not infer false from a blank field.",
      "If the app name is already in use, stop for founder approval before using any fallback name.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(iosOnlyStore, "store/store-console.html"), "<!doctype html><html><body>iOS store packet</body></html>", "utf8");
  writeFileSync(
    path.join(iosOnlyStore, "APP_STORE_LISTING.md"),
    [
      "# App Store Listing",
      "App Privacy, pricing, RevenueCat, asc-revenuecat-catalog-sync, subscription setup, localization, custom product page strategy, In-App Event planning, App Icon direction, App Preview routing, SCREENSHOTS.md, iPad screenshot wells, copy overlay rules, ParthJadhav/app-store-screenshots, Higgsfield-backed marketing assets, and founder approval are documented.",
      "ASC route proof includes app creation, asc-app-create-ui, asc-id-resolver, asc-metadata-sync, asc-localize-metadata, asc-screenshot-resize, asc-shots-pipeline, asc-ppp-pricing, asc-subscription-localization, asc-testflight-orchestration, asc-submission-health, and asc-release-flow.",
      "Every screenshot row records version localization ID and every pricing row records base territory.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(iosOnlyStore, "app-store-listing.html"), "<!doctype html><html><body>iOS listing packet</body></html>", "utf8");
  writeFileSync(path.join(iosOnlyStore, "app-privacy-questionnaire.html"), "<!doctype html><html><body>iOS privacy questionnaire</body></html>", "utf8");
  writeCompleteStoreScreenshots(iosOnlyStore);
  runFixture("iOS-only store packet does not require Google Play fields", iosOnlyStore, "check-store-console-packet.ts", 0);

  const ageRatingFieldMissing = makeFixture("store-age-rating-field-missing");
  writeCompleteStoreConsole(ageRatingFieldMissing);
  writeFileSync(
    path.join(ageRatingFieldMissing, "store/STORE_CONSOLE.md"),
    readFileSync(path.join(ageRatingFieldMissing, "store/STORE_CONSOLE.md"), "utf8").replaceAll("socialMedia, ", ""),
  );
  runFixture(
    "iOS store packet without a distinct socialMedia age-rating field fails",
    ageRatingFieldMissing,
    "check-store-console-packet.ts",
    1,
    "store_console.age_rating_field_missing",
  );

  const ageRatingInconsistent = makeFixture("store-age-rating-inconsistent");
  writeCompleteStoreConsole(ageRatingInconsistent);
  const ageRatingInconsistentState = readState(ageRatingInconsistent);
  getLane(ageRatingInconsistentState, "store_console")["status"] = "succeeded";
  writeState(ageRatingInconsistent, ageRatingInconsistentState);
  writeFileSync(
    path.join(ageRatingInconsistent, "store/STORE_CONSOLE.md"),
    [
      readFileSync(path.join(ageRatingInconsistent, "store/STORE_CONSOLE.md"), "utf8"),
      "socialMedia: false",
      "messagingAndChat: false",
      "socialMediaAgeRestricted: true",
      "ageAssurance: false",
      "userGeneratedContent: false",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "done store packet with restricted social but no age assurance fails",
    ageRatingInconsistent,
    "check-store-console-packet.ts",
    1,
    "store_console.age_rating_inconsistent",
  );

  const ageRatingAnswersMissing = makeFixture("store-age-rating-answers-missing");
  writeCompleteStoreConsole(ageRatingAnswersMissing);
  const ageRatingAnswersMissingState = readState(ageRatingAnswersMissing);
  getLane(ageRatingAnswersMissingState, "store_console")["status"] = "succeeded";
  writeState(ageRatingAnswersMissing, ageRatingAnswersMissingState);
  runFixture(
    "done store packet without true or false age-rating answers fails",
    ageRatingAnswersMissing,
    "check-store-console-packet.ts",
    1,
    "store_console.age_rating_answer_missing",
  );

  const missingListingArtifacts = makeFixture("store-missing-listing-artifacts");
  rmSync(path.join(missingListingArtifacts, "store", "app-store-listing"), { recursive: true, force: true });
  writeFileSync(
    path.join(missingListingArtifacts, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path covers app info, SKU, primary locale, bundle ID, App Privacy, pricing, RevenueCat, subscription setup, localization, custom product page strategy, In-App Event planning, Higgsfield-backed marketing assets, screenshots, review notes, and account deletion.",
      "Google Play click path covers package name, Data safety, screenshots, review notes, privacy, and account deletion.",
      "If the app name is already in use, stop for founder approval before using any fallback name.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(missingListingArtifacts, "store/store-console.html"), "<!doctype html><html><body>Store console only</body></html>", "utf8");
  runFixture(
    "iOS store packet without App Store listing artifacts fails",
    missingListingArtifacts,
    "check-store-console-packet.ts",
    1,
    "store_console.app_store_listing.markdown_missing",
  );

  const unresolvedListing = makeFixture("store-unresolved-listing");
  writeCompleteStoreConsole(unresolvedListing);
  const unresolvedListingState = readState(unresolvedListing);
  const unresolvedStoreLane = getLane(unresolvedListingState, "store_console");
  unresolvedStoreLane["status"] = "succeeded";
  writeState(unresolvedListing, unresolvedListingState);
  writeFileSync(
    path.join(unresolvedListing, "APP_STORE_LISTING.md"),
    [
      "# App Store Listing",
      "App Privacy answers are Pending.",
      "Pricing, RevenueCat, subscription setup, localization, custom product page strategy, In-App Event planning, Higgsfield-backed marketing assets, and founder approval are documented.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "iOS App Store listing packet with unresolved placeholders fails",
    unresolvedListing,
    "check-store-console-packet.ts",
    1,
    "store_console.placeholder_or_unknown",
  );

  const thinAscMarketing = makeFixture("thin-asc-marketing");
  writeFileSync(
    path.join(thinAscMarketing, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path covers app info, SKU, primary locale, bundle ID, privacy, screenshots, review notes, and account deletion.",
      "Google Play click path covers package name, Data safety, screenshots, review notes, privacy, and account deletion.",
      "If the app name is already in use, stop for founder approval before using any fallback name.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(thinAscMarketing, "store/store-console.html"), "<!doctype html><html><body>Thin store packet</body></html>", "utf8");
  runFixture(
    "thin ASC listing packet without App Privacy and marketing surfaces fails",
    thinAscMarketing,
    "check-store-console-packet.ts",
    1,
    "store_console.app_privacy.missing",
  );

  const unsafeFallback = makeFixture("unsafe-store-fallback");
  writeCompleteStoreConsole(unsafeFallback);
  writeFileSync(
    path.join(unsafeFallback, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path covers app info, SKU, primary locale, bundle ID, App Privacy, pricing, RevenueCat, subscription setup, localization, custom product page strategy, In-App Event planning, Higgsfield-backed marketing assets, screenshots, review notes, and account deletion.",
      "Google Play click path covers package name, Data safety, screenshots, review notes, privacy, and account deletion.",
      "Founder approval is required before submission.",
      "If the app name is already in use, retry with fallback name App - app.",
    ].join("\n"),
    "utf8",
  );
  runFixture("unsafe ASC fallback-name retry fails", unsafeFallback, "check-store-console-packet.ts", 1, "unapproved_name_fallback");

  const ascAppCreationUnderclaimed = makeFixture("asc-app-creation-underclaimed");
  writeCompleteStoreConsole(ascAppCreationUnderclaimed);
  writeFileSync(
    path.join(ascAppCreationUnderclaimed, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path and ASC CLI routes cover app creation, asc-id-resolver ID resolution, app info, SKU, primary locale, bundle ID, App Privacy, pricing, RevenueCat, asc-revenuecat-catalog-sync, subscription setup, localization, custom product page strategy, In-App Event planning, Higgsfield-backed marketing assets, screenshots, TestFlight, review status, review notes, and account deletion.",
      "App Review Information notes cover purpose and target audience, setup and access instructions, the demo account decision (including an explicit no-login confirmation when there is no account system), the list of test devices and OS versions, and the external services used.",
      "The founder must manually create the app record in App Store Connect.",
      "Google Play click path covers package name, Data safety, screenshots, review notes, privacy, and account deletion.",
      "If the app name is already in use, stop for founder approval before using any fallback name.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "manual-only ASC app creation underclaim fails",
    ascAppCreationUnderclaimed,
    "check-store-console-packet.ts",
    1,
    "store_console.asc_app_creation_underclaimed",
  );

  const phraseOnlyStore = makeFixture("store-phrase-only");
  const phraseOnlyStoreState = readState(phraseOnlyStore);
  const phraseOnlyStoreLane = getLane(phraseOnlyStoreState, "store_console");
  phraseOnlyStoreLane["status"] = "succeeded";
  writeState(phraseOnlyStore, phraseOnlyStoreState);
  writeFileSync(
    path.join(phraseOnlyStore, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path TODO.",
      "Google Play click path unknown.",
      "Privacy not configured.",
      "Data safety unknown.",
      "Screenshots TODO.",
      "Review notes TODO.",
      "Account deletion unknown.",
      "SKU placeholder.",
      "Primary locale unknown.",
      "Bundle ID unknown.",
      "Package name unknown.",
      "If the app name is already in use, continue with fallback name automatically without founder approval.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(phraseOnlyStore, "store/store-console.html"), "<!doctype html><html><body>Store packet</body></html>", "utf8");
  runFixture(
    "store packet with placeholders and unapproved fallback fails",
    phraseOnlyStore,
    "check-store-console-packet.ts",
    1,
    "store_console.unapproved_name_fallback",
  );

  const rawOnlyScreenshots = makeFixture("raw-only-screenshots");
  writeCompleteStoreConsole(rawOnlyScreenshots);
  writeFileSync(
    path.join(rawOnlyScreenshots, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: ready for upload.",
      "Raw Capture Matrix",
      "| Slot | Platform | Device | Locale | Source screen | Capture tool | Raw path | Version localization ID | Status |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | iOS | iPhone | en-US | Home | MobAI | screenshots/raw/home.png | 123 | ready |",
      "Production Composition Matrix",
      "Device Wells: iPhone and iPad wells are covered.",
      "headline and copy overlay are not needed because raw screenshots are ready.",
      "DESIGN.md, 11_STAR_EXPERIENCE.md, Higgsfield, Remotion, App Icon, App Preview, asc-screenshot-resize, alpha, color space, thumbnail, visual QA, Google Play, feature graphic, and founder approval are mentioned.",
    ].join("\n"),
    "utf8",
  );
  runFixture("raw-only store screenshots fail", rawOnlyScreenshots, "check-store-screenshots.ts", 1, "store_screenshots.raw_capture_as_final");

  const appStoreScreenshotsUnvalidated = makeFixture("app-store-screenshots-unvalidated");
  writeCompleteStoreConsole(appStoreScreenshotsUnvalidated);
  writeFileSync(
    path.join(appStoreScreenshotsUnvalidated, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: ready for upload.",
      "Raw Capture Matrix",
      "Production Composition Matrix",
      "Device Wells",
      "headline, copy overlay, DESIGN.md, 11_STAR_EXPERIENCE.md, MobAI, Higgsfield, Remotion, ParthJadhav/app-store-screenshots, App Icon, App Preview, asc-screenshot-resize, ASC device_type, screenshot count, required, scaled, version localization ID, alpha, color space, sRGB, thumbnail, visual QA, founder approval, iPhone, iPad, Google Play, and feature graphic are mentioned.",
      "Production artwork was styled with the external screenshot skill, but no saved board state or upload orchestration proof is recorded.",
    ].join("\n"),
    "utf8",
  );
  // Also the shape guard for missingPhraseCode. This gate carried its own slugifier until
  // v0.63.0, one that only replaced spaces, so "app-store-screenshots.json" became the code
  // store_screenshots.app-store-screenshots.json.missing — a hyphen and two extra segments
  // inside what is supposed to be prefix.name.missing. The shared helper collapses every
  // non-alphanumeric run, and this expectation is what fails if a local copy comes back.
  runFixture(
    "app-store-screenshots mention without board or upload orchestration fails",
    appStoreScreenshotsUnvalidated,
    "check-store-screenshots.ts",
    1,
    "store_screenshots.app_store_screenshots_json.missing",
  );

  // The worst of the malformed codes was a phrase carrying a slash, which put a path
  // separator inside an issue code. Pinned separately because a slug that survives a slash
  // is the case a space-only replacement can never produce.
  const screenshotsMissingSkillCredit = makeFixture("screenshots-missing-skill-credit");
  writeCompleteStoreConsole(screenshotsMissingSkillCredit);
  writeFileSync(
    path.join(screenshotsMissingSkillCredit, "SCREENSHOTS.md"),
    ["# Store Screenshots", "Status: drafting.", "Raw Capture Matrix", "Production Composition Matrix", "Device Wells"].join("\n"),
    "utf8",
  );
  runFixture(
    "a required phrase containing a slash still yields a well-formed issue code",
    screenshotsMissingSkillCredit,
    "check-store-screenshots.ts",
    1,
    "store_screenshots.parthjadhav_app_store_screenshots.missing",
  );

  const appPreviewOptional = makeFixture("app-preview-optional");
  writeCompleteStoreConsole(appPreviewOptional);
  writeCompleteStoreScreenshots(appPreviewOptional);
  writeFileSync(
    path.join(appPreviewOptional, "APP_STORE_LISTING.md"),
    readFileSync(path.join(appPreviewOptional, "APP_STORE_LISTING.md"), "utf8") +
      "\n| App Preview 1 | App Store search/product page | real in-app footage | Remotion | previews/ios-preview-1.mp4 | poster frame | optional |\n",
    "utf8",
  );
  runFixture(
    "optional first App Preview without founder deferral fails",
    appPreviewOptional,
    "check-store-screenshots.ts",
    1,
    "store_screenshots.app_preview_optional_without_deferral",
  );

  const asoOpsMissing = makeFixture("aso-ops-missing");
  runFixture("missing STORE_OPS.md skips ASO evidence", asoOpsMissing, "check-aso-evidence.ts", 0);

  const asoOpsComplete = makeFixture("aso-ops-complete");
  writeCompleteAsoOps(asoOpsComplete);
  runFixture("complete ASO evidence receipt with unavailable sources passes", asoOpsComplete, "check-aso-evidence.ts", 0);

  const asoOpsNoReceipt = makeFixture("aso-ops-no-receipt");
  writeFileSync(path.join(asoOpsNoReceipt, "STORE_OPS.md"), ["# Store Ops", "Keywords drafted from a paid ASO tool."].join("\n"), "utf8");
  runFixture("STORE_OPS.md without an ASO Evidence Receipt fails", asoOpsNoReceipt, "check-aso-evidence.ts", 1, "aso_evidence.receipt_heading_missing");

  const asoOpsFabricated = makeFixture("aso-ops-unavailable-fabricated");
  writeCompleteAsoOps(asoOpsFabricated);
  writeFileSync(
    path.join(asoOpsFabricated, "STORE_OPS.md"),
    readFileSync(path.join(asoOpsFabricated, "STORE_OPS.md"), "utf8").replace(
      "| rank | asc optimize keywords rank | unavailable | none | public storefront window |",
      "| rank | asc optimize keywords rank | unavailable | 0 | public storefront window |",
    ),
    "utf8",
  );
  runFixture("unavailable Apple rank recorded as zero fails", asoOpsFabricated, "check-aso-evidence.ts", 1, "aso_evidence.unavailable_fabricated");

  const asoOpsDiscoverNoAds = makeFixture("aso-ops-discover-no-ads");
  writeCompleteAsoOps(asoOpsDiscoverNoAds);
  writeFileSync(
    path.join(asoOpsDiscoverNoAds, "STORE_OPS.md"),
    readFileSync(path.join(asoOpsDiscoverNoAds, "STORE_OPS.md"), "utf8").replace(
      "| discover | asc optimize keywords discover | unavailable | none | Apple Ads account required |",
      "| discover | asc optimize keywords discover | available | suggestion list | Apple Ads account required |",
    ),
    "utf8",
  );
  runFixture(
    "discover marked available without Apple Ads authorization fails",
    asoOpsDiscoverNoAds,
    "check-aso-evidence.ts",
    1,
    "aso_evidence.ads_read_without_authorization",
  );

  const asoOpsAutoApply = makeFixture("aso-ops-auto-apply");
  writeCompleteAsoOps(asoOpsAutoApply);
  writeFileSync(
    path.join(asoOpsAutoApply, "STORE_OPS.md"),
    `${readFileSync(path.join(asoOpsAutoApply, "STORE_OPS.md"), "utf8")}\nAuto-applied keywords to App Store Connect.\n`,
    "utf8",
  );
  runFixture("auto-applied ASO metadata fails", asoOpsAutoApply, "check-aso-evidence.ts", 1, "aso_evidence.auto_apply");

  const asoOpsAdsAuthorized = makeFixture("aso-ops-ads-authorized");
  writeCompleteAsoOps(asoOpsAdsAuthorized);
  writeFileSync(
    path.join(asoOpsAdsAuthorized, "STORE_OPS.md"),
    [
      readFileSync(path.join(asoOpsAdsAuthorized, "STORE_OPS.md"), "utf8").replace(
        "| discover | asc optimize keywords discover | unavailable | none | Apple Ads account required |",
        "| discover | asc optimize keywords discover | available | Apple Ads suggestions | authorized Apple Ads profile |",
      ),
      "Apple Ads profile is authorized for read-only discover.",
    ].join("\n"),
    "utf8",
  );
  runFixture("discover available with authorized Apple Ads passes", asoOpsAdsAuthorized, "check-aso-evidence.ts", 0);

  registerAppReviewContract(h);
}

function registerAppReviewContract(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture } = h;

  runFixture("missing App Review state skips the observe contract", makeFixture("app-review-missing"), "check-app-review-contract.ts", 0);

  const editedWithoutState = makeFixture("app-review-edited-without-state");
  writeFileSync(path.join(editedWithoutState, "store/APP_REVIEW.md"), "Apple review is being watched. No action is needed from you right now.\n", "utf8");
  runFixture(
    "edited App Review markdown without durable state fails",
    editedWithoutState,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.state_missing",
  );

  const invalidState = makeEmptyFixture("app-review-invalid-state");
  mkdirSync(path.join(invalidState, "run"), { recursive: true });
  writeFileSync(path.join(invalidState, "run/app-review.json"), "{not-json\n", "utf8");
  runFixture("invalid existing App Review state fails closed", invalidState, "check-app-review-contract.ts", 1, "app_review_contract.state_invalid");

  const watching = makeEmptyFixture("app-review-watching");
  writeAppReviewWatching(watching);
  runFixture("known waiting-for-review observe state passes", watching, "check-app-review-contract.ts", 0);

  const unknownOk = makeEmptyFixture("app-review-unknown-fail-closed");
  const unknownDoc = readAppReview(watching);
  unknownDoc.currentCase.appVersion.rawValue = "FUTURE_APPLE_STATE";
  unknownDoc.currentCase.appVersion.normalized = "unknown_provider_state";
  unknownDoc.currentCase.blocker = "unknown_provider_state";
  unknownDoc.currentCase.status = "blocked";
  writeAppReview(unknownOk, unknownDoc);
  runFixture("unknown Apple state that fails closed passes", unknownOk, "check-app-review-contract.ts", 0);

  const unknownCollapsed = makeEmptyFixture("app-review-unknown-collapsed");
  const collapsed = structuredClone(unknownDoc);
  collapsed.currentCase.blocker = "none";
  collapsed.currentCase.status = "observing";
  writeAppReview(unknownCollapsed, collapsed);
  runFixture(
    "unknown Apple state collapsed to none fails",
    unknownCollapsed,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.unknown_state_not_fail_closed",
  );

  const pendingBad = makeEmptyFixture("app-review-pending-not-founder");
  const pendingDoc = readAppReview(watching);
  const latest = pendingDoc.events[pendingDoc.events.length - 1];
  if (latest) {
    latest.kind = "observation";
    latest.agreement = { rawStatus: "PENDING", pending: true, normalized: "pending" };
  }
  pendingDoc.currentCase.blocker = "none";
  writeAppReview(pendingBad, pendingDoc);
  runFixture(
    "pending agreement without founder_action_required fails",
    pendingBad,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.pending_agreement_not_founder_action",
  );

  const missing49 = makeEmptyFixture("app-review-missing-49");
  const missingDoc = readAppReview(watching);
  const validate = missingDoc.capabilityReceipt.capabilities.find((probe) => probe.id === "asc.metadata.validate");
  if (validate) {
    validate.available = false;
    validate.shapeOk = false;
    validate.evidence = "missing";
  }
  missingDoc.capabilityReceipt.failClosed = false;
  missingDoc.currentCase.blocker = "none";
  writeAppReview(missing49, missingDoc);
  runFixture(
    "missing 4.9 capability that does not fail closed fails",
    missing49,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.capability_not_fail_closed",
  );

  const acceptMd = makeFixture("app-review-accept-markdown");
  writeFileSync(path.join(acceptMd, "store/APP_REVIEW.md"), "Run `asc web agreements accept` to continue.\n", "utf8");
  runFixture("APP_REVIEW.md that emits agreements accept fails", acceptMd, "check-app-review-contract.ts", 1, "app_review_contract.agreements_accept_emitted");

  const serveMd = makeFixture("app-review-webhooks-serve");
  writeFileSync(path.join(serveMd, "store/APP_REVIEW.md"), "Run `asc webhooks serve --allow-remote` to wait for Apple.\n", "utf8");
  runFixture("APP_REVIEW.md that emits webhooks serve fails", serveMd, "check-app-review-contract.ts", 1, "app_review_contract.webhooks_serve_emitted");

  const submitMd = makeFixture("app-review-submit-markdown");
  writeFileSync(path.join(submitMd, "store/APP_REVIEW.md"), "Run `asc review submit` after the bounded fix.\n", "utf8");
  runFixture("APP_REVIEW.md that emits review submit fails", submitMd, "check-app-review-contract.ts", 1, "app_review_contract.store_submission_emitted");

  const duplicateWebhookIds = makeEmptyFixture("app-review-duplicate-webhook-ids");
  writeAppReviewWatching(duplicateWebhookIds);
  const duplicateWebhookDoc = JSON.parse(readFileSync(path.join(duplicateWebhookIds, "run", "app-review.json"), "utf8")) as {
    webhookIngress: { acceptedEventIds: string[] };
  };
  duplicateWebhookDoc.webhookIngress.acceptedEventIds = ["evt-1", "evt-1"];
  writeFileSync(path.join(duplicateWebhookIds, "run", "app-review.json"), `${JSON.stringify(duplicateWebhookDoc, null, 2)}\n`, "utf8");
  runFixture(
    "duplicate accepted webhook event ids fail",
    duplicateWebhookIds,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.webhook_event_id_duplicate",
  );

  const webhookSecretPersisted = makeEmptyFixture("app-review-webhook-secret-persisted");
  writeAppReviewWatching(webhookSecretPersisted);
  const secretDoc = JSON.parse(readFileSync(path.join(webhookSecretPersisted, "run", "app-review.json"), "utf8")) as {
    webhookIngress: { lastEnvelope?: Record<string, string> };
  };
  secretDoc.webhookIngress.lastEnvelope = {
    providerEventId: "evt-1",
    eventType: "WEBHOOK_PING",
    providerTimestamp: "2026-08-24T12:00:00.000Z",
    rawBodySha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    receivedAt: "2026-08-24T12:00:00.000Z",
    secretId: "B2C_APP_BUILDER_ASC_WEBHOOK_SECRET",
  };
  writeFileSync(path.join(webhookSecretPersisted, "run", "app-review.json"), `${JSON.stringify(secretDoc, null, 2)}\n`, "utf8");
  runFixture("persisted webhook secret id fails", webhookSecretPersisted, "check-app-review-contract.ts", 1, "app_review_contract.secret_or_reviewer_body");

  const unresolvedMissing = makeEmptyFixture("app-review-unresolved-missing-packet");
  writeAppReviewWatching(unresolvedMissing);
  const unresolvedDoc = readAppReview(unresolvedMissing);
  if (unresolvedDoc.currentCase.reviewSubmission) {
    unresolvedDoc.currentCase.reviewSubmission.rawValue = "UNRESOLVED_ISSUES";
    unresolvedDoc.currentCase.reviewSubmission.normalized = "unresolved_issues";
  }
  unresolvedDoc.currentCase.blocker = "unresolved_issues";
  unresolvedDoc.currentCase.status = "blocked";
  writeAppReview(unresolvedMissing, unresolvedDoc);
  runFixture("unresolved issues without packet or handoff fail", unresolvedMissing, "check-app-review-contract.ts", 1, "app_review_contract.packet_missing");

  const unsupportedWatch = makeEmptyFixture("app-review-unsupported-schema");
  writeAppReviewWatching(unsupportedWatch);
  const unsupportedDoc = JSON.parse(readFileSync(path.join(unsupportedWatch, "run", "app-review.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(path.join(unsupportedWatch, "run", "app-review.json"), `${JSON.stringify({ ...unsupportedDoc, schemaVersion: "9.0.0" }, null, 2)}\n`, "utf8");
  runFixture("unsupported App Review schema fails closed", unsupportedWatch, "check-app-review-contract.ts", 1, "app_review_contract.state_invalid");

  const discoveryDurable = makeEmptyFixture("app-review-discovery-durable");
  writeAppReviewWatching(discoveryDurable);
  const discoveryDoc = JSON.parse(readFileSync(path.join(discoveryDurable, "run", "app-review.json"), "utf8")) as Record<string, unknown>;
  const discoveryCase = discoveryDoc.currentCase as Record<string, unknown>;
  discoveryCase.rejectionPacket = {
    packetId: "packet.discovery",
    appId: "123456789",
    submissionId: "rs-1",
    selection: "latest-unresolved",
    selectionIsDurable: true,
    retrievedAt: "2026-08-24T12:00:00.000Z",
    cliVersion: "4.9.0",
    packetFingerprint: "a".repeat(64),
    incomplete: false,
    threads: [],
    messages: [
      { messageId: "m1", threadId: "t1", fromReviewer: true, bodyFingerprint: "b".repeat(64), bodyByteLength: 12, attachmentIds: [], rejectionIds: [] },
    ],
    reasons: [{ reasonId: "r1", summaryFingerprint: "c".repeat(64), relatedItemIds: [] }],
    attachments: [],
  };
  writeFileSync(path.join(discoveryDurable, "run", "app-review.json"), `${JSON.stringify(discoveryDoc, null, 2)}\n`, "utf8");
  runFixture(
    "latest-unresolved packet marked durable fails",
    discoveryDurable,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.packet_discovery_marked_durable",
  );

  const duplicatePaths = makeEmptyFixture("app-review-duplicate-paths");
  writeAppReviewWatching(duplicatePaths);
  const duplicateDoc = JSON.parse(readFileSync(path.join(duplicatePaths, "run", "app-review.json"), "utf8")) as Record<string, unknown>;
  const duplicateCase = duplicateDoc.currentCase as Record<string, unknown>;
  duplicateCase.rejectionPacket = {
    packetId: "packet.dup",
    appId: "123456789",
    submissionId: "rs-1",
    selection: "explicit",
    selectionIsDurable: true,
    retrievedAt: "2026-08-24T12:00:00.000Z",
    cliVersion: "4.9.0",
    packetFingerprint: "d".repeat(64),
    incomplete: false,
    threads: [],
    messages: [
      { messageId: "m1", threadId: "t1", fromReviewer: true, bodyFingerprint: "e".repeat(64), bodyByteLength: 12, attachmentIds: [], rejectionIds: [] },
    ],
    reasons: [{ reasonId: "r1", summaryFingerprint: "f".repeat(64), relatedItemIds: [] }],
    attachments: [
      {
        attachmentId: "att-1",
        sourceType: "reviewRejection",
        originalFileNameFingerprint: "g".repeat(64),
        storedRelativePath: "shot.png",
        sha256: "h".repeat(64),
        byteLength: 8,
        downloadFailed: false,
        pathRejected: false,
      },
      {
        attachmentId: "att-2",
        sourceType: "reviewRejection",
        originalFileNameFingerprint: "i".repeat(64),
        storedRelativePath: "shot.png",
        sha256: "j".repeat(64),
        byteLength: 8,
        downloadFailed: false,
        pathRejected: false,
      },
    ],
  };
  writeFileSync(path.join(duplicatePaths, "run", "app-review.json"), `${JSON.stringify(duplicateDoc, null, 2)}\n`, "utf8");
  runFixture(
    "duplicate attachment evidence paths fail",
    duplicatePaths,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.packet_duplicate_evidence_path",
  );

  const protectedApplied = makeEmptyFixture("app-review-protected-applied");
  writeAppReviewWatching(protectedApplied);
  const protectedDoc = JSON.parse(readFileSync(path.join(protectedApplied, "run", "app-review.json"), "utf8")) as {
    currentCase: Record<string, unknown>;
  };
  protectedDoc.currentCase.classification = {
    kind: "legal_policy",
    confidence: "medium",
    citedFingerprints: ["d".repeat(64)],
    affectedItemIds: ["asv-1"],
    newBuildRequired: false,
    implementationStatus: "applied",
    rationaleKind: "structured_reason",
  };
  protectedDoc.currentCase.remediation = sampleRemediation({
    route: "parked",
    disposition: "park",
    status: "applied",
    consumer: true,
  });
  writeFileSync(path.join(protectedApplied, "run", "app-review.json"), `${JSON.stringify(protectedDoc, null, 2)}\n`, "utf8");
  runFixture(
    "protected policy case with consumer mutation fails",
    protectedApplied,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.protected_case_not_parked",
  );

  const binaryNoArchive = makeEmptyFixture("app-review-binary-no-archive");
  writeAppReviewWatching(binaryNoArchive);
  const binaryDoc = JSON.parse(readFileSync(path.join(binaryNoArchive, "run", "app-review.json"), "utf8")) as {
    currentCase: Record<string, unknown>;
  };
  binaryDoc.currentCase.classification = {
    kind: "invalid_binary",
    confidence: "high",
    citedFingerprints: [],
    affectedItemIds: ["asv-1"],
    newBuildRequired: true,
    implementationStatus: "verified",
    rationaleKind: "layer_state",
  };
  binaryDoc.currentCase.remediation = sampleRemediation({
    route: "new_binary",
    disposition: "implement",
    status: "verified",
    consumer: true,
  });
  writeFileSync(path.join(binaryNoArchive, "run", "app-review.json"), `${JSON.stringify(binaryDoc, null, 2)}\n`, "utf8");
  runFixture(
    "verified binary repair without a new archive fails",
    binaryNoArchive,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.binary_missing_archive",
  );

  const metadataNoPreflight = makeEmptyFixture("app-review-metadata-no-preflight");
  writeAppReviewWatching(metadataNoPreflight);
  const metadataDoc = JSON.parse(readFileSync(path.join(metadataNoPreflight, "run", "app-review.json"), "utf8")) as {
    currentCase: Record<string, unknown>;
  };
  metadataDoc.currentCase.classification = {
    kind: "metadata_rejected",
    confidence: "high",
    citedFingerprints: [],
    affectedItemIds: ["asv-1"],
    newBuildRequired: false,
    implementationStatus: "applied",
    rationaleKind: "layer_state",
  };
  metadataDoc.currentCase.remediation = sampleRemediation({
    route: "same_build_metadata",
    disposition: "implement",
    status: "applied",
    consumer: true,
  });
  writeFileSync(path.join(metadataNoPreflight, "run", "app-review.json"), `${JSON.stringify(metadataDoc, null, 2)}\n`, "utf8");
  runFixture(
    "applied metadata repair without validate and dry-run fails",
    metadataNoPreflight,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.metadata_preflight_missing",
  );

  const selfVerifyWhitespace = makeEmptyFixture("app-review-self-verify-whitespace");
  writeAppReviewWatching(selfVerifyWhitespace);
  const selfVerifyDoc = JSON.parse(readFileSync(path.join(selfVerifyWhitespace, "run", "app-review.json"), "utf8")) as {
    currentCase: Record<string, unknown>;
  };
  selfVerifyDoc.currentCase.classification = {
    kind: "metadata_rejected",
    confidence: "high",
    citedFingerprints: [],
    affectedItemIds: ["asv-1"],
    newBuildRequired: false,
    implementationStatus: "verified",
    rationaleKind: "layer_state",
  };
  selfVerifyDoc.currentCase.remediation = {
    ...sampleRemediation({
      route: "same_build_metadata",
      disposition: "implement",
      status: "verified",
      consumer: true,
      producerSessionId: "session",
    }),
    metadataPreflight: { validatePassed: true, dryRunPassed: true, evidenceFingerprint: "a".repeat(64) },
    verification: {
      producerSessionId: "session",
      verifierSessionId: "session ",
      accepted: true,
      recordedAt: "2026-08-24T13:10:00.000Z",
    },
  };
  writeFileSync(path.join(selfVerifyWhitespace, "run", "app-review.json"), `${JSON.stringify(selfVerifyDoc, null, 2)}\n`, "utf8");
  runFixture(
    "verifier that matches the stored producer after trim fails",
    selfVerifyWhitespace,
    "check-app-review-contract.ts",
    1,
    "app_review_contract.verifier_not_independent",
  );
}

function watchingPack(): FixtureProviderPack {
  return {
    capabilities: {
      observedCliVersion: "4.9.0",
      capabilitiesText: "version capabilities review metadata web webhooks",
      helpByCommand: {
        review: "status history doctor submit",
        metadata: "pull plan apply validate push --dry-run",
        web: "agreements status review auth",
        "web-auth": "login status capabilities logout",
        "web-review": "list show subscriptions iaps",
        webhooks: "list view ping deliveries serve",
      },
      schemaIds: ["APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "AppStoreVersion", "ReviewSubmission", "ReviewSubmissionItem"],
    },
    snapshot: {
      providerTimestamp: "2026-08-24T12:00:00.000Z",
      providerEventId: "apple-event-1",
      layers: [
        { layer: "app_version", rawValue: "WAITING_FOR_REVIEW", providerObjectId: "asv-1", schemaId: "AppStoreVersion" },
        { layer: "review_submission", rawValue: "WAITING_FOR_REVIEW", providerObjectId: "rs-1", schemaId: "ReviewSubmission" },
        { layer: "submission_item", rawValue: "WAITING_FOR_REVIEW", providerObjectId: "rsi-1", schemaId: "ReviewSubmissionItem" },
      ],
      agreement: { rawStatus: "NONE", pending: false },
    },
  };
}

function writeAppReviewWatching(root: string): void {
  const state = startObserveMandate(
    {
      mandateId: "ocho-1.0.0",
      appleTeamId: "TEAMID",
      appId: "123456789",
      bundleId: "com.example.app",
      platform: "IOS",
      marketingVersion: "1.0.0",
      startedAt: "2026-08-24T12:00:00.000Z",
      expiresAt: "2026-09-24T12:00:00.000Z",
    },
    createFixtureProvider(watchingPack()),
    "2026-08-24T12:00:00.000Z",
  );
  mkdirSync(path.join(root, "run"), { recursive: true });
  writeAppReviewState(path.join(root, "run", "app-review.json"), state);
}

function readAppReview(root: string): MutableAppReview {
  return JSON.parse(readFileSync(path.join(root, "run", "app-review.json"), "utf8")) as MutableAppReview;
}

function writeAppReview(root: string, state: MutableAppReview): void {
  mkdirSync(path.join(root, "run"), { recursive: true });
  writeFileSync(path.join(root, "run", "app-review.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function sampleRemediation(input: {
  readonly route: string;
  readonly disposition: string;
  readonly status: string;
  readonly consumer?: boolean;
  readonly producerSessionId?: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    plan: {
      planId: "plan.app-review.ocho-1.0.0.1.test",
      route: input.route,
      disposition: input.disposition,
      newBinaryRequired: input.route === "new_binary",
      affectedPaths: input.disposition === "implement" ? ["store/app-store-listing/APP_STORE_LISTING.md"] : [],
      patches: [],
      testsAndValidators: ["check:app-review-contract"],
      authorizationNeeded: input.disposition === "park" ? ["founder"] : ["consumer-repo"],
      rollback: "Revert the named consumer-repo paths.",
    },
    occurrence: {
      workflowId: "workflow.store.app-review-remediate",
      occurrenceId: "wo.app-review.ocho-1.0.0.1",
      attemptNumber: 1,
      attemptIds: ["attempt.app-review.ocho-1.0.0.1.1"],
      status: input.status === "parked" ? "refused" : input.status === "verified" ? "proved" : "running",
    },
    ...(input.consumer
      ? {
          consumer: {
            sourceRevision: "a".repeat(64),
            appliedPaths: ["store/app-store-listing/APP_STORE_LISTING.md"],
            appliedAt: "2026-08-24T13:00:00.000Z",
            producerSessionId: input.producerSessionId ?? "session-producer",
          },
        }
      : {}),
  };
}

interface MutableAppReview {
  capabilityReceipt: {
    failClosed: boolean;
    capabilities: Array<{ id: string; available: boolean; shapeOk: boolean; evidence: string }>;
  };
  events: Array<{ kind: string; agreement: { rawStatus: string; pending: boolean; normalized: string } }>;
  currentCase: {
    status: string;
    blocker: string;
    appVersion: { rawValue: string; normalized: string };
    reviewSubmission?: { rawValue: string; normalized: string };
  };
}
