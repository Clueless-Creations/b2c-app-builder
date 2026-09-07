import { readFileSync } from "node:fs";
import path from "node:path";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import { HOSTED_BUNDLE_RELATIVE_PATH } from "../../../tooling/render-hosted-bundle.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/**
 * Hosted discovery gate (issue #32; ARCH-12 "comparable measurement is a product primitive").
 *
 * Every other hosted suite in this directory asserts SHAPE — bounded pages, stable hashes,
 * guardrails that never claim execution. None of them asks the only question a founder's agent
 * actually has: when I describe my job in my own words, does `b2c_catalog` hand me the workflow
 * that does it? This suite asks that, against the shipped bundle rather than a hand-authored
 * fixture catalog, because the defect it exists to catch lives in authored vocabulary and
 * authored edges — neither of which a synthetic two-workflow fixture can express.
 *
 * The measure is deliberately ERASURE first, rank second. `catalog()` keeps only workflows
 * matching every query term whenever any workflow does, so its failure mode is not a workflow
 * sliding to rank 8 — it is a confident one-result page with the needed workflow missing, and a
 * `pagination.total` that reads identically to a genuinely narrow answer. A caller cannot detect
 * that. A ratchet can.
 *
 * These are CEILINGS recorded from measured behaviour, not targets. A change may lower them; the
 * suite fails if one rises. Do not relax a bound to make a change pass — that inverts the gate.
 */

interface StoreCorpus {
  metadata: {
    corpus: string;
    sampleSize: number;
    neededWorkflowSlots: number;
    baseline: { absentSlots: number; outsideTopThreeSlots: number };
  };
  entries: Array<{ id: string; utterance: string; shape: string; needs: string[] }>;
}

const corpusPath = path.join(skillRoot, "checks/verification/goldens/routing/store-utterances.json");

// Memoized: the shipped bundle is ~3 MB of JSON and building the service indexes every
// document in it. Five cases here read one or the other, and re-parsing per case made the
// suite several times slower for no added coverage — the bundle is immutable within a run.
let corpusCache: StoreCorpus | undefined;
let serviceCache: ReturnType<typeof createKnowledgeService> | undefined;

function loadCorpus(): StoreCorpus {
  return (corpusCache ??= JSON.parse(readFileSync(corpusPath, "utf8")) as StoreCorpus);
}

function loadBundle(): HostedKnowledgeBundle {
  return JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
}

function service(): ReturnType<typeof createKnowledgeService> {
  return (serviceCache ??= createKnowledgeService(loadBundle()));
}

/**
 * Every workflow id the catalog would return for this utterance, in rank order, across ALL pages.
 * Paging to exhaustion is the point: a workflow the caller could only reach at offset 60 is not
 * "found" in any useful sense, but it is also not ERASED, and this suite reports those separately.
 */
function rankedIds(service: ReturnType<typeof createKnowledgeService>, query: string): string[] {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = service.catalog({ query, offset, limit: 50 });
    ids.push(...page.workflows.map((workflow) => workflow.id));
    if (page.pagination.nextOffset === null) return ids;
  }
}

interface Measurement {
  absent: number;
  outsideTopThree: number;
  slots: number;
  worstRows: string[];
}

let measurementCache: Measurement | undefined;

function measure(): Measurement {
  if (measurementCache) return measurementCache;
  const corpus = loadCorpus();
  const svc = service();
  let absent = 0;
  let outsideTopThree = 0;
  let slots = 0;
  const worstRows: string[] = [];
  for (const entry of corpus.entries) {
    const ranked = rankedIds(svc, entry.utterance);
    let missingHere = 0;
    for (const needed of entry.needs) {
      slots += 1;
      const rank = ranked.indexOf(needed);
      if (rank < 0) {
        absent += 1;
        missingHere += 1;
      }
      if (rank < 0 || rank > 2) outsideTopThree += 1;
    }
    // A row where NO needed workflow survives is the confident-wrong-answer case.
    if (missingHere === entry.needs.length) worstRows.push(`${entry.id} "${entry.utterance}"`);
  }
  return (measurementCache = { absent, outsideTopThree, slots, worstRows });
}

export function register(harness: Harness): void {
  harness.check("hosted discovery: the store corpus matches the shipped catalog and its own declared shape", () => {
    const corpus = loadCorpus();
    const bundle = loadBundle();
    // Widened to string on purpose: the corpus is authored JSON, so its ids arrive untyped and a
    // branded Set would reject the very lookup this case exists to perform.
    const known = new Set<string>(bundle.catalog.workflows.map((workflow) => workflow.id));
    assert(corpus.entries.length === corpus.metadata.sampleSize, `corpus declares ${corpus.metadata.sampleSize} entries but holds ${corpus.entries.length}`);
    const slots = corpus.entries.reduce((total, entry) => total + entry.needs.length, 0);
    assert(slots === corpus.metadata.neededWorkflowSlots, `corpus declares ${corpus.metadata.neededWorkflowSlots} needed-workflow slots but holds ${slots}`);
    const unknown = [...new Set(corpus.entries.flatMap((entry) => entry.needs))].filter((id) => !known.has(id));
    // A renamed or retired workflow must fail loudly here rather than silently inflating the
    // erasure count in the ratchets below, where it would read as a retrieval regression.
    assert(unknown.length === 0, `corpus expects workflow ids absent from the shipped catalog: ${unknown.join(", ")}`);
    const ids = corpus.entries.map((entry) => entry.id);
    assert(new Set(ids).size === ids.length, "corpus entry ids must be unique");
  });

  harness.check("hosted discovery: no more store utterances erase a needed workflow than the recorded ceiling", () => {
    const { absent, slots, worstRows } = measure();
    const ceiling = loadCorpus().metadata.baseline.absentSlots;
    assert(
      absent <= ceiling,
      `needed workflows unreachable at any offset rose to ${absent}/${slots}, above the recorded ceiling of ${ceiling}. ` +
        `Rows where every needed workflow was erased: ${worstRows.length ? worstRows.join("; ") : "none"}.`,
    );
  });

  harness.check("hosted discovery: no more store utterances bury a needed workflow than the recorded ceiling", () => {
    const { outsideTopThree, slots } = measure();
    const ceiling = loadCorpus().metadata.baseline.outsideTopThreeSlots;
    assert(
      outsideTopThree <= ceiling,
      `needed workflows outside the top three rose to ${outsideTopThree}/${slots}, above the recorded ceiling of ${ceiling}.`,
    );
  });

  harness.check("hosted discovery: the Apple screenshot workflow is reachable for a founder who names the destination", () => {
    const svc = service();
    // The utterance from issue #32. It returned exactly one workflow — the upload automation —
    // because "connect" appeared nowhere in the screenshot workflow's authored text, and one
    // absent term suppresses the other 110 through the strict-match partition.
    const ranked = rankedIds(svc, "store screenshots App Store Connect upload");
    assert(
      ranked.includes("workflow.store.store-screenshots-production"),
      `an ask naming both the asset and its destination returned ${ranked.length} workflow(s) without the one that produces the asset: ${ranked.join(", ") || "none"}`,
    );
  });

  harness.check("hosted discovery: the ASC command reference reaches the workflow whose outputs it uploads", () => {
    const route = service().workflow({ workflowId: "workflow.store.store-screenshots-production" });
    const bound = route.workflow.referenceIds;
    // Route-first retrieval is the documented discipline, so the auth ladder and upload commands
    // have to arrive through the route rather than through a lucky second search.
    assert(
      bound.includes("reference.store.app-store-connect-cli"),
      `the screenshot workflow binds ${bound.length} references and none is the App Store Connect command reference: ${bound.join(", ")}`,
    );
  });
}
