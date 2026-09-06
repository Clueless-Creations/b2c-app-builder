/**
 * design-taste-rubric.ts — a thin, pinned manifest over the two knowledge docs that already
 * ARE the design-taste rubric: knowledge/design/vibecoded-tells.md and
 * knowledge/design/design-worthiness.md.
 *
 * #37 asked for "a grader rubric packaged with the skill/knowledge surface (referenced by
 * pinned version)". Authoring a third prose document would duplicate rows the two knowledge
 * docs already own, exactly the drift AGENTS.md's "edit catalog definitions before generated
 * projections" rule exists to prevent. So this file does not restate their guidance — it maps
 * each row to a stable dimension key, tags its tier per design-worthiness.md's own "Three
 * tiers" section, and pins both source documents by content hash.
 *
 * PINNING. `sourceSha256` is recomputed the same way tooling/render-hosted-bundle.ts's
 * `readBoundFile` computes it for the hosted knowledge bundle (the same hash
 * kernel/knowledge-service/service.ts's `get()` returns as `provenance.sourceSha256`): a sha256
 * hex digest of the document's raw file bytes. checks/validation/repository/fixtures/
 * design-taste-rubric.fixtures.ts recomputes both hashes at test time and fails the moment
 * either knowledge doc's bytes change, until a maintainer reviews the new content and bumps
 * `rubricVersion`. That is the whole mechanism — no second, hand-maintained version scheme.
 *
 * SCOPE. Every dimension below traces to a named row: the ten codes in vibecoded-tells.md's
 * "Mechanical Detection" table, and the ten numbered rules in design-worthiness.md. Only the
 * dimensions marked `automatedByGrader: true` are ones tooling/grade-design-surface.ts can
 * compute itself today, from the pure libraries this Wave extracted
 * (checks/validation/business/design/lib/vibecode-tells.ts and lib/worthiness-mechanical.ts). The
 * rest — vibecode.legal_links_missing (needs site-shape and link-reachability analysis, not a
 * per-file regex) and every Attested/Taste row (needs DESIGN.md section parsing already owned
 * by check-design-worthiness.ts, or an authorized person's independent judgment) — are listed so the grader's
 * task template can name them for a model-judged pass, never so the grader can silently claim
 * to have checked them.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export type RubricTier = "mechanical" | "attested" | "taste";

export type RubricReferenceId = "reference.design.vibecoded-tells" | "reference.design.design-worthiness";

export interface RubricDimension {
  readonly key: string;
  readonly tier: RubricTier;
  /** The ceiling severity a machine check may report for this dimension. Absent for tier "taste", which records an authorized human or independent fresh-context judgment rather than a computed score. */
  readonly severity?: "error" | "warning";
  readonly sourceReferenceId: RubricReferenceId;
  readonly description: string;
  /** True only when tooling/grade-design-surface.ts computes this finding itself today, via the extracted TELLS[]/contrast/token-scale libraries — never asserted for a dimension this grader cannot yet reach. */
  readonly automatedByGrader: boolean;
}

export interface PinnedKnowledgeReference {
  readonly referenceId: RubricReferenceId;
  readonly documentPath: string;
  readonly sourceSha256: string;
}

/** Bump only on a deliberate, reviewed change to the dimension list below or a knowingly-accepted knowledge-doc edit. */
export const DESIGN_TASTE_RUBRIC_VERSION = "1.1.1";

export const PINNED_KNOWLEDGE_REFERENCES: readonly PinnedKnowledgeReference[] = [
  {
    referenceId: "reference.design.vibecoded-tells",
    documentPath: "knowledge/design/vibecoded-tells.md",
    sourceSha256: "c4f613532f20a6c5802ff17850ab9b66860d470ba629b2ad6406ba1272aa53f6",
  },
  {
    referenceId: "reference.design.design-worthiness",
    documentPath: "knowledge/design/design-worthiness.md",
    sourceSha256: "41cccf1e3745cb1a9198e11772ca81ba28c625602c8c4afca30cf80a9cba6a98",
  },
];

export const DESIGN_TASTE_DIMENSIONS: readonly RubricDimension[] = [
  // --- reference.design.vibecoded-tells — the 10-row "Mechanical Detection" table ---
  {
    key: "vibecode.default_icon_pack",
    tier: "mechanical",
    severity: "error",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Lucide or Heroicons imports in web-surface source — the never-earned default icon pack tell.",
    automatedByGrader: true,
  },
  {
    key: "vibecode.legal_links_missing",
    tier: "mechanical",
    severity: "error",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description:
      "A site-shaped landing with no terms or privacy link. Needs site-shape and Markdown/MDX/JSX link-reachability analysis; run check:vibecoded-tells directly.",
    automatedByGrader: false,
  },
  {
    key: "vibecode.emoji_in_markup",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Emoji characters inside JSX or HTML markup, used as icons or heading decoration.",
    automatedByGrader: true,
  },
  {
    key: "vibecode.default_font",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Inter, Geist, or Space Grotesk in tokens or CSS with no font-rationale: marker.",
    automatedByGrader: true,
  },
  {
    key: "vibecode.indigo_purple_gradient",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Indigo-to-purple gradient utilities or hex pairs — the documented statistical default of AI-generated pages.",
    automatedByGrader: true,
  },
  {
    key: "vibecode.glassmorphism",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Backdrop-blur glass panels outside their earned category (fintech dashboards with a disciplined accent).",
    automatedByGrader: true,
  },
  {
    key: "vibecode.decorative_blob",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Blurred radial-gradient orb elements — decorative filler for undecided space.",
    automatedByGrader: true,
  },
  {
    key: "vibecode.sparkle_icon",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: 'Sparkle glyphs or sparkle icon imports — the generic "AI" costume.',
    automatedByGrader: true,
  },
  {
    key: "vibecode.checkmark_wall",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Three or more checkmark bullets in one file — feature-dump formatting that replaces persuasion.",
    automatedByGrader: true,
  },
  {
    key: "vibecode.bouncing_cue",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.vibecoded-tells",
    description: "Bounce-animated arrows or scroll cues — motion that begs instead of guiding.",
    automatedByGrader: true,
  },

  // --- reference.design.design-worthiness — the 10 numbered rules ---
  {
    key: "worthiness.contrast_text",
    tier: "mechanical",
    severity: "error",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 4, Contrast floor: body text on its background must meet WCAG 2.2 AA at 4.5:1.",
    automatedByGrader: true,
  },
  {
    key: "worthiness.contrast_primary",
    tier: "mechanical",
    severity: "error",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 4, Contrast floor: large text and UI accents must meet 3:1.",
    automatedByGrader: true,
  },
  {
    key: "worthiness.apca_dark_body",
    tier: "mechanical",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 4, Contrast floor: dark body text that only meets AA is a design signal; prefer a stronger contrast near 7:1 (APCA/AAA proxy).",
    automatedByGrader: true,
  },
  {
    key: "worthiness.scale_raw_px",
    tier: "mechanical",
    severity: "error",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 3, Declared type and space scale: rendered proof HTML/CSS must use declared token steps, not one-off pixel values.",
    automatedByGrader: true,
  },
  {
    key: "worthiness.spacing_grouping",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description:
      "Rule 2, Spacing encodes grouping: related items sit closer than unrelated items. The token-step half is covered by worthiness.scale_raw_px; the grouping judgment itself needs a named person's attestation.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.hierarchy_one_primary",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description:
      "Rule 1, One primary emphasis per view. check:design-worthiness already warns on competing primaries (worthiness.hierarchy_competing_primaries) until DESIGN.md records a hierarchy attestation row.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.motion_answers_question",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 5, Motion answers a user question: motion must explain state, order, or feedback, never decorate alone.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.peak_before_paywall",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 6, Peak and proof before paywall: show the product peak and proof before a hard paywall.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.progressive_disclosure",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 7, Progressive disclosure: ask for only the next needed fact.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.originality_under_logo_swap",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 8, Originality under logo-swap: a stranger must still read the product as one product after the wordmark is gone.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.edge_state_thoroughness",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description: "Rule 9, Edge-state thoroughness: empty, loading, success, error, and offline states exist for each primary surface.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.taste_gate_record",
    tier: "attested",
    severity: "warning",
    sourceReferenceId: "reference.design.design-worthiness",
    description:
      "Rule 10's process floor: DESIGN_SYSTEM_REVIEW.md always records current independent Findings with a recognized none/minor/major/high/high-severity/blocker marker, the exact engine-bound candidate input fingerprint, and frozen rubric path/version. Taste authority comes from either a direct founder/owner Taste Gate row in DESIGN.md plus a reducer-audited receipt for those exact bytes, or a structured delegated decision in DESIGN_SYSTEM_REVIEW.md under a current-run reducer-audited design-taste delegation. Delegated authority and reviewer identity come only from run-state and its audit evidence; the reviewer must differ from the Design Room producer. Presence, shape, provenance, rubric binding, failure precedence, and producer exclusion are enforced by check:design-worthiness.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.taste_stranger_test",
    tier: "taste",
    sourceReferenceId: "reference.design.design-worthiness",
    description:
      "Rule 10, question 1: would a stranger recognize this as one product? The founder or owner may decide directly; an independent fresh-context reviewer may decide under the recorded Founder opening mandate.",
    automatedByGrader: false,
  },
  {
    key: "worthiness.taste_competitor_copy",
    tier: "taste",
    sourceReferenceId: "reference.design.design-worthiness",
    description:
      "Rule 10, question 2: would we rather competitors copy this version? The founder or owner may decide directly; an independent fresh-context reviewer may decide under the recorded Founder opening mandate.",
    automatedByGrader: false,
  },
];

export const DESIGN_TASTE_RUBRIC = {
  rubricVersion: DESIGN_TASTE_RUBRIC_VERSION,
  pinnedReferences: PINNED_KNOWLEDGE_REFERENCES,
  dimensions: DESIGN_TASTE_DIMENSIONS,
} as const;

/** Looks up a dimension by its stable key, e.g. an Issue.code from one of the mechanical checks. */
export function findRubricDimension(key: string): RubricDimension | undefined {
  return DESIGN_TASTE_DIMENSIONS.find((dimension) => dimension.key === key);
}

/**
 * Recomputes a knowledge document's sourceSha256 the same way
 * tooling/render-hosted-bundle.ts's readBoundFile does for the hosted knowledge bundle: a
 * sha256 hex digest of the document's raw file bytes, before any text decoding. Keeping this on
 * the same recipe as the knowledge service means a rubric pin and a b2c_knowledge_get
 * provenance.sourceSha256 are provably the same kind of value, not two invented hashes that
 * happen to share a name.
 */
export function knowledgeSourceSha256(skillRoot: string, documentPath: string): string {
  const absolute = path.resolve(skillRoot, documentPath);
  return createHash("sha256").update(readFileSync(absolute)).digest("hex");
}

export interface RubricPinDrift {
  readonly referenceId: RubricReferenceId;
  readonly documentPath: string;
  readonly pinnedSha256: string;
  readonly currentSha256: string;
}

/**
 * Compares every pinned reference against the knowledge document currently on disk under
 * `skillRoot`. Returns one entry per reference whose live content no longer matches the pin —
 * empty when the rubric is current. A maintainer who edits either knowledge doc sees this
 * fixture fail until they review the change and bump DESIGN_TASTE_RUBRIC_VERSION together with
 * the new pinned hash; this function does not update the pin itself.
 */
export function findRubricPinDrift(skillRoot: string, references: readonly PinnedKnowledgeReference[] = PINNED_KNOWLEDGE_REFERENCES): RubricPinDrift[] {
  const drift: RubricPinDrift[] = [];
  for (const reference of references) {
    const currentSha256 = knowledgeSourceSha256(skillRoot, reference.documentPath);
    if (currentSha256 !== reference.sourceSha256) {
      drift.push({ referenceId: reference.referenceId, documentPath: reference.documentPath, pinnedSha256: reference.sourceSha256, currentSha256 });
    }
  }
  return drift;
}
