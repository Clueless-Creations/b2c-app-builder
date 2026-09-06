import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedBody, RequestError } from "../http.js";

function streamedRequest(stream: ReadableStream<Uint8Array>): Request {
  return new Request("https://example.com/mcp", { method: "POST", body: stream, ...{ duplex: "half" } });
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

test("a stalled request body has a total deadline and cancels the stream", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const result = boundedBody(streamedRequest(stream), 1024);
  let settled = false;
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const rejected = assert.rejects(result, (error: unknown) => error instanceof RequestError && error.status === 408 && error.code === "request_timeout");
  t.mock.timers.tick(10_000);
  await flushMicrotasks();
  assert.equal(settled, true, "the total deadline must settle a never-closed stream");
  await rejected;
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("a stalled cancellation hook cannot delay the body deadline or reader release", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
      return new Promise<void>(() => {});
    },
  });
  const result = boundedBody(streamedRequest(stream), 1024);
  let settled = false;
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const rejected = assert.rejects(result, (error: unknown) => error instanceof RequestError && error.status === 408);
  t.mock.timers.tick(10_000);
  await flushMicrotasks();
  assert.equal(settled, true, "a dependency cancellation hook must not extend the response deadline");
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
  await rejected;
});

test("slow chunks do not reset the total body deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel() {
      cancelled = true;
    },
  });
  const result = boundedBody(streamedRequest(stream), 1024);
  let settled = false;
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  const rejected = assert.rejects(result, (error: unknown) => error instanceof RequestError && error.status === 408);
  t.mock.timers.tick(6000);
  controller!.enqueue(new TextEncoder().encode("first"));
  await Promise.resolve();
  t.mock.timers.tick(4000);
  await flushMicrotasks();
  assert.equal(settled, true, "a chunk cannot extend the total deadline");
  await rejected;
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("completed and oversized bodies clear deadline resources", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello"));
      controller.close();
    },
    cancel() {
      cancelled += 1;
    },
  });
  assert.equal(await boundedBody(streamedRequest(stream), 5), "hello");
  assert.equal(stream.locked, false);
  t.mock.timers.tick(20_000);
  assert.equal(cancelled, 0);
  const large = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("too large"));
    },
    cancel() {
      cancelled += 1;
    },
  });
  await assert.rejects(boundedBody(streamedRequest(large), 2), (error: unknown) => error instanceof RequestError && error.status === 413);
  assert.equal(cancelled, 1);
  assert.equal(large.locked, false);
  t.mock.timers.tick(20_000);
  assert.equal(cancelled, 1);
});

test("empty and small chunks share one deadline race without changing the byte allowance", async (t) => {
  const race = t.mock.method(Promise, "race");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < 200; index += 1) controller.enqueue(new Uint8Array());
      controller.enqueue(new TextEncoder().encode("ok"));
      controller.close();
    },
  });
  assert.equal(await boundedBody(streamedRequest(stream), 2), "ok");
  assert.equal(race.mock.calls.length, 1);
  assert.equal(stream.locked, false);
});
