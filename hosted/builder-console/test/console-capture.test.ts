/**
 * Unit tests for `captureConsoleEvent`, the gate every console server-side capture goes through.
 *
 * End-to-end proof against a real `worker.fetch` — the sign-in flow and the key mint/revoke flow,
 * with a real Miniflare-backed D1 and a plain in-memory FLAGS_KV — lives in
 * test/integration/console-flow.test.ts. This file isolates the gate itself: geography first and
 * synchronously, the objection check only for a subject-bearing event, and fail-closed whenever
 * FLAGS_KV cannot be read.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENTS } from "../analytics/events.js";
import { captureConsoleEvent, type ConsoleCaptureInput } from "../analytics/console-capture.js";
import type { CaptureConfig, DedupeStore } from "../analytics/capture.js";

const analytics: CaptureConfig = {
  token: "phc_" + "a".repeat(43),
  host: "https://us.i.posthog.com",
  surface: "console",
  engineVersion: "0.209.29",
};

function collectingCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    // Drains rather than one Promise.all: the objection check nests a second ctx.waitUntil call
    // (captureInBackground's own) inside the first.
    settle: async () => {
      let processed = 0;
      while (processed < pending.length) {
        const batch = pending.slice(processed);
        processed = pending.length;
        await Promise.all(batch);
      }
    },
  };
}

function stubFetch() {
  const bodies: any[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response('{"status":"Ok"}', { status: 200 });
  }) as typeof fetch;
  return { bodies, restore: () => (globalThis.fetch = original) };
}

function memoryKv(): DedupeStore & { getCalls: number; broken: boolean } {
  const map = new Map<string, string>();
  const store = {
    getCalls: 0,
    broken: false,
    get: async (key: string) => {
      store.getCalls += 1;
      if (store.broken) throw new Error("kv unavailable");
      return map.get(key) ?? null;
    },
    put: async (key: string, value: string) => void map.set(key, value),
  };
  return store;
}

const baseInput: ConsoleCaptureInput = {
  distinctId: "acct_1",
  event: EVENTS.signinCompleted,
  authState: "authenticated",
  properties: { method: "google", is_new_account: false },
};

for (const country of ["DE", "GB", undefined, "XX", "eu"]) {
  test(`geography suppresses ${String(country)} before any KV read or network call`, async () => {
    const { ctx, settle } = collectingCtx();
    const stub = stubFetch();
    const flagsKv = memoryKv();
    try {
      captureConsoleEvent(ctx, flagsKv, analytics, country, { ...baseInput, objectionSubject: "acct_1" });
      await settle();
      assert.equal(stub.bodies.length, 0, `no capture for country ${String(country)}`);
      assert.equal(flagsKv.getCalls, 0, "geography must be checked before any KV read");
    } finally {
      stub.restore();
    }
  });
}

test("a resolvable, non-EEA/UK country with no objectionSubject captures directly", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  const flagsKv = memoryKv();
  try {
    captureConsoleEvent(ctx, flagsKv, analytics, "US", { ...baseInput, event: EVENTS.signinStarted, objectionSubject: undefined });
    await settle();
    assert.equal(stub.bodies.length, 1);
    assert.equal(stub.bodies[0].event, "signin_started");
    assert.equal(flagsKv.getCalls, 0, "no subject, so no objection check to run");
  } finally {
    stub.restore();
  }
});

test("a resolvable country with an objectionSubject that has not objected captures", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  const flagsKv = memoryKv();
  try {
    captureConsoleEvent(ctx, flagsKv, analytics, "US", { ...baseInput, objectionSubject: "acct_1" });
    await settle();
    assert.equal(stub.bodies.length, 1);
    assert.equal(stub.bodies[0].distinct_id, "acct_1");
    assert.equal(flagsKv.getCalls, 1);
  } finally {
    stub.restore();
  }
});

test("an objecting subject's own event is not captured, even from an allowed country", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  const flagsKv = memoryKv();
  await flagsKv.put("analytics:optout:acct_1", "1");
  try {
    captureConsoleEvent(ctx, flagsKv, analytics, "US", { ...baseInput, objectionSubject: "acct_1" });
    await settle();
    assert.equal(stub.bodies.length, 0);
  } finally {
    stub.restore();
  }
});

test("objection is per subject: a different account is unaffected", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  const flagsKv = memoryKv();
  await flagsKv.put("analytics:optout:acct_1", "1");
  try {
    captureConsoleEvent(ctx, flagsKv, analytics, "US", { ...baseInput, distinctId: "acct_2", objectionSubject: "acct_2" });
    await settle();
    assert.equal(stub.bodies.length, 1);
    assert.equal(stub.bodies[0].distinct_id, "acct_2");
  } finally {
    stub.restore();
  }
});

test("a FLAGS_KV read failure fails closed for a subject-bearing event", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  const flagsKv = memoryKv();
  flagsKv.broken = true;
  try {
    captureConsoleEvent(ctx, flagsKv, analytics, "US", { ...baseInput, objectionSubject: "acct_1" });
    await settle();
    assert.equal(stub.bodies.length, 0, "an unreachable store must be treated as an objection, not as permission to capture");
  } finally {
    stub.restore();
  }
});

test("no FLAGS_KV at all fails closed for a subject-bearing event, without throwing", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    captureConsoleEvent(ctx, undefined, analytics, "US", { ...baseInput, objectionSubject: "acct_1" });
    await settle();
    assert.equal(stub.bodies.length, 0);
  } finally {
    stub.restore();
  }
});

test("no FLAGS_KV and no objectionSubject still captures — interest_submitted's shape", async () => {
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    captureConsoleEvent(ctx, undefined, analytics, "US", {
      distinctId: "acct_1",
      event: EVENTS.interestSubmitted,
      authState: "authenticated",
      properties: {},
    });
    await settle();
    assert.equal(stub.bodies.length, 1);
    assert.equal(stub.bodies[0].event, "interest_submitted");
  } finally {
    stub.restore();
  }
});
