#!/usr/bin/env node
/** Child-only fixture observer. Production `b2c browser-proof` never selects it. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { loadBrowserProofConfig, produceBrowserProof, type BrowserProofObserver } from "../../../tooling/browser-proof.js";

const [root, mode = "pass"] = process.argv.slice(2);
if (!root) throw new Error("fixture workspace path is required");
const { config } = loadBrowserProofConfig(root);

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width: number, height: number): Buffer {
  const row = Buffer.alloc(width * 4 + 1);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) row.copy(raw, y * row.length);
  const chunk = (kind: string, data: Buffer): Buffer => {
    const type = Buffer.from(kind, "ascii");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length, 0);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const observer: BrowserProofObserver = async ({ url, resourceUrls }) => ({
  browserContextId: "fixture-browser-context-42",
  browser: { name: "Fixture Chrome", version: "140.0.0" },
  os: "Fixture OS 1.0",
  launch: {
    startedAt: "2026-09-04T12:01:00Z",
    finishedAt: "2026-09-04T12:02:00Z",
    transcript: {
      schemaVersion: 1,
      kind: "fixture-chrome-launch",
      browserContextId: "fixture-browser-context-42",
      startedAt: "2026-09-04T12:01:00Z",
      finishedAt: "2026-09-04T12:02:00Z",
    },
  },
  navigation: {
    requestedUrl: url,
    finalUrl: url,
    statusCode: 200,
    startedAt: "2026-09-04T12:03:00Z",
    finishedAt: "2026-09-04T12:04:00Z",
    transcript: {
      schemaVersion: 1,
      kind: "fixture-chrome-navigation",
      browserContextId: "fixture-browser-context-42",
      requestedUrl: url,
      finalUrl: url,
      statusCode: 200,
      startedAt: "2026-09-04T12:03:00Z",
      finishedAt: "2026-09-04T12:04:00Z",
    },
  },
  resources: resourceUrls.map((resourceUrl, index) => ({
    url: resourceUrl,
    statusCode: 200,
    mimeType: index === 0 ? "text/html" : "text/javascript",
    body:
      mode === "wrong-response" && index === 0
        ? Buffer.from("<h1>Old unrelated page</h1>\n")
        : readFileSync(path.join(root, config.build.resources[index]!.path)),
  })),
  captures: config.captures.map((capture) => ({
    id: capture.id,
    capturedAt: "2026-09-04T12:04:10Z",
    screenshot: png(Math.round(capture.viewport.width * capture.scale), Math.round(capture.viewport.height * capture.scale)),
    transcript: {
      schemaVersion: 1,
      kind: "fixture-chrome-capture",
      browserContextId: "fixture-browser-context-42",
      evidenceId: capture.id,
      assertions: capture.assertions,
      capturedAt: "2026-09-04T12:04:10Z",
    },
  })),
  interactions: config.interactions.map((interaction) => ({
    id: interaction.id,
    executedAt: "2026-09-04T12:04:20Z",
    observation: "The configured fixture interaction completed on the current landing candidate.",
    transcript: {
      schemaVersion: 1,
      kind: "fixture-chrome-interaction",
      browserContextId: "fixture-browser-context-42",
      evidenceId: interaction.id,
      assertions: interaction.assertions,
      executedAt: "2026-09-04T12:04:20Z",
    },
  })),
});

const result = await produceBrowserProof({
  root,
  sessionId: "session.landing.current",
  observer,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
