import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  loadDesignSurfaceApplicability,
  parseSixtyFpsToolDecision,
  projectDesignSurfaceApplicability,
  type InteractionKind,
} from "../../../catalog/ontology/design-surface-applicability.js";
import { validateFrozenPageTechniqueGates } from "../../validation/business/design/surface-page-gates.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function surfaceRecord(id: string, interaction?: InteractionKind | "omit"): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id,
    name: id,
    status: "draft",
    purpose: "purpose prose must not be parsed as a technique class",
    decisions: [],
    tokenReferences: [],
  };
  if (interaction !== undefined && interaction !== "omit") record.interaction = interaction;
  return record;
}

function studioDoc(input: {
  landingPages?: Array<{ id: string; interaction?: InteractionKind | "omit" }>;
  screens?: Array<{ id: string; interaction?: InteractionKind | "omit" }>;
  marketingAssets?: Array<{ id: string; interaction?: InteractionKind | "omit" }>;
}): Record<string, unknown> {
  return {
    surfaces: {
      landingPages: (input.landingPages ?? []).map((row) => surfaceRecord(row.id, row.interaction)),
      webFunnels: [],
      marketingAssets: (input.marketingAssets ?? []).map((row) => surfaceRecord(row.id, row.interaction)),
      mobileApp: {
        screens: (input.screens ?? []).map((row) => surfaceRecord(row.id, row.interaction)),
      },
    },
  };
}

function toolMarkdown(access: string, route: string): string {
  return [
    "## Workflow intake",
    "",
    "| Tool | Lane | Access status | Founder confirmation | Selected route | Fallback limitation |",
    "| --- | --- | --- | --- | --- | --- |",
    `| 60fps.design MCP | design | ${access} | required before paid access | ${route} | distilled recipes are not equivalent |`,
    "",
  ].join("\n");
}

export function register(harness: Harness): void {
  harness.check("design-surface-applicability: empty studio inventory does not select 60fps", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({}),
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: undefined,
    });
    assert(projected.inventory === "empty", `inventory ${projected.inventory}`);
    assert(projected.sixtyFpsRegister === "not_required", `60fps ${projected.sixtyFpsRegister}`);
    assert(projected.scrollytelling === "not_required", `scrolly ${projected.scrollytelling}`);
    assert(projected.conversionExperiments === "not_required", `conversion ${projected.conversionExperiments}`);
    assert(!projected.interactionUnresolved, "empty inventory is not an unresolved listed surface");
  });

  harness.check("design-surface-applicability: missing studio seed stays unresolved", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: undefined,
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: undefined,
    });
    assert(projected.inventory === "missing", `inventory ${projected.inventory}`);
    assert(projected.sixtyFpsRegister === "unresolved", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: static legal page does not require scrollytelling or 60fps", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ landingPages: [{ id: "privacy", interaction: "static-document" }] }),
      implementedScrollytelling: false,
      contractApplicable: false,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "60fps MCP")),
    });
    assert(projected.scrollytelling === "not_required", `scrolly ${projected.scrollytelling}`);
    assert(projected.conversionExperiments === "not_required", `conversion ${projected.conversionExperiments}`);
    assert(projected.sixtyFpsRegister === "not_required", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: conversion landing without scroll-linked behavior does not select 60fps", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ landingPages: [{ id: "home", interaction: "conversion" }] }),
      implementedScrollytelling: false,
      contractApplicable: false,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "60fps MCP")),
    });
    assert(projected.conversionExperiments === "selected", `conversion ${projected.conversionExperiments}`);
    assert(projected.scrollytelling === "not_required", `scrolly ${projected.scrollytelling}`);
    assert(projected.sixtyFpsRegister === "not_required", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: selected scrollytelling requires 60fps when the MCP is connected", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ landingPages: [{ id: "cinematic", interaction: "scroll-linked" }] }),
      implementedScrollytelling: false,
      contractApplicable: true,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "search_shots route")),
    });
    assert(projected.scrollytelling === "selected", `scrolly ${projected.scrollytelling}`);
    assert(projected.sixtyFpsRegister === "selected", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: native standard transitions do not select a paid motion catalog", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ screens: [{ id: "home", interaction: "standard-transition" }] }),
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "60fps MCP")),
    });
    assert(projected.sixtyFpsRegister === "not_required", `60fps ${projected.sixtyFpsRegister}`);
    assert(projected.scrollytelling === "not_required", `scrolly ${projected.scrollytelling}`);
  });

  harness.check("design-surface-applicability: bespoke motion with a blocked 60fps route is unavailable", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ screens: [{ id: "hero", interaction: "bespoke-motion" }] }),
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("blocked", "fallback distilled recipes")),
    });
    assert(projected.sixtyFpsRegister === "unavailable", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: listed surface missing interaction stays unresolved", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ landingPages: [{ id: "privacy", interaction: "omit" }] }),
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "60fps MCP")),
    });
    assert(projected.interactionUnresolved, "missing interaction must stay unresolved");
    assert(projected.surfaces[0]?.interaction === "unresolved", `surface ${String(projected.surfaces[0]?.interaction)}`);
    assert(projected.sixtyFpsRegister === "unresolved", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: mixed static, conversion, and cinematic surfaces keep distinct techniques", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({
        landingPages: [
          { id: "privacy", interaction: "static-document" },
          { id: "home", interaction: "conversion" },
          { id: "story", interaction: "scroll-linked" },
        ],
      }),
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("ready", "60fps MCP")),
    });
    assert(projected.surfaces.find((row) => row.id === "privacy")?.scrollytelling === "not_required", "privacy must not invent scrollytelling");
    assert(projected.surfaces.find((row) => row.id === "home")?.conversionExperiments === "selected", "home conversion job is selected");
    assert(projected.surfaces.find((row) => row.id === "story")?.scrollytelling === "selected", "cinematic landing is selected");
    assert(projected.scrollytelling === "selected", `workspace scrolly ${projected.scrollytelling}`);
    assert(projected.conversionExperiments === "selected", `workspace conversion ${projected.conversionExperiments}`);
    assert(projected.sixtyFpsRegister === "selected", `workspace 60fps ${projected.sixtyFpsRegister}`);
    assert(!projected.interactionUnresolved, "classified mixed inventory is not unresolved");
  });

  harness.check("design-surface-applicability: purpose prose is not a technique class", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: {
        surfaces: {
          landingPages: [
            {
              id: "privacy",
              purpose: "cinematic scrollytelling conversion landing with bespoke motion",
              decisions: [],
              tokenReferences: [],
            },
          ],
          webFunnels: [],
          marketingAssets: [],
          mobileApp: { screens: [] },
        },
      },
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "60fps MCP")),
    });
    assert(projected.interactionUnresolved, "purpose prose must not classify the surface");
    assert(projected.sixtyFpsRegister === "unresolved", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: implemented scroll-linked hooks select scrollytelling even when studio omitted it", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ landingPages: [{ id: "home", interaction: "conversion" }] }),
      implementedScrollytelling: true,
      contractApplicable: false,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("connected", "60fps MCP")),
    });
    assert(projected.scrollytelling === "selected", `scrolly ${projected.scrollytelling}`);
    assert(projected.sixtyFpsRegister === "selected", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: contract applicable true selects scrollytelling", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({}),
      implementedScrollytelling: false,
      contractApplicable: true,
      sixtyFpsTool: parseSixtyFpsToolDecision(toolMarkdown("active", "60fps MCP")),
    });
    assert(projected.scrollytelling === "selected", `scrolly ${projected.scrollytelling}`);
    assert(projected.sixtyFpsRegister === "selected", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: selected motion without a 60fps intake row stays unresolved", () => {
    const projected = projectDesignSurfaceApplicability({
      studio: studioDoc({ screens: [{ id: "hero", interaction: "bespoke-motion" }] }),
      implementedScrollytelling: false,
      contractApplicable: undefined,
      sixtyFpsTool: parseSixtyFpsToolDecision("## Workflow intake\n\nNo 60fps row yet.\n"),
    });
    assert(projected.sixtyFpsRegister === "unresolved", `60fps ${projected.sixtyFpsRegister}`);
  });

  harness.check("design-surface-applicability: example workspace leaves 60fps not selected", () => {
    const projected = loadDesignSurfaceApplicability(path.join(skillRoot, "examples/workspace/business"));
    assert(projected.inventory === "empty", `inventory ${projected.inventory}`);
    assert(projected.sixtyFpsRegister === "not_required", `60fps ${projected.sixtyFpsRegister}`);
    assert(!projected.implementedScrollytelling, "shipped section library is not an implemented landing");
  });

  harness.check("design-surface-applicability: changing studio interaction recomputes the 60fps register", () => {
    const root = harness.makeTempDir("design-surface-recompute");
    cpSync(path.join(skillRoot, "examples/workspace/business/studio"), path.join(root, "studio"), { recursive: true });
    mkdirSync(path.join(root, "strategy"), { recursive: true });
    writeFileSync(path.join(root, "strategy/TOOL_DECISIONS.md"), toolMarkdown("connected", "60fps MCP"), "utf8");
    const before = loadDesignSurfaceApplicability(root);
    assert(before.sixtyFpsRegister === "not_required", `before ${before.sixtyFpsRegister}`);
    const seedPath = path.join(root, "studio/seed/business.json");
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as { surfaces: { landingPages: unknown[] } };
    seed.surfaces.landingPages = [surfaceRecord("story", "scroll-linked")];
    writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
    const after = loadDesignSurfaceApplicability(root);
    assert(after.sixtyFpsRegister === "selected", `after ${after.sixtyFpsRegister}`);
  });

  harness.check("page-gates: static privacy without invented CRO passes", () => {
    const root = harness.makeTempDir("page-gates-static");
    mkdirSync(path.join(root, "studio/seed"), { recursive: true });
    writeFileSync(
      path.join(root, "studio/seed/business.json"),
      JSON.stringify(studioDoc({ landingPages: [{ id: "privacy", interaction: "static-document" }] }), null, 2),
      "utf8",
    );
    const issues = validateFrozenPageTechniqueGates(root, "page_gates");
    assert(issues.length === 0, JSON.stringify(issues));
  });

  harness.check("page-gates: conversion landing without CRO evidence fails", () => {
    const root = harness.makeTempDir("page-gates-conversion");
    mkdirSync(path.join(root, "studio/seed"), { recursive: true });
    writeFileSync(
      path.join(root, "studio/seed/business.json"),
      JSON.stringify(studioDoc({ landingPages: [{ id: "landing", interaction: "conversion" }] }), null, 2),
      "utf8",
    );
    const issues = validateFrozenPageTechniqueGates(root, "page_gates");
    assert(
      issues.some((entry) => entry.code === "page_gates.conversion_evidence_missing"),
      JSON.stringify(issues),
    );
  });

  harness.check("page-gates: mixed inventory stays distinct", () => {
    const root = harness.makeTempDir("page-gates-mixed");
    mkdirSync(path.join(root, "studio/seed"), { recursive: true });
    mkdirSync(path.join(root, "growth"), { recursive: true });
    writeFileSync(
      path.join(root, "studio/seed/business.json"),
      JSON.stringify(
        studioDoc({
          landingPages: [
            { id: "privacy", interaction: "static-document" },
            { id: "landing", interaction: "conversion" },
            { id: "story", interaction: "scroll-linked" },
          ],
        }),
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      path.join(root, "growth/CRO_AUDIT.md"),
      "# CRO audit\n\n## landing\n\nConversion goal: waitlist signup.\n\n## privacy\n\nNo conversion job. Static document legal page.\n",
      "utf8",
    );
    const issues = validateFrozenPageTechniqueGates(root, "page_gates");
    assert(issues.length === 0, JSON.stringify(issues));
  });
}
