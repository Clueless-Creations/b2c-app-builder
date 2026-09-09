/**
 * Command-specific EAS CLI observation decode (#105).
 *
 * Encoder (argv.ts) and transport (process.ts) stay separate. This module turns raw stdout
 * into a typed observation. It does not decide business acceptance, grant authority, or persist
 * request identity. #106 owns bind-before-reconcile, pre-dispatch durability, and fresh-process
 * recovery; do not fold those into this helper.
 *
 * Native envelopes (EAS CLI 23.2.0, independently reviewed):
 * - `eas build` / `--json`: `printJsonOnlyOutput` of a BuildFragment array
 *   (no-wait, wait, and wait+auto-submit paths). See packages/eas-cli/src/build/runBuildAndSubmit.ts.
 * - `eas build:view --json`: `printJsonOnlyOutput` of one BuildFragment.
 *   See packages/eas-cli/src/commands/build/view.ts.
 * - `eas build:list --json`: BuildFragment array.
 * - Local `--json` is documented, but the local-plugin path returns before that print; non-JSON
 *   plugin logs are expected and are not a cloud job.
 * - `eas workflow:run --json` without wait: `{ id, url }`. With wait / `workflow:status --json`:
 *   one workflow-run object. `workflow:runs --json`: processed-run array.
 * - `eas submit` documents no `--json`. `submit:view --json` is one submission object.
 *
 * GraphQL JSON uses `IN_QUEUE` / `IOS`, not the CLI flag spellings `in-queue` / `ios`.
 * A fake process must not define this contract; fixtures live under
 * checks/verification/test/data/expo-eas/.
 */

import { EAS_CLI_DOCUMENTED_VERSION, getExpoEasCommand, type ExpoEasCommandId } from "../../../catalog/stacks/expo-eas-commands.js";
import { mapEasBuildStatus, type EasRemoteJobState } from "./jobs.js";

export const EAS_DECODE_REVIEWED_VERSION = EAS_CLI_DOCUMENTED_VERSION;
export const EAS_DECODE_PROVIDER = "eas-cli" as const;

export type EasDecodeCode =
  | "ok"
  | "partial"
  | "wrong-shape"
  | "malformed-json"
  | "not-json"
  | "empty"
  | "unsupported-multiplicity"
  | "target-mismatch"
  | "unsupported-command";

export type EasDecodedRecordKind = "build" | "submission" | "workflow-run";

export interface EasDecodeExpectedTarget {
  readonly platform?: "ios" | "android";
  readonly profile?: string;
  readonly easProjectId?: string;
  readonly buildId?: string;
  readonly submissionId?: string;
}

export interface EasDecodeRequest {
  readonly commandId: ExpoEasCommandId;
  readonly stdout: string;
  readonly expected?: EasDecodeExpectedTarget;
  readonly nowMs?: number;
}

export interface EasDecodedRecord {
  readonly kind: EasDecodedRecordKind;
  readonly nativeId: string;
  readonly qualifiedId: string;
  readonly nativeStatus?: string;
  readonly jobState?: EasRemoteJobState;
  readonly platform?: "ios" | "android";
  readonly profile?: string;
  readonly easProjectId?: string;
  readonly artifactUrl?: string;
  readonly artifactAvailable: boolean;
  readonly artifactExpired: boolean;
}

export interface EasDecodedObservation {
  readonly commandId: ExpoEasCommandId;
  readonly provider: typeof EAS_DECODE_PROVIDER;
  readonly reviewedVersion: typeof EAS_DECODE_REVIEWED_VERSION;
  readonly code: EasDecodeCode;
  readonly protocolValid: boolean;
  readonly boundRemoteId?: string;
  readonly observedRemoteIds: readonly string[];
  readonly qualifiedRemoteIds: readonly string[];
  readonly nativeStatus?: string;
  readonly jobState?: EasRemoteJobState;
  readonly artifactUrl?: string;
  readonly artifactAvailable: boolean;
  readonly artifactExpired: boolean;
  readonly records: readonly EasDecodedRecord[];
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function qualify(kind: EasDecodedRecordKind, id: string): string {
  switch (kind) {
    case "build":
      return `eas:build:${id}`;
    case "submission":
      return `eas:submission:${id}`;
    case "workflow-run":
      return `eas:workflow-run:${id}`;
    default: {
      const exhaustive: never = kind;
      throw new Error(`unhandled EAS record kind: ${String(exhaustive)}`);
    }
  }
}

function mapPlatform(value: unknown): "ios" | "android" | undefined {
  if (value === "IOS" || value === "ios") return "ios";
  if (value === "ANDROID" || value === "android") return "android";
  return undefined;
}

function mapWorkflowStatus(status: string | undefined): EasRemoteJobState | undefined {
  switch (status) {
    case "NEW":
    case "WAITING":
      return "queued";
    case "IN_PROGRESS":
    case "ACTION_REQUIRED":
      return "running";
    case "SUCCESS":
      return "finished";
    case "FAILURE":
      return "errored";
    case "CANCELED":
      return "canceled";
    default:
      return undefined;
  }
}

function mapSubmissionStatus(status: string | undefined): EasRemoteJobState | undefined {
  switch (status) {
    case "AWAITING_BUILD":
    case "awaiting-build":
    case "IN_QUEUE":
    case "in-queue":
    case "new":
    case "NEW":
      return "queued";
    case "IN_PROGRESS":
    case "in-progress":
      return "running";
    case "FINISHED":
    case "finished":
      return "finished";
    case "ERRORED":
    case "errored":
      return "errored";
    case "CANCELED":
    case "canceled":
      return "canceled";
    default:
      return undefined;
  }
}

function mappedBuildState(status: string | undefined): EasRemoteJobState | undefined {
  const mapped = mapEasBuildStatus(status);
  return mapped === "invalid" ? undefined : mapped;
}

function readExpirationMs(record: Record<string, unknown>): number | undefined {
  const raw = record.expirationDate;
  if (typeof raw !== "string") return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

function readArtifact(record: Record<string, unknown>, nowMs: number): {
  url?: string;
  expired: boolean;
  available: boolean;
} {
  const artifacts = isRecord(record.artifacts) ? record.artifacts : undefined;
  const url =
    asNonEmptyString(artifacts?.applicationArchiveUrl) ??
    asNonEmptyString(artifacts?.buildUrl) ??
    asNonEmptyString(record.applicationArchiveUrl) ??
    asNonEmptyString(record.artifactsUrl);
  const expirationMs = readExpirationMs(record);
  const expired = expirationMs !== undefined && expirationMs <= nowMs;
  return { url, expired, available: Boolean(url) && !expired };
}

function parseStdoutJson(stdout: string): { ok: true; value: unknown } | { ok: false; code: "empty" | "malformed-json" } {
  const text = stdout.trim();
  if (!text) return { ok: false, code: "empty" };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "malformed-json" };
  }
}

function observation(input: {
  commandId: ExpoEasCommandId;
  code: EasDecodeCode;
  protocolValid: boolean;
  records: readonly EasDecodedRecord[];
  bound?: EasDecodedRecord;
  message: string;
  nativeStatus?: string;
  jobState?: EasRemoteJobState;
  artifactUrl?: string;
  artifactAvailable?: boolean;
  artifactExpired?: boolean;
}): EasDecodedObservation {
  const bound = input.bound;
  return {
    commandId: input.commandId,
    provider: EAS_DECODE_PROVIDER,
    reviewedVersion: EAS_DECODE_REVIEWED_VERSION,
    code: input.code,
    protocolValid: input.protocolValid,
    boundRemoteId: bound?.nativeId,
    observedRemoteIds: input.records.map((record) => record.nativeId),
    qualifiedRemoteIds: input.records.map((record) => record.qualifiedId),
    nativeStatus: bound?.nativeStatus ?? input.nativeStatus,
    jobState: bound?.jobState ?? input.jobState,
    artifactUrl: bound?.artifactExpired ? undefined : (bound?.artifactUrl ?? input.artifactUrl),
    artifactAvailable: bound?.artifactAvailable ?? input.artifactAvailable ?? false,
    artifactExpired: bound?.artifactExpired ?? input.artifactExpired ?? false,
    records: input.records,
    message: input.message,
  };
}

function decodeBuildRecord(value: unknown, nowMs: number): EasDecodedRecord | undefined {
  if (!isRecord(value)) return undefined;
  const nativeId = asNonEmptyString(value.id) ?? asNonEmptyString(value.buildId);
  if (!nativeId) return undefined;
  const app = isRecord(value.app) ? value.app : undefined;
  const artifact = readArtifact(value, nowMs);
  const nativeStatus = asNonEmptyString(value.status);
  return {
    kind: "build",
    nativeId,
    qualifiedId: qualify("build", nativeId),
    nativeStatus,
    jobState: mappedBuildState(nativeStatus),
    platform: mapPlatform(value.platform),
    profile: asNonEmptyString(value.buildProfile),
    easProjectId: asNonEmptyString(app?.id),
    artifactUrl: artifact.url,
    artifactAvailable: artifact.available,
    artifactExpired: artifact.expired,
  };
}

function decodeSubmissionRecord(value: unknown): EasDecodedRecord | undefined {
  if (!isRecord(value)) return undefined;
  const nativeId = asNonEmptyString(value.id);
  if (!nativeId) return undefined;
  const app = isRecord(value.app) ? value.app : undefined;
  const nativeStatus = asNonEmptyString(value.status);
  return {
    kind: "submission",
    nativeId,
    qualifiedId: qualify("submission", nativeId),
    nativeStatus,
    jobState: mapSubmissionStatus(nativeStatus),
    platform: mapPlatform(value.platform),
    easProjectId: asNonEmptyString(app?.id),
    artifactAvailable: false,
    artifactExpired: false,
  };
}

function decodeWorkflowRecord(value: unknown): EasDecodedRecord | undefined {
  if (!isRecord(value)) return undefined;
  const nativeId = asNonEmptyString(value.id);
  if (!nativeId) return undefined;
  const nativeStatus = asNonEmptyString(value.status);
  return {
    kind: "workflow-run",
    nativeId,
    qualifiedId: qualify("workflow-run", nativeId),
    nativeStatus,
    jobState: mapWorkflowStatus(nativeStatus),
    artifactAvailable: false,
    artifactExpired: false,
  };
}

function collectBuildRecords(value: unknown, nowMs: number): {
  records: EasDecodedRecord[];
  skippedNull: boolean;
  skippedIdless: boolean;
} {
  const items = Array.isArray(value) ? value : [];
  const records: EasDecodedRecord[] = [];
  let skippedNull = false;
  let skippedIdless = false;
  for (const item of items) {
    if (item === null) {
      skippedNull = true;
      continue;
    }
    const record = decodeBuildRecord(item, nowMs);
    if (record) records.push(record);
    else if (isRecord(item)) skippedIdless = true;
  }
  return { records, skippedNull, skippedIdless };
}

function matchesExpected(record: EasDecodedRecord, expected: EasDecodeExpectedTarget | undefined): boolean {
  if (!expected) return true;
  if (expected.buildId && record.kind === "build" && record.nativeId !== expected.buildId) return false;
  if (expected.submissionId && record.kind === "submission" && record.nativeId !== expected.submissionId) return false;
  if (expected.platform && record.platform && record.platform !== expected.platform) return false;
  if (expected.profile && record.profile && record.profile !== expected.profile) return false;
  if (expected.easProjectId && record.easProjectId && record.easProjectId !== expected.easProjectId) return false;
  return true;
}

function bindBuildRecords(
  commandId: ExpoEasCommandId,
  records: readonly EasDecodedRecord[],
  expected: EasDecodeExpectedTarget | undefined,
  partial: boolean,
): EasDecodedObservation {
  const matching = records.filter((record) => matchesExpected(record, expected));
  if (records.length === 0) {
    return observation({
      commandId,
      code: "empty",
      protocolValid: false,
      records,
      message: "JSON was an empty build array. No remote build id is available.",
    });
  }
  if (matching.length > 1) {
    return observation({
      commandId,
      code: "unsupported-multiplicity",
      protocolValid: false,
      records,
      message: `Multiple EAS builds were observed (${records.map((record) => record.qualifiedId).join(", ")}). Refusing to bind array[0] or the latest project build.`,
    });
  }
  if (matching.length === 0) {
    return observation({
      commandId,
      code: "target-mismatch",
      protocolValid: false,
      records,
      message: "Observed EAS build records do not match the requested project, platform, or profile. Remote ids are retained and not silently adopted.",
    });
  }
  const bound = matching[0]!;
  const code: EasDecodeCode = partial || !bound.jobState || skippedCompleteness(bound) ? "partial" : "ok";
  return observation({
    commandId,
    code,
    protocolValid: true,
    records,
    bound,
    message:
      code === "ok"
        ? "EAS build observation decoded from the command-specific JSON envelope."
        : "EAS build identity was preserved from a partial or non-terminal observation. Protocol validity is not installable-artifact proof.",
  });
}

function skippedCompleteness(bound: EasDecodedRecord): boolean {
  return bound.jobState === "finished" && !bound.artifactAvailable;
}

function jsonFailure(commandId: ExpoEasCommandId, code: "empty" | "malformed-json"): EasDecodedObservation {
  return observation({
    commandId,
    code,
    protocolValid: false,
    records: [],
    message:
      code === "empty"
        ? "Expected JSON for this EAS command but stdout was empty."
        : "Expected JSON for this EAS command but stdout was not valid JSON.",
  });
}

function wrongShape(commandId: ExpoEasCommandId, message: string, records: readonly EasDecodedRecord[] = []): EasDecodedObservation {
  return observation({
    commandId,
    code: "wrong-shape",
    protocolValid: false,
    records,
    message,
  });
}

function decodeBuildArrayCommand(
  commandId: ExpoEasCommandId,
  stdout: string,
  expected: EasDecodeExpectedTarget | undefined,
  nowMs: number,
  mode: "bind" | "list",
): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (isRecord(parsed.value)) {
    const mistaken = decodeBuildRecord(parsed.value, nowMs);
    return wrongShape(
      commandId,
      `${commandId} JSON is a BuildFragment array in EAS CLI ${EAS_DECODE_REVIEWED_VERSION}. A single object is the build:view envelope and is not this command.`,
      mistaken ? [mistaken] : [],
    );
  }
  if (!Array.isArray(parsed.value)) {
    return wrongShape(commandId, `${commandId} JSON must be a BuildFragment array.`);
  }
  const collected = collectBuildRecords(parsed.value, nowMs);
  const partial = collected.skippedNull || collected.skippedIdless;
  if (mode === "list") {
    return observation({
      commandId,
      code: collected.records.length === 0 ? "empty" : partial ? "partial" : "ok",
      protocolValid: true,
      records: collected.records,
      message: "EAS build:list observation retained every build id. Listing is not a bound job and does not pick array[0].",
    });
  }
  return bindBuildRecords(commandId, collected.records, expected, partial);
}

function decodeBuildView(commandId: ExpoEasCommandId, stdout: string, expected: EasDecodeExpectedTarget | undefined, nowMs: number): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (Array.isArray(parsed.value)) {
    const collected = collectBuildRecords(parsed.value, nowMs);
    return wrongShape(
      commandId,
      `${commandId} JSON is one BuildFragment object in EAS CLI ${EAS_DECODE_REVIEWED_VERSION}. An array is the eas build / build:list envelope and is not silently reduced to array[0].`,
      collected.records,
    );
  }
  const record = decodeBuildRecord(parsed.value, nowMs);
  if (!record) {
    return observation({
      commandId,
      code: "partial",
      protocolValid: false,
      records: [],
      message: "build:view JSON was an object without a usable build id.",
    });
  }
  if (!matchesExpected(record, expected)) {
    return observation({
      commandId,
      code: "target-mismatch",
      protocolValid: false,
      records: [record],
      message: "build:view returned a build that does not match the requested id, project, platform, or profile.",
    });
  }
  const code: EasDecodeCode = !record.jobState || skippedCompleteness(record) ? "partial" : "ok";
  return observation({
    commandId,
    code,
    protocolValid: true,
    records: [record],
    bound: record,
    message: "EAS build:view observation decoded from the single-object envelope.",
  });
}

function decodeSubmitView(commandId: ExpoEasCommandId, stdout: string, expected: EasDecodeExpectedTarget | undefined): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (Array.isArray(parsed.value)) {
    const records = parsed.value.flatMap((item) => {
      const record = decodeSubmissionRecord(item);
      return record ? [record] : [];
    });
    return wrongShape(commandId, "submit:view JSON is one submission object, not an array.", records);
  }
  const record = decodeSubmissionRecord(parsed.value);
  if (!record) {
    return observation({
      commandId,
      code: "partial",
      protocolValid: false,
      records: [],
      message: "submit:view JSON was an object without a usable submission id.",
    });
  }
  if (!matchesExpected(record, expected)) {
    return observation({
      commandId,
      code: "target-mismatch",
      protocolValid: false,
      records: [record],
      message: "submit:view returned a submission that does not match the requested id or platform.",
    });
  }
  return observation({
    commandId,
    code: record.jobState ? "ok" : "partial",
    protocolValid: true,
    records: [record],
    bound: record,
    message: "EAS submit:view observation decoded. Finished is not store release.",
  });
}

function decodeSubmitList(commandId: ExpoEasCommandId, stdout: string): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (!Array.isArray(parsed.value)) {
    return wrongShape(commandId, "submit:list JSON is a submission array.");
  }
  const records = parsed.value.flatMap((item) => {
    const record = decodeSubmissionRecord(item);
    return record ? [record] : [];
  });
  return observation({
    commandId,
    code: records.length === 0 ? "empty" : "ok",
    protocolValid: Array.isArray(parsed.value),
    records,
    message: "EAS submit:list observation retained every submission id. Listing is not a bound job.",
  });
}

function decodeWorkflowRun(commandId: ExpoEasCommandId, stdout: string): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (Array.isArray(parsed.value)) {
    return wrongShape(commandId, "workflow:run JSON is one run object ({ id, url } without wait, or the run-with-jobs object with wait), not a build array.");
  }
  const record = decodeWorkflowRecord(parsed.value);
  if (!record) {
    return observation({
      commandId,
      code: "partial",
      protocolValid: false,
      records: [],
      message: "workflow:run JSON was an object without a usable run id.",
    });
  }
  return observation({
    commandId,
    code: record.jobState ? "ok" : "partial",
    protocolValid: true,
    records: [record],
    bound: record,
    message: "EAS workflow:run observation decoded. A run id is not a finished workflow or a build artifact.",
  });
}

function decodeWorkflowStatus(commandId: ExpoEasCommandId, stdout: string, expected: EasDecodeExpectedTarget | undefined): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (Array.isArray(parsed.value)) {
    return wrongShape(commandId, "workflow:status JSON is one workflow-run object.");
  }
  const record = decodeWorkflowRecord(parsed.value);
  if (!record) {
    return observation({
      commandId,
      code: "partial",
      protocolValid: false,
      records: [],
      message: "workflow:status JSON was an object without a usable run id.",
    });
  }
  if (expected?.buildId && record.nativeId !== expected.buildId) {
    return observation({
      commandId,
      code: "target-mismatch",
      protocolValid: false,
      records: [record],
      message: "workflow:status returned a run id that does not match the requested run.",
    });
  }
  return observation({
    commandId,
    code: record.jobState ? "ok" : "partial",
    protocolValid: true,
    records: [record],
    bound: record,
    message: "EAS workflow:status observation decoded. Success is not a build artifact.",
  });
}

function decodeWorkflowRuns(commandId: ExpoEasCommandId, stdout: string): EasDecodedObservation {
  const parsed = parseStdoutJson(stdout);
  if (!parsed.ok) return jsonFailure(commandId, parsed.code);
  if (!Array.isArray(parsed.value)) {
    return wrongShape(commandId, "workflow:runs JSON is an array of processed runs.");
  }
  const records = parsed.value.flatMap((item) => {
    const record = decodeWorkflowRecord(item);
    return record ? [record] : [];
  });
  return observation({
    commandId,
    code: records.length === 0 ? "empty" : "ok",
    protocolValid: true,
    records,
    message: "EAS workflow:runs observation retained every run id. Listing is not a bound job.",
  });
}

function notJson(commandId: ExpoEasCommandId, message: string): EasDecodedObservation {
  return observation({
    commandId,
    code: "not-json",
    protocolValid: false,
    records: [],
    message,
  });
}

export function decodeExpoEasResponse(input: EasDecodeRequest): EasDecodedObservation {
  const spec = getExpoEasCommand(input.commandId);
  const nowMs = input.nowMs ?? Date.now();
  const expected = input.expected;
  switch (input.commandId) {
    case "eas.build.cloud":
      return decodeBuildArrayCommand(input.commandId, input.stdout, expected, nowMs, "bind");
    case "eas.build.local": {
      const trimmed = input.stdout.trim();
      if (!trimmed) {
        return notJson(input.commandId, "eas.build.local local-plugin stdout is not a cloud BuildFragment array. Empty output is not a paid cloud job.");
      }
      const parsed = parseStdoutJson(input.stdout);
      if (!parsed.ok) {
        return notJson(input.commandId, "eas.build.local did not emit JSON. EAS CLI 23.2.0 returns before printJsonOnlyOutput on the local-plugin path.");
      }
      return decodeBuildArrayCommand(input.commandId, input.stdout, expected, nowMs, "bind");
    }
    case "eas.build.list":
      return decodeBuildArrayCommand(input.commandId, input.stdout, undefined, nowMs, "list");
    case "eas.build.view":
      return decodeBuildView(input.commandId, input.stdout, expected, nowMs);
    case "eas.submit.view":
      return decodeSubmitView(input.commandId, input.stdout, expected);
    case "eas.submit.list":
      return decodeSubmitList(input.commandId, input.stdout);
    case "eas.workflow.run":
      return decodeWorkflowRun(input.commandId, input.stdout);
    case "eas.workflow.status":
      return decodeWorkflowStatus(input.commandId, input.stdout, expected);
    case "eas.workflow.runs":
      return decodeWorkflowRuns(input.commandId, input.stdout);
    case "eas.submit":
    case "eas.build.cancel":
    case "eas.whoami":
    case "eas.project.info":
    case "eas.workflow.validate":
    case "expo.version":
    case "expo.whoami":
    case "expo.start":
    case "expo.run.ios":
    case "expo.run.android":
      return notJson(
        input.commandId,
        spec.documentedFlags.json
          ? `${input.commandId} is implemented but this path is not a JSON job envelope.`
          : `${input.commandId} does not document --json in EAS CLI ${EAS_DECODE_REVIEWED_VERSION}. Human-readable stdout is not a job receipt.`,
      );
    case "expo.prebuild":
    case "expo.export":
    case "expo.login":
    case "expo.config":
    case "eas.init":
    case "eas.credentials":
    case "eas.credentials.configure-build":
    case "eas.device.create":
    case "eas.env.exec":
    case "eas.update":
    case "eas.deploy":
    case "eas.deploy.promote":
      return observation({
        commandId: input.commandId,
        code: "unsupported-command",
        protocolValid: false,
        records: [],
        message: `${input.commandId} is ${spec.support}. Unsupported commands stay unavailable instead of producing empty success evidence.`,
      });
    default: {
      const exhaustive: never = input.commandId;
      throw new Error(`unhandled EAS decode command: ${String(exhaustive)}`);
    }
  }
}

export function ledgerArtifactUrl(observation: EasDecodedObservation): string | undefined {
  if (observation.artifactExpired) return "expired";
  if (observation.artifactAvailable) return observation.artifactUrl;
  return undefined;
}
