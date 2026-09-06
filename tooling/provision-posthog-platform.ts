#!/usr/bin/env node
/**
 * provision-posthog-platform.ts — create the platform project's PostHog resources.
 *
 * Applies hosted/builder-console/analytics/posthog-resources.json: the self-serve-checkout feature flag, the
 * signup/activation funnel insights, and the dashboard that holds them.
 *
 * Idempotent. Flags match on key, insights and dashboards on name, so re-running after an edit
 * updates rather than duplicating. Run it as often as the spec changes.
 *
 * SECURITY
 * --------
 * - The personal API key is read only from process.env.POSTHOG_PERSONAL_API_KEY. It is never
 *   logged, echoed, or written to disk.
 * - With credentials absent the tool prints what the founder must do and exits 0, matching
 *   probe-posthog.ts so a maintainer audit stays green rather than failing on a missing secret.
 *
 * USAGE
 *   POSTHOG_PROJECT_ID=<id> POSTHOG_PERSONAL_API_KEY=<key> \
 *     node --import tsx tooling/provision-posthog-platform.ts [--dry-run]
 *
 * The key needs these scopes: feature_flag:write, insight:write, dashboard:write.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "hosted", "builder-console", "analytics", "posthog-resources.json");

const dryRun = process.argv.includes("--dry-run");
const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
const host = (process.env.POSTHOG_APP_HOST?.trim() || "https://us.posthog.com").replace(/\/$/, "");

interface Spec {
  featureFlags: { key: string; [field: string]: unknown }[];
  dashboard: { name: string; [field: string]: unknown };
  insights: { name: string; [field: string]: unknown }[];
}

function stripComments<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripComments) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "$comment")
        .map(([key, nested]) => [key, stripComments(nested)]),
    ) as T;
  }
  return value;
}

async function api(method: "GET" | "POST" | "PATCH", route: string, body?: unknown): Promise<any> {
  const response = await fetch(`${host}/api/projects/${projectId}/${route}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    // The response body can echo the request. Report status and route only.
    throw new Error(`PostHog ${method} ${route} failed with ${response.status}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main(): Promise<void> {
  const spec = stripComments(JSON.parse(readFileSync(SPEC_PATH, "utf8")) as Spec);

  if (!apiKey || !projectId) {
    console.log("PostHog provisioning skipped — founder action required.\n");
    console.log("  1. Create the platform project in PostHog (the MCP cannot create projects).");
    console.log("  2. Export POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY, then re-run.");
    console.log("     Key scopes needed: feature_flag:write, insight:write, dashboard:write.\n");
    console.log(`Would create: ${spec.featureFlags.length} flag(s), 1 dashboard, ${spec.insights.length} insight(s).`);
    for (const flag of spec.featureFlags) console.log(`  flag      ${flag.key}`);
    console.log(`  dashboard ${spec.dashboard.name}`);
    for (const insight of spec.insights) console.log(`  insight   ${insight.name}`);
    process.exit(0);
  }

  // --- Feature flags: match on key ---
  const existingFlags: { id: number; key: string }[] = (await api("GET", "feature_flags/?limit=200")).results ?? [];
  for (const flag of spec.featureFlags) {
    const match = existingFlags.find((candidate) => candidate.key === flag.key);
    if (dryRun) {
      console.log(`[dry-run] flag ${flag.key}: would ${match ? "update" : "create"}`);
      continue;
    }
    if (match) {
      await api("PATCH", `feature_flags/${match.id}/`, flag);
      console.log(`flag ${flag.key}: updated`);
    } else {
      await api("POST", "feature_flags/", flag);
      console.log(`flag ${flag.key}: created`);
    }
  }

  // --- Dashboard: match on name ---
  const existingDashboards: { id: number; name: string }[] = (await api("GET", "dashboards/?limit=200")).results ?? [];
  const dashboardMatch = existingDashboards.find((candidate) => candidate.name === spec.dashboard.name);
  let dashboardId = dashboardMatch?.id;
  if (dryRun) {
    console.log(`[dry-run] dashboard ${spec.dashboard.name}: would ${dashboardMatch ? "reuse" : "create"}`);
  } else if (dashboardId === undefined) {
    dashboardId = (await api("POST", "dashboards/", spec.dashboard)).id;
    console.log(`dashboard ${spec.dashboard.name}: created (${dashboardId})`);
  } else {
    console.log(`dashboard ${spec.dashboard.name}: reused (${dashboardId})`);
  }

  // --- Insights: match on name, attached to the dashboard ---
  const existingInsights: { id: number; name: string }[] = (await api("GET", "insights/?limit=500")).results ?? [];
  for (const insight of spec.insights) {
    const match = existingInsights.find((candidate) => candidate.name === insight.name);
    if (dryRun) {
      console.log(`[dry-run] insight ${insight.name}: would ${match ? "update" : "create"}`);
      continue;
    }
    // `dashboards` is a full replacement, so it is always sent with the one dashboard we own.
    const payload = { ...insight, dashboards: dashboardId === undefined ? [] : [dashboardId] };
    if (match) {
      await api("PATCH", `insights/${match.id}/`, payload);
      console.log(`insight ${insight.name}: updated`);
    } else {
      await api("POST", "insights/", payload);
      console.log(`insight ${insight.name}: created`);
    }
  }

  if (!dryRun) console.log(`\nDone. Dashboard: ${host}/project/${projectId}/dashboard/${dashboardId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "provisioning failed");
  process.exit(1);
});
