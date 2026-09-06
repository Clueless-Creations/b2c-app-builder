import { createHash } from "node:crypto";
import type { SubjectReference } from "./types.js";

export interface EvidenceErasureTombstone {
  id: string;
  erasedAt: string;
  workspaceBinding: string;
  policyDigest: string;
  subjectDigests: string[];
  recordDigests: string[];
  fileDigests: string[];
  providerDeletion: "pending" | "not_required";
}

export function erasedSubjectDigest(receiptId: string, subject: SubjectReference): string {
  return createHash("sha256")
    .update(JSON.stringify([receiptId, subject.appId, subject.environment, subject.opaqueRef]))
    .digest("hex");
}
