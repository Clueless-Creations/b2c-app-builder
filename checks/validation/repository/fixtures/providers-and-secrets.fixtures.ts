import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type Harness,
  expectRecord,
  getLane,
  getTools,
  readState,
  skillRoot,
  writeCompleteAiProviderControls,
  writeCompletePriceDerivation,
  writeCompleteSecurity,
  writeCurrentExperimentProgram,
  writeState,
} from "./_harness.js";

export function register(h: Harness): void {
  const { makeFixture, runFixture } = h;

  const nestedEnv = makeFixture("nested-env");
  mkdirSync(path.join(nestedEnv, "config"), { recursive: true });
  writeFileSync(path.join(nestedEnv, "config", ".env"), "POSTHOG_PROJECT_API_KEY=example\n", "utf8");
  runFixture("nested .env fails secret routing", nestedEnv, "check-secret-routing.ts", 1, "secrets.forbidden_file..env");

  const rawEnvExample = makeFixture("raw-env-example");
  mkdirSync(path.join(rawEnvExample, "trust", "secrets"), { recursive: true });
  writeFileSync(path.join(rawEnvExample, "trust", "secrets", ".env.example"), "STRIPE_SECRET_KEY=sk_test_1234567890abcdef\n", "utf8");
  runFixture("raw-looking test key in .env.example fails", rawEnvExample, "check-secret-routing.ts", 1, "secrets.raw_secret_pattern");

  const missingSecretEntry = makeFixture("missing-secret-entry");
  const missingSecretState = readState(missingSecretEntry);
  const missingSecretTools = getTools(missingSecretState);
  expectRecord(missingSecretTools["resend"], "providers.resend")["requiredSecrets"] = [];
  writeState(missingSecretEntry, missingSecretState);
  writeFileSync(
    path.join(missingSecretEntry, "SECRETS.md"),
    "# Secrets\n\nNo raw secrets. Provider: Doppler. CI and production use `doppler run --`.\n",
    "utf8",
  );
  mkdirSync(path.join(missingSecretEntry, "src"), { recursive: true });
  writeFileSync(path.join(missingSecretEntry, "src", "email.ts"), "export const resendKey = process.env.RESEND_API_KEY;\n", "utf8");
  runFixture(
    "code secret reference missing from state and secrets doc fails",
    missingSecretEntry,
    "check-secret-routing.ts",
    1,
    "secrets.RESEND_API_KEY.unrouted",
  );

  // accessRoute: the typed mechanism vocabulary on provider entries. Enum membership is an
  // error, the manifest cross-check (chosen route must be one the provider declares) is an
  // error, missing/not_selected is a warning, and a tool with no provisioning-manifest entry
  // (cloudflare) skips the cross-check entirely.
  const invalidAccessRoute = makeFixture("invalid-access-route");
  const invalidAccessRouteState = readState(invalidAccessRoute);
  expectRecord(getTools(invalidAccessRouteState)["posthog"], "providers.posthog")["accessRoute"] = "carrier_pigeon";
  writeState(invalidAccessRoute, invalidAccessRouteState);
  runFixture("unknown accessRoute value fails", invalidAccessRoute, "validate-project-state.ts", 1, "project_state.invalid_schema");

  const undeclaredAccessRoute = makeFixture("undeclared-access-route");
  const undeclaredAccessRouteState = readState(undeclaredAccessRoute);
  expectRecord(getTools(undeclaredAccessRouteState)["higgsfield"], "providers.higgsfield")["accessRoute"] = "browser";
  writeState(undeclaredAccessRoute, undeclaredAccessRouteState);
  runFixture(
    "accessRoute the provider does not declare fails",
    undeclaredAccessRoute,
    "validate-project-state.ts",
    1,
    "providers.higgsfield.accessRoute.undeclared",
  );

  const unselectedAccessRoute = makeFixture("unselected-access-route");
  runFixture("not_selected accessRoute passes with a warning", unselectedAccessRoute, "validate-project-state.ts", 0, "providers.doppler.accessRoute.missing");

  const nonManifestAccessRoute = makeFixture("non-manifest-access-route");
  const nonManifestAccessRouteState = readState(nonManifestAccessRoute);
  expectRecord(getTools(nonManifestAccessRouteState)["cloudflare"], "providers.cloudflare")["accessRoute"] = "api";
  writeState(nonManifestAccessRoute, nonManifestAccessRouteState);
  runFixture(
    "a concrete route on a tool with no manifest entry skips the cross-check",
    nonManifestAccessRoute,
    "validate-project-state.ts",
    0,
    undefined,
    [],
    undefined,
    "accessRoute.undeclared",
  );

  // The credential-extraction scan matches command names, and the command names
  // have to be word-bounded. Unanchored, `sed` matched inside ordinary prose —
  // "closed", "exposed", "compromised" — so any incident write-up that also said
  // "credentials" was reported as an extraction snippet. The gate was failing the
  // security docs it exists to protect, and the only ways out were editing shared
  // tooling or doctoring a dated incident record.
  const extractionProse = makeFixture("credential-extraction-prose");
  mkdirSync(path.join(extractionProse, "incidents"), { recursive: true });
  writeFileSync(
    path.join(extractionProse, "incidents", "2026-07-15-review.md"),
    [
      "# Incident review",
      "",
      "- fail-closed guard | PASS — anonymous credentials rejected",
      "- treat the exposed account as compromised and rotate its credentials",
      "- we parsed the response before any credentials were stored",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "prose using closed/exposed/compromised near 'credentials' is not an extraction snippet",
    extractionProse,
    "check-secret-routing.ts",
    0,
    undefined,
    [],
    undefined,
    "secrets.credential_extraction_in_markdown",
  );

  // ...and the snippet the gate actually exists for still warns.
  const extractionSnippet = makeFixture("credential-extraction-snippet");
  mkdirSync(path.join(extractionSnippet, "docs"), { recursive: true });
  writeFileSync(
    path.join(extractionSnippet, "docs", "store-notes.md"),
    ["# Store notes", "", "VAR=$(awk -F= '/^ASC_ISSUER=/{print $2}' /path/to/file.env)", ""].join("\n"),
    "utf8",
  );
  runFixture(
    "a real awk extraction snippet in committed markdown still warns",
    extractionSnippet,
    "check-secret-routing.ts",
    0,
    "secrets.credential_extraction_in_markdown",
  );

  // Word boundaries exclude prefixed executables too, so the variants are
  // enumerated. GNU-prefixed (`gawk`, `gsed`, `ggrep`) and compression-wrapper
  // (`zgrep`, `bzgrep`, `xzgrep`) forms extract the same raw values and were
  // only ever caught by substring luck; each one gets a line here so the
  // enumeration cannot silently rot back to catching just the three bare names.
  // A prefix wildcard would be shorter and wrong — English words end in these
  // tokens, which is the exact bug this gate just fixed.
  const extractionVariants = [
    "gawk",
    "mawk",
    "nawk",
    "gsed",
    "ggrep",
    "egrep",
    "fgrep",
    "rg",
    "ripgrep",
    "zgrep",
    "zegrep",
    "zfgrep",
    "bzgrep",
    "bzegrep",
    "bzfgrep",
    "xzgrep",
    "xzegrep",
    "xzfgrep",
    "lzgrep",
    "zstdgrep",
  ];
  for (const command of extractionVariants) {
    const variantRoot = makeFixture(`credential-extraction-${command}`);
    mkdirSync(path.join(variantRoot, "docs"), { recursive: true });
    writeFileSync(
      path.join(variantRoot, "docs", "store-notes.md"),
      ["# Store notes", "", `VAR=$(${command} '^ASC_ISSUER=' /path/to/file.env)`, ""].join("\n"),
      "utf8",
    );
    runFixture(
      `${command} extraction snippet in committed markdown still warns`,
      variantRoot,
      "check-secret-routing.ts",
      0,
      "secrets.credential_extraction_in_markdown",
    );
  }

  // ...and the boundaries still hold against the prose that looks like them.
  const extractionNearMiss = makeFixture("credential-extraction-near-miss");
  mkdirSync(path.join(extractionNearMiss, "incidents"), { recursive: true });
  writeFileSync(
    path.join(extractionNearMiss, "incidents", "2026-07-16-review.md"),
    [
      "# Incident review",
      "",
      "- awkward handling of credentials, and grepping around for credentials",
      "- our org rotated the rgb theme and its credentials",
      "- a squawk about the mohawk build, and the credentials it used",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "awkward/grepping/squawk/mohawk/org/rgb near 'credentials' are not extraction commands",
    extractionNearMiss,
    "check-secret-routing.ts",
    0,
    undefined,
    [],
    undefined,
    "secrets.credential_extraction_in_markdown",
  );

  // The exemption for the skill's own guidance prose is named for the directory
  // that prose lives in, so a rename can kill it silently. `references/` became
  // `knowledge/` in v0.53.0 and the exemption kept naming the old directory for
  // eight releases: it matched nothing, and the gate warned about
  // knowledge/operations/secrets-management.md, the document whose whole job is to
  // describe credential handling. These two fixtures pin the exemption to a name
  // that exists and prove it is still scoped rather than blanket.
  const extractionPlaybook = makeFixture("credential-extraction-playbook-exempt");
  mkdirSync(path.join(extractionPlaybook, "knowledge", "operations"), { recursive: true });
  writeFileSync(
    path.join(extractionPlaybook, "knowledge", "operations", "secrets-management.md"),
    ["# Secrets management", "", "Never do this:", "", "VAR=$(awk -F= '/^ASC_ISSUER=/{print $2}' /path/to/file.env)", ""].join("\n"),
    "utf8",
  );
  runFixture(
    "the skill's own playbook prose may describe an extraction snippet",
    extractionPlaybook,
    "check-secret-routing.ts",
    0,
    undefined,
    [],
    undefined,
    "secrets.credential_extraction_in_markdown",
  );

  // The old name must not still buy a pass, or the rename would be cosmetic and
  // an app repo could silence this gate by naming a directory `references/`.
  const extractionOldName = makeFixture("credential-extraction-references-not-exempt");
  mkdirSync(path.join(extractionOldName, "references"), { recursive: true });
  writeFileSync(
    path.join(extractionOldName, "references", "notes.md"),
    ["# Notes", "", "VAR=$(awk -F= '/^ASC_ISSUER=/{print $2}' /path/to/file.env)", ""].join("\n"),
    "utf8",
  );
  runFixture(
    "an app-side references/ directory is not the skill's playbook and still warns",
    extractionOldName,
    "check-secret-routing.ts",
    0,
    "secrets.credential_extraction_in_markdown",
  );

  const missingSecurity = makeFixture("missing-security");
  rmSync(path.join(missingSecurity, "trust/SECURITY.md"), { force: true });
  runFixture("missing security packet fails", missingSecurity, "check-security-release.ts", 1, "security.markdown_missing");

  const thinSecurity = makeFixture("thin-security");
  writeFileSync(path.join(thinSecurity, "trust/SECURITY.md"), ["# Security", "We will be secure.", "Sentry is planned."].join("\n"), "utf8");
  runFixture("thin security packet fails", thinSecurity, "check-security-release.ts", 1, "security.source_basis.missing");

  const unresolvedSecurity = makeFixture("unresolved-security");
  writeCompleteSecurity(unresolvedSecurity);
  writeFileSync(
    path.join(unresolvedSecurity, "trust/SECURITY.md"),
    [
      "# Security Release Plan",
      "Source Basis: OWASP MASVS, OWASP ASVS, Apple Platform Security, Android security best practices, Claude Security, Codex Security, MobSF, Doppler, Sentry.",
      "Security Review Tool Routing: free fallback requires founder approval.",
      "Threat Model: Assets, Trust Boundaries, Attacker Capabilities, and Data Classification are present.",
      "Mobile Hardening: Keychain, App Transport Security, App Attest, DeviceCheck, entitlements, store/APPLE_SIGNING.md, Android Keystore, Network Security Config, and Play Integrity are listed.",
      "Authentication and Authorization protect Backend and API routes. Secrets use Doppler.",
      "Revenue, Entitlements, RevenueCat, Stripe, restore, webhook, and idempotency are covered.",
      "Privacy and Analytics include PostHog, session replay, PII, PII scrubbing, and self-reported attribution.",
      "Email security includes SPF, DKIM, DMARC, unsubscribe, and Resend. Public web uses security.txt and security headers.",
      "Supply Chain, Monitoring, Incident Response, Release Checks, Accepted Risks, Founder Approval, Sentry, release health, and MobSF are covered.",
      "App Attest is pending.",
    ].join("\n"),
    "utf8",
  );
  runFixture("security packet with unresolved platform gate fails", unresolvedSecurity, "check-security-release.ts", 1, "security.placeholder_or_unknown");

  // --- check-privacy-terms ---
  const cleanPrivacy = makeFixture("clean-privacy-terms");
  runFixture("shipped privacy/terms/AI-safety packet passes", cleanPrivacy, "check-privacy-terms.ts", 0);

  const missingPrivacyPolicy = makeFixture("missing-privacy-policy");
  rmSync(path.join(missingPrivacyPolicy, "trust/PRIVACY.md"), { force: true });
  runFixture("missing trust/PRIVACY.md fails", missingPrivacyPolicy, "check-privacy-terms.ts", 1, "privacy.policy_missing");

  const missingDataCollectionDisclosure = makeFixture("missing-data-collection-disclosure");
  writeFileSync(
    path.join(missingDataCollectionDisclosure, "trust/PRIVACY.md"),
    [
      "# Privacy",
      "",
      "## Third-Party Recipients And Vendors",
      "",
      "We use analytics and payment vendors.",
      "",
      "## Retention And Deletion",
      "",
      "Deleted on request; retention is 30 days.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "trust/PRIVACY.md with no findable data-collection disclosure fails",
    missingDataCollectionDisclosure,
    "check-privacy-terms.ts",
    1,
    "privacy.data_collection_disclosure_missing",
  );

  const missingThirdPartyDisclosure = makeFixture("missing-third-party-disclosure");
  writeFileSync(
    path.join(missingThirdPartyDisclosure, "trust/PRIVACY.md"),
    [
      "# Privacy",
      "",
      "## What We Collect",
      "",
      "We collect your email and usage data.",
      "",
      "## Retention And Deletion",
      "",
      "Deleted on request; retention is 30 days.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "trust/PRIVACY.md naming no third-party/vendor recipients fails",
    missingThirdPartyDisclosure,
    "check-privacy-terms.ts",
    1,
    "privacy.third_party_disclosure_missing",
  );

  const cancellationNotSelfService = makeFixture("cancellation-not-self-service");
  writeFileSync(
    path.join(cancellationNotSelfService, "trust/TERMS.md"),
    ["# Terms", "", "## Subscriptions And Refunds", "", "Subscriptions auto-renew monthly. Email support to change your plan."].join("\n"),
    "utf8",
  );
  runFixture(
    "trust/TERMS.md with no self-service cancellation path fails",
    cancellationNotSelfService,
    "check-privacy-terms.ts",
    1,
    "privacy.cancellation_not_self_service",
  );

  const autoRenewalNoReminder = makeFixture("auto-renewal-no-reminder");
  writeFileSync(
    path.join(autoRenewalNoReminder, "trust/TERMS.md"),
    ["# Terms", "", "## Subscriptions And Refunds", "", "Subscriptions auto-renew monthly at the listed price. Cancel any time in account settings."].join(
      "\n",
    ),
    "utf8",
  );
  runFixture(
    "trust/TERMS.md disclosing auto-renewal with no reminder commitment fails",
    autoRenewalNoReminder,
    "check-privacy-terms.ts",
    1,
    "privacy.auto_renewal_reminder_missing",
  );

  const selfHarmResponseMissing = makeFixture("self-harm-response-missing");
  writeFileSync(
    path.join(selfHarmResponseMissing, "trust/AI_SAFETY.md"),
    [
      "# AI Safety",
      "",
      "| Risk | Control | Owner | Test evidence | Status |",
      "| --- | --- | --- | --- | --- |",
      "| harassment | filter and block | trust | manual review | done |",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "trust/AI_SAFETY.md with no self-harm/crisis response fails",
    selfHarmResponseMissing,
    "check-privacy-terms.ts",
    1,
    "privacy.self_harm_response_missing",
  );

  const publicStorageBucket = makeFixture("public-storage-bucket");
  mkdirSync(path.join(publicStorageBucket, "engineering"), { recursive: true });
  writeFileSync(
    path.join(publicStorageBucket, "engineering", "TECH_SPEC.md"),
    ["# Tech Spec", "", "## Data Contract", "", "The user-uploads storage bucket is public so the CDN can serve images directly."].join("\n"),
    "utf8",
  );
  runFixture(
    "engineering/TECH_SPEC.md describing a public storage bucket with no mitigation fails",
    publicStorageBucket,
    "check-privacy-terms.ts",
    1,
    "privacy.public_storage_bucket",
  );

  const mitigatedStorageBucket = makeFixture("mitigated-storage-bucket");
  mkdirSync(path.join(mitigatedStorageBucket, "engineering"), { recursive: true });
  writeFileSync(
    path.join(mitigatedStorageBucket, "engineering", "TECH_SPEC.md"),
    [
      "# Tech Spec",
      "",
      "## Data Contract",
      "",
      "The user-uploads bucket is not public: every read happens through a signed URL, and Row Level Security denies anonymous access.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "engineering/TECH_SPEC.md describing a private bucket with signed URLs passes",
    mitigatedStorageBucket,
    "check-privacy-terms.ts",
    0,
    undefined,
    [],
    undefined,
    "privacy.public_storage_bucket",
  );

  // --- check-revenue ---
  const revenueBaseline = makeFixture("revenue-baseline");
  runFixture("shipped revenue template passes before the lane is claimed", revenueBaseline, "check-revenue.ts", 0);

  const revenueDoneNoProof = makeFixture("revenue-done-no-proof");
  const revenueDoneNoProofState = readState(revenueDoneNoProof);
  getLane(revenueDoneNoProofState, "revenue")["status"] = "succeeded";
  writeState(revenueDoneNoProof, revenueDoneNoProofState);
  runFixture("done revenue lane without a live probe artifact fails", revenueDoneNoProof, "check-revenue.ts", 1, "revenue.proof_json.missing");

  // Example-copy evasion: pasting the shipped example's content as "proof"
  // must fail even when the app repo never seeded the example file (the old
  // comparison only looked at the app repo's copy).
  const revenueExampleCopy = makeFixture("revenue-example-copy-unseeded");
  const revenueExampleCopyState = readState(revenueExampleCopy);
  getLane(revenueExampleCopyState, "revenue")["status"] = "succeeded";
  writeState(revenueExampleCopy, revenueExampleCopyState);
  const shippedExample = readFileSync(path.join(skillRoot, "examples", "workspace", "business", "revenue", "revenuecat-proof.example.json"), "utf8");
  writeFileSync(path.join(revenueExampleCopy, "revenue", "revenuecat-proof.json"), shippedExample, "utf8");
  rmSync(path.join(revenueExampleCopy, "revenue", "revenuecat-proof.example.json"), { force: true });
  runFixture(
    "done revenue lane with pasted example proof fails even when the example was never seeded",
    revenueExampleCopy,
    "check-revenue.ts",
    1,
    "revenue.proof_json.tier1_example_copy",
  );

  // The three RevenueCat traps documented in failure-cards.md each have a code
  // branch; these fixtures prove the branches actually fire. MISSING_METADATA
  // left unresolved empties the live offering; non_renewing_subscription
  // silently expires a "lifetime" unlock; an unconfirmed Release build is the
  // classic sandbox-only proof.
  const revenueMissingMetadata = makeFixture("revenue-missing-metadata-unresolved");
  const revenueMissingMetadataState = readState(revenueMissingMetadata);
  getLane(revenueMissingMetadataState, "revenue")["status"] = "succeeded";
  writeState(revenueMissingMetadata, revenueMissingMetadataState);
  const missingMetadataOps = readFileSync(path.join(revenueMissingMetadata, "revenue/REVENUE_OPS.md"), "utf8");
  writeFileSync(
    path.join(revenueMissingMetadata, "revenue/REVENUE_OPS.md"),
    `${missingMetadataOps}\n| com.app.pro.monthly | RevenueCat | auto_renewable | MISSING_METADATA |\n`,
    "utf8",
  );
  runFixture(
    "done revenue lane with a product still in MISSING_METADATA fails",
    revenueMissingMetadata,
    "check-revenue.ts",
    1,
    "revenue.missing_metadata.unresolved",
  );

  // The clearance column itself: a row answering "no" in "MISSING_METADATA
  // cleared?" never repeats the MISSING_METADATA string, so the literal row
  // check cannot see it — the column parse must.
  const revenueClearanceNo = makeFixture("revenue-clearance-column-no");
  const revenueClearanceNoState = readState(revenueClearanceNo);
  getLane(revenueClearanceNoState, "revenue")["status"] = "succeeded";
  writeState(revenueClearanceNo, revenueClearanceNoState);
  const clearanceOps = readFileSync(path.join(revenueClearanceNo, "revenue/REVENUE_OPS.md"), "utf8");
  writeFileSync(
    path.join(revenueClearanceNo, "revenue/REVENUE_OPS.md"),
    clearanceOps.replace(/(\| Store Product ID \|[^\n]*\n\|[ \-|]*\n)/, "$1| com.app.pro.monthly | pro_monthly | auto_renewable | premium | monthly | no |\n"),
    "utf8",
  );
  runFixture("done revenue lane with a clearance column answering no fails", revenueClearanceNo, "check-revenue.ts", 1, "revenue.missing_metadata.unresolved");

  // Paywall experiment cadence (paywall-pricing-and-experiments.md §4): once the app has been live four weeks
  // with the revenue lane done, the backlog needs a dated active or completed
  // row — the one-and-done paywall is the plateau the gate exists to stop.
  const experimentIsoDaysAgo = (days: number): string => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  const BACKLOG_BLANK = "| --- | --- | --- | --- | --- | --- | --- | --- |\n\n## Founder-Gated Probe Step";
  const injectBacklog = (ops: string, rows: string): string =>
    ops.replace(BACKLOG_BLANK, `| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Founder-Gated Probe Step`);

  const revenueExperimentEmpty = makeFixture("revenue-experiment-backlog-empty");
  {
    const state = readState(revenueExperimentEmpty);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentEmpty, state);
  }
  runFixture(
    "done revenue lane live four-plus weeks with an empty experiment backlog fails",
    revenueExperimentEmpty,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  const revenueExperimentMissing = makeFixture("revenue-experiment-backlog-missing");
  {
    const state = readState(revenueExperimentMissing);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentMissing, state);
    const opsPath = path.join(revenueExperimentMissing, "revenue/REVENUE_OPS.md");
    writeFileSync(opsPath, readFileSync(opsPath, "utf8").replace("## Paywall Experiment Backlog", "## Old Notes"), "utf8");
  }
  runFixture(
    "done revenue lane live four-plus weeks without the backlog section fails",
    revenueExperimentMissing,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.missing",
  );

  // "completed" inside a hypothesis must not satisfy the cadence: the Status
  // cell is parsed by its header column.
  const revenueExperimentWordDrift = makeFixture("revenue-experiment-status-word-drift");
  {
    const state = readState(revenueExperimentWordDrift);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentWordDrift, state);
    const opsPath = path.join(revenueExperimentWordDrift, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | users completed checkout faster with the annual anchor | paywall | anchor-first paywall | revenuecat_experiments | trial-start rate | planned | |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "planned backlog row with 'completed' in its hypothesis does not satisfy the cadence",
    revenueExperimentWordDrift,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // A bogus Started date must not silence the cadence forever.
  const revenueExperimentBogusStart = makeFixture("revenue-experiment-bogus-start");
  {
    const state = readState(revenueExperimentBogusStart);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentBogusStart, state);
    const opsPath = path.join(revenueExperimentBogusStart, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      "| 2026-99-99 | anchor-first paywall lifts trials | paywall | anchor-first | revenuecat_experiments | trial-start rate | active | |",
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "active backlog row with an impossible start date does not satisfy the cadence",
    revenueExperimentBogusStart,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // One historical test must not satisfy the cadence forever.
  const revenueExperimentStale = makeFixture("revenue-experiment-stale");
  {
    const state = readState(revenueExperimentStale);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(180);
    writeState(revenueExperimentStale, state);
    const opsPath = path.join(revenueExperimentStale, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(120)} | anchor-first paywall lifts trials | paywall | anchor-first | revenuecat_experiments | trial-start rate | completed | +12% trial starts, trial-to-paid held at 20% over one renewal window; kept |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a single completed experiment from four months ago does not satisfy the cadence",
    revenueExperimentStale,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.stale",
  );

  // A recently completed experiment is current activity — the backlog codes stay silent.
  const revenueExperimentCurrent = makeFixture("revenue-experiment-current");
  {
    const state = readState(revenueExperimentCurrent);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentCurrent, state);
    const opsPath = path.join(revenueExperimentCurrent, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | paywall | anchor-first layout | revenuecat_experiments | trial-start rate | completed | +18% trial starts, trial-to-paid held at 22% over one renewal window; founder kept it |`,
    );
    writeFileSync(opsPath, ops, "utf8");
    writeCurrentExperimentProgram(revenueExperimentCurrent, experimentIsoDaysAgo(1));
  }
  runFixture(
    "a recently completed experiment satisfies the cadence",
    revenueExperimentCurrent,
    "check-revenue.ts",
    1,
    "error(s),",
    [],
    undefined,
    "revenue.experiment_",
  );

  // An old completed test plus a dated next experiment is also current activity.
  const revenueExperimentDatedNext = makeFixture("revenue-experiment-dated-next");
  {
    const state = readState(revenueExperimentDatedNext);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(90);
    writeState(revenueExperimentDatedNext, state);
    const opsPath = path.join(revenueExperimentDatedNext, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(80)} | anchor-first paywall lifts trials | paywall | anchor-first | revenuecat_experiments | trial-start rate | completed | +12% trial starts, trial-to-paid held at 20% over one renewal window; kept |\n| ${experimentIsoDaysAgo(-14)} | reverse trial beats opt-in | trial | reverse-trial | revenuecat_experiments | trial-to-paid | planned | |`,
    );
    writeFileSync(opsPath, ops, "utf8");
    writeCurrentExperimentProgram(revenueExperimentDatedNext, experimentIsoDaysAgo(1));
  }
  runFixture(
    "an old completed test with a dated next experiment satisfies the cadence",
    revenueExperimentDatedNext,
    "check-revenue.ts",
    1,
    "error(s),",
    [],
    undefined,
    "revenue.experiment_",
  );

  // A live app recording its FIRST dated planned experiment must be able to pass.
  const revenueExperimentFirstPlanned = makeFixture("revenue-experiment-first-planned");
  {
    const state = readState(revenueExperimentFirstPlanned);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentFirstPlanned, state);
    const opsPath = path.join(revenueExperimentFirstPlanned, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(-14)} | paywall after value reveal beats paywall-first | paywall | delayed paywall | revenuecat_experiments | trial-start rate | planned | |`,
    );
    writeFileSync(opsPath, ops, "utf8");
    writeCurrentExperimentProgram(revenueExperimentFirstPlanned, experimentIsoDaysAgo(1));
  }
  runFixture(
    "a first planned experiment dated within the horizon satisfies the cadence",
    revenueExperimentFirstPlanned,
    "check-revenue.ts",
    1,
    "error(s),",
    [],
    undefined,
    "revenue.experiment_",
  );

  // A date plus a status word is not an experiment.
  const revenueExperimentBlankRow = makeFixture("revenue-experiment-blank-row");
  {
    const state = readState(revenueExperimentBlankRow);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentBlankRow, state);
    const opsPath = path.join(revenueExperimentBlankRow, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(readFileSync(opsPath, "utf8"), `| ${experimentIsoDaysAgo(10)} | | | | | | active | |`);
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a dated status-only row with blank experiment cells does not satisfy the cadence",
    revenueExperimentBlankRow,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // Short standard metric identifiers are defined experiments.
  const revenueExperimentShortMetric = makeFixture("revenue-experiment-short-metric");
  {
    const state = readState(revenueExperimentShortMetric);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentShortMetric, state);
    const opsPath = path.join(revenueExperimentShortMetric, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts conversion | paywall | anchor-first layout | revenuecat_experiments | CVR | completed | +9% CVR with trial-to-paid steady over one renewal window; founder kept it |`,
    );
    writeFileSync(opsPath, ops, "utf8");
    writeCurrentExperimentProgram(revenueExperimentShortMetric, experimentIsoDaysAgo(1));
  }
  runFixture(
    "a defined experiment measured on CVR satisfies the cadence",
    revenueExperimentShortMetric,
    "check-revenue.ts",
    1,
    "error(s),",
    [],
    undefined,
    "revenue.experiment_",
  );

  const revenueExperimentProgramMissing = makeFixture("revenue-experiment-program-missing");
  {
    const state = readState(revenueExperimentProgramMissing);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentProgramMissing, state);
    const opsPath = path.join(revenueExperimentProgramMissing, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | paywall | anchor-first layout | revenuecat_experiments | trial-start rate | completed | +18% trial starts, trial-to-paid held at 22% over one renewal window; founder kept it |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "current backlog without a paywall experiment program file fails",
    revenueExperimentProgramMissing,
    "check-revenue.ts",
    1,
    "revenue.experiment_program.missing",
  );

  // "unknown"/"NA" cells are empty states wearing characters.
  const revenueExperimentNegativeCells = makeFixture("revenue-experiment-negative-cells");
  {
    const state = readState(revenueExperimentNegativeCells);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentNegativeCells, state);
    const opsPath = path.join(revenueExperimentNegativeCells, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(readFileSync(opsPath, "utf8"), `| ${experimentIsoDaysAgo(10)} | unknown | paywall | unknown | NA | NA | completed | unknown |`);
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a completed row of unknown/NA cells does not satisfy the cadence",
    revenueExperimentNegativeCells,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // Day-one conversion alone is not a completed test.
  const revenueExperimentDayOne = makeFixture("revenue-experiment-day-one-result");
  {
    const state = readState(revenueExperimentDayOne);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentDayOne, state);
    const opsPath = path.join(revenueExperimentDayOne, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts conversion | paywall | anchor-first layout | revenuecat_experiments | CVR | completed | +9% day-one conversion, kept |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a completed row judged on day-one conversion alone does not satisfy the cadence",
    revenueExperimentDayOne,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // Naming the economics noun while negating it is not evidence.
  const revenueExperimentNegatedCohort = makeFixture("revenue-experiment-negated-cohort");
  {
    const state = readState(revenueExperimentNegatedCohort);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentNegatedCohort, state);
    const opsPath = path.join(revenueExperimentNegatedCohort, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts conversion | paywall | anchor-first layout | revenuecat_experiments | CVR | completed | No cohort or renewal evidence was collected |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a completed row with negated cohort evidence does not satisfy the cadence",
    revenueExperimentNegatedCohort,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // An availability negative after the semicolon affirms nothing either.
  const revenueExperimentUnavailableCohort = makeFixture("revenue-experiment-unavailable-cohort");
  {
    const state = readState(revenueExperimentUnavailableCohort);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentUnavailableCohort, state);
    const opsPath = path.join(revenueExperimentUnavailableCohort, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts conversion | paywall | anchor-first layout | revenuecat_experiments | CVR | completed | No cohort evidence was collected; renewal window unavailable |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a completed row whose renewal window is unavailable does not satisfy the cadence",
    revenueExperimentUnavailableCohort,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // A future plan is not an observed result.
  const revenueExperimentFuturePlan = makeFixture("revenue-experiment-future-plan");
  {
    const state = readState(revenueExperimentFuturePlan);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentFuturePlan, state);
    const opsPath = path.join(revenueExperimentFuturePlan, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts conversion | paywall | anchor-first layout | revenuecat_experiments | CVR | completed | Cohort economics will be measured during the renewal window |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a completed row whose result is a future measurement plan does not satisfy the cadence",
    revenueExperimentFuturePlan,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  // Top-of-funnel alone is not cohort economics.
  const revenueExperimentTrialStartOnly = makeFixture("revenue-experiment-trial-start-only");
  {
    const state = readState(revenueExperimentTrialStartOnly);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentTrialStartOnly, state);
    const opsPath = path.join(revenueExperimentTrialStartOnly, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | paywall | anchor-first layout | revenuecat_experiments | trial-start rate | completed | Trial-start rate +9%; kept |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a completed row with trial-start-only evidence does not satisfy the cadence",
    revenueExperimentTrialStartOnly,
    "check-revenue.ts",
    1,
    "revenue.experiment_backlog.empty",
  );

  const revenueExperimentEngineColumnMissing = makeFixture("revenue-experiment-engine-column-missing");
  {
    const state = readState(revenueExperimentEngineColumnMissing);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentEngineColumnMissing, state);
    const opsPath = path.join(revenueExperimentEngineColumnMissing, "revenue/REVENUE_OPS.md");
    const ops = readFileSync(opsPath, "utf8")
      .replace(
        "| Started | Hypothesis | Surface | Variant | Engine | Primary metric | Status (planned / active / completed) | Result / decision |",
        "| Started | Hypothesis | Variant | Primary metric | Status (planned / active / completed) | Result / decision |",
      )
      .replace("| --- | --- | --- | --- | --- | --- | --- | --- |", "| --- | --- | --- | --- | --- | --- |");
    writeFileSync(
      opsPath,
      ops.replace(
        "| --- | --- | --- | --- | --- | --- |\n\n## Founder-Gated Probe Step",
        `| --- | --- | --- | --- | --- | --- |\n| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | anchor-first layout | trial-start rate | completed | +18% trial starts, trial-to-paid held at 22% over one renewal window; founder kept it |\n\n## Founder-Gated Probe Step`,
      ),
      "utf8",
    );
  }
  runFixture(
    "a live backlog without an Engine column fails",
    revenueExperimentEngineColumnMissing,
    "check-revenue.ts",
    1,
    "revenue.experiment_engine.column_missing",
  );

  const revenueExperimentEngineMismatch = makeFixture("revenue-experiment-engine-mismatch");
  {
    const state = readState(revenueExperimentEngineMismatch);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentEngineMismatch, state);
    const opsPath = path.join(revenueExperimentEngineMismatch, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | paywall | anchor-first layout | bandit | trial-start rate | completed | +18% trial starts, trial-to-paid held at 22% over one renewal window; founder kept it |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a paywall experiment on bandit fails the surface-engine matrix",
    revenueExperimentEngineMismatch,
    "check-revenue.ts",
    1,
    "revenue.experiment_engine.mismatch",
  );

  const revenueExperimentBanditOnly = makeFixture("revenue-experiment-bandit-only");
  {
    const state = readState(revenueExperimentBanditOnly);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentBanditOnly, state);
    const opsPath = path.join(revenueExperimentBanditOnly, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | winning hook creative beats control | creative | hook-alpha first frame | bandit | cpa | completed | +12% trial starts, trial-to-paid held at 20% over one renewal window; kept |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "creative-only bandit activity does not satisfy the monetization experiment program",
    revenueExperimentBanditOnly,
    "check-revenue.ts",
    1,
    "revenue.experiment_engine.monetization_missing",
  );

  const revenueExperimentInvalidEngine = makeFixture("revenue-experiment-invalid-engine");
  {
    const state = readState(revenueExperimentInvalidEngine);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentInvalidEngine, state);
    const opsPath = path.join(revenueExperimentInvalidEngine, "revenue/REVENUE_OPS.md");
    const ops = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | paywall | anchor-first layout | custom_ab | trial-start rate | completed | +18% trial starts, trial-to-paid held at 22% over one renewal window; founder kept it |`,
    );
    writeFileSync(opsPath, ops, "utf8");
  }
  runFixture(
    "a defined experiment row with an unknown engine fails",
    revenueExperimentInvalidEngine,
    "check-revenue.ts",
    1,
    "revenue.experiment_engine.invalid",
  );

  const revenueExperimentMatrixMissing = makeFixture("revenue-experiment-matrix-missing");
  {
    const state = readState(revenueExperimentMatrixMissing);
    getLane(state, "revenue")["status"] = "succeeded";
    getLane(state, "post_launch_ops")["live_since"] = experimentIsoDaysAgo(40);
    writeState(revenueExperimentMatrixMissing, state);
    const opsPath = path.join(revenueExperimentMatrixMissing, "revenue/REVENUE_OPS.md");
    const withRow = injectBacklog(
      readFileSync(opsPath, "utf8"),
      `| ${experimentIsoDaysAgo(10)} | annual anchor first lifts trial starts | paywall | anchor-first layout | revenuecat_experiments | trial-start rate | completed | +18% trial starts, trial-to-paid held at 22% over one renewal window; founder kept it |`,
    );
    writeFileSync(opsPath, withRow.replace("## Surface To Engine Matrix", "## Old Notes"), "utf8");
  }
  runFixture(
    "a live app without the surface-to-engine matrix fails",
    revenueExperimentMatrixMissing,
    "check-revenue.ts",
    1,
    "revenue.experiment_matrix.missing",
  );

  const revenueWrongType = makeFixture("revenue-lifetime-wrong-product-type");
  const revenueWrongTypeState = readState(revenueWrongType);
  getLane(revenueWrongTypeState, "revenue")["status"] = "succeeded";
  writeState(revenueWrongType, revenueWrongTypeState);
  const wrongTypeOps = readFileSync(path.join(revenueWrongType, "revenue/REVENUE_OPS.md"), "utf8");
  writeFileSync(
    path.join(revenueWrongType, "revenue/REVENUE_OPS.md"),
    `${wrongTypeOps}\n| com.app.lifetime | RevenueCat | non_renewing_subscription | Ready |\n`,
    "utf8",
  );
  runFixture(
    "done revenue lane with a lifetime product typed non_renewing_subscription fails",
    revenueWrongType,
    "check-revenue.ts",
    1,
    "revenue.product_type.non_renewing_subscription",
  );

  // Pricing decision floor (paywall-pricing-and-experiments.md §3): heading, real anchor rows, dated approval.
  // The shipped template carries the structure with example-only content, so a
  // done lane on the untouched template fails the anchor and approval checks.
  const revenuePricingUnfilled = makeFixture("revenue-pricing-unfilled");
  const revenuePricingUnfilledState = readState(revenuePricingUnfilled);
  getLane(revenuePricingUnfilledState, "revenue")["status"] = "succeeded";
  writeState(revenuePricingUnfilled, revenuePricingUnfilledState);
  runFixture("done revenue lane with example-only competitor anchor fails", revenuePricingUnfilled, "check-revenue.ts", 1, "revenue.pricing_anchor.empty");
  runFixture(
    "done revenue lane without dated founder pricing approval fails",
    revenuePricingUnfilled,
    "check-revenue.ts",
    1,
    "revenue.pricing_approval.undated",
  );

  // A real ISO date typed inside the template's HTML comment is guidance the
  // founder never confirmed — comments are stripped before the approval check.
  const revenuePricingCommentedDate = makeFixture("revenue-pricing-approval-in-comment");
  const revenuePricingCommentedDateState = readState(revenuePricingCommentedDate);
  getLane(revenuePricingCommentedDateState, "revenue")["status"] = "succeeded";
  writeState(revenuePricingCommentedDate, revenuePricingCommentedDateState);
  const commentedDateOps = readFileSync(path.join(revenuePricingCommentedDate, "revenue/REVENUE_OPS.md"), "utf8");
  writeFileSync(
    path.join(revenuePricingCommentedDate, "revenue/REVENUE_OPS.md"),
    commentedDateOps.replace(/^Founder approved:.*$/m, "Founder approved: <!-- 2026-07-26 -->"),
    "utf8",
  );
  runFixture(
    "founder approval date hidden inside an HTML comment still fails",
    revenuePricingCommentedDate,
    "check-revenue.ts",
    1,
    "revenue.pricing_approval.undated",
  );

  const revenuePricingMissing = makeFixture("revenue-pricing-section-missing");
  const revenuePricingMissingState = readState(revenuePricingMissing);
  getLane(revenuePricingMissingState, "revenue")["status"] = "succeeded";
  writeState(revenuePricingMissing, revenuePricingMissingState);
  const pricingOps = readFileSync(path.join(revenuePricingMissing, "revenue/REVENUE_OPS.md"), "utf8");
  writeFileSync(path.join(revenuePricingMissing, "revenue/REVENUE_OPS.md"), pricingOps.replace("## Trial And Pricing Decision", "## Trial Notes"), "utf8");
  runFixture("done revenue lane without a pricing decision section fails", revenuePricingMissing, "check-revenue.ts", 1, "revenue.pricing_decision.missing");

  const revenueSandboxOnly = makeFixture("revenue-release-build-unconfirmed");
  const revenueSandboxOnlyState = readState(revenueSandboxOnly);
  getLane(revenueSandboxOnlyState, "revenue")["status"] = "succeeded";
  writeState(revenueSandboxOnly, revenueSandboxOnlyState);
  writeFileSync(
    path.join(revenueSandboxOnly, "revenue", "revenuecat-proof.md"),
    ["# RevenueCat Proof", "", "Sandbox purchase confirmed: entitlement active and access granted inside the app.", ""].join("\n"),
    "utf8",
  );
  runFixture(
    "revenuecat-proof.md without Release-build confirmation surfaces the sandbox-only warning",
    revenueSandboxOnly,
    "check-revenue.ts",
    1,
    "revenue.proof_md.release_unconfirmed",
  );

  const priceDerivationMissing = makeFixture("price-derivation-missing");
  runFixture("missing price derivation plan skips the derive gate", priceDerivationMissing, "check-price-derivation.ts", 0);

  const priceDerivationComplete = makeFixture("price-derivation-complete");
  writeCompletePriceDerivation(priceDerivationComplete);
  runFixture("complete price derivation dry-run plan passes", priceDerivationComplete, "check-price-derivation.ts", 0);

  const priceDerivationNoHeading = makeFixture("price-derivation-no-heading");
  mkdirSync(path.join(priceDerivationNoHeading, "revenue"), { recursive: true });
  writeFileSync(path.join(priceDerivationNoHeading, "revenue/PRICE_DERIVATION.md"), "# Prices\nCopied yearly from monthly.\n", "utf8");
  runFixture(
    "price derivation file without a plan heading fails",
    priceDerivationNoHeading,
    "check-price-derivation.ts",
    1,
    "price_derivation.plan_heading_missing",
  );

  const priceDerivationNoDryRun = makeFixture("price-derivation-no-dry-run");
  writeCompletePriceDerivation(priceDerivationNoDryRun);
  writeFileSync(
    path.join(priceDerivationNoDryRun, "revenue/PRICE_DERIVATION.md"),
    `${readFileSync(path.join(priceDerivationNoDryRun, "revenue/PRICE_DERIVATION.md"), "utf8")}\nApplied derived prices without dry-run.\n`,
    "utf8",
  );
  runFixture(
    "derived prices applied without a dry-run fail",
    priceDerivationNoDryRun,
    "check-price-derivation.ts",
    1,
    "price_derivation.apply_without_dry_run",
  );

  const priceDerivationNearbyTier = makeFixture("price-derivation-nearby-tier");
  writeCompletePriceDerivation(priceDerivationNearbyTier);
  writeFileSync(
    path.join(priceDerivationNearbyTier, "revenue/PRICE_DERIVATION.md"),
    `${readFileSync(path.join(priceDerivationNearbyTier, "revenue/PRICE_DERIVATION.md"), "utf8")}\nSelected the nearest price point for JP.\n`,
    "utf8",
  );
  runFixture("nearby tier for a missing price point fails", priceDerivationNearbyTier, "check-price-derivation.ts", 1, "price_derivation.nearby_tier");

  const priceDerivationMultiplierApproval = makeFixture("price-derivation-multiplier-approval");
  writeCompletePriceDerivation(priceDerivationMultiplierApproval);
  writeFileSync(
    path.join(priceDerivationMultiplierApproval, "revenue/PRICE_DERIVATION.md"),
    `${readFileSync(path.join(priceDerivationMultiplierApproval, "revenue/PRICE_DERIVATION.md"), "utf8")}\nThe multiplier is approval. Run asc subscriptions pricing derive --apply.\n`,
    "utf8",
  );
  runFixture(
    "multiplier treated as founder approval fails",
    priceDerivationMultiplierApproval,
    "check-price-derivation.ts",
    1,
    "price_derivation.multiplier_as_approval",
  );

  const aiControlsMissing = makeFixture("ai-provider-controls-missing");
  runFixture("unknown generative-AI verdict skips paid AI controls when the file is absent", aiControlsMissing, "check-ai-provider-controls.ts", 0);

  const aiControlsGenAiInScope = makeFixture("ai-provider-controls-gen-ai-in-scope-missing");
  writeFileSync(
    path.join(aiControlsGenAiInScope, "trust/AI_SAFETY.md"),
    [
      "# AI Safety",
      "",
      "Applicability verdict: required",
      "Paid generation: unknown",
      "",
      "Detect self-harm, suicide, or crisis language and respond with a crisis resource.",
      "",
      "| Risk or prohibited use | Control | Owner | Test evidence | Status |",
      "| --- | --- | --- | --- | --- |",
      "| self-harm / suicide / crisis language in user input | detect crisis language | safety owner | crisis fixture | implemented |",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "generative AI in scope without paid AI controls file fails",
    aiControlsGenAiInScope,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.file_missing",
  );

  const aiControlsProductEvidence = makeFixture("ai-provider-controls-product-evidence-missing");
  writeFileSync(
    path.join(aiControlsProductEvidence, "PRODUCT.md"),
    `${readFileSync(path.join(aiControlsProductEvidence, "PRODUCT.md"), "utf8")}\nThe product calls the OpenAI Responses API for paid generation.\n`,
    "utf8",
  );
  runFixture(
    "product evidence of paid generation without controls file fails",
    aiControlsProductEvidence,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.file_missing",
  );

  const aiControlsNotApplicable = makeFixture("ai-provider-controls-not-applicable");
  writeFileSync(
    path.join(aiControlsNotApplicable, "trust/AI_SAFETY.md"),
    [
      "# AI Safety",
      "",
      "Applicability verdict: required",
      "Paid generation: not applicable — on-device models with no provider API",
      "",
      "Detect self-harm, suicide, or crisis language and respond with a crisis resource.",
      "",
      "| Risk or prohibited use | Control | Owner | Test evidence | Status |",
      "| --- | --- | --- | --- | --- |",
      "| self-harm / suicide / crisis language in user input | detect crisis language | safety owner | crisis fixture | implemented |",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture("named not-applicable paid generation skips the controls file", aiControlsNotApplicable, "check-ai-provider-controls.ts", 0);

  const aiControlsNotApplicableWithEvidence = makeFixture("ai-provider-controls-not-applicable-with-product-evidence");
  writeFileSync(
    path.join(aiControlsNotApplicableWithEvidence, "trust/AI_PROVIDER_CONTROLS.md"),
    "# AI Provider Controls\n\nPaid generation: not applicable — on-device models with no provider API\n",
    "utf8",
  );
  writeFileSync(
    path.join(aiControlsNotApplicableWithEvidence, "PRODUCT.md"),
    `${readFileSync(path.join(aiControlsNotApplicableWithEvidence, "PRODUCT.md"), "utf8")}\nThe product calls the OpenAI Responses API for paid generation.\n`,
    "utf8",
  );
  runFixture(
    "named not-applicable paid generation with product evidence still requires the control record",
    aiControlsNotApplicableWithEvidence,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.heading_missing",
  );

  const aiControlsComplete = makeFixture("ai-provider-controls-complete");
  writeCompleteAiProviderControls(aiControlsComplete);
  runFixture("complete paid AI control record passes", aiControlsComplete, "check-ai-provider-controls.ts", 0);

  const aiControlsNoHeading = makeFixture("ai-provider-controls-no-heading");
  mkdirSync(path.join(aiControlsNoHeading, "trust"), { recursive: true });
  writeFileSync(path.join(aiControlsNoHeading, "trust/AI_PROVIDER_CONTROLS.md"), "# AI\nCall the model from the client.\n", "utf8");
  runFixture(
    "AI provider controls without a control-record heading fail",
    aiControlsNoHeading,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.heading_missing",
  );

  const aiControlsClientKey = makeFixture("ai-provider-controls-client-key");
  writeCompleteAiProviderControls(aiControlsClientKey);
  writeFileSync(
    path.join(aiControlsClientKey, "trust/AI_PROVIDER_CONTROLS.md"),
    `${readFileSync(path.join(aiControlsClientKey, "trust/AI_PROVIDER_CONTROLS.md"), "utf8")}\nThe browser API key is shipped in the web proxy.\nAnonymous paid generation is allowed.\nFailed calls released the reservation.\n`,
    "utf8",
  );
  runFixture(
    "client provider credential in paid AI controls fails",
    aiControlsClientKey,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.client_credential",
  );

  const aiControlsKillSwitch = makeFixture("ai-provider-controls-kill-switch-free");
  writeCompleteAiProviderControls(aiControlsKillSwitch);
  writeFileSync(
    path.join(aiControlsKillSwitch, "trust/AI_PROVIDER_CONTROLS.md"),
    `${readFileSync(path.join(aiControlsKillSwitch, "trust/AI_PROVIDER_CONTROLS.md"), "utf8")}\nThe kill switch disables free editing.\n`,
    "utf8",
  );
  runFixture(
    "kill switch that disables free behavior fails",
    aiControlsKillSwitch,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.kill_switch_disables_free",
  );

  const aiControlsCapCollapse = makeFixture("ai-provider-controls-cap-collapse");
  writeCompleteAiProviderControls(aiControlsCapCollapse);
  writeFileSync(
    path.join(aiControlsCapCollapse, "trust/AI_PROVIDER_CONTROLS.md"),
    `${readFileSync(path.join(aiControlsCapCollapse, "trust/AI_PROVIDER_CONTROLS.md"), "utf8")}\nThe application cap implies the provider-account cap.\n`,
    "utf8",
  );
  runFixture(
    "collapsed application and provider-account caps fail",
    aiControlsCapCollapse,
    "check-ai-provider-controls.ts",
    1,
    "ai_provider_controls.cap_status_collapsed",
  );
}
