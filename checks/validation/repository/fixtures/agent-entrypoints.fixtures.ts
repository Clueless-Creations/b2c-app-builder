import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";
import { checkStandingGuidance, completionRule, localMarkdownLinks, measureGuidancePackets, STANDING_RULES } from "../agent-guidance-contract.js";

const SCRIPT = "check-agent-entrypoints";
const TEMPLATE = "surfaces/workspace-template/repo-agent-entrypoints";
const SETUP = "agents/skills/b2c-app-builder/references/setup.md";
const SHIPPED = [
  "AGENTS.md",
  "SKILL.md",
  "CLAUDE.md",
  "agents/skills/README.md",
  "agents/skills/b2c-contributor/SKILL.md",
  "agents/skills/b2c-maintainer/SKILL.md",
  SETUP,
  "agents/skills/b2c-app-builder/references/business-lifecycle.md",
  `${TEMPLATE}/AGENTS.md`,
  `${TEMPLATE}/CLAUDE.md`,
  `${TEMPLATE}/.cursor/rules/agents.mdc`,
] as const;

function seed(harness: Harness, name: string): string {
  const root = path.join(harness.tempRoot, name);
  const owners = localMarkdownLinks(readFileSync(path.join(skillRoot, "AGENTS.md"), "utf8")).map((target) => target.split("#")[0]!);
  for (const relative of new Set([...SHIPPED, ...owners])) {
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

  // Pure structural controls use this same fixture result owner, without a new runner.
  // They do not claim an agent honored a rule or paused before an effect.
  const read = (relative: string): string | undefined => {
    try {
      return readFileSync(path.join(control, relative), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  const root = read("AGENTS.md")!.replace(/\r\n/gu, "\n");
  const skill = read("SKILL.md")!.replace(/\r\n/gu, "\n");
  const setup = read(SETUP)!;
  const record = (label: string, verify: () => void): void => {
    let output = "";
    try {
      verify();
    } catch (error) {
      output = String(error);
    }
    harness.results.push({ label, ok: !output, expectedCode: 0, actualCode: output ? 1 : 0, output });
  };
  const requireFinding = (file: string, text: string | undefined, code: string): void => {
    const findings = checkStandingGuidance((relative) => (relative === file ? text : read(relative)));
    if (!findings.some((finding) => finding.code === code)) throw new Error(`Missing expected structural finding ${code}`);
  };
  for (const rule of STANDING_RULES) {
    for (const term of rule.terms) {
      record(`standing contract detects removed ${rule.id}: ${term}`, () => {
        requireFinding("AGENTS.md", root.split(term).join("REMOVED"), `agent_entrypoints.standing_${rule.id}_missing`);
      });
    }
  }
  record("standing contract retains a positive unmodified control", () => {
    const findings = checkStandingGuidance(read);
    if (findings.length) throw new Error(JSON.stringify(findings));
  });
  record("standing contract rejects a broken destination", () => {
    requireFinding("AGENTS.md", root.replace("docs/architecture-conformance.md", "docs/missing-owner.md"), "agent_entrypoints.standing_owner_link_broken");
  });
  record("portable completion does not disappear with repository AGENTS omitted from the export", () => {
    const rule = completionRule(root);
    if (!rule || !skill.includes(rule)) throw new Error("Portable completion rule is missing");
    requireFinding("SKILL.md", skill.replace(rule, ""), "agent_entrypoints.portable_completion_drift");
  });
  record("portable business guidance rejects a maintainer dependency", () => {
    requireFinding("SKILL.md", `${skill}\n[Required](AGENTS.md)\n`, "agent_entrypoints.business_maintainer_dependency");
  });
  record("root guidance rejects an unrelated procedure", () => {
    requireFinding("AGENTS.md", `${root}\nRun npm run audit:ci after every edit.\n`, "agent_entrypoints.root_procedure_leak");
  });
  record("root setup diagnostics remain conditional", () => {
    requireFinding("SKILL.md", `${skill}\nDegraded execution still selects b2c-local.\n`, "agent_entrypoints.root_setup_diagnostics");
  });
  record("conditional setup cannot lose its direct link", () => {
    requireFinding("SKILL.md", skill.replace(`](${SETUP})`, "](missing-setup.md)"), "agent_entrypoints.setup_owner_unreachable");
  });
  record("conditional setup cannot lose its file", () => requireFinding(SETUP, undefined, "agent_entrypoints.setup_owner_unreachable"));
  record("conditional setup rejects a broken lifecycle pointer", () => {
    requireFinding(SETUP, setup.replace("](business-lifecycle.md)", "](missing-lifecycle.md)"), "agent_entrypoints.standing_owner_link_broken");
  });
  for (const term of [
    "b2c-local",
    "b2c-hosted",
    "Duplicate names are a collision",
    "Degraded execution still selects b2c-local",
    "CLI-only public MCP names",
    "write-gated MCP names",
    "mcp_readonly",
    "Hosted leftover names stay wrong-surface",
  ]) {
    record(`conditional setup detects removed compatibility: ${term}`, () => {
      requireFinding(SETUP, setup.split(term).join("REMOVED"), "agent_entrypoints.setup_compatibility_missing");
    });
  }
  record("injected files count in full, including text after an early-exit instruction", () => {
    const text = "Stop reading here.\nStill injected: \u00e9\ud83d\ude00";
    const result = measureGuidancePackets([{ id: "byte-control", measuredFiles: ["AGENTS.md"], fileCount: 1, utf8Bytes: 0 }], () => text)[0]!;
    if (result.utf8Bytes !== Buffer.byteLength(text, "utf8") || result.utf8Bytes === text.length)
      throw new Error("Byte accounting lost injected or multibyte text");
  });
  record("missing packet files stay unmeasured rather than zero bytes", () => {
    let refused = false;
    try {
      measureGuidancePackets([{ id: "missing", measuredFiles: ["AGENTS.md"], fileCount: 1, utf8Bytes: 0 }], () => undefined);
    } catch {
      refused = true;
    }
    if (!refused) throw new Error("Missing file counted as measured");
  });

  // An explicit comparison artifact in this fixture's temporary directory, never a business workspace.
  const report = path.join(harness.tempRoot, "agent-guidance-current.json");
  harness.runScriptArgs(
    "A0 packets replay through the existing entrypoint owner",
    SCRIPT,
    ["--repo-root", skillRoot, "--guidance-baseline", "docs/research/agent-guidance-a0.json", "--guidance-report", report],
    0,
  );
  record("A0 replay preserves all ten identities and does not invent model evidence", () => {
    const actual = JSON.parse(readFileSync(report, "utf8")) as {
      cases: Array<{ id: string }>;
      modelId: unknown;
      modelTokens: unknown;
      observedAgentTrace: unknown;
      serviceResult: unknown;
    };
    if (actual.cases.map((item) => item.id).join() !== Array.from({ length: 10 }, (_, index) => `A0-${String(index + 1).padStart(2, "0")}`).join())
      throw new Error("A0 cases changed");
    if ([actual.modelId, actual.modelTokens, actual.observedAgentTrace, actual.serviceResult].some((value) => value !== null))
      throw new Error("Unobserved model/service evidence was populated");
  });
}
