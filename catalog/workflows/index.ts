import { workflows as buildRelease } from "./build-release.js";
import { workflows as growthRevenue } from "./growth-revenue.js";
import { workflows as maintenance } from "./maintenance.js";
import { workflows as operatingSystem } from "./operating-system.js";
import { workflows as operationsTrust } from "./operations-trust.js";
import { workflows as productExperience } from "./product-experience.js";

/** Every catalog workflow, including the typed ONB-00 through ONB-22 onboarding expansion. No count here on purpose: four of six file headers had silently rotted stale (2026-08-19 audit) — the compiled catalog and its count fixture are the source of truth. */
export const workflows = [...operatingSystem, ...operationsTrust, ...productExperience, ...buildRelease, ...growthRevenue, ...maintenance];
