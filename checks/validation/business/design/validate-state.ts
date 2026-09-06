#!/usr/bin/env node
import { loadDesignState, parseDesignCliArgs, rel } from "../../../../tooling/lib/design-state.js";
import { reportAndExit } from "../../../../tooling/lib/launch-state.js";

const args = parseDesignCliArgs(process.argv.slice(2));
const loaded = loadDesignState(args);

console.log(`Design state: ${rel(args.root, args.statePath)}`);
console.log("Design tokens: DESIGN.md");
console.log(`Schema: ${rel(args.root, args.schemaPath)}`);
if (loaded.stateHash) {
  console.log(`State hash: ${loaded.stateHash}`);
}

reportAndExit("Design Room state validation", loaded.issues);
