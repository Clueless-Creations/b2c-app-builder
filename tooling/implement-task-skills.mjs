// One-use, branch-local integration script. Removed after applying the reviewed source edits.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const read = file => readFileSync(file, 'utf8');
const write = (file, content) => { mkdirSync(path.dirname(file), {recursive:true}); writeFileSync(file, content); };
function replace(file, before, after) {
  const text = read(file);
  if (!text.includes(before)) throw new Error(`Expected source changed: ${file}: ${before.slice(0,80)}`);
  write(file, text.replace(before, after));
}
function section(text, name) {
  const start = text.indexOf(`## ${name}\n`);
  if (start < 0) throw new Error(`Missing skill section: ${name}`);
  const next = text.indexOf('\n## ', start + 4);
  return text.slice(start, next < 0 ? undefined : next).trim();
}
const originalSkill = read('SKILL.md');
const procedureRoot = 'agents/skills/b2c-app-builder/references';
write(`${procedureRoot}/setup.md`, `# Connect the builder\n\n${section(originalSkill,'Connect')}\n`);
write(`${procedureRoot}/business-lifecycle.md`, `# Managed business lifecycle\n\nLoad this procedure only for managed creation, continuation, or recovery. Focused advisory work does not require runtime setup.\n\n${section(originalSkill,'Build a business')}\n\n${section(originalSkill,'Route')}\n\n${section(originalSkill,'Boundaries')}\n\n${section(originalSkill,'Handoff')}\n`);
write(`${procedureRoot}/composition.md`, `# Change packages or providers\n\n${section(originalSkill,'Customize composition')}\n`);
write(`${procedureRoot}/mobile-operation.md`, `# Operate a mobile app\n\n${section(originalSkill,'Mobile app operation')}\n`);
write('SKILL.md', `---
name: b2c-app-builder
description: "Route consumer-app work: focused expertise, managed business creation or continuation, and explicit B2C setup. Prefer a matching task skill for scoped research, onboarding, or monetization work. Do not use for an unrelated B2B/internal tool or a narrow code fix."
metadata:
  short-description: Build and improve a consumer business
---

# B2C App Builder

Start with the user's job, not the framework. This is the default business entrypoint. Task skills project the same workflow and knowledge owners; they are not another execution system. Do not load the whole corpus.

## Focused task

Inspect the app's own instructions and affected surface. Open the matching task directly. Do not install software, require an MCP connection, create a workspace, or activate a full operating graph merely to apply the expertise. A review is read-only unless changes are also requested.

<!-- catalog-generated:start task-skills -->
<!-- catalog-generated:end task-skills -->

For another focused goal, select one workflow through the available knowledge tools or the [reference index](catalog/generated/routing.md). Read only its current instructions and relevant reference sections. With b2c_workflow, expand through route.expand and follow exact section selectors, revision hashes, and nextCall when incomplete. A summary does not prove complete guidance delivery.

## Managed business

A complete-business mandate takes precedence over an isolated idea or no-idea route. Preserve the complete founder brief without compression. For creation, initialization, continuation, or interrupted-request recovery, open the [business lifecycle](agents/skills/b2c-app-builder/references/business-lifecycle.md).

Create or resume the registered workspace, then read business-status and business-plan before catalog browsing. Use the current ready or held brief. Research and an explicit product decision precede business-initialize; authorized execution uses business-run. Keep independent ready work moving while protected effects wait. Do not infer delivery from one successful session: inspect completion.deliveryAccepted and current evidence.

Author accepted product intent in product.yaml and global design in DESIGN.md; PRODUCT.md is rendered. Never hand-author reducer-owned state. Return to status and plan after bounded work. Focused advice does not become accepted runtime evidence automatically.

## Setup request

Only when setup is requested or a managed execution path actually needs connectivity, open [connection setup](agents/skills/b2c-app-builder/references/setup.md). Local b2c-local supports registered workspace work; hosted b2c-hosted supplies read-only knowledge and cannot execute a local business. A leftover b2c-app-builder connection name is not a third capability.

Do not edit an agent configuration or install software unless the user requested setup. Keep MCP read-only by default and use the CLI for approved writes. Missing execution tooling does not block advisory work.

## Conditional procedures

For an explicit package or provider change, open [composition](agents/skills/b2c-app-builder/references/composition.md). For device interaction, screenshots, recordings, or runtime flow verification, open [mobile app operation](agents/skills/b2c-app-builder/references/mobile-operation.md). Neither is prerequisite reading for unrelated tasks.

## Boundaries

Honor accepted scope, explicit provider bindings, and actual tool availability. Provider guidance cannot add requirements or silently select another provider. Pause for access or secrets, spend, pricing or legal decisions, destructive changes, hosted deployment, store submission, or production release. A skill grants no authority.

Require current provider or device evidence before making claims about those systems. Guidance, generated artifacts, command success, and accepted evidence are different facts. Never copy credentials, provider state, names, prices, or domains from another app. Do not route current work through Planes.

Report what changed or was found, what evidence exists, what remains unverified, and the next decision. [Browse the six business areas](knowledge/README.md) only when the task needs orientation.
`);

write('catalog/areas.ts', read('catalog/areas.ts') + `
/** Public browsing vocabulary. Existing area/domain IDs above remain authority contracts. */
export interface PublicBusinessArea {
  slug: string;
  name: string;
  station: string;
  description: string;
  domainIds: readonly string[];
}

export const publicBusinessAreas: readonly PublicBusinessArea[] = [
  { slug: "opportunity", name: "Opportunity", station: "Prep & design, menu planning", description: "Research users, competitors, demand, and a defensible product hypothesis.", domainIds: ["domain.research"] },
  { slug: "product", name: "Product", station: "Prep & design", description: "Define the promise, first value, core loop, complete scope, and success measures.", domainIds: ["domain.product"] },
  { slug: "experience", name: "Experience", station: "Prep & design", description: "Develop a distinct identity, onboarding, interaction, motion, accessible states, and user-facing words.", domainIds: ["domain.experience", "domain.design", "domain.words"] },
  { slug: "engineering", name: "Engineering", station: "The hot line", description: "Build and release native and web surfaces with explicit contracts, runtime verification, privacy, and security.", domainIds: ["domain.engineering", "domain.store", "domain.trust"] },
  { slug: "revenue-and-growth", name: "Revenue and growth", station: "Front of house", description: "Establish subscriptions, acquisition, funnels, attribution, and lifecycle work.", domainIds: ["domain.money", "domain.growth", "domain.data"] },
  { slug: "learning-and-operations", name: "Learning and operations", station: "The pass and the office", description: "Inspect evidence, plan improvements, support users, coordinate work, and maintain the business.", domainIds: ["domain.data", "domain.operations", "domain.process", "domain.orchestration"] },
];
`);

replace('catalog/task-skills.ts', '...publicBusinessAreas.map((area) => `[${area.name}](#${area.slug})`).join(" · "),', 'publicBusinessAreas.map((area) => `[${area.name}](#${area.slug})`).join(" · "),');
replace('tooling/render-task-skills.ts', 'index !== rootAt + 1', '(rootAt < 0 || index !== rootAt + 1)');

replace('catalog/render-routing.ts', 'import type { Catalog } from "./types.js";', 'import type { Catalog } from "./types.js";\nimport { renderBusinessAreaTable, renderPublicKnowledgeReadme } from "./task-skills.js";');
const routing = read('catalog/render-routing.ts');
const start = routing.indexOf('export function renderKnowledgeReadme(): string {');
const end = routing.indexOf('\nexport function renderShippedPackInventory', start);
if (start < 0 || end < 0) throw new Error('Knowledge renderer owner changed.');
write('catalog/render-routing.ts', routing.slice(0,start) + 'export function renderKnowledgeReadme(catalog?: Catalog): string {\n  return renderPublicKnowledgeReadme(catalog);\n}\n' + routing.slice(end));
replace('catalog/render-routing.ts', '${renderKnowledgeReadme()}', '${renderKnowledgeReadme(catalog)}');
replace('catalog/render-routing.ts', '`${renderDomainRouting(catalog)}\\n\\n${renderReferenceIndex(catalog)}\\n`', '`# Business areas\\n\\n${renderBusinessAreaTable("../../")}\\n\\n${renderDomainRouting(catalog)}\\n\\n${renderReferenceIndex(catalog)}\\n`');

let readme = read('README.md');
const areaStart = readme.indexOf('| Area ', readme.indexOf('## What it covers'));
const areaEnd = readme.indexOf('\nEach area has workflow', areaStart);
if (areaStart < 0 || areaEnd < 0) throw new Error('README area table changed.');
readme = readme.slice(0,areaStart) + '<!-- catalog-generated:start business-areas -->\n<!-- catalog-generated:end business-areas -->\n' + readme.slice(areaEnd);
readme = readme.replace('## Get started', '## Choose how to use it\n\nUse [a focused task skill](agents/skills/README.md) for research, an onboarding review, or a monetization question. Read and apply the expertise without creating a workspace. Use the main business skill when you need coordinated, durable creation or operation through status, plan, execution, and evidence. Both use the same catalog and knowledge.\n\n[Browse the knowledge by business area](knowledge/README.md).\n\n## Get started');
write('README.md', readme);
write('agents/skills/README.md', `# Skills

Use the main business entrypoint by default. Focused task skills are optional, generated views of existing workflow contracts and supporting knowledge. They do not create another scheduler or authority model.

| Skill | Scope | Source | Business use |
| --- | --- | --- | --- |
| \`b2c-app-builder\` | business | [Main entrypoint](../../SKILL.md) | default |
| \`b2c-contributor\` | contribution | [Contributor](b2c-contributor/SKILL.md) | explicit contribution work only |
| \`b2c-maintainer\` | maintenance | [Maintainer](b2c-maintainer/SKILL.md) | repository-local, not a business installation |

## Focused tasks

<!-- catalog-generated:start task-skills -->
<!-- catalog-generated:end task-skills -->

These three task entrypoints are the initial set. [Browse all six business areas](../../knowledge/README.md) for the remaining workflows and references. Internal onboarding stages remain behind one task skill, not 23 installations.

## Installation and ownership

Read [Use task skills](../../docs/guides/task-skills.md) to export a relocatable task directory and install it explicitly in a supported host. Keep its references and notices with SKILL.md. The builder never installs a skill or edits agent configuration automatically.

The root [AGENTS.md](../../AGENTS.md) separates business, contribution, and maintenance work. Business work exits to the relevant task or business lifecycle; it does not read maintainer architecture first. Contributor and maintainer routers remain canonical authored guides. Business task skills are generated from the catalog, not authored duplicates.

Upstream relationship ownership still moves from contribution intake to maintenance after release, as defined in [ADR-0007](../../docs/decisions/0007-upstream-lifecycle-and-agent-scopes.md).
`);

replace('catalog/workflows/product-experience.ts', 'Use AppKittie, XPOZ, and Firecrawl from the bound research-intelligence recipe when those names appear; if intake deferred them, continue the evidence lane as labeled fallback rather than parking it.', 'Use the selected research implementations and their current reference procedures. Honor explicit provider bindings. If an unavailable source has an authorized fallback, label its evidence limits; do not silently replace the selected source or infer unavailable evidence.');
const moneyFile = 'catalog/workflows/growth-revenue.ts';
const moneyText = read(moneyFile);
const nodeStart = moneyText.indexOf('id: "workflow.money.revenue-monetization"');
const instructionsAt = moneyText.indexOf('    instructions:\n', nodeStart);
const readsAt = moneyText.indexOf('\n    reads:', instructionsAt);
if (nodeStart < 0 || instructionsAt < 0 || readsAt < 0) throw new Error('Revenue workflow owner changed.');
const neutral = 'Read the current strategy/OFFER_TEST.md before proposing a production price. Distinguish proposals from exact founder-approved decisions; a competitor contrast or opening build mandate is not price approval. For requested implementation, write revenue/REVENUE_OPS.md with the accepted offer, dated competitor price anchors, price disclosure, product types, purchase and restore behavior, entitlement owner, cross-platform identity, web billing when in scope, webhook reconciliation, and billing-failure recovery. Resolve the selected capability bindings before any provider action. Load only the selected implementation procedures for store-product metadata, product-type reconciliation, offering availability, sandbox and release-like smoke checks, and territory-price derivation. Preserve all applicable provider-specific requirements in those references; provider selection does not change purchase or entitlement meaning. A payment, paywall display, and entitlement grant are separate observations. Record recovery for failed payments, cancellation, refund, and restore, with an observable path back to useful access. Record the Paywall Experiment Backlog and Surface To Engine Matrix using the selected experiment implementation and its actual supported semantics; do not assume different engines are interchangeable. Judge results on cohort economics and renewal evidence, not a mock success or vendor declaration. Creating live products, changing prices, trials, discounts or renewal terms, and enabling checkout require exact founder approval. Run applicable check:revenue and check:price-derivation checks; unavailable live proof remains unresolved. A review-only request returns findings against this contract without changing products, providers, prices, or runtime state.';
write(moneyFile, moneyText.slice(0,instructionsAt) + `    instructions:\n      ${JSON.stringify(neutral)},` + moneyText.slice(readsAt));

replace('AGENTS.md', '3. Create/resume through the supported business lifecycle and inspect current `business-status` then `business-plan`.', '3. For managed work, create/resume through the supported business lifecycle and inspect current `business-status` then `business-plan`. For focused expertise, open the matching task directly without requiring runtime setup.');
replace('AGENTS.md', '- **Generated:** operation/tool lists,', '- **Generated:** catalog-backed business task skills and conditional contract references, operation/tool lists,');
replace('AGENTS.md', 'Context-first routing is [ADR-0012](docs/decisions/0012-context-first-agent-routing.md).', 'Context-first routing is [ADR-0012](docs/decisions/0012-context-first-agent-routing.md). [ADR-0014](docs/decisions/0014-task-skill-projections.md) permits generated task entrypoints over that one logical routing model, not a second planner or authority owner.');
replace('docs/architecture.md', '- One thin skill routes agents.', '- One logical business routing model serves the thin default skill and optional catalog-generated task entrypoints. Task skills expose expertise, not a second planner or authority model.');
replace('docs/architecture.md', '### MCP\n', '### Task skill projections\n\n`catalog/areas.ts` owns public business-area labels. `catalog/task-skills.ts` owns presentation-only task names and bindings to existing workflows. `tooling/render-task-skills.ts` projects their methods and conditional contracts into `agents/skills/`. The same renderer maintains the README and skill navigation. `tooling/export-task-skill.ts` creates optional guidance snapshots with bound references and notices; it never installs a skill or carries workspace authority. [ADR-0014](decisions/0014-task-skill-projections.md) defines this boundary.\n\n### MCP\n');
replace('docs/north-star-architecture.md', '### ARCH-03: Separate capability, implementation, and recipe', 'Catalog-generated task skills are entrypoint projections of this same logical owner. Public navigation may group existing domains without changing their IDs, scheduling, or authority. A task skill does not create another method store, planner, provider selector, or acceptance path. See [ADR-0014](decisions/0014-task-skill-projections.md).\n\n### ARCH-03: Separate capability, implementation, and recipe');
write('docs/public-interface.md', read('docs/public-interface.md') + '\n## Focused task skill entrypoints\n\n[Task skills](guides/task-skills.md) project catalog guidance for focused work. They add no public operation, workspace state, provider grant, or completion mechanism. Managed execution still uses this versioned business interface. Advisory findings remain separate from accepted runtime evidence.\n');

const pkg = JSON.parse(read('package.json'));
pkg.version = '0.220.0';
pkg.files.push('agents/skills/b2c-app-builder/references', 'agents/skills/b2c-research-opportunity', 'agents/skills/b2c-design-onboarding', 'agents/skills/b2c-review-monetization');
pkg.scripts['render:task-skills'] = 'tsx tooling/render-task-skills.ts';
pkg.scripts['skills:export'] = 'tsx tooling/export-task-skill.ts';
pkg.scripts['check:task-skills'] = 'tsx tooling/render-task-skills.ts --check && tsx --test checks/verification/task-skills.test.ts';
pkg.scripts['check:agent-entrypoints'] += ' && npm run check:task-skills';
pkg.scripts['render:all'] = pkg.scripts['render:all'].replace('npm run catalog:render-routing &&', 'npm run catalog:render-routing && npm run render:task-skills &&');
write('package.json', JSON.stringify(pkg,null,2)+'\n');
const lock = JSON.parse(read('package-lock.json'));
lock.version = pkg.version;
lock.packages[''].version = pkg.version;
write('package-lock.json',JSON.stringify(lock,null,2)+'\n');
const version = JSON.parse(read('skill-version.json'));
version.version = pkg.version;
version.updatedAt = '2026-09-11';
version.releaseNotes = ['Expose catalog-generated task skills for research, onboarding, and monetization review.', 'Align public navigation across six business areas and move root procedures behind conditional references.', 'Export create-only portable guidance snapshots with bound knowledge, source hashes, and notices.'];
write('skill-version.json',JSON.stringify(version,null,2)+'\n');
console.log(JSON.stringify({originalRootSkillBytes:Buffer.byteLength(originalSkill),newRootSkillBytesBeforeGeneratedRoutes:Buffer.byteLength(read('SKILL.md')),version:pkg.version}));
unlinkSync('tooling/implement-task-skills.mjs');
