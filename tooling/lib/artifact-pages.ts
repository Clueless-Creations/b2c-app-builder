/**
 * artifact-pages.ts - every generated founder page declares where its content comes from.
 *
 * A page is exactly one of:
 *
 * - rendered-by: a script builds it from state
 * - starter-stub: an intentional placeholder before live data exists
 * - authored-from: Markdown is canonical and this page is its rendering
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderArtifactPage } from "./render-artifact-page.js";

export type PageProvenance =
  | { readonly kind: "rendered-by"; readonly script: string; readonly why: string }
  | { readonly kind: "starter-stub"; readonly why: string }
  | { readonly kind: "authored-from"; readonly markdown: string; readonly why: string; readonly presentation?: "document" | "source" };

export const artifactPages: Readonly<Record<string, PageProvenance>> = {
  "design/design-room.html": {
    kind: "rendered-by",
    script: "tooling/render-design-room.ts",
    why: "built from studio/seed/business.json and the design tokens, with its own design-state hash.",
  },
  "analytics/analytics-plan.html": {
    kind: "starter-stub",
    why: "a starter placeholder. The real page is rendered after live services report real data; a plan must not masquerade as measurement.",
  },
  "product/onboarding.html": {
    kind: "authored-from",
    markdown: "product/ONBOARDING.md",
    presentation: "source",
    why: "the onboarding decisions, journey, screen and control contracts, instrumentation, monetization, and cutover record are the page.",
  },
  "operations/orchestration.html": {
    kind: "authored-from",
    markdown: "operations/ORCHESTRATION.md",
    why: "the preflight, unit table, and ownership rules are the page.",
  },
  "store/store-console.html": {
    kind: "authored-from",
    markdown: "store/STORE_CONSOLE.md",
    why: "the console routes and App Review checklist are the page.",
  },
  "trust/security-review.html": {
    kind: "authored-from",
    markdown: "trust/SECURITY.md",
    why: "the threat model, hardening checklist, and accepted risks are the page.",
  },
};

export function artifactPageEntries(): Array<[string, PageProvenance]> {
  return Object.entries(artifactPages).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

export function listRootPages(businessRoot: string): string[] {
  return readdirSync(businessRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
}

export function renderAuthoredPage(businessRoot: string, entry: Extract<PageProvenance, { kind: "authored-from" }>): string {
  const markdownPath = path.join(businessRoot, entry.markdown);
  const markdown = readFileSync(markdownPath, "utf8");
  if (entry.presentation === "source") return renderSourceArtifactPage(markdown, entry.markdown);
  return renderArtifactPage({ markdown, markdownName: entry.markdown });
}

/**
 * Large execution records stay compact in the generated HTML while retaining a faithful,
 * searchable source view. The raw Markdown carries internal vocabulary (lane, gate, artifact,
 * not_started, ...) a founder should not read as prose, so the decoded view lives inside the
 * same sanctioned <details> technical-details disclosure check-founder-copy.ts already exempts
 * from its scan (see that file's founderVisibleHtmlText). The retained Design Room uses the
 * same pattern for technical detail. The Markdown is
 * base64-encoded in the file only to keep the *default* founder-visible page free of raw
 * identifiers before the disclosure is expanded; the browser decodes it into a focusable pre
 * element once opened.
 */
function renderSourceArtifactPage(markdown: string, markdownName: string): string {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || "Artifact";
  const status = markdown.match(/^Status:\s*`?([^`\n]+)`?/m)?.[1]?.trim() || "unknown";
  const digest = createHash("sha256").update(markdown).digest("hex").slice(0, 16);
  const sourceBase64 = Buffer.from(markdown, "utf8").toString("base64");
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  const sectionList = headings.map((heading) => `<li>${escapeHtml(displayHeading(heading))}</li>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f7f4ef;--panel:#fffdf9;--ink:#1b1917;--muted:#635c53;--line:#ddd5c9;--accent:#1f6f63}@media(prefers-color-scheme:dark){:root{--bg:#16150f;--panel:#1f1d17;--ink:#f2ede4;--muted:#b0a89c;--line:#3a362d;--accent:#7bcbba}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}main{width:min(1180px,calc(100% - 28px));margin:auto;padding:36px 0 56px}header,.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}header{margin-bottom:14px}.card+.card{margin-top:14px}h1{margin:0 0 8px;font-size:clamp(2rem,5vw,3.6rem);line-height:1}.meta{color:var(--muted);margin:7px 0 0}.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 9px;color:var(--accent);font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em}ol{columns:2;gap:32px;margin:16px 0 0;padding-left:22px}li{break-inside:avoid;margin:0 0 7px}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}pre{margin:14px 0 0;padding:18px;max-height:70vh;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--bg);white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:640px){main{width:min(100% - 18px,1180px);padding-top:18px}ol{columns:1}}
</style>
</head>
<body>
<main>
<header><span class="pill">${escapeHtml(displayStatus(status))}</span><h1>${escapeHtml(title)}</h1><p class="meta">Source: <code>${escapeHtml(markdownName)}</code></p><p class="meta">Current source fingerprint: <code>${digest}</code></p></header>
<section class="card"><h2>What this onboarding record covers</h2><ol>${sectionList}</ol></section>
<details class="card"><summary>Technical details, for whoever picks this up next</summary><p class="meta">This is the complete canonical Markdown source, shown here for review and search.</p><pre id="source" tabindex="0" aria-label="Full onboarding execution contract"></pre></details>
</main>
<script>
const sourceBytes=Uint8Array.from(atob("${sourceBase64}"),character=>character.charCodeAt(0));
document.getElementById("source").textContent=new TextDecoder().decode(sourceBytes);
</script>
</body>
</html>
`;
}

function displayStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "not_started") return "Not started yet";
  if (normalized === "partial") return "In progress";
  if (normalized === "blocked") return "Needs attention";
  if (normalized === "done") return "Complete";
  if (normalized === "deferred") return "Planned for later";
  if (normalized === "not_needed") return "Not needed";
  return status.replaceAll("_", " ");
}

function displayHeading(heading: string): string {
  const labels: Readonly<Record<string, string>> = {
    "Execution Mode": "Type of onboarding work",
    "Graph Run": "Work sequence",
    "Source Map And Current-State Trace": "Current experience and implementation",
    "Evidence Ledger": "What we learned and where it came from",
    "Evidence Decision And Complaint Traceability": "How findings changed the design",
    "Permissions And Lifecycle": "Push permission prime and lifecycle",
    "Prototype And Design Proof": "Prototype and design checks",
    "Compound Engineering Implementation Plan": "Implementation plan",
    Verification: "Final checks",
  };
  return labels[heading] ?? heading;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
