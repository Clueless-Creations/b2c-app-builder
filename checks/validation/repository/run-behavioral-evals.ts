#!/usr/bin/env node
/**
 * run-behavioral-evals.ts — the execution layer that `npm run launchbench`
 * deliberately lacks.
 *
 * LaunchBench is a scenario DEFINITION lint plus deterministic validator
 * fixtures; scenario prompts are never executed against a live agent there.
 * This harness runs the opt-in flagship subset (`behavioral: true` in
 * evals/launchbench/*.yaml and evals/agent-behavior/*.yaml) against a live
 * Claude agent primed with SKILL.md, then grades must_catch / should_say /
 * must_use / forbidden assertions with a structured-output grader call and
 * writes a results artifact.
 *
 * It is intentionally NOT part of the PR-gating audit pipeline (cost and
 * model variance); it runs via the manually-triggered behavioral-evals
 * GitHub Actions workflow or locally. See checks/validation/repository/launchbench-evals.md
 * "Behavioral Eval Harness" for the honest split.
 *
 * Model ids come from the claude-api skill (checked 2026-07-25): default
 * agent and grader model is claude-opus-5; override with --model /
 * --grader-model. Never hardcode date-suffixed ids.
 *
 * Grader model: defaults to the same model as the agent (DEFAULT_MODEL). A
 * same-model grader shares the agent's blind spots and can favor its own
 * output. Pass --grader-model with a different Claude tier for the flagship
 * set at least once per quarter. Read a same-model pass rate as a weaker
 * signal than a cross-model one. Every artifact already records grader_model.
 *
 * Repeats: --repeat N (default 1) reruns each selected scenario N times and
 * grades every run on its own (pass^k). A single live-agent run understates
 * real variance. Use --repeat 3 on the flagship set before you trust a
 * pass-rate change.
 *
 * Credentials: ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, or --use-profile to
 * spend against an `ant auth login` profile. The gate is deliberately explicit
 * because check:agent-evals runs this script credential-free — without it the
 * SDK would resolve a local profile and bill a full run from the fixtures.
 *
 * npm script: evals:behavioral (root and runtime packages)
 * Usage:
 *   tsx checks/validation/repository/run-behavioral-evals.ts --list
 *   ANTHROPIC_API_KEY=... tsx checks/validation/repository/run-behavioral-evals.ts [--only id1,id2]
 *     [--model claude-opus-5] [--grader-model claude-opus-5] [--repeat 3] [--out results.json]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { asArray, asString, flagBoolean, flagNumber, flagString, isRecord, parseFlags } from "../../../tooling/lib/launch-state.js";

import { batchedMessages, type BatchApi } from "./message-batches.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "../../..");
const DEFAULT_MODEL = "claude-opus-5";

/**
 * Run-reproducibility fields for the results artifact. Harness/model choice alone can change
 * token use by a large multiple with little pass-rate difference, so a future comparison of two
 * runs needs the skill version, commit, and MCP write-mode alongside the model ids already
 * recorded — not the model ids alone.
 */
function readSkillVersion(): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(skillRoot, "skill-version.json"), "utf8"));
    const version = isRecord(parsed) ? asString(parsed["version"]) : undefined;
    return version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readGitCommitSha(): string {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: skillRoot, encoding: "utf8" });
    const sha = (result.stdout ?? "").trim();
    return result.status === 0 && /^[0-9a-f]{7,40}$/u.test(sha) ? sha : "unknown";
  } catch {
    return "unknown";
  }
}

type AssertionKind = "must_catch" | "should_say" | "must_use" | "forbidden";

interface BehavioralScenario {
  id: string;
  source: string;
  prompt: string;
  expectedGuardrail: string;
  assertions: Array<{ kind: AssertionKind; item: string }>;
}

interface GradedAssertion {
  kind: AssertionKind;
  item: string;
  pass: boolean;
  evidence: string;
}

/** Token spend and fallback status for one live API call. */
interface CallUsage {
  input_tokens: number;
  output_tokens: number;
  /** True when `usage.iterations` carries a fallback_message entry — the declared model refused and a fallback model served the turn. */
  fell_back: boolean;
}

interface ScenarioResult {
  id: string;
  source: string;
  /** 1-based run index within --repeat (always 1 when --repeat is unset). */
  run: number;
  pass: boolean;
  hard_failures: number;
  soft_misses: number;
  grades: GradedAssertion[];
  response: string;
  usage: { agent: CallUsage; grader: CallUsage };
}

/** Pass rate for one scenario across its --repeat runs. */
interface ScenarioSummary {
  id: string;
  source: string;
  runs: number;
  passed: number;
  pass_rate: number;
}

const args = parseArgs(process.argv.slice(2));
const scenarios = collectScenarios();

if (scenarios.length === 0) {
  console.error("No behavioral scenarios found. Mark eligible scenarios with `behavioral: true`.");
  process.exit(1);
}

if (args.list) {
  console.log(`Behavioral eval subset (${scenarios.length} scenario(s), opt-in via behavioral: true):`);
  for (const scenario of scenarios) {
    console.log(`- ${scenario.id} [${scenario.source}] (${scenario.assertions.length} assertions)`);
  }
  process.exit(0);
}

// This gate is also a spend guard: check:agent-evals runs this script with no
// credentials, so the no-credential path must never reach the network. The SDK
// would otherwise silently resolve an `ant auth login` profile and bill a full
// flagship run from the fixture suite. ANTHROPIC_AUTH_TOKEN counts as an
// explicit credential; a profile requires the explicit --use-profile opt-in.
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !args.useProfile) {
  console.error(
    "ANTHROPIC_API_KEY is required to run behavioral evals against a live agent (ANTHROPIC_AUTH_TOKEN also works, or pass --use-profile to spend against an `ant auth login` profile). Use --list to inspect the subset without credentials.",
  );
  process.exit(1);
}

const selected = args.only
  ? scenarios.filter((scenario) =>
      args.only
        ?.split(",")
        .map((id) => id.trim())
        .includes(scenario.id),
    )
  : scenarios;
if (selected.length === 0) {
  console.error(`--only matched no behavioral scenarios (have: ${scenarios.map((scenario) => scenario.id).join(", ")}).`);
  process.exit(1);
}

await run(selected);

async function run(toRun: BehavioralScenario[]): Promise<void> {
  // Lazy import so --list and the missing-key error stay dependency-light.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const batchJournal = `${args.out}.batches.jsonl`;
  mkdirSync(path.dirname(args.out), { recursive: true });
  const previousBatches: Array<{ requests: unknown; batch_id: string }> =
    args.resume && existsSync(batchJournal)
      ? readFileSync(batchJournal, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { event: { stage: string; requests: unknown; batch_id: string } })
          .filter(({ event }) => event.stage === "submitted")
          .map(({ event }) => event)
      : [];
  if (!args.resume && existsSync(batchJournal))
    throw new Error("A batch journal already exists. Use --resume with the same options or choose a new --out path.");
  const createMessage: CreateMessage = batchedMessages(
    client.beta.messages.batches as unknown as BatchApi,
    (event) => {
      appendFileSync(batchJournal, `${JSON.stringify({ at: new Date().toISOString(), event })}\n`);
    },
    undefined,
    (requests) => previousBatches.find((batch) => JSON.stringify(batch.requests) === JSON.stringify(requests))?.batch_id,
  );
  const skillText = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const systemPrompt = [
    "You are an autonomous launch agent with the B2C App Builder skill loaded.",
    "The skill entrypoint (SKILL.md) follows; honor its routing, gates, and operating posture.",
    "Respond to the founder situation as you would in a real session: name the references you would load,",
    "the validators you would run, the founder-only gates you would pause at, and the concrete next actions.",
    "",
    skillText,
  ].join("\n");

  // Sibling of the results file, wherever --out actually resolves — never a
  // path hardcoded under the repo root. Holds one file per attempt so a
  // crashed run still leaves every already-sent prompt on disk to inspect.
  const debugDir = path.join(path.dirname(args.out), "prompts-debug");

  const results: ScenarioResult[] = [];
  const invalid: InvalidRun[] = [];
  const totalUsage = { input_tokens: 0, output_tokens: 0 };

  const writeArtifact = (): void => {
    const failed = results.filter((result) => !result.pass);
    const artifact = {
      mode: "message_batches",
      batch_journal: batchJournal,
      generated_at: new Date().toISOString(),
      skill_version: readSkillVersion(),
      commit_sha: readGitCommitSha(),
      mcp_write_mode: process.env["B2C_APP_BUILDER_MCP_WRITE"] ?? "unset",
      agent_model: args.model,
      grader_model: args.graderModel,
      repeat: args.repeat,
      summary: {
        total: toRun.length * args.repeat,
        graded: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        invalid: invalid.length,
        total_usage: totalUsage,
      },
      by_scenario: summarizeByScenario(toRun, results),
      results,
      invalid,
    };
    mkdirSync(path.dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  };

  writeArtifact();
  await Promise.all(
    toRun.flatMap((scenario) =>
      Array.from({ length: args.repeat }, async (_, index) => {
        const attempt = index + 1;
        const label = args.repeat > 1 ? `${scenario.id} (run ${attempt}/${args.repeat})` : scenario.id;
        console.log(`Running ${label} ...`);

        // Debug logging must never stop a paid-for run.
        try {
          mkdirSync(debugDir, { recursive: true });
          writeFileSync(path.join(debugDir, `${scenario.id}-${attempt}.md`), `${systemPrompt}\n\n---\n\n${scenario.prompt}\n`, "utf8");
        } catch (error) {
          console.error(`  (prompt debug log failed for ${scenario.id}-${attempt}: ${error instanceof Error ? error.message : String(error)})`);
        }

        const agentMessage = await createMessage({
          model: args.model,
          // Adaptive thinking is on by default on current models and shares this
          // ceiling with the answer text, so 8192 truncated multi-assertion
          // scenarios. 16000 keeps a non-streaming request under SDK HTTP timeouts.
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          // A policy decline retries server-side by refusal category instead of
          // surfacing an unrecovered INVALID run for a benign-but-adjacent prompt.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: scenario.prompt }],
        });
        const responseText = textBlocks(agentMessage.content);
        const agentUsage = usageOf(agentMessage);
        addUsage(totalUsage, agentUsage);

        // A refusal or a truncated answer is a broken run, not a failing agent:
        // grading either one silently reports every assertion as a miss.
        const stopReason = asString(agentMessage.stop_reason);
        if (stopReason === "refusal" || stopReason === "max_tokens" || responseText.trim().length === 0) {
          const detail =
            stopReason === "refusal"
              ? "the safety classifiers declined the prompt"
              : stopReason === "max_tokens"
                ? "the answer hit max_tokens"
                : "the response carried no text";
          console.log(`  INVALID (${detail}) — not graded`);
          invalid.push({
            id: scenario.id,
            source: scenario.source,
            run: attempt,
            stop_reason: stopReason ?? "none",
            response: responseText,
            usage: { agent: agentUsage, grader: zeroUsage() },
          });
          writeArtifact();
          return;
        }

        const outcome = await grade(createMessage, scenario, responseText);
        addUsage(totalUsage, outcome.usage);
        if (!outcome.ok) {
          console.log(`  INVALID (${outcome.invalidReason}) — not graded`);
          invalid.push({
            id: scenario.id,
            source: scenario.source,
            run: attempt,
            stop_reason: outcome.invalidReason,
            response: responseText,
            usage: { agent: agentUsage, grader: outcome.usage },
          });
          writeArtifact();
          return;
        }
        const grades = outcome.grades;
        const hardFailures = grades.filter(
          (grade) => (grade.kind === "must_catch" || grade.kind === "must_use" || grade.kind === "forbidden") && !grade.pass,
        ).length;
        const softMisses = grades.filter((grade) => grade.kind === "should_say" && !grade.pass).length;
        const pass = hardFailures === 0;
        results.push({
          id: scenario.id,
          source: scenario.source,
          run: attempt,
          pass,
          hard_failures: hardFailures,
          soft_misses: softMisses,
          grades,
          response: responseText,
          usage: { agent: agentUsage, grader: outcome.usage },
        });
        writeArtifact();
        console.log(`  ${pass ? "PASS" : "FAIL"} (${hardFailures} hard failure(s), ${softMisses} soft miss(es))`);
      }),
    ),
  );

  writeArtifact();
  const failed = results.filter((result) => !result.pass);
  console.log(`\nBehavioral eval run: ${results.length - failed.length}/${results.length} graded run(s) passed. Results artifact: ${args.out}`);
  if (args.repeat > 1) {
    for (const scenarioSummary of summarizeByScenario(toRun, results)) {
      console.log(`- ${scenarioSummary.id}: ${scenarioSummary.passed}/${scenarioSummary.runs} passed (${(scenarioSummary.pass_rate * 100).toFixed(0)}%)`);
    }
  }
  if (failed.length > 0) {
    for (const result of failed) {
      console.log(`- FAIL ${result.id} (run ${result.run}): ${result.hard_failures} hard failure(s)`);
    }
    process.exitCode = 1;
  }
  if (invalid.length > 0) {
    // Ungraded scenarios mean the run did not measure what it claims to; fail
    // rather than reporting a clean pass over a shrunken subset.
    for (const invalidRun of invalid) {
      console.log(`- INVALID ${invalidRun.id} (run ${invalidRun.run}): stop_reason=${invalidRun.stop_reason} (not graded)`);
    }
    console.log(`${invalid.length} of ${toRun.length * args.repeat} run(s) produced no gradeable answer — this run is not a complete flagship pass.`);
    process.exitCode = 1;
  }
}

/** Pass rate per scenario across its --repeat runs, for spotting flakiness a single sample hides. */
function summarizeByScenario(toRun: BehavioralScenario[], results: ScenarioResult[]): ScenarioSummary[] {
  return toRun.map((scenario) => {
    const scenarioResults = results.filter((result) => result.id === scenario.id);
    const passed = scenarioResults.filter((result) => result.pass).length;
    return {
      id: scenario.id,
      source: scenario.source,
      runs: scenarioResults.length,
      passed,
      pass_rate: scenarioResults.length > 0 ? passed / scenarioResults.length : 0,
    };
  });
}

type CreateMessage = (params: Record<string, unknown>) => Promise<{ content: unknown; stop_reason?: unknown; usage?: unknown }>;

/** A run that produced no gradeable answer — a harness/model problem, not an agent miss. */
interface InvalidRun {
  id: string;
  source: string;
  /** 1-based run index within --repeat (always 1 when --repeat is unset). */
  run: number;
  stop_reason: string;
  response: string;
  usage: { agent: CallUsage; grader: CallUsage };
}

/** Concatenated text blocks from a Messages API response content array. */
function textBlocks(content: unknown): string {
  return asArray(content)
    .filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "text")
    .map((block) => asString(block.text) ?? "")
    .join("\n");
}

// A function, not a module-level const: this file calls `run()` from a
// top-level `await` before its own later statements execute, so a `const`
// declared below that call would still be in its temporal dead zone.
function zeroUsage(): CallUsage {
  return { input_tokens: 0, output_tokens: 0, fell_back: false };
}

/**
 * Token spend and fallback status off a Messages API response.
 * `usage.iterations` carries a `fallback_message` entry when the declared
 * model refused and the server-side fallback served the turn instead. See
 * the claude-api skill's Migrating to Claude Opus 5 -> New API features.
 */
function usageOf(message: { usage?: unknown }): CallUsage {
  const usage = isRecord(message.usage) ? message.usage : {};
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  const iterations = asArray(usage.iterations);
  const fellBack = iterations.some((entry) => isRecord(entry) && entry.type === "fallback_message");
  return { input_tokens: inputTokens, output_tokens: outputTokens, fell_back: fellBack };
}

function addUsage(total: { input_tokens: number; output_tokens: number }, usage: CallUsage): void {
  total.input_tokens += usage.input_tokens;
  total.output_tokens += usage.output_tokens;
}

/** Either a full set of verdicts, or the reason this scenario could not be graded. Usage is present either way — a refused or truncated grader call still spends tokens. */
type GradeOutcome = ({ ok: true; grades: GradedAssertion[] } | { ok: false; invalidReason: string }) & { usage: CallUsage };

async function grade(createMessage: CreateMessage, scenario: BehavioralScenario, responseText: string): Promise<GradeOutcome> {
  const gradeSchema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            pass: { type: "boolean" },
            evidence: { type: "string" },
          },
          required: ["index", "pass", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  };

  const checklist = scenario.assertions
    .map((assertion, index) =>
      assertion.kind === "forbidden"
        ? `${index}. [forbidden] PASS only if the response does NOT do/contain: ${assertion.item}`
        : `${index}. [${assertion.kind}] PASS only if the response substantively covers: ${assertion.item}`,
    )
    .join("\n");

  const graderMessage = await createMessage({
    model: args.graderModel,
    // Same ceiling reasoning as the agent call: adaptive thinking is on by
    // default on current models and shares max_tokens with the JSON payload,
    // which here is one {index, pass, evidence} object per assertion. Declared
    // explicitly rather than relying on the model default.
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    // A refused grader discards an already-paid-for agent response. Fall back
    // server-side by refusal category instead of losing the run.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: { type: "json_schema", schema: gradeSchema } },
    system:
      "You are a strict, literal eval grader. Judge only what the response text actually says; paraphrases count, vibes do not. Quote short evidence for every verdict.",
    messages: [
      {
        role: "user",
        content: [
          `Scenario guardrail (context only — grade the checklist, not this): ${scenario.expectedGuardrail}`,
          "",
          "Checklist:",
          checklist,
          "",
          "Agent response to grade:",
          "<response>",
          responseText,
          "</response>",
          "",
          "Return one verdict per checklist index.",
        ].join("\n"),
      },
    ],
  });

  // A refused or truncated grader must not take the whole run down with it:
  // results are only written to disk after the loop, so throwing here would
  // discard every scenario already graded (and paid for) in this run.
  const graderUsage = usageOf(graderMessage);
  const graderStop = asString(graderMessage.stop_reason);
  if (graderStop === "refusal" || graderStop === "max_tokens") {
    return { ok: false, invalidReason: `grader stopped with ${graderStop}`, usage: graderUsage };
  }
  const graderText = textBlocks(graderMessage.content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(graderText);
  } catch {
    return { ok: false, invalidReason: "grader returned non-JSON output", usage: graderUsage };
  }
  const verdicts = isRecord(parsed) ? asArray(parsed.results) : [];

  return {
    ok: true,
    usage: graderUsage,
    grades: scenario.assertions.map((assertion, index) => {
      const verdict = verdicts.find((item) => isRecord(item) && item.index === index);
      const pass = isRecord(verdict) && verdict.pass === true;
      const evidence = isRecord(verdict) ? (asString(verdict.evidence) ?? "") : "grader returned no verdict for this item";
      return { kind: assertion.kind, item: assertion.item, pass, evidence };
    }),
  };
}

function collectScenarios(): BehavioralScenario[] {
  const collected: BehavioralScenario[] = [];
  for (const source of ["checks/validation/repository/evals/launchbench", "checks/validation/repository/evals/agent-behavior"]) {
    const directory = path.join(skillRoot, source);
    if (!existsSync(directory)) {
      continue;
    }
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".yaml"))
      .sort()) {
      const parsed = parseYaml(readFileSync(path.join(directory, file), "utf8"));
      if (!isRecord(parsed) || parsed.behavioral !== true) {
        continue;
      }
      const id = asString(parsed.id) ?? path.basename(file, ".yaml");
      const prompt = asString(parsed.prompt);
      if (!prompt) {
        continue;
      }
      const assertions: Array<{ kind: AssertionKind; item: string }> = [];
      for (const kind of ["must_catch", "should_say", "must_use", "forbidden"] as const) {
        for (const item of asArray(parsed[kind])) {
          const text = asString(item);
          if (text) {
            assertions.push({ kind, item: text });
          }
        }
      }
      collected.push({
        id,
        source,
        prompt,
        expectedGuardrail: asString(parsed.expected_guardrail) ?? asString(parsed.expected_route) ?? "",
        assertions,
      });
    }
  }
  return collected;
}

interface Args {
  list: boolean;
  only?: string;
  model: string;
  graderModel: string;
  out: string;
  /** Reruns per scenario (pass^k). 1 unless --repeat asks for more. */
  repeat: number;
  /** Explicit opt-in to spend against an `ant auth login` profile with no key exported. */
  useProfile: boolean;
  resume: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--resume"], key: "resume", kind: "boolean" },
    { flags: ["--list"], key: "list", kind: "boolean" },
    { flags: ["--only"], key: "only", kind: "string" },
    { flags: ["--model"], key: "model", kind: "string" },
    { flags: ["--grader-model"], key: "graderModel", kind: "string" },
    { flags: ["--repeat"], key: "repeat", kind: "number" },
    { flags: ["--use-profile"], key: "useProfile", kind: "boolean" },
    { flags: ["--out"], key: "out" },
  ]);
  const requestedRepeat = flagNumber(flags, "repeat");
  return {
    list: flagBoolean(flags, "list"),
    resume: flagBoolean(flags, "resume"),
    only: flagString(flags, "only"),
    model: flagString(flags, "model") ?? DEFAULT_MODEL,
    graderModel: flagString(flags, "graderModel") ?? DEFAULT_MODEL,
    out:
      flagString(flags, "out") ??
      path.join(
        skillRoot,
        "checks",
        "validation",
        "repository",
        "evals",
        "behavioral-results",
        `behavioral-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      ),
    repeat: requestedRepeat !== undefined && Number.isFinite(requestedRepeat) && requestedRepeat >= 1 ? Math.floor(requestedRepeat) : 1,
    useProfile: flagBoolean(flags, "useProfile"),
  };
}
