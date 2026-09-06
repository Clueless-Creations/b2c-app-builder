import { validateOperatingModel, type OperatingIssue } from "./validate.js";
import {
  emptyOperatingModel,
  isOperatingEventType,
  type EvidenceRequest,
  type OperatingEvent,
  type OperatingModel,
  type OperatingRecord,
  type ReplayClock,
} from "./types.js";

export class OperatingEventRejected extends Error {
  readonly issues: OperatingIssue[];
  constructor(issues: OperatingIssue[]) {
    super(issues.map((item) => `${item.code}: ${item.message}`).join("; "));
    this.issues = issues;
  }
}

function cloneModel(model: OperatingModel): OperatingModel {
  return JSON.parse(JSON.stringify(model)) as OperatingModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvidenceRequest(value: unknown): EvidenceRequest | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const needed = typeof value.needed === "string" ? value.needed.trim() : "";
  const recordedAt = typeof value.recordedAt === "string" ? value.recordedAt.trim() : "";
  const status = value.status;
  if (!id || !needed || !recordedAt || (status !== "open" && status !== "gathering" && status !== "fulfilled" && status !== "cancelled")) {
    return undefined;
  }
  const gapId = typeof value.gapId === "string" ? value.gapId.trim() : "";
  return gapId ? { id, status, needed, recordedAt, gapId } : { id, status, needed, recordedAt };
}

function applyOne(model: OperatingModel, event: OperatingEvent): OperatingModel {
  const next = cloneModel(model);
  next.events = [...next.events, event];
  switch (event.type) {
    case "record_appended": {
      const record = event.payload.record;
      if (!isRecord(record)) {
        throw new OperatingEventRejected([
          { severity: "error", code: "operating.invalid_event", message: "record_appended requires payload.record", path: "/operatingModel/events" },
        ]);
      }
      next.records = [...next.records, record as unknown as OperatingRecord];
      return next;
    }
    case "observation_accepted":
    case "observation_rejected": {
      const observationId = typeof event.payload.observationId === "string" ? event.payload.observationId.trim() : "";
      const target = [...next.records].reverse().find((record) => record.id === observationId);
      if (!observationId || !target || target.kind !== "observation") {
        throw new OperatingEventRejected([
          {
            severity: "error",
            code: "operating.invalid_event",
            message: `${event.type} requires payload.observationId that resolves to an observation`,
            path: "/operatingModel/events",
          },
        ]);
      }
      return next;
    }
    case "source_revised": {
      const uri = typeof event.payload.uri === "string" ? event.payload.uri.trim() : "";
      const nextRevision = typeof event.payload.nextRevision === "string" ? event.payload.nextRevision.trim() : "";
      if (!uri || !nextRevision) {
        throw new OperatingEventRejected([
          {
            severity: "error",
            code: "operating.invalid_event",
            message: "source_revised requires payload.uri and payload.nextRevision",
            path: "/operatingModel/events",
          },
        ]);
      }
      return next;
    }
    case "evidence_requested": {
      const request = parseEvidenceRequest(event.payload.request);
      if (!request) {
        throw new OperatingEventRejected([
          {
            severity: "error",
            code: "operating.invalid_event",
            message: "evidence_requested requires a complete payload.request",
            path: "/operatingModel/events",
          },
        ]);
      }
      next.evidenceRequests = [...next.evidenceRequests, request];
      return next;
    }
    default: {
      const exhaustive: never = event.type;
      throw new OperatingEventRejected([
        { severity: "error", code: "operating.invalid_event", message: `unhandled event type ${String(exhaustive)}`, path: "/operatingModel/events" },
      ]);
    }
  }
}

export function applyOperatingEvent(model: OperatingModel, event: OperatingEvent, _clock: ReplayClock): OperatingModel {
  if (!isOperatingEventType(event.type)) {
    throw new OperatingEventRejected([
      { severity: "error", code: "operating.invalid_event", message: `unknown event type "${String(event.type)}"`, path: "/operatingModel/events" },
    ]);
  }
  const next = applyOne(model, event);
  const issues = validateOperatingModel(next);
  if (issues.length > 0) throw new OperatingEventRejected(issues);
  return next;
}

export function applyOperatingEvents(model: OperatingModel, events: readonly OperatingEvent[], clock: ReplayClock): OperatingModel {
  return events.reduce((current, event) => applyOperatingEvent(current, event, clock), model);
}

export function appendOperatingRecord(model: OperatingModel, record: OperatingRecord, clock: ReplayClock, producer: string, eventId: string): OperatingModel {
  return applyOperatingEvent(
    model,
    {
      id: eventId,
      type: "record_appended",
      recordedAt: clock.now,
      producer,
      payload: { record },
    },
    clock,
  );
}

export function seedOperatingModel(records: readonly OperatingRecord[], clock: ReplayClock, producer: string): OperatingModel {
  return records.reduce((model, record, index) => appendOperatingRecord(model, record, clock, producer, `event.record.${index + 1}`), emptyOperatingModel());
}
