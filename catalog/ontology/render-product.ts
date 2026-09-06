import type { ProductCopyField, ProductInstanceDocument } from "./instance-types.js";
import { PRODUCT_SECTION_ORDER } from "./instance-types.js";

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trimEnd()}`;
}

export function renderProductMarkdown(doc: ProductInstanceDocument): string {
  const slugLine = doc.meta.slug !== undefined ? `slug: ${yamlQuoted(doc.meta.slug)}\n` : "";
  const sections = PRODUCT_SECTION_ORDER.map(([title, field]) => section(title, doc.copy[field as ProductCopyField]));
  return [
    "---",
    `version: ${doc.meta.version}`,
    `name: ${yamlQuoted(doc.meta.name)}`,
    `${slugLine}description: ${yamlQuoted(doc.meta.description)}`.trimEnd(),
    `status: ${doc.meta.status}`,
    "---",
    "",
    `# ${doc.meta.name} Product`,
    "",
    doc.copy.intro.trimEnd(),
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
}
