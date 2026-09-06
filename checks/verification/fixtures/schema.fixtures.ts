import { readFileSync } from "node:fs";
import path from "node:path";
import { assert, assertSchemaInvalid, assertSchemaValid, skillRoot, type Harness } from "./_harness.js";
import { grantableDomainIds, laneKeys, statusValues } from "../../../kernel/schema/types.js";

const schemaDir = path.join(skillRoot, "kernel/schema");

const BUSINESS_STATE_SCHEMA = "urn:b2c:core:business-state-schema";
const GRANTS_SCHEMA = "urn:b2c:core:grants-schema";
const WAIVERS_SCHEMA = "urn:b2c:core:waivers-schema";
const BUDGET_LEDGER_SCHEMA = "urn:b2c:core:budget-ledger-schema";
const CONTROL_SCHEMA = "urn:b2c:core:control-schema";
const RUN_STATE_SCHEMA = "urn:b2c:core:run-state-schema";
const CHECKPOINT_SCHEMA = "urn:b2c:core:checkpoint-schema";
const OPERATION_ENVELOPE_SCHEMA = "urn:b2c:core:operation-envelope-schema";

const now = "2026-08-04T12:00:00.000Z";

function validGrant() {
  return {
    domainId: "domain.growth",
    level: "run-with-guardrails",
    prerequisites: [
      { id: "doppler-proof", kind: "doppler_auth", ttlSeconds: 3600, status: "verified", verifiedAt: now, evidencePath: "trust/secrets/SECRETS.md" },
    ],
    grantedAt: now,
    grantedBy: "founder",
    grantedViaUnit: "Growth",
    updatedAt: now,
  };
}

function validGrantsDoc() {
  return { schemaVersion: "1.0.0", updatedAt: now, grants: { "domain.growth": validGrant() } };
}

function validWaiver() {
  return {
    id: "waiver-destructive-prune-stale-branches",
    domainId: "domain.engineering",
    actionClass: "destructive",
    protectedCategory: "destructive",
    scope: { resourcePattern: "resource.git.integration", description: "Delete stale feature branches merged more than 30 days ago." },
    caps: { maxPerAction: 1, maxPerPeriod: 5 },
    budgetPeriod: "weekly",
    expiry: "2026-12-31T00:00:00.000Z",
    undoContract: {
      kind: "mitigation",
      irreversibilityAcknowledgment: "Deleted branches cannot be restored from the remote once pruned.",
      mitigationSteps: ["Tag the branch head before deletion.", "Keep a 30-day local mirror of pruned refs."],
    },
    auditRef: "audit.entry.0001",
    status: "active",
    createdAt: now,
    createdBy: "founder",
  };
}

function validWaiversDoc() {
  return { schemaVersion: "1.0.0", updatedAt: now, waivers: [validWaiver()] };
}

function validLedgerDoc() {
  return {
    schemaVersion: "1.0.0",
    updatedAt: now,
    balances: [{ unit: "Growth", period: "2026-08", currency: "USD", allocated: 500, committed: 120, spent: 80, remaining: 300, updatedAt: now }],
    entries: [
      {
        id: "ledger-entry-0001",
        unit: "Growth",
        domainId: "domain.growth",
        nodeRef: "run.paid-ua-campaign-launch",
        period: "2026-08",
        estimate: { amount: 50, currency: "USD", declaredAt: now },
        actual: null,
        status: "estimated",
        auditRef: "audit.entry.0002",
      },
    ],
  };
}

function validControlDoc() {
  return {
    schemaVersion: "1.0.0",
    updatedAt: now,
    businessSlug: "ocho",
    killSwitch: { engaged: false, engagedAt: "", engagedBy: "", reason: "" },
    grants: {},
    waivers: [],
  };
}

function validRunStateDoc() {
  return {
    schemaVersion: "1.0.0",
    runId: "execution.abc123",
    planId: "plan.abc123",
    planRevision: 1,
    createdAt: now,
    updatedAt: now,
    ownerSessionId: "session-001",
    heartbeatAt: now,
    ttlSeconds: 600,
    wallClockCapSeconds: 1800,
    approvals: {},
    artifactBindings: [],
    nodes: {
      "run.research-competitive-scan": { nodeId: "run.research-competitive-scan", status: "pending", attempts: [] },
    },
  };
}

function validCheckpointDoc() {
  return { schemaVersion: "1.0.0", writtenAt: now, writerSessionId: "session-001", stateHash: "deadbeef", runState: validRunStateDoc() };
}

function validBusinessStateDoc() {
  const lanes: Record<string, unknown> = {};
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: now,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "App Name",
      slug: "app-name",
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

export function register(harness: Harness): void {
  const checkSchema = (schemaId: string, data: unknown) => harness.checkSchema(schemaId, data);

  harness.check("status schema: canonical status count matches types.ts", () => {
    const schema = JSON.parse(readFileSync(path.join(schemaDir, "status.schema.json"), "utf8")) as { $defs: { status: { enum: string[] } } };
    assert(
      schema.$defs.status.enum.length === statusValues.length,
      `status.schema.json declares ${schema.$defs.status.enum.length} values, types.ts declares ${statusValues.length}`,
    );
    for (const value of statusValues) assert(schema.$defs.status.enum.includes(value), `status.schema.json is missing "${value}"`);
  });

  harness.check("grants: valid grant document validates", () => {
    assertSchemaValid(checkSchema(GRANTS_SCHEMA, validGrantsDoc()), "valid grants document");
  });

  harness.check("grants: system domains are not valid grant keys", () => {
    const doc = validGrantsDoc();
    (doc.grants as Record<string, unknown>)["domain.orchestration"] = validGrant();
    assertSchemaInvalid(checkSchema(GRANTS_SCHEMA, doc), "additional", "grant on a system domain");
  });

  harness.check("grants: spend-class prerequisite without a budget ref rejects", () => {
    const doc = validGrantsDoc();
    (doc.grants as Record<string, { prerequisites: unknown[] }>)["domain.growth"]!.prerequisites = [
      { id: "budget-check", kind: "budget_funded", ttlSeconds: 86400, status: "unverified", verifiedAt: "" },
    ];
    assertSchemaInvalid(checkSchema(GRANTS_SCHEMA, doc), "budgetRef", "budget_funded prerequisite missing budgetRef");
  });

  harness.check("waivers: valid waiver document validates", () => {
    assertSchemaValid(checkSchema(WAIVERS_SCHEMA, validWaiversDoc()), "valid waivers document");
  });

  harness.check("waivers: waiver without expiry rejects", () => {
    const doc = validWaiversDoc();
    delete (doc.waivers[0] as Record<string, unknown>).expiry;
    assertSchemaInvalid(checkSchema(WAIVERS_SCHEMA, doc), "expiry", "waiver missing expiry");
  });

  harness.check("waivers: cap without budget period rejects", () => {
    const doc = validWaiversDoc();
    delete (doc.waivers[0] as Record<string, unknown>).budgetPeriod;
    assertSchemaInvalid(checkSchema(WAIVERS_SCHEMA, doc), "budgetPeriod", "waiver with caps but no budgetPeriod");
  });

  harness.check("waivers: destructive waiver without undo or mitigation rejects", () => {
    const doc = validWaiversDoc();
    delete (doc.waivers[0] as Record<string, unknown>).undoContract;
    assertSchemaInvalid(checkSchema(WAIVERS_SCHEMA, doc), "undoContract", "destructive waiver missing undoContract");
  });

  harness.check("waivers: release waiver without undo or mitigation rejects", () => {
    const doc = validWaiversDoc();
    const waiver = doc.waivers[0] as Record<string, unknown>;
    waiver.actionClass = "release";
    waiver.protectedCategory = "release";
    delete waiver.undoContract;
    assertSchemaInvalid(checkSchema(WAIVERS_SCHEMA, doc), "undoContract", "release waiver missing undoContract");
  });

  harness.check("waivers: undo contract accepts the literal-undo variant", () => {
    const doc = validWaiversDoc();
    const waiver = doc.waivers[0] as Record<string, unknown>;
    waiver.undoContract = { kind: "literal_undo", undoAction: "Re-create the branch from the recorded pre-deletion commit SHA." };
    assertSchemaValid(checkSchema(WAIVERS_SCHEMA, doc), "waiver with literal undo contract");
  });

  harness.check("budget ledger: valid ledger document validates", () => {
    assertSchemaValid(checkSchema(BUDGET_LEDGER_SCHEMA, validLedgerDoc()), "valid budget ledger document");
  });

  harness.check("budget ledger: entry without a declared estimate rejects", () => {
    const doc = validLedgerDoc();
    delete (doc.entries[0] as Record<string, unknown>).estimate;
    assertSchemaInvalid(checkSchema(BUDGET_LEDGER_SCHEMA, doc), "estimate", "ledger entry missing declared estimate");
  });

  harness.check("control: valid control document validates", () => {
    assertSchemaValid(checkSchema(CONTROL_SCHEMA, validControlDoc()), "valid control document");
  });

  harness.check("control: control document composes the grants and waivers shapes", () => {
    const doc = validControlDoc();
    (doc.grants as Record<string, unknown>)["domain.growth"] = validGrant();
    (doc as Record<string, unknown>).waivers = [validWaiver()];
    assertSchemaValid(checkSchema(CONTROL_SCHEMA, doc), "control document with embedded grant and waiver");
  });

  harness.check("control: missing kill switch rejects", () => {
    const doc = validControlDoc() as Record<string, unknown>;
    delete doc.killSwitch;
    assertSchemaInvalid(checkSchema(CONTROL_SCHEMA, doc), "killSwitch", "control document missing kill switch");
  });

  harness.check("run state: valid run state document validates", () => {
    assertSchemaValid(checkSchema(RUN_STATE_SCHEMA, validRunStateDoc()), "valid run state document");
  });

  harness.check("run state: orphaned and needs_readback are legal node statuses", () => {
    const doc = validRunStateDoc();
    (doc.nodes as Record<string, { status: string }>)["run.research-competitive-scan"]!.status = "needs_readback";
    assertSchemaValid(checkSchema(RUN_STATE_SCHEMA, doc), "run state node in needs_readback");
  });

  harness.check("run state: attempt without an owner session id rejects", () => {
    const doc = validRunStateDoc();
    (doc.nodes as Record<string, { attempts: unknown[] }>)["run.research-competitive-scan"]!.attempts = [
      {
        id: "run.research-competitive-scan.attempt.1",
        nodeId: "run.research-competitive-scan",
        number: 1,
        status: "running",
        ttlSeconds: 600,
        inputFingerprint: "",
        evidence: [],
        readbackRequired: false,
      },
    ];
    assertSchemaInvalid(checkSchema(RUN_STATE_SCHEMA, doc), "ownerSessionId", "attempt missing ownerSessionId");
  });

  harness.check("run state: work-order occurrences validate and direct sessions need no work order", () => {
    assertSchemaValid(checkSchema(RUN_STATE_SCHEMA, validRunStateDoc()), "direct session without workOrders");
    const doc = validRunStateDoc() as Record<string, unknown>;
    doc.workOrders = {
      "wo.fixture": {
        id: "wo.fixture",
        revision: 1,
        workflowId: "workflow.fixture.paywall-copy",
        decisionId: "decision.rewrite-paywall",
        objectiveId: "objective.paid-conversion",
        metricId: "metric.paywall-cvr",
        mandateId: "mandate.founder.domain.growth.mutate",
        contextSourceIds: ["knowledge/growth/paywall.md#knowledge.paywall.evidence@rev-paywall-1"],
        readinessSnapshot: { capabilityReady: true, recordedAt: now },
        expectationId: "expectation.rewrite-paywall",
        horizonAt: now,
        proofPolicy: { kind: "fresh_context", required: true },
        status: "authorized",
        idempotencyKey: "idem.paywall.1",
        recordedAt: now,
        attemptIds: [],
        transitions: [{ at: now, from: "authorized", to: "authorized", ok: true, reasonCode: "work_order.authorized" }],
        snapshots: { decisionStatus: "authorized", mandateStatus: "active", contextSourceIds: [] },
      },
    };
    (doc.nodes as Record<string, { attempts: unknown[] }>)["run.research-competitive-scan"]!.attempts = [
      {
        id: "run.research-competitive-scan.attempt.1",
        nodeId: "run.research-competitive-scan",
        number: 1,
        status: "running",
        ownerSessionId: "session-001",
        heartbeatAt: now,
        ttlSeconds: 600,
        inputFingerprint: "",
        evidence: [],
        readbackRequired: false,
        workOrderOccurrenceId: "wo.fixture",
      },
    ];
    assertSchemaValid(checkSchema(RUN_STATE_SCHEMA, doc), "run state with work-order occurrence");
  });

  harness.check("checkpoint: valid checkpoint document validates", () => {
    assertSchemaValid(checkSchema(CHECKPOINT_SCHEMA, validCheckpointDoc()), "valid checkpoint document");
  });

  harness.check("checkpoint: missing state hash rejects", () => {
    const doc = validCheckpointDoc() as Record<string, unknown>;
    delete doc.stateHash;
    assertSchemaInvalid(checkSchema(CHECKPOINT_SCHEMA, doc), "stateHash", "checkpoint missing stateHash");
  });

  harness.check("operation envelope: a complete mutating-operation binding validates", () => {
    assertSchemaValid(
      checkSchema(OPERATION_ENVELOPE_SCHEMA, {
        partyId: "party.founder",
        principalId: "principal.founder-session",
        trustAnchor: "agreement.founder-standing.rev-1",
        agreementRevision: "agreement.founder-standing.rev-1",
        mandateId: "mandate.founder.domain.engineering.mutate",
        expectedBusinessRevision: "state.rev-1",
        idempotencyKey: "idem.1",
        recordedAt: now,
        payload: { action: "mutate" },
      }),
      "valid operation envelope",
    );
  });

  harness.check("operation envelope: missing mandate id rejects", () => {
    assertSchemaInvalid(
      checkSchema(OPERATION_ENVELOPE_SCHEMA, {
        partyId: "party.founder",
        principalId: "principal.founder-session",
        trustAnchor: "agreement.founder-standing.rev-1",
        agreementRevision: "agreement.founder-standing.rev-1",
        expectedBusinessRevision: "state.rev-1",
        idempotencyKey: "idem.1",
        recordedAt: now,
        payload: {},
      }),
      "mandateId",
      "operation envelope missing mandateId",
    );
  });

  harness.check("business state: valid state document validates", () => {
    assertSchemaValid(checkSchema(BUSINESS_STATE_SCHEMA, validBusinessStateDoc()), "valid business state document");
  });

  harness.check("business state: a valid repositoryProfile is accepted", () => {
    const doc = validBusinessStateDoc();
    (doc.project as Record<string, unknown>).repositoryProfile = {
      id: "founder-operating",
      revision: "rev-repository-profiles-2026-08-24",
      acceptedAt: now,
    };
    assertSchemaValid(checkSchema(BUSINESS_STATE_SCHEMA, doc), "business state with an accepted repository profile");
  });

  harness.check("business state: an unknown repositoryProfile id is refused", () => {
    const doc = validBusinessStateDoc();
    (doc.project as Record<string, unknown>).repositoryProfile = {
      id: "private-lab",
      revision: "rev-repository-profiles-2026-08-24",
      acceptedAt: now,
    };
    assertSchemaInvalid(checkSchema(BUSINESS_STATE_SCHEMA, doc), "id", "unknown repository profile id");
  });

  harness.check("business state: an observation without provenance is refused", () => {
    const doc = validBusinessStateDoc() as Record<string, unknown>;
    doc.operatingModel = {
      schemaVersion: "1.0.0",
      records: [
        {
          id: "observation.ungrounded",
          kind: "observation",
          revision: 1,
          recordedAt: now,
          producer: "b2c",
          status: "recorded",
          epistemic: "known",
          metricId: "metric.paywall-cvr",
          observedAt: now,
          independenceGroup: "analytics.primary",
          confidence: { lower: 0.4, upper: 0.6 },
          value: 0.02,
        },
      ],
      events: [],
      evidenceRequests: [],
    };
    assertSchemaInvalid(checkSchema(BUSINESS_STATE_SCHEMA, doc), "source", "observation without source coordinates");
  });

  harness.check("business state: unknown lane key rejects", () => {
    const doc = validBusinessStateDoc();
    (doc.lanes as Record<string, unknown>).not_a_real_lane = { status: "pending", evidence: [], blockers: [] };
    assertSchemaInvalid(checkSchema(BUSINESS_STATE_SCHEMA, doc), "additional", "business state with an unknown lane key");
  });

  harness.check("business state: providers region enforces the accessRoute enum", () => {
    const good = validBusinessStateDoc();
    (good as Record<string, unknown>).providers = { higgsfield: { accessRoute: "mcp" } };
    assertSchemaValid(checkSchema(BUSINESS_STATE_SCHEMA, good), "providers entry with a known accessRoute");

    const bad = validBusinessStateDoc();
    (bad as Record<string, unknown>).providers = { higgsfield: { accessRoute: "nonsense" } };
    assertSchemaInvalid(checkSchema(BUSINESS_STATE_SCHEMA, bad), "accessRoute", "providers entry with an unknown accessRoute");

    const missing = validBusinessStateDoc();
    (missing as Record<string, unknown>).providers = { higgsfield: { route: "optional_paid_or_account_tool" } };
    assertSchemaInvalid(checkSchema(BUSINESS_STATE_SCHEMA, missing), "accessRoute", "providers entry missing accessRoute");
  });

  harness.check("grant levels cover exactly review-first, run-with-guardrails, full", () => {
    const schema = JSON.parse(readFileSync(path.join(schemaDir, "grants.schema.json"), "utf8")) as {
      $defs: { grant: { properties: { level: { enum: string[] } } } };
    };
    const levels = schema.$defs.grant.properties.level.enum;
    assert(levels.length === 3, `expected 3 grant levels, found ${levels.length}`);
    for (const level of ["review-first", "run-with-guardrails", "full"]) assert(levels.includes(level), `grants.schema.json is missing level "${level}"`);
  });

  harness.check("grantable domain enum matches the 12 business-unit-mapped domains", () => {
    const schema = JSON.parse(readFileSync(path.join(schemaDir, "grants.schema.json"), "utf8")) as {
      $defs: { baseGrantableDomainId: { enum: string[] }; grant: { properties: { domainId: { pattern?: string } } } };
    };
    const declared = schema.$defs.baseGrantableDomainId.enum;
    assert(
      declared.length === grantableDomainIds.length,
      `grants.schema.json declares ${declared.length} domains, types.ts declares ${grantableDomainIds.length}`,
    );
    for (const id of grantableDomainIds) assert(declared.includes(id), `grants.schema.json is missing domain "${id}"`);
    assert(
      schema.$defs.grant.properties.domainId.pattern === "^domain\\.(?!process$|orchestration$|machine$)[a-z][a-z0-9-]*$",
      "catalog-composed grantable domains must match domain.* rather than a closed kernel enum",
    );
  });
}
