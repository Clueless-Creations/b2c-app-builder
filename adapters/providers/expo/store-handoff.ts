/**
 * Store handoff stages. EAS Submit success is not TestFlight availability, review,
 * approval, or public release. Apple and Google tracks stay distinct.
 */

export const STORE_HANDOFF_STAGES = ["compiled-artifact", "uploaded-binary", "testing-track", "submitted-for-review", "approved", "released"] as const;

export type StoreHandoffStage = (typeof STORE_HANDOFF_STAGES)[number];

export type StorePlatform = "ios" | "android";

export interface SubmitOutcomeInput {
  readonly platform: StorePlatform;
  readonly easStatus?: string;
  readonly json?: unknown;
}

export interface SubmitStageReading {
  readonly stage: StoreHandoffStage;
  readonly released: false | true;
  readonly testingTrack: boolean;
  readonly googleTrack?: string;
  readonly notes: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function interpretSubmitOutcome(input: SubmitOutcomeInput): SubmitStageReading {
  const record = isRecord(input.json) ? input.json : {};
  const status = input.easStatus ?? (typeof record.status === "string" ? record.status : undefined);
  const track = typeof record.track === "string" ? record.track : typeof record.releaseStatus === "string" ? record.releaseStatus : undefined;
  if (status === "finished" || status === "in-progress" || status === "in-queue") {
    if (input.platform === "android" && (track === "production" || track === "completed")) {
      return {
        stage: "submitted-for-review",
        released: false,
        testingTrack: track !== "production",
        googleTrack: track,
        notes: "A finished Google upload is not a completed production release. Inspect Play track and first-upload prerequisites separately.",
      };
    }
    if (input.platform === "ios") {
      return {
        stage: "uploaded-binary",
        released: false,
        testingTrack: false,
        notes:
          "A finished iOS submit is an uploaded binary. TestFlight availability, App Review, approval, and App Store release are separate stages owned by ASC.",
      };
    }
    return {
      stage: "uploaded-binary",
      released: false,
      testingTrack: Boolean(track && track !== "production"),
      googleTrack: track,
      notes: "EAS submit finished is not store release.",
    };
  }
  if (status === "errored" || status === "canceled") {
    return { stage: "compiled-artifact", released: false, testingTrack: false, notes: `Submit ${status}. The binary was not accepted as uploaded.` };
  }
  return {
    stage: "compiled-artifact",
    released: false,
    testingTrack: false,
    notes: "Invalid or partial submit JSON cannot establish upload, review, or release.",
  };
}
