#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDesignExploration, type DesignExploration } from "../../../../tooling/lib/design-exploration.js";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { loadDesignState, parseDesignCliArgs, rel, skillRoot } from "../../../../tooling/lib/design-state.js";
import { asArray, asString, collectAllFiles, isRecord, issue, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseDesignCliArgs(process.argv.slice(2));
const issues: Issue[] = [];
const contractPath = path.join(args.root, "DESIGN.md");
const hasDesignState = existsSync(args.statePath) && existsSync(contractPath);

if (!hasDesignState) {
  issues.push(issue("error", "design_room.sources_missing", "Design Room requires authored DESIGN.md and studio/seed/business.json.", args.root));
} else {
  const loaded = loadDesignState(args);
  issues.push(...loaded.issues);
  const design = loadDesignSystem(args.root);
  const designRoom = loaded.state && isRecord(loaded.state) && isRecord(loaded.state.designRoom) ? loaded.state.designRoom : {};
  const acceptance = design.frontmatter && isRecord(design.frontmatter.acceptance) ? design.frontmatter.acceptance : {};
  const explorationRequired = asString(designRoom.status) === "rendered" || asString(acceptance.status) === "accepted";
  const parsedExploration = parseDesignExploration(design.frontmatter, explorationRequired);
  issues.push(...parsedExploration.issues);
  if (loaded.state && loaded.stateHash) validateRoutesAndRender(loaded.state, loaded.stateHash, parsedExploration.exploration, issues);
}

for (const artifact of collectDesignArtifacts(args.root)) {
  issues.push(
    issue(
      "error",
      "design_room.freeform_design_artifact",
      "Put design work in DESIGN.md, structured screen or flow state, or the generated Design Room. Do not create a parallel proposal file.",
      artifact,
    ),
  );
}

reportAndExit("Design Room contract validation", issues);

function validateRoutesAndRender(state: unknown, stateHash: string, exploration: DesignExploration | undefined, target: Issue[]): void {
  if (!isRecord(state)) return;
  const designRoom = isRecord(state.designRoom) ? state.designRoom : {};
  const surfaces = isRecord(state.surfaces) ? state.surfaces : {};
  const mobileApp = isRecord(surfaces.mobileApp) ? surfaces.mobileApp : {};
  const screens = asArray(mobileApp.screens).filter(isRecord);
  const flows = asArray(mobileApp.flows).filter(isRecord);
  const screenIds = new Set<string>();
  const flowIds = new Set<string>();

  const stack = asString(mobileApp.stack);
  if (!stack || !/^[a-z0-9][a-z0-9-]*$/.test(stack)) {
    target.push(issue("error", "design_room.stack_invalid", "The selected mobile stack must be a lowercase slug.", rel(args.root, args.statePath)));
  }

  for (const platform of asArray(mobileApp.platforms)) {
    const value = asString(platform);
    if (!value || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
      target.push(issue("error", "design_room.platform_invalid", "Mobile platform IDs must be free-form lowercase slugs.", rel(args.root, args.statePath)));
    }
  }

  for (const screen of screens) {
    const id = asString(screen.id);
    if (!id) continue;
    if (screenIds.has(id)) target.push(issue("error", "design_room.screen_duplicate", `Duplicate screen ID: ${id}.`, rel(args.root, args.statePath)));
    screenIds.add(id);
  }
  for (const flow of flows) {
    const id = asString(flow.id);
    if (id) {
      if (flowIds.has(id)) target.push(issue("error", "design_room.flow_duplicate", `Duplicate flow ID: ${id}.`, rel(args.root, args.statePath)));
      flowIds.add(id);
    }
    for (const rawStep of asArray(flow.steps)) {
      const step = asString(rawStep);
      if (step && !screenIds.has(step)) {
        target.push(
          issue(
            "error",
            "design_room.flow_screen_missing",
            `Flow ${id ?? "unknown"} references screen ${step}, but that screen is not in surfaces.mobileApp.screens.`,
            rel(args.root, args.statePath),
          ),
        );
      }
    }
  }

  const renderRelative = asString(designRoom.renderPath) ?? "design/design-room.html";
  const renderPath = path.join(args.root, renderRelative);
  if (!existsSync(renderPath)) {
    target.push(issue("error", "design_room.render_missing", `Missing generated review page: ${renderRelative}.`, renderRelative));
    return;
  }
  const html = readFileSync(renderPath, "utf8");
  const hash = html.match(/<meta\s+name=["']design-state-hash["']\s+content=["']([^"']+)["']/i)?.[1];
  if (hash !== stateHash) {
    target.push(
      issue(
        "error",
        "design_room.render_stale",
        `${renderRelative} does not match the current DESIGN.md and screen or flow state. Render it again.`,
        renderRelative,
      ),
    );
  }

  const rendered = htmlText(html);
  const expected = [
    isRecord(state.business) ? asString(state.business.name) : undefined,
    stack,
    ...asArray(mobileApp.platforms).map(asString),
    ...screens.flatMap((screen) => [asString(screen.id), asString(screen.name)]),
    ...flows.flatMap((flow) => [asString(flow.id), asString(flow.name)]),
    ...(exploration?.concepts.flatMap((concept) => [
      concept.id,
      concept.name,
      concept.premise,
      concept.distinguishingMechanic,
      concept.rationale,
      concept.treatments.native,
      concept.treatments.mobileWeb,
      concept.treatments.desktopWeb,
      ...concept.referenceMappings.flatMap((mapping) => [mapping.referenceId, mapping.principle]),
    ]) ?? []),
    ...designLibraryLabels(),
  ].filter((value): value is string => Boolean(value));
  for (const value of expected) {
    if (!rendered.includes(normalize(value))) {
      target.push(issue("error", "design_room.render_semantic_mismatch", `${renderRelative} does not show current route value: ${value}.`, renderRelative));
    }
  }

  const status = asString(designRoom.status);
  if (status === "rendered" && containsPlaceholder(rendered)) {
    target.push(issue("error", "design_room.render_placeholder", "A review-ready Design Room still contains starter text.", renderRelative));
  }
}

function designLibraryLabels(): string[] {
  const labels: string[] = [];
  const indexPath = path.join(skillRoot, "surfaces/ui-library/component-index.json");
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as { components?: Array<{ id?: string }> };
    for (const component of index.components ?? []) if (component.id) labels.push(component.id);
  }
  const adaptersPath = path.join(skillRoot, "surfaces/ui-library/adapters");
  if (existsSync(adaptersPath)) {
    for (const filePath of collectAllFiles(adaptersPath).filter((candidate) => candidate.endsWith(".json"))) {
      const adapter = JSON.parse(readFileSync(filePath, "utf8")) as { adapter?: { displayName?: string } };
      if (adapter.adapter?.displayName) labels.push(adapter.adapter.displayName);
    }
  }
  return labels;
}

function collectDesignArtifacts(root: string): string[] {
  const ignored = new Set(["node_modules", ".git", "dist", "state", "render"]);
  return collectAllFiles(root)
    .map((filePath) => path.relative(root, filePath))
    .filter((relativePath) => !relativePath.split(path.sep).some((segment) => ignored.has(segment)))
    .filter((relativePath) => /(^|\/)(?:design[-_ ]?(?:proposal|concept|v\d+)|visual[-_ ]?proof|mood[-_ ]?board).*\.(?:md|html)$/i.test(relativePath));
}

function containsPlaceholder(value: string): boolean {
  return /\bApp Name\b|One-sentence promise still to be defined|Primary consumer segment still to be defined|\bNot defined\b|\bNot captured\b|\bTBD\b|\bTODO\b/i.test(
    value,
  );
}

function htmlText(value: string): string {
  return normalize(
    value
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
