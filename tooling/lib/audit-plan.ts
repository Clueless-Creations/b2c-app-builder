/**
 * audit-plan.ts — the single source of truth for the maintainer audit pipeline.
 *
 * Both `npm run audit` / `npm run audit:ci` (repo root) and `npm run audit`
 * (installed skill runtime) execute tooling/run-audit.ts, which builds its
 * step list from this module. check-package-parity.ts imports the same plan
 * to verify that every gate-shaped npm script (check:*, validate:*,
 * launchbench:lint, test:validators, audit:links) is either a step here or explicitly excluded
 * with a reason — so a validator can no longer be silently dropped from the
 * pipeline by editing one of several near-identical shell strings.
 */

export type AuditLayout = "repo" | "skill";

/** CI and local audit subsets. `all` is the full plan; GitHub splits fast vs heavy. */
export type AuditLane = "all" | "fast" | "heavy";

export const AUDIT_LANES: readonly AuditLane[] = ["all", "fast", "heavy"];

/**
 * Why a step is skipped on a CI lane. Typecheck still runs on every lane (the compile barrier).
 * Serial suites (validator fixtures, engine fixtures, e2e) belong on `heavy` only.
 */
export function stepSkippedByLane(step: AuditStep, lane: AuditLane): string | undefined {
  switch (lane) {
    case "all":
      return undefined;
    case "fast":
      return step.serial ? "heavy lane (--lane fast)" : undefined;
    case "heavy":
      return step.serial || step.kind === "tsc" ? undefined : "fast lane (--lane heavy)";
    default: {
      const exhaustive: never = lane;
      return exhaustive;
    }
  }
}

/**
 * A CI shard of the heavy lane, spelled "1/2" on the command line.
 *
 * Only `serial` steps are partitioned: they are the multi-minute suites that spawn real
 * subprocesses, and on a two-vCPU runner they otherwise run one after another inside a single
 * job. Everything else (today just the typecheck barrier) runs in every shard, because it is
 * seconds and every shard wants the compile to fail fast.
 */
export interface AuditShard {
  readonly index: number;
  readonly total: number;
}

export function parseAuditShard(value: string | undefined): AuditShard {
  const match = /^(\d+)\/(\d+)$/.exec((value ?? "").trim());
  const index = Number(match?.[1]);
  const total = Number(match?.[2]);
  if (!match || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
    throw new Error(`--shard must be spelled i/n with 1 <= i <= n (got ${value ?? "(missing)"}).`);
  }
  return { index, total };
}

/** The serial steps of a plan, in plan order — the only steps a shard partitions. */
export function serialStepIds(plan: readonly AuditStep[]): string[] {
  return plan.filter((step) => step.serial).map((step) => step.id);
}

/**
 * Which shard owns a serial step: round-robin over the serial steps in plan order.
 *
 * Round-robin rather than a hand-tuned cost table on purpose. A table would have to be revisited
 * every time a suite's runtime moved, and a step missing from it would run in no shard at all —
 * the silent-coverage-loss failure this repository keeps re-learning. Here, every serial step has
 * an owner by construction, so adding one later cannot make it vanish from CI.
 */
export function shardOwnerOf(plan: readonly AuditStep[], stepId: string, total: number): number | undefined {
  const position = serialStepIds(plan).indexOf(stepId);
  return position < 0 ? undefined : (position % total) + 1;
}

/** Why a serial step is skipped on this shard. Non-serial steps are never skipped by sharding. */
export function stepSkippedByShard(plan: readonly AuditStep[], step: AuditStep, shard: AuditShard | undefined): string | undefined {
  if (!shard || shard.total === 1 || !step.serial) return undefined;
  const owner = shardOwnerOf(plan, step.id, shard.total);
  return owner === shard.index ? undefined : `shard ${owner} of ${shard.total} (--shard ${shard.index}/${shard.total})`;
}

export interface AuditStep {
  /** npm script name in the governing package.json, or a special kind id. */
  id: string;
  /**
   * - "script": resolve package.json scripts[id] (must start with "tsx ") and spawn tsx directly.
   * - "shell": run package.json scripts[id] through a shell (env-dependent steps like validate:skill).
   * - "tsc": run the TypeScript no-emit typecheck (npm exec tsc -- --noEmit equivalent).
   */
  kind: "script" | "shell" | "tsc";
  /** Extra args appended after the script's own args (the old `npm run x -- <args>` tail). */
  args?: string[];
  /** Skipped when running with --ci (maintainer-machine-only steps). */
  ciSkip?: boolean;
  /** Only part of the repo-root pipeline (script does not exist in the runtime package). */
  repoOnly?: boolean;
  /**
   * Must not run inside the concurrency pool (spawns its own heavy process
   * tree, e.g. test:validators / test:fixtures / check:engine-e2e).
   */
  serial?: boolean;
}

/**
 * Gate-shaped npm scripts that are deliberately NOT part of the audit
 * pipeline. Every entry needs a concrete reason; check-package-parity fails
 * when a "check:" or "validate:" script is neither a step nor listed here.
 */
export const auditExcludedScripts: Record<string, string> = {
  "check:onboarding-foundations-research":
    "Strict research acceptance requires generated onboarding contracts and evidence, absent from the unclaimed template. Covered by onboarding-foundations fixtures and bound to its production workflow gate.",
  "check:onboarding-foundations-identity":
    "Strict identity acceptance requires generated onboarding contracts and evidence, absent from the unclaimed template. Covered by onboarding-foundations fixtures and bound to its production workflow gate.",
  "check:onboarding-foundations-measurement":
    "Strict measurement acceptance requires generated onboarding contracts and evidence, absent from the unclaimed template. Covered by onboarding-foundations fixtures and bound to its production workflow gate.",
  "check:onboarding-foundations-prototype":
    "Strict prototype acceptance requires generated onboarding contracts and evidence, absent from the unclaimed template. Covered by onboarding-foundations fixtures and bound to its production workflow gate.",
  "check:onboarding-foundations-runtime":
    "Strict runtime acceptance requires generated onboarding contracts and evidence, absent from the unclaimed template. Covered by onboarding-foundations fixtures and bound to its production workflow gate.",

  "check:mobai-proof-workflow":
    "Requires captured MobAI evidence in a business workspace; the shipped scaffold is intentionally unproven. The base contract remains in the maintainer audit, strict provider workflows retain this gate, and MobAI fixtures cover acceptance and refusal.",
  "check:content-assets-foundation":
    "The content-production workflow's strict mode of check:content-assets. The general audit retains the compatible base gate; content-assets fixtures cover current-schema acceptance and legacy refusal in strict mode.",
  "check:design-foundation":
    "The substantive Design Room workflow's strict mode of check:design-md. The general audit retains the compatible base gate; design-contract fixtures exercise strict missing, removed, and valid foundations.",
  "check:design-acceptance": "Requires rendered native and web evidence; seed workspace is a draft. Covered by design-acceptance fixtures.",
  "check:browser-runtime-proof":
    "The landing producer's own strict runtime gate requires a current engine attempt and a live browser proof bundle in a generated business workspace. Browser-runtime-proof fixtures cover its pass and tamper paths.",
  "check:design-worthiness-mechanical":
    "Design Room's producer-only mechanical invocation of check:design-worthiness; the general audit already runs the full gate, including the independent taste decision, so running both would duplicate the mechanical checks.",
  "check:landing-funnel":
    "requires a generated business repo with a deployed landing funnel; the shipped templates contain no deployable funnel (examples/workspace/business/growth/landing/ is a section component library, deliberately not site-shaped, and the validator's scope check ignores it)",
  "check:apple-release-readiness":
    "strict release-only mode of check:apple-requirements; the general audit already runs the base validator, while the shipped scaffold intentionally lacks signing-ready evidence and must fail this stricter command",
  "check:onboarding-page-fresh":
    "a --page-scoped invocation of check:generated-pages (already an audit step) for product/onboarding.html only, used as ONB-22's own catalog gate so its acceptance does not depend on an unrelated page elsewhere in the manifest; running the repo-wide check:generated-pages step already covers this page too, so running both in the general audit would duplicate the step",
  launchbench:
    "convenience command that runs launchbench:lint then test:validators; the audit runs those as separate steps so CI can put the fixture suite on the heavy lane and a session can verify scenario definitions without re-running hundreds of tsx boots",
  "check:onboarding-cutover-repository-complete":
    "a strict --require-resolved wrapper around check:onboarding-cutover-repository (already an audit step), used only as ONB-22's own catalog gate; the shipped template's Deletion Manifest row deliberately keeps the unresolved disposition option list, so running this in the general audit would always fail",
  "check:onboarding-graph-complete":
    "a strict --require-done wrapper around check:onboarding-graph (already an audit step), used only as ONB-22's own catalog gate; the shipped onboarding template is deliberately not marked done, so running this in the general audit would always fail",
  "check:research-workflow-output":
    "a strict --require-workflow-outputs wrapper around check:research (already an audit step), used only as the research-backed-spec workflow gate; the shipped research artifacts are deliberate pre-claim templates, so running this in the general audit would always fail",
  "check:app-store-portfolio-required":
    "a strict --require-receipt wrapper around check:app-store-portfolio (already an audit step), used only as the live-app-store-portfolio workflow gate; the shipped workspace has no live apps-list receipt, so running this in the general audit would always fail",
  "check:paid-tool-intake-required":
    "a strict --require-intake wrapper around check:paid-tool-intake (already an audit step), used only as the paid-tool-routing workflow gate; the shipped TOOL_DECISIONS.md still carries the unused intake seed, so running this in the general audit would always fail",
  "check:provider-proof-onboarding":
    "a --providers-scoped invocation of check:provider-proof (already an audit step) for PostHog/RevenueCat only, used as ONB-22's own catalog gate so its acceptance does not depend on an unrelated provider row (Resend, App Store Connect, Sentry, ...) elsewhere in operations/PROVIDER_PROOF.md; running the repo-wide check:provider-proof step already covers this file too, so running both in the general audit would duplicate the step",
  "check:onboarding-evidence-onb-00":
    "ONB-00's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-01":
    "ONB-01's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-02":
    "ONB-02's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-03":
    "ONB-03's own catalog gate: verifies that specific node's own output packet (product/onboarding/graph/ONB-03-current-guidance.md), which only exists once a durable run has actually produced it; the shipped template has never run the onboarding graph, so this always fails in the general audit",
  "check:onboarding-evidence-onb-04":
    "ONB-04's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-05":
    "ONB-05's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-06":
    "ONB-06's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-07":
    "ONB-07's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-08":
    "ONB-08's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-20":
    "ONB-20's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-21":
    "ONB-21's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-09":
    "ONB-09's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-10":
    "ONB-10's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-11":
    "ONB-11's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-12":
    "ONB-12's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-13":
    "ONB-13's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-14":
    "ONB-14's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-15":
    "ONB-15's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-16":
    "ONB-16's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-18":
    "ONB-18's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-17":
    "ONB-17's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
  "check:onboarding-evidence-onb-19":
    "ONB-19's own catalog gate; same rationale as check:onboarding-evidence-onb-03 -- its output packet does not exist until a durable run produces it",
};

/**
 * Per-gate wall clock, shared by every caller that spawns a gate through the plan's argument
 * shapes (kernel/session/run.ts's runDeterministicGates, kernel/session/check.ts). Sized for
 * `launchbench`, the one gate that spawns a whole suite (measured 2:41 on an idle machine,
 * 2026-09-01) — a shorter cap reports SIGTERM as if the suite had judged the work and rejected
 * it, and a timeout is not a verdict.
 *
 * Raised from fifteen to thirty minutes on 2026-09-02 after `check:engine-e2e` measured 770 s on
 * one green GitHub-hosted run and was killed at 947 s on the next (the CI runner has two cores;
 * the same gate takes 194 s on a laptop). The job-level limit in .github/workflows/ci.yml is
 * sixty minutes, so a single slow gate still cannot stall the audit indefinitely.
 */
export const GATE_TIMEOUT_MS = 1_800_000;

/**
 * The audit's own renderer steps redirect output to /tmp scratch (--out) and skip the full build
 * (--static-only) because the audit only proves the render works. A caller running one of these
 * gates as a real node's (or a founder's named) gate wants the render to be the actual output, so
 * those audit-only redirections are stripped and the gate writes into the target workspace
 * exactly as it would without this reuse. Shared by kernel/session/run.ts and kernel/session/check.ts
 * so both invoke a gate's plan-derived args identically.
 */
export function stripAuditOnlyFlags(args: readonly string[]): string[] {
  const kept: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--out") {
      index += 1;
      continue;
    }
    if (arg === "--static-only") continue;
    kept.push(arg);
  }
  return kept;
}

/** Relative business-artifact root for the layout. */
function templatesRoot(layout: AuditLayout): string {
  return layout === "repo" ? "examples/workspace/business" : "examples/workspace/business";
}

/** Relative skill root for the layout. */
function skillRoot(layout: AuditLayout): string {
  return layout === "repo" ? "." : ".";
}

/**
 * Ordered audit pipeline. The order mirrors the original audit script chains:
 * typecheck first, repo/skill structure gates, scenario lint + fixtures, then
 * the template-state gates, then renderers.
 *
 * `roots` overrides where the business artifacts and skill live — the session runner
 * (kernel/session/run.ts) reuses this plan as the single source of truth for each gate's
 * canonical argument shape when it runs a node's gates against a real business workspace.
 * Before that reuse existed, the runner passed only a BUSINESS_ROOT env var, and every gate
 * whose CLI takes --root/--state either failed against the wrong directory or — worse —
 * silently validated the skill's own reference workspace instead of the business under test.
 */
export function buildAuditPlan(layout: AuditLayout, roots?: { businessRoot?: string; skillRoot?: string }): AuditStep[] {
  const T = roots?.businessRoot ?? templatesRoot(layout);
  const S = roots?.skillRoot ?? skillRoot(layout);
  // Maintainer audits exercise the shipped v1 reference template. Durable runtime
  // gates always read the reducer-owned v2 state in the target business workspace.
  const statePath = "state/business-state.json";
  const stateArgs = ["--root", T, "--state", statePath];
  const rootArgs = ["--root", T];

  const steps: AuditStep[] = [
    { id: "tsc", kind: "tsc" },
    { id: "lint:format", kind: "shell" },
    { id: "validate:skill", kind: "shell", ciSkip: true },
    { id: "audit:links", kind: "script" },
    { id: "check:source-freshness", kind: "script" },
    { id: "check:provider-contracts", kind: "script" },
    { id: "check:capability-delta", kind: "script" },
    { id: "check:asc-command-contract", kind: "script", args: ["--skill-root", S] },
    { id: "check:motion-contract", kind: "script", args: ["--skill-root", S, "--workspace-root", T] },
    { id: "check:scrollytelling", kind: "script", args: ["--skill-root", S, "--workspace-root", T] },
    { id: "check:mobai-proof", kind: "script", args: ["--skill-root", S, ...stateArgs] },
    // Keep canonical arguments for explicit runtime gates without demanding live provider
    // evidence from the unexecuted reference scaffold in a maintainer audit.
    ...(roots?.businessRoot ? [{ id: "check:mobai-proof-workflow", kind: "script" as const, args: ["--skill-root", S, ...stateArgs] }] : []),
    { id: "check:source-checkpoint", kind: "script", args: rootArgs },
    { id: "check:continuity-contract", kind: "script" },
    { id: "check:skill-supply-chain", kind: "script" },
    // ADR-0005: authored upstream manifests, retained notices, and recorded observations stay
    // consistent with the source registry and the local owners they name. Repo-only because
    // the Layers and Rork manifests name tests under checks/verification/, which the installed
    // skill package does not ship, so the check cannot pass in the skill layout.
    { id: "check:upstreams", kind: "script", args: ["--skill-root", S], repoOnly: true },
    // ADR-0005: ACKNOWLEDGMENTS.md, THIRD_PARTY_NOTICES.md, and docs/upstreams/support-report.md
    // are projections of catalog/upstreams; a hand edit or a stale render fails here. Repo-only
    // because docs/ does not ship in the runtime package.
    { id: "check:credits", kind: "script", args: ["--skill-root", S], repoOnly: true },
    { id: "check:autopilot", kind: "script" },
    { id: "check:skill-version", kind: "script", args: ["--source", S, "--installed", S, "--all-runtimes"] },
    {
      id: "check:version-discipline",
      kind: "script",
      args: layout === "repo" ? ["--repo-root", ".", "--skill-root", S] : ["--skill-root", S],
    },
    { id: "check:package-parity", kind: "script", repoOnly: true },
    { id: "check:repository-boundary", kind: "script", args: ["--repo-root", "."], repoOnly: true },
    { id: "check:architecture", kind: "script", args: ["--repo-root", "."], repoOnly: true },
    { id: "check:artifact-templates", kind: "script", args: ["--skill-root", S] },
    { id: "check:generated-pages", kind: "script", args: rootArgs },
    { id: "check:repository-profile", kind: "script", args: rootArgs },
    { id: "check:app-archetype", kind: "script", args: ["--skill-root", S] },
    { id: "check:product-md", kind: "script", args: rootArgs },
    { id: "check:archetype-starter", kind: "script", args: ["--skill-root", S] },
    { id: "check:agent-roster", kind: "script", args: rootArgs },
    { id: "check:agent-roster-headless-safety", kind: "script", args: rootArgs },
    { id: "check:reference-size", kind: "script", args: ["--skill-root", S] },
    { id: "check:hub-spoke", kind: "script", args: ["--skill-root", S] },
    { id: "check:learning-grounding", kind: "script", args: ["--skill-root", S] },
    { id: "check:graph-foundations", kind: "script", args: ["--skill-root", S] },
    { id: "check:pack-composition", kind: "script", args: ["--skill-root", S] },
    { id: "check:operating-graph", kind: "script", args: ["--skill-root", S] },
    { id: "check:public-api", kind: "script" },
    { id: "test:public-api", kind: "script" },
    { id: "check:catalog", kind: "script", args: ["--skill-root", S] },
    { id: "catalog:render-routing", kind: "script", args: ["--check", "--skill-root", S] },
    { id: "check:hosted-bundle", kind: "script", args: ["--skill-root", S] },
    // Same drift shape as check:hosted-bundle immediately above: a generated fingerprint file
    // (kernel/schema/evidence-schema-version.json) must still match the live catalog and the three
    // evidence-dialect schemas it was rendered from. Required, not excluded, because — unlike
    // check:research-workflow-output's deliberately-incomplete shipped templates — nothing about
    // the shipped schemas is intentionally stale; a drift here is always a forgotten
    // render:evidence-schema-version after a real schema or catalog edit.
    { id: "check:evidence-schema-drift", kind: "script", args: ["--skill-root", S] },
    { id: "check:gates-layout", kind: "script", args: ["--skill-root", S] },
    { id: "check:validator-docs", kind: "script", args: ["--repo-root", "."], repoOnly: true },
    // ADR-0007: the three-scope routers, the thin adapters, and the workspace agent templates stay
    // inside the agent-documentation contract. Repo-only because the root adapters and
    // agents/skills/ are not part of the installed runtime package.
    { id: "check:agent-entrypoints", kind: "script", args: ["--repo-root", "."], repoOnly: true },
    { id: "check:agent-evals", kind: "script" },
    { id: "launchbench:lint", kind: "script" },
    // U9's v2 verification surface (fixture suites, capability-boundary suites, cross-runtime
    // parity suite). Each spawns many of its own tsx subprocesses internally, so they run
    // serially rather than sharing the concurrency pool with the lighter single-shot validators.
    // launchbench:lint (YAML only) stays in the fast pool; test:validators is the fixture suite
    // that used to hide inside `npm run launchbench`.
    { id: "test:validators", kind: "script", serial: true },
    { id: "test:fixtures", kind: "script", serial: true },
    { id: "test:boundaries", kind: "script", serial: true },
    { id: "test:parity", kind: "script", serial: true },
    // The engine's crash-test dummy: bootstrap a throwaway copy of the reference business, drive
    // two fixture-executor sessions (with the founder-approval edge between them), prove the
    // fresh-context verifier sweep accepts work, and prove the verifier-off control still parks
    // it. Spawns its own session subprocesses, so it runs serially like the suites above; repo
    // layout only, since it copies examples/workspace/business out of the source tree.
    { id: "check:engine-e2e", kind: "script", serial: true, repoOnly: true },
    { id: "validate:launch-state", kind: "script", args: stateArgs },
    { id: "validate:design-state", kind: "script", args: rootArgs },
    { id: "check:design-room", kind: "script", args: rootArgs },
    { id: "check:design-md", kind: "script", args: rootArgs },
    ...(roots?.businessRoot ? [{ id: "check:browser-runtime-proof", kind: "script" as const, args: rootArgs }] : []),
    { id: "check:component-contracts", kind: "script", args: ["--root", S] },
    { id: "check:design-worthiness", kind: "script", args: stateArgs },
    { id: "check:audience-identity", kind: "script", args: stateArgs },
    { id: "check:token-promotion", kind: "script", args: rootArgs },
    { id: "check:vibecoded-tells", kind: "script", args: rootArgs },
    { id: "check:template-safety", kind: "script" },
    { id: "check:founder-copy", kind: "script", args: [...rootArgs, "--skill-root", S] },
    { id: "check:app-copy", kind: "script", args: [...stateArgs, "--skill-root", S] },
    {
      id: "check:no-slop",
      kind: "script",
      // The installed skill package deliberately does not ship B2C App Builder's
      // repository-level front-door files. LaunchBench still exercises the
      // checker's synthetic positive and negative controls in both layouts.
      args: layout === "repo" ? ["--skill-root", S] : ["--skill-root", S, "--skip-repo-front-door"],
    },
    { id: "check:documentation-ste100", kind: "script", args: ["--skill-root", S] },
    { id: "check:founder-operator", kind: "script", args: stateArgs },
    { id: "check:paid-tool-intake", kind: "script", args: rootArgs },
    { id: "check:app-store-portfolio", kind: "script", args: rootArgs },
    { id: "check:agent-operations", kind: "script", args: stateArgs },
    { id: "check:provider-proof", kind: "script", args: stateArgs },
    { id: "check:compound-engineering", kind: "script", args: stateArgs },
    { id: "check:security", kind: "script", args: stateArgs },
    { id: "check:privacy", kind: "script", args: stateArgs },
    { id: "check:ai-provider-controls", kind: "script", args: stateArgs },
    { id: "check:content-assets", kind: "script", args: stateArgs },
    { id: "check:paid-ua", kind: "script", args: stateArgs },
    { id: "check:apple-requirements", kind: "script", args: stateArgs },
    { id: "check:store-console", kind: "script", args: stateArgs },
    { id: "check:aso-evidence", kind: "script", args: stateArgs },
    { id: "check:app-review-contract", kind: "script", args: stateArgs },
    { id: "check:store-screenshots", kind: "script", args: stateArgs },
    { id: "check:native-ios", kind: "script", args: stateArgs },
    { id: "check:native-android", kind: "script", args: rootArgs },
    { id: "check:readiness-coverage", kind: "script", args: stateArgs },
    { id: "check:orchestration", kind: "script", args: stateArgs },
    { id: "check:emotional-design", kind: "script", args: stateArgs },
    { id: "check:onboarding-graph", kind: "script", args: stateArgs },
    { id: "check:onboarding-cutover-repository", kind: "script", args: rootArgs },
    { id: "check:attribution", kind: "script", args: stateArgs },
    { id: "check:secrets", kind: "script", args: stateArgs },
    { id: "check:lane-coverage", kind: "script", args: stateArgs },
    { id: "check:change-cascade", kind: "script", args: [...stateArgs, "--skill-root", S] },
    { id: "check:research", kind: "script", args: stateArgs },
    { id: "check:localization-research", kind: "script", args: stateArgs },
    { id: "check:revenue", kind: "script", args: stateArgs },
    { id: "check:price-derivation", kind: "script", args: stateArgs },
    { id: "check:email", kind: "script", args: stateArgs },
    { id: "check:analytics-catalog", kind: "script", args: stateArgs },
    { id: "check:post-launch", kind: "script", args: stateArgs },
    { id: "check:portfolio-registry", kind: "script", args: rootArgs },
    { id: "check:backend-contract", kind: "script", args: stateArgs },
    {
      id: "render:design-room",
      kind: "script",
      args: [...rootArgs, "--out", "/tmp/b2c-design/design-room.html", "--static-only"],
    },
  ];

  return layout === "repo" ? steps : steps.filter((step) => !step.repoOnly);
}
