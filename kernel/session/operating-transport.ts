import { operateModes, operateSources, type OperateMode, type OperateSource, type OperateTransport } from "./operating-types.js";
import { routeRequestKinds, type RouteRequestKind } from "../routing/types.js";

export interface TransportSanitizeResult {
  ok: true;
  value: OperateTransport;
}

export interface TransportSanitizeRefusal {
  ok: false;
  reasonCode: string;
  reason: string;
}

const FORBIDDEN_KEY =
  /^(patch|ops|targetDoc|contextSelectors|contextSelector|selectors|grants|grant|mandate|mandateId|agreement|authority|readiness|catalog|compatibility|catalogCompatibility)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperateMode(value: unknown): value is OperateMode {
  return typeof value === "string" && (operateModes as readonly string[]).includes(value);
}

function isOperateSource(value: unknown): value is OperateSource {
  return typeof value === "string" && (operateSources as readonly string[]).includes(value);
}

function isRouteKind(value: unknown): value is RouteRequestKind {
  return typeof value === "string" && (routeRequestKinds as readonly string[]).includes(value);
}

function isRfc3339Clock(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function asStringList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value as string[];
}

export function sanitizeTransport(
  raw: unknown,
  fallback: Pick<OperateTransport, "mode" | "source" | "clock" | "principalId">,
): TransportSanitizeResult | TransportSanitizeRefusal {
  if (!isRecord(raw)) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "Operate transport payload must be an object." };
  }
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_KEY.test(key)) {
      const reasonCode = /patch|ops|targetDoc/i.test(key)
        ? "operate.patch_refused"
        : /selector/i.test(key)
          ? "operate.undeclared_selector"
          : /catalog|compatibility/i.test(key)
            ? "operate.compatibility_assertion_refused"
            : "operate.authority_assertion_refused";
      return { ok: false, reasonCode, reason: `Transport cannot supply "${key}".` };
    }
  }

  const mode = isOperateMode(raw.mode) ? raw.mode : fallback.mode;
  const source = isOperateSource(raw.source) ? raw.source : fallback.source;
  const kind = isRouteKind(raw.kind) ? raw.kind : undefined;
  if (!kind) return { ok: false, reasonCode: "operate.invalid_payload", reason: "Operate transport requires a typed request kind." };
  if (typeof raw.problem !== "string" || raw.problem.trim().length === 0) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "Operate transport requires a problem." };
  }
  if (typeof raw.idempotencyKey !== "string" || raw.idempotencyKey.trim().length === 0) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "Operate transport requires an idempotency key." };
  }

  const requiredFacts = asStringList(raw.requiredFacts);
  const availableFacts = asStringList(raw.availableFacts);
  const recallProposedIds = asStringList(raw.recallProposedIds);
  const forbiddenDomains = asStringList(raw.forbiddenDomains);
  if (raw.requiredFacts !== undefined && requiredFacts === undefined) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "requiredFacts must be a string list." };
  }
  if (raw.availableFacts !== undefined && availableFacts === undefined) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "availableFacts must be a string list." };
  }
  if (raw.recallProposedIds !== undefined && recallProposedIds === undefined) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "recallProposedIds must be a string list." };
  }
  if (raw.forbiddenDomains !== undefined && forbiddenDomains === undefined) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "forbiddenDomains must be a string list." };
  }
  if (raw.ambiguityBand !== undefined && (typeof raw.ambiguityBand !== "number" || !Number.isFinite(raw.ambiguityBand) || raw.ambiguityBand < 0)) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "ambiguityBand must be a finite non-negative number." };
  }
  if (raw.expectedBusinessRevision !== undefined && (typeof raw.expectedBusinessRevision !== "string" || raw.expectedBusinessRevision.trim().length === 0)) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "expectedBusinessRevision must be a nonempty string." };
  }

  const clock = typeof raw.clock === "string" && raw.clock.length > 0 ? raw.clock : fallback.clock;
  if (typeof clock !== "string" || clock.length === 0 || !isRfc3339Clock(clock)) {
    return { ok: false, reasonCode: "operate.invalid_payload", reason: "Operate clock must be a finite RFC 3339 timestamp." };
  }

  return {
    ok: true,
    value: {
      mode,
      source,
      clock,
      principalId: typeof raw.principalId === "string" && raw.principalId.length > 0 ? raw.principalId : fallback.principalId,
      problem: raw.problem,
      kind,
      idempotencyKey: raw.idempotencyKey,
      ...(typeof raw.expectedBusinessRevision === "string" ? { expectedBusinessRevision: raw.expectedBusinessRevision } : {}),
      ...(typeof raw.policyRevision === "string" ? { policyRevision: raw.policyRevision } : {}),
      ...(typeof raw.recognized === "boolean" ? { recognized: raw.recognized } : {}),
      ...(requiredFacts ? { requiredFacts } : {}),
      ...(availableFacts ? { availableFacts } : {}),
      ...(typeof raw.packId === "string" ? { packId: raw.packId } : {}),
      ...(recallProposedIds ? { recallProposedIds } : {}),
      ...(forbiddenDomains ? { forbiddenDomains } : {}),
      ...(typeof raw.ambiguityBand === "number" ? { ambiguityBand: raw.ambiguityBand } : {}),
    },
  };
}
