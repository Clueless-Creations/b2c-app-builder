#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import {
  asArray,
  asString,
  getPath,
  issue,
  loadProjectState,
  missingPhraseCode,
  parseCliArgs,
  readText,
  reportAndExit,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;
const markdownPath = "store/STORE_CONSOLE.md";
const htmlPath = "store/store-console.html";
const appListingPath = "APP_STORE_LISTING.md";
const appListingHtmlPath = "app-store-listing.html";
const appPrivacyQuestionnairePath = "app-privacy-questionnaire.html";
const markdown = readText(args.root, markdownPath);
const htmlExists = existsSync(path.join(args.root, htmlPath));

function firstExistingText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const text = readText(args.root, candidate);
    if (text) {
      return { relativePath: candidate, text };
    }
  }
  return undefined;
}

function existsAny(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(path.join(args.root, candidate)));
}

const appListingMarkdown = firstExistingText([appListingPath, `store/app-store-listing/${appListingPath}`]);
const appListingHtml = existsAny([appListingHtmlPath, `store/app-store-listing/${appListingHtmlPath}`]);
const appPrivacyQuestionnaire = existsAny([appPrivacyQuestionnairePath, `store/app-store-listing/${appPrivacyQuestionnairePath}`]);

function collisionFallbackLines(markdownText: string): string[] {
  return markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /(fallback name|name already in use|app name already in use|name collision)/i.test(line));
}

function hasFounderStopGuard(line: string): boolean {
  if (/\b(without|no)\s+founder approval\b/i.test(line)) {
    return false;
  }
  return /(founder approval|founder-approved|stop|do not continue|do not retry|must not retry|requires approval|ask the founder|confirm with the founder)/i.test(
    line,
  );
}

function ascManualOnlyLines(markdownText: string): string[] {
  return markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /(cannot|can't|unable to|must manually|manual[- ]only|founder must).*(create|add).*(app|app record)|create.*(app|app record).*(cannot|can't|unable|manual[- ]only|founder must)/i.test(
        line,
      ),
    );
}

function hasAscBlockedReason(line: string): boolean {
  return /(ASC CLI|asc|skill[- ]pack).*(blocked|unavailable|unsupported|auth|2FA|agreement|role|permission|founder approval)|blocked.*(ASC CLI|asc|skill[- ]pack)/i.test(
    line,
  );
}

function requirePhrases(text: string, phrases: string[], prefix: string, file: string): void {
  for (const phrase of phrases) {
    if (!text.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(issue("error", missingPhraseCode(prefix, phrase), `${file} should include ${phrase}.`, file));
    }
  }
}

const AGE_RATING_FIELDS = ["socialMedia", "messagingAndChat", "socialMediaAgeRestricted", "ageAssurance", "userGeneratedContent"] as const;
type AgeRatingField = (typeof AGE_RATING_FIELDS)[number];
type AgeRatingAnswer = "true" | "false" | "missing";

function ageRatingFieldToken(field: AgeRatingField): RegExp {
  return new RegExp(`\\b${field}(?![A-Za-z])`);
}

function parseAgeRatingAnswer(text: string, field: AgeRatingField): AgeRatingAnswer {
  const answers: AgeRatingAnswer[] = [];
  const tableRow = new RegExp(`^\\|\\s*${field}(?![A-Za-z])\\s*\\|([^\\n]*)$`, "gm");
  for (const match of text.matchAll(tableRow)) {
    const cells = (match[1] ?? "").split("|").map((cell) => cell.trim().replaceAll("`", ""));
    const answerCell = cells[1] ?? "";
    if (/^true$/i.test(answerCell)) answers.push("true");
    else if (/^false$/i.test(answerCell)) answers.push("false");
  }
  const assignment = new RegExp(`^\\s*${field}(?![A-Za-z])\\s*[:=]\\s*(true|false)\\b`, "gim");
  for (const match of text.matchAll(assignment)) {
    const value = match[1]?.toLowerCase();
    if (value === "true" || value === "false") answers.push(value);
  }
  if (answers.length === 0) return "missing";
  return answers[0] ?? "missing";
}

function requireAgeRatingAnswers(text: string, relativePath: string, requireAnswers: boolean): void {
  for (const field of AGE_RATING_FIELDS) {
    if (!ageRatingFieldToken(field).test(text)) {
      issues.push(
        issue(
          "error",
          "store_console.age_rating_field_missing",
          `${relativePath} must name the Age Rating Questionnaire field ${field} as its own token. Do not infer false from a blank field.`,
          relativePath,
        ),
      );
    }
  }

  if (!requireAnswers) return;

  const answers = {
    socialMedia: parseAgeRatingAnswer(text, "socialMedia"),
    messagingAndChat: parseAgeRatingAnswer(text, "messagingAndChat"),
    socialMediaAgeRestricted: parseAgeRatingAnswer(text, "socialMediaAgeRestricted"),
    ageAssurance: parseAgeRatingAnswer(text, "ageAssurance"),
    userGeneratedContent: parseAgeRatingAnswer(text, "userGeneratedContent"),
  };

  for (const field of AGE_RATING_FIELDS) {
    const answer = answers[field];
    switch (answer) {
      case "true":
      case "false":
        break;
      case "missing":
        issues.push(
          issue(
            "error",
            "store_console.age_rating_answer_missing",
            `${relativePath} records ${field} without a true or false answer. A blank field is not false.`,
            relativePath,
          ),
        );
        break;
      default: {
        const exhaustive: never = answer;
        issues.push(issue("error", "store_console.age_rating_answer_unhandled", `Unhandled age-rating answer ${String(exhaustive)}.`, relativePath));
      }
    }
  }

  if (answers.socialMediaAgeRestricted === "true" && (answers.ageAssurance !== "true" || answers.userGeneratedContent !== "true")) {
    issues.push(
      issue(
        "error",
        "store_console.age_rating_inconsistent",
        `${relativePath} sets socialMediaAgeRestricted to true but ageAssurance or userGeneratedContent is not true. Restricted social needs both answers.`,
        relativePath,
      ),
    );
  }
}

// revenue/REVENUE_OPS.md's "Products And Offering" table is where RevenueCat product
// setup records the store products it created; STORE_CONSOLE.md is the ASC/Play packet
// that walks the same console. Without this cross-check, the same IAP product can be
// created (or renamed) on one side with no signal that the other side drifted.
function extractRevenueProductIds(text: string): Array<{ storeProductId: string; rcProductId: string }> {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\s*\|\s*Store Product ID\s*\|/i.test(line));
  if (headerIndex === -1) {
    return [];
  }
  const products: Array<{ storeProductId: string; rcProductId: string }> = [];
  for (let row = headerIndex + 2; row < lines.length; row += 1) {
    const line = lines[row];
    if (!line || !/^\s*\|/.test(line)) {
      break;
    }
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    const storeProductId = cells[0] ?? "";
    // Example rows are written as "_example: com.app.premium.monthly_" — skip them.
    if (!storeProductId || /^_.*_$/.test(storeProductId)) {
      continue;
    }
    products.push({ storeProductId, rcProductId: cells[1] ?? "" });
  }
  return products;
}

function checkUnresolvedStoreLines(text: string, file: string, terms: string[]): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(if|when|before|after)\b/i.test(trimmed)) {
      continue;
    }
    const mentionsStoreTerm = terms.some((term) => trimmed.toLowerCase().includes(term.toLowerCase()));
    const unresolved = /\b(TODO|TBD|unknown|missing|not configured|not set|placeholder|fill in|to fill|pending|blocked|N\/A)\b/i.test(trimmed);
    if (mentionsStoreTerm && unresolved) {
      issues.push(issue("error", "store_console.placeholder_or_unknown", `Store packet contains unresolved placeholder state: "${trimmed}"`, file));
    }
  }
}

const platforms = state
  ? asArray(getPath(state, "project.platforms"))
      .map((item) => asString(item)?.toLowerCase())
      .filter((item): item is string => Boolean(item))
  : [];
const iosBundleId = state ? asString(getPath(state, "project.bundleIds.ios")) : undefined;
const androidBundleId = state ? asString(getPath(state, "project.bundleIds.android")) : undefined;
const hasIos = state ? platforms.includes("ios") || Boolean(iosBundleId?.trim()) : true;
const hasAndroid = state ? platforms.includes("android") || Boolean(androidBundleId?.trim()) : true;
const revenueStatus = state ? asString(getPath(state, "lanes.revenue.status"))?.toLowerCase() : undefined;
const revenueInScope = !state || !["not_needed", "deferred"].includes(revenueStatus ?? "");
const storeConsoleStatus = state ? asString(getPath(state, "lanes.store_console.status"))?.toLowerCase() : undefined;
const storeConsoleDone = storeConsoleStatus === "succeeded";
const storeConsoleSkipped = ["not_needed", "deferred"].includes(storeConsoleStatus ?? "");

function statusLineClaimsReady(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some((line) => /^\s*(status|launch status|upload status)\s*:/i.test(line) && /\b(done|complete|completed|ready|verified|approved)\b/i.test(line));
}

if (!markdown) {
  if (!storeConsoleSkipped) {
    const severity = storeConsoleDone || !state ? "error" : "warning";
    issues.push(
      issue(
        severity,
        "store_console.markdown_missing",
        "store/STORE_CONSOLE.md is required for copy-paste App Store Connect and Google Play guidance.",
        markdownPath,
      ),
    );
  }
} else {
  const requiredPhrases = ["click path", "privacy", "screenshots", "review notes", "account deletion", "founder approval"];
  if (hasIos) {
    requiredPhrases.push(
      "App Store Connect",
      "ASC CLI",
      "App Privacy",
      "SKU",
      "primary locale",
      "bundle ID",
      "pricing",
      "localization",
      "custom product page",
      "In-App Event",
      "Higgsfield",
      "app creation",
      "asc-id-resolver",
      "TestFlight",
      "review status",
      // App Review Information packet (prevents Guideline 2.1 "Information Needed" rejection).
      "App Review Information",
      "demo account",
      "test device",
      "external service",
      "Age Rating Questionnaire",
      "asc age-rating audit",
      "messagingAndChat",
      "socialMediaAgeRestricted",
      "ageAssurance",
      "userGeneratedContent",
      "do not infer false",
    );
    if (revenueInScope) {
      requiredPhrases.push("RevenueCat", "subscription", "asc-revenuecat-catalog-sync");
    }
  }
  if (hasAndroid) {
    requiredPhrases.push("Google Play", "Data safety", "package name");
  }

  requirePhrases(markdown, requiredPhrases, "store_console", markdownPath);

  if (hasIos) {
    requireAgeRatingAnswers(markdown, markdownPath, storeConsoleDone || statusLineClaimsReady(markdown));
  }

  for (const line of collisionFallbackLines(markdown)) {
    if (!hasFounderStopGuard(line)) {
      issues.push(
        issue(
          "error",
          "store_console.unapproved_name_fallback",
          `Name collision or fallback-name instruction must stop for founder approval on the same line: "${line}"`,
          markdownPath,
        ),
      );
    }
  }

  for (const line of ascManualOnlyLines(markdown)) {
    if (!hasAscBlockedReason(line)) {
      issues.push(
        issue(
          "error",
          "store_console.asc_app_creation_underclaimed",
          `ASC app creation must route through ASC CLI/skills or name a real CLI/auth/account blocker on the same line: "${line}"`,
          markdownPath,
        ),
      );
    }
  }

  // App container price vs IAP/Lifetime distinction check.
  // When the packet mentions a Lifetime offer it must also confirm:
  // 1. The app container price is Free (not a paid download).
  // 2. The Lifetime offer is implemented as a NON_CONSUMABLE IAP product.
  const markdownLower = markdown.toLowerCase();
  const hasLifetimeOffer = /\blifetime\b/.test(markdownLower);
  if (hasLifetimeOffer && hasIos) {
    if (!/\bnon[_-]consumable\b/.test(markdownLower)) {
      issues.push(
        issue(
          "error",
          "store_console.lifetime_iap_type_missing",
          "store/STORE_CONSOLE.md mentions a Lifetime offer but does not confirm a NON_CONSUMABLE IAP product type. A Lifetime paywall row must be backed by a NON_CONSUMABLE in-app purchase, not the app container price.",
          markdownPath,
        ),
      );
    }
    // Detect any line that sets the app container price to a non-free value alongside "lifetime".
    const paidContainerPattern = /price[:\s]+\$?\d+(\.\d+)?\b(?!.*free)/i;
    const containerPriceConfirmedFree =
      /container.*price.*free|app.*price.*free|price.*free.*download|pricing.*and.*availability.*free|download.*price.*free/i.test(markdown);
    const paidContainerMentioned = paidContainerPattern.test(markdown) && !containerPriceConfirmedFree;
    if (paidContainerMentioned) {
      issues.push(
        issue(
          "warning",
          "store_console.app_container_price_possibly_non_free",
          "store/STORE_CONSOLE.md may set a non-zero app container price while a Lifetime IAP offer is present. Subscription/IAP apps must remain Free at the container level; the Lifetime price belongs on the NON_CONSUMABLE IAP product only.",
          markdownPath,
        ),
      );
    }
  }

  const guardedTerms = [
    "App Store Connect",
    "Google Play",
    "privacy",
    "App Privacy",
    "Data safety",
    "pricing",
    "RevenueCat",
    "subscription",
    "custom product page",
    "In-App Event",
    "localization",
    "Higgsfield",
    "screenshots",
    "review notes",
    "account deletion",
    "SKU",
    "primary locale",
    "bundle ID",
    "package name",
  ];
  if (storeConsoleDone || statusLineClaimsReady(markdown)) {
    checkUnresolvedStoreLines(markdown, markdownPath, guardedTerms);
  }

  if (revenueInScope) {
    const revenueOpsText = readText(args.root, "revenue/REVENUE_OPS.md");
    if (revenueOpsText) {
      const products = extractRevenueProductIds(revenueOpsText);
      const markdownLower = markdown.toLowerCase();
      const severity: "error" | "warning" = storeConsoleDone || revenueStatus === "succeeded" ? "error" : "warning";
      for (const product of products) {
        if (!markdownLower.includes(product.storeProductId.toLowerCase())) {
          issues.push(
            issue(
              severity,
              "store_console.revenue_product_id_missing",
              `revenue/REVENUE_OPS.md lists store product "${product.storeProductId}" (RevenueCat product "${product.rcProductId}") but ${markdownPath} never names it. The same IAP product must not be created independently on both sides with no cross-check — confirm this is the same product ASC/Play console shows, or reconcile the two records.`,
              markdownPath,
            ),
          );
        }
      }
    }
  }
}

if (!htmlExists) {
  issues.push(
    issue("warning", "store_console.html_missing", "store/store-console.html should render the copy-paste console packet for the founder.", htmlPath),
  );
}

if (hasIos) {
  if (!appListingMarkdown) {
    issues.push(
      issue(
        "error",
        "store_console.app_store_listing.markdown_missing",
        "APP_STORE_LISTING.md is required for iOS listing, privacy, pricing, localization, and App Store marketing prep.",
        appListingPath,
      ),
    );
  } else {
    const appListingRequiredPhrases = [
      "App Privacy",
      "pricing",
      "localization",
      "custom product page",
      "In-App Event",
      "Higgsfield",
      "founder approval",
      "app creation",
      "asc-app-create-ui",
      "asc-id-resolver",
      "asc-metadata-sync",
      "asc-localize-metadata",
      "asc-screenshot-resize",
      "asc-shots-pipeline",
      "asc-ppp-pricing",
      "asc-subscription-localization",
      "asc-testflight-orchestration",
      "asc-submission-health",
      "asc-release-flow",
      "version localization ID",
      "base territory",
      "SCREENSHOTS.md",
      "App Icon",
      "App Preview",
      "iPad",
      "copy overlay",
    ];
    if (revenueInScope) {
      appListingRequiredPhrases.push("RevenueCat", "subscription", "asc-revenuecat-catalog-sync");
    }
    requirePhrases(appListingMarkdown.text, appListingRequiredPhrases, "app_store_listing", appListingMarkdown.relativePath);
    if (storeConsoleDone || statusLineClaimsReady(appListingMarkdown.text)) {
      checkUnresolvedStoreLines(appListingMarkdown.text, appListingMarkdown.relativePath, appListingRequiredPhrases);
    }
  }

  if (!appListingHtml) {
    issues.push(
      issue(
        "error",
        "store_console.app_store_listing.html_missing",
        "app-store-listing.html should render the iOS listing packet as a copy-paste founder surface.",
        appListingHtmlPath,
      ),
    );
  }
  if (!appPrivacyQuestionnaire) {
    issues.push(
      issue(
        "error",
        "store_console.app_privacy_questionnaire.html_missing",
        "app-privacy-questionnaire.html should render the interactive Apple App Privacy worksheet.",
        appPrivacyQuestionnairePath,
      ),
    );
  }
}

reportAndExit("Store console packet check", issues);
