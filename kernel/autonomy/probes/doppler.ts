import { existsSync, statSync } from "node:fs";
import { classifySpawnResult, defaultSpawn, type SpawnFn } from "../../../adapters/profile.js";
import type { PrerequisiteVerification, PrerequisiteVerifier } from "../prerequisites.js";

/**
 * The real `doppler_auth` prerequisite probe (R7, KTD5, U9). Originally inlined in
 * autonomy/prerequisites.ts (U4); moved here so the concrete Doppler mechanism has its own module
 * — mirroring adapters/{claude,codex,cursor}.ts's probe/smoke-test shape — and so its
 * not_found/auth_failed/ok classification can be fixture-tested via an injected SpawnFn (see
 * checks/verification/boundaries/probes.boundaries.ts) without ever shelling out to a real `doppler`
 * binary from a fixture. prerequisites.ts keeps the generic evaluation machinery
 * (SessionPrerequisiteCache, evaluatePrerequisites, createCompositeVerifier); this file owns only
 * the one probe that talks to a real external process.
 *
 * Real doppler me + scoped doppler run -- printenv + SECRETS.md freshness (the recipe recorded in
 * knowledge/operations/secrets-management.md). Never call this from a fixture/boundary test with
 * the default `spawn` — inject a fake `SpawnFn` instead; this factory is for evaluator.ts's
 * production wiring (kernel/session/run.ts) and for the one real, by-hand probe pass this session
 * records as evidence outside the fixture suites.
 */
export interface DopplerProbeOptions {
  readonly project: string;
  readonly config: string;
  readonly secretsMdPath: string;
  readonly maxSecretsMdAgeDays?: number;
  /** Injectable for fixtures/boundary tests; defaults to a real spawnSync (profile.ts's defaultSpawn). */
  readonly spawn?: SpawnFn;
}

const DOPPLER_CLI = "doppler";

export function createDopplerAuthVerifier(options: DopplerProbeOptions): PrerequisiteVerifier {
  const spawn = options.spawn ?? defaultSpawn;

  return (probe, now): PrerequisiteVerification => {
    if (probe.kind !== "doppler_auth") return { status: "unverified", detail: `probe kind "${probe.kind}" is not doppler_auth` };

    const me = classifySpawnResult("doppler me", spawn(DOPPLER_CLI, ["me"]), "ok");
    if (me.status !== "ok") {
      return { status: "lapsed", detail: `doppler me: ${me.status} — ${me.detail}` };
    }

    // `printenv` deliberately dumps every secret doppler injects to ITS OWN stdout — that's how
    // this smoke test proves the injection actually worked. That stdout must never reach
    // classifySpawnResult's `detail` (which can surface into anomalies/logs/digests): strip it
    // before classifying, regardless of exit status, and classify on stderr (doppler's own error
    // text, never a secret value) alone. `stdout` is not even passed through partially — no
    // truncation, no "first N chars" — it is unconditionally replaced.
    const rawSmoke = spawn(DOPPLER_CLI, ["run", "--project", options.project, "--config", options.config, "--", "printenv"]);
    const smoke = classifySpawnResult("doppler run", { ...rawSmoke, stdout: "" }, "ok");
    if (smoke.status !== "ok") {
      return { status: "lapsed", detail: `doppler run smoke (${options.project}/${options.config}): ${smoke.status} — ${smoke.detail}` };
    }

    if (!existsSync(options.secretsMdPath)) {
      return { status: "lapsed", detail: `${options.secretsMdPath} is missing` };
    }
    const maxAgeDays = options.maxSecretsMdAgeDays ?? 30;
    const ageDays = (Date.parse(now) - statSync(options.secretsMdPath).mtime.getTime()) / 86_400_000;
    if (ageDays > maxAgeDays) {
      return { status: "lapsed", detail: `${options.secretsMdPath} is ${Math.round(ageDays)} day(s) stale (max ${maxAgeDays})` };
    }

    return { status: "verified", verifiedAt: now, detail: "doppler me + scoped doppler run smoke + SECRETS.md freshness all passed" };
  };
}
