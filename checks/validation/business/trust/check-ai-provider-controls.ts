#!/usr/bin/env node
/**
 * check-ai-provider-controls.ts — paid generative-AI cost-boundary contract.
 *
 * Paid generation applies when product or workflow evidence shows a capability
 * that can create model-provider spend. A missing control record is then an
 * error. An explicit not-applicable declaration with a named reason skips.
 *
 * npm script: check:ai-provider-controls
 * Usage: tsx checks/validation/business/trust/check-ai-provider-controls.ts --root <app-repo-root>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { issue, loadProjectState, missingPhraseCode, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { paidGenerationApplies } from "../../../../catalog/repository-profiles/paid-generation-applicability.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const relativePath = "trust/AI_PROVIDER_CONTROLS.md";
const absolutePath = path.join(args.root, relativePath);

function requirePhrases(text: string, phrases: string[]): void {
  for (const phrase of phrases) {
    if (!text.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(issue("error", missingPhraseCode("ai_provider_controls", phrase), `${relativePath} should include ${phrase}.`, relativePath));
    }
  }
}

function requireClosedBoundaries(text: string): void {
  if (/\b(client|browser|mobile) (api key|provider key)\b/i.test(text) || /\bembedded (api|provider) key\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "ai_provider_controls.client_credential",
        `${relativePath} must not place a provider credential in a browser or mobile client.`,
        relativePath,
      ),
    );
  }
  if (/\banonymous paid (call|generation)\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "ai_provider_controls.anonymous_paid_call",
        `${relativePath} must not allow anonymous or unverified requests to reach paid generation.`,
        relativePath,
      ),
    );
  }
  if (/\breleased (the )?reservation\b/i.test(text) || /\brelease(s|d) reservations?\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "ai_provider_controls.reservation_released",
        `${relativePath} must not release a reservation on a failed paid call. Charge conservatively.`,
        relativePath,
      ),
    );
  }
  if (/\bkill switch\b/i.test(text) && /\bdisables free\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "ai_provider_controls.kill_switch_disables_free",
        `${relativePath} kill switch must preserve free or manual product behavior.`,
        relativePath,
      ),
    );
  }
  if (/\bapplication cap (implies|proves) (the )?provider[- ]account cap\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "ai_provider_controls.cap_status_collapsed",
        `${relativePath} must keep application cap status and provider-account cap status as separate fields.`,
        relativePath,
      ),
    );
  }
}

const applies = paidGenerationApplies(args.root);
if (applies && !existsSync(absolutePath)) {
  issues.push(
    issue(
      "error",
      "ai_provider_controls.file_missing",
      `${relativePath} is required when a capability can create paid model-provider spend. Record auth, entitlement, reservation, kill switch, and cap fields, or declare Paid generation: not applicable with a named reason.`,
      relativePath,
    ),
  );
} else if (existsSync(absolutePath) && applies) {
  const text = readText(args.root, relativePath) ?? "";
  if (!/^## Paid AI Control Record\s*$/m.test(text)) {
    issues.push(
      issue(
        "error",
        "ai_provider_controls.heading_missing",
        `${relativePath} needs a Paid AI Control Record heading that traces every paid entry point.`,
        relativePath,
      ),
    );
  }

  requirePhrases(text, [
    "server-side authentication",
    "entitlement",
    "per-owner",
    "reservation",
    "conservative",
    "timeout",
    "kill switch",
    "approved secret runtime",
    "log",
    "rotation",
    "application cap",
    "provider-account cap",
    "readback",
    "rollback",
  ]);

  requireClosedBoundaries(text);
}

reportAndExit("Paid generative-AI controls", issues);
