import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const htmlURL = new URL("index.html", import.meta.url);
const geometry = JSON.parse(readFileSync(new URL("../shared/object-geometry.json", import.meta.url), "utf8"));
const objects = new Map(geometry.objects.map((object) => [object.id, object]));
const svg = (id) => {
  const object = objects.get(id);
  return `<svg viewBox="0 0 ${object.width} ${object.height}" aria-hidden="true" focusable="false">${object.layers.map((layer) => `<path d="${layer.commands.map((command) => command.type + command.values.join(" ")).join(" ")}" fill="${layer.fill}"${layer.stroke ? ` stroke="${layer.stroke}" stroke-width="${layer.strokeWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round"` : ""}/>`).join("")}</svg>`;
};
let html = readFileSync(htmlURL, "utf8");
html = html.replace(/(<div[^>]*data-art="([^"]+)"[^>]*>)(?:<svg[\s\S]*?<\/svg>)?(<\/div>)/g, (_, open, id, close) => open + svg(id) + close);
html = html.replace(/(<div id="bag-art"[^>]*>)(?:<svg[\s\S]*?<\/svg>)?(<\/div>)/, (_, open, close) => open + svg("bag") + close);
html = html.replace(/\n<script id="object-geometry"[\s\S]*?<\/script>/, "");
html = html.replace("</body>", `<script id="object-geometry" type="application/json">${JSON.stringify(geometry).replaceAll("<", "\\u003c")}</script>\n</body>`);
writeFileSync(htmlURL, html);
console.log(`Rendered ${objects.size} shared objects into ${fileURLToPath(htmlURL)}`);
