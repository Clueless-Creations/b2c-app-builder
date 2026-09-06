/** The subset of spawnSync's return value that says why no exit status was produced. */
export interface SpawnOutcome {
  readonly error?: Error;
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
}

/** The errno a failed launch carries, when it carries one. */
export function spawnErrorCode(result: SpawnOutcome): string | undefined {
  return (result.error as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * Names why a `spawnSync` produced no exit status, so callers that report only `status ?? -1` plus
 * the child's stdout/stderr do not print a bare `exited -1:` with nothing after the colon. When the
 * child never launches there is no output at all to explain the failure — the cause lives on
 * `result.error`, and a child killed by a signal reports it on `result.signal`; neither reaches an
 * operator otherwise. Returns "" when the child ran and exited normally, so callers can append it
 * unconditionally.
 *
 * Append the result LAST in a combined output string: several callers truncate their report with
 * `.slice(-400)`, which keeps the tail.
 *
 * Deliberately knows nothing about which binary was being spawned. A caller that can explain a
 * particular binary's failure better — tsx-bin.ts's `describeTsxSpawnFailure` names a missing local
 * install — layers that on top rather than teaching this function about its tool.
 */
export function describeSpawnFailure(binary: string, result: SpawnOutcome): string {
  if (result.error) {
    const code = spawnErrorCode(result);
    return `spawn ${binary} failed${code ? ` (${code})` : ""}: ${result.error.message}`;
  }
  if (result.signal) return `spawn ${binary} was killed by signal ${result.signal}`;
  if (result.status === null) return `spawn ${binary} produced no exit status and reported no error`;
  return "";
}
