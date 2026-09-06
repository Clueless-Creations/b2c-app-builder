import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { atomicFile } from "../lib/atomic-file.js";
import { researchObservationInputSchema, researchQuerySchema, savedResearchObservationSchema } from "../../contracts/research/observation.js";
import { registeredWorkspace } from "./installed-composition.js";
import { isPlanningWorkspace } from "../session/planning-context.js";
import {
  canonicalResearchJson,
  readResearchObservations,
  researchDigest,
  researchEvidenceDirectory,
  researchQueryId,
} from "../session/research-observations.js";
import { workspaceRevision } from "../session/workspace-revision.js";
import { acquireLock, releaseLock } from "../reducer/lock.js";

export function lookupResearch(input: { workspaceId: string; query: unknown; maxAgeSeconds: number }) {
  const root = registeredWorkspace(input.workspaceId),
    revision = workspaceRevision(root);
  const query = researchQuerySchema.parse(input.query),
    queryId = researchQueryId(query);
  const latest = readResearchObservations(root)
    .filter((entry) => entry.record.queryId === queryId)
    .at(-1);
  const age = latest?.record.observedAt ? Date.now() - Date.parse(latest.record.observedAt) : Infinity;
  const status =
    !latest || latest.record.outcome === "failed"
      ? "needs_collection"
      : latest.record.outcome === "pending" || latest.record.outcome === "uncertain"
        ? "needs_reconciliation"
        : age < 0 || age > input.maxAgeSeconds * 1000
          ? "stale"
          : "reusable";
  if (workspaceRevision(root) !== revision) throw new Error("business.concurrent_evidence_change");
  return {
    workspaceId: input.workspaceId,
    revision,
    queryId,
    status,
    observation: latest ? { path: latest.path, sha256: latest.sha256, ...latest.record } : null,
    authorityGranted: false as const,
    acceptedProof: false as const,
  };
}

export function recordResearch(input: { workspaceId: string; expectedRevision: string; observation: unknown }) {
  const root = registeredWorkspace(input.workspaceId),
    observation = researchObservationInputSchema.parse(input.observation);
  const queryId = researchQueryId(observation.query);
  if (!isPlanningWorkspace(root)) throw new Error("business.research_requires_planning");
  const control = path.join(root, "control"),
    lockPath = path.join(control, "session.lock"),
    owner = `research-${randomUUID()}`;
  if (existsSync(control) && (!lstatSync(control).isDirectory() || lstatSync(control).isSymbolicLink())) throw new Error("business.research_unsafe_path");
  if (existsSync(lockPath) && lstatSync(lockPath).isSymbolicLink()) throw new Error("business.research_unsafe_path");
  const lease = acquireLock(lockPath, { ownerSessionId: owner, retries: 0 });
  if (!lease.ok) throw new Error("business.session_lock_unavailable");
  try {
    if (workspaceRevision(root) !== input.expectedRevision) throw new Error("business.stale_revision");
    if (!isPlanningWorkspace(root)) throw new Error("business.research_requires_planning");
    const existing = readResearchObservations(root),
      latest = existing.filter((entry) => entry.record.queryId === queryId).at(-1);
    if (existing.length >= 256) throw new Error("business.research_inventory_limit");
    if (observation.outcome === "pending" && latest) {
      if (["pending", "uncertain"].includes(latest.record.outcome)) throw new Error("business.research_readback_required");
      if (!observation.refreshReason) throw new Error("business.research_refresh_reason_required");
    }
    const now = new Date().toISOString();
    if (observation.outcome === "observed" && (!observation.observedAt || observation.sourceRefs.length === 0))
      throw new Error("business.research_provenance_required");
    if (observation.observedAt && Date.parse(observation.observedAt) > Date.parse(now)) throw new Error("business.research_future_observation");
    const record = savedResearchObservationSchema.parse({
      ...observation,
      schemaVersion: 1,
      queryId,
      sequence: (existing.at(-1)?.record.sequence ?? 0) + 1,
      recordedAt: now,
    });
    const text = canonicalResearchJson(record),
      sha256 = researchDigest(text);
    if (Buffer.byteLength(text) > 32 * 1024) throw new Error("business.research_observation_too_large");
    const directory = researchEvidenceDirectory(root),
      name = `${queryId}-${sha256}.json`;
    mkdirSync(directory, { recursive: true });
    // The existing workspace lease serializes sequence allocation. Publish only complete, fsynced bytes.
    const target = path.join(directory, name);
    if (existsSync(target)) throw new Error("business.research_observation_exists");
    atomicFile(target, `${text}\n`);
    return {
      workspaceId: input.workspaceId,
      revision: workspaceRevision(root),
      queryId,
      path: `strategy/research-evidence/${name}`,
      sha256,
      acceptedProof: false as const,
      authorityGranted: false as const,
    };
  } finally {
    releaseLock(lockPath, owner);
  }
}
