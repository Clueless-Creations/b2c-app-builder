import assert from "node:assert/strict";
import { test } from "node:test";
import skillVersion from "../../../skill-version.json" with { type: "json" };
import worker from "../worker.js";

test("GET /health reports the pinned engineVersion and stays cheap", async () => {
  const response = await worker.fetch(
    new Request("https://app.clueless-creations.com/health"),
    {} as never,
    { waitUntil() {} } as never,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  const body = (await response.json()) as { status: string; service: string; engineVersion: string; bundleSha256?: string };
  assert.deepEqual(
    { status: body.status, service: body.service, engineVersion: body.engineVersion },
    { status: "ok", service: "clueless-creations-app", engineVersion: skillVersion.version },
  );
  assert.equal(body.bundleSha256, undefined, "the console Worker does not ship the knowledge bundle and must not invent a hash");
});
