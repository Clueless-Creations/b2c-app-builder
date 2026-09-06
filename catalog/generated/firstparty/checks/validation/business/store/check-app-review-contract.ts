#!/usr/bin/env node
/**
 * check-app-review-contract.ts — App Review state contract.
 *
 * Skip only when store/APP_REVIEW.md is still the unused seed and run/app-review.json
 * is absent. When the watch markdown is no longer unused, or when the state file
 * exists, require valid state: a 4.9 capability receipt, three-layer
 * raw+normalized Apple state, fail-closed unknown states, pending agreements as
 * founder action, no agreements accept, Phase 3 bounded remediation that never
 * submits, and Phase 4 capped resubmission behind an exact standing envelope.
 * Founder markdown never contains `asc review submit`. An existing invalid
 * state file fails closed. It is not treated as a missing watch.
 *
 * npm script: check:app-review-contract
 * Usage: tsx checks/validation/business/store/check-app-review-contract.ts --root <app-repo-root>
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS,
  APP_REVIEW_CAPABILITY_IDS,
  APP_REVIEW_REMEDIATE_WORKFLOW_ID,
  APP_REVIEW_RESUBMIT_WORKFLOW_ID,
  APP_REVIEW_SCHEMA_IDS,
  APP_REVIEW_WEB_SESSION_CAPABILITY_IDS,
  FORBIDDEN_APP_REVIEW_COMMANDS,
  commandIsAlwaysForbiddenForAppReview,
  commandIsStoreSubmission,
  containsSecretMaterial,
  interpretAppReviewState,
  isProtectedAppReviewKind,
  envelopeFingerprint,
  recordedProducerMatchesClaim,
  routeForClassification,
  verificationSessionsAreIndependent,
  type AppReviewState,
} from "../../../../adapters/app-review/index.js";
import { issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const issues: Issue[] = [];
const stateRel = "run/app-review.json";
const markdownRel = "store/APP_REVIEW.md";
const unusedWatchMarker = "No Apple review watch is active yet";
const statePath = path.join(args.root, stateRel);
const markdownPath = path.join(args.root, markdownRel);

function readMarkdown(): string {
  return existsSync(markdownPath) ? readFileSync(markdownPath, "utf8") : "";
}

const markdown = readMarkdown();
if (markdown.includes("asc web agreements accept")) {
  issues.push(
    issue("error", "app_review_contract.agreements_accept_emitted", "store/APP_REVIEW.md must never contain asc web agreements accept.", markdownRel),
  );
}
if (markdown.includes("asc webhooks serve")) {
  issues.push(issue("error", "app_review_contract.webhooks_serve_emitted", "store/APP_REVIEW.md must never contain asc webhooks serve.", markdownRel));
}
if (markdown.includes("asc review submit") || markdown.includes("asc publish appstore --submit")) {
  issues.push(
    issue("error", "app_review_contract.store_submission_emitted", "store/APP_REVIEW.md must never contain App Store submission commands.", markdownRel),
  );
}

const unusedSeed = markdown.includes(unusedWatchMarker);
const stateExists = existsSync(statePath);

if (!stateExists) {
  if (existsSync(markdownPath) && !unusedSeed) {
    issues.push(
      issue(
        "error",
        "app_review_contract.state_missing",
        "workflow.store.app-review-observe requires durable run/app-review.json when store/APP_REVIEW.md is no longer the unused seed.",
        stateRel,
      ),
    );
  }
} else {
  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    parseFailed = true;
    issues.push(issue("error", "app_review_contract.state_invalid", "run/app-review.json is present but is not valid JSON.", stateRel));
  }

  if (!parseFailed) {
    const loaded = interpretAppReviewState(parsed);
    if (loaded.status !== "ok") {
      issues.push(issue("error", "app_review_contract.state_invalid", "run/app-review.json is present but failed schema validation.", stateRel));
    } else {
      const state = loaded.state;
      if (state.mandate.mode !== "observe" && state.mandate.mode !== "resubmit") {
        issues.push(issue("error", "app_review_contract.mode_unknown", "App Review mandate mode must be observe or resubmit.", stateRel));
      }

      const forbidden = new Set(state.mandate.forbiddenCommands);
      const requiredForbidden = state.mandate.mode === "resubmit" ? ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS : FORBIDDEN_APP_REVIEW_COMMANDS;
      for (const command of requiredForbidden) {
        if (!forbidden.has(command)) {
          issues.push(issue("error", "app_review_contract.forbidden_command_unlisted", `Mandate must list forbidden command ${command}.`, stateRel));
        }
      }
      if (state.mandate.mode === "observe" && !forbidden.has("asc review submit")) {
        issues.push(issue("error", "app_review_contract.observe_must_forbid_submit", "An observe mandate must forbid asc review submit.", stateRel));
      }

      for (const event of state.events) {
        const blob = JSON.stringify(event);
        if (commandIsAlwaysForbiddenForAppReview(blob) || blob.includes("asc web agreements accept")) {
          issues.push(
            issue("error", "app_review_contract.agreements_accept_emitted", "App Review events must never emit asc web agreements accept.", stateRel),
          );
          break;
        }
      }

      const capabilityIds = new Set(state.capabilityReceipt.capabilities.map((probe) => probe.id));
      for (const id of APP_REVIEW_CAPABILITY_IDS) {
        if (!capabilityIds.has(id)) {
          issues.push(issue("error", "app_review_contract.capability_unprobed", `Capability receipt is missing ${id}.`, stateRel));
        }
      }

      const schemaIds = new Set(state.capabilityReceipt.schemas.map((probe) => probe.id));
      for (const id of APP_REVIEW_SCHEMA_IDS) {
        if (!schemaIds.has(id)) {
          issues.push(issue("error", "app_review_contract.schema_unprobed", `Capability receipt is missing schema ${id}.`, stateRel));
        }
      }

      const missingOrChanged = state.capabilityReceipt.capabilities.some((probe) => !probe.available || !probe.shapeOk);
      const missingSchema = state.capabilityReceipt.schemas.some((probe) => !probe.available);
      const requiredMissing = missingOrChanged || missingSchema;
      if (requiredMissing && !state.capabilityReceipt.failClosed) {
        issues.push(issue("error", "app_review_contract.capability_not_fail_closed", "A missing or changed 4.9 capability must fail closed.", stateRel));
      }

      const layers = [
        state.currentCase.appVersion,
        ...(state.currentCase.reviewSubmission ? [state.currentCase.reviewSubmission] : []),
        ...state.currentCase.submissionItems,
      ];
      const unknownLayer = layers.some((layer) => layer.normalized === "unknown_provider_state");
      const pendingAgreement = state.events.length > 0 && latestAgreementPending(state);
      const blocker = state.currentCase.blocker;

      if (requiredMissing && blocker !== "capability_missing" && blocker !== "capability_shape_changed" && blocker !== "unknown_provider_state") {
        issues.push(
          issue(
            "error",
            "app_review_contract.capability_blocker_missing",
            "A missing 4.9 capability must park with capability_missing or capability_shape_changed.",
            stateRel,
          ),
        );
      }

      if (unknownLayer && blocker === "none") {
        issues.push(
          issue(
            "error",
            "app_review_contract.unknown_state_not_fail_closed",
            "Unknown Apple states must fail closed. Do not collapse them into none.",
            stateRel,
          ),
        );
      }

      const webSessionIds = new Set(state.capabilityReceipt.webSession.capabilities.map((probe) => probe.id));
      for (const id of APP_REVIEW_WEB_SESSION_CAPABILITY_IDS) {
        if (!webSessionIds.has(id)) {
          issues.push(issue("error", "app_review_contract.web_session_unprobed", `Web-session receipt is missing ${id}.`, stateRel));
        }
      }

      const serialized = JSON.stringify(state);
      if (containsSecretMaterial(serialized) || serialized.includes("downloadUrl") || serialized.includes("messageBody")) {
        issues.push(
          issue(
            "error",
            "app_review_contract.secret_or_reviewer_body",
            "App Review state must not store credentials, download URLs, or reviewer bodies.",
            stateRel,
          ),
        );
      }

      if (state.currentCase.classification.implementationStatus !== "not_started" && !state.currentCase.remediation) {
        issues.push(
          issue(
            "error",
            "app_review_contract.implementation_not_idle",
            "Observe-only classification must stay not_started until a bounded remediation plan exists.",
            stateRel,
          ),
        );
      }

      const remediation = state.currentCase.remediation;
      if (remediation) {
        if (remediation.status !== state.currentCase.classification.implementationStatus) {
          issues.push(
            issue(
              "error",
              "app_review_contract.remediation_status_mismatch",
              "Classification implementationStatus must match the bounded remediation status.",
              stateRel,
            ),
          );
        }
        const mapped = routeForClassification(state.currentCase.classification.kind);
        if (remediation.plan.route !== mapped.route || remediation.plan.disposition !== mapped.disposition) {
          issues.push(issue("error", "app_review_contract.remediation_route_mismatch", "The bounded plan route must match the classified kind.", stateRel));
        }
        if (isProtectedAppReviewKind(state.currentCase.classification.kind)) {
          if (remediation.plan.disposition !== "park" || remediation.status !== "parked" || remediation.consumer) {
            issues.push(
              issue(
                "error",
                "app_review_contract.protected_case_not_parked",
                "Legal, privacy, payments, product-scope, and unclear cases must park without consumer mutation.",
                stateRel,
              ),
            );
          }
        }
        if (remediation.plan.route === "new_binary" && remediation.status === "verified" && !remediation.archive) {
          issues.push(
            issue("error", "app_review_contract.binary_missing_archive", "A verified binary repair must include a newly inspected archive.", stateRel),
          );
        }
        if (remediation.plan.route === "same_build_metadata" && (remediation.status === "applied" || remediation.status === "verified")) {
          const preflight = remediation.metadataPreflight;
          if (!preflight || !preflight.validatePassed || !preflight.dryRunPassed) {
            issues.push(
              issue(
                "error",
                "app_review_contract.metadata_preflight_missing",
                "Metadata repair must pass validate and dry-run before it is applied.",
                stateRel,
              ),
            );
          }
        }
        if (remediation.consumer && !remediation.consumer.producerSessionId.trim()) {
          issues.push(
            issue("error", "app_review_contract.producer_identity_missing", "An applied consumer patch must record the producer session id.", stateRel),
          );
        }
        if (remediation.plan.route === "new_binary") {
          const identityBlob = remediation.plan.patches.map((patch) => patch.contents).join("\n");
          if (identityBlob.includes("com.example.app") && state.mandate.bundleId !== "com.example.app") {
            issues.push(
              issue(
                "error",
                "app_review_contract.binary_fixture_identity",
                "A binary repair must use the reviewed app bundle id, not a fixture literal.",
                stateRel,
              ),
            );
          }
        }
        const verification = remediation.verification;
        if (verification) {
          if (!recordedProducerMatchesClaim(remediation.consumer?.producerSessionId, verification.producerSessionId)) {
            issues.push(
              issue("error", "app_review_contract.producer_identity_mismatch", "Verification must bind to the stored producer session id.", stateRel),
            );
          }
          if (!verificationSessionsAreIndependent(verification.producerSessionId, verification.verifierSessionId)) {
            issues.push(
              issue("error", "app_review_contract.verifier_not_independent", "The verifier session must differ from the stored producer after trim.", stateRel),
            );
          }
        }
        if (remediation.occurrence.workflowId !== APP_REVIEW_REMEDIATE_WORKFLOW_ID) {
          issues.push(
            issue("error", "app_review_contract.occurrence_workflow", "Remediation occurrence must bind workflow.store.app-review-remediate.", stateRel),
          );
        }
        const remBlob = JSON.stringify(remediation);
        if (commandIsStoreSubmission(remBlob) || remBlob.includes("asc review submit") || remBlob.includes("asc publish appstore --submit")) {
          issues.push(
            issue("error", "app_review_contract.store_submission_emitted", "Bounded remediation must not emit App Store submission commands.", stateRel),
          );
        }
      }

      const resubmission = state.currentCase.resubmission;
      if (state.mandate.mode === "resubmit") {
        if (!state.mandate.resubmitEnvelope || !resubmission) {
          issues.push(
            issue(
              "error",
              "app_review_contract.resubmit_envelope_missing",
              "A resubmit mandate must carry a standing envelope and resubmission record.",
              stateRel,
            ),
          );
        }
      }
      if (resubmission) {
        if (resubmission.occurrence.workflowId !== APP_REVIEW_RESUBMIT_WORKFLOW_ID) {
          issues.push(
            issue(
              "error",
              "app_review_contract.resubmit_occurrence_workflow",
              "Resubmission occurrence must bind workflow.store.app-review-resubmit.",
              stateRel,
            ),
          );
        }
        if (resubmission.envelope.appId !== state.mandate.appId || resubmission.envelope.marketingVersion !== state.mandate.marketingVersion) {
          issues.push(
            issue("error", "app_review_contract.resubmit_envelope_mismatch", "The standing envelope must match the mandate app and version.", stateRel),
          );
        }
        if (resubmission.envelope.confirm !== true) {
          issues.push(issue("error", "app_review_contract.resubmit_confirm_missing", "The standing envelope must require --confirm.", stateRel));
        }
        if (resubmission.envelopeFingerprint !== envelopeFingerprint(resubmission.envelope)) {
          issues.push(
            issue("error", "app_review_contract.resubmit_envelope_fingerprint", "The stored envelope fingerprint must match the standing envelope.", stateRel),
          );
        }
        if (state.mandate.resubmitEnvelope && envelopeFingerprint(state.mandate.resubmitEnvelope) !== resubmission.envelopeFingerprint) {
          issues.push(
            issue("error", "app_review_contract.resubmit_mandate_envelope_drift", "The mandate envelope must match the case standing envelope.", stateRel),
          );
        }
        if (resubmission.command) {
          if (!resubmission.command.includes("asc review submit") || !resubmission.command.includes("--confirm")) {
            issues.push(
              issue("error", "app_review_contract.resubmit_command_shape", "A recorded submit command must be asc review submit with --confirm.", stateRel),
            );
          }
          if (resubmission.command.includes("asc publish appstore --submit") || resubmission.command.includes("asc web agreements accept")) {
            issues.push(
              issue("error", "app_review_contract.resubmit_forbidden_command", "Resubmission must not record publish or agreement-accept commands.", stateRel),
            );
          }
        }
        if ((resubmission.status === "awaiting_readback" || resubmission.status === "submitted") && !resubmission.envelope.alreadyUploaded) {
          issues.push(issue("error", "app_review_contract.resubmit_not_uploaded", "Capped resubmission requires an already-uploaded build.", stateRel));
        }
        if (state.mandate.mode === "observe" && (resubmission.status === "awaiting_readback" || resubmission.status === "submitted")) {
          issues.push(issue("error", "app_review_contract.observe_submitted", "An observe mandate must not record a store submission.", stateRel));
        }
      }

      if (!state.webhookIngress) {
        issues.push(issue("error", "app_review_contract.webhook_ingress_missing", "App Review state must include webhook ingress after 1.2.0.", stateRel));
      } else {
        const accepted = state.webhookIngress.acceptedEventIds;
        if (new Set(accepted).size !== accepted.length) {
          issues.push(issue("error", "app_review_contract.webhook_event_id_duplicate", "Accepted webhook event IDs must be unique.", stateRel));
        }
        if (state.webhookIngress.lastEnvelope && containsSecretMaterial(JSON.stringify(state.webhookIngress.lastEnvelope))) {
          issues.push(issue("error", "app_review_contract.webhook_secret_persisted", "Webhook ingress must not store the HMAC secret.", stateRel));
        }
      }

      const packet = state.currentCase.rejectionPacket;
      const needsPacket =
        !requiredMissing &&
        !unknownLayer &&
        !pendingAgreement &&
        (blocker === "unresolved_issues" ||
          blocker === "rejected" ||
          blocker === "metadata_rejected" ||
          blocker === "invalid_binary" ||
          blocker === "web_session_required" ||
          blocker === "evidence_incomplete");
      if (needsPacket && !packet && blocker !== "web_session_required" && blocker !== "evidence_incomplete") {
        issues.push(
          issue(
            "error",
            "app_review_contract.packet_missing",
            "Review issues require a rejection packet, a web-session handoff, or an incomplete-evidence park.",
            stateRel,
          ),
        );
      }
      if (packet && !packet.incomplete) {
        const submissionId = state.currentCase.reviewSubmission?.providerObjectId;
        if (!submissionId || packet.submissionId !== submissionId || packet.appId !== state.mandate.appId) {
          issues.push(
            issue("error", "app_review_contract.packet_not_correlated", "A complete rejection packet must cite the exact app and submission IDs.", stateRel),
          );
        }
        if (packet.messages.some((item) => item.bodyFingerprint.length < 32) || packet.reasons.some((item) => item.summaryFingerprint.length < 32)) {
          issues.push(issue("error", "app_review_contract.packet_not_fingerprinted", "Rejection messages and reasons must be fingerprinted.", stateRel));
        }
      }
      if (packet?.selectionIsDurable && packet.selection !== "explicit") {
        issues.push(
          issue(
            "error",
            "app_review_contract.packet_discovery_marked_durable",
            "A latest or latest-unresolved packet must not be marked durable. Use the exact-submission route.",
            stateRel,
          ),
        );
      }
      if (packet) {
        const storedPaths = packet.attachments.map((item) => item.storedRelativePath);
        if (new Set(storedPaths).size !== storedPaths.length) {
          issues.push(
            issue("error", "app_review_contract.packet_duplicate_evidence_path", "Each attachment must have a unique stored evidence path.", stateRel),
          );
        }
      }

      if (pendingAgreement && !requiredMissing && !unknownLayer && blocker !== "founder_action_required") {
        issues.push(
          issue("error", "app_review_contract.pending_agreement_not_founder_action", "A pending Apple agreement must be founder_action_required.", stateRel),
        );
      }
    }
  }
}

reportAndExit("App Review contract check", issues);

function latestAgreementPending(document: AppReviewState): boolean {
  const latest = [...document.events].reverse().find((event) => event.kind === "observation") ?? document.events.at(-1);
  return latest?.agreement.normalized === "pending" || latest?.agreement.pending === true;
}
