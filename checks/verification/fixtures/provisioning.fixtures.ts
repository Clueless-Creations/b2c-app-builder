import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { internalVocabularyBlocklist } from "../../../kernel/session/digest.js";
import { ledgerRouteFor, PROVISIONING_MANIFEST } from "../../../adapters/provisioning/requirements.js";
import { accessRouteValues } from "../../../kernel/schema/types.js";
import {
  lookupDopplerSecretNames,
  lookupEnvFileKeys,
  requirementKey,
  resolveManifest,
  resolveRequirement,
  type ResolveSources,
} from "../../../adapters/provisioning/resolve.js";
import { buildSources, inScopeProviderIds, renderCheck, renderPlan } from "../../../adapters/provisioning/cli.js";
import type { CatalogInput } from "../../../kernel/engine/compile.js";
import type { ControlFile, GrantableDomainId } from "../../../kernel/schema/types.js";

/**
 * adapters/provisioning fixtures: the manifest declares (requirements.ts), presence is resolved from
 * real-shaped-but-fake sources (resolve.ts), and plan/check render founder-facing text from
 * those resolutions (cli.ts) — every case here builds a `ResolveSources` by hand and calls
 * resolveManifest/renderPlan/renderCheck in-process. This suite never spawns `doppler` and never
 * lets a real DOPPLER_TOKEN or PATH-resolved doppler binary anywhere near a fixture: every
 * Doppler-shaped fact is an injected fake ReadonlySet<string> of names, never a live lookup.
 */

const tsxBin = resolveTsxBin(skillRoot);

function emptySources(overrides: Partial<ResolveSources> = {}): ResolveSources {
  return { dopplerNames: new Set(), dopplerReachable: true, envKeys: new Set(), envFileFound: false, ...overrides };
}

export function register(harness: Harness): void {
  // --- manifest completeness ------------------------------------------------------------------
  // The catalog↔manifest join (every workflow providerId has a manifest entry or a documented
  // exception, and no exception is stale) is enforced as typed rules in catalog/validate.ts —
  // catalog_graph.workflow.provider_unknown and catalog_graph.provider.exception_stale — with
  // fixture coverage in catalog.fixtures.ts. The regex source-scan that used to guard it here
  // was retired when the typed rules landed: they read composed catalog data, which the scan's
  // own comment noted a variable/spread-built providers array could evade.

  harness.check(
    "provisioning/requirements: every manifest provider has at least one requirement, and every requirement has non-empty founder-facing text",
    () => {
      for (const provider of PROVISIONING_MANIFEST) {
        assert(provider.requirements.length > 0, `${provider.providerId} declares zero requirements`);
        for (const requirement of provider.requirements) {
          assert(requirement.name.trim().length > 0, `${provider.providerId} has a requirement with an empty name`);
          assert(requirement.why.trim().length > 0, `${provider.providerId}'s "${requirement.name}" has an empty why`);
        }
      }
    },
  );

  harness.check("provisioning/requirements: every manifest provider declares at least one known access route", () => {
    const known = new Set<string>(accessRouteValues);
    for (const provider of PROVISIONING_MANIFEST) {
      assert(provider.accessRoutes.length > 0, `${provider.providerId} declares zero access routes`);
      for (const route of provider.accessRoutes) {
        assert(known.has(route), `${provider.providerId} declares unknown access route "${route}"`);
      }
    }
  });

  harness.check("provisioning/requirements: ledgerRouteFor stays inside the agent-operations schema's route enum", () => {
    const schema = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/operations/agent-operations.schema.json"), "utf8")) as {
      $defs: { capability: { properties: { kind: { enum: string[] } } }; action: { properties: { route: { enum: string[] } } } };
    };
    const capabilityKinds = new Set(schema.$defs.capability.properties.kind.enum);
    const actionRoutes = new Set(schema.$defs.action.properties.route.enum);
    for (const route of accessRouteValues) {
      const ledgerRoute = ledgerRouteFor(route);
      if (ledgerRoute === "no_ledger_action") continue;
      assert(capabilityKinds.has(ledgerRoute), `ledgerRouteFor("${route}") = "${ledgerRoute}" is not a capability.kind enum member — the ledger enum drifted`);
      assert(actionRoutes.has(ledgerRoute), `ledgerRouteFor("${route}") = "${ledgerRoute}" is not an action.route enum member — the ledger enum drifted`);
    }
  });

  // --- external requirements are never satisfied by presence alone ---------------------------

  harness.check("provisioning/resolve: an external requirement stays unverifiable even when every secret and config sibling is present", () => {
    const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.revenuecat")!;
    const externalReq = provider.requirements.find((entry) => entry.kind === "external")!;
    const sources = emptySources({
      dopplerNames: new Set(["REVENUECAT_SECRET_API_KEY", "REVENUECAT_PUBLIC_IOS_KEY", "REVENUECAT_WEBHOOK_SECRET", "REVENUECAT_PROJECT_ID"]),
    });
    const resolution = resolveRequirement(provider.providerId, externalReq, sources);
    assert(
      resolution.status === "unverifiable",
      `expected "unverifiable" for an external fact backed by nothing but sibling secrets, got "${resolution.status}"`,
    );
  });

  harness.check("provisioning/resolve: an external requirement resolves satisfied ONLY via an explicit founder confirmation, never vacuously", () => {
    const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.google-play")!;
    const externalReq = provider.requirements.find((entry) => entry.name.includes("12 testers"))!;
    const key = requirementKey(provider.providerId, externalReq.name);

    const unconfirmed = resolveRequirement(provider.providerId, externalReq, emptySources());
    assert(unconfirmed.status === "unverifiable", `expected unconfirmed external to be "unverifiable", got "${unconfirmed.status}"`);

    const confirmed = resolveRequirement(provider.providerId, externalReq, emptySources({ founderConfirmedExternal: new Set([key]) }));
    assert(
      confirmed.status === "satisfied" && confirmed.source === "founder-confirmed",
      `expected a founder-confirmed external to resolve satisfied via source "founder-confirmed", got ${JSON.stringify(confirmed)}`,
    );
  });

  harness.check("provisioning/resolve: an unrelated founder confirmation does not leak onto a different requirement", () => {
    const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.mobai")!;
    const externalReq = provider.requirements.find((entry) => entry.kind === "external")!;
    const sources = emptySources({ founderConfirmedExternal: new Set([requirementKey("provider.google-play", "some other requirement")]) });
    const resolution = resolveRequirement(provider.providerId, externalReq, sources);
    assert(resolution.status === "unverifiable", `a confirmation for a different provider/requirement must not satisfy this one, got "${resolution.status}"`);
  });

  // --- resolver never returns or logs a value -------------------------------------------------

  harness.check("provisioning/resolve: lookupDopplerSecretNames returns parsed names but never echoes raw stdout into its own detail text", () => {
    const success = lookupDopplerSecretNames({
      workspaceDir: harness.tempRoot,
      spawn: () => ({ status: 0, stdout: '["RESEND_API_KEY","STRIPE_SECRET_KEY"]', stderr: "" }),
    });
    assert(success.reachable, "expected reachable on exit 0");
    assert(success.names.has("RESEND_API_KEY") && success.names.has("STRIPE_SECRET_KEY"), `expected both parsed names, got ${[...success.names].join(",")}`);
    assert(!success.detail.includes("RESEND_API_KEY"), `detail must summarize count, not echo raw stdout: "${success.detail}"`);

    const failure = lookupDopplerSecretNames({
      workspaceDir: harness.tempRoot,
      spawn: () => ({ status: 1, stdout: "", stderr: "error: You are not logged in. Run 'doppler login'." }),
    });
    assert(!failure.reachable, "expected unreachable on a nonzero exit");
    assert(failure.names.size === 0, "a failed lookup must never claim any secret name is present");
  });

  harness.check("provisioning/resolve: no returned RequirementResolution ever carries anything beyond the typed status/reason/source shape", () => {
    const sources = emptySources({ dopplerNames: new Set(["DOPPLER_TOKEN", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"]) });
    const resolutions = resolveManifest(sources);
    const allowedKeys = new Set(["providerId", "kind", "name", "status", "reason", "source"]);
    for (const provider of resolutions) {
      for (const requirement of provider.requirements) {
        const keys = Object.keys(requirement);
        const unexpected = keys.filter((key) => !allowedKeys.has(key));
        assert(unexpected.length === 0, `RequirementResolution for ${requirement.name} carries unexpected field(s): ${unexpected.join(", ")}`);
      }
    }
  });

  // --- .env presence parsing: keys only, never values, never sourced -------------------------

  harness.check("provisioning/resolve: .env presence parsing detects keys without sourcing the file or returning any value", () => {
    const dir = harness.makeTempDir("provisioning-env-parse");
    const envPath = path.join(dir, ".env");
    const secretValue = "sk_live_should_never_appear_anywhere_in_output_9f3d";
    writeFileSync(
      envPath,
      [
        "# a comment line, must be skipped",
        "",
        `RESEND_API_KEY=${secretValue}`,
        "export STRIPE_SECRET_KEY=another-secret-value-2b7c",
        "THIS LINE HAS NO EQUALS AND MUST BE SKIPPED",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_abc123",
      ].join("\n"),
      "utf8",
    );
    const result = lookupEnvFileKeys(envPath);
    assert(result.found, "expected the .env file to be found");
    assert(result.keys.size === 3, `expected exactly 3 detected keys (malformed line skipped), got ${result.keys.size}: ${[...result.keys].join(",")}`);
    for (const expected of ["RESEND_API_KEY", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]) {
      assert(result.keys.has(expected), `expected key "${expected}" to be detected`);
    }
    const serialized = JSON.stringify([...result.keys]);
    assert(
      !serialized.includes(secretValue) && !serialized.includes("another-secret-value-2b7c") && !serialized.includes("pk_test_abc123"),
      "the returned key set must never contain a value read from the file",
    );
  });

  harness.check("provisioning/resolve: .env presence parsing reports not-found for a missing file, without throwing", () => {
    const result = lookupEnvFileKeys(path.join(harness.tempRoot, "does-not-exist.env"));
    assert(
      result.found === false && result.keys.size === 0,
      `expected {found:false, keys:empty}, got ${JSON.stringify({ found: result.found, size: result.keys.size })}`,
    );
  });

  // --- plan output is founder-vocabulary only (reuses the digest blocklist convention) -------

  harness.check("provisioning/cli: plan output never leaks internal vocabulary (reuses digest.ts's blocklist)", () => {
    assert(internalVocabularyBlocklist.length > 0, "the blocklist must not be empty");
    const resolutions = resolveManifest(emptySources());
    const plan = renderPlan(resolutions);
    assert(plan.includes("PROVISIONING CHECKLIST"), "expected the plan to render its own header");
    const leaked = internalVocabularyBlocklist.filter((term) => plan.includes(term));
    assert(leaked.length === 0, `plan output leaked internal vocabulary: ${leaked.join(", ")}`);
  });

  harness.check("provisioning/cli: the blocklist scan on plan output is not vacuous (it actually catches a leak)", () => {
    const leaking = `${renderPlan(resolveManifest(emptySources()))}\nSee run.workflow.eng-change in domain.operations — schemaVersion 1.0.0, actionClass mutate.`;
    const leaked = internalVocabularyBlocklist.filter((term) => leaking.includes(term));
    assert(
      leaked.length > 0,
      "the blocklist scan failed to catch an obviously internal-vocabulary string appended to real plan output — the check would pass vacuously",
    );
  });

  // --- check exits non-zero on a missing required item ----------------------------------------

  harness.check("provisioning/cli: check reports zero missing when every in-scope requirement resolves satisfied or unverifiable", () => {
    const sources = emptySources({ dopplerNames: new Set(["DOPPLER_TOKEN"]), provisioningConfig: { dopplerProject: "acme", dopplerConfig: "production" } });
    const resolutions = resolveManifest(sources);
    const { missingCount } = renderCheck(resolutions, new Set(["provider.doppler"]));
    assert(missingCount === 0, `expected zero missing once DOPPLER_TOKEN + project/config are set, got ${missingCount}`);
  });

  harness.check("provisioning/cli: check reports a missing count > 0, and names the missing item, when an in-scope secret is absent", () => {
    const resolutions = resolveManifest(emptySources());
    const { output, missingCount } = renderCheck(resolutions, new Set(["provider.doppler"]));
    assert(missingCount > 0, "expected at least one missing requirement for provider.doppler with nothing configured");
    assert(output.includes("DOPPLER_TOKEN"), `expected the missing DOPPLER_TOKEN requirement to be named in check output:\n${output}`);
  });

  harness.check("provisioning/cli: check ignores requirements for providers outside the granted scope", () => {
    const resolutions = resolveManifest(emptySources());
    const { missingCount } = renderCheck(resolutions, new Set()); // nothing granted
    assert(missingCount === 0, `expected zero missing when the in-scope set is empty, got ${missingCount} — check must not block on ungranted providers`);
  });

  // --- provider.resend gets the same always-in-scope carve-out as provider.doppler -----------
  // kernel/session/run.ts's finish() calls pushDigest() on EVERY exit path of EVERY scheduled
  // session, independent of which domain is granted — so provider.resend must stay in scope even
  // when the only granted domain is not domain.operations (the domain workflow.operations.resend-
  // email-ops actually lives under).

  function minimalControl(grantedDomainId: GrantableDomainId): ControlFile {
    const now = "2026-08-05T00:00:00.000Z";
    const grants: ControlFile["grants"] = {
      [grantedDomainId]: { domainId: grantedDomainId, level: "run-with-guardrails", prerequisites: [], grantedAt: now, grantedBy: "founder", updatedAt: now },
    };
    return {
      schemaVersion: "1.0.0",
      updatedAt: now,
      businessSlug: "fixture-biz",
      killSwitch: { engaged: false, engagedAt: "", engagedBy: "", reason: "" },
      grants,
      waivers: [],
    };
  }

  function catalogWorkflow(overrides: Partial<CatalogInput["workflows"][number]>): CatalogInput["workflows"][number] {
    return {
      id: "workflow.fixture.placeholder",
      title: "Fixture workflow",
      domainId: "domain.product",
      actionClass: "draft",
      dependencies: [],
      outputPaths: [],
      providerIds: [],
      laneIds: [],
      founderOnlyActions: [],
      gateCommands: [],
      idempotent: true,
      ...overrides,
    };
  }

  harness.check(
    "provisioning/cli: provider.resend is force-scoped in-scope (same carve-out as provider.doppler) even when only a non-operations domain is granted",
    () => {
      // Only domain.product is granted — nowhere near domain.operations, which is where
      // workflow.operations.resend-email-ops (and therefore provider.resend) actually lives.
      const control = minimalControl("domain.product");
      const catalog: CatalogInput = {
        version: "catalog.fixture",
        artifacts: [],
        workflows: [
          catalogWorkflow({ id: "workflow.operations.resend-email-ops", domainId: "domain.operations", providerIds: ["provider.resend"] }),
          catalogWorkflow({ id: "workflow.product.some-granted-work", domainId: "domain.product", providerIds: [] }),
        ],
      };
      const inScope = inScopeProviderIds(control, catalog);
      assert(
        inScope.has("provider.resend"),
        "expected provider.resend to be force-scoped even though only domain.product (a non-operations domain) is granted — pushDigest() runs regardless of grants",
      );
      assert(!inScope.has("provider.stripe"), "sanity check: an unrelated, ungranted, unreferenced provider must not leak into scope");

      // And it actually surfaces in `check` output: with nothing configured, RESEND_API_KEY must
      // be reported as still needed, not silently skipped because no operations domain is granted.
      const { output, missingCount } = renderCheck(resolveManifest(emptySources()), inScope);
      assert(
        missingCount > 0 && output.includes("RESEND_API_KEY"),
        `expected check to report RESEND_API_KEY still needed even though only domain.product is granted:\n${output}`,
      );
    },
  );

  harness.check(
    "provisioning/cli: main() exits non-zero end-to-end when a required item is missing (spawned; a PATH-shadowing stub guarantees no real `doppler` binary is ever invoked)",
    () => {
      // PATH-shadow rather than rely on doppler being absent from this machine: put a stub
      // executable named "doppler" first on PATH that always exits 1 with no output, so the real
      // subprocess's own PATH lookup resolves to the stub regardless of what else is installed.
      // The stub never touches the network and never prints anything doppler-shaped.
      const stubDir = harness.makeTempDir("provisioning-doppler-stub-bin");
      const stubPath = path.join(stubDir, "doppler");
      writeFileSync(stubPath, "#!/bin/sh\nexit 1\n", "utf8");
      chmodSync(stubPath, 0o755);
      const env = { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ""}` };

      const workspace = harness.makeTempDir("provisioning-check-cli-workspace");
      const result = spawnSync(tsxBin, [path.join(skillRoot, "adapters/provisioning/cli.ts"), "check", "--workspace", workspace], {
        cwd: skillRoot,
        encoding: "utf8",
        timeout: 30_000,
        env,
      });
      assert(result.status === 1, `expected exit 1 on an unprovisioned workspace, got ${result.status}\n${result.stdout}\n${result.stderr}`);
      assert((result.stdout ?? "").includes("still needed"), `expected human-readable missing-item output, got:\n${result.stdout}`);
    },
  );

  // --- two-tier Doppler composition: shared platform project + this business's own project ----
  // (knowledge/operations/doppler-organization.md). Cross-project inheritance is a paid Doppler
  // feature, so resolve.ts composes the two tiers itself: business tier wins on conflict, and
  // which tier actually satisfied a requirement is reported back (useful founder information).

  harness.check("provisioning/resolve: two-tier composition — business overrides platform when both have the same name", () => {
    const sources = emptySources({
      dopplerNames: new Set(["RESEND_WEBHOOK_SECRET"]),
      dopplerPlatformNames: new Set(["RESEND_WEBHOOK_SECRET"]),
      dopplerPlatformReachable: true,
    });
    const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.resend")!;
    const requirement = provider.requirements.find((entry) => entry.name === "RESEND_WEBHOOK_SECRET")!;
    const resolution = resolveRequirement(provider.providerId, requirement, sources);
    assert(resolution.status === "satisfied", `expected satisfied, got ${resolution.status}`);
    assert(
      resolution.source === "doppler-business",
      `expected the business tier to win and be reported when both tiers carry the same name, got source "${resolution.source}"`,
    );
  });

  harness.check("provisioning/resolve: two-tier composition — a platform-only name still satisfies, reported as the platform tier", () => {
    const sources = emptySources({
      dopplerNames: new Set(), // business tier does NOT have it
      dopplerPlatformNames: new Set(["RESEND_WEBHOOK_SECRET"]),
      dopplerPlatformReachable: true,
    });
    const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.resend")!;
    const requirement = provider.requirements.find((entry) => entry.name === "RESEND_WEBHOOK_SECRET")!;
    const resolution = resolveRequirement(provider.providerId, requirement, sources);
    assert(resolution.status === "satisfied", `expected a platform-only name to satisfy the requirement, got ${resolution.status}`);
    assert(resolution.source === "doppler-platform", `expected source "doppler-platform" when only the platform tier has it, got "${resolution.source}"`);
    assert(resolution.reason.includes("platform"), `expected the reason to name the platform tier for founder visibility, got "${resolution.reason}"`);
  });

  harness.check("provisioning/resolve: two-tier composition — absent from both tiers (and .env) stays missing, regardless of reachability", () => {
    const sources = emptySources({
      dopplerNames: new Set(),
      dopplerReachable: true,
      dopplerPlatformNames: new Set(),
      dopplerPlatformReachable: true,
    });
    const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.resend")!;
    const requirement = provider.requirements.find((entry) => entry.name === "RESEND_WEBHOOK_SECRET")!;
    const resolution = resolveRequirement(provider.providerId, requirement, sources);
    assert(resolution.status === "missing", `expected missing when neither tier nor .env has the name, got ${resolution.status}`);
    assert(resolution.source === undefined, `a missing resolution must not claim a satisfying source, got "${resolution.source}"`);
    assert(
      !/couldn't be read/.test(resolution.reason),
      `when every source WAS readable the reason must be a plain definitive miss with no unreadable-source caveat, got "${resolution.reason}"`,
    );
  });

  // The honesty invariant, pinned in both directions. Reporting "not found in X" for an X that
  // was never readable is the failure this module exists to prevent: a founder acts on it by
  // re-adding a credential that may already be sitting in the tier the check couldn't open.
  // Two cases because a single anywhere-reachable boolean passes one of them by accident.
  for (const scenario of [
    {
      label: "the business tier",
      unreadable: "this business's Doppler project",
      readable: "your shared platform Doppler project",
      overrides: {
        dopplerReachable: false,
        dopplerDetail: "token does not have access to requested project",
        dopplerPlatformNames: new Set<string>(),
        dopplerPlatformReachable: true,
      },
    },
    {
      label: "the platform tier",
      unreadable: "your shared platform Doppler project",
      readable: "this business's Doppler project",
      overrides: {
        dopplerReachable: true,
        dopplerPlatformNames: new Set<string>(),
        dopplerPlatformReachable: false,
        dopplerPlatformDetail: "platform token expired",
      },
    },
  ]) {
    harness.check(
      `provisioning/resolve: two-tier composition — when ${scenario.label} is unreachable, a missing item never claims that tier was searched`,
      () => {
        const sources = emptySources(scenario.overrides);
        const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.resend")!;
        const requirement = provider.requirements.find((entry) => entry.name === "RESEND_WEBHOOK_SECRET")!;
        const resolution = resolveRequirement(provider.providerId, requirement, sources);
        assert(resolution.status === "missing", `expected missing, got ${resolution.status}`);
        assert(
          !new RegExp(`not found in[^—]*${scenario.unreadable}`).test(resolution.reason),
          `the reason must not claim ${scenario.unreadable} was searched when it was unreachable, got "${resolution.reason}"`,
        );
        assert(
          resolution.reason.includes(scenario.readable),
          `the reason should still name ${scenario.readable}, which genuinely was searched, got "${resolution.reason}"`,
        );
        assert(
          resolution.reason.includes(`${scenario.unreadable} couldn't be read`),
          `the reason must say plainly that ${scenario.unreadable} couldn't be read, got "${resolution.reason}"`,
        );
      },
    );
  }

  harness.check("provisioning/resolve: a multi-token config item satisfied out of two different tiers is not attributed to just one of them", () => {
    // POSTHOG_PROJECT_ID from the platform tier, POSTHOG_HOST from this business's own project.
    // Naming either tier as *the* source would be false for the other token, so no source is
    // claimed at all and the per-token breakdown carries the answer instead.
    const sources = emptySources({
      dopplerNames: new Set(["POSTHOG_HOST"]),
      dopplerReachable: true,
      dopplerPlatformNames: new Set(["POSTHOG_PROJECT_ID"]),
      dopplerPlatformReachable: true,
    });
    const requirement = { kind: "config", name: "POSTHOG_PROJECT_ID and POSTHOG_HOST/region", why: "fixture", verifiable: true } as const;
    const resolution = resolveRequirement("provider.posthog", requirement, sources);
    assert(resolution.status === "satisfied", `expected satisfied when every token is present somewhere, got ${resolution.status}`);
    assert(resolution.source === undefined, `a mixed-tier requirement must not claim one tier as the source, got "${resolution.source}"`);
    assert(
      resolution.reason.includes("POSTHOG_HOST in Doppler (this business's project)"),
      `expected per-token attribution for the business-tier token, got "${resolution.reason}"`,
    );
    assert(
      resolution.reason.includes("POSTHOG_PROJECT_ID in Doppler (your shared platform project)"),
      `expected per-token attribution for the platform-tier token, got "${resolution.reason}"`,
    );
  });

  harness.check(
    "provisioning/resolve+cli: two-tier composition end-to-end through buildSources/plan, via a PATH-shadowed `doppler` stub that answers differently per --project (never a real Doppler invocation)",
    () => {
      // The stub differentiates its response purely by which --project it was called with, so one
      // spawned process stands in for both the platform lookup and the business lookup buildSources
      // makes. It never touches the network and never prints anything beyond a canned name list.
      const stubDir = harness.makeTempDir("provisioning-two-tier-doppler-stub-bin");
      const stubPath = path.join(stubDir, "doppler");
      const stubScript = `#!/bin/sh
project=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) project="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$project" = "fixture-platform" ]; then
  echo '["RESEND_API_KEY","RESEND_WEBHOOK_SECRET"]'
elif [ "$project" = "fixture-business" ]; then
  echo '["RESEND_WEBHOOK_SECRET"]'
else
  echo '[]'
fi
exit 0
`;
      writeFileSync(stubPath, stubScript, "utf8");
      chmodSync(stubPath, 0o755);
      const env = { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ""}` };
      const restorePath = process.env.PATH;
      process.env.PATH = env.PATH;
      try {
        const workspace = harness.makeTempDir("provisioning-two-tier-buildsources-workspace");
        const args = {
          workspace,
          "doppler-project": "fixture-business",
          "doppler-config": "prd",
          "doppler-platform-project": "fixture-platform",
          "doppler-platform-config": "prd",
        };
        const sources = buildSources(args, workspace, undefined);
        assert(sources.dopplerPlatformNames?.has("RESEND_API_KEY"), "expected the platform-tier lookup to have run and found RESEND_API_KEY");
        assert(sources.dopplerNames.has("RESEND_WEBHOOK_SECRET"), "expected the business-tier lookup to have run and found RESEND_WEBHOOK_SECRET");

        const provider = PROVISIONING_MANIFEST.find((entry) => entry.providerId === "provider.resend")!;
        const apiKeyReq = provider.requirements.find((entry) => entry.name === "RESEND_API_KEY")!;
        const webhookReq = provider.requirements.find((entry) => entry.name === "RESEND_WEBHOOK_SECRET")!;
        const apiKeyResolution = resolveRequirement(provider.providerId, apiKeyReq, sources);
        const webhookResolution = resolveRequirement(provider.providerId, webhookReq, sources);
        assert(
          apiKeyResolution.status === "satisfied" && apiKeyResolution.source === "doppler-platform",
          `RESEND_API_KEY (platform-only) expected satisfied/doppler-platform, got ${JSON.stringify(apiKeyResolution)}`,
        );
        assert(
          webhookResolution.status === "satisfied" && webhookResolution.source === "doppler-business",
          `RESEND_WEBHOOK_SECRET (present in both, business must win) expected satisfied/doppler-business, got ${JSON.stringify(webhookResolution)}`,
        );

        // A name present in neither tier (DOPPLER_TOKEN, under this business's own doppler
        // requirement) still reports missing through the same two-tier-aware plan output.
        const plan = renderPlan(resolveManifest(sources));
        assert(plan.includes("your shared platform project"), `expected the plan to surface platform-tier attribution in founder-facing text:\n${plan}`);
        assert(plan.includes("this business's project"), `expected the plan to surface business-tier attribution in founder-facing text:\n${plan}`);
      } finally {
        process.env.PATH = restorePath;
      }
    },
  );

  // --- digest push with no configured from-address never attempts a network call -------------

  harness.check("provisioning: a digest push with no configured from-address never attempts a network call, regardless of key presence", () => {
    const digestModuleUrl = pathToFileURL(path.join(skillRoot, "kernel/session/digest.ts")).href;
    const driverPath = path.join(harness.makeTempDir("provisioning-push-driver"), "drive-no-from.mts");
    const driverSource = `
import { pushDigest, renderDigest } from ${JSON.stringify(digestModuleUrl)};
const rendered = renderDigest({ sessionId: "s1", businessSlug: "app", startedAt: "2026-08-05T00:00:00.000Z", endedAt: "2026-08-05T00:05:00.000Z", outcome: "completed", advanced: [], parked: [], spend: [], anomalies: [] });
let networkCalled = false;
const transport = { send: async () => { networkCalled = true; return { ok: true, id: "should-never-run" }; } };
async function main() {
  const result = await pushDigest(rendered, "founder@example.com", { env: { RESEND_API_KEY: "fixture-fake-key" }, transport });
  if (networkCalled) throw new Error("transport.send was invoked despite no from-address being configured");
  if (result.attempted !== false) throw new Error("expected attempted:false, got " + JSON.stringify(result));
  if (!result.skippedReason || !result.skippedReason.toLowerCase().includes("from-address")) throw new Error("expected a from-address-specific skip reason, got " + JSON.stringify(result));
  console.log("NO_FROM_DRIVER_OK");
}
main().catch((error) => { console.error(String(error)); process.exit(1); });
`;
    writeFileSync(driverPath, driverSource, "utf8");
    const result = spawnSync(tsxBin, [driverPath], { cwd: skillRoot, encoding: "utf8" });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert(result.status === 0 && output.includes("NO_FROM_DRIVER_OK"), `no-from driver failed (exit ${result.status}):\n${output}`);
  });
}
