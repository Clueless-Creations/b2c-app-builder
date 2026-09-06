import assert from "node:assert/strict";
import { readSourceText, SourceHttpError, sourceReportUrl, type SourceHttpOptions } from "../../../../tooling/lib/source-http.js";
import { fetchSource } from "../refresh-source-freshness.js";

const results: Array<{ label: string; ok: boolean; output: string }> = [];
const test = async (label: string, run: () => Promise<void>): Promise<void> => {
  try {
    await run();
    results.push({ label, ok: true, output: "" });
  } catch (error) {
    results.push({ label, ok: false, output: error instanceof Error ? error.message : String(error) });
  }
};
const privateUrl = "https://raw.githubusercontent.com/Emuthmartinez/b2c-app-builder/main/skill-version.json";
const token = "fixture-primary-token";
const env = { GH_TOKEN: token, GITHUB_TOKEN: "fixture-secondary-token" };
const publicUrl = "https://content.example.test/source";
const sourceUrl = (hostname: string, pathname = "/"): URL => {
  const url = new URL(publicUrl);
  url.hostname = hostname;
  url.pathname = pathname;
  return url;
};
const refuse =
  (code: SourceHttpError["code"]) =>
  (error: unknown): boolean =>
    error instanceof SourceHttpError && error.code === code;
const fetcher = (implementation: (input: string, init: RequestInit) => Promise<Response>): typeof fetch =>
  ((input, init) => implementation(String(input), init ?? {})) as typeof fetch;

await test("source HTTP maps configured private repositories to authenticated content requests", async () => {
  for (const repository of ["b2c-app-builder"]) {
    for (const [host, middle] of [
      ["github.com", "blob/main"],
      ["raw.githubusercontent.com", "main"],
    ]) {
      const url = sourceUrl(host!, `/Emuthmartinez/${repository}/${middle}/README.md`);
      await readSourceText(url.href, {
        env,
        fetch: fetcher(async (target, init) => {
          const request = new URL(target);
          assert.equal(request.hostname, "api.github.com");
          assert.equal(request.pathname, `/repos/Emuthmartinez/${repository}/contents/README.md`);
          assert.equal(request.search, "?ref=main");
          assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
          assert.equal(init.redirect, "error");
          return new Response("source");
        }),
      });
    }
  }
  let calls = 0;
  const blocked = fetcher(async () => {
    calls++;
    return new Response("must not read");
  });
  for (const suffix of ["", "/issues", "/security/advisories/new", "/blob/other/README.md"]) {
    await assert.rejects(
      readSourceText(sourceUrl("github.com", `/Emuthmartinez/b2c-app-builder${suffix}`).href, { env, fetch: blocked }),
      refuse("unsupported_private_source"),
    );
  }
  assert.equal(calls, 0);
});

await test("source HTTP sends no auth to foreign repositories, host suffixes, or Shields", async () => {
  const targets = [
    publicUrl,
    sourceUrl("api.github.com", "/repos/Other/b2c-app-builder/contents/README.md").href,
    new URL("/Emuthmartinez/b2c-app-builder/main/README.md", "https://raw.githubusercontent.com.evil.test").href,
    sourceUrl("img.shields.io", "/github/license/Emuthmartinez/b2c-app-builder").href,
  ];
  for (const target of targets)
    await readSourceText(target, {
      env,
      fetch: fetcher(async (_url, init) => {
        assert.equal(new Headers(init.headers).get("authorization"), null);
        return new Response("source");
      }),
    });
});

await test("source HTTP refuses malformed authenticated destinations before fetching", async () => {
  let calls = 0;
  const fetch = fetcher(async () => {
    calls++;
    return new Response("must not read");
  });
  const apiOrigin = sourceUrl("api.github.com").origin;
  for (const target of [
    privateUrl.replace("https:", "http:"),
    privateUrl.replace("https://", `https://user:${token}@`),
    privateUrl.replace("raw.githubusercontent.com", "raw.githubusercontent.com:8443"),
    `${apiOrigin}/repos/Emuthmartinez/b2c-app-builder/contents/../contents/README.md?ref=main`,
    `${apiOrigin}/repos/Emuthmartinez/b2c-app-builder/contents/%2e%2e/README.md?ref=main`,
    `${apiOrigin}/repos/Emuthmartinez/b2c-app-builder/contents/a%2fb.md?ref=main`,
    `${apiOrigin}/repos/Emuthmartinez/b2c-app-builder/contents/README.md?ref=main&ref=other`,
    `${apiOrigin}/repos/Emuthmartinez/b2c-app-builder/actions`,
  ])
    await assert.rejects(readSourceText(target, { env, fetch }), (error: unknown) => error instanceof SourceHttpError);
  assert.equal(calls, 0);
});

await test("source HTTP uses GITHUB_TOKEN only when GH_TOKEN is empty", async () => {
  await readSourceText(privateUrl, {
    env: { GH_TOKEN: " ", GITHUB_TOKEN: env.GITHUB_TOKEN },
    fetch: fetcher(async (_url, init) => {
      assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${env.GITHUB_TOKEN}`);
      return new Response("source");
    }),
  });
});

await test("source HTTP rejects every non-200 status before taking a body reader", async () => {
  for (const status of [201, 204, 206, 301, 302, 401, 403, 404, 429, 500]) {
    let reads = 0;
    let cancelled = 0;
    const response = {
      status,
      redirected: false,
      body: {
        getReader() {
          reads++;
          throw new Error("body read");
        },
        cancel: async () => {
          cancelled++;
        },
      },
    } as unknown as Response;
    await assert.rejects(readSourceText(privateUrl, { env, fetch: fetcher(async () => response) }), refuse("http_status"));
    assert.equal(reads, 0);
    assert.equal(cancelled, 1);
  }
});

await test("source HTTP enforces declared and streamed byte limits", async () => {
  let reads = 0;
  const declared = {
    status: 200,
    headers: new Headers({ "content-length": "1000" }),
    body: {
      getReader() {
        reads++;
        throw new Error("read");
      },
      cancel: async () => {},
    },
  } as unknown as Response;
  await assert.rejects(readSourceText(publicUrl, { env: {}, maxBytes: 2, fetch: fetcher(async () => declared) }), refuse("body_limit"));
  assert.equal(reads, 0);
  await assert.rejects(readSourceText(publicUrl, { env: {}, maxBytes: 3, fetch: fetcher(async () => new Response("😀")) }), refuse("body_limit"));
});

await test("source HTTP rejects invalid UTF-8 instead of hashing replacement text", async () => {
  await assert.rejects(readSourceText(publicUrl, { env: {}, fetch: fetcher(async () => new Response(new Uint8Array([255]))) }), refuse("invalid_text"));
});

await test("source HTTP bounds a fetch that ignores abort", async () => {
  let signal: AbortSignal | null | undefined;
  await assert.rejects(
    readSourceText(publicUrl, {
      env: {},
      timeoutMs: 5,
      fetch: fetcher(async (_url, init) => {
        signal = init.signal;
        return await new Promise<Response>(() => {});
      }),
    }),
    refuse("timeout"),
  );
  assert.equal(signal?.aborted, true);
});

await test("source HTTP cancels a body that arrives after timeout", async () => {
  let resolveResponse: ((response: Response) => void) | undefined;
  let cancelled = 0;
  await assert.rejects(
    readSourceText(publicUrl, {
      env: {},
      timeoutMs: 5,
      fetch: fetcher(
        async () =>
          await new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      ),
    }),
    refuse("timeout"),
  );
  resolveResponse!({
    body: {
      cancel: async () => {
        cancelled++;
      },
    },
  } as unknown as Response);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(cancelled, 1);
});

await test("source HTTP bounds and cancels a stalled response body", async () => {
  let cancelled = 0;
  const response = {
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () => await new Promise<never>(() => {}),
        cancel: async () => {
          cancelled++;
        },
        releaseLock() {},
      }),
    },
  } as unknown as Response;
  await assert.rejects(readSourceText(publicUrl, { env: {}, timeoutMs: 5, fetch: fetcher(async () => response) }), refuse("timeout"));
  assert.ok(cancelled > 0);
});

await test("source HTTP uses one deadline across slow chunks", async () => {
  let reads = 0;
  const response = {
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () => {
          reads++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { done: reads === 20, value: new Uint8Array([65]) };
        },
        cancel: async () => {},
        releaseLock() {},
      }),
    },
  } as unknown as Response;
  await assert.rejects(readSourceText(publicUrl, { env: {}, timeoutMs: 12, fetch: fetcher(async () => response) }), refuse("timeout"));
  assert.ok(reads < 20);
});

await test("source reports remove URL credentials, sensitive query values, and environment tokens", async () => {
  const result = sourceReportUrl(`https://user:${token}@content.example.test/${env.GITHUB_TOKEN}?access_token=unknown-secret#private`, env);
  for (const secret of [token, env.GITHUB_TOKEN, "unknown-secret", "user", "private"]) assert.ok(!result.includes(secret), result);
});

await test("refresh failures retain the trusted timestamp and hash across repeated denials", async () => {
  const source = { id: "fixture", name: "fixture", url: privateUrl, source_type: "raw_manifest", refresh_cadence_days: 7, owner: "fixture" };
  let status = 200;
  let reads = 0;
  const options: SourceHttpOptions = {
    env,
    fetch: fetcher(async () => {
      const response = new Response("same source", { status });
      const body = response.body!;
      const getReader = body.getReader.bind(body);
      body.getReader = (() => {
        reads++;
        return getReader();
      }) as typeof body.getReader;
      return response;
    }),
  };
  const first = await fetchSource(source, undefined, 1000, "2026-01-01T00:00:00Z", options);
  let previous = first;
  for (const code of [401, 404]) {
    status = code;
    previous = await fetchSource(source, previous, 1000, "2026-02-01T00:00:00Z", options);
    assert.equal(previous.last_verified_at, first.checked_at);
    assert.equal(previous.previous_hash, first.hash);
    assert.equal(previous.hash, undefined);
    assert.equal(previous.changed, false);
  }
  assert.equal(reads, 1, "Denied response bodies were consumed.");
  status = 200;
  const restored = await fetchSource(source, previous, 1000, "2026-03-01T00:00:00Z", options);
  assert.equal(restored.status, "fresh");
  assert.equal(restored.hash, first.hash);
  assert.equal(restored.last_verified_at, "2026-03-01T00:00:00Z");
});

await test("refresh discards invalid HTTP error hashes across denial and recovery", async () => {
  const source = { id: "invalid-response", name: "Invalid response", url: publicUrl, source_type: "website", refresh_cadence_days: 7, owner: "fixture" };
  const now = "2026-08-28T00:00:00Z";
  const healthy = await fetchSource(source, undefined, 1000, now, { env: {}, fetch: fetcher(async () => new Response("healthy")) });
  for (const httpStatus of [404, 429]) {
    let previous: typeof healthy = { ...healthy, http_status: httpStatus, last_verified_at: undefined, hash: "invalid-error-page", previous_hash: undefined };
    for (const denial of [401, 404]) {
      const blocked = await fetchSource(source, previous, 1000, now, { env: {}, fetch: fetcher(async () => new Response("denied", { status: denial })) });
      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.previous_hash, undefined);
      assert.equal(blocked.last_verified_at, undefined);
      previous = { ...blocked, hash: undefined, previous_hash: undefined, last_verified_at: undefined, http_status: denial };
    }
    const recovered = await fetchSource(source, previous, 1000, now, { env: {}, fetch: fetcher(async () => new Response("healthy")) });
    assert.equal(recovered.status, "fresh");
    assert.equal(recovered.previous_hash, undefined);
    assert.equal(recovered.hash, healthy.hash);
  }
});

console.log(`SOURCE_HTTP_RESULTS:${JSON.stringify(results)}`);
if (results.some((result) => !result.ok)) process.exitCode = 1;
