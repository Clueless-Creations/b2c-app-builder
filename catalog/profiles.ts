import type { LaneKey } from "../kernel/schema/types.js";
import type { CatalogProfile } from "./types.js";

/**
 * Named launch profiles (layering plan phase E, requirement R7): the engine-enforced half of
 * what knowledge/process/launch-phases.md "Launch Scopes" has said in prose since v0.28.0.
 *
 * Before this registry existed, `project.launch_scope` had NO behavioral consumer in the typed
 * engine — compile, frontier, and run-state never read it, so an "essentials" business relied
 * entirely on an agent hand-marking lanes deferred (2026-08-20 finding). A profile turns the
 * scope value into compiled fact: a workflow whose every lane sits in the profile's deferred
 * set parks as not_needed at seed time and at every frontier pass, through the SAME
 * reconcileWorkflowApplicability path scope verdicts already use — same invalidation on change,
 * same founder override (a recorded "required" verdict beats the profile), same audit trail.
 *
 * Granularity is deliberate: lanes, not the prose's finer clauses. The prose defers "lifecycle
 * email beyond transactional" — the engine defers the email LANE, and the finer judgment stays
 * with the dated-reason deferral mechanics check:lane-coverage already polices. The engine
 * enforces the floor; prose still guides the rest.
 *
 * Profiles select breadth inside whatever composeCatalog produced. Packs add nodes first;
 * profile deferral compiles afterward. An essentials launch still charges money, handles
 * data, and passes review.
 *
 */

export const NEVER_DEFERRED_LANES: readonly LaneKey[] = ["revenue", "privacy_legal", "security", "apple_signing", "store_console"];

export const profiles: readonly CatalogProfile[] = [
  {
    id: "full",
    title: "Full launch",
    description: "Every lane runs; the Deliverable Standard applies in full. The default for a complete consumer-business mandate.",
    defersLaneKeys: [],
  },
  {
    id: "essentials",
    title: "Essentials launch",
    description:
      "The core spine runs; the wholly-breadth lanes (paid user acquisition, the viral growth loop, lifecycle email) park as not needed until the founder widens scope. Market contact beats artifact completeness.",
    defersLaneKeys: ["paid_user_acquisition", "growth", "email"],
  },
];

export function findProfile(id: string | undefined): CatalogProfile | undefined {
  return profiles.find((profile) => profile.id === id);
}
