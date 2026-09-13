/** Structural evidence for the existing entrypoint check, not model-behavior proof. */
import { createHash } from "node:crypto";
import path from "node:path";

export interface GuidanceFinding {
  code: string;
  file: string;
  detail: string;
}
export type ReadGuidance = (relative: string) => string | undefined;

const ROOT = "AGENTS.md";
const SKILL = "SKILL.md";
const SETUP = "agents/skills/b2c-app-builder/references/setup.md";

/** Each entry protects an obligation, not a prose-length target. */
export const STANDING_RULES: ReadonlyArray<{ id: string; terms: readonly string[] }> = [
  {
    id: "privacy",
    terms: [
      "issues are public",
      "secret values",
      "live provider/operator identifiers",
      "private-repository references",
      "personal addresses",
      "home paths",
      "machine names",
      "customer/operator status",
      "production deployment configuration",
      "without quoting the value publicly",
    ],
  },
  {
    id: "architecture",
    terms: [
      "target architecture",
      "implementation evidence",
      "truth ownership",
      "dependency direction",
      "migration guarantees",
      "architecture decision",
      "Compatible internal choices do not",
    ],
  },
  { id: "single_owner", terms: ["existing owners", "Do not add competing", "not another knowledge graph", "one logical routing model"] },
  {
    id: "truth",
    terms: [
      "intent losslessly",
      "`product.yaml` owns",
      "`PRODUCT.md` is rendered",
      "`DESIGN.md` owns",
      "Reducer-owned state owns",
      "only through the reducer",
      "Git owns",
      "registry owns workspace identity/address",
    ],
  },
  { id: "current_guidance", terms: ["bounded projection", "unresolved before dispatch", "unknown applicability must not become assumed non-applicability"] },
  {
    id: "authored_generated",
    terms: [
      "canonical authored guides, thin host adapters, and generated projections",
      "nearest applicable AGENTS.md",
      "Nested guides may narrow scope",
      "Edit authored",
      "before rendering",
      "stable public/catalog/reference IDs",
      "public major version",
    ],
  },
  { id: "workspace_boundary", terms: ["Workspace-facing guidance", "never maintainer ARCH rules", "contributor machinery"] },
  {
    id: "writing_owners",
    terms: ["[no-slop writing]", "[technical documentation]", "[kitchen-language boundary]"],
  },
  {
    id: "completion",
    terms: [
      "An implementation request authorizes",
      "in-scope, reversible repository work",
      "repair failures caused by the change",
      "regenerate affected output",
      "inspect the diff",
      "complete required checks without repeated intermediate approvals",
      "does not authorize unrelated fixes",
      "Review-only and planning-only requests remain review and planning, not implementation",
    ],
  },
  {
    id: "authority",
    terms: [
      "Reuse valid existing scoped authority",
      "neither a runtime grant nor an approval receipt",
      "pause if it is absent or insufficient",
      "not safe merely because it runs locally in a terminal",
    ],
  },
  {
    id: "protected_effects",
    terms: [
      "external account/access",
      "credential changes",
      "spend",
      "pricing or legal decisions",
      "destructive actions",
      "deployment",
      "publication",
      "store submission",
      "production release",
    ],
  },
  {
    id: "provider_upstream",
    terms: [
      "explicit provider bindings",
      "actual tool availability",
      "Provider adapters implement canonical operations",
      "guidance is subordinate",
      "cannot add requirements",
      "change provider selection/state",
      "override evidence",
      "redefine completion",
    ],
  },
  {
    id: "verification",
    terms: [
      "CONTRIBUTING.md",
      "all applicable required gates before merge",
      "presubmit is not a full-audit pass",
      "Do not skip suites, weaken CI",
      "current provider/device/store/runtime evidence",
    ],
  },
  {
    id: "integration",
    terms: [
      "non-overlapping ownership",
      "delegation is not mandatory",
      "One coordinating agent owns shared-file integration",
      "final verification",
      "genuinely independent of implementation",
      "do not invent a reviewer",
    ],
  },
];

export function completionRule(text: string): string | undefined {
  return text.replace(/\r\n/gu, "\n").split("## Completion authority and protected effects\n\n")[1]?.split("\n\n")[0];
}

export function localMarkdownLinks(text: string): string[] {
  return [...text.matchAll(/\[[^\]]*\]\(([^\s()]+)\)/gu)].map((match) => match[1]!).filter((target) => !/^(?:[a-z][a-z\d+.-]*:|#)/iu.test(target));
}

export function checkStandingGuidance(read: ReadGuidance): GuidanceFinding[] {
  const findings: GuidanceFinding[] = [];
  const add = (id: string, file: string, detail: string): void => {
    findings.push({ code: `agent_entrypoints.${id}`, file, detail });
  };
  const root = read(ROOT)?.replace(/\r\n/gu, "\n");
  const skill = read(SKILL)?.replace(/\r\n/gu, "\n");
  if (root === undefined || skill === undefined) return findings; // Existing canonical-file gate owns this failure.
  for (const rule of STANDING_RULES) {
    const missing = rule.terms.filter((term) => !root.includes(term));
    if (missing.length) add(`standing_${rule.id}_missing`, ROOT, `Missing standing obligation: ${missing.join("; ")}`);
  }
  if (/```|\bnpm (?:run|ci)\b|\bb2c contribute (?:plan|check|preview|evaluate)\b/u.test(root)) {
    add("root_procedure_leak", ROOT, "Exact commands and procedural checklists belong in their scoped owners, not the injected standing contract.");
  }
  const checkOwnerLinks = (file: string, text: string): void => {
    for (const target of localMarkdownLinks(text)) {
      const relative = target.split("#")[0]!;
      const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(file), relative));
      if (path.posix.isAbsolute(relative) || normalized === ".." || normalized.startsWith("../") || read(normalized) === undefined) {
        add("standing_owner_link_broken", file, `Missing or non-local standing-rule owner: ${target}`);
      }
    }
  };
  checkOwnerLinks(ROOT, root);
  const portableRule = completionRule(root);
  if (!portableRule || !skill.includes(portableRule)) {
    add(
      "portable_completion_drift",
      SKILL,
      "The portable completion rule must match the authored standing rule without requiring repository AGENTS.md at runtime.",
    );
  }
  if (/\]\((?:AGENTS\.md|CONTRIBUTING\.md|docs\/|agents\/skills\/b2c-(?:maintainer|contributor)\/)/u.test(skill)) {
    add("business_maintainer_dependency", SKILL, "A portable business skill must not depend on repository-only guidance.");
  }
  for (const term of [
    "Local b2c-local",
    "hosted b2c-hosted",
    "read-only knowledge",
    "cannot execute a local business",
    "Missing execution tooling does not block advisory work",
  ]) {
    if (!skill.includes(term)) add("capability_identity_missing", SKILL, `Missing minimum local/hosted or advisory boundary: ${term}`);
  }
  for (const term of ["Degraded execution still selects", "CLI-only public MCP names", "mcp_readonly", "leftover b2c-app-builder connection name"]) {
    if (skill.toLowerCase().includes(term.toLowerCase())) add("root_setup_diagnostics", SKILL, `Conditional setup detail leaked into root: ${term}`);
  }
  const setup = read(SETUP);
  if (setup === undefined || !skill.includes(`](${SETUP})`)) {
    add("setup_owner_unreachable", SKILL, "Connection setup must remain an existing directly linked package-local reference.");
  } else {
    checkOwnerLinks(SETUP, setup);
    for (const term of [
      "b2c-local",
      "b2c-hosted",
      "leftover `b2c-app-builder`",
      "Duplicate names are a collision",
      "missing worker CLI",
      "Degraded execution still selects b2c-local",
      "CLI-only public MCP names",
      "write-gated MCP names",
      "mcp_readonly",
      "Hosted leftover names stay wrong-surface",
      "b2c inspect",
      "b2c doctor",
      "Keep the MCP read-only by default",
      "Do not edit an agent configuration or install software unless the user requested setup",
    ]) {
      if (!setup.includes(term)) add("setup_compatibility_missing", SETUP, `Missing moved setup obligation: ${term}`);
    }
  }
  return findings;
}

export interface GuidancePacket {
  id: string;
  measuredFiles: string[];
  fileCount: number;
  utf8Bytes: number;
}

/** Replays only declared file packets. This does not infer a read path or execute a service. */
export function measureGuidancePackets(
  packets: readonly GuidancePacket[],
  read: ReadGuidance,
): Array<{
  id: string;
  fileCount: number;
  utf8Bytes: number;
  files: Array<{ path: string; utf8Bytes: number; gitBlob: string }>;
}> {
  return packets.map((packet) => {
    if (new Set(packet.measuredFiles).size !== packet.measuredFiles.length || !packet.measuredFiles.includes(ROOT)) {
      throw new Error(`Invalid automatic-file accounting for ${packet.id}`);
    }
    const files = packet.measuredFiles.map((relative) => {
      if (path.posix.isAbsolute(relative) || relative.split("/").includes("..")) throw new Error(`Non-local packet file: ${relative}`);
      const text = read(relative);
      if (text === undefined) throw new Error(`Unmeasured required packet file: ${relative}`);
      const bytes = Buffer.from(text, "utf8");
      return { path: relative, utf8Bytes: bytes.length, gitBlob: createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") };
    });
    return { id: packet.id, fileCount: files.length, utf8Bytes: files.reduce((sum, file) => sum + file.utf8Bytes, 0), files };
  });
}
