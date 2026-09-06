#!/usr/bin/env node
/**
 * Deterministic gate for a single ONB-03..ONB-08 evidence-research node's own output packet.
 *
 * These nodes are domain.experience with no fresh-context judgment path wired into the
 * production runner (kernel/session/run.ts's acceptVerification() is only ever called from the
 * deterministic-gate branch; fresh_context acceptance exists only in test fixtures) — so a
 * deterministic gate is the only verification path that actually promotes the node to succeeded
 * in a real durable run. This gate cannot judge whether the research is TRUE (that needs a real
 * reviewer, which does not exist yet); it only rejects the mechanical shape of an empty,
 * stub-length, or still-templated packet, closing the "any returned artifact ID is accepted"
 * gap enough to stop a trivially empty or placeholder packet from unlocking ONB-09.
 */
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

// A minimum non-fence character count that a copy-pasted trigger sentence or a one-line stub
// cannot clear, without being so high that a genuinely terse-but-real packet would fail it.
const MIN_SUBSTANTIVE_LENGTH = 400;
const PLACEHOLDER_MARKERS = /\b(TODO|TBD|PLACEHOLDER|not_started)\b/i;

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

    if (stripped.length < MIN_SUBSTANTIVE_LENGTH) {
      issues.push(
        issue(
          "error",
          "onboarding_evidence.packet_too_thin",
          `${relativePath} has only ${stripped.length} non-fence character(s) of content. ${nodeLabel} must produce a real evidence packet, not a stub.`,
          relativePath,
        ),
      );
    }

    if (PLACEHOLDER_MARKERS.test(stripped)) {
      issues.push(
        issue(
          "error",
          "onboarding_evidence.packet_placeholder",
          `${relativePath} still contains a TODO/TBD/PLACEHOLDER/not_started marker. ${nodeLabel} is not actually complete.`,
          relativePath,
        ),
      );
    }

    const hasProse = stripped.split(/\r?\n/).some((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("-");
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
      const required = ["paywall_headline_key", "fallback", "offering metadata", "customVariables"];
      const missing = required.filter((phrase) => !stripped.toLowerCase().includes(phrase.toLowerCase()));
      if (missing.length > 0) {
        issues.push(
          issue(
            "error",
            "onboarding_evidence.onb17_paywall_goal_headline",
            `${relativePath} must record the Paywall Goal Headline contract: quiz writes paywall_headline_key, templates live in offering metadata, customVariables bind the selected key, and a skipped goal uses the fallback. Missing: ${missing.join(", ")}.`,
            relativePath,
          ),
        );
      }
    }
  }
}

reportAndExit(`${nodeLabel} evidence packet check`, issues);
