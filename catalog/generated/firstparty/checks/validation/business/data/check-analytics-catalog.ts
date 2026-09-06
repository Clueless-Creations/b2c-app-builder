#!/usr/bin/env node
/**
 * check-analytics-catalog.ts — cross-doc event-catalog completeness.
 *
 * analytics/ANALYTICS.md is the single event catalog (analytics-attribution.md): any
 * event a surface doc names must exist there before the surface locks.
 * This validator reconciles the event names declared in product/ONBOARDING.md,
 * EMOTIONAL_DESIGN.md, VIRAL_GROWTH.md, and revenue/REVENUE_OPS.md against analytics/ANALYTICS.md.
 *
 * Extraction is deliberately narrow so property names never count as events:
 *   - markdown table cells under a header containing "event" or "analytics"
 *     (e.g. product/ONBOARDING.md "Analytics" column, EMOTIONAL_DESIGN.md
 *     "Measurement Event" column), backticked snake_case tokens only
 *   - bare bullet lines of the form "- `event_name`" (VIRAL_GROWTH.md list)
 *
 * Severity: warning while the analytics lane is partial, error when
 * lanes.analytics_attribution is done (or the doc names events while
 * analytics/ANALYTICS.md is missing). Skipped when the lane is not_needed/deferred.
 *
 * npm script: check:analytics-catalog
 */
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const state = loaded.state;

const laneStatus = state ? asString(getPath(state, "lanes.analytics_attribution.status"))?.toLowerCase() : undefined;
const laneDone = laneStatus === "succeeded";
const laneSkipped = laneStatus === "not_needed" || laneStatus === "deferred";

if (laneSkipped) {
  reportAndExit("Analytics event-catalog completeness check", issues);
  // No argument: honor the exit code reportAndExit set (errors still fail on the skip path).
  process.exit();
}

const severity: "error" | "warning" = laneDone ? "error" : "warning";

// revenue/REVENUE_OPS.md drift hardens with the REVENUE lane too: a done revenue lane
// naming an uncataloged event is an error even while analytics is still
// partial — the revenue claim is what makes the event name load-bearing.
const revenueDone = state ? asString(getPath(state, "lanes.revenue.status"))?.toLowerCase() === "succeeded" : false;
function severityFor(docLabel: string): "error" | "warning" {
  if (docLabel === "revenue/REVENUE_OPS.md" && revenueDone) return "error";
  return severity;
}

// Surface docs that name events (first existing path wins per doc).
// revenue/REVENUE_OPS.md joined the list when the billing-lifecycle events prescribed
// in billing-health-and-reactivation.md §2/§3 turned out to live only in reference
// prose — a revenue doc naming an event the catalog does not carry is the
// same invented-inline miss as an onboarding doc doing it.
const SOURCE_DOCS: Array<{ label: string; paths: string[] }> = [
  { label: "product/ONBOARDING.md", paths: ["product/ONBOARDING.md"] },
  { label: "EMOTIONAL_DESIGN.md", paths: ["EMOTIONAL_DESIGN.md", "product/experience/emotional-design/EMOTIONAL_DESIGN.md"] },
  { label: "VIRAL_GROWTH.md", paths: ["VIRAL_GROWTH.md", "growth/VIRAL_GROWTH.md"] },
  { label: "revenue/REVENUE_OPS.md", paths: ["revenue/REVENUE_OPS.md"] },
];

const analyticsText = readText(args.root, "analytics/ANALYTICS.md") ?? readText(args.root, "analytics/analytics/ANALYTICS.md");

const eventToken = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;

for (const doc of SOURCE_DOCS) {
  let text: string | undefined;
  for (const candidate of doc.paths) {
    text = readText(args.root, candidate);
    if (text !== undefined) {
      break;
    }
  }
  if (text === undefined) {
    continue;
  }

  const events = extractEvents(text);
  if (events.size === 0) {
    continue;
  }

  if (analyticsText === undefined) {
    issues.push(
      issue(
        severityFor(doc.label),
        "analytics_catalog.analytics_doc_missing",
        `${doc.label} names ${events.size} analytics event(s) but analytics/ANALYTICS.md does not exist. Create the event catalog before surfaces lock (analytics-attribution.md).`,
        "analytics/ANALYTICS.md",
      ),
    );
    break;
  }

  for (const eventName of Array.from(events).sort()) {
    if (!analyticsText.includes(eventName)) {
      issues.push(
        issue(
          severityFor(doc.label),
          `analytics_catalog.${eventName}.uncataloged`,
          `${doc.label} names the event ${eventName} but analytics/ANALYTICS.md's catalog does not contain it. Add it to the Event Contract (or Emotion Card Events) table before the surface locks — events are named in the catalog first, never invented inline.`,
          doc.label,
        ),
      );
    }
  }
}

reportAndExit("Analytics event-catalog completeness check", issues);

/** Events named by a surface doc, per the narrow extraction contract above. */
function extractEvents(text: string): Set<string> {
  const events = new Set<string>();
  const lines = text.split(/\r?\n/);

  // Bullet form: "- `event_name`" (whole line).
  for (const line of lines) {
    const bullet = /^\s*-\s+`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`\s*$/.exec(line);
    if (bullet?.[1]) {
      events.add(bullet[1]);
    }
  }

  // Table form: cells under an event/analytics header column.
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    const divider = lines[index + 1];
    if (!header || !divider || !/^\s*\|/.test(header) || !/^\s*\|[\s|:-]+\|\s*$/.test(divider)) {
      continue;
    }
    const headerCells = splitRow(header);
    const eventColumns = headerCells.map((cell, column) => (/event|analytics/i.test(cell) ? column : -1)).filter((column) => column >= 0);
    if (eventColumns.length === 0) {
      continue;
    }
    for (let row = index + 2; row < lines.length; row += 1) {
      const line = lines[row];
      if (!line || !/^\s*\|/.test(line)) {
        break;
      }
      const cells = splitRow(line);
      for (const column of eventColumns) {
        const cell = cells[column];
        if (!cell) {
          continue;
        }
        for (const match of cell.matchAll(eventToken)) {
          if (match[1]) {
            events.add(match[1]);
          }
        }
      }
    }
  }

  return events;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}
