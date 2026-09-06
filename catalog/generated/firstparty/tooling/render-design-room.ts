#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseDesignExploration, type DesignExploration } from "./lib/design-exploration.js";
import { loadDesignSystem } from "./lib/design-md.js";
import { getToken, loadDesignState, parseDesignCliArgs, rel } from "./lib/design-state.js";
import { escapeHtml } from "./lib/html.js";
import { asArray, asString, isRecord, reportAndExit } from "./lib/launch-state.js";

interface ScreenView {
  id: string;
  name: string;
  status: string;
  purpose: string;
  decisions: string[];
  tokenReferences: string[];
}

interface FlowView {
  id: string;
  name: string;
  status: string;
  steps: string[];
}

interface ComponentView {
  id: string;
  name: string;
  maturity: string;
}

interface AdapterView {
  id: string;
  displayName: string;
  stack: string;
  implementations: Array<{ contractId: string; maturity: string }>;
}

interface DesignLibraryView {
  components: ComponentView[];
  adapters: AdapterView[];
}

const args = parseDesignCliArgs(process.argv.slice(2));
const loaded = loadDesignState(args);
const design = loadDesignSystem(args.root);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const library = loadDesignLibrary(skillRoot);
const designRoomState = loaded.state && isRecord(loaded.state) && isRecord(loaded.state.designRoom) ? loaded.state.designRoom : {};
const acceptance = design.frontmatter && isRecord(design.frontmatter.acceptance) ? design.frontmatter.acceptance : {};
const explorationRequired = asString(designRoomState.status) === "rendered" || asString(acceptance.status) === "accepted";
const parsedExploration = parseDesignExploration(design.frontmatter, explorationRequired);
const renderIssues = [...loaded.issues, ...parsedExploration.issues];

if (!loaded.state || !loaded.tokens || !loaded.stateHash) {
  reportAndExit("Design Room render", renderIssues);
  process.exit();
}

if (renderIssues.some((item) => item.severity === "error")) {
  reportAndExit("Design Room render", renderIssues);
  process.exit();
}
const outputPath = args.outputPath ?? path.join(args.root, "design/design-room.html");
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  renderStaticHtml(loaded.state, loaded.tokens, loaded.stateHash, library, parsedExploration.exploration).replace(/[ \t]+$/gm, ""),
  "utf8",
);
console.log(`Design Room static HTML written to ${rel(args.root, outputPath)}`);

reportAndExit("Design Room render", renderIssues);

function renderStaticHtml(state: unknown, tokens: unknown, stateHash: string, library: DesignLibraryView, exploration: DesignExploration | undefined): string {
  const business = isRecord(state) && isRecord(state.business) ? state.business : {};
  const designBrief = isRecord(state) && isRecord(state.designBrief) ? state.designBrief : undefined;
  const designRoom = isRecord(state) && isRecord(state.designRoom) ? state.designRoom : {};
  const surfaces = isRecord(state) && isRecord(state.surfaces) ? state.surfaces : {};
  const mobileApp = isRecord(surfaces.mobileApp) ? surfaces.mobileApp : {};
  const contractPath = asString(designRoom.contractPath) ?? "DESIGN.md";
  const stack = asString(mobileApp.stack) ?? "unselected";
  const platforms = strings(mobileApp.platforms);
  const screens = screensFrom(mobileApp.screens);
  const flows = flowsFrom(mobileApp.flows);
  const screenById = new Map(screens.map((screen) => [screen.id, screen]));
  const componentCards = library.components
    .map(
      (component) => `<article class="card">
        <div class="cardHead">
          <div><p class="eyebrow">${escapeHtml(component.id)}</p><h3>${escapeHtml(component.name)}</h3></div>
          ${statusBadge(component.maturity)}
        </div>
      </article>`,
    )
    .join("");
  const adapterCards = library.adapters
    .map((adapter) => {
      const covered = new Set(adapter.implementations.map((implementation) => implementation.contractId)).size;
      const selected = adapter.stack === stack || adapter.id === stack;
      return `<article class="card">
        <div class="cardHead">
          <div><p class="eyebrow">${escapeHtml(adapter.stack)}${selected ? " · selected" : ""}</p><h3>${escapeHtml(adapter.displayName)}</h3></div>
          ${statusBadge(covered === library.components.length ? "implemented" : "partial")}
        </div>
        <p class="muted">${covered} of ${library.components.length} reusable contracts mapped to real source.</p>
      </article>`;
    })
    .join("");

  const platformPills = platforms.length
    ? platforms.map((platform) => `<span class="pill platform">${escapeHtml(platform)}</span>`).join("")
    : '<p class="empty">No mobile target is selected yet.</p>';

  const flowCards = flows.length
    ? flows
        .map((flow) => {
          const steps = flow.steps.length
            ? `<ol class="flowSteps">${flow.steps
                .map((stepId) => {
                  const screen = screenById.get(stepId);
                  return `<li class="${screen ? "linked" : "unlinked"}">
                    <span>${escapeHtml(screen?.name ?? stepId)}</span>
                    <small>${escapeHtml(screen ? screen.id : "Screen not linked")}</small>
                  </li>`;
                })
                .join("")}</ol>`
            : '<p class="empty">No screen sequence is recorded.</p>';
          return `<article class="card flowCard">
            <div class="cardHead">
              <div><p class="eyebrow">${escapeHtml(flow.id)}</p><h3>${escapeHtml(flow.name)}</h3></div>
              ${statusBadge(flow.status)}
            </div>
            ${steps}
          </article>`;
        })
        .join("")
    : '<p class="empty">No flows are recorded in the design state.</p>';

  const screenCards = screens.length
    ? screens
        .map((screen) => {
          const usedBy = flows.filter((flow) => flow.steps.includes(screen.id));
          const relationships = usedBy.length
            ? usedBy.map((flow) => `<span class="reference">${escapeHtml(flow.name)}</span>`).join("")
            : '<span class="muted">Not linked to a flow</span>';
          const decisions = screen.decisions.length
            ? `<ul>${screen.decisions.map((decision) => `<li>${escapeHtml(decision)}</li>`).join("")}</ul>`
            : '<p class="muted">No screen decisions recorded.</p>';
          const tokenReferences = screen.tokenReferences.length
            ? `<div class="references">${screen.tokenReferences.map((token) => `<code>${escapeHtml(token)}</code>`).join("")}</div>`
            : "";
          return `<article class="card screenCard" id="screen-${escapeHtml(screen.id)}">
            <div class="cardHead">
              <div><p class="eyebrow">${escapeHtml(screen.id)}</p><h3>${escapeHtml(screen.name)}</h3></div>
              ${statusBadge(screen.status)}
            </div>
            <p>${escapeHtml(screen.purpose) || '<span class="muted">Purpose not recorded.</span>'}</p>
            ${decisions}
            ${tokenReferences}
            <div class="relationships"><strong>Used in</strong>${relationships}</div>
          </article>`;
        })
        .join("")
    : '<p class="empty">No screens are recorded in the design state.</p>';
  const explorationCards = exploration
    ? exploration.concepts
        .map(
          (concept) => `<article class="card conceptCard">
        <div class="cardHead">
          <div><p class="eyebrow">${escapeHtml(concept.id)}</p><h3>${escapeHtml(concept.name)}</h3></div>
          ${statusBadge(concept.decision)}
        </div>
        <p class="conceptPremise">${escapeHtml(concept.premise)}</p>
        <p class="conceptLabel">Distinguishing mechanic</p>
        <p>${escapeHtml(concept.distinguishingMechanic)}</p>
        <div class="treatmentGrid">
          <div><strong>Native</strong><p>${escapeHtml(concept.treatments.native)}</p></div>
          <div><strong>Mobile web</strong><p>${escapeHtml(concept.treatments.mobileWeb)}</p></div>
          <div><strong>Desktop web</strong><p>${escapeHtml(concept.treatments.desktopWeb)}</p></div>
        </div>
        <p class="conceptLabel">Reference principles</p>
        <ul>${concept.referenceMappings
          .map((mapping) => `<li><code>${escapeHtml(mapping.referenceId)}</code> ${escapeHtml(mapping.principle)}</li>`)
          .join("")}</ul>
        <p class="conceptLabel">Decision rationale</p>
        <p>${escapeHtml(concept.rationale)}</p>
      </article>`,
        )
        .join("")
    : '<p class="empty">Direction exploration has not been recorded in DESIGN.md.</p>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="design-state-hash" content="${escapeHtml(stateHash)}" />
  <meta name="design-contract-path" content="${escapeHtml(contractPath)}" />
  <title>${escapeHtml(business.name ?? "App")} Design Room</title>
  <style>
    :root {
      --color-background: ${cssToken(tokens, "color.background")};
      --color-surface: ${cssToken(tokens, "color.surface")};
      --color-surface-elevated: ${cssToken(tokens, "color.surfaceElevated")};
      --color-primary: ${cssToken(tokens, "color.primary")};
      --color-accent: ${cssToken(tokens, "color.accent")};
      --color-text: ${cssToken(tokens, "color.text")};
      --color-muted: ${cssToken(tokens, "color.muted")};
      --color-border: ${cssToken(tokens, "color.border")};
      --font-display: ${cssToken(tokens, "font.display.family")};
      --font-body: ${cssToken(tokens, "font.body.family")};
      --radius-md: ${cssToken(tokens, "radius.md")};
      --space-md: ${cssToken(tokens, "space.md")};
      --space-lg: ${cssToken(tokens, "space.lg")};
      --motion-duration-base: ${cssToken(tokens, "motion.durationBase")};
      --motion-easing: ${cssToken(tokens, "motion.easing")};
    }
    @media (prefers-reduced-motion: no-preference) {
      .card { animation: design-room-rise var(--motion-duration-base, 220ms) var(--motion-easing, ease) both; }
    }
    @keyframes design-room-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 28%),
        linear-gradient(135deg, var(--color-background), color-mix(in srgb, var(--color-primary) 9%, var(--color-background)));
      color: var(--color-text);
      font: 15px/1.5 var(--font-body);
    }
    header { padding: 36px clamp(18px, 5vw, 56px) 28px; border-bottom: 1px solid var(--color-border); }
    h1 { margin: 0; font: 700 clamp(38px, 8vw, 84px)/0.92 var(--font-display); max-width: 900px; }
    h2 { margin: 0 0 14px; font: 700 clamp(24px, 4vw, 38px)/1 var(--font-display); }
    h3 { margin: 0; font: 700 20px/1.1 var(--font-display); }
    p { margin: 0; }
    main { display: grid; gap: 18px; padding: 24px clamp(18px, 5vw, 56px) 56px; }
    section { background: color-mix(in srgb, var(--color-surface) 94%, white); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 20px; overflow: hidden; }
    ul { margin: 14px 0 0; padding-left: 20px; }
    li + li { margin-top: 6px; }
    code { border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface); padding: 4px 7px; color: var(--color-muted); font-size: 12px; }
    .eyebrow { color: var(--color-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .intro { max-width: 760px; margin-top: 14px; color: var(--color-muted); }
    .meta, .pills, .references { display: flex; flex-wrap: wrap; gap: 8px; }
    .meta { margin-top: 18px; }
    .pill, .reference, .status { border: 1px solid var(--color-border); border-radius: 999px; padding: 6px 10px; }
    .pill { background: var(--color-surface); }
    .platform { font-weight: 700; }
    .status { background: var(--color-surface); color: var(--color-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
    .status-ready, .status-approved, .status-published { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border)); }
    .status-blocked { color: #9b332b; border-color: color-mix(in srgb, #9b332b 42%, var(--color-border)); }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .card { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-elevated); padding: 16px; min-width: 0; }
    .cardHead { display: flex; justify-content: space-between; align-items: start; gap: 14px; }
    .screenCard > p { margin-top: 12px; }
    .flowSteps { display: flex; flex-wrap: wrap; align-items: stretch; gap: 22px; margin: 18px 0 0; padding: 0; list-style: none; counter-reset: flow-step; }
    .flowSteps li { position: relative; min-width: 150px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); padding: 12px; counter-increment: flow-step; }
    .flowSteps li::before { content: counter(flow-step); display: block; color: var(--color-primary); font-weight: 800; }
    .flowSteps li:not(:last-child)::after { content: "→"; position: absolute; right: -17px; top: 50%; color: var(--color-muted); transform: translateY(-50%); }
    .flowSteps span, .flowSteps small { display: block; }
    .flowSteps span { margin-top: 5px; font-weight: 700; }
    .flowSteps small { margin-top: 3px; color: var(--color-muted); }
    .flowSteps .unlinked { border-style: dashed; }
    .relationships { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 16px; border-top: 1px solid var(--color-border); padding-top: 12px; }
    .relationships strong { margin-right: 2px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .reference { background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface)); color: var(--color-primary); font-size: 12px; }
    .references { margin-top: 14px; }
    .conceptCard { display: grid; gap: 12px; }
    .conceptPremise { color: var(--color-muted); }
    .conceptLabel { margin-top: 4px; color: var(--color-muted); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
    .treatmentGrid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .treatmentGrid > div { border-left: 2px solid var(--color-border); padding-left: 10px; }
    .treatmentGrid strong { font-size: 12px; }
    .treatmentGrid p { margin-top: 3px; color: var(--color-muted); }
    .empty { border: 1px dashed var(--color-border); border-radius: var(--radius-md); padding: 18px; color: var(--color-muted); }
    .muted { color: var(--color-muted); }
    .direction { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .direction article { border-top: 1px solid var(--color-border); padding-top: 10px; }
    .direction h3 { margin-bottom: 7px; font-size: 15px; }
    .swatches { display: flex; flex-wrap: wrap; gap: 10px; }
    .swatch { display: grid; gap: 7px; min-width: 118px; color: var(--color-muted); font-size: 12px; }
    .swatch::before { content: ""; display: block; height: 42px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--swatch); }
    details.techDetails { border: 1px dashed var(--color-border); background: transparent; }
    details.techDetails summary { cursor: pointer; color: var(--color-muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    details.techDetails p { margin-top: 8px; color: var(--color-muted); font-size: 13px; }
    @media (max-width: 680px) {
      .flowSteps { display: grid; gap: 24px; }
      .flowSteps li:not(:last-child)::after { content: "↓"; right: auto; left: 50%; top: auto; bottom: -23px; transform: translateX(-50%); }
    }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">Design Room · read-only review</p>
    <h1>${escapeHtml(business.name ?? "Untitled app")}</h1>
    <p class="intro">Review the selected mobile targets, the paths people take, and the screens those paths use. Edit the design sources, then render this page again.</p>
    <div class="meta">
      ${statusBadge(asString(designRoom.status) ?? "not_started")}
      <span class="pill">Contract: ${escapeHtml(contractPath)}</span>
      <span class="pill">Updated: ${escapeHtml(isRecord(state) ? state.updatedAt : "")}</span>
    </div>
  </header>
  <main>
    <section>
      <p class="eyebrow">Direction exploration</p>
      <h2>Distinct concepts and the recorded choice</h2>
      <div class="grid">${explorationCards}</div>
    </section>
    <section>
      <p class="eyebrow">Mobile targets</p>
      <h2>Chosen implementation surface</h2>
      <div class="pills"><span class="pill platform">Stack: ${escapeHtml(stack)}</span>${platformPills}</div>
    </section>
    <section>
      <p class="eyebrow">Experience map</p>
      <h2>Flows</h2>
      <div class="grid">${flowCards}</div>
    </section>
    <section>
      <p class="eyebrow">Screen inventory</p>
      <h2>Screens</h2>
      <div class="grid">${screenCards}</div>
    </section>
    <section>
      <p class="eyebrow">Reusable system</p>
      <h2>Component contracts</h2>
      <div class="grid">${componentCards || '<p class="empty">No reusable component contracts are registered.</p>'}</div>
    </section>
    <section>
      <p class="eyebrow">Native implementation</p>
      <h2>Adapter coverage</h2>
      <div class="grid">${adapterCards || '<p class="empty">No native adapter is implemented yet.</p>'}</div>
      ${stack !== "unselected" && !library.adapters.some((adapter) => adapter.stack === stack || adapter.id === stack) ? `<p class="empty">The selected ${escapeHtml(stack)} stack has no registered reference adapter. Implement and prove its native mapping before calling it supported.</p>` : ""}
    </section>
    <section>
      <p class="eyebrow">Product intent</p>
      <h2>What the experience must do</h2>
      <div class="direction">
        <article><h3>Positioning</h3><p>${escapeHtml(business.positioning) || '<span class="muted">Not defined.</span>'}</p></article>
        <article><h3>Audience</h3><p>${escapeHtml(business.targetAudience) || '<span class="muted">Not defined.</span>'}</p></article>
      </div>
    </section>
    ${
      designBrief
        ? `<section>
      <p class="eyebrow">Design direction</p>
      <h2>Visual and interaction intent</h2>
      <div class="direction">
        <article><h3>Style</h3><p>${escapeHtml(designBrief.recommendedStyle) || '<span class="muted">Not set.</span>'}</p></article>
        <article><h3>Palette</h3><p>${escapeHtml(designBrief.paletteMood) || '<span class="muted">Not set.</span>'}</p></article>
        <article><h3>Typography</h3><p>${escapeHtml(designBrief.typographyMood) || '<span class="muted">Not set.</span>'}</p></article>
      </div>
    </section>`
        : ""
    }
    <section>
      <p class="eyebrow">Shared tokens</p>
      <h2>Color anchors</h2>
      <div class="swatches">
        ${(
          [
            ["Background", "color.background"],
            ["Surface", "color.surface"],
            ["Primary", "color.primary"],
            ["Accent", "color.accent"],
            ["Text", "color.text"],
            ["Border", "color.border"],
          ] as const
        )
          .map(
            ([label, tokenPath]) =>
              `<span class="swatch" style="--swatch: ${escapeHtml(String(getToken(tokens, tokenPath) ?? "transparent"))}">${escapeHtml(label)}<code>${escapeHtml(tokenPath)}</code></span>`,
          )
          .join("")}
      </div>
    </section>
    <details class="techDetails">
      <summary>Technical details</summary>
      <p>State hash: ${escapeHtml(stateHash)}</p>
      <p>Design contract: ${escapeHtml(contractPath)}</p>
      <p>Authored token source: DESIGN.md</p>
      ${designBrief ? `<p>Design brief source: ${escapeHtml(designBrief.source)}</p>` : ""}
    </details>
  </main>
</body>
</html>
`;
}

function screensFrom(value: unknown): ScreenView[] {
  return asArray(value)
    .filter(isRecord)
    .map((screen) => ({
      id: asString(screen.id) ?? "unknown-screen",
      name: asString(screen.name) ?? "Unnamed screen",
      status: asString(screen.status) ?? "not_started",
      purpose: asString(screen.purpose) ?? "",
      decisions: strings(screen.decisions),
      tokenReferences: strings(screen.tokenReferences),
    }));
}

function flowsFrom(value: unknown): FlowView[] {
  return asArray(value)
    .filter(isRecord)
    .map((flow) => ({
      id: asString(flow.id) ?? "unknown-flow",
      name: asString(flow.name) ?? "Unnamed flow",
      status: asString(flow.status) ?? "not_started",
      steps: strings(flow.steps),
    }));
}

function strings(value: unknown): string[] {
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function statusBadge(status: string): string {
  const cssStatus = status
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]/g, "-");
  return `<span class="status status-${escapeHtml(cssStatus)}">${escapeHtml(status.replaceAll("_", " "))}</span>`;
}

function cssToken(tokens: unknown, tokenPath: string): string {
  return String(getToken(tokens, tokenPath) ?? "initial");
}

function loadDesignLibrary(root: string): DesignLibraryView {
  const indexPath = path.join(root, "surfaces/ui-library/component-index.json");
  const components: ComponentView[] = [];
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as { components?: Array<{ id?: string; path?: string }> };
    for (const entry of index.components ?? []) {
      if (!entry.id || !entry.path) continue;
      const contractPath = path.join(root, "surfaces", "ui-library", entry.path);
      if (!existsSync(contractPath)) continue;
      const markdown = readFileSync(contractPath, "utf8");
      const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const parsed = frontmatter ? parseYaml(frontmatter[1] ?? "") : undefined;
      const metadata = isRecord(parsed) ? parsed : {};
      components.push({
        id: asString(metadata.id) ?? entry.id,
        name: asString(metadata.name) ?? entry.id,
        maturity: asString(metadata.maturity) ?? "specified",
      });
    }
  }

  const adapters: AdapterView[] = [];
  const adaptersDir = path.join(root, "surfaces/ui-library/adapters");
  if (existsSync(adaptersDir)) {
    for (const file of readdirSync(adaptersDir)
      .filter((name) => name.endsWith(".json"))
      .sort()) {
      const parsed = JSON.parse(readFileSync(path.join(adaptersDir, file), "utf8")) as unknown;
      if (!isRecord(parsed) || !isRecord(parsed.adapter)) continue;
      const implementations = asArray(parsed.implementations)
        .filter(isRecord)
        .map((implementation) => ({
          contractId: asString(implementation.contractId) ?? "unknown",
          maturity: asString(implementation.maturity) ?? "implemented",
        }));
      adapters.push({
        id: asString(parsed.adapter.id) ?? path.basename(file, ".json"),
        displayName: asString(parsed.adapter.displayName) ?? path.basename(file, ".json"),
        stack: asString(parsed.adapter.stack) ?? path.basename(file, ".json"),
        implementations,
      });
    }
  }

  return { components, adapters };
}
