/**
 * vibecode-tells.ts — the mechanically checkable TELLS list, extracted as a pure library.
 *
 * check-vibecoded-tells.ts owns scan-root resolution, symlink-containment auditing, and the
 * legal-navigation analysis (all of that stays a script, not a library — it reads argv and the
 * filesystem). This file owns only the part a second caller (the surface grader in
 * tooling/grade-design-surface.ts) also needs: which file extensions each tell scans, and how
 * to detect it. Moving it here is a pure extraction — check-vibecoded-tells.ts imports the same
 * TELLS array and extension sets it always evaluated inline, so its behavior is unchanged.
 *
 * knowledge/design/vibecoded-tells.md's own "Mechanical Detection" table lists a tenth code,
 * `vibecode.legal_links_missing`. It stays out of TELLS on purpose: it needs site-shape
 * detection and Markdown/MDX/JSX link-reachability analysis (checkLegalLinks in
 * check-vibecoded-tells.ts), not a per-file regex test, so it cannot be a pure function of one
 * file's source text the way every row here is.
 */
import type { Severity } from "../../../../../tooling/lib/launch-state.js";

export interface Tell {
  code: string;
  severity: Severity;
  /** Extensions this tell scans; a file outside the set never fires it. */
  extensions: Set<string>;
  detect: (source: string) => boolean;
  message: string;
}

const COMPONENT_EXTENSIONS = [".astro", ".mdx", ".svelte", ".vue"] as const;
export const MARKUP_EXTENSIONS = new Set([".tsx", ".jsx", ".html", ...COMPONENT_EXTENSIONS]);
export const CODE_EXTENSIONS = new Set([".tsx", ".jsx", ".ts", ".mts", ".js", ".mjs", ...COMPONENT_EXTENSIONS]);
export const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".tsx", ".jsx", ".ts", ".js", ".html", ...COMPONENT_EXTENSIONS]);
export const ALL_EXTENSIONS = new Set([...MARKUP_EXTENSIONS, ...CODE_EXTENSIONS, ...STYLE_EXTENSIONS]);

/**
 * Emoji-in-markup deliberately excludes ✓/✔ (the checkmark-wall rule owns those, and a
 * single checkmark is not a wall), ✨ (the sparkle rule owns it), and the ©/®/™ legal
 * marks Unicode also classifies as pictographic.
 */
const EMOJI_IN_MARKUP = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2764}\u{2B50}\u{2757}\u{2753}]/u;

export const TELLS: Tell[] = [
  {
    code: "vibecode.default_icon_pack",
    severity: "error",
    extensions: CODE_EXTENSIONS,
    detect: (source) => /(?:from\s+|require\(\s*)["'](?:lucide-react|lucide|@heroicons\/)/.test(source),
    message:
      "Default icon pack import (Lucide/Heroicons) — the never-earned tell in knowledge/design/vibecoded-tells.md §Tier 2. Derive an icon system from the brand's own shapes instead.",
  },
  {
    code: "vibecode.emoji_in_markup",
    severity: "warning",
    extensions: MARKUP_EXTENSIONS,
    detect: (source) => EMOJI_IN_MARKUP.test(source),
    message:
      "Emoji inside web-surface markup. Emoji as icons or heading decoration is a vibecoded tell; only an explicit strategy/BRAND.md voice claim earns emoji, and never as functional icons.",
  },
  {
    code: "vibecode.default_font",
    severity: "warning",
    extensions: STYLE_EXTENSIONS,
    detect: (source) => !source.includes("font-rationale:") && /["'](?:Inter|Geist|Space Grotesk)["']/.test(source),
    message:
      'Inter/Geist/Space Grotesk without a rationale — the corpus default standing in for a typography decision. Add a "font-rationale:" comment pointing at the DESIGN.md type derivation, or derive a face.',
  },
  {
    code: "vibecode.indigo_purple_gradient",
    severity: "warning",
    extensions: STYLE_EXTENSIONS,
    detect: (source) =>
      /\bfrom-(?:indigo|violet|purple)-\d{2,3}\b[\s\S]{0,120}?\bto-(?:indigo|violet|purple|fuchsia)-\d{2,3}\b/.test(source) ||
      /gradient\([^)]*(?:#6366f1|#4f46e5|#818cf8)[^)]*(?:#7c3aed|#8b5cf6|#a855f7|#c084fc)/i.test(source) ||
      /gradient\([^)]*(?:#7c3aed|#8b5cf6|#a855f7|#c084fc)[^)]*(?:#6366f1|#4f46e5|#818cf8)/i.test(source),
    message:
      "Indigo-to-purple gradient — the documented statistical default of AI-generated pages. Earned only when the palette derivation names the gradient's role and its brand hues.",
  },
  {
    code: "vibecode.glassmorphism",
    severity: "warning",
    extensions: STYLE_EXTENSIONS,
    detect: (source) => /backdrop-blur|backdrop-filter\s*:/.test(source),
    message:
      "Glassmorphism (backdrop blur) — a borrowed costume outside its category. Earned by fintech-dashboard convention with a disciplined accent; record the derivation or remove it.",
  },
  {
    code: "vibecode.decorative_blob",
    severity: "warning",
    extensions: STYLE_EXTENSIONS,
    detect: (source) => /(?:blur-2xl|blur-3xl|filter\s*:\s*blur\()/.test(source) && /(?:rounded-full|radial-gradient)/.test(source),
    message:
      "Blurred radial orb / blob shapes — decorative filler for undecided space. Replace with product truth or nothing (knowledge/design/vibecoded-tells.md §Tier 2).",
  },
  {
    code: "vibecode.sparkle_icon",
    severity: "warning",
    extensions: ALL_EXTENSIONS,
    detect: (source) => /✨/.test(source) || /\bsparkles?[-_]?icon\b/i.test(source) || /name=["']sparkles?["']/i.test(source),
    message: 'Sparkle icon — the generic "AI" costume. Derive the brand system\'s own marker for generated content instead.',
  },
  {
    code: "vibecode.checkmark_wall",
    severity: "warning",
    extensions: MARKUP_EXTENSIONS,
    detect: (source) => (source.match(/[✓✔✅]/g) ?? []).length >= 3,
    message: "Checkmark bullet wall — feature-dump formatting that replaces persuasion. Keep short, verified capability lists; never the page's main argument.",
  },
  {
    code: "vibecode.bouncing_cue",
    severity: "warning",
    extensions: STYLE_EXTENSIONS,
    detect: (source) => /animate-bounce/.test(source) || /@keyframes\s+bounce\b/.test(source),
    message: "Bounce-animated arrow / scroll cue — motion that begs instead of guiding. Route the cue through the landing motion doctrine or remove it.",
  },
];
