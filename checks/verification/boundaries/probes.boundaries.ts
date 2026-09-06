import { utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, type Harness } from "../fixtures/_harness.js";
import type { SpawnResult } from "../../../adapters/profile.js";
import { createDopplerAuthVerifier } from "../../../kernel/autonomy/probes/doppler.js";
import { createBudgetFundedVerifier, verifyBudgetFunded } from "../../../kernel/autonomy/probes/budget.js";
import { makeBalance, makeLedger, NOW } from "./_fixtures.js";
import type { BudgetFundedProbe, DopplerAuthProbe } from "../../../kernel/schema/types.js";

/**
 * The two real prerequisite probes (U9, R7): kernel/autonomy/probes/doppler.ts and
 * kernel/autonomy/probes/budget.ts. Every doppler case here injects a fake SpawnFn — this suite
 * never invokes a real `doppler` binary (the task's own fixture rule); the ONE real pass lives
 * outside any fixture/boundary suite, run by hand and recorded as evidence in the U9 report.
 */

/** Keys on the doppler subcommand (args[0]: "me" or "run") — exact match, never substring-fragile. */
function fakeSpawn(bySubcommand: Record<string, SpawnResult>, calls: string[][] = []): (command: string, args: readonly string[]) => SpawnResult {
  return (command, args) => {
    calls.push([command, ...args]);
    const subcommand = args[0] ?? "";
    const hit = bySubcommand[subcommand];
    if (!hit) return { status: 1, stdout: "", stderr: `fixture: no fake response registered for "${command} ${args.join(" ")}"` };
    return hit;
  };
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error("spawn ENOENT") as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}

function dopplerAuthProbe(id = "probe.doppler.1"): DopplerAuthProbe {
  return { id, kind: "doppler_auth", ttlSeconds: 3600, status: "unverified" };
}

function budgetFundedProbe(budgetRef: string, id = "probe.budget.1"): BudgetFundedProbe {
  return { id, kind: "budget_funded", ttlSeconds: 3600, status: "unverified", budgetRef };
}

export function register(harness: Harness): void {
  // --- doppler probe: not_found / auth_failed / error / verified, never a silent pass ----------

  harness.check("probes/doppler: a missing doppler binary classifies as not_found and lapses, never a silent pass", () => {
    const spawn = fakeSpawn({ me: { status: null, stdout: "", stderr: "", error: enoent() } });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/does/not/matter", spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed for a missing binary, got "${result.status}"`);
    assert(result.detail.includes("not_found"), `expected the detail to name not_found, got: ${result.detail}`);
  });

  harness.check("probes/doppler: an unauthenticated `doppler me` classifies as auth_failed and lapses with a named reason", () => {
    const spawn = fakeSpawn({ me: { status: 1, stdout: "", stderr: "You are not logged in. Please run `doppler login`." } });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/does/not/matter", spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed for an auth failure, got "${result.status}"`);
    assert(result.detail.includes("auth_failed"), `expected the detail to name auth_failed, got: ${result.detail}`);
  });

  harness.check("probes/doppler: `doppler me` ok but the scoped `doppler run` smoke fails classifies as a named error and lapses", () => {
    const spawn = fakeSpawn({
      me: { status: 0, stdout: "logged in as founder@example.com\n", stderr: "" },
      run: { status: 1, stdout: "", stderr: "internal error: project/config not found" },
    });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/does/not/matter", spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed when the scoped smoke fails, got "${result.status}"`);
    assert(result.detail.includes("doppler run smoke"), `expected the detail to name the smoke step, got: ${result.detail}`);
    assert(!result.detail.includes("auth_failed"), `a generic smoke failure must not be misclassified as auth_failed, got: ${result.detail}`);
  });

  harness.check("probes/doppler: a secret value leaked onto stdout from a failing `doppler run` smoke never reaches the returned detail", () => {
    // `doppler run -- printenv` materializes real secret values on ITS OWN stdout by design — that
    // is how the smoke test proves injection works. If the run then fails for any reason (partial
    // output before a crash, a killed process, etc.), that stdout must never be echoed back out
    // through the probe's detail string.
    const secretMarker = "STRIPE_SECRET_KEY=sk_live_should_never_leak_1234567890";
    const spawn = fakeSpawn({
      me: { status: 0, stdout: "logged in as founder@example.com\n", stderr: "" },
      run: { status: 1, stdout: `${secretMarker}\n`, stderr: "doppler: run terminated unexpectedly" },
    });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/does/not/matter", spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed when the scoped smoke fails, got "${result.status}"`);
    assert(!result.detail.includes(secretMarker), `secret value leaked into the doppler probe's detail string: ${result.detail}`);
    assert(!result.detail.includes("sk_live"), `secret value fragment leaked into the doppler probe's detail string: ${result.detail}`);
    assert(result.detail.includes("terminated unexpectedly"), "expected stderr (doppler's own error text, never a secret) to still be visible in the detail");
  });

  harness.check("probes/doppler: a leaked secret value that happens to match the auth-failure wording pattern still never reaches detail", () => {
    // Proves the stdout-stripping happens BEFORE classification, not only on the plain
    // generic-error path: a secret whose own text coincidentally contains auth-shaped wording
    // (e.g. "login", "401") must not leak even via the auth_failed branch.
    const secretMarker = "SOME_TOKEN=please-login-with-401-code-should-never-leak";
    const spawn = fakeSpawn({
      me: { status: 0, stdout: "logged in as founder@example.com\n", stderr: "" },
      run: { status: 1, stdout: `${secretMarker}\n`, stderr: "" },
    });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/does/not/matter", spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed, got "${result.status}"`);
    assert(!result.detail.includes(secretMarker), `secret value leaked into detail via the auth_failed path: ${result.detail}`);
    assert(!result.detail.includes("should-never-leak"), `secret fragment leaked into detail: ${result.detail}`);
  });

  harness.check("probes/doppler: both spawns ok but SECRETS.md is missing lapses without ever claiming verified", () => {
    const spawn = fakeSpawn({
      me: { status: 0, stdout: "logged in\n", stderr: "" },
      run: { status: 0, stdout: "PATH=/usr/bin\n", stderr: "" },
    });
    const verifier = createDopplerAuthVerifier({
      project: "fixture-proj",
      config: "production",
      secretsMdPath: path.join(harness.makeTempDir("doppler-probe-missing"), "SECRETS.md"),
      spawn,
    });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed for a missing SECRETS.md, got "${result.status}"`);
    assert(result.detail.includes("is missing"), `expected the detail to name the missing file, got: ${result.detail}`);
  });

  harness.check("probes/doppler: a stale SECRETS.md (older than maxSecretsMdAgeDays) lapses even though both spawns succeeded", () => {
    const dir = harness.makeTempDir("doppler-probe-stale");
    const secretsPath = path.join(dir, "SECRETS.md");
    writeFileSync(secretsPath, "# SECRETS\n", "utf8");
    const staleTime = new Date(Date.parse(NOW) - 90 * 24 * 3600 * 1000);
    utimesSync(secretsPath, staleTime, staleTime);
    const spawn = fakeSpawn({
      me: { status: 0, stdout: "logged in\n", stderr: "" },
      run: { status: 0, stdout: "PATH=/usr/bin\n", stderr: "" },
    });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: secretsPath, maxSecretsMdAgeDays: 30, spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "lapsed", `expected lapsed for a stale SECRETS.md, got "${result.status}"`);
    assert(result.detail.includes("stale"), `expected the detail to name staleness, got: ${result.detail}`);
  });

  harness.check("probes/doppler: doppler me + scoped doppler run + a fresh SECRETS.md all passing verifies", () => {
    const dir = harness.makeTempDir("doppler-probe-verified");
    const secretsPath = path.join(dir, "SECRETS.md");
    writeFileSync(secretsPath, "# SECRETS\nDoppler routes every value; see provider table.\n", "utf8");
    utimesSync(secretsPath, new Date(NOW), new Date(NOW));
    const spawn = fakeSpawn({
      me: { status: 0, stdout: "logged in as founder@example.com\n", stderr: "" },
      run: { status: 0, stdout: "RESEND_API_KEY=***\n", stderr: "" },
    });
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: secretsPath, spawn });
    const result = verifier(dopplerAuthProbe(), NOW);
    assert(result.status === "verified", `expected verified when every check passes, got "${result.status}": ${result.detail}`);
    assert(result.verifiedAt === NOW, "expected verifiedAt to be stamped with the evaluation time");
  });

  harness.check("probes/doppler: a probe of the wrong kind is unverified, not silently accepted or silently lapsed", () => {
    const spawn = fakeSpawn({});
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/irrelevant", spawn });
    const result = verifier(budgetFundedProbe("Revenue:2026-08"), NOW);
    assert(result.status === "unverified", `expected unverified for a mismatched probe kind, got "${result.status}"`);
  });

  harness.check("probes/doppler: never shells out for a wrong-kind probe (fails fast before spawning anything)", () => {
    const calls: string[][] = [];
    const verifier = createDopplerAuthVerifier({ project: "fixture-proj", config: "production", secretsMdPath: "/irrelevant", spawn: fakeSpawn({}, calls) });
    verifier(budgetFundedProbe("Revenue:2026-08"), NOW);
    assert(calls.length === 0, `expected zero spawns for a mismatched probe kind, got ${JSON.stringify(calls)}`);
  });

  // --- budget probe: pure, no I/O, fails closed on anything unfunded/malformed -----------------

  harness.check("probes/budget: a balance with positive allocation for the exact unit:period verifies", () => {
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 500)]);
    const result = verifyBudgetFunded("Revenue:2026-08", NOW, ledger);
    assert(result.status === "verified", `expected verified for a funded balance, got "${result.status}": ${result.detail}`);
  });

  harness.check("probes/budget: no balance for the referenced unit/period lapses (fail closed, not 'assume funded')", () => {
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 500)]);
    const result = verifyBudgetFunded("Revenue:2026-09", NOW, ledger);
    assert(result.status === "lapsed", `expected lapsed for a missing balance, got "${result.status}"`);
    assert(result.detail.includes("no budget balance found"), `expected a named reason, got: ${result.detail}`);
  });

  harness.check("probes/budget: a balance with zero allocation lapses even though the balance row exists", () => {
    const ledger = makeLedger([makeBalance("Growth", "2026-08", 0)]);
    const result = verifyBudgetFunded("Growth:2026-08", NOW, ledger);
    assert(result.status === "lapsed", `expected lapsed for a zero-allocation balance, got "${result.status}"`);
    assert(result.detail.includes("allocation"), `expected the detail to name the zero allocation, got: ${result.detail}`);
  });

  harness.check("probes/budget: a malformed budgetRef (no unit:period shape) lapses instead of throwing or silently passing", () => {
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 500)]);
    for (const malformed of ["ledger.fixture", "", ":2026-08", "Revenue:"]) {
      const result = verifyBudgetFunded(malformed, NOW, ledger);
      assert(result.status === "lapsed", `expected lapsed for malformed budgetRef "${malformed}", got "${result.status}"`);
    }
  });

  harness.check("probes/budget: createBudgetFundedVerifier rejects a probe of the wrong kind as unverified, and snapshots the ledger it was built with", () => {
    const fundedLedger = makeLedger([makeBalance("Revenue", "2026-08", 500)]);
    const verifier = createBudgetFundedVerifier(fundedLedger);
    const wrongKind = verifier(dopplerAuthProbe(), NOW);
    assert(wrongKind.status === "unverified", `expected unverified for a mismatched probe kind, got "${wrongKind.status}"`);

    const ok = verifier(budgetFundedProbe("Revenue:2026-08"), NOW);
    assert(ok.status === "verified", `expected verified against the ledger the verifier was built with, got "${ok.status}": ${ok.detail}`);
  });
}
