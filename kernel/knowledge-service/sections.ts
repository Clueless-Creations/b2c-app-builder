import { fromMarkdown } from "mdast-util-from-markdown";
import type { RootContent, PhrasingContent } from "mdast";

/** Published IDs are scoped to the full document hash; clients never recreate slug rules. */
export interface KnowledgeSection {
  id: string;
  title: string;
  level: number;
  parentId: string | null;
  start: number;
  end: number;
}

function text(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if ("value" in node) return node.type === "html" ? "" : node.value;
      if ("children" in node) return text(node.children);
      return "alt" in node ? (node.alt ?? "") : "";
    })
    .join("");
}

/** CommonMark parsing ignores heading-shaped text in fences and supports Setext headings. */
export function indexKnowledgeSections(markdown: string): KnowledgeSection[] {
  const offsets = new Uint32Array(markdown.length + 1);
  let utf16 = 0,
    points = 0;
  for (const point of markdown) {
    offsets[utf16] = points;
    if (point.length === 2) offsets[utf16 + 1] = points;
    utf16 += point.length;
    offsets[utf16] = ++points;
  }
  const sections: KnowledgeSection[] = [];
  const visit = (nodes: readonly RootContent[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const title = text(node.children).trim();
        const slug =
          title
            .toLowerCase()
            .normalize("NFKC")
            .replace(/[^\p{L}\p{N}]+/gu, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 100) || "section";
        sections.push({
          id: `s${sections.length + 1}-${slug}`,
          title,
          level: node.depth,
          parentId: null,
          start: offsets[node.position?.start.offset ?? 0]!,
          end: points,
        });
      }
      // Container headings belong to the document too; fenced code has no children.
      if ((node.type === "blockquote" || node.type === "list" || node.type === "listItem") && "children" in node) visit(node.children as RootContent[]);
    }
  };
  visit(fromMarkdown(markdown).children);
  const stack: KnowledgeSection[] = [];
  for (const section of sections) {
    while (stack.length && stack.at(-1)!.level >= section.level) stack.pop()!.end = section.start;
    section.parentId = stack.at(-1)?.id ?? null;
    stack.push(section);
  }
  return sections;
}
