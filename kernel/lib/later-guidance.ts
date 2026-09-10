/**
 * Later-horizon is relative to the current workflow, not a global `loadWhen`
 * phrase and not domain equality. A book this workflow binds as current work
 * stays current even when it lives in another domain. The same book is later
 * when a program packet binds it ahead of that work.
 *
 * Operator and security procedures (`paid-tool-routing`, secrets, Doppler,
 * founder-zero-operator, security-release-hardening) stay current only on the
 * action that owns them. Phrases such as `always` or `at workflow start` do
 * not keep those books current on a program packet.
 *
 * Explicit later phrasing (`later, after launch`) still defers.
 */
const EXPLICIT_LATER = /\b(later|after (this|dispatch|launch|acceptance)|once .{0,80}complete|future)\b/i;
const PROGRAM_FOREIGN_HORIZON =
  /\b(before production|independent review|user-facing surface|native mobile screen|third-party skill pack|moving from planning|dispatching or coordinating subagents|launch readiness|store submission|public beta)\b/i;

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

export function isProgramPacket(context: LaterGuidanceContext = {}): boolean {
  const workflowId = context.workflowId ?? "";
  return workflowDomain(context) === "domain.orchestration" || /full-launch-program/i.test(workflowId);
}

function workflowBookTail(workflowId: string): string | undefined {
  return /^workflow\.[a-z0-9-]+\.(.+)$/u.exec(workflowId)?.[1];
}

function isExactWorkflowBook(entry: Omit<LaterGuidanceEntry, "loadWhen">, context: LaterGuidanceContext): boolean {
  const workflowId = context.workflowId?.trim();
  if (!workflowId) return false;
  const workflowLeaf = workflowId.replace(/^workflow\./u, "");
  if (entry.referenceId) {
    const referenceLeaf = entry.referenceId.replace(/^reference\./u, "");
    if (workflowLeaf && referenceLeaf === workflowLeaf) return true;
  }
  const tail = workflowBookTail(workflowId);
  if (!tail) return false;
  const basename = entry.path?.split("/").pop()?.replace(/\.[^.]+$/u, "");
  return basename === tail;
}

function workflowIdMentioned(loadWhen: string, workflowId: string | undefined): boolean {
  return Boolean(workflowId && loadWhen.toLowerCase().includes(workflowId.toLowerCase()));
}

/**
 * A book this workflow binds as current work. Domain equality is not enough:
 * experience, store, and growth specialists bind design craft as current.
 * Program packets only keep their own-role books.
 */
export function isWorkflowOwnBook(entry: Omit<LaterGuidanceEntry, "loadWhen">, context: LaterGuidanceContext = {}): boolean {
  if (isExactWorkflowBook(entry, context)) return true;
  if (!isProgramPacket(context)) return true;
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
  if (workflowIdMentioned(text, context.workflowId)) return false;
  if (isExactWorkflowBook(entry, context)) return false;
  if (EXPLICIT_LATER.test(text)) return true;
  if (isWorkflowOwnBook(entry, context)) return false;
  return isProgramPacket(context) || PROGRAM_FOREIGN_HORIZON.test(text);
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

/** Prefer compose/dispatch deferred refs; otherwise partition the remaining load list. */
export function classifiedBriefLoads<T extends LaterGuidanceEntry>(
  load: readonly T[],
  context: LaterGuidanceContext,
  deferredLoad?: readonly T[],
): { current: T[]; later: T[] } {
  const partitioned = partitionLoadWhen(load, context);
  if (deferredLoad && deferredLoad.length > 0) return { current: partitioned.current, later: [...deferredLoad] };
  return partitioned;
}
