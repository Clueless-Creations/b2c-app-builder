import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { savedResearchObservationSchema, type ResearchQuery } from "../../contracts/research/observation.js";
import { boundedFileBytes } from "../lib/bounded-file.js";

export const RESEARCH_EVIDENCE_DIRECTORY = "strategy/research-evidence";
export function canonicalResearchJson(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, value]) => [key, normalize(value)]),
          )
        : item;
  return JSON.stringify(normalize(value));
}
export const researchDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export function researchQueryId(query: ResearchQuery): string {
  if (
    Object.keys(query.parameters).some((key) => /secret|password|token|authorization|api[-_]?key/i.test(key)) ||
    Buffer.byteLength(canonicalResearchJson(query)) > 8000
  )
    throw new Error("business.research_unsafe_query");
  return researchDigest(canonicalResearchJson(query));
}
export function researchEvidenceDirectory(root: string): string {
  let current = path.resolve(root);
  for (const segment of RESEARCH_EVIDENCE_DIRECTORY.split("/")) {
    current = path.join(current, segment);
    if (existsSync(current) && (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink())) throw new Error("business.research_unsafe_path");
  }
  return current;
}
/** Immutable corpus observations, not execution state or accepted proof. */
export function readResearchObservations(root: string) {
  const directory = researchEvidenceDirectory(root);
  if (!existsSync(directory)) return [];
  const entries = readdirSync(directory).sort();
  // A process can stop before atomicFile renames its temporary file. It is never a saved result.
  const files = entries.filter((file) => !/^[a-f0-9]{64}-[a-f0-9]{64}\.json\.[a-f0-9-]{36}\.tmp$/.test(file));
  if (entries.length > 512 || files.length > 256) throw new Error("business.research_inventory_limit");
  const records = files
    .map((file) => {
      if (!/^[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(file)) throw new Error("business.research_unknown_artifact");
      const bytes = boundedFileBytes(path.join(directory, file), 32 * 1024);
      const record = savedResearchObservationSchema.parse(JSON.parse(bytes.toString("utf8")));
      const sha256 = researchDigest(canonicalResearchJson(record));
      if (researchQueryId(record.query) !== record.queryId || file !== `${record.queryId}-${sha256}.json`)
        throw new Error("business.research_changed_observation");
      return { path: `${RESEARCH_EVIDENCE_DIRECTORY}/${file}`, sha256, record };
    })
    .sort((a, b) => a.record.sequence - b.record.sequence);
  if (new Set(records.map((entry) => entry.record.sequence)).size !== records.length) throw new Error("business.research_ambiguous_sequence");
  return records;
}
