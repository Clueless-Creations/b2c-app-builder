import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compilePlan, type CatalogInput, type RunNodeId } from "../../../kernel/engine/compile.js";
import {
  captureReviewEvidence,
  classifyProofStrengthIssues,
  composeProofStrength,
  formatProofStrength,
  workspaceArtifactFingerprint,
} from "../../../kernel/engine/review-evidence.js";
import { acceptVerification, beginAttempt, reconcilePatch, seedRunState } from "../../../kernel/engine/runstate.js";
import { laneKeys, type BusinessStateV2 } from "../../../kernel/schema/types.js";
import { assert, type Harness } from "./_harness.js";

const now = "2026-09-10T12:00:00.000Z";
const nodeId = (workflowSlug: string): RunNodeId => `run.${workflowSlug}` as RunNodeId;

/** Same wording the ONB packet gate prints after a shape-pass. */
const PACKET_STRENGTH_LINE =
  "Proof strength: structural=checked semantic=unknown runtime=unknown. A complete record is not independent review or device observation.";

function strengthCatalog(): CatalogInput {
  return {
    version: "catalog.proof-strength.1",
    artifacts: [{ id: "artifact.research-brief", path: "research/brief.md" }],
    workflows: [
      {
        id: "workflow.research-scan",
        title: "Research scan",
        domainId: "domain.research",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["research/brief.md"],
        providerIds: [],
        laneIds: ["research"],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

function businessState(): BusinessStateV2 {
  const lanes = {} as BusinessStateV2["lanes"];
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: now,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "Proof Strength Fixture",
      slug: "proof-strength-fixture",
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms: ["ios"],
      bundleIds: { ios: "com.example.proofstrength", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

function blockedResearchScan() {
  const plan = compilePlan(strengthCatalog(), now);
  const run = seedRunState(plan, businessState(), { ownerSessionId: "session-1", ttlSeconds: 600, wallClockCapSeconds: 3600, now });
  const attempt = beginAttempt(plan, run, nodeId("research-scan"), "session-producer", now);
  reconcilePatch(
    plan,
    run,
    {
      nodeId: nodeId("research-scan"),
      attemptId: attempt.id,
      outputs: [{ artifactId: "artifact.research-brief", path: "research/brief.md", fingerprint: "abc", evidence: ["producer evidence"] }],
    },
    now,
  );
  return { plan, run, attempt };
}

function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

export function register(harness: Harness): void {
  harness.check("proof-strength: packet chrome plus the strength line is structural-only, not a runtime claim", () => {
    const issues = classifyProofStrengthIssues(["ONB-05 evidence packet check", "0 error(s), 0 warning(s)", PACKET_STRENGTH_LINE], {}, "graph");
    assert(JSON.stringify(issues) === JSON.stringify(["review.structural_only"]), `expected structural_only, got ${issues.join(",")}`);
  });

  harness.check("proof-strength: a reviewer sentence next to the strength line is not structural-only", () => {
    const issues = classifyProofStrengthIssues([PACKET_STRENGTH_LINE, "fresh-context reviewer signed off"], {}, "graph");
    assert(issues.length === 0, `expected no issues, got ${issues.join(",")}`);
  });

  harness.check("proof-strength: a graph receipt cannot turn a live-device sentence into runtime observation", () => {
    const issues = classifyProofStrengthIssues(["Live-device observation: home screen rendered."], {}, "graph");
    assert(JSON.stringify(issues) === JSON.stringify(["review.runtime_unobserved"]), `expected runtime_unobserved, got ${issues.join(",")}`);
  });

  harness.check("proof-strength: acceptVerification refuses packet-gate stdout as independent review", () => {
    const { plan, run } = blockedResearchScan();
    const message = thrownMessage(() =>
      acceptVerification(
        plan,
        run,
        nodeId("research-scan"),
        ["ONB-05 evidence packet check", "0 error(s), 0 warning(s)", PACKET_STRENGTH_LINE],
        now,
        "session-reviewer",
      ),
    );
    assert(message.includes("review.structural_only"), `expected structural_only, got ${message || "no refusal"}`);
    assert(run.nodes[nodeId("research-scan")]!.status === "blocked", "structural-only evidence must leave the node blocked");
  });

  harness.check("proof-strength: acceptVerification still accepts a fresh-context reviewer sentence", () => {
    const { plan, run } = blockedResearchScan();
    acceptVerification(plan, run, nodeId("research-scan"), ["fresh-context reviewer signed off"], now, "session-reviewer");
    assert(run.nodes[nodeId("research-scan")]!.status === "succeeded", "a real reviewer sentence must still promote the node");
  });

  harness.check("proof-strength: acceptVerification refuses a synthetic live-device claim without running a device", () => {
    const { plan, run, attempt } = blockedResearchScan();
    attempt.proofSource = "synthetic";
    const message = thrownMessage(() =>
      acceptVerification(plan, run, nodeId("research-scan"), ["Live-device observation: home screen rendered."], now, "session-reviewer"),
    );
    assert(message.includes("review.runtime_unobserved"), `expected runtime_unobserved, got ${message || "no refusal"}`);
    assert(run.nodes[nodeId("research-scan")]!.status === "blocked", "an unobserved runtime claim must leave the node blocked");
  });

  harness.check("proof-strength: packet shape-pass still produces semantic and runtime unknown", () => {
    const produced = formatProofStrength(composeProofStrength({ structural: "checked" }));
    assert(produced === PACKET_STRENGTH_LINE, `packet producer must stay structural-only, got ${produced}`);
  });

  harness.check("proof-strength: graph acceptance still produces semantic unknown", () => {
    const { plan, run, attempt } = blockedResearchScan();
    acceptVerification(plan, run, nodeId("research-scan"), ["fresh-context reviewer signed off"], now, "session-reviewer");
    const produced = attempt.independentVerification?.evidence.find((line) => line.startsWith("Proof strength:"));
    assert(
      Boolean(produced?.includes("semantic=unknown") && produced.includes("runtime=unknown")),
      `graph review must not invent semantic proof, got ${produced ?? "none"}`,
    );
    assert(!produced?.includes("semantic=checked"), "graph mode cannot become workspace semantic proof");
  });

  harness.check("proof-strength: workspace review produces semantic=checked and leaves runtime unknown", () => {
    const root = harness.makeTempDir("proof-strength-semantic");
    mkdirSync(path.join(root, "research"), { recursive: true });
    writeFileSync(path.join(root, "research/brief.md"), "Workspace research brief.\n", "utf8");
    const plan = compilePlan(strengthCatalog(), now);
    const run = seedRunState(plan, businessState(), { ownerSessionId: "session-1", ttlSeconds: 600, wallClockCapSeconds: 3600, now });
    const attempt = beginAttempt(plan, run, nodeId("research-scan"), "session-producer", now);
    attempt.proofSource = "workspace";
    reconcilePatch(
      plan,
      run,
      {
        nodeId: nodeId("research-scan"),
        attemptId: attempt.id,
        outputs: [
          {
            artifactId: "artifact.research-brief",
            path: "research/brief.md",
            fingerprint: workspaceArtifactFingerprint(root, "research/brief.md"),
            evidence: ["workspace bytes produced"],
          },
        ],
      },
      now,
    );
    const snapshot = captureReviewEvidence(plan, run, nodeId("research-scan"), root, "session-reviewer", now);
    acceptVerification(plan, run, nodeId("research-scan"), ["fresh-context reviewer signed off"], now, "session-reviewer", snapshot, root);
    const produced = attempt.independentVerification?.evidence.find((line) => line.startsWith("Proof strength:"));
    assert(
      Boolean(produced?.includes("semantic=checked") && produced.includes("runtime=unknown")),
      `workspace review must produce semantic proof only, got ${produced ?? "none"}`,
    );
    assert(!produced?.includes("runtime=checked"), "acceptVerification must not invent a device or runtime observation");
  });

  harness.check("proof-strength: runtime=checked requires an explicit workspace observation, not a sentence", () => {
    const review = {
      mode: "workspace" as const,
      verdict: "accepted" as const,
      evidence: ["fresh-context reviewer signed off"],
    };
    const withoutObservation = composeProofStrength({
      structural: "checked",
      review,
      attempt: { proofSource: "workspace" },
    });
    assert(withoutObservation.runtime === "unknown", "a workspace review sentence is not runtime observation");
    const withObservation = composeProofStrength({
      structural: "checked",
      review,
      attempt: { proofSource: "workspace" },
      runtimeObservation: { origin: "workspace" },
    });
    assert(withObservation.semantic === "checked" && withObservation.runtime === "checked", "only an explicit workspace observation produces runtime proof");
    assert(
      composeProofStrength({
        structural: "checked",
        review,
        attempt: { proofSource: "synthetic" },
        runtimeObservation: { origin: "workspace" },
      }).runtime === "unknown",
      "synthetic origin cannot produce runtime proof",
    );
  });
}
