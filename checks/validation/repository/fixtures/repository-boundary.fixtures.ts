import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { skillRoot, type Harness } from "./_harness.js";
import { spawnSync } from "node:child_process";

function seedRepo(harness: Harness, name: string): string {
  const root = path.join(harness.tempRoot, name);
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(root, "kernel"), { recursive: true });
  mkdirSync(path.join(root, "checks/validation/repository"), { recursive: true });
  writeFileSync(path.join(root, "kernel/session.ts"), "export const engine = 'local';\n");
  writeFileSync(path.join(root, "checks/validation/repository/source-registry.yaml"), "sources: []\n");
  return root;
}

const fixtureGitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
};
delete fixtureGitEnv.GIT_DIR;
delete fixtureGitEnv.GIT_WORK_TREE;

function gitAt(root: string, args: string[]): void {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: root, env: fixtureGitEnv, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`fixture git ${args.join(" ")} failed: ${result.stderr}`);
}

function commitGitRepo(root: string): void {
  gitAt(root, ["init", "-q", "-b", "main"]);
  gitAt(root, ["add", "-A"]);
  gitAt(root, ["commit", "-q", "--no-verify", "-m", "fixture"]);
}

/** Performance regressions must fail within a bounded interval rather than hang the suite. */
function runBounded(harness: Harness, label: string, _script: "check-repository-boundary", args: string[], expectedCode: number, expectedText?: string): void {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.join(skillRoot, "checks/validation/repository/check-repository-boundary.ts"), ...args], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 10000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
  harness.results.push({
    label,
    expectedCode,
    actualCode: result.status,
    expectedText,
    output,
    ok: result.status === expectedCode && (!expectedText || output.includes(expectedText)),
  });
}

export function register(harness: Harness): void {
  const happy = seedRepo(harness, "repository-boundary-happy");
  harness.runScriptArgs("repository boundary accepts the intended Engine structure", "check-repository-boundary", ["--repo-root", happy], 0);

  const built = seedRepo(harness, "repository-boundary-generated-output");
  mkdirSync(path.join(built, "hosted/knowledge-mcp/.wrangler/test-bundle"), { recursive: true });
  writeFileSync(path.join(built, "hosted/knowledge-mcp/.wrangler/test-bundle/worker.js"), "generated bundle is not authored source");
  harness.runScriptArgs(
    "repository boundary excludes generated worker bundles from authored-source analysis",
    "check-repository-boundary",
    ["--repo-root", built],
    0,
  );

  writeFileSync(path.join(built, "hosted/knowledge-mcp/worker-configuration.d.ts"), "generated runtime declaration placeholder");
  harness.runScriptArgs(
    "repository boundary excludes separately verified Wrangler runtime declarations",
    "check-repository-boundary",
    ["--repo-root", built],
    0,
  );

  const authoredDeclaration = seedRepo(harness, "repository-boundary-authored-declaration");
  writeFileSync(
    path.join(authoredDeclaration, "kernel/worker-configuration.d.ts"),
    "const cloudPublication = getCloudPublication(); commitPatch(cloudPublication);",
  );
  harness.runScriptArgs(
    "repository boundary still scans authored declarations with a generated-looking basename",
    "check-repository-boundary",
    ["--repo-root", authoredDeclaration],
    1,
  );

  for (const tainted of [false, true]) {
    const diamond = seedRepo(harness, `repository-boundary-import-diamond-${tainted}`);
    writeFileSync(
      path.join(diamond, "kernel/leaf.ts"),
      tainted
        ? "export interface CloudPublication { id:string }\nexport function readLeaf():CloudPublication {return {id:'remote'};}\n"
        : "export function readLeaf(){return {id:'local'};}\n",
    );
    for (let level = 0; level < 18; level++)
      for (const side of ["left", "right"]) {
        const imports =
          level === 17
            ? "import {readLeaf as left} from './leaf.js'; import {readLeaf as right} from './leaf.js';"
            : `import {read as left} from './left${level + 1}.js'; import {read as right} from './right${level + 1}.js';`;
        writeFileSync(path.join(diamond, `kernel/${side}${level}.ts`), `${imports}\nexport function read(){return Math.random()>0.5?left():right();}\n`);
      }
    writeFileSync(path.join(diamond, "kernel/session.ts"), "import {read} from './left0.js'; export function apply(){commitPatch(read());}\n");
    runBounded(
      harness,
      `repository boundary resolves a deep shared import diamond without losing ${tainted ? "cloud taint" : "local independence"}`,
      "check-repository-boundary",
      ["--repo-root", diamond],
      tainted ? 1 : 0,
      tainted ? "repository_boundary.cloud_publication_authority" : undefined,
    );
  }
  const cycle = seedRepo(harness, "repository-boundary-return-cycle");
  writeFileSync(path.join(cycle, "kernel/a.ts"), "import {readB} from './b.js'; export function readA(){return readB();}\n");
  writeFileSync(
    path.join(cycle, "kernel/b.ts"),
    "import {readA} from './a.js'; import {seed} from './seed.js'; export function readB(){return Math.random()?readA():seed();}\n",
  );
  writeFileSync(
    path.join(cycle, "kernel/seed.ts"),
    "export interface CloudPublication{id:string} export function seed():CloudPublication{return {id:'remote'}}\n",
  );
  writeFileSync(
    path.join(cycle, "kernel/session.ts"),
    "import {readA} from './a.js'; import {readB} from './b.js'; export function apply(){commitPatch(readA());commitPatch(readB());}\n",
  );
  runBounded(
    harness,
    "repository boundary propagates a cloud-return seed through an import cycle to a fixed point",
    "check-repository-boundary",
    ["--repo-root", cycle],
    1,
    "repository_boundary.cloud_publication_authority",
  );
  const authorityCycle = seedRepo(harness, "repository-boundary-authority-cycle");
  writeFileSync(
    path.join(authorityCycle, "kernel/a.ts"),
    "import {writeB} from './b.js'; export function writeA(local,remote){return writeB(remote,local);}\n",
  );
  writeFileSync(
    path.join(authorityCycle, "kernel/b.ts"),
    "import {writeA} from './a.js'; export function writeB(remote,local){if(Math.random())return writeA(local,remote);return commitPatch(remote);}\n",
  );
  writeFileSync(
    path.join(authorityCycle, "kernel/session.ts"),
    "import {writeA} from './a.js'; interface CloudPublication{id:string} declare const publication:CloudPublication; export function apply(){writeA({id:'local'},publication);}\n",
  );
  runBounded(
    harness,
    "repository boundary propagates authority argument positions around an import cycle",
    "check-repository-boundary",
    ["--repo-root", authorityCycle],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const tainted of [false, true]) {
    const namespaceCycle = seedRepo(harness, `repository-boundary-namespace-cycle-${tainted}`);
    writeFileSync(
      path.join(namespaceCycle, "kernel/a.ts"),
      "export interface CloudPublication{id:string} export class Source{load():CloudPublication{return {id:'remote'}}} export * as b from './b.js';\n",
    );
    writeFileSync(path.join(namespaceCycle, "kernel/b.ts"), "export * as a from './a.js';\n");
    writeFileSync(
      path.join(namespaceCycle, "kernel/session.ts"),
      `import * as api from './a.js'; export function apply(){commitPatch(${tainted ? "new api.Source().load()" : "{id:'local'}"});}\n`,
    );
    runBounded(
      harness,
      `repository boundary terminates namespace export cycles and preserves ${tainted ? "cloud method taint" : "independent writes"}`,
      "check-repository-boundary",
      ["--repo-root", namespaceCycle],
      tainted ? 1 : 0,
      tainted ? "repository_boundary.cloud_publication_authority" : undefined,
    );
  }

  const independent = seedRepo(harness, "repository-boundary-independent-authority");
  writeFileSync(
    path.join(independent, "kernel/session.ts"),
    "export interface CloudPublication { id: string }\nexport function approveLocal(localApproval) { return reducer.writeApproval(localApproval); }\n",
  );
  harness.runScriptArgs(
    "repository boundary permits inert Cloud publication types beside independent local writes",
    "check-repository-boundary",
    ["--repo-root", independent],
    0,
  );

  const site = seedRepo(harness, "repository-boundary-site");
  mkdirSync(path.join(site, "site/src"), { recursive: true });
  writeFileSync(path.join(site, "site/src/main.tsx"), "export {};\n");
  harness.runScriptArgs(
    "repository boundary rejects active Cloud UI source",
    "check-repository-boundary",
    ["--repo-root", site],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const nestedWeb = seedRepo(harness, "repository-boundary-nested-web");
  mkdirSync(path.join(nestedWeb, "apps/web/src"), { recursive: true });
  writeFileSync(path.join(nestedWeb, "apps/web/src/main.tsx"), "export {};\n");
  harness.runScriptArgs(
    "repository boundary rejects Cloud UI source under an unapproved top-level directory",
    "check-repository-boundary",
    ["--repo-root", nestedWeb],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const rootWebFile = seedRepo(harness, "repository-boundary-root-web-file");
  writeFileSync(path.join(rootWebFile, "index.html"), "<main>B2C App Builder</main>\n");
  harness.runScriptArgs(
    "repository boundary rejects unapproved top-level web files",
    "check-repository-boundary",
    ["--repo-root", rootWebFile],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const platformWeb = seedRepo(harness, "repository-boundary-platform-web");
  mkdirSync(path.join(platformWeb, "platform/data"), { recursive: true });
  mkdirSync(path.join(platformWeb, "platform/web/src"), { recursive: true });
  writeFileSync(path.join(platformWeb, "platform/data/b2c.json"), "{}\n");
  writeFileSync(path.join(platformWeb, "platform/web/src/main.tsx"), "export {};\n");
  harness.runScriptArgs(
    "repository boundary limits the platform exception to compatibility data",
    "check-repository-boundary",
    ["--repo-root", platformWeb],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const registry = seedRepo(harness, "repository-boundary-registry");
  writeFileSync(
    path.join(registry, "checks/validation/repository/source-registry.yaml"),
    "sources:\n  - id: cloud-product-source\n    source_type: product_source\n    locations:\n      - site/src/main.tsx\n",
  );
  harness.runScriptArgs(
    "repository boundary rejects a live Cloud product-source registry entry",
    "check-repository-boundary",
    ["--repo-root", registry],
    1,
    "repository_boundary.cloud_product_registry",
  );

  const authority = seedRepo(harness, "repository-boundary-publication-authority");
  writeFileSync(path.join(authority, "kernel/session.ts"), "export function approve(cloudPublication) { return reducer.writeApproval(cloudPublication); }\n");
  harness.runScriptArgs(
    "repository boundary rejects Cloud publication authority in Engine code",
    "check-repository-boundary",
    ["--repo-root", authority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const indirectAuthority = seedRepo(harness, "repository-boundary-indirect-publication-authority");
  writeFileSync(
    path.join(indirectAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, run) { run.approval = cloudPublication.content; return writeRunState('run.json', run); }\n",
  );
  harness.runScriptArgs(
    "repository boundary rejects Cloud publication data persisted through local run state",
    "check-repository-boundary",
    ["--repo-root", indirectAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const arrowAuthority = seedRepo(harness, "repository-boundary-arrow-publication-authority");
  writeFileSync(
    path.join(arrowAuthority, "kernel/session.ts"),
    "export const persist = (run) => { const publication = getCloudPublication(); run.guidance = publication.content; return saveSession(run); };\n",
  );
  harness.runScriptArgs(
    "repository boundary rejects Cloud publication data persisted from an arrow function",
    "check-repository-boundary",
    ["--repo-root", arrowAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const nestedAuthority = seedRepo(harness, "repository-boundary-nested-publication-authority");
  writeFileSync(
    path.join(nestedAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { return writeApproval(normalize(cloudPublication)); }\n",
  );
  harness.runScriptArgs(
    "repository boundary rejects Cloud publication data inside a nested authority argument",
    "check-repository-boundary",
    ["--repo-root", nestedAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const commitAuthority = seedRepo(harness, "repository-boundary-commit-publication-authority");
  writeFileSync(
    path.join(commitAuthority, "kernel/session.ts"),
    "export function apply(cloudPublication) { return reducer.commitPatch({ approval: cloudPublication }); }\n",
  );
  harness.runScriptArgs(
    "repository boundary rejects Cloud publication data passed to commitPatch",
    "check-repository-boundary",
    ["--repo-root", commitAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const genericAuthority = seedRepo(harness, "repository-boundary-generic-publication-authority");
  writeFileSync(
    path.join(genericAuthority, "kernel/session.ts"),
    "export function approve<T>(cloudPublication: T) { return writeApproval(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary parses generic TypeScript functions",
    "check-repository-boundary",
    ["--repo-root", genericAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const conciseArrowAuthority = seedRepo(harness, "repository-boundary-concise-arrow-authority");
  writeFileSync(
    path.join(conciseArrowAuthority, "kernel/session.ts"),
    "export const approve = cloudPublication => commitPatch(normalize(cloudPublication));\n",
  );
  harness.runScriptArgs(
    "repository boundary parses unparenthesized expression-bodied arrows",
    "check-repository-boundary",
    ["--repo-root", conciseArrowAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const inertText = seedRepo(harness, "repository-boundary-inert-text");
  writeFileSync(
    path.join(inertText, "kernel/session.ts"),
    "export function explain(cloudPublication) { const warning = 'Do not call writeApproval(cloudPublication)'; /* writeApproval(cloudPublication) */ return warning; }\n",
  );
  harness.runScriptArgs("repository boundary ignores authority examples in comments and strings", "check-repository-boundary", ["--repo-root", inertText], 0);

  const destructuredAuthority = seedRepo(harness, "repository-boundary-destructured-authority");
  writeFileSync(
    path.join(destructuredAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { const { approval } = cloudPublication; return writeApproval(approval); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud publication taint through destructuring",
    "check-repository-boundary",
    ["--repo-root", destructuredAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const moduleAuthority = seedRepo(harness, "repository-boundary-module-authority");
  writeFileSync(path.join(moduleAuthority, "kernel/session.ts"), "const cloudPublication = getCloudPublication();\ncommitPatch(cloudPublication);\n");
  harness.runScriptArgs(
    "repository boundary rejects module-level Cloud publication authority",
    "check-repository-boundary",
    ["--repo-root", moduleAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const callbackAuthority = seedRepo(harness, "repository-boundary-callback-authority");
  writeFileSync(
    path.join(callbackAuthority, "kernel/session.ts"),
    "export function queue(cloudPublication) { const guidance = cloudPublication; queueMicrotask(() => commitPatch(guidance)); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud publication taint into callbacks",
    "check-repository-boundary",
    ["--repo-root", callbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const moduleExtensions = seedRepo(harness, "repository-boundary-module-extensions");
  writeFileSync(path.join(moduleExtensions, "kernel/session.mts"), "export function approve(cloudPublication) { return commitPatch(cloudPublication); }\n");
  harness.runScriptArgs(
    "repository boundary scans TypeScript module extensions",
    "check-repository-boundary",
    ["--repo-root", moduleExtensions],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const typedAuthority = seedRepo(harness, "repository-boundary-typed-authority");
  writeFileSync(
    path.join(typedAuthority, "kernel/session.ts"),
    "type PublicationRecord = CloudPublication;\nexport async function approve(id) { const publication: PublicationRecord = await load(id); return commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary taints typed Cloud publication aliases",
    "check-repository-boundary",
    ["--repo-root", typedAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const constrainedGenericAuthority = seedRepo(harness, "repository-boundary-constrained-generic");
  writeFileSync(
    path.join(constrainedGenericAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nexport function apply<T extends CloudPublication>(value: T) { commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary taints parameters constrained to Cloud publication types",
    "check-repository-boundary",
    ["--repo-root", constrainedGenericAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const aliasedAuthority = seedRepo(harness, "repository-boundary-aliased-authority");
  writeFileSync(
    path.join(aliasedAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { const apply = reducer.commitPatch; return apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves local aliases of authority operations",
    "check-repository-boundary",
    ["--repo-root", aliasedAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedAuthority = seedRepo(harness, "repository-boundary-imported-authority");
  writeFileSync(
    path.join(importedAuthority, "kernel/session.ts"),
    "import { commitPatch as apply } from './reducer.js';\nexport function approve(cloudPublication) { return apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported aliases of authority operations",
    "check-repository-boundary",
    ["--repo-root", importedAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const shippedLayer = seedRepo(harness, "repository-boundary-shipped-layer");
  mkdirSync(path.join(shippedLayer, "entrypoints/cli"), { recursive: true });
  writeFileSync(path.join(shippedLayer, "entrypoints/cli/b2c.mjs"), "export function approve(cloudPublication) { return commitPatch(cloudPublication); }\n");
  harness.runScriptArgs(
    "repository boundary scans shipped executable Engine layers",
    "check-repository-boundary",
    ["--repo-root", shippedLayer],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const shadowedAuthority = seedRepo(harness, "repository-boundary-shadowed-authority");
  writeFileSync(
    path.join(shadowedAuthority, "kernel/session.ts"),
    "export function queue(cloudPublication) { const guidance = cloudPublication; return () => { const guidance = locallyApprove(); return commitPatch(guidance); }; }\n",
  );
  harness.runScriptArgs(
    "repository boundary respects lexical shadowing of inherited taint",
    "check-repository-boundary",
    ["--repo-root", shadowedAuthority],
    0,
  );

  const computedAuthority = seedRepo(harness, "repository-boundary-computed-authority");
  writeFileSync(
    path.join(computedAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { return reducer['commitPatch'](cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves computed authority member names",
    "check-repository-boundary",
    ["--repo-root", computedAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const destructuredAssignment = seedRepo(harness, "repository-boundary-destructured-assignment");
  writeFileSync(
    path.join(destructuredAssignment, "kernel/session.ts"),
    "export function approve(cloudPublication) { let approval; ({ approval } = cloudPublication); return writeApproval(approval); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates taint through destructuring assignments",
    "check-repository-boundary",
    ["--repo-root", destructuredAssignment],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedCloudType = seedRepo(harness, "repository-boundary-imported-cloud-type");
  writeFileSync(
    path.join(importedCloudType, "kernel/session.ts"),
    "import type { CloudPublication as PublicationRecord } from './cloud.js';\nexport async function approve(id) { const publication: PublicationRecord = await load(id); return commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates taint through imported type aliases",
    "check-repository-boundary",
    ["--repo-root", importedCloudType],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const nestedBlockCapture = seedRepo(harness, "repository-boundary-nested-block-capture");
  writeFileSync(
    path.join(nestedBlockCapture, "kernel/session.ts"),
    "export function queue(cloudPublication) { const guidance = cloudPublication; return () => { { const guidance = locallyApprove(); inspect(guidance); } return commitPatch(guidance); }; }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves captured taint outside a nested shadowing block",
    "check-repository-boundary",
    ["--repo-root", nestedBlockCapture],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const thisMemberAuthority = seedRepo(harness, "repository-boundary-this-member-authority");
  writeFileSync(
    path.join(thisMemberAuthority, "kernel/session.ts"),
    "export class Session { run = {}; approve(cloudPublication) { this.run.approval = cloudPublication; return commitPatch(this.run); } }\n",
  );
  harness.runScriptArgs(
    "repository boundary tracks Cloud taint through this member assignments",
    "check-repository-boundary",
    ["--repo-root", thisMemberAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const interfaceAuthority = seedRepo(harness, "repository-boundary-interface-authority");
  writeFileSync(
    path.join(interfaceAuthority, "kernel/session.ts"),
    "interface PublicationRecord extends CloudPublication {}\nexport async function approve(id) { const publication: PublicationRecord = await load(id); return commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary seeds Cloud taint from interface inheritance",
    "check-repository-boundary",
    ["--repo-root", interfaceAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const hiddenWeb = seedRepo(harness, "repository-boundary-hidden-web");
  mkdirSync(path.join(hiddenWeb, ".web"), { recursive: true });
  writeFileSync(path.join(hiddenWeb, ".web/index.html"), "<main>B2C App Builder</main>\n");
  harness.runScriptArgs(
    "repository boundary applies the top-level allowlist to hidden directories",
    "check-repository-boundary",
    ["--repo-root", hiddenWeb],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const gitIgnoredRootFile = seedRepo(harness, "repository-boundary-git-ignored-root-file");
  writeFileSync(path.join(gitIgnoredRootFile, ".gitignore"), ".b2c-guard-baseline\n");
  writeFileSync(path.join(gitIgnoredRootFile, ".b2c-guard-baseline"), "local operator state\n");
  commitGitRepo(gitIgnoredRootFile);
  harness.runScriptArgs("repository boundary ignores a gitignored top-level file", "check-repository-boundary", ["--repo-root", gitIgnoredRootFile], 0);

  const gitIgnoredRootDir = seedRepo(harness, "repository-boundary-git-ignored-root-dir");
  writeFileSync(path.join(gitIgnoredRootDir, ".gitignore"), "third_party/\n");
  mkdirSync(path.join(gitIgnoredRootDir, "third_party"), { recursive: true });
  writeFileSync(path.join(gitIgnoredRootDir, "third_party/NOTICE"), "ignored local notice\n");
  commitGitRepo(gitIgnoredRootDir);
  harness.runScriptArgs("repository boundary ignores a gitignored top-level directory", "check-repository-boundary", ["--repo-root", gitIgnoredRootDir], 0);

  const gitExcludeRootFile = seedRepo(harness, "repository-boundary-git-exclude-root-file");
  commitGitRepo(gitExcludeRootFile);
  writeFileSync(path.join(gitExcludeRootFile, ".git/info/exclude"), "scratch.txt\n");
  writeFileSync(path.join(gitExcludeRootFile, "scratch.txt"), "excluded locally\n");
  harness.runScriptArgs(
    "repository boundary ignores a top-level file listed in git exclude",
    "check-repository-boundary",
    ["--repo-root", gitExcludeRootFile],
    0,
  );

  const gitUntrackedRootFile = seedRepo(harness, "repository-boundary-git-untracked-root-file");
  commitGitRepo(gitUntrackedRootFile);
  writeFileSync(path.join(gitUntrackedRootFile, "index.html"), "<main>B2C App Builder</main>\n");
  harness.runScriptArgs(
    "repository boundary still rejects an untracked unignored top-level file",
    "check-repository-boundary",
    ["--repo-root", gitUntrackedRootFile],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const gitTrackedRootFile = seedRepo(harness, "repository-boundary-git-tracked-root-file");
  writeFileSync(path.join(gitTrackedRootFile, "index.html"), "<main>B2C App Builder</main>\n");
  commitGitRepo(gitTrackedRootFile);
  harness.runScriptArgs(
    "repository boundary still rejects a tracked unapproved top-level file",
    "check-repository-boundary",
    ["--repo-root", gitTrackedRootFile],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const inertPublicationWrites = seedRepo(harness, "repository-boundary-inert-publication-writes");
  writeFileSync(
    path.join(inertPublicationWrites, "kernel/session.ts"),
    "export function cache(cloudPublication) { writePublicationCache(cloudPublication); return savePublicationReceipt(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary permits non-authoritative publication cache and receipt writes",
    "check-repository-boundary",
    ["--repo-root", inertPublicationWrites],
    0,
  );

  const orderedAssignments = seedRepo(harness, "repository-boundary-ordered-assignments");
  writeFileSync(
    path.join(orderedAssignments, "kernel/session.ts"),
    "export function approve(cloudPublication, localValue) { let value = localValue; commitPatch(value); value = cloudPublication; return value; }\nexport function replace(cloudPublication, localValue) { let value = cloudPublication; value = localValue; return commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves statement order for taint assignment and clearing",
    "check-repository-boundary",
    ["--repo-root", orderedAssignments],
    0,
  );

  const conditionalTaint = seedRepo(harness, "repository-boundary-conditional-taint");
  writeFileSync(
    path.join(conditionalTaint, "kernel/session.ts"),
    "export function approve(cloudPublication, localValue, enabled) { let value = localValue; if (enabled) { value = cloudPublication; } return commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary merges taint from nested lexical scopes",
    "check-repository-boundary",
    ["--repo-root", conditionalTaint],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const callbackInvocation = seedRepo(harness, "repository-boundary-callback-invocation");
  writeFileSync(
    path.join(callbackInvocation, "kernel/session.ts"),
    "export function approve(cloudPublication, localValue) { let value = cloudPublication; const apply = () => commitPatch(value); apply(); value = localValue; }\n",
  );
  harness.runScriptArgs(
    "repository boundary analyzes callbacks with taint at their invocation point",
    "check-repository-boundary",
    ["--repo-root", callbackInvocation],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const reconcileAuthority = seedRepo(harness, "repository-boundary-reconcile-authority");
  writeFileSync(
    path.join(reconcileAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, plan, run, now) { return reconcilePatch(plan, run, cloudPublication.patch, now); }\n",
  );
  harness.runScriptArgs(
    "repository boundary classifies reconcilePatch as an authority operation",
    "check-repository-boundary",
    ["--repo-root", reconcileAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const memberAlias = seedRepo(harness, "repository-boundary-member-alias");
  writeFileSync(
    path.join(memberAlias, "kernel/session.ts"),
    "export function approve(cloudPublication, handlers) { handlers.apply = reducer.commitPatch; return handlers.apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves authority aliases stored on object members",
    "check-repository-boundary",
    ["--repo-root", memberAlias],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const beginAttemptAuthority = seedRepo(harness, "repository-boundary-begin-attempt");
  writeFileSync(
    path.join(beginAttemptAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, plan, run) { beginAttempt(plan, run, cloudPublication.nodeId); return writeRunState('run.json', run); }\n",
  );
  harness.runScriptArgs(
    "repository boundary classifies beginAttempt as an authority operation",
    "check-repository-boundary",
    ["--repo-root", beginAttemptAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const helperReturnAuthority = seedRepo(harness, "repository-boundary-helper-return");
  writeFileSync(
    path.join(helperReturnAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nfunction load(): CloudPublication { return { id: 'cloud' }; }\nexport function approve() { const publication = load(); return commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud publication helper return types",
    "check-repository-boundary",
    ["--repo-root", helperReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const passedCallbackAuthority = seedRepo(harness, "repository-boundary-passed-callback");
  writeFileSync(
    path.join(passedCallbackAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, localValue) { let value = cloudPublication; const apply = () => commitPatch(value); [0].forEach(apply); value = localValue; }\n",
  );
  harness.runScriptArgs(
    "repository boundary analyzes passed callbacks with taint at the call site",
    "check-repository-boundary",
    ["--repo-root", passedCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const callbackParameterAuthority = seedRepo(harness, "repository-boundary-callback-parameter");
  writeFileSync(
    path.join(callbackParameterAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { const apply = value => commitPatch(value); return apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates direct call arguments into callback parameters",
    "check-repository-boundary",
    ["--repo-root", callbackParameterAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const workflowApplicabilityAuthority = seedRepo(harness, "repository-boundary-workflow-applicability");
  writeFileSync(
    path.join(workflowApplicabilityAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, plan, run, now) { reconcileWorkflowApplicability(plan, run, cloudPublication.businessState, now); return writeRunState('run.json', run); }\n",
  );
  harness.runScriptArgs(
    "repository boundary classifies workflow applicability as an authority operation",
    "check-repository-boundary",
    ["--repo-root", workflowApplicabilityAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const classReturnAuthority = seedRepo(harness, "repository-boundary-class-return");
  writeFileSync(
    path.join(classReturnAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nclass Loader { static load(): CloudPublication { return { id: 'cloud' }; } }\nexport function approve() { const publication = Loader.load(); return commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud publication class method return types",
    "check-repository-boundary",
    ["--repo-root", classReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const getterReturnAuthority = seedRepo(harness, "repository-boundary-getter-return");
  writeFileSync(
    path.join(getterReturnAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nclass Loader { get guidance(): CloudPublication { return { id: 'cloud' }; } }\nexport function approve() { const loader = new Loader(); commitPatch(loader.guidance); }\n",
  );
  harness.runScriptArgs(
    "repository boundary recognizes Cloud-returning getter property reads",
    "check-repository-boundary",
    ["--repo-root", getterReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const deferredCallback = seedRepo(harness, "repository-boundary-deferred-callback");
  writeFileSync(
    path.join(deferredCallback, "kernel/session.ts"),
    "export function approve(cloudPublication, localValue) { let value = cloudPublication; const apply = () => commitPatch(value); setTimeout(apply, 0); value = localValue; }\n",
  );
  harness.runScriptArgs(
    "repository boundary evaluates deferred callbacks after local synchronous state changes",
    "check-repository-boundary",
    ["--repo-root", deferredCallback],
    0,
  );

  const collectionCallbackAuthority = seedRepo(harness, "repository-boundary-collection-callback");
  writeFileSync(
    path.join(collectionCallbackAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { [cloudPublication].forEach(value => commitPatch(value)); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates collection values into synchronous callback parameters",
    "check-repository-boundary",
    ["--repo-root", collectionCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const helperCallbackAuthority = seedRepo(harness, "repository-boundary-helper-callback");
  writeFileSync(
    path.join(helperCallbackAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nfunction load(): CloudPublication { return { id: 'cloud' }; }\nexport function approve() { const apply = value => commitPatch(value); return apply(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates typed helper results into callback parameters",
    "check-repository-boundary",
    ["--repo-root", helperCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const helperArgumentAuthority = seedRepo(harness, "repository-boundary-helper-argument");
  writeFileSync(
    path.join(helperArgumentAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nfunction load(): CloudPublication { return { id: 'cloud' }; }\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates typed helper results inside authority arguments",
    "check-repository-boundary",
    ["--repo-root", helperArgumentAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const instanceReturnAuthority = seedRepo(harness, "repository-boundary-instance-return");
  writeFileSync(
    path.join(instanceReturnAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nclass Loader { load(): CloudPublication { return { id: 'cloud' }; } }\nexport function approve() { const loader = new Loader(); const publication = loader.load(); return commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves Cloud publication return types through class instances",
    "check-repository-boundary",
    ["--repo-root", instanceReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const directConstructedReturnAuthority = seedRepo(harness, "repository-boundary-direct-constructed-return");
  writeFileSync(
    path.join(directConstructedReturnAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nclass Loader { load(): CloudPublication { return { id: 'cloud' }; } }\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves method return types on direct constructed receivers",
    "check-repository-boundary",
    ["--repo-root", directConstructedReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const inferredReturnAuthority = seedRepo(harness, "repository-boundary-inferred-return");
  writeFileSync(
    path.join(inferredReturnAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { function load() { return cloudPublication; } return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates inferred helper return sources",
    "check-repository-boundary",
    ["--repo-root", inferredReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const chainedInferredReturnAuthority = seedRepo(harness, "repository-boundary-chained-inferred-return");
  writeFileSync(
    path.join(chainedInferredReturnAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { function load() { return cloudPublication; } function forward() { return load(); } return commitPatch(forward()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary follows chained inferred helper return sources",
    "check-repository-boundary",
    ["--repo-root", chainedInferredReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedReturnAuthority = seedRepo(harness, "repository-boundary-imported-return");
  writeFileSync(
    path.join(importedReturnAuthority, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(importedReturnAuthority, "kernel/session.ts"),
    "import { load } from './cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates imported helper return contracts",
    "check-repository-boundary",
    ["--repo-root", importedReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const moduleKeyedReturnAuthority = seedRepo(harness, "repository-boundary-module-keyed-return");
  writeFileSync(
    path.join(moduleKeyedReturnAuthority, "kernel/a-cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(path.join(moduleKeyedReturnAuthority, "kernel/z-local.ts"), "export function load(): string { return 'local'; }\n");
  writeFileSync(
    path.join(moduleKeyedReturnAuthority, "kernel/session.ts"),
    "import { load } from './a-cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary keys imported callable contracts by source module",
    "check-repository-boundary",
    ["--repo-root", moduleKeyedReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importFormsAuthority = seedRepo(harness, "repository-boundary-import-forms");
  writeFileSync(
    path.join(importFormsAuthority, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport default function load(): CloudPublication { return { id: 'cloud' }; }\nexport function named(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(importFormsAuthority, "kernel/session.ts"),
    "import load, * as cloud from './cloud.js';\nexport function approve() { commitPatch(load()); return commitPatch(cloud.named()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates default and namespace import contracts",
    "check-repository-boundary",
    ["--repo-root", importFormsAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const exportSpecifierAuthority = seedRepo(harness, "repository-boundary-export-specifier");
  writeFileSync(
    path.join(exportSpecifierAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nfunction load(): CloudPublication { return { id: 'cloud' }; }\nexport { load };\n",
  );
  writeFileSync(
    path.join(exportSpecifierAuthority, "kernel/session.ts"),
    "import { load } from './cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary collects callable contracts exported through specifiers",
    "check-repository-boundary",
    ["--repo-root", exportSpecifierAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const internalExportDependencyAuthority = seedRepo(harness, "repository-boundary-internal-export-dependency");
  writeFileSync(
    path.join(internalExportDependencyAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nfunction internal(): CloudPublication { return { id: 'cloud' }; }\nexport function load() { return internal(); }\n",
  );
  writeFileSync(
    path.join(internalExportDependencyAuthority, "kernel/session.ts"),
    "import { load } from './cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves local dependencies of exported inferred returns",
    "check-repository-boundary",
    ["--repo-root", internalExportDependencyAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedExportDependencyAuthority = seedRepo(harness, "repository-boundary-imported-export-dependency");
  writeFileSync(
    path.join(importedExportDependencyAuthority, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function internal(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(importedExportDependencyAuthority, "kernel/provider.ts"),
    "import { internal } from './cloud.js';\nexport function load() { return internal(); }\n",
  );
  writeFileSync(
    path.join(importedExportDependencyAuthority, "kernel/session.ts"),
    "import { load } from './provider.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported dependencies inside exported wrappers",
    "check-repository-boundary",
    ["--repo-root", importedExportDependencyAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const reexportAuthority = seedRepo(harness, "repository-boundary-reexport");
  writeFileSync(
    path.join(reexportAuthority, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(path.join(reexportAuthority, "kernel/provider.ts"), "export { load as fetch } from './cloud.js';\n");
  writeFileSync(
    path.join(reexportAuthority, "kernel/session.ts"),
    "import { fetch } from './provider.js';\nexport function approve() { return commitPatch(fetch()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves re-exported callable contracts",
    "check-repository-boundary",
    ["--repo-root", reexportAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceExportAllAuthority = seedRepo(harness, "repository-boundary-namespace-export-all");
  writeFileSync(
    path.join(namespaceExportAllAuthority, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(path.join(namespaceExportAllAuthority, "kernel/provider.ts"), "export * from './cloud.js';\n");
  writeFileSync(
    path.join(namespaceExportAllAuthority, "kernel/session.ts"),
    "import * as provider from './provider.js';\nexport function approve() { return commitPatch(provider.load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary enumerates export-star members for namespace imports",
    "check-repository-boundary",
    ["--repo-root", namespaceExportAllAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceReexportAuthority = seedRepo(harness, "repository-boundary-namespace-reexport");
  writeFileSync(
    path.join(namespaceReexportAuthority, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(path.join(namespaceReexportAuthority, "kernel/provider.ts"), "export * as cloud from './cloud.js';\n");
  writeFileSync(
    path.join(namespaceReexportAuthority, "kernel/session.ts"),
    "import { cloud } from './provider.js';\nexport function approve() { return commitPatch(cloud.load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves members of namespace re-exports",
    "check-repository-boundary",
    ["--repo-root", namespaceReexportAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const renamedCloudTypeAuthority = seedRepo(harness, "repository-boundary-renamed-cloud-type");
  writeFileSync(path.join(renamedCloudTypeAuthority, "kernel/types.ts"), "export interface CloudPublication { id: string }\n");
  writeFileSync(
    path.join(renamedCloudTypeAuthority, "kernel/cloud.ts"),
    "import type { CloudPublication as Publication } from './types.js';\nexport function load(): Publication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(renamedCloudTypeAuthority, "kernel/session.ts"),
    "import { load } from './cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary tracks renamed imported Cloud types in module contracts",
    "check-repository-boundary",
    ["--repo-root", renamedCloudTypeAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const upstreamCloudTypeAliasAuthority = seedRepo(harness, "repository-boundary-upstream-cloud-type-alias");
  writeFileSync(
    path.join(upstreamCloudTypeAliasAuthority, "kernel/types.ts"),
    "interface CloudPublication { id: string }\nexport type Publication = CloudPublication;\n",
  );
  writeFileSync(
    path.join(upstreamCloudTypeAliasAuthority, "kernel/cloud.ts"),
    "import type { Publication } from './types.js';\nexport function load(): Publication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(upstreamCloudTypeAliasAuthority, "kernel/session.ts"),
    "import { load } from './cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported Cloud aliases through their source module",
    "check-repository-boundary",
    ["--repo-root", upstreamCloudTypeAliasAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedClassMethodAuthority = seedRepo(harness, "repository-boundary-imported-class-method");
  writeFileSync(
    path.join(importedClassMethodAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nexport default class Loader { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(importedClassMethodAuthority, "kernel/session.ts"),
    "import Loader from './cloud.js';\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates method contracts from imported classes",
    "check-repository-boundary",
    ["--repo-root", importedClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceClassMethodAuthority = seedRepo(harness, "repository-boundary-namespace-class-method");
  writeFileSync(
    path.join(namespaceClassMethodAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nexport class Loader { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(namespaceClassMethodAuthority, "kernel/session.ts"),
    "import * as cloud from './cloud.js';\nexport function approve() { return commitPatch(new cloud.Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates class methods into namespace imports",
    "check-repository-boundary",
    ["--repo-root", namespaceClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedAliasClassMethodAuthority = seedRepo(harness, "repository-boundary-imported-alias-class-method");
  writeFileSync(
    path.join(importedAliasClassMethodAuthority, "kernel/types.ts"),
    "interface CloudPublication { id: string }\nexport type Publication = CloudPublication;\n",
  );
  writeFileSync(
    path.join(importedAliasClassMethodAuthority, "kernel/cloud.ts"),
    "import type { Publication } from './types.js';\nexport class Loader { load(): Publication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(importedAliasClassMethodAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported aliases before exporting class methods",
    "check-repository-boundary",
    ["--repo-root", importedAliasClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const exportAllClassMethodAuthority = seedRepo(harness, "repository-boundary-export-all-class-method");
  writeFileSync(
    path.join(exportAllClassMethodAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nexport class Loader { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(path.join(exportAllClassMethodAuthority, "kernel/provider.ts"), "export * from './cloud.js';\n");
  writeFileSync(
    path.join(exportAllClassMethodAuthority, "kernel/session.ts"),
    "import * as provider from './provider.js';\nexport function approve() { return commitPatch(new provider.Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary follows export-star barrels when propagating class methods",
    "check-repository-boundary",
    ["--repo-root", exportAllClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceTypeClassMethodAuthority = seedRepo(harness, "repository-boundary-namespace-type-class-method");
  writeFileSync(
    path.join(namespaceTypeClassMethodAuthority, "kernel/types.ts"),
    "interface CloudPublication { id: string }\nexport type Publication = CloudPublication;\n",
  );
  writeFileSync(
    path.join(namespaceTypeClassMethodAuthority, "kernel/cloud.ts"),
    "import type * as Types from './types.js';\nexport class Loader { load(): Types.Publication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(namespaceTypeClassMethodAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves namespace-imported types for exported methods",
    "check-repository-boundary",
    ["--repo-root", namespaceTypeClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceReexportClassMethodAuthority = seedRepo(harness, "repository-boundary-namespace-reexport-class-method");
  writeFileSync(
    path.join(namespaceReexportClassMethodAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nexport class Loader { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(path.join(namespaceReexportClassMethodAuthority, "kernel/provider.ts"), "export * as cloud from './cloud.js';\n");
  writeFileSync(
    path.join(namespaceReexportClassMethodAuthority, "kernel/session.ts"),
    "import { cloud } from './provider.js';\nexport function approve() { return commitPatch(new cloud.Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates class methods through namespace re-exports",
    "check-repository-boundary",
    ["--repo-root", namespaceReexportClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const variableClassAuthority = seedRepo(harness, "repository-boundary-variable-class");
  writeFileSync(
    path.join(variableClassAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nexport const Loader = class { load(): CloudPublication { return { id: 'cloud' }; } };\n",
  );
  writeFileSync(
    path.join(variableClassAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary records classes exported through variable declarations",
    "check-repository-boundary",
    ["--repo-root", variableClassAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const localVariableClassAuthority = seedRepo(harness, "repository-boundary-local-variable-class");
  writeFileSync(
    path.join(localVariableClassAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ntype Publication = CloudPublication;\nconst Loader = class { load(): Publication { return { id: 'cloud' }; } };\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary registers variable class methods in local analysis",
    "check-repository-boundary",
    ["--repo-root", localVariableClassAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceReexportTypeAuthority = seedRepo(harness, "repository-boundary-namespace-reexport-type");
  writeFileSync(
    path.join(namespaceReexportTypeAuthority, "kernel/types.ts"),
    "interface CloudPublication { id: string }\nexport type Publication = CloudPublication;\n",
  );
  writeFileSync(path.join(namespaceReexportTypeAuthority, "kernel/provider.ts"), "export * as Cloud from './types.js';\n");
  writeFileSync(
    path.join(namespaceReexportTypeAuthority, "kernel/cloud.ts"),
    "import type * as Types from './provider.js';\nexport class Loader { load(): Types.Cloud.Publication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(namespaceReexportTypeAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary expands namespace-re-exported type members",
    "check-repository-boundary",
    ["--repo-root", namespaceReexportTypeAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedMethodReturnSourceAuthority = seedRepo(harness, "repository-boundary-imported-method-return-source");
  writeFileSync(
    path.join(importedMethodReturnSourceAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(importedMethodReturnSourceAuthority, "kernel/cloud.ts"),
    "import { load } from './provider.js';\nexport class Loader { get() { return load(); } }\n",
  );
  writeFileSync(
    path.join(importedMethodReturnSourceAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported return sources for class methods",
    "check-repository-boundary",
    ["--repo-root", importedMethodReturnSourceAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedClassMethodReturnAuthority = seedRepo(harness, "repository-boundary-imported-class-method-return");
  writeFileSync(
    path.join(importedClassMethodReturnAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class Source { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(importedClassMethodReturnAuthority, "kernel/cloud.ts"),
    "import { Source } from './provider.js';\nexport class Loader { get() { return new Source().load(); } }\n",
  );
  writeFileSync(
    path.join(importedClassMethodReturnAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates imported class methods into method return closures",
    "check-repository-boundary",
    ["--repo-root", importedClassMethodReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const methodLocalInstanceAuthority = seedRepo(harness, "repository-boundary-method-local-instance");
  writeFileSync(
    path.join(methodLocalInstanceAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class Source { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(methodLocalInstanceAuthority, "kernel/cloud.ts"),
    "import { Source } from './provider.js';\nexport class Loader { get() { const source = new Source(); return source.load(); } }\n",
  );
  writeFileSync(
    path.join(methodLocalInstanceAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary tracks method-local instances in exported return contracts",
    "check-repository-boundary",
    ["--repo-root", methodLocalInstanceAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const methodScopedInstanceAuthority = seedRepo(harness, "repository-boundary-method-scoped-instance");
  writeFileSync(
    path.join(methodScopedInstanceAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class CloudSource { load(): CloudPublication { return { id: 'cloud' }; } }\nexport class LocalSource { load() { return { id: 'local' }; } }\n",
  );
  writeFileSync(
    path.join(methodScopedInstanceAuthority, "kernel/cloud.ts"),
    "import { CloudSource, LocalSource } from './provider.js';\nexport class Loader { get() { const source = new CloudSource(); return source.load(); } other() { const source = new LocalSource(); return source.load(); } }\n",
  );
  writeFileSync(
    path.join(methodScopedInstanceAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary scopes constructor bindings to each exported method",
    "check-repository-boundary",
    ["--repo-root", methodScopedInstanceAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const classFieldInstanceAuthority = seedRepo(harness, "repository-boundary-class-field-instance");
  writeFileSync(
    path.join(classFieldInstanceAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class CloudSource { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(classFieldInstanceAuthority, "kernel/cloud.ts"),
    "import { CloudSource } from './provider.js';\nexport class Loader { source = new CloudSource(); get() { return this.source.load(); } }\n",
  );
  writeFileSync(
    path.join(classFieldInstanceAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves class-field instances in exported method contracts",
    "check-repository-boundary",
    ["--repo-root", classFieldInstanceAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const standingApprovalAuthority = seedRepo(harness, "repository-boundary-standing-approval-authority");
  writeFileSync(
    path.join(standingApprovalAuthority, "kernel/session.ts"),
    "interface CloudPublication { plan: unknown }\ndeclare const cloudPublication: CloudPublication;\ndeclare const run: unknown;\nexport function approve() { applyStandingApprovals(cloudPublication.plan, run, 'ledger.json', new Date()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary classifies standing-approval application as authority",
    "check-repository-boundary",
    ["--repo-root", standingApprovalAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const exportedObjectMethodAuthority = seedRepo(harness, "repository-boundary-exported-object-method");
  writeFileSync(
    path.join(exportedObjectMethodAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport const cloud = { load(): CloudPublication { return { id: 'cloud' }; } };\n",
  );
  writeFileSync(
    path.join(exportedObjectMethodAuthority, "kernel/session.ts"),
    "import { cloud } from './provider.js';\nexport function approve() { return commitPatch(cloud.load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates methods on exported object literals",
    "check-repository-boundary",
    ["--repo-root", exportedObjectMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const expressionArrowReturnAuthority = seedRepo(harness, "repository-boundary-expression-arrow-return");
  writeFileSync(
    path.join(expressionArrowReturnAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport function getCloudPublication(): CloudPublication { return { id: 'cloud' }; }\nexport const load = () => getCloudPublication();\n",
  );
  writeFileSync(
    path.join(expressionArrowReturnAuthority, "kernel/session.ts"),
    "import { load } from './provider.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary traces expression-bodied arrow returns",
    "check-repository-boundary",
    ["--repo-root", expressionArrowReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const cloudCollectionCallbackAuthority = seedRepo(harness, "repository-boundary-cloud-collection-callback");
  writeFileSync(
    path.join(cloudCollectionCallbackAuthority, "kernel/session.ts"),
    "interface CloudPublication { items: unknown[] }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { cloudPublication.items.forEach(commitPatch); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates taint through callbacks on Cloud collections",
    "check-repository-boundary",
    ["--repo-root", cloudCollectionCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const arrayFromCallbackAuthority = seedRepo(harness, "repository-boundary-array-from-callback");
  writeFileSync(
    path.join(arrayFromCallbackAuthority, "kernel/session.ts"),
    "interface CloudPublication { items: Iterable<unknown> }\nexport function approve(cloudPublication: CloudPublication) { return Array.from(cloudPublication.items, (item) => commitPatch(item)); }\n",
  );
  harness.runScriptArgs(
    "repository boundary taints callbacks passed to Array.from",
    "check-repository-boundary",
    ["--repo-root", arrayFromCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const cloudReduceCallbackAuthority = seedRepo(harness, "repository-boundary-cloud-reduce-callback");
  writeFileSync(
    path.join(cloudReduceCallbackAuthority, "kernel/session.ts"),
    "interface CloudPublication { items: unknown[] }\nexport function approve(cloudPublication: CloudPublication) { return cloudPublication.items.reduce((acc, item) => { commitPatch(item); return acc; }, {}); }\n",
  );
  harness.runScriptArgs(
    "repository boundary taints the current Cloud value in reduce callbacks",
    "check-repository-boundary",
    ["--repo-root", cloudReduceCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const forAwaitDestructuredAuthority = seedRepo(harness, "repository-boundary-for-await-destructured");
  writeFileSync(
    path.join(forAwaitDestructuredAuthority, "kernel/session.ts"),
    "interface CloudPublication { items: AsyncIterable<{ value: unknown }> }\nexport async function approve(cloudPublication: CloudPublication) { for await (const { value } of cloudPublication.items) commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud collection taint into for-await bindings",
    "check-repository-boundary",
    ["--repo-root", forAwaitDestructuredAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const reexportedAuthorityAlias = seedRepo(harness, "repository-boundary-reexported-authority-alias");
  writeFileSync(path.join(reexportedAuthorityAlias, "kernel/reducer.ts"), "export function commitPatch(value: unknown) { return value; }\n");
  writeFileSync(path.join(reexportedAuthorityAlias, "kernel/barrel.ts"), "export { commitPatch as apply } from './reducer.js';\n");
  writeFileSync(
    path.join(reexportedAuthorityAlias, "kernel/session.ts"),
    "import { apply } from './barrel.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves re-exported aliases of authority operations",
    "check-repository-boundary",
    ["--repo-root", reexportedAuthorityAlias],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const exportedAuthorityWrapper = seedRepo(harness, "repository-boundary-exported-authority-wrapper");
  writeFileSync(path.join(exportedAuthorityWrapper, "kernel/wrapper.ts"), "export function apply(value: unknown) { return commitPatch(value); }\n");
  writeFileSync(
    path.join(exportedAuthorityWrapper, "kernel/session.ts"),
    "import { apply } from './wrapper.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates authority through exported function wrappers",
    "check-repository-boundary",
    ["--repo-root", exportedAuthorityWrapper],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const anonymousDefaultAuthorityWrapper = seedRepo(harness, "repository-boundary-anonymous-default-authority-wrapper");
  writeFileSync(path.join(anonymousDefaultAuthorityWrapper, "kernel/wrapper.ts"), "export default (value: unknown) => commitPatch(value);\n");
  writeFileSync(
    path.join(anonymousDefaultAuthorityWrapper, "kernel/session.ts"),
    "import apply from './wrapper.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary records authority calls in anonymous default exports",
    "check-repository-boundary",
    ["--repo-root", anonymousDefaultAuthorityWrapper],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const exportedClassMethodAuthority = seedRepo(harness, "repository-boundary-exported-class-method-authority");
  writeFileSync(path.join(exportedClassMethodAuthority, "kernel/writer.ts"), "export class Writer { apply(value: unknown) { return commitPatch(value); } }\n");
  writeFileSync(
    path.join(exportedClassMethodAuthority, "kernel/session.ts"),
    "import { Writer } from './writer.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { new Writer().apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates authority contracts for exported class methods",
    "check-repository-boundary",
    ["--repo-root", exportedClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const localClassMethodAuthority = seedRepo(harness, "repository-boundary-local-class-method-authority");
  writeFileSync(
    path.join(localClassMethodAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\nclass Writer { apply(value: unknown) { return commitPatch(value); } }\nexport function approve(cloudPublication: CloudPublication) { const writer = new Writer(); writer.apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary registers authority contracts for local class methods",
    "check-repository-boundary",
    ["--repo-root", localClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const instanceBoundAuthorityMethod = seedRepo(harness, "repository-boundary-instance-bound-authority-method");
  writeFileSync(path.join(instanceBoundAuthorityMethod, "kernel/writer.ts"), "export class Writer { apply(value: unknown) { return commitPatch(value); } }\n");
  writeFileSync(
    path.join(instanceBoundAuthorityMethod, "kernel/session.ts"),
    "import { Writer } from './writer.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { const writer = new Writer(); writer.apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves authority methods through instance bindings",
    "check-repository-boundary",
    ["--repo-root", instanceBoundAuthorityMethod],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const instanceMethodCallbackAuthority = seedRepo(harness, "repository-boundary-instance-method-callback-authority");
  writeFileSync(
    path.join(instanceMethodCallbackAuthority, "kernel/writer.ts"),
    "export class Writer { apply(value: unknown) { return commitPatch(value); } }\n",
  );
  writeFileSync(
    path.join(instanceMethodCallbackAuthority, "kernel/session.ts"),
    "import { Writer } from './writer.js';\ninterface CloudPublication { items: unknown[] }\nexport function approve(cloudPublication: CloudPublication) { const writer = new Writer(); cloudPublication.items.forEach(writer.apply); }\n",
  );
  harness.runScriptArgs(
    "repository boundary normalizes instance authority methods passed as callbacks",
    "check-repository-boundary",
    ["--repo-root", instanceMethodCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceAuthorityWrapper = seedRepo(harness, "repository-boundary-namespace-authority-wrapper");
  writeFileSync(path.join(namespaceAuthorityWrapper, "kernel/reducer.ts"), "export function commitPatch(value: unknown) { return value; }\n");
  writeFileSync(path.join(namespaceAuthorityWrapper, "kernel/barrel.ts"), "export { commitPatch as apply } from './reducer.js';\n");
  writeFileSync(
    path.join(namespaceAuthorityWrapper, "kernel/wrapper.ts"),
    "import * as writer from './barrel.js';\nexport function execute(value: unknown) { return writer.apply(value); }\n",
  );
  writeFileSync(
    path.join(namespaceAuthorityWrapper, "kernel/session.ts"),
    "import { execute } from './wrapper.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { execute(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves namespace imports inside authority wrappers",
    "check-repository-boundary",
    ["--repo-root", namespaceAuthorityWrapper],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const inheritedClassMethodAuthority = seedRepo(harness, "repository-boundary-inherited-class-method");
  writeFileSync(
    path.join(inheritedClassMethodAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class Base { load(): CloudPublication { return { id: 'cloud' }; } }\nexport class Loader extends Base {}\n",
  );
  writeFileSync(
    path.join(inheritedClassMethodAuthority, "kernel/session.ts"),
    "import { Loader } from './provider.js';\nexport function approve() { commitPatch(new Loader().load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary includes inherited methods in exported class contracts",
    "check-repository-boundary",
    ["--repo-root", inheritedClassMethodAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const constructorFieldAuthority = seedRepo(harness, "repository-boundary-constructor-field-instance");
  writeFileSync(
    path.join(constructorFieldAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class CloudSource { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(
    path.join(constructorFieldAuthority, "kernel/cloud.ts"),
    "import { CloudSource } from './provider.js';\nexport class Loader { source: CloudSource; constructor() { this.source = new CloudSource(); } get() { return this.source.load(); } }\n",
  );
  writeFileSync(
    path.join(constructorFieldAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary tracks fields initialized inside constructors",
    "check-repository-boundary",
    ["--repo-root", constructorFieldAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const exportedTypedValueAuthority = seedRepo(harness, "repository-boundary-exported-typed-value");
  writeFileSync(
    path.join(exportedTypedValueAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\ndeclare function loadRaw(): CloudPublication;\nexport const publication: CloudPublication = loadRaw();\n",
  );
  writeFileSync(
    path.join(exportedTypedValueAuthority, "kernel/session.ts"),
    "import { publication as value } from './provider.js';\nexport function approve() { commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates typed exported values into import taint",
    "check-repository-boundary",
    ["--repo-root", exportedTypedValueAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const importedSourceExportedValue = seedRepo(harness, "repository-boundary-imported-source-exported-value");
  writeFileSync(
    path.join(importedSourceExportedValue, "kernel/cloud.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(path.join(importedSourceExportedValue, "kernel/provider.ts"), "import { load } from './cloud.js';\nexport const publication = load();\n");
  writeFileSync(
    path.join(importedSourceExportedValue, "kernel/session.ts"),
    "import { publication } from './provider.js';\nexport function approve() { commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported sources for exported values",
    "check-repository-boundary",
    ["--repo-root", importedSourceExportedValue],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const inferredExportedValueAuthority = seedRepo(harness, "repository-boundary-inferred-exported-value");
  writeFileSync(
    path.join(inferredExportedValueAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nfunction load(): CloudPublication { return { id: 'cloud' }; }\nexport const publication = load();\n",
  );
  writeFileSync(
    path.join(inferredExportedValueAuthority, "kernel/session.ts"),
    "import { publication } from './provider.js';\nexport function approve() { commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary traces inferred sources for exported values",
    "check-repository-boundary",
    ["--repo-root", inferredExportedValueAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceExportedValueAuthority = seedRepo(harness, "repository-boundary-namespace-exported-value");
  writeFileSync(
    path.join(namespaceExportedValueAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\ndeclare function load(): CloudPublication;\nexport const publication: CloudPublication = load();\n",
  );
  writeFileSync(
    path.join(namespaceExportedValueAuthority, "kernel/session.ts"),
    "import * as api from './provider.js';\nexport function approve() { commitPatch(api.publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary recognizes qualified namespace values in expressions",
    "check-repository-boundary",
    ["--repo-root", namespaceExportedValueAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const qualifiedAssignmentAuthority = seedRepo(harness, "repository-boundary-qualified-assignment-call");
  writeFileSync(
    path.join(qualifiedAssignmentAuthority, "kernel/provider.ts"),
    "export interface CloudPublication { id: string }\nexport function load(): CloudPublication { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(qualifiedAssignmentAuthority, "kernel/session.ts"),
    "import * as cloud from './provider.js';\nexport function approve() { let publication: unknown; publication = cloud.load(); commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary records qualified calls on assignment right-hand sides",
    "check-repository-boundary",
    ["--repo-root", qualifiedAssignmentAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const awaitedQualifiedInitializerAuthority = seedRepo(harness, "repository-boundary-awaited-qualified-initializer");
  writeFileSync(
    path.join(awaitedQualifiedInitializerAuthority, "kernel/provider.ts"),
    "export interface CloudPublication { id: string }\nexport async function load(): Promise<CloudPublication> { return { id: 'cloud' }; }\n",
  );
  writeFileSync(
    path.join(awaitedQualifiedInitializerAuthority, "kernel/session.ts"),
    "import * as cloud from './provider.js';\nexport async function approve() { const publication = await cloud.load(); commitPatch(publication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary records qualified calls beneath awaited initializers",
    "check-repository-boundary",
    ["--repo-root", awaitedQualifiedInitializerAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const transitiveLocalTypeAlias = seedRepo(harness, "repository-boundary-transitive-local-type-alias");
  writeFileSync(
    path.join(transitiveLocalTypeAlias, "kernel/types.ts"),
    "interface CloudPublication { id: string }\ntype Base = CloudPublication;\nexport type Publication = Base;\n",
  );
  writeFileSync(
    path.join(transitiveLocalTypeAlias, "kernel/session.ts"),
    "import type { Publication } from './types.js';\nexport function apply(value: Publication) { commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary closes transitive local type aliases before exporting",
    "check-repository-boundary",
    ["--repo-root", transitiveLocalTypeAlias],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const safeWrapperArgument = seedRepo(harness, "repository-boundary-safe-wrapper-argument");
  writeFileSync(
    path.join(safeWrapperArgument, "kernel/wrapper.ts"),
    "export function inspect(value: unknown, local: unknown) { commitPatch(local); return value; }\n",
  );
  writeFileSync(
    path.join(safeWrapperArgument, "kernel/session.ts"),
    "import { inspect } from './wrapper.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\ndeclare const local: unknown;\nexport function approve() { inspect(cloudPublication, local); }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves authority argument positions across wrappers",
    "check-repository-boundary",
    ["--repo-root", safeWrapperArgument],
    0,
  );

  const safeNestedWrapperArgument = seedRepo(harness, "repository-boundary-safe-nested-wrapper-argument");
  writeFileSync(
    path.join(safeNestedWrapperArgument, "kernel/wrapper.ts"),
    "function inner(value: unknown, local: unknown) { commitPatch(local); return value; }\nexport function outer(value: unknown, local: unknown) { return inner(value, local); }\n",
  );
  writeFileSync(
    path.join(safeNestedWrapperArgument, "kernel/session.ts"),
    "import { outer } from './wrapper.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\ndeclare const local: unknown;\nexport function approve() { outer(cloudPublication, local); }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves authority argument positions through nested wrappers",
    "check-repository-boundary",
    ["--repo-root", safeNestedWrapperArgument],
    0,
  );

  const inheritedAuthorityMethod = seedRepo(harness, "repository-boundary-inherited-authority-method");
  writeFileSync(
    path.join(inheritedAuthorityMethod, "kernel/writer.ts"),
    "class Base { apply(value: unknown) { commitPatch(value); } }\nexport class Writer extends Base {}\n",
  );
  writeFileSync(
    path.join(inheritedAuthorityMethod, "kernel/session.ts"),
    "import { Writer } from './writer.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { new Writer().apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary includes inherited authority methods in class contracts",
    "check-repository-boundary",
    ["--repo-root", inheritedAuthorityMethod],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const namespaceReexportAuthorityMethod = seedRepo(harness, "repository-boundary-namespace-reexport-authority-method");
  writeFileSync(path.join(namespaceReexportAuthorityMethod, "kernel/writer.ts"), "export class Writer { apply(value: unknown) { commitPatch(value); } }\n");
  writeFileSync(path.join(namespaceReexportAuthorityMethod, "kernel/barrel.ts"), "export * as cloud from './writer.js';\n");
  writeFileSync(
    path.join(namespaceReexportAuthorityMethod, "kernel/session.ts"),
    "import * as api from './barrel.js';\ninterface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { new api.cloud.Writer().apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary expands namespace re-exports for authority methods",
    "check-repository-boundary",
    ["--repo-root", namespaceReexportAuthorityMethod],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const operation of ["applyAppReviewPlan", "applyConsumerPatches"]) {
    const appReviewPatchAuthority = seedRepo(harness, `repository-boundary-${operation.toLowerCase()}`);
    writeFileSync(
      path.join(appReviewPatchAuthority, "kernel/session.ts"),
      `interface CloudPublication { state: unknown }\ndeclare const cloudPublication: CloudPublication;\nexport function apply() { ${operation}(cloudPublication.state, new Date(), {}); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary classifies ${operation} as authority`,
      "check-repository-boundary",
      ["--repo-root", appReviewPatchAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  for (const operation of [
    "acquireLock",
    "appendAuditEntry",
    "heartbeat",
    "registerWorkspace",
    "releaseLock",
    "removeWorkspace",
    "requestInteractive",
    "recordAppReviewVerification",
  ]) {
    const durableAuthority = seedRepo(harness, `repository-boundary-${operation.toLowerCase()}`);
    writeFileSync(
      path.join(durableAuthority, "kernel/session.ts"),
      `interface CloudPublication { value: unknown }\ndeclare const cloudPublication: CloudPublication;\nexport function apply() { ${operation}(cloudPublication.value); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary classifies ${operation} as authority`,
      "check-repository-boundary",
      ["--repo-root", durableAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const importedCloudTypeAlias = seedRepo(harness, "repository-boundary-imported-cloud-type-alias");
  writeFileSync(
    path.join(importedCloudTypeAlias, "kernel/types.ts"),
    "interface CloudPublication { id: string }\nexport type Publication = CloudPublication;\n",
  );
  writeFileSync(
    path.join(importedCloudTypeAlias, "kernel/session.ts"),
    "import type { Publication } from './types.js';\nexport function apply(value: Publication) { commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves imported Cloud aliases for direct typed values",
    "check-repository-boundary",
    ["--repo-root", importedCloudTypeAlias],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const defaultCloudInterface = seedRepo(harness, "repository-boundary-default-cloud-interface");
  writeFileSync(
    path.join(defaultCloudInterface, "kernel/types.ts"),
    "interface CloudPublication { id: string }\nexport default interface Publication extends CloudPublication {}\n",
  );
  writeFileSync(
    path.join(defaultCloudInterface, "kernel/session.ts"),
    "import type Publication from './types.js';\nexport function apply(value: Publication) { commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary records default-exported Cloud interfaces",
    "check-repository-boundary",
    ["--repo-root", defaultCloudInterface],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const promiseCallbackAuthority = seedRepo(harness, "repository-boundary-promise-callback");
  writeFileSync(
    path.join(promiseCallbackAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare function load(): Promise<CloudPublication>;\nexport function approve() { load().then((value) => commitPatch(value)); }\n",
  );
  harness.runScriptArgs(
    "repository boundary taints values delivered by Promise callbacks",
    "check-repository-boundary",
    ["--repo-root", promiseCallbackAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const writer of ["writeAppReviewState", "writeAppReviewWatch"]) {
    const appReviewWriterAuthority = seedRepo(harness, `repository-boundary-${writer.toLowerCase()}`);
    writeFileSync(
      path.join(appReviewWriterAuthority, "kernel/session.ts"),
      `interface CloudPublication { state: unknown }\ndeclare const cloudPublication: CloudPublication;\nexport function persist() { ${writer}('state.json', cloudPublication.state); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary classifies ${writer} as authority`,
      "check-repository-boundary",
      ["--repo-root", appReviewWriterAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const namespaceReexportMethodClosureAuthority = seedRepo(harness, "repository-boundary-namespace-reexport-method-closure");
  writeFileSync(
    path.join(namespaceReexportMethodClosureAuthority, "kernel/provider.ts"),
    "interface CloudPublication { id: string }\nexport class Source { load(): CloudPublication { return { id: 'cloud' }; } }\n",
  );
  writeFileSync(path.join(namespaceReexportMethodClosureAuthority, "kernel/barrel.ts"), "export * as cloud from './provider.js';\n");
  writeFileSync(
    path.join(namespaceReexportMethodClosureAuthority, "kernel/cloud.ts"),
    "import { cloud } from './barrel.js';\nexport class Loader { get() { return new cloud.Source().load(); } }\n",
  );
  writeFileSync(
    path.join(namespaceReexportMethodClosureAuthority, "kernel/session.ts"),
    "import { Loader } from './cloud.js';\nexport function approve() { return commitPatch(new Loader().get()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary resolves namespace re-exports in method return closures",
    "check-repository-boundary",
    ["--repo-root", namespaceReexportMethodClosureAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const anonymousDefaultAuthority = seedRepo(harness, "repository-boundary-anonymous-default");
  writeFileSync(
    path.join(anonymousDefaultAuthority, "kernel/cloud.ts"),
    "interface CloudPublication { id: string }\nexport default (): CloudPublication => ({ id: 'cloud' });\n",
  );
  writeFileSync(
    path.join(anonymousDefaultAuthority, "kernel/session.ts"),
    "import load from './cloud.js';\nexport function approve() { return commitPatch(load()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary records anonymous default callable exports",
    "check-repository-boundary",
    ["--repo-root", anonymousDefaultAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const claimCompletionAuthority = seedRepo(harness, "repository-boundary-claim-completion");
  writeFileSync(
    path.join(claimCompletionAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, run, now) { return claimCompletion(run, 'occurrence', cloudPublication.proof, now); }\n",
  );
  harness.runScriptArgs(
    "repository boundary classifies work-order completion claims as authority operations",
    "check-repository-boundary",
    ["--repo-root", claimCompletionAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const computeFrontierAuthority = seedRepo(harness, "repository-boundary-compute-frontier");
  writeFileSync(
    path.join(computeFrontierAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication, plan, run, evaluator) { return computeFrontier(plan, run, cloudPublication.businessState, evaluator); }\n",
  );
  harness.runScriptArgs(
    "repository boundary classifies computeFrontier as an authority operation",
    "check-repository-boundary",
    ["--repo-root", computeFrontierAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const qualifiedInferredReturnAuthority = seedRepo(harness, "repository-boundary-qualified-inferred-return");
  writeFileSync(
    path.join(qualifiedInferredReturnAuthority, "kernel/session.ts"),
    "export function approve(cloudPublication) { class Loader { load() { return cloudPublication; } } const loader = new Loader(); function forward() { return loader.load(); } return commitPatch(forward()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves qualified callees in inferred return sources",
    "check-repository-boundary",
    ["--repo-root", qualifiedInferredReturnAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const directAuthorityCallback = seedRepo(harness, "repository-boundary-direct-authority-callback");
  writeFileSync(
    path.join(directAuthorityCallback, "kernel/session.ts"),
    "export function approve(cloudPublication) { [cloudPublication].forEach(commitPatch); }\n",
  );
  harness.runScriptArgs(
    "repository boundary recognizes authority operations used as synchronous callbacks",
    "check-repository-boundary",
    ["--repo-root", directAuthorityCallback],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const deferredNamedMap = seedRepo(harness, "repository-boundary-deferred-named-map");
  writeFileSync(
    path.join(deferredNamedMap, "kernel/session.ts"),
    "function map(callback) { setTimeout(callback, 0); }\nexport function approve(cloudPublication, localValue) { let value = cloudPublication; const apply = () => commitPatch(value); map(apply); value = localValue; }\n",
  );
  harness.runScriptArgs(
    "repository boundary does not classify a same-named local helper as a synchronous built-in",
    "check-repository-boundary",
    ["--repo-root", deferredNamedMap],
    0,
  );

  const conditionalReassignmentAuthority = seedRepo(harness, "repository-boundary-conditional-reassignment");
  writeFileSync(
    path.join(conditionalReassignmentAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\ndeclare const localValue: unknown;\nexport function approve(enabled: boolean) { let value = cloudPublication; if (enabled) value = localValue; commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves taint across conditional reassignment",
    "check-repository-boundary",
    ["--repo-root", conditionalReassignmentAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const helper of ["call", "apply"]) {
    const indirectAuthority = seedRepo(harness, `repository-boundary-authority-${helper}`);
    const argument = helper === "call" ? "null, cloudPublication" : "null, [cloudPublication]";
    writeFileSync(
      path.join(indirectAuthority, "kernel/session.ts"),
      `interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { commitPatch.${helper}(${argument}); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary recognizes authority invoked with Function.prototype.${helper}`,
      "check-repository-boundary",
      ["--repo-root", indirectAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const containerRoundTripAuthority = seedRepo(harness, "repository-boundary-container-round-trip");
  writeFileSync(
    path.join(containerRoundTripAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { const queue: unknown[] = []; queue.push(cloudPublication); commitPatch(queue.pop()); }\n",
  );
  harness.runScriptArgs(
    "repository boundary preserves taint through mutable containers",
    "check-repository-boundary",
    ["--repo-root", containerRoundTripAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const localObjectAuthorityMethod = seedRepo(harness, "repository-boundary-local-object-authority-method");
  writeFileSync(
    path.join(localObjectAuthorityMethod, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nconst writer = { apply(value: unknown) { commitPatch(value); } };\nexport function approve() { writer.apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary registers authority contracts for local object methods",
    "check-repository-boundary",
    ["--repo-root", localObjectAuthorityMethod],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const objectAssignAuthority = seedRepo(harness, "repository-boundary-object-assign");
  writeFileSync(
    path.join(objectAssignAuthority, "kernel/session.ts"),
    "interface CloudPublication { patch: object }\ndeclare const cloudPublication: CloudPublication;\nexport function approve(run: object) { Object.assign(run, cloudPublication.patch); commitPatch(run); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud taint through Object.assign",
    "check-repository-boundary",
    ["--repo-root", objectAssignAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const operator of ["&&=", "??=", "||="]) {
    const logicalAssignmentAuthority = seedRepo(harness, `repository-boundary-logical-assignment-${operator.replace(/\W/gu, "")}`);
    writeFileSync(
      path.join(logicalAssignmentAuthority, "kernel/session.ts"),
      `interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\ndeclare const localValue: unknown;\nexport function approve() { let value: unknown = cloudPublication; value ${operator} localValue; commitPatch(value); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary preserves taint across ${operator} assignment`,
      "check-repository-boundary",
      ["--repo-root", logicalAssignmentAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const constructorAuthority = seedRepo(harness, "repository-boundary-constructor-authority");
  writeFileSync(
    path.join(constructorAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nclass Writer { constructor(value: unknown) { commitPatch(value); } }\nexport function approve() { return new Writer(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary analyzes constructor invocations as authority calls",
    "check-repository-boundary",
    ["--repo-root", constructorAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const aliasedContainerAuthority = seedRepo(harness, "repository-boundary-aliased-container");
  writeFileSync(
    path.join(aliasedContainerAuthority, "kernel/session.ts"),
    "interface CloudPublication { entry: unknown }\ndeclare const cloudPublication: CloudPublication;\nexport function approve(run: { items: unknown[] }) { const items = run.items; items.push(cloudPublication.entry); commitPatch(run); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates mutation taint through object aliases",
    "check-repository-boundary",
    ["--repo-root", aliasedContainerAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const boundInstanceAuthority = seedRepo(harness, "repository-boundary-bound-instance-authority");
  writeFileSync(
    path.join(boundInstanceAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nclass Writer { apply(value: unknown) { commitPatch(value); } }\nconst writer = new Writer();\nconst apply = writer.apply.bind(writer);\nexport function approve() { apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary normalizes bound instance authority methods",
    "check-repository-boundary",
    ["--repo-root", boundInstanceAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const mutation of ["fill(cloudPublication.entry)", "splice(0, 0, cloudPublication.entry)"]) {
    const containerMutatorAuthority = seedRepo(harness, `repository-boundary-container-${mutation.split("(")[0]}`);
    writeFileSync(
      path.join(containerMutatorAuthority, "kernel/session.ts"),
      `interface CloudPublication { entry: unknown }\ndeclare const cloudPublication: CloudPublication;\nexport function approve(run: { items: unknown[] }) { run.items.${mutation}; commitPatch(run); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary propagates Cloud taint through ${mutation.split("(")[0]}`,
      "check-repository-boundary",
      ["--repo-root", containerMutatorAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const destructuringDefaultAuthority = seedRepo(harness, "repository-boundary-destructuring-default");
  writeFileSync(
    path.join(destructuringDefaultAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { const { value = cloudPublication } = {}; commitPatch(value); }\n",
  );
  harness.runScriptArgs(
    "repository boundary taints bindings from destructuring defaults",
    "check-repository-boundary",
    ["--repo-root", destructuringDefaultAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const localCallbackHelperAuthority = seedRepo(harness, "repository-boundary-local-callback-helper");
  writeFileSync(
    path.join(localCallbackHelperAuthority, "kernel/session.ts"),
    "interface CloudPublication { items: unknown[] }\ndeclare const cloudPublication: CloudPublication;\nfunction each(items: unknown[], callback: (value: unknown) => void) { for (const item of items) callback(item); }\nexport function approve() { each(cloudPublication.items, (value) => commitPatch(value)); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates taint through local callback helpers",
    "check-repository-boundary",
    ["--repo-root", localCallbackHelperAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const helperMutationAuthority = seedRepo(harness, "repository-boundary-helper-mutation");
  writeFileSync(
    path.join(helperMutationAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nfunction merge(target: { value?: unknown }, source: unknown) { target.value = source; }\nexport function approve(run: { value?: unknown }) { merge(run, cloudPublication); commitPatch(run); }\n",
  );
  harness.runScriptArgs(
    "repository boundary maps mutated helper parameters to caller arguments",
    "check-repository-boundary",
    ["--repo-root", helperMutationAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const mutation of [
    "Object.defineProperties(run, { entry: { value: cloudPublication.entry } })",
    "Object.defineProperty(run, 'entry', { value: cloudPublication.entry })",
    "Reflect.set(run, 'entry', cloudPublication.entry)",
  ]) {
    const staticMutatorAuthority = seedRepo(harness, `repository-boundary-static-${mutation.split("(")[0]?.replaceAll(".", "-")}`);
    writeFileSync(
      path.join(staticMutatorAuthority, "kernel/session.ts"),
      `interface CloudPublication { entry: unknown }\ndeclare const cloudPublication: CloudPublication;\nexport function approve(run: object) { ${mutation}; commitPatch(run); }\n`,
    );
    harness.runScriptArgs(
      `repository boundary taints destinations passed to ${mutation.split("(")[0]}`,
      "check-repository-boundary",
      ["--repo-root", staticMutatorAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const forInAuthority = seedRepo(harness, "repository-boundary-for-in");
  writeFileSync(
    path.join(forInAuthority, "kernel/session.ts"),
    "interface CloudPublication { patch: object }\ndeclare const cloudPublication: CloudPublication;\nexport function approve() { for (const key in cloudPublication.patch) commitPatch({ path: key }); }\n",
  );
  harness.runScriptArgs(
    "repository boundary propagates Cloud taint into for-in bindings",
    "check-repository-boundary",
    ["--repo-root", forInAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const preboundAuthority = seedRepo(harness, "repository-boundary-prebound-authority");
  writeFileSync(
    path.join(preboundAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\ndeclare const outputPath: string;\nexport function approve() { const save = writeRunState.bind(null, outputPath, cloudPublication); save(); }\n",
  );
  harness.runScriptArgs(
    "repository boundary rejects Cloud arguments pre-bound to authority calls",
    "check-repository-boundary",
    ["--repo-root", preboundAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const objectPropertyAuthority = seedRepo(harness, "repository-boundary-object-property-authority");
  writeFileSync(
    path.join(objectPropertyAuthority, "kernel/session.ts"),
    "interface CloudPublication { id: string }\ndeclare const cloudPublication: CloudPublication;\nconst writer = { apply: commitPatch };\nexport function approve() { writer.apply(cloudPublication); }\n",
  );
  harness.runScriptArgs(
    "repository boundary tracks authority functions stored in object properties",
    "check-repository-boundary",
    ["--repo-root", objectPropertyAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  const linkedWorktree = seedRepo(harness, "repository-boundary-linked-worktree");
  writeFileSync(path.join(linkedWorktree, ".git"), "gitdir: /tmp/b2c-worktrees/example\n");
  harness.runScriptArgs(
    "repository boundary accepts the standard linked-worktree git pointer",
    "check-repository-boundary",
    ["--repo-root", linkedWorktree],
    0,
  );

  const cloudControlledAuthority = seedRepo(harness, "repository-boundary-cloud-controlled-authority");
  writeFileSync(
    path.join(cloudControlledAuthority, "kernel/session.ts"),
    "interface CloudPublication { completed: boolean }\ndeclare const cloudPublication: CloudPublication;\ndeclare const run: unknown;\ndeclare const id: string;\ndeclare const now: Date;\nexport function approve() { if (cloudPublication.completed) completeOccurrence(run, id, now); }\n",
  );
  harness.runScriptArgs(
    "repository boundary tracks Cloud-tainted control flow into authority calls",
    "check-repository-boundary",
    ["--repo-root", cloudControlledAuthority],
    1,
    "repository_boundary.cloud_publication_authority",
  );

  for (const [loopName, loopStatement] of [
    ["while", "while (cloudPublication.completed) { completeOccurrence(run, id, now); break; }"],
    ["do-while", "do { completeOccurrence(run, id, now); } while (cloudPublication.completed);"],
    ["for", "for (; cloudPublication.completed;) { completeOccurrence(run, id, now); break; }"],
  ] as const) {
    const cloudControlledLoopAuthority = seedRepo(harness, `repository-boundary-cloud-controlled-${loopName}`);
    writeFileSync(
      path.join(cloudControlledLoopAuthority, "kernel/session.ts"),
      `interface CloudPublication { completed: boolean }\ndeclare const cloudPublication: CloudPublication;\ndeclare const run: unknown;\ndeclare const id: string;\ndeclare const now: Date;\nexport function approve() { ${loopStatement} }\n`,
    );
    harness.runScriptArgs(
      `repository boundary tracks Cloud-tainted ${loopName} control into authority calls`,
      "check-repository-boundary",
      ["--repo-root", cloudControlledLoopAuthority],
      1,
      "repository_boundary.cloud_publication_authority",
    );
  }

  const nestedCloudUi = seedRepo(harness, "repository-boundary-nested-cloud-ui");
  mkdirSync(path.join(nestedCloudUi, "web/src"), { recursive: true });
  writeFileSync(path.join(nestedCloudUi, "web/src/App.tsx"), "export const App = () => <main>B2C App Builder</main>;\n");
  harness.runScriptArgs(
    "repository boundary rejects nested Cloud UI source packages",
    "check-repository-boundary",
    ["--repo-root", nestedCloudUi],
    1,
    "repository_boundary.cloud_ui_source",
  );

  const recursivelyNestedCloudUi = seedRepo(harness, "repository-boundary-recursively-nested-cloud-ui");
  mkdirSync(path.join(recursivelyNestedCloudUi, "kernel/web/src"), { recursive: true });
  writeFileSync(path.join(recursivelyNestedCloudUi, "kernel/web/src/App.tsx"), "export const App = () => <main>B2C App Builder</main>;\n");
  harness.runScriptArgs(
    "repository boundary rejects recursively nested Cloud UI source packages",
    "check-repository-boundary",
    ["--repo-root", recursivelyNestedCloudUi],
    1,
    "repository_boundary.cloud_ui_source",
  );
}
