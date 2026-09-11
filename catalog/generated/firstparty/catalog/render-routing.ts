#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DELIBERATELY_UNDECLARED_PROVIDER_IDS, findProvisioningProvider, PROVISIONING_MANIFEST } from "../adapters/provisioning/requirements.js";
import { accessRouteValues } from "../kernel/schema/types.js";
import { isMainModule } from "../tooling/lib/cli-entrypoint.js";
import { resolveSkillRoot } from "../tooling/lib/skill-root.js";
import {
  knowledgeFreshnessPinFromSnapshot,
  knowledgeFreshnessPinPath,
  loadKnowledgeFreshnessPin,
  serializeKnowledgeFreshnessPin,
} from "../tooling/lib/knowledge-freshness-pin.js";
import { renderFirstpartyPackage } from "./packs/firstparty.js";
import { composeCatalog } from "./index.js";
import { loadPackManifests } from "./packs/load.js";
import type { Catalog } from "./types.js";
import { renderBusinessAreaTable, renderPublicKnowledgeReadme } from "./task-skills.js";

/**
 * Renders catalog/generated/routing.md and catalog/generated/spine.md from catalog data —
 * ported from runtime/graph/render.ts's renderDomainRouting()/renderPhaseSpine() and
 * tooling/render-skill-graph.ts's CLI/--check pattern, restructured against catalog/
 * types. This is the concrete implementation of R20's inversion: domain routing and the
 * phase spine are now GENERATED from catalog/domains.ts, catalog/phases.ts, and
 * self-registering knowledge-package manifests, rather than the old catalog scraping a
 * hand-authored README table.
 *
 * These render into catalog/generated/ AND splice into SKILL.md's Lane Routing table
 * (KTD13/U11: the 14 knowledge/<slug>/README.md routing tables that used to anchor each
 * row's "Load" column are deleted at cutover — see catalog/domains.ts's header — so the
 * "Load" column now points at this file's own Reference Index section instead of a
 * per-domain file). SKILL.md sits at the skill root; catalog/generated/routing.md sits two
 * directories down, so its own knowledge-file links use a `../../` prefix back to the skill
 * root (see renderReferenceIndex below) — when the SAME domain-routing table is spliced into
 * SKILL.md, that prefix is stripped: a link from SKILL.md to this file needs no `../../` at
 * all, since SKILL.md already sits where those two `../../` would have landed.
 */

export const generatedStart = (name: string): string => `<!-- catalog-generated:start ${name} -->`;
export const generatedEnd = (name: string): string => `<!-- catalog-generated:end ${name} -->`;

/**
 * GitHub-flavored-markdown heading anchor: lowercase, strip everything but word
 * characters/spaces/hyphens, collapse spaces to hyphens. Must stay in lockstep with
 * renderReferenceIndex's `## ${domain.name}` headings below — both derive the same anchor
 * from the same domain.name so the domain-routing table's row links resolve.
 */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/**
 * @param hrefPrefix Prepended to the `#anchor` fragment. Empty string for a same-file anchor
 *   (catalog/generated/routing.md linking to its own Reference Index section below);
 *   "catalog/generated/routing.md" when this table is spliced into SKILL.md, so the row
 *   links out to that file's section instead.
 */
export function renderDomainRouting(catalog: Catalog, hrefPrefix = ""): string {
  const rows = catalog.domains
    .filter((domain) => domain.slug !== "machine")
    .sort((a, b) => a.order - b.order)
    .map((domain) => `| ${domain.routeLabel} | ${domain.routeWhen} | [Index](${hrefPrefix}#${slugifyHeading(domain.name)}) |`)
    .join("\n");
  return [
    generatedStart("domain-routing"),
    "# Domain Routing",
    "",
    "Generated from catalog/domains.ts. Edit the catalog, not this file.",
    "",
    "| Area of the business | Route here when | Load |",
    "| --- | --- | --- |",
    rows,
    "",
    generatedEnd("domain-routing"),
  ].join("\n");
}

export function renderReferenceIndex(catalog: Catalog): string {
  const byDomain = new Map<string, typeof catalog.references>();
  for (const reference of catalog.references) {
    const list = byDomain.get(reference.domainId) ?? [];
    list.push(reference);
    byDomain.set(reference.domainId, list);
  }
  // References no workflow triggers directly load through a role's context pack instead. The
  // table marks them so a reader can tell "load when this work fires" apart from "on hand
  // whenever this role is active" without opening the catalog.
  const workflowBound = new Set(catalog.workflows.flatMap((workflow) => workflow.referenceIds));
  const packTitlesByReference = new Map<string, string[]>();
  for (const pack of catalog.contextPacks) {
    for (const referenceId of pack.referenceIds) {
      packTitlesByReference.set(referenceId, [...(packTitlesByReference.get(referenceId) ?? []), pack.title]);
    }
  }
  const sections = catalog.domains
    .filter((domain) => byDomain.has(domain.id))
    .sort((a, b) => a.order - b.order)
    .map((domain) => {
      const rows = (byDomain.get(domain.id) ?? [])
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((reference) => {
          const roleScoped =
            !workflowBound.has(reference.id) && packTitlesByReference.has(reference.id)
              ? ` _(role-scoped: on hand via the ${packTitlesByReference.get(reference.id)!.join(", ")} pack${packTitlesByReference.get(reference.id)!.length > 1 ? "s" : ""}, not task-triggered)_`
              : "";
          return `| ${reference.loadWhen}${roleScoped} | [\`${reference.path}\`](../../${reference.path}) |`;
        })
        .join("\n");
      return `## ${domain.name}\n\n| Load when | Reference |\n| --- | --- |\n${rows}`;
    })
    .join("\n\n");
  return [
    generatedStart("reference-index"),
    "# Reference Index",
    "",
    "Generated from catalog/knowledge/**/*.yaml.",
    "",
    sections,
    "",
    generatedEnd("reference-index"),
  ].join("\n");
}

export function renderPhaseSpine(catalog: Catalog): string {
  const rows = [...catalog.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase) => `| ${phase.label} | ${phase.focus} | ${phase.primaryOutput} |`)
    .join("\n");
  return [
    generatedStart("phase-spine"),
    "# Phase Spine",
    "",
    "Generated from catalog/phases.ts. Edit the catalog, not this file.",
    "",
    "| Phase | Focus | Primary output |",
    "| --- | --- | --- |",
    rows,
    "",
    generatedEnd("phase-spine"),
  ].join("\n");
}

/**
 * The phase × area cross-reference: which business areas carry work in each phase, linking into
 * routing.md's per-area Reference Index. Before this table, an agent answering "what knowledge
 * matters for my current phase" had to intersect two flat projections by hand (routing.md is
 * domain → knowledge, the spine is phase → output). Workflows with no phase binding are real,
 * always-on work — they get a named Cross-phase row instead of silently missing.
 */
export function renderPhaseAreaMatrix(catalog: Catalog): string {
  const domainsById = new Map(catalog.domains.map((domain) => [domain.id, domain]));
  const areaCell = (workflowList: Catalog["workflows"]): string => {
    const counts = new Map<Catalog["workflows"][number]["domainId"], number>();
    for (const workflow of workflowList) counts.set(workflow.domainId, (counts.get(workflow.domainId) ?? 0) + 1);
    const parts = [...counts.entries()]
      .map(([domainId, count]) => ({ domain: domainsById.get(domainId)!, count }))
      .sort((a, b) => a.domain.order - b.domain.order)
      .map(({ domain, count }) => `[${domain.routeLabel}](routing.md#${slugifyHeading(domain.name)}) (${count})`);
    return parts.length ? parts.join(" · ") : "—";
  };
  const businessWorkflows = catalog.workflows.filter((workflow) => domainsById.get(workflow.domainId)?.slug !== "machine");
  const phaseRows = [...catalog.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase) => `| ${phase.label} | ${areaCell(businessWorkflows.filter((workflow) => workflow.phaseIds.includes(phase.id)))} |`);
  const crossPhase = businessWorkflows.filter((workflow) => workflow.phaseIds.length === 0);
  return [
    generatedStart("phase-area-matrix"),
    "# Work By Phase And Area",
    "",
    "Generated from catalog/workflows and catalog/domains.ts. Each cell links to the area's Reference Index section.",
    "",
    "| Phase | Areas with work |",
    "| --- | --- |",
    ...phaseRows,
    `| Cross-phase (always-on) | ${areaCell(crossPhase)} |`,
    "",
    generatedEnd("phase-area-matrix"),
  ].join("\n");
}

/**
 * The per-node contract sheet: what each workflow node consumes, produces, knows, and touches.
 * routing.md answers "what do I load when" and spine.md answers "what comes next"; before this
 * projection, the only ways to see a node's full contract were reading catalog/workflows/*.ts
 * or running plan:frontier. Providers render with the access routes their provisioning-manifest
 * entry declares (a TS import, not a filesystem read — the render-drift fixture's scratch skill
 * root ships no manifest). An empty field renders as "—" deliberately: "no providers" is itself
 * contract information, not a gap.
 */
export function renderNodeContracts(catalog: Catalog): string {
  const rolesById = new Map(catalog.roles.map((role) => [role.id, role]));
  const phasesById = new Map(catalog.phases.map((phase) => [phase.id, phase]));
  const referencesById = new Map(catalog.references.map((reference) => [reference.id, reference]));
  const undeclaredIds = new Set(DELIBERATELY_UNDECLARED_PROVIDER_IDS);
  const codeList = (values: readonly string[]): string => (values.length ? values.map((value) => `\`${value}\``).join(", ") : "—");
  const providerCell = (providerId: string): string => {
    if (undeclaredIds.has(providerId)) return `\`${providerId}\` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts)`;
    const provider = findProvisioningProvider(providerId);
    return provider ? `\`${providerId}\` (${provider.accessRoutes.join(", ")})` : `\`${providerId}\``;
  };
  const sections = [...catalog.domains]
    .sort((a, b) => a.order - b.order)
    .map((domain) => {
      const workflows = catalog.workflows.filter((workflow) => workflow.domainId === domain.id);
      if (workflows.length === 0) return "";
      const nodes = workflows.map((workflow) => {
        const phases = workflow.phaseIds.length
          ? workflow.phaseIds.map((phaseId) => phasesById.get(phaseId)?.label ?? phaseId).join(", ")
          : "Cross-phase (always-on)";
        const knowledge = workflow.referenceIds.length
          ? workflow.referenceIds
              .map((referenceId) => referencesById.get(referenceId))
              .filter((reference): reference is NonNullable<typeof reference> => reference !== undefined)
              .map((reference) => `[${reference.title}](../../${reference.path})`)
              .join(", ")
          : "—";
        return [
          `### ${workflow.title}`,
          "",
          `_${workflow.trigger}_`,
          "",
          `- **Role:** ${rolesById.get(workflow.roleId)?.name ?? workflow.roleId}`,
          `- **Phases:** ${phases}`,
          `- **Providers:** ${workflow.providerIds.length ? workflow.providerIds.map(providerCell).join(", ") : "—"}`,
          `- **Reads:** ${codeList(workflow.reads)}`,
          `- **Consults:** ${codeList(workflow.consults)}`,
          `- **Produces:** ${codeList(workflow.outputPaths)}`,
          `- **Gates:** ${codeList(workflow.gateCommands)}`,
          `- **Knowledge:** ${knowledge}`,
        ].join("\n");
      });
      return `## ${domain.name}\n\n${nodes.join("\n\n")}`;
    })
    .filter((section) => section.length > 0)
    .join("\n\n");
  return [
    generatedStart("node-contracts"),
    "# Node Contracts",
    "",
    "Generated from catalog/workflows and adapters/provisioning/requirements.ts. Edit the catalog, not this file.",
    "",
    "One entry per workflow node: what it consumes (Reads blocks readiness; Consults is open-if-present),",
    "what it produces, the knowledge bound to it, and the providers it touches with the access routes each",
    "provider declares. The chosen route for a running business lives in state, not here.",
    "",
    sections,
    "",
    generatedEnd("node-contracts"),
  ].join("\n");
}

/** Provider × access-route matrix from the provisioning manifest: what each provider supports. */
export function renderProviderRouteMatrix(): string {
  const rows = PROVISIONING_MANIFEST.map((provider) => {
    const cells = accessRouteValues.map((route) => (provider.accessRoutes.includes(route) ? "✓" : "")).join(" | ");
    return `| \`${provider.providerId}\` | ${provider.capability} | ${cells} |`;
  });
  return [
    generatedStart("provider-route-matrix"),
    "# Provider Access Routes",
    "",
    "Generated from adapters/provisioning/requirements.ts. Edit the manifest, not this file.",
    "",
    `| Provider | Capability | ${accessRouteValues.join(" | ")} |`,
    `| --- | --- | ${accessRouteValues.map(() => "---").join(" | ")} |`,
    ...rows,
    "",
    `Not listed: ${DELIBERATELY_UNDECLARED_PROVIDER_IDS.map((id) => `\`${id}\``).join(", ")} — deliberately`,
    "undeclared local tooling sharing `provider.in-app-ios-simulator`'s no-secret shape (see",
    "adapters/provisioning/requirements.ts).",
    "",
    generatedEnd("provider-route-matrix"),
  ].join("\n");
}

/** The generated orientation stub for readers who land in knowledge/ directly. */
export function renderKnowledgeReadme(catalog?: Catalog): string {
  return renderPublicKnowledgeReadme(catalog);
}

export function renderShippedPackInventory(skillRoot: string): string {
  const manifests = loadPackManifests(skillRoot);
  const packs = manifests
    .map((pack) => ({
      id: pack.id,
      kind: pack.kind,
      version: pack.version,
      revision: pack.revision,
      dependsOn: [...pack.dependsOn].sort(),
      extensionSlots: [...new Set(pack.capabilities.flatMap((item) => item.extensionSlots))].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return `${JSON.stringify({ schemaVersion: "1.0.0", packs }, null, 2)}\n`;
}

export function renderRepositoryProfiles(catalog: Catalog): string {
  const profiles = catalog.repositoryProfiles ?? [];
  const rows = profiles
    .map(
      (profile) =>
        `| \`${profile.id}\` | ${profile.title} | ${profile.responsibility} | ${profile.alwaysCanonical.map((item) => `\`${item}\``).join(", ") || "—"} | ${profile.requireReadme ? "yes" : "no"} | ${profile.requireCommunityHealth ? "yes" : "no"} |`,
    )
    .join("\n");
  return [
    generatedStart("repository-profiles"),
    "# Repository Profiles",
    "",
    "Generated from catalog/repository-profiles/registry.ts. Edit the registry, not this file.",
    "",
    "Launch scope (`essentials` / `full`) is a different field. Absence of a profile keeps current validator routing.",
    "",
    "| Id | Title | Responsibility | Always canonical | README | Community files |",
    "| --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    generatedEnd("repository-profiles"),
  ].join("\n");
}

export function renderGeneratedFiles(catalog: Catalog): Record<string, string> {
  return {
    "catalog/generated/routing.md": `# Business areas\n\n${renderBusinessAreaTable("../../")}\n\n${renderDomainRouting(catalog)}\n\n${renderReferenceIndex(catalog)}\n`,
    "catalog/generated/spine.md": `${renderPhaseSpine(catalog)}\n\n${renderPhaseAreaMatrix(catalog)}\n`,
    "catalog/generated/contracts.md": `${renderNodeContracts(catalog)}\n\n${renderProviderRouteMatrix()}\n`,
    "catalog/generated/catalog.json": `${JSON.stringify(catalog, null, 2)}\n`,
    "catalog/generated/repository-profiles.md": `${renderRepositoryProfiles(catalog)}\n`,
    "knowledge/README.md": `${renderKnowledgeReadme(catalog)}\n`,
  };
}

/**
 * Ported from runtime/graph/render.ts. Replaces the content between a named generated-block
 * marker pair, leaving everything else in `text` untouched.
 */
// --- CLI entry -----------------------------------------------------------------------

if (isMainModule(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const defaultSkillRoot = resolveSkillRoot(import.meta.url);
  const skillRoot = args.skillRoot ?? defaultSkillRoot;
  let freshnessPin: string;
  try {
    freshnessPin = serializeKnowledgeFreshnessPin(
      args.sourceSnapshot ? knowledgeFreshnessPinFromSnapshot(args.sourceSnapshot) : loadKnowledgeFreshnessPin(skillRoot),
    );
  } catch (error) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const packageFiles = renderFirstpartyPackage(skillRoot);
  for (const [relative, bytes] of Object.entries(packageFiles)) {
    const target = path.join(skillRoot, relative);
    if (args.check) {
      if (!existsSync(target) || !readFileSync(target).equals(bytes)) {
        console.error(`ERROR catalog_render.generated_drift: ${relative}`);
        process.exit(1);
      }
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, bytes);
    }
  }
  const catalog = composeCatalog(skillRoot);
  const files = renderGeneratedFiles(catalog);
  files["catalog/generated/packs.json"] = renderShippedPackInventory(skillRoot);
  files[knowledgeFreshnessPinPath] = freshnessPin;

  let drift = false;
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(skillRoot, relative);
    if (args.check) {
      if (!existsSync(target)) {
        console.error(`ERROR catalog_render.generated_missing: ${relative}`);
        drift = true;
      } else if (readFileSync(target, "utf8") !== content) {
        console.error(`ERROR catalog_render.generated_drift: ${relative}`);
        drift = true;
      }
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
      console.log(`Wrote ${relative}`);
    }
  }
  if (drift) process.exitCode = 1;
  else console.log(`catalog/render-routing.ts: ${Object.keys(files).length} projection(s) ${args.check ? "current" : "written"}.`);
}

function parseArgs(argv: string[]): { skillRoot?: string; sourceSnapshot?: string; check: boolean } {
  let skillRoot: string | undefined;
  let sourceSnapshot: string | undefined;
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--skill-root" && argv[index + 1]) {
      skillRoot = path.resolve(argv[index + 1]!);
      index += 1;
    } else if (argv[index] === "--source-snapshot") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--source-snapshot requires a path.");
      sourceSnapshot = path.resolve(value);
    } else if (argv[index] === "--check") check = true;
  }
  return { skillRoot, sourceSnapshot, check };
}
