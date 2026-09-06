#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issue, parseCliArgs, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { validateFoundations, type FoundationStage } from "./onboarding-foundations.js";
const argv = process.argv.slice(2);
const stage = argv[argv.indexOf("--stage") + 1];
const stages = ["research", "identity", "measurement", "prototype", "runtime"];
const root = parseCliArgs(argv).root;
const knowledgeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
reportAndExit(
  "Onboarding research, identity and measurement",
  stages.includes(stage ?? "")
    ? validateFoundations(root, stage as FoundationStage, knowledgeRoot)
    : [issue("error", "onboarding_foundations.stage", "Pass --stage research|identity|measurement|prototype|runtime")],
);
