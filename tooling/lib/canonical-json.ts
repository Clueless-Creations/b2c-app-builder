/**
 * canonical-json.ts — deterministic JSON canonicalization and hashing.
 *
 * Recursive key-sort + JSON.stringify + sha256 hex, so the same logical value always hashes
 * the same way regardless of property insertion order. This is the exact pattern
 * tooling/render-hosted-bundle.ts already uses for its catalogSha256/bundleSha256 fingerprints;
 * it is duplicated here rather than imported because render-hosted-bundle.ts is owned by
 * another change in flight. Dedupe the two copies (have render-hosted-bundle.ts import this
 * module instead of defining its own canonical/stableJson/digest) as a follow-up once that
 * change lands — see the drift-check design note in docs for why the duplication is temporary,
 * not a second intended source of truth.
 */
import { createHash } from "node:crypto";

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export const stableJson = (value: unknown): string => JSON.stringify(canonical(value));

export const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
