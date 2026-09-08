#!/usr/bin/env node
import { validateDesignSourceReferences } from "./design-acceptance.js";
import { loadDesignSystem, validateDesignMd } from "../../../../tooling/lib/design-md.js";
import { issue, parseCliArgs, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const design = loadDesignSystem(args.root);
const issues = [...validateDesignSourceReferences(args.root), ...design.issues, ...(design.markdown ? validateDesignMd(design.markdown) : [])];
if (process.argv.slice(2).includes("--require-foundation") && design.frontmatter?.foundation === undefined) {
  issues.push(
    issue(
      "error",
      "design_md.foundation_required",
      "Substantive design work requires foundation version 1 in the authored DESIGN.md. Preserve the base check for legacy and focused work.",
      "DESIGN.md",
    ),
  );
}
reportAndExit("DESIGN.md check", issues);
