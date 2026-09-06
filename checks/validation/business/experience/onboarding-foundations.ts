import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import YAML from "yaml";
import { z } from "zod";
import {
  artifactSchema,
  collectorReadbackSchema,
  researchInputPaths,
  attributionTopics,
  decisionTopics,
  designSchema,
  eventRoles,
  identityScenarios,
  identitySchema,
  measurementSchema,
  researchSchema,
  runtimeScenarios,
  scenarioAssertions,
  scenarioEventRoles,
  traceSchema,
  wiringSchema,
} from "../../../../contracts/onboarding/foundations.js";
import { issue, type Issue } from "../../../../tooling/lib/launch-state.js";

export const packetPaths = {
  research: "product/onboarding/graph/ONB-09-evidence-join.md",
  firstValue: "product/onboarding/graph/ONB-10-first-value-activation.md",
  identity: "product/onboarding/graph/ONB-12-state-identity-contract.md",
  measurement: "product/onboarding/graph/ONB-13-analytics-experiments.md",
  design: "product/onboarding/graph/ONB-18-visual-design-prototype.md",
  policy: "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md",
  screens: "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
} as const;
export type FoundationStage = "research" | "identity" | "measurement" | "prototype" | "runtime";
const maxBytes = 2 * 1024 * 1024;

/** Never follow evidence symlinks or read credentials/VCS/runtime authority as proof. */
export function evidenceBytes(root: string, relative: string): Buffer {
  if (
    !relative ||
    relative.includes("\\") ||
    relative.includes(":") ||
    relative.includes("\0") ||
    path.isAbsolute(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Expected a workspace-relative resource path");
  if (relative.split("/").some((part) => [".git", "node_modules", "control", "state", "run"].includes(part)) || /(?:^|\/)\.env(?:\.|$)/.test(relative))
    throw new Error("Protected path is not onboarding evidence");
  let target = realpathSync(root);
  for (const part of relative.split("/")) {
    target = path.join(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error("Symlink evidence refused");
  }
  const stat = lstatSync(target);
  if (!stat.isFile() || !stat.size || stat.size > maxBytes) throw new Error("Expected bounded nonempty regular evidence file");
  return readFileSync(target);
}
export function fingerprint(root: string, relative: string): z.infer<typeof artifactSchema> {
  return { path: relative, sha256: createHash("sha256").update(evidenceBytes(root, relative)).digest("hex") };
}

/** One executable contract block under one top-level H2; examples elsewhere do not count. */
export function packetContract<T>(root: string, relative: string, schema: z.ZodType<T>): T {
  const nodes = fromMarkdown(evidenceBytes(root, relative).toString("utf8")).children;
  const matches = nodes.flatMap((node, index) =>
    node.type === "heading" &&
    node.depth === 2 &&
    node.children.length === 1 &&
    node.children[0]?.type === "text" &&
    node.children[0].value === "Foundation contract"
      ? [index]
      : [],
  );
  if (matches.length !== 1) throw new Error(`${relative}: expected one ## Foundation contract`);
  const start = matches[0]! + 1;
  let end = nodes.findIndex((node, index) => index >= start && node.type === "heading" && node.depth <= 2);
  if (end < 0) end = nodes.length;
  const body = nodes.slice(start, end);
  const blocks = body.filter((node) => node.type === "code" && node.lang === "json");
  if (blocks.length !== 1 || blocks[0]?.type !== "code") throw new Error(`${relative}: expected one json contract block`);
  return schema.parse(JSON.parse(blocks[0].value));
}

export function validateFoundations(root: string, stage: FoundationStage, knowledgeRoot: string, now = new Date()): Issue[] {
  const issues: Issue[] = [];
  const fail = (code: string, message: string, file?: string) => issues.push(issue("error", `onboarding_foundations.${code}`, message, file));
  const check = (ref: z.infer<typeof artifactSchema>, expected?: string, base = root) => {
    try {
      if (expected && ref.path !== expected) throw new Error(`Must reference ${expected}`);
      if (fingerprint(base, ref.path).sha256 !== ref.sha256) throw new Error("Evidence changed; rerun and rebind the affected proof");
    } catch (error) {
      fail("resource", `${ref.path}: ${error instanceof Error ? error.message : "invalid resource"}`, ref.path);
    }
  };
  const unique = (values: readonly string[], expected: readonly string[], label: string) => {
    if (new Set(values).size !== values.length || expected.some((id) => !values.includes(id)))
      fail("coverage", `${label} requires exactly one entry per required identifier; missing or duplicate coverage`);
  };
  try {
    const research = packetContract(root, packetPaths.research, researchSchema);
    unique(
      research.inputs.map((input) => input.path),
      researchInputPaths,
      "Research input packets",
    );
    research.inputs.forEach((input) => check(input));
    unique(
      research.decisions.map((d) => d.topic),
      decisionTopics,
      "Research decisions",
    );
    unique(
      research.decisions.map((d) => d.id),
      [],
      "Decision IDs",
    );
    unique(
      research.knowledge.map((k) => k.referenceId),
      ["reference.experience.onboarding-conversion", "reference.data.analytics-attribution"],
      "Applied knowledge",
    );
    unique(
      research.observations.map((o) => o.id),
      [],
      "Observation IDs",
    );
    // One data owner: a relocated package has catalog-pack.yaml; the source checkout has the
    // generated projection. We do not fetch live sources or silently rebuild the catalog here.
    const catalogPath = existsSync(path.join(knowledgeRoot, "catalog-pack.yaml")) ? "catalog-pack.yaml" : "catalog/generated/catalog.json";
    const catalog = YAML.parse(evidenceBytes(knowledgeRoot, catalogPath).toString("utf8")) as { references?: Array<{ id: string; path: string }> };
    for (const k of research.knowledge) {
      if (!catalog.references?.some((r) => r.id === k.referenceId && r.path === k.path)) fail("knowledge", `Unknown knowledge identity/path: ${k.referenceId}`);
      check(k, undefined, knowledgeRoot);
      const source = evidenceBytes(knowledgeRoot, k.path).toString("utf8");
      const headings = fromMarkdown(source).children.filter((n) => n.type === "heading");
      if (!headings.some((h) => h.type === "heading" && h.children.map((n) => ("value" in n ? n.value : "")).join("") === k.section))
        fail("knowledge", `Unresolved heading ${k.section} in ${k.referenceId}`);
    }
    for (const o of research.observations) {
      check(o.evidence);
      if (Date.parse(o.observedAt) > now.getTime()) fail("future_evidence", "Research observations cannot be dated in the future");
    }
    for (const d of research.decisions) {
      if (
        d.knowledgeIds.some((id) => !research.knowledge.some((k) => k.referenceId === id)) ||
        d.observationIds.some((id) => !research.observations.some((o) => o.id === id))
      )
        fail("decision_join", `Decision ${d.id} references missing research or knowledge`);
    }
    if (stage === "research") return issues;

    const identity = packetContract(root, packetPaths.identity, identitySchema);
    check(identity.research, packetPaths.research);
    unique(
      identity.transitions.map((t) => t.scenario),
      identityScenarios,
      "Identity transitions",
    );
    const authScenarios = ["sign_in", "auth_cancel", "auth_failure", "session_restore", "session_expired", "logout", "account_switch", "account_deletion"];
    if (
      identity.transitions.some(
        (t) =>
          !t.applicable &&
          (t.scenario === "first_open" || t.scenario === "reinstall" || (identity.authMode !== "no_account" && authScenarios.includes(t.scenario))),
      )
    )
      fail("identity_coverage", "Required identity transitions cannot be dismissed as not applicable");
    if (stage === "identity") return issues;

    const measurement = packetContract(root, packetPaths.measurement, measurementSchema);
    check(measurement.identity, packetPaths.identity);
    check(measurement.firstValue, packetPaths.firstValue);
    check(measurement.blueprint, "analytics/ANALYTICS.md");
    check(measurement.policy, packetPaths.policy);
    unique(measurement.initialization, ["restore_consent", "restore_identity", "configure_collection", "first_event", "first_value"], "Initialization");
    const at = (id: (typeof measurement.initialization)[number]) => measurement.initialization.indexOf(id);
    if (
      at("restore_consent") > at("configure_collection") ||
      at("restore_identity") > at("configure_collection") ||
      at("configure_collection") > at("first_event") ||
      at("first_event") > at("first_value")
    )
      fail("initialization_order", "Restore local consent/identity before configured collection; instrument the first event before first value");
    unique(
      measurement.events.map((e) => e.role),
      eventRoles,
      "Event roles",
    );
    unique(
      measurement.events.filter((e) => e.applicable).map((e) => e.name),
      [],
      "Event names",
    );
    unique(
      measurement.attribution.map((a) => a.topic),
      attributionTopics,
      "Attribution",
    );
    unique(
      measurement.scenarios.map((s) => s.id),
      runtimeScenarios,
      "Runtime scenarios",
    );
    const optionalRoles = new Set([
      "attribution_selected",
      ...(identity.authMode === "no_account" ? ["auth_started", "auth_succeeded", "auth_failed", "auth_cancelled"] : []),
    ]);
    if (measurement.events.some((e) => !e.applicable && !optionalRoles.has(e.role)))
      fail("event_coverage", "The declared first-session and applicable auth event roles are mandatory");
    const optionalScenarios = new Set([
      "deep_link",
      "purchase_restore",
      ...(identity.authMode === "no_account" ? ["guest_upgrade", "session_expired", "auth_cancel", "auth_failure", "account_switch", "account_deletion"] : []),
    ]);
    for (const s of measurement.scenarios) {
      if (!s.applicable && !optionalScenarios.has(s.id)) fail("scenario_coverage", `Scenario ${s.id} is required`);
      unique(s.assertions, scenarioAssertions[s.id], `${s.id} assertions`);
      if (s.applicable && (scenarioEventRoles[s.id] ?? []).some((role) => !s.expectedRoles.includes(role)))
        fail("scenario_events", `${s.id} omits its required semantic observations`);
      if (s.expectedRoles.some((role) => !measurement.events.some((e) => e.role === role && e.applicable)))
        fail("scenario_events", `${s.id} expects an undeclared or excluded event`);
    }
    const fresh = measurement.scenarios.find((s) => s.id === "fresh_install")!;
    const firstSessionRoles = [
      "app_opened",
      "onboarding_started",
      "step_viewed",
      "step_completed",
      "first_value_rendered",
      "first_value_engaged",
      "onboarding_completed",
    ];
    if (firstSessionRoles.some((role) => !fresh.expectedRoles.includes(role as (typeof eventRoles)[number])))
      fail("first_session_coverage", "Fresh install must exercise the complete first-session event contract");
    if (measurement.privacyAllowlist.some((key) => /(?:password|secret|access_token|refresh_token|email|phone|address)/i.test(key)))
      fail("privacy", "Do not collect credentials, raw contact details or address fields in onboarding analytics");
    if (stage === "measurement") return issues;

    const design = packetContract(root, packetPaths.design, designSchema);
    check(design.research, packetPaths.research);
    check(design.identity, packetPaths.identity);
    check(design.measurement, packetPaths.measurement);
    check(design.screenContract, packetPaths.screens);
    check(design.design, "DESIGN.md");
    unique(
      design.decisions.map((d) => d.decisionId),
      research.decisions.map((d) => d.id),
      "Research-to-design decisions",
    );
    for (const d of design.decisions) {
      if (!research.decisions.some((r) => r.id === d.decisionId)) fail("design_join", `Design references unknown decision ${d.decisionId}`);
      check(d.evidence);
    }
    const proofPath = `product/onboarding/${stage === "prototype" ? "prototype" : "runtime"}-evidence.json`;
    const proof = wiringSchema.parse(JSON.parse(evidenceBytes(root, proofPath).toString("utf8")));
    if (proof.stage !== stage || Date.parse(proof.capturedAt) > now.getTime()) fail("proof_context", "Wrong stage or future proof timestamp", proofPath);
    check(proof.measurement, packetPaths.measurement);
    const requiredSources = [
      measurement.schemaPath,
      measurement.initializationPath,
      ...measurement.events.filter((e) => e.applicable).flatMap((e) => [e.implementationPath, e.testPath]),
      ...measurement.scenarios.filter((s) => s.applicable).map((s) => s.testPath),
    ];
    unique(
      proof.sources.map((s) => s.path),
      [...new Set(requiredSources)],
      "Instrumented source/test files",
    );
    proof.sources.forEach((s) => check(s));
    const scenarios = measurement.scenarios.filter((s) => s.applicable);
    const required =
      stage === "prototype"
        ? scenarios.filter((s) => ["fresh_install", "consent_denied", "analytics_unavailable", "unknown_attribution"].includes(s.id))
        : scenarios;
    unique(
      proof.runs.map((r) => r.scenario),
      required.map((s) => s.id),
      "Executed scenarios",
    );
    for (const run of proof.runs) {
      check(run.trace);
      check(run.executionEvidence);
      if (run.providerReadback) check(run.providerReadback);
      if (run.trace.path === run.executionEvidence.path) fail("execution_evidence", "A self-authored trace is not separate execution evidence");
      const scenario = scenarios.find((s) => s.id === run.scenario);
      if (!scenario) {
        fail("proof_scenario", `Unknown/excluded scenario ${run.scenario}`);
        continue;
      }
      const trace = traceSchema.parse(JSON.parse(evidenceBytes(root, run.trace.path).toString("utf8")));
      if (trace.scenario !== run.scenario || trace.appId !== proof.appId || trace.buildId !== proof.buildId || trace.environment !== proof.environment)
        fail("proof_context", "Trace belongs to another scenario, app, build, or environment", run.trace.path);
      if (JSON.stringify(trace.initialization) !== JSON.stringify(measurement.initialization))
        fail("initialization_order", "Observed initialization does not match the approved order", run.trace.path);
      unique(
        trace.events.map((e) => e.eventId),
        [],
        "Captured event IDs",
      );
      let cursor = 0;
      for (const event of trace.events) {
        const declared = measurement.events.find((e) => e.role === event.role && e.applicable);
        if (!declared || declared.name !== event.name || declared.emitter !== event.emitter)
          fail("event_contract", `Unexpected event or authoritative emitter: ${event.name}`, run.trace.path);
        if (event.consent === "denied" && event.destination === "provider")
          fail("consent", "Denied analytics consent must not emit to provider", run.trace.path);
        if (Date.parse(event.occurredAt) > Date.parse(proof.capturedAt)) fail("proof_context", "Event occurs after its capture", run.trace.path);
        if (event.role === scenario.expectedRoles[cursor]) cursor += 1;
      }
      if (cursor !== scenario.expectedRoles.length) fail("event_sequence", `Missing/out-of-order expected events in ${run.scenario}`, run.trace.path);
      unique(
        trace.assertions.map((a) => a.id),
        scenario.assertions,
        "Observed assertions",
      );
      if (trace.assertions.some((a) => !a.passed)) fail("runtime_assertion", `A runtime assertion failed in ${run.scenario}`, run.trace.path);
      if (run.scenario === "consent_denied" && trace.events.some((e) => e.consent !== "denied" || e.destination !== "local"))
        fail("consent", "Consent-denial proof must actually exercise denied collection without provider emission", run.trace.path);
      if (["auth_cancel", "auth_failure"].includes(run.scenario) && trace.events.some((e) => e.role === "auth_succeeded"))
        fail("auth_outcome", "Canceled/failed authentication cannot report success", run.trace.path);
      if (run.scenario === "unknown_attribution" && trace.events.some((e) => e.attribution !== "unknown"))
        fail("attribution", "Unknown attribution cannot be replaced with inferred source", run.trace.path);
      if (["fresh_install", "analytics_unavailable"].includes(run.scenario) && !trace.events.some((e) => e.role === "first_value_rendered"))
        fail("first_value", "First value must work even when analytics transport is unavailable", run.trace.path);
      if (run.scenario === "account_switch" && new Set(trace.events.map((e) => e.subjectKey)).size < 2)
        fail("identity_isolation", "Account-switch proof must observe both synthetic subjects", run.trace.path);
      if (stage === "runtime" && run.scenario === "fresh_install" && (!run.providerReadback || !trace.events.some((e) => e.destination === "provider")))
        fail("provider_delivery", "Final wiring proof needs observed collector delivery, not only local logging", run.trace.path);
      if (stage === "runtime" && run.providerReadback) {
        const readback = collectorReadbackSchema.parse(JSON.parse(evidenceBytes(root, run.providerReadback.path).toString("utf8")));
        check(readback.rawEvidence);
        if ([run.trace.path, run.executionEvidence.path, run.providerReadback.path].includes(readback.rawEvidence.path))
          fail("provider_delivery", "Collector readback must retain a separate provider export, not the local trace or test log");
        if (
          readback.appId !== proof.appId ||
          readback.buildId !== proof.buildId ||
          readback.environment !== proof.environment ||
          Date.parse(readback.observedAt) > now.getTime()
        )
          fail("provider_delivery", "Collector readback belongs to another app, build, environment or future observation");
        unique(
          readback.events.map((e) => e.eventId),
          [],
          "Collector event IDs",
        );
        const delivered = trace.events.filter((e) => e.destination === "provider");
        if (
          delivered.some(
            (event) =>
              !readback.events.some(
                (observed) => observed.eventId === event.eventId && observed.name === event.name && observed.subjectKey === event.subjectKey,
              ),
          )
        )
          fail("provider_delivery", "Collector must confirm each sent event by event ID, name and synthetic subject");
      }
    }
  } catch (error) {
    fail(
      "contract",
      error instanceof z.ZodError
        ? `Invalid foundation contract: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        : error instanceof Error
          ? error.message
          : "Invalid foundation evidence",
    );
  }
  return issues;
}
