#!/usr/bin/env node
/**
 * check-skill-supply-chain.ts — hidden-instruction scanner for skill, agent, and knowledge content.
 *
 * A file that reads clean to a human can still carry text an agent reads and a person does
 * not see: zero-width Unicode, a right-to-left override that reorders how a line renders, an
 * HTML comment holding a directive instead of a note, an oversized base64 blob, or a
 * curl-pipe-shell line bundled into a script. Each marker is deterministically greppable, and
 * unpinned third-party skill installs carry a documented, exploited supply-chain risk
 * (https://labs.zenity.io/post/attackers-target-agents-via-the-skill-supply-chain).
 *
 * Two modes:
 *   - Default (--skill-root): scans THIS skill's own governed surface — knowledge/**\/*.md,
 *     workspace/**\/*.md, catalog/**\/*.yaml (catalog/generated/ excluded, per AGENTS.md:
 *     generated projections are not in scope), and SKILL.md.
 *   - --pack-root <dir>: scans an arbitrary directory's full source tree instead — the shape
 *     a pre-install vet of a third-party skill pack needs, since a hidden instruction can live
 *     in a file the pack only loads at a later step, not only in its SKILL.md.
 *
 * Severity: an RTL override character or a curl-pipe-shell line is an error (either one can
 * make a reviewer's rendered view of a file lie about its own content). Every other marker is
 * a warning for manual review — each one has legitimate uses this repo's own content shows
 * (a template placeholder comment, a real content hash), so a machine match is a lead, not a
 * verdict.
 *
 * npm script: (not yet wired — see integration notes in the owning task)
 * Usage: tsx checks/validation/repository/check-skill-supply-chain.ts --skill-root <path> [--json]
 *        tsx checks/validation/repository/check-skill-supply-chain.ts --pack-root <path> [--json]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectAllFiles, collectFiles, flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { findGitRoot } from "../../../tooling/lib/git-root.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--pack-root"], key: "packRoot" },
]);
const packRoot = flagString(flags, "packRoot");
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const repoRoot = findGitRoot(skillRoot) ?? skillRoot;

const issues: Issue[] = [];

interface ScannedFile {
  displayPath: string;
  absolute: string;
}

function collectSkillSurface(): ScannedFile[] {
  const scanned: ScannedFile[] = [];

  function addMarkdown(baseRelative: string): void {
    const baseDir = path.join(skillRoot, baseRelative);
    if (!existsSync(baseDir) || !statSync(baseDir).isDirectory()) return;
    for (const absolute of collectFiles(baseDir, new Set([".md"]))) {
      scanned.push({ displayPath: path.relative(repoRoot, absolute).split(path.sep).join("/"), absolute });
    }
  }

  function addYaml(baseRelative: string): void {
    const baseDir = path.join(skillRoot, baseRelative);
    if (!existsSync(baseDir) || !statSync(baseDir).isDirectory()) return;
    for (const absolute of collectFiles(baseDir, new Set([".yaml", ".yml"]))) {
      const relativeToBase = path.relative(baseDir, absolute).split(path.sep).join("/");
      // catalog/generated/** is a rendered projection, not authored content (AGENTS.md: never
      // propose edits there) — excluded the same way it is out of scope for every other audit.
      if (relativeToBase.split("/")[0] === "generated") continue;
      scanned.push({ displayPath: path.relative(repoRoot, absolute).split(path.sep).join("/"), absolute });
    }
  }

  addMarkdown("knowledge");
  addMarkdown("examples/workspace");
  addYaml("catalog");

  const skillMd = path.join(skillRoot, "SKILL.md");
  if (existsSync(skillMd)) {
    scanned.push({ displayPath: path.relative(repoRoot, skillMd).split(path.sep).join("/"), absolute: skillMd });
  }

  return scanned;
}

function collectPackSurface(root: string): ScannedFile[] {
  // A pre-install vet reads the pack's full source tree, not a curated file-type allowlist —
  // a malicious instruction can live in a file the pack only loads at a later step.
  return collectAllFiles(root).map((absolute) => ({ displayPath: path.relative(root, absolute).split(path.sep).join("/"), absolute }));
}

const files: ScannedFile[] = packRoot !== undefined ? collectPackSurface(path.resolve(packRoot)) : collectSkillSurface();

// ---------------------------------------------------------------------------
// Marker 1: invisible / bidi-control characters
// ---------------------------------------------------------------------------

/**
 * U+202D LRO and U+202E RLO can reorder how a line renders without changing its bytes — the
 * Trojan Source technique. Treated as an error: a reviewer's rendered view of the file can no
 * longer be trusted to match its content. Written as \u{} escapes, not the literal characters,
 * so this file's own source never carries the invisible/directional characters it scans for.
 */
const RTL_OVERRIDE = /[\u{202D}\u{202E}]/gu;

/**
 * Zero-width spacing/joining characters and the bidi embed/isolate controls (as opposed to the
 * overrides above) can hide a whole run of text from a normal read without altering render
 * order as visibly. Warning tier: these have rare legitimate uses (a BOM at a file's own start,
 * a ZWJ inside an emoji sequence) this scan does not try to distinguish.
 */
const HIDDEN_CHARACTER = /[\u{200B}\u{200C}\u{200D}\u{2060}\u{FEFF}\u{202A}\u{202B}\u{202C}\u{2066}\u{2067}\u{2068}\u{2069}]/gu;

const CODEPOINT_NAME: Record<number, string> = {
  0x200b: "ZERO WIDTH SPACE",
  0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER",
  0x2060: "WORD JOINER",
  0xfeff: "ZERO WIDTH NO-BREAK SPACE (BOM)",
  0x202a: "LEFT-TO-RIGHT EMBEDDING",
  0x202b: "RIGHT-TO-LEFT EMBEDDING",
  0x202c: "POP DIRECTIONAL FORMATTING",
  0x202d: "LEFT-TO-RIGHT OVERRIDE",
  0x202e: "RIGHT-TO-LEFT OVERRIDE",
  0x2066: "LEFT-TO-RIGHT ISOLATE",
  0x2067: "RIGHT-TO-LEFT ISOLATE",
  0x2068: "FIRST STRONG ISOLATE",
  0x2069: "POP DIRECTIONAL ISOLATE",
};

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

function checkInvisibleCharacters(file: ScannedFile, text: string): void {
  const overrideMatches = [...text.matchAll(RTL_OVERRIDE)];
  const overrideLines = new Set(overrideMatches.map((m) => lineOf(text, m.index ?? 0)));
  for (const matchLine of overrideLines) {
    issues.push(
      issue(
        "error",
        "supply_chain.rtl_override",
        `Right-to-left/left-to-right override character (U+202D or U+202E) at line ${matchLine} can reorder how this line renders without changing its bytes.`,
        file.displayPath,
      ),
    );
  }

  const hiddenMatches = [...text.matchAll(HIDDEN_CHARACTER)];
  const seenPerCodepoint = new Set<string>();
  for (const match of hiddenMatches) {
    const codepoint = match[0].codePointAt(0) ?? 0;
    const matchLine = lineOf(text, match.index ?? 0);
    const dedupeKey = `${codepoint}:${matchLine}`;
    if (seenPerCodepoint.has(dedupeKey)) continue;
    seenPerCodepoint.add(dedupeKey);
    const name = CODEPOINT_NAME[codepoint] ?? `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`;
    issues.push(
      issue(
        "warning",
        "supply_chain.hidden_character",
        `Invisible character (${name}, U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}) at line ${matchLine}. Confirm it is intentional (e.g. inside an emoji sequence), not text hidden from a normal read.`,
        file.displayPath,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Marker 2: an HTML comment holding a directive, not a note
// ---------------------------------------------------------------------------

/**
 * This repo's own content carries many legitimate HTML comments — a template placeholder
 * ("<!-- e.g. 7 days -->"), a fill-in-later TODO, an editorial routing note. None of those
 * read as an instruction addressed to the agent reading the file. This list stays narrow and
 * signal-specific — known prompt-injection phrasing — rather than a broad imperative-verb
 * heuristic, which would flag this repo's own template comments ("Record...", "Confirm...",
 * "Fill in...") as often as it caught anything real.
 */
const SUSPICIOUS_COMMENT_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions?\b/i,
  /\bdisregard\s+(all\s+|the\s+)?(previous|prior|above)\b/i,
  /\bwithout\s+(telling|informing|alerting)\s+the\s+(user|founder)\b/i,
  /\bdo\s+not\s+(tell|inform|mention|reveal)\s+(the\s+user|this)\b/i,
  /\byou\s+are\s+now\s+(a|an)\b/i,
  /\bact\s+as\s+(if\s+you|though\s+you)\b/i,
  /\bnew\s+system\s+prompt\b/i,
  /\boverride\s+(your|the)\s+(instructions|guidelines|rules)\b/i,
  /\bjailbreak\b/i,
  /\bexfiltrate\b/i,
  /\bsend\s+(this|the|all)\s+(data|contents?|conversation|credentials?|secrets?)\s+to\b/i,
  /\bhidden\s+(instruction|prompt|directive)\b/i,
  /\bbase64[\s-]?decode\s+and\s+(run|execute|eval)\b/i,
];

function checkHtmlComments(file: ScannedFile, text: string): void {
  const commentPattern = /<!--([\s\S]*?)-->/g;
  let match: RegExpExecArray | null;
  while ((match = commentPattern.exec(text)) !== null) {
    const body = (match[1] ?? "").trim();
    if (body.length === 0 || body.startsWith("catalog-generated")) continue;
    if (!SUSPICIOUS_COMMENT_PATTERNS.some((pattern) => pattern.test(body))) continue;
    const matchLine = lineOf(text, match.index);
    const snippet = body.length > 160 ? `${body.slice(0, 160)}…` : body;
    issues.push(
      issue(
        "warning",
        "supply_chain.comment_directive",
        `HTML comment at line ${matchLine} reads as a directive to an agent, not an editorial note: "${snippet}"`,
        file.displayPath,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Marker 3: a long base64 run outside a hash context
// ---------------------------------------------------------------------------

const BASE64_RUN = /[A-Za-z0-9+/]{80,}={0,2}/g;
const HASH_CONTEXT = /(sha256|sha512|sha384|sha1|integrity|digest|checksum|hash)\s*[:=]\s*$/i;

function checkBase64(file: ScannedFile, text: string): void {
  let match: RegExpExecArray | null;
  BASE64_RUN.lastIndex = 0;
  while ((match = BASE64_RUN.exec(text)) !== null) {
    const run = match[0];
    // A run of hex digits only is far more likely a commit SHA or a hex-encoded content hash
    // than an encoded payload — base64 needs mixed case or +//= to be base64 at all.
    if (/^[0-9a-f]+$/i.test(run)) continue;
    const precedingText = text.slice(Math.max(0, match.index - 24), match.index);
    if (HASH_CONTEXT.test(precedingText)) continue;
    const matchLine = lineOf(text, match.index);
    issues.push(
      issue(
        "warning",
        "supply_chain.base64_blob",
        `Base64-shaped run of ${run.length} characters at line ${matchLine}, outside a hash/digest context. Confirm it is not an encoded payload.`,
        file.displayPath,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Marker 4: curl piped straight into a shell
// ---------------------------------------------------------------------------

const CURL_PIPE_SHELL = [/\bcurl\b[^\n`]*\|\s*(sudo\s+)?(ba|z)?sh\b/i, /\b(ba|z)?sh\s+<\(\s*curl\b/i, /\bwget\b[^\n`]*\|\s*(sudo\s+)?(ba|z)?sh\b/i];

function checkCurlPipeShell(file: ScannedFile, text: string): void {
  for (const pattern of CURL_PIPE_SHELL) {
    const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(text)) !== null) {
      const matchLine = lineOf(text, match.index);
      issues.push(
        issue(
          "error",
          "supply_chain.curl_pipe_shell",
          `Line ${matchLine} pipes a remote download straight into a shell — the command runs unread. Fetch and review the script, then run it, instead of piping it live.`,
          file.displayPath,
        ),
      );
    }
  }
}

for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file.absolute, "utf8");
  } catch {
    continue;
  }
  checkInvisibleCharacters(file, text);
  checkHtmlComments(file, text);
  checkBase64(file, text);
  checkCurlPipeShell(file, text);
}

reportAndExit(packRoot !== undefined ? `Skill supply-chain scan: ${packRoot}` : "Skill supply-chain scan", issues);
