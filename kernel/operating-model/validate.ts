import { erasedSubjectDigest } from "./erasure-metadata.js";
import {
  epistemicStates,
  isOperatingEventType,
  isOperatingRecordKind,
  type EvidenceRecord,
  type ObservationRecord,
  type OperatingModel,
  type OperatingRecord,
  type OperatingRecordKind,
  type SourceCoordinates,
} from "./types.js";

export interface OperatingIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(code: string, message: string, path: string): OperatingIssue {
  return { severity: "error", code, message, path };
}

function hasProvenance(
  source: SourceCoordinates | undefined,
  observedAt: string,
  recordedAt: string,
  producer: string,
  independenceGroup: string,
  confidence: { lower: number; upper: number } | undefined,
): boolean {
  if (!source || source.uri.trim().length === 0 || source.revision.trim().length === 0) return false;
  if (observedAt.trim().length === 0 || recordedAt.trim().length === 0 || producer.trim().length === 0) return false;
  if (independenceGroup.trim().length === 0) return false;
  if (!confidence || !Number.isFinite(confidence.lower) || !Number.isFinite(confidence.upper)) return false;
  if (confidence.lower < 0 || confidence.upper > 1 || confidence.lower > confidence.upper) return false;
  return true;
}

export function parseOperatingModel(value: unknown): OperatingModel | undefined {
  if (!isRecord(value)) return undefined;
  if (value.schemaVersion !== "1.0.0") return undefined;
  if (!Array.isArray(value.records) || !Array.isArray(value.events) || !Array.isArray(value.evidenceRequests)) {
    return undefined;
  }
  return value as unknown as OperatingModel;
}

export function extractOperatingModel(document: unknown): OperatingModel | undefined {
  if (!isRecord(document)) return undefined;
  return document.operatingModel === undefined ? undefined : parseOperatingModel(document.operatingModel);
}

function currentById(records: readonly OperatingRecord[]): Map<string, OperatingRecord> {
  const latest = new Map<string, OperatingRecord>();
  for (const record of records) {
    const existing = latest.get(record.id);
    if (!existing || record.revision >= existing.revision) latest.set(record.id, record);
  }
  return latest;
}

function checkKindShape(record: OperatingRecord, path: string): OperatingIssue[] {
  switch (record.kind) {
    case "objective":
      return record.title.trim().length === 0 ? [issue("operating.invalid_record", "objective title is required", `${path}/title`)] : [];
    case "metric":
      return record.objectiveId.trim().length === 0 || record.name.trim().length === 0
        ? [issue("operating.invalid_record", "metric requires objectiveId and name", path)]
        : [];
    case "observation":
      return [];
    case "evidence":
      return Array.isArray(record.observationIds) ? [] : [issue("operating.invalid_record", "evidence requires observationIds", `${path}/observationIds`)];
    case "gap":
      return record.objectiveId.trim().length === 0 || record.metricId.trim().length === 0
        ? [issue("operating.invalid_record", "gap requires objectiveId and metricId", path)]
        : [];
    case "diagnosis":
      return record.gapId.trim().length === 0 || !Array.isArray(record.evidenceIds)
        ? [issue("operating.invalid_record", "diagnosis requires gapId and evidenceIds", path)]
        : [];
    case "option":
      return record.diagnosisId.trim().length === 0 || !Array.isArray(record.evidenceIds)
        ? [issue("operating.invalid_record", "option requires diagnosisId and evidenceIds", path)]
        : [];
    case "decision":
      return record.optionId.trim().length === 0 || !Array.isArray(record.evidenceIds)
        ? [issue("operating.invalid_record", "decision requires optionId and evidenceIds", path)]
        : [];
    case "expectation":
      return record.decisionId.trim().length === 0 ? [issue("operating.invalid_record", "expectation requires decisionId", `${path}/decisionId`)] : [];
    case "hypothesis":
      return record.decisionId.trim().length === 0 ? [issue("operating.invalid_record", "hypothesis requires decisionId", `${path}/decisionId`)] : [];
    case "outcome":
      return record.expectationId.trim().length === 0 || !Array.isArray(record.observationIds)
        ? [issue("operating.invalid_record", "outcome requires expectationId and observationIds", path)]
        : [];
    case "learning":
      return record.outcomeId.trim().length === 0 ? [issue("operating.invalid_record", "learning requires outcomeId", `${path}/outcomeId`)] : [];
    default: {
      const exhaustive: never = record;
      return [issue("operating.invalid_record", `unhandled record kind ${String((exhaustive as OperatingRecord).kind)}`, path)];
    }
  }
}

function referencedIds(record: OperatingRecord): Array<{ id: string; field: string; expectedKind: OperatingRecordKind }> {
  switch (record.kind) {
    case "objective":
      return [];
    case "metric":
      return [{ id: record.objectiveId, field: "objectiveId", expectedKind: "objective" }];
    case "observation":
      return [{ id: record.metricId, field: "metricId", expectedKind: "metric" }];
    case "evidence":
      return Array.isArray(record.observationIds)
        ? record.observationIds.map((id, index) => ({ id, field: `observationIds/${index}`, expectedKind: "observation" }))
        : [];
    case "gap": {
      const refs: Array<{ id: string; field: string; expectedKind: OperatingRecordKind }> = [
        { id: record.objectiveId, field: "objectiveId", expectedKind: "objective" },
        { id: record.metricId, field: "metricId", expectedKind: "metric" },
      ];
      if (record.observationId) refs.push({ id: record.observationId, field: "observationId", expectedKind: "observation" });
      return refs;
    }
    case "diagnosis":
      return [
        { id: record.gapId, field: "gapId", expectedKind: "gap" },
        ...(Array.isArray(record.evidenceIds)
          ? record.evidenceIds.map((id, index) => ({ id, field: `evidenceIds/${index}`, expectedKind: "evidence" as const }))
          : []),
      ];
    case "option":
      return [
        { id: record.diagnosisId, field: "diagnosisId", expectedKind: "diagnosis" },
        ...(Array.isArray(record.evidenceIds)
          ? record.evidenceIds.map((id, index) => ({ id, field: `evidenceIds/${index}`, expectedKind: "evidence" as const }))
          : []),
      ];
    case "decision":
      return [
        { id: record.optionId, field: "optionId", expectedKind: "option" },
        ...(Array.isArray(record.evidenceIds)
          ? record.evidenceIds.map((id, index) => ({ id, field: `evidenceIds/${index}`, expectedKind: "evidence" as const }))
          : []),
      ];
    case "expectation":
      return [{ id: record.decisionId, field: "decisionId", expectedKind: "decision" }];
    case "hypothesis":
      return [{ id: record.decisionId, field: "decisionId", expectedKind: "decision" }];
    case "outcome":
      return [
        { id: record.expectationId, field: "expectationId", expectedKind: "expectation" },
        ...(Array.isArray(record.observationIds)
          ? record.observationIds.map((id, index) => ({ id, field: `observationIds/${index}`, expectedKind: "observation" as const }))
          : []),
      ];
    case "learning":
      return [{ id: record.outcomeId, field: "outcomeId", expectedKind: "outcome" }];
    default: {
      const exhaustive: never = record;
      return exhaustive;
    }
  }
}

function isObservation(record: OperatingRecord): record is ObservationRecord {
  return record.kind === "observation";
}

function isEvidence(record: OperatingRecord): record is EvidenceRecord {
  return record.kind === "evidence";
}

export function validateOperatingModel(model: OperatingModel): OperatingIssue[] {
  const issues: OperatingIssue[] = [];
  if (model.schemaVersion !== "1.0.0") {
    issues.push(issue("operating.invalid_schema", `operatingModel.schemaVersion must be "1.0.0"`, "/operatingModel/schemaVersion"));
  }

  const seenRevisions = new Set<string>();
  for (const [index, record] of model.records.entries()) {
    const path = `/operatingModel/records/${index}`;
    if (!isOperatingRecordKind(record.kind)) {
      issues.push(issue("operating.invalid_record", `unknown record kind "${String(record.kind)}"`, `${path}/kind`));
      continue;
    }
    if (typeof record.id !== "string" || record.id.trim().length === 0) {
      issues.push(issue("operating.invalid_record", "record id is required", `${path}/id`));
    }
    if (!Number.isInteger(record.revision) || record.revision < 1) {
      issues.push(issue("operating.invalid_record", "record revision must be an integer >= 1", `${path}/revision`));
    }
    const key = `${record.id}@${record.revision}`;
    if (seenRevisions.has(key)) {
      issues.push(issue("operating.duplicate_revision", `duplicate record ${key}`, path));
    }
    seenRevisions.add(key);
    if (!(epistemicStates as readonly string[]).includes(record.epistemic)) {
      issues.push(issue("operating.invalid_record", `unknown epistemic state "${String(record.epistemic)}"`, `${path}/epistemic`));
    }
    issues.push(...checkKindShape(record, path));
    if (isObservation(record)) {
      if (record.revision !== 1) {
        issues.push(issue("operating.observation_mutated", `observation "${record.id}" cannot have revision ${record.revision}`, `${path}/revision`));
      }
      if (!hasProvenance(record.source, record.observedAt, record.recordedAt, record.producer, record.independenceGroup, record.confidence)) {
        issues.push(
          issue(
            "operating.missing_provenance",
            `observation "${record.id}" is missing source coordinates, times, producer, independence group, or confidence limits`,
            path,
          ),
        );
      }
    }
    if (isEvidence(record) && record.supportsBelief) {
      if (
        !hasProvenance(record.source, record.observedAt, record.recordedAt, record.producer, record.independenceGroup, record.confidence) ||
        record.observationIds.length === 0
      ) {
        issues.push(
          issue(
            "operating.belief_without_lineage",
            `evidence "${record.id}" cannot support a durable belief without provenance and at least one observation`,
            path,
          ),
        );
      }
    }
  }

  const latest = currentById(model.records);
  const requestIds = new Set(model.evidenceRequests.map((request) => request.id));
  for (const [index, record] of model.records.entries()) {
    const path = `/operatingModel/records/${index}`;
    for (const ref of referencedIds(record)) {
      const target = latest.get(ref.id);
      if (!ref.id || !target) {
        issues.push(issue("operating.dangling_reference", `record "${record.id}" references missing entity "${ref.id}"`, `${path}/${ref.field}`));
      } else if (target.kind !== ref.expectedKind) {
        issues.push(
          issue(
            "operating.invalid_record",
            `record "${record.id}" ${ref.field} must reference a ${ref.expectedKind}, not ${target.kind}`,
            `${path}/${ref.field}`,
          ),
        );
      }
    }
    if (record.kind === "gap" && record.missingEvidenceRequestId && !requestIds.has(record.missingEvidenceRequestId)) {
      issues.push(
        issue(
          "operating.dangling_reference",
          `gap "${record.id}" references missing evidence request "${record.missingEvidenceRequestId}"`,
          `${path}/missingEvidenceRequestId`,
        ),
      );
    }
    if (record.kind === "gap" && record.status === "gathering" && !record.missingEvidenceRequestId) {
      issues.push(issue("operating.missing_evidence_request", `gathering gap "${record.id}" must cite an evidence request`, path));
    }
  }

  const seenEventIds = new Set<string>();
  for (const [index, event] of model.events.entries()) {
    const path = `/operatingModel/events/${index}`;
    if (!isOperatingEventType(event.type)) {
      issues.push(issue("operating.invalid_event", `unknown event type "${String(event.type)}"`, `${path}/type`));
    }
    if (typeof event.id !== "string" || event.id.trim().length === 0) {
      issues.push(issue("operating.invalid_event", "event id is required", `${path}/id`));
    } else if (seenEventIds.has(event.id)) {
      issues.push(issue("operating.duplicate_id", `duplicate event ${event.id}`, `${path}/id`));
    } else {
      seenEventIds.add(event.id);
    }
    if (event.type === "observation_accepted" || event.type === "observation_rejected") {
      const observationId = typeof event.payload.observationId === "string" ? event.payload.observationId.trim() : "";
      const target = latest.get(observationId);
      if (!observationId || !target || target.kind !== "observation") {
        issues.push(issue("operating.invalid_event", `${event.type} requires an observation target`, `${path}/payload/observationId`));
      }
    }
    if (event.type === "source_revised") {
      const uri = typeof event.payload.uri === "string" ? event.payload.uri.trim() : "";
      const nextRevision = typeof event.payload.nextRevision === "string" ? event.payload.nextRevision.trim() : "";
      if (!uri || !nextRevision) {
        issues.push(issue("operating.invalid_event", "source_revised requires payload.uri and payload.nextRevision", `${path}/payload`));
      }
    }
  }

  const seenRequestIds = new Set<string>();
  for (const [index, request] of model.evidenceRequests.entries()) {
    const path = `/operatingModel/evidenceRequests/${index}`;
    if (typeof request.id !== "string" || request.id.trim().length === 0) {
      issues.push(issue("operating.invalid_event", "evidence request id is required", `${path}/id`));
    } else if (seenRequestIds.has(request.id)) {
      issues.push(issue("operating.duplicate_id", `duplicate evidence request ${request.id}`, `${path}/id`));
    } else {
      seenRequestIds.add(request.id);
    }
  }

  return issues;
}

function recordRevisionKey(record: OperatingRecord): string {
  return `${record.id}@${record.revision}`;
}

export function checkOperatingModelMutation(before: unknown, after: unknown): OperatingIssue[] {
  const beforeModel = extractOperatingModel(before);
  const afterModel = extractOperatingModel(after);
  if (beforeModel && !afterModel) {
    return [issue("operating.observation_mutated", "operatingModel was removed after records existed", "/operatingModel")];
  }
  const tombstonesBefore = beforeModel?.erasures ?? [];
  const tombstonesAfter = afterModel?.erasures ?? [];
  if (JSON.stringify(tombstonesBefore) !== JSON.stringify(tombstonesAfter)) {
    return [
      issue("operating.erasure_authority_required", "Erasure metadata changes only through the signed reducer erasure transition", "/operatingModel/erasures"),
    ];
  }
  if (
    afterModel?.records.some(
      (record) =>
        record.kind === "observation" &&
        record.subjectRef &&
        tombstonesBefore.some((entry) => entry.subjectDigests.includes(erasedSubjectDigest(entry.id, record.subjectRef!))),
    )
  ) {
    return [issue("operating.erased_subject_reintroduced", "A removed subject cannot be restored by an ordinary patch", "/operatingModel/records")];
  }
  if (!beforeModel || !afterModel) return [];
  const issues: OperatingIssue[] = [];
  const afterByKey = new Map(afterModel.records.map((record) => [recordRevisionKey(record), record]));
  for (const previous of beforeModel.records) {
    const key = recordRevisionKey(previous);
    const next = afterByKey.get(key);
    const code = isObservation(previous) ? "operating.observation_mutated" : "operating.record_mutated";
    if (!next) {
      issues.push(issue(code, `${previous.kind} "${previous.id}"@${previous.revision} was removed`, "/operatingModel/records"));
      continue;
    }
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      issues.push(issue(code, `${previous.kind} "${previous.id}"@${previous.revision} was rewritten in place`, `/operatingModel/records/${previous.id}`));
    }
  }
  appendOnlyById(issues, beforeModel.events, afterModel.events, "operating.event_mutated", "event", "/operatingModel/events");
  appendOnlyById(
    issues,
    beforeModel.evidenceRequests,
    afterModel.evidenceRequests,
    "operating.evidence_request_mutated",
    "evidence request",
    "/operatingModel/evidenceRequests",
  );
  return issues;
}

function appendOnlyById(
  issues: OperatingIssue[],
  previousItems: readonly { id: string }[],
  nextItems: readonly { id: string }[],
  code: OperatingIssue["code"],
  label: string,
  collectionPath: string,
): void {
  for (const [index, previous] of previousItems.entries()) {
    const next = nextItems[index];
    if (!next || next.id !== previous.id) {
      issues.push(issue(code, `${label} "${previous.id}" was removed or reordered`, collectionPath));
      continue;
    }
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      issues.push(issue(code, `${label} "${previous.id}" was rewritten in place`, `${collectionPath}/${previous.id}`));
    }
  }
}
