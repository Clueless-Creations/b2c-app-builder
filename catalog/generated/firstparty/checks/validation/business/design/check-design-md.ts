#!/usr/bin/env node
import { validateDesignSourceReferences } from "./design-acceptance.js";
import { loadDesignSystem, validateDesignMd } from "../../../../tooling/lib/design-md.js";
import { parseCliArgs, reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const design = loadDesignSystem(args.root);
const issues = [...validateDesignSourceReferences(args.root), ...design.issues, ...(design.markdown ? validateDesignMd(design.markdown) : [])];
reportAndExit("DESIGN.md check", issues);
