import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import {
  CONTRIBUTION_API_VERSION,
  contributionManifestSchema,
  type ContributionManifest,
  type ContributionScope,
  type ContributionUnit,
  type Disposition,
} from "../../contracts/contribution/contract.js";
import { renderAdoptionMap } from "./adoption-map.js";
import { findExistingOwners, loadOwnerContext, primaryKnowledgeOwner, type ExistingOwner, type OwnerMatchContext } from "./existing-owners.js";
import { intakeLocalPath, intakeUrl, type SourceIntake } from "./intake.js";
import {
  adoptionMapPath,
  contributionYamlPath,
  goalMentionsBusiness,
  goalPaths,
  inferScope,
  isMaintenancePath,
  normalizeTopic,
  reconcileScope,
  slugify,
  truncate,
  writeContributionManifest,
} from "./manifest-io.js";
import type { PlanData } from "./types.js";
import { applicabilityClaims, carriesAesthetic, carriesMethod, describesRecipe, hasMeasurableClaim } from "./untrusted.js";

/**
 * `contribution.plan`: inspect the named sources, propose units with dispositions, find existing
 * owners, decide the routing verdict, and assemble the manifest. Every disposition is a proposal
 * for the maintainer. Files are written only when the caller names a target.
 */
export interface IntakeDependencies {
  skillRoot: string;
  now: () => Date;
  fetchText?: (url: string) => Promise<{ text: string; httpStatus: 200 }>;
}

export interface PlanInput {
  sources: Array<{ url: string } | { path: string }>;
  goal: string;
  scope?: ContributionScope;
  target?: string;
  synthetic: boolean;
  network: boolean;
  batch: boolean;
}

const GENERIC_TOPICS = new Set([
  "installation",
  "install",
  "usage",
  "license",
  "licence",
  "contributing",
  "getting started",
  "overview",
  "introduction",
  "requirements",
  "features",
  "setup",
  "quick start",
  "quickstart",
  "credits",
  "acknowledgements",
  "acknowledgments",
  "changelog",
  "faq",
  "examples",
  "api",
  "contents",
  "table of contents",
  "readme.md",
  "readme",
  "license.md",
  "license.txt",
  "package.json",
  "package.swift",
  "skill.md",
  "agents.md",
  "claude.md",
  ".gitignore",
  "contributing.md",
  "changelog.md",
]);

function batchOverlap(intakes: readonly SourceIntake[]): ContributionManifest["batchOverlap"] {
  const topics = new Map<string, Set<string>>();
  for (const intake of intakes) {
    const candidates = new Set([...intake.headings.map(normalizeTopic), ...intake.basenames.map((name) => name.toLowerCase())]);
    for (const topic of candidates) {
      if (!topic || GENERIC_TOPICS.has(topic) || topic.length < 4) continue;
      topics.set(topic, (topics.get(topic) ?? new Set()).add(intake.record.id));
    }
  }
  return [...topics.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 20)
    .map(([topic, ids]) => ({ topic: truncate(topic, 400), sourceIds: [...ids].sort() }));
}

interface UnitContext {
  readonly goal: string;
  readonly scopeHint: ContributionScope | undefined;
  readonly owners: readonly ExistingOwner[];
  readonly ownerContext: OwnerMatchContext;
}

function targetKindForPath(target: string): ContributionUnit["target"]["kind"] {
  if (target.startsWith("adapters/")) return "provider-adapter";
  if (target.startsWith("checks/")) return "check";
  if (target.startsWith("catalog/workflows/")) return "workflow";
  return "document";
}

function proposeUnits(intake: SourceIntake, context: UnitContext): ContributionUnit[] {
  const source = intake.record;
  const sid = source.id;
  const verified = source.rights.status === "verified";
  const inaccessible = source.retrieval.status === "inaccessible";
  const rightsLabel = `rights ${source.rights.status}${source.rights.spdx ? ` (${source.rights.spdx})` : ""}`;
  const refusedFiles = [...new Set(source.directives.map((directive) => directive.location.split(":")[0]!))];
  const omitted = [
    ...new Set([
      ...intake.installHooks.map((file) => `${file}: never executed`),
      ...refusedFiles.map((file) => `${file}: refused directives recorded, not followed`),
    ]),
  ];
  const applicability = applicabilityClaims(intake.proseText);
  const units: ContributionUnit[] = [];
  const goalTarget = goalPaths(context.goal).find(isMaintenancePath);
  const prose = intake.proseText;
  const proseSelector = source.selectors.find((selector) => /readme|skill\.md|\.md$|^\//iu.test(selector)) ?? source.selectors[0];
  const knowledgeDisposition: Disposition = inaccessible ? "reference" : verified ? "adapt" : "reference";
  const knowledgeTarget = (): ContributionUnit["target"] => {
    if (context.scopeHint === "business") return { kind: "document", path: `research/adopted/${sid}.md` };
    const owner = primaryKnowledgeOwner(context.owners, context.ownerContext);
    if (owner) return { kind: "existing-reference", id: owner.id, path: owner.path, owner: owner.manifestPath };
    return { kind: "new-reference", id: `reference.contributed.${sid}`, path: `knowledge/contributed/${sid}.md` };
  };
  const hasProse = prose.trim().length > 0;
  if (inaccessible || (hasProse && (carriesMethod(prose) || ["skill", "post", "article"].includes(source.kind)))) {
    units.push({
      id: `${sid}-knowledge`,
      kind: "knowledge",
      title: truncate(`${source.title}: method and heuristics`, 400),
      upstream: { sourceId: sid, ...(proseSelector ? { selector: truncate(proseSelector, 400) } : {}) },
      target: inaccessible ? { kind: "undecided" } : knowledgeTarget(),
      disposition: knowledgeDisposition,
      status: "proposed",
      rationale: truncate(
        inaccessible
          ? `The source could not be read (${source.retrieval.notes ?? "no detail"}); it can only be cited until it is retrieved in full.`
          : `${verified ? "Rights verified, so the method can be reauthored in our vocabulary" : `${rightsLabel}, so the method is cited, not adapted`}. ${carriesAesthetic(prose) ? "It carries aesthetic and style preferences, which stay a selectable method and never a universal default." : "The text carries method or heuristics rather than a bare listing."}`,
        2000,
      ),
      verification: ["b2c contribute check", "b2c contribute preview", "counterexample evaluation before promotion"],
      kept: intake.headings.slice(0, 8).map((heading) => truncate(heading, 400)),
      changed: verified && !inaccessible ? ["reauthored in the builder's vocabulary; creator identity retained in the derivation"] : [],
      omitted,
      deferred: [],
      conflicts: [],
      selection: "selected-method",
      applicability,
    });
  }
  if (!inaccessible && hasProse && describesRecipe(prose)) {
    units.push({
      id: `${sid}-recipe`,
      kind: "recipe",
      title: truncate(`${source.title}: step sequence`, 400),
      upstream: { sourceId: sid, ...(proseSelector ? { selector: truncate(proseSelector, 400) } : {}) },
      target: { kind: "recipe", id: `recipe.contributed.${sid}` },
      disposition: knowledgeDisposition,
      status: "proposed",
      rationale: truncate(`The text lays out an ordered step sequence with a review or repair policy. ${rightsLabel}.`, 2000),
      verification: ["b2c contribute check", "rendered review of the recipe against an existing workflow"],
      kept: [],
      changed: [],
      omitted,
      deferred: [],
      conflicts: [],
      selection: "selected-method",
      applicability,
    });
  }
  for (const tree of intake.sourceTrees) {
    const disposition: Disposition = inaccessible ? "reference" : verified && (intake.hasManifest || intake.hasLockfile) ? "reuse" : "defer";
    const target: ContributionUnit["target"] =
      goalTarget !== undefined
        ? { kind: targetKindForPath(goalTarget), path: goalTarget }
        : context.scopeHint === "business"
          ? { kind: "extension-package", path: `packages/${sid}` }
          : { kind: "extension-package", path: `examples/extensions/${sid}` };
    units.push({
      id: `${sid}-impl-${slugify(tree === "." ? "root" : tree, 40)}`,
      kind: "implementation",
      title: truncate(`${source.title}: ${tree === "." ? "root" : tree} source tree`, 400),
      upstream: { sourceId: sid, selector: truncate(tree === "." ? "./" : `${tree}/`, 400) },
      target,
      disposition,
      status: "proposed",
      rationale: truncate(
        disposition === "reuse"
          ? `Rights verified and a manifest or lockfile pins the tree, so it can be reused as a pinned package resource.`
          : `Reuse needs verified rights and a manifest or lockfile; ${rightsLabel}, manifest ${intake.hasManifest ? "present" : "absent"}, lockfile ${intake.hasLockfile ? "present" : "absent"}.`,
        2000,
      ),
      verification: ["npm run test:fixtures", "extension conformance on the imported package"],
      kept: [],
      changed: [],
      omitted,
      deferred: disposition === "defer" ? ["until rights and pinning evidence exist"] : [],
      conflicts: [],
      selection: "selected-method",
      applicability,
    });
  }
  for (const [group, role] of [
    ["fonts", "font"],
    ["images", "image"],
    ["templates", "template"],
  ] as const) {
    const files = intake.files.filter((file) => file.role === role);
    if (!files.length) continue;
    const unknown = source.unknowns.some((entry) => files.some((file) => entry.startsWith(`${file.relativePath}:`)));
    const disposition: Disposition = inaccessible ? "reference" : verified && !unknown ? "reuse" : "defer";
    const directory = files[0]!.relativePath.includes("/") ? `${files[0]!.relativePath.slice(0, files[0]!.relativePath.lastIndexOf("/"))}/` : "./";
    units.push({
      id: `${sid}-${group}`,
      kind: "resource",
      title: truncate(`${source.title}: ${group} (${files.length})`, 400),
      upstream: { sourceId: sid, selector: truncate(directory, 400) },
      target: { kind: "extension-package", path: `examples/extensions/${sid}/assets/${group}` },
      disposition,
      status: "proposed",
      rationale: truncate(
        unknown
          ? `${group} without a license of their own stay deferred; rights unknown is never reuse.`
          : `${rightsLabel}; ${group} are covered by the source license scope.`,
        2000,
      ),
      verification: ["license text for each asset at the reviewed revision"],
      kept: [],
      changed: [],
      omitted: [],
      deferred: disposition === "defer" ? files.map((file) => truncate(file.relativePath, 400)) : [],
      conflicts: [],
      selection: "selected-method",
      applicability: [],
    });
  }
  const tests = intake.files.filter((file) => file.role === "test");
  if (!inaccessible && (tests.length || (hasProse && hasMeasurableClaim(prose)))) {
    units.push({
      id: `${sid}-evaluation`,
      kind: "evaluation",
      title: truncate(`${source.title}: evaluation`, 400),
      upstream: null,
      target: { kind: "evaluation-case", path: `checks/validation/repository/evals/launchbench/${sid}.yaml` },
      disposition: "original",
      status: "proposed",
      rationale: truncate(
        tests.length
          ? `The source ships ${tests.length} test file(s). Our own evaluation case is written from the behavior they describe; upstream tests are not copied.`
          : "The text makes a measurable claim. Our own evaluation case checks it before the claim is repeated.",
        2000,
      ),
      verification: ["b2c contribute evaluate"],
      kept: [],
      changed: [],
      omitted: [],
      deferred: [],
      conflicts: [],
      selection: "selected-method",
      applicability: [],
    });
  }
  const screenshots = intake.files.filter((file) => file.role === "screenshot");
  if (screenshots.length) {
    units.push({
      id: `${sid}-showcase`,
      kind: "showcase",
      title: truncate(`${source.title}: screenshots (${screenshots.length})`, 400),
      upstream: {
        sourceId: sid,
        selector: truncate(screenshots[0]!.relativePath.includes("/") ? `${screenshots[0]!.relativePath.split("/")[0]}/` : "./", 400),
      },
      target: { kind: "showcase" },
      disposition: "reference",
      status: "proposed",
      rationale: "Screenshots are the creator's captures. They are cited as a showcase, never presented as our own work.",
      verification: ["rendered review"],
      kept: [],
      changed: [],
      omitted: [],
      deferred: [],
      conflicts: [],
      selection: "reference-only",
      applicability: [],
    });
  }
  return units;
}

function missingCoreMechanism(intakes: readonly SourceIntake[]): ContributionManifest["missingCoreMechanism"] {
  const needs = intakes.filter((intake) => intake.requiresAgentConfiguration).map((intake) => intake.record.id);
  if (!needs.length) return { present: false };
  return {
    present: true,
    description: truncate(
      `${needs.join(", ")}: the source expects agent configuration or install-time execution (MCP registration, settings edits, setup or hook scripts). The extension contract expresses no such effect; the material is adopted without it or the mechanism is designed first.`,
      2000,
    ),
  };
}

export async function planContribution(input: PlanInput, deps: IntakeDependencies): Promise<PlanData> {
  if (!input.sources.length) throw new Error("contribution.invalid_input: at least one source is required.");
  const intakeOptions = { goal: input.goal, now: deps.now, network: input.network, ...(deps.fetchText ? { fetchText: deps.fetchText } : {}) };
  const intakes: SourceIntake[] = [];
  let networkUsed = false;
  for (const [index, source] of input.sources.entries()) {
    if ("url" in source) {
      intakes.push(await intakeUrl(source.url, index, intakeOptions));
      networkUsed = true;
    } else {
      intakes.push(intakeLocalPath(source.path, index, intakeOptions));
    }
  }
  const ownerContext = loadOwnerContext(deps.skillRoot);
  const owners = findExistingOwners({ goal: input.goal, sources: intakes }, ownerContext);
  const scopeHint = input.scope ?? (goalMentionsBusiness(input.goal) ? "business" : undefined);
  const units = intakes.flatMap((intake) => proposeUnits(intake, { goal: input.goal, scopeHint, owners, ownerContext }));
  // The verdict follows the intended targets and effect (ADR-0005 row 5). A declared scope is
  // recorded in routing.reason, never obeyed; a declaration narrower than the inference is refused.
  const inference = inferScope(input.goal, units);
  const { scope, reason: routingReason } = reconcileScope(input.scope, inference, (message) => {
    throw new Error(`contribution.scope_refused: ${message}`);
  });
  const targets = [...new Set(units.map((unit) => unit.target.path ?? unit.target.id ?? unit.target.kind))];
  const hasReferenceTarget = units.some((unit) => unit.target.kind === "existing-reference" || unit.target.kind === "new-reference");
  const hasPackageTarget = units.some((unit) => ["extension-package", "provider-adapter", "check"].includes(unit.target.kind));
  const uncertainties = [
    ...intakes.flatMap((intake) => intake.record.unknowns.map((unknown) => `${intake.record.id}: ${unknown}`)),
    ...intakes
      .filter((intake) => intake.record.retrieval.status !== "complete")
      .map(
        (intake) =>
          `${intake.record.id}: retrieval ${intake.record.retrieval.status}${intake.record.retrieval.notes ? ` (${intake.record.retrieval.notes})` : ""}`,
      ),
    ...intakes
      .filter((intake) => intake.record.rights.status !== "verified")
      .map((intake) => `${intake.record.id}: rights ${intake.record.rights.status}; adapt, reuse, wrap, and vendor stay blocked until license text is read`),
    ...[...new Set(units.flatMap((unit) => unit.applicability))].map((claim) => `verify "${claim}" against a primary source before promotion`),
  ].map((entry) => truncate(entry, 400));
  const firstSourceId = intakes[0]!.record.id;
  const manifest = contributionManifestSchema.parse({
    apiVersion: CONTRIBUTION_API_VERSION,
    id: slugify(`${slugify(input.goal, 40)}-${firstSourceId}`, 120),
    goal: truncate(input.goal, 2000),
    scope,
    routing: {
      intendedTarget: truncate(targets.join(", ") || "undecided", 400),
      effect: "proposal only: contribution.yaml and ADOPTION_MAP.md under --target; no catalog, workspace, package, or provider change",
      verdict: scope,
      reason: truncate(routingReason, 2000),
    },
    createdAt: deps.now().toISOString(),
    synthetic: input.synthetic,
    sources: intakes.map((intake) => intake.record),
    batchOverlap: input.batch || intakes.length > 1 ? batchOverlap(intakes) : [],
    existingOwners: owners,
    units,
    derivations: [],
    evaluations: [],
    affectedOutputs: targets.map((target) => truncate(target, 400)),
    requiredChecks: [
      "b2c contribute check",
      "b2c contribute preview",
      ...(hasReferenceTarget ? ["npm run check:catalog"] : []),
      ...(hasPackageTarget ? ["npm run test:fixtures"] : []),
    ],
    uncertainties,
    missingCoreMechanism: missingCoreMechanism(intakes),
    notices: [],
  } satisfies ContributionManifest);
  const adoptionMapMarkdown = renderAdoptionMap(manifest);
  let written: PlanData["written"] = null;
  if (input.target) {
    const yamlFile = contributionYamlPath(input.target);
    if (existsSync(yamlFile)) {
      let existingId: string | undefined;
      try {
        const parsed = YAML.parse(readFileSync(yamlFile, "utf8")) as { id?: unknown } | null;
        existingId = typeof parsed?.id === "string" ? parsed.id : undefined;
      } catch {
        existingId = undefined;
      }
      if (existingId !== manifest.id)
        throw new Error(
          `contribution.target_conflict: ${yamlFile} holds contribution ${existingId ?? "(unreadable)"}, not ${manifest.id}; choose another --target or remove it.`,
        );
    }
    mkdirSync(input.target, { recursive: true });
    const contributionYaml = writeContributionManifest(input.target, manifest);
    const adoptionMap = adoptionMapPath(input.target);
    writeFileSync(adoptionMap, adoptionMapMarkdown, "utf8");
    written = { contributionYaml, adoptionMap };
  }
  return {
    manifest,
    adoptionMapMarkdown,
    written,
    refusedDirectives: manifest.sources.reduce((sum, source) => sum + source.directives.length, 0),
    networkUsed,
    routing: { verdict: manifest.routing.verdict, reason: manifest.routing.reason },
  };
}
