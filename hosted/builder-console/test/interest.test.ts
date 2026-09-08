import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaptureConfig, DedupeStore } from "../analytics/capture.js";
import { handleInterestSubmission } from "../interest/handler.js";
import type { D1Like } from "../interest/repository.js";

const analytics: CaptureConfig = {
  token: "phc_" + "a".repeat(43),
  host: "https://us.i.posthog.com",
  surface: "console",
  engineVersion: "0.209.21",
};

const flagsKv: DedupeStore = { get: async () => null, put: async () => {} };

const valid = {
  email: "person@example.com",
  source_key: "hacker_news",
  source_other: "saw a Show HN thread",
  intent: "evaluating",
  initial_referrer: "https://news.ycombinator.com/",
};

/** Binding order of the interest_signals upsert, so tests read by name rather than index. */
const COLUMN = {
  id: 0,
  email: 1,
  acquisitionSource: 2,
  intent: 3,
  sourceOther: 4,
  accountId: 5,
  userId: 6,
  posthogDistinctId: 7,
  initialUtmSource: 8,
  createdAt: 13,
} as const;

function stubDb(fail = false): D1Like & { bindings: unknown[][]; sql: string[] } {
  const bindings: unknown[][] = [];
  const sql: string[] = [];
  return {
    bindings,
    sql,
    prepare: (query: string) => {
      sql.push(query);
      return {
        bind: (...values: unknown[]) => {
          bindings.push(values);
          return {
            run: async () => {
              if (fail) throw new Error("d1 unavailable");
              return {};
            },
          };
        },
      };
    },
  };
}

function collectingCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
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
  globalThis.fetch = (async (_input: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { bodies, restore: () => (globalThis.fetch = original) };
}

test("writes to interest_signals, keyed on lower(email)", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv);
  assert.match(db.sql[0]!, /INSERT INTO interest_signals/);
  assert.match(db.sql[0]!, /ON CONFLICT \(lower\(email\)\)/);
});

test("an authenticated submission is stored and then captured", async () => {
  const db = stubDb();
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    assert.deepEqual(await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv), { status: 200 });
    assert.equal(db.bindings[0]![COLUMN.accountId], "acct_1");
    await settle();
    assert.equal(stub.bodies[0].event, "interest_submitted");
    assert.equal(stub.bodies[0].distinct_id, "acct_1");
    assert.equal(stub.bodies[0].properties.auth_state, "authenticated");
  } finally {
    stub.restore();
  }
});

test("a signed-out submission is first-class — stored with a null account and captured anonymously", async () => {
  const db = stubDb();
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  let objectionReads = 0;
  const unavailableStore: DedupeStore = {
    get: async () => { objectionReads += 1; throw new Error("unavailable"); },
    put: async () => {},
  };
  try {
    // Most signals arrive before an account exists. Refusing them would lose the leads the
    // waitlist exists to collect.
    assert.deepEqual(await handleInterestSubmission(valid, { distinctId: "anon_abc", country: "US" }, db, analytics, ctx, unavailableStore), { status: 200 });
    assert.equal(db.bindings[0]![COLUMN.accountId], null);
    assert.equal(db.bindings[0]![COLUMN.posthogDistinctId], "anon_abc");
    await settle();
    assert.equal(stub.bodies[0].distinct_id, "anon_abc");
    assert.equal(stub.bodies[0].properties.auth_state, "anonymous");
    assert.equal(stub.bodies[0].properties.is_authenticated, false);
    assert.equal(objectionReads, 0, "an anonymous distinct id is not an account objection subject");
  } finally {
    stub.restore();
  }
});

test("an authenticated submission with no objection store is saved without analytics", async () => {
  const db = stubDb();
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    assert.deepEqual(await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, undefined), { status: 200 });
    await settle();
    assert.equal(db.bindings[0]![COLUMN.accountId], "acct_1");
    assert.equal(stub.bodies.length, 0);
  } finally {
    stub.restore();
  }
});

test("with no identity at all the row is still stored, but no event is fabricated", async () => {
  const db = stubDb();
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    assert.deepEqual(await handleInterestSubmission(valid, { country: "US" }, db, analytics, ctx, flagsKv), { status: 200 });
    assert.equal(db.bindings.length, 1, "the durable row is the part that matters");
    await settle();
    // A made-up distinct_id would create a phantom person and inflate the funnel.
    assert.equal(stub.bodies.length, 0);
  } finally {
    stub.restore();
  }
});

test("a D1 failure rejects the submission and emits nothing", async () => {
  const db = stubDb(true);
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    assert.deepEqual(await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv), {
      status: 500,
      error: "storage_failed",
    });
    await settle();
    assert.equal(stub.bodies.length, 0);
  } finally {
    stub.restore();
  }
});

test("the raw free text and the email stay out of event properties", async () => {
  const db = stubDb();
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv);
    await settle();
    const properties = stub.bodies[0].properties;
    const eventOnly = { ...properties };
    delete eventOnly.$set;
    delete eventOnly.$set_once;
    const serialised = JSON.stringify(eventOnly);
    assert.equal(serialised.includes("saw a Show HN thread"), false, "raw other text leaked into event properties");
    assert.equal(serialised.includes("person@example.com"), false, "email leaked into event properties");
    assert.equal(properties.other_text_present, true);
    // The address never reaches PostHog at all — not as an event property, not as a person
    // property. The published policy promises this and the Google data statement depends on it.
    assert.equal("email" in properties.$set, false, "email address must never reach PostHog");
    assert.equal(JSON.stringify(properties).includes("person@example.com"), false);
    assert.equal(properties.$set.email_domain, "example.com");
    assert.equal("self_reported_source_other" in properties.$set, false);
  } finally {
    stub.restore();
  }
});

test("source_label is derived from the stable key, never stored and never client-supplied", async () => {
  const db = stubDb();
  const { ctx, settle } = collectingCtx();
  const stub = stubFetch();
  try {
    await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv);
    // The key is what D1 keeps; the label exists only on the event.
    assert.equal(db.bindings[0]![COLUMN.acquisitionSource], "hacker_news");
    assert.equal(db.bindings.flat().includes("Hacker News"), false);
    await settle();
    assert.equal(stub.bodies[0].properties.source_label, "Hacker News");
    assert.equal(stub.bodies[0].properties.$set.self_reported_source, "hacker_news");
  } finally {
    stub.restore();
  }
});

test("the D1 row keeps the raw text the event discards", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv);
  assert.equal(db.bindings[0]![COLUMN.sourceOther], "saw a Show HN thread");
  assert.equal(db.bindings[0]![COLUMN.email], "person@example.com");
});

test("timestamps match the migration's strftime CHECK format", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv, new Date("2026-09-01T18:00:00Z"));
  // The column CHECK is strftime('%Y-%m-%dT%H:%M:%fZ', created_at); a mismatch fails the insert.
  assert.equal(db.bindings[0]![COLUMN.createdAt], "2026-09-01T18:00:00.000Z");
});

test("the two COALESCE directions are opposite, and match the other D1 writer", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  await handleInterestSubmission(valid, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv);
  const sql = db.sql[0]!;
  // First-touch: old wins, so a resubmission cannot rewrite where the person came from — but a
  // NULL can still be backfilled when campaign context finally arrives.
  assert.match(sql, /initial_utm_source = COALESCE\(interest_signals\.initial_utm_source, excluded\.initial_utm_source\)/);
  assert.match(sql, /initial_referrer = COALESCE\(interest_signals\.initial_referrer, excluded\.initial_referrer\)/);
  // Identity: new wins, so an anonymous row can gain an account later.
  assert.match(sql, /account_id = COALESCE\(excluded\.account_id, interest_signals\.account_id\)/);
  // Owned elsewhere; this form must never touch them.
  assert.equal(/converted_at\s*=/.test(sql), false, "converted_at is owned by the billing path");
  assert.equal(/created_at\s*=\s*excluded/.test(sql), false, "created_at is when we first heard from them");
});

test("bounds match the stricter D1 writer, since 0006 has no CHECK constraints to catch drift", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  // utm columns reconciled to 200 (was 255 here). A looser bound would validate here and be
  // refused by the other writer against the same table.
  assert.deepEqual(await handleInterestSubmission({ ...valid, initial_utm_source: "x".repeat(201) }, { country: "US" }, db, analytics, ctx, flagsKv), {
    status: 400,
    error: "invalid_submission",
  });
  assert.deepEqual(await handleInterestSubmission({ ...valid, initial_utm_source: "x".repeat(200) }, { country: "US" }, db, analytics, ctx, flagsKv), { status: 200 });
  // referral_code carries a charset, not just a length.
  assert.deepEqual(await handleInterestSubmission({ ...valid, referral_code: "has spaces" }, { country: "US" }, db, analytics, ctx, flagsKv), {
    status: 400,
    error: "invalid_submission",
  });
  assert.deepEqual(await handleInterestSubmission({ ...valid, referral_code: "ok_code-1" }, { country: "US" }, db, analytics, ctx, flagsKv), { status: 200 });
});

test("the account is server-resolved — a body-supplied account_id is rejected", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  const result = await handleInterestSubmission({ ...valid, account_id: "acct_victim" }, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv);
  assert.deepEqual(result, { status: 400, error: "invalid_submission" });
  assert.equal(db.bindings.length, 0);
});

test("unknown source keys, intents, emails and over-long text are refused", async () => {
  const db = stubDb();
  const { ctx } = collectingCtx();
  for (const body of [
    { ...valid, source_key: "carrier_pigeon" },
    { ...valid, intent: "maybe" },
    { ...valid, email: "nope" },
    { ...valid, source_other: "x".repeat(501) },
  ]) {
    assert.deepEqual(await handleInterestSubmission(body, { accountId: "acct_1", country: "US" }, db, analytics, ctx, flagsKv), {
      status: 400,
      error: "invalid_submission",
    });
  }
  assert.equal(db.bindings.length, 0);
});

test("an EEA/UK submission is stored but never captured — the console's second path", async () => {
  // Suppressing the browser snippet alone left this open. A server-side event needs no SDK and
  // no cookie, so "no event is sent" would have been false for anyone who submitted the form.
  for (const country of ["DE", "GB", "IE", undefined, "XX", "EU"]) {
    const db = stubDb();
    const { ctx, settle } = collectingCtx();
    const stub = stubFetch();
    try {
      assert.deepEqual(await handleInterestSubmission(valid, { accountId: "acct_1", country }, db, analytics, ctx, flagsKv), { status: 200 });
      // The waitlist row is the service they asked for, disclosed separately. It still lands.
      assert.equal(db.bindings.length, 1, `row not stored for ${String(country)}`);
      await settle();
      assert.equal(stub.bodies.length, 0, `event leaked for ${String(country)}`);
    } finally {
      stub.restore();
    }
  }
});
