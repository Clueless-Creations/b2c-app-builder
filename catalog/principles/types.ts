export const PRINCIPLE_SOURCE_IDS = ["trendingai", "graph_memory", "prompt_router", "icm", "icm_architect", "content_agent"] as const;

export type PrincipleSourceId = (typeof PRINCIPLE_SOURCE_IDS)[number] | "kernel";

export const GUARD_KINDS = [
  "ungrounded_belief",
  "action_without_authority",
  "derived_without_lineage",
  "silent_degradation",
  "replay_external_effect",
  "unstable_identity",
  "unpinned_source",
  "model_adoption",
  "evidence_not_independent",
  "closed_vocabulary",
  "unbounded_traversal",
  "implicit_no_match",
  "signal_decision_merge",
  "ambiguous_default",
  "proof_without_gate",
  "context_without_selectors",
  "cycle_in_definitions",
  "public_term_unapproved",
  "compile_without_pin",
  "fail_open_unknown",
  "evaluation_without_threshold",
  "catalog_without_bound",
] as const;

export type GuardKind = (typeof GUARD_KINDS)[number];

export type PrincipleStrength = "must" | "should";
export type PrincipleStatus = "active" | "review";
export type PrincipleCoverage = "complete" | "partial";

export interface PrincipleEnforcement {
  command: string;
  guard: GuardKind;
  issue_code: string;
  negative_input?: Record<string, unknown>;
}

export interface Principle {
  id: string;
  source_id: PrincipleSourceId;
  source_repository: string;
  source_url: string;
  source_commit: string;
  source_anchor: string;
  rule: string;
  strength: PrincipleStrength;
  owner: string;
  status: PrincipleStatus;
  enforcement: PrincipleEnforcement;
  review_condition: string;
  exception_policy: string;
}

export interface PrincipleRegistry {
  schema_version: number;
  coverage: PrincipleCoverage;
  principles: Principle[];
}

export interface VocabularyAlias {
  from: string;
  to: string;
}

export interface VocabularyRecord {
  schema_version: number;
  status: "approved" | "provisional";
  interview_date: string;
  chosen_terms: string[];
  schema_terms: string[];
  aliases: VocabularyAlias[];
  rejected_terms: string[];
  provisional_prefixes: string[];
  compatibility: string[];
}

export interface PrincipleIssue {
  code: string;
  message: string;
}

export const PINNED_COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;
