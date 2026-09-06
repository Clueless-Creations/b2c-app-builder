import { internalVocabularyBlocklist } from "./digest.js";

/**
 * The founder-question schema (U4 stub, extended by Wave 2, #30): the engine cockpit's shared
 * answer to "is there a founder decision here, and what would it ask" — for `b2c_status`'s
 * degraded (pre-registration) mode, `b2c_plan`'s report, and `b2c_operate`'s refusals.
 *
 * Wave 1 shipped `FounderAction` as `{phase, class, prompt}` with an explicit contract: Wave 2
 * MUST extend those three fields, never rename or repurpose them, so a caller that only reads
 * `{phase, class, prompt}` off the wire keeps working unmodified. `FounderQuestion` below is that
 * extension — same three fields, plus `choices`/`skippable`/`deferrable` — and `FounderAction`
 * stays the exported name so `status.ts`'s existing import is untouched.
 *
 * This is deliberately NOT the ledger validator's `activeFounderGate` shape
 * (`checks/validation/business/operations/check-founder-operator-bootstrap.ts`,
 * `checks/validation/repository/fixtures/founder-operator.fixtures.ts`): that shape is a running ledger
 * entry with an audit trail (id/actionType/target/whatThisIs/whyNow/founderAction/agentActionNext/
 * successProof) for a generated business's own dashboard. `FounderQuestion` answers the same
 * underlying question for the engine cockpit (MCP/CLI) instead, including for a folder that has
 * no ledger to write into yet. The two schemas stay separate types on purpose — different
 * audiences — but they describe the same underlying decision, so here is the field mapping:
 *
 * | FounderQuestion (here)                        | activeFounderGate (ledger validator)                         |
 * |------------------------------------------------|---------------------------------------------------------------|
 * | `prompt`                                        | `question.prompt` (== `founderModel.nextFounderAction`)        |
 * | `choices[].label`                               | `question.options[].label`                                     |
 * | `choices[].consequence`                         | `question.options[].consequence`                                |
 * | `choices[].recommended`                         | `question.options[].recommended` (exactly one, listed first)   |
 * | `skippable === false && deferrable === false`   | `bypassPolicy.mode === "defer_only"` (may defer, never bypass)  |
 * | `skippable === true`                            | `bypassPolicy.mode === "fallback_allowed"` (a safe fallback exists) |
 * | `founderGatedClasses` (below)                   | `protectedClasses` (`access,spend,legal,pricing,public_action,release,destructive`) |
 *
 * Documenting this equivalence — not merging the two types — is Wave 2's schema reconciliation.
 */

/** Closed set of founder-question kinds (Wave 2, #30). Extend this list, never repurpose a value. */
export const founderQuestionClasses = [
  "confirm-product-kind",
  "confirm-go",
  "confirm-spend-cap",
  "confirm-release-publish",
  "confirm-approval",
  "grant-initial-autonomy",
  "raise-autonomy",
  "scope-question",
] as const;
export type FounderQuestionClass = (typeof founderQuestionClasses)[number];

/**
 * Classes where the founder-gate bar applies: never skippable, never deferrable. The run-node
 * engine has no skip path for any `waiting_founder` node regardless of category — `approve.ts`'s
 * explicit `approved`/`rejected` decision is the only exit — so every question built from a real
 * approval is hard-gated here, not only the protectedCategory-tagged ones. The two constructors
 * below (`buildGoNoGoQuestion`/`buildSoftQuestion`) enforce this mechanically: a caller cannot
 * construct a gated class with `skippable:true`.
 */
export const founderGatedClasses: ReadonlySet<FounderQuestionClass> = new Set<FounderQuestionClass>([
  "confirm-go",
  "confirm-spend-cap",
  "confirm-release-publish",
  "confirm-approval",
]);

export interface FounderQuestionChoice {
  readonly label: string;
  readonly consequence: string;
  readonly recommended: boolean;
}

export interface FounderQuestion {
  /** Where in the founder's journey this sits (e.g. "orientation", "operating"). Wave-1 field, unrenamed. */
  readonly phase: string;
  /** What kind of decision this is. Wave-1 field, unrenamed — closed as an enum in Wave 2. */
  readonly class: FounderQuestionClass;
  /** The exact founder-facing question or ask. Wave-1 field, unrenamed. */
  readonly prompt: string;
  /** 2-4 choices, exactly one recommended — see `validateFounderQuestion`. */
  readonly choices: readonly FounderQuestionChoice[];
  /** True when the caller may proceed without an answer (e.g. treat as "not needed" for now). */
  readonly skippable: boolean;
  /** True when the caller may come back to this later rather than answering immediately. */
  readonly deferrable: boolean;
}

/** Wave-1 name kept so `status.ts`'s existing `import type { FounderAction }` needs no edit. */
export type FounderAction = FounderQuestion | null;

/** Shared shape for both constructors below — the pre-`skippable`/`deferrable` half of a question. */
export interface FounderQuestionInput {
  readonly phase: string;
  readonly class: FounderQuestionClass;
  readonly prompt: string;
  readonly choices: readonly FounderQuestionChoice[];
}

/**
 * Builds a hard-gated question (skippable:false, deferrable:false) — the only sanctioned way to
 * construct one of `founderGatedClasses`. Throws for any other class so a caller cannot silently
 * under-gate a Go/spend-cap/release-publish/approval confirmation.
 */
export function buildGoNoGoQuestion(input: FounderQuestionInput): FounderQuestion {
  if (!founderGatedClasses.has(input.class)) {
    throw new Error(`buildGoNoGoQuestion: class "${input.class}" is not founder-gated; use buildSoftQuestion for it.`);
  }
  return { ...input, skippable: false, deferrable: false };
}

/**
 * Builds a soft question (skippable:true, deferrable:true) — for advisory decisions where leaving
 * the question unanswered is already the safe default (nothing executes without it). Throws for a
 * founder-gated class so a caller cannot accidentally soften a Go/spend/release/approval gate.
 */
export function buildSoftQuestion(input: FounderQuestionInput): FounderQuestion {
  if (founderGatedClasses.has(input.class)) {
    throw new Error(`buildSoftQuestion: class "${input.class}" is founder-gated; use buildGoNoGoQuestion for it.`);
  }
  return { ...input, skippable: true, deferrable: true };
}

/**
 * Founder-facing text (prompt + every choice's label/consequence) checked against the same
 * internal-vocabulary blocklist the session digest uses (`digest.ts`'s `internalVocabularyBlocklist`)
 * rather than `tooling/lib/founder-copy.ts`'s richer list — that list includes bare words like
 * "gate"/"lane" that need its exemption-regex machinery ("delegate", "navigate") to avoid false
 * positives, which a plain substring check here does not have.
 */
export function founderQuestionCopyLeaks(question: FounderQuestion): readonly string[] {
  const text = [question.prompt, ...question.choices.flatMap((choice) => [choice.label, choice.consequence])].join(" ");
  return internalVocabularyBlocklist.filter((term) => text.includes(term));
}

/**
 * Defense-in-depth shape + copy validator, pure and side-effect free. Returns an empty array when
 * the question is safe to surface; callers (e.g. `plan.ts`'s `pickFounderQuestion`) fail closed —
 * log and drop the question — rather than ship one that fails this.
 */
export function validateFounderQuestion(question: FounderQuestion): readonly string[] {
  const problems: string[] = [];
  if (question.choices.length < 2 || question.choices.length > 4) {
    problems.push(`choices.length must be 2-4, got ${question.choices.length}`);
  }
  const recommendedCount = question.choices.filter((choice) => choice.recommended).length;
  if (recommendedCount !== 1) {
    problems.push(`exactly one choice must be recommended, got ${recommendedCount}`);
  }
  if (founderGatedClasses.has(question.class) && (question.skippable || question.deferrable)) {
    problems.push(`class "${question.class}" is founder-gated and must not be skippable or deferrable`);
  }
  const leaked = founderQuestionCopyLeaks(question);
  if (leaked.length > 0) {
    problems.push(`founder-facing text leaks internal vocabulary: ${leaked.join(", ")}`);
  }
  return problems;
}

/** A short label for the founder-question class, for a UI that groups or headlines by kind. Every entry is <=12 characters (checked by fixture). */
export const HEADER_BY_CLASS: Record<FounderQuestionClass, string> = {
  "confirm-product-kind": "Confirm kind",
  "confirm-go": "Go / no-go",
  "confirm-spend-cap": "Spend cap",
  "confirm-release-publish": "Release",
  "confirm-approval": "Approval",
  "grant-initial-autonomy": "Set autonomy",
  "raise-autonomy": "Raise limit",
  "scope-question": "Scope",
};

export interface AskUserQuestionOption {
  readonly label: string;
  readonly description: string;
}

/** The AskUserQuestion-tool-shaped projection of a `FounderQuestion`, for a cockpit that renders one directly. */
export interface AskUserQuestionShape {
  readonly header: string;
  readonly question: string;
  readonly options: readonly AskUserQuestionOption[];
  readonly multiSelect: false;
}

export function toAskUserQuestion(question: FounderQuestion): AskUserQuestionShape {
  return {
    header: HEADER_BY_CLASS[question.class],
    question: question.prompt,
    options: question.choices.map((choice) => ({ label: choice.label, description: choice.consequence })),
    multiSelect: false,
  };
}
