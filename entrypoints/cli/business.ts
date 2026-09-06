import { boundedFileBytes } from "../../kernel/lib/bounded-file.js";
import { readFileSync } from "node:fs";
import { resolveCallerPath } from "../../kernel/lib/cli.js";
import { z } from "zod";
import { compositionSchema, PUBLIC_OPERATIONS } from "../../contracts/public-api/contract.js";
import { compose, callPublicOperation, failure } from "../../kernel/services/business.js";

const [command, ...argv] = process.argv.slice(2);
const operation = PUBLIC_OPERATIONS.find((item) => item.cli === command);
const usage = () =>
  [
    operation?.description,
    operation && !["business-status", "catalog", "compose"].includes(command ?? "")
      ? `Usage: b2c ${command} ${operation.flags
          .filter((flag) => flag !== "json")
          .map((flag) => `--${flag} <value>`)
          .join(" ")} [--json]`
      : command === "business-status"
        ? "Usage: b2c business-status --workspace <registered-id> [--json]"
        : command === "catalog"
          ? "Usage: b2c catalog [--kind capability|provider|recipe] [--id namespace/name] [--json]"
          : "Usage: b2c compose --config <b2c.yaml|b2c.json> [--json] [--schema]",
    "JSON results use b2c/v1. Exit 0 means the request succeeded.",
  ].join("\n");
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(usage());
  process.exit(0);
}
try {
  if (!operation) throw new Error("command");
  const flags = new Map<string, string | true>();
  const allowed: readonly string[] = operation.flags;
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    const key = token.slice(2);
    if (!token.startsWith("--") || !allowed.includes(key) || flags.has(key)) throw new Error("flag");
    if (["json", "schema", "apply"].includes(key)) flags.set(key, true);
    else {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("value");
      flags.set(key, value);
    }
  }
  if (flags.has("apply")) {
    const result = compose({ mode: "apply" });
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  if (flags.has("schema")) {
    console.log(JSON.stringify(z.toJSONSchema(compositionSchema, { target: "draft-2020-12", io: "input" }), null, 2));
    process.exit(0);
  }
  let result;
  switch (operation.id) {
    case "business.research.lookup":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        query: JSON.parse(boundedFileBytes(resolveCallerPath(String(flags.get("query"))), 32000).toString("utf8")),
        maxAgeSeconds: Number(flags.get("max-age")),
      });
      break;
    case "business.research.record":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        observation: JSON.parse(boundedFileBytes(resolveCallerPath(String(flags.get("observation"))), 32000).toString("utf8")),
      });
      break;
    case "business.create":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        directory: typeof flags.get("directory") === "string" ? resolveCallerPath(flags.get("directory") as string) : undefined,
        name: flags.get("name"),
        hypothesis: flags.get("hypothesis"),
        ...(flags.has("mandate") ? { mandate: flags.get("mandate") } : {}),
      });
      break;
    case "business.initialize":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace"), expectedRevision: flags.get("revision") });
      break;
    case "business.recover":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        requestId: flags.get("request"),
      });
      break;
    case "business.plan":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        ...(flags.has("concurrency") ? { maxConcurrency: Number(flags.get("concurrency")) } : {}),
      });
      break;
    case "business.evidence":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        ...(flags.has("workflow") ? { workflowId: flags.get("workflow") } : {}),
      });
      break;
    case "business.run":
      result = await callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        expectedRevision: flags.get("revision"),
        requestId: flags.get("request"),
        ...(flags.has("scope") ? { scope: String(flags.get("scope")).split(",") } : {}),
        ...(flags.has("seconds") ? { wallClockSeconds: Number(flags.get("seconds")) } : {}),
        ...(flags.has("concurrency") ? { maxConcurrency: Number(flags.get("concurrency")) } : {}),
      });
      break;
    case "catalog.list":
      result = callPublicOperation(operation.id, Object.fromEntries([...flags].filter(([key]) => key !== "json")));
      break;
    case "composition.preview": {
      const file = flags.get("config");
      if (typeof file !== "string") throw new Error("config");
      const filename = resolveCallerPath(file);
      const { parseDocument } = await import("yaml");
      const text = readFileSync(filename, "utf8");
      if (Buffer.byteLength(text) > 64 * 1024) throw new Error("size");
      const document = parseDocument(text, { uniqueKeys: true });
      if (document.errors.length) throw new Error("parse");
      result = callPublicOperation(operation.id, { composition: document.toJS({ maxAliasCount: 0 }) });
      break;
    }
    case "packages.list":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace") });
      break;
    case "packages.import":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        sourcePath: typeof flags.get("source") === "string" ? resolveCallerPath(flags.get("source") as string) : undefined,
        dependencyDigests: typeof flags.get("dependencies") === "string" ? String(flags.get("dependencies")).split(",") : [],
      });
      break;
    case "composition.plan":
    case "composition.activate":
      result = callPublicOperation(operation.id, {
        workspaceId: flags.get("workspace"),
        packageDigests: typeof flags.get("packages") === "string" ? String(flags.get("packages")).split(",") : [],
        ...(operation.id === "composition.activate" ? { previewDigest: flags.get("preview") } : {}),
      });
      break;
    case "composition.recover":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace"), mode: flags.get("mode") });
      break;
    case "market.report":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace"), experimentId: flags.get("experiment") });
      break;
    case "business.status":
      result = callPublicOperation(operation.id, { workspaceId: flags.get("workspace") });
      break;
    default: {
      const exhaustive: never = operation;
      throw new Error(String(exhaustive));
    }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
} catch {
  console.log(JSON.stringify(failure("INVALID_INPUT", "Invalid command options or unreadable input. No state was changed.", [], usage()), null, 2));
  process.exitCode = 1;
}
