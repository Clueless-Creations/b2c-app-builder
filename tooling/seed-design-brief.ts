#!/usr/bin/env node
/**
 * seed-design-brief
 *
 * Advisory seeder for state.designBrief. It derives a ui-ux-pro-max query from the
 * current Design Room state and prints a designBrief skeleton to adapt. It does NOT
 * call any external skill and does NOT mutate state unless `--write` is passed AND
 * no designBrief exists yet. The agent fills the brief from ui-ux-pro-max output
 * (reference-only: adapt its guidance, do not paste its data) then versions/renders.
 */
import { isRecord, reportAndExit, type Issue } from "./lib/launch-state.js";
import { loadDesignState, parseDesignCliArgs, readJsonFile, rel, writeJsonFile } from "./lib/design-state.js";

const args = parseDesignCliArgs(process.argv.slice(2));
const write = process.argv.includes("--write");
const loaded = loadDesignState(args);
const issues: Issue[] = [...loaded.issues];

const state = loaded.state;
const business = isRecord(state) && isRecord(state.business) ? state.business : {};
const positioning = typeof business.positioning === "string" ? business.positioning : "";
const audience = typeof business.targetAudience === "string" ? business.targetAudience : "";
const name = typeof business.name === "string" && business.name ? business.name : "the app";
const query = [positioning, audience].filter(Boolean).join(" — ") || name;

const skeleton = {
  source: "ui-ux-pro-max",
  productType: "",
  recommendedStyle: "",
  paletteMood: "",
  typographyMood: "",
  keyEffects: [] as string[],
  antiPatterns: [] as string[],
  // Audience derivation (knowledge/design/audience-derived-identity.md): fill
  // from strategy/RESEARCH.md, not from the style query — a brief with empty
  // audience fields is a trend pick, not a derivation.
  audienceFacts: [] as string[],
  appsTheyLove: [] as string[],
  antiReferences: [] as string[],
  motionNotes: "Web surfaces animate with framer-motion from the motion.* tokens; the mobile binary uses native animation; honor reduced motion.",
  generatedAt: "",
  notes: "Adapted from ui-ux-pro-max guidance; reference-only.",
};

console.log("Design Brief seeder (advisory; reference-only adaptation of ui-ux-pro-max)\n");
console.log("1) Run the ui-ux-pro-max skill with a query derived from state:");
console.log(`   /ui-ux-pro-max design system for: ${query}`);
console.log(`   (or: search.py "${query}" --design-system -p "${name}")\n`);
console.log("2) Adapt the recommendation into state.designBrief (do not paste raw data).");
console.log("   Fill audienceFacts/appsTheyLove/antiReferences from strategy/RESEARCH.md —");
console.log("   the derivation chain is knowledge/design/audience-derived-identity.md:");
console.log(JSON.stringify({ designBrief: skeleton }, null, 2));
console.log("\n3) Then: npm run validate:design-state, npm run render:design-room, and commit.");

if (write) {
  const result = readJsonFile(args.statePath);
  if (result.issue) {
    issues.push(result.issue);
  } else if (isRecord(result.value)) {
    if (isRecord(result.value.designBrief)) {
      console.log(`\nstate already has designBrief; left ${rel(args.root, args.statePath)} unchanged.`);
    } else {
      writeJsonFile(args.statePath, { ...result.value, designBrief: skeleton });
      console.log(`\nWrote a scaffold designBrief into ${rel(args.root, args.statePath)}. Fill it, then validate and render.`);
    }
  }
}

reportAndExit("Design brief seeder", issues);
