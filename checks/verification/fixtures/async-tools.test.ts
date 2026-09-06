import { test } from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../../../entrypoints/mcp/run-process.js";
import { batchedMessages, type BatchApi, type BatchResult } from "../../validation/repository/message-batches.js";

test("MCP timeout kills a SIGTERM-resistant grandchild even when its parent exits", { skip: process.platform === "win32" }, async () => {
  const script = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000);`;
  const result = await runProcess(process.execPath, ["-e", script], { cwd: process.cwd(), timeoutMs: 5_000, graceMs: 250 });
  assert.equal(result.timedOut, true);
  const pid = Number(result.stdout.trim());
  assert.ok(pid > 0);
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      assert.equal((error as NodeJS.ErrnoException).code, "ESRCH");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Grandchild ${pid} survived process-group timeout`);
});

test("MCP preserves normal output, nonzero exit, and spawn errors", async () => {
  const result = await runProcess(process.execPath, ["-e", "console.log('ok');console.error('bad');process.exitCode=3"], {
    cwd: process.cwd(),
    timeoutMs: 10_000,
  });
  assert.equal(result.status, 3);
  assert.match(result.stdout, /ok/);
  assert.match(result.stderr, /bad/);
  const missing = await runProcess("/nonexistent/b2c-command", [], { cwd: process.cwd(), timeoutMs: 10_000 });
  assert.ok(missing.error);
});

test("batches correlate shuffled results, group dependent grades, retain beta flags and usage", async () => {
  const stages: Parameters<BatchApi["create"]>[0][] = [];
  const events: unknown[] = [];
  const api: BatchApi = {
    async create(input) {
      stages.push(input);
      return { id: String(stages.length), processing_status: "in_progress" };
    },
    async retrieve(id) {
      return { id, processing_status: "ended" };
    },
    async results(id) {
      return (async function* () {
        for (const request of [...stages[Number(id) - 1]!.requests].reverse()) {
          yield {
            custom_id: request.custom_id,
            result: {
              type: "succeeded",
              message: { content: request.params.messages, usage: { input_tokens: 12, output_tokens: 3, iterations: [{ type: "fallback_message" }] } },
            },
          };
        }
      })();
    },
  };
  const call = batchedMessages(
    api,
    (event) => events.push(event),
    async () => {},
  );
  const outputs = await Promise.all(
    ["a", "b", "c"].map(async (value) => {
      const agent = await call({ messages: value, betas: ["fallback-beta"], fallbacks: "default" });
      assert.equal(agent.content, value);
      return call({ messages: `grade-${String(agent.content)}` });
    }),
  );
  assert.equal(stages.length, 2);
  assert.equal(stages[0]!.requests.length, 3);
  assert.equal(stages[1]!.requests.length, 3);
  assert.deepEqual(stages[0]!.betas, ["fallback-beta"]);
  assert.equal(stages[0]!.requests[0]!.params.fallbacks, "default");
  assert.ok(!("betas" in stages[0]!.requests[0]!.params));
  assert.deepEqual(
    outputs.map((output) => output.content),
    ["grade-a", "grade-b", "grade-c"],
  );
  assert.equal((outputs[0]!.usage as { input_tokens: number }).input_tokens, 12);
  assert.equal(events.length, 10);
});

test("batch canceled, expired, missing, and errored results remain invalid rather than passing", async () => {
  const api: BatchApi = {
    async create() {
      return { id: "batch", processing_status: "ended" };
    },
    async retrieve() {
      throw new Error("not polled");
    },
    async results() {
      return (async function* () {
        for (const [index, type] of ["canceled", "expired", "errored"].entries()) yield { custom_id: `request_${index + 1}`, result: { type } } as BatchResult;
      })();
    },
  };
  const call = batchedMessages(api, () => {});
  const results = await Promise.all(Array.from({ length: 4 }, () => call({})));
  assert.deepEqual(
    results.map((result) => result.stop_reason),
    ["batch_canceled", "batch_expired", "batch_errored", "batch_missing_result"],
  );
});

test("resuming a submitted batch polls its ID without spending on another submission", async () => {
  let creates = 0;
  const api: BatchApi = {
    async create() {
      creates++;
      throw new Error("must not submit again");
    },
    async retrieve(id) {
      assert.equal(id, "saved-batch");
      return { id, processing_status: "ended" };
    },
    async results() {
      return (async function* () {
        yield { custom_id: "request_1", result: { type: "succeeded", message: { content: "saved" } } };
      })();
    },
  };
  const call = batchedMessages(
    api,
    () => {},
    async () => {},
    () => "saved-batch",
  );
  assert.equal((await call({ messages: "same prompt" })).content, "saved");
  assert.equal(creates, 0);
});

test("source freshness rejects incomplete proof and retains only verified blocked baselines", async () => {
  const { trustedSourceCheckTime, trustedSourceHash } = await import("../../../tooling/lib/source-freshness-state.js");
  const checked = "2026-09-05T00:00:00Z";
  const valid = { status: "fresh", http_status: 200, checked_at: checked, hash: "source-bytes" };
  assert.equal(trustedSourceCheckTime(valid), checked);
  assert.equal(trustedSourceHash(valid), "source-bytes");
  for (const field of ["status", "http_status", "checked_at", "hash"] as const) {
    const incomplete = { ...valid, [field]: undefined };
    assert.equal(trustedSourceCheckTime(incomplete), undefined, field);
    assert.equal(trustedSourceHash(incomplete), undefined, field);
  }
  const retained = { status: "blocked", http_status: 401, checked_at: "2026-09-06T00:00:00Z", last_verified_at: checked, previous_hash: "source-bytes" };
  assert.equal(trustedSourceCheckTime(retained), checked);
  assert.equal(trustedSourceHash(retained), "source-bytes");
  assert.equal(trustedSourceHash({ ...retained, last_verified_at: undefined }), undefined);
  assert.equal(trustedSourceCheckTime({ ...retained, previous_hash: undefined }), undefined);
});
