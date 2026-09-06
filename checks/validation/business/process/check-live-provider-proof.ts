#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  asString,
  flagString,
  getPath,
  isRecord,
  issue,
  loadProjectState,
  parseCliArgs,
  parseFlags,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";
import { resolveProviderContractIds, unmigratedBreakingSummaries } from "../../../../adapters/providers/evaluate.js";

const argv = process.argv.slice(2);
const args = parseCliArgs(argv);
const extraFlags = parseFlags(argv, [
  { flags: ["--providers"], key: "providers", kind: "string" },
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--capability-delta"], key: "capabilityDelta" },
]);
// Not a shared parseCliArgs flag: --providers scopes the ready-claim/open-blocker check below to
// a caller-named subset of the ledger's own providers, used only by ONB-22's own catalog gate
// (check:provider-proof-onboarding) so its acceptance does not depend on an unrelated provider row
// (Resend, App Store Connect, Sentry, ...) elsewhere in operations/PROVIDER_PROOF.md. The default
// (unscoped) invocation -- the general check:provider-proof audit step and
// workflow.process.provider-proof-verification -- keeps scanning the whole document.
const scopedProviders = flagString(extraFlags, "providers")
  ?.split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter((entry) => entry.length > 0);
// loadProjectState validates v2 and presents the same read shape to business validators. It also
// keeps v1 template audits working without creating a second state file in a v2 workspace.
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const skillRootForContracts = flagString(extraFlags, "skillRoot") ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const providerFilter = scopedProviders ? resolveProviderContractIds(skillRootForContracts, scopedProviders) : undefined;
const breaking = unmigratedBreakingSummaries(skillRootForContracts, providerFilter, flagString(extraFlags, "capabilityDelta"));
for (const error of breaking.loadErrors) {
  issues.push(issue("error", "provider_proof.capability_delta.load_failed", `Capability-delta ledger failed to load: ${error.message}`, error.path));
}
for (const summary of breaking.summaries) {
  issues.push(
    issue(
      "error",
      "provider_proof.capability_delta.breaking_unmigrated",
      `Unmigrated breaking capability-delta blocks provider-proof readiness: ${summary}`,
      "catalog/providers/capability-delta.yaml",
    ),
  );
}
const proofPath = path.join(args.root, "operations/PROVIDER_PROOF.md");
const proofText = existsSync(proofPath) ? readFileSync(proofPath, "utf8") : "";

const proofRequiredLanes = ["analytics_attribution", "revenue", "email", "store_console", "apple_signing", "security", "engineering", "onboarding"];

/**
 * Providers whose Proof Ledger row must be grounded on disk once a mapped lane
 * is done. MobAI/Doppler rows are not mapped: engineering and secrets proof
 * have their own validators and legitimately route through non-MobAI tooling.
 */
const providerLaneMap: Array<{ provider: string; lanes: string[] }> = [
  { provider: "PostHog", lanes: ["analytics_attribution", "onboarding"] },
  { provider: "RevenueCat", lanes: ["revenue", "onboarding"] },
  { provider: "Resend", lanes: ["email"] },
  { provider: "App Store Connect", lanes: ["store_console", "apple_signing"] },
  { provider: "Sentry", lanes: ["security"] },
];

function laneStatus(lane: string): string | undefined {
  return loaded.state && isRecord(loaded.state) ? asString(getPath(loaded.state, `lanes.${lane}.status`)) : undefined;
}

/**
 * Markdown table body rows (header and separator rows excluded). Cells split
 * on raw "|" can shift when a cell contains a literal pipe (shell pipelines in
 * the proof-command column are common), so each row keeps its raw text and
 * path extraction scans the whole row instead of trusting a column index.
 */
const ledgerRows: Array<{ cells: string[]; raw: string }> = proofText
  .split("\n")
  .filter((line) => line.trim().startsWith("|"))
  .map((line) => ({
    raw: line,
    cells: line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  }))
  .filter(({ cells }) => cells.length >= 4 && !/^-+$/.test(cells[0] ?? "") && !/provider/i.test(cells[0] ?? ""));

/**
 * proofText with every ledger row belonging to an out-of-scope provider removed, when
 * --providers was passed; the unscoped default returns proofText unchanged. Only ledger table
 * rows are ever removed -- prose, headers, and the matching providers' own rows all stay, so the
 * ready-claim/open-blocker check below still sees genuinely relevant context, just not an
 * unrelated provider's still-pending row.
 */
function scopedProofText(): string {
  if (!scopedProviders || scopedProviders.length === 0) return proofText;
  const outOfScopeRows = new Set(ledgerRows.filter((row) => !scopedProviders.includes((row.cells[0] ?? "").toLowerCase())).map((row) => row.raw));
  if (outOfScopeRows.size === 0) return proofText;
  return proofText
    .split("\n")
    .filter((line) => !outOfScopeRows.has(line))
    .join("\n");
}

/** Path-like tokens: backtick-quoted spans (which may contain spaces) plus bare tokens with an extension. */
function pathTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const inner = (match[1] ?? "").trim();
    if (/[/.]/.test(inner)) {
      tokens.push(inner);
    }
  }
  tokens.push(...(text.match(/[A-Za-z0-9_@-]+(?:\/[A-Za-z0-9_.@-]+)*\.[A-Za-z0-9]+/g) ?? []));
  return tokens;
}

// A done proof-required lane is the hard trigger. Readiness prose in
// engineering/PRODUCTION_READINESS.md is only a soft signal: the shipped template's own
// cautionary boilerplate ("Do not mark this app launch-ready until ...")
// matches any naive readiness regex, so text alone must not hard-fail a repo
// where nothing is done yet.
// laneStatus() is self-sufficient across v1 and v2, so no outer "is there any state at all" guard
// is needed here -- unlike the old v1-only laneStatus(), which returned undefined for every lane
// whenever loaded.state was absent, silently skipping this whole loop even when v2 held the real
// answer.
let requiresProof = false;
for (const lane of proofRequiredLanes) {
  if (laneStatus(lane) === "succeeded") {
    requiresProof = true;
  }
}
const readinessText = readOptional("engineering/PRODUCTION_READINESS.md");
const readinessProse = Boolean(readinessText && /\b(ready|done|verified|launch[- ]ready|production[- ]ready)\b/i.test(readinessText));

if (!proofText.trim()) {
  if (requiresProof) {
    issues.push(
      issue(
        "error",
        "provider_proof.file_missing",
        "Provider-backed readiness requires operations/PROVIDER_PROOF.md with live evidence or explicit founder-only blockers.",
        "operations/PROVIDER_PROOF.md",
      ),
    );
  } else if (readinessProse) {
    issues.push(
      issue(
        "warning",
        "provider_proof.file_missing",
        "engineering/PRODUCTION_READINESS.md carries readiness language but operations/PROVIDER_PROOF.md does not exist yet. Seed it from business/operations/PROVIDER_PROOF.md before any provider-backed lane is marked done.",
        "operations/PROVIDER_PROOF.md",
      ),
    );
  }
} else {
  for (const keyword of [
    "PostHog",
    "RevenueCat",
    "Resend",
    "App Store Connect",
    "Sentry",
    "MobAI",
    "Doppler",
    "current status",
    "proof command",
    "evidence path",
    "founder-only",
  ]) {
    if (!proofText.toLowerCase().includes(keyword.toLowerCase())) {
      issues.push(
        issue("error", `provider_proof.${slug(keyword)}.missing`, `operations/PROVIDER_PROOF.md must include ${keyword}.`, "operations/PROVIDER_PROOF.md"),
      );
    }
  }

  const readyClaimScope = scopedProofText();
  const claimsReady = /\b(verified|ready|launch[- ]ready|production[- ]ready|live proof complete)\b/i.test(readyClaimScope);
  const containsOpenBlocker = /\b(not verified|pending|todo|unknown|placeholder|blocked|founder-only blocker)\b/i.test(readyClaimScope);
  if (claimsReady && containsOpenBlocker) {
    issues.push(
      issue(
        "error",
        "provider_proof.ready_claim_with_blocker",
        "Do not claim provider proof is ready while unresolved placeholders, pending items, or founder-only blockers remain.",
        "operations/PROVIDER_PROOF.md",
      ),
    );
  }

  // Ground the ledger in reality once a lane claims done: the provider's row
  // must exist, its status must read as captured evidence (not still-planned
  // work), and at least one path in its evidence-path cell must exist on disk.
  // Keyword presence alone cannot mark a provider-backed lane done.
  for (const mapping of providerLaneMap) {
    const isScopedTarget = Boolean(scopedProviders && scopedProviders.length > 0 && scopedProviders.includes(mapping.provider.toLowerCase()));
    // A scoped invocation (ONB-22's own check:provider-proof-onboarding gate) is itself the
    // precondition for marking the onboarding lane done: at the point it actually needs to run,
    // the onboarding lane cannot yet be "done", and neither analytics_attribution nor revenue is
    // guaranteed done either in a mobile-only launch. Gating this grounding check on doneLanes
    // alone -- as the unscoped check still correctly does -- would make it a permanent no-op for
    // exactly the providers it names, letting ONB-22's destructive cutover proceed against an
    // untouched, still-"needs ... evidence" ledger row. A named provider's evidence is required
    // unconditionally once scoped; an out-of-scope provider is skipped entirely, matching this
    // check's whole design intent that a scoped invocation's acceptance depends only on its own
    // named providers.
    if (scopedProviders && scopedProviders.length > 0 && !isScopedTarget) {
      continue;
    }
    const doneLanes = mapping.lanes.filter((lane) => laneStatus(lane) === "succeeded");
    if (doneLanes.length === 0 && !isScopedTarget) {
      continue;
    }
    const reason = doneLanes.length > 0 ? `lanes.${doneLanes[0]} is done` : `ONB-22 requires ${mapping.provider} evidence before onboarding can be marked done`;
    const row = ledgerRows.find(({ cells }) => cells[0]?.toLowerCase().includes(mapping.provider.toLowerCase()));
    if (!row) {
      issues.push(
        issue(
          "error",
          `provider_proof.${slug(mapping.provider)}.row_missing`,
          `${reason} but operations/PROVIDER_PROOF.md has no ledger row for ${mapping.provider}.`,
          "operations/PROVIDER_PROOF.md",
        ),
      );
      continue;
    }
    const statusCell = row.cells[1] ?? "";
    if (/\b(needs|pending|todo|tbd|unknown|placeholder|planned)\b/i.test(statusCell)) {
      issues.push(
        issue(
          "error",
          `provider_proof.${slug(mapping.provider)}.status_unproven`,
          `${reason} but the ${mapping.provider} ledger status still reads as planned work ("${statusCell.trim()}"). Capture the live evidence or keep the lane partial/blocked.`,
          "operations/PROVIDER_PROOF.md",
        ),
      );
    }
    // Scan the whole raw row: a literal pipe in an earlier cell (shell
    // pipeline in the proof command) shifts positional cells, and the goal is
    // only that some named artifact from this row exists on disk.
    const evidencePaths = pathTokens(row.raw);
    if (evidencePaths.length === 0) {
      issues.push(
        issue(
          "error",
          `provider_proof.${slug(mapping.provider)}.evidence_path_unrecorded`,
          `${reason} but the ${mapping.provider} ledger row names no file path. Record the captured artifact's path (backtick-quote paths that contain spaces).`,
          "operations/PROVIDER_PROOF.md",
        ),
      );
    } else if (!evidencePaths.some((relative) => existsSync(path.join(args.root, relative)))) {
      issues.push(
        issue(
          "error",
          `provider_proof.${slug(mapping.provider)}.evidence_path_missing`,
          `${reason} but none of the ${mapping.provider} evidence paths exist on disk (${evidencePaths.join(", ")}). Run the live probe/capture so the artifact exists before marking the lane done.`,
          evidencePaths[0],
        ),
      );
    }
  }
}

reportAndExit("Live provider proof check", issues);

function readOptional(relativePath: string): string | undefined {
  const filePath = path.join(args.root, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : undefined;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
