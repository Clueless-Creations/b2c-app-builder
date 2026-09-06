#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const state = loaded.state;

const engineeringLaneStatus = state ? asString(getPath(state, "lanes.engineering.status"))?.toLowerCase() : undefined;
const engineeringDone = engineeringLaneStatus === "succeeded";
const readinessArtifacts = [
  "engineering/ENGINEERING_PLAN.md",
  "engineering/engineering/ENGINEERING_PLAN.md",
  "engineering/PRODUCTION_READINESS.md",
  "engineering/engineering/PRODUCTION_READINESS.md",
].filter((candidate) => existsSync(path.join(args.root, candidate)));
const engineeringInScope = engineeringDone || readinessArtifacts.some((artifact) => hasReadinessClaim(readText(args.root, artifact) ?? ""));

const orchestration = firstText(["operations/ORCHESTRATION.md", "orchestration/operations/ORCHESTRATION.md"]);
const engineeringPlan = firstText(["engineering/ENGINEERING_PLAN.md", "engineering/engineering/ENGINEERING_PLAN.md"]);
const productionReadiness = firstText(["engineering/PRODUCTION_READINESS.md", "engineering/engineering/PRODUCTION_READINESS.md"]);

if (engineeringInScope) {
  if (!orchestration) {
    issues.push(
      issue(
        "error",
        "compound_engineering.orchestration_missing",
        "operations/ORCHESTRATION.md must record Compound Engineering routing.",
        "operations/ORCHESTRATION.md",
      ),
    );
  } else {
    requireTerms(orchestration.text, ["Compound Engineering Routing", "ce-plan", "ce-work", "ce-code-review"], orchestration.relativePath);
    if (!includesAny(orchestration.text, ["ce-update", "CE freshness check", "latest-release check"])) {
      issues.push(
        issue(
          "error",
          "compound_engineering.freshness_missing",
          "operations/ORCHESTRATION.md must record CE freshness check or latest-release fallback.",
          orchestration.relativePath,
        ),
      );
    }
    if (!includesAny(orchestration.text, ["ce-proof", "ce-demo-reel", "proof route"])) {
      issues.push(
        issue(
          "error",
          "compound_engineering.proof_route_missing",
          "operations/ORCHESTRATION.md must record CE proof or an equivalent proof route.",
          orchestration.relativePath,
        ),
      );
    }
  }
}

if (engineeringPlan) {
  requireTerms(engineeringPlan.text, ["Compound Engineering", "ce-plan", "ce-work"], engineeringPlan.relativePath);
  if (!includesAny(engineeringPlan.text, ["ce-brainstorm", "brainstorm skipped", "product direction already decisive"])) {
    issues.push(
      issue(
        "error",
        "compound_engineering.brainstorm_decision_missing",
        "engineering/ENGINEERING_PLAN.md must record ce-brainstorm use or skip rationale.",
        engineeringPlan.relativePath,
      ),
    );
  }
}

// CE-unavailable routing is a real fallback path, not just a recorded excuse:
// the plan must name the Standalone Engineering Loop (engineering-orchestration.md)
// so the build keeps the same plan/slice/review/test/proof bar without CE skills.
const artifactDeclaresFallback = engineeringPlan
  ? /\b(?:ce[_-]fallback|compound engineering (?:is )?unavailable|ce (?:is )?unavailable)\b/i.test(engineeringPlan.text)
  : false;
if (artifactDeclaresFallback && engineeringPlan && !engineeringPlan.text.includes("Standalone Engineering Loop")) {
  issues.push(
    issue(
      "error",
      "compound_engineering.standalone_loop_missing",
      "Compound Engineering is unavailable (or routed to ce_fallback) but engineering/ENGINEERING_PLAN.md does not record the Standalone Engineering Loop. " +
        "A fallback reason alone is documentation, not a path — record the plan/bounded-slices/adversarial-review/test/proof loop from " +
        "knowledge/engineering/engineering-orchestration.md so the readiness bar does not silently drop with CE missing.",
      engineeringPlan.relativePath,
    ),
  );
}

if (productionReadiness) {
  requireTerms(productionReadiness.text, ["ce-code-review"], productionReadiness.relativePath);
  if (!includesAny(productionReadiness.text, ["ce-test-browser", "ce-test-xcode", "MobAI", "E2E proof"])) {
    issues.push(
      issue(
        "error",
        "compound_engineering.test_route_missing",
        "engineering/PRODUCTION_READINESS.md must record CE test route, MobAI, or equivalent E2E proof.",
        productionReadiness.relativePath,
      ),
    );
  }
  if (!includesAny(productionReadiness.text, ["ce-proof", "ce-demo-reel", "proof artifact"])) {
    issues.push(
      issue(
        "error",
        "compound_engineering.readiness_proof_missing",
        "engineering/PRODUCTION_READINESS.md must record CE proof/demo or an equivalent proof artifact.",
        productionReadiness.relativePath,
      ),
    );
  }
}

reportAndExit("Compound Engineering routing check", issues);

function firstText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const text = readText(args.root, candidate);
    if (text) {
      return { relativePath: candidate, text };
    }
  }
  return undefined;
}

function requireTerms(text: string, terms: string[], filePath: string): void {
  for (const term of terms) {
    if (!text.includes(term)) {
      issues.push(
        issue(
          "error",
          `compound_engineering.${term.replaceAll(" ", "_").replaceAll("-", "_").toLowerCase()}.missing`,
          `${filePath} must include ${term}.`,
          filePath,
        ),
      );
    }
  }
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function hasReadinessClaim(text: string): boolean {
  if (!text.trim() || /Status:\s*partial until/i.test(text)) {
    return false;
  }
  return /\b(done|ready|production[- ]ready|launch[- ]ready|implementation proof|ce-work completed)\b/i.test(text);
}
