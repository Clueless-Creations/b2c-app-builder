import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { type Harness, skillRoot } from "./_harness.js";

const GATE = "check-pack-composition.ts";

function writePack(root: string, name: string, body: unknown): void {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "pack.yaml"), stringifyYaml(body), "utf8");
}

export function register(harness: Harness): void {
  const run = (label: string, packsDir: string | undefined, expectedCode: number, expectedText?: string): void => {
    const extra = packsDir ? ["--packs-dir", packsDir] : [];
    harness.runScriptArgs(label, GATE, ["--skill-root", skillRoot, ...extra], expectedCode, expectedText);
  };

  run("pack-composition passes the shipped no-pack catalog", undefined, 0, "0 error(s)");

  {
    const root = harness.makeEmptyFixture("pack-composition-duplicate");
    writePack(root, "dup", {
      id: "capability.web-presence",
      title: "Web presence",
      version: "1.0.0",
      revision: "fixture",
      domains: [
        {
          id: "domain.research",
          slug: "research",
          name: "Research",
          area_ids: ["area.product-experience"],
          route_label: "Research",
          route_when: "fixture",
          order: 40,
        },
      ],
    });
    run("pack-composition fails on a duplicate global id", root, 1, "pack_composition.duplicate_id");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-cycle");
    writePack(root, "alpha", { id: "capability.alpha", title: "Alpha", version: "1.0.0", revision: "fixture", depends_on: ["capability.beta"] });
    writePack(root, "beta", { id: "capability.beta", title: "Beta", version: "1.0.0", revision: "fixture", depends_on: ["capability.alpha"] });
    run("pack-composition fails on a static dependency cycle", root, 1, "pack_composition.dependency_cycle");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-unresolved");
    writePack(root, "web", { id: "capability.web-presence", title: "Web", version: "1.0.0", revision: "fixture", depends_on: ["capability.missing"] });
    run("pack-composition fails on an unresolved pack reference", root, 1, "pack_composition.unresolved_reference");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-slot");
    writePack(root, "web", {
      id: "capability.web-presence",
      title: "Web",
      version: "1.0.0",
      revision: "fixture",
      extensions: [{ target_id: "workflow.missing", slot: "proof", kind: "bind" }],
    });
    run("pack-composition fails on an invalid extension slot", root, 1, "pack_composition.invalid_extension_slot");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-weaken");
    writePack(root, "food", {
      id: "business-pack.food-product-contrast",
      title: "Food",
      version: "1.0.0",
      revision: "fixture",
      extensions: [{ target_id: "workflow.trust.privacy-terms", slot: "proof", kind: "weaken", remove_gates: ["check:privacy-terms"] }],
    });
    run("pack-composition fails when a pack weakens a protected requirement", root, 1, "pack_composition.monotonicity_violation");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-identity");
    writePack(root, "context", { id: "context.founder-language", title: "Not a pack", version: "1.0.0", revision: "fixture" });
    run("pack-composition refuses context.* as a pack identity", root, 1, "pack_composition.identity_invalid");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-paid-ai-omitted");
    writePack(root, "chat", {
      id: "capability.chat-generation",
      title: "Chat generation",
      version: "1.0.0",
      revision: "fixture",
      creates_provider_spend: true,
    });
    run("pack-composition fails when a spend pack omits paid-AI controls", root, 1, "pack_composition.paid_ai_controls_missing");
  }

  {
    const root = harness.makeEmptyFixture("pack-composition-paid-ai-pinned");
    writePack(root, "chat", {
      id: "capability.chat-generation",
      title: "Chat generation",
      version: "1.0.0",
      revision: "fixture",
      creates_provider_spend: true,
    });
    writePack(root, "paid", {
      id: "capability.paid-generative-ai",
      title: "Paid generative-AI controls",
      version: "1.0.0",
      revision: "fixture",
      creates_provider_spend: true,
    });
    run("pack-composition passes when a spend pack pins the control pack", root, 0, "0 error(s)");
  }
}
