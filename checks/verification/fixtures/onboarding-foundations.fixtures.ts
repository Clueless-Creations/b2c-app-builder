import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import {
  attributionTopics,
  designSchema,
  decisionTopics,
  eventRoles,
  identityScenarios,
  runtimeScenarios,
  scenarioAssertions,
  scenarioEventRoles,
  identitySchema,
  measurementSchema,
  researchSchema,
  researchInputPaths,
  traceSchema,
  wiringSchema,
} from "../../../contracts/onboarding/foundations.js";
import {
  fingerprint,
  packetPaths,
  packetContract,
  validateFoundations,
  type FoundationStage,
} from "../../validation/business/experience/onboarding-foundations.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(h: Harness): void {
  const now = new Date("2026-09-06T12:00:00Z");
  const at = "2026-09-06T10:00:00Z";
  const put = (root: string, file: string, body: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), body);
  };
  const json = (root: string, file: string, value: unknown) => put(root, file, JSON.stringify(value, null, 2));
  const packet = (root: string, file: string, value: unknown) =>
    put(
      root,
      file,
      `# Fixture packet\n\nThis is synthetic gate-test evidence, not a live business.\n\n## Foundation contract\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`,
    );
  const seed = () => {
    const root = h.makeTempDir("onboarding-foundations");
    put(root, "research/observed.md", "Synthetic test observation: guests need a recoverable route to the first valuable result.");
    const knowledge = [
      ["reference.experience.onboarding-conversion", "knowledge/experience/onboarding-conversion.md"],
      ["reference.data.analytics-attribution", "knowledge/data/analytics-attribution.md"],
    ].map(([referenceId, file]) => ({
      referenceId: referenceId!,
      ...fingerprint(skillRoot, file!),
      section: readFileSync(path.join(skillRoot, file!), "utf8").split("\n")[0]!.replace(/^# /, ""),
    }));
    researchInputPaths.forEach((file) => put(root, file, "Synthetic upstream research packet. Not a live source review."));
    put(root, packetPaths.firstValue, "Synthetic first-value definition: render a useful result before voluntary sign-in.");
    const research: z.infer<typeof researchSchema> = {
      schemaVersion: 1,
      inputs: researchInputPaths.map((file) => fingerprint(root, file)),
      knowledge,
      observations: [
        {
          id: "obs-1",
          source: "synthetic gate fixture",
          observedAt: at,
          resolution: "resolved",
          evidence: fingerprint(root, "research/observed.md"),
          finding: "The guest needs useful value before creating an account.",
          limitation: "Synthetic evidence, not market or user research.",
        },
      ],
      decisions: decisionTopics.map((topic) => ({
        id: topic,
        topic,
        knowledgeIds: knowledge.map((k) => k.referenceId),
        observationIds: ["obs-1"],
        decision: `The ${topic} decision is explicitly tested against the fixture journey.`,
        appliesTo: "onboarding/first-session",
        verification: "Instrumented fixture and independent review.",
      })),
    };
    packet(root, packetPaths.research, research);
    const identity: z.infer<typeof identitySchema> = {
      schemaVersion: 1,
      research: fingerprint(root, packetPaths.research),
      authMode: "guest_first",
      authReason: "An account is only needed for synchronized history.",
      authOwner: "selected-auth",
      subjectOwner: "app-subject",
      analyticsOwner: "selected-analytics",
      entitlementOwner: "selected-purchases",
      verifiedSessionRule: "Only a verified provider session establishes sign in.",
      credentialStorage: "Platform protected credential store.",
      identityMergeRule: "Merge same verified subject only with permitted consent.",
      dataIsolationRule: "Reset queued state on account switch.",
      transitions: identityScenarios.map((scenario) => ({
        scenario,
        applicable: true,
        reason: "The selected account-enabled fixture supports this transition.",
        from: "prior-synthetic-state",
        to: "next-synthetic-state",
        persistence: "Scoped to the authenticated subject.",
        recovery: "Retain permitted local work and show a recoverable error.",
        verification: "Use the instrumented identity test.",
      })),
    };
    packet(root, packetPaths.identity, identity);
    put(root, "analytics/ANALYTICS.md", "The fixture canonical catalog records the declared events and typed properties.");
    put(root, packetPaths.policy, "Consent is restored before telemetry; product access does not depend on analytics.");
    put(root, packetPaths.screens, "Each screen consumes the canonical identity and analytics contract.");
    put(root, "DESIGN.md", "Guest-first design with deliberate loading, denial and recovery states.");
    put(root, "app/events.ts", "export const firstValue = () => 'first_value_rendered';\n");
    put(root, "app/init.ts", "export const initialize = () => 'consent then identity then analytics';\n");
    put(root, "app/events.schema.json", '{"type":"object","properties":{"eventId":{"type":"string"}}}');
    put(root, "tests/flow.test.ts", "// This source is a synthetic gate fixture; it does not simulate live provider verification.\n");
    const freshRoles = [
      "app_opened",
      "onboarding_started",
      "step_viewed",
      "step_completed",
      "first_value_rendered",
      "first_value_engaged",
      "onboarding_completed",
    ] as const;
    const measurement: z.infer<typeof measurementSchema> = {
      schemaVersion: 1,
      identity: fingerprint(root, packetPaths.identity),
      firstValue: fingerprint(root, packetPaths.firstValue),
      blueprint: fingerprint(root, "analytics/ANALYTICS.md"),
      policy: fingerprint(root, packetPaths.policy),
      schemaPath: "app/events.schema.json",
      initializationPath: "app/init.ts",
      initialization: ["restore_consent", "restore_identity", "configure_collection", "first_event", "first_value"],
      consentRule: "Denied optional analytics never leaves the device.",
      privacyAllowlist: ["event_id", "subject_key", "consent_state"],
      retryPolicy: "Bounded queue with stable event IDs and collector deduplication.",
      events: eventRoles.map((role) => ({
        role,
        name: role,
        applicable: true,
        reason: "Required first-session measurement.",
        emitter: "client",
        trigger: "Observed UI or verified session callback.",
        identity: "opaque synthetic subject",
        consent: "Collection allowed only by the consent policy.",
        deduplication: "stable event_id",
        implementationPath: "app/events.ts",
        testPath: "tests/flow.test.ts",
      })),
      attribution: attributionTopics.map((topic) => ({
        topic,
        source: "permitted first-party context",
        destination: "scoped profile",
        persistence: "immutable first touch, deliberate last touch",
        joinBasis: "verified subject only",
        unknownBehavior: "Keep the source unknown.",
        verification: "Instrumented handoff and denial tests.",
      })),
      experiments: {
        applicable: false,
        reason: "This fixture evaluates no treatment.",
        assignmentOwner: "no-experiment",
        exposureRule: "No assignment is emitted as exposure.",
        primaryMetric: "first_value_engaged",
        guardrails: "Consent and product success cannot regress.",
      },
      scenarios: runtimeScenarios.map((id) => ({
        id,
        applicable: true,
        reason: "Applicable to the account-enabled fixture.",
        expectedRoles: id === "fresh_install" ? [...freshRoles] : [...(scenarioEventRoles[id] ?? ["first_value_rendered"])],
        assertions: [...scenarioAssertions[id]],
        testPath: "tests/flow.test.ts",
      })),
    };
    packet(root, packetPaths.measurement, measurement);
    put(root, "proof/surface.svg", '<svg><text>synthetic fixture</text></svg>');
    packet(root, packetPaths.design, {
      schemaVersion: 1,
      research: fingerprint(root, packetPaths.research),
      identity: fingerprint(root, packetPaths.identity),
      measurement: fingerprint(root, packetPaths.measurement),
      screenContract: fingerprint(root, packetPaths.screens),
      design: fingerprint(root, "DESIGN.md"),
      decisions: research.decisions.map((d) => ({
        decisionId: d.id,
        surface: "first-session",
        implementedBehavior: d.decision,
        evidence: fingerprint(root, "proof/surface.svg"),
      })),
    });
    const runs = measurement.scenarios.map((s) => {
      const trace: z.infer<typeof traceSchema> = {
        schemaVersion: 1,
        scenario: s.id,
        appId: "fixture-app",
        buildId: "fixture-build",
        environment: "fixture-only",
        kind: "instrumented_app",
        subjectKind: "synthetic",
        initialization: measurement.initialization,
        events: s.expectedRoles.map((role, i) => ({
          eventId: `fixture-${s.id}-${i}`,
          name: role,
          role,
          emitter: "client",
          subjectKey: `synthetic-${s.id === "account_switch" ? i : 0}`,
          consent: s.id === "consent_denied" ? "denied" : "allowed",
          destination: s.id === "fresh_install" ? "provider" : "local",
          attribution: "unknown",
          occurredAt: at,
        })),
        assertions: s.assertions.map((id) => ({
          id,
          passed: true,
          observation: "Synthetic positive fixture exercising the validator, not a real execution claim.",
        })),
      };
      json(root, `proof/${s.id}.json`, trace);
      put(root, `proof/${s.id}.log`, "Synthetic execution log fixture. No device or live provider was invoked.");
      if (s.id === "fresh_install") {
        put(root, "proof/collector-export.json", JSON.stringify({ fixtureOnly: true, events: trace.events }));
        json(root, "proof/collector-readback.json", {
          schemaVersion: 1,
          appId: trace.appId,
          buildId: trace.buildId,
          environment: trace.environment,
          observedAt: at,
          rawEvidence: fingerprint(root, "proof/collector-export.json"),
          events: trace.events.map(({ eventId, name, subjectKey }) => ({ eventId, name, subjectKey })),
        });
      }
      return {
        scenario: s.id,
        trace: fingerprint(root, `proof/${s.id}.json`),
        executionEvidence: fingerprint(root, `proof/${s.id}.log`),
        ...(s.id === "fresh_install" ? { providerReadback: fingerprint(root, "proof/collector-readback.json") } : {}),
      };
    });
    const proof: z.infer<typeof wiringSchema> = {
      schemaVersion: 1,
      stage: "runtime",
      capturedAt: at,
      appId: "fixture-app",
      buildId: "fixture-build",
      environment: "fixture-only",
      measurement: fingerprint(root, packetPaths.measurement),
      sources: ["app/events.ts", "app/init.ts", "app/events.schema.json", "tests/flow.test.ts"].map((p) => fingerprint(root, p)),
      runs,
    };
    json(root, "product/onboarding/runtime-evidence.json", proof);
    json(root, "product/onboarding/prototype-evidence.json", {
      ...proof,
      stage: "prototype",
      runs: runs.filter((r) => ["fresh_install", "consent_denied", "unknown_attribution", "analytics_unavailable"].includes(r.scenario)),
    });
    return { root, research, identity, measurement, proof };
  };
  const check = (root: string, stage: FoundationStage = "runtime") => validateFoundations(root, stage, skillRoot, now);
  const reject = (label: string, change: (fixture: ReturnType<typeof seed>) => void, code: string, stage: FoundationStage = "runtime") =>
    h.check(label, () => {
      const f = seed();
      change(f);
      const issues = check(f.root, stage);
      assert(
        issues.some((i) => i.code === `onboarding_foundations.${code}`),
        JSON.stringify(issues),
      );
    });
  const traceChange = (f: ReturnType<typeof seed>, scenario: string, change: (trace: z.infer<typeof traceSchema>) => void) => {
    const file = `proof/${scenario}.json`;
    const trace = JSON.parse(readFileSync(path.join(f.root, file), "utf8"));
    change(trace);
    json(f.root, file, trace);
    f.proof.runs.find((r) => r.scenario === scenario)!.trace = fingerprint(f.root, file);
    json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
  };

  for (const stage of ["research", "identity", "measurement", "prototype", "runtime"] as const)
    h.check(`onboarding foundations: complete synthetic ${stage} fixture passes`, () => {
      const f = seed();
      assert(check(f.root, stage).length === 0, JSON.stringify(check(f.root, stage)));
    });
  reject(
    "onboarding foundations: prose length alone is not research",
    (f) => put(f.root, packetPaths.research, "Generic prose. ".repeat(100)),
    "contract",
    "research",
  );
  reject(
    "onboarding foundations: invented knowledge ID refuses",
    (f) => {
      f.research.knowledge[0]!.referenceId = "reference.invented";
      packet(f.root, packetPaths.research, f.research);
    },
    "knowledge",
    "research",
  );
  reject(
    "onboarding foundations: stale knowledge hash refuses",
    (f) => {
      f.research.knowledge[0]!.sha256 = "0".repeat(64);
      packet(f.root, packetPaths.research, f.research);
    },
    "resource",
    "research",
  );
  reject(
    "onboarding foundations: missing decision-to-observation join refuses",
    (f) => {
      f.research.decisions[0]!.observationIds = ["missing"];
      packet(f.root, packetPaths.research, f.research);
    },
    "decision_join",
    "research",
  );
  reject(
    "onboarding foundations: unresolved research refuses",
    (f) => {
      packet(f.root, packetPaths.research, { ...f.research, observations: [{ ...f.research.observations[0], resolution: "expired" }] });
    },
    "contract",
    "research",
  );
  reject(
    "onboarding foundations: duplicated decision topic refuses",
    (f) => {
      f.research.decisions[0]!.topic = "identity";
      packet(f.root, packetPaths.research, f.research);
    },
    "coverage",
    "research",
  );
  reject(
    "onboarding foundations: missing auth-cancel coverage refuses",
    (f) => {
      f.identity.transitions = f.identity.transitions.filter((t) => t.scenario !== "auth_cancel");
      packet(f.root, packetPaths.identity, f.identity);
    },
    "contract",
    "identity",
  );
  reject(
    "onboarding foundations: account switch cannot be waived in account app",
    (f) => {
      f.identity.transitions.find((t) => t.scenario === "account_switch")!.applicable = false;
      packet(f.root, packetPaths.identity, f.identity);
    },
    "identity_coverage",
    "identity",
  );
  reject(
    "onboarding foundations: analytics configured before consent refuses",
    (f) => {
      f.measurement.initialization = ["configure_collection", "restore_consent", "restore_identity", "first_event", "first_value"];
      packet(f.root, packetPaths.measurement, f.measurement);
    },
    "initialization_order",
    "measurement",
  );
  reject(
    "onboarding foundations: missing early funnel event refuses",
    (f) => {
      f.measurement.scenarios[0]!.expectedRoles = ["first_value_rendered"];
      packet(f.root, packetPaths.measurement, f.measurement);
    },
    "first_session_coverage",
    "measurement",
  );
  reject(
    "onboarding foundations: absent attribution topic refuses",
    (f) => {
      f.measurement.attribution[0]!.topic = "last_touch";
      packet(f.root, packetPaths.measurement, f.measurement);
    },
    "coverage",
    "measurement",
  );
  reject(
    "onboarding foundations: credentials cannot enter analytics allowlist",
    (f) => {
      f.measurement.privacyAllowlist.push("access_token");
      packet(f.root, packetPaths.measurement, f.measurement);
    },
    "privacy",
    "measurement",
  );
  reject(
    "onboarding foundations: auth contract changes invalidate measurement",
    (f) => {
      f.identity.authReason = "Changed account policy";
      packet(f.root, packetPaths.identity, f.identity);
    },
    "resource",
    "measurement",
  );
  reject(
    "onboarding foundations: authentication test cannot omit its failure event",
    (f) => {
      f.measurement.scenarios.find((s) => s.id === "auth_failure")!.expectedRoles = [];
      packet(f.root, packetPaths.measurement, f.measurement);
    },
    "scenario_events",
    "measurement",
  );
  reject(
    "onboarding foundations: denied-consent scenario cannot test allowed consent",
    (f) => traceChange(f, "consent_denied", (t) => t.events.forEach((e) => (e.consent = "allowed"))),
    "consent",
  );
  reject("onboarding foundations: source changes invalidate old traces", (f) => put(f.root, "app/init.ts", "changed initialization"), "resource");
  reject(
    "onboarding foundations: missing scenario refuses",
    (f) => {
      f.proof.runs.pop();
      json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
    },
    "coverage",
  );
  reject(
    "onboarding foundations: no collector readback refuses",
    (f) => {
      delete f.proof.runs[0]!.providerReadback;
      json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
    },
    "provider_delivery",
  );
  reject(
    "onboarding foundations: local-only final events refuse",
    (f) => traceChange(f, "fresh_install", (t) => t.events.forEach((e) => (e.destination = "local"))),
    "provider_delivery",
  );
  reject(
    "onboarding foundations: denied consent cannot emit to provider",
    (f) => traceChange(f, "consent_denied", (t) => (t.events[0]!.destination = "provider")),
    "consent",
  );
  reject(
    "onboarding foundations: guessed attribution refuses",
    (f) => traceChange(f, "unknown_attribution", (t) => (t.events[0]!.attribution = "known")),
    "attribution",
  );
  reject(
    "onboarding foundations: duplicate event IDs refuse",
    (f) => traceChange(f, "fresh_install", (t) => (t.events[1]!.eventId = t.events[0]!.eventId)),
    "coverage",
  );
  reject("onboarding foundations: out-of-order events refuse", (f) => traceChange(f, "fresh_install", (t) => t.events.reverse()), "event_sequence");
  reject(
    "onboarding foundations: wrong event emitter refuses",
    (f) => traceChange(f, "fresh_install", (t) => (t.events[0]!.emitter = "provider")),
    "event_contract",
  );
  reject("onboarding foundations: stale app build refuses", (f) => traceChange(f, "fresh_install", (t) => (t.buildId = "old-build")), "proof_context");
  reject(
    "onboarding foundations: failed identity isolation assertion refuses",
    (f) => traceChange(f, "account_switch", (t) => (t.assertions[0]!.passed = false)),
    "runtime_assertion",
  );
  reject(
    "onboarding foundations: account switch must exercise two subjects",
    (f) => traceChange(f, "account_switch", (t) => t.events.forEach((e) => (e.subjectKey = "same-subject"))),
    "identity_isolation",
  );
  reject(
    "onboarding foundations: auth failure cannot also report success",
    (f) =>
      traceChange(f, "auth_failure", (t) => t.events.push({ ...t.events[0]!, eventId: "unexpected-success", role: "auth_succeeded", name: "auth_succeeded" })),
    "auth_outcome",
  );
  reject(
    "onboarding foundations: analytics outage must preserve first value",
    (f) => traceChange(f, "analytics_unavailable", (t) => (t.events = [])),
    "first_value",
  );
  reject(
    "onboarding foundations: trace cannot replace execution evidence",
    (f) => {
      f.proof.runs[0]!.executionEvidence = f.proof.runs[0]!.trace;
      json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
    },
    "execution_evidence",
  );
  reject(
    "onboarding foundations: traversal rejected",
    (f) => {
      f.research.observations[0]!.evidence.path = "../outside";
      packet(f.root, packetPaths.research, f.research);
    },
    "resource",
    "research",
  );
  reject(
    "onboarding foundations: symlink evidence rejected",
    (f) => {
      symlinkSync(path.join(f.root, "research/observed.md"), path.join(f.root, "research/link.md"));
      f.research.observations[0]!.evidence.path = "research/link.md";
      packet(f.root, packetPaths.research, f.research);
    },
    "resource",
    "research",
  );
  reject(
    "onboarding foundations: changed upstream research invalidates synthesis",
    (f) => put(f.root, researchInputPaths[0], "Changed upstream finding"),
    "resource",
    "research",
  );
  reject(
    "onboarding foundations: changed first value invalidates measurement",
    (f) => put(f.root, packetPaths.firstValue, "Changed activation definition"),
    "resource",
    "measurement",
  );
  reject("onboarding foundations: changed design invalidates prototype", (f) => put(f.root, "DESIGN.md", "Changed design"), "resource", "prototype");
  reject(
    "onboarding foundations: collector for another build refuses",
    (f) => {
      const file = "proof/collector-readback.json";
      const value = JSON.parse(readFileSync(path.join(f.root, file), "utf8"));
      value.buildId = "wrong-build";
      json(f.root, file, value);
      f.proof.runs[0]!.providerReadback = fingerprint(f.root, file);
      json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
    },
    "provider_delivery",
  );
  reject(
    "onboarding foundations: missing event in collector refuses",
    (f) => {
      const file = "proof/collector-readback.json";
      const value = JSON.parse(readFileSync(path.join(f.root, file), "utf8"));
      value.events.pop();
      json(f.root, file, value);
      f.proof.runs[0]!.providerReadback = fingerprint(f.root, file);
      json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
    },
    "provider_delivery",
  );
  h.check("onboarding foundations: pinned package resolves the same knowledge", () => {
    const f = seed();
    const result = validateFoundations(f.root, "runtime", path.join(skillRoot, "catalog/generated/firstparty"), now);
    assert(!result.length, JSON.stringify(result));
  });
  h.check("onboarding foundations: account-free decision has an explicit valid path", () => {
    const f = seed();
    f.identity.authMode = "no_account";
    f.identity.transitions.forEach((t) => {
      if (!["first_open", "reinstall"].includes(t.scenario)) t.applicable = false;
    });
    packet(f.root, packetPaths.identity, f.identity);
    assert(!check(f.root, "identity").length, JSON.stringify(check(f.root, "identity")));
  });
  h.check("onboarding foundations: account-free runtime still proves measurement and consent", () => {
    const f = seed();
    f.identity.authMode = "no_account";
    f.identity.transitions.forEach((t) => {
      if (!["first_open", "reinstall"].includes(t.scenario)) t.applicable = false;
    });
    packet(f.root, packetPaths.identity, f.identity);
    f.measurement.identity = fingerprint(f.root, packetPaths.identity);
    const excluded = new Set(["guest_upgrade", "session_expired", "auth_cancel", "auth_failure", "account_switch", "account_deletion"]);
    f.measurement.events.forEach((e) => {
      if (e.role.startsWith("auth_")) e.applicable = false;
    });
    f.measurement.scenarios.forEach((s) => {
      if (excluded.has(s.id)) s.applicable = false;
      s.expectedRoles = s.expectedRoles.filter((r) => !r.startsWith("auth_"));
    });
    packet(f.root, packetPaths.measurement, f.measurement);
    const d = packetContract(f.root, packetPaths.design, designSchema);
    d.identity = fingerprint(f.root, packetPaths.identity);
    d.measurement = fingerprint(f.root, packetPaths.measurement);
    packet(f.root, packetPaths.design, d);
    f.proof.measurement = fingerprint(f.root, packetPaths.measurement);
    f.proof.runs = f.proof.runs.filter((r) => !excluded.has(r.scenario));
    json(f.root, "product/onboarding/runtime-evidence.json", f.proof);
    assert(!check(f.root).length, JSON.stringify(check(f.root)));
  });
  h.check("onboarding foundations: CLI runs the same strict acceptance checks", () => {
    const f = seed();
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "checks/validation/business/experience/check-onboarding-foundations.ts", "--root", f.root, "--stage", "runtime"],
      { cwd: skillRoot, encoding: "utf8" },
    );
    assert(result.status === 0, result.stdout + result.stderr);
  });
  h.check("onboarding foundations: compiled routes expose specs, knowledge, ordering and review", () => {
    const bundle = JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"), "utf8")) as HostedKnowledgeBundle;
    const service = createKnowledgeService(bundle);
    const id = (suffix: string) => `workflow.experience.onboarding-system.${suffix}`;
    const measurement = service.workflow({ workflowId: id("onb-13-analytics-experiments") });
    for (const dep of [id("onb-12-state-identity-contract"), id("onb-14-trust-lifecycle-policy")])
      assert(measurement.workflow.dependencies.includes(dep as never), `missing ${dep}`);
    assert(measurement.workflow.referenceIds.includes("reference.data.analytics-attribution"), "analytics knowledge absent");
    const spec = measurement.route.outputs.find((o) => o.path === packetPaths.measurement)!.specifications[0];
    assert(spec && service.get(spec.get).markdown.includes("initialization"), "artifact specification not reachable in two calls");
    const prototype = service.workflow({ workflowId: id("onb-18-visual-design-prototype"), include: "instructions" });
    assert(prototype.workflow.dependencies.includes(id("onb-17-screen-control-paywall-contract") as never), "prototype bypasses screen contract");
    assert(!prototype.workflow.instructions.includes("state, mutate, contract, version, render"), "served ONB-18 still teaches a mutable Design Room");
    assert(!prototype.workflow.instructions.includes("across iOS, Android"), "served ONB-18 still requires unselected platforms");
    assert(
      prototype.workflow.instructions.includes("DESIGN.md") &&
        prototype.workflow.instructions.includes("read-only") &&
        prototype.workflow.instructions.includes("mobileApp.platforms") &&
        prototype.workflow.instructions.includes("host/agent-cli") &&
        prototype.workflow.instructions.includes("static mockup"),
      "served ONB-18 lost DESIGN.md ownership, selected-platform scope, or the prototype evidence bar",
    );
    const onboardingTemplate = readFileSync(path.join(skillRoot, "examples/workspace/business/product/ONBOARDING.md"), "utf8");
    assert(
      !onboardingTemplate.includes("iOS, Android, small viewport, and large text") &&
        onboardingTemplate.includes("Record selected shipping platforms"),
      "the example ONBOARDING.md template still prescribes iOS and Android coverage",
    );
    const reviewer = service.workflow({ workflowId: id("onb-20-adversarial-qa") });
    assert(reviewer.workflow.reviewOf?.includes(id("onb-18-visual-design-prototype") as never), "review independence is prose-only");
    const final = service.workflow({ workflowId: "workflow.experience.onboarding-conversion" });
    const proofSpec = final.route.outputs.find((o) => o.path === "product/onboarding/runtime-evidence.json")!.specifications[0]!;
    assert(service.get(proofSpec.get).markdown.includes("rawEvidence"), "collector schema is hidden outside artifact section");
    assert(final.workflow.outputPaths.includes("product/onboarding/runtime-evidence.json"), "runtime proof not declared");
    for (const [workflowId, stage] of [
      [id("onb-09-evidence-join"), "research"],
      [id("onb-12-state-identity-contract"), "identity"],
      [id("onb-13-analytics-experiments"), "measurement"],
      [id("onb-18-visual-design-prototype"), "prototype"],
      ["workflow.experience.onboarding-conversion", "runtime"],
    ]) {
      const w = service.workflow({ workflowId });
      assert(w.workflow.gateCommands.includes(`check:onboarding-foundations-${stage}`), `missing executable ${stage} gate`);
      assert(w.workflow.referenceIds.includes("reference.experience.onboarding-foundations"), `missing ${stage} specification`);
    }
    const design = service.workflow({ workflowId: "workflow.design.design-room" });
    assert(design.workflow.dependencies.includes(id("onb-15-architecture-decision") as never), "design locks before foundations");
  });
}
