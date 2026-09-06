import { appendFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import https from "node:https";

// Loaded only by isolated fixture subprocesses. No request can reach the network.
const fixture = JSON.parse(process.env.B2C_APP_BUILDER_HTTP_FIXTURE);
let requestIndex = 0;
const record = (entry) => appendFileSync(fixture.logFile, `${JSON.stringify(entry)}\n`);
const responseStatus = () => fixture.statuses?.[requestIndex++] ?? fixture.status ?? 200;

globalThis.fetch = async (input, options = {}) => {
  const headers = new Headers(options.headers);
  record({ kind: "request", url: String(input), authorization: headers.get("authorization"), accept: headers.get("accept"), redirect: options.redirect });
  if (fixture.offline) throw new Error("Fixture forbids network access.");
  if (fixture.error) throw new Error(fixture.error);
  const status = responseStatus();
  if (options.redirect === "error" && status >= 300 && status < 400) throw new TypeError("Fixture redirect refused.");
  let consumed = false;
  const text = () => {
    record({ kind: "body", status });
    return fixture.body ?? "fixture source bytes";
  };
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: fixture.redirected ?? false,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => text(),
    body: {
      cancel: async () => record({ kind: "cancel", status }),
      getReader: () => ({
        read: async () => {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: new TextEncoder().encode(text()) };
        },
        cancel: async () => record({ kind: "cancel", status }),
        releaseLock() {},
      }),
    },
  };
};

// Characterize the old version reader too: it spawns a child using https.get.
// NODE_OPTIONS carries this preload into that child without a production test hook.
https.get = (input, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const request = new EventEmitter();
  const headers = new Headers(options?.headers);
  record({ kind: "request", url: String(input), authorization: headers.get("authorization"), accept: headers.get("accept") });
  queueMicrotask(() => {
    if (fixture.offline || fixture.error) {
      request.emit("error", new Error(fixture.error ?? "Fixture forbids network access."));
      return;
    }
    const status = responseStatus();
    callback({
      statusCode: status,
      headers: { location: "https://redirect.example.test/content" },
      pipe(destination) {
        record({ kind: "body", status });
        destination.write(fixture.body ?? "fixture source bytes");
        return destination;
      },
    });
  });
  return request;
};
