import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { snapshotTaskInputs, verifyTaskInputs } from "../../../kernel/session/input-inventory.js";

export function register(harness: Harness): void {
  harness.check("executor inputs: audit directories expand to stable file-byte receipts", () => {
    const root = harness.makeTempDir("audit-inputs");
    mkdirSync(path.join(root, "design/reference-packs/nested"), { recursive: true });
    writeFileSync(path.join(root, "design/reference-packs/z.md"), "abc");
    writeFileSync(path.join(root, "design/reference-packs/nested/a.md"), "reference");
    const snapshot = snapshotTaskInputs(root, ["design/reference-packs/", "design/reference-packs/z.md"]);
    assert(
      snapshot.files.map((file) => file.path).join(",") === "design/reference-packs/nested/a.md,design/reference-packs/z.md",
      "inventory must be sorted and deduplicated",
    );
    assert(
      snapshot.files[1]?.sha256 === "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "receipt must hash bytes, not directory metadata",
    );
    assert(verifyTaskInputs(root, snapshot).length === 0, "unchanged inputs should pass");
    writeFileSync(path.join(root, "design/reference-packs/z.md"), "changed");
    assert(
      verifyTaskInputs(root, snapshot).some((error) => error.includes("changed")),
      "changed reference must invalidate dispatch evidence",
    );
  });

  harness.check("executor inputs: added directory content invalidates the original inventory", () => {
    const root = harness.makeTempDir("audit-input-added");
    mkdirSync(path.join(root, "rubrics"));
    writeFileSync(path.join(root, "rubrics/base.md"), "rubric");
    const snapshot = snapshotTaskInputs(root, ["rubrics/"]);
    writeFileSync(path.join(root, "rubrics/new.md"), "new criteria");
    assert(
      verifyTaskInputs(root, snapshot).some((error) => error.includes("inventory")),
      "new criteria cannot escape stale detection",
    );
  });

  harness.check("executor inputs: paths and nested symlinks fail before content is read", () => {
    const root = harness.makeTempDir("audit-input-links");
    const outside = harness.makeTempDir("audit-input-outside");
    writeFileSync(path.join(outside, "source.md"), "outside data");
    symlinkSync(outside, path.join(root, "linked"));
    for (const target of ["../audit-input-outside/source.md", "linked/source.md", outside]) {
      let failed = false;
      try {
        snapshotTaskInputs(root, [target]);
      } catch {
        failed = true;
      }
      assert(failed, `unsafe task path must fail: ${target}`);
    }
  });

  harness.check("executor inputs: empty or oversized inventories cannot silently omit required inputs", () => {
    const root = harness.makeTempDir("audit-input-bounds");
    mkdirSync(path.join(root, "empty"));
    writeFileSync(path.join(root, "large.md"), "123456");
    for (const [targets, limits] of [
      [["empty/"], {}],
      [["large.md"], { maxBytes: 5 }],
    ] as const) {
      let failed = false;
      try {
        snapshotTaskInputs(root, targets, limits);
      } catch {
        failed = true;
      }
      assert(failed, "a bound or empty required directory must fail visibly");
    }
  });

  harness.check("executor inputs: only explicitly produced files may change", () => {
    const root = harness.makeTempDir("audit-input-mutable");
    writeFileSync(path.join(root, "draft.md"), "before");
    writeFileSync(path.join(root, "rubric.md"), "fixed");
    const snapshot = snapshotTaskInputs(root, ["draft.md", "rubric.md"]);
    writeFileSync(path.join(root, "draft.md"), "after");
    assert(verifyTaskInputs(root, snapshot, ["draft.md"]).length === 0, "declared output may change");
    writeFileSync(path.join(root, "rubric.md"), "weaker");
    assert(verifyTaskInputs(root, snapshot, ["draft.md"]).length === 1, "producer cannot rewrite rubric to pass");
  });

  const workspace = harness.makeTempDir("executor-directory-integration");
  const bin = path.join(workspace, "bin");
  mkdirSync(bin);
  mkdirSync(path.join(workspace, "design/reference-packs"), { recursive: true });
  mkdirSync(path.join(workspace, "design/reviews/rubrics"), { recursive: true });
  writeFileSync(path.join(workspace, "design/reference-packs/app.md"), "Observed native reference");
  writeFileSync(path.join(workspace, "design/reviews/rubrics/visual.md"), "Frozen criteria");
  writeFileSync(path.join(workspace, "method.md"), "Compare current captures against frozen criteria.");
  const fakeCli = path.join(bin, "codex");
  writeFileSync(
    fakeCli,
    `#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
if (process.argv.includes('--version')) { console.log('fixture-runtime'); process.exit(0); }
const prompt = process.argv.at(-1);
const begin = 'BEGIN_KNOWLEDGE_RECEIPT';
const end = 'END_KNOWLEDGE_RECEIPT';
const receipt = JSON.parse(prompt.slice(prompt.lastIndexOf(begin) + begin.length, prompt.lastIndexOf(end)).trim());
for (const item of receipt.outputEvidence) {
  fs.writeFileSync(item.outputPath, 'Independent findings for the current candidate.');
  item.knowledgePaths = receipt.mandatoryKnowledge.map(entry => entry.path);
  item.summary = 'Inspected all frozen reference and rubric files and wrote findings.';
}
for (const item of [...receipt.contractFiles, ...receipt.taskArtifacts, ...receipt.mandatoryKnowledge]) {
  item.sha256 = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex');
}
if (fs.existsSync('mutate-reference')) fs.writeFileSync('design/reference-packs/new.md', 'Unreviewed new reference');
console.log(begin + '\\n' + JSON.stringify(receipt) + '\\n' + end);
`,
  );
  chmodSync(fakeCli, 0o755);
  const integration = path.join(workspace, "integration.ts");
  writeFileSync(
    integration,
    `
import { createCliExecutor } from ${JSON.stringify(path.join(skillRoot, "kernel/session/executor.ts"))};
import { writeFileSync } from 'node:fs';
process.env.PATH = ${JSON.stringify(bin)} + ':' + process.env.PATH;
const node = { id: 'audit', workflowId: 'workflow.design.audit', title: 'Review design', reads: ['design/reference-packs/', 'design/reviews/rubrics/'], references: [{path: 'method.md', title: 'Review method', loadWhen: 'before review'}], outputs: ['findings'], approvals: [], tokenBudget: 12000, ttlSeconds: 10, verification: { kind: 'deterministic', gateIds: [], failClosed: true } } as any;
const context = { runId: 'run', attemptId: 'attempt', workspaceDir: ${JSON.stringify(workspace)}, skillRootDir: ${JSON.stringify(workspace)}, artifactPaths: { findings: 'findings.md' }, now: '2026-09-04T16:00:00Z', heartbeat() {} };
(async () => {
  const executor = createCliExecutor('codex');
  const first = await executor.execute(node, context);
  if (first.status !== 'succeeded') throw new Error(JSON.stringify(first));
  writeFileSync(${JSON.stringify(path.join(workspace, "mutate-reference"))}, 'yes');
  const changed = await executor.execute(node, context);
  if (changed.status !== 'failed' || !changed.error?.includes('inventory changed')) throw new Error('Changed input was accepted: ' + JSON.stringify(changed));
  console.log('directory dispatch and stale refusal proved');
})();
`,
  );
  harness.runScript(
    "executor inputs: real CLI receipt path accepts directories and refuses changed inventory",
    integration,
    [],
    0,
    "directory dispatch and stale refusal proved",
  );
}
