/**
 * Shared builders for the capability-boundary suites. Deliberately named `_fixtures.ts` (not
 * `*.boundaries.ts`) so checks/verification/boundaries/run.ts's auto-discovery skips it — it exports
 * builders, not a `register(harness)` suite.
 */
import type { CompiledRunNode, ResourceClaim } from "../../../kernel/engine/compile.js";
import { laneKeys } from "../../../kernel/schema/types.js";
import type {
  ActionClass,
  BudgetLedgerDocument,
  BudgetLedgerEntry,
  BusinessStateV2,
  BusinessUnit,
  Grant,
  GrantLevel,
  GrantableDomainId,
  GrantsMap,
  LaneKey,
  PrerequisiteProbe,
  ProtectedCategory,
  Status,
  Waiver,
} from "../../../kernel/schema/types.js";
import type { PrerequisiteVerification, PrerequisiteVerifier } from "../../../kernel/autonomy/prerequisites.js";

export const NOW = "2026-08-05T09:00:00.000Z";

export function plusSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

let nodeCounter = 0;

export interface NodeOverrides {
  domainId?: GrantableDomainId;
  actionClass?: ActionClass;
  protectedCategory?: ProtectedCategory;
  costEstimate?: { amount: number; currency: string };
  resources?: ResourceClaim[];
  workflowSlug?: string;
  outputs?: string[];
}

/** A minimal, schema-shaped CompiledRunNode — every field the autonomy modules read is real, not stubbed away. */
export function makeNode(overrides: NodeOverrides = {}): CompiledRunNode {
  nodeCounter += 1;
  const slug = overrides.workflowSlug ?? `fixture-node-${nodeCounter}`;
  const outputs = (overrides.outputs ?? [`artifact.${slug}`]).map((id) => (id.startsWith("artifact.") ? id : `artifact.${id}`)) as `artifact.${string}`[];
  const resources: ResourceClaim[] =
    overrides.resources ?? outputs.map((id) => ({ id: `resource.path.${id.slice("artifact.".length)}`, mode: "exclusive" as const }));
  return {
    id: `run.${slug}`,
    workflowId: `workflow.${slug}`,
    title: `Fixture node ${slug}`,
    deferredByProfiles: [],
    domainId: overrides.domainId ?? "domain.engineering",
    actionClass: overrides.actionClass ?? "mutate",
    protectedCategory: overrides.protectedCategory,
    inputs: [],
    outputs,
    outputPaths: outputs.map((id) => id.slice("artifact.".length)),
    providerIds: [],
    dependencies: [],
    refreshDependencies: [],
    statePredicates: [],
    laneIds: [],
    approvals: [],
    resources,
    verification: { kind: "none", gateIds: [], freshContext: false, failClosed: false },
    idempotent: true,
    maxAttempts: 3,
    ttlSeconds: 300,
    tokenBudget: 8_000,
    costEstimate: overrides.costEstimate,
    phaseIds: [],
    applicability: { mode: "always" },
  };
}

export function makeGrant(domainId: GrantableDomainId, level: GrantLevel, prerequisites: PrerequisiteProbe[] = []): Grant {
  return { domainId, level, prerequisites, grantedAt: NOW, grantedBy: "founder", updatedAt: NOW };
}

export function makeGrants(entries: Array<[GrantableDomainId, GrantLevel, PrerequisiteProbe[]?]>): GrantsMap {
  const grants: GrantsMap = {};
  for (const [domainId, level, prerequisites] of entries) grants[domainId] = makeGrant(domainId, level, prerequisites ?? []);
  return grants;
}

let waiverCounter = 0;

export interface WaiverOverrides {
  domainId: GrantableDomainId;
  actionClass: "mutate" | "publish" | "spend" | "release" | "destructive";
  protectedCategory: ProtectedCategory;
  resourcePattern?: string;
  expiry?: string;
  status?: Waiver["status"];
  maxPerAction?: number;
  maxPerPeriod?: number;
  budgetPeriod?: Waiver["budgetPeriod"];
}

export function makeWaiver(overrides: WaiverOverrides): Waiver {
  waiverCounter += 1;
  return {
    id: `waiver.fixture.${waiverCounter}`,
    domainId: overrides.domainId,
    actionClass: overrides.actionClass,
    protectedCategory: overrides.protectedCategory,
    scope: { resourcePattern: overrides.resourcePattern ?? "*", description: "Fixture-authored waiver for boundary suite coverage." },
    caps: { maxPerAction: overrides.maxPerAction ?? 1_000, maxPerPeriod: overrides.maxPerPeriod ?? 10_000, currency: "USD" },
    budgetPeriod: overrides.budgetPeriod ?? "monthly",
    expiry: overrides.expiry ?? plusSeconds(NOW, 365 * 24 * 3600),
    undoContract: {
      kind: "mitigation",
      irreversibilityAcknowledgment: "This fixture waiver models an irreversible action for boundary testing.",
      mitigationSteps: ["Review the audit log", "Notify the founder"],
    },
    auditRef: "audit.fixture",
    status: overrides.status ?? "active",
    createdAt: NOW,
    createdBy: "founder",
  };
}

export function makeBalance(unit: BusinessUnit, period: string, remaining: number, currency = "USD") {
  return { unit, period, currency, allocated: remaining, committed: 0, spent: 0, remaining, updatedAt: NOW };
}

export function makeLedgerEntry(overrides: Partial<BudgetLedgerEntry> & Pick<BudgetLedgerEntry, "unit" | "domainId" | "period">): BudgetLedgerEntry {
  return {
    id: overrides.id ?? `entry.${Math.random().toString(36).slice(2)}`,
    unit: overrides.unit,
    domainId: overrides.domainId,
    nodeRef: overrides.nodeRef,
    period: overrides.period,
    estimate: overrides.estimate ?? { amount: 0, currency: "USD", declaredAt: NOW },
    actual: overrides.actual ?? null,
    status: overrides.status ?? "estimated",
    waiverRef: overrides.waiverRef,
    auditRef: overrides.auditRef ?? "audit.fixture",
  };
}

export function makeLedger(balances: BudgetLedgerDocument["balances"] = [], entries: BudgetLedgerDocument["entries"] = []): BudgetLedgerDocument {
  return { schemaVersion: "1.0.0", updatedAt: NOW, balances, entries };
}

/** A fully controllable fake verifier — never shells out to a real doppler binary, per the task's fixture rule. */
export function fakeVerifier(byProbeId: Record<string, PrerequisiteVerification>, calls: string[] = []): PrerequisiteVerifier {
  return (probe) => {
    calls.push(probe.id);
    return byProbeId[probe.id] ?? { status: "unverified", detail: `no fake verification registered for probe "${probe.id}"` };
  };
}

/** Every lane pending, no blockers — nodes with laneIds:[] (the norm in this suite's catalogs) ignore this entirely, since compile.ts only derives state predicates from a workflow's own laneIds. */
export function baseBusinessState(overrides: Partial<Record<LaneKey, Status>> = {}): BusinessStateV2 {
  const lanes = {} as BusinessStateV2["lanes"];
  for (const key of laneKeys) lanes[key] = { status: overrides[key] ?? "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: NOW,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "Boundary Fixture App",
      slug: "boundary-fixture-app",
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

export function verifiedProbe(id: string, kind: PrerequisiteProbe["kind"] = "custom"): PrerequisiteProbe {
  if (kind === "doppler_auth") return { id, kind: "doppler_auth", ttlSeconds: 3600, status: "unverified" };
  if (kind === "budget_funded") return { id, kind: "budget_funded", ttlSeconds: 3600, status: "unverified", budgetRef: "ledger.fixture" };
  return { id, kind: "custom", ttlSeconds: 3600, status: "unverified", description: "Fixture custom prerequisite probe." };
}
