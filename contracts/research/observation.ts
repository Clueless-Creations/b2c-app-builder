import { z } from "zod";
const text = z.string().trim().min(1);
const scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(300)).max(30)]);
/** Non-secret semantic query identity, not a provider credential or execution grant. */
export const researchQuerySchema = z.strictObject({
  provider: text.max(160),
  providerVersion: text.max(160),
  connectionRef: text.max(160),
  operation: text.max(160),
  parameters: z.record(z.string().max(100), scalar),
});
export const researchObservationInputSchema = z.strictObject({
  query: researchQuerySchema,
  outcome: z.enum(["pending", "observed", "uncertain", "failed"]),
  summary: z.string().trim().min(1).max(4000),
  observedAt: z.iso.datetime({ offset: true }).optional(),
  sourceRefs: z.array(text.max(500)).max(30).default([]),
  providerRequestId: text.max(256).optional(),
  refreshReason: text.max(1000).optional(),
});
export const savedResearchObservationSchema = researchObservationInputSchema.extend({
  schemaVersion: z.literal(1),
  queryId: z.string().regex(/^[a-f0-9]{64}$/),
  sequence: z.number().int().positive(),
  recordedAt: z.iso.datetime({ offset: true }),
});
export type ResearchQuery = z.infer<typeof researchQuerySchema>;
