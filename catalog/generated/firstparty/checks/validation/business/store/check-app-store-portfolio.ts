#!/usr/bin/env node
/**
 * check-app-store-portfolio.ts — live App Store apps-list receipt.
 *
 * `run/app-store-portfolio.json` is the observe receipt that makes
 * research-backed-spec frontier-admissible. Missing file is a no-op for the
 * general audit. The workflow gate `check:app-store-portfolio-required` fails
 * closed when the receipt is absent, stale, web-authed, or missing provenance.
 * A prose-only "empty portfolio" claim is not a receipt.
 *
 * npm script: check:app-store-portfolio
 * Usage: tsx checks/validation/business/store/check-app-store-portfolio.ts --root <workspace>
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { asArray, asString, isRecord, issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const requireReceipt = process.argv.includes("--require-receipt");
const issues: Issue[] = [];
const receiptRel = "run/app-store-portfolio.json";
const accessRel = "operations/business-access.json";
const receiptPath = path.join(args.root, receiptRel);
const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;
const FORBIDDEN_RECEIPT_KEYS = new Set(["appleid", "appid", "sku", "stdout", "session", "env", "appleidnumeric", "numericid"]);

if (!existsSync(receiptPath)) {
  if (requireReceipt) {
    issues.push(
      issue(
        "error",
        "app_store_portfolio.receipt_missing",
        "workflow.operations.live-app-store-portfolio requires run/app-store-portfolio.json from a live asc apps list. Failed or missing API auth produces no receipt.",
        receiptRel,
      ),
    );
  }
  reportAndExit("App Store portfolio receipt check", issues);
} else {
  validateReceipt();
}

function validateReceipt(): void {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch {
    issues.push(issue("error", "app_store_portfolio.receipt_invalid", "run/app-store-portfolio.json is present but is not valid JSON.", receiptRel));
    reportAndExit("App Store portfolio receipt check", issues);
    return;
  }

  if (!isRecord(raw)) {
    issues.push(issue("error", "app_store_portfolio.receipt_invalid", "run/app-store-portfolio.json must be a JSON object.", receiptRel));
    reportAndExit("App Store portfolio receipt check", issues);
    return;
  }

  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_RECEIPT_KEYS.has(key.toLowerCase())) {
      issues.push(
        issue(
          "error",
          "app_store_portfolio.forbidden_field",
          `run/app-store-portfolio.json must not store ${key}. Keep name and optional bundleId only.`,
          receiptRel,
        ),
      );
    }
  }

  if (raw.schemaVersion !== "1.0.0") {
    issues.push(issue("error", "app_store_portfolio.schema_unsupported", "App Store portfolio receipt must use schema 1.0.0.", receiptRel));
  }
  if (raw.command !== "asc apps list") {
    issues.push(
      issue(
        "error",
        "app_store_portfolio.command_invalid",
        "Portfolio receipt command must be exactly asc apps list. A web session never satisfies the hold.",
        receiptRel,
      ),
    );
  }
  if (raw.authFamily !== "api") {
    issues.push(
      issue("error", "app_store_portfolio.auth_family_invalid", "Portfolio receipt authFamily must be api. Web session never satisfies the hold.", receiptRel),
    );
  }

  const winnerVersion = asString(raw.winnerVersion) ?? "";
  if (!/^\d+\.\d+\.\d+/.test(winnerVersion)) {
    issues.push(
      issue("error", "app_store_portfolio.winner_version_missing", "Portfolio receipt must record the winning asc version that ran apps list.", receiptRel),
    );
  }

  const observedAt = asString(raw.observedAt) ?? "";
  const observedMs = Date.parse(observedAt);
  if (!observedAt || Number.isNaN(observedMs)) {
    issues.push(
      issue(
        "error",
        "app_store_portfolio.observed_at_missing",
        "Portfolio receipt must record observedAt as an ISO timestamp from the live command.",
        receiptRel,
      ),
    );
  } else {
    if (Date.now() - observedMs > FRESHNESS_MS) {
      issues.push(
        issue(
          "error",
          "app_store_portfolio.receipt_stale",
          "Portfolio receipt is older than seven days. Re-run asc apps list before research-backed-spec is admissible.",
          receiptRel,
        ),
      );
    }
    const appleCheckedAt = readAppleCheckedAt(args.root);
    const appleCheckedMs = appleCheckedAt ? Date.parse(appleCheckedAt) : Number.NaN;
    if (!Number.isNaN(appleCheckedMs) && appleCheckedMs > observedMs) {
      issues.push(
        issue(
          "error",
          "app_store_portfolio.receipt_stale_after_auth_change",
          "Apple account checkedAt is newer than the portfolio receipt. Re-run asc apps list after the auth or team change.",
          receiptRel,
        ),
      );
    }
  }

  const appCount = raw.appCount;
  if (typeof appCount !== "number" || !Number.isInteger(appCount) || appCount < 0) {
    issues.push(
      issue("error", "app_store_portfolio.app_count_invalid", "Portfolio receipt appCount must be a non-negative integer from the live list.", receiptRel),
    );
  }

  const apps = asArray(raw.apps).filter(isRecord);
  if (typeof appCount === "number" && apps.length !== appCount) {
    issues.push(issue("error", "app_store_portfolio.app_count_mismatch", "Portfolio receipt apps length must equal appCount.", receiptRel));
  }

  if (appCount === 0) {
    if (raw.empty !== true) {
      issues.push(
        issue(
          "error",
          "app_store_portfolio.empty_unproven",
          "An empty portfolio must set empty: true from live asc apps list output. Do not author an empty list from memory.",
          receiptRel,
        ),
      );
    }
  } else if (raw.empty === true) {
    issues.push(issue("error", "app_store_portfolio.empty_conflict", "empty: true is valid only when appCount is 0.", receiptRel));
  }

  for (const [index, app] of apps.entries()) {
    const name = asString(app.name) ?? "";
    if (!name.trim()) {
      issues.push(issue("error", "app_store_portfolio.app_name_missing", `Portfolio app ${index} must include a sanitized name.`, receiptRel));
    } else if (/^\d+$/.test(name.trim())) {
      issues.push(issue("error", "app_store_portfolio.numeric_id", `Portfolio app ${index} must not store an Apple numeric id as the name.`, receiptRel));
    }
    const bundleId = asString(app.bundleId);
    if (bundleId !== undefined) {
      if (!bundleId.includes(".") || /\s/.test(bundleId)) {
        issues.push(
          issue("error", "app_store_portfolio.bundle_id_invalid", `Portfolio app ${index} bundleId must be a reverse-DNS identifier when present.`, receiptRel),
        );
      }
    }
    for (const key of Object.keys(app)) {
      if (!["name", "bundleId"].includes(key)) {
        issues.push(issue("error", "app_store_portfolio.forbidden_field", `Portfolio app ${index} may only store name and optional bundleId.`, receiptRel));
      }
    }
  }

  const forbidden = readForbiddenProjects(args.root);
  const productTargets = readProductTargets(args.root);
  for (const entry of forbidden) {
    const forbiddenName = entry.name.toLowerCase();
    const forbiddenBundle = entry.bundleId?.toLowerCase();
    for (const app of apps) {
      const appName = (asString(app.name) ?? "").toLowerCase();
      const appBundle = (asString(app.bundleId) ?? "").toLowerCase();
      if (appName && appName === forbiddenName) {
        issues.push(
          issue(
            "error",
            "app_store_portfolio.forbidden_project",
            `Live portfolio names a forbidden provider project (${entry.name}). Research that would target that product is refused.`,
            receiptRel,
          ),
        );
      }
      if (forbiddenBundle && appBundle && appBundle === forbiddenBundle) {
        issues.push(
          issue(
            "error",
            "app_store_portfolio.forbidden_project",
            `Live portfolio includes a forbidden bundleId. Research that would target that product is refused.`,
            receiptRel,
          ),
        );
      }
    }
    for (const target of productTargets) {
      if (target.toLowerCase() === forbiddenName || (forbiddenBundle && target.toLowerCase() === forbiddenBundle)) {
        issues.push(
          issue(
            "error",
            "app_store_portfolio.forbidden_compose_target",
            `Product compose target matches a forbidden provider project (${entry.name}).`,
            "product.yaml",
          ),
        );
      }
    }
  }

  reportAndExit("App Store portfolio receipt check", issues);
}

function readForbiddenProjects(root: string): Array<{ name: string; bundleId?: string }> {
  const accessPath = path.join(root, accessRel);
  if (!existsSync(accessPath)) return [];
  try {
    const value = JSON.parse(readFileSync(accessPath, "utf8")) as unknown;
    if (!isRecord(value)) return [];
    return asArray(value.forbiddenProviderProjects)
      .filter(isRecord)
      .map((entry) => ({
        name: asString(entry.name) ?? "",
        bundleId: asString(entry.bundleId) || undefined,
      }))
      .filter((entry) => entry.name.length > 0);
  } catch {
    return [];
  }
}

function readAppleCheckedAt(root: string): string | undefined {
  const accessPath = path.join(root, accessRel);
  if (!existsSync(accessPath)) return undefined;
  try {
    const value = JSON.parse(readFileSync(accessPath, "utf8")) as unknown;
    if (!isRecord(value)) return undefined;
    const apple = asArray(value.accounts)
      .filter(isRecord)
      .find((entry) => entry.id === "apple");
    return apple ? asString(apple.checkedAt) || undefined : undefined;
  } catch {
    return undefined;
  }
}

function readProductTargets(root: string): string[] {
  const targets: string[] = [];
  const productPath = path.join(root, "product.yaml");
  if (!existsSync(productPath)) return targets;
  try {
    const parsed = parseYaml(readFileSync(productPath, "utf8")) as unknown;
    if (!isRecord(parsed)) return targets;
    const meta = isRecord(parsed.meta) ? parsed.meta : {};
    const name = asString(meta.name);
    const bundle = asString(meta.bundleId) ?? asString(meta.bundle_id);
    if (name) targets.push(name);
    if (bundle) targets.push(bundle);
  } catch {
    return targets;
  }
  return targets;
}
