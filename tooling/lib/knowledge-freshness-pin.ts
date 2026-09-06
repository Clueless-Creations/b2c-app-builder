import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const knowledgeFreshnessPinPath = "catalog/generated/knowledge-freshness.json";

export interface KnowledgeFreshnessPin {
  schemaVersion: "1.0.0";
  generatedAt: string;
  snapshotSha256: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function readJson(filePath: string, code: string): { value: unknown; bytes: Buffer } {
  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch {
    throw new Error(`${code}.unavailable: required freshness input is missing or unreadable.`);
  }
  try {
    return { value: JSON.parse(bytes.toString("utf8")) as unknown, bytes };
  } catch {
    throw new Error(`${code}.invalid: required freshness input is not valid JSON.`);
  }
}

/** Project only the committed snapshot clock and byte digest; do not fetch or advance it. */
export function knowledgeFreshnessPinFromSnapshot(snapshotPath: string): KnowledgeFreshnessPin {
  const { value, bytes } = readJson(snapshotPath, "knowledge.freshness_snapshot");
  if (!record(value) || !timestamp(value.generated_at)) {
    throw new Error("knowledge.freshness_snapshot.invalid: generated_at must be a canonical UTC timestamp.");
  }
  return { schemaVersion: "1.0.0", generatedAt: value.generated_at, snapshotSha256: createHash("sha256").update(bytes).digest("hex") };
}

export function serializeKnowledgeFreshnessPin(pin: KnowledgeFreshnessPin): string {
  return `${JSON.stringify(pin, null, 2)}\n`;
}

/** Installed callers read only the package. Source checks supply the authoritative snapshot. */
export function loadKnowledgeFreshnessPin(skillRoot: string, sourceSnapshotPath?: string): KnowledgeFreshnessPin {
  const { value } = readJson(path.join(skillRoot, knowledgeFreshnessPinPath), "knowledge.freshness_pin");
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !== "generatedAt,schemaVersion,snapshotSha256" ||
    value.schemaVersion !== "1.0.0" ||
    !timestamp(value.generatedAt) ||
    typeof value.snapshotSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.snapshotSha256)
  ) {
    throw new Error("knowledge.freshness_pin.invalid: expected the versioned snapshot timestamp and SHA-256 digest.");
  }
  const pin: KnowledgeFreshnessPin = { schemaVersion: value.schemaVersion, generatedAt: value.generatedAt, snapshotSha256: value.snapshotSha256 };
  if (sourceSnapshotPath) {
    const expected = knowledgeFreshnessPinFromSnapshot(sourceSnapshotPath);
    if (pin.generatedAt !== expected.generatedAt || pin.snapshotSha256 !== expected.snapshotSha256) {
      throw new Error("knowledge.freshness_pin.drift: regenerate the packaged pin from the authoritative source snapshot.");
    }
  }
  return pin;
}

export function loadPinnedKnowledgeFreshnessNow(skillRoot: string, sourceSnapshotPath?: string): Date {
  return new Date(loadKnowledgeFreshnessPin(skillRoot, sourceSnapshotPath).generatedAt);
}

/** Write this projection only. The catalog renderer uses the same serializer for its full pass. */
export function writeKnowledgeFreshnessPin(skillRoot: string, snapshotPath: string): void {
  const content = serializeKnowledgeFreshnessPin(knowledgeFreshnessPinFromSnapshot(snapshotPath));
  const target = path.join(skillRoot, knowledgeFreshnessPinPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}
