/**
 * The evidence dialect grammar shared by the runtime schema layer (kernel/schema/index.ts) and the
 * research validator (checks/validation/business/research/check-research-evidence.ts): RFC 3339 and ISO
 * date rules, the offer-measurement parser, the Category Revenue source label, and the signal
 * supersession graph check. It lives under kernel/ so the runtime never imports from checks/validation/;
 * the validator re-exports it from research-evidence-helpers.ts, so no validator import changes.
 */
export type SignalLifecycle = "current" | "dated" | "superseded" | "rejected" | "unverified";

export interface OfferMeasurement {
  readonly exposure: number;
  readonly conversions: number;
}

export interface SignalSupersessionRecord {
  readonly id: string;
  readonly lifecycle: SignalLifecycle;
  /** For a superseded record, this is the newer signal that replaces it. */
  readonly replacementId: string;
}

export interface SignalSupersessionValidation {
  readonly invalidSignalIds: readonly string[];
}

/**
 * Validate an RFC3339 instant against a caller-supplied reference time. Kept
 * separate from the real-clock wrapper below so a deterministic caller (an
 * adapter fixture, a future test) can inject a fixed "now" instead of every
 * consumer growing its own copy of this grammar.
 */
export function isValidRfc3339Instant(value: string | undefined, referenceNow: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value ?? "");
  if (!match) return false;

  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;
  const datePart = `${year}-${month}-${day}`;
  const calendarDate = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) return false;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return false;
  if (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) return false;

  const instant = new Date(value ?? "");
  return !Number.isNaN(instant.getTime()) && instant.getTime() <= referenceNow.getTime();
}

/** Real-clock convenience wrapper — the one check-research-evidence.ts has always called. */
export function isValidNonFutureRfc3339Instant(value: string | undefined): boolean {
  return isValidRfc3339Instant(value, new Date());
}

/** A calendar date (no time-of-day) that is a real date and not in the future. */
export function isValidPastIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() <= Date.now();
}

/**
 * Render the Category Revenue Reality "Source / observed at" cell for one
 * AppKittie-sourced row. Shared by the renderer and the AppKittie adapter so
 * the cell format — a dated, non-placeholder source string the validator's
 * regex can find — has exactly one implementation.
 */
export function formatCategoryRevenueSourceLabel(tool: string, observedAtIso: string): string {
  return `AppKittie ${tool}, observed ${observedAtIso.slice(0, 10)}`;
}

function parseWholeNumberCount(value: string): number | undefined {
  const normalized = value.trim();
  const validDigits = /^\d+$/.test(normalized) || /^\d{1,3}(?:,\d{3})+$/.test(normalized);
  if (!validDigits) return undefined;

  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Parse one measured offer-test result without accepting fractional or impossible counts. */
export function parseOfferMeasurement(exposureValue: string, conversionValue: string): OfferMeasurement | undefined {
  const exposure = parseWholeNumberCount(exposureValue);
  const conversions = parseWholeNumberCount(conversionValue);
  if (exposure === undefined || conversions === undefined || exposure <= 0 || conversions > exposure) return undefined;
  return { exposure, conversions };
}

/**
 * Validate every supersession chain as a graph. A superseded signal must point to a
 * different declared signal, the graph must be acyclic, and the chain must end at a
 * current or dated signal that can still support evidence.
 */
export function validateSignalSupersessionGraph(records: readonly SignalSupersessionRecord[]): SignalSupersessionValidation {
  const recordsById = new Map<string, SignalSupersessionRecord>();
  const invalidSignalIds = new Set<string>();

  for (const record of records) {
    if (recordsById.has(record.id)) invalidSignalIds.add(record.id);
    else recordsById.set(record.id, record);
  }

  for (const origin of records) {
    if (origin.lifecycle !== "superseded") continue;

    const chain: string[] = [];
    const visited = new Set<string>();
    let current: SignalSupersessionRecord | undefined = origin;

    while (current?.lifecycle === "superseded") {
      if (visited.has(current.id)) {
        for (const signalId of chain) invalidSignalIds.add(signalId);
        invalidSignalIds.add(current.id);
        current = undefined;
        break;
      }

      visited.add(current.id);
      chain.push(current.id);
      const replacementId = current.replacementId.trim().toUpperCase();
      if (replacementId.length === 0 || replacementId === current.id || !recordsById.has(replacementId)) {
        for (const signalId of chain) invalidSignalIds.add(signalId);
        current = undefined;
        break;
      }
      current = recordsById.get(replacementId);
    }

    if (current && current.lifecycle !== "current" && current.lifecycle !== "dated") {
      for (const signalId of chain) invalidSignalIds.add(signalId);
    }
  }

  return { invalidSignalIds: [...invalidSignalIds].sort() };
}
