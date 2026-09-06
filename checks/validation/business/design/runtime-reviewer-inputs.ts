import { z } from "zod";

export const MAX_DESIGN_RUNTIME_CAPTURES = 64;
export const MAX_DESIGN_RUNTIME_INTERACTIONS = 128;

const nonempty = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifact = z.strictObject({ path: nonempty, sha256: digest });

/** Compact, platform-neutral index passed to the independent implementation
 * reviewer. It lists immutable machine receipts and artifacts without copying
 * screenshot, video, build, or transcript bytes into the review prompt. */
export const designRuntimeReviewerInputsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal("design-runtime-reviewer-inputs"),
    runtime: z.strictObject({
      id: nonempty,
      platform: z.enum(["web", "ios", "android"]),
      candidateSha256: digest,
      sessionId: nonempty,
      receipts: z.array(z.strictObject({ kind: nonempty, artifact })).min(1),
    }),
    captures: z
      .array(
        z.strictObject({
          id: nonempty,
          surfaceId: nonempty,
          state: nonempty,
          receipt: artifact,
          artifact,
          transcript: artifact.optional(),
        }),
      )
      .max(MAX_DESIGN_RUNTIME_CAPTURES),
    interactions: z
      .array(
        z.strictObject({
          id: nonempty,
          surfaceId: nonempty,
          interactionId: nonempty,
          receipt: artifact,
          artifact,
        }),
      )
      .max(MAX_DESIGN_RUNTIME_INTERACTIONS),
    producedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    for (const [key, ids] of [
      ["runtime.receipts", value.runtime.receipts.map((entry) => entry.kind)],
      ["captures", value.captures.map((entry) => entry.id)],
      ["interactions", value.interactions.map((entry) => entry.id)],
    ] as const) {
      if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: key.split("."), message: "IDs must be unique" });
    }
  });

export type DesignRuntimeReviewerInputs = z.infer<typeof designRuntimeReviewerInputsSchema>;
