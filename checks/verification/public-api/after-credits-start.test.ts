import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOUNDER_BRIEF_ARTIFACT, LAUNCH_PROGRAM_ARTIFACT } from "../../../contracts/public-api/contract.js";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import { projectReadyBrief } from "../../../kernel/services/plan-projection.js";
import { buildHostedKnowledgeBundle } from "../../../tooling/render-hosted-bundle.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "entrypoints/cli/b2c.mjs");
const MARKER = "KEEP-NOTIFICATION-COVERAGE-AND-PERFORMANCE-BUDGET";
const AFTER_CREDITS_CHARS = 35477;
const PROGRAM_ID = "workflow.orchestration.full-launch-program";

function afterCreditsSizedBrief(): string {
  const header = `# After Credits fixture\n\n${MARKER}\nUnicode: café 日本語.\nQuotes: "don't" 'do'.\nShell: $HOME \`uname\` && true | cat; URL: https://example.invalid/brief?x=1&y=2\n\n`;
  const pad = "Constraint: keep spoiler gating, weekly digest, and selected-app facts. ";
  return header + pad.repeat(Math.ceil((AFTER_CREDITS_CHARS - header.length) / pad.length));
}

function setup() {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-after-credits-start-"));
  const home = path.join(temp, "registry");
  mkdirSync(home);
  return { temp, home, directory: path.join(temp, "app") };
}

function withHome<T>(home: string, fn: () => T): T {
  const prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = home;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
  }
}

function headingSlice(text: string, start: string, end?: string): string {
  const from = text.indexOf(start);
  assert(from >= 0, `missing heading ${start}`);
  const to = end ? text.indexOf(end, from + start.length) : -1;
  return text.slice(from, to < 0 ? undefined : to);
}

function codePoints(text: string): number {
  return Array.from(text).length;
}

function assertCreateStatusPlanBeforeCatalog(text: string, label: string): void {
  const createAt = text.indexOf("business-create");
  const statusAt = text.indexOf("business-status");
  const planAt = text.indexOf("business-plan");
  const catalogAt = Math.min(
    ...["b2c catalog", "b2c_catalog", "only for a specific goal"].map((needle) => {
      const at = text.indexOf(needle);
      return at < 0 ? Number.POSITIVE_INFINITY : at;
    }),
  );
  assert(createAt >= 0, `${label} omitted create`);
  assert(statusAt > createAt, `${label} lost status after create`);
  assert(planAt > statusAt, `${label} lost plan after status`);
  assert(catalogAt > planAt, `${label} still leads with catalog`);
}

test("After Credits start reaches status/plan without a maintainer tour or whole-program dump", () => {
  const env = setup();
  try {
    const brief = afterCreditsSizedBrief().slice(0, AFTER_CREDITS_CHARS);
    const file = path.join(env.temp, "brief.md");
    writeFileSync(file, brief);
    const created = spawnSync(
      process.execPath,
      [
        cli,
        "business-create",
        "--workspace",
        "app",
        "--directory",
        env.directory,
        "--name",
        "After Credits",
        "--hypothesis",
        "A recap companion",
        "--mandate-file",
        file,
        "--json",
      ],
      { cwd: root, encoding: "utf8", timeout: 30_000, env: { ...process.env, B2C_APP_BUILDER_HOME: env.home } },
    );
    const createdBody = JSON.parse(created.stdout);
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.equal(createdBody.ok, true);
    assert.equal(readFileSync(path.join(env.directory, FOUNDER_BRIEF_ARTIFACT), "utf8"), brief);
    const launch = readFileSync(path.join(env.directory, LAUNCH_PROGRAM_ARTIFACT), "utf8");
    assert(launch.length < brief.length, "derived launch program replaced the canonical After Credits brief");

    const { status, plan } = withHome(env.home, () => {
      const statusResult = callPublicOperation("business.status", { workspaceId: "app" });
      const planResult = callPublicOperation("business.plan", { workspaceId: "app" });
      assert(statusResult.ok, JSON.stringify(statusResult));
      assert(planResult.ok, JSON.stringify(planResult));
      return { status: statusResult.data, plan: planResult.data };
    });
    assert.equal(status.lifecycle, "not_initialized");
    assert.equal(plan.status, "not_initialized");
    assert.deepEqual(plan.ready, []);
    assert.match(String(plan.nextAction ?? ""), /Research|FOUNDER_BRIEF|product/i);
    assert(!JSON.stringify({ status, plan }).includes(brief), "status/plan dumped the entire After Credits source");

    const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const skill = readFileSync(path.join(root, "SKILL.md"), "utf8");
    const guide = readFileSync(path.join(root, "docs/guides/build-a-business.md"), "utf8");
    const lifecyclePath = "agents/skills/b2c-app-builder/references/business-lifecycle.md";
    const setupPath = "agents/skills/b2c-app-builder/references/setup.md";
    assert(skill.includes(`](${lifecyclePath})`), "root skill lost the managed lifecycle route");
    assert(skill.includes(`](${setupPath})`), "root skill lost the conditional setup route");
    const connect = readFileSync(path.join(root, setupPath), "utf8");
    const lifecycle = readFileSync(path.join(root, lifecyclePath), "utf8");
    const skillStart = headingSlice(lifecycle, "## Build a business", "## Boundaries");
    const managed = headingSlice(skill, "## Managed business", "## Setup request");
    assert(Buffer.byteLength(skill, "utf8") <= 6500, "root activation exceeded the bounded routing budget");
    assert(!/--mandate-file|composition-activate|--expected-revision/.test(skill), "root activation still carries conditional procedures");
    const guideCreate = headingSlice(guide, "## Create a planning workspace", "## Knowledge tools");
    const startPath = [headingSlice(agents, "# Brigade Agent Guide", "### Contribution"), managed, skillStart].join("\n");
    assert(startPath.includes("Business is an early exit"));
    assert(startPath.includes("b2c_business_status"));
    assert(
      !/docs\/north-star-architecture|docs\/architecture-conformance|docs\/decisions|ARCH-\d+/.test(startPath),
      "ordinary start path still names maintainer architecture",
    );
    assert(!/b2c_catalog|b2c_knowledge_search/.test(connect), "Connect still presents catalog/search as the start path");
    assertCreateStatusPlanBeforeCatalog(skillStart, "linked business lifecycle");
    assertCreateStatusPlanBeforeCatalog(guideCreate, "build-a-business create example");
    assert(
      startPath.indexOf("business-status") < startPath.indexOf("business-plan") &&
        startPath.indexOf("only for a specific goal") > startPath.indexOf("business-plan"),
      "start path still ranks catalog above status then plan",
    );

    const service = createKnowledgeService(buildHostedKnowledgeBundle(root));
    const dispatched = service.workflow({ workflowId: PROGRAM_ID, brief: true }).dispatchBrief!;
    const bound = service.workflow({ workflowId: PROGRAM_ID }).workflow.referenceIds.length;
    const projected = projectReadyBrief(dispatched);
    const currentPaths = dispatched.load.map((entry) => entry.path);
    const deferredPaths = (dispatched.deferredLoad ?? []).map((entry) => entry.path);
    const currentBytes = Buffer.byteLength(JSON.stringify(dispatched.load), "utf8");
    const deferredBytes = Buffer.byteLength(JSON.stringify(dispatched.deferredLoad ?? []), "utf8");
    const planning = plan as { nextAction?: string; resume?: { workflowId?: string; nextAction?: string } };
    const accounting = {
      // Source-size accounting, not measured host loading or model-token usage.
      rootActivationBytes: Buffer.byteLength(skill, "utf8"),
      conditionalLifecycleBytes: Buffer.byteLength(lifecycle, "utf8"),
      startPathCodePoints: codePoints(startPath),
      startPathBytes: Buffer.byteLength(startPath, "utf8"),
      firstUsefulAction: planning.nextAction,
      resumeWorkflowId: planning.resume?.workflowId,
      programIfOpened: {
        bound,
        current: currentPaths.length,
        deferred: deferredPaths.length,
        currentBytes,
        deferredBytes,
        deferredLoadCount: projected.context?.deferredLoadCount ?? 0,
      },
    };
    assert(
      accounting.startPathCodePoints > 0 && accounting.startPathCodePoints <= 13_000,
      `start-path size ${accounting.startPathCodePoints} exceeded the 13000-code-point managed-instruction ceiling`,
    );
    assert.equal(accounting.firstUsefulAction, planning.resume?.nextAction);
    assert.match(String(accounting.firstUsefulAction), /FOUNDER_BRIEF/);
    assert.equal(accounting.resumeWorkflowId, "workflow.research.research-backed-spec");
    assert(accounting.programIfOpened.current < accounting.programIfOpened.bound, "opened program packet still treats every bind as current reading");
    assert(accounting.programIfOpened.deferred > 0, "opened program packet lost deferred later-horizon accounting");
    assert.equal(accounting.programIfOpened.deferredLoadCount, accounting.programIfOpened.deferred);
    assert(currentPaths.some((entry) => /full-launch-program/.test(entry)));
    assert(!currentPaths.some((entry) => /design-evidence-stack|mobile-flow-craft|consumer-craft-benchmarks|paid-tool-routing/.test(entry)));
    assert(deferredPaths.some((entry) => /design-evidence-stack|mobile-flow-craft|consumer-craft-benchmarks/.test(entry)));
    assert(
      deferredPaths.some((entry) => /paid-tool-routing/.test(entry)),
      "opened program packet must defer paid-tool-routing",
    );
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});
