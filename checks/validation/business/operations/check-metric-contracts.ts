#!/usr/bin/env node
/**
 * Grades operations/metric-contracts.json against the skill-shipped schema.
 * A missing file is an explicit unknown warning, not a crash.
 * This validator is not wired into CI or catalog workflow gates (U16 / ADR-0001).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { asArray, asString, isRecord, issue, parseCliArgs, readText, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { validateMetricContracts } from "../../../../kernel/schema/index.js";

const args = parseCliArgs(process.argv.slice(2));
const issues: Issue[] = [];
const ledgerRel = "operations/metric-contracts.json";
const schemaRel = "operations/metric-contracts.schema.json";
const humanRel = "operations/METRIC_CONTRACTS.md";
const ledgerPath = path.join(args.root, ledgerRel);

function main(): void {
  if (!existsSync(ledgerPath)) {
    issues.push(
      issue("warning", "metric_contracts.file_missing", "operations/metric-contracts.json is absent; metric definitions stay unknown and unmapped.", ledgerRel),
    );
    reportAndExit("Metric contracts check", issues);
    return;
  }

  if (!existsSync(path.join(args.root, schemaRel))) {
    issues.push(
      issue("error", "metric_contracts.schema_missing", "operations/metric-contracts.schema.json is required so the authored file stays portable.", schemaRel),
    );
  }
  const human = readText(args.root, humanRel);
  if (!human) {
    issues.push(
      issue("error", "metric_contracts.human_log_missing", "operations/METRIC_CONTRACTS.md must accompany the structured metric-contracts file.", humanRel),
    );
  } else if (!human.includes("operations/metric-contracts.json")) {
    issues.push(
      issue(
        "error",
        "metric_contracts.human_log_stale",
        "operations/METRIC_CONTRACTS.md must name operations/metric-contracts.json as the structured source.",
        humanRel,
      ),
    );
  }

  let document: unknown;
  try {
    document = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch (error) {
    issues.push(
      issue(
        "error",
        "metric_contracts.ledger_invalid_json",
        `Metric contracts file is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        ledgerRel,
      ),
    );
    reportAndExit("Metric contracts check", issues);
    return;
  }

  const structural = validateMetricContracts(document);
  if (!structural.valid) {
    for (const item of structural.issues) {
      issues.push(issue("error", "metric_contracts.schema_invalid", `${item.path} ${item.message}`, ledgerRel));
    }
  } else if (isRecord(document)) {
    validateSemantics(document);
  }

  reportAndExit("Metric contracts check", issues);
}

function validateSemantics(document: Record<string, unknown>): void {
  const definitions = asArray(document.definitions).filter(isRecord);
  const experiments = asArray(document.experiments).filter(isRecord);
  const conversions = asArray(document.conversions).filter(isRecord);
  requireUniqueVersionedIds(definitions, "definition");
  requireUniqueVersionedIds(experiments, "experiment");

  for (const [index, definition] of definitions.entries()) {
    const pullSpec = isRecord(definition.pullSpec) ? JSON.stringify(definition.pullSpec) : "";
    if (/(?:TODO|<[^>]+>)/i.test(pullSpec)) {
      issues.push(
        issue("error", `metric_contracts.placeholder.${asString(definition.id) ?? index}`, "A pull spec cannot hold TODO or placeholder tokens.", ledgerRel),
      );
    }
  }

  for (const [index, conversion] of conversions.entries()) {
    const rate = conversion.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      issues.push(issue("error", `metric_contracts.conversion_${index}_invalid`, "A declared conversion needs a finite rate greater than zero.", ledgerRel));
    }
  }
}

function requireUniqueVersionedIds(entries: Record<string, unknown>[], kind: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = asString(entry.id) ?? "";
    const revision = entry.revision;
    const key = `${id}@${String(revision)}`;
    if (seen.has(key)) {
      issues.push(issue("error", `metric_contracts.${kind}_id_duplicate`, `${kind} ${key} must be unique.`, ledgerRel));
    }
    seen.add(key);
  }
}

main();
