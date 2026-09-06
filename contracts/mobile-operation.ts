import { z } from "zod";

export const MOBILE_OPERATION_IDS = [
  "b2c/mobile-app-operation.launch",
  "b2c/mobile-app-operation.inspect",
  "b2c/mobile-app-operation.interact",
  "b2c/mobile-app-operation.capture-screenshot",
  "b2c/mobile-app-operation.record-video",
] as const;
export type MobileOperation = (typeof MOBILE_OPERATION_IDS)[number];
const text = z.string().min(1);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const mobileTargetSchema = z.strictObject({
  platform: z.enum(["ios", "android"]),
  deviceKind: z.enum(["simulator", "emulator", "physical"]),
  deviceId: text,
  osVersion: text,
  locale: text,
  appId: text,
  buildId: text,
  artifactSha256: sha,
});
export type MobileTarget = z.infer<typeof mobileTargetSchema>;
const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("tap"), x: z.number().nonnegative(), y: z.number().nonnegative() }),
  z.strictObject({ kind: z.literal("type"), text: z.string().max(2000) }),
  z.strictObject({ kind: z.literal("swipe"), direction: z.enum(["up", "down", "left", "right"]) }),
  z.strictObject({ kind: z.literal("back") }),
]);
export const mobileRequestSchema = z.strictObject({
  providerId: text,
  operation: z.enum(MOBILE_OPERATION_IDS),
  target: mobileTargetSchema,
  requestedAt: z.string().datetime(),
  purpose: z.enum(["exploration", "product-verification", "marketing-source"]),
  stateId: text,
  actions: z.array(actionSchema).max(30).optional(),
  durationSeconds: z.number().positive().max(60).optional(),
});
export type MobileRequest = z.infer<typeof mobileRequestSchema>;
export const mobileSupportSchema = z.strictObject({
  providerId: text,
  availability: z.enum(["available", "unavailable"]),
  checkedAt: z.string().datetime(),
  source: z.enum(["host-inventory", "fixture"]),
  tuples: z.array(
    z.strictObject({
      platform: z.enum(["ios", "android"]),
      deviceKind: z.enum(["simulator", "emulator", "physical"]),
      operations: z.array(z.enum(MOBILE_OPERATION_IDS)).min(1),
    }),
  ),
  limitations: z.array(text),
});
export type MobileSupport = z.infer<typeof mobileSupportSchema>;
export const mobileObservationSchema = z.strictObject({
  providerId: text,
  operation: z.enum(MOBILE_OPERATION_IDS),
  target: mobileTargetSchema,
  executionId: text,
  observedAt: z.string().datetime(),
  source: z.enum(["host-observation", "fixture"]),
  completion: z.enum(["completed", "interrupted", "failed"]),
  observations: z.array(text).min(1),
  actionsCompleted: z.number().int().nonnegative(),
  capture: z
    .strictObject({
      artifactId: text,
      sha256: sha,
      mimeType: z.enum(["image/png", "image/jpeg", "video/mp4"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      durationSeconds: z.number().positive().optional(),
      stateId: text,
      source: z.literal("app-pixels"),
    })
    .optional(),
});
export type MobileObservation = z.infer<typeof mobileObservationSchema>;
export const mobileResultSchema = z.strictObject({
  observation: mobileObservationSchema,
  acceptance: z.strictObject({
    functional: z.literal(false),
    accessibility: z.literal(false),
    design: z.literal(false),
    backend: z.literal(false),
    release: z.literal(false),
  }),
  marketingStatus: z.enum(["raw-source", "not-captured"]),
});
export type MobileResult = z.infer<typeof mobileResultSchema>;
const fresh = (date: string, now: Date, ttlMs: number) => {
  const age = now.getTime() - Date.parse(date);
  if (!Number.isFinite(age) || age < 0 || age > ttlMs) throw new Error("mobile.stale_or_future_evidence");
};
/** Negotiate only the selected provider. Returning a blocker never selects a fallback. */
export function requireMobileSupport(input: unknown, supportInput: unknown, now: Date): { request: MobileRequest; support: MobileSupport } {
  const request = mobileRequestSchema.parse(input);
  const support = mobileSupportSchema.parse(supportInput);
  fresh(request.requestedAt, now, 60_000);
  fresh(support.checkedAt, now, 60_000);
  if (request.providerId !== support.providerId) throw new Error("mobile.explicit_provider_mismatch");
  if (support.availability !== "available") throw new Error("mobile.selected_provider_unavailable");
  if (
    !support.tuples.some(
      (tuple) => tuple.platform === request.target.platform && tuple.deviceKind === request.target.deviceKind && tuple.operations.includes(request.operation),
    )
  )
    throw new Error("mobile.unsupported_target_operation");
  if (
    (request.target.platform === "ios" && request.target.deviceKind === "emulator") ||
    (request.target.platform === "android" && request.target.deviceKind === "simulator")
  )
    throw new Error("mobile.invalid_target_kind");
  if (request.operation.endsWith(".interact") ? !request.actions?.length : request.actions !== undefined) throw new Error("mobile.action_scope_invalid");
  if (request.operation.endsWith(".record-video") ? request.durationSeconds === undefined : request.durationSeconds !== undefined)
    throw new Error("mobile.video_scope_invalid");
  return { request, support };
}
export function normalizeMobileObservation(request: MobileRequest, raw: unknown, now: Date): MobileResult {
  const observation = mobileObservationSchema.parse(raw);
  fresh(observation.observedAt, now, 60_000);
  if (
    observation.providerId !== request.providerId ||
    observation.operation !== request.operation ||
    JSON.stringify(observation.target) !== JSON.stringify(request.target) ||
    Date.parse(observation.observedAt) < Date.parse(request.requestedAt)
  )
    throw new Error("mobile.observation_identity_mismatch");
  if (observation.completion === "interrupted") throw new Error("mobile.interrupted_effect_uncertain");
  if (observation.completion !== "completed") throw new Error("mobile.operation_failed");
  if (observation.actionsCompleted !== (request.actions?.length ?? 0)) throw new Error("mobile.action_coverage_incomplete");
  const screenshot = request.operation.endsWith(".capture-screenshot");
  const video = request.operation.endsWith(".record-video");
  if ((screenshot || video) !== Boolean(observation.capture)) throw new Error("mobile.capture_coverage_mismatch");
  if (
    observation.capture &&
    (observation.capture.stateId !== request.stateId ||
      (screenshot && !observation.capture.mimeType.startsWith("image/")) ||
      (video && (observation.capture.mimeType !== "video/mp4" || observation.capture.durationSeconds !== request.durationSeconds)))
  )
    throw new Error("mobile.capture_provenance_mismatch");
  return {
    observation,
    acceptance: { functional: false, accessibility: false, design: false, backend: false, release: false },
    marketingStatus: observation.capture ? "raw-source" : "not-captured",
  };
}
