import { readFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import {
  resolveGuideRatio,
  resolveSaveDataPreference,
  resolveSceneFrame,
  resolveSceneSaveDataRenderMode,
  resolveSceneStateBindings,
  resolveVisualExposure,
  validateSceneVisualPolicy,
  validateStableStateIds,
} from "../../../examples/workspace/business/growth/landing/lib/scene-progress.js";
export function register(harness: Harness): void {
  harness.check("scrollytelling: measured step centers own the active beat", () => {
    const frame = resolveSceneFrame({
      stepCenters: [100, 800, 900],
      sceneStart: 0,
      sceneEnd: 1_050,
      guidePosition: 450,
      direction: "forward",
    });
    assert(frame.beatIndex === 0, `expected the first measured beat, got ${frame.beatIndex}`);
    assert(frame.beatProgress === 0.5, `expected progress 0.5 between real centers, got ${frame.beatProgress}`);
    assert(frame.sceneProgress === 0.4375, `expected measured scene progress 0.4375, got ${frame.sceneProgress}`);
  });

  harness.check("scrollytelling: forward, reverse, and jump resolve the same geometry", () => {
    const input = {
      stepCenters: [100, 800, 900],
      sceneStart: 0,
      sceneEnd: 1_050,
      guidePosition: 850,
    } as const;
    const forward = resolveSceneFrame({ ...input, direction: "forward" });
    const reverse = resolveSceneFrame({ ...input, direction: "reverse" });
    const restoredJump = resolveSceneFrame(input);
    assert(forward.beatIndex === 1, `expected beat 1, got ${forward.beatIndex}`);
    assert(reverse.beatIndex === forward.beatIndex, "reverse direction changed the geometry-owned state");
    assert(restoredJump.beatIndex === forward.beatIndex, "a restored jump did not resolve directly from geometry");
    assert(reverse.beatProgress === forward.beatProgress, "reverse direction changed measured beat progress");
  });

  harness.check("scrollytelling: the visual handoff is scroll-owned and reversible", () => {
    const outgoing = resolveVisualExposure(0, 0, 0.825, 3);
    const incoming = resolveVisualExposure(1, 0, 0.825, 3);
    assert(Math.abs(outgoing - 0.5) < 1e-9, `expected outgoing exposure 0.5, got ${outgoing}`);
    assert(Math.abs(incoming - 0.5) < 1e-9, `expected incoming exposure 0.5, got ${incoming}`);
    assert(resolveVisualExposure(0, 0, 0.65, 3) === 1, "visual handoff started before its scroll threshold");
    assert(resolveVisualExposure(1, 0, 1, 3) === 1, "the next visual did not fully resolve at its anchor");
  });

  harness.check("scrollytelling: mobile and short-height guides are authored separately", () => {
    assert(resolveGuideRatio({ desktop: 0.48 }) === 0.48, "desktop guide did not use its authored ratio");
    assert(resolveGuideRatio({ mobile: 0.7, isMobile: true }) === 0.7, "mobile guide did not use its authored ratio");
    assert(
      resolveGuideRatio({ mobile: 0.7, shortMobile: 0.84, isMobile: true, isShortMobile: true }) === 0.84,
      "short-height mobile guide did not override the normal mobile guide",
    );
  });

  harness.check("scrollytelling: stable IDs survive copy changes and reject derived labels", () => {
    assert(validateStableStateIds(["situation", "mechanism", "verified"]).valid, "semantic state IDs should pass");
    assert(!validateStableStateIds(["situation", "situation"]).valid, "duplicate state IDs should fail");
    assert(!validateStableStateIds(["A translated heading"]).valid, "display copy should not pass as a state ID");
  });

  harness.check("scrollytelling: reordered visual DOM binds by stable state ID", () => {
    const result = resolveSceneStateBindings(["situation", "mechanism", "outcome"], ["outcome", "situation", "mechanism"]);
    assert(result.valid, `reordered semantic visuals should bind: ${result.errors.join(" ")}`);
    assert(result.bindings[0]?.visualIndex === 1, "situation bound to DOM index instead of its matching visual state ID");
    assert(result.bindings[1]?.visualIndex === 2, "mechanism bound to DOM index instead of its matching visual state ID");
    assert(result.bindings[2]?.visualIndex === 0, "outcome bound to DOM index instead of its matching visual state ID");
  });

  harness.check("scrollytelling: the controller keys visual elements by ID and fails closed", () => {
    const source = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/lib/scroll-scene-controller.ts"), "utf8");
    assert(source.includes("visualElementByState.get(binding.stateId)"), "controller lookup is not keyed by stable visual state ID");
    assert(!source.includes("visuals[binding.visualIndex]"), "controller still pairs semantic steps to visual DOM order");
    assert(source.includes("restoreStaticPresentation(element, steps, visuals)"), "invalid bindings do not restore the complete static presentation");
    assert(source.includes("[B2C App Builder scrollytelling] Enhancement skipped"), "invalid bindings do not emit an actionable warning");
  });

  harness.check("scrollytelling: duplicate state IDs fail closed with no bindings", () => {
    const duplicateStep = resolveSceneStateBindings(["situation", "situation"], ["situation", "outcome"]);
    const duplicateVisual = resolveSceneStateBindings(["situation", "outcome"], ["situation", "situation"]);
    assert(!duplicateStep.valid && duplicateStep.bindings.length === 0, "duplicate semantic steps produced ambiguous bindings");
    assert(!duplicateVisual.valid && duplicateVisual.bindings.length === 0, "duplicate scene visuals produced ambiguous bindings");
  });

  harness.check("scrollytelling: missing and mismatched state IDs skip enhancement", () => {
    const missing = resolveSceneStateBindings(["situation", undefined], ["situation", "outcome"]);
    const mismatch = resolveSceneStateBindings(["situation", "mechanism"], ["situation", "outcome"]);
    assert(!missing.valid && missing.bindings.length === 0, "a missing state ID produced enhancement bindings");
    assert(!mismatch.valid && mismatch.bindings.length === 0, "mismatched step and visual IDs produced enhancement bindings");
  });

  harness.check("scrollytelling: server and browser Save-Data signals are additive", () => {
    assert(!resolveSaveDataPreference(undefined, false), "an absent Save-Data signal should keep normal media policy");
    assert(resolveSaveDataPreference(true, false), "a server-observed Save-Data signal was lost after hydration");
    assert(resolveSaveDataPreference(false, true), "the browser Save-Data preference did not strengthen a server false value");
    assert(resolveSaveDataPreference(true, true), "two Save-Data signals should remain enabled");
  });

  harness.check("scrollytelling: the SSR source keeps every step and initializes only the complete final visual", () => {
    const source = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/sections/Scrollytelling.tsx"), "utf8");
    assert(source.includes('data-scene-save-data={saveData ? "true" : "false"}'), "server-observed Save-Data is not serialized into the SSR scene root");
    assert(source.includes('<ol className="lm-scrolly-steps">'), "SSR source has no semantic ordered list");
    assert(source.includes("{step.body}"), "SSR source does not render every step body");
    assert(source.includes("<figcaption"), "SSR source has no figure caption");
    assert(source.includes("const current = index === finalIndex"), "SSR source does not initialize from the complete final state");
    assert(
      source.includes('const visualCurrent = current && saveDataRenderMode !== "omit"'),
      "SSR source does not hide superseded visual panels while keeping the final panel available",
    );
  });

  harness.check("scrollytelling: code-native and proven poster policies survive server Save-Data", () => {
    const codeNative = { sourceKind: "svg", saveDataFallback: "code-native", hasPoster: false } as const;
    const poster = {
      sourceKind: "video",
      saveDataFallback: "poster",
      posterAssetId: "asset.video-poster",
      hasPoster: true,
    } as const;
    assert(validateSceneVisualPolicy(codeNative).valid, "code-native scenes should not need a poster");
    assert(resolveSceneSaveDataRenderMode(codeNative, true) === "visual", "Save-Data hid a code-native scene");
    assert(validateSceneVisualPolicy(poster).valid, "a proven lightweight poster policy should pass");
    assert(resolveSceneSaveDataRenderMode(poster, true) === "poster", "Save-Data did not select the proven poster");
  });

  harness.check("scrollytelling: heavy media without poster proof is omitted, never rendered", () => {
    const missingPoster = { sourceKind: "image", saveDataFallback: "poster", posterAssetId: "", hasPoster: false } as const;
    const undeclaredFallback = { sourceKind: "video", hasPoster: false } as const;
    const explicitOmission = { sourceKind: "video", saveDataFallback: "omit", hasPoster: false } as const;
    assert(!validateSceneVisualPolicy(missingPoster).valid, "missing poster node and proof should fail policy validation");
    assert(resolveSceneSaveDataRenderMode(missingPoster, true) === "omit", "invalid image policy fell back to heavy bytes");
    assert(!validateSceneVisualPolicy(undeclaredFallback).valid, "heavy media without a fallback declaration should fail");
    assert(resolveSceneSaveDataRenderMode(undeclaredFallback, true) === "omit", "undeclared video fallback rendered heavy bytes");
    assert(validateSceneVisualPolicy(explicitOmission).valid, "explicit Save-Data omission should be valid");
    assert(resolveSceneSaveDataRenderMode(explicitOmission, true) === "omit", "explicit omission did not omit heavy media");
  });

  harness.check("scrollytelling: React adapter enforces poster proof and omission before hydration", () => {
    const source = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/sections/Scrollytelling.tsx"), "utf8");
    assert(source.includes("PosterSceneVisualPolicy & { poster: ReactNode }"), "heavy poster steps do not require an authored poster node");
    assert(
      source.includes('saveDataRenderMode === "visual" ? step.visual : saveDataRenderMode === "poster" ? step.poster : null'),
      "server-observed Save-Data can still fall through to heavy visual bytes",
    );
    assert(source.includes("CodeNativeSceneVisualPolicy & { poster?: never }"), "code-native steps unexpectedly require a poster");
    assert(source.includes("PosterSceneVisualPolicy & { poster: ReactNode }"), "heavy-media poster steps do not require a poster node");
    assert(source.includes("OmittedSceneVisualPolicy & { poster?: never }"), "heavy media cannot explicitly choose server-side omission");
    assert(
      source.includes('data-scene-visual-omitted={saveDataRenderMode === "omit" ? "true" : undefined}'),
      "omitted server visuals are not marked for the controller",
    );
  });

  harness.check("scrollytelling: media policy and visual viewport updates are edge-triggered", () => {
    const source = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/lib/scroll-scene-controller.ts"), "utf8");
    assert(source.includes("record.appliedSaveData !== resolvedSaveData"), "Save-Data media queries still run on every scroll frame");
    assert(
      /function onPreferenceChange\(\): void \{\s*fullUpdatePending = true;\s*schedule\(\);\s*\}/u.test(source),
      "preference changes still force geometry remeasurement instead of one full state update",
    );
    assert(source.includes('visualViewport?.addEventListener("scroll", onScroll'), "visualViewport scroll does not use the lightweight frame-update path");
    assert(!source.includes('visualViewport?.addEventListener("scroll", onViewportChange'), "visualViewport scroll still triggers full scene remeasurement");
  });

  harness.check("scrollytelling: portable SSR example is complete and no-JS final state is visible", () => {
    const exampleName = "scrollytelling.portable.example.html";
    const example = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing", exampleName), "utf8");
    const css = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/motion.css"), "utf8");
    const readme = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/README.md"), "utf8");
    const doctrine = readFileSync(path.join(skillRoot, "knowledge/design/editorial-scrollytelling.md"), "utf8");
    const root = example.match(/<section\b[^>]*data-scene-track[^>]*>/su)?.[0] ?? "";

    assert(root.includes('class="lm-scrolly"'), "portable scene root is missing the structural class");
    assert(root.includes('aria-labelledby="verified-record-heading"'), "portable scene root is not named by its heading");
    for (const attribute of [
      'data-scene-state="proof"',
      'data-scene-beat="proof"',
      'data-scene-final="proof"',
      'data-scene-direction="forward"',
      'data-scene-motion="static"',
      'data-scene-lifecycle="static"',
      'data-scene-save-data="true"',
      'data-scene-guide="0.5"',
      'data-scene-mobile-guide="0.72"',
      'data-scene-short-mobile-guide="0.82"',
    ]) {
      assert(root.includes(attribute), `portable scene root is missing ${attribute}`);
    }
    for (const variable of ["--scene-p: 1", "--beat-t: 1", "--beat-index: 3", "--beat-count: 4"]) {
      assert(root.includes(variable), `portable scene root is missing ${variable}`);
    }

    for (const className of [
      "lm-scrolly-heading",
      "lm-section-heading",
      "lm-scrolly-layout",
      "lm-scrolly-pin",
      "lm-scrolly-stage",
      "lm-scrolly-visual",
      "lm-visually-hidden",
      "lm-scrolly-steps",
      "lm-scrolly-step-marker",
      "lm-scrolly-step-label",
    ]) {
      assert(example.includes(className), `portable SSR example is missing .${className}`);
    }
    assert(example.includes("<figure"), "portable SSR example has no semantic figure");
    assert(example.includes("<figcaption>"), "portable SSR example has no figure caption");
    assert(example.includes('<ol class="lm-scrolly-steps">'), "portable SSR example has no ordered reading sequence");

    const stepTags = [...example.matchAll(/<li\b[^>]*data-scene-step-state="([^"]+)"[^>]*>/gu)];
    const visualTags = [...example.matchAll(/<div\b[^>]*data-scene-visual-state="([^"]+)"[^>]*>/gu)];
    const stepIds = stepTags.map((match) => match[1]!);
    const visualIds = visualTags.map((match) => match[1]!);
    assert(stepIds.length === 4, `portable example must render every semantic step; found ${stepIds.length}`);
    assert(visualIds.length === stepIds.length, "portable example does not render one visual wrapper per semantic step");
    assert(new Set(stepIds).size === stepIds.length, "portable example repeats a semantic step ID");
    assert(new Set(visualIds).size === visualIds.length, "portable example repeats a visual state ID");
    assert([...stepIds].sort().join("|") === [...visualIds].sort().join("|"), "portable step and visual state IDs do not match exactly");
    stepTags.forEach((match) => assert(/\sdata-scene-step(?:\s|>)/u.test(match[0]), `step ${match[1]} is missing data-scene-step`));
    visualTags.forEach((match) => {
      assert(/\sdata-scene-visual(?:\s|>)/u.test(match[0]), `visual ${match[1]} is missing data-scene-visual`);
      assert(/data-scene-visual-active="(?:true|false)"/u.test(match[0]), `visual ${match[1]} has no static active state`);
      assert(/aria-hidden="(?:true|false)"/u.test(match[0]), `visual ${match[1]} has no static ARIA state`);
    });

    const finalVisual = visualTags.find((match) => match[1] === "proof")?.[0] ?? "";
    const finalStep = stepTags.find((match) => match[1] === "proof")?.[0] ?? "";
    assert(finalVisual.includes('data-scene-visual-active="true"'), "no-JS final visual is not active in SSR markup");
    assert(finalVisual.includes('aria-hidden="false"'), "no-JS final visual is hidden from assistive technology");
    assert(!finalVisual.includes("data-scene-visual-omitted"), "portable final visual is marked as omitted");
    assert(finalStep.includes('aria-current="step"'), "no-JS final semantic step has no aria-current state");
    visualTags
      .filter((match) => match[1] !== "proof")
      .forEach((match) => {
        assert(match[0].includes('data-scene-visual-active="false"'), `superseded visual ${match[1]} is active in static SSR`);
        assert(match[0].includes('aria-hidden="true"'), `superseded visual ${match[1]} is exposed in static SSR`);
      });

    const posterTag = visualTags.find((match) => match[0].includes('data-scene-save-data-fallback="poster"'))?.[0] ?? "";
    const omittedTag = visualTags.find((match) => match[0].includes('data-scene-save-data-fallback="omit"'))?.[0] ?? "";
    assert(posterTag.includes('data-scene-poster-asset-id="asset.review-queue-poster"'), "portable poster has no recorded asset proof");
    assert(!posterTag.includes("data-scene-heavy-media"), "portable Save-Data poster is still marked as heavy media");
    assert(omittedTag.includes('data-scene-visual-omitted="true"'), "portable omission wrapper is not explicit");
    const omittedStart = example.indexOf(omittedTag);
    const omittedEnd = example.indexOf("</div>", omittedStart);
    const omittedContent = omittedStart >= 0 && omittedEnd > omittedStart ? example.slice(omittedStart + omittedTag.length, omittedEnd) : "";
    assert(!/<(?:img|video|source)\b/u.test(omittedContent), "portable omission wrapper still emits heavy source markup");

    assert(
      /\.lm-scrolly\[data-scene-motion="static"\]\s+\.lm-scrolly-visual\[data-scene-visual-active="true"\]:not\(\[data-scene-visual-omitted="true"\]\)\s*\{[^}]*opacity:\s*1;/su.test(
        css,
      ),
      "static active visual is not visible without JavaScript",
    );
    assert(/\.lm-scrolly-visual\s*\{[^}]*opacity:\s*var\(--lm-visual-p, 0\);/su.test(css), "controller interpolation no longer owns scroll-mode opacity");
    assert(readme.includes(`(${`./${exampleName}`})`), "landing README does not point portable hosts to the exact specimen");
    assert(doctrine.includes(exampleName), "editorial doctrine does not point portable hosts to the exact specimen");
  });

  harness.check("scrollytelling: Save-Data and progress-line CSS are pre-hydration and RTL safe", () => {
    const css = readFileSync(path.join(skillRoot, "examples/workspace/business/growth/landing/motion.css"), "utf8");
    assert(
      css.includes('.lm-scrolly[data-scene-save-data="true"] [data-scene-heavy-media]'),
      "Save-Data CSS does not hide marked heavy media from the server-rendered state",
    );
    assert(css.includes("inset-inline: 5%"), "the progress line still uses physical inline positioning");
    assert(
      /\.lm-scrolly:dir\(rtl\) \.lm-scrolly-stage::after\s*\{[^}]*transform-origin:\s*right center/su.test(css),
      "the progress line has no RTL transform-origin override",
    );
  });
}
