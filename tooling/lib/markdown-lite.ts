/**
 * markdown-lite.ts — the small, enumerable Markdown subset the business documents
 * actually use, parsed into blocks. No HTML knowledge lives here.
 *
 * WHY NOT AN NPM MARKDOWN LIBRARY. This repo carries two package.json files that
 * check:package-parity holds byte-identical in their dependency sets, and
 * dependabot splits dependency-group updates by root — so each half of a split
 * update lands red until the other arrives. A parser for four documents that use
 * headings, one status line, tables, flat lists, one ordered list, bold, inline
 * code and a single fenced block is not worth that recurring cost.
 *
 * WHY IT THROWS. A parser that renders an unrecognized construct as a paragraph
 * is the exact failure mode the generated-pages gate exists to prevent: the build
 * stays green while a section quietly turns into mush. Every construct outside the
 * subset is rejected by name, with the reason, so adding one to a source document
 * is a loud failure rather than silent damage.
 *
 * WHAT IS DELIBERATELY ABSENT. There is no emphasis/italic syntax. The source
 * documents are dense with identifiers like `emotional_design` and
 * `11_STAR_EXPERIENCE.md`; an underscore-emphasis rule would pair underscores
 * across two unrelated identifiers and silently swallow the text between them.
 * Underscores are literal characters here, always.
 */

export type Inline = { kind: "text"; value: string } | { kind: "code"; value: string } | { kind: "bold"; value: Inline[] };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: Inline[] }
  /** A leading `Status: …` line. Every business document opens with one or none. */
  | { kind: "status"; text: Inline[] }
  | { kind: "paragraph"; text: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "code"; language: string; text: string };

/** Thrown on any construct outside the subset. Carries the 1-based source line. */
export class MarkdownLiteError extends Error {
  constructor(
    readonly line: number,
    reason: string,
  ) {
    super(`line ${line}: ${reason}`);
    this.name = "MarkdownLiteError";
  }
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM = /^-\s+(.*)$/;
const ORDERED_ITEM = /^(\d+)\.\s+(.*)$/;
const FENCE = /^```(\S*)\s*$/;
const STATUS = /^Status:\s*(.*)$/;
const THEMATIC_BREAK = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function parseMarkdownLite(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    const lineNumber = index + 1;

    if (raw.trim() === "") {
      index += 1;
      continue;
    }

    // Leading whitespace is always ambiguous in this subset: it could be a nested
    // list item, a lazy continuation, or an indented code block. Rejecting it is
    // cheaper than guessing which, and none of the source documents use any.
    if (/^\s/.test(raw)) {
      throw new MarkdownLiteError(
        lineNumber,
        "indented line. Nested lists, lazy continuations and indented code blocks are not supported; keep every block flush left.",
      );
    }

    rejectUnsupportedBlockStart(raw, lineNumber);

    const fence = FENCE.exec(raw);
    if (fence) {
      const language = fence[1] ?? "";
      const body: string[] = [];
      index += 1;
      let closed = false;
      while (index < lines.length) {
        const current = lines[index] ?? "";
        if (/^```\s*$/.test(current)) {
          closed = true;
          index += 1;
          break;
        }
        body.push(current);
        index += 1;
      }
      if (!closed) {
        throw new MarkdownLiteError(lineNumber, "fenced code block is never closed.");
      }
      blocks.push({ kind: "code", language, text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(raw);
    if (heading) {
      const level = (heading[1] ?? "").length;
      if (level > 3) {
        throw new MarkdownLiteError(lineNumber, `heading level ${level}. Headings stop at H3; restructure the document rather than nesting deeper.`);
      }
      blocks.push({ kind: "heading", level: level as 1 | 2 | 3, text: parseInline(heading[2] ?? "", lineNumber) });
      index += 1;
      continue;
    }

    if (raw.startsWith("|")) {
      const { block, next } = parseTable(lines, index);
      blocks.push(block);
      index = next;
      continue;
    }

    if (UNORDERED_ITEM.test(raw) || ORDERED_ITEM.test(raw)) {
      const { block, next } = parseList(lines, index);
      blocks.push(block);
      index = next;
      continue;
    }

    const status = STATUS.exec(raw);
    if (status) {
      blocks.push({ kind: "status", text: parseInline(status[1] ?? "", lineNumber) });
      index += 1;
      continue;
    }

    const { block, next } = parseParagraph(lines, index);
    blocks.push(block);
    index = next;
  }

  return blocks;
}

/**
 * Constructs that look like Markdown but are outside the subset. Named one by one
 * so the failure says what was found rather than "unexpected input".
 */
function rejectUnsupportedBlockStart(raw: string, lineNumber: number): void {
  if (THEMATIC_BREAK.test(raw)) {
    throw new MarkdownLiteError(lineNumber, "thematic break. Use a heading to separate sections.");
  }
  if (raw.startsWith(">")) {
    throw new MarkdownLiteError(lineNumber, "blockquote. Blockquotes are not supported; use a paragraph or a list item.");
  }
  if (raw.startsWith("<")) {
    throw new MarkdownLiteError(lineNumber, "raw HTML block. These documents are rendered to HTML by the page renderer; embedded HTML would bypass escaping.");
  }
  if (raw.startsWith("~~~")) {
    throw new MarkdownLiteError(lineNumber, "tilde code fence. Use a triple-backtick fence.");
  }
  if (/^[*+]\s+/.test(raw)) {
    throw new MarkdownLiteError(lineNumber, "list item marked with * or +. Unordered lists use a leading hyphen.");
  }
}

function parseTable(lines: string[], start: number): { block: Block; next: number } {
  const headerLine = lines[start] ?? "";
  const delimiterLine = lines[start + 1];
  if (delimiterLine === undefined || !/^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(delimiterLine)) {
    throw new MarkdownLiteError(start + 2, "table header is not followed by a delimiter row such as `| --- | --- |`.");
  }

  const header = splitRow(headerLine, start + 1);
  const delimiter = splitRow(delimiterLine, start + 2);
  if (delimiter.length !== header.length) {
    throw new MarkdownLiteError(start + 2, `table delimiter row has ${delimiter.length} cells but the header has ${header.length}.`);
  }

  const rows: string[][] = [];
  let index = start + 2;
  while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
    const cells = splitRow(lines[index] ?? "", index + 1);
    if (cells.length !== header.length) {
      throw new MarkdownLiteError(
        index + 1,
        `table row has ${cells.length} cells but the header has ${header.length}. An unescaped pipe inside a cell splits the row.`,
      );
    }
    rows.push(cells);
    index += 1;
  }

  return {
    block: {
      kind: "table",
      header: header.map((cell, column) => parseInline(cell, start + 1, column)),
      rows: rows.map((row, rowIndex) => row.map((cell) => parseInline(cell, start + 3 + rowIndex))),
    },
    next: index,
  };
}

/**
 * Cells of one pipe row. The leading and trailing pipes are structural; a row must
 * carry both, because a missing trailing pipe silently drops the last column.
 */
function splitRow(line: string, lineNumber: number): string[] {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|") || trimmed.length < 2) {
    throw new MarkdownLiteError(lineNumber, "table row must start and end with a pipe.");
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const ordered = ORDERED_ITEM.test(lines[start] ?? "");
  const items: Inline[][] = [];
  let index = start;
  let expected = 1;

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    if (raw.trim() === "") break;

    const unordered = UNORDERED_ITEM.exec(raw);
    const numbered = ORDERED_ITEM.exec(raw);
    if (!unordered && !numbered) break;
    if (ordered !== Boolean(numbered)) {
      throw new MarkdownLiteError(index + 1, "ordered and unordered items are mixed in one list. Separate them with a blank line.");
    }

    if (numbered) {
      // A hand-maintained checklist that renumbers itself on render is a
      // document that disagrees with the page a founder reads.
      const declared = Number(numbered[1]);
      if (declared !== expected) {
        throw new MarkdownLiteError(
          index + 1,
          `ordered list item is numbered ${declared} but ${expected} was expected. Renumber the source rather than relying on the renderer.`,
        );
      }
      expected += 1;
      items.push(parseInline(numbered[2] ?? "", index + 1));
    } else {
      items.push(parseInline(unordered?.[1] ?? "", index + 1));
    }
    index += 1;
  }

  return { block: { kind: "list", ordered, items }, next: index };
}

function parseParagraph(lines: string[], start: number): { block: Block; next: number } {
  const collected: string[] = [];
  let index = start;

  while (index < lines.length) {
    const raw = lines[index] ?? "";
    if (raw.trim() === "") break;
    // A list may interrupt a paragraph without a blank line, and store/STORE_CONSOLE.md
    // does exactly that. Headings, tables and fences end a paragraph too.
    if (index > start && (UNORDERED_ITEM.test(raw) || ORDERED_ITEM.test(raw) || HEADING.test(raw) || FENCE.test(raw) || raw.startsWith("|"))) {
      break;
    }
    if (index > start) {
      // The main loop rejects indented lines, but a continuation line never
      // reaches it. Without this an indented line is silently folded into the
      // paragraph above, which is the quiet degrading this parser refuses to do.
      if (/^\s/.test(raw)) {
        throw new MarkdownLiteError(index + 1, "indented continuation line. Keep every block flush left; a wrapped paragraph line must not be indented.");
      }
      rejectUnsupportedBlockStart(raw, index + 1);
    }
    collected.push(raw.trim());
    index += 1;
  }

  return { block: { kind: "paragraph", text: parseInline(collected.join(" "), start + 1) }, next: index };
}

/**
 * Inline spans: `code`, **bold**, and literal text. Bold may contain code; nothing
 * may contain bold. An unterminated span is an error rather than literal text,
 * because a stray backtick otherwise swallows the rest of the paragraph.
 */
export function parseInline(source: string, lineNumber: number, column?: number): Inline[] {
  const where = column === undefined ? "" : ` (column ${column + 1})`;
  const out: Inline[] = [];
  let text = "";
  let index = 0;

  const flush = (): void => {
    if (text.length > 0) {
      out.push({ kind: "text", value: text });
      text = "";
    }
  };

  while (index < source.length) {
    const char = source[index] ?? "";

    if (char === "`") {
      const close = source.indexOf("`", index + 1);
      if (close === -1) {
        throw new MarkdownLiteError(lineNumber, `unterminated inline code span${where}.`);
      }
      flush();
      out.push({ kind: "code", value: source.slice(index + 1, close) });
      index = close + 1;
      continue;
    }

    if (source.startsWith("**", index)) {
      const close = source.indexOf("**", index + 2);
      if (close === -1) {
        throw new MarkdownLiteError(lineNumber, `unterminated bold span${where}.`);
      }
      const inner = source.slice(index + 2, close);
      if (inner.includes("**")) {
        throw new MarkdownLiteError(lineNumber, `nested bold span${where}.`);
      }
      flush();
      out.push({ kind: "bold", value: parseInline(inner, lineNumber, column) });
      index = close + 2;
      continue;
    }

    if (char === "*") {
      throw new MarkdownLiteError(
        lineNumber,
        `stray "*"${where}. There is no italic syntax in this subset; bold is ** on both sides, and a literal asterisk belongs inside a code span.`,
      );
    }

    text += char;
    index += 1;
  }

  flush();
  return out;
}

/** Plain text of an inline run, for titles and other attribute-safe positions. */
export function inlineToPlainText(inline: Inline[]): string {
  return inline
    .map((span) => (span.kind === "bold" ? inlineToPlainText(span.value) : span.value))
    .join("")
    .trim();
}
