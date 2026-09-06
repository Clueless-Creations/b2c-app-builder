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
  normalizedIncludes,
  parseCliArgs,
  readText,
  reportAndExit,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;
const markdownPath = "trust/SECURITY.md";
const htmlPath = "trust/security-review.html";
const markdown = readText(args.root, markdownPath);
const htmlExists = existsSync(path.join(args.root, htmlPath));

function requirePhrases(text: string, phrases: string[], prefix: string, file: string): void {
  for (const phrase of phrases) {
    if (!normalizedIncludes(text, phrase)) {
      issues.push(issue("error", missingPhraseCode(prefix, phrase), `${file} should include ${phrase}.`, file));
    }
  }
}

function laneStatus(name: string): string | undefined {
  return state ? asString(getPath(state, `lanes.${name}.status`))?.toLowerCase() : undefined;
}

function toolExists(name: string): boolean {
  return Boolean(state && getPath(state, `providers.${name}`));
}

function hasPublicWebSurface(): boolean {
  if (!state) {
    return true;
  }
  for (const field of ["landing", "privacy", "terms"]) {
    if (asString(getPath(state, `project.publicUrls.${field}`))?.trim()) {
      return true;
    }
  }
  return ["landing", "web", "cloudflare"].some((name) => toolExists(name));
}

function inScope(status: string | undefined): boolean {
  return !["not_needed", "deferred"].includes(status ?? "");
}

function checkUnresolvedSecurityLines(text: string): void {
  const gateTerms = [
    "Threat Model",
    "Assets",
    "Trust Boundaries",
    "Keychain",
    "App Attest",
    "DeviceCheck",
    "Android Keystore",
    "Play Integrity",
    "RevenueCat",
    "Stripe",
    "webhook",
    "entitlement",
    "RLS",
    "rate limit",
    "Sentry",
    "MobSF",
    "security.txt",
    "release checks",
  ];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(if|when|before|after)\b/i.test(trimmed)) {
      continue;
    }
    const mentionsGate = gateTerms.some((term) => normalizedIncludes(trimmed, term));
    const unresolved = /\b(TODO|TBD|unknown|missing|not configured|not set|placeholder|fill in|to fill|pending)\b/i.test(trimmed);
    if (mentionsGate && unresolved) {
      issues.push(issue("error", "security.placeholder_or_unknown", `Security packet contains unresolved placeholder state: "${trimmed}"`, markdownPath));
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
const hasAndroid = state ? platforms.includes("android") || Boolean(androidBundleId?.trim()) : false;
const securityStatus = laneStatus("security");
const securityNotNeeded = securityStatus === "not_needed";
const mobileInScope = hasIos || hasAndroid || platforms.length > 0;

if (securityNotNeeded && mobileInScope) {
  issues.push(
    issue(
      "error",
      "security.not_needed_invalid",
      "Mobile launches require a security lane; use deferred or blocked with a reason if proof cannot be completed yet.",
      "state/business-state.json",
    ),
  );
}

if (!markdown && !securityNotNeeded) {
  issues.push(
    issue("error", "security.markdown_missing", "trust/SECURITY.md is required for mobile launch security hardening and release proof.", markdownPath),
  );
}

if (markdown) {
  const requiredPhrases = [
    "Source Basis",
    "OWASP MASVS",
    "OWASP ASVS",
    "Security Review Tool Routing",
    "Claude Security",
    "Codex Security",
    "MobSF",
    "free fallback",
    "Threat Model",
    "Assets",
    "Trust Boundaries",
    "Attacker Capabilities",
    "Data Classification",
    "Mobile Hardening",
    "Authentication",
    "Authorization",
    "Backend",
    "API",
    "Secrets",
    "Doppler",
    "Supply Chain",
    "Monitoring",
    "Incident Response",
    // Renamed from "Release Proof" when trust/security-review.html became a render of
    // this document: "proof" is banned in founder-visible copy by
    // check:founder-copy, and the hand-authored page had already been silently
    // translating the heading to "Release Checks" for the founder.
    "Release Checks",
    "Accepted Risks",
    "Founder Approval",
  ];

  if (hasIos) {
    requiredPhrases.push("iOS", "Keychain", "App Transport Security", "App Attest", "DeviceCheck", "entitlements", "store/APPLE_SIGNING.md");
  }
  if (hasAndroid) {
    requiredPhrases.push("Android", "Android Keystore", "Network Security Config", "Play Integrity");
  }
  if (inScope(laneStatus("revenue"))) {
    requiredPhrases.push("Revenue", "Entitlements", "RevenueCat", "Stripe", "restore", "webhook", "idempotency");
  }
  if (inScope(laneStatus("analytics_attribution"))) {
    requiredPhrases.push("Privacy", "Analytics", "PostHog", "session replay", "PII", "self-reported attribution");
  }
  if (inScope(laneStatus("email"))) {
    requiredPhrases.push("Email", "SPF", "DKIM", "DMARC", "unsubscribe", "Resend");
  }
  if (hasPublicWebSurface()) {
    requiredPhrases.push("security.txt", "security headers");
  }
  if (toolExists("sentry") || inScope(laneStatus("engineering"))) {
    requiredPhrases.push("Sentry", "PII scrubbing", "release health");
  }

  requirePhrases(markdown, requiredPhrases, "security", markdownPath);
  checkUnresolvedSecurityLines(markdown);

  if (/\b(complete|launch-ready|production-ready|done)\b/i.test(markdown) && /\b(TODO|TBD|unknown|placeholder|pending)\b/i.test(markdown)) {
    issues.push(
      issue(
        "error",
        "security.complete_with_placeholder",
        "trust/SECURITY.md cannot claim done/launch-ready while unresolved placeholder language remains.",
        markdownPath,
      ),
    );
  }
}

if (!htmlExists && !securityNotNeeded) {
  const severity = securityStatus === "succeeded" ? "error" : "warning";
  issues.push(issue(severity, "security.html_missing", "trust/security-review.html should render the security release board for founder review.", htmlPath));
}

reportAndExit("Security release check", issues);
