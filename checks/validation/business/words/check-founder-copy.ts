#!/usr/bin/env node
/**
 * check-founder-copy.ts — no raw machine value reaches a founder.
 *
 * This gate exists because the founder-facing dashboard used to print
 * state/business-state.json keys straight into HTML, so a founder read rows like
 * "paid_tool_routing | not_started" on their own business dashboard. The fix was a
 * translation layer (tooling/lib/founder-copy.ts). This gate is what stops the fix from
 * rotting the next time someone adds a lane, a status, a phase, or a provider route.
 *
 * Four rules:
 *
 * 1. COVERAGE. Every lane, status, phase, and autonomy mode in lib/launch-state.ts has
 *    founder copy in lib/founder-copy.ts. A new lane cannot ship unlabeled.
 * 2. NO RAW IDENTIFIERS. No snake_case token, SCREAMING_SNAKE token, or pipe-delimited
 *    multi-segment value appears in founder-visible text. Text inside a clearly marked
 *    technical-details disclosure is exempt, because that block is explicitly for
 *    whoever picks the repo up next rather than for the founder.
 * 3. NO INTERNAL VOCABULARY. The words in bannedFounderVocabulary do not appear in
 *    founder-visible prose. Each one has a plain-language replacement recorded next to
 *    it, so a failure tells the author what to say instead.
 * 4. THE EXPERIENCE-CARD NAMES ARE NOT TRANSLATED. Rules 1–3 all push toward inventing a
 *    friendlier word; for the twelve technique names that would be wrong, and rule 4 is
 *    the record of that decision. It holds the umbrella phrase in the lane blurb a
 *    founder reads, keeps the HIGH-risk set the founder attests to tied to the tiers the
 *    card stubs declare, and rejects any attempt to ban a technique name outright.
 *
 * Scanning is deliberately text-only: HTML attributes (where `class="status
 * not_started"` legitimately carries the enum), <style> and <script> bodies, markdown
 * code fences, and inline code spans are stripped before the scan. Identifiers belong in
 * those places; they do not belong in a sentence a founder reads.
 *
 * npm script: check:founder-copy
 * Usage: tsx checks/validation/business/words/check-founder-copy.ts --root /path/to/templates [--skill-root /path/to/skill]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  asString,
  flagString,
  getPath,
  isPastOrientPhase,
  isRecord,
  issue,
  parseFlags,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";
import { attestedTechniques, bannedFounderVocabulary, coverageGaps, experienceCardUmbrella, milestones } from "../../../../tooling/lib/founder-copy.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--root"], key: "root" },
  { flags: ["--skill-root"], key: "skillRoot" },
]);
const root = path.resolve(flagString(flags, "root") ?? path.join(defaultSkillRoot, "business"));
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const issues: Issue[] = [];

/**
 * Founder-visible surfaces. These are the files a founder actually opens, so they carry
 * the strictest copy rules in the repo.
 */
const founderSurfaces: { relative: string; kind: "html" | "markdown" }[] = [
  { relative: "operations/BUSINESS_ACCESS.md", kind: "markdown" },
  { relative: "design/design-room.html", kind: "html" },
  { relative: "product/onboarding.html", kind: "html" },
  { relative: "analytics/analytics-plan.html", kind: "html" },
  { relative: "trust/security-review.html", kind: "html" },
  { relative: "store/store-console.html", kind: "html" },
];

/**
 * Tokens that legitimately appear in founder-visible prose despite matching an
 * identifier shape. Every entry needs a reason, in keeping with house culture.
 */
const allowedTokens = new Map<string, string>([
  ["robots.txt", "a real filename a founder will see referenced in SEO work"],
  ["llms.txt", "a real filename a founder will see referenced in AI-crawler work"],
  ["sitemap.xml", "a real filename a founder will see referenced in SEO work"],
  ["security.txt", "a published file at a public URL"],
  ["app-ads.txt", "a published file at a public URL"],
  ["BUSINESS_ACCESS.md", "the founder's own access document, named in its own heading"],
  ["state/business-state.json", "named in continuity prose that a founder may hand to another agent"],
  ["package.json", "a real filename in setup instructions"],
  ["Info.plist", "a real Apple filename in submission instructions"],
  ["2FA", "a term founders already know"],
]);

/** Words allowed despite matching a banned term, because the phrase means something else. */
const vocabularyExemptions = new Map<string, RegExp[]>([
  ["gate", [/\bdelegate/i, /\bgateway/i, /\bmitigate/i, /\baggregate/i, /\bnavigate/i, /\binvestigate/i]],
  ["lane", [/\bplane\b/i, /\bplanet/i, /\bexplanet/i]],
  ["proof", [/\bproofread/i, /\bfoolproof/i, /\bwaterproof/i, /\bbulletproof/i]],
]);

// ---------------------------------------------------------------------------
// Rule 1: coverage
// ---------------------------------------------------------------------------

for (const gap of coverageGaps()) {
  issues.push(
    issue(
      "error",
      `founder_copy.missing_${gap.vocabulary.replace(/\s+/g, "_")}`,
      `tooling/lib/founder-copy.ts has no founder-visible label for these ${gap.vocabulary}: ${gap.missing.join(", ")}. Add a label in the same commit that adds the value.`,
      "tooling/lib/founder-copy.ts",
    ),
  );
}

if (milestones.length < 5 || milestones.length > 12) {
  issues.push(
    issue(
      "error",
      "founder_copy.milestone_count",
      `The founder progress view has ${milestones.length} milestones. Keep it between 5 and 12 — fewer says nothing, more is the 22-row table again under a new name.`,
      "tooling/lib/founder-copy.ts",
    ),
  );
}

/**
 * The dictionary as text, not as an import. Every rule below reads the source under
 * --skill-root rather than the module this gate itself imports, which is the only way a
 * fixture can hand the gate a broken dictionary and prove the rule can fail.
 */
const founderCopySource = readFileSync(path.join(skillRoot, "tooling/lib/founder-copy.ts"), "utf8");

for (const beatPhase of ["phase_1", "phase_2", "phase_3b", "phase_6"]) {
  const found = founderCopySource.includes(`phase: "${beatPhase}"`);
  if (!found) {
    issues.push(
      issue(
        "error",
        "founder_copy.celebration_beat_missing",
        `No progress beat is recorded for ${beatPhase}. A founder should hear when a real milestone lands, not only when something is required of them.`,
        "tooling/lib/founder-copy.ts",
      ),
    );
  }
}

// A project past orientation needs a current founder-facing narrative.
const statePath = path.join(root, "state/business-state.json");
if (existsSync(statePath)) {
  try {
    const state: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    const phase = asString(getPath(state, "project.phase")) ?? "";
    const projectName = (asString(getPath(state, "project.name")) ?? "").trim();
    if (isPastOrientPhase(phase)) {
      if (/^(app name|untitled app|your app|project name|tbd|todo)$/i.test(projectName)) {
        issues.push(
          issue(
            "error",
            "founder_copy.template_project_name",
            `project.name still contains template text (${projectName || "blank"}) after setup. Record the working name before presenting the status as current.`,
            "state/business-state.json",
          ),
        );
      }

      for (const field of ["sinceLastTime", "rightNow", "yourCall"] as const) {
        const value = (asString(getPath(state, `narrative.${field}`)) ?? "").trim();
        if (value.length === 0 || /^(todo|tbd|n\/a|placeholder|\.\.\.)$/i.test(value)) {
          issues.push(
            issue(
              "error",
              `founder_copy.narrative_stale.${field}`,
              `narrative.${field} is empty or placeholder text while the project is past orient (${phase}). ` +
                `The narrated update is the founder's first read on current work — write what actually happened, in plain language.`,
              "state/business-state.json",
            ),
          );
        }
      }

      const narrativeValues = ["sinceLastTime", "rightNow", "yourCall"]
        .map((field) => ({ field, value: (asString(getPath(state, `narrative.${field}`)) ?? "").trim() }))
        .filter((entry) => entry.value.length >= 20);
      for (let left = 0; left < narrativeValues.length; left += 1) {
        for (let right = left + 1; right < narrativeValues.length; right += 1) {
          if (normalizeSentence(narrativeValues[left]!.value) !== normalizeSentence(narrativeValues[right]!.value)) continue;
          issues.push(
            issue(
              "error",
              "founder_copy.repeated_update",
              `narrative.${narrativeValues[left]!.field} and narrative.${narrativeValues[right]!.field} repeat the same update. Use one concrete sentence for what changed, one for what happens next, and one current founder action.`,
              "state/business-state.json",
            ),
          );
        }
      }
    }

    const tools = isRecord(getPath(state, "providers")) ? (getPath(state, "providers") as Record<string, unknown>) : {};
    for (const [name, value] of Object.entries(tools)) {
      const record = isRecord(value) ? value : {};
      const explicitStatus = (asString(record.connectionStatus) ?? asString(record.status) ?? "").toLowerCase();
      const route = (asString(record.accessRoute) ?? "").toLowerCase();
      const connected = ["active", "connected", "done", "ready", "verified"].includes(explicitStatus);
      const waiting = ["blocked", "access_pending", "founder_action_needed"].includes(explicitStatus) || route.includes("blocked");
      if (connected && waiting) {
        issues.push(
          issue(
            "error",
            "founder_copy.connected_tool_contradiction",
            `${name} is recorded as connected but its route is still blocked. Reconcile the service state before reporting it to the founder.`,
            "state/business-state.json",
          ),
        );
      }
    }
  } catch {
    // Malformed state is validate-project-state's finding, not this gate's.
  }
}

// ---------------------------------------------------------------------------
// Rule 4: the experience-card naming decision
//
// The twelve technique names are deliberately NOT translated (see the reasoning on
// experienceCardUmbrella in tooling/lib/founder-copy.ts). A decision to leave
// something alone rots faster than a decision to change it, because nothing in the
// tree records that the absence was chosen. These three rules are that record.
//
// Skipped when the card stubs are not present — a business repo does not vendor the
// playbook, and the founder-copy half of the rule has nothing to compare against.
// ---------------------------------------------------------------------------

const cardStubDir = path.join(skillRoot, "knowledge/experience/experience-cards");

if (existsSync(cardStubDir)) {
  const stubs = readdirSync(cardStubDir)
    .filter((name) => name.endsWith("-card.md"))
    .sort()
    .map((name) => {
      const source = readFileSync(path.join(cardStubDir, name), "utf8");
      return {
        // The filename minus "-card" is the technique's id everywhere it is addressed:
        // the Retention Mechanics MCP key, the stub path, and the routing link.
        id: name.replace(/-card\.md$/, ""),
        name: (/^#\s+(.+?)\s+Card\s*$/m.exec(source)?.[1] ?? "").trim(),
        tier: (/^\*\*Risk tier\.\*\*\s*([A-Za-z]+)/m.exec(source)?.[1] ?? "").toUpperCase(),
      };
    });

  // 4a. attestedTechniques is the founder-facing half of the HIGH tier. If a card is
  // promoted to HIGH in its stub and this list is not updated, a founder would attest
  // to a mechanic whose name the copy layer no longer pins.
  const highIds = stubs
    .filter((stub) => stub.tier === "HIGH")
    .map((stub) => stub.id)
    .sort();
  const attestedIds = attestedTechniques.map((technique) => technique.id).sort();
  if (highIds.join(",") !== attestedIds.join(",")) {
    issues.push(
      issue(
        "error",
        "founder_copy.attested_technique_drift",
        `attestedTechniques lists ${attestedIds.join(", ") || "nothing"} but the card stubs tier ${highIds.join(", ") || "nothing"} as HIGH. ` +
          `A founder attests to the HIGH-risk techniques by name — the two lists are one decision and must move together.`,
        "tooling/lib/founder-copy.ts",
      ),
    );
  }

  // 4b. Banning a technique name is how the aliasing decision would be reversed by
  // accident: bannedFounderVocabulary's contract is "say this instead", so an entry
  // here forces a euphemism onto exactly the surfaces that must not have one.
  const techniqueNames = new Set(
    [...stubs.map((stub) => stub.name), ...attestedTechniques.map((technique) => technique.name)].filter(Boolean).map((name) => name.toLowerCase()),
  );
  for (const { term } of bannedFounderVocabulary) {
    if (!techniqueNames.has(term.toLowerCase())) continue;
    issues.push(
      issue(
        "error",
        "founder_copy.technique_alias_banned",
        `"${term}" is an experience-card technique name and cannot be banned founder vocabulary. These twelve are terms of art and live MCP keys, ` +
          `so a "say instead" entry would mint a second vocabulary for one concept. Use the umbrella phrase for the deck as a whole instead.`,
        "tooling/lib/founder-copy.ts",
      ),
    );
  }
}

// 4c. The umbrella is only real if a founder meets it. Declaring the phrase as a constant
// proves nothing; it has to be in the emotional_design lane blurb, which is the row a
// founder actually reads when this part of the launch comes up. Read from source for the
// same reason as the beats above — an imported blurb cannot be varied by a fixture.
const emotionalBlurb = /emotional_design:\s*\{[\s\S]*?blurb:\s*"([^"]*)"/.exec(founderCopySource)?.[1] ?? "";
if (!emotionalBlurb.toLowerCase().includes(experienceCardUmbrella.toLowerCase())) {
  issues.push(
    issue(
      "error",
      "founder_copy.umbrella_unreachable",
      `The emotional_design lane blurb does not contain the umbrella phrase "${experienceCardUmbrella}". ` +
        `That blurb is where a founder meets this part of the launch as a whole — without it the twelve technique names have nothing to sit behind, ` +
        `and the deck reads as twelve unexplained psychology terms.`,
      "tooling/lib/founder-copy.ts",
    ),
  );
}

// ---------------------------------------------------------------------------
// Rules 2 and 3: scan founder-visible surfaces
// ---------------------------------------------------------------------------

for (const surface of founderSurfaces) {
  const absolute = path.join(root, surface.relative);
  if (!existsSync(absolute)) continue;
  const source = readFileSync(absolute, "utf8");
  const scannable = surface.kind === "html" ? founderVisibleHtmlText(source) : founderVisibleMarkdownText(source);

  for (const token of rawIdentifiers(scannable)) {
    issues.push(
      issue(
        "error",
        "founder_copy.raw_identifier",
        `"${token}" is a machine value in text a founder reads. Route it through tooling/lib/founder-copy.ts, or move it inside the technical-details disclosure.`,
        surface.relative,
      ),
    );
  }

  for (const { term, sayInstead } of bannedFounderVocabulary) {
    if (!containsTerm(scannable, term)) continue;
    issues.push(issue("error", "founder_copy.internal_vocabulary", `"${term}" appears in text a founder reads. Say instead: ${sayInstead}.`, surface.relative));
  }
}

reportAndExit("Founder copy", issues);

function normalizeSentence(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match renderer output without turning this validator into a second HTML renderer. */

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Founder-visible text from an HTML surface: drops style/script bodies, drops every tag
 * (so attributes never reach the scan), and drops any <details> block, which is the
 * sanctioned home for technical detail.
 */
function founderVisibleHtmlText(source: string): string {
  const stripped = source
    .replace(/<details[\s\S]*?<\/details>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // <code> marks a value AS an identifier, the same way backticks do in markdown. A
    // secret name a founder must paste into a provider belongs there; the same string
    // dropped into a sentence does not.
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    // Mustache placeholders are substituted before a founder ever sees the page.
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"');

  // A <script> body is dropped above as code, not prose -- but some pages (renderSourceArtifactPage
  // in tooling/lib/artifact-pages.ts) base64-embed real Markdown in a script and decode it
  // client-side into a target element by id, specifically so the *encoded* string in the source
  // never contains raw identifiers for the naive scan above to trip on. That decoded text is
  // exactly the founder-visible prose this gate exists to check, so decode it here too. A payload
  // whose target element sits inside the sanctioned <details> disclosure is exempt like any other
  // technical detail; one that lands outside it is scanned like any other founder-visible text.
  const detailsBlocks = source.match(/<details[\s\S]*?<\/details>/gi) ?? [];
  const decodedOutsideDetails = decodedScriptPayloads(source)
    .filter(({ elementId }) => !detailsBlocks.some((block) => block.includes(`id="${elementId}"`)))
    .map(({ text }) => text);

  return [stripped, ...decodedOutsideDetails].join(" ");
}

function decodedScriptPayloads(source: string): Array<{ elementId: string; text: string }> {
  const results: Array<{ elementId: string; text: string }> = [];
  for (const scriptMatch of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    const scriptBody = scriptMatch[1] ?? "";
    const base64 = /atob\(\s*"([A-Za-z0-9+/=]+)"\s*\)/.exec(scriptBody)?.[1];
    const elementId = /getElementById\(\s*"([^"]+)"\s*\)/.exec(scriptBody)?.[1];
    if (!base64 || !elementId) continue;
    try {
      results.push({ elementId, text: Buffer.from(base64, "base64").toString("utf8") });
    } catch {
      // Malformed base64 is not this gate's concern; whatever renders the page will fail first.
    }
  }
  return results;
}

/**
 * Founder-visible text from a markdown surface: drops fenced blocks, inline code spans,
 * link targets, and HTML comments. Identifiers inside backticks are how this repo names
 * real files and commands, so they are legitimate there.
 */
function founderVisibleMarkdownText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\]\([^)]*\)/g, "] ")
    .replace(/^\s{4,}\S.*$/gm, " ");
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Machine-shaped tokens found in founder-visible text, deduplicated and allowlisted. */
function rawIdentifiers(text: string): string[] {
  const found = new Set<string>();

  // snake_case and SCREAMING_SNAKE_CASE: two or more segments joined by underscores.
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g)) {
    const token = match[0];
    if (isAllowed(token)) continue;
    found.add(token);
  }

  // Pipe-delimited multi-segment values, e.g. "high | founder | open" — a serialized
  // record dropped into a sentence. Markdown table rows are excluded: a table is
  // structure a reader understands, not a value pretending to be prose.
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) continue;
    for (const match of trimmed.matchAll(/[^\n|]{2,60}\|[^\n|]{2,60}\|[^\n|]{2,60}/g)) {
      const token = match[0].trim().replace(/\s+/g, " ");
      if (/^[\s|:-]+$/.test(token)) continue;
      found.add(token.length > 80 ? `${token.slice(0, 77)}...` : token);
    }
  }

  return [...found];
}

function isAllowed(token: string): boolean {
  if (allowedTokens.has(token)) return true;
  // Allowlisted filenames are matched without their extension too, because the token
  // regex stops at the dot ("operations/BUSINESS_ACCESS.md" is scanned as "BUSINESS_ACCESS").
  return [...allowedTokens.keys()].some((allowed) => allowed.replace(/\.[A-Za-z0-9]+$/, "") === token);
}

/** Whole-word term match with per-term exemptions for words that merely contain it. */
function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escaped}([^A-Za-z0-9-]|$)`, "i");
  if (!pattern.test(text)) return false;
  const exemptions = vocabularyExemptions.get(term.toLowerCase());
  if (!exemptions) return true;
  // Re-test with exempt words removed, so "delegate" does not trip the "gate" rule.
  let stripped = text;
  for (const exemption of exemptions) {
    stripped = stripped.replace(new RegExp(exemption.source, "gi"), " ");
  }
  return pattern.test(stripped);
}
