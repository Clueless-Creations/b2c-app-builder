import type { BeliefSupport, ObservationStatus, OperatingEvent, OperatingModel, OperatingProjection, OperatingRecord, ReplayClock } from "./types.js";

function currentById(records: readonly OperatingRecord[]): Record<string, OperatingRecord> {
  const latest: Record<string, OperatingRecord> = {};
  const ordered = [...records].sort((left, right) => left.id.localeCompare(right.id) || left.revision - right.revision);
  for (const record of ordered) {
    const existing = latest[record.id];
    if (!existing || record.revision >= existing.revision) latest[record.id] = record;
  }
  return latest;
}

function observationStatuses(events: readonly OperatingEvent[]): Record<string, ObservationStatus> {
  const statuses: Record<string, ObservationStatus> = {};
  for (const event of events) {
    const observationId = typeof event.payload.observationId === "string" ? event.payload.observationId : "";
    if (!observationId) continue;
    if (event.type === "observation_accepted") statuses[observationId] = "accepted";
    if (event.type === "observation_rejected") statuses[observationId] = "rejected";
  }
  return statuses;
}

function currentSourceRevision(events: readonly OperatingEvent[], uri: string): string | undefined {
  let revision: string | undefined;
  for (const event of events) {
    if (event.type !== "source_revised") continue;
    if (event.payload.uri !== uri) continue;
    if (typeof event.payload.nextRevision === "string") revision = event.payload.nextRevision;
  }
  return revision;
}

function supportSourcesForRecord(
  record: OperatingRecord,
  byId: Record<string, OperatingRecord>,
): Array<{ uri: string; revision: string }> {
  switch (record.kind) {
    case "observation":
    case "evidence":
      return [{ uri: record.source.uri, revision: record.source.revision }];
    case "diagnosis":
    case "option":
      return record.evidenceIds.flatMap((evidenceId) => {
        const evidence = byId[evidenceId];
        return evidence && evidence.kind === "evidence" ? [{ uri: evidence.source.uri, revision: evidence.source.revision }] : [];
      });
    case "objective":
    case "metric":
    case "gap":
    case "decision":
    case "expectation":
    case "hypothesis":
    case "outcome":
    case "learning":
      return [];
    default: {
      const exhaustive: never = record;
      return exhaustive;
    }
  }
}

function beliefSupportFor(record: OperatingRecord, byId: Record<string, OperatingRecord>): BeliefSupport | undefined {
  if (record.kind !== "diagnosis" && record.kind !== "option") return undefined;
  const groups: string[] = [];
  for (const evidenceId of record.evidenceIds) {
    const evidence = byId[evidenceId];
    if (evidence?.kind === "evidence") groups.push(evidence.independenceGroup);
  }
  const unique = new Set(groups);
  return {
    independentGroupCount: unique.size,
    duplicateCopiesIgnored: Math.max(0, groups.length - unique.size),
  };
}

export function projectOperatingModel(model: OperatingModel, clock: ReplayClock): OperatingProjection {
  const current = currentById(model.records);
  const statuses = observationStatuses(model.events);
  for (const record of Object.values(current)) {
    if (record.kind === "observation" && statuses[record.id] === undefined) statuses[record.id] = "recorded";
  }
  const staleIds: string[] = [];
  const beliefSupport: Record<string, BeliefSupport> = {};
  for (const record of Object.values(current).sort((left, right) => left.id.localeCompare(right.id))) {
    const supports = supportSourcesForRecord(record, current);
    if (
      supports.some((support) => {
        const liveRevision = currentSourceRevision(model.events, support.uri);
        return Boolean(liveRevision && liveRevision !== support.revision);
      })
    ) {
      staleIds.push(record.id);
    }
    const support = beliefSupportFor(record, current);
    if (support) beliefSupport[record.id] = support;
  }
  return {
    clock: clock.now,
    currentById: current,
    observationStatuses: statuses,
    staleIds: [...staleIds].sort(),
    beliefSupport,
    evidenceRequests: [...model.evidenceRequests].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function projectionBytes(projection: OperatingProjection): string {
  return `${JSON.stringify(projection)}\n`;
}
