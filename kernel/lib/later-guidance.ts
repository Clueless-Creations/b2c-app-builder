/**
 * Later-horizon loads are relative to the current workflow's role, not a global
 * property of a catalog `loadWhen` phrase. A specialist book that names store
 * submission or public beta is current for that specialist workflow. The same
 * book is later-horizon when a program packet binds it ahead of that work.
 *
 * Explicit later phrasing (`later, after launch`) still defers when the entry
 * is not this workflow's own book.
 */
const CURRENT_TASK = /\b(this task|before this task|at workflow start|opening, resuming, or closing|always)\b/i;
const LATER_HORIZON =
  /\b(later|after (this|dispatch|launch|acceptance)|once .{0,80}complete|future|before production|independent review|user-facing surface|native mobile screen|third-party skill pack|moving from planning|dispatching or coordinating subagents|launch readiness|store submission|public beta)\b/i;

export interface LaterGuidanceContext {
  workflowId?: string;
  domainId?: string;
}

export interface LaterGuidanceEntry {
  loadWhen: string;
  path?: string;
  title?: string;
  referenceId?: string;
  domainId?: string;
}

export function domainIdFromWorkflowId(workflowId: string): string | undefined {
  const match = /^workflow\.([a-z0-9-]+)\./u.exec(workflowId);
  return match ? `domain.${match[1]}` : undefined;
}

export function domainIdFromKnowledgePath(path: string): string | undefined {
  const match = /(?:^|\/)knowledge\/([a-z0-9-]+)\//u.exec(path);
  return match ? `domain.${match[1]}` : undefined;
}

export function laterGuidanceContext(workflowId: string, domainId?: string): LaterGuidanceContext {
  return { workflowId, domainId: domainId ?? domainIdFromWorkflowId(workflowId) };
}

function workflowDomain(context: LaterGuidanceContext): string | undefined {
  return context.domainId ?? (context.workflowId ? domainIdFromWorkflowId(context.workflowId) : undefined);
}

function entryDomain(entry: Omit<LaterGuidanceEntry, "loadWhen">): string | undefined {
  return entry.domainId ?? (entry.path ? domainIdFromKnowledgePath(entry.path) : undefined);
}

/** This workflow's own book — keep it even when loadWhen names a later calendar phrase. */
export function isWorkflowOwnBook(entry: Omit<LaterGuidanceEntry, "loadWhen">, context: LaterGuidanceContext = {}): boolean {
  const workflowId = context.workflowId?.trim();
  if (workflowId && entry.referenceId) {
    const workflowLeaf = workflowId.replace(/^workflow\./u, "");
    const referenceLeaf = entry.referenceId.replace(/^reference\./u, "");
    if (workflowLeaf && referenceLeaf === workflowLeaf) return true;
  }
  const roleDomain = workflowDomain(context);
  const bookDomain = entryDomain(entry);
  return Boolean(roleDomain && bookDomain && roleDomain === bookDomain);
}

export function isLaterGuidance(
  loadWhen: string,
  context: LaterGuidanceContext = {},
  entry: Omit<LaterGuidanceEntry, "loadWhen"> = {},
): boolean {
  const text = loadWhen.trim();
  if (!text) return false;
  if (isWorkflowOwnBook(entry, context)) return false;
  if (workflowIdMentioned(text, context.workflowId)) return false;
  if (CURRENT_TASK.test(text)) return false;
  return LATER_HORIZON.test(text);
}

function workflowIdMentioned(loadWhen: string, workflowId: string | undefined): boolean {
  return Boolean(workflowId && loadWhen.toLowerCase().includes(workflowId.toLowerCase()));
}

export function partitionLoadWhen<T extends LaterGuidanceEntry>(
  entries: readonly T[],
  context: LaterGuidanceContext = {},
): { current: T[]; later: T[] } {
  const current: T[] = [];
  const later: T[] = [];
  for (const entry of entries) {
    (isLaterGuidance(entry.loadWhen, context, entry) ? later : current).push(entry);
  }
  return { current, later };
}
