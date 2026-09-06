import { GUARD_KINDS, type GuardKind, type Principle, type PrincipleIssue } from "./types.js";

export interface EvaluateOptions {
  disableGuard?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isGuardKind(value: string): value is GuardKind {
  return (GUARD_KINDS as readonly string[]).includes(value);
}

export function guardDetectsViolation(kind: GuardKind, input: unknown): boolean {
  if (!isRecord(input)) {
    return true;
  }
  switch (kind) {
    case "ungrounded_belief":
      return asArray(input.evidence).length === 0;
    case "action_without_authority":
      return !asBoolean(input.mandate) || !asBoolean(input.readiness);
    case "derived_without_lineage":
      return asArray(input.source_ids).length === 0;
    case "silent_degradation":
      return asBoolean(input.dropped) && input.overflow == null && input.exclusions == null;
    case "replay_external_effect":
      return asBoolean(input.network) || asBoolean(input.spend) || asBoolean(input.live_clock) || asBoolean(input.inference);
    case "unstable_identity":
      return asBoolean(input.path_changed) && asBoolean(input.id_changed);
    case "unpinned_source":
      return !/^[0-9a-f]{40}$/iu.test(asString(input.commit));
    case "model_adoption":
      return asBoolean(input.model_proposed) && !asBoolean(input.deterministic_validated);
    case "evidence_not_independent": {
      const items = asArray(input.items);
      const sourceIds = items.map((item) => (isRecord(item) ? asString(item.source_id) : ""));
      const unique = new Set(sourceIds.filter(Boolean));
      return asBoolean(input.counted_independent) && unique.size < sourceIds.filter(Boolean).length;
    }
    case "closed_vocabulary": {
      const allowed = asArray(input.allowed_types).map((item) => asString(item));
      const typeName = asString(input.type);
      return typeName.length > 0 && allowed.length > 0 && !allowed.includes(typeName);
    }
    case "unbounded_traversal": {
      const depth = asNumber(input.depth);
      const maxDepth = asNumber(input.max_depth);
      return depth !== undefined && maxDepth !== undefined && depth > maxDepth;
    }
    case "implicit_no_match":
      return asArray(input.matches).length === 0 && asString(input.result_code).length === 0;
    case "signal_decision_merge":
      return asBoolean(input.ranked_before_eligibility);
    case "ambiguous_default":
      return asBoolean(input.ambiguous) && asBoolean(input.selected_default);
    case "proof_without_gate":
      return asString(input.required_proof).length > 0 && !asBoolean(input.proof_present);
    case "context_without_selectors":
      return asArray(input.section_ids).length === 0;
    case "cycle_in_definitions":
      return asBoolean(input.cyclic);
    case "public_term_unapproved":
      return asString(input.term).length > 0 && !asBoolean(input.approved) && !asBoolean(input.provisional);
    case "compile_without_pin":
      return input.pin == null || asString(input.pin).length === 0;
    case "fail_open_unknown":
      return !asBoolean(input.known) && asBoolean(input.accepted);
    case "evaluation_without_threshold":
      return asBoolean(input.golden) && (input.threshold == null || asString(input.threshold).length === 0);
    case "catalog_without_bound": {
      const size = asNumber(input.size);
      const maxSize = asNumber(input.max_size);
      return size !== undefined && maxSize !== undefined && size > maxSize;
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function evaluateGuard(principle: Principle, input: unknown, options: EvaluateOptions = {}): PrincipleIssue[] {
  if (options.disableGuard) {
    return [];
  }
  if (!guardDetectsViolation(principle.enforcement.guard, input)) {
    return [];
  }
  return [
    {
      code: principle.enforcement.issue_code,
      message: `${principle.id}: ${principle.rule}`,
    },
  ];
}
