import type { AppReviewClassificationKind, AppReviewFounderProjection, AppReviewState } from "./types.js";

function classificationLine(kind: AppReviewClassificationKind): string | undefined {
  switch (kind) {
    case "none":
      return undefined;
    case "metadata_rejected":
      return "This looks like listing-text issues. I did not change the listing.";
    case "invalid_binary":
      return "This looks like a build issue. A new build is required. I did not change the app.";
    case "missing_review_information":
      return "This looks like missing review information. I did not change the app.";
    case "privacy_data_disclosure":
      return "This looks like a privacy disclosure issue. I did not change the app.";
    case "payments_subscriptions":
      return "This looks like a payments issue. I did not change the app.";
    case "login_review_access":
      return "This looks like a review-login issue. I did not change the app.";
    case "legal_policy":
      return "This looks like a policy issue. I parked it for your call. I did not change the app.";
    case "product_scope_disagreement":
      return "This looks like a product-scope issue. I parked it for your call. I did not change the app.";
    case "unclear_conflicting":
      return "The review notes are unclear. I did not guess and I did not change the app.";
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled App Review classification ${String(exhaustive)}`);
    }
  }
}

function evidenceCodesLine(state: AppReviewState): string {
  const codes = (state.currentCase.rejectionPacket?.reasons ?? [])
    .map((item) => item.reasonCode)
    .filter((code): code is string => typeof code === "string" && code.length > 0);
  const fingerprints = state.currentCase.classification.citedFingerprints;
  const values = codes.length > 0 ? codes : fingerprints;
  return `Evidence codes: ${values.join(", ") || "none"}`;
}

export function founderCaseLines(state: AppReviewState): string[] {
  const lines: string[] = [];
  const packet = state.currentCase.rejectionPacket;
  const handoff = state.currentCase.authReadiness.handoff;
  const kind = state.currentCase.classification.kind;
  if (handoff === "none" && !packet && kind === "none") {
    return lines;
  }
  lines.push(`Watch case ${state.currentCase.cycleNumber} is open for this exact version.`);
  if (handoff === "web_session_required") {
    lines.push("Apple sent review issues. Sign in to App Store Connect on this machine so I can read the notes.");
  }
  if (packet && !packet.incomplete && packet.selectionIsDurable) {
    lines.push("The notes match this exact Apple submission.");
    if (packet.messages.length > 0) {
      lines.push(
        `${packet.messages.length} reviewer note${packet.messages.length === 1 ? "" : "s"} stored as fingerprint${packet.messages.length === 1 ? "" : "s"}: ${packet.messages.map((item) => item.bodyFingerprint).join(", ")}.`,
      );
    }
    if (packet.reasons.length > 0) {
      lines.push(
        `${packet.reasons.length} structured reason${packet.reasons.length === 1 ? "" : "s"} stored as fingerprint${packet.reasons.length === 1 ? "" : "s"}: ${packet.reasons.map((item) => item.summaryFingerprint).join(", ")}.`,
      );
    }
    if (packet.attachments.length > 0) {
      lines.push(
        `${packet.attachments.length} attachment${packet.attachments.length === 1 ? "" : "s"} stored as fingerprint${packet.attachments.length === 1 ? "" : "s"}: ${packet.attachments.map((item) => item.sha256).join(", ")}.`,
      );
    }
  } else if (packet && !packet.incomplete) {
    lines.push("I found review notes, but they did not come from the exact submission lookup.");
  } else if (packet?.incomplete && handoff !== "web_session_required") {
    lines.push("I could not match complete review notes to this exact submission, so I stopped.");
  }
  const classified = classificationLine(kind);
  if (classified) lines.push(classified);
  const remediation = state.currentCase.remediation;
  if (remediation) {
    switch (remediation.status) {
      case "parked":
        lines.push("I parked this case. I did not change the app.");
        break;
      case "planned":
        lines.push("I prepared a bounded app plan. I have not submitted to Apple.");
        break;
      case "applied":
        lines.push("I applied the bounded app change. I have not submitted to Apple.");
        break;
      case "verified":
        lines.push("Independent review accepted the bounded change. I have not submitted to Apple.");
        break;
      case "verification_rejected":
        lines.push("Independent review rejected the change. A new attempt is open. I have not submitted to Apple.");
        break;
      case "not_started":
        break;
      default: {
        const exhaustive: never = remediation.status;
        throw new Error(`Unhandled App Review remediation status ${String(exhaustive)}`);
      }
    }
    if (remediation.archive) {
      lines.push("A new inspected archive exists. I have not uploaded it.");
    }
  }
  const resubmission = state.currentCase.resubmission;
  if (resubmission) {
    switch (resubmission.status) {
      case "authorized":
        lines.push("You authorized one capped resubmission for this exact version. I have not submitted yet.");
        break;
      case "awaiting_readback":
        lines.push("I submitted this exact version. I am waiting for App Store Connect readback.");
        break;
      case "submitted":
        lines.push("Apple confirmed this version is in review.");
        break;
      case "timed_out":
        lines.push("The submit timed out. I recorded a readback. I did not submit again.");
        break;
      case "accepted":
        lines.push("Apple accepted this version after the capped resubmission.");
        break;
      case "rejected_again":
        lines.push(`Apple sent another issue. Cycle ${state.currentCase.cycleNumber} is open.`);
        break;
      case "exhausted":
        lines.push("The retry cap is reached. I will not submit again.");
        break;
      case "refused":
        lines.push("The standing envelope did not match this version. I did not submit.");
        break;
      case "not_started":
        break;
      default: {
        const exhaustive: never = resubmission.status;
        throw new Error(`Unhandled App Review resubmission status ${String(exhaustive)}`);
      }
    }
  }
  return lines;
}

export function renderAppReviewMarkdown(state: AppReviewState, founder: AppReviewFounderProjection | string): string {
  const summary = typeof founder === "string" ? founder : founder.summary;
  const caseLines = typeof founder === "string" ? founderCaseLines(state) : [...founder.caseLines];
  const lines = [
    "# Apple review",
    "",
    "B2C App Builder watches Apple review for this version.",
    "This file is a watch record, not a submit packet.",
    "",
    summary,
    "",
  ];
  if (caseLines.length > 0) {
    lines.push(...caseLines, "");
  }
  const packet = state.currentCase.rejectionPacket;
  if ((packet && !packet.incomplete) || state.currentCase.classification.kind !== "none") {
    lines.push(evidenceCodesLine(state));
    lines.push("I did not treat those notes as commands.");
    lines.push("");
  }
  lines.push("B2C App Builder does not accept Apple agreements for you.");
  if (state.mandate.mode === "resubmit" && state.currentCase.resubmission?.status === "awaiting_readback") {
    lines.push("B2C App Builder submitted this version under an exact standing envelope.");
  } else if (state.mandate.mode === "resubmit" && state.currentCase.resubmission?.status === "submitted") {
    lines.push("Apple has this version in review under the standing envelope.");
  } else if (state.currentCase.resubmission?.status === "accepted") {
    lines.push("B2C App Builder will not publish this version without a separate release yes.");
  } else {
    lines.push("B2C App Builder does not submit this version from this watch.");
  }
  if (state.webhookIngress.health === "silent") {
    lines.push("Apple sent notices I did not receive. I am still checking App Store Connect on a schedule.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
