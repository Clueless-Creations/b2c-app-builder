/**
 * render-artifact-page.ts — one page shell for every artifact page rendered from
 * a Markdown source, plus the block-to-HTML pass.
 *
 * docs/architecture.md: "HTML is generated, never authored. Every page in business/
 * renders from state. Hand-authored HTML twins go stale silently with no signal."
 * These four pages were the twins. Their drift was not cosmetic — security-review
 * claimed in its own opening line to cover sections it had dropped, store-console
 * was missing the App Review checklist that prevents a Guideline 2.1 rejection,
 * and onboarding had one screen's content sitting under another screen's heading.
 *
 * One shell, so four pages read as one system and a change to the presentation is
 * a change in one place. Output is deterministic: no timestamps, no directory
 * iteration, nothing that makes two runs of the same input differ.
 */
import { escapeHtml } from "./html.js";
import { inlineToPlainText, parseMarkdownLite, type Block, type Inline } from "./markdown-lite.js";

export interface ArtifactPageInput {
  /** Markdown source text. */
  readonly markdown: string;
  /** Source path as a reader should see it, e.g. "product/ONBOARDING.md". */
  readonly markdownName: string;
}

/**
 * Full HTML document for one artifact page. The document's own H1 becomes the
 * title, its leading `Status:` line becomes the status pill, and every H2 opens a
 * card so a long document reads as sections rather than one wall of text.
 */
export function renderArtifactPage(input: ArtifactPageInput): string {
  const blocks = parseMarkdownLite(input.markdown);

  const headingIndex = blocks.findIndex((block) => block.kind === "heading" && block.level === 1);
  const heading = blocks[headingIndex];
  if (heading?.kind !== "heading") {
    throw new Error(`${input.markdownName} has no H1. The page title comes from the document's own first heading.`);
  }
  const title = inlineToPlainText(heading.text);

  // Only the line directly under the H1 is the document's status. Searching the
  // whole document would silently lift a `Status:` line out of the section it
  // belongs to and reprint it in the header, which is the same class of bug as
  // the one this renderer exists to fix. A status line anywhere else stays put.
  const following = blocks[headingIndex + 1];
  const status = following?.kind === "status" ? following : undefined;

  const body = blocks.filter((block) => block !== heading && block !== status);

  const lines: string[] = [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtml(title)}</title>`,
    "    <style>",
    PAGE_STYLE,
    "    </style>",
    "  </head>",
    "  <body>",
    "    <main>",
    "      <header>",
    `        <h1>${renderInline(heading.text)}</h1>`,
  ];

  if (status) {
    lines.push(`        <p class="status"><span class="status-label">Status</span> ${renderInline(status.text)}</p>`);
  }

  lines.push(
    `        <p class="origin">This page is written from <code>${escapeHtml(input.markdownName)}</code>. Change that file and render the page again. Anything typed here is replaced on the next render.</p>`,
    "      </header>",
    ...renderSections(body),
    "    </main>",
    "  </body>",
    "</html>",
    "",
  );

  return lines.join("\n");
}

/**
 * Blocks grouped into cards, one per H2. Content that appears before the first H2
 * opens an intro card, so nothing can fall outside a section and disappear.
 */
function renderSections(blocks: Block[]): string[] {
  const sections: Block[][] = [];
  let current: Block[] = [];

  for (const block of blocks) {
    if (block.kind === "heading" && block.level === 2 && current.length > 0) {
      sections.push(current);
      current = [];
    }
    current.push(block);
  }
  if (current.length > 0) {
    sections.push(current);
  }

  return sections.flatMap((section) => ['      <section class="card">', ...section.flatMap((block) => renderBlock(block, "        ")), "      </section>"]);
}

function renderBlock(block: Block, pad: string): string[] {
  switch (block.kind) {
    case "heading":
      return [`${pad}<h${block.level}>${renderInline(block.text)}</h${block.level}>`];
    case "status":
      return [`${pad}<p class="status"><span class="status-label">Status</span> ${renderInline(block.text)}</p>`];
    case "paragraph":
      return [`${pad}<p>${renderInline(block.text)}</p>`];
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return [`${pad}<${tag}>`, ...block.items.map((item) => `${pad}  <li>${renderInline(item)}</li>`), `${pad}</${tag}>`];
    }
    case "code":
      return [`${pad}<pre><code>${escapeHtml(block.text)}</code></pre>`];
    case "table":
      return renderTable(block, pad);
  }
}

/**
 * Tables are wrapped in their own scroll container. The widest source table has
 * eight columns, which cannot fit a phone; artifact-contracts.md requires these
 * pages to stay readable on mobile without clipping, so the table scrolls inside
 * the card instead of forcing the page to scroll sideways.
 */
function renderTable(block: Extract<Block, { kind: "table" }>, pad: string): string[] {
  return [
    `${pad}<div class="table-wrap">`,
    `${pad}  <table>`,
    `${pad}    <thead>`,
    `${pad}      <tr>${block.header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr>`,
    `${pad}    </thead>`,
    `${pad}    <tbody>`,
    ...block.rows.map((row) => `${pad}      <tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`),
    `${pad}    </tbody>`,
    `${pad}  </table>`,
    `${pad}</div>`,
  ];
}

function renderInline(inline: Inline[]): string {
  return inline
    .map((span) => {
      switch (span.kind) {
        case "text":
          return escapeHtml(span.value);
        case "code":
          return `<code>${escapeHtml(span.value)}</code>`;
        case "bold":
          return `<strong>${renderInline(span.value)}</strong>`;
      }
    })
    .join("");
}

/**
 * Held as a single constant so the four pages cannot drift apart visually, and so
 * a styling change is one diff rather than four. Light and dark both ship: these
 * files are opened straight from disk, where the reader's system theme is the
 * only signal available.
 */
const PAGE_STYLE = `      :root {
        color-scheme: light dark;
        --bg: #f7f4ef;
        --ink: #1b1917;
        --muted: #635c53;
        --panel: #fffdf9;
        --line: #ddd5c9;
        --accent: #1f6f63;
        --code-bg: #f0ece4;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #16150f;
          --ink: #f2ede4;
          --muted: #b0a89c;
          --panel: #1f1d17;
          --line: #3a362d;
          --accent: #7bcbba;
          --code-bg: #2a2721;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Avenir Next", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        line-height: 1.55;
      }

      main {
        width: min(1080px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      header {
        display: grid;
        gap: 10px;
        margin-bottom: 24px;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        font-size: clamp(2rem, 5vw, 3.5rem);
        line-height: 1.02;
      }

      h2 {
        font-size: 1.05rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      h3 {
        font-size: 1rem;
        margin-top: 18px;
      }

      .status {
        color: var(--muted);
      }

      .status-label {
        display: inline-block;
        margin-right: 8px;
        padding: 2px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--accent);
        font-size: 0.74rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .origin {
        color: var(--muted);
        font-size: 0.88rem;
        max-width: 74ch;
      }

      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 14px;
      }

      .card > * + * {
        margin-top: 12px;
      }

      p {
        max-width: 84ch;
      }

      ul,
      ol {
        margin: 0;
        padding-left: 20px;
        max-width: 84ch;
      }

      li + li {
        margin-top: 8px;
      }

      code {
        background: var(--code-bg);
        border-radius: 4px;
        padding: 1px 5px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.9em;
      }

      pre {
        margin: 0;
        overflow-x: auto;
        background: var(--code-bg);
        border-radius: 8px;
        padding: 14px;
      }

      pre code {
        background: none;
        padding: 0;
      }

      .table-wrap {
        overflow-x: auto;
      }

      table {
        width: 100%;
        min-width: 640px;
        border-collapse: collapse;
      }

      th,
      td {
        border-top: 1px solid var(--line);
        padding: 10px 8px;
        text-align: left;
        vertical-align: top;
      }

      th {
        color: var(--muted);
        font-size: 0.76rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      @media (max-width: 640px) {
        main {
          width: calc(100% - 20px);
          padding: 20px 0 40px;
        }

        .card {
          padding: 16px;
        }
      }`;
