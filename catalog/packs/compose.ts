import { createHash } from "node:crypto";
import { isBusinessUnit } from "../../kernel/schema/types.js";
import { buildArtifacts } from "../artifacts.js";
import type { Catalog, CatalogComposition, CatalogCountPin, CatalogIssue, CatalogPackPin, CatalogWorkflowDef, ReferenceId } from "../types.js";
import { isPackId, packKindFromId, PAID_GENERATIVE_AI_PACK_ID, type PackCompositionIssue, type PackExtension, type PackManifest } from "./types.js";

const ACTION_CLASS_RANK: Record<string, number> = {
  observe: 0,
  draft: 1,
  mutate: 2,
  publish: 3,
  spend: 4,
  release: 5,
  destructive: 6,
};

export interface PackCompositionResult {
  catalog: Catalog;
  issues: PackCompositionIssue[];
}

export function catalogCounts(catalog: Catalog): CatalogCountPin {
  return { domains: catalog.domains.length, workflows: catalog.workflows.length, references: catalog.references.length };
}

function canonicalData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalData);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalData(entry)]),
    );
  return value;
}
function catalogSemantics(catalog: Catalog): unknown {
  const { composition: _composition, ...content } = catalog;
  return canonicalData(
    Object.fromEntries(
      Object.entries(content).map(([key, value]) => [
        key,
        Array.isArray(value) && value.every((item) => item && typeof item === "object" && "id" in item)
          ? [...value].sort((a, b) => String(a.id).localeCompare(String(b.id)))
          : value,
      ]),
    ),
  );
}

export function compositionFingerprint(input: {
  skillVersion: string;
  packs: readonly CatalogPackPin[];
  domainIds: readonly string[];
  workflowIds: readonly string[];
  catalog: Catalog;
}): string {
  const canonical = JSON.stringify({
    skillVersion: input.skillVersion,
    semantics: catalogSemantics(input.catalog),
    packs: [...input.packs]
      .map((pack) => ({ id: pack.id, kind: pack.kind, version: pack.version, revision: pack.revision, contentDigest: pack.contentDigest }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    domainIds: [...input.domainIds].sort(),
    workflowIds: [...input.workflowIds].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function withComposition(catalog: Catalog, packs: readonly CatalogPackPin[], base: CatalogCountPin, deltas: Record<string, CatalogCountPin>): Catalog {
  const composition: CatalogComposition = {
    fingerprint: compositionFingerprint({
      skillVersion: catalog.skillVersion,
      catalog,
      packs,
      domainIds: catalog.domains.map((domain) => domain.id),
      workflowIds: catalog.workflows.map((workflow) => workflow.id),
    }),
    packs: [...packs].sort((left, right) => left.id.localeCompare(right.id)),
    base,
    deltas,
  };
  return { ...catalog, composition };
}

export function composePacks(base: Catalog, packs: readonly PackManifest[]): PackCompositionResult {
  const issues: PackCompositionIssue[] = [];
  const baseCounts = catalogCounts(base);
  if (packs.length === 0) {
    return { catalog: withComposition(base, [], baseCounts, {}), issues };
  }

  for (const pack of packs) {
    if (!isPackId(pack.id) || packKindFromId(pack.id) !== pack.kind) {
      issues.push(
        error("pack_composition.identity_invalid", `pack id "${pack.id}" must be capability.* or business-pack.* and match kind ${pack.kind}`, pack.id),
      );
    }
    if (!pack.revision.trim()) {
      issues.push(error("pack_composition.pin_missing", `${pack.id} has no revision pin`, pack.id));
    }
  }

  const seenPackIds = new Set<string>();
  for (const pack of packs) {
    if (seenPackIds.has(pack.id)) issues.push(error("pack_composition.duplicate_id", `duplicate pack id ${pack.id}`, pack.id));
    seenPackIds.add(pack.id);
  }

  const spendPacks = packs.filter((pack) => pack.createsProviderSpend);
  if (spendPacks.length > 0 && !packs.some((pack) => pack.id === PAID_GENERATIVE_AI_PACK_ID)) {
    issues.push(
      error(
        "pack_composition.paid_ai_controls_missing",
        `provider-spend packs (${spendPacks.map((pack) => pack.id).join(", ")}) require ${PAID_GENERATIVE_AI_PACK_ID} so the control record and incident runbook travel together`,
        spendPacks[0]?.id,
      ),
    );
  }

  const byId = new Map(packs.map((pack) => [pack.id, pack]));
  for (const pack of packs) {
    for (const dependency of pack.dependsOn) {
      if (!byId.has(dependency)) {
        issues.push(error("pack_composition.unresolved_reference", `${pack.id} depends on missing pack ${dependency}`, pack.id));
      }
    }
  }

  const ordered = topologicalPacks(packs, issues);
  if (issues.some((issue) => issue.code === "pack_composition.dependency_cycle")) {
    return { catalog: withComposition(base, pinsOf(packs), baseCounts, {}), issues };
  }

  const catalog: Catalog = {
    ...base,
    areas: base.areas.map((area) => ({ ...area, domainIds: [...area.domainIds] })),
    domains: [...base.domains],
    workflows: base.workflows.map((workflow) => ({ ...workflow, referenceIds: [...workflow.referenceIds] })),
    references: [...base.references],
    roles: [...base.roles],
    contextPacks: [...base.contextPacks],
    phases: [...base.phases],
    lanes: [...base.lanes],
    profiles: [...base.profiles],
    repositoryProfiles: [...(base.repositoryProfiles ?? [])],
    providerContracts: [...(base.providerContracts ?? [])],
    gates: [...base.gates],
    artifacts: [...base.artifacts],
    bindings: [...(base.bindings ?? [])],
  };
  const knownIds = new Set(collectIds(catalog));
  const deltas: Record<string, CatalogCountPin> = {};
  const slotOwners = new Map<string, { packId: string; slots: string[] }>();

  for (const pack of ordered) {
    const before = catalogCounts(catalog);
    for (const capability of pack.capabilities) {
      if (knownIds.has(capability.id)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate global id ${capability.id}`, pack.id));
        continue;
      }
      knownIds.add(capability.id);
      slotOwners.set(capability.id, { packId: pack.id, slots: [...capability.extensionSlots] });
    }
    for (const area of pack.areas) {
      const existing = catalog.areas.find((entry) => entry.id === area.id);
      if (existing) {
        existing.domainIds = unique([...existing.domainIds, ...area.domainIds]);
        continue;
      }
      if (knownIds.has(area.id)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate global id ${area.id}`, pack.id));
        continue;
      }
      catalog.areas.push(area);
      knownIds.add(area.id);
    }
    for (const domain of pack.domains) {
      if (knownIds.has(domain.id) || catalog.domains.some((entry) => entry.id === domain.id)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate global id ${domain.id}`, pack.id));
        continue;
      }
      if (domain.grantable === true && (domain.operatorGroup === undefined || !isBusinessUnit(domain.operatorGroup))) {
        issues.push(error("pack_composition.invalid_operator_group", `${domain.id} is grantable but has no valid operator group`, pack.id));
        continue;
      }
      catalog.domains.push(domain);
      knownIds.add(domain.id);
    }
    for (const reference of pack.references) {
      if (knownIds.has(reference.id) || catalog.references.some((entry) => entry.id === reference.id)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate global id ${reference.id}`, pack.id));
        continue;
      }
      catalog.references.push(reference);
      knownIds.add(reference.id);
    }
    for (const role of pack.roles ?? []) {
      if (knownIds.has(role.id)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate global id ${role.id}`, pack.id));
        continue;
      }
      catalog.roles.push(role);
      knownIds.add(role.id);
    }
    for (const gate of pack.gates ?? []) {
      if (knownIds.has(gate.id) || catalog.gates.some((entry) => entry.command === gate.command)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate gate id or command ${gate.id}`, pack.id));
        continue;
      }
      catalog.gates.push(gate);
      knownIds.add(gate.id);
    }
    for (const field of ["contextPacks", "phases", "lanes", "profiles", "repositoryProfiles", "providerContracts"] as const) {
      const target = catalog[field] as Array<{ id: string }>;
      for (const entry of pack[field] ?? []) {
        if (target.some((prior) => prior.id === entry.id)) {
          issues.push(error("pack_composition.duplicate_id", `duplicate ${field} id ${entry.id}`, pack.id));
          continue;
        }
        if (["contextPacks", "phases", "lanes"].includes(field) && knownIds.has(entry.id)) {
          issues.push(error("pack_composition.duplicate_id", `duplicate global id ${entry.id}`, pack.id));
          continue;
        }
        target.push(structuredClone(entry));
        knownIds.add(entry.id);
      }
    }
    for (const workflow of pack.workflows) {
      if (knownIds.has(workflow.id) || catalog.workflows.some((entry) => entry.id === workflow.id)) {
        issues.push(error("pack_composition.duplicate_id", `duplicate global id ${workflow.id}`, pack.id));
        continue;
      }
      catalog.workflows.push({ ...workflow, referenceIds: [...workflow.referenceIds] });
      knownIds.add(workflow.id);
      if (workflow.extensionSlots?.length) slotOwners.set(workflow.id, { packId: pack.id, slots: [...workflow.extensionSlots] });
    }
    for (const extension of pack.extensions) {
      if (extension.kind === "weaken" || (extension.removeGates?.length ?? 0) > 0) {
        issues.push(
          error(
            "pack_composition.monotonicity_violation",
            `${pack.id} weakens ${extension.targetId} slot "${extension.slot}"; packs may bind or strengthen only`,
            pack.id,
          ),
        );
        continue;
      }
      const owner = slotOwners.get(extension.targetId) ?? slotOwnerFromCatalog(catalog, extension.targetId);
      if (!owner || !owner.slots.includes(extension.slot)) {
        issues.push(error("pack_composition.invalid_extension_slot", `${pack.id} binds unknown slot "${extension.slot}" on ${extension.targetId}`, pack.id));
        continue;
      }
      applyAcceptedBinding(catalog, pack, extension, issues);
    }
    const after = catalogCounts(catalog);
    deltas[pack.id] = {
      domains: after.domains - before.domains,
      workflows: after.workflows - before.workflows,
      references: after.references - before.references,
    };
  }

  const composedIds = new Set([
    ...catalog.domains.map((domain) => domain.id),
    ...catalog.workflows.map((workflow) => workflow.id),
    ...catalog.references.map((reference) => reference.id),
    ...catalog.roles.map((role) => role.id),
  ]);
  for (const pack of ordered) {
    for (const workflow of pack.workflows) {
      if (!catalog.domains.some((domain) => domain.id === workflow.domainId)) {
        issues.push(error("pack_composition.unresolved_reference", `${workflow.id} names unknown domain ${workflow.domainId}`, pack.id));
      }
      for (const referenceId of workflow.referenceIds) {
        if (!catalog.references.some((reference) => reference.id === referenceId)) {
          issues.push(error("pack_composition.unresolved_reference", `${workflow.id} binds unknown reference ${referenceId}`, pack.id));
        }
      }
      for (const dependency of workflow.dependencies) {
        if (!catalog.workflows.some((entry) => entry.id === dependency) && !composedIds.has(dependency)) {
          issues.push(error("pack_composition.unresolved_reference", `${workflow.id} depends on unknown ${dependency}`, pack.id));
        }
      }
      if (!catalog.roles.some((role) => role.id === workflow.roleId))
        issues.push(error("pack_composition.unresolved_reference", `${workflow.id} names unknown role ${workflow.roleId}`, pack.id));
      for (const command of workflow.gateCommands) {
        if (!catalog.gates.some((gate) => gate.command === command))
          issues.push(error("pack_composition.unresolved_reference", `${workflow.id} names unknown gate command ${command}`, pack.id));
      }
      if (ACTION_CLASS_RANK[workflow.actionClass] === undefined) {
        issues.push(error("pack_composition.invalid_extension_slot", `${workflow.id} has unknown action class ${workflow.actionClass}`, pack.id));
      }
    }
  }

  const reportMissing = (id: string, reference: string) => issues.push(error("pack_composition.unresolved_reference", `${id} names unknown ${reference}`));
  for (const context of catalog.contextPacks)
    for (const reference of context.referenceIds) if (!catalog.references.some((row) => row.id === reference)) reportMissing(context.id, reference);
  for (const lane of catalog.lanes) {
    if (!catalog.domains.some((row) => row.id === lane.ownerDomainId)) reportMissing(lane.id, lane.ownerDomainId);
    for (const dependency of lane.dependencyIds) if (!catalog.lanes.some((row) => row.id === dependency)) reportMissing(lane.id, dependency);
  }
  for (const profile of catalog.profiles)
    for (const key of profile.defersLaneKeys) if (!catalog.lanes.some((row) => row.key === key)) reportMissing(profile.id, key);
  for (const role of catalog.roles) for (const id of role.contextPackIds) if (!catalog.contextPacks.some((row) => row.id === id)) reportMissing(role.id, id);
  for (const workflow of catalog.workflows) {
    for (const id of workflow.phaseIds) if (!catalog.phases.some((row) => row.id === id)) reportMissing(workflow.id, id);
    for (const key of workflow.laneIds) if (!catalog.lanes.some((row) => row.key === key)) reportMissing(workflow.id, key);
  }
  catalog.artifacts = buildArtifacts(catalog.workflows);
  const pins = pinsOf(ordered);
  return { catalog: withComposition(catalog, pins, baseCounts, deltas), issues };
}

function pinsOf(packs: readonly PackManifest[]): CatalogPackPin[] {
  return packs.map((pack) => ({
    id: pack.id,
    kind: pack.kind,
    version: pack.version,
    revision: pack.revision,
    contentDigest: createHash("sha256")
      .update(JSON.stringify(canonicalData(pack)))
      .digest("hex"),
  }));
}

function collectIds(catalog: Catalog): string[] {
  return [
    ...catalog.areas.map((item) => item.id),
    ...catalog.domains.map((item) => item.id),
    ...catalog.phases.map((item) => item.id),
    ...catalog.lanes.map((item) => item.id),
    ...catalog.roles.map((item) => item.id),
    ...catalog.contextPacks.map((item) => item.id),
    ...catalog.references.map((item) => item.id),
    ...catalog.workflows.map((item) => item.id),
    ...catalog.artifacts.map((item) => item.id),
    ...catalog.gates.map((item) => item.id),
  ];
}

function isReferenceId(value: string): value is ReferenceId {
  return value.startsWith("reference.");
}

function applyAcceptedBinding(catalog: Catalog, pack: PackManifest, extension: PackExtension, issues: PackCompositionIssue[]): void {
  const requestedIds = extension.referenceIds?.length ? extension.referenceIds : pack.references.map((reference) => reference.id);
  const unknownIds = requestedIds.filter((id) => !catalog.references.some((reference) => reference.id === id));
  if (unknownIds.length > 0) {
    for (const id of unknownIds) {
      issues.push(error("pack_composition.unresolved_reference", `${pack.id} binds unknown reference ${id}`, pack.id));
    }
    return;
  }
  const boundReferenceIds = unique(requestedIds.filter((id): id is ReferenceId => isReferenceId(id)));
  catalog.bindings = [
    ...(catalog.bindings ?? []),
    {
      packId: pack.id,
      targetId: extension.targetId,
      slot: extension.slot,
      kind: extension.kind === "strengthen" ? "strengthen" : "bind",
      referenceIds: boundReferenceIds,
    },
  ];
  const namedRecipients = bindingRecipients(catalog, pack, extension);
  for (const referenceId of boundReferenceIds) {
    const reference = catalog.references.find((entry) => entry.id === referenceId);
    const recipients =
      namedRecipients.length > 0
        ? namedRecipients
        : catalog.workflows.filter((workflow) => reference !== undefined && workflow.domainId === reference.domainId);
    for (const workflow of recipients) {
      workflow.referenceIds = unique([...workflow.referenceIds, referenceId]);
    }
  }
}

function bindingRecipients(catalog: Catalog, pack: PackManifest, extension: PackExtension): CatalogWorkflowDef[] {
  const targetWorkflow = catalog.workflows.find((workflow) => workflow.id === extension.targetId);
  if (targetWorkflow) return [targetWorkflow];
  return catalog.workflows.filter((workflow) => pack.workflows.some((candidate) => candidate.id === workflow.id));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function slotOwnerFromCatalog(catalog: Catalog, targetId: string): { packId: string; slots: string[] } | undefined {
  const workflow = catalog.workflows.find((entry) => entry.id === targetId);
  if (workflow?.extensionSlots?.length) return { packId: "base", slots: [...workflow.extensionSlots] };
  return undefined;
}

function topologicalPacks(packs: readonly PackManifest[], issues: PackCompositionIssue[]): PackManifest[] {
  const remaining = new Map(packs.map((pack) => [pack.id, new Set(pack.dependsOn)]));
  const byId = new Map(packs.map((pack) => [pack.id, pack]));
  const ordered: PackManifest[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => [...deps].every((dep) => !remaining.has(dep)))
      .map(([id]) => id)
      .sort((left, right) => left.localeCompare(right));
    if (ready.length === 0) {
      issues.push(error("pack_composition.dependency_cycle", `static pack dependency cycle among ${[...remaining.keys()].sort().join(", ")}`));
      return [...packs].sort((left, right) => left.id.localeCompare(right.id));
    }
    const nextId = ready[0]!;
    remaining.delete(nextId);
    const pack = byId.get(nextId);
    if (pack) ordered.push(pack);
  }
  return ordered;
}

function error(code: string, message: string, packId?: string): PackCompositionIssue {
  return { severity: "error", code, message, ...(packId ? { packId, path: packId } : {}) };
}

export function compositionHasErrors(issues: readonly CatalogIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
