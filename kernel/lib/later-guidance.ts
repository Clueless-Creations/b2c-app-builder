/**
 * Catalog `loadWhen` strings that describe a later launch, design, or provider
 * horizon — not the current bounded task. Shared by plan projection, worker
 * prompts, and hosted dispatch so route mode does not treat every bound
 * reference as immediate reading.
 *
 * Current-task phrasing wins when both appear, so a program-open reference that
 * also names Submit-for-Review stays current.
 */
const CURRENT_TASK = /\b(this task|before this task|at workflow start|opening, resuming, or closing|always)\b/i;
const LATER_HORIZON =
  /\b(later|after (this|dispatch|launch|acceptance)|once .{0,80}complete|future|before production|independent review|user-facing surface|native mobile screen|third-party skill pack|moving from planning|dispatching or coordinating subagents|launch readiness|store submission|public beta)\b/i;

export function isLaterGuidance(loadWhen: string): boolean {
  const text = loadWhen.trim();
  if (!text) return false;
  if (CURRENT_TASK.test(text)) return false;
  return LATER_HORIZON.test(text);
}

export function partitionLoadWhen<T extends { loadWhen: string }>(entries: readonly T[]): { current: T[]; later: T[] } {
  const current: T[] = [];
  const later: T[] = [];
  for (const entry of entries) (isLaterGuidance(entry.loadWhen) ? later : current).push(entry);
  return { current, later };
}
