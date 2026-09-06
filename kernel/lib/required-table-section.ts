export type RequiredTableSectionErrorKind =
  | "invalid-request"
  | "section-missing"
  | "section-duplicate"
  | "table-missing"
  | "table-duplicate"
  | "table-invalid"
  | "header-empty"
  | "header-duplicate"
  | "header-missing"
  | "unsupported-markdown";

export interface RequiredTableSectionError {
  readonly kind: RequiredTableSectionErrorKind;
  readonly message: string;
  readonly sourceLine?: number;
}

export interface SimplePipeTableRow {
  /** One-based source line in the full Markdown document. */
  readonly sourceLine: number;
  /** The source line without leading or trailing whitespace. */
  readonly raw: string;
  /** Trimmed cells in their authored order, without the boundary pipes. */
  readonly cells: readonly string[];
  /** Authored cell width. No missing cells are padded and no extra cells are dropped. */
  readonly rawCellCount: number;
}

export interface SimplePipeTableHeader extends SimplePipeTableRow {
  /** Case-folded, whitespace-collapsed header names in their authored order. */
  readonly normalizedCells: readonly string[];
}

export interface RequiredTableSection {
  readonly heading: string;
  /** One-based source line of the matching H2 heading. */
  readonly headingLine: number;
  /**
   * Raw lines after the matching heading and before the next rendered H2.
   * Fenced content remains present and unmodified.
   */
  readonly body: string;
  /** Rendered body lines in source order, joined with LF line endings. */
  readonly renderedBody: string;
  /** One-based, half-open source range occupied by `body`. */
  readonly bodyRange: {
    readonly startLine: number;
    readonly endLineExclusive: number;
  };
  readonly header: SimplePipeTableHeader;
  readonly separator: SimplePipeTableRow;
  readonly rows: readonly SimplePipeTableRow[];
  /** The header row's authored width. Data-row widths remain available on each row. */
  readonly width: number;
  /** Every normalized header name mapped to its zero-based column index. */
  readonly headerIndexes: ReadonlyMap<string, number>;
}

export type RequiredTableSectionResult =
  { readonly ok: true; readonly section: RequiredTableSection } | { readonly ok: false; readonly errors: readonly RequiredTableSectionError[] };

export type RenderedTopLevelStatusResult =
  | { readonly ok: true; readonly status: { readonly value: string; readonly sourceLine: number } }
  | { readonly ok: false; readonly kind: "missing" | "duplicate" | "malformed"; readonly sourceLines: readonly number[] };

interface ScannedLine {
  readonly raw: string;
  readonly sourceLine: number;
  readonly sourceOffset: number;
  readonly rendered: boolean;
}

interface Fence {
  readonly marker: "`" | "~";
  readonly length: number;
}

interface FenceCandidate {
  readonly marker: string;
  readonly trailing: string;
}

interface RawHtmlSyntax {
  readonly description: string;
}

interface UnsupportedMarkdownSyntax {
  readonly lineIndex: number;
  readonly sourceLine: number;
  readonly description: string;
}

interface MarkdownScan {
  readonly lines: readonly ScannedLine[];
  readonly unsupported: readonly UnsupportedMarkdownSyntax[];
}

/**
 * Read one rendered, unindented `Status: value` line without assigning any
 * business meaning to its value. Approved column-zero fenced examples stay
 * hidden. Unsupported document syntax and duplicate or malformed top-level
 * declarations fail closed.
 */
export function parseRenderedTopLevelStatus(markdown: string): RenderedTopLevelStatusResult {
  const scan = scanRenderedLines(markdown);
  if (scan.unsupported.length > 0) {
    return { ok: false, kind: "malformed", sourceLines: scan.unsupported.map((candidate) => candidate.sourceLine) };
  }
  const lines = scan.lines;
  const h1Index = lines.findIndex((line) => line.rendered && atxHeadingLevel(line.raw) === 1);
  if (h1Index < 0) return { ok: false, kind: "missing", sourceLines: [] };
  const nextHeadingOffset = lines.slice(h1Index + 1).findIndex((line) => line.rendered && atxHeadingLevel(line.raw) !== undefined);
  const preambleEnd = nextHeadingOffset < 0 ? lines.length : h1Index + 1 + nextHeadingOffset;
  const preambleLines = lines.slice(h1Index + 1, preambleEnd).filter((line) => line.rendered && line.raw.trim().length > 0);
  const candidates = preambleLines.filter((line) => /^Status\b/i.test(line.raw));
  if (candidates.length === 0) return { ok: false, kind: "missing", sourceLines: [] };
  if (candidates.length > 1) {
    return { ok: false, kind: "duplicate", sourceLines: candidates.map((candidate) => candidate.sourceLine) };
  }

  const candidate = candidates[0]!;
  if (preambleLines[0] !== candidate) return { ok: false, kind: "malformed", sourceLines: [candidate.sourceLine] };
  const match = candidate.raw.match(/^Status:\s*(\S(?:.*\S)?)\s*$/i);
  if (!match) return { ok: false, kind: "malformed", sourceLines: [candidate.sourceLine] };
  return { ok: true, status: { value: match[1]!, sourceLine: candidate.sourceLine } };
}

/**
 * Parse the one simple pipe table in an exact H2 section.
 *
 * Section and header names compare after trimming, collapsing whitespace, and
 * case folding. Headings and pipe rows inside approved column-zero backtick or
 * tilde fences do not participate. The helper rejects raw HTML block syntax,
 * HTML comment opener tokens, non-column-zero fences, container-relative raw HTML, and
 * every nonblank source line indented four or more columns anywhere in the
 * document. This intentionally supports only simple pipe tables; it does not
 * interpret escaped pipes or other Markdown table extensions.
 */
export function parseRequiredTableSection(markdown: string, heading: string, requiredHeaders: readonly string[] = []): RequiredTableSectionResult {
  const normalizedHeading = normalizeLabel(heading);
  const normalizedRequiredHeaders = requiredHeaders.map(normalizeLabel);
  const requestErrors: RequiredTableSectionError[] = [];

  if (normalizedHeading.length === 0) {
    requestErrors.push({ kind: "invalid-request", message: "The required H2 heading must not be empty." });
  }
  if (normalizedRequiredHeaders.some((header) => header.length === 0)) {
    requestErrors.push({ kind: "invalid-request", message: "Required table header names must not be empty." });
  }
  if (new Set(normalizedRequiredHeaders).size !== normalizedRequiredHeaders.length) {
    requestErrors.push({ kind: "invalid-request", message: "Required table header names must be unique after normalization." });
  }
  if (requestErrors.length > 0) return { ok: false, errors: requestErrors };

  const scan = scanRenderedLines(markdown);
  if (scan.unsupported.length > 0) {
    return {
      ok: false,
      errors: scan.unsupported.map((candidate) => ({
        kind: "unsupported-markdown",
        message: `Strict evidence Markdown does not allow ${candidate.description}; use top-level prose, headings, simple pipe tables, or fenced examples.`,
        sourceLine: candidate.sourceLine,
      })),
    };
  }
  const lines = scan.lines;
  const headings = lines.flatMap((line, lineIndex) => {
    if (!line.rendered) return [];
    const title = h2Title(line.raw);
    return title === undefined ? [] : [{ normalizedTitle: normalizeLabel(title), sourceLine: line.sourceLine, lineIndex }];
  });
  const matches = headings.filter((candidate) => candidate.normalizedTitle === normalizedHeading);

  if (matches.length === 0) {
    return { ok: false, errors: [{ kind: "section-missing", message: `The H2 section "${heading.trim()}" is missing.` }] };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      errors: matches.map((match) => ({
        kind: "section-duplicate",
        message: `The H2 section "${heading.trim()}" is declared more than once.`,
        sourceLine: match.sourceLine,
      })),
    };
  }

  const match = matches[0]!;
  const nextHeading = headings.find((candidate) => candidate.lineIndex > match.lineIndex);
  const sectionEnd = nextHeading?.lineIndex ?? lines.length;
  const bodyStartOffset = lines[match.lineIndex + 1]?.sourceOffset ?? markdown.length;
  const bodyEndOffset = lines[sectionEnd]?.sourceOffset ?? markdown.length;
  const renderedBody = lines
    .slice(match.lineIndex + 1, sectionEnd)
    .filter((line) => line.rendered)
    .map((line) => line.raw)
    .join("\n");
  const tableBlocks = contiguousPipeBlocks(lines, match.lineIndex + 1, sectionEnd);

  if (tableBlocks.length === 0) {
    return {
      ok: false,
      errors: [{ kind: "table-missing", message: `The H2 section "${heading.trim()}" has no simple pipe table.`, sourceLine: match.sourceLine }],
    };
  }
  if (tableBlocks.length > 1) {
    return {
      ok: false,
      errors: tableBlocks.map((block) => ({
        kind: "table-duplicate",
        message: `The H2 section "${heading.trim()}" must contain exactly one contiguous simple pipe table.`,
        sourceLine: block[0]!.sourceLine,
      })),
    };
  }

  const tableLines = tableBlocks[0]!;
  if (tableLines.length < 2) {
    return {
      ok: false,
      errors: [{ kind: "table-invalid", message: "A simple pipe table needs a header and separator row.", sourceLine: tableLines[0]!.sourceLine }],
    };
  }
  if (tableLines.some((line) => line.raw.includes("\\|"))) {
    const sourceLine = tableLines.find((line) => line.raw.includes("\\|"))!.sourceLine;
    return {
      ok: false,
      errors: [{ kind: "table-invalid", message: "Escaped pipes are not supported in a simple pipe table.", sourceLine }],
    };
  }

  const parsedRows = tableLines.map(parseSimplePipeRow);
  const headerRow = parsedRows[0]!;
  const separator = parsedRows[1]!;
  if (separator.rawCellCount !== headerRow.rawCellCount || separator.cells.length === 0 || !separator.cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return {
      ok: false,
      errors: [{ kind: "table-invalid", message: "The table separator must have one Markdown separator cell per header.", sourceLine: separator.sourceLine }],
    };
  }

  const normalizedHeaders = headerRow.cells.map(normalizeLabel);
  const headerErrors: RequiredTableSectionError[] = [];
  const headerIndexes = new Map<string, number>();
  normalizedHeaders.forEach((normalizedHeader, index) => {
    if (normalizedHeader.length === 0) {
      headerErrors.push({ kind: "header-empty", message: "Table header names must not be empty.", sourceLine: headerRow.sourceLine });
      return;
    }
    if (headerIndexes.has(normalizedHeader)) {
      headerErrors.push({
        kind: "header-duplicate",
        message: `The normalized table header "${normalizedHeader}" is declared more than once.`,
        sourceLine: headerRow.sourceLine,
      });
      return;
    }
    headerIndexes.set(normalizedHeader, index);
  });
  for (const [index, normalizedRequiredHeader] of normalizedRequiredHeaders.entries()) {
    if (!headerIndexes.has(normalizedRequiredHeader)) {
      headerErrors.push({
        kind: "header-missing",
        message: `The required table header "${requiredHeaders[index]!.trim()}" is missing.`,
        sourceLine: headerRow.sourceLine,
      });
    }
  }
  if (headerErrors.length > 0) return { ok: false, errors: headerErrors };

  const header: SimplePipeTableHeader = { ...headerRow, normalizedCells: normalizedHeaders };
  return {
    ok: true,
    section: {
      heading: heading.trim(),
      headingLine: match.sourceLine,
      body: markdown.slice(bodyStartOffset, bodyEndOffset),
      renderedBody,
      bodyRange: {
        startLine: match.sourceLine + 1,
        endLineExclusive: nextHeading?.sourceLine ?? lines.length + 1,
      },
      header,
      separator,
      rows: parsedRows.slice(2),
      width: header.rawCellCount,
      headerIndexes,
    },
  };
}

export interface RenderedH2UnsupportedSyntax {
  readonly sourceLine: number;
  readonly description: string;
}

export interface RenderedH2SectionView {
  readonly heading: string;
  readonly headingLine: number;
  readonly renderedBody: string;
  readonly unsupported: readonly RenderedH2UnsupportedSyntax[];
}

export type RenderedH2SectionResult =
  { readonly ok: true; readonly section: RenderedH2SectionView } | { readonly ok: false; readonly errors: readonly RequiredTableSectionError[] };

export interface RenderedPipeTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * Read one rendered H2 section through the strict evidence dialect.
 *
 * The helper does not require a table. Unsupported syntax inside the section
 * is returned on the section view. A caller must refuse hidden evidence when
 * that list is not empty. Do not add a second Markdown parser for this job.
 */
export function inspectRenderedH2Section(markdown: string, heading: string): RenderedH2SectionResult {
  const normalizedHeading = normalizeLabel(heading);
  if (normalizedHeading.length === 0) {
    return { ok: false, errors: [{ kind: "invalid-request", message: "The required H2 heading must not be empty." }] };
  }

  const scan = scanRenderedLines(markdown);
  const lines = scan.lines;
  const headings = lines.flatMap((line, lineIndex) => {
    if (!line.rendered) return [];
    const title = h2Title(line.raw);
    return title === undefined ? [] : [{ normalizedTitle: normalizeLabel(title), sourceLine: line.sourceLine, lineIndex }];
  });
  const matches = headings.filter((candidate) => candidate.normalizedTitle === normalizedHeading);

  if (matches.length === 0) {
    return { ok: false, errors: [{ kind: "section-missing", message: `The H2 section "${heading.trim()}" is missing.` }] };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      errors: matches.map((match) => ({
        kind: "section-duplicate",
        message: `The H2 section "${heading.trim()}" is declared more than once.`,
        sourceLine: match.sourceLine,
      })),
    };
  }

  const match = matches[0]!;
  const nextHeading = headings.find((candidate) => candidate.lineIndex > match.lineIndex);
  const sectionEnd = nextHeading?.lineIndex ?? lines.length;
  const endLineExclusive = nextHeading?.sourceLine ?? (lines.at(-1)?.sourceLine ?? match.sourceLine) + 1;
  const renderedBody = lines
    .slice(match.lineIndex + 1, sectionEnd)
    .filter((line) => line.rendered)
    .map((line) => line.raw)
    .join("\n");
  const unsupported = scan.unsupported
    .filter((candidate) => candidate.sourceLine > match.sourceLine && candidate.sourceLine < endLineExclusive)
    .map((candidate) => ({ sourceLine: candidate.sourceLine, description: candidate.description }));

  return {
    ok: true,
    section: {
      heading: heading.trim(),
      headingLine: match.sourceLine,
      renderedBody,
      unsupported,
    },
  };
}

/**
 * Parse simple pipe tables from Markdown that is already the rendered body of
 * a section. Call this only after inspectRenderedH2Section (or an equivalent
 * strict scan) so hidden HTML cannot authorize a table.
 */
export function parseRenderedPipeTables(renderedMarkdown: string): readonly RenderedPipeTable[] {
  const lines = renderedMarkdown.split(/\r?\n/);
  const scanned: ScannedLine[] = lines.map((raw, index) => ({
    raw,
    sourceLine: index + 1,
    sourceOffset: 0,
    rendered: true,
  }));
  const tables: RenderedPipeTable[] = [];
  for (const block of contiguousPipeBlocks(scanned, 0, scanned.length)) {
    if (block.length < 2) continue;
    const parsed = block.map(parseSimplePipeRow);
    const headerRow = parsed[0]!;
    const separator = parsed[1]!;
    if (separator.rawCellCount !== headerRow.rawCellCount || separator.cells.length === 0) continue;
    if (!separator.cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    tables.push({
      headers: headerRow.cells.map(normalizeLabel),
      rows: parsed.slice(2).map((row) => row.cells),
    });
  }
  return tables;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function h2Title(line: string): string | undefined {
  const match = line.match(/^ {0,3}##(?:[\t ]+|$)(.*)$/u);
  if (!match) return undefined;
  return (match[1] ?? "").replace(/[\t ]+#+[\t ]*$/u, "").trim();
}

function atxHeadingLevel(line: string): number | undefined {
  const match = line.match(/^ {0,3}(#{1,6})(?:[\t ]+|$)/u);
  return match?.[1]?.length;
}

function scanRenderedLines(markdown: string): MarkdownScan {
  const lines = markdown.split(/\r?\n/);
  const scanned: ScannedLine[] = [];
  const unsupported: UnsupportedMarkdownSyntax[] = [];
  let fence: Fence | undefined;
  let sourceOffset = 0;

  for (const [index, raw] of lines.entries()) {
    const lineOffset = sourceOffset;
    sourceOffset += raw.length;
    if (markdown.startsWith("\r\n", sourceOffset)) sourceOffset += 2;
    else if (markdown[sourceOffset] === "\n") sourceOffset += 1;

    const markerMatch = raw.match(/^(`{3,}|~{3,})(.*)$/u);
    const marker = validFenceMarker(markerMatch?.[1], markerMatch?.[2]);
    if (fence) {
      scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: false });
      if (marker && marker[0] === fence.marker && marker.length >= fence.length && (markerMatch?.[2] ?? "").trim().length === 0) {
        fence = undefined;
      }
      continue;
    }

    if (marker) {
      fence = { marker: marker[0] as "`" | "~", length: marker.length };
      scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: false });
      continue;
    }

    const nonColumnZeroFence = nonColumnZeroFenceCandidate(raw);
    if (nonColumnZeroFence) {
      unsupported.push({ lineIndex: index, sourceLine: index + 1, description: "a non-column-zero fence" });
      scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: false });
      continue;
    }

    const rawHtml = rawHtmlSyntax(raw) ?? containerRelativeRawHtmlSyntax(raw);
    if (rawHtml) {
      unsupported.push({ lineIndex: index, sourceLine: index + 1, description: rawHtml.description });
      scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: false });
      continue;
    }

    if (hasHtmlCommentOpener(raw)) {
      unsupported.push({ lineIndex: index, sourceLine: index + 1, description: "an HTML comment opener token" });
      scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: false });
      continue;
    }

    if (leadingWhitespaceColumns(raw) >= 4 && raw.trim().length > 0) {
      unsupported.push({ lineIndex: index, sourceLine: index + 1, description: "a nonblank source line indented four or more columns" });
      scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: false });
      continue;
    }

    scanned.push({ raw, sourceLine: index + 1, sourceOffset: lineOffset, rendered: true });
  }

  return { lines: scanned, unsupported };
}

// Keep this finite strict-evidence dialect aligned with the raw-HTML opener
// families recognized by tooling/lib/launch-state.ts. The helper rejects an
// opener globally, so it never needs to emulate each block's closing grammar.
const RAW_HTML_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "source",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "track",
  "tr",
  "ul",
]);

function rawHtmlSyntax(line: string): RawHtmlSyntax | undefined {
  const typeOne = line.match(/^ {0,3}<(script|style|template|pre|textarea)(?=[\t >]|$)/iu);
  if (typeOne) {
    const tag = typeOne[1]!.toLocaleLowerCase("en-US");
    return { description: `raw HTML <${tag}> block syntax` };
  }

  if (/^ {0,3}<\?/u.test(line)) {
    return { description: "raw HTML processing-instruction syntax" };
  }
  if (/^ {0,3}<!\[CDATA\[/u.test(line)) {
    return { description: "raw HTML CDATA syntax" };
  }
  if (/^ {0,3}<![A-Z]/u.test(line)) {
    return { description: "raw HTML declaration syntax" };
  }

  const blockTag = line.match(/^ {0,3}<\/?([A-Za-z][A-Za-z0-9]*)(?=[\t ]|$|\/?>)/u)?.[1]?.toLocaleLowerCase("en-US");
  if (blockTag && RAW_HTML_BLOCK_TAGS.has(blockTag)) {
    return { description: "raw HTML block-container syntax" };
  }

  // The strict dialect accepts the full line as the tag tail instead of
  // interpreting attribute grammar. That catches quoted angle brackets and
  // malformed tag-like evidence fail-closed without growing a generic HTML
  // parser; mid-sentence tag mentions still do not start here.
  const completeTag = line.match(/^ {0,3}<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:[\t ].*)?\/?>[\t ]*$/u);
  if (completeTag) {
    return { description: "raw HTML complete-tag syntax" };
  }
  return undefined;
}

function containerRelativeRawHtmlSyntax(line: string): RawHtmlSyntax | undefined {
  const content = containerRelativeContent(line);
  if (content === undefined) return undefined;
  const syntax = rawHtmlSyntax(content);
  return syntax ? { description: `container-relative ${syntax.description}` } : undefined;
}

function containerRelativeContent(line: string): string | undefined {
  let content = line;
  let consumedPrefix = false;

  // This is deliberately lexical rather than a container-lifetime parser.
  // Repeated blockquote/list markers and their content padding are removed so
  // nested unsupported syntax cannot evade the document-wide strict gate.
  while (true) {
    const blockquote = content.match(/^ {0,3}>[\t ]*/u);
    if (blockquote) {
      content = content.slice(blockquote[0].length);
      consumedPrefix = true;
      continue;
    }

    const list = content.match(/^ {0,3}(?:[-+*]|\d{1,9}[.)])[\t ]+/u);
    if (list) {
      content = content.slice(list[0].length);
      consumedPrefix = true;
      continue;
    }
    break;
  }

  return consumedPrefix ? content : undefined;
}

function hasHtmlCommentOpener(line: string): boolean {
  return line.includes("<!--");
}

function leadingWhitespaceColumns(line: string): number {
  let columns = 0;
  for (const character of line) {
    if (character === " ") columns += 1;
    else if (character === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

function validFenceMarker(marker: string | undefined, trailing: string | undefined): string | undefined {
  if (!marker) return undefined;
  if (marker[0] === "`" && (trailing ?? "").includes("`")) return undefined;
  return marker;
}

function nonColumnZeroFenceCandidate(line: string): FenceCandidate | undefined {
  const indented = line.match(/^(?: +|\t[ \t]*)(`{3,}|~{3,})(.*)$/u);
  const containerContent = containerRelativeContent(line);
  const container = containerContent?.match(/^[\t ]*(`{3,}|~{3,})(.*)$/u);
  const match = indented ?? container;
  const marker = validFenceMarker(match?.[1], match?.[2]);
  return marker ? { marker, trailing: match?.[2] ?? "" } : undefined;
}

function contiguousPipeBlocks(lines: readonly ScannedLine[], start: number, end: number): ScannedLine[][] {
  const blocks: ScannedLine[][] = [];
  let block: ScannedLine[] = [];

  const flush = (): void => {
    if (block.length > 0) blocks.push(block);
    block = [];
  };

  for (let index = start; index < end; index += 1) {
    const line = lines[index]!;
    if (line.rendered && isSimplePipeRow(line.raw)) block.push(line);
    else flush();
  }
  flush();
  return blocks;
}

function isSimplePipeRow(line: string): boolean {
  const leadingWhitespace = line.match(/^[ \t]*/u)?.[0] ?? "";
  if (leadingWhitespace.includes("\t") || leadingWhitespace.length > 3) return false;
  return looksLikePipeRow(line);
}

function looksLikePipeRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith("|") && trimmed.endsWith("|");
}

function parseSimplePipeRow(line: ScannedLine): SimplePipeTableRow {
  const raw = line.raw.trim();
  const cells = raw
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  return { sourceLine: line.sourceLine, raw, cells, rawCellCount: cells.length };
}
