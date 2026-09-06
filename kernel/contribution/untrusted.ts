import { DIRECTIVE_CATEGORIES, type SourceDirective } from "../../contracts/contribution/contract.js";
import { truncate } from "./manifest-io.js";

/**
 * Analysis of untrusted source text. Everything here reads fetched or inspected material and
 * returns data: sentences that read as instructions to an agent, hidden character sequences,
 * license classifications, copyright lines, and platform claims. Nothing here obeys, installs,
 * executes, or renders raw hidden characters back. A match is a record with action "refused".
 */
type DirectiveCategory = (typeof DIRECTIVE_CATEGORIES)[number];

const HIDDEN_MARKERS = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/u;

const DIRECTIVE_PATTERNS: ReadonlyArray<{ category: DirectiveCategory; pattern: RegExp }> = [
  {
    category: "install",
    pattern:
      /\b(?:npm|pnpm|yarn)\s+(?:i|install|add)\b|\bnpx\s+skills\s+add\b|\bbrew\s+install\b|\bpip3?\s+install\b|\bcargo\s+install\b|\bgem\s+install\b|\bapt(?:-get)?\s+install\b|\bcurl\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|\bwget\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/iu,
  },
  {
    category: "execute",
    pattern:
      /\brun\s+(?:the\s+)?(?:\.\/|`\.\/)?(?:setup|install|bootstrap|postinstall)[\w./-]*|\b(?:ba|z)?sh\s+(?:\.\/)?(?:setup|install|bootstrap)[\w./-]*\.sh\b|\bexecute\b|\bchmod\s+\+x\b|\bsource\s+(?:\.\/)?[\w./-]+\.(?:sh|env)\b|\bmake\s+install\b/iu,
  },
  {
    category: "overwrite-artifact",
    pattern:
      /\b(?:overwrite|overwriting|replace|replacing|create|creating|regenerate|rewrite|write)\b[^\n]*\b(?:DESIGN\.md|PRODUCT\.md|AGENTS\.md|CLAUDE\.md|\.mcp\.json)\b/iu,
  },
  {
    category: "configure-agent",
    pattern:
      /~\/\.claude\b|\bsettings(?:\.local)?\.json\b|\bregister\s+(?:this\s+|the\s+)?mcp\b|\badd\s+(?:this\s+|the\s+|an?\s+)?mcp\s+server\b|\bmcpServers\b|\bclaude_desktop_config\b|\.cursor\/mcp\.json|\.cursorrules\b|\bclaude\s+mcp\s+add\b/iu,
  },
  {
    category: "publish",
    pattern:
      /\bgit\s+push\b|\bpush\s+(?:to|this|the|your)\b|\bpublish\b|\bdeploy\b|\bpost\s+(?:to|it|this)\b|\brelease\s+(?:to|this)\b|\bsubmit\s+(?:to|this)\b/iu,
  },
  {
    category: "grant-permission",
    pattern:
      /\ballow\s+all\s+tools\b|--dangerously|\ballowed[-_]?tools\b|--yolo\b|\b(?:skip|bypass)\s+permissions?\b|\bauto[-\s]?approve\b|\bfull\s+disk\s+access\b/iu,
  },
  {
    category: "fetch-remote",
    pattern: /\bfetch\s+(?:the|from|this|it)\b|\bdownload\s+(?:from|the|this|it)\b|\bgit\s+clone\b|\b(?:curl|wget)\s+(?:-[\w-]+\s+)*https?:\/\//iu,
  },
];

const MAX_DIRECTIVES_PER_FILE = 120;

/** Remove hidden markers so recorded text never carries them back. */
export function stripHiddenMarkers(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/gu, "");
}

/** Sentences that read as instructions to an agent, and hidden character sequences. Each is refused data. */
export function scanDirectives(text: string, fileLabel: string): SourceDirective[] {
  const directives: SourceDirective[] = [];
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length && directives.length < MAX_DIRECTIVES_PER_FILE; index += 1) {
    const raw = lines[index] ?? "";
    const location = truncate(`${fileLabel}:${index + 1}`, 400);
    if (HIDDEN_MARKERS.test(raw)) directives.push({ text: "hidden character sequence", location, category: "other", action: "refused" });
    const line = stripHiddenMarkers(raw).trim();
    if (!line) continue;
    for (const { category, pattern } of DIRECTIVE_PATTERNS) {
      if (pattern.test(line)) directives.push({ text: truncate(line, 500), location, category, action: "refused" });
    }
  }
  return directives;
}

/** True when a setup script would run installs or remote fetches. It is classification only; nothing runs. */
export function looksLikeSetupScript(text: string): boolean {
  return /\b(?:npm|pnpm|yarn|brew|pip3?|cargo|gem|apt(?:-get)?)\s+(?:i|install|add)\b|\bcurl\b|\bwget\b|\binstall\b/iu.test(text);
}

/* ------------------------------------------------------------------------------------------ */
/* Rights                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export interface LicenseClassification {
  readonly spdx?: string;
  /** The copyright line exactly as written, when one exists. */
  readonly copyrightLine?: string;
  /** The holder named after the year, exactly as written. */
  readonly holder?: string;
}

/** Explicit string tests against well-known license texts. Unrecognized text stays unclassified. */
export function classifyLicenseText(text: string): LicenseClassification {
  const body = stripHiddenMarkers(text);
  const head = body.slice(0, 4000);
  const lower = head.toLowerCase();
  let spdx: string | undefined;
  if (lower.includes("permission is hereby granted, free of charge") || /^\s*(?:the\s+)?mit license/iu.test(head)) spdx = "MIT";
  else if (lower.includes("apache license") && lower.includes("version 2.0")) spdx = "Apache-2.0";
  else if (lower.includes("redistribution and use in source and binary forms")) {
    spdx = lower.includes("neither the name") ? "BSD-3-Clause" : "BSD-2-Clause";
  } else if (
    lower.includes("cc0") ||
    lower.includes("creative commons zero") ||
    lower.includes("creative commons legal code") ||
    lower.includes("public domain dedication")
  ) {
    spdx = "CC0-1.0";
  } else if (lower.includes("creative commons attribution") || /\bcc[- ]by\b/u.test(lower)) {
    spdx =
      lower.includes("noncommercial") || lower.includes("non-commercial")
        ? "CC-BY-NC-4.0"
        : lower.includes("sharealike") || lower.includes("share-alike")
          ? "CC-BY-SA-4.0"
          : "CC-BY-4.0";
  } else if (lower.includes("sil open font license")) spdx = "OFL-1.1";
  else if (lower.includes("gnu general public license")) spdx = lower.includes("version 3") ? "GPL-3.0-only" : "GPL-2.0-only";
  else if (lower.includes("mozilla public license")) spdx = "MPL-2.0";
  else if (lower.includes("the unlicense") || lower.includes("this is free and unencumbered software")) spdx = "Unlicense";
  const copyright = /copyright\s*(?:\(c\)|©)?\s*[^\n]*\d{4}[^\n]*/iu.exec(body);
  const copyrightLine = copyright ? truncate(copyright[0], 300) : undefined;
  const holderMatch = copyrightLine ? /\d{4}(?:\s*[-–,]\s*(?:\d{4}|present))?\s*(.+)$/u.exec(copyrightLine) : null;
  const holder = holderMatch?.[1]?.trim().replace(/[.,;]+$/u, "");
  return { spdx, copyrightLine, holder: holder || undefined };
}

/** A README that names a license without shipping its text. A badge or a sentence is a claim, not evidence. */
export function readmeLicenseClaim(text: string): string | undefined {
  const body = stripHiddenMarkers(text);
  const badge = /license[-_]([A-Za-z0-9.+_-]+?)[-_](?:blue|green|yellow|orange|red|lightgrey|brightgreen|informational)/iu.exec(body);
  if (badge?.[1]) return badge[1].replace(/_/gu, "-");
  const sentence = /(?:licensed under|released under|available under|distributed under)\s+(?:the\s+)?([A-Za-z0-9.+ -]{2,40}?)\s+license/iu.exec(body);
  if (sentence?.[1]) return sentence[1].trim();
  const heading = /^#+\s*licen[cs]e\s*\n+\s*([A-Za-z0-9.+ -]{2,40}?)(?:\s+licen[cs]e)?\s*$/imu.exec(body);
  return heading?.[1]?.trim();
}

/* ------------------------------------------------------------------------------------------ */
/* Claims and structure                                                                         */
/* ------------------------------------------------------------------------------------------ */

const APPLICABILITY_PATTERNS = [
  /\biOS\s*\d{1,2}(?:\.\d+)?\+?/gu,
  /\biPadOS\s*\d{1,2}(?:\.\d+)?\+?/gu,
  /\bmacOS\s*\d{1,2}(?:\.\d+)?\+?/gu,
  /\bwatchOS\s*\d{1,2}(?:\.\d+)?\+?/gu,
  /\bXcode\s*\d{1,2}(?:\.\d+)?\+?/gu,
  /\bSwift\s*\d(?:\.\d+)?\+?/gu,
  /\bAndroid\s*(?:API\s*)?\d{1,2}\+?/gu,
  /\bNode(?:\.js)?\s*\d{2}\+?/gu,
  /\bFlutter\s*\d(?:\.\d+)?\+?/gu,
  /\bReact Native\s*0\.\d{2}\+?/gu,
  /\bExpo(?: SDK)?\s*\d{2}\+?/gu,
  /\bKotlin\s*\d(?:\.\d+)?\+?/gu,
  /\bPython\s*3\.\d{1,2}\+?/gu,
  /\bTypeScript\s*\d(?:\.\d+)?\+?/gu,
];

/** Platform and toolchain claims that need a primary-source check before promotion. */
export function applicabilityClaims(text: string): string[] {
  const claims = new Set<string>();
  const body = stripHiddenMarkers(text);
  for (const pattern of APPLICABILITY_PATTERNS) {
    for (const match of body.matchAll(pattern)) claims.add(match[0].replace(/\s+/gu, " ").trim());
  }
  return [...claims].sort().slice(0, 12);
}

/** True when the text carries method or heuristics rather than a bare listing. */
export function carriesMethod(text: string): boolean {
  const body = stripHiddenMarkers(text);
  if (body.replace(/\s+/gu, " ").trim().length < 200) return false;
  const signals = body.match(
    /\b(?:should|must|never|always|prefer|avoid|rule|principle|heuristic|checklist|when|instead|because|why|tradeoff|pattern|anti-pattern)\b/giu,
  );
  return (signals?.length ?? 0) >= 3;
}

/** True when the text makes a measurable claim (a percentage, a benchmark, a before/after number). */
export function hasMeasurableClaim(text: string): boolean {
  return /\d+(?:\.\d+)?\s*%|\bbenchmark(?:s|ed)?\b|\bmeasured\b|\b(?:faster|slower|reduces?|improves?|increases?|drops?)\b[^\n]{0,40}\d/iu.test(
    stripHiddenMarkers(text),
  );
}

/** True when the text lays out an ordered step sequence with a review or repair policy. */
export function describesRecipe(text: string): boolean {
  const body = stripHiddenMarkers(text);
  const steps = body.match(/^\s*(?:\d+[.)]|step\s+\d+)/gimu)?.length ?? 0;
  return steps >= 3 && /\b(?:review|repair|retry|rollback|roll back|fix|recover|verify|acceptance)\b/iu.test(body);
}

/** True when the text expresses aesthetic or style preferences. */
export function carriesAesthetic(text: string): boolean {
  return /\b(?:palette|typography|typeface|font|color|colour|aesthetic|style|visual|motion|animation|spacing|radius|gradient|layout)\b/iu.test(
    stripHiddenMarkers(text),
  );
}
