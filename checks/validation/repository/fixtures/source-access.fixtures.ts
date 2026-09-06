import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { evaluateCapabilityDelta } from "../../../../adapters/providers/evaluate.js";
import { loadSnapshotHashes } from "../../../../adapters/providers/load.js";
import { resolveTsxBin } from "../../../../tooling/lib/tsx-bin.js";
import { knowledgeFreshnessPinPath, loadKnowledgeFreshnessPin } from "../../../../tooling/lib/knowledge-freshness-pin.js";
import { skillRoot, type Harness } from "./_harness.js";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const privateUrl = "https://raw.githubusercontent.com/Emuthmartinez/b2c-app-builder/main/skill-version.json";
const manifest = JSON.stringify({ skill: "b2c-app-builder", version: "0.0.1", sourcePath: "." });
const primaryToken = "fixture-primary-token";
const secondaryToken = "fixture-secondary-token";

interface RequestRecord {
  kind: string;
  url?: string;
  authorization?: string | null;
  accept?: string | null;
  redirect?: string;
}

export function register(harness: Harness): void {
  let sequence = 0;
  const fixture = harness.makeEmptyFixture("source-access");
  const source = path.join(fixture, "source");
  const installed = path.join(fixture, "installed");
  for (const root of [source, installed]) {
    mkdirSync(root);
    writeFileSync(path.join(root, "skill-version.json"), manifest);
  }
  const check = (label: string, run: () => void): void => {
    try {
      run();
      harness.results.push({ label, ok: true, expectedCode: 0, actualCode: 0, output: "" });
    } catch (error) {
      harness.results.push({ label, ok: false, expectedCode: 0, actualCode: 1, output: error instanceof Error ? error.message : String(error) });
    }
  };
  const invoke = (script: string, args: string[], response: Record<string, unknown> = {}, tokens = { GH_TOKEN: "", GITHUB_TOKEN: "" }) => {
    const logFile = path.join(fixture, `http-${sequence++}.jsonl`);
    const scriptPath = path.isAbsolute(script) ? script : path.join(skillRoot, "checks/validation/repository", script);
    const result = spawnSync(resolveTsxBin(skillRoot), [scriptPath, ...args], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        ...tokens,
        B2C_APP_BUILDER_SKILL_SOURCE: "",
        B2C_APP_BUILDER_SKILL_INSTALLED: "",
        NODE_OPTIONS: `--import=${pathToFileURL(path.join(fixtureDir, "_source-http-preload.mjs")).href}`,
        B2C_APP_BUILDER_HTTP_FIXTURE: JSON.stringify({ logFile, body: manifest, ...response }),
      },
    });
    const output = `${result.stdout}\n${result.stderr}`;
    const records = existsSync(logFile)
      ? readFileSync(logFile, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as RequestRecord)
      : [];
    return { status: result.status, output, records, requests: records.filter((record) => record.kind === "request") };
  };
  const version = (remoteArgs: string[], response: Record<string, unknown> = {}, tokens?: { GH_TOKEN: string; GITHUB_TOKEN: string }) =>
    invoke("check-skill-version.ts", ["--source", source, "--installed", installed, ...remoteArgs], response, tokens);
  const scriptAlias = path.join(fixture, "client-script-alias");
  symlinkSync(path.join(skillRoot, "checks/validation/repository"), scriptAlias, "dir");
  for (const [args, code] of [
    [["--remote"], "remote_url_invalid"],
    [["--remote", privateUrl], "remote_unavailable"],
  ] as const) {
    check(`version CLI runs through a client symlink and fails closed: ${code}`, () => {
      const result = invoke(path.join(scriptAlias, "check-skill-version.ts"), ["--source", source, "--installed", installed, ...args]);
      assert.equal(result.status, 1, result.output);
      assert.ok(result.output.includes(`ERROR skill_version.${code}`), result.output);
      assert.equal(result.requests.length, 0);
    });
  }

  for (const status of [401, 404]) {
    check(`private remote HTTP ${status} is an error even with plausible manifest JSON`, () => {
      const result = version(["--remote-url", privateUrl], { status }, { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken });
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /ERROR skill_version\.remote_unavailable/u);
      assert.equal(result.requests.length, 1, "A denied request must not retry anonymously.");
      assert.equal(result.records.filter((record) => record.kind === "body").length, 0, "A denied body must not be read.");
      assert.doesNotMatch(result.output, /skill_version\.stale/u);
    });
  }
  check("remote redirects cannot turn denied JSON into a successful version comparison", () => {
    const result = version(["--remote", privateUrl], { statuses: [302, 401] }, { GH_TOKEN: primaryToken, GITHUB_TOKEN: "" });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /ERROR skill_version\.remote_unavailable/u);
    assert.equal(result.requests.length, 1, "A redirect must not send another request.");
    assert.equal(result.records.filter((record) => record.kind === "body").length, 0);
  });
  check("private raw version reads use the contents API and GH_TOKEN precedence", () => {
    const result = version(["--remote", privateUrl], {}, { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken });
    assert.equal(result.status, 0, result.output);
    assert.equal(result.requests.length, 1);
    const request = result.requests[0]!;
    const target = new URL(request.url!);
    assert.equal(target.hostname, "api.github.com");
    assert.equal(target.pathname, "/repos/Emuthmartinez/b2c-app-builder/contents/skill-version.json");
    assert.equal(target.searchParams.get("ref"), "main");
    assert.equal(request.authorization, `Bearer ${primaryToken}`);
    assert.equal(request.accept, "application/vnd.github.raw+json");
    assert.equal(request.redirect, "error");
  });
  check("a missing private-source token fails before any network request", () => {
    const result = version(["--remote", privateUrl]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /skill_version\.remote_unavailable/u);
    assert.equal(result.requests.length, 0);
  });
  for (const args of [["--remote"], ["--remote-url", ""], ["--remote-url", "--all-runtimes"]]) {
    check(`malformed remote arguments fail without self-comparison: ${JSON.stringify(args)}`, () => {
      const result = version(args, { offline: true });
      assert.equal(result.status, 1, result.output);
      assert.match(result.output, /skill_version\.remote_url_invalid/u);
      assert.equal(result.requests.length, 0);
    });
  }
  check("local and all-runtime version checks remain offline", () => {
    const result = version(["--all-runtimes", "--runtimes-root", path.join(fixture, "clients")], { offline: true });
    assert.equal(result.status, 0, result.output);
    assert.equal(result.requests.length, 0);
  });
  check("foreign HTTPS sources never receive either GitHub token", () => {
    const result = version(["--remote", "https://content.example.test/version.json"], {}, { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken });
    assert.equal(result.status, 0, result.output);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0]!.authorization, null);
  });
  check("an already-followed public redirect cannot verify a remote manifest", () => {
    const result = version(["--remote", "https://content.example.test/version.json"], { redirected: true });
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /skill_version\.remote_unavailable/u);
    assert.equal(result.records.filter((record) => record.kind === "body").length, 0);
  });
  check("URL userinfo and token-bearing diagnostics cannot leak", () => {
    const url = new URL(privateUrl);
    url.username = "fixture-userinfo";
    url.password = primaryToken;
    const result = version(
      ["--remote-url", url.href],
      { error: `network ${primaryToken} ${secondaryToken}` },
      { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken },
    );
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /skill_version\.remote_unavailable/u);
    for (const secret of [primaryToken, secondaryToken, "fixture-userinfo"]) assert.ok(!result.output.includes(secret), result.output);
    assert.equal(result.requests.length, 0);
  });
  check("remote URL path tokens and arbitrary transport errors remain private", () => {
    const result = version(
      ["--remote-url", `https://content.example.test/${primaryToken}`],
      { error: `transport ${primaryToken} ${secondaryToken}` },
      { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken },
    );
    assert.equal(result.status, 1, result.output);
    for (const secret of [primaryToken, secondaryToken]) assert.ok(!result.output.includes(secret), result.output);
  });

  const registry = path.join(fixture, "source-registry.json");
  const reportRoot = path.join(fixture, "refresh");
  writeFileSync(
    registry,
    JSON.stringify({
      sources: [{ id: "private-source", name: "Private source", source_type: "raw_manifest", url: privateUrl, refresh_cadence_days: 7, owner: "fixture" }],
    }),
  );
  const refresh = (status: number, body = "same authorized bytes") =>
    invoke(
      "refresh-source-freshness.ts",
      ["--root", fixture, "--registry", registry, "--out-dir", reportRoot],
      { status, body },
      { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken },
    );
  const snapshotPath = path.join(reportRoot, "source-snapshots/current.json");
  const snapshot = (): Record<string, unknown> => (JSON.parse(readFileSync(snapshotPath, "utf8")) as { sources: Record<string, unknown>[] }).sources[0]!;
  const repositoryRoot = path.resolve(skillRoot, "../..");
  const sourceSkillRoot = path.join(repositoryRoot, "skill", "b2c-app-builder");
  const hasSourceSkillLayout = path.resolve(sourceSkillRoot) === path.resolve(skillRoot);
  const isSourceCheckout = hasSourceSkillLayout && existsSync(path.join(repositoryRoot, ".git"));
  const isInstalledRuntime = !hasSourceSkillLayout && existsSync(path.join(skillRoot, "skill-version.json"));
  if (!isSourceCheckout && !isInstalledRuntime) {
    check("source-access fixtures run from a source checkout or an installed runtime", () => {
      assert.fail(`unrecognized skill layout at ${skillRoot}`);
    });
  }
  for (const absolute of [false, true]) {
    check(`source refresh updates the packaged knowledge pin from custom output with a ${absolute ? "absolute" : "relative"} target`, () => {
      const pinRoot = path.join(fixture, `pin-${absolute}`);
      const outputRoot = path.join(fixture, `pin-report-${absolute}`);
      const result = invoke(
        "refresh-source-freshness.ts",
        [
          "--root",
          fixture,
          "--registry",
          registry,
          "--knowledge-pin-root",
          absolute ? pinRoot : path.relative(fixture, pinRoot),
          "--out-dir",
          path.relative(fixture, outputRoot),
          "--timeout-ms",
          "250",
        ],
        { body: "reviewed fixture source bytes" },
        { GH_TOKEN: primaryToken, GITHUB_TOKEN: secondaryToken },
      );
      assert.equal(result.status, 0, result.output);
      assert.equal(result.requests.length, 1);
      const target = path.join(pinRoot, knowledgeFreshnessPinPath);
      assert.ok(existsSync(target), "refresh must produce the packaged knowledge pin");
      const currentSnapshot = path.join(outputRoot, "source-snapshots/current.json");
      const pin = loadKnowledgeFreshnessPin(pinRoot, currentSnapshot);
      const snapshotData = JSON.parse(readFileSync(currentSnapshot, "utf8"));
      assert.equal(pin.generatedAt, snapshotData.generated_at);
      assert.equal(snapshotData.sources[0].status, "fresh");
      assert.ok(existsSync(path.join(outputRoot, "SOURCE_REFRESH_REPORT.md")), "custom report output must remain supported");
    });
  }
  check("source refresh rejects a missing knowledge pin target before any request", () => {
    for (const args of [["--knowledge-pin-root"], ["--knowledge-pin-root", ""], ["--knowledge-pin-root", "--timeout-ms", "250"]]) {
      const result = invoke("refresh-source-freshness.ts", [
        "--root",
        fixture,
        "--registry",
        registry,
        "--out-dir",
        path.join(fixture, "invalid-pin"),
        ...args,
      ]);
      assert.equal(result.status, 1, result.output);
      assert.equal(result.requests.length, 0, "invalid pin configuration must fail before fetching");
    }
  });
  check("source refresh fails when it cannot write the requested knowledge pin", () => {
    const pinRoot = path.join(fixture, "pin-path-is-a-file");
    writeFileSync(pinRoot, "fixture");
    const result = invoke("refresh-source-freshness.ts", [
      "--root",
      fixture,
      "--registry",
      registry,
      "--out-dir",
      path.join(fixture, "pin-write-failure"),
      "--knowledge-pin-root",
      pinRoot,
    ]);
    assert.equal(result.status, 1, result.output);
  });
  check("source refresh CLI runs through a client symlink and records missing-token blockage", () => {
    const aliasReport = path.join(fixture, "alias-refresh");
    const result = invoke(path.join(scriptAlias, "refresh-source-freshness.ts"), ["--root", fixture, "--registry", registry, "--out-dir", aliasReport]);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /sources=1 changed=0 blocked=1/u);
    assert.equal(result.requests.length, 0);
    const report = JSON.parse(readFileSync(path.join(aliasReport, "source-snapshots/current.json"), "utf8"));
    assert.equal(report.sources[0].status, "blocked");
    assert.equal(report.sources[0].hash, undefined);
  });
  check("freshness preserves trusted hash through 200, 401, 404, and the same 200 bytes", () => {
    assert.equal(refresh(200).status, 0);
    const original = snapshot();
    assert.equal(original.status, "fresh");
    assert.equal(typeof original.hash, "string");
    const providerRoot = path.join(fixture, "provider-consumer");
    const providers = path.join(providerRoot, "catalog/providers");
    mkdirSync(providers, { recursive: true });
    writeFileSync(
      path.join(providers, "fixture.yaml"),
      JSON.stringify({
        schema_version: 1,
        id: "fixture",
        version: "1.0.0",
        kind: "billing",
        title: "Fixture",
        source_ids: ["private-source"],
        features: [{ id: "read", required: true, notes: "Read the source." }],
        deprecations: [],
        machine_readable_feeds: [],
        review_cadence_days: 7,
      }),
    );
    writeFileSync(
      path.join(providers, "capability-delta.yaml"),
      JSON.stringify({
        schema_version: 1,
        reviewed_at: "2026-08-28",
        entries: [
          {
            provider_id: "fixture",
            source_id: "private-source",
            from_hash: "unsnapped",
            to_hash: original.hash,
            classification: "docs",
            summary: "Fixture content was verified.",
            migration: "none",
          },
        ],
      }),
    );
    const evaluate = () => evaluateCapabilityDelta({ skillRoot: providerRoot, snapshotPath }).errors;
    assert.deepEqual(evaluate(), []);
    for (const status of [401, 404]) {
      const result = refresh(status);
      assert.equal(result.status, 0, result.output);
      const denied = snapshot();
      assert.equal(denied.status, "blocked");
      assert.equal(denied.changed, false);
      assert.equal(denied.hash, undefined);
      assert.equal(denied.previous_hash, original.hash);
      assert.equal(denied.http_status, status);
      assert.equal(result.records.filter((record) => record.kind === "body").length, 0);
      assert.deepEqual(evaluate(), [], "Denied refresh lost the classified successful baseline.");
    }
    assert.equal(refresh(200).status, 0);
    const restored = snapshot();
    assert.equal(restored.status, "fresh");
    assert.equal(restored.changed, false);
    assert.equal(restored.hash, original.hash);
    assert.equal(restored.previous_hash, original.hash);
    assert.deepEqual(evaluate(), []);
    assert.equal(refresh(200, "changed authorized bytes").status, 0);
    assert.match(evaluate().join("\n"), /does not match snapshot hash/u);
  });
  check("capability-delta rejects error hashes and unproven retained baselines", () => {
    const input = path.join(fixture, "baseline-provenance.json");
    const checked = "2026-08-01T00:00:00Z";
    writeFileSync(
      input,
      JSON.stringify({
        sources: [
          { id: "incomplete", hash: "unverified" },
          { id: "verified", status: "fresh", http_status: 200, checked_at: checked, hash: "verified" },
          { id: "retained", status: "blocked", http_status: 401, last_verified_at: checked, previous_hash: "retained" },
          { id: "invalid-http-404", status: "fresh", http_status: 404, checked_at: checked, hash: "error-page" },
          { id: "invalid-http-429", status: "changed", http_status: 429, checked_at: checked, hash: "checkpoint" },
          { id: "unproven", status: "blocked", checked_at: checked, previous_hash: "unknown" },
          { id: "bad-time", status: "blocked", last_verified_at: "invalid", previous_hash: "unknown" },
        ],
      }),
    );
    const loaded = loadSnapshotHashes(input);
    assert.equal(loaded.issue, undefined);
    assert.deepEqual(
      [...loaded.hashes],
      [
        ["verified", "verified"],
        ["retained", "retained"],
      ],
    );
  });
  check("the registered plist DTD uses explicit HTTPS retrieval without changing its identity", () => {
    const registryData = parseYaml(readFileSync(path.join(skillRoot, "checks/validation/repository/source-registry.yaml"), "utf8"));
    const entry = registryData.sources.find((item: { id: string }) => item.id === "www-apple-com-dtds-propertylist-1-0-dtd");
    const retrieval = new URL(entry.url);
    assert.equal(retrieval.protocol, "http:");
    retrieval.protocol = "https:";
    assert.equal(entry.fetch_url, retrieval.href);
    const publicRegistry = path.join(fixture, "public-registry.json");
    const publicReport = path.join(fixture, "public-refresh");
    writeFileSync(publicRegistry, JSON.stringify({ sources: [entry] }));
    const args = ["--root", fixture, "--registry", publicRegistry, "--out-dir", publicReport];
    const result = invoke("refresh-source-freshness.ts", args, { body: "DTD fixture bytes" });
    assert.equal(result.status, 0, result.output);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0]!.url, retrieval.href);
    assert.equal(result.requests[0]!.authorization, null);
    const report = JSON.parse(readFileSync(path.join(publicReport, "source-snapshots/current.json"), "utf8"));
    assert.equal(report.sources[0].url, entry.url);
    assert.equal(report.sources[0].fetch_url, entry.fetch_url);
    assert.equal(report.sources[0].status, "fresh");
    const redirected = invoke("refresh-source-freshness.ts", args, { status: 302 });
    assert.equal(redirected.status, 0, redirected.output);
    assert.match(redirected.output, /blocked=1/u);
    assert.equal(redirected.records.filter((record) => record.kind === "body").length, 0);
    writeFileSync(publicRegistry, JSON.stringify({ sources: [{ ...entry, fetch_url: undefined }] }));
    const insecure = invoke("refresh-source-freshness.ts", args);
    assert.equal(insecure.status, 0, insecure.output);
    assert.match(insecure.output, /blocked=1/u);
    assert.equal(insecure.requests.length, 0);
  });
  for (const status of [401, 404, 302]) {
    check(`source refresh never consumes or hashes HTTP ${status}`, () => {
      const result = refresh(status);
      assert.equal(result.status, 0, result.output);
      assert.equal(snapshot().status, "blocked");
      assert.equal(snapshot().hash, undefined);
      assert.equal(result.records.filter((record) => record.kind === "body").length, 0);
    });
  }
  const staleAt = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const currentAt = new Date().toISOString();
  const checkRoot = path.join(fixture, "age-check");
  const ageSnapshot = path.join(checkRoot, "docs/source-freshness/source-snapshots/current.json");
  mkdirSync(path.dirname(ageSnapshot), { recursive: true });
  const ageCheck = (entry: Record<string, unknown>) => {
    writeFileSync(ageSnapshot, JSON.stringify({ sources: [{ url: privateUrl, ...entry }] }));
    return invoke("check-source-freshness.ts", ["--root", checkRoot, "--registry", registry], { offline: true });
  };
  check("invalid retrieval configuration fails rather than using the source identifier", () => {
    const invalidRegistry = path.join(fixture, "invalid-retrieval.json");
    const sourceEntry = JSON.parse(readFileSync(registry, "utf8")).sources[0];
    for (const fetchUrl of [42, privateUrl.replace("https:", "http:")]) {
      writeFileSync(invalidRegistry, JSON.stringify({ sources: [{ ...sourceEntry, fetch_url: fetchUrl }] }));
      const checked = invoke("check-source-freshness.ts", ["--root", checkRoot, "--registry", invalidRegistry], { offline: true });
      assert.equal(checked.status, 1, checked.output);
      assert.match(checked.output, /fetch_url\.invalid/u);
      const refreshed = invoke("refresh-source-freshness.ts", [
        "--root",
        fixture,
        "--registry",
        invalidRegistry,
        "--out-dir",
        path.join(fixture, "invalid-refresh"),
      ]);
      assert.equal(refreshed.requests.length, 0);
      if (typeof fetchUrl === "number") assert.equal(refreshed.status, 1, refreshed.output);
      else assert.match(refreshed.output, /blocked=1/u);
    }
  });
  check("a failed check does not renew the trusted freshness age", () => {
    const result = ageCheck({ status: "blocked", http_status: 401, checked_at: currentAt, last_verified_at: staleAt, previous_hash: "verified-baseline" });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /source_freshness\.sources\.0\.overdue/u);
    assert.equal(result.requests.length, 0);
  });
  check("timestamp-only snapshots do not prove successful retrieval", () => {
    const result = ageCheck({ checked_at: staleAt });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /source_freshness\.sources\.0\.unverified/u);
  });
  check("a blocked snapshot with no trusted success is reported as unverified", () => {
    const result = ageCheck({ status: "blocked", checked_at: currentAt });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /source_freshness\.sources\.0\.unverified/u);
    assert.match(result.output, /A missing snapshot row or failed attempt does not verify freshness\./u);
  });
  check("a registered source missing from non-empty snapshot state is reported as unverified", () => {
    writeFileSync(
      ageSnapshot,
      JSON.stringify({ sources: [{ url: "https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture", checked_at: currentAt }] }),
    );
    const result = invoke("check-source-freshness.ts", ["--root", checkRoot, "--registry", registry], { offline: true });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /source_freshness\.sources\.0\.unverified/u);
    assert.match(result.output, /A missing snapshot row or failed attempt does not verify freshness\./u);
    assert.equal(result.requests.length, 0);
  });
  const bounded = spawnSync(resolveTsxBin(skillRoot), [path.join(fixtureDir, "_source-http-checks.ts")], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", NODE_OPTIONS: "" },
  });
  const prefix = "SOURCE_HTTP_RESULTS:";
  const resultLine = bounded.stdout?.split("\n").find((line) => line.startsWith(prefix));
  if (!resultLine) {
    harness.results.push({
      label: "source HTTP async checks returned their results",
      ok: false,
      expectedCode: 0,
      actualCode: bounded.status,
      output: `${bounded.stdout}\n${bounded.stderr}`,
    });
  } else {
    const cases = JSON.parse(resultLine.slice(prefix.length)) as Array<{ label: string; ok: boolean; output: string }>;
    for (const item of cases) harness.results.push({ ...item, expectedCode: 0, actualCode: item.ok ? 0 : 1 });
    if (bounded.status !== (cases.some((item) => !item.ok) ? 1 : 0)) {
      harness.results.push({
        label: "source HTTP async checks exited consistently",
        ok: false,
        expectedCode: 0,
        actualCode: bounded.status,
        output: `${bounded.stdout}\n${bounded.stderr}`,
      });
    }
  }
}
