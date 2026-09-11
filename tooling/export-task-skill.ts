import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composeCatalog } from "../catalog/index.js";
import { referencesForTask, renderTaskSkillFiles, skillDirectory, taskSkills } from "../catalog/task-skills.js";
import type { Catalog } from "../catalog/types.js";
import { isMainModule } from "./lib/cli-entrypoint.js";
import { resolveSkillRoot } from "./lib/skill-root.js";

const digest = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const repository = "https://github.com/Clueless-Creations/b2c-app-builder";
const external = (url: string): boolean => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(url);
const linkPattern = /(!?\[[^\]\n]*\]\()([^\s)]+)([^)\n]*\))/gu;

/** Resolve authored source links, never workspace paths or arbitrary filesystem input. */
function resolveLink(source: string, url: string): { file: string; suffix: string } | undefined {
  if (external(url)) return undefined;
  const [file, ...suffix] = url.split(/(?=[?#])/u);
  if (!file) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    throw new Error(`Invalid encoded source link in ${source}`);
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded));
  if (resolved.startsWith("../") || resolved.startsWith("/") || resolved.includes("\\")) throw new Error(`Escaping source link in ${source}`);
  return { file: resolved, suffix: suffix.join("") };
}

function safeSource(root: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/u).includes("..")) throw new Error("Source path escapes the repository.");
  const base = realpathSync(root);
  let cursor = base;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlinked source is not exportable: ${relative}`);
  }
  if (!lstatSync(cursor).isFile() || !realpathSync(cursor).startsWith(`${base}${path.sep}`)) throw new Error(`Invalid source: ${relative}`);
  return readFileSync(cursor, "utf8");
}

export interface TaskSkillPackage {
  files: Record<string, string>;
  sourcePaths: string[];
  supplementalLinks: string[];
}

/** Pure selection plus bounded source reads. Does not install, execute, or activate anything. */
export function collectTaskSkillPackage(root: string, catalog: Catalog, name: string, sourceRevision: string): TaskSkillPackage {
  if (!/^[a-f0-9]{40}$/u.test(sourceRevision)) throw new Error("A full source commit SHA is required for supplemental source links.");
  const skill = taskSkills.find((candidate) => candidate.name === name);
  if (!skill) throw new Error("Unknown task skill. Export only a declared business task.");
  const prefix = `${skillDirectory(skill)}/`;
  const generated = Object.fromEntries(Object.entries(renderTaskSkillFiles(catalog)).filter(([file]) => file.startsWith(prefix)));
  const known = new Map(catalog.references.map((reference) => [reference.path, reference]));
  const sources = new Map<string, string>();
  const queue = referencesForTask(catalog, skill).map((reference) => reference.path);
  // Bundle linked, manifest-backed knowledge too. Other repository documentation stays a pinned supplemental source link.
  while (queue.length) {
    const file = queue.shift()!;
    if (sources.has(file)) continue;
    if (!file.startsWith("knowledge/") || !known.has(file)) throw new Error(`Undeclared business knowledge: ${file}`);
    if (sources.size >= 512) throw new Error("Task reference closure exceeds the export limit.");
    const text = safeSource(root, file);
    sources.set(file, text);
    for (const match of text.matchAll(linkPattern)) {
      const linked = resolveLink(file, match[2]!);
      if (linked && known.has(linked.file) && !sources.has(linked.file)) queue.push(linked.file);
    }
  }
  const destinations = new Map<string, string>([
    ...Object.keys(generated).map((file): [string, string] => [file, file.slice(prefix.length)]),
    ...[...sources.keys()].map((file): [string, string] => [file, `references/source/${file}`]),
  ]);
  const supplemental = new Set<string>();
  const files: Record<string, string> = {};
  function transform(source: string, text: string): string {
    const destination = destinations.get(source)!;
    return text.replace(linkPattern, (match: string, open: string, url: string, close: string) => {
      const linked = resolveLink(source, url);
      if (!linked) return match;
      const local = destinations.get(linked.file);
      if (local) return `${open}${path.posix.relative(path.posix.dirname(destination), local)}${linked.suffix}${close}`;
      const remote = `${repository}/blob/${sourceRevision}/${linked.file.split("/").map(encodeURIComponent).join("/")}${linked.suffix}`;
      supplemental.add(remote);
      return `${open}${remote}${close}`;
    });
  }
  for (const [source, text] of [...Object.entries(generated), ...sources.entries()]) files[destinations.get(source)!] = transform(source, text);
  files["SKILL.md"] +=
    "\nBound knowledge and linked manifest-backed references are included in this package. Other repository links are pinned supplemental sources and need network access. The execution runtime and provider tools are not bundled.\n";
  files["LICENSE"] = safeSource(root, "LICENSE");
  files["THIRD_PARTY_NOTICES.md"] = safeSource(root, "THIRD_PARTY_NOTICES.md");
  files["source-manifest.json"] = `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      skill: name,
      sourceRevision,
      kind: "generated-guidance-snapshot",
      executionIncluded: false,
      noticesScope: "Full repository notices retained conservatively; not all credited material is selected by this task.",
      sources: [...sources].map(([file, text]) => ({ path: file, referenceId: known.get(file)!.id, sha256: digest(text) })),
      supplementalLinks: [...supplemental].sort(),
      resources: Object.entries(files).map(([file, text]) => ({ path: file, sha256: digest(text) })),
    },
    null,
    2,
  )}\n`;
  return { files, sourcePaths: [...sources.keys()], supplementalLinks: [...supplemental].sort() };
}

/** Create-only export. Refuse symlinked destinations and existing skill installations. */
export function writeTaskSkillPackage(outputParent: string, name: string, bundle: TaskSkillPackage): string {
  if (!taskSkills.some((skill) => skill.name === name)) throw new Error("Unknown task skill.");
  const parent = path.resolve(outputParent);
  let cursor = path.parse(parent).root;
  for (const part of parent.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Export destination must not contain symlinks.");
  }
  const target = path.join(parent, name);
  if (existsSync(target)) throw new Error("Export target already exists. Choose a new output directory; installations are never overwritten.");
  for (const file of Object.keys(bundle.files)) {
    if (path.isAbsolute(file) || file.split(/[\\/]/u).includes("..")) throw new Error("Export resource escapes the skill directory.");
  }
  mkdirSync(parent, { recursive: true });
  mkdirSync(target);
  try {
    for (const [file, content] of Object.entries(bundle.files)) {
      const destination = path.join(target, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content, { flag: "wx" });
    }
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
  return target;
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!;
    const value = args[index + 1];
    if (!["--skill", "--output", "--root", "--source-revision"].includes(key) || !value || value.startsWith("--") || flags.has(key))
      throw new Error("Usage: export-task-skill.ts --skill NAME --output PARENT [--root PATH] [--source-revision SHA]");
    flags.set(key, value);
  }
  const name = flags.get("--skill");
  const output = flags.get("--output");
  if (!name || !output) throw new Error("--skill and --output are required. This command never installs a skill automatically.");
  const root = flags.get("--root") ?? resolveSkillRoot(import.meta.url);
  let revision = flags.get("--source-revision");
  if (!revision) {
    try {
      revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      throw new Error("Outside a Git checkout, supply --source-revision with the full reviewed source commit.");
    }
  }
  const bundle = collectTaskSkillPackage(root, composeCatalog(root), name, revision);
  const directory = writeTaskSkillPackage(output, name, bundle);
  console.log(
    JSON.stringify(
      {
        directory,
        skill: name,
        bundledSources: bundle.sourcePaths.length,
        supplementalSourceLinks: bundle.supplementalLinks.length,
        installed: false,
        executionIncluded: false,
      },
      null,
      2,
    ),
  );
}
