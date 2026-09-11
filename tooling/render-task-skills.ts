import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composeCatalog } from "../catalog/index.js";
import { renderBusinessAreaTable, renderTaskSkillFiles, renderTaskTable, taskSkillMarker, taskSkills } from "../catalog/task-skills.js";
import { isMainModule } from "./lib/cli-entrypoint.js";
import { resolveSkillRoot } from "./lib/skill-root.js";

export function replaceGeneratedBlock(text: string, name: string, content: string): string {
  const start = `<!-- catalog-generated:start ${name} -->`;
  const end = `<!-- catalog-generated:end ${name} -->`;
  const left = text.indexOf(start);
  const right = text.indexOf(end);
  if (left < 0 || right < left || text.indexOf(start, left + start.length) >= 0 || text.indexOf(end, right + end.length) >= 0) {
    throw new Error(`Missing, duplicated, or reversed generated block: ${name}`);
  }
  return `${text.slice(0, left)}${start}\n${content}\n${end}${text.slice(right + end.length)}`;
}

export function taskSkillProjections(root: string): Record<string, string> {
  const files = renderTaskSkillFiles(composeCatalog(root));
  for (const [file, marker, body] of [
    ["README.md", "business-areas", renderBusinessAreaTable()],
    ["SKILL.md", "task-skills", renderTaskTable("SKILL.md")],
    ["agents/skills/README.md", "task-skills", renderTaskTable("agents/skills/README.md")],
  ] as const) {
    const source = path.join(root, file);
    if (existsSync(source)) files[file] = replaceGeneratedBlock(readFileSync(source, "utf8"), marker, body);
  }
  return files;
}

export function renderTaskSkills(root: string, check: boolean): string[] {
  const files = taskSkillProjections(root);
  const errors: string[] = [];
  const directory = path.join(root, "agents/skills");
  if (existsSync(directory)) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const skill = path.join(directory, item.name, "SKILL.md");
      if (existsSync(skill) && readFileSync(skill, "utf8").includes(taskSkillMarker) && !taskSkills.some((entry) => entry.name === item.name)) {
        errors.push(`Orphaned generated task skill: ${item.name}. Remove it explicitly with the catalog change.`);
      }
    }
  }
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    if (check) {
      if (!existsSync(target) || readFileSync(target, "utf8") !== content) errors.push(`Task skill projection drift: ${relative}`);
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  return errors;
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootAt = args.indexOf("--root");
  const root = rootAt < 0 ? resolveSkillRoot(import.meta.url) : path.resolve(args[rootAt + 1] ?? "");
  if (args.some((arg, index) => arg !== "--check" && arg !== "--root" && index !== rootAt + 1) || (rootAt >= 0 && !args[rootAt + 1])) {
    throw new Error("Usage: render-task-skills.ts [--root PATH] [--check]");
  }
  const errors = renderTaskSkills(root, args.includes("--check"));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log(`Task skills and public navigation ${args.includes("--check") ? "verified" : "rendered"}.`);
}
