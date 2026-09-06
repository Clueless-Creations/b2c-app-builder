#!/usr/bin/env node
/**
 * check-change-cascade.ts — surface-coverage gate for recorded change cascades.
 *
 * knowledge/process/change-cascade.md says a change to a launched app is not done
 * until every impacted surface is "updated or explicitly marked unaffected".
 * That was an honour system: the map lived in a markdown table no validator
 * could read, so a cascade could silently skip a surface and still read as
 * complete.
 *
 * This validator reads the same map as data (knowledge/process/cascade-edges.yaml)
 * and grades the `lanes.post_launch_ops.changeCascade` records a launch run records in its own
 * state/business-state.json:
 *
 *   { "lanes": { "post_launch_ops": { "changeCascade": [{
 *     "id": "rename-streaks-to-runs", "types": ["lexicon_change"],
 *     "recorded_at": "2026-07-25", "surfaces": {
 *       "app_in_app": { "status": "updated", "evidence": "product/ONBOARDING.md" },
 *       "asc_listing": { "status": "updated", "evidence": "APP_STORE_LISTING.md" },
 *       "seo_geo": { "status": "unaffected", "reason": "Term absent from target keywords" }
 *     }
 *   }] } } }
 *
 * Errors when: the change type is unknown, a surface the map says is impacted
 * is missing entirely, an "updated" surface has no evidence, an "unaffected"
 * surface has no reason, or a surface id is not in the inventory.
 *
 * The edge set ships with the skill and is not copied into business repos, so
 * a launch run cannot edit the map that grades it — only record against it.
 *
 * npm script: check:change-cascade
 * Usage: tsx checks/validation/business/process/check-change-cascade.ts --root /path/to/app [--skill-root .]
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { asString, getPath, isRecord, issue, type Issue, loadProjectState, parseCliArgs, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

/** Statuses a recorded surface may carry. */
const SURFACE_STATUSES = new Set(["updated", "unaffected", "blocked"]);

interface CascadeMap {
  surfaces: Record<string, { label?: string; evidenceDimensions: string[] }>;
  changeTypes: Record<string, { label?: string; cascade_to: string[] }>;
}

function resolveSkillRoot(argv: string[]): string {
  const index = argv.indexOf("--skill-root");
  if (index >= 0 && argv[index + 1]) return path.resolve(argv[index + 1] as string);
  return defaultSkillRoot;
}

/** Load and shape-check the shipped edge map. A broken map is a maintainer bug. */
function loadCascadeMap(skillRoot: string, issues: Issue[]): CascadeMap | undefined {
  const mapPath = path.join(skillRoot, "knowledge", "process", "cascade-edges.yaml");
  if (!existsSync(mapPath)) {
    issues.push(
      issue(
        "error",
        "change_cascade.map_missing",
        `knowledge/process/cascade-edges.yaml is missing at ${mapPath}. It is the data form of the Change Cascade Map.`,
        mapPath,
      ),
    );
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(mapPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(issue("error", "change_cascade.map_parse_error", `knowledge/process/cascade-edges.yaml is invalid YAML: ${message}`, mapPath));
    return undefined;
  }

  const surfacesRaw = getPath(parsed, "surfaces");
  const typesRaw = getPath(parsed, "change_types");
  if (!isRecord(surfacesRaw) || !isRecord(typesRaw)) {
    issues.push(
      issue("error", "change_cascade.map_malformed", "knowledge/process/cascade-edges.yaml must define both `surfaces` and `change_types` mappings.", mapPath),
    );
    return undefined;
  }

  const surfaces: CascadeMap["surfaces"] = {};
  for (const [id, value] of Object.entries(surfacesRaw)) {
    surfaces[id] = {
      label: isRecord(value) ? asString(value.label) : undefined,
      evidenceDimensions:
        isRecord(value) && Array.isArray(value.evidence_dimensions)
          ? value.evidence_dimensions.filter((entry): entry is string => typeof entry === "string")
          : [],
    };
  }

  const changeTypes: CascadeMap["changeTypes"] = {};
  for (const [id, value] of Object.entries(typesRaw)) {
    const cascadeTo = isRecord(value) && Array.isArray(value.cascade_to) ? value.cascade_to.filter((entry): entry is string => typeof entry === "string") : [];
    if (cascadeTo.length === 0) {
      issues.push(issue("error", `change_cascade.map.${id}.no_edges`, `cascade-edges.yaml change type "${id}" lists no cascade_to surfaces.`, mapPath));
    }
    for (const surface of cascadeTo) {
      if (!surfaces[surface]) {
        issues.push(
          issue(
            "error",
            `change_cascade.map.${id}.unknown_surface`,
            `cascade-edges.yaml change type "${id}" names surface "${surface}", which is not in the surface inventory.`,
            mapPath,
          ),
        );
      }
    }
    changeTypes[id] = { label: isRecord(value) ? asString(value.label) : undefined, cascade_to: cascadeTo };
  }

  return { surfaces, changeTypes };
}

const argv = process.argv.slice(2);
const args = parseCliArgs(argv);
const skillRoot = resolveSkillRoot(argv);
const issues: Issue[] = [];

const map = loadCascadeMap(skillRoot, issues);
const loaded = loadProjectState(args);
issues.push(...loaded.issues);

if (map && loaded.state) {
  const recorded = getPath(loaded.state, "lanes.post_launch_ops.changeCascade");

  const entries = Array.isArray(recorded) ? recorded : [];
  if (recorded !== undefined && !Array.isArray(recorded)) {
    issues.push(
      issue(
        "error",
        "change_cascade.block_malformed",
        "state/business-state.json lanes.post_launch_ops.changeCascade must be a list of recorded changes.",
        "state/business-state.json",
      ),
    );
  }

  const designStatus = asString(getPath(loaded.state, "lanes.design.status"))?.toLowerCase();
  if (
    designStatus === "succeeded" &&
    !entries.some((entry) => {
      if (!isRecord(entry)) return false;
      const values = Array.isArray(entry.types) ? entry.types : [];
      return values.some((value) => asString(value) === "design_contract_lock");
    })
  ) {
    issues.push(
      issue(
        "error",
        "change_cascade.design_contract_lock.missing",
        "The design lane is accepted, but no design_contract_lock cascade exists. Create the landing baseline and account for every public surface before build work can be called ready.",
        "state/business-state.json",
      ),
    );
  }

  let graded = 0;

  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(
        issue(
          "error",
          `change_cascade[${index}].malformed`,
          `change_cascade[${index}] must be a mapping with id, types, and surfaces.`,
          "state/business-state.json",
        ),
      );
      return;
    }

    const id = asString(entry.id) ?? `#${index}`;
    const types = Array.isArray(entry.types) ? entry.types.map(asString).filter((value): value is string => Boolean(value)) : [];

    if (types.length === 0) {
      issues.push(
        issue(
          "error",
          `change_cascade.${id}.type_missing`,
          `change_cascade entry "${id}" has no types. Classify every applicable type before calling the change done.`,
          "state/business-state.json",
        ),
      );
      return;
    }

    const unknownTypes = types.filter((type) => !map.changeTypes[type]);
    if (unknownTypes.length > 0) {
      const known = Object.keys(map.changeTypes).join(", ");
      issues.push(
        issue(
          "error",
          `change_cascade.${id}.unknown_type`,
          `change_cascade entry "${id}" has unknown type(s) "${unknownTypes.join(", ")}". Known types: ${known}.`,
          "state/business-state.json",
        ),
      );
      return;
    }

    graded += 1;
    const surfacesRecorded = isRecord(entry.surfaces) ? entry.surfaces : {};
    const requiredSurfaces = [...new Set(types.flatMap((type) => map.changeTypes[type]?.cascade_to ?? []))];

    // Every surface the map says is impacted must be accounted for.
    for (const surface of requiredSurfaces) {
      const record = surfacesRecorded[surface];
      const label = map.surfaces[surface]?.label ?? surface;

      if (!isRecord(record)) {
        issues.push(
          issue(
            "error",
            `change_cascade.${id}.${surface}.unaccounted`,
            `change_cascade entry "${id}" (${types.join(" + ")}) does not account for the ${label} surface. ` +
              `Record it as updated with evidence, unaffected with a reason, or blocked — a surface left out by omission is the change-cascade-incomplete failure card.`,
            "state/business-state.json",
          ),
        );
        continue;
      }

      const status = asString(record.status);
      if (!status || !SURFACE_STATUSES.has(status)) {
        issues.push(
          issue(
            "error",
            `change_cascade.${id}.${surface}.status_invalid`,
            `change_cascade entry "${id}" surface ${surface} has status "${status ?? "(missing)"}". Use one of: ${[...SURFACE_STATUSES].join(", ")}.`,
            "state/business-state.json",
          ),
        );
        continue;
      }

      if (status === "updated" && !asString(record.evidence)?.trim()) {
        issues.push(
          issue(
            "error",
            `change_cascade.${id}.${surface}.evidence_missing`,
            `change_cascade entry "${id}" marks ${label} updated but records no evidence. Point at the artifact, re-rendered asset, or console change that proves it.`,
            "state/business-state.json",
          ),
        );
      }

      if (status === "updated") {
        const variants = Array.isArray(record.variants) ? record.variants : [];
        for (const dimension of map.surfaces[surface]?.evidenceDimensions ?? []) {
          if (!variants.some((variant) => isRecord(variant) && asString(variant[dimension])?.trim() && asString(variant.evidence)?.trim())) {
            issues.push(
              issue(
                "error",
                `change_cascade.${id}.${surface}.${dimension}_evidence_missing`,
                `change_cascade entry "${id}" marks ${label} updated but has no ${dimension}-keyed variant evidence. Record every applicable ${dimension} separately.`,
                "state/business-state.json",
              ),
            );
          }
        }
      }

      if (status === "unaffected" && !asString(record.reason)?.trim()) {
        issues.push(
          issue(
            "error",
            `change_cascade.${id}.${surface}.reason_missing`,
            `change_cascade entry "${id}" marks ${label} unaffected but records no reason. One line of why it is untouched is the difference between a decision and an omission.`,
            "state/business-state.json",
          ),
        );
      }

      if (status === "blocked" && !asString(record.blocker)?.trim()) {
        issues.push(
          issue(
            "error",
            `change_cascade.${id}.${surface}.blocker_missing`,
            `change_cascade entry "${id}" marks ${label} blocked but records no blocker.`,
            "state/business-state.json",
          ),
        );
      }
    }

    // Surface ids outside the inventory are typos that would otherwise look
    // like diligence — a recorded surface nobody grades.
    for (const surface of Object.keys(surfacesRecorded)) {
      if (!map.surfaces[surface]) {
        issues.push(
          issue(
            "error",
            `change_cascade.${id}.${surface}.unknown_surface`,
            `change_cascade entry "${id}" records surface "${surface}", which is not in the cascade-edges.yaml inventory. Fix the id so it is actually graded.`,
            "state/business-state.json",
          ),
        );
      }
    }
  });

  if (!process.argv.includes("--json"))
    console.log(`Change cascade ledger — ${graded} recorded change(s) graded against ${Object.keys(map.changeTypes).length} change types.`);
}

reportAndExit("Change cascade check", issues);
