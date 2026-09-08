#!/usr/bin/env node
/** Explicit host smoke: node --import tsx checks/verification/fixtures/browser-proof.chrome-smoke.ts
 * Requires installed Chrome; no injected observer or downloads. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { observeWithChrome, type BrowserProofConfig } from "../../../tooling/browser-proof.js";

const html =
  Buffer.from(`<!doctype html><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width"><style>body{margin:0;min-height:1800px}button{width:120px;height:60px}</style>
<input id="name"><button id="save">Save</button><button id="fetch">Fetch</button><script src="/asset.js"></script><input type="checkbox" id="check"><p id="result">Ready</p><noscript id="nojs">Scripts disabled</noscript>
<script>document.querySelector('#fetch').onclick=()=>fetch('/unexpected');setTimeout(()=>fetch('/slow'),10);document.querySelector('#save').onclick=()=>{document.querySelector('#result').textContent=document.querySelector('#name').value;document.querySelector('#check').checked=true;};</script>`);
let mode = "normal";
let documentRequests = 0;
let resourceRequests = 0;
let assetRequests = 0;
const server = createServer((request, response) => {
  if (request.url === "/asset.js") {
    assetRequests += 1;
    response.setHeader("Content-Type", "text/javascript");
    response.end(`document.documentElement.dataset.asset = "${mode === "dependency" && assetRequests > 1 ? "replacement" : "original"}";`);
    return;
  }
  if (request.url === "/slow") {
    resourceRequests += 1;
    response.setHeader("Content-Type", "text/plain");
    response.write("delayed ");
    setTimeout(() => response.end("body"), 150);
    return;
  }
  documentRequests += 1;
  response.setHeader("Content-Type", "text/html");
  if (mode === "redirect" && documentRequests > 1) {
    response.writeHead(302, { Location: "/replacement" });
    response.end();
    return;
  }
  if (mode === "status" && documentRequests > 1) response.statusCode = 503;
  const replaced = (mode === "document" && documentRequests > 1) || (mode === "reload" && documentRequests >= 4);
  response.end(replaced ? html.toString().replace("Ready", "Replacement") : html);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const base = {
  surfaceId: "landing",
  locale: "en-US",
  viewport: { width: 1000, height: 700 },
  scale: 1,
  settings: { reducedMotion: false, screenReader: false, largeText: false, javascript: true },
};
const captures: BrowserProofConfig["captures"] = [
  { ...base, id: "default", state: "default", steps: [], assertions: [{ kind: "selector-text-includes", selector: "#result", value: "Ready" }] },
  {
    ...base,
    id: "motion",
    state: "reduced-motion",
    scale: 2,
    settings: { ...base.settings, reducedMotion: true },
    steps: [{ action: "scroll", x: 0, y: 100 }],
    assertions: [{ kind: "selector-exists", selector: "#save" }],
  },
  {
    ...base,
    id: "nojs",
    state: "no-js",
    settings: { ...base.settings, javascript: false },
    steps: [],
    assertions: [{ kind: "selector-text-includes", selector: "#nojs", value: "Scripts disabled" }],
  },
];
const interactions: BrowserProofConfig["interactions"] = [
  {
    id: "save-name",
    surfaceId: "landing",
    locale: "en-US",
    interactionId: "save",
    captureIds: ["default"],
    steps: [
      { action: "reload" },
      { action: "fill", selector: "#name", value: 'Chrome "proof"' },
      { action: "wait-for", selector: "#result", timeoutMs: 100 },
      { action: "wait", durationMs: 10 },
      { action: "click", selector: "#save" },
      { action: "set-offline", offline: true },
      { action: "set-offline", offline: false },
    ],
    assertions: [
      { kind: "selector-value-equals", selector: "#name", value: 'Chrome "proof"' },
      { kind: "selector-text-includes", selector: "#result", value: 'Chrome "proof"' },
      { kind: "selector-checked-equals", selector: "#check", value: true },
      { kind: "selector-attribute-equals", selector: "#save", name: "id", value: "save" },
      { kind: "url-equals", value: `${origin}/` },
    ],
  },
];
for (const key of ["Enter", "Space"] as const) {
  interactions.push({
    ...interactions[0]!,
    id: `keyboard-${key.toLowerCase()}`,
    steps: [
      { action: "fill", selector: "#name", value: 'Chrome "proof"' },
      { action: "press", selector: "#save", key },
    ],
  });
}

try {
  const observation = await observeWithChrome({
    origin,
    url: `${origin}/`,
    resourceUrls: [`${origin}/`, `${origin}/slow`, `${origin}/asset.js`],
    captures,
    interactions,
  });
  assert.deepEqual(observation.resources[0]?.body, html);
  assert.equal(observation.resources[1]?.body.toString(), "delayed body");
  assert.equal(observation.captures.length, 3);
  assert.equal(observation.interactions.length, 3);
  for (const [index, capture] of observation.captures.entries()) {
    assert(capture.screenshot.subarray(1, 4).equals(Buffer.from("PNG")));
    assert.equal(capture.screenshot.readUInt32BE(16), captures[index]!.viewport.width * captures[index]!.scale);
    assert.equal(capture.screenshot.readUInt32BE(20), captures[index]!.viewport.height * captures[index]!.scale);
    assert(Date.parse(capture.capturedAt) >= Date.parse(observation.navigation.finishedAt));
  }
  assert.match(JSON.stringify(observation.interactions[0]?.transcript), /Chrome/);
  await assert.rejects(
    observeWithChrome({
      origin,
      url: `${origin}/`,
      resourceUrls: [`${origin}/`, `${origin}/slow`, `${origin}/asset.js`],
      captures: [{ ...captures[0]!, assertions: [{ kind: "selector-text-includes", selector: "#result", value: "Never observed" }] }],
      interactions,
    }),
    /assertion failed/,
  );
  await assert.rejects(
    observeWithChrome({
      origin,
      url: `${origin}/`,
      resourceUrls: [`${origin}/`, `${origin}/slow`, `${origin}/asset.js`],
      captures: [{ ...captures[0]!, settings: { ...base.settings, screenReader: true } }],
      interactions,
    }),
    /cannot claim/,
  );
  for (const selectedMode of ["document", "redirect", "status", "dependency", "reload", "unexpected"]) {
    mode = selectedMode;
    documentRequests = 0;
    resourceRequests = 0;
    assetRequests = 0;
    await assert.rejects(
      observeWithChrome({
        origin,
        url: `${origin}/`,
        resourceUrls: [`${origin}/`, `${origin}/slow`, `${origin}/asset.js`],
        captures: [
          {
            ...captures[0]!,
            ...(selectedMode === "unexpected"
              ? {
                  steps: [
                    { action: "click" as const, selector: "#fetch" },
                    { action: "wait" as const, durationMs: 100 },
                  ],
                }
              : {}),
          },
        ],
        interactions: [interactions[0]!],
      }),
      /Chrome replay (changed|requested)/,
      `replay ${selectedMode} substitution must refuse`,
    );
    assert(documentRequests >= 2, "regression must reach a real replay navigation");
  }
  console.log("PASS real Chrome browser proof: served bytes, captures, settings, typed actions, assertions, chronology and refusal");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
