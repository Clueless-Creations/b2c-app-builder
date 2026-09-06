#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DELIBERATELY_UNDECLARED_PROVIDER_IDS, provisioningProviderIds } from "../adapters/provisioning/requirements.js";
import { businessUnitCoversAllGrantableDomains } from "./business-units.js";
import { resolveDomainAuthority } from "./domain-authority.js";
import { GATE_OWNER_OVERRIDES, inferGateDomain } from "./gates.js";
import { isCatalogId, type CatalogId } from "./ids.js";
import { composeCatalog } from "./index.js";
import { operators } from "./operators.js";
import type { Catalog, CatalogIssue } from "./types.js";
import { repositoryProfileIds } from "../kernel/schema/types.js";
import { validateDefinitionOverlays } from "./overlays.js";

const RUNTIME_OWNED_READS = new Set(["state/business-state.json"]);

/**
 * The provider registry workflow providerIds are validated against. Injectable so fixture
 * catalogs stay one-defect-per-case (a fixture registry can bless `provider.fixture`); real
 * call sites pass nothing and get the provisioning manifest plus its documented exceptions —
 * the typed successor to the regex-scraping completeness fixture that previously guarded
 * this join from checks/verification/fixtures/provisioning.fixtures.ts.
 */
export interface ProviderRegistry {
  readonly providerIds: readonly string[];
  readonly deliberatelyUndeclared: readonly string[];
}

export function defaultProviderRegistry(): ProviderRegistry {
  return { providerIds: provisioningProviderIds(), deliberatelyUndeclared: DELIBERATELY_UNDECLARED_PROVIDER_IDS };
}

/**
 * Structural validation for the v2 catalog (U8). Ported from runtime/graph/validate.ts's
 * checks — duplicate/invalid IDs, dangling references, cycles, missing files — restructured
 * against the catalog/types.ts shape. Named issue codes throughout (never a bare boolean),
 * matching the `catalog_graph.*` family so a future capability-boundary or fixture test can
 * assert on a specific code rather than "did it exit non-zero".
 */
export function validateCatalog(catalog: Catalog, skillRoot: string, providerRegistry: ProviderRegistry = defaultProviderRegistry()): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const registeredProviderIds = new Set(providerRegistry.providerIds);
  const undeclaredProviderIds = new Set(providerRegistry.deliberatelyUndeclared);
  const groups = [
    catalog.areas,
    catalog.domains,
    catalog.phases,
    catalog.lanes,
    catalog.roles,
    catalog.contextPacks,
    catalog.references,
    catalog.workflows,
    catalog.artifacts,
    catalog.gates,
  ] as const;
  const allIds = new Map<string, string>();

  for (const group of groups) {
    for (const node of group) {
      if (!isCatalogId(node.id)) issues.push(error("catalog_graph.id.invalid", `Invalid catalog id: ${node.id}`));
      const previous = allIds.get(node.id);
      if (previous) issues.push(error("catalog_graph.id.duplicate", `Duplicate catalog id ${node.id} (seen more than once).`));
      allIds.set(node.id, node.id.split(".")[0] ?? "node");
    }
  }

  const areaIds = new Set(catalog.areas.map((item) => item.id));
  const domainIds = new Set(catalog.domains.map((item) => item.id));
  const phaseIds = new Set(catalog.phases.map((item) => item.id));
  const laneIds = new Set(catalog.lanes.map((item) => item.id));
  const workflowIds = new Set(catalog.workflows.map((item) => item.id));
  const artifactsByPath = new Map(catalog.artifacts.map((item) => [item.path, item.id]));
  const gateCommands = new Set(catalog.gates.map((item) => item.command));

  for (const area of catalog.areas) {
    if (area.domainIds.length === 0) issues.push(error("catalog_graph.area.empty", `${area.id} has no domains.`));
    for (const domainId of area.domainIds) checkKnown(issues, domainIds, domainId, "catalog_graph.area.unknown_domain", area.id);
  }

  for (const domain of catalog.domains) {
    if (domain.areaIds.length === 0) issues.push(error("catalog_graph.domain.area_missing", `${domain.id} has no business-area projection.`));
    for (const areaId of domain.areaIds) checkKnown(issues, areaIds, areaId, "catalog_graph.domain.unknown_area", domain.id);
    if (domain.indexPath && !existsSync(path.join(skillRoot, domain.indexPath))) {
      issues.push(error("catalog_graph.domain.index_missing", `${domain.id} index does not exist: ${domain.indexPath}`, domain.indexPath));
    }
    const authority = resolveDomainAuthority(domain);
    if (authority.grantable && !authority.operatorGroup) {
      issues.push(error("catalog_graph.domain.operator_group_missing", `${domain.id} is grantable but has no operator group.`));
    }
    if (authority.grantable && (authority.system || authority.machine)) {
      issues.push(error("catalog_graph.domain.system_grantable", `${domain.id} cannot be both grantable and system/machine.`));
    }
  }

  uniqueBy(catalog.phases, (item) => item.key, "catalog_graph.phase.key_duplicate", issues);
  uniqueBy(catalog.phases, (item) => String(item.order), "catalog_graph.phase.order_duplicate", issues);
  // A phase no workflow carries is dead catalog data. The historical instance (phase.0a) was
  // hidden from the generated docs by a silent render filter instead of being deleted — the
  // projection quietly diverged from its own source, and nothing said so (2026-08-19 audit).
  const referencedPhaseIds = new Set(catalog.workflows.flatMap((workflow) => workflow.phaseIds));
  for (const phase of catalog.phases) {
    if (!referencedPhaseIds.has(phase.id)) {
      issues.push(error("catalog_graph.phase.unreferenced", `${phase.id} is carried by no workflow — delete the phase or assign it real work.`));
    }
  }

  uniqueBy(catalog.lanes, (item) => item.key, "catalog_graph.lane.key_duplicate", issues);
  for (const lane of catalog.lanes) {
    checkKnown(issues, domainIds, lane.ownerDomainId, "catalog_graph.lane.unknown_domain", lane.id);
    for (const dependencyId of lane.dependencyIds) checkKnown(issues, laneIds, dependencyId, "catalog_graph.lane.unknown_dependency", lane.id);
  }
  detectCycles(
    catalog.lanes.map((lane) => ({ id: lane.id, dependencies: lane.dependencyIds })),
    "catalog_graph.lane.cycle",
    issues,
  );

  uniqueBy(catalog.references, (item) => item.path, "catalog_graph.reference.path_duplicate", issues);
  uniqueBy(catalog.contextPacks, (item) => item.id, "catalog_graph.context_pack.id_duplicate", issues);
  for (const reference of catalog.references) {
    checkKnown(issues, domainIds, reference.domainId, "catalog_graph.reference.unknown_domain", reference.id);
    if (!existsSync(path.join(skillRoot, reference.path))) {
      issues.push(error("catalog_graph.reference.path_missing", `${reference.id} points to missing file ${reference.path}.`, reference.path));
    }
    if (!reference.loadWhen.trim()) {
      issues.push(error("catalog_graph.reference.load_when_missing", `${reference.id} has no load condition.`, reference.path));
    }
  }

  const roleIds = new Set(catalog.roles.map((item) => item.id));
  const referenceIds = new Set(catalog.references.map((item) => item.id));
  const contextPackIds = new Set(catalog.contextPacks.map((item) => item.id));
  const boundReferenceIds = new Set([
    ...catalog.workflows.flatMap((workflow) => workflow.referenceIds),
    ...catalog.contextPacks.flatMap((pack) => pack.referenceIds),
  ]);

  // Knowledge must be routable by the engine, not just present on disk: every reference is either
  // bound to at least one workflow node or explicitly session-scoped (Start Here / Always-On
  // material a session loads). An unbound, unflagged reference is knowledge nothing routes to —
  // the exact "98 references no code evaluates" failure the 2026-08 audit found.
  for (const reference of catalog.references) {
    if (!boundReferenceIds.has(reference.id) && !reference.sessionScoped) {
      issues.push(
        error("catalog_graph.reference.unbound", `${reference.id} is bound by no workflow and not sessionScoped — nothing routes to it.`, reference.path),
      );
    }
  }

  for (const pack of catalog.contextPacks) {
    if (pack.referenceIds.length === 0) issues.push(error("catalog_graph.context_pack.empty", `${pack.id} has no reference routes.`));
    for (const referenceId of pack.referenceIds) checkKnown(issues, referenceIds, referenceId, "catalog_graph.context_pack.reference_unknown", pack.id);
  }

  // Every business-runtime workflow must bind knowledge (mirrors context_pack.empty). Machine
  // workflows are maintainer procedures whose contract is their own instructions; the exemption
  // is declared here, not an accident of a domain filter elsewhere.
  for (const workflow of catalog.workflows) {
    if (workflow.domainId === "domain.machine") continue;
    if (workflow.referenceIds.length === 0) {
      issues.push(error("catalog_graph.workflow.no_knowledge", `${workflow.id} binds no knowledge reference; a dispatched worker would receive a bare title.`));
    }
  }

  for (const role of catalog.roles) {
    if (role.parentPromptPaths.length === 0) issues.push(error("catalog_graph.role.parent_contract_missing", `${role.id} has no parent prompt contract.`));
    if (!role.parentPromptPaths.includes("AGENTS.md") || !role.parentPromptPaths.includes("APP_AGENTS.md")) {
      issues.push(error("catalog_graph.role.parent_contract_incomplete", `${role.id} must inherit AGENTS.md and APP_AGENTS.md.`));
    }
    if (role.skillRoutes.length === 0) issues.push(error("catalog_graph.role.skill_routes_missing", `${role.id} has no nested skill routes.`));
    if (role.toolRoutes.length === 0) issues.push(error("catalog_graph.role.tool_routes_missing", `${role.id} has no tool-discovery routes.`));
    if (!role.contextPackIds.includes("context.founder-language")) {
      issues.push(error("catalog_graph.role.founder_language_missing", `${role.id} does not load the always-on founder-language contract.`));
    }
    uniqueStrings(role.capabilityIds, "catalog_graph.role.capability_duplicate", role.id, issues);
    uniqueStrings(role.outputPathPrefixes, "catalog_graph.role.output_prefix_duplicate", role.id, issues);
    for (const packId of role.contextPackIds) checkKnown(issues, contextPackIds, packId, "catalog_graph.role.context_pack_unknown", role.id);
    // Isolated review as data: the auditor roster is a checked edge between roles, not a table an
    // agent may quietly misread. A role naming itself means a second, fresh-context instance of
    // that role (the roster's "same title, different agent" rule); instance isolation is the
    // dispatcher's job, and the node-level review_self rule below still forbids a node auditing
    // its own output.
    for (const auditorId of role.reviewedBy ?? []) {
      checkKnown(issues, roleIds, auditorId, "catalog_graph.role.reviewed_by_unknown", role.id);
    }
    uniqueStrings(role.reviewedBy ?? [], "catalog_graph.role.reviewed_by_duplicate", role.id, issues);
  }

  // The real shipped roster and role registry are one executable surface. Fixture catalogs do
  // not carry role.orchestrator and intentionally skip this repository-specific parity sweep.
  if (roleIds.has("role.orchestrator")) {
    const rosterDir = path.join(skillRoot, "examples", "workspace", "business", "engineering", "app-agent-roster", "agents");
    const promptNames = existsSync(rosterDir)
      ? walkFiles(rosterDir)
          .filter((filePath) => filePath.endsWith(".md"))
          .map((filePath) => path.basename(filePath, ".md"))
      : [];
    const rolePromptNames = catalog.roles.map((role) => path.basename(role.promptPath, ".md"));
    for (const promptName of promptNames) {
      if (!rolePromptNames.includes(promptName)) issues.push(error("catalog_graph.role.prompt_unregistered", `agents/${promptName}.md has no catalog role.`));
    }
    for (const role of catalog.roles) {
      if (!promptNames.includes(path.basename(role.promptPath, ".md"))) {
        issues.push(error("catalog_graph.role.prompt_missing", `${role.id} points to missing roster prompt ${role.promptPath}.`));
      } else {
        const promptName = path.basename(role.promptPath, ".md");
        const promptText = readFileSync(path.join(rosterDir, `${promptName}.md`), "utf8");
        if (!promptText.includes("Inherited dispatch contract:")) {
          issues.push(error("catalog_graph.role.inheritance_missing", `${role.promptPath} does not declare the inherited dispatch contract.`));
        }
        if (!promptText.includes(`Stable operator ID: \`operator.${promptName}\``)) {
          issues.push(error("catalog_graph.role.operator_id_mismatch", `${role.promptPath} must declare operator.${promptName}.`));
        }
      }
    }
    const operatorPromptNames = operators
      .filter((operator) => operator.kind === "agent" && operator.promptPath)
      .map((operator) => path.basename(operator.promptPath!, ".md"));
    for (const promptName of promptNames) {
      if (!operatorPromptNames.includes(promptName))
        issues.push(error("catalog_graph.operator.prompt_unregistered", `agents/${promptName}.md has no executable operator record.`));
    }
    for (const operator of operators) {
      for (const packId of operator.contextPackIds) {
        if (!contextPackIds.has(packId as `context.${string}`))
          issues.push(error("catalog_graph.operator.context_pack_unknown", `${operator.id} names unknown context pack ${packId}.`));
      }
    }
  }

  // The other direction: a knowledge file on disk with no CatalogReference is invisible to every
  // routing surface (Codex round 1). Swept only when this catalog registers knowledge/ references
  // at all, so minimal fixture catalogs (whose references point at fixture paths) are not judged
  // against the real skill tree.
  if (catalog.references.some((reference) => reference.path.startsWith("knowledge/"))) {
    const registeredPaths = new Set(catalog.references.map((reference) => reference.path));
    for (const filePath of walkFiles(path.join(skillRoot, "knowledge"))) {
      const relative = path.relative(skillRoot, filePath).split(path.sep).join("/");
      // The one non-reference file allowed in knowledge/: the generated orientation stub
      // render-routing.ts writes (and drift-checks) pointing readers at the Reference Index.
      if (relative === "knowledge/README.md") continue;
      if (!registeredPaths.has(relative)) {
        issues.push(
          error(
            "catalog_graph.reference.file_unregistered",
            `${relative} exists on disk but has no CatalogReference — knowledge nothing can route to.`,
            relative,
          ),
        );
      }
    }
  }

  for (const workflow of catalog.workflows) {
    validateWorkflow(workflow, issues);
    if (/\bstate\/[^\s`"']+\.ya?ml\b/i.test(workflow.instructions) || workflow.reads.some((read) => /^state\/.*\.ya?ml$/i.test(read))) {
      issues.push(
        error(
          "catalog_graph.workflow.invalid_state_authority",
          `${workflow.id} references YAML runtime state; durable workflows must read reducer-owned state/business-state.json.`,
          workflow.id,
        ),
      );
    }
    checkKnown(issues, domainIds, workflow.domainId, "catalog_graph.workflow.unknown_domain", workflow.id);
    for (const areaId of workflow.areaIds) checkKnown(issues, areaIds, areaId, "catalog_graph.workflow.unknown_area", workflow.id);
    for (const phaseId of workflow.phaseIds) checkKnown(issues, phaseIds, phaseId, "catalog_graph.workflow.unknown_phase", workflow.id);
    for (const dependencyId of workflow.dependencies) checkKnown(issues, workflowIds, dependencyId, "catalog_graph.workflow.unknown_dependency", workflow.id);
    for (const refresh of workflow.refreshDependencies ?? []) {
      const dependencyId = refresh.workflowId;
      checkKnown(issues, workflowIds, dependencyId, "catalog_graph.workflow.unknown_refresh_dependency", workflow.id);
      if (!workflow.dependencies.includes(dependencyId)) {
        issues.push(
          error(
            "catalog_graph.workflow.refresh_dependency_not_dependency",
            `${workflow.id} refreshes ${dependencyId}, but it is not a declared dependency.`,
            workflow.id,
          ),
        );
      }
      if (refresh.instructions.trim().length < 40) {
        issues.push(
          error(
            "catalog_graph.workflow.refresh_instructions_missing",
            `${workflow.id} must declare the evidence scope carried into ${dependencyId}'s redispatch.`,
            workflow.id,
          ),
        );
      }
    }
    // reviewOf is the isolated-review edge (knowledge/orchestration/isolated-review.md). It only
    // means something when the frontier can enforce it: the target must be a dependency (an
    // auditor cannot review an artifact that does not exist yet) and the auditor may write nothing
    // the producer writes (findings only). A reviewOf that fails either rule is prose wearing a
    // field name, so it is rejected here rather than silently compiled.
    for (const targetId of workflow.reviewOf ?? []) {
      checkKnown(issues, workflowIds, targetId, "catalog_graph.workflow.review_target_unknown", workflow.id);
      if (targetId === workflow.id) {
        issues.push(error("catalog_graph.workflow.review_self", `${workflow.id} declares itself as its own review target; self-review is invalid.`));
        continue;
      }
      if (!workflow.dependencies.includes(targetId)) {
        issues.push(
          error(
            "catalog_graph.workflow.review_target_not_dependency",
            `${workflow.id} reviews ${targetId} but does not depend on it; the frontier could dispatch the audit before the surface exists.`,
            workflow.id,
          ),
        );
      }
      const target = catalog.workflows.find((candidate) => candidate.id === targetId);
      const overlap = target ? workflow.outputPaths.filter((outputPath) => target.outputPaths.includes(outputPath)) : [];
      if (overlap.length > 0) {
        issues.push(
          error(
            "catalog_graph.workflow.review_output_overlap",
            `${workflow.id} reviews ${targetId} yet also writes ${overlap.join(", ")}; an auditor writes findings only.`,
            workflow.id,
          ),
        );
      }
    }
    for (const dependencyId of workflow.dependencies) {
      const dependency = catalog.workflows.find((candidate) => candidate.id === dependencyId);
      if (!dependency || dependency.applicability?.mode !== "conditional") continue;
      if (workflow.applicability?.mode !== "conditional" || workflow.applicability.question !== dependency.applicability.question) {
        issues.push(
          error(
            "catalog_graph.workflow.conditional_dependency_ambiguous",
            `${workflow.id} depends on conditional ${dependency.id} without the same applicability condition.`,
          ),
        );
      }
    }
    for (const outputPath of workflow.outputPaths) {
      if (!artifactsByPath.has(outputPath))
        issues.push(error("catalog_graph.workflow.unknown_output", `${workflow.id} names unregistered artifact ${outputPath}.`));
    }
    for (const command of workflow.gateCommands) {
      if (!gateCommands.has(command)) issues.push(error("catalog_graph.workflow.unknown_gate", `${workflow.id} names unregistered gate command ${command}.`));
    }
    if (!roleIds.has(workflow.roleId)) {
      issues.push(error("catalog_graph.workflow.role_unknown", `${workflow.id} names unregistered role ${workflow.roleId}.`));
    } else {
      const owner = catalog.roles.find((role) => role.id === workflow.roleId)!;
      for (const providerId of workflow.providerIds) {
        if (!owner.capabilityIds.includes(providerId)) {
          issues.push(
            error("catalog_graph.workflow.role_capability_missing", `${workflow.id} requires ${providerId}, but ${owner.id} does not declare that capability.`),
          );
        }
      }
      for (const outputPath of workflow.outputPaths) {
        if (!owner.outputPathPrefixes.some((prefix) => outputPath === prefix || outputPath.startsWith(prefix))) {
          issues.push(
            error(
              "catalog_graph.workflow.role_output_out_of_scope",
              `${workflow.id} assigns ${outputPath} to ${owner.id}, outside its declared output scope.`,
              outputPath,
            ),
          );
        }
      }
    }
    for (const referenceId of workflow.referenceIds) {
      if (!referenceIds.has(referenceId)) {
        issues.push(error("catalog_graph.workflow.reference_unknown", `${workflow.id} binds unregistered reference ${referenceId}.`));
      }
    }
    for (const providerId of workflow.providerIds) {
      if (!registeredProviderIds.has(providerId) && !undeclaredProviderIds.has(providerId)) {
        issues.push(
          error(
            "catalog_graph.workflow.provider_unknown",
            `${workflow.id} names ${providerId}, which has no PROVISIONING_MANIFEST entry and is not in DELIBERATELY_UNDECLARED_PROVIDER_IDS (adapters/provisioning/requirements.ts).`,
          ),
        );
      }
    }
    // reads is the authored input contract: every entry must be a path some workflow produces or
    // a durable workspace file the template ships — an unresolvable read is a worker sent to open
    // a file that will never exist. consults follows the same resolvability rule, and a path may
    // not sit in both lists (blocking and open-if-present are contradictory claims).
    for (const read of workflow.reads) {
      if (!artifactsByPath.has(read) && !RUNTIME_OWNED_READS.has(read) && !existsSync(path.join(skillRoot, "examples/workspace/business", read))) {
        issues.push(
          error(
            "catalog_graph.workflow.read_unresolvable",
            `${workflow.id} reads ${read}, which no workflow produces and the workspace template does not ship.`,
          ),
        );
      }
    }
    for (const consult of workflow.consults) {
      if (!artifactsByPath.has(consult) && !existsSync(path.join(skillRoot, "examples/workspace/business", consult))) {
        issues.push(
          error(
            "catalog_graph.workflow.consult_unresolvable",
            `${workflow.id} consults ${consult}, which no workflow produces and the workspace template does not ship.`,
          ),
        );
      }
      if (workflow.reads.includes(consult)) {
        issues.push(
          error("catalog_graph.workflow.read_consult_conflict", `${workflow.id} lists ${consult} as both a read (blocking) and a consult (open-if-present).`),
        );
      }
    }
  }
  detectCycles(
    catalog.workflows.map((workflow) => ({ id: workflow.id, dependencies: workflow.dependencies })),
    "catalog_graph.workflow.cycle",
    issues,
  );

  const writerCounts = new Map<string, number>();
  for (const workflow of catalog.workflows) {
    for (const outputPath of workflow.outputPaths) writerCounts.set(outputPath, (writerCounts.get(outputPath) ?? 0) + 1);
  }
  for (const [outputPath, count] of writerCounts) {
    if (count > 1)
      issues.push(
        error("catalog_graph.workflow.ambiguous_write", `${outputPath} is declared as an output by ${count} workflows (single-writer rule).`, outputPath),
      );
  }

  // A founderPhrasing that names two workflows (verbatim, case-insensitive) is worse than one that
  // names none: the router (issue #58 stage 3) scores it at trigger weight for BOTH, manufacturing
  // exactly the false-tie/false-primary risk authoring this field exists to reduce rather than add.
  const founderPhrasingOwners = new Map<string, string[]>();
  for (const workflow of catalog.workflows) {
    for (const phrasing of workflow.founderPhrasings) {
      const key = phrasing.trim().toLowerCase();
      if (!key) continue; // already reported by the empty/whitespace check above
      const owners = founderPhrasingOwners.get(key) ?? [];
      owners.push(workflow.id);
      founderPhrasingOwners.set(key, owners);
    }
  }
  for (const [phrasing, owners] of founderPhrasingOwners) {
    if (owners.length > 1) {
      issues.push(
        error(
          "catalog_graph.workflow.founder_phrasing_collision",
          `founderPhrasing "${phrasing}" is declared by ${owners.length} workflows (${owners.join(", ")}) — the router would score it identically for all of them.`,
        ),
      );
    }
  }

  // An exception id no workflow references is a stale entry inviting silent drift. Checked only
  // when this catalog references a registry provider at all — same scoping as the knowledge
  // disk-sweep above, so minimal fixture catalogs are not judged against the real manifest.
  const referencedProviderIds = new Set(catalog.workflows.flatMap((workflow) => workflow.providerIds));
  if ([...referencedProviderIds].some((providerId) => registeredProviderIds.has(providerId))) {
    for (const exceptionId of providerRegistry.deliberatelyUndeclared) {
      if (!referencedProviderIds.has(exceptionId)) {
        issues.push(
          error(
            "catalog_graph.provider.exception_stale",
            `DELIBERATELY_UNDECLARED_PROVIDER_IDS names ${exceptionId}, but no workflow references it — the exception list has drifted.`,
          ),
        );
      }
    }
  }

  uniqueBy(catalog.artifacts, (item) => item.path, "catalog_graph.artifact.path_duplicate", issues);
  for (const artifact of catalog.artifacts) {
    checkKnown(issues, domainIds, artifact.ownerDomainId, "catalog_graph.artifact.unknown_domain", artifact.id);
  }

  for (const gate of catalog.gates) {
    checkKnown(issues, domainIds, gate.ownerDomainId, "catalog_graph.gate.unknown_domain", gate.id);
    if (gate.scriptPath && !existsSync(path.join(skillRoot, gate.scriptPath))) {
      issues.push(error("catalog_graph.gate.script_missing", `${gate.command} points to missing script ${gate.scriptPath}.`, gate.scriptPath));
    }
    if ((gate.command.startsWith("check:") || gate.command.startsWith("validate:")) && gate.audit === "manual") {
      issues.push(error("catalog_graph.gate.audit_unregistered", `${gate.command} is neither in the audit plan nor explicitly excluded.`));
    }
  }

  // GATE_OWNER_OVERRIDES (catalog/gates.ts) pins a declared owner for gates whose directory
  // does not reflect their true cross-cutting subject. Both failure modes below are
  // undetectable from the override map alone -- they only surface by cross-checking it
  // against the live discovered gates, which is why this lives here rather than in gates.ts.
  const gatesByCommand = new Map(catalog.gates.map((gate) => [gate.command, gate]));
  for (const [command, override] of Object.entries(GATE_OWNER_OVERRIDES)) {
    if (!override) continue;
    const gate = gatesByCommand.get(command);
    if (!gate) {
      issues.push(
        error(
          "catalog_graph.gate.override_unknown_command",
          `GATE_OWNER_OVERRIDES names "${command}", which is not a discovered gate. Remove the stale override or fix the command name.`,
        ),
      );
      continue;
    }
    if (inferGateDomain(gate.scriptPath, gate.command, catalog.domains) === override.domainId) {
      issues.push(
        error(
          "catalog_graph.gate.override_stale",
          `GATE_OWNER_OVERRIDES' entry for "${command}" (${override.domainId}) now matches its directory-derived domain. The override is no longer doing anything -- remove it.`,
        ),
      );
    }
  }

  if (!businessUnitCoversAllGrantableDomains()) {
    issues.push(error("catalog_graph.business_unit.coverage_gap", "businessUnitDomains (kernel/schema/types.ts) does not cover every grantable domain."));
  }

  validateProfiles(catalog, issues);
  validateRepositoryProfiles(catalog, issues);
  validateProviderContracts(catalog, issues);
  validateOnboardingGroup(catalog, issues);

  return issues;
}

/**
 * R10/KTD7: onboarding-system is an authored groupId, never derived by id-substring match. Two
 * independent checks guard the two ways that could silently drift apart:
 *  - every node actually carrying the group must be reachable from the others through declared
 *    dependencies (a stray node with the id but no real edge into the graph would group nodes
 *    that have nothing to do with each other);
 *  - a node whose id LOOKS like part of the onboarding graph (the onb-NN pattern) but was never
 *    given the groupId is very likely a missed node, not a deliberate exclusion — WARN, not
 *    error, because a future non-graph workflow could legitimately reuse the onb-NN shape without
 *    joining this group.
 */
const ONBOARDING_GROUP_ID = "onboarding-system";
const ONB_NN_ID_PATTERN = /\.onb-\d{2}-/;

function validateOnboardingGroup(catalog: Catalog, issues: CatalogIssue[]): void {
  const grouped = catalog.workflows.filter((workflow) => workflow.groupId === ONBOARDING_GROUP_ID);
  if (grouped.length > 0) {
    const groupedIds = new Set(grouped.map((workflow) => workflow.id));
    const adjacency = new Map<string, Set<string>>(grouped.map((workflow) => [workflow.id, new Set<string>()]));
    for (const workflow of grouped) {
      for (const dependencyId of workflow.dependencies) {
        if (!groupedIds.has(dependencyId)) continue;
        adjacency.get(workflow.id)!.add(dependencyId);
        adjacency.get(dependencyId)!.add(workflow.id);
      }
    }
    const start = grouped[0]!.id;
    const reached = new Set<string>([start]);
    const stack: string[] = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!reached.has(neighbor)) {
          reached.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    const unreachable = [...groupedIds].filter((id) => !reached.has(id)).sort();
    if (unreachable.length > 0) {
      issues.push(
        error(
          "catalog_graph.workflow.group_disconnected",
          `groupId "${ONBOARDING_GROUP_ID}" is not one connected dependency component — unreachable from ${start}: ${unreachable.join(", ")}.`,
        ),
      );
    }
  }

  for (const workflow of catalog.workflows) {
    if (ONB_NN_ID_PATTERN.test(workflow.id) && workflow.groupId !== ONBOARDING_GROUP_ID) {
      issues.push({
        severity: "warning",
        code: "catalog_graph.workflow.group_id_missing",
        message: `${workflow.id} matches the onb-NN id pattern but does not carry groupId "${ONBOARDING_GROUP_ID}" — confirm this is a deliberate exclusion, not a missed node.`,
      });
    }
  }
}

/** R7: profiles are additive breadth selection, never a bypass of the never-deferred safety rails. */
function validateProfiles(catalog: Catalog, issues: CatalogIssue[]): void {
  const NEVER_DEFERRED: readonly string[] = ["revenue", "privacy_legal", "security", "apple_signing", "store_console"];
  const laneKeys = new Set(catalog.lanes.map((lane) => lane.key));
  const seen = new Set<string>();
  // The built-in requirement binds a catalog that DECLARES profiles (synthetic fixture catalogs
  // pass an empty list and stay exempt); the shipped registry's own fixture pins the real two.
  if (catalog.profiles.length > 0) {
    for (const builtin of ["essentials", "full"]) {
      if (!catalog.profiles.some((profile) => profile.id === builtin)) {
        issues.push({
          severity: "error",
          code: "catalog_graph.profile.builtin_missing",
          message: `Profile registry must carry the built-in "${builtin}" — existing businesses record it as their launch scope.`,
        });
      }
    }
  }
  for (const profile of catalog.profiles) {
    if (seen.has(profile.id)) {
      issues.push({ severity: "error", code: "catalog_graph.profile.duplicate", message: `Profile id "${profile.id}" is declared more than once.` });
    }
    seen.add(profile.id);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(profile.id)) {
      issues.push({
        severity: "error",
        code: "catalog_graph.profile.invalid_id",
        message: `Profile id "${profile.id}" must be lowercase letters, digits, and hyphens.`,
      });
    }
    for (const laneKey of profile.defersLaneKeys) {
      if (catalog.lanes.length > 0 && !laneKeys.has(laneKey)) {
        issues.push({ severity: "error", code: "catalog_graph.profile.unknown_lane", message: `Profile "${profile.id}" defers unknown lane "${laneKey}".` });
      }
      if (NEVER_DEFERRED.includes(laneKey)) {
        issues.push({
          severity: "error",
          code: "catalog_graph.profile.protected_lane_deferred",
          message: `Profile "${profile.id}" defers "${laneKey}" — revenue, privacy/legal, security, signing, and store-console lanes are never deferred by scope (launch-phases.md).`,
        });
      }
    }
  }
}

function validateProviderContracts(catalog: Catalog, issues: CatalogIssue[]): void {
  const contracts = catalog.providerContracts ?? [];
  if (contracts.length === 0) return;
  uniqueBy(contracts, (item) => item.id, "catalog_graph.provider_contract.id_duplicate", issues);
}

function validateRepositoryProfiles(catalog: Catalog, issues: CatalogIssue[]): void {
  const profiles = catalog.repositoryProfiles ?? [];
  if (profiles.length === 0) return;
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.id)) {
      issues.push({
        severity: "error",
        code: "catalog_graph.repository_profile.duplicate",
        message: `Repository profile id "${profile.id}" is declared more than once.`,
      });
    }
    seen.add(profile.id);
    const generated = new Set(profile.alwaysGenerated);
    for (const relative of profile.alwaysCanonical) {
      if (generated.has(relative) || relative.includes("/generated/") || relative.startsWith("generated/")) {
        issues.push({
          severity: "error",
          code: "catalog_graph.repository_profile.generated_as_source",
          message: `Repository profile "${profile.id}" lists generated path "${relative}" as canonical.`,
        });
      }
    }
  }
  for (const id of repositoryProfileIds) {
    if (!seen.has(id)) {
      issues.push({
        severity: "error",
        code: "catalog_graph.repository_profile.missing",
        message: `Repository profile registry must carry "${id}".`,
      });
    }
  }
}

/** Protected action classes: real-world consequences, so every node must name the protected category that authorizes it (grants/waivers) — verification gates are a separate, after-the-fact control. */
const PROTECTED_ACTION_CLASSES = new Set(["publish", "spend", "release", "destructive"]);

/**
 * Bounds on `CatalogWorkflowDef.founderPhrasings` (issue #58 stage 3). An empty array is always
 * valid (see that field's own doc comment — "not participating" is legitimate), so these bounds
 * apply only once a workflow's array is non-empty.
 */
const FOUNDER_PHRASING_MIN_COUNT = 3;
const FOUNDER_PHRASING_MAX_COUNT = 6;
/**
 * "Short" per the field's own doc comment: the longest of the 305 phrasings authored across all 101
 * workflows for issue #58 measured 65 characters — this ceiling leaves headroom for future authoring
 * without accepting a full sentence that would just re-describe the workflow's instructions.
 */
const FOUNDER_PHRASING_MAX_LENGTH = 80;

function validateWorkflow(workflow: Catalog["workflows"][number], issues: CatalogIssue[]): void {
  if (!workflow.trigger.trim()) issues.push(error("catalog_graph.workflow.trigger_missing", `${workflow.id} has no trigger.`));
  if (workflow.maxConsecutiveNoProgressAttempts !== undefined) {
    const hardCap = workflow.maxAttempts ?? 3;
    if (
      !Number.isInteger(workflow.maxConsecutiveNoProgressAttempts) ||
      workflow.maxConsecutiveNoProgressAttempts < 1 ||
      workflow.maxConsecutiveNoProgressAttempts >= hardCap
    ) {
      issues.push(
        error(
          "catalog_graph.workflow.no_progress_attempts_invalid",
          `${workflow.id} must set maxConsecutiveNoProgressAttempts to a positive integer below its ${hardCap}-attempt hard cap.`,
        ),
      );
    }
  }
  if (workflow.founderPhrasings.length > 0) {
    if (workflow.founderPhrasings.length < FOUNDER_PHRASING_MIN_COUNT || workflow.founderPhrasings.length > FOUNDER_PHRASING_MAX_COUNT) {
      issues.push(
        error(
          "catalog_graph.workflow.founder_phrasing_count",
          `${workflow.id} declares ${workflow.founderPhrasings.length} founderPhrasings; a non-empty array must hold ${FOUNDER_PHRASING_MIN_COUNT}-${FOUNDER_PHRASING_MAX_COUNT}.`,
        ),
      );
    }
    for (const phrasing of workflow.founderPhrasings) {
      const trimmed = phrasing.trim();
      if (!trimmed) {
        issues.push(error("catalog_graph.workflow.founder_phrasing_length", `${workflow.id} declares an empty or whitespace-only founderPhrasing.`));
      } else if (trimmed.length > FOUNDER_PHRASING_MAX_LENGTH) {
        issues.push(
          error(
            "catalog_graph.workflow.founder_phrasing_length",
            `${workflow.id}'s founderPhrasing "${trimmed}" is ${trimmed.length} characters, over the ${FOUNDER_PHRASING_MAX_LENGTH}-character ceiling for a short phrase.`,
          ),
        );
      }
    }
  }
  if (workflow.outputPaths.length === 0 && workflow.gateCommands.length === 0) {
    issues.push(error("catalog_graph.workflow.contract_empty", `${workflow.id} has neither outputs nor verification gates.`));
  }
  // Instructions are the node's working contract; a title echo or one-liner dispatches a worker
  // with nothing to work from. The length floor is a tripwire, not a quality bar — the quality
  // bar is the fresh-context review recorded in the contract authoring pass.
  const instructions = workflow.instructions.trim();
  if (instructions.length < 40) {
    issues.push(error("catalog_graph.workflow.instructions_missing", `${workflow.id} has no usable instructions (under 40 characters).`));
  } else if (instructions.toLowerCase() === workflow.title.trim().toLowerCase() || instructions.toLowerCase() === workflow.trigger.trim().toLowerCase()) {
    issues.push(error("catalog_graph.workflow.instructions_missing", `${workflow.id} instructions merely echo its title or trigger.`));
  }
  // A spend node without an authored estimate parks fail-closed until the founder's approved
  // amount exists — that park is the designed control (an invented placeholder both mis-parks a
  // smaller approved budget and gets recorded as the actual), so the absence is surfaced, not
  // rejected.
  if (workflow.actionClass === "spend" && !workflow.costEstimate) {
    issues.push({
      severity: "warning",
      code: "catalog_graph.workflow.cost_estimate_missing",
      message: `${workflow.id} is a spend node with no declared costEstimate — the autonomy engine parks it fail-closed until a founder-approved amount exists.`,
    });
  }
  // Authorization and verification are different controls: a deterministic gate checks the work
  // AFTER it happens, while protectedCategory is what the autonomy engine's grant/waiver
  // machinery authorizes BEFORE dispatch. A protected-class node without its category runs on an
  // ordinary grant no matter how good its gates are.
  if (PROTECTED_ACTION_CLASSES.has(workflow.actionClass) && !workflow.protectedCategory) {
    issues.push(
      error(
        "catalog_graph.workflow.protected_category_missing",
        `${workflow.id} is ${workflow.actionClass}-class with no protectedCategory — gates verify after the fact, but nothing authorizes the action before dispatch.`,
      ),
    );
  }
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files.sort();
}

function checkKnown(issues: CatalogIssue[], known: Set<CatalogId>, value: CatalogId, code: string, owner: string): void {
  if (!known.has(value)) issues.push(error(code, `${owner} references unknown ${value}.`));
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string, code: string, issues: CatalogIssue[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) issues.push(error(code, `Duplicate value ${value}.`));
    seen.add(value);
  }
}

function uniqueStrings(items: readonly string[], code: string, owner: string, issues: CatalogIssue[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.trim()) issues.push(error(code, `${owner} contains an empty capability or output prefix.`));
    if (seen.has(item)) issues.push(error(code, `${owner} repeats ${item}.`));
    seen.add(item);
  }
}

function detectCycles<T extends CatalogId>(nodes: Array<{ id: T; dependencies: readonly T[] }>, code: string, issues: CatalogIssue[]): void {
  const edges = new Map(nodes.map((node) => [node.id, node.dependencies]));
  const active = new Set<T>();
  const settled = new Set<T>();
  const pathStack: T[] = [];
  const visit = (id: T): void => {
    if (settled.has(id)) return;
    if (active.has(id)) {
      const start = pathStack.indexOf(id);
      issues.push(error(code, `Cycle: ${[...pathStack.slice(start), id].join(" -> ")}.`));
      return;
    }
    active.add(id);
    pathStack.push(id);
    for (const dependency of edges.get(id) ?? []) visit(dependency);
    pathStack.pop();
    active.delete(id);
    settled.add(id);
  };
  for (const id of edges.keys()) visit(id);
}

function error(code: string, message: string, issuePath?: string): CatalogIssue {
  return { severity: "error", code, message, path: issuePath };
}

// --- CLI entry -----------------------------------------------------------------------

const isMain = (() => {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return invoked === fileURLToPath(import.meta.url);
})();

if (isMain) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultSkillRoot = path.resolve(scriptDir, "..");
  const skillRoot = parseSkillRoot(process.argv.slice(2), defaultSkillRoot);
  const catalog = composeCatalog(skillRoot);
  const issues = [...validateCatalog(catalog, skillRoot), ...validateDefinitionOverlays(catalog, skillRoot)];
  const errors = issues.filter((issue) => issue.severity === "error");
  for (const issue of issues) console.error(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);
  if (errors.length > 0) {
    console.error(`catalog/validate.ts: ${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(
    `catalog/validate.ts: clean — ${catalog.domains.length} domains, ${catalog.workflows.length} workflows, ${catalog.references.length} references, ${catalog.gates.length} gates.`,
  );
}

function parseSkillRoot(argv: string[], fallback: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if ((argv[index] === "--skill-root" || argv[index] === "--root") && argv[index + 1]) return path.resolve(argv[index + 1]!);
  }
  return fallback;
}
