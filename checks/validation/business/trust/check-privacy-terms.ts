#!/usr/bin/env node
/**
 * check-privacy-terms.ts — the mechanically checkable subset of the legal/privacy risk
 * checklist in knowledge/trust/privacy-terms.md §7.
 *
 * That checklist names ten concrete rejection and legal-exposure risks reviewers, app-store
 * review, and regulators actually flag against consumer apps. Two of the ten already have an
 * owning gate (fake testimonials: check:emotional-design / check:vibecoded-tells Tier 1) and
 * are deliberately not re-checked here. This validator covers the rest: privacy/terms
 * existence, the required disclosure sections in trust/PRIVACY.md, cancellation and
 * auto-renewal fairness in trust/TERMS.md, a public-storage-bucket smell in
 * engineering/TECH_SPEC.md and trust/SECURITY.md, and — when trust/AI_SAFETY.md exists — an
 * AI-processing mention in the privacy policy and a named self-harm/crisis response.
 *
 * Mirrors check-security-release.ts: phrase presence, not legal correctness. A green run is
 * not legal sign-off — pair it with the founder/counsel review in LEGAL_REVIEW.md §6.
 *
 * npm script: check:privacy
 * Usage: tsx checks/validation/business/trust/check-privacy-terms.ts --root /path/to/app
 */
import {
  asString,
  getPath,
  issue,
  loadProjectState,
  normalizedIncludes,
  parseCliArgs,
  readText,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const state = loaded.state;

const privacyPath = "trust/PRIVACY.md";
const termsPath = "trust/TERMS.md";
const aiSafetyPath = "trust/AI_SAFETY.md";
const techSpecPath = "engineering/TECH_SPEC.md";
const securityPath = "trust/SECURITY.md";

const privacy = readText(args.root, privacyPath);
const terms = readText(args.root, termsPath);
const aiSafety = readText(args.root, aiSafetyPath);
const techSpec = readText(args.root, techSpecPath);
const security = readText(args.root, securityPath);

function laneStatus(name: string): string | undefined {
  return state ? asString(getPath(state, `lanes.${name}.status`))?.toLowerCase() : undefined;
}

function inScope(status: string | undefined): boolean {
  return !["not_needed", "deferred"].includes(status ?? "");
}

function mentionsAny(text: string | undefined, phrases: string[]): boolean {
  return Boolean(text) && phrases.some((phrase) => normalizedIncludes(text!, phrase));
}

const privacyLegalStatus = laneStatus("privacy_legal");
const privacyLegalNotNeeded = privacyLegalStatus === "not_needed" || privacyLegalStatus === "deferred";

// ── Risk 1: no privacy policy / no terms ─────────────────────────────────────
if (!privacy && !privacyLegalNotNeeded) {
  issues.push(
    issue(
      "error",
      "privacy.policy_missing",
      `${privacyPath} is required before launch. A missing privacy policy is a Tier 1 legal risk (knowledge/trust/privacy-terms.md §7, risk 1).`,
      privacyPath,
    ),
  );
}
if (!terms && !privacyLegalNotNeeded) {
  issues.push(issue("error", "privacy.terms_missing", `${termsPath} is required before launch (knowledge/trust/privacy-terms.md §7, risk 1).`, termsPath));
}

if (privacy) {
  // ── Risk 2: no "we collect user data" disclosure ───────────────────────────
  if (!mentionsAny(privacy, ["we collect", "information we collect", "data we collect", "personal information we collect", "what we collect"])) {
    issues.push(
      issue(
        "error",
        "privacy.data_collection_disclosure_missing",
        `${privacyPath} does not state what data is collected in a findable "what we collect" section (knowledge/trust/privacy-terms.md §7, risk 2).`,
        privacyPath,
      ),
    );
  }

  // ── Risk 4: no third-party data collectors named ───────────────────────────
  if (!mentionsAny(privacy, ["third-party", "third parties", "third party", "vendors", "processors", "service providers"])) {
    issues.push(
      issue(
        "error",
        "privacy.third_party_disclosure_missing",
        `${privacyPath} does not name vendor/processor/third-party categories that receive data (knowledge/trust/privacy-terms.md §7, risk 4).`,
        privacyPath,
      ),
    );
  }

  // ── Risk 5: not deleting user uploads ───────────────────────────────────────
  if (!mentionsAny(privacy, ["delete", "deletion"]) || !mentionsAny(privacy, ["retention", "retain"])) {
    issues.push(
      issue(
        "error",
        "privacy.deletion_retention_missing",
        `${privacyPath} does not cover both retention and deletion — a policy that never says stored uploads are purged is a Tier 1 legal risk (knowledge/trust/privacy-terms.md §7, risk 5).`,
        privacyPath,
      ),
    );
  }

  // ── Risk 3: no AI mention in the privacy policy (only when generative AI is in scope) ──
  if (aiSafety && !/\b(ai|artificial intelligence|machine learning|generative|language model)\b/i.test(privacy)) {
    issues.push(
      issue(
        "error",
        "privacy.ai_disclosure_missing",
        `${aiSafetyPath} exists, so the product generates AI content, but ${privacyPath} does not disclose AI/model processing (knowledge/trust/privacy-terms.md §7, risk 3).`,
        privacyPath,
      ),
    );
  }
}

// ── Risks 8-9: cancellation ease and auto-renewal reminder (subscriptions only) ──
const subscriptionInScope = inScope(laneStatus("revenue")) || mentionsAny(terms, ["subscription", "auto-renew", "automatically renew"]);

if (subscriptionInScope && terms) {
  // Unconditional: a doc that never discusses cancellation at all is exactly the
  // "harder than signup" risk (nothing self-service is documented), not an exemption.
  if (
    !mentionsAny(terms, [
      "any time",
      "anytime",
      "in-app",
      "in the app",
      "account settings",
      "self-service",
      "self service",
      "app store",
      "google play",
      "manage subscription",
      "without contacting",
      "no need to contact",
      "no phone call",
    ])
  ) {
    issues.push(
      issue(
        "error",
        "privacy.cancellation_not_self_service",
        `${termsPath} does not document a self-service cancellation path at least as easy as signup (knowledge/trust/privacy-terms.md §7, risk 8 — the FTC click-to-cancel rule).`,
        termsPath,
      ),
    );
  }

  if (
    mentionsAny(terms, ["auto-renew", "automatically renew", "auto-renewal", "automatic renewal"]) &&
    !mentionsAny(terms, [
      "renewal reminder",
      "notify you before",
      "email you before",
      "advance notice",
      "reminder email",
      "before your subscription renews",
      "before it renews",
    ])
  ) {
    issues.push(
      issue(
        "error",
        "privacy.auto_renewal_reminder_missing",
        `${termsPath} discloses auto-renewal but does not commit to a renewal-reminder notice before the charge (knowledge/trust/privacy-terms.md §7, risk 9 — state auto-renewal law and the FTC negative-option rule).`,
        termsPath,
      ),
    );
  }
}

// ── Risk 10: AI with no self-harm response (only when generative AI is in scope) ──
if (aiSafety && !mentionsAny(aiSafety, ["self-harm", "self harm", "suicide", "crisis"])) {
  issues.push(
    issue(
      "error",
      "privacy.self_harm_response_missing",
      `${aiSafetyPath} exists but names no self-harm/crisis detection and response path (knowledge/trust/generative-ai-safety.md; knowledge/trust/privacy-terms.md §7, risk 10).`,
      aiSafetyPath,
    ),
  );
}

// ── Risk 6: storage bucket set to public ─────────────────────────────────────
const bucketPublicPattern = /\bpublic(?:ly)?[\s-]*(?:read(?:able|-only)?)?\s*(?:storage\s+)?bucket\b|\bbucket\b[^.\n]{0,60}\bpublic\b/i;
const bucketMitigationPattern = /\b(signed url|row level security|\brls\b|security rule|private|access[- ]controlled|not public)\b/i;

for (const [text, filePath] of [
  [techSpec, techSpecPath],
  [security, securityPath],
] as const) {
  if (!text) continue;
  const match = bucketPublicPattern.exec(text);
  if (!match) continue;
  const windowStart = Math.max(0, match.index - 200);
  const windowEnd = Math.min(text.length, match.index + match[0].length + 200);
  const window = text.slice(windowStart, windowEnd);
  if (bucketMitigationPattern.test(window)) continue;
  issues.push(
    issue(
      "error",
      "privacy.public_storage_bucket",
      `${filePath} describes a public storage bucket with no nearby mitigation (RLS/security rules/signed URLs/private). A public bucket is a Tier 1 legal/privacy risk (knowledge/trust/privacy-terms.md §7, risk 6; knowledge/engineering/backend-data-contract.md §Anti-Patterns): "${match[0].trim()}"`,
      filePath,
    ),
  );
}

// ── Done-state guard: no placeholder language once the lane claims done ──────
if (privacyLegalStatus === "succeeded") {
  const combined = [privacy, terms].filter(Boolean).join("\n");
  if (/\b(TODO|TBD|unknown|placeholder|pending)\b/i.test(combined)) {
    issues.push(
      issue(
        "error",
        "privacy.complete_with_placeholder",
        "The privacy_legal lane is marked done but trust/PRIVACY.md or trust/TERMS.md still contains TODO/TBD/unknown/placeholder/pending language.",
        privacyPath,
      ),
    );
  }
}

reportAndExit("Legal & privacy risk checklist", issues);
