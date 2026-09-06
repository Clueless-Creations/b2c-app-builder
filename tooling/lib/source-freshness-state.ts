interface SourceCheckState {
  status?: unknown;
  http_status?: unknown;
  checked_at?: unknown;
  last_verified_at?: unknown;
  hash?: unknown;
  previous_hash?: unknown;
}

function timestamp(value: unknown): string | undefined {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function contentHash(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function successfulCheck(snapshot: SourceCheckState): boolean {
  return (
    snapshot.http_status === 200 &&
    (snapshot.status === "fresh" || snapshot.status === "changed") &&
    Boolean(timestamp(snapshot.checked_at)) &&
    Boolean(contentHash(snapshot.hash))
  );
}

function retainedCheck(snapshot: SourceCheckState): boolean {
  return snapshot.status === "blocked" && Boolean(timestamp(snapshot.last_verified_at)) && Boolean(contentHash(snapshot.previous_hash));
}

/** Only a complete successful response or its retained blocked baseline proves age. */
export function trustedSourceCheckTime(snapshot: SourceCheckState | undefined): string | undefined {
  if (!snapshot) return undefined;
  if (successfulCheck(snapshot)) return timestamp(snapshot.checked_at);
  return retainedCheck(snapshot) ? timestamp(snapshot.last_verified_at) : undefined;
}

/** Missing status, HTTP result, timestamp, or content hash is not verification. */
export function trustedSourceHash(snapshot: SourceCheckState | undefined): string | undefined {
  if (!snapshot) return undefined;
  if (successfulCheck(snapshot)) return contentHash(snapshot.hash);
  return retainedCheck(snapshot) ? contentHash(snapshot.previous_hash) : undefined;
}
