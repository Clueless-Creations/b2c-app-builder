#!/usr/bin/env node
/**
 * Deterministic gate for a single ONB-03..ONB-08 evidence-research node's own output packet.
 *
 * These nodes are domain.experience. The placeholder and record checks reject an empty,
 * hidden-only, author-unresolved, or incomplete evidence record. They do not judge whether the
 * research is true, and a passing structural check is not independent review or runtime proof.
 * A concise record that names a finding, a source or observation, and a classification passes;
 * padding prose cannot upgrade an empty or unsupported packet.
 *
 * Two dimensions stay separate:
 * - Strength: the placeholder and record checks are structural completeness only. ONB-17 still
 *   binds Paywall Goal Headline from product.yaml / verified composition, and ONB-08 still binds
 *   60fps research from studio interaction and strategy/TOOL_DECISIONS.md. Those applicability
 *   binds are not packet shape and are not semantic or runtime proof.
 * - Origin: a synthetic fixture packet can pass the structural checks. That does not make it a
 *   live observation.
 *
 * A Source: line, a markdown blockquote, or an actual quoted span that mentions TODO/TBD is
 * cited evidence, not the author's unresolved field. An English apostrophe inside a word does
 * not open a quotation and cannot hide an author marker.
 */
import { loadDesignSurfaceApplicability } from "../../../../catalog/ontology/design-surface-applicability.js";
import { loadVerifiedOnboardingApplicability } from "../../../../kernel/composition/onboarding-selection.js";
import { composeProofStrength, formatProofStrength } from "../../../../kernel/engine/review-evidence.js";
import {
  flagString,
  issue,
  parseCliArgs,
  parseFlags,
  readText,
  reportAndExit,
  stripNonRenderedMarkdown,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";

const argv = process.argv.slice(2);
const args = parseCliArgs(argv);
const flags = parseFlags(argv, [
  { flags: ["--path"], key: "path", kind: "string" },
  { flags: ["--node"], key: "node", kind: "string" },
]);
const relativePath = flagString(flags, "path");
const nodeLabel = flagString(flags, "node") ?? relativePath ?? "onboarding evidence node";

const issues: Issue[] = [];

const PLACEHOLDER_MARKERS = /\b(TODO|TBD|PLACEHOLDER|not_started)\b/i;
const CLASSIFICATION_MARKERS = /\b(classification|observation|heuristic|benchmark|hypothesis|open question)\b/i;
const SOURCE_MARKERS = /\bSource:\s+\S/i;
const SOURCE_BACKED = /\bsource-backed\b/i;
const SOURCE_URL = /https?:\/\//i;
const SOURCE_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const LABELED_FINDING = /\bFinding:\s+\S/i;

function authorUnresolvedMarkers(stripped: string): boolean {
  const withoutQuoted = stripped.replace(/"(?:[^"\\]|\\.)*"|(?<![A-Za-z0-9])'(?:[^'\\]|\\.)*'(?![A-Za-z0-9])/g, " ");
  const authorLines = withoutQuoted
    .split(/\r?\n/)
    .filter((line) => !/^\s*Source:\s+/i.test(line) && !/^\s*>/.test(line))
    .join("\n");
  return PLACEHOLDER_MARKERS.test(authorLines);
}

if (!relativePath) {
  issues.push(
    issue(
      "error",
      "onboarding_evidence.missing_path_flag",
      "check-onboarding-evidence-packet.ts requires --path <relative-output-path> (the node's own gate script must pass it).",
      "checks/validation/business/experience/check-onboarding-evidence-packet.ts",
    ),
  );
} else {
  const text = readText(args.root, relativePath);
  if (text === undefined) {
    issues.push(
      issue(
        "error",
        "onboarding_evidence.packet_missing",
        `${relativePath} does not exist. ${nodeLabel} must produce this evidence packet before it can be accepted.`,
        relativePath,
      ),
    );
  } else {
    // Strip every form of non-rendered Markdown before measuring -- see stripNonRenderedMarkdown's
    // own doc comment for what it strips and why (comments, fences, unterminated openers, and
    // opener/closer length matching); leaving any of that live would let hidden content inflate
    // the substantive-length count or pass the hasProse check below, standing in for a finding no
    // reviewer ever wrote.
    const stripped = stripNonRenderedMarkdown(text).trim();

    if (stripped.length === 0) {
      issues.push(
        issue(
          "error",
          "onboarding_evidence.packet_too_thin",
          `${relativePath} has no visible rendered content. ${nodeLabel} must produce a real evidence packet, not a hidden or empty stub.`,
          relativePath,
        ),
      );
    } else {
      const hasFindings = /^##\s+Findings\b/m.test(stripped) || LABELED_FINDING.test(stripped);
      const hasSource = SOURCE_MARKERS.test(stripped) || SOURCE_BACKED.test(stripped) || SOURCE_URL.test(stripped) || SOURCE_DATE.test(stripped);
      const hasClassification = CLASSIFICATION_MARKERS.test(stripped);
      if (!hasFindings || !hasSource || !hasClassification) {
        const missing = [
          ...(hasFindings ? [] : ["finding"]),
          ...(hasSource ? [] : ["source or observation reference"]),
          ...(hasClassification ? [] : ["classification"]),
        ];
        issues.push(
          issue(
            "error",
            "onboarding_evidence.packet_record_incomplete",
            `${relativePath} is structurally incomplete. A valid evidence record needs a finding, a source or observation reference, and a classification. Missing: ${missing.join(", ")}. Length or padding prose cannot complete the record.`,
            relativePath,
          ),
        );
      }
    }

    if (authorUnresolvedMarkers(stripped)) {
      issues.push(
        issue(
          "error",
          "onboarding_evidence.packet_placeholder",
          `${relativePath} still has an author TODO/TBD/PLACEHOLDER/not_started marker. Quoted source evidence that mentions those words is not an unresolved author field. ${nodeLabel} is not actually complete.`,
          relativePath,
        ),
      );
    }

    const hasProse =
      LABELED_FINDING.test(stripped) ||
      stripped.split(/\r?\n/).some((line) => {
        const trimmed = line.trim();
        return trimmed.length > 20 && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("-");
      });
    if (!hasProse) {
      issues.push(
        issue(
          "error",
          "onboarding_evidence.packet_no_prose",
          `${relativePath} has no prose paragraph describing an actual finding — headings, tables, and bullets alone are not evidence.`,
          relativePath,
        ),
      );
    }

    if (nodeLabel === "ONB-17") {
      const applicability = loadVerifiedOnboardingApplicability(args.root);
      switch (applicability.headlineBind) {
        case "unresolved":
          issues.push(
            issue(
              "error",
              "onboarding_evidence.onb17_paywall_goal_headline_unresolved",
              `${relativePath} cannot decide the Paywall Goal Headline bind until product.yaml records feature.paywall-goal-headline with slot.feature.scope required, excluded, or non-goal, and a parseable b2c.yaml declares the present-paywall owner. Absence of either is not a free or no-billing default. Packet prose cannot make that decision.`,
              "product.yaml",
            ),
          );
          break;
        case "unavailable":
          issues.push(
            issue(
              "error",
              "onboarding_evidence.onb17_paywall_goal_headline_unavailable",
              `${relativePath} selected feature.paywall-goal-headline, but the declared present-paywall owner cannot bind RevenueCat offering metadata or customVariables. Do not invent that bind for an unselected presenter. Change the feature scope or the b2c.yaml present-paywall binding.`,
              relativePath,
            ),
          );
          break;
        case "not_required":
          break;
        case "selected": {
          const required = ["paywall_headline_key", "fallback", "offering metadata", "customVariables"];
          const missing = required.filter((phrase) => !stripped.toLowerCase().includes(phrase.toLowerCase()));
          if (missing.length > 0) {
            issues.push(
              issue(
                "error",
                "onboarding_evidence.onb17_paywall_goal_headline",
                `${relativePath} must record the Paywall Goal Headline contract: quiz writes paywall_headline_key, templates live in offering metadata, customVariables bind the selected key, and a skipped goal uses the fallback. Missing: ${missing.join(", ")}. A producer sentence that this bind is not applicable cannot override the required feature.`,
                relativePath,
              ),
            );
          }
          break;
        }
        default: {
          const exhaustive: never = applicability.headlineBind;
          throw new Error(`Unhandled headline bind applicability ${String(exhaustive)}`);
        }
      }
    }

    if (nodeLabel === "ONB-08") {
      const design = loadDesignSurfaceApplicability(args.root);
      if (design.interactionUnresolved) {
        issues.push(
          issue(
            "error",
            "onboarding_evidence.onb08_surface_interaction_unresolved",
            `${relativePath} cannot decide motion research until every listed studio/seed/business.json surface records interaction as static-document, conversion, scroll-linked, standard-transition, or bespoke-motion. Do not infer the class from purpose prose. Packet prose cannot make that decision.`,
            "studio/seed/business.json",
          ),
        );
      } else {
        switch (design.sixtyFpsRegister) {
          case "unresolved":
            issues.push(
              issue(
                "error",
                "onboarding_evidence.onb08_motion_reference_unresolved",
                `${relativePath} cannot decide 60fps motion research until studio interaction (or implemented scroll-linked behavior) is classified and strategy/TOOL_DECISIONS.md records 60fps MCP access. Absence is not a free distilled-recipe default. Packet prose cannot make that decision.`,
                "strategy/TOOL_DECISIONS.md",
              ),
            );
            break;
          case "unavailable":
            issues.push(
              issue(
                "error",
                "onboarding_evidence.onb08_motion_reference_unavailable",
                `${relativePath} selected bespoke-motion or scroll-linked research, but strategy/TOOL_DECISIONS.md records the 60fps MCP as blocked, unavailable, or fallback. Do not invent shot IDs or claim a distilled recipe is equivalent. Change the studio interaction or the recorded 60fps route.`,
                relativePath,
              ),
            );
            break;
          case "not_required":
            break;
          case "selected": {
            const required = ["shot id", "interruption", "search_shots", "get_motion_breakdown"];
            const missing = required.filter((phrase) => !stripped.toLowerCase().includes(phrase.toLowerCase()));
            const hasReducedMotion = stripped.toLowerCase().includes("reduced-motion") || stripped.toLowerCase().includes("reduced motion");
            if (missing.length > 0 || !hasReducedMotion) {
              issues.push(
                issue(
                  "error",
                  "onboarding_evidence.onb08_motion_register",
                  `${relativePath} must record Motion Research rows with a reference shot ID, interruption behavior, reduced-motion behavior, and the 60fps MCP operations search_shots and get_motion_breakdown. Missing: ${[...missing, ...(hasReducedMotion ? [] : ["reduced-motion"])].join(", ")}. A producer sentence that this register is not applicable cannot override a selected or implemented rich-motion surface.`,
                  relativePath,
                ),
              );
            }
            break;
          }
          default: {
            const exhaustive: never = design.sixtyFpsRegister;
            throw new Error(`Unhandled 60fps register applicability ${String(exhaustive)}`);
          }
        }
      }
    }
  }
}

reportAndExit(`${nodeLabel} evidence packet check`, issues);
if (!argv.includes("--json")) {
  const structuralFailed = issues.some((item) => item.severity === "error");
  console.log(formatProofStrength(composeProofStrength({ structural: structuralFailed ? "failed" : "checked" })));
}
