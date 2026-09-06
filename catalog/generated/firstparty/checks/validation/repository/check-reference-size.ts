#!/usr/bin/env node
/**
 * check-reference-size.ts — per-file context budget for knowledge/ and checks/validation/repository/.
 *
 * Knowledge files load into agent context on demand; a single oversized file
 * silently taxes every launch session that routes through it (the
 * experience-cards.md deck reached ~200KB before it was split into an index
 * plus per-card files). This gate keeps each reference under a generous
 * per-file byte budget so growth becomes a deliberate split/index decision
 * instead of accretion.
 *
 * Exclusions are explicit and carry a reason, in keeping with house culture;
 * an excluded file that drops back under budget warns so the exclusion gets
 * removed.
 *
 * It also enforces the split it recommends: every directory holding knowledge
 * files needs an index linking each child — `<dir>/README.md` for a domain
 * folder, a sibling `<name>.md` for a sub-split — and every link must resolve. Without this, a split
 * rots silently — an unlinked topic file is unreachable and a dangling row
 * sends agents nowhere.
 *
 * npm script: check:reference-size
 * Usage: tsx checks/validation/repository/check-reference-size.ts --skill-root /path/to/skill [--budget-bytes N]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagNumber, flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");

/** Generous per-file budget: a reference at this size is already a heavy single load. */
const DEFAULT_BUDGET_BYTES = 64 * 1024;

/**
 * SKILL.md is the one file loaded on every trigger, so it gets its own budget
 * — previously it was the only shipped context file with no size gate at all.
 * The maintainer decision for the entrypoint is freeze-and-subtract: this
 * ceiling sits just above the current size so any addition must be paid for
 * by subtraction elsewhere in SKILL.md. Ratchet it DOWN as SKILL.md shrinks;
 * raising it is a reviewed decision, not a workaround.
 *
 * Ratcheted 68KB -> 45KB when SKILL.md's duplicated Start Here / When To Load
 * References enumerations were merged into one Lane Routing index and the
 * per-lane handoff checklist moved into launch-coverage.md.
 *
 * Ratcheted 45KB -> 20KB when the Phase Spine moved to spine.md and the runtime
 * routing detail moved to knowledge/orchestration/dynamic-workflows.md (v0.58.0).
 * Leaving it at 45KB would have let ~25KB flow straight back into the file that
 * loads on every trigger while check:reference-size stayed green — which is the
 * freeze-and-subtract policy this comment describes, defeated by not applying it.
 */
const ENTRYPOINT_BUDGET_BYTES = 20 * 1024;

/**
 * Files allowed over budget, each with a concrete reason. Adding an entry is a
 * reviewed decision, not a workaround — prefer splitting into an index plus
 * per-topic files (see knowledge/experience/experience-cards.md).
 */
const EXCLUSIONS: Record<string, string> = {
  "launch-phases.md":
    "the canonical cross-phase launch contract is loaded as one bounded reference so invariants, gates, and handoffs can be audited together; capability-owned paths increased its byte size without increasing its conceptual scope.",
  "artifact-contracts.md":
    "the canonical registry of every launch artifact's acceptance criteria; contracts are cross-referenced as one document during handoff audits and per-artifact splitting would fragment the acceptance pass.",
  "source-registry.yaml":
    "machine-read registry consumed by check-source-freshness and the manual refresh:source-freshness run, not loaded into agent context as prose; one file per ~190 tracked sources is the tooling contract.",
};

const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];

/**
 * docs/architecture.md: knowledge lives in knowledge/ grouped by domain, and the
 * skill's own upkeep lives in checks/validation/repository/. Both are loaded into agent or
 * maintainer context, so both carry the per-file budget. `references/` no
 * longer exists.
 */
const KNOWLEDGE_ROOTS = ["knowledge", "checks/validation/repository"];

/**
 * Directories inside a knowledge root that hold machine-read data or test code
 * rather than agent-loaded prose, keyed by path relative to the skill root.
 *
 * These are exempt for the same reason `source-registry.yaml` is exempt above:
 * nothing loads them into agent context, and nothing routes to an individual
 * file — the eval harness globs the directory. Applying the index rule here
 * would demand a README linking all 115 LaunchBench scenarios, which is
 * generated make-work that rots, not progressive disclosure.
 *
 * This preserves behaviour rather than relaxing it: `evals/` and
 * `tooling/fixtures/` were both outside every knowledge root before they moved
 * under `checks/validation/repository/`. Bringing 129 files into scope as a side effect of a
 * directory move is not a decision anyone made; widening these gates to cover
 * fixtures would be its own change with its own evidence.
 */
const NON_KNOWLEDGE_DIRS = new Set(["checks/validation/repository/evals", "checks/validation/repository/fixtures"]);

function isNonKnowledge(absolute: string): boolean {
  const relative = path.relative(args.skillRoot, absolute).split(path.sep).join("/");
  for (const excluded of NON_KNOWLEDGE_DIRS) {
    if (relative === excluded || relative.startsWith(`${excluded}/`)) return true;
  }
  return false;
}
const presentRoots = KNOWLEDGE_ROOTS.map((name) => ({ name, dir: path.join(args.skillRoot, name) })).filter((root) => existsSync(root.dir));

if (presentRoots.length === 0) {
  issues.push(
    issue("error", "reference_size.dir_missing", `No knowledge roots found; expected ${KNOWLEDGE_ROOTS.join(" and ")} under ${args.skillRoot}.`, "knowledge"),
  );
}

for (const root of presentRoots) {
  for (const file of collectFilesRecursive(root.dir)) {
    const relative = path.relative(args.skillRoot, file).split(path.sep).join("/");
    const basename = path.basename(file);
    const size = statSync(file).size;
    const excluded = Object.prototype.hasOwnProperty.call(EXCLUSIONS, basename);

    if (size > args.budgetBytes && !excluded) {
      issues.push(
        issue(
          "error",
          "reference_size.over_budget",
          `${relative} is ${size} bytes (> ${args.budgetBytes} byte budget). Split it into an index plus per-topic files (see knowledge/experience/experience-cards.md), or add an exclusion with a concrete reason in check-reference-size.ts.`,
          relative,
        ),
      );
    }
    if (excluded && size <= args.budgetBytes) {
      issues.push(
        issue(
          "warning",
          "reference_size.exclusion_stale",
          `${relative} is excluded from the reference size budget but is now ${size} bytes (within budget). Remove its exclusion from check-reference-size.ts.`,
          relative,
        ),
      );
    }
  }
}

/**
 * Index completeness.
 *
 * Progressive disclosure only works if every file is reachable from an index:
 * a topic file nothing links to cannot be loaded on demand, and a routing row
 * pointing at a deleted file sends agents to a 404. So every directory holding
 * knowledge files needs an index that links each of its immediate children.
 *
 * Two index mechanisms are accepted, because both are load-bearing:
 *   - `knowledge/`             — indexed centrally by the GENERATED
 *                                catalog/generated/routing.md's Reference Index section
 *                                (rendered by catalog/render-routing.ts from
 *                                knowledge manifests' authored `loadWhen` data; a
 *                                catalog reference entry is what makes a knowledge file
 *                                reachable, R20 — the per-directory README/sibling-file
 *                                indexes this used to require were dropped at cutover,
 *                                U11, per the port ledger).
 *   - everything else (today: `checks/validation/repository/`) — the original per-directory
 *                                `<dir>/README.md` or sibling `<parent>/<name>.md` index.
 *
 * Reachability means a real markdown link, not a mention. A filename that only
 * appears in prose or backticks reads as routed to a human skimming the index
 * but is not something an agent can follow, so both directions below are
 * checked against parsed link targets rather than raw text.
 */
let generatedIndexHrefs: Set<string> | undefined;

/** Absolute, resolved link targets found in catalog/generated/routing.md, memoized. */
function loadGeneratedIndexHrefs(): Set<string> | undefined {
  if (generatedIndexHrefs) return generatedIndexHrefs;
  const generatedIndexPath = path.join(args.skillRoot, "catalog", "generated", "routing.md");
  if (!existsSync(generatedIndexPath)) return undefined;
  const hrefs = linkedHrefs(readFileSync(generatedIndexPath, "utf8")).map((href) => path.resolve(path.dirname(generatedIndexPath), href));
  generatedIndexHrefs = new Set(hrefs);
  return generatedIndexHrefs;
}

function checkReachableViaGeneratedIndex(dir: string, files: Array<{ name: string }>): void {
  const linked = loadGeneratedIndexHrefs();
  if (!linked) {
    issues.push(
      issue(
        "error",
        "reference_size.generated_index_missing",
        "catalog/generated/routing.md is missing; run `npm run catalog:render-routing` to regenerate it before knowledge/ reachability can be checked.",
        "catalog/generated/routing.md",
      ),
    );
    return;
  }
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (!linked.has(fullPath)) {
      const relative = path.relative(args.skillRoot, fullPath).split(path.sep).join("/");
      issues.push(
        issue(
          "error",
          "reference_size.index_incomplete",
          `catalog/generated/routing.md does not link ${relative}. Add a knowledge manifest with a load-when trigger, or delete the unreachable file.`,
          relative,
        ),
      );
    }
  }
}

function checkDirectoryIndex(dir: string, useGeneratedIndex: boolean): void {
  const children = readdirSync(dir, { withFileTypes: true });
  const files = children.filter((e) => e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".yaml")) && e.name !== "README.md");
  const subdirs = children.filter((e) => e.isDirectory());

  for (const sub of subdirs) {
    const subPath = path.join(dir, sub.name);
    if (isNonKnowledge(subPath)) continue;
    checkDirectoryIndex(subPath, useGeneratedIndex);
  }
  if (files.length === 0) {
    return;
  }

  if (useGeneratedIndex) {
    checkReachableViaGeneratedIndex(dir, files);
    return;
  }

  const dirRelative = path.relative(args.skillRoot, dir).split(path.sep).join("/");
  const readmePath = path.join(dir, "README.md");
  const siblingPath = path.join(path.dirname(dir), `${path.basename(dir)}.md`);

  // hrefs in each shape resolve from a different base, so carry the base along.
  const candidate = existsSync(readmePath)
    ? { indexPath: readmePath, base: dir }
    : existsSync(siblingPath)
      ? { indexPath: siblingPath, base: path.dirname(dir) }
      : undefined;

  if (!candidate) {
    issues.push(
      issue(
        "error",
        "reference_size.index_missing",
        `${dirRelative}/ has no index. Add ${dirRelative}/README.md routing to each file, or a sibling ${path.basename(dir)}.md — without one, nothing here can be loaded on demand.`,
        `${dirRelative}/README.md`,
      ),
    );
    return;
  }

  const indexRelative = path.relative(args.skillRoot, candidate.indexPath).split(path.sep).join("/");
  const linked = new Set(linkedHrefs(readFileSync(candidate.indexPath, "utf8")));

  for (const file of files) {
    const href = path.relative(candidate.base, path.join(dir, file.name)).split(path.sep).join("/");
    if (!linked.has(href)) {
      issues.push(
        issue(
          "error",
          "reference_size.index_incomplete",
          `${indexRelative} does not link ${href}. Add a routing row with a load-when trigger (a bare mention is not a link), or delete the unreachable file.`,
          indexRelative,
        ),
      );
    }
  }

  for (const href of linked) {
    if (href.startsWith("http") || href.startsWith("#")) {
      continue;
    }
    if (!existsSync(path.join(candidate.base, href))) {
      issues.push(issue("error", "reference_size.index_dangling_link", `${indexRelative} routes to ${href}, which does not exist.`, indexRelative));
    }
  }
}

for (const root of presentRoots) {
  checkDirectoryIndex(root.dir, root.name === "knowledge");
}

const entrypointPath = path.join(args.skillRoot, "SKILL.md");
if (!existsSync(entrypointPath)) {
  issues.push(issue("error", "reference_size.entrypoint_missing", `SKILL.md is missing at ${entrypointPath}.`, "SKILL.md"));
} else {
  const entrypointSize = statSync(entrypointPath).size;
  if (entrypointSize > ENTRYPOINT_BUDGET_BYTES) {
    issues.push(
      issue(
        "error",
        "reference_size.entrypoint_over_budget",
        `SKILL.md is ${entrypointSize} bytes (> ${ENTRYPOINT_BUDGET_BYTES} byte entrypoint budget). SKILL.md loads on every trigger; pay for the addition by subtracting or moving detail into a routed reference (freeze-and-subtract).`,
        "SKILL.md",
      ),
    );
  }
}

reportAndExit("Reference context-budget check", issues);

interface Args {
  skillRoot: string;
  budgetBytes: number;
}

function parseArgs(argv: string[]): Args {
  // Only --skill-root is authoritative; ignore a stray --root from the fixture harness.
  const flags = parseFlags(argv, [
    { flags: ["--skill-root"], key: "skillRoot" },
    { flags: ["--budget-bytes"], key: "budgetBytes", kind: "number" },
  ]);
  return {
    skillRoot: flagString(flags, "skillRoot") ?? defaultSkillRoot,
    budgetBytes: flagNumber(flags, "budgetBytes") ?? DEFAULT_BUDGET_BYTES,
  };
}

/**
 * Local markdown link targets, normalized: `#fragment` and an optional
 * `"title"` are stripped, and `./` prefixes collapsed. External links and
 * pure anchors are dropped so only routable file paths remain.
 */
function linkedHrefs(text: string): string[] {
  const hrefs: string[] = [];
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      continue;
    }
    const target = raw.split(/\s+/)[0]?.split("#")[0]?.replace(/^\.\//, "");
    if (target) {
      hrefs.push(target);
    }
  }
  return hrefs;
}

function collectFilesRecursive(root: string): string[] {
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (isNonKnowledge(fullPath)) continue;
        visit(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml"))) {
        files.push(fullPath);
      }
    }
  }
  visit(root);
  return files.sort();
}
