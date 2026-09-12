import path from "node:path";
import { readFileSync } from "node:fs";
import { publicBusinessAreas } from "./areas.js";
import type { Catalog, CatalogWorkflowDef } from "./types.js";

/** Presentation metadata only. Workflows and knowledge manifests retain every behavioral contract. */
export interface TaskSkill {
  name: string;
  title: string;
  description: string;
  workflowId: string;
  groupId?: string;
  /** Presentation-only placement; runtime domain and workflow ownership stay canonical. */
  publicArea?: (typeof publicBusinessAreas)[number]["slug"];
  routeCue?: string;
  /** Exact, manifest-backed method selection for focused use. */
  method?: { referenceId: string; heading: string };
}

export const taskSkills: readonly TaskSkill[] = [
  {
    name: "b2c-research-opportunity",
    title: "Research an opportunity",
    description:
      "Research whether a consumer-app idea is worth building. Compare demand, competitors, distribution, offer evidence, and product scope; recommend Go, Pivot, or Kill. Use for opportunity validation or delegated idea selection, not a narrow code fix or execution of an entire launch.",
    workflowId: "workflow.research.research-backed-spec",
    publicArea: "opportunity",
    routeCue: "Validate an app opportunity",
    method: { referenceId: "reference.research.go-pivot-or-kill", heading: "1. The Category Revenue Reality Bar" },
  },
  {
    name: "b2c-design-onboarding",
    title: "Design or review onboarding",
    description:
      "Design, review, or improve a consumer app's onboarding and first-value journey. Classify a focused audit, incremental change, or full redesign before selecting the relevant research, flow, state, accessibility, and verification guidance. Do not start a full rebuild for a small signup fix.",
    workflowId: "workflow.experience.onboarding-system.onb-00-resume-scope",
    groupId: "onboarding-system",
    publicArea: "experience",
    routeCue: "Design or review onboarding",
    method: { referenceId: "reference.experience.onboarding-conversion", heading: "Execution modes" },
  },
  {
    name: "b2c-review-monetization",
    title: "Review monetization",
    description:
      "Review a consumer app's offer, pricing proposal, paywall, purchases, entitlements, restore behavior, and billing evidence. Use for a monetization audit or explicitly requested implementation. A review does not authorize live product changes, pricing changes, payments, or provider selection.",
    workflowId: "workflow.money.revenue-monetization",
    publicArea: "revenue-and-growth",
    routeCue: "Review monetization",
    method: { referenceId: "reference.money.revenue-monetization", heading: "1. Monetization Decision Matrix" },
  },
  {
    name: "b2c-define-product",
    title: "Define or refine a product",
    description:
      "Define or review a consumer product from supplied evidence and accepted constraints. Preserve complete scope without restarting opportunity research or scaffolding an app.",
    workflowId: "workflow.research.research-backed-spec",
    publicArea: "product",
    routeCue: "Define product scope",
    method: { referenceId: "reference.product.core-loop-and-complete-scope", heading: "Name the promise and core loop" },
  },
  {
    name: "b2c-plan-implementation",
    title: "Plan implementation",
    description:
      "Produce a bounded implementation plan with ownership, interfaces, dependencies, tests, review, and risks. Planning does not execute app work or declare release readiness.",
    workflowId: "workflow.engineering.engineering-orchestration-ce-production-readiness",
    publicArea: "engineering",
    routeCue: "Plan implementation",
    method: { referenceId: "reference.engineering.engineering-orchestration", heading: "6. `engineering/ENGINEERING_PLAN.md` Requirements" },
  },
  {
    name: "b2c-review-business-performance",
    title: "Review business performance",
    description:
      "Review supplied business performance evidence with honest period, cohort, denominator, and source limits. Recommend investigations without changing prices, spending money, or shipping an intervention.",
    workflowId: "workflow.operations.post-launch-operations",
    publicArea: "learning-and-operations",
    routeCue: "Review business performance",
    method: { referenceId: "reference.operations.post-launch-operations", heading: "1. When To Load" },
  },
  {
    name: "b2c-review-experience",
    title: "Review the app experience",
    description:
      "Review an app experience against supplied product, interaction, accessibility, and evidence requirements. Return findings without fabricating device proof or accepting implementation.",
    workflowId: "workflow.experience.emotional-experience-design-producer",
    publicArea: "experience",
    routeCue: "Review the app experience",
    method: { referenceId: "reference.experience.emotional-experience-design", heading: "Six-Lens Design Review Framework" },
  },
  {
    name: "b2c-plan-launch",
    title: "Plan a launch",
    description:
      "Plan a scoped launch narrative, channels, assets, measurement, and follow-up from current evidence. Drafting does not publish, connect accounts, enable campaigns, or spend money.",
    workflowId: "workflow.growth.launch-narrative-and-cadence",
    publicArea: "revenue-and-growth",
    routeCue: "Plan a launch",
    method: { referenceId: "reference.growth.launch-narrative-cadence", heading: "Why This Lane Exists" },
  },
  {
    name: "b2c-verify-release-readiness",
    title: "Verify release readiness",
    description:
      "Inspect target-specific release evidence and report supported, missing, stale, blocked, or inapplicable requirements. Inspection cannot certify acceptance or perform a release.",
    workflowId: "workflow.orchestration.full-launch-closeout",
    publicArea: "engineering",
    routeCue: "Verify release readiness",
    method: { referenceId: "reference.process.launch-coverage", heading: "Contents" },
  },
];

export const taskSkillMarker = "<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->";
const cell = (text: string): string => text.replace(/\|/gu, "\\|").replace(/\s+/gu, " ").trim();
const codeList = (values: readonly string[]): string => (values.length ? values.map((value) => `\`${value}\``).join(", ") : "None declared.");
export const skillDirectory = (skill: TaskSkill): string => `agents/skills/${skill.name}`;
export const relativeLink = (from: string, to: string): string => path.posix.relative(path.posix.dirname(from), to);

export function workflowsForTask(catalog: Catalog, skill: TaskSkill): CatalogWorkflowDef[] {
  const entry = catalog.workflows.find((workflow) => workflow.id === skill.workflowId);
  if (!entry) throw new Error(`Task skill ${skill.name} has no canonical workflow: ${skill.workflowId}`);
  if (!skill.groupId) return [entry];
  const members = catalog.workflows.filter((workflow) => workflow.groupId === skill.groupId);
  if (!members.some((workflow) => workflow.id === entry.id)) throw new Error(`Task skill ${skill.name} has an invalid group binding.`);
  return [entry, ...members.filter((workflow) => workflow.id !== entry.id)];
}

export function referencesForTask(catalog: Catalog, skill: TaskSkill): Catalog["references"] {
  const ids = new Set(workflowsForTask(catalog, skill).flatMap((workflow) => workflow.referenceIds));
  const references = catalog.references.filter((reference) => ids.has(reference.id));
  if (references.length !== ids.size) throw new Error(`Task skill ${skill.name} has unresolved knowledge bindings.`);
  if (skill.method && !references.some((reference) => reference.id === skill.method!.referenceId)) {
    throw new Error(`Task skill ${skill.name} method is not bound to a workflow reference.`);
  }
  return references;
}

export function renderBusinessAreaTable(prefix = ""): string {
  return [
    "| Area | Station | What the system helps an agent do |",
    "| --- | --- | --- |",
    ...publicBusinessAreas.map((area) => `| [${area.name}](${prefix}knowledge/README.md#${area.slug}) | ${area.station} | ${area.description} |`),
  ].join("\n");
}

export function renderTaskTable(from: string): string {
  return [
    "| Task | Use when |",
    "| --- | --- |",
    ...taskSkills.map(
      (skill) => `| [${skill.title}](${relativeLink(from, `${skillDirectory(skill)}/SKILL.md`)}) | ${cell(skill.routeCue ?? skill.description)} |`,
    ),
  ].join("\n");
}

export function renderPublicKnowledgeReadme(catalog?: Catalog): string {
  const sections = publicBusinessAreas.map((area) => {
    const folders = area.domainIds.map((domainId) => {
      const domain = catalog?.domains.find((candidate) => candidate.id === domainId);
      const slug = domain?.slug ?? domainId.replace(/^domain\./u, "");
      return `[${domain?.routeLabel ?? slug}](${slug}/)`;
    });
    const skills = taskSkills.filter((skill) => {
      const domain = catalog?.workflows.find((workflow) => workflow.id === skill.workflowId)?.domainId ?? `domain.${skill.workflowId.split(".")[1]}`;
      return skill.publicArea === area.slug || (!skill.publicArea && area.domainIds.some((id) => id === domain));
    });
    return [
      `## ${area.name}`,
      "",
      area.description,
      "",
      `Knowledge: ${folders.join(" · ")}.`,
      "",
      skills.length
        ? `Task skills: ${skills.map((skill) => `[${skill.title}](../${skillDirectory(skill)}/SKILL.md)`).join(" · ")}.`
        : "Use the existing workflows and references below. A dedicated task skill for this area is not yet shipped.",
      "",
      ...area.domainIds
        .map((domainId) => {
          const domain = catalog?.domains.find((candidate) => candidate.id === domainId);
          const anchor = (domain?.name ?? "")
            .toLowerCase()
            .replace(/[^\w\s-]/gu, "")
            .replace(/\s+/gu, "-");
          return domain ? `Browse [${domain.routeLabel}](../catalog/generated/routing.md#${anchor}) for task-specific load conditions.` : "";
        })
        .filter(Boolean),
    ].join("\n");
  });
  return [
    "<!-- catalog-generated:start knowledge-readme -->",
    "# Knowledge",
    "",
    "Generated from catalog area, workflow, and knowledge definitions. Edit those owners, not this file.",
    "",
    "Use the same six areas as the main README. A task skill is an entrypoint for a job; references hold the supporting expertise. Neither grants permission or proves business completion.",
    "",
    "For a focused question, open one matching task or reference. No workspace or MCP connection is required to read and apply the expertise. For a managed business, use [the main skill](../SKILL.md) and its current status and plan rather than browsing the entire library.",
    "",
    publicBusinessAreas.map((area) => `[${area.name}](#${area.slug})`).join(" · "),
    "",
    ...sections,
    "",
    "## Detailed indexes",
    "",
    "[Reference load conditions](../catalog/generated/routing.md) · [Workflow contracts](../catalog/generated/contracts.md) · [Phase map](../catalog/generated/spine.md) · [Task skill installation](../docs/guides/task-skills.md)",
    "",
    "The existing folders and stable reference IDs remain intact. Some disciplines support more than one area. Source provenance stays in knowledge manifests; selected-provider procedures remain conditional references, not mandatory startup reading.",
    "<!-- catalog-generated:end knowledge-readme -->",
  ].join("\n");
}

function focusedMethod(catalog: Catalog, skill: TaskSkill, from: string): string | undefined {
  if (!skill.method) return undefined;
  const reference = catalog.references.find((candidate) => candidate.id === skill.method!.referenceId);
  if (!reference) throw new Error(`Task skill ${skill.name} method reference is unresolved.`);
  const sourcePath = reference.path;
  const source = readFileSync(sourcePath, "utf8");
  const lines = source.split(/\r?\n/u);
  const heading = lines.findIndex((line) => /^#{1,6} /u.test(line) && line.replace(/^#{1,6} /u, "").trim() === skill.method!.heading);
  if (heading < 0) throw new Error(`Task skill ${skill.name} method heading is missing or empty: ${skill.method.heading}`);
  const end = lines.findIndex((line, index) => index > heading && /^#{1,6} /u.test(line));
  const body = lines
    .slice(heading + 1, end < 0 ? lines.length : end)
    .join("\n")
    .trim();
  if (!body) throw new Error(`Task skill ${skill.name} method heading is missing or empty: ${skill.method.heading}`);
  return body.replace(/\]\(([^)#][^)]*)\)/gu, (full, target: string) => {
    if (/^(?:https?:|mailto:|\/)/u.test(target)) return full;
    const [file = "", hash] = target.split("#", 2);
    const resolved = path.posix.relative(path.posix.dirname(from), path.posix.join(path.posix.dirname(reference.path), file));
    return `](${resolved}${hash ? `#${hash}` : ""})`;
  });
}

function renderContract(catalog: Catalog, workflow: CatalogWorkflowDef, from: string, includeInstructions: boolean): string {
  const refs = workflow.referenceIds.map((id) => {
    const reference = catalog.references.find((candidate) => candidate.id === id);
    if (!reference) throw new Error(`Unresolved reference ${id} in ${workflow.id}`);
    return `| [${cell(reference.title)}](${relativeLink(from, reference.path)}) | ${cell(reference.loadWhen)} | \`${reference.id}\` |`;
  });
  return [
    `# ${workflow.title}`,
    "",
    taskSkillMarker,
    "",
    `Canonical workflow: \`${workflow.id}\`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.`,
    "",
    ...(includeInstructions ? ["## Method", "", workflow.instructions, ""] : []),
    "## Inputs and outputs",
    "",
    "For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.",
    "",
    `Managed inputs: ${codeList(workflow.reads)}`,
    "",
    `Consult when relevant: ${codeList(workflow.consults)}`,
    "",
    `Managed outputs: ${codeList(workflow.outputPaths)}`,
    "",
    "## Verification and authority",
    "",
    `Declared checks: ${codeList(workflow.gateCommands)}`,
    "",
    `Additional founder decisions: ${workflow.founderOnlyActions.length ? workflow.founderOnlyActions.join("; ") : "None specific to this workflow; host permission boundaries still apply."}`,
    "",
    "Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.",
    "",
    "## Select supporting knowledge",
    "",
    "Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.",
    "",
    "| Reference | Load when | Stable identity |",
    "| --- | --- | --- |",
    ...refs,
    "",
  ].join("\n");
}

export function renderTaskSkillFiles(catalog: Catalog): Record<string, string> {
  const names = new Set<string>();
  for (const skill of taskSkills) {
    if (names.has(skill.name)) throw new Error(`Duplicate task skill name: ${skill.name}`);
    names.add(skill.name);
    if (skill.publicArea && !publicBusinessAreas.some((area) => area.slug === skill.publicArea)) {
      throw new Error(`Task skill ${skill.name} has an invalid public area: ${skill.publicArea}`);
    }
  }
  const files: Record<string, string> = {};
  for (const skill of taskSkills) {
    const workflows = workflowsForTask(catalog, skill);
    referencesForTask(catalog, skill);
    const entry = workflows[0]!;
    const base = skillDirectory(skill);
    const contractPath = `${base}/references/task.md`;
    files[contractPath] = renderContract(catalog, entry, contractPath, false);
    if (workflows.length > 1) {
      const index = `${base}/references/stages.md`;
      files[index] = [
        `# ${skill.title}: task stages`,
        "",
        taskSkillMarker,
        "",
        "Choose only the stage that matches the requested change or current business brief. This index preserves the catalog's internal work units; it is not an instruction to execute every stage. A complete managed redesign uses the existing planner and its gates, not this table as a substitute scheduler.",
        "",
        "| Stage | Relevant task |",
        "| --- | --- |",
        ...workflows.map((workflow) => {
          const destination = workflow.id === entry.id ? contractPath : `${base}/references/${workflow.id}.md`;
          if (workflow.id !== entry.id) files[destination] = renderContract(catalog, workflow, destination, true);
          return `| [${cell(workflow.title)}](${relativeLink(index, destination)}) | ${cell(workflow.trigger)} |`;
        }),
        "",
      ].join("\n");
    }
    files[`${base}/SKILL.md`] = [
      "---",
      `name: ${skill.name}`,
      `description: ${JSON.stringify(skill.description)}`,
      "compatibility: Markdown and supplied evidence. Provider-backed work needs the corresponding authorized tools. The B2C runtime is optional for focused advisory work.",
      "metadata:",
      `  source-workflow: ${JSON.stringify(entry.id)}`,
      "  generated-by: b2c-catalog",
      "---",
      "",
      `# ${skill.title}`,
      "",
      taskSkillMarker,
      "",
      "## Choose the scope",
      "",
      "Use this task directly for focused advice, review, or an authorized change. Do not require setup, install software, create a workspace, or activate a full launch graph merely to use this expertise. A review is read-only unless the user also requests changes.",
      "",
      "For an existing managed business, read business-status then business-plan and use its current brief. This skill cannot choose executable next work, bypass prerequisites, change provider bindings, or replace runtime acceptance. Do not inspect raw reducer files merely to start a focused task.",
      "",
      "## Method",
      "",
      "For a review, assess the existing evidence against this method and return findings; do not execute its authoring or mutation instructions. For requested creation or implementation, follow the method only within the accepted scope and authority.",
      "",
      focusedMethod(catalog, skill, `${base}/SKILL.md`) ?? entry.instructions,
      "",
      "## Load only what the task needs",
      "",
      "[Task inputs, outputs, checks, and knowledge selectors](references/task.md) supplies the canonical details when they are needed. Open the specific referenced sections, not the whole library. In connected knowledge retrieval, follow exact section selectors, revision hashes, and continuation calls. Unresolved guidance remains unresolved.",
      ...(workflows.length > 1
        ? [
            "",
            "For onboarding beyond scope classification, choose the relevant [task stage](references/stages.md). An audit or small change does not imply a full rebuild; a complete redesign preserves all applicable catalog obligations.",
          ]
        : []),
      "",
      "## Tools and evidence",
      "",
      "Keep the method independent of the agent host and business provider. Honor explicit selections. Use already available, authorized tools that implement the required operation; do not infer availability from the agent's name or silently substitute a provider. Load a provider's procedure only when its action is current. Record missing capabilities without inventing provider proof.",
      "",
      "Pause for access or secrets, spend, pricing or legal decisions, destructive changes, hosted deployment, store submission, or production release. Guidance is not permission. A proposed price is not an approved price, and a mock is not live evidence.",
      "",
      "## Return",
      "",
      "Report findings or changes, the evidence inspected, applicable checks actually run, unresolved requirements, and the next decision. Label advisory findings separately from accepted business evidence. Do not record business completion or modify reducer-owned state outside the supported runtime.",
      "",
    ].join("\n");
  }
  return files;
}
