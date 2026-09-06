/** Match authored table cells, independent of formatter padding and separator width. */
export function replaceTableBlock(text: string, expected: string, replacement: string): string {
  const normalize = (line: string): string =>
    line
      .trim()
      .split("|")
      .map((cell) => {
        const value = cell.trim();
        return /^:?-{3,}:?$/.test(value) ? "---" : value;
      })
      .join("|");
  const lines = text.split("\n");
  const wanted = expected.split("\n").map(normalize);
  const matches = lines.flatMap((_, index) => (wanted.every((line, offset) => normalize(lines[index + offset] ?? "") === line) ? [index] : []));
  if (matches.length !== 1) throw new Error(`Expected exactly one fixture table anchor, found ${matches.length}: ${expected}`);
  lines.splice(matches[0]!, wanted.length, ...replacement.split("\n"));
  return lines.join("\n");
}
