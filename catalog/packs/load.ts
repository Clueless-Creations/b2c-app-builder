import { validateSharedResources } from "../../contracts/shared-resources.js";
import { validateSourceAccess } from "../../contracts/source-access.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { isBusinessUnit, protectedCategories, laneKeys } from "../../kernel/schema/types.js";
import { isCapabilityId, type CapabilityDefinition } from "../capabilities/types.js";
import type {
  CatalogArea,
  CatalogDomain,
  CatalogReference,
  CatalogWorkflowDef,
  CatalogRole,
  CatalogGate,
  CatalogKnowledgeDerivation,
  CatalogKnowledgeSource,
} from "../types.js";
import { isPackId, packKindFromId, type PackExtension, type PackId, type PackManifest } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error("pack_schema: expected a string");
  return value;
}

function asStringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("pack_schema: expected an array of strings");
  return value;
}

function asNumber(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("pack_schema: expected a finite number");
  return value;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error("pack_schema: expected a boolean");
  return value;
}

/** Authored pack schema: unknown fields fail before normalization. */
function fields(value: Record<string, unknown>, allowed: string, source: string): void {
  const names = new Set(allowed.split(" "));
  for (const key of Object.keys(value)) if (!names.has(key)) throw new Error(`${source}: unknown field "${key}"`);
}
function requiredString(value: unknown, source: string): string {
  const result = asString(value);
  if (!result.trim()) throw new Error(`${source}: nonempty string required`);
  return result;
}
function enumValue<T extends string>(value: unknown, choices: readonly T[], source: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error(`${source}: expected ${choices.join(" | ")}`);
  return value as T;
}
function optionalNumber(value: unknown, source: string): number | undefined {
  if (value === undefined) return undefined;
  const result = asNumber(value, 0);
  if (result < 0) throw new Error(`${source}: nonnegative number required`);
  return result;
}
function mapping(value: unknown, source: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  return value;
}

export function packsDir(skillRoot: string): string {
  return path.join(skillRoot, "catalog", "packs");
}

export function loadPackManifests(skillRoot: string, packIds?: readonly string[]): PackManifest[] {
  const root = packsDir(skillRoot);
  if (!existsSync(root)) return [];
  const requested = packIds ? new Set(packIds) : undefined;
  const manifests: PackManifest[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (requested && !requested.has(entry.name) && ![...requested].some((id) => id.endsWith(`.${entry.name}`) || id === entry.name)) continue;
    const file = path.join(root, entry.name, "pack.yaml");
    if (!existsSync(file)) continue;
    manifests.push(parsePackYaml(readFileSync(file, "utf8"), file));
  }
  if (requested) {
    const loaded = new Set(manifests.map((manifest) => manifest.id));
    for (const id of requested) {
      if (!loaded.has(id as PackId) && !manifests.some((manifest) => manifest.id.endsWith(`.${id}`) || manifest.id === id)) {
        throw new Error(`pack_composition.unresolved_reference: pack "${id}" is not present under catalog/packs/`);
      }
    }
  }
  return manifests;
}

/** Loads named packs plus every depends_on ancestor. Does not load sibling packs. */
export function loadPackClosure(skillRoot: string, packIds: readonly string[]): PackManifest[] {
  const available = loadPackManifests(skillRoot);
  const byId = new Map(available.map((pack) => [pack.id, pack]));
  const selected = new Map<string, PackManifest>();
  const visit = (id: string): void => {
    if (selected.has(id)) return;
    const pack = byId.get(id as PackId);
    if (!pack) {
      throw new Error(`pack_composition.unresolved_reference: pack "${id}" is not present under catalog/packs/`);
    }
    selected.set(id, pack);
    for (const dependency of pack.dependsOn) visit(dependency);
  };
  for (const id of packIds) visit(id);
  return [...selected.values()];
}

export function loadCapabilityYaml(skillRoot: string, capabilityId: string): CapabilityDefinition {
  const slug = capabilityId.startsWith("capability.") ? capabilityId.slice("capability.".length) : capabilityId;
  const file = path.join(skillRoot, "catalog", "capabilities", slug, "capability.yaml");
  if (!existsSync(file)) {
    throw new Error(`operating_graph.capability_missing: ${file} is not present`);
  }
  const parsed = parseYaml(readFileSync(file, "utf8")) as unknown;
  return parseCapability(parsed, file);
}

export function parsePackYaml(text: string, source = "pack.yaml"): PackManifest {
  const parsed = parseYaml(text) as unknown;
  if (!isRecord(parsed)) throw new Error(`${source} must be a mapping`);
  fields(
    parsed,
    "id title version revision kind depends_on creates_provider_spend domains workflows references areas capabilities extensions roles gates context_packs phases lanes profiles repository_profiles provider_contracts",
    source,
  );
  const id = asString(parsed.id);
  if (!isPackId(id)) throw new Error(`${source}: id must be capability.* or business-pack.*, got "${id}"`);
  const kind = packKindFromId(id);
  if (!kind) throw new Error(`${source}: cannot derive pack kind from "${id}"`);
  if (parsed.kind !== undefined && parsed.kind !== kind) throw new Error(`${source}: kind conflicts with id`);
  return {
    id,
    title: asString(parsed.title) || id,
    version: asString(parsed.version) || "0.0.0",
    revision: asString(parsed.revision) || asString(parsed.version) || "unpinned",
    kind,
    dependsOn: asStringArray(parsed.depends_on) as PackManifest["dependsOn"],
    createsProviderSpend: asBoolean(parsed.creates_provider_spend) ?? false,
    contextPacks: asArray(parsed.context_packs).map((item, index) => parseContextPack(item, `${source} context_packs[${index}]`)),
    phases: asArray(parsed.phases).map((item, index) => parsePhase(item, `${source} phases[${index}]`)),
    lanes: asArray(parsed.lanes).map((item, index) => parseLane(item, `${source} lanes[${index}]`)),
    profiles: asArray(parsed.profiles).map((item, index) => parseProfile(item, `${source} profiles[${index}]`)),
    repositoryProfiles: asArray(parsed.repository_profiles).map((item, index) => parseRepositoryProfile(item, `${source} repository_profiles[${index}]`)),
    providerContracts: asArray(parsed.provider_contracts).map((item, index) => parseProviderSummary(item, `${source} provider_contracts[${index}]`)),
    roles: asArray(parsed.roles).map((item, index) => parseRole(item, `${source} roles[${index}]`)),
    gates: asArray(parsed.gates).map((item, index) => parseGate(item, `${source} gates[${index}]`)),
    domains: asArray(parsed.domains).map((item, index) => parseDomain(item, `${source} domains[${index}]`)),
    workflows: asArray(parsed.workflows).map((item, index) => parseWorkflow(item, `${source} workflows[${index}]`)),
    references: asArray(parsed.references).map((item, index) => parseReference(item, `${source} references[${index}]`)),
    areas: asArray(parsed.areas).map((item, index) => parseArea(item, `${source} areas[${index}]`)),
    capabilities: asArray(parsed.capabilities).map((item, index) => parseCapability(item, `${source} capabilities[${index}]`)),
    extensions: asArray(parsed.extensions).map((item, index) => parseExtension(item, `${source} extensions[${index}]`)),
  };
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("pack_schema: expected an array");
  return value;
}

function parseDomain(value: unknown, source: string): CatalogDomain {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  fields(value, "id slug name area_ids index_path route_label route_when order grantable system machine operator_group protected_categories aliases", source);
  const id = asString(value.id);
  if (!id.startsWith("domain.")) throw new Error(`${source}: id must be domain.*, got "${id}"`);
  const grantable = asBoolean(value.grantable);
  const operatorGroupRaw = asString(value.operator_group);
  if (grantable === true && !isBusinessUnit(operatorGroupRaw)) {
    throw new Error(`pack_composition.invalid_operator_group: ${source}: grantable domain requires operator_group to be a business unit`);
  }
  return {
    id: id as CatalogDomain["id"],
    slug: asString(value.slug) || id.slice("domain.".length),
    name: asString(value.name) || id,
    areaIds: asStringArray(value.area_ids) as CatalogDomain["areaIds"],
    routeLabel: asString(value.route_label) || asString(value.name) || id,
    routeWhen: asString(value.route_when) || "pack-provided domain",
    order: asNumber(value.order, 200),
    grantable,
    system: asBoolean(value.system),
    machine: asBoolean(value.machine),
    ...(isBusinessUnit(operatorGroupRaw) ? { operatorGroup: operatorGroupRaw } : {}),
    ...(value.aliases === undefined ? {} : { aliases: asStringArray(value.aliases) }),
    indexPath: asString(value.index_path) || undefined,
    ...(value.protected_categories === undefined
      ? {}
      : { protectedCategories: asStringArray(value.protected_categories).map((category) => enumValue(category, protectedCategories, source)) }),
  };
}

function parseWorkflow(value: unknown, source: string): CatalogWorkflowDef {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  fields(
    value,
    "id title domain_id area_ids trigger founder_phrasings instructions reads consults reference_ids role_id lane_ids phase_ids dependencies refresh_dependencies output_paths gate_commands provider_ids founder_only_actions action_class protected_category idempotent recurrence_days max_attempts max_consecutive_no_progress_attempts ttl_seconds token_budget cost_estimate applicability group_id extension_slots review_of source_access shared_resources",
    source,
  );
  const id = asString(value.id);
  if (!id.startsWith("workflow.")) throw new Error(`${source}: id must be workflow.*, got "${id}"`);
  const actionClass = enumValue(value.action_class, ["observe", "draft", "mutate", "publish", "spend", "release", "destructive"] as const, source, "draft");
  return {
    id: id as CatalogWorkflowDef["id"],
    title: asString(value.title) || id,
    domainId: asString(value.domain_id) as CatalogWorkflowDef["domainId"],
    areaIds: asStringArray(value.area_ids) as CatalogWorkflowDef["areaIds"],
    trigger: asString(value.trigger) || "pack-provided trigger",
    // Optional in pack YAML (`founder_phrasings: [...]`) — packs are not part of the core catalog's
    // #58 authoring pass, so an empty array is a valid "not participating" default, not an error.
    founderPhrasings: asStringArray(value.founder_phrasings),
    instructions: requiredString(value.instructions, `${source}.instructions`),
    reads: asStringArray(value.reads),
    consults: asStringArray(value.consults),
    referenceIds: asStringArray(value.reference_ids) as CatalogWorkflowDef["referenceIds"],
    roleId: requiredString(value.role_id, `${source}.role_id`) as CatalogWorkflowDef["roleId"],
    laneIds: asStringArray(value.lane_ids) as CatalogWorkflowDef["laneIds"],
    phaseIds: asStringArray(value.phase_ids) as CatalogWorkflowDef["phaseIds"],
    dependencies: asStringArray(value.dependencies) as CatalogWorkflowDef["dependencies"],
    outputPaths: asStringArray(value.output_paths),
    gateCommands: asStringArray(value.gate_commands),
    sharedResources: value.shared_resources === undefined ? undefined : validateSharedResources(value.shared_resources),
    sourceAccess:
      value.source_access === undefined
        ? undefined
        : validateSourceAccess(
            asArray(value.source_access).map((item) => {
              const row = mapping(item, source);
              fields(row, "path access", source);
              return { path: requiredString(row.path, source), access: enumValue(row.access, ["read", "create", "update"] as const, source) };
            }),
          ),
    providerIds: asStringArray(value.provider_ids),
    founderOnlyActions: asStringArray(value.founder_only_actions),
    actionClass: actionClass as CatalogWorkflowDef["actionClass"],
    protectedCategory: value.protected_category === undefined ? undefined : enumValue(value.protected_category, protectedCategories, source),
    idempotent: asBoolean(value.idempotent) ?? true,
    applicability: parseApplicability(value.applicability, `${source}.applicability`),
    recurrenceDays: optionalNumber(value.recurrence_days, source),
    maxAttempts: optionalNumber(value.max_attempts, source),
    maxConsecutiveNoProgressAttempts: optionalNumber(value.max_consecutive_no_progress_attempts, source),
    ttlSeconds: optionalNumber(value.ttl_seconds, source),
    tokenBudget: optionalNumber(value.token_budget, source),
    costEstimate: value.cost_estimate === undefined ? undefined : parseCost(value.cost_estimate, source),
    groupId: asString(value.group_id) || undefined,
    ...(value.review_of === undefined ? {} : { reviewOf: asStringArray(value.review_of) as CatalogWorkflowDef["reviewOf"] }),
    refreshDependencies:
      value.refresh_dependencies === undefined
        ? undefined
        : asArray(value.refresh_dependencies).map((item) => {
            const row = mapping(item, source);
            fields(row, "workflow_id instructions", source);
            return { workflowId: requiredString(row.workflow_id, source) as CatalogWorkflowDef["id"], instructions: requiredString(row.instructions, source) };
          }),
    extensionSlots: value.extension_slots === undefined ? undefined : asStringArray(value.extension_slots),
  };
}

function parseReference(value: unknown, source: string): CatalogReference {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  fields(
    value,
    "id path domain_id title load_when section_id revision hub session_scoped lifecycle applicability_notes source_exemption sources derivations replacement_ids specifies",
    source,
  );
  const id = asString(value.id);
  if (!id.startsWith("reference.")) throw new Error(`${source}: id must be reference.*, got "${id}"`);
  return {
    id: id as CatalogReference["id"],
    path: asString(value.path) || "package.json",
    domainId: asString(value.domain_id) as CatalogReference["domainId"],
    title: asString(value.title) || id,
    loadWhen: asString(value.load_when) || "always",
    ...(asString(value.section_id) ? { sectionId: asString(value.section_id) } : {}),
    ...(asString(value.revision) ? { revision: asString(value.revision) } : {}),
    sessionScoped: asBoolean(value.session_scoped),
    hub: asBoolean(value.hub),
    lifecycle: enumValue(value.lifecycle, ["draft", "active", "deprecated"] as const, source, "active"),
    applicabilityNotes: value.applicability_notes === undefined ? undefined : asString(value.applicability_notes),
    sourceExemption: asString(value.source_exemption) || undefined,
    sources: asArray(value.sources).map((item) => parseSource(item, source)),
    ...(value.derivations !== undefined ? { derivations: asArray(value.derivations).map((item) => parseDerivation(item, source)) } : {}),
    replacementIds: asStringArray(value.replacement_ids) as CatalogReference["replacementIds"],
    ...(value.specifies === undefined
      ? {}
      : {
          specifies: asArray(value.specifies).map((item) => {
            const spec = mapping(item, `${source} specifies`);
            fields(spec, "artifact heading", source);
            return { artifact: requiredString(spec.artifact, source), heading: requiredString(spec.heading, source) };
          }),
        }),
  };
}

function parseArea(value: unknown, source: string): CatalogArea {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  fields(value, "id name description domain_ids", source);
  const id = asString(value.id);
  if (!id.startsWith("area.")) throw new Error(`${source}: id must be area.*, got "${id}"`);
  return {
    id: id as CatalogArea["id"],
    name: asString(value.name) || id,
    description: asString(value.description) || "Pack-provided area.",
    domainIds: asStringArray(value.domain_ids) as CatalogArea["domainIds"],
  };
}

function parseCapability(value: unknown, source: string): CapabilityDefinition {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  fields(
    value,
    "id title applicability required_facts authority readiness inputs outputs effects evidence expected_outcome context_selectors exclusions extension_slots",
    source,
  );
  const id = asString(value.id);
  if (!isCapabilityId(id)) throw new Error(`${source}: id must be capability.*, got "${id}"`);
  return {
    id,
    title: asString(value.title) || id,
    applicability: asString(value.applicability) || "pack-declared",
    requiredFacts: asStringArray(value.required_facts),
    authority: asStringArray(value.authority),
    readiness: asStringArray(value.readiness),
    inputs: asStringArray(value.inputs),
    outputs: asStringArray(value.outputs),
    effects: asStringArray(value.effects),
    evidence: asStringArray(value.evidence),
    expectedOutcome: asString(value.expected_outcome) || "pack-declared outcome",
    contextSelectors: asStringArray(value.context_selectors),
    exclusions: asStringArray(value.exclusions),
    extensionSlots: asStringArray(value.extension_slots),
  };
}

function parseExtension(value: unknown, source: string): PackExtension {
  if (!isRecord(value)) throw new Error(`${source} must be a mapping`);
  fields(value, "target_id slot kind remove_gates reference_ids", source);
  const kind = asString(value.kind);
  if (kind !== "bind" && kind !== "strengthen" && kind !== "weaken") {
    throw new Error(`${source}: kind must be bind, strengthen, or weaken`);
  }
  return {
    targetId: asString(value.target_id),
    slot: asString(value.slot),
    kind,
    removeGates: asStringArray(value.remove_gates),
    referenceIds: asStringArray(value.reference_ids),
  };
}

function parseApplicability(value: unknown, source: string): CatalogWorkflowDef["applicability"] {
  if (value === undefined) return { mode: "always" };
  const row = mapping(value, source);
  fields(row, "mode question", source);
  const mode = enumValue(row.mode, ["always", "conditional"] as const, source);
  if (mode === "always") {
    if (row.question !== undefined) throw new Error(`${source}: always applicability cannot declare question`);
    return { mode };
  }
  return { mode, question: requiredString(row.question, source) };
}
function parseCost(value: unknown, source: string): NonNullable<CatalogWorkflowDef["costEstimate"]> {
  const row = mapping(value, source);
  fields(row, "amount currency", source);
  if (row.amount === undefined) throw new Error(`${source}: cost amount required`);
  return { amount: optionalNumber(row.amount, source)!, currency: requiredString(row.currency, source) };
}
function parseSource(value: unknown, source: string): CatalogKnowledgeSource {
  const row = mapping(value, source);
  fields(
    row,
    "id name source_type url review_cadence_days claim_scope last_review_date reviewer publisher revision published_at retrieved_at rights selectors upstream_id",
    source,
  );
  const result: CatalogKnowledgeSource = {
    id: requiredString(row.id, source),
    name: requiredString(row.name, source),
    sourceType: requiredString(row.source_type, source),
    url: requiredString(row.url, source),
    reviewCadenceDays: asNumber(row.review_cadence_days, 30),
    claimScope: requiredString(row.claim_scope, source),
    lastReviewDate: requiredString(row.last_review_date, source),
    reviewer: requiredString(row.reviewer, source),
  };
  if (row.publisher !== undefined) result.publisher = requiredString(row.publisher, source);
  if (row.revision !== undefined) result.revision = requiredString(row.revision, source);
  if (row.published_at !== undefined) result.publishedAt = requiredString(String(row.published_at), source);
  if (row.retrieved_at !== undefined) result.retrievedAt = requiredString(String(row.retrieved_at), source);
  if (row.rights !== undefined) {
    const rights = mapping(row.rights, source);
    fields(rights, "status spdx evidence evidence_sha256 notes", source);
    result.rights = {
      status: enumValue(rights.status, ["verified", "unverified", "unknown", "incompatible", "not-redistributable", "not-applicable"] as const, source),
      ...(rights.spdx !== undefined ? { spdx: requiredString(rights.spdx, source) } : {}),
      ...(rights.evidence !== undefined ? { evidence: requiredString(rights.evidence, source) } : {}),
      ...(rights.evidence_sha256 !== undefined ? { evidenceSha256: requiredString(rights.evidence_sha256, source) } : {}),
      ...(rights.notes !== undefined ? { notes: requiredString(rights.notes, source) } : {}),
    };
  }
  if (row.selectors !== undefined) result.selectors = asStringArray(row.selectors);
  if (row.upstream_id !== undefined) result.upstreamId = requiredString(row.upstream_id, source);
  return result;
}
function parseDerivation(value: unknown, source: string): CatalogKnowledgeDerivation {
  const row = mapping(value, source);
  fields(row, "source_ids relationship baseline selectors rationale omissions reviewer reviewed_at evaluation notice", source);
  const sourceIds = asStringArray(row.source_ids);
  if (!sourceIds.length) throw new Error(`${source}: derivation source_ids required`);
  return {
    sourceIds,
    relationship: enumValue(row.relationship, ["informed", "adapted", "copied", "wrapped", "dependency", "referenced"] as const, source),
    ...(row.baseline !== undefined ? { baseline: requiredString(row.baseline, source) } : {}),
    ...(row.selectors !== undefined ? { selectors: asStringArray(row.selectors) } : {}),
    rationale: requiredString(row.rationale, source),
    ...(row.omissions !== undefined ? { omissions: asStringArray(row.omissions) } : {}),
    reviewer: requiredString(row.reviewer, source),
    reviewedAt: requiredString(String(row.reviewed_at ?? ""), source),
    ...(row.evaluation !== undefined ? { evaluation: requiredString(row.evaluation, source) } : {}),
    ...(row.notice !== undefined ? { notice: requiredString(row.notice, source) } : {}),
  };
}
function parseRole(value: unknown, source: string): CatalogRole {
  const row = mapping(value, source);
  fields(
    row,
    "id name prompt_path context_origin scope parent_prompt_paths context_pack_ids skill_routes tool_routes capability_ids output_path_prefixes reviewed_by",
    source,
  );
  const id = requiredString(row.id, source);
  if (!id.startsWith("role.")) throw new Error(`${source}: role id required`);
  const routes = (value: unknown) =>
    asArray(value).map((item) => {
      const route = mapping(item, source);
      fields(route, "id when", source);
      return { id: requiredString(route.id, source), when: requiredString(route.when, source) };
    });
  return {
    id: id as CatalogRole["id"],
    name: requiredString(row.name, source),
    promptPath: requiredString(row.prompt_path, source),
    ...(row.context_origin === undefined ? {} : { contextOrigin: enumValue(row.context_origin, ["workspace", "package"] as const, source) }),
    scope: requiredString(row.scope, source),
    parentPromptPaths: asStringArray(row.parent_prompt_paths),
    contextPackIds: asStringArray(row.context_pack_ids) as CatalogRole["contextPackIds"],
    skillRoutes: routes(row.skill_routes),
    toolRoutes: routes(row.tool_routes),
    capabilityIds: asStringArray(row.capability_ids),
    outputPathPrefixes: asStringArray(row.output_path_prefixes),
    ...(row.reviewed_by === undefined ? {} : { reviewedBy: asStringArray(row.reviewed_by) as CatalogRole["reviewedBy"] }),
  };
}
function parseGate(value: unknown, source: string): CatalogGate {
  const row = mapping(value, source);
  fields(row, "id command script_path command_manifest_path owner_domain_id audit", source);
  const id = requiredString(row.id, source);
  if (!id.startsWith("gate.")) throw new Error(`${source}: gate id required`);
  return {
    id: id as CatalogGate["id"],
    command: requiredString(row.command, source),
    scriptPath: asString(row.script_path) || undefined,
    ...(row.command_manifest_path === undefined ? {} : { commandManifestPath: requiredString(row.command_manifest_path, source) }),
    ownerDomainId: requiredString(row.owner_domain_id, source) as CatalogGate["ownerDomainId"],
    audit: enumValue(row.audit, ["required", "excluded", "manual"] as const, source),
  };
}

function parseContextPack(value: unknown, source: string): NonNullable<PackManifest["contextPacks"]>[number] {
  const row = mapping(value, source);
  fields(row, "id title reference_ids", source);
  const id = requiredString(row.id, source);
  if (!id.startsWith("context.")) throw Error(`${source}: context id required`);
  return { id: id as `context.${string}`, title: requiredString(row.title, source), referenceIds: asStringArray(row.reference_ids) as `reference.${string}`[] };
}
function parsePhase(value: unknown, source: string): NonNullable<PackManifest["phases"]>[number] {
  const row = mapping(value, source);
  fields(row, "id key label focus primary_output order orient_window", source);
  const id = requiredString(row.id, source);
  if (!id.startsWith("phase.")) throw Error(`${source}: phase id required`);
  return {
    id: id as `phase.${string}`,
    key: requiredString(row.key, source),
    label: requiredString(row.label, source),
    focus: requiredString(row.focus, source),
    primaryOutput: requiredString(row.primary_output, source),
    order: asNumber(row.order, 0),
    ...(row.orient_window === undefined ? {} : { orientWindow: asBoolean(row.orient_window) }),
  };
}
function parseLane(value: unknown, source: string): NonNullable<PackManifest["lanes"]>[number] {
  const row = mapping(value, source);
  fields(row, "id key label owner_domain_id dependency_ids", source);
  const id = requiredString(row.id, source);
  if (!id.startsWith("lane.")) throw Error(`${source}: lane id required`);
  return {
    id: id as `lane.${string}`,
    key: enumValue(row.key, laneKeys, source),
    label: requiredString(row.label, source),
    ownerDomainId: requiredString(row.owner_domain_id, source) as `domain.${string}`,
    dependencyIds: asStringArray(row.dependency_ids) as `lane.${string}`[],
  };
}
function parseProfile(value: unknown, source: string): NonNullable<PackManifest["profiles"]>[number] {
  const row = mapping(value, source);
  fields(row, "id title description defers_lane_keys", source);
  return {
    id: requiredString(row.id, source),
    title: requiredString(row.title, source),
    description: requiredString(row.description, source),
    defersLaneKeys: asStringArray(row.defers_lane_keys).map((key) => enumValue(key, laneKeys, source)),
  };
}
function parseRepositoryProfile(value: unknown, source: string): NonNullable<PackManifest["repositoryProfiles"]>[number] {
  const row = mapping(value, source);
  fields(row, "id title description responsibility always_canonical always_generated require_readme require_community_health", source);
  return {
    id: requiredString(row.id, source),
    title: requiredString(row.title, source),
    description: requiredString(row.description, source),
    responsibility: requiredString(row.responsibility, source),
    alwaysCanonical: asStringArray(row.always_canonical),
    alwaysGenerated: asStringArray(row.always_generated),
    requireReadme: asBoolean(row.require_readme) ?? false,
    requireCommunityHealth: asBoolean(row.require_community_health) ?? false,
  };
}
function parseProviderSummary(value: unknown, source: string): NonNullable<PackManifest["providerContracts"]>[number] {
  const row = mapping(value, source);
  fields(row, "id version kind title source_ids", source);
  return {
    id: requiredString(row.id, source),
    version: requiredString(row.version, source),
    kind: enumValue(row.kind, ["billing", "agent_runtime", "store_cli"] as const, source),
    title: requiredString(row.title, source),
    sourceIds: asStringArray(row.source_ids),
  };
}
