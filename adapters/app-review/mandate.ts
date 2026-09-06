import {
  ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS,
  FORBIDDEN_APP_REVIEW_COMMANDS,
  OBSERVE_APP_REVIEW_COMMANDS,
  OBSERVE_FORBIDDEN_APP_REVIEW_COMMANDS,
  type AppReviewMandate,
  type AppReviewMandateMode,
  type ForbiddenAppReviewCommand,
} from "./types.js";

export interface ObserveMandateInput {
  readonly mandateId: string;
  readonly appleTeamId: string;
  readonly appId: string;
  readonly bundleId: string;
  readonly platform: AppReviewMandate["platform"];
  readonly marketingVersion: string;
  readonly startedAt: string;
  readonly expiresAt: string;
}

export function observeMandateCommands(): readonly string[] {
  return OBSERVE_APP_REVIEW_COMMANDS;
}

export function forbiddenAppReviewCommandsForMode(mode: AppReviewMandateMode): readonly ForbiddenAppReviewCommand[] {
  switch (mode) {
    case "observe":
      return OBSERVE_FORBIDDEN_APP_REVIEW_COMMANDS;
    case "resubmit":
      return ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS;
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled App Review mandate mode ${String(exhaustive)}`);
    }
  }
}

export function commandIsAlwaysForbiddenForAppReview(command: string): boolean {
  const trimmed = command.trim();
  for (const forbidden of ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS) {
    if (trimmed === forbidden || trimmed.startsWith(`${forbidden} `) || trimmed.includes(forbidden)) {
      return true;
    }
  }
  return false;
}

export function commandIsForbiddenForAppReview(command: string, mode: AppReviewMandateMode = "observe"): boolean {
  const trimmed = command.trim();
  for (const forbidden of forbiddenAppReviewCommandsForMode(mode)) {
    if (trimmed === forbidden || trimmed.startsWith(`${forbidden} `) || trimmed.includes(forbidden)) {
      return true;
    }
  }
  return false;
}

export function assertNoForbiddenAppReviewCommand(command: string, mode: AppReviewMandateMode = "observe"): void {
  if (commandIsForbiddenForAppReview(command, mode)) {
    throw new Error(`App Review ${mode} mandate refuses command: ${command}`);
  }
}

export function observeMandateIsLive(mandate: AppReviewMandate, now: string): boolean {
  switch (mandate.status) {
    case "revoked":
    case "expired":
      return false;
    case "active": {
      const nowMs = Date.parse(now);
      const expiresMs = Date.parse(mandate.expiresAt);
      if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs) || nowMs >= expiresMs) {
        return false;
      }
      return true;
    }
    default: {
      const exhaustive: never = mandate.status;
      throw new Error(`Unhandled App Review mandate status ${String(exhaustive)}`);
    }
  }
}

export function createObserveMandate(input: ObserveMandateInput): AppReviewMandate {
  for (const command of OBSERVE_APP_REVIEW_COMMANDS) {
    assertNoForbiddenAppReviewCommand(command, "observe");
  }
  return {
    mandateId: input.mandateId,
    mode: "observe",
    status: "active",
    appleTeamId: input.appleTeamId,
    appId: input.appId,
    bundleId: input.bundleId,
    platform: input.platform,
    marketingVersion: input.marketingVersion,
    startedAt: input.startedAt,
    expiresAt: input.expiresAt,
    forbiddenCommands: [...FORBIDDEN_APP_REVIEW_COMMANDS] as ForbiddenAppReviewCommand[],
  };
}
