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

  const mixedFixtureRoot = path.join(skillRoot, "examples/mixed-surfaces/business");

  harness.check("design-surface-applicability: mixed live fixture keeps per-page techniques distinct", () => {
    const projected = loadDesignSurfaceApplicability(mixedFixtureRoot);
    const byId = Object.fromEntries(projected.surfaces.map((surface) => [surface.id, surface]));
    assert(projected.inventory === "present", `inventory ${projected.inventory}`);
    assert(byId.privacy?.interaction === "static-document", `privacy ${byId.privacy?.interaction}`);
    assert(byId.privacy?.scrollytelling === "not_required", `privacy scrolly ${byId.privacy?.scrollytelling}`);
    assert(byId.privacy?.conversionExperiments === "not_required", `privacy conversion ${byId.privacy?.conversionExperiments}`);
    assert(byId.conversion?.interaction === "conversion", `conversion ${byId.conversion?.interaction}`);
    assert(byId.conversion?.scrollytelling === "not_required", `conversion scrolly ${byId.conversion?.scrollytelling}`);
    assert(byId.conversion?.conversionExperiments === "selected", `conversion experiments ${byId.conversion?.conversionExperiments}`);
    assert(byId.cinematic?.interaction === "scroll-linked", `cinematic ${byId.cinematic?.interaction}`);
    assert(byId.cinematic?.scrollytelling === "selected", `cinematic scrolly ${byId.cinematic?.scrollytelling}`);
    assert(projected.scrollytelling === "selected", `rollup scrolly ${projected.scrollytelling}`);
    assert(projected.conversionExperiments === "selected", `rollup conversion ${projected.conversionExperiments}`);
    assert(projected.sixtyFpsRegister === "selected", `60fps ${projected.sixtyFpsRegister}`);
    assert(projected.implementedScrollytelling, "cinematic page must implement scene hooks");
  });

  harness.check("page-gates: mixed live fixture stays honest", () => {
    const issues = validateFrozenPageTechniqueGates(mixedFixtureRoot, "page_gates");
    assert(issues.length === 0, JSON.stringify(issues));
  });

  harness.check("mixed live fixture finding artifact is filled against the frozen rubric", () => {
    const review = readFileSync(path.join(mixedFixtureRoot, "design/reviews/MIXED_SURFACE_INDEPENDENT_REVIEW.md"), "utf8");
    assert(/\bStatus:\s*\*\*filled\*\*/.test(review), "finding artifact must be filled");
    assert(!/\bStatus:\s*\*\*pending\*\*/.test(review), "finding artifact must leave pending");
    assert(!/Awaiting a fresh-context reviewer/.test(review), "placeholder finding rows must be gone");
    const verdict = review.split("## Verdict")[1] ?? "";
    assert(/^\s*hold\b/m.test(verdict), "verdict must record hold");
    assert(!/\bAccept increment\b/.test(review), "reviewer must not write an accept increment");
    assert(/\bprivacy\b/i.test(review) && /\bconversion\b/i.test(review) && /\bcinematic\b/i.test(review), "findings must cover all three surfaces");
    assert(/RUBRIC-mixed-surface-v1/.test(review), "review must name the frozen rubric");
    const privacy = readFileSync(path.join(mixedFixtureRoot, "growth/landing/privacy.html"), "utf8");
    const conversion = readFileSync(path.join(mixedFixtureRoot, "growth/landing/conversion.html"), "utf8");
    const cinematic = readFileSync(path.join(mixedFixtureRoot, "growth/landing/cinematic.html"), "utf8");
    assert(!/data-scene-(?:id|track|step)|--scene-p/.test(privacy), "privacy must stay a static document");
    assert(!/data-scene-(?:id|track|step)|--scene-p/.test(conversion), "conversion must not invent scroll-linked hooks");
    assert(/data-scene-track/.test(cinematic), "cinematic must implement scroll-linked hooks");
  });

  harness.check("residual guidance does not restore universal 60fps or scrollytelling procedure", () => {
    const evidenceStack = readFileSync(path.join(skillRoot, "knowledge/design/design-evidence-stack.md"), "utf8");
    assert(
      !/If it is not connected, use the public catalog and the distilled recipes/.test(evidenceStack),
      "design-evidence-stack must not offer distilled recipes as the disconnected procedure",
    );
    assert(/not the disconnected procedure/.test(evidenceStack), "design-evidence-stack must refuse the recipe fallback");
    const landingProducer = readFileSync(path.join(skillRoot, "catalog/workflows/growth-revenue.ts"), "utf8");
    const landingNode = landingProducer.split('id: "workflow.growth.pre-launch-funnel-landing-waitlist"')[1] ?? "";
    assert(
      /When that selected or implemented scroll-linked surface is in scope, follow editorial-scrollytelling\.md/.test(landingNode),
      "landing producer must gate editorial-scrollytelling.md on selected or implemented scroll-linked",
    );
    assert(
      /Do not follow editorial-scrollytelling\.md on static-document or conversion pages/.test(landingNode),
      "landing producer must refuse editorial-scrollytelling.md on static and conversion pages",
    );
    const onboarding = readFileSync(path.join(skillRoot, "examples/workspace/business/product/ONBOARDING.md"), "utf8");
    assert(!/Record the shot ID/.test(onboarding), "example ONBOARDING must not restore a shot-ID placeholder row");
    assert(/Do not invent a shot ID/.test(onboarding), "example ONBOARDING must refuse invented shot IDs");
  });
}
