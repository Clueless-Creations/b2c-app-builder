#!/usr/bin/env node
/**
 * check-localization-research.ts — seasonal lead time and PPP coverage.
 *
 * When LOCALIZATION_MARKET_RESEARCH.md exists, require Seasonal Windows and
 * PPP / Territory Pricing headings. Every Seasonal Windows row needs valid
 * ISO Peak Date and Submit By values. Submit-by must sit 14 or more days
 * before peak. An empty table fails.
 *
 * npm script: check:localization-research
 * Usage: tsx checks/validation/business/research/check-localization-research.ts --root <app-repo-root>
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { issue, loadProjectState, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];

const RELATIVE_PATH = "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md";
const LEAD_DAYS = 14;
const LEAD_MS = LEAD_DAYS * 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function extractSection(text: string, heading: string): string | undefined {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return undefined;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function parseIsoDate(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return undefined;
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== trimmed) return undefined;
  return date;
}

function pipeRows(section: string): { headers: string[]; rows: string[][] } {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  const parsed = lines
    .filter((line) => !/^\|?\s*:?-{3,}/.test(line.replace(/\|/g, "").trim()) && !/^\|(?:\s*:?-+:?\s*\|)+$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
  const headers = parsed[0] ?? [];
  const rows = parsed.slice(1).filter((row) => row.some((cell) => cell.length > 0 && !/^-+$/.test(cell)));
  return { headers, rows };
}

function headerIndex(headers: string[], names: string[]): number {
  const normalized = headers.map((header) => header.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"));
  for (const name of names) {
    const index = normalized.indexOf(name.toLocaleLowerCase("en-US"));
    if (index >= 0) return index;
  }
  return -1;
}

const absolutePath = path.join(args.root, RELATIVE_PATH);
if (existsSync(absolutePath)) {
  const text = readText(args.root, RELATIVE_PATH) ?? "";
  if (!/^## Seasonal Windows\s*$/m.test(text)) {
    issues.push(
      issue(
        "error",
        "localization.seasonal_windows.missing",
        "LOCALIZATION_MARKET_RESEARCH.md needs a Seasonal Windows heading with peak and submit-by columns.",
        RELATIVE_PATH,
      ),
    );
  }

  if (!/^## PPP \/ Territory Pricing\s*$/m.test(text)) {
    issues.push(
      issue(
        "error",
        "localization.ppp_pricing.missing",
        "LOCALIZATION_MARKET_RESEARCH.md needs a PPP / Territory Pricing heading before storefront price lock.",
        RELATIVE_PATH,
      ),
    );
  }

  const seasonalSection = extractSection(text, "Seasonal Windows");
  if (seasonalSection) {
    const table = pipeRows(seasonalSection);
    const peakColumn = headerIndex(table.headers, ["Peak Date", "Peak"]);
    const submitColumn = headerIndex(table.headers, ["Submit By", "Submit-by", "Submit by"]);
    if (peakColumn < 0 || submitColumn < 0) {
      issues.push(issue("error", "localization.seasonal_windows.columns_missing", "Seasonal Windows needs Peak Date and Submit By columns.", RELATIVE_PATH));
    } else if (table.rows.length === 0) {
      issues.push(
        issue(
          "error",
          "localization.seasonal_windows.empty",
          "Seasonal Windows needs at least one row with ISO Peak Date and Submit By values.",
          RELATIVE_PATH,
        ),
      );
    } else {
      for (const row of table.rows) {
        const peakRaw = (row[peakColumn] ?? "").trim();
        const submitRaw = (row[submitColumn] ?? "").trim();
        const peak = parseIsoDate(peakRaw);
        const submitBy = parseIsoDate(submitRaw);
        if (!peak || !submitBy) {
          issues.push(
            issue(
              "error",
              "localization.seasonal_windows.date_invalid",
              "Every Seasonal Windows row needs complete ISO Peak Date and Submit By values. Blank or malformed dates fail before the 14-day check.",
              RELATIVE_PATH,
            ),
          );
          break;
        }
        if (peak.getTime() - submitBy.getTime() < LEAD_MS) {
          issues.push(
            issue(
              "error",
              "localization.seasonal_lead_time.too_short",
              `Submit-by must sit ${LEAD_DAYS} or more days before a dated peak. Same-day keyword or localization launches into a known peak fail.`,
              RELATIVE_PATH,
            ),
          );
          break;
        }
      }
    }
  }
}

reportAndExit("Localization research", issues);
