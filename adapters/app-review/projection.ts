import { founderCaseLines } from "./render.js";
import type { AppReviewBlocker, AppReviewFounderBlockerKind, AppReviewFounderProjection, AppReviewState } from "./types.js";

function founderBlockerKind(blocker: AppReviewBlocker): AppReviewFounderBlockerKind {
  switch (blocker) {
    case "none":
      return "none";
    case "unknown_provider_state":
    case "evidence_incomplete":
      return "unknown";
    case "capability_missing":
    case "capability_shape_changed":
    case "web_session_required":
      return "capability";
    case "founder_action_required":
      return "agreement";
    case "unresolved_issues":
    case "rejected":
    case "metadata_rejected":
    case "invalid_binary":
    case "pending_developer_release":
      return "review";
    default: {
      const exhaustive: never = blocker;
      throw new Error(`Unhandled App Review blocker ${String(exhaustive)}`);
    }
  }
}

function founderSummary(state: AppReviewState): string {
  const resubmission = state.currentCase.resubmission;
  if (resubmission) {
    switch (resubmission.status) {
      case "authorized":
        return "You authorized a capped resubmission. I have not submitted it to Apple yet.";
      case "awaiting_readback":
        return "I submitted this version to Apple review. I am waiting for App Store Connect to confirm it.";
      case "submitted":
        return "Apple received this version for review. I am watching the result.";
      case "timed_out":
        return "I did not hear back from Apple in time. I checked App Store Connect again. I did not submit again.";
      case "accepted":
        return state.currentCase.blocker === "pending_developer_release"
          ? "Apple accepted this version. Release still needs your yes."
          : "Apple accepted this version.";
      case "rejected_again":
        return "Apple sent another review issue. A new cycle is open. I have not submitted again.";
      case "exhausted":
        return "I reached the review retry limit. I will not submit again. This needs your call.";
      case "refused":
        return "I could not submit this version. The standing envelope did not match.";
      case "not_started":
        break;
      default: {
        const exhaustive: never = resubmission.status;
        throw new Error(`Unhandled App Review resubmission status ${String(exhaustive)}`);
      }
    }
  }
  const remediation = state.currentCase.remediation;
  if (remediation) {
    switch (remediation.status) {
      case "parked":
        return "This review issue needs your call. I did not change the app.";
      case "planned":
        return "I prepared a bounded fix. I have not submitted it to Apple.";
      case "applied":
        return "I changed the app files. I have not submitted them to Apple.";
      case "verified":
        return "The fix passed independent review. I have not submitted it to Apple.";
      case "verification_rejected":
        return "Independent review rejected the fix. I will try again. I have not submitted it to Apple.";
      case "not_started":
        break;
      default: {
        const exhaustive: never = remediation.status;
        throw new Error(`Unhandled App Review remediation status ${String(exhaustive)}`);
      }
    }
  }
  switch (state.currentCase.blocker) {
    case "none":
      return "Apple review is being watched. No action is needed from you right now.";
    case "unknown_provider_state":
      return "Apple reported a review state I don't recognize yet, so I stopped instead of guessing.";
    case "capability_missing":
      return "The App Store Connect tools on this machine are missing a required command, so I stopped.";
    case "capability_shape_changed":
      return "The App Store Connect tools changed in a way I don't recognize, so I stopped.";
    case "founder_action_required":
      return "Apple needs you to accept an agreement before review can continue. I will not accept it for you.";
    case "web_session_required":
      return "Apple sent review issues. I need the App Store Connect web login on this machine to read them.";
    case "evidence_incomplete":
      return "Apple sent review issues, but I could not match the notes to this exact submission, so I stopped.";
    case "unresolved_issues":
      return "Apple sent review issues. I am watching only and have not changed the app.";
    case "rejected":
      return "Apple rejected this version. I am watching only and have not changed the app.";
    case "metadata_rejected":
      return "Apple rejected the listing text. I am watching only and have not changed the listing.";
    case "invalid_binary":
      return "Apple rejected this build. A new build is required. I am watching only.";
    case "pending_developer_release":
      return "Apple accepted this version. Release still needs your yes.";
    default: {
      const exhaustive: never = state.currentCase.blocker;
      throw new Error(`Unhandled App Review blocker ${String(exhaustive)}`);
    }
  }
}

export const INVALID_APP_REVIEW_WATCH_SUMMARY = "The Apple review watch file is present but invalid, so I stopped instead of guessing.";

function needsFounderAction(blocker: AppReviewBlocker): boolean {
  switch (blocker) {
    case "none":
    case "unresolved_issues":
    case "rejected":
    case "metadata_rejected":
    case "invalid_binary":
      return false;
    case "unknown_provider_state":
    case "capability_missing":
    case "capability_shape_changed":
    case "founder_action_required":
    case "web_session_required":
    case "evidence_incomplete":
    case "pending_developer_release":
      return true;
    default: {
      const exhaustive: never = blocker;
      throw new Error(`Unhandled App Review blocker ${String(exhaustive)}`);
    }
  }
}

export function projectAppReviewForFounder(state: AppReviewState): AppReviewFounderProjection {
  const blockerKind = founderBlockerKind(state.currentCase.blocker);
  const parked = state.currentCase.remediation?.status === "parked";
  const cycleCap = state.currentCase.resubmission?.status === "exhausted";
  return {
    summary: founderSummary(state),
    watchActive: state.mandate.status === "active",
    needsFounderAction: parked || cycleCap || needsFounderAction(state.currentCase.blocker),
    blockerKind,
    caseLines: founderCaseLines(state),
  };
}
