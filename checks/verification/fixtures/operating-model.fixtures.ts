import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { applyOperatingEvent, seedOperatingModel } from "../../../kernel/operating-model/events.js";
import { projectOperatingModel, projectionBytes } from "../../../kernel/operating-model/projections.js";
import { emptyOperatingModel, type OperatingModel, type OperatingRecord, type ReplayClock } from "../../../kernel/operating-model/types.js";
import { checkOperatingModelMutation, validateOperatingModel, type OperatingIssue } from "../../../kernel/operating-model/validate.js";
import { laneKeys } from "../../../kernel/schema/types.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";

const CLOCK: ReplayClock = { now: "2026-08-22T18:00:00.000Z" };
const tsxBin = resolveTsxBin(skillRoot);
const cliPath = path.join(skillRoot, "kernel/reducer/cli.ts");

function common(id: string): Pick<OperatingRecord, "id" | "revision" | "recordedAt" | "producer" | "epistemic"> {
  return { id, revision: 1, recordedAt: CLOCK.now, producer: "b2c", epistemic: "known" };
}

function source(revision = "src-rev-1") {
  return { uri: "evidence://paywall-funnel", revision, sectionId: "conversion" };
}

function firstLoopRecords(): OperatingRecord[] {
  return [
    { ...common("objective.paid-conversion"), kind: "objective", status: "active", title: "Raise paid conversion", valueLoop: "capture" },
    { ...common("metric.paywall-cvr"), kind: "metric", status: "active", objectiveId: "objective.paid-conversion", name: "Paywall conversion rate" },
    {
      ...common("observation.paywall-weak"),
      kind: "observation",
      status: "recorded",
      metricId: "metric.paywall-cvr",
      observedAt: "2026-08-21T12:00:00.000Z",
      source: source(),
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      value: 0.02,
    },
    {
      ...common("evidence.paywall-weak"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.paywall-weak"],
      source: source(),
      observedAt: "2026-08-21T12:00:00.000Z",
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      supportsBelief: true,
    },
    {
      ...common("gap.paywall-weak"),
      kind: "gap",
      status: "diagnosed",
      objectiveId: "objective.paid-conversion",
      metricId: "metric.paywall-cvr",
      observationId: "observation.paywall-weak",
    },
    {
      ...common("diagnosis.paywall-copy"),
      kind: "diagnosis",
      status: "recorded",
      gapId: "gap.paywall-weak",
      evidenceIds: ["evidence.paywall-weak"],
      sourceRevision: "src-rev-1",
    },
    {
      ...common("option.rewrite-paywall"),
      kind: "option",
      status: "evaluated",
      diagnosisId: "diagnosis.paywall-copy",
      evidenceIds: ["evidence.paywall-weak"],
      sourceRevision: "src-rev-1",
    },
    {
      ...common("decision.rewrite-paywall"),
      kind: "decision",
      status: "authorized",
      optionId: "option.rewrite-paywall",
      evidenceIds: ["evidence.paywall-weak"],
      authorization: "agreement.rev-1",
    },
    {
      ...common("expectation.rewrite-paywall"),
      kind: "expectation",
      status: "pending",
      decisionId: "decision.rewrite-paywall",
      horizonAt: "2026-09-05T00:00:00.000Z",
    },
    {
      ...common("hypothesis.rewrite-paywall"),
      kind: "hypothesis",
      status: "tentative",
      decisionId: "decision.rewrite-paywall",
    },
    {
      ...common("outcome.rewrite-paywall"),
      kind: "outcome",
      status: "recorded",
      expectationId: "expectation.rewrite-paywall",
      observationIds: ["observation.paywall-weak"],
      causalStatus: "unknown",
    },
    {
      ...common("learning.rewrite-paywall"),
      kind: "learning",
      status: "proposed",
      outcomeId: "outcome.rewrite-paywall",
    },
  ];
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runCli(args: string[]): { code: number; output: string } {
  const result = spawnSync(tsxBin, [cliPath, ...args], { cwd: skillRoot, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

let patchCounter = 0;
function buildPatch(ops: Array<Record<string, unknown>>, declaredOutputs: string[][]): Record<string, unknown> {
  patchCounter += 1;
  return {
    schemaVersion: "1.0.0",
    patchId: `operating-patch-${patchCounter}`,
    targetDoc: "business-state",
    reason: "operating-model fixture",
    authoredBy: "session-fixture",
    authoredAt: CLOCK.now,
    preconditions: [],
    ops,
    declaredOutputs,
  };
}

function minimalLanes(): Record<string, unknown> {
  const lanes: Record<string, unknown> = {};
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return lanes;
}

function bootstrapPatch(): Record<string, unknown> {
  return buildPatch(
    [
      { op: "set", path: ["narrative"], value: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" } },
      {
        op: "set",
        path: ["project"],
        value: {
          name: "App",
          slug: "app",
          owner: "Founder",
          phase: "phase_0_orient",
          launchScope: "essentials",
          kickoffDate: "",
          platforms: ["ios"],
          bundleIds: { ios: "com.example.app", android: "" },
          publicUrls: { landing: "", privacy: "", terms: "" },
        },
      },
      { op: "set", path: ["lanes"], value: minimalLanes() },
      { op: "set", path: ["founderGates"], value: { pending: [] } },
    ],
    [["narrative"], ["project"], ["lanes"], ["founderGates"]],
  );
}

export function register(harness: Harness): void {
  harness.check("operating-model: a valid objective, metric, and sourced observation project identically after restart replay", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    const first = projectionBytes(projectOperatingModel(model, CLOCK));
    const restarted = JSON.parse(JSON.stringify(model)) as OperatingModel;
    const second = projectionBytes(projectOperatingModel(restarted, CLOCK));
    assert(first === second, "restart replay changed the operating projection");
    assert(validateOperatingModel(model).length === 0, `valid loop was rejected: ${JSON.stringify(validateOperatingModel(model))}`);
    assert(Object.keys(projectOperatingModel(model, CLOCK).currentById).length === firstLoopRecords().length, "first loop did not persist every record family");
  });

  harness.check("operating-model: an observation without provenance or with a dangling entity is refused", () => {
    const dangling: OperatingRecord[] = [
      { ...common("objective.paid-conversion"), kind: "objective", status: "active", title: "Raise paid conversion", valueLoop: "capture" },
      {
        ...common("observation.ghost"),
        kind: "observation",
        status: "recorded",
        metricId: "metric.missing",
        observedAt: "2026-08-21T12:00:00.000Z",
        source: source(),
        independenceGroup: "analytics.primary",
        confidence: { lower: 0.4, upper: 0.6 },
        value: 0.02,
      },
    ];
    const danglingIssues = validateOperatingModel({ ...emptyOperatingModel(), records: dangling, events: [] });
    assert(
      danglingIssues.some((item) => item.code === "operating.dangling_reference"),
      `expected dangling_reference, got ${JSON.stringify(danglingIssues)}`,
    );

    const ungrounded: OperatingRecord[] = [
      { ...common("objective.paid-conversion"), kind: "objective", status: "active", title: "Raise paid conversion", valueLoop: "capture" },
      { ...common("metric.paywall-cvr"), kind: "metric", status: "active", objectiveId: "objective.paid-conversion", name: "Paywall conversion rate" },
      {
        ...common("observation.ungrounded"),
        kind: "observation",
        status: "recorded",
        metricId: "metric.paywall-cvr",
        observedAt: "",
        source: { uri: "", revision: "" },
        independenceGroup: "",
        confidence: { lower: Number.NaN, upper: Number.NaN },
        value: 0.02,
      },
    ];
    const provenanceIssues = validateOperatingModel({ ...emptyOperatingModel(), records: ungrounded, events: [] });
    assert(
      provenanceIssues.some((item) => item.code === "operating.missing_provenance"),
      `expected missing_provenance, got ${JSON.stringify(provenanceIssues)}`,
    );
  });

  harness.check("operating-model: a diagnosis without evidenceIds is refused instead of throwing", () => {
    const records = firstLoopRecords();
    const diagnosis = records.find((record) => record.kind === "diagnosis");
    if (!diagnosis || diagnosis.kind !== "diagnosis") throw new Error("fixture diagnosis missing");
    const broken = { ...diagnosis } as OperatingRecord & { evidenceIds?: string[] };
    delete broken.evidenceIds;
    records[records.indexOf(diagnosis)] = broken as OperatingRecord;
    let threw = false;
    let issues: OperatingIssue[] = [];
    try {
      issues = validateOperatingModel({ ...emptyOperatingModel(), records, events: [] });
    } catch {
      threw = true;
    }
    assert(!threw, "missing kind-specific arrays must not throw");
    assert(
      issues.some((item) => item.code === "operating.invalid_record" && item.message.includes("evidenceIds")),
      `expected invalid_record for missing evidenceIds, got ${JSON.stringify(issues)}`,
    );
  });

  harness.check("operating-model: a reference to the wrong record kind is refused", () => {
    const records = firstLoopRecords();
    const decision = records.find((record) => record.kind === "decision");
    if (!decision || decision.kind !== "decision") throw new Error("fixture decision missing");
    decision.optionId = "objective.paid-conversion";
    const issues = validateOperatingModel({ ...emptyOperatingModel(), records, events: [] });
    assert(
      issues.some((item) => item.code === "operating.invalid_record" && item.message.includes("optionId")),
      `expected kind mismatch on optionId, got ${JSON.stringify(issues)}`,
    );
  });

  harness.check("operating-model: independent evidence groups affect confidence while duplicate copies do not", () => {
    const records = firstLoopRecords();
    const extraA: OperatingRecord = {
      ...common("evidence.paywall-weak-copy"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.paywall-weak"],
      source: source(),
      observedAt: "2026-08-21T12:00:00.000Z",
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      supportsBelief: true,
    };
    const extraB: OperatingRecord = {
      ...common("evidence.paywall-weak-review"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.paywall-weak"],
      source: { uri: "evidence://human-review", revision: "review-1" },
      observedAt: "2026-08-21T15:00:00.000Z",
      independenceGroup: "review.independent",
      confidence: { lower: 0.5, upper: 0.7 },
      supportsBelief: true,
    };
    const diagnosis = records.find((record) => record.id === "diagnosis.paywall-copy");
    if (!diagnosis || diagnosis.kind !== "diagnosis") {
      throw new Error("fixture diagnosis missing");
    }
    diagnosis.evidenceIds = ["evidence.paywall-weak", "evidence.paywall-weak-copy", "evidence.paywall-weak-review"];
    const evidenceIndex = records.findIndex((record) => record.id === "evidence.paywall-weak");
    records.splice(evidenceIndex + 1, 0, extraA, extraB);
    const model = seedOperatingModel(records, CLOCK, "b2c");
    const support = projectOperatingModel(model, CLOCK).beliefSupport["diagnosis.paywall-copy"];
    assert(support !== undefined, "diagnosis belief support missing");
    assert(support.independentGroupCount === 2, `expected 2 independent groups, got ${support.independentGroupCount}`);
    assert(support.duplicateCopiesIgnored === 1, `expected 1 duplicate ignored, got ${support.duplicateCopiesIgnored}`);
  });

  harness.check("operating-model: a source revision marks dependent diagnoses and options stale without rewriting history", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    const beforeDiagnosis = model.records.find((record) => record.id === "diagnosis.paywall-copy");
    const next = applyOperatingEvent(
      model,
      {
        id: "event.source-revised",
        type: "source_revised",
        recordedAt: CLOCK.now,
        producer: "b2c",
        payload: { uri: "evidence://paywall-funnel", previousRevision: "src-rev-1", nextRevision: "src-rev-2" },
      },
      CLOCK,
    );
    const afterDiagnosis = next.records.find((record) => record.id === "diagnosis.paywall-copy");
    assert(JSON.stringify(beforeDiagnosis) === JSON.stringify(afterDiagnosis), "source revision rewrote diagnosis history");
    const projection = projectOperatingModel(next, CLOCK);
    assert(projection.staleIds.includes("diagnosis.paywall-copy"), "diagnosis was not marked stale");
    assert(projection.staleIds.includes("option.rewrite-paywall"), "option was not marked stale");
    assert(afterDiagnosis?.epistemic === "known", "stored diagnosis epistemic was rewritten");
  });

  harness.check("operating-model: observation events require a real observation target", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    const issues = validateOperatingModel({
      ...model,
      events: [
        ...model.events,
        {
          id: "event.observation-accepted.missing",
          type: "observation_accepted",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: { observationId: "observation.missing" },
        },
      ],
    });
    assert(
      issues.some((item) => item.code === "operating.invalid_event" && item.message.includes("observation")),
      `expected invalid_event for a missing observation target, got ${JSON.stringify(issues)}`,
    );
    let threw = false;
    try {
      applyOperatingEvent(
        model,
        {
          id: "event.observation-accepted.gap",
          type: "observation_accepted",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: { observationId: "gap.paywall-weak" },
        },
        CLOCK,
      );
    } catch {
      threw = true;
    }
    assert(threw, "observation events that target a non-observation must be rejected");
  });

  harness.check("operating-model: evidence request events accept complete requests and reject incomplete payloads", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    const next = applyOperatingEvent(
      model,
      {
        id: "event.evidence-request.complete",
        type: "evidence_requested",
        recordedAt: CLOCK.now,
        producer: "b2c",
        payload: {
          request: {
            id: "evidence-request.paywall-follow-up",
            status: "open",
            needed: "Collect the missing paywall conversion observation.",
            recordedAt: CLOCK.now,
          },
        },
      },
      CLOCK,
    );
    assert(
      next.evidenceRequests.some((request) => request.id === "evidence-request.paywall-follow-up"),
      "complete evidence request was not recorded",
    );

    let rejected = false;
    try {
      applyOperatingEvent(
        model,
        {
          id: "event.evidence-request.incomplete",
          type: "evidence_requested",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: { request: { id: "evidence-request.incomplete", status: "open", recordedAt: CLOCK.now } },
        },
        CLOCK,
      );
    } catch {
      rejected = true;
    }
    assert(rejected, "incomplete evidence request payload must be rejected");
  });

  harness.check("operating-model: incomplete source revisions and duplicate ids are refused", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    let sourceRejected = false;
    try {
      applyOperatingEvent(
        model,
        {
          id: "event.source-revised.empty",
          type: "source_revised",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: {},
        },
        CLOCK,
      );
    } catch {
      sourceRejected = true;
    }
    assert(sourceRejected, "source_revised without uri and nextRevision must be rejected");

    const withRequest = applyOperatingEvent(
      model,
      {
        id: "event.evidence-request.complete",
        type: "evidence_requested",
        recordedAt: CLOCK.now,
        producer: "b2c",
        payload: {
          request: {
            id: "evidence-request.paywall-follow-up",
            status: "open",
            needed: "Collect the missing paywall conversion observation.",
            recordedAt: CLOCK.now,
          },
        },
      },
      CLOCK,
    );
    let duplicateRequestRejected = false;
    try {
      applyOperatingEvent(
        withRequest,
        {
          id: "event.evidence-request.duplicate",
          type: "evidence_requested",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: {
            request: {
              id: "evidence-request.paywall-follow-up",
              status: "open",
              needed: "Collect the missing paywall conversion observation.",
              recordedAt: CLOCK.now,
            },
          },
        },
        CLOCK,
      );
    } catch {
      duplicateRequestRejected = true;
    }
    assert(duplicateRequestRejected, "duplicate evidence request id must be rejected");

    const duplicateEventIssues = validateOperatingModel({
      ...model,
      events: [
        ...model.events,
        {
          id: "event.dup",
          type: "source_revised",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: { uri: "evidence://paywall-funnel", nextRevision: "src-rev-2" },
        },
        {
          id: "event.dup",
          type: "source_revised",
          recordedAt: CLOCK.now,
          producer: "b2c",
          payload: { uri: "evidence://paywall-funnel", nextRevision: "src-rev-3" },
        },
      ],
    });
    assert(
      duplicateEventIssues.some((item) => item.code === "operating.duplicate_id"),
      `expected duplicate_id for repeated event ids, got ${JSON.stringify(duplicateEventIssues)}`,
    );
  });

  harness.check("operating-model: revising any supporting evidence source marks the belief stale", () => {
    const records = firstLoopRecords();
    const extra: OperatingRecord = {
      ...common("evidence.paywall-review"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.paywall-weak"],
      source: { uri: "evidence://human-review", revision: "review-1", sectionId: "notes" },
      observedAt: "2026-08-21T15:00:00.000Z",
      independenceGroup: "review.independent",
      confidence: { lower: 0.5, upper: 0.7 },
      supportsBelief: true,
    };
    const evidenceIndex = records.findIndex((record) => record.id === "evidence.paywall-weak");
    records.splice(evidenceIndex + 1, 0, extra);
    const diagnosis = records.find((record) => record.id === "diagnosis.paywall-copy");
    const option = records.find((record) => record.id === "option.rewrite-paywall");
    if (!diagnosis || diagnosis.kind !== "diagnosis" || !option || option.kind !== "option") {
      throw new Error("fixture diagnosis/option missing");
    }
    diagnosis.evidenceIds = ["evidence.paywall-weak", "evidence.paywall-review"];
    option.evidenceIds = ["evidence.paywall-weak", "evidence.paywall-review"];
    const model = seedOperatingModel(records, CLOCK, "b2c");
    const next = applyOperatingEvent(
      model,
      {
        id: "event.source-revised-review",
        type: "source_revised",
        recordedAt: CLOCK.now,
        producer: "b2c",
        payload: { uri: "evidence://human-review", previousRevision: "review-1", nextRevision: "review-2" },
      },
      CLOCK,
    );
    const projection = projectOperatingModel(next, CLOCK);
    assert(projection.staleIds.includes("diagnosis.paywall-copy"), "diagnosis supported by revised later evidence must be stale");
    assert(projection.staleIds.includes("option.rewrite-paywall"), "option supported by revised later evidence must be stale");
  });

  harness.check("operating-model: an out-of-band edit to the operating block is quarantined by the reducer", () => {
    const dir = harness.makeTempDir("operating-oob");
    const file = path.join(dir, "business-state.json");
    const manifest = path.join(dir, "manifest.json");
    const audit = path.join(dir, "audit.jsonl");
    const bootPath = path.join(dir, "boot.json");
    writeJson(bootPath, bootstrapPatch());
    const boot = runCli([
      "commit",
      "--patch",
      bootPath,
      "--file",
      file,
      "--manifest",
      manifest,
      "--audit",
      audit,
      "--session",
      "session-fixture",
      "--now",
      CLOCK.now,
    ]);
    assert(boot.code === 0, `bootstrap failed: ${boot.output}`);

    const model = seedOperatingModel(firstLoopRecords().slice(0, 3), CLOCK, "b2c");
    const patchPath = path.join(dir, "operating.json");
    writeJson(patchPath, buildPatch([{ op: "set", path: ["operatingModel"], value: model }], [["operatingModel"]]));
    const committed = runCli([
      "commit",
      "--patch",
      patchPath,
      "--file",
      file,
      "--manifest",
      manifest,
      "--audit",
      audit,
      "--session",
      "session-fixture",
      "--now",
      CLOCK.now,
    ]);
    assert(committed.code === 0, `operating commit failed: ${committed.output}`);

    const doc = JSON.parse(readFileSync(file, "utf8")) as { operatingModel: OperatingModel };
    const observation = doc.operatingModel.records.find((record) => record.kind === "observation");
    assert(observation !== undefined, "committed observation missing");
    if (observation && observation.kind === "observation") observation.value = 0.99;
    writeJson(file, doc);

    const preflight = runCli(["preflight", "--manifest", manifest]);
    assert(preflight.code === 3, `expected exit 3, got ${preflight.code}: ${preflight.output}`);
    assert(preflight.output.includes("reducer.out_of_band_edit"), `expected reducer.out_of_band_edit, got: ${preflight.output}`);
  });

  harness.check("operating-model: a reducer patch that rewrites an observation in place is refused", () => {
    const dir = harness.makeTempDir("operating-mutate");
    const file = path.join(dir, "business-state.json");
    const manifest = path.join(dir, "manifest.json");
    const audit = path.join(dir, "audit.jsonl");
    const bootPath = path.join(dir, "boot.json");
    writeJson(bootPath, bootstrapPatch());
    const boot = runCli([
      "commit",
      "--patch",
      bootPath,
      "--file",
      file,
      "--manifest",
      manifest,
      "--audit",
      audit,
      "--session",
      "session-fixture",
      "--now",
      CLOCK.now,
    ]);
    assert(boot.code === 0, `bootstrap failed: ${boot.output}`);

    const model = seedOperatingModel(firstLoopRecords().slice(0, 3), CLOCK, "b2c");
    const addPath = path.join(dir, "add.json");
    writeJson(addPath, buildPatch([{ op: "set", path: ["operatingModel"], value: model }], [["operatingModel"]]));
    const added = runCli([
      "commit",
      "--patch",
      addPath,
      "--file",
      file,
      "--manifest",
      manifest,
      "--audit",
      audit,
      "--session",
      "session-fixture",
      "--now",
      CLOCK.now,
    ]);
    assert(added.code === 0, `add failed: ${added.output}`);

    const mutated = JSON.parse(JSON.stringify(model)) as OperatingModel;
    const observation = mutated.records.find((record) => record.kind === "observation");
    if (observation && observation.kind === "observation") observation.value = 0.5;
    const mutatePath = path.join(dir, "mutate.json");
    writeJson(mutatePath, buildPatch([{ op: "set", path: ["operatingModel"], value: mutated }], [["operatingModel"]]));
    const refused = runCli([
      "commit",
      "--patch",
      mutatePath,
      "--file",
      file,
      "--manifest",
      manifest,
      "--audit",
      audit,
      "--session",
      "session-fixture",
      "--now",
      CLOCK.now,
    ]);
    assert(refused.code === 1, `expected exit 1, got ${refused.code}: ${refused.output}`);
    assert(refused.output.includes("operating.observation_mutated"), `expected operating.observation_mutated, got: ${refused.output}`);

    const before = { operatingModel: model };
    const after = { operatingModel: mutated };
    const issues = checkOperatingModelMutation(before, after);
    assert(
      issues.some((item) => item.code === "operating.observation_mutated"),
      `in-process mutation guard missed the rewrite: ${JSON.stringify(issues)}`,
    );
    const removed = checkOperatingModelMutation(before, {});
    assert(
      removed.some((item) => item.code === "operating.observation_mutated"),
      `removing operatingModel must fail closed: ${JSON.stringify(removed)}`,
    );
  });

  harness.check("operating-model: rewriting a committed decision in place is refused", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    const rewritten = JSON.parse(JSON.stringify(model)) as OperatingModel;
    const decision = rewritten.records.find((record) => record.kind === "decision");
    assert(decision !== undefined && decision.kind === "decision", "seed must include a decision");
    decision.status = "revoked";
    const issues = checkOperatingModelMutation({ operatingModel: model }, { operatingModel: rewritten });
    assert(
      issues.some((item) => item.code === "operating.record_mutated"),
      `in-place decision rewrite must fail closed: ${JSON.stringify(issues)}`,
    );
  });

  harness.check("operating-model: removing a committed event is refused", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    assert(model.events.length > 0, "seed must include events");
    const stripped = { ...model, events: model.events.slice(1) };
    const issues = checkOperatingModelMutation({ operatingModel: model }, { operatingModel: stripped });
    assert(
      issues.some((item) => item.code === "operating.event_mutated"),
      `removing a committed event must fail closed: ${JSON.stringify(issues)}`,
    );
  });

  harness.check("operating-model: reordering committed events is refused", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    assert(model.events.length >= 2, "seed must include multiple events");
    const reordered = { ...model, events: [model.events[1]!, model.events[0]!, ...model.events.slice(2)] };
    const issues = checkOperatingModelMutation({ operatingModel: model }, { operatingModel: reordered });
    assert(
      issues.some((item) => item.code === "operating.event_mutated"),
      `reordering committed events must fail closed: ${JSON.stringify(issues)}`,
    );
  });

  harness.check("operating-model: replay with a recorded clock performs no network or provider inference and is byte-stable", () => {
    const model = seedOperatingModel(firstLoopRecords(), CLOCK, "b2c");
    const originalNow = Date.now;
    const originalFetch = globalThis.fetch;
    let nowCalled = false;
    let fetchCalled = false;
    Date.now = () => {
      nowCalled = true;
      return 0;
    };
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("network");
    }) as typeof fetch;
    try {
      const first = projectionBytes(projectOperatingModel(model, CLOCK));
      const second = projectionBytes(projectOperatingModel(model, CLOCK));
      assert(first === second, "recorded-clock replay was not byte-stable");
      assert(!nowCalled, "replay used the live clock");
      assert(!fetchCalled, "replay performed network access");
    } finally {
      Date.now = originalNow;
      globalThis.fetch = originalFetch;
    }
  });
}
