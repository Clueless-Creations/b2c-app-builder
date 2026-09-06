#!/usr/bin/env node
/**
 * check-archetype-starter.ts — skill-integrity gate for the runnable archetype
 * starter scaffolds (docs/brainstorms/archetype-starter-scaffolds.md).
 *
 * Every shipped archetype pack with a starter must keep it complete, safe, and
 * faithful to the launch contracts:
 *
 *   - structure completeness: package manifest (pinned core deps + dev/build/
 *     typecheck scripts), lockfile present and parseable, Supabase wiring,
 *     proxy.ts session refresh, Stripe + RevenueCat stubs, PostHog event
 *     catalog, CI workflow
 *   - tested RLS: migrations enable row level security and create policies,
 *     and an RLS test file exists (backend-data-contract.md)
 *   - template safety: .env.example is names-only, no real-looking secret
 *     pattern anywhere, no committed .env files
 *   - analytics conventions: the event catalog carries the canonical snake_case
 *     core events plus the pack's named core-loop events
 *   - prompts stay the customization layer: the starter README maps every
 *     prompt file in the pack to the scaffold area it customizes
 *
 * Runs against the skill root (not a generated business repo).
 *
 * npm script: check:archetype-starter
 * Usage: tsx checks/validation/business/engineering/check-archetype-starter.ts --skill-root /path/to/skill
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectAllFiles, flagString, isRecord, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

// Canonical analytics lifecycle events every starter catalog must carry
// (analytics-attribution.md event catalog conventions).
const CORE_EVENTS = [
  "app_opened",
  "signup_started",
  "signup_completed",
  "attribution_source_selected",
  "paywall_viewed",
  "purchase_started",
  "purchase_completed",
];

// Files every starter must ship regardless of archetype.
const SHARED_FILES = [
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  ".gitignore.template",
  ".env.example",
  "proxy.ts",
  "lib/supabase/client.ts",
  "lib/supabase/server.ts",
  "lib/supabase/proxy.ts",
  "lib/analytics/events.ts",
  "lib/analytics/posthog-client.ts",
  "lib/billing/stripe.ts",
  "lib/billing/revenuecat.ts",
  "components/analytics-provider.tsx",
  "app/layout.tsx",
  "app/page.tsx",
  "app/login/page.tsx",
  "app/auth/confirm/route.ts",
  "app/api/stripe/checkout/route.ts",
  "app/api/stripe/webhook/route.ts",
  "app/api/revenuecat/webhook/route.ts",
  ".github/workflows/ci.yml",
];

const SHARED_DEPS = ["next", "react", "react-dom", "@supabase/supabase-js", "@supabase/ssr", "stripe", "posthog-js"];

const SHARED_ENV_NAMES = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "REVENUECAT_WEBHOOK_AUTH_TOKEN",
];

interface StarterPack {
  name: string;
  extraFiles: string[];
  extraDeps: string[];
  extraEnvNames: string[];
  coreLoopEvents: string[];
}

// Add an entry here when a new archetype pack ships a runnable starter.
const STARTER_PACKS: StarterPack[] = [
  {
    name: "social-network",
    extraFiles: ["app/feed/page.tsx"],
    extraDeps: [],
    extraEnvNames: [],
    coreLoopEvents: ["feed_viewed", "post_created", "post_liked", "follow_created"],
  },
  {
    name: "ai-chat-companion",
    extraFiles: ["app/chat/page.tsx", "app/api/chat/route.ts"],
    extraDeps: ["@anthropic-ai/sdk"],
    extraEnvNames: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
    coreLoopEvents: ["conversation_started", "chat_message_sent", "chat_response_completed", "usage_limit_reached"],
  },
  {
    name: "habit-tracker",
    extraFiles: ["app/today/page.tsx"],
    extraDeps: [],
    extraEnvNames: [],
    coreLoopEvents: ["habit_created", "habit_checked_in", "streak_extended", "streak_recovered"],
  },
  {
    name: "photo-ai-media",
    extraFiles: ["app/library/page.tsx", "app/api/generate/route.ts"],
    extraDeps: [],
    extraEnvNames: ["MEDIA_GENERATION_API_KEY"],
    coreLoopEvents: ["media_uploaded", "generation_started", "generation_completed", "media_shared"],
  },
];

// Same family of patterns as check-secret-routing's secretLike: a starter must
// never ship a real-looking credential, even in examples.
const secretLike = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|whsec_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN (PRIVATE|RSA|EC) PRIVATE KEY-----/;

const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];

for (const pack of STARTER_PACKS) {
  checkStarter(pack);
}

reportAndExit("Archetype starter scaffold check", issues);

function checkStarter(pack: StarterPack): void {
  const packRel = `surfaces/starters/${pack.name}`;
  const starterDir = path.join(args.skillRoot, packRel, "starter");
  const starterRel = `${packRel}/starter`;

  if (!existsSync(starterDir) || !statSync(starterDir).isDirectory()) {
    issues.push(
      issue(
        "error",
        `archetype_starter.${pack.name}.starter_missing`,
        `${starterRel} is missing. Shipped archetype packs must carry a runnable starter scaffold, not prompts alone.`,
        starterRel,
      ),
    );
    return;
  }

  // Structure completeness.
  for (const file of [...SHARED_FILES, ...pack.extraFiles]) {
    if (!existsSync(path.join(starterDir, file))) {
      issues.push(
        issue("error", `archetype_starter.${pack.name}.file_missing`, `${starterRel}/${file} is missing from the starter scaffold.`, `${starterRel}/${file}`),
      );
    }
  }

  // package.json: pinned core deps + dev/build/typecheck scripts.
  const manifest = readJson(path.join(starterDir, "package.json"));
  if (manifest) {
    const dependencies = isRecord(manifest.dependencies) ? manifest.dependencies : {};
    for (const dep of [...SHARED_DEPS, ...pack.extraDeps]) {
      if (typeof dependencies[dep] !== "string") {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.dependency_missing`,
            `${starterRel}/package.json must declare the ${dep} dependency.`,
            `${starterRel}/package.json`,
          ),
        );
      }
    }
    const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
    for (const script of ["dev", "build", "typecheck"]) {
      if (typeof scripts[script] !== "string") {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.script_missing`,
            `${starterRel}/package.json must declare the ${script} script.`,
            `${starterRel}/package.json`,
          ),
        );
      }
    }
  } else if (existsSync(path.join(starterDir, "package.json"))) {
    issues.push(
      issue("error", `archetype_starter.${pack.name}.manifest_invalid`, `${starterRel}/package.json is not valid JSON.`, `${starterRel}/package.json`),
    );
  }

  // Lockfile present and parseable (deterministic installs in business repos).
  const lockPath = path.join(starterDir, "package-lock.json");
  if (!existsSync(lockPath)) {
    issues.push(
      issue(
        "error",
        `archetype_starter.${pack.name}.lockfile_missing`,
        `${starterRel}/package-lock.json is missing. Starters ship a lockfile so installs are deterministic.`,
        `${starterRel}/package-lock.json`,
      ),
    );
  } else {
    const lock = readJson(lockPath);
    if (!lock || typeof lock.lockfileVersion !== "number") {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.lockfile_invalid`,
          `${starterRel}/package-lock.json is not a valid npm lockfile.`,
          `${starterRel}/package-lock.json`,
        ),
      );
    }
  }

  // .env.example: names-only, with the required names present.
  const envPath = path.join(starterDir, ".env.example");
  if (existsSync(envPath)) {
    const envText = readFileSync(envPath, "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      if (!/^[A-Z][A-Z0-9_]*=$/.test(trimmed)) {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.env_not_names_only`,
            `${starterRel}/.env.example line "${trimmed}" is not names-only. Every line must be NAME= with no value (secrets-management.md).`,
            `${starterRel}/.env.example`,
          ),
        );
      }
    }
    for (const name of [...SHARED_ENV_NAMES, ...pack.extraEnvNames]) {
      if (!envText.includes(`${name}=`)) {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.env_name_missing`,
            `${starterRel}/.env.example must list ${name}= so the secret routing is discoverable.`,
            `${starterRel}/.env.example`,
          ),
        );
      }
    }
  }

  // Template safety: no committed .env files, no real-looking secrets anywhere.
  for (const file of collectAllFiles(starterDir)) {
    const relative = path.relative(starterDir, file);
    const basename = path.basename(file);
    if (/^\.env(\..*)?$/.test(basename) && basename !== ".env.example") {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.env_file_committed`,
          `${starterRel}/${relative} must not be committed; only .env.example ships.`,
          `${starterRel}/${relative}`,
        ),
      );
      continue;
    }
    if (relative.split(path.sep).includes("node_modules") || basename === "package-lock.json") {
      continue;
    }
    if (secretLike.test(readFileSync(file, "utf8"))) {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.raw_secret_pattern`,
          `Potential raw secret pattern found in ${starterRel}/${relative}.`,
          `${starterRel}/${relative}`,
        ),
      );
    }
  }

  // Tested RLS per backend-data-contract.md.
  const migrationTexts = readSqlDir(path.join(starterDir, "supabase", "migrations"));
  if (migrationTexts.length === 0) {
    issues.push(
      issue(
        "error",
        `archetype_starter.${pack.name}.migrations_missing`,
        `${starterRel}/supabase/migrations must contain at least one .sql migration.`,
        `${starterRel}/supabase/migrations`,
      ),
    );
  } else {
    const combined = migrationTexts.join("\n").toLowerCase();
    if (!combined.includes("enable row level security")) {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.rls_not_enabled`,
          `${starterRel}/supabase/migrations never enables row level security. Every user-data table needs RLS (backend-data-contract.md).`,
          `${starterRel}/supabase/migrations`,
        ),
      );
    }
    if (!combined.includes("create policy")) {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.rls_policies_missing`,
          `${starterRel}/supabase/migrations defines no RLS policies (create policy ...).`,
          `${starterRel}/supabase/migrations`,
        ),
      );
    }
  }

  const testTexts = readSqlDir(path.join(starterDir, "supabase", "tests"));
  if (!testTexts.some((text) => /row.level.security|policy|rls/i.test(text))) {
    issues.push(
      issue(
        "error",
        `archetype_starter.${pack.name}.rls_tests_missing`,
        `${starterRel}/supabase/tests must contain an RLS test (owner access + cross-user/anonymous denial). Untested authorization rules are a launch blocker (backend-data-contract.md).`,
        `${starterRel}/supabase/tests`,
      ),
    );
  }

  // Analytics catalog: canonical core events + pack core-loop events, snake_case only.
  const eventsPath = path.join(starterDir, "lib", "analytics", "events.ts");
  if (existsSync(eventsPath)) {
    const eventsText = readFileSync(eventsPath, "utf8");
    const declared = Array.from(eventsText.matchAll(/:\s*"([^"]+)"/g)).map((match) => match[1] ?? "");
    for (const eventName of declared) {
      if (!/^[a-z][a-z0-9_]*$/.test(eventName)) {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.event_not_snake_case`,
            `${starterRel}/lib/analytics/events.ts declares "${eventName}", which is not snake_case (analytics-attribution.md conventions).`,
            `${starterRel}/lib/analytics/events.ts`,
          ),
        );
      }
    }
    for (const eventName of [...CORE_EVENTS, ...pack.coreLoopEvents]) {
      if (!declared.includes(eventName)) {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.event_missing`,
            `${starterRel}/lib/analytics/events.ts must declare the ${eventName} event.`,
            `${starterRel}/lib/analytics/events.ts`,
          ),
        );
      }
    }
  }

  // Prompts remain the customization layer: starter README maps every prompt.
  const readmePath = path.join(starterDir, "README.md");
  if (existsSync(readmePath)) {
    const readmeText = readFileSync(readmePath, "utf8");
    if (!readmeText.includes("mv .gitignore.template .gitignore")) {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.ignore_activation_missing`,
          `${starterRel}/README.md must activate the distributable ignore template before installation.`,
          `${starterRel}/README.md`,
        ),
      );
    }
    for (const promptFile of collectPromptFiles(path.join(args.skillRoot, packRel, "prompts"))) {
      if (!readmeText.includes(promptFile)) {
        issues.push(
          issue(
            "error",
            `archetype_starter.${pack.name}.prompt_unmapped`,
            `${starterRel}/README.md does not map prompt ${promptFile} to a scaffold area. Prompts are the customization layer; every prompt needs a row in the prompt -> scaffold map.`,
            `${starterRel}/README.md`,
          ),
        );
      }
    }
    if (!/backend-data-contract/.test(readmeText)) {
      issues.push(
        issue(
          "error",
          `archetype_starter.${pack.name}.backend_adaptability_missing`,
          `${starterRel}/README.md must state how the Supabase default adapts per backend-data-contract.md (firebase/custom routes replace the supabase pieces).`,
          `${starterRel}/README.md`,
        ),
      );
    }
  }
}

interface Args {
  skillRoot: string;
}

function parseArgs(argv: string[]): Args {
  // Only --skill-root is authoritative; ignore a stray --root from the fixture harness.
  const flags = parseFlags(argv, [{ flags: ["--skill-root"], key: "skillRoot" }]);
  return { skillRoot: flagString(flags, "skillRoot") ?? defaultSkillRoot };
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readSqlDir(directory: string): string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    return [];
  }
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(directory, name), "utf8"));
}

function collectPromptFiles(promptsDir: string): string[] {
  if (!existsSync(promptsDir)) {
    return [];
  }
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && entry.name.toLowerCase() !== "readme.md") {
        files.push(entry.name);
      }
    }
  }
  visit(promptsDir);
  return files.sort();
}
