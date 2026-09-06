import { z } from "zod";

/** In-memory validation envelopes. Existing workflow artifacts and attempts remain the durable owners. */
export const workerArtifactInputSchema = z.strictObject({
  workflowId: z.string().min(1),
  runId: z.string().min(1),
  attemptId: z.string().min(1),
  inputFingerprint: z.string().min(1),
});
export const workerArtifactOutputSchema = z.strictObject({
  workflowId: z.string().min(1),
  outputs: z.array(z.strictObject({ artifactId: z.string().min(1), path: z.string().min(1), fingerprint: z.string().min(1) })),
});
export const workerArtifactEvidenceSchema = z.strictObject({ workflowId: z.string().min(1), evidence: z.array(z.string()) });
