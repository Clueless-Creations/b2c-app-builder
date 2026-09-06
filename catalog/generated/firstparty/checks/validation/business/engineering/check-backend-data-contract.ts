#!/usr/bin/env node
/**
 * check-backend-data-contract
 *
 * Enforces the backend-agnostic data contract before implementation hardens.
 * The shipped archetype prompt packs default to Supabase; without a recorded
 * contract a build silently couples to whichever provider the prompts named
 * (backend-by-default), authorization rules stay untested prose, and account
 * deletion stays a UI promise. When engineering/TECH_SPEC.md exists (or the engineering
 * lane is done), this validator requires:
 *   1. A "## Data Contract" section in engineering/TECH_SPEC.md.
 *   2. Its sub-sections: Backend Selection, Data Model, Authorization Model,
 *      Migrations And Environments.
 *   3. engineering done additionally requires: a named backend route
 *      (supabase/firebase/custom), and a named authorization enforcement
 *      (RLS, security rules, or middleware authz) that is grounded — the
 *      Authorization Model must state the rules are tested and point at at
 *      least one artifact that exists on disk (test file, migration, or
 *      proof doc). A bare "RLS" in prose cannot mark engineering done.
 *
 * See knowledge/engineering/backend-data-contract.md.
 *
 * Run:
 *   npm run check:backend-contract -- --root <app-repo-root>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

function includes(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includes(text, phrase));
}

const engineeringStatus = state ? asString(getPath(state, "lanes.engineering.status"))?.toLowerCase() : undefined;
const engineeringDone = engineeringStatus === "succeeded";

const specCandidates = ["engineering/TECH_SPEC.md", "engineering/engineering/TECH_SPEC.md"];
const specPath = specCandidates.find((candidate) => Boolean(readText(args.root, candidate)));
const spec = specPath ? readText(args.root, specPath) : undefined;

if (!spec || !specPath) {
  if (engineeringDone) {
    issues.push(
      issue(
        "error",
        "backend_contract.tech_spec_missing",
        "lanes.engineering is done but engineering/TECH_SPEC.md does not exist, so no data contract was ever recorded. " +
          "Create engineering/TECH_SPEC.md with the Data Contract section (see knowledge/engineering/backend-data-contract.md).",
        "engineering/TECH_SPEC.md",
      ),
    );
  }
  reportAndExit("Backend data contract check", issues);
  process.exit();
}

// ── Check 1: Data Contract section and sub-sections ─────────────────────────

if (!includes(spec, "Data Contract")) {
  issues.push(
    issue(
      engineeringDone ? "error" : "warning",
      "backend_contract.section_missing",
      `${specPath} has no "Data Contract" section. Record schema, authorization, and migration contracts before the build couples ` +
        "to a default provider. See knowledge/engineering/backend-data-contract.md.",
      specPath,
    ),
  );
} else {
  const requiredSubsections = ["Backend Selection", "Data Model", "Authorization Model", "Migrations And Environments"];
  for (const section of requiredSubsections) {
    if (!includes(spec, section)) {
      issues.push(
        issue(
          engineeringDone ? "error" : "warning",
          `backend_contract.subsection_missing.${section.toLowerCase().replaceAll(" ", "_")}`,
          `${specPath} Data Contract is missing the "${section}" sub-section.`,
          specPath,
        ),
      );
    }
  }
}

// ── Check 2: done-status proof floor ────────────────────────────────────────

if (engineeringDone) {
  if (!includesAny(spec, ["supabase", "firebase", "custom"])) {
    issues.push(
      issue(
        "error",
        "backend_contract.route_unnamed",
        `${specPath} names no backend route. Record supabase (default), firebase, or custom — with the reason — so the selection ` +
          "is a decision, not inertia (backend-by-default).",
        specPath,
      ),
    );
  }
  if (!includesAny(spec, ["rls", "security rules", "middleware authz"])) {
    issues.push(
      issue(
        "error",
        "backend_contract.authorization_unnamed",
        `${specPath} names no authorization enforcement. Record Postgres RLS policies, Firestore security rules, or middleware authz — ` +
          "untested authorization is a launch blocker per security-release-hardening.md.",
        specPath,
      ),
    );
  } else {
    // Ground the claim: naming an enforcement mechanism is words; done needs
    // work. The Authorization Model must state the rules are tested and name
    // at least one artifact that exists on disk.
    // Tolerate numbered/decorated headings ("### 3. Authorization Model") so
    // the extraction does not silently fall back to scanning the whole spec.
    const authSection = spec.split(/^#{2,4}\s+/m).find((section) => /^[\d.):\s-]*authorization model\b/i.test(section)) ?? spec;
    if (!/\btest(ed|s|ing)?\b/i.test(authSection)) {
      issues.push(
        issue(
          "error",
          "backend_contract.authorization_untested",
          `${specPath} Authorization Model never states the rules are tested (authenticated vs anonymous vs other-user access). ` +
            "Untested authorization cannot back a done engineering lane.",
          specPath,
        ),
      );
    }
    const authPaths = authSection.match(/[A-Za-z0-9_@-]+(?:\/[A-Za-z0-9_.@-]+)*\.[A-Za-z0-9]+/g) ?? [];
    if (!authPaths.some((relative) => existsSync(path.join(args.root, relative)))) {
      issues.push(
        issue(
          "error",
          "backend_contract.authorization_proof_missing",
          `${specPath} Authorization Model names no on-disk artifact (RLS test file, migration, or proof doc such as engineering/PRODUCTION_READINESS.md). ` +
            `Point the tested-authorization claim at a file that exists${authPaths.length > 0 ? ` (checked: ${authPaths.join(", ")})` : ""}.`,
          specPath,
        ),
      );
    }
  }
}

reportAndExit("Backend data contract check", issues);
