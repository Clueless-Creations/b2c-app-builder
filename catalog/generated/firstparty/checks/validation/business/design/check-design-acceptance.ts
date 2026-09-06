#!/usr/bin/env node
import { parseCliArgs, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { validateDesignAcceptance } from "./design-acceptance.js";

const args = parseCliArgs(process.argv.slice(2));
reportAndExit("Design acceptance evidence check", validateDesignAcceptance(args.root));
