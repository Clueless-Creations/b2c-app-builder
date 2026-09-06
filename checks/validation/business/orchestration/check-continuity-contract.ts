#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { flagString, parseFlags } from "../../../../tooling/lib/launch-state.js";

type Severity = "error" | "warning";

type Issue = {
  code: string;
  message: string;
  severity: Severity;
  file?: string;
};

/**
 * A hand-curated entrypoint file earns its keep only up to a point. A published
 * harness-engineering study of 138 agent tasks found LLM-generated context files raise
 * inference cost 20-23% and lower task success 3% (https://openai.com/index/harness-engineering/);
 * the same tax applies to a hand-written file once it grows past a map into an encyclopedia.
 * 150 lines is a warning, not a failure: AGENTS.md and CLAUDE.md still carry the pinned
 * phrases requireTerms checks above at any length, so a long file is a cost signal, not a
 * contract violation.
 */
const ENTRYPOINT_LINE_BUDGET = 150;

type Args = {
  mode: "skill" | "business";
  skillRoot: string;
  businessRoot?: string;
};

type ContractPaths = {
  agents: string;
  claude: string;
  cursor: string;
  appAgents: string;
  specialistPrompts: Array<{ label: string; filePath: string }>;
  orchestrator: string;
  orchestration: string;
};

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--skill-root"], key: "skillRoot", strict: true },
    { flags: ["--root"], key: "businessRoot", strict: true },
  ]);
  const skillRoot = flagString(flags, "skillRoot") ?? process.cwd();
  const businessRoot = flagString(flags, "businessRoot");
  const mode = businessRoot ? "business" : "skill";
  return businessRoot ? { mode, skillRoot, businessRoot } : { mode, skillRoot };
}

function specialistPromptNames(): string[] {
  return [
    "accessibility-device-qa.md",
    "backend-infrastructure-engineer.md",
    "copy-specialist.md",
    "customer-success.md",
    "design-guru.md",
    "engineering-leader.md",
    "marketing-guru.md",
    "mobile-engineer.md",
    "product-leader.md",
    "research-strategist.md",
    "security-architect.md",
  ];
}

function contractPaths(args: Args): ContractPaths {
  if (args.mode === "skill") {
    const entrypoints = path.join(args.skillRoot, "surfaces/workspace-template/repo-agent-entrypoints");
    const roster = path.join(args.skillRoot, "examples/workspace/business/engineering/app-agent-roster");
    return {
      agents: path.join(entrypoints, "AGENTS.md"),
      claude: path.join(entrypoints, "CLAUDE.md"),
      cursor: path.join(entrypoints, ".cursor/rules/agents.mdc"),
      appAgents: path.join(roster, "APP_AGENTS.md"),
      specialistPrompts: specialistPromptNames().map((fileName) => ({
        label: fileName,
        filePath: path.join(roster, "agents", fileName),
      })),
      orchestrator: path.join(roster, "agents/orchestrator.md"),
      orchestration: path.join(args.skillRoot, "examples/workspace/business/operations/ORCHESTRATION.md"),
    };
  }

  const root = args.businessRoot ?? process.cwd();
  return {
    agents: path.join(root, "AGENTS.md"),
    claude: path.join(root, "CLAUDE.md"),
    cursor: path.join(root, ".cursor/rules/agents.mdc"),
    appAgents: path.join(root, "APP_AGENTS.md"),
    specialistPrompts: specialistPromptNames().map((fileName) => ({
      label: fileName,
      filePath: path.join(root, "agents", fileName),
    })),
    orchestrator: path.join(root, "agents/orchestrator.md"),
    orchestration: path.join(root, "operations/ORCHESTRATION.md"),
  };
}

function readRequired(filePath: string, label: string, issues: Issue[]): string | undefined {
  if (!existsSync(filePath)) {
    issues.push({ code: "continuity.file_missing", message: `${label} is missing at ${filePath}`, severity: "error" });
    return undefined;
  }
  return readFileSync(filePath, "utf8");
}

function requireTerms(label: string, text: string | undefined, terms: readonly string[], issues: Issue[]): void {
  if (text === undefined) return;
  if (/\bstate\/[^\s`"']+\.ya?ml\b/i.test(text))
    issues.push({
      code: "continuity.internal_detail",
      message: `${label} must read reducer-owned runtime state through supported status and plan operations.`,
      severity: "error",
    });
  for (const term of terms) {
    if (!text.includes(term)) issues.push({ code: "continuity.term_missing", message: `${label} must mention "${term}"`, severity: "error" });
  }
}

function forbidTerms(label: string, text: string | undefined, terms: readonly string[], issues: Issue[]): void {
  if (text === undefined) return;
  if (/\bstate\/[^\s`"']+\.ya?ml\b/i.test(text))
    issues.push({
      code: "continuity.internal_detail",
      message: `${label} must read reducer-owned runtime state through supported status and plan operations.`,
      severity: "error",
    });
  for (const term of terms) {
    if (text.includes(term))
      issues.push({ code: "continuity.internal_detail", message: `${label} must not route normal work through "${term}"`, severity: "error" });
  }
}

/**
 * Warning tier only: a long entrypoint file still passes the contract. Cites the measured
 * cost so the warning tells an editor why the budget exists, not just that it was crossed.
 */
function checkLengthBudget(label: string, text: string | undefined, filePath: string, issues: Issue[]): void {
  if (text === undefined) return;
  const lineCount = text.split("\n").length;
  if (lineCount <= ENTRYPOINT_LINE_BUDGET) return;
  issues.push({
    code: "continuity.entrypoint_too_long",
    severity: "warning",
    file: filePath,
    message:
      `${label} runs ${lineCount} lines, over the ${ENTRYPOINT_LINE_BUDGET}-line budget. ` +
      "A harness-engineering study of 138 agent tasks found long generated context files raise inference cost by 20 to 23 percent. " +
      "Move a category to one link line instead of inline prose.",
  });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const paths = contractPaths(args);
  const issues: Issue[] = [];

  const agents = readRequired(paths.agents, "AGENTS.md", issues);
  const claude = readRequired(paths.claude, "CLAUDE.md", issues);
  const cursor = readRequired(paths.cursor, "Cursor rule", issues);
  const appAgents = readRequired(paths.appAgents, "APP_AGENTS.md", issues);
  const orchestrator = readRequired(paths.orchestrator, "orchestrator role prompt", issues);
  const orchestration = readRequired(paths.orchestration, "operations/ORCHESTRATION.md", issues);
  const specialistPrompts = paths.specialistPrompts.map(({ label, filePath }) => ({
    label,
    text: readRequired(filePath, label, issues),
  }));

  requireTerms(
    "AGENTS.md",
    agents,
    [
      "PRODUCT.md",
      "DESIGN.md",
      "b2c status",
      "b2c plan",
      "Do not rely on chat memory",
      "state/business-state.json",
      "reducer-owned",
      "Do not infer authority",
      "git status --short --branch",
      "APP_AGENTS.md",
      "role prompts",
      "design/design-room.html",
    ],
    issues,
  );
  forbidTerms("AGENTS.md", agents, ["tsx <skill-root>/core/", "install-control-permissions.ts"], issues);
  checkLengthBudget("AGENTS.md", agents, paths.agents, issues);

  requireTerms("CLAUDE.md", claude, ["Read `AGENTS.md` first", "PRODUCT.md", "DESIGN.md", "b2c status", "b2c plan", "reducer-owned"], issues);
  forbidTerms("CLAUDE.md", claude, ["--disallowedTools", "ANTHROPIC_API_KEY"], issues);
  checkLengthBudget("CLAUDE.md", claude, paths.claude, issues);

  requireTerms("Cursor rule", cursor, ["Read `AGENTS.md` first", "PRODUCT.md", "DESIGN.md", "b2c status", "b2c plan", "reducer-owned"], issues);
  forbidTerms("Cursor rule", cursor, ["sandbox gates", "structured/JSON output mode"], issues);

  requireTerms(
    "APP_AGENTS.md",
    appAgents,
    ["Session Continuity", "Do not rely on chat memory", "role prompts", "state/business-state.json", "operations/ORCHESTRATION.md"],
    issues,
  );

  requireTerms(
    "orchestrator role prompt",
    orchestrator,
    ["Session Continuity", "git status --short", "Do not rely on chat memory", "state updates", "operations/ORCHESTRATION.md"],
    issues,
  );

  for (const specialist of specialistPrompts) {
    requireTerms(
      specialist.label,
      specialist.text,
      [
        "Session Continuity",
        "Do not rely on chat memory",
        "Allowed write scope",
        "Forbidden actions",
        "Scope reviewed",
        "Evidence",
        "Findings",
        "Recommendations",
        "Files changed",
        "Validation",
        "Risks and blockers",
        "Proposed state patch",
      ],
      issues,
    );
  }

  requireTerms(
    "operations/ORCHESTRATION.md",
    orchestration,
    ["## Session Continuity", "Last state review", "Do not rely on chat memory", "Git status reviewed", "Next action"],
    issues,
  );

  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");

  // D1 (#32): one of the three reportAndExit outliers — its own hand-wired --json branch,
  // now severity-aware: a warning (the entrypoint length budget) reports but never fails.
  if (process.argv.includes("--json")) {
    const failures = issues.map((item) => ({ severity: item.severity, rule: item.code, message: item.message }));
    process.stdout.write(`${JSON.stringify({ pass: errors.length === 0, failures })}\n`);
    process.exit(errors.length > 0 ? 1 : 0);
  }

  for (const issue of issues) console.error(`[${issue.severity.toUpperCase()} ${issue.code}] ${issue.message}`);

  if (errors.length > 0) {
    process.exit(1);
  }

  const warningSuffix = warnings.length > 0 ? ` (${warnings.length} warning(s))` : "";
  console.log(`Continuity contract passed for ${args.mode === "skill" ? args.skillRoot : args.businessRoot}${warningSuffix}`);
}

main();
