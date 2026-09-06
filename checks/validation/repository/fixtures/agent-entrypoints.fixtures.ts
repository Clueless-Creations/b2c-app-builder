import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";

/**
 * Fixtures for check-agent-entrypoints.ts (ADR-0007). The validator takes --repo-root, so every
 * case passes the root explicitly through runScriptArgs. Each negative case starts from a fresh
 * copy of the shipped guides, routers, adapters, and workspace templates; the control case proves
 * that copy passes on its own, so a negative case fails for the one edit it makes.
 */
const SCRIPT = "check-agent-entrypoints";
const TEMPLATE = "surfaces/workspace-template/repo-agent-entrypoints";
const SHIPPED = [
  "AGENTS.md",
  "SKILL.md",
  "CLAUDE.md",
  "agents/skills/README.md",
  "agents/skills/b2c-contributor/SKILL.md",
  "agents/skills/b2c-maintainer/SKILL.md",
  `${TEMPLATE}/AGENTS.md`,
  `${TEMPLATE}/CLAUDE.md`,
  `${TEMPLATE}/.cursor/rules/agents.mdc`,
] as const;

function seed(harness: Harness, name: string): string {
  const root = path.join(harness.tempRoot, name);
  for (const relative of SHIPPED) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(skillRoot, relative), target);
  }
  return root;
}

function edit(root: string, relative: string, transform: (text: string) => string): void {
  const target = path.join(root, relative);
  writeFileSync(target, transform(readFileSync(target, "utf8")), "utf8");
}

export function register(harness: Harness): void {
  harness.runScriptArgs("agent entrypoints accept the shipped guides, routers, adapters, and templates", SCRIPT, ["--repo-root", skillRoot], 0);

  const control = seed(harness, "agent-entrypoints-control");
  harness.runScriptArgs("agent entrypoints accept an unmodified copy of the shipped files", SCRIPT, ["--repo-root", control], 0);

  const restated = seed(harness, "agent-entrypoints-restated-section");
  edit(restated, `${TEMPLATE}/CLAUDE.md`, (text) => {
    const guide = readFileSync(path.join(restated, `${TEMPLATE}/AGENTS.md`), "utf8");
    const start = guide.indexOf("## Mobile app operation");
    return `${text}\n${guide.slice(start)}`;
  });
  harness.runScriptArgs(
    "agent entrypoints reject an adapter that restates a canonical section",
    SCRIPT,
    ["--repo-root", restated],
    1,
    "agent_entrypoints.adapter_duplicates_heading",
  );
  harness.runScriptArgs(
    "agent entrypoints name the restated prose line as well as the heading",
    SCRIPT,
    ["--repo-root", restated],
    1,
    "agent_entrypoints.adapter_duplicates_prose",
  );

  const leaked = seed(harness, "agent-entrypoints-internal-reference");
  edit(leaked, `${TEMPLATE}/AGENTS.md`, (text) => `${text}\nFollow ARCH-04/ARCH-09/ARCH-11 and roadmap U26 for device work.\n`);
  harness.runScriptArgs(
    "agent entrypoints reject a workspace template that names an ARCH rule or roadmap unit",
    SCRIPT,
    ["--repo-root", leaked],
    1,
    "agent_entrypoints.internal_reference",
  );

  const repositoryPath = seed(harness, "agent-entrypoints-repository-path");
  edit(repositoryPath, `${TEMPLATE}/.cursor/rules/agents.mdc`, (text) => `${text}\n- Read the manifests under \`catalog/upstreams/\` before a store change.\n`);
  harness.runScriptArgs(
    "agent entrypoints reject a workspace rule that names a builder repository path",
    SCRIPT,
    ["--repo-root", repositoryPath],
    1,
    "agent_entrypoints.internal_reference",
  );

  const unpointed = seed(harness, "agent-entrypoints-pointer-missing");
  edit(unpointed, "CLAUDE.md", (text) => text.replace("Read `AGENTS.md` first", "Read the repository guide"));
  harness.runScriptArgs(
    "agent entrypoints reject an adapter that drops its AGENTS.md pointer",
    SCRIPT,
    ["--repo-root", unpointed],
    1,
    "agent_entrypoints.adapter_pointer_missing",
  );

  const unrouted = seed(harness, "agent-entrypoints-router-missing");
  edit(unrouted, "AGENTS.md", (text) => text.split("agents/skills/b2c-maintainer/SKILL.md").join("agents/skills/README.md"));
  harness.runScriptArgs(
    "agent entrypoints reject a root guide that drops one scope's router",
    SCRIPT,
    ["--repo-root", unrouted],
    1,
    "agent_entrypoints.scope_router_missing",
  );

  const unlisted = seed(harness, "agent-entrypoints-skill-index-incomplete");
  edit(unlisted, "agents/skills/README.md", (text) => text.split("`b2c-contributor`").join("contributor"));
  harness.runScriptArgs(
    "agent entrypoints reject a skill index that omits one skill",
    SCRIPT,
    ["--repo-root", unlisted],
    1,
    "agent_entrypoints.skill_index_incomplete",
  );
}
