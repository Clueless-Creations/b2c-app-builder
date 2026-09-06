import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { seedRunState } from "../../../kernel/engine/runstate.js";
import { standingFounderAgreement } from "../../../kernel/operating-model/agreements.js";
import { revokeMandate, standingFounderMandate } from "../../../kernel/operating-model/mandates.js";
import {
  operate,
  operateFromAdapter,
  operateFromCli,
  operateFromMcp,
  operateFromSchedule,
  semanticReceipt,
} from "../../../kernel/session/operating-service.js";
import { loadOperateInput, loadOperateInputFromJsonString, validateOperateInputShape } from "../../../kernel/session/operate.js";
import type { OperateInput, OperateReceipt } from "../../../kernel/session/operating-types.js";
import type { DomainAuthorityRecord } from "../../../kernel/schema/domain-authority.js";
import { laneKeys, type BusinessStateV2, type GrantsMap } from "../../../kernel/schema/types.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { GOLDEN_CASES } from "../goldens/routing/v1/corpus.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const CLOCK = "2026-08-22T20:00:00.000Z";
const HORIZON = "2026-09-05T00:00:00.000Z";

function paidConversion() {
  const item = GOLDEN_CASES.find((entry) => entry.id === "paid-conversion-gap");
  assert(item !== undefined, "paid-conversion golden is missing");
  return item;
}

function grants(): GrantsMap {
  return {
    "domain.growth": {
      domainId: "domain.growth",
      level: "run-with-guardrails",
      prerequisites: [],
      grantedAt: CLOCK,
      grantedBy: "founder",
      updatedAt: CLOCK,
    },
  };
}

function businessState(): BusinessStateV2 {
  const lanes = {} as BusinessStateV2["lanes"];
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: CLOCK,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "Operate Fixture",
      slug: "operate-fixture",
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms: ["ios"],
      bundleIds: { ios: "com.example.app", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

function catalog(): CatalogInput {
  return {
    version: "catalog.operate.fixture",
    artifacts: [{ id: "artifact.paywall-copy", path: "growth/paywall.md" }],
    workflows: [
      {
        id: "workflow.fixture.paywall-copy",
        title: "Rewrite paywall",
        domainId: "domain.growth",
        actionClass: "draft",
        instructions: "Rewrite the paywall copy.",
        dependencies: [],
        outputPaths: ["growth/paywall.md"],
        providerIds: [],
        laneIds: ["paid_user_acquisition"],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

export function buildOperateFixture(): OperateInput {
  const golden = paidConversion();
  const agreement = standingFounderAgreement(CLOCK);
  const mandate = standingFounderMandate(agreement, "domain.growth", "draft", CLOCK);
  const plan = compilePlan(catalog(), CLOCK);
  const run = seedRunState(plan, businessState(), {
    ownerSessionId: "session.operate",
    ttlSeconds: 300,
    wallClockCapSeconds: 600,
    now: CLOCK,
    runId: "run.operate-fixture",
  });
  const sections = golden.candidates.flatMap((candidate) => candidate.knowledgeSections);
  return {
    world: {
      businessRevision: "rev.operate.1",
      compositionPin: plan.planId,
      catalog: catalog(),
      candidates: golden.candidates,
      sections,
      liveRevisions: golden.liveRevisions,
      agreement,
      mandate,
      grants: grants(),
      domainId: "domain.growth",
      actionClass: "draft",
      links: {
        decisionId: "decision.rewrite-paywall",
        objectiveId: "objective.paid-conversion",
        metricId: "metric.paywall-cvr",
        expectationId: "expectation.rewrite-paywall",
        decisionStatus: "authorized",
        horizonAt: HORIZON,
      },
      proofPolicy: { kind: "fresh_context", required: true },
      workflowId: "workflow.fixture.paywall-copy",
      run,
    },
    transport: {
      mode: "preview",
      source: "cli",
      clock: CLOCK,
      principalId: "principal.founder-session",
      problem: golden.request.problem,
      kind: golden.request.kind,
      idempotencyKey: "operate.paywall.preview",
      expectedBusinessRevision: "rev.operate.1",
      policyRevision: golden.request.policyRevision,
      recognized: golden.request.recognized,
      requiredFacts: golden.request.requiredFacts,
      availableFacts: golden.request.availableFacts,
      packId: golden.request.packId,
      recallProposedIds: golden.request.recallProposedIds,
      ambiguityBand: golden.request.ambiguityBand,
    },
    gates: { workspaceRegistered: true, readOnlySurface: false, lease: "active" },
  };
}

export function cloneOperateInput(input: OperateInput): OperateInput {
  return JSON.parse(JSON.stringify(input)) as OperateInput;
}

export function register(harness: Harness): void {
  harness.check("operate: preview of a selected route returns context without creating a work order", () => {
    const input = buildOperateFixture();
    const receipt = operate(input);
    assert(receipt.actionStatus === "previewed", "preview must not commit");
    assert(receipt.decision.outcome === "selected", `expected selected, got ${receipt.decision.outcome}`);
    assert(receipt.contextDigest !== undefined && receipt.contextDigest.length === 64, "selected preview must pin a context digest");
    assert(receipt.occurrenceId === undefined, "preview must not mint a work order");
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 0, "preview must not mutate run-state work orders");
  });

  harness.check("operate: commit is idempotent and links the selected occurrence", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.transport.idempotencyKey = "operate.paywall.commit";
    const first = operate(input);
    const second = operate(input);
    assert(first.actionStatus === "committed" && first.created === true, "first commit must create the occurrence");
    assert(second.actionStatus === "committed" && second.created === false, "repeat commit must return the original");
    assert(first.occurrenceId === second.occurrenceId, "idempotent commit must keep the same occurrence id");
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 1, "duplicate commit must not add a store entry");
  });

  harness.check("operate: a reused idempotency key with a different route is refused", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.transport.idempotencyKey = "operate.paywall.conflict";
    const first = operate(input);
    assert(first.actionStatus === "committed", `first commit must land, got ${first.reasonCode}`);
    input.world.links = { ...input.world.links, decisionId: "decision.other-route" };
    const second = operate(input);
    assert(
      second.actionStatus === "refused" && second.reasonCode === "operate.idempotency_conflict",
      `expected idempotency_conflict, got ${second.reasonCode}`,
    );
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 1, "conflict must not add a store entry");
  });

  harness.check("operate: a transport patch, undeclared selector, or authority assertion is refused", () => {
    const base = buildOperateFixture();
    const patch = operate({ ...base, transport: { ...base.transport, patch: { ops: [] } } as OperateInput["transport"] & { patch: unknown } });
    assert(patch.reasonCode === "operate.patch_refused", `patch must be refused, got ${patch.reasonCode}`);
    const selector = operate({
      ...base,
      transport: { ...base.transport, contextSelectors: ["secret"] } as OperateInput["transport"] & { contextSelectors: string[] },
    });
    assert(selector.reasonCode === "operate.undeclared_selector", `selector must be refused, got ${selector.reasonCode}`);
    const authority = operate({ ...base, transport: { ...base.transport, mandateId: "mandate.forged" } as OperateInput["transport"] & { mandateId: string } });
    assert(authority.reasonCode === "operate.authority_assertion_refused", `forged mandate must be refused, got ${authority.reasonCode}`);
  });

  harness.check("operate: a negative ambiguity band is refused", () => {
    const input = buildOperateFixture();
    input.transport.ambiguityBand = -1;
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "negative band must refuse");
    assert(receipt.reasonCode === "operate.invalid_payload", `expected invalid_payload, got ${receipt.reasonCode}`);
  });

  harness.check("operate: a non-numeric ambiguity band is refused", () => {
    const input = buildOperateFixture();
    (input.transport as { ambiguityBand?: unknown }).ambiguityBand = "invalid";
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "string band must refuse");
    assert(receipt.reasonCode === "operate.invalid_payload", `expected invalid_payload, got ${receipt.reasonCode}`);
  });

  harness.check("operate: a malformed requiredFacts list is refused without throwing", () => {
    const input = buildOperateFixture();
    (input.transport as { requiredFacts?: unknown }).requiredFacts = {};
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "malformed requiredFacts must refuse");
    assert(receipt.reasonCode === "operate.invalid_payload", `expected invalid_payload, got ${receipt.reasonCode}`);
  });

  harness.check("operate: a non-string expected business revision is refused", () => {
    const input = buildOperateFixture();
    (input.transport as { expectedBusinessRevision?: unknown }).expectedBusinessRevision = 12;
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "malformed expected revision must refuse");
    assert(receipt.reasonCode === "operate.invalid_payload", `expected invalid_payload, got ${receipt.reasonCode}`);
  });

  harness.check("operate: a non-RFC3339 clock is refused before state mutation", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.transport.clock = "not-a-clock";
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "invalid clock must refuse");
    assert(receipt.reasonCode === "operate.invalid_payload", `expected invalid_payload, got ${receipt.reasonCode}`);
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 0, "invalid clock must not mint a work order");
  });

  harness.check("operate: an empty clock is refused before state mutation", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.transport.clock = "";
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "empty clock must refuse");
    assert(receipt.reasonCode === "operate.invalid_payload", `expected invalid_payload, got ${receipt.reasonCode}`);
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 0, "empty clock must not mint a work order");
  });

  harness.check("operate: adapter commit without a durable run path is refused", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    const receipt = operateFromAdapter(input);
    assert(receipt.actionStatus === "refused", "adapter commit without a run path must refuse");
    assert(receipt.reasonCode === "operate.run_state_missing", `expected run_state_missing, got ${receipt.reasonCode}`);
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 0, "adapter commit must not mint an in-memory work order");
  });

  harness.check("operate: adapter commit ignores a caller-chosen run path and binds through the registry", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    const workspace = harness.makeTempDir("operate-adapter-ws");
    writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(catalog()));
    input.world.runStatePath = path.join(workspace, "evil-run-state.json");
    const stripped = operateFromAdapter(input);
    assert(stripped.actionStatus === "refused", "adapter commit must not trust a caller-chosen run path");
    assert(stripped.reasonCode === "operate.run_state_missing", `expected run_state_missing, got ${stripped.reasonCode}`);
    assert(!existsSync(path.join(workspace, "evil-run-state.json")), "caller-chosen run path must not be written");

    const home = path.join(harness.makeTempDir("operate-adapter-home"), "b2c-home");
    mkdirSync(home, { recursive: true });
    writeFileSync(
      path.join(home, "workspaces.json"),
      `${JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "operate-ws", path: workspace, registeredAt: CLOCK }] }, null, 2)}\n`,
    );
    const previousHome = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      input.transport.idempotencyKey = "operate.paywall.adapter-disk";
      const receipt = operateFromAdapter(input, "operate-ws");
      assert(receipt.actionStatus === "committed", `expected committed, got ${receipt.actionStatus} ${receipt.reasonCode}`);
      assert(existsSync(path.join(workspace, "run", "run-state.json")), "adapter commit must write the registered run-state");
      assert(!existsSync(path.join(workspace, "evil-run-state.json")), "caller-chosen run path must still not be written");
    } finally {
      if (previousHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previousHome;
    }
  });

  harness.check("operate: a revoked decision is refused before minting a work order", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    input.world.links.decisionStatus = "revoked";
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "revoked decision must refuse");
    assert(receipt.reasonCode === "operate.decision_not_authorizing", `expected decision_not_authorizing, got ${receipt.reasonCode}`);
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 0, "revoked decision must not mint a work order");
  });

  harness.check("operate: read-only, unregistered, stale revision, and revoked lease refuse commit", () => {
    const base = cloneOperateInput(buildOperateFixture());
    base.transport.mode = "commit";
    const readOnly = operate({ ...base, gates: { ...base.gates, readOnlySurface: true } });
    assert(readOnly.reasonCode === "operate.read_only", `read-only commit must refuse, got ${readOnly.reasonCode}`);
    const unregistered = operate({ ...base, gates: { ...base.gates, workspaceRegistered: false } });
    assert(unregistered.reasonCode === "operate.unregistered_workspace", `unregistered commit must refuse, got ${unregistered.reasonCode}`);
    const stale = operate({ ...base, transport: { ...base.transport, expectedBusinessRevision: "rev.stale" } });
    assert(stale.reasonCode === "operate.stale_revision", `stale revision must refuse, got ${stale.reasonCode}`);
    const revoked = operate({ ...base, gates: { ...base.gates, lease: "revoked" } });
    assert(revoked.reasonCode === "operate.lease_revoked", `revoked lease must refuse, got ${revoked.reasonCode}`);
  });

  harness.check("operate: credentials with a revoked mandate refuse the effect and keep prior receipts", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    const authorized = operate(input);
    assert(authorized.actionStatus === "committed", "control commit must succeed before revocation");
    input.world.mandate = revokeMandate(input.world.mandate!, CLOCK);
    input.world.credentialsPresent = true;
    input.transport.idempotencyKey = "operate.paywall.revoked";
    const refused = operate(input);
    assert(refused.actionStatus === "refused", "revoked mandate must refuse commit");
    assert(refused.reasonCode === "authority.mandate_revoked", `expected mandate_revoked, got ${refused.reasonCode}`);
    assert(authorized.occurrenceId !== undefined, "prior committed receipt must remain");
    assert(
      input.world.run?.workOrders?.[authorized.occurrenceId]?.snapshots.mandateStatus === "revoked",
      "existing occurrences must refresh their mandate snapshot when the live mandate is revoked",
    );
  });

  harness.check("operate: replay recomputes the stored preview with the recorded clock and no writes", () => {
    const input = buildOperateFixture();
    const preview = operate(input);
    const replayInput = cloneOperateInput(input);
    replayInput.transport.mode = "replay";
    replayInput.transport.recordedReceipt = preview;
    const replayed = operate(replayInput);
    assert(replayed.actionStatus === "replayed", "replay mode must mark the receipt replayed");
    assert(semanticReceipt(replayed) === semanticReceipt(preview), "replay must match the stored semantic receipt");
    assert(Object.keys(replayInput.world.run?.workOrders ?? {}).length === 0, "replay must not write work orders");
  });

  harness.check("operate: replay uses the recorded clock even when the request supplies a later valid clock", () => {
    const input = buildOperateFixture();
    const preview = operate(input);
    const replayInput = cloneOperateInput(input);
    replayInput.transport.mode = "replay";
    replayInput.transport.recordedReceipt = preview;
    replayInput.transport.clock = "2026-08-23T12:00:00.000Z";
    const replayed = operate(replayInput);
    assert(replayed.actionStatus === "replayed", "replay with a later clock must still replay");
    assert(replayed.recordedAt === preview.recordedAt, "replay must recompute against the recorded instant");
    assert(semanticReceipt(replayed) === semanticReceipt(preview), "replay at a later request clock must still match the stored receipt");
  });

  harness.check("operate: replay without a stored receipt is refused", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "replay";
    const receipt = operate(input);
    assert(receipt.actionStatus === "refused", "replay without a stored receipt must refuse");
    assert(receipt.reasonCode === "operate.replay_missing_receipt", `expected replay_missing_receipt, got ${receipt.reasonCode}`);
    assert(Object.keys(input.world.run?.workOrders ?? {}).length === 0, "missing-receipt replay must not write work orders");
  });

  harness.check("operate: CLI, MCP, schedule, and adapter preview wrappers share one semantic receipt", () => {
    const input = buildOperateFixture();
    const receipts = [operateFromCli(input), operateFromMcp(input), operateFromSchedule(input), operateFromAdapter(input)];
    const bytes = receipts.map((receipt) => semanticReceipt(receipt));
    assert(
      bytes.every((item) => item === bytes[0]),
      "all four surfaces must return the same semantic receipt",
    );
    assert(new Set(receipts.map((receipt) => receipt.source)).size === 4, "wrappers must still record their transport source");
  });

  harness.check("operate: the CLI dispatcher prints the same preview receipt the service returns", () => {
    const input = buildOperateFixture();
    const dir = harness.makeTempDir("operate-cli");
    const requestPath = path.join(dir, "request.json");
    writeFileSync(requestPath, `${JSON.stringify(input)}\n`);
    const result = spawnSync(
      resolveTsxBin(skillRoot),
      [path.join(skillRoot, "kernel/session/operate.ts"), "--mode", "preview", "--source", "cli", "--request", requestPath, "--json"],
      {
        cwd: skillRoot,
        encoding: "utf8",
      },
    );
    assert(result.status === 0, `operate CLI must exit 0, got ${result.status}: ${result.stderr}`);
    const receipt = JSON.parse(result.stdout) as OperateReceipt;
    assert(receipt.actionStatus === "previewed" && receipt.source === "cli", "CLI wrapper must preview through the shared service");
    assert(semanticReceipt(receipt) === semanticReceipt(operateFromCli(input)), "CLI stdout must match the in-process CLI wrapper");
  });

  harness.check("operate: preview after failed authority does not invite commit", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.world.mandate = revokeMandate(input.world.mandate!, CLOCK);
    const receipt = operate(input);
    assert(receipt.actionStatus === "previewed", "revoked mandate may still preview");
    assert(receipt.authority.ok === false, "preview must surface the failed authority");
    assert(receipt.followUpTrigger !== "commit_authorized_work", "failed authority must not invite commit");
  });

  harness.check("operate: a refused commit exits 1 and a workspace commit persists inside the registered run path", () => {
    const refusedInput = cloneOperateInput(buildOperateFixture());
    refusedInput.transport.mode = "commit";
    refusedInput.world.mandate = revokeMandate(refusedInput.world.mandate!, CLOCK);
    const scratch = harness.makeTempDir("operate-cli-bind");
    const refusedPath = path.join(scratch, "refused.json");
    writeFileSync(refusedPath, `${JSON.stringify(refusedInput)}\n`);
    const tsx = resolveTsxBin(skillRoot);
    const script = path.join(skillRoot, "kernel/session/operate.ts");
    const refused = spawnSync(tsx, [script, "--mode", "commit", "--request", refusedPath, "--json"], { cwd: skillRoot, encoding: "utf8" });
    assert(refused.status === 1, `refused operate must exit 1, got ${refused.status}: ${refused.stderr}`);

    const workspace = harness.makeTempDir("operate-ws");
    writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(catalog()));
    const home = path.join(harness.makeTempDir("operate-home"), "b2c-home");
    mkdirSync(home, { recursive: true });
    writeFileSync(
      path.join(home, "workspaces.json"),
      `${JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "operate-ws", path: workspace, registeredAt: CLOCK }] }, null, 2)}\n`,
    );
    const commitInput = cloneOperateInput(buildOperateFixture());
    commitInput.transport.mode = "commit";
    commitInput.transport.idempotencyKey = "operate.paywall.disk";
    commitInput.world.runStatePath = path.join(workspace, "evil-run-state.json");
    const commitPath = path.join(scratch, "commit.json");
    writeFileSync(commitPath, `${JSON.stringify(commitInput)}\n`);
    const committed = spawnSync(tsx, [script, "--mode", "commit", "--workspace", "operate-ws", "--request", commitPath, "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
      env: { ...process.env, B2C_APP_BUILDER_HOME: home },
    });
    assert(committed.status === 0, `workspace commit must exit 0, got ${committed.status}: ${committed.stderr}\n${committed.stdout}`);
    const receipt = JSON.parse(committed.stdout) as OperateReceipt;
    assert(receipt.actionStatus === "committed", `expected committed, got ${receipt.actionStatus} ${receipt.reasonCode}`);
    assert(existsSync(path.join(workspace, "run", "run-state.json")), "commit must write the workspace run-state");
    assert(!existsSync(path.join(workspace, "evil-run-state.json")), "request runStatePath must not be written");

    mkdirSync(path.join(workspace, "control"), { recursive: true });
    writeFileSync(
      path.join(workspace, "control", "session.lock"),
      `${JSON.stringify({ ownerSessionId: "other-session", acquiredAt: CLOCK, heartbeatAt: CLOCK, ttlSeconds: 3600, pendingInteractiveRequest: false }, null, 2)}\n`,
    );
    commitInput.transport.idempotencyKey = "operate.paywall.held";
    writeFileSync(commitPath, `${JSON.stringify(commitInput)}\n`);
    const held = spawnSync(tsx, [script, "--mode", "commit", "--workspace", "operate-ws", "--request", commitPath, "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
      env: { ...process.env, B2C_APP_BUILDER_HOME: home },
    });
    assert(held.status === 1, `held lease must exit 1, got ${held.status}`);
    const heldReceipt = JSON.parse(held.stdout) as OperateReceipt;
    assert(heldReceipt.reasonCode === "operate.lease_held", `expected lease_held, got ${heldReceipt.reasonCode}`);
  });

  harness.check("operate: a pack-added domain without composed authority is unknown", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.world.domainId = "domain.food";
    input.world.grants = {
      "domain.food": {
        domainId: "domain.food",
        level: "run-with-guardrails",
        prerequisites: [],
        grantedAt: CLOCK,
        grantedBy: "founder",
        updatedAt: CLOCK,
      },
    };
    input.world.mandate = standingFounderMandate(input.world.agreement, "domain.food", "draft", CLOCK);
    const receipt = operate(input);
    assert(receipt.actionStatus === "previewed", "unknown pack domain may still preview");
    assert(receipt.authority.ok === false, "preview must fail closed without composed authority");
    assert(receipt.authority.reasonCode === "autonomy.unknown_domain", `expected unknown_domain, got ${receipt.authority.reasonCode}`);
  });

  harness.check("operate: composed domain authority lets a pack-added domain authorize", () => {
    const input = cloneOperateInput(buildOperateFixture());
    input.world.domainId = "domain.food";
    input.world.grants = {
      "domain.food": {
        domainId: "domain.food",
        level: "run-with-guardrails",
        prerequisites: [],
        grantedAt: CLOCK,
        grantedBy: "founder",
        updatedAt: CLOCK,
      },
    };
    input.world.mandate = standingFounderMandate(input.world.agreement, "domain.food", "draft", CLOCK);
    const authority: DomainAuthorityRecord = {
      id: "domain.food",
      grantable: true,
      system: false,
      machine: false,
      aliases: [],
      protectedCategories: [],
    };
    input.world.authority = [authority];
    const receipt = operate(input);
    assert(receipt.actionStatus === "previewed", "pack domain preview must still compute");
    assert(receipt.authority.ok === true, `expected authority ok, got ${receipt.authority.reasonCode}: ${receipt.authority.reason}`);
  });

  harness.check("operate: a selected route authorizes its own domain and action class, not the pinned world tuple", () => {
    const input = cloneOperateInput(buildOperateFixture());
    const paywall = input.world.candidates.find((candidate) => candidate.id === "workflow.fixture.paywall-copy");
    assert(paywall !== undefined, "paywall candidate must exist");
    input.world.candidates = [
      ...input.world.candidates,
      {
        ...paywall,
        id: "workflow.fixture.ad-spend",
        score: 0.97,
        applicable: true,
        evidenceSufficient: true,
        authorityOk: true,
        capabilityOk: true,
        guardrailsOk: true,
        resourcesOk: true,
        coversProblem: true,
        domainId: "domain.money",
        actionClass: "spend",
      },
    ];
    const receipt = operate(input);
    assert(receipt.decision.outcome === "selected", `expected selected, got ${receipt.decision.outcome}`);
    assert(receipt.decision.selectedId === "workflow.fixture.ad-spend", `expected ad-spend, got ${receipt.decision.selectedId}`);
    assert(receipt.authority.ok === false, "a spend route must not inherit the pinned growth/draft authority tuple");
  });

  // Wave 2 (#30): a mandate-required/mandate-revoked commit refusal on a directly protected action
  // class (spend/release/destructive) is self-describing — it carries a hard-gated FounderQuestion
  // naming exactly what confirmation to collect before retrying commit. No new gate: authorizeResponsibility
  // already refuses without an explicit, current, correctly-scoped mandate; this only decorates that
  // pre-existing refusal. "mutate" has no DIRECT protected category (only a catalog lookup could supply
  // one, and operate() has none), so its refusal must carry no founderQuestion at all — a documented,
  // known limitation versus the full protectedCategory set, not a bug.
  function protectedRouteRefusal(actionClass: "spend" | "release" | "destructive" | "mutate"): OperateReceipt {
    const input = cloneOperateInput(buildOperateFixture());
    input.transport.mode = "commit";
    const paywall = input.world.candidates.find((candidate) => candidate.id === "workflow.fixture.paywall-copy");
    assert(paywall !== undefined, "paywall candidate must exist");
    input.world.candidates = [
      ...input.world.candidates,
      {
        ...paywall,
        id: `workflow.fixture.${actionClass}-protected`,
        score: 0.97,
        applicable: true,
        evidenceSufficient: true,
        authorityOk: true,
        capabilityOk: true,
        guardrailsOk: true,
        resourcesOk: true,
        coversProblem: true,
        domainId: "domain.money",
        actionClass,
      },
    ];
    input.transport.idempotencyKey = `operate.protected.${actionClass}`;
    return operate(input);
  }

  harness.check("operate: a spend commit refused for a missing mandate carries a hard-gated confirm-spend-cap founderQuestion", () => {
    const receipt = protectedRouteRefusal("spend");
    assert(receipt.actionStatus === "refused", `expected refused, got ${receipt.actionStatus}`);
    assert(receipt.reasonCode === "authority.mandate_required", `expected authority.mandate_required, got ${receipt.reasonCode}`);
    assert(receipt.founderQuestion !== undefined, "expected a founderQuestion on a spend refusal");
    assert(receipt.founderQuestion!.class === "confirm-spend-cap", `expected class confirm-spend-cap, got ${receipt.founderQuestion!.class}`);
    assert(receipt.founderQuestion!.skippable === false && receipt.founderQuestion!.deferrable === false, "expected the spend confirmation to be hard-gated");
  });

  harness.check("operate: a release commit refused for a missing mandate carries a hard-gated confirm-release-publish founderQuestion", () => {
    const receipt = protectedRouteRefusal("release");
    assert(receipt.actionStatus === "refused", `expected refused, got ${receipt.actionStatus}`);
    assert(receipt.founderQuestion !== undefined, "expected a founderQuestion on a release refusal");
    assert(receipt.founderQuestion!.class === "confirm-release-publish", `expected class confirm-release-publish, got ${receipt.founderQuestion!.class}`);
    assert(receipt.founderQuestion!.skippable === false && receipt.founderQuestion!.deferrable === false, "expected the release confirmation to be hard-gated");
  });

  harness.check("operate: a destructive commit refused for a missing mandate carries a hard-gated confirm-go founderQuestion", () => {
    const receipt = protectedRouteRefusal("destructive");
    assert(receipt.actionStatus === "refused", `expected refused, got ${receipt.actionStatus}`);
    assert(receipt.founderQuestion !== undefined, "expected a founderQuestion on a destructive refusal");
    assert(receipt.founderQuestion!.class === "confirm-go", `expected class confirm-go, got ${receipt.founderQuestion!.class}`);
    assert(
      receipt.founderQuestion!.skippable === false && receipt.founderQuestion!.deferrable === false,
      "expected the destructive confirmation to be hard-gated",
    );
  });

  harness.check("operate: a mutate commit refused for a missing mandate carries no founderQuestion (no direct protected category)", () => {
    const receipt = protectedRouteRefusal("mutate");
    assert(receipt.actionStatus === "refused", `expected refused, got ${receipt.actionStatus}`);
    assert(receipt.reasonCode === "authority.mandate_required", `expected authority.mandate_required, got ${receipt.reasonCode}`);
    assert(
      receipt.founderQuestion === undefined,
      `expected no founderQuestion for mutate (only spend/release/destructive are directly protected), got ${JSON.stringify(receipt.founderQuestion)}`,
    );
  });

  // U8 (R16/R17/R18/R19): inline JSON requests via --request-json / MCP requestJson, sharing one
  // deep field-path validator with the --request file form, identical read-only commit gating,
  // and a content-derived (not path-derived) commit idempotency key.

  harness.check("operate U8: loadOperateInput and loadOperateInputFromJsonString share one validator and load identical content", () => {
    const input = buildOperateFixture();
    const dir = harness.makeTempDir("operate-u8-load-parity");
    const requestPath = path.join(dir, "request.json");
    writeFileSync(requestPath, JSON.stringify(input));
    const fromFile = loadOperateInput(requestPath);
    const fromInline = loadOperateInputFromJsonString(JSON.stringify(input));
    assert(JSON.stringify(fromFile) === JSON.stringify(fromInline), "file-based and inline loaders must produce identical OperateInput for identical content");
  });

  harness.check("operate U8: validateOperateInputShape names the failing field path at every nesting depth", () => {
    const input = buildOperateFixture();
    const clone = () => JSON.parse(JSON.stringify(input)) as Record<string, any>;

    assert(validateOperateInputShape(clone()) === undefined, "an untouched fixture must validate cleanly");

    const notAnObject = validateOperateInputShape("not-an-object");
    assert(notAnObject?.path === "$", `expected the root path for a non-object payload, got ${JSON.stringify(notAnObject)}`);

    const missingWorld = clone();
    delete missingWorld.world;
    const worldMissing = validateOperateInputShape(missingWorld);
    assert(worldMissing?.path === "world", `expected world, got ${JSON.stringify(worldMissing)}`);

    const missingWorldField = clone();
    delete missingWorldField.world.businessRevision;
    const worldFieldIssue = validateOperateInputShape(missingWorldField);
    assert(worldFieldIssue?.path === "world.businessRevision", `expected world.businessRevision, got ${JSON.stringify(worldFieldIssue)}`);

    const badCandidates = clone();
    badCandidates.world.candidates = "not-an-array";
    const candidatesIssue = validateOperateInputShape(badCandidates);
    assert(candidatesIssue?.path === "world.candidates", `expected world.candidates, got ${JSON.stringify(candidatesIssue)}`);

    // The illustrative nested case from the U8 packet (e.g. "gates.production"): a required field
    // nested inside world.links, named precisely rather than reported as a flat "world" failure.
    const missingLinksField = clone();
    delete missingLinksField.world.links.decisionId;
    const linksIssue = validateOperateInputShape(missingLinksField);
    assert(linksIssue?.path === "world.links.decisionId", `expected world.links.decisionId, got ${JSON.stringify(linksIssue)}`);

    const missingTransportField = clone();
    delete missingTransportField.transport.idempotencyKey;
    const transportIssue = validateOperateInputShape(missingTransportField);
    assert(transportIssue?.path === "transport.idempotencyKey", `expected transport.idempotencyKey, got ${JSON.stringify(transportIssue)}`);

    const missingGatesField = clone();
    delete missingGatesField.gates.lease;
    const gatesIssue = validateOperateInputShape(missingGatesField);
    assert(gatesIssue?.path === "gates.lease", `expected gates.lease, got ${JSON.stringify(gatesIssue)}`);

    const wrongTypeGatesField = clone();
    wrongTypeGatesField.gates.readOnlySurface = "true";
    const gatesTypeIssue = validateOperateInputShape(wrongTypeGatesField);
    assert(gatesTypeIssue?.path === "gates.readOnlySurface", `expected gates.readOnlySurface, got ${JSON.stringify(gatesTypeIssue)}`);
  });

  harness.check("operate U8: an inline request missing a nested required field is refused identically to the same file-based request", () => {
    const input = buildOperateFixture();
    const broken = JSON.parse(JSON.stringify(input)) as Record<string, any>;
    delete broken.world.links.decisionId;
    const dir = harness.makeTempDir("operate-u8-field-path-parity");
    const requestPath = path.join(dir, "request.json");
    writeFileSync(requestPath, JSON.stringify(broken));
    const tsx = resolveTsxBin(skillRoot);
    const script = path.join(skillRoot, "kernel/session/operate.ts");
    const fileResult = spawnSync(tsx, [script, "--mode", "preview", "--request", requestPath, "--json"], { cwd: skillRoot, encoding: "utf8" });
    const inlineResult = spawnSync(tsx, [script, "--mode", "preview", "--request-json", JSON.stringify(broken), "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert(fileResult.status === 1, `file-based request missing world.links.decisionId must exit 1, got ${fileResult.status}`);
    assert(inlineResult.status === 1, `inline request missing world.links.decisionId must exit 1, got ${inlineResult.status}`);
    const fileError = JSON.parse(fileResult.stderr.trim()) as { reasonCode: string; field?: string };
    const inlineError = JSON.parse(inlineResult.stderr.trim()) as { reasonCode: string; field?: string };
    assert(
      fileError.reasonCode === "operate.invalid_payload" && inlineError.reasonCode === "operate.invalid_payload",
      `both forms must share operate.invalid_payload, got ${fileError.reasonCode} / ${inlineError.reasonCode}`,
    );
    assert(
      fileError.field === "world.links.decisionId" && inlineError.field === "world.links.decisionId",
      `both forms must name world.links.decisionId, got ${JSON.stringify(fileError)} / ${JSON.stringify(inlineError)}`,
    );
  });

  harness.check("operate U8: --request-json inline preview matches the identical --request file-based preview", () => {
    const input = buildOperateFixture();
    const dir = harness.makeTempDir("operate-u8-cli-parity");
    const requestPath = path.join(dir, "request.json");
    writeFileSync(requestPath, JSON.stringify(input));
    const tsx = resolveTsxBin(skillRoot);
    const script = path.join(skillRoot, "kernel/session/operate.ts");
    const fileResult = spawnSync(tsx, [script, "--mode", "preview", "--source", "cli", "--request", requestPath, "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    const inlineResult = spawnSync(tsx, [script, "--mode", "preview", "--source", "cli", "--request-json", JSON.stringify(input), "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert(fileResult.status === 0, `file-based preview must exit 0, got ${fileResult.status}: ${fileResult.stderr}`);
    assert(inlineResult.status === 0, `inline preview must exit 0, got ${inlineResult.status}: ${inlineResult.stderr}`);
    const fileReceipt = JSON.parse(fileResult.stdout) as OperateReceipt;
    const inlineReceipt = JSON.parse(inlineResult.stdout) as OperateReceipt;
    assert(fileReceipt.actionStatus === "previewed" && inlineReceipt.actionStatus === "previewed", "both forms must preview successfully");
    assert(semanticReceipt(fileReceipt) === semanticReceipt(inlineReceipt), "inline and file-based requests must produce the same semantic receipt");
  });

  harness.check("operate U8: --request and --request-json together is a typed conflict naming both fields", () => {
    const input = buildOperateFixture();
    const dir = harness.makeTempDir("operate-u8-cli-conflict");
    const requestPath = path.join(dir, "request.json");
    writeFileSync(requestPath, JSON.stringify(input));
    const tsx = resolveTsxBin(skillRoot);
    const script = path.join(skillRoot, "kernel/session/operate.ts");
    const result = spawnSync(tsx, [script, "--mode", "preview", "--request", requestPath, "--request-json", JSON.stringify(input), "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert(result.status === 1, `conflicting request flags must exit 1, got ${result.status}`);
    const error = JSON.parse(result.stderr.trim()) as { reasonCode: string; fields?: string[] };
    assert(error.reasonCode === "operate.request_conflict", `expected operate.request_conflict, got ${error.reasonCode}`);
    assert(
      Boolean(error.fields?.includes("request")) && Boolean(error.fields?.includes("request-json")),
      `conflict error must name both fields, got ${JSON.stringify(error.fields)}`,
    );
  });

  harness.check("operate U8: neither --request nor --request-json prints usage and exits 1", () => {
    const tsx = resolveTsxBin(skillRoot);
    const script = path.join(skillRoot, "kernel/session/operate.ts");
    const result = spawnSync(tsx, [script, "--mode", "preview", "--json"], { cwd: skillRoot, encoding: "utf8" });
    assert(result.status === 1, `missing both request forms must exit 1, got ${result.status}`);
    assert(result.stderr.includes("--request-json"), `usage must mention --request-json, got: ${result.stderr.slice(0, 300)}`);
  });

  harness.check(
    "operate U8: two commits with identical content — one via --request, two via --request-json — share one content-derived occurrence (R19)",
    () => {
      const workspace = harness.makeTempDir("operate-u8-idempotency-ws");
      writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(catalog()));
      const home = path.join(harness.makeTempDir("operate-u8-idempotency-home"), "b2c-home");
      mkdirSync(home, { recursive: true });
      writeFileSync(
        path.join(home, "workspaces.json"),
        `${JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "operate-u8-idem-ws", path: workspace, registeredAt: CLOCK }] }, null, 2)}\n`,
      );
      const commitInput = cloneOperateInput(buildOperateFixture());
      commitInput.transport.mode = "commit";
      commitInput.transport.idempotencyKey = "operate.u8.inline.idempotency";
      const tsx = resolveTsxBin(skillRoot);
      const script = path.join(skillRoot, "kernel/session/operate.ts");
      const env = { ...process.env, B2C_APP_BUILDER_HOME: home };

      // First commit arrives by file path.
      const dir = harness.makeTempDir("operate-u8-idempotency-request");
      const requestPath = path.join(dir, "request.json");
      writeFileSync(requestPath, JSON.stringify(commitInput));
      const first = spawnSync(tsx, [script, "--mode", "commit", "--workspace", "operate-u8-idem-ws", "--request", requestPath, "--json"], {
        cwd: skillRoot,
        encoding: "utf8",
        env,
      });
      assert(first.status === 0, `file-based commit must exit 0, got ${first.status}: ${first.stderr}\n${first.stdout}`);
      const firstReceipt = JSON.parse(first.stdout) as OperateReceipt;
      assert(firstReceipt.actionStatus === "committed" && firstReceipt.created === true, "the first commit must create the occurrence");

      // Second commit — byte-identical content — arrives inline instead of by path.
      const second = spawnSync(
        tsx,
        [script, "--mode", "commit", "--workspace", "operate-u8-idem-ws", "--request-json", JSON.stringify(commitInput), "--json"],
        { cwd: skillRoot, encoding: "utf8", env },
      );
      assert(second.status === 0, `inline commit must exit 0, got ${second.status}: ${second.stderr}\n${second.stdout}`);
      const secondReceipt = JSON.parse(second.stdout) as OperateReceipt;
      assert(
        secondReceipt.actionStatus === "committed" && secondReceipt.created === false,
        "an inline commit with the same content must reuse the file-based occurrence, not mint a new one",
      );
      assert(
        firstReceipt.occurrenceId === secondReceipt.occurrenceId,
        "a file-based and an inline request with identical content must derive the same occurrence id",
      );

      // Third commit — inline again, same content — proves two identical inline requests share a key too.
      const third = spawnSync(tsx, [script, "--mode", "commit", "--workspace", "operate-u8-idem-ws", "--request-json", JSON.stringify(commitInput), "--json"], {
        cwd: skillRoot,
        encoding: "utf8",
        env,
      });
      assert(third.status === 0, `repeat inline commit must exit 0, got ${third.status}: ${third.stderr}`);
      const thirdReceipt = JSON.parse(third.stdout) as OperateReceipt;
      assert(
        thirdReceipt.actionStatus === "committed" && thirdReceipt.created === false && thirdReceipt.occurrenceId === firstReceipt.occurrenceId,
        "two identical inline commits must share the same occurrence",
      );
      assert(Object.keys(commitInput).length > 0, "sanity: commitInput must not be mutated into an empty object by the spawns");
    },
  );

  harness.check(
    "operate mcp U8: requestJson previews, request+requestJson conflicts, an empty call is refused, and a read-only commit refuses before any workspace write",
    () => {
      const temp = harness.makeTempDir("operate-u8-mcp-inline");
      // The driver below is a standalone ESM module written outside the package tree; Node
      // resolves its bare imports (@modelcontextprotocol/sdk/...) by walking up from its own
      // location, not from cwd, so it needs its own node_modules to find them (mirrors the same
      // fix already applied in checks/verification/fixtures/mcp.fixtures.ts).
      const nodeModules = existsSync(path.join(skillRoot, "node_modules"))
        ? path.join(skillRoot, "node_modules")
        : path.resolve(skillRoot, "../..", "node_modules");
      symlinkSync(nodeModules, path.join(temp, "node_modules"), "junction");
      const workspace = path.join(temp, "workspace");
      mkdirSync(workspace, { recursive: true });
      writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(catalog()));
      const home = path.join(temp, "b2c-home");
      mkdirSync(home, { recursive: true });
      writeFileSync(
        path.join(home, "workspaces.json"),
        JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "operate-u8-mcp-inline-ws", path: workspace, registeredAt: CLOCK }] }),
      );

      const previewInput = buildOperateFixture();
      const commitInput = cloneOperateInput(buildOperateFixture());
      commitInput.transport.mode = "commit";
      commitInput.transport.idempotencyKey = "operate.u8.mcp.readonly-guard";

      const driverPath = path.join(temp, "drive-operate-inline.mts");
      writeFileSync(
        driverPath,
        `
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: ${JSON.stringify(resolveTsxBin(skillRoot))},
  args: [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}],
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(home)} },
  stderr: "pipe",
});
const client = new Client({ name: "operate-u8-inline-fixture", version: "0.0.0" });
try {
  await client.connect(transport);

  const preview = await client.callTool({ name: "b2c_operate", arguments: { workspace: "operate-u8-mcp-inline-ws", mode: "preview", requestJson: ${JSON.stringify(previewInput)} } });
  if (preview.isError) throw new Error("inline preview must not be an error: " + JSON.stringify(preview.content).slice(0, 400));
  const previewText = (preview.content ?? []).map((entry) => entry.text).join("");
  const previewReceipt = JSON.parse(previewText);
  if (previewReceipt.actionStatus !== "previewed") throw new Error("inline preview must return a previewed receipt, got: " + previewText.slice(0, 200));

  const conflict = await client.callTool({ name: "b2c_operate", arguments: { workspace: "operate-u8-mcp-inline-ws", mode: "preview", request: "/tmp/does-not-matter.json", requestJson: ${JSON.stringify(previewInput)} } });
  if (!conflict.isError) throw new Error("request + requestJson together must be refused");
  const conflictBody = JSON.parse((conflict.content ?? []).map((entry) => entry.text).join(""));
  if (conflictBody.reasonCode !== "operate.request_conflict") throw new Error("expected operate.request_conflict, got: " + JSON.stringify(conflictBody));
  if (!conflictBody.fields?.includes("request") || !conflictBody.fields?.includes("requestJson")) throw new Error("conflict must name both fields, got: " + JSON.stringify(conflictBody.fields));

  const neither = await client.callTool({ name: "b2c_operate", arguments: { workspace: "operate-u8-mcp-inline-ws", mode: "preview" } });
  if (!neither.isError) throw new Error("neither request nor requestJson must be refused");
  const neitherBody = JSON.parse((neither.content ?? []).map((entry) => entry.text).join(""));
  if (neitherBody.reasonCode !== "operate.request_required") throw new Error("expected operate.request_required, got: " + JSON.stringify(neitherBody));

  // Default (no B2C_APP_BUILDER_MCP_WRITE) MCP is read-only: a commit must be refused before any
  // parsing of requestJson or any filesystem work (workspace resolution, CLI spawn, lock file).
  const guarded = await client.callTool({ name: "b2c_operate", arguments: { workspace: "operate-u8-mcp-inline-ws", mode: "commit", requestJson: ${JSON.stringify(commitInput)} } });
  if (!guarded.isError) throw new Error("read-only commit must be refused");
  const guardedText = (guarded.content ?? []).map((entry) => entry.text).join("");
  const guardedBody = JSON.parse(guardedText);
  if (guardedBody.reasonCode !== "operate.readonly_forbids_commit") throw new Error("expected operate.readonly_forbids_commit, got: " + guardedText.slice(0, 200));
  if (!guardedBody.reason.includes("Read-only MCP may call b2c_operate in preview or replay only.")) throw new Error("expected the read-only refusal text, got: " + guardedText.slice(0, 200));

  console.log("operate-u8-inline-mcp ok");
} finally {
  await client.close();
}
`,
      );
      const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 60_000 });
      assert(
        result.status === 0 && (result.stdout ?? "").includes("operate-u8-inline-mcp ok"),
        `operate inline MCP driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-600)}\n${(result.stderr ?? "").slice(-600)}`,
      );
      assert(!existsSync(path.join(workspace, "run")), "a refused read-only commit must not create the workspace run directory (no writes, R18)");
      assert(!existsSync(path.join(workspace, "control")), "a refused read-only commit must not create the workspace lock directory (no writes, R18)");
    },
  );
}
