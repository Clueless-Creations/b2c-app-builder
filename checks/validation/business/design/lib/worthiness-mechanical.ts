/**
 * worthiness-mechanical.ts — the Mechanical tier of knowledge/design/design-worthiness.md,
 * extracted as pure functions so check-design-worthiness.ts and the new surface grader
 * (tooling/grade-design-surface.ts) share one source of truth instead of two copies of the
 * same regex and token-scale walk.
 *
 * design-worthiness.md's own "Three tiers" section draws the line this file follows: Mechanical
 * rules are the ones "a validator may assert pass or fail" with no judgment call — the WCAG
 * contrast floor (rule 4) and the declared type/space scale (rule 3). Attested rules (one
 * primary emphasis, hierarchy) and the Taste tier (rule 10) need DESIGN.md section parsing and
 * project state, and stay inside check-design-worthiness.ts; extracting them would pull this
 * "pure functions only" module into the file-reading, Markdown-table-parsing machinery it is
 * deliberately kept out of.
 *
 * This is a pure move: check-design-worthiness.ts calls these functions in the exact place its
 * inline blocks used to sit, so its issue output is unchanged.
 */
import { existsSync, readFileSync } from "node:fs";
import { getToken, rel } from "../../../../../tooling/lib/design-state.js";
import { collectFiles, getPath, isRecord, issue, type Issue } from "../../../../../tooling/lib/launch-state.js";
import { contrastRatio, isDarkBackground } from "../color-contrast.js";

export const AA_BODY = 4.5;
export const AA_LARGE = 3;
export const APCA_PROXY = 7;
export const HAIRLINE_PX = new Set([0, 1, 2]);

/**
 * design-worthiness.md rule 4, Contrast floor. Body text needs WCAG AA (4.5:1); large text and
 * UI accents need 3:1; a dark background that only clears AA gets an APCA/AAA (7:1) warning,
 * since dark body text at exactly the AA floor is itself a design signal worth a second look.
 * Returns no issues when the token record is missing or malformed — the caller's own
 * `design.issues` already reports that.
 */
export function checkContrastMechanical(tokens: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!tokens || !isRecord(tokens)) return issues;

  const background = String(getToken(tokens, "color.background") ?? "");
  const text = String(getToken(tokens, "color.text") ?? "");
  const primary = String(getToken(tokens, "color.primary") ?? "");

  const textRatio = contrastRatio(text, background);
  if (textRatio !== undefined && textRatio < AA_BODY) {
    issues.push(
      issue(
        "error",
        "worthiness.contrast_text",
        `color.text on color.background is ${textRatio.toFixed(2)}:1. WCAG AA body text needs at least 4.5:1.`,
        "DESIGN.md",
      ),
    );
  } else if (textRatio !== undefined && isDarkBackground(background) && textRatio < APCA_PROXY) {
    issues.push(
      issue(
        "warning",
        "worthiness.apca_dark_body",
        `Dark color.background with body contrast ${textRatio.toFixed(2)}:1 meets AA but not the 7:1 APCA/AAA design signal.`,
        "DESIGN.md",
      ),
    );
  }

  const primaryRatio = contrastRatio(primary, background);
  if (primaryRatio !== undefined && primaryRatio < AA_LARGE) {
    issues.push(
      issue(
        "error",
        "worthiness.contrast_primary",
        `color.primary on color.background is ${primaryRatio.toFixed(2)}:1. Large text and UI accents need at least 3:1.`,
        "DESIGN.md",
      ),
    );
  }

  return issues;
}

/**
 * design-worthiness.md rule 3, Declared type and space scale. Every raw pixel value in a
 * rendered proof (design/proofs/**\/*.html|.css) must trace back to a declared space, font-size,
 * or type-scale token step; hairline borders (0/1/2px) are exempt because they are not a scale
 * decision. `proofsRoot` and `tokens` are passed in rather than re-derived so the caller decides
 * what "the DESIGN.md tokens" and "the proofs directory" mean for its own workspace.
 */
export function checkTokenScaleMechanical(root: string, tokens: unknown, proofsRoot: string): Issue[] {
  const issues: Issue[] = [];
  const tokenPxAllowlist = tokenPxSteps(tokens);
  if (!existsSync(proofsRoot) || tokenPxAllowlist.size === 0) return issues;

  const proofFiles = collectFiles(proofsRoot, new Set([".html", ".css"]));
  for (const filePath of proofFiles) {
    const source = readFileSync(filePath, "utf8");
    const rawPx = [...source.matchAll(/(?:^|[^\w-])(\d+(?:\.\d+)?)px\b/giu)].map((match) => Number.parseFloat(match[1]!));
    const outsiders = [...new Set(rawPx.filter((value) => Number.isFinite(value) && !HAIRLINE_PX.has(value) && !tokenPxAllowlist.has(value)))];
    if (outsiders.length > 0) {
      issues.push(
        issue(
          "error",
          "worthiness.scale_raw_px",
          `${rel(root, filePath)} uses pixel values outside the token scale: ${outsiders.join(", ")}px.`,
          rel(root, filePath),
        ),
      );
    }
  }
  return issues;
}

/** Collects every declared px step from the space, font.size, and type token groups. */
export function tokenPxSteps(tokens: unknown): Set<number> {
  const values = new Set<number>();
  if (!tokens || !isRecord(tokens)) return values;
  walkTokens(getToken(tokens, "space") ?? getPath(tokens, "tokens.space"), values);
  walkTokens(getToken(tokens, "font.size") ?? getPath(tokens, "tokens.font.size"), values);
  walkTokens(getToken(tokens, "type") ?? getPath(tokens, "tokens.type"), values);
  return values;
}

function walkTokens(value: unknown, values: Set<number>): void {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
    if (match) values.add(Number.parseFloat(match[1]!));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkTokens(item, values);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) walkTokens(item, values);
  }
}
