#!/usr/bin/env node
/**
 * check-landing-funnel
 *
 * Statically validates that the Phase 4 pre-launch funnel landing package
 * documents the five pre-deploy gates and the browser-rendered form smoke test.
 *
 * Checks README.md, engineering/PRODUCTION_READINESS.md, and the landing lane state in
 * state/business-state.json. Does NOT execute git, wrangler, or a browser — it
 * verifies that the agent has recorded the gate results in the right artifacts.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  asString,
  collectFiles,
  getPath,
  isRecord,
  issue,
  loadProjectState,
  parseCliArgs,
  readText,
  reportAndExit,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

function includes(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function mentionsAny(text: string, terms: string[]): boolean {
  return terms.some((t) => includes(text, t));
}

// Determine whether a landing/funnel lane is in scope
function laneStatus(name: string): string | undefined {
  return state ? asString(getPath(state, `lanes.${name}.status`))?.toLowerCase() : undefined;
}

// The funnel lane may be tracked under different names across projects.
const landingStatus = laneStatus("landing") ?? laneStatus("funnel") ?? laneStatus("growth");
const designStatus = laneStatus("design");
const designAccepted = designStatus === "succeeded" || designStatus === "accepted";
// Only enforce when a landing site is actually in scope: either a lane explicitly
// marks it in progress/done, or landing artifacts exist on disk. Skip cleanly
// otherwise so the validator never false-positives on a non-landing repo.
// Scope needs SITE-shaped signals: a bare landing/ directory can be just the
// copied-in business/growth/landing section library (components, no deployable
// funnel yet), which must not trigger the deploy gates.
const hasLandingArtifacts =
  existsSync(path.join(args.root, "growth", "landing", "index.html")) ||
  existsSync(path.join(args.root, "growth", "landing", "package.json")) ||
  existsSync(path.join(args.root, "growth", "landing", "app")) ||
  existsSync(path.join(args.root, "growth", "landing", "pages")) ||
  existsSync(path.join(args.root, "public")) ||
  existsSync(path.join(args.root, "wrangler.toml")) ||
  existsSync(path.join(args.root, "growth", "landing", "wrangler.toml"));
const explicitlyOut = landingStatus === "not_needed" || landingStatus === "deferred";
const landingLaneActive = Boolean(landingStatus) && !["pending", "not_needed", "deferred"].includes(landingStatus ?? "");
const inScope = designAccepted || (!explicitlyOut && (landingLaneActive || hasLandingArtifacts));

if (!inScope) {
  reportAndExit("Landing funnel check (skipped — no landing/funnel lane or artifacts in scope)", issues);
  // No argument: honor the exit code reportAndExit set (errors still fail on the skip path).
  process.exit();
}

if (designAccepted && !hasLandingArtifacts) {
  issues.push(
    issue(
      "error",
      "landing_funnel.design_lock.site_missing",
      "The design contract is accepted, but no runnable landing site exists in growth/landing/. The landing baseline must start in the same ready batch as app implementation.",
      "growth/landing/",
    ),
  );
}

// The surface contract makes cross-document consistency machine-readable. It
// stores source digests instead of relying on prose that says the files were read.
const surfaceContractPath = "growth/landing/surface-contract.json";
if (designAccepted) {
  if (!existsSync(path.join(args.root, surfaceContractPath))) {
    issues.push(
      issue(
        "error",
        "landing_funnel.surface_contract.missing",
        "Accepted design requires growth/landing/surface-contract.json with canonical-source digests, locales, analytics events, pricing, onboarding, and screenshot evidence.",
        surfaceContractPath,
      ),
    );
  } else {
    let contract: unknown;
    try {
      contract = JSON.parse(readFileSync(path.join(args.root, surfaceContractPath), "utf8"));
    } catch (error) {
      issues.push(
        issue("error", "landing_funnel.surface_contract.invalid_json", `surface-contract.json is invalid JSON: ${String(error)}`, surfaceContractPath),
      );
    }
    if (isRecord(contract)) {
      const sources = Array.isArray(contract.sources) ? contract.sources : [];
      const canonicalCandidates = [
        "DESIGN.md",
        "product/copy/COPY_DECK.md",
        "product/copy/COPY_BRIEF.md",
        "product/ONBOARDING.md",
        "analytics/ANALYTICS.md",
        "GEO_SEO.md",
        "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md",
        "revenue/REVENUE_OPS.md",
      ].filter((relativePath) => existsSync(path.join(args.root, relativePath)));
      for (const relativePath of canonicalCandidates) {
        const row = sources.find((value) => isRecord(value) && asString(value.path) === relativePath);
        const expected = createHash("sha256")
          .update(readFileSync(path.join(args.root, relativePath)))
          .digest("hex");
        if (!isRecord(row) || asString(row.sha256) !== expected) {
          issues.push(
            issue(
              "error",
              "landing_funnel.surface_contract.source_stale",
              `${relativePath} is absent from the landing surface contract or its sha256 is stale. Reconcile the landing against the current canonical artifact.`,
              surfaceContractPath,
            ),
          );
        }
      }

      const events = Array.isArray(contract.analytics_events) ? contract.analytics_events.map(asString) : [];
      for (const event of ["landing_viewed", "landing_cta_clicked", "waitlist_submitted"]) {
        if (!events.includes(event)) {
          issues.push(
            issue("error", `landing_funnel.surface_contract.event.${event}.missing`, `surface-contract.json must declare ${event}.`, surfaceContractPath),
          );
        }
      }
      const locales = Array.isArray(contract.locales) ? contract.locales : [];
      if (!locales.some((row) => isRecord(row) && asString(row.locale)?.trim() && asString(row.evidence)?.trim())) {
        issues.push(issue("error", "landing_funnel.surface_contract.locales.missing", "Record each Tier 1 locale with landing evidence.", surfaceContractPath));
      }
      for (const section of ["pricing", "onboarding"] as const) {
        const value = contract[section];
        if (!isRecord(value) || typeof value.applicable !== "boolean" || !asString(value.evidence)?.trim()) {
          issues.push(
            issue(
              "error",
              `landing_funnel.surface_contract.${section}.decision_missing`,
              `surface-contract.json must record whether ${section} is applicable and cite the decision evidence.`,
              surfaceContractPath,
            ),
          );
        }
      }
      const screenshots = Array.isArray(contract.screenshots) ? contract.screenshots : [];
      if (!screenshots.some((row) => isRecord(row) && asString(row.locale)?.trim() && asString(row.evidence)?.trim() && asString(row.source_kind)?.trim())) {
        issues.push(
          issue(
            "error",
            "landing_funnel.surface_contract.screenshots.missing",
            "Record landing screenshot slots per locale with evidence and source_kind (preview or real_app).",
            surfaceContractPath,
          ),
        );
      }
    }
  }
}

// Collect the candidate docs where gate evidence should be recorded
const candidateDocs = [
  "README.md",
  "growth/landing/README.md",
  "PRODUCTION_READINESS.md",
  "growth/landing/PRODUCTION_READINESS.md",
  "state/state/LAUNCH_TRACE.md",
];

const docTexts: Array<{ path: string; text: string }> = [];
for (const rel of candidateDocs) {
  const text = readText(args.root, rel);
  if (text) {
    docTexts.push({ path: rel, text });
  }
}

const combinedText = docTexts.map((d) => d.text).join("\n");
const primaryDoc = docTexts.find((d) => d.path === "README.md" || d.path === "growth/landing/README.md")?.path ?? candidateDocs[0];
const landingPublicUrl = state ? asString(getPath(state, "project.publicUrls.landing")) : undefined;
const publicationInScope = Boolean(landingPublicUrl?.trim()) || /\b(production url\s*:|live url\s*:|wrangler deploy)\b/i.test(combinedText);

if (docTexts.length === 0) {
  issues.push(
    issue(
      "warning",
      "landing_funnel.docs_missing",
      "No README.md or engineering/PRODUCTION_READINESS.md found under the project root or growth/landing/. " +
        "Create at least one to document deploy gate results and smoke test evidence.",
      primaryDoc,
    ),
  );
}

// ── Gate 1: git clean before deploy ──────────────────────────────────────────
if (publicationInScope && !mentionsAny(combinedText, ["git clean", "uncommitted", "working tree", "git status", "committed before deploy", "no uncommitted"])) {
  issues.push(
    issue(
      "error",
      "landing_funnel.git_clean_gate.missing",
      "Docs do not confirm that the working tree was clean (no uncommitted changes) before the last wrangler deploy. " +
        "Record 'git status --porcelain' was clean before deploy in README.md or engineering/PRODUCTION_READINESS.md.",
      primaryDoc,
    ),
  );
}

// ── Gate 2: wrangler version current ─────────────────────────────────────────
if (
  publicationInScope &&
  !mentionsAny(combinedText, ["wrangler version", "wrangler v4", "wrangler@4", "wrangler upgrade", "wrangler current", "updated wrangler"])
) {
  issues.push(
    issue(
      "error",
      "landing_funnel.wrangler_version_gate.missing",
      "Docs do not confirm the wrangler major version was checked and current before deploy. " +
        "Record the wrangler version used and that it is not a major version behind in README.md or engineering/PRODUCTION_READINESS.md.",
      primaryDoc,
    ),
  );
}

// ── Gate 3: wrangler whoami / token scope ─────────────────────────────────────
if (publicationInScope && !mentionsAny(combinedText, ["wrangler whoami", "pages:edit", "workers:edit", "api token", "token scope", "cloudflare token"])) {
  issues.push(
    issue(
      "error",
      "landing_funnel.token_scope_gate.missing",
      "Docs do not confirm 'wrangler whoami' was run to verify the Cloudflare API token has Pages:Edit or Workers:Edit scope before the first deploy. " +
        "Record the token scope check in README.md or engineering/PRODUCTION_READINESS.md.",
      primaryDoc,
    ),
  );
}

// ── Gate 4: Alpine CSP / x-model awareness ───────────────────────────────────
// Only enforce when Alpine or a CSP header is referenced anywhere in the project
const usesAlpine =
  mentionsAny(combinedText, ["alpine", "x-model", "x-data", "@alpinejs"]) ||
  (() => {
    // Also check any HTML files in landing/
    const landingDir = path.join(args.root, "growth", "landing");
    if (!existsSync(landingDir)) return false;
    const tryFiles = ["growth/landing/index.html", "public/index.html"];
    return tryFiles.some((f) => {
      const t = readText(args.root, f);
      return t ? mentionsAny(t, ["alpine", "x-model", "@alpinejs"]) : false;
    });
  })();

if (
  usesAlpine &&
  !mentionsAny(combinedText, ["alpinejs/csp", "@alpinejs/csp", "csp-safe", "csp build", "alpine csp", "x-model csp", "inline expression", "csp alpine"])
) {
  issues.push(
    issue(
      "error",
      "landing_funnel.alpine_csp_gate.missing",
      "Alpine.js is referenced but docs do not confirm the @alpinejs/csp build is used and x-model/inline expressions have been replaced with method calls. " +
        "Alpine's CSP-safe build forbids inline assignment expressions including x-model; failure surfaces only in a browser with a strict CSP, not in curl. " +
        "Record the CSP/Alpine audit result in README.md or engineering/PRODUCTION_READINESS.md.",
      primaryDoc,
    ),
  );
}

// ── Gate 5: browser-rendered form smoke test ─────────────────────────────────
if (
  publicationInScope &&
  !mentionsAny(combinedText, [
    "browser",
    "playwright",
    "puppeteer",
    "mobai",
    "form smoke test",
    "browser smoke",
    "browser-rendered",
    "browser rendered",
    "browser test",
    "opened in browser",
    "browser form",
    "filled the form",
    "submitted the form",
    "success panel",
    "success state",
    "success screen",
    "form submission",
  ])
) {
  issues.push(
    issue(
      "error",
      "landing_funnel.browser_form_smoke_test.missing",
      "Docs do not confirm a browser-rendered form smoke test was completed on the live URL. " +
        "A curl/API test does not catch Alpine rendering bugs, CSP violations, or JS event-binding errors. " +
        "Open the live URL in a real browser, fill the form, click submit, and assert the success state is visible. " +
        "Record the result in README.md or engineering/PRODUCTION_READINESS.md.",
      primaryDoc,
    ),
  );
}

// ── Done state guard ──────────────────────────────────────────────────────────
if (landingStatus === "succeeded" && /\b(TODO|TBD|unknown|placeholder|pending)\b/i.test(combinedText)) {
  issues.push(
    issue(
      "error",
      "landing_funnel.placeholder_complete",
      "Landing lane is marked done but docs contain TODO/TBD/unknown/placeholder/pending language. " +
        "Resolve all placeholders before marking the landing lane done.",
      primaryDoc,
    ),
  );
}

// ── GEO/SEO: robots.txt, llms.txt, sitemap ───────────────────────────────────
const publicRoots = ["public", "static", "dist", "out", "."];
function findStaticFile(filename: string): boolean {
  return publicRoots.some((root) => existsSync(path.join(args.root, root, filename)));
}

if (!findStaticFile("robots.txt")) {
  issues.push(
    issue(
      "error",
      "landing_funnel.geo_seo.robots_txt.missing",
      "robots.txt is missing from the public directory. AI and search crawlers need explicit access rules. See knowledge/growth/geo-seo.md section 5.",
      "public/robots.txt",
    ),
  );
}

if (!findStaticFile("llms.txt")) {
  issues.push(
    issue(
      "error",
      "landing_funnel.geo_seo.llms_txt.missing",
      "llms.txt is missing. Add it so AI answer engines can discover and cite the product. See knowledge/growth/geo-seo.md section 1 (geo-llmstxt skill).",
      "public/llms.txt",
    ),
  );
}

if (!findStaticFile("sitemap.xml")) {
  issues.push(
    issue(
      "error",
      "landing_funnel.geo_seo.sitemap.missing",
      "sitemap.xml is missing from the public directory. Required for search-engine discovery.",
      "public/sitemap.xml",
    ),
  );
}

// ── GEO/SEO: JSON-LD parseability ────────────────────────────────────────────
const htmlExtensions = new Set([".html", ".astro"]);
const htmlFiles = collectFiles(args.root, htmlExtensions);
const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

for (const filePath of htmlFiles) {
  const relativePath = path.relative(args.root, filePath);
  let fileText: string;
  try {
    fileText = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  jsonLdRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRegex.exec(fileText)) !== null) {
    const jsonContent = (match[1] ?? "").trim();
    try {
      JSON.parse(jsonContent);
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError);
      issues.push(
        issue(
          "error",
          "landing_funnel.geo_seo.json_ld.parse_error",
          `JSON-LD in ${relativePath} is not valid JSON: ${msg}. Invalid schema blocks structured-data rich results silently. See knowledge/growth/geo-seo.md section 4.`,
          relativePath,
        ),
      );
    }
  }
}

// ── Copy compliance scan ──────────────────────────────────────────────────────
// Patterns that have shipped to production and required founder corrections.
// Sourced from failure evidence in geo-seo-landing-copy-validators-absent.
const bannedCopyPatterns: Array<[RegExp, string, string]> = [
  [
    /top\s+\d+\s+(unlock|get|receive|earn|referr)/i,
    "landing_funnel.copy.ranked_cohort_claim",
    "Landing copy contains a ranked-cohort claim (e.g. 'Top 10 unlock', 'Top 100 referrers get'). Remove or ensure the waitlist system actively enforces the cutoff. See knowledge/growth/geo-seo.md section 4.",
  ],
  [
    /free\s+(first\s+year|lifetime|forever|always)\s+(of\s+)?(pro|premium|plus|access)/i,
    "landing_funnel.copy.unverified_free_tier_promise",
    "Landing copy promises free or lifetime access not reflected in revenue/REVENUE_OPS.md. Cross-check before shipping. See knowledge/growth/geo-seo.md section 4.",
  ],
  [
    /lifetime\s+(access|membership|pro|premium)/i,
    "landing_funnel.copy.lifetime_promise",
    "Landing copy promises lifetime access. Verify against revenue/REVENUE_OPS.md pricing and entitlement design. See knowledge/growth/geo-seo.md section 4.",
  ],
  [
    /tested\s+by\s+(applied\s+)?(performance\s+)?researcher/i,
    "landing_funnel.copy.unverified_authority_claim",
    "Landing copy includes an implied researcher/authority endorsement without a citable source. Remove or add a verifiable citation. See knowledge/growth/geo-seo.md section 4.",
  ],
  [
    /clinically\s+validated|clinically\s+proven|neuroscience.backed|scientifically\s+proven/i,
    "landing_funnel.copy.unverified_clinical_claim",
    "Landing copy includes a clinical/neuroscience claim. Remove or supply verifiable citations for legal review. See knowledge/growth/geo-seo.md section 4.",
  ],
  [
    /when\s+they\s+ship/i,
    "landing_funnel.copy.unshipped_feature_promise",
    "Landing copy promises a device/integration that has not shipped yet ('when they ship'). Move to a clearly labeled roadmap section or remove. See knowledge/growth/geo-seo.md section 4.",
  ],
  [
    /spots?\s+(are\s+)?(almost\s+)?gone|limited\s+(availability|spots?)/i,
    "landing_funnel.copy.unverified_scarcity_claim",
    "Landing copy uses scarcity language without a live enforcement mechanism. Remove or wire to real inventory logic. See knowledge/growth/geo-seo.md section 4.",
  ],
];

const landingCopyExtensions = new Set([".html", ".astro", ".jsx", ".tsx", ".mdx", ".svelte", ".vue"]);
const landingSourceFiles = collectFiles(args.root, landingCopyExtensions);
const alreadyFlaggedCodes = new Set<string>();

for (const filePath of landingSourceFiles) {
  const relativePath = path.relative(args.root, filePath);
  let srcText: string;
  try {
    srcText = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  for (const [pattern, code, message] of bannedCopyPatterns) {
    if (!alreadyFlaggedCodes.has(code) && pattern.test(srcText)) {
      issues.push(issue("error", code, `${message} [found in ${relativePath}]`, relativePath));
      alreadyFlaggedCodes.add(code); // one issue per pattern across the whole repo is enough signal
    }
  }
}

// ── Landing motion craft (knowledge/design/landing-motion-craft.md) ────────────────
// Cinematic and GEO/perf-safe is not a tradeoff; when landing sources animate,
// the progressive-enhancement contract is enforceable:

const motionSourceExtensions = new Set([".html", ".astro", ".jsx", ".tsx", ".mdx", ".svelte", ".vue", ".css", ".ts"]);
const allMotionTexts: Array<{ relativePath: string; text: string }> = [];
for (const filePath of collectFiles(args.root, motionSourceExtensions)) {
  try {
    allMotionTexts.push({ relativePath: path.relative(args.root, filePath), text: readFileSync(filePath, "utf8") });
  } catch {
    continue;
  }
}
// Animated-source detection is scoped to the landing-shaped tree so an app's
// in-product animation elsewhere in the repo doesn't drag the landing gates in.
const motionTexts = allMotionTexts.filter(({ relativePath }) => /^(?:growth\/landing|public|app|src|components|pages|styles)\b/.test(relativePath));

/**
 * Animation detection avoids prose false-positives ("the transition: from X to
 * Y" in a doc) and catches JS-only animation: CSS-shaped declarations count
 * only in stylesheet-bearing files, everything else needs a library/JS marker.
 * `transition: none` is disabling motion, not animating.
 */
const cssAnimationMarker = /@keyframes|(?:^|[{;])\s*(?:animation|transition)(?:-[a-z-]+)?\s*:/m;
const jsAnimationMarker =
  /motion\/react|framer-motion|whileInView|useScroll|IntersectionObserver|\bgsap\b|\.animate\(|(?:transitionDuration|animationDuration|animationDelay)\s*:/;
const stylesheetExtensions = new Set([".css", ".html", ".astro", ".svelte", ".vue"]);
function isAnimated(relativePath: string, text: string): boolean {
  if (jsAnimationMarker.test(text)) {
    return true;
  }
  if (!stylesheetExtensions.has(path.extname(relativePath))) {
    return false;
  }
  const withoutDisables = text.replace(/(?:animation|transition)\s*:\s*none\b[^;{}]*/g, "");
  return cssAnimationMarker.test(withoutDisables);
}

const animatedSources = motionTexts.filter(({ relativePath, text }) => isAnimated(relativePath, text));

if (animatedSources.length > 0) {
  // 1. Reduced motion must collapse everything to the calm final state. The
  //    handling may live anywhere in the repo (styles/globals.css, a shared
  //    hook), so this presence scan is repo-wide, not landing-scoped.
  const hasReducedMotion = allMotionTexts.some(({ text }) => /prefers-reduced-motion|useReducedMotion/.test(text));
  if (!hasReducedMotion) {
    issues.push(
      issue(
        "error",
        "landing_funnel.motion.reduced_motion_missing",
        `Landing sources animate (${animatedSources[0]?.relativePath ?? "landing"}) but nothing handles prefers-reduced-motion/useReducedMotion. ` +
          "Every landing animation must collapse to its calm final state. See knowledge/design/landing-motion-craft.md.",
        animatedSources[0]?.relativePath,
      ),
    );
  }

  // 2. Real text, always: a static landing page that animates must still carry
  //    crawlable hero copy (an <h1> with visible text) in the HTML itself.
  const animatedHtml = animatedSources.filter(({ relativePath }) => relativePath.endsWith(".html"));
  const staticHeroPresent = animatedHtml.some(({ text }) => /<h1[^>]*>\s*[^<\s]/.test(text));
  if (animatedHtml.length > 0 && !staticHeroPresent) {
    issues.push(
      issue(
        "error",
        "landing_funnel.motion.hero_text_not_static",
        "Animated landing HTML has no <h1> with static text content — above-the-fold copy must exist in the HTML, never gated behind an animation " +
          "or injected by JavaScript. See knowledge/design/landing-motion-craft.md.",
        animatedHtml[0]?.relativePath,
      ),
    );
  }

  // 3. Tokens, not magic numbers: animation/transition durations should read
  //    the promoted --motion-* scale so one re-promotion retimes the brand.
  //    Both CSS declarations and camelCase style-object keys count.
  const rawDurationPattern =
    /(?:^|[{;])\s*(?:animation|transition)(?:-[a-z-]+)?\s*:[^;{}]*\b\d+(?:\.\d+)?m?s\b|(?:transitionDuration|animationDuration|animationDelay)\s*:\s*["']?\d+(?:\.\d+)?m?s\b/m;
  const untokenized = animatedSources.filter(({ text }) => rawDurationPattern.test(text) && !text.includes("var(--motion"));
  if (untokenized.length > 0) {
    issues.push(
      issue(
        landingStatus === "succeeded" ? "error" : "warning",
        "landing_funnel.motion.untokenized_duration",
        `Landing motion uses raw duration literals without the tokenized --motion-* scale (${untokenized[0]?.relativePath ?? "landing"}). ` +
          "Read durations and easings from design/system/tokens.css, promoted from DESIGN.md, so the brand retimes in one place. See knowledge/design/landing-motion-craft.md.",
        untokenized[0]?.relativePath,
      ),
    );
  }
}

// ── Waitlist idempotency ──────────────────────────────────────────────────────
const hasWaitlistSurface = landingSourceFiles.some((f) => {
  try {
    return /waitlist|join.+list|notify.+me/i.test(readFileSync(f, "utf8"));
  } catch {
    return false;
  }
});

if (hasWaitlistSurface) {
  const geoSeoText = readText(args.root, "GEO_SEO.md") ?? readText(args.root, "LAUNCH.md") ?? "";
  const hasIdempotencyNote =
    includes(combinedText, "idempotent") ||
    includes(combinedText, "duplicate email") ||
    includes(combinedText, "already signed up") ||
    includes(geoSeoText, "idempotent") ||
    includes(geoSeoText, "duplicate email");

  if (!hasIdempotencyNote) {
    issues.push(
      issue(
        "error",
        "landing_funnel.waitlist.idempotency_undocumented",
        "A waitlist surface exists but docs do not confirm duplicate-email idempotency (HTTP 200 for repeated submits). Add idempotency proof or a test note before marking the funnel ready. See knowledge/growth/geo-seo.md section 4.",
        primaryDoc,
      ),
    );
  }
}

reportAndExit("Landing funnel check", issues);
