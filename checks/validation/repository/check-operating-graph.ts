#!/usr/bin/env node
/**
 * check-operating-graph.ts — pack reuse, isolation, kernel identity, and re-pin gate.
 *
 * A named business pack may bind the shared web-presence capability. App and food
 * pack-owned projections must not contain each other's forbidden facts. Kernel
 * code must not branch on business-pack identity. Default composeCatalog pins
 * exactly the verified firstparty package. --compose-all fails closed when both business packs share one catalog.
 *
 * npm script: check:operating-graph
 * Usage: tsx checks/validation/repository/check-operating-graph.ts --skill-root /path/to/skill
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { composeCatalog } from "../../../catalog/index.js";
import {
  APP_ONLY_TOKENS,
  FOOD_ONLY_TOKENS,
  WEB_PRESENCE_SLOTS,
  baseWorkflowsPreserved,
  forbiddenHits,
  packProjectionText,
  scanKernelBusinessIdentity,
} from "../../../catalog/packs/isolation.js";
import { PAID_GENERATIVE_AI_PACK_ID } from "../../../catalog/packs/types.js";
import { loadCapabilityYaml, loadPackClosure, loadPackManifests } from "../../../catalog/packs/load.js";
import { flagBoolean, flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--kernel-root"], key: "kernelRoot" },
  { flags: ["--compose-all"], key: "composeAll", kind: "boolean" },
]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const kernelRoot = path.resolve(flagString(flags, "kernelRoot") ?? path.join(skillRoot, "kernel"));
const composeAll = flagBoolean(flags, "composeAll");
const issues: Issue[] = [];

function addError(code: string, message: string, file?: string): void {
  issues.push(issue("error", code, message, file));
}

try {
  const base = composeCatalog(skillRoot);
  const owner = readFirstpartyPackage(skillRoot).snapshot.extension;
  const pins = base.composition?.packs ?? [];
  if (
    pins.length !== 1 ||
    pins[0]!.id !== "business-pack.consumer-business" ||
    pins[0]!.kind !== "business-pack" ||
    pins[0]!.version !== owner.version ||
    pins[0]!.revision !== owner.version ||
    !/^[a-f0-9]{64}$/.test(pins[0]!.contentDigest ?? "")
  ) {
    addError(
      "operating_graph.default_pin_polluted",
      "default composition must pin exactly the verified firstparty business pack version, revision, and content digest",
    );
  }

  try {
    const capability = loadCapabilityYaml(skillRoot, "capability.web-presence");
    for (const slot of WEB_PRESENCE_SLOTS) {
      if (!capability.extensionSlots.includes(slot)) {
        addError(
          "operating_graph.slot_missing",
          `capability.web-presence is missing extension slot ${slot}`,
          "catalog/capabilities/web-presence/capability.yaml",
        );
      }
    }
  } catch (error) {
    addError("operating_graph.capability_missing", error instanceof Error ? error.message : String(error));
  }

  try {
    const capability = loadCapabilityYaml(skillRoot, PAID_GENERATIVE_AI_PACK_ID);
    if (!capability.extensionSlots.includes("cost-boundary")) {
      addError(
        "operating_graph.slot_missing",
        "capability.paid-generative-ai is missing extension slot cost-boundary",
        "catalog/capabilities/paid-generative-ai/capability.yaml",
      );
    }
  } catch (error) {
    addError("operating_graph.capability_missing", error instanceof Error ? error.message : String(error));
  }

  const shipped = loadPackManifests(skillRoot);
  const required = ["capability.web-presence", "business-pack.consumer-app", "business-pack.food-product-contrast", "capability.paid-generative-ai"];
  for (const id of required) {
    if (!shipped.some((pack) => pack.id === id)) {
      addError("operating_graph.pack_missing", `required pack ${id} is not present under catalog/packs/`);
    }
  }

  const web = shipped.find((pack) => pack.id === "capability.web-presence");
  if (web) {
    try {
      const fromFile = loadCapabilityYaml(skillRoot, "capability.web-presence");
      const fromPack = web.capabilities[0];
      if (!fromPack || [...fromFile.extensionSlots].sort().join(",") !== [...fromPack.extensionSlots].sort().join(",")) {
        addError("operating_graph.capability_drift", "catalog/capabilities/web-presence/capability.yaml must match packs/web-presence/pack.yaml");
      }
    } catch {
      // capability_missing already recorded
    }
  }

  const paidAi = shipped.find((pack) => pack.id === PAID_GENERATIVE_AI_PACK_ID);
  if (paidAi) {
    try {
      const fromFile = loadCapabilityYaml(skillRoot, PAID_GENERATIVE_AI_PACK_ID);
      const fromPack = paidAi.capabilities[0];
      if (!fromPack || [...fromFile.extensionSlots].sort().join(",") !== [...fromPack.extensionSlots].sort().join(",")) {
        addError("operating_graph.capability_drift", "catalog/capabilities/paid-generative-ai/capability.yaml must match packs/paid-generative-ai/pack.yaml");
      }
    } catch (error) {
      addError("operating_graph.capability_missing", error instanceof Error ? error.message : String(error));
    }
    if (paidAi.createsProviderSpend !== true) {
      addError("operating_graph.capability_drift", `${PAID_GENERATIVE_AI_PACK_ID} must declare creates_provider_spend`);
    }
    const hits = [
      ...forbiddenHits(packProjectionText(paidAi, skillRoot), APP_ONLY_TOKENS),
      ...forbiddenHits(packProjectionText(paidAi, skillRoot), FOOD_ONLY_TOKENS),
    ];
    if (hits.length > 0) {
      addError(
        "operating_graph.pack_leakage",
        `paid-generative-ai pack contains isolated tokens: ${hits.join(", ")}`,
        "catalog/packs/paid-generative-ai/pack.yaml",
      );
    }
    try {
      const paidClosure = loadPackClosure(skillRoot, [PAID_GENERATIVE_AI_PACK_ID]);
      const paidCatalog = composeCatalog(skillRoot, paidClosure);
      const dropped = baseWorkflowsPreserved(base, paidCatalog);
      if (dropped.length > 0) {
        addError("operating_graph.shadow_divergence", `paid-generative-ai composition dropped base workflows: ${dropped.join(", ")}`);
      }
    } catch (error) {
      addError("operating_graph.identity_invalid", error instanceof Error ? error.message : String(error));
    }
  }

  const appClosure = shipped.some((pack) => pack.id === "business-pack.consumer-app") ? loadPackClosure(skillRoot, ["business-pack.consumer-app"]) : [];
  const foodClosure = shipped.some((pack) => pack.id === "business-pack.food-product-contrast")
    ? loadPackClosure(skillRoot, ["business-pack.food-product-contrast"])
    : [];
  const appPack = appClosure.find((pack) => pack.id === "business-pack.consumer-app");
  const foodPack = foodClosure.find((pack) => pack.id === "business-pack.food-product-contrast");

  if (appPack) {
    const hits = forbiddenHits(packProjectionText(appPack, skillRoot), FOOD_ONLY_TOKENS);
    if (hits.length > 0) {
      addError("operating_graph.pack_leakage", `consumer-app pack contains food tokens: ${hits.join(", ")}`, "catalog/packs/consumer-app/pack.yaml");
    }
  }
  if (foodPack) {
    const hits = forbiddenHits(packProjectionText(foodPack, skillRoot), APP_ONLY_TOKENS);
    if (hits.length > 0) {
      addError("operating_graph.pack_leakage", `food-product pack contains app tokens: ${hits.join(", ")}`, "catalog/packs/food-product-contrast/pack.yaml");
    }
  }

  if (appClosure.length > 0) {
    const appCatalog = composeCatalog(skillRoot, appClosure);
    const dropped = baseWorkflowsPreserved(base, appCatalog);
    if (dropped.length > 0) {
      addError("operating_graph.shadow_divergence", `consumer-app composition dropped base workflows: ${dropped.join(", ")}`);
    }
  }
  if (foodClosure.length > 0) {
    composeCatalog(skillRoot, foodClosure);
  }

  if (composeAll) {
    const combined = [...appClosure, ...foodClosure.filter((pack) => !appClosure.some((item) => item.id === pack.id))];
    if (appPack && foodPack) {
      const mixed = `${packProjectionText(appPack)}\n${packProjectionText(foodPack)}`;
      const foodHits = forbiddenHits(mixed, FOOD_ONLY_TOKENS);
      const appHits = forbiddenHits(mixed, APP_ONLY_TOKENS);
      if (foodHits.length > 0 && appHits.length > 0) {
        addError("operating_graph.pack_leakage", "composing consumer-app and food-product packs in one catalog mixes forbidden facts");
      }
      composeCatalog(skillRoot, combined);
    }
  }

  const kernelHits = scanKernelBusinessIdentity(kernelRoot);
  for (const hit of kernelHits) {
    addError("operating_graph.kernel_business_branch", `kernel branches on business identity at ${hit.file}: ${hit.excerpt}`, hit.file);
  }
} catch (error) {
  addError("operating_graph.identity_invalid", error instanceof Error ? error.message : String(error));
}

reportAndExit("Operating graph check", issues);
