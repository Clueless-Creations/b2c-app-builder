/**
 * Frozen per-page CRO / motion gates shared by design-acceptance and landing-funnel.
 *
 * Authority is `loadDesignSurfaceApplicability` (studio `interaction`, implemented
 * scroll-linked hooks, surface-contract applicable bit). Purpose prose is not parsed.
 * A conversion landing is scored for CRO. A static legal/support page is not forced
 * to invent conversion experiments, waitlist events, or motion evidence.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  loadDesignSurfaceApplicability,
  SURFACE_CONTRACT_PATH,
  STUDIO_SEED_PATH,
  type DesignSurfaceApplicability,
  type SurfaceApplicability,
} from "../../../../catalog/ontology/design-surface-applicability.js";
import { asString, isRecord, issue, type Issue } from "../../../../tooling/lib/launch-state.js";

export const CRO_AUDIT_PATHS = ["growth/CRO_AUDIT.md", "CRO_AUDIT.md"] as const;
const CONVERSION_EVENT_NAMES = ["landing_cta_clicked", "waitlist_submitted"] as const;
const CONVERSION_GOAL_PATTERN =
  /\b(waitlist|sign[- ]?up|purchase|cta|convert|conversion goal|primary action|email capture|app store redirect)\b/i;
const INVENTED_CONVERSION_PATTERN =
  /\b(conversion experiment|conversion goal|waitlist|primary cta|a\/b test|cro hypothesis|cro test)\b/i;
const WAIVES_CONVERSION_PATTERN = /\b(no conversion job|not a conversion|static document|legal page|no cro)\b/i;

function readOptional(root: string, relativePath: string): string | undefined {
  const absolute = path.join(root, relativePath);
  if (!existsSync(absolute)) return undefined;
  try {
    return readFileSync(absolute, "utf8");
  } catch {
    return undefined;
  }
}

function loadSurfaceContract(root: string): Record<string, unknown> | undefined {
  const absolute = path.join(root, SURFACE_CONTRACT_PATH);
  if (!existsSync(absolute)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(absolute, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function loadCroAudit(root: string): { path: string; text: string } | undefined {
  for (const relativePath of CRO_AUDIT_PATHS) {
    const text = readOptional(root, relativePath);
    if (text !== undefined) return { path: relativePath, text };
  }
  return undefined;
}

function markdownSections(text: string): Array<{ heading: string; body: string }> {
  const parts = text.split(/^##\s+/m);
  return parts.slice(1).map((part) => {
    const newline = part.indexOf("\n");
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? "" : part.slice(newline + 1);
    return { heading, body };
  });
}

function sectionForSurface(audit: string, surface: SurfaceApplicability): string | undefined {
  const sections = markdownSections(audit);
  const named = sections.find((section) => section.heading.toLowerCase() === surface.id.toLowerCase());
  if (named) return `${named.heading}\n${named.body}`;
  const mentioned = sections.find((section) => new RegExp(`\\b${escapeRegExp(surface.id)}\\b`, "i").test(`${section.heading}\n${section.body}`));
  if (mentioned) return `${mentioned.heading}\n${mentioned.body}`;
  if (new RegExp(`\\b${escapeRegExp(surface.id)}\\b`, "i").test(audit)) return audit;
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicWebSurfaces(applicability: DesignSurfaceApplicability): SurfaceApplicability[] {
  return applicability.surfaces.filter((surface) => surface.family === "landing" || surface.family === "web-funnel");
}

export function surfaceRequiresMotionInteractionEvidence(
  surfaceId: string,
  surfaceKind: string,
  applicability: DesignSurfaceApplicability,
): boolean {
  const row = applicability.surfaces.find((surface) => surface.id === surfaceId);
  if (row?.motionReference === "selected" || row?.scrollytelling === "selected") return true;
  return surfaceKind === "landing" && applicability.implementedScrollytelling;
}

export function validateFrozenPageTechniqueGates(root: string, codePrefix: string): Issue[] {
  const applicability = loadDesignSurfaceApplicability(root);
  const issues: Issue[] = [];
  const fail = (code: string, message: string, file: string): void => {
    issues.push(issue("error", `${codePrefix}.${code}`, message, file));
  };

  if (applicability.inventory === "present" && applicability.interactionUnresolved) {
    fail(
      "interaction_unresolved",
      "A listed studio surface omits a parseable interaction class. Record static-document, conversion, scroll-linked, standard-transition, or bespoke-motion before freezing CRO or motion evidence.",
      STUDIO_SEED_PATH,
    );
  }

  const webSurfaces = publicWebSurfaces(applicability);
  const cro = loadCroAudit(root);
  const contract = loadSurfaceContract(root);
  const staticWeb = webSurfaces.filter((surface) => surface.interaction === "static-document");
  const conversionWeb = webSurfaces.filter((surface) => surface.conversionExperiments === "selected");

  for (const surface of conversionWeb) {
    const section = cro ? sectionForSurface(cro.text, surface) : undefined;
    if (!cro || !section || !CONVERSION_GOAL_PATTERN.test(section)) {
      fail(
        "conversion_evidence_missing",
        `Conversion surface "${surface.id}" needs growth/CRO_AUDIT.md to name that page and one conversion goal. Do not invent scroll-linked motion to stand in for CRO.`,
        cro?.path ?? "growth/CRO_AUDIT.md",
      );
    }
  }

  for (const surface of staticWeb) {
    const section = cro ? sectionForSurface(cro.text, surface) : undefined;
    if (section && INVENTED_CONVERSION_PATTERN.test(section) && !WAIVES_CONVERSION_PATTERN.test(section)) {
      fail(
        "static_document_invented_conversion",
        `Static document "${surface.id}" must not invent a conversion experiment or waitlist job. Score it for semantic content, legibility, and truthful claims.`,
        cro!.path,
      );
    }
  }

  const contractEvents = contract && Array.isArray(contract.analytics_events) ? contract.analytics_events.map(asString) : [];
  if (
    staticWeb.length > 0 &&
    applicability.conversionExperiments === "not_required" &&
    CONVERSION_EVENT_NAMES.some((eventName) => contractEvents.includes(eventName))
  ) {
    fail(
      "static_document_invented_conversion",
      "A static legal or support inventory must not declare conversion analytics events (landing_cta_clicked, waitlist_submitted) in surface-contract.json.",
      SURFACE_CONTRACT_PATH,
    );
  }

  const scrollytelling = isRecord(contract) && isRecord(contract.scrollytelling) ? contract.scrollytelling : undefined;
  const inventedScrollytelling =
    scrollytelling?.applicable === true &&
    staticWeb.length > 0 &&
    !applicability.implementedScrollytelling &&
    !webSurfaces.some((surface) => surface.scrollytelling === "selected");
  if (inventedScrollytelling) {
    fail(
      "static_document_invented_scrollytelling",
      "surface-contract.json must not mark scrollytelling applicable for a static-document page. Do not restore universal scrollytelling on legal or support URLs.",
      SURFACE_CONTRACT_PATH,
    );
  }

  return issues;
}

export function conversionAnalyticsEventsRequired(root: string): boolean {
  return loadDesignSurfaceApplicability(root).conversionExperiments === "selected";
}
