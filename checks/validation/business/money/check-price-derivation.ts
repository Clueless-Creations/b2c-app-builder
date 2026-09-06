#!/usr/bin/env node
/**
 * check-price-derivation.ts — guarded subscription price-derivation plans.
 *
 * When revenue/PRICE_DERIVATION.md is absent and REVENUE_OPS.md has no Price
 * Derivation Plan heading, skip. When a plan exists, require dry-run, exact
 * targets, first-class unavailable territories, and founder apply gates.
 *
 * npm script: check:price-derivation
 * Usage: tsx checks/validation/business/money/check-price-derivation.ts --root <app-repo-root>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { issue, loadProjectState, missingPhraseCode, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const companionPath = "revenue/PRICE_DERIVATION.md";
const revenueOpsPath = "revenue/REVENUE_OPS.md";

type PlanSource = { relativePath: string; text: string };

function requirePhrases(text: string, relativePath: string, phrases: string[]): void {
  for (const phrase of phrases) {
    if (!text.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(issue("error", missingPhraseCode("price_derivation", phrase), `${relativePath} should include ${phrase}.`, relativePath));
    }
  }
}

function extractSection(text: string, heading: string): string | undefined {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return undefined;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function loadPlan(): PlanSource | undefined {
  if (existsSync(path.join(args.root, companionPath))) {
    return { relativePath: companionPath, text: readText(args.root, companionPath) ?? "" };
  }
  if (!existsSync(path.join(args.root, revenueOpsPath))) return undefined;
  const revenueOps = readText(args.root, revenueOpsPath) ?? "";
  if (!/^## Price Derivation Plan\s*$/m.test(revenueOps)) return undefined;
  return { relativePath: revenueOpsPath, text: extractSection(revenueOps, "Price Derivation Plan") ?? revenueOps };
}

function requireApplyBoundary(text: string, relativePath: string): void {
  if (/\bapplied derived prices without dry-run\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "price_derivation.apply_without_dry_run",
        `${relativePath} applied derived prices without a dry-run. Dry-run is mandatory and causes no provider mutation.`,
        relativePath,
      ),
    );
  }
  if (/(?:asc\s+)?subscriptions pricing derive(?![^\n]*--dry-run)[^\n]*--apply/i.test(text) && !/\bfounder approval\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "price_derivation.apply_without_authorization",
        `${relativePath} emits an apply command without founder approval. A multiplier is not approval.`,
        relativePath,
      ),
    );
  }
  if (/\bmultiplier is approval\b/i.test(text) || /\bmultiplier grants approval\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "price_derivation.multiplier_as_approval",
        `${relativePath} treats the multiplier as approval. Applying prices needs an exact envelope and founder confirmation.`,
        relativePath,
      ),
    );
  }
  if (/\bselected the nearest price point\b/i.test(text) || /\bchose a nearby (price point|tier)\b/i.test(text)) {
    issues.push(
      issue(
        "error",
        "price_derivation.nearby_tier",
        `${relativePath} chose a nearby tier for a missing price point. Unavailable territories stay blockers.`,
        relativePath,
      ),
    );
  }
}

const plan = loadPlan();
if (plan) {
  if (!/^## Price Derivation Plan\s*$/m.test(plan.text) && plan.relativePath === companionPath) {
    issues.push(
      issue(
        "error",
        "price_derivation.plan_heading_missing",
        `${plan.relativePath} needs a Price Derivation Plan heading with source, target, multiplier, and storefronts.`,
        plan.relativePath,
      ),
    );
  }

  requirePhrases(plan.text, plan.relativePath, [
    "source subscription",
    "target subscription",
    "multiplier",
    "storefront",
    "effective-date",
    "subscriber-preservation",
    "--dry-run",
    "asc subscriptions pricing derive",
    "do not infer approval from the multiplier",
    "one future change",
    "readback",
    "RevenueCat",
    "unavailable",
    "founder",
  ]);

  requireApplyBoundary(plan.text, plan.relativePath);
}

reportAndExit("Price derivation", issues);
