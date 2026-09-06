import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { contextPacks } from "../catalog/context-packs.js";
import { domains } from "../catalog/domains.js";
import { loadKnowledgePackages } from "../catalog/knowledge-packages.js";
import { operators } from "../catalog/operators.js";
import { roles } from "../catalog/roles.js";
import { validateKnowledgePackages } from "../catalog/knowledge-validation.js";
import { workflows } from "../catalog/workflows/index.js";
import { loadPinnedKnowledgeFreshnessNow } from "./lib/knowledge-freshness-pin.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = skillRoot;

function options(): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 3; index < process.argv.length; index += 2) result.set(process.argv[index] ?? "", process.argv[index + 1] ?? "");
  return result;
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function freshnessNow(): Date {
  const values = options();
  const snapshot = values.has("--source-snapshot") ? required(values, "--source-snapshot") : undefined;
  return loadPinnedKnowledgeFreshnessNow(skillRoot, snapshot);
}

function issues(now = freshnessNow()) {
  return validateKnowledgePackages(loadKnowledgePackages(skillRoot), skillRoot, domains, workflows, contextPacks, [...roles, ...operators], now);
}

function check(): void {
  const failures = issues();
  if (failures.length) throw new Error(failures.map((item) => `${item.code}: ${item.message}`).join("\n"));
  const packages = loadKnowledgePackages(skillRoot);
  console.log(`Knowledge check passed: ${packages.length} packages, ${packages.filter((item) => item.lifecycle === "active").length} active.`);
}

function add(): void {
  const values = options();
  const id = required(values, "--id");
  const title = required(values, "--title");
  const domainId = required(values, "--domain");
  if (!id.startsWith("reference.")) throw new Error("--id must start with reference.");
  if (!domains.some((item) => item.id === domainId)) throw new Error(`Unknown domain: ${domainId}.`);
  const domain = domainId.replace(/^domain\./u, "");
  const slug = id.replace(/^reference\./u, "").replaceAll(".", "-");
  const documentPath = values.get("--path") || `knowledge/${domain}/${slug}.md`;
  const manifestPath = path.join(skillRoot, "catalog/knowledge", domain, `${slug}.yaml`);
  const absoluteDocumentPath = path.join(skillRoot, documentPath);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  mkdirSync(path.dirname(absoluteDocumentPath), { recursive: true });
  writeFileSync(absoluteDocumentPath, `# ${title}\n\n## Purpose\n\nDescribe the reviewed guidance for this work area.\n`, { flag: "wx" });
  const applicability = values.get("--applicability")?.trim();
  writeFileSync(
    manifestPath,
    YAML.stringify({
      schema_version: "1.0.0",
      id,
      title,
      domain_id: domainId,
      document_path: documentPath,
      load_when: values.get("--load-when") || "Load this guide when the bound work requires it.",
      lifecycle: "draft",
      bindings: {
        workflow_ids: (values.get("--workflows") || "").split(",").filter(Boolean),
        context_pack_ids: (values.get("--contexts") || "").split(",").filter(Boolean),
      },
      ...(applicability ? { applicability_notes: applicability } : {}),
      sources: [],
      source_exemption: "Remove this scaffold exemption or replace it with a reviewed explanation before promotion.",
    }),
    { flag: "wx" },
  );
  console.log(`Created draft package ${id}.`);
  console.log(path.relative(repoRoot, manifestPath));
  console.log(path.relative(repoRoot, absoluteDocumentPath));
}

async function refresh(): Promise<void> {
  const requestedId = options().get("--id");
  const packages = loadKnowledgePackages(skillRoot).filter((item) => !requestedId || item.id === requestedId);
  if (!packages.length) throw new Error(`Knowledge package not found: ${requestedId}.`);
  const directory = mkdtempSync(path.join(tmpdir(), "b2c-knowledge-review-"));
  const report = ["# Knowledge review bundle", "", `Created: ${new Date().toISOString()}`, ""];
  for (const item of packages) {
    report.push(`## ${item.id}`, "", `Document: ${item.path}`, "");
    for (const source of item.sources) {
      try {
        const response = await fetch(source.url, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
        const body = await response.text();
        const safeName = `${item.id}-${source.id}`.replaceAll(/[^a-zA-Z0-9._-]/gu, "-");
        writeFileSync(path.join(directory, `${safeName}.txt`), body);
        report.push(`- ${source.id}: HTTP ${response.status}; ${body.length} bytes.`);
      } catch (error) {
        report.push(`- ${source.id}: fetch failed: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
    const diff = execFileSync("git", ["diff", "--", path.join(skillRoot, item.path)], { cwd: repoRoot, encoding: "utf8" });
    writeFileSync(path.join(directory, `${item.id.replaceAll(".", "-")}.document.diff`), diff || "No tracked content diff.\n");
    report.push("");
  }
  writeFileSync(path.join(directory, "REVIEW.md"), `${report.join("\n")}\n`);
  console.log(`Review bundle: ${directory}`);
  console.log("No tracked files changed.");
}

function promote(): void {
  const values = options();
  const id = required(values, "--id");
  const reviewer = required(values, "--reviewer");
  const packageItem = loadKnowledgePackages(skillRoot).find((item) => item.id === id);
  if (!packageItem) throw new Error(`Knowledge package not found: ${id}.`);
  if (packageItem.lifecycle !== "draft") throw new Error(`${id} is not a draft.`);
  if (packageItem.sourceExemption?.startsWith("Remove this scaffold")) throw new Error(`${id} still has the scaffold source exemption.`);
  const candidate = { ...packageItem, lifecycle: "active" as const };
  const failures = validateKnowledgePackages(
    loadKnowledgePackages(skillRoot).map((item) => (item.id === id ? candidate : item)),
    skillRoot,
    domains,
    workflows,
    contextPacks,
    [...roles, ...operators],
    freshnessNow(),
  );
  if (failures.length) throw new Error(failures.map((item) => `${item.code}: ${item.message}`).join("\n"));
  const manifestPath = path.join(skillRoot, packageItem.manifestPath);
  const parsed = YAML.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  parsed.lifecycle = "active";
  parsed.promoted_at = new Date().toISOString().slice(0, 10);
  parsed.promoted_by = reviewer;
  writeFileSync(manifestPath, YAML.stringify(parsed, { lineWidth: 120 }));
  console.log(`Promoted ${id} after review by ${reviewer}.`);
}

function capture(): void {
  const values = options();
  const id = required(values, "--id");
  const title = required(values, "--title");
  const domainId = required(values, "--domain");
  if (!id.startsWith("reference.")) throw new Error("--id must start with reference.");
  if (!domains.some((item) => item.id === domainId)) throw new Error(`Unknown domain: ${domainId}.`);
  const domain = domainId.replace(/^domain\./u, "");
  const slug = id.split(".").at(-1) ?? "";
  if (!slug) throw new Error("--id must end with a learning slug segment.");
  const documentPath = `knowledge/${domain}/learnings/${slug}.md`;
  const manifestPath = path.join(skillRoot, "catalog/knowledge", domain, `learning-${slug}.yaml`);
  const absoluteDocumentPath = path.join(skillRoot, documentPath);
  const today = new Date().toISOString().slice(0, 10);
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  mkdirSync(path.dirname(absoluteDocumentPath), { recursive: true });
  writeFileSync(
    absoluteDocumentPath,
    [
      `# ${title}`,
      "",
      "## Learning",
      "",
      "State the lesson as an instruction for the next run. Say what to do, not what happened.",
      "",
      "## Evidence",
      "",
      "| Claim | Citation |",
      "| --- | --- |",
      "| Replace with the grounded claim | Replace with a backticked repo-relative citation, e.g. a path or path:line |",
      "",
      "## Captured",
      "",
      `Captured: ${today} — name the run, audit, or incident that produced this lesson.`,
      "",
      "## Refresh",
      "",
      `Last reviewed: ${today}. Verdict: kept.`,
      "",
    ].join("\n"),
    { flag: "wx" },
  );
  writeFileSync(
    manifestPath,
    YAML.stringify({
      schema_version: "1.0.0",
      id,
      title,
      domain_id: domainId,
      document_path: documentPath,
      load_when: values.get("--load-when") || "Load this learning when the bound work risks repeating the captured mistake.",
      lifecycle: "draft",
      bindings: {
        workflow_ids: (values.get("--workflows") || "").split(",").filter(Boolean),
        context_pack_ids: (values.get("--contexts") || "").split(",").filter(Boolean),
      },
      applicability_notes: "Captured maintainer learning. Confirm the bound work faces the same failure mode.",
      sources: [],
      source_exemption: "Remove this scaffold exemption or replace it with a reviewed explanation before promotion.",
    }),
    { flag: "wx" },
  );
  console.log(`Created draft learning ${id}.`);
  console.log(path.relative(repoRoot, manifestPath));
  console.log(path.relative(repoRoot, absoluteDocumentPath));
  console.log("Fill the Evidence table, bind workflows, then run check:learning-grounding and knowledge:check before promotion.");
}

const command = process.argv[2];
if (command === "add") add();
else if (command === "capture") capture();
else if (command === "check") check();
else if (command === "refresh") await refresh();
else if (command === "promote") promote();
else throw new Error("Use add, capture, check, refresh, or promote.");
