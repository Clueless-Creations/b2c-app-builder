#!/usr/bin/env node
/**
 * check:engine-e2e — the engine's crash-test dummy. Proves, on every audit, that the graph
 * engine can actually be driven end to end against this repository's own reference business:
 *
 *   bootstrap (install-entrypoints -> current state -> reducer adopt -> onboarding answers)
 *   -> a headless session (kernel/session/run.ts) that dispatches real frontier work
 *   -> fresh-context verification accepted by the session's own verifier sweep
 *   -> a resumed second session that picks the run state back up cleanly.
 *
 * Every step runs against a throwaway copy of examples/workspace/business with the
 * fixture executor and fixture verifier, so the check is deterministic and needs no worker CLI.
 *
 * Why this exists (2026-08-19 audit): the engine was real, tested code with ZERO real callers —
 * nothing in the documented flow produced the state/control documents run.ts requires, run.ts
 * never invoked verification acceptance so fresh-context nodes dead-ended after producing work,
 * and the fresh-business plan had no root nodes at all. Each of those was invisible to the
 * fixture suites because no check drove the real catalog against the real reference workspace.
 * This one does, and it also proves its own detector: a control session with the verifier
 * deliberately off MUST leave work parked pending verification — if that control stops failing
 * the way it should, the assertion mechanism itself has rotted.
 *
 * Run directly: npm run check:engine-e2e (from the repository root).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { parse, stringify } from "yaml";
import { loadProductInstanceDocument } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
import type { RunStateDocument } from "../../../kernel/schema/types.js";
import { instantiateWorkOrder } from "../../../kernel/work-orders/instantiate.js";
import { validateRunState } from "../../../kernel/schema/index.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tsxBin = resolveTsxBin(skillRoot);
const referenceWorkspace = path.join(skillRoot, "examples", "workspace", "business");

const SESSION_ONE = "engine-e2e-session-1";
const SESSION_TWO = "engine-e2e-session-2";
const CONTROL_SESSION = "engine-e2e-control";

interface CliResult {
  readonly code: number;
  readonly output: string;
}

function runCli(relativePath: string, args: string[]): CliResult {
  const result = spawnSync(tsxBin, [path.join(skillRoot, relativePath), ...args], {
    cwd: skillRoot,
    encoding: "utf8",
    env: { ...process.env, RESEND_API_KEY: "" },
    // Twenty-five minutes per CLI call, inside the thirty-minute per-gate budget run-audit.ts
    // grants this check. Fifteen minutes was a verdict on the runner, not the engine: the whole
    // check finishes in 595 s on a fast GitHub-hosted runner and in 213 s on a laptop, but on a
    // slow two-core runner session 1 alone ran past 900 s twice on 2026-09-02 and was killed,
    // which failed all nine downstream checks for a timeout.
    timeout: 1_500_000,
  });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

const failures: string[] = [];
interface FailureRecord {
  readonly label: string;
  readonly detail?: string;
}
const failureRecords: FailureRecord[] = [];
function check(condition: boolean, label: string, detail?: string): void {
  if (condition) return;
  failures.push(detail ? `${label} — ${detail}` : label);
  failureRecords.push({ label, detail });
  console.error(`FAIL ${label}${detail ? `\n     ${detail}` : ""}`);
}

/** D1 (#32): this check predates reportAndExit's {severity, rule, message} shape and has no
 * per-assertion code table of its own, so --json derives a stable rule slug from each
 * assertion's label rather than inventing one. */
function ruleSlug(label: string): string {
  return `engine_e2e.${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function loadRun(workspace: string): RunStateDocument {
  return JSON.parse(readFileSync(path.join(workspace, "run", "run-state.json"), "utf8")) as RunStateDocument;
}

function pendingVerification(run: RunStateDocument): string[] {
  return Object.values(run.nodes)
    .filter((node) => node.status === "blocked" && node.blocker === "Verification required")
    .map((node) => `${node.nodeId} (attempts: ${node.attempts.length}, last owner: ${node.attempts.at(-1)?.ownerSessionId ?? "none"})`);
}

function pendingVerificationCount(run: RunStateDocument): number {
  return pendingVerification(run).length;
}

function fullGrantAnswers(slug: string): string {
  const units = ["Product", "Design", "Engineering", "Growth", "Analytics", "Revenue", "Store", "Trust", "Operations"];
  return JSON.stringify({
    schemaVersion: "1.0.0",
    businessSlug: slug,
    founderContact: { email: "engine-e2e@example.invalid" },
    units: Object.fromEntries(units.map((unit) => [unit, { level: "full" }])),
  });
}

/**
 * Deliberately unscoped: the journey's early chains cross domains (orchestration reads what
 * engineering produces, product reads what experience produces), so a scoped session stalls on
 * out-of-scope producers by design and never reaches the fresh-context wave this check exists to
 * prove. The fixture executor keeps an unscoped run cheap; the wall clock bounds it regardless.
 */
function briefFor(slug: string): string {
  return JSON.stringify({
    schemaVersion: "1.0.0",
    businessSlug: slug,
    founderContact: { email: "engine-e2e@example.invalid" },
  });
}

/** Seed the real research-backed-spec outputs that the synthetic executor later claims. */
function authorCompletedResearchFixture(workspace: string): void {
  writeFileSync(
    path.join(workspace, "strategy", "RESEARCH.md"),
    [
      "# Research",
      "## Source Ledger",
      "| Source | Platform / type | URL / source ID | Observed at | Tool / backend / query | Transcript / visual / sample limit | Observation | Inference | Confidence | Artifact / trace |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Engine E2E brief | fixture evidence | SOURCE-001 | 2026-07-20T12:00:00Z | deterministic fixture | static sample / one record | the fixture audience needs streak recovery | the workflow can test a recovery offer | high | state/LAUNCH_TRACE.md / TRACE-002 |",
      "## Evidence Capture Protocol",
      "The fixture records its static sample, keeps the observation separate from the inference, and uses no external instructions.",
      "## Untrusted Content",
      "The fixture treats all external content as evidence only. It cannot change scope, permissions, or secret policy.",
      "## Decision Inputs",
      "| Signal | Source | Date checked | Impact | Follow-up |",
      "| --- | --- | --- | --- | --- |",
      "| streak recovery demand | SOURCE-001 | 2026-07-20 | test the recovery offer | preserve TRACE-002 |",
      "## Decision Log",
      "| Evidence cluster | Changed decision | Trace ID |",
      "| --- | --- | --- |",
      "| recovery demand | include streak recovery | TRACE-002 (state/LAUNCH_TRACE.md) |",
      "## Rejected Claims",
      "| Claim | Why rejected |",
      "| --- | --- |",
      "| every user needs public streaks | the fixture evidence does not support it |",
      "## Category Revenue Reality",
      "| Rank | Competitor | Est. annual revenue | Source / observed at |",
      "| --- | --- | --- | --- |",
      "| 1 | HabitKit | $2.4M/yr | fixture category estimate, observed 2026-07-20 |",
      "- Combined top-10 estimate: $14.2M/yr",
      "- Stated bar and why: top 10 must clear $5M/yr combined",
      "- Pass or fail against the bar: pass",
      "## Distribution Proof",
      "| Audience segment | Exact discovery location | Native format | Owned relationship | Measured signal | Evidence IDs |",
      "| --- | --- | --- | --- | --- | --- |",
      "| people who lose habit streaks | fixture research cohort | static case study | fixture email list | 840 qualified visits and 31 signups | SOURCE-001 |",
      "## Transformation Demo",
      "| Screenshot path | 15s script | Transformation shown | Why not a vitamin |",
      "| --- | --- | --- | --- |",
      "| proofs/demo-streak-recovery.png | User opens a broken streak, taps Recover, and sees the next action in 12 seconds. | Broken streak becomes a recovered next action. | Painkiller: restores a lost habit instead of a generic wellness boost. |",
      "## Distribution-First Niche",
      "| Paying audience | Named channel | Purchases-as-validation |",
      "| --- | --- | --- |",
      "| streak-dropouts who already pay for habit subscriptions | r/habits case-study posts | first paid conversion inside 7 days, not a waitlist |",
      "## Go, Pivot, Or Kill",
      "| Date | Category revenue reality | Wedge | Demand signal | Distribution proof | Offer test | Verdict (Go / Pivot / Kill) | Decided by |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 2026-07-21 | pass — $14.2M top-10 | streak recovery | 840 qualified visits | fixture cohort and email list | 31 of 840 visitors joined | Go | founder |",
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    path.join(workspace, "strategy", "SIGNAL_CORPUS.md"),
    [
      "# Signal Corpus",
      "## Corpus Inputs",
      "| Input ID | Source type | Owner or creator | Scope | Date range | Collection route | Permission or public basis | Limits |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| INPUT-001 | fixture brief | founder | streak recovery | 2026-07-01 to 2026-07-20 | deterministic fixture | fixture-authored | one record |",
      "## Signal Records",
      "| Signal ID | Type | Claim or phrase | Source IDs | Observed at | Applies to | Confidence | Status | Supersedes | Artifact or trace |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| SIG-001 | customer language | streak loss stops continued use | INPUT-001 | 2026-07-20 | product promise | high | current | none | strategy/RESEARCH.md / TRACE-002 |",
      "## Conflicts And Supersession",
      "| Earlier signal | Later signal | Conflict | Current position | Reason |",
      "| --- | --- | --- | --- | --- |",
      "| none | none | no material conflict | SIG-001 is current | fixture evidence supports it |",
      "## Derived Outputs",
      "| Signal IDs | Output | Decision changed | Trace ID |",
      "| --- | --- | --- | --- |",
      "| SIG-001 | PRODUCT.md | include streak recovery | TRACE-002 |",
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    path.join(workspace, "strategy", "OFFER_TEST.md"),
    [
      "# Traffic-Backed Offer Test",
      "## Test Contract",
      "| Field | Value |",
      "| --- | --- |",
      "| Audience | people who repeatedly lose habit streaks |",
      "| Exact discovery location | fixture research cohort |",
      "| Native format | static case study |",
      "| Offer | join the streak-recovery test |",
      "| Owned relationship | fixture email list |",
      "| Primary response | email signup |",
      "| Stop rule | 1,000 qualified visits |",
      "## Exposure And Conversion",
      "| Date | Channel | Evidence source | Exposure type | Exposure | CTA conversions | Conversion rate | Cost | Result |",
      "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
      "| 2026-07-20 | fixture cohort | TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "## Objections And Learning",
      "| Source | Objection or behavior | Interpretation | Change made | Signal IDs |",
      "| --- | --- | --- | --- | --- |",
      "| fixture brief | punitive streak loss stops use | recovery is the wedge | add streak recovery | SIG-001 |",
      "## Decision",
      "| Status | Date | Evidence | Decision | Decided by |",
      "| --- | --- | --- | --- | --- |",
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "## Founder Waiver",
      "| Date | Founder | Reason | Residual risk accepted |",
      "| --- | --- | --- | --- |",
    ].join("\n"),
    "utf8",
  );
}

/**
 * Seed the onboarding evidence packets the synthetic executor claims but never writes.
 *
 * Same reason authorCompletedResearchFixture exists above. The fixture executor returns declared
 * artifact IDs and fingerprints without touching the filesystem — deliberately, because that
 * fingerprint stability is what stops a re-run from re-invalidating the whole graph — while every
 * ONB-00..ONB-21 node gates on check:onboarding-evidence-onb-NN actually reading the packet the
 * executor just claimed. That gate exists precisely to refuse an executor that returns an
 * artifact ID for a document it never wrote (see the catalog comment on onb-00-resume-scope), so
 * it is working as designed here, and it belongs on those nodes. The fixture therefore supplies
 * the documents; teaching the shared executor to fabricate validator-shaped content instead would
 * blunt the gate everywhere it matters to buy one check a green run.
 *
 * The packet list comes from the compiled catalog rather than a table kept here, so a renamed,
 * added, or removed ONB node cannot silently stop being seeded.
 *
 * ONB-22 (workflow.experience.onboarding-conversion) is deliberately NOT seeded. Its gates verify
 * claimed deletions against real filesystem state, a re-rendered page, and live provider proof —
 * state no synthetic executor can honestly stand in for. The session wall clock stops this journey
 * well before ONB-22 becomes dispatchable. If that ever changes, this check must fail loudly
 * rather than be taught to fabricate a cutover that never happened.
 */
function authorOnboardingEvidenceFixture(workspace: string): void {
  const catalog = JSON.parse(readFileSync(path.join(skillRoot, "catalog", "generated", "catalog.json"), "utf8")) as {
    workflows: ReadonlyArray<{ id: string; title: string; outputPaths?: readonly string[] }>;
  };
  const packetNodes = catalog.workflows.filter((workflow) => workflow.id.startsWith("workflow.experience.onboarding-system."));
  if (packetNodes.length === 0) throw new Error("engine-e2e fixture found no onboarding graph nodes in the compiled catalog");

  for (const workflow of packetNodes) {
    const relativePath = (workflow.outputPaths ?? []).find((candidate) => candidate.startsWith("product/onboarding/graph/"));
    if (!relativePath) throw new Error(`engine-e2e fixture cannot seed ${workflow.id}: it declares no onboarding graph evidence packet`);
    const target = path.join(workspace, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    const nodeLabel = path.basename(relativePath).split("-").slice(0, 2).join("-");
    // ONB-17's gate additionally requires the Paywall Goal Headline contract by name.
    const paywallContract =
      nodeLabel === "ONB-17"
        ? "The quiz writes paywall_headline_key into onboarding state. The headline templates live in RevenueCat offering metadata, and customVariables bind the selected key when the paywall renders. A skipped goal question renders the fallback headline rather than an invented outcome."
        : "";
    writeFileSync(
      target,
      [
        `# ${nodeLabel} — ${workflow.title}`,
        "",
        "## Execution Mode",
        "",
        "This engine end-to-end fixture runs the onboarding graph in audit-only mode against the reference business. The affected surface is the fixture onboarding route and nothing else. The freshness date is 2026-07-21 and the responsible owner is the fixture founder. This audit records fixture findings and performs no runtime replacement or deletion.",
        "",
        "## Finding",
        "",
        "The fixture audience drops out at the streak-recovery step, where the durable user value is recovering a habit the person already had rather than starting a new one. The evidence is the fixture research cohort recorded in strategy/RESEARCH.md, and every downstream node in this graph reads that same scope classification.",
        paywallContract,
      ]
        .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
        .join("\n"),
      "utf8",
    );
  }
}

/** Answer every pending founder approval on the run — the founder edge, exercised through its own CLI. */
function approveAllPending(workspace: string, name: string): number {
  const list = runCli("kernel/session/approve.ts", ["--workspace", workspace, "--list"]);
  check(list.code === 0, `${name}: approve.ts --list exits 0`, list.output.trim().slice(-200));
  const ids = [...list.output.matchAll(/^PENDING (.+)$/gm)].map((match) => match[1]!.trim());
  for (const id of ids) {
    const result = runCli("kernel/session/approve.ts", [
      "--workspace",
      workspace,
      "--approval",
      id,
      "--decision",
      "approved",
      "--session",
      "engine-e2e-founder",
    ]);
    check(result.code === 0, `${name}: approval ${id} recorded`, result.output.trim().slice(-200));
  }
  return ids.length;
}

function prepareWorkspace(scratch: string, name: string): { workspace: string; brief: string } {
  const workspace = path.join(scratch, name);
  cpSync(referenceWorkspace, workspace, { recursive: true });
  // Copy authored evidence only. Runtime state and its selected catalog are created by initialization.
  rmSync(path.join(workspace, "state", "business-state.json"));
  const productPath = path.join(workspace, "product.yaml");
  const product = parse(readFileSync(productPath, "utf8"));
  product.meta.status = "accepted";
  product.meta.slug = `engine-e2e-${name}`;
  product.meta.name = "Engine E2E Reference";
  writeFileSync(productPath, stringify(product));
  writeFileSync(path.join(workspace, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(productPath)));

  // Once copied out of the packaged starter path this is an active fixture workspace, so the
  // motion contract must contain an authored decision rather than the starter's placeholder.
  // This journey exercises orchestration, not a deployed UI; `none` is therefore the truthful
  // live-effect choice. Keep the replacement exact so starter-template drift fails loudly.
  // Root DESIGN.md is the authored design authority and owns the motion contract; design/ now
  // holds only generated review output and the motion catalog.
  const designContractPath = path.join(workspace, "DESIGN.md");
  const designContract = readFileSync(designContractPath, "utf8");
  const placeholder =
    /^\|\s*Not defined\s*\|\s*Not defined\s*\|\s*R15, R16, R17, R18, or none\s*\|\s*Not defined\s*\|\s*Not defined\s*\|\s*Not defined\s*\|\s*Not defined\s*\|$/m;
  const fixtureDecision =
    "| Engine E2E reference | No deployed live effect; this fixture exercises static business-state orchestration. | none | Semantic content and the final state remain visible. | No autonomous effect starts. | The same final state remains visible without motion. | Static content remains visible without heavy media. |";
  if (!placeholder.test(designContract)) {
    throw new Error("engine-e2e fixture could not author the starter live-surface decision because the placeholder row changed");
  }
  writeFileSync(designContractPath, designContract.replace(placeholder, fixtureDecision), "utf8");
  authorCompletedResearchFixture(workspace);
  authorOnboardingEvidenceFixture(workspace);

  const dryRun = runCli("kernel/session/bootstrap.ts", ["--workspace", workspace]);
  check(dryRun.code === 0, `${name}: bootstrap dry-run exits 0`, dryRun.output.trim().slice(-400));

  const slug = product.meta.slug;
  check(typeof slug === "string" && slug.length > 0, `${name}: accepted product declares a business slug`);

  const answersPath = path.join(scratch, `${name}-answers.json`);
  writeFileSync(answersPath, fullGrantAnswers(slug), "utf8");
  const apply = runCli("kernel/session/bootstrap.ts", ["--workspace", workspace, "--apply", "--answers", answersPath]);
  check(apply.code === 0, `${name}: bootstrap --apply exits 0`, apply.output.trim().slice(-400));
  if (apply.code !== 0) throw new Error("Fixture initialization failed; execution requires an initialized workspace.");
  check(existsSync(path.join(workspace, "state", "business-state.json")), `${name}: bootstrap produced state/business-state.json`);
  check(existsSync(path.join(workspace, "control", "control.json")), `${name}: bootstrap produced control/control.json`);
  check(existsSync(path.join(workspace, "catalog.json")), `${name}: bootstrap installed catalog.json`);
  check(existsSync(path.join(workspace, "control", "manifest.json")), `${name}: adoption recorded a reducer manifest`);

  const again = runCli("kernel/session/bootstrap.ts", ["--workspace", workspace, "--apply"]);
  check(again.code === 0, `${name}: re-running bootstrap is a clean no-op`, again.output.trim().slice(-400));
  check(!again.output.includes("DONE adopt:"), `${name}: re-run adopts nothing a second time`, again.output.trim().slice(-400));

  const briefPath = path.join(scratch, `${name}-brief.json`);
  writeFileSync(briefPath, briefFor(slug), "utf8");
  return { workspace, brief: briefPath };
}

function main(): number {
  // D1 (#32): --json for `b2c check engine-e2e` — this script runs standalone (not through
  // reportAndExit), so the flag is hand-wired here, the same way check-catalog.ts,
  // check-continuity-contract.ts, and render-hosted-bundle.ts each wire their own --json branch.
  const jsonMode = process.argv.includes("--json");
  const scratch = mkdtempSync(path.join(tmpdir(), "b2c-engine-e2e-"));
  try {
    // --- the real path: bootstrap, run, verify, resume ------------------------------------------
    const primary = prepareWorkspace(scratch, "primary");
    const sessionArgs = ["--workspace", primary.workspace, "--brief", primary.brief, "--executor", "fixture", "--wall-clock-seconds", "600"];
    const first = runCli("kernel/session/run.ts", [...sessionArgs, "--session", SESSION_ONE, "--verifier", "fixture"]);
    check(first.code === 0, "session 1 exits 0", first.output.trim().slice(-400));
    check(existsSync(path.join(primary.workspace, "digests", `${SESSION_ONE}.md`)), "session 1 wrote a digest");

    const run = loadRun(primary.workspace);
    const succeededFirst = Object.values(run.nodes).filter((node) => node.status === "succeeded").length;
    check(succeededFirst > 0, "session 1 completed at least one node", `succeeded=${succeededFirst}`);
    const attemptedFirst = Object.values(run.nodes).filter((node) => node.attempts.length > 0).length;
    const scopeParked = Object.values(run.nodes).filter((node) => node.status === "waiting_founder" && (node.blocker ?? "").startsWith("Scope answer needed"));
    check(scopeParked.length > 0, "unanswered scope questions stay parked for the founder", `waiting: ${scopeParked.length}`);

    // The founder edge: a fresh business's second wave sits behind founder-only approvals by
    // design. Grant them all through approve.ts, exactly as a founder (or the platform's
    // approvals mirror) would, then resume.
    const approvedCount = approveAllPending(primary.workspace, "primary");
    check(approvedCount > 0, "session 1 parked founder approvals to grant", `approved=${approvedCount}`);

    // --- control leg: verifier off MUST leave a dead end (the gate proving its own detector).
    // If this stops failing-as-expected, either fresh-context work no longer parks (the
    // verification contract changed) or the assertions below can no longer see parked work —
    // both need eyes, so both fail the check.
    const off = runCli("kernel/session/run.ts", [...sessionArgs, "--session", CONTROL_SESSION, "--verifier", "off"]);
    check(off.code === 0, "control session (verifier off) exits 0", off.output.trim().slice(-400));
    const controlRun = loadRun(primary.workspace);
    check(controlRun.runId === run.runId, "control session resumed the durable run rather than reseeding", `${controlRun.runId} vs ${run.runId}`);
    const parked = pendingVerificationCount(controlRun);
    check(parked > 0, "verifier-off control left fresh-context work parked pending verification (detector works)", `pending: ${parked}`);
    const controlDigest = readFileSync(path.join(primary.workspace, "digests", `${CONTROL_SESSION}.md`), "utf8");
    check(controlDigest.includes("double-checks were turned off"), "control session's digest says out loud that checks were off");

    // --- verified leg: the sweep clears the prior session's backlog and the run advances ---------
    const second = runCli("kernel/session/run.ts", [...sessionArgs, "--session", SESSION_TWO, "--verifier", "fixture"]);
    check(second.code === 0, "verified session resumes and exits 0", second.output.trim().slice(-400));
    const resumed = loadRun(primary.workspace);
    check(resumed.runId === run.runId, "verified session resumed the durable run rather than reseeding", `${resumed.runId} vs ${run.runId}`);
    const succeeded = Object.values(resumed.nodes).filter((node) => node.status === "succeeded").length;
    check(succeeded > 0, "the journey still has completed work at the end", `final succeeded=${succeeded}`);
    // "succeeded" is a moving population mid-journey — a first-time production legitimately
    // re-stales work accepted on top of the file it replaced — so the monotonic progress metric
    // is graph coverage: nodes that have ever been attempted only ever grows.
    const attemptedFinal = Object.values(resumed.nodes).filter((node) => node.attempts.length > 0).length;
    check(
      attemptedFinal > attemptedFirst,
      "the journey advanced past session 1 (more of the graph attempted)",
      `session1=${attemptedFirst} final=${attemptedFinal}`,
    );

    const verifierAccepted = Object.values(resumed.nodes).filter((node) => node.verifiedBySessionId === `${SESSION_TWO}.verifier`);
    check(
      verifierAccepted.length > 0,
      "the session's verifier sweep independently accepted fresh-context work (including the control's backlog)",
      `nodes with verifiedBySessionId=${SESSION_TWO}.verifier: ${verifierAccepted.length}`,
    );
    check(
      pendingVerificationCount(resumed) === 0,
      "no produced work is left dead-ended pending verification",
      `pending: ${pendingVerification(resumed).join("; ") || "none"}\n     session output tail: ${second.output.trim().slice(-600)}`,
    );
    const stillUnanswered = Object.values(resumed.nodes).filter(
      (node) => node.status === "waiting_founder" && (node.blocker ?? "").startsWith("Scope answer needed"),
    );
    check(
      stillUnanswered.length === scopeParked.length,
      "unanswered scope questions never rode staleness into dispatch",
      `before: ${scopeParked.length} after: ${stillUnanswered.length}`,
    );

    const audit = readFileSync(path.join(primary.workspace, "control", "audit.jsonl"), "utf8");
    check(audit.includes("verification_accepted"), "verification acceptance is attested in the audit log");
    check(audit.includes("founder_approval_granted"), "founder approvals are attested in the audit log");

    const woRun = JSON.parse(JSON.stringify(resumed)) as RunStateDocument;
    const firstOrder = instantiateWorkOrder(woRun, {
      workflowId: "workflow.research.competitive-scan",
      decisionId: "decision.e2e",
      objectiveId: "objective.e2e",
      metricId: "metric.e2e",
      mandateId: "mandate.e2e",
      mandateStatus: "active",
      decisionStatus: "authorized",
      contextSourceIds: ["knowledge/research/fixture.md#section@rev"],
      readinessSnapshot: { capabilityReady: true, recordedAt: resumed.updatedAt },
      expectationId: "expectation.e2e",
      horizonAt: resumed.updatedAt,
      proofPolicy: { kind: "fresh_context", required: true },
      idempotencyKey: "e2e.work-order.1",
      recordedAt: resumed.updatedAt,
    });
    const secondOrder = instantiateWorkOrder(woRun, {
      workflowId: firstOrder.occurrence.workflowId,
      decisionId: firstOrder.occurrence.decisionId,
      objectiveId: firstOrder.occurrence.objectiveId,
      metricId: firstOrder.occurrence.metricId,
      mandateId: firstOrder.occurrence.mandateId,
      mandateStatus: "active",
      decisionStatus: "authorized",
      contextSourceIds: firstOrder.occurrence.contextSourceIds,
      readinessSnapshot: firstOrder.occurrence.readinessSnapshot,
      expectationId: firstOrder.occurrence.expectationId,
      horizonAt: firstOrder.occurrence.horizonAt,
      proofPolicy: firstOrder.occurrence.proofPolicy,
      idempotencyKey: "e2e.work-order.2",
      recordedAt: resumed.updatedAt,
    });
    const repeat = instantiateWorkOrder(woRun, {
      workflowId: firstOrder.occurrence.workflowId,
      decisionId: firstOrder.occurrence.decisionId,
      objectiveId: firstOrder.occurrence.objectiveId,
      metricId: firstOrder.occurrence.metricId,
      mandateId: firstOrder.occurrence.mandateId,
      mandateStatus: "active",
      decisionStatus: "authorized",
      contextSourceIds: firstOrder.occurrence.contextSourceIds,
      readinessSnapshot: firstOrder.occurrence.readinessSnapshot,
      expectationId: firstOrder.occurrence.expectationId,
      horizonAt: firstOrder.occurrence.horizonAt,
      proofPolicy: firstOrder.occurrence.proofPolicy,
      idempotencyKey: "e2e.work-order.1",
      recordedAt: resumed.updatedAt,
    });
    check(firstOrder.occurrence.id !== secondOrder.occurrence.id, "e2e: two work orders from one workflow stay independent");
    check(repeat.created === false && repeat.occurrence.id === firstOrder.occurrence.id, "e2e: repeating an idempotent work-order commit returns the original");
    const woSchema = validateRunState(woRun);
    check(woSchema.valid, "e2e: a run with work-order occurrences still schema-validates", woSchema.issues.map((issue) => issue.message).join("; "));

    const list = runCli("kernel/session/verify.ts", ["--workspace", primary.workspace, "--list"]);
    check(
      list.code === 0 && list.output.includes("No nodes waiting on verification."),
      "verify.ts --list agrees nothing is waiting",
      list.output.trim().slice(-200),
    );

    // Existing initialization is idempotent: it must preserve the selected pins and durable run.
    const runtimeManifestPath = path.join(primary.workspace, ".b2c-launch", "runtime.json");
    const beforeRuntime = readFileSync(runtimeManifestPath, "utf8");
    const beforeCatalog = readFileSync(path.join(primary.workspace, "catalog.json"), "utf8");
    const refresh = runCli("kernel/session/bootstrap.ts", ["--workspace", primary.workspace, "--apply"]);
    check(refresh.code === 0, "initialized bootstrap remains idempotent mid-run", refresh.output.trim().slice(-300));
    check(readFileSync(runtimeManifestPath, "utf8") === beforeRuntime, "bootstrap preserves the selected runtime pin");
    check(readFileSync(path.join(primary.workspace, "catalog.json"), "utf8") === beforeCatalog, "bootstrap preserves the selected catalog pin");
    check(loadRun(primary.workspace).runId === run.runId, "the durable run survives repeated initialization");

    // --- fresh-business leg (layering plan R5): a business born from `b2c new` — not a copy
    // of the reference workspace — bootstraps and plans. This is the forwarded-repo user's actual
    // first journey; before new.ts existed there was no birthplace to test.
    const freshDir = path.join(scratch, "fresh-born");
    const born = runCli("kernel/session/new.ts", ["fresh-e2e", "--dir", freshDir, "--name", "Fresh E2E", "--idea", "A fresh end-to-end hypothesis"]);
    check(born.code === 0, "b2c new scaffolds a fresh workspace", born.output.trim().slice(-300));
    // `new` creates a planning workspace, not a runtime one: product.yaml is the authored
    // identity, PRODUCT.md is rendered from it, and there is no state file yet. The runtime
    // arrives later, from accepted product.yaml and its exact rendered view.
    const freshProductPath = path.join(freshDir, "PRODUCT.md");
    const freshProduct = readFileSync(freshProductPath, "utf8");
    check(freshProduct.includes('slug: "fresh-e2e"') && freshProduct.includes('name: "Fresh E2E"'), "the fresh workspace carries the founder's slug and name");
    check(freshProduct.includes("status: hypothesis"), "a fresh product direction starts as an unaccepted hypothesis");
    check(!freshProduct.includes("{{"), "the installer leaves no unrendered template placeholders");
    check(existsSync(path.join(freshDir, "DESIGN.md")), "the fresh workspace has the authored design authority");
    check(existsSync(path.join(freshDir, "strategy", "RESEARCH.md")), "the fresh workspace has the evidence root");
    check(existsSync(path.join(freshDir, "AGENTS.md")), "the fresh workspace has repo agent entrypoints");
    check(!existsSync(path.join(freshDir, "dist")), "generated projections are not inherited from the seed");
    check(!existsSync(path.join(freshDir, "state")), "a planning workspace carries no runtime state");

    const bornAgain = runCli("kernel/session/new.ts", ["fresh-e2e", "--dir", freshDir]);
    check(
      bornAgain.code === 1 && bornAgain.output.includes("business.target_occupied"),
      "new refuses an occupied target by name",
      bornAgain.output.trim().slice(-200),
    );

    const freshAnswers = path.join(scratch, "fresh-answers.json");
    writeFileSync(freshAnswers, fullGrantAnswers("fresh-e2e"), "utf8");
    const beforeAcceptance = runCli("kernel/session/bootstrap.ts", ["--workspace", freshDir, "--apply", "--answers", freshAnswers]);
    check(
      beforeAcceptance.code === 1 && beforeAcceptance.output.includes("business.accepted_product_required"),
      "bootstrap refuses to build a runtime for an unaccepted product",
      beforeAcceptance.output.trim().slice(-300),
    );

    const freshYamlPath = path.join(freshDir, "product.yaml");
    const acceptedProduct = parse(readFileSync(freshYamlPath, "utf8"));
    acceptedProduct.meta.status = "accepted";
    writeFileSync(freshYamlPath, stringify(acceptedProduct));
    writeFileSync(freshProductPath, renderProductMarkdown(loadProductInstanceDocument(freshYamlPath)));
    const freshApply = runCli("kernel/session/bootstrap.ts", ["--workspace", freshDir, "--apply", "--answers", freshAnswers]);
    check(freshApply.code === 0, "a new-born workspace bootstraps", freshApply.output.trim().slice(-400));
    check(existsSync(path.join(freshDir, "state", "business-state.json")), "bootstrap initializes reducer-owned v2 state from the accepted product");
    const freshPlan = runCli("kernel/session/plan.ts", ["--workspace", freshDir]);
    check(freshPlan.code === 0, "a new-born workspace plans", freshPlan.output.trim().slice(-300));

    if (failures.length > 0) {
      if (jsonMode) {
        const jsonFailures = failureRecords.map((record) => ({
          severity: "error" as const,
          rule: ruleSlug(record.label),
          message: record.detail ? `${record.label} — ${record.detail}` : record.label,
        }));
        process.stdout.write(`${JSON.stringify({ pass: false, failures: jsonFailures })}\n`);
        return 1;
      }
      console.error(`\ncheck:engine-e2e — ${failures.length} failure(s).`);
      return 1;
    }
    if (jsonMode) {
      process.stdout.write(`${JSON.stringify({ pass: true, failures: [] })}\n`);
      return 0;
    }
    console.log(
      `check:engine-e2e ok — bootstrap, ${succeeded} node(s) completed, ${verifierAccepted.length} fresh-context acceptance(s) after a parked backlog of ${parked}, and the verifier-off control behaved.`,
    );
    return 0;
  } catch (error) {
    check(false, "journey execution completed without an unexpected interruption", error instanceof Error ? error.message : String(error));
    if (jsonMode)
      process.stdout.write(
        `${JSON.stringify({ pass: false, failures: failureRecords.map((record) => ({ severity: "error", rule: ruleSlug(record.label), message: record.detail ? `${record.label} — ${record.detail}` : record.label })) })}\n`,
      );
    return 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

process.exitCode = main();
