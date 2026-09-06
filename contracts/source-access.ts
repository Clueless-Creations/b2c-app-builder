export interface SourceAccess {
  readonly path: string;
  readonly access: "read" | "create" | "update";
}

const protectedRoots = new Set([".git", ".agents", ".claude", ".cursor", ".b2c-launch", ".b2c-app-builder", "control", "run", "state", "digests"]);
const protectedFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "product.yaml",
  "PRODUCT.md",
  "DESIGN.md",
  "b2c.yaml",
  "b2c.json",
  "operations/business-access.json",
]);

/** App source claims never grant access to the host's authority or execution state. */
export function validateSourceAccess(claims: readonly SourceAccess[]): SourceAccess[] {
  const result: SourceAccess[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    if (!claim || !["read", "create", "update"].includes(claim.access) || typeof claim.path !== "string") throw new Error("Invalid source access claim.");
    const segments = claim.path.split("/");
    if (
      !claim.path ||
      claim.path.includes("\\") ||
      claim.path.includes(":") ||
      claim.path.includes("\0") ||
      segments.some((part) => !part || part === "." || part === "..")
    )
      throw new Error(`Invalid source access path: ${claim.path}`);
    if (
      claim.access !== "read" &&
      (protectedRoots.has(segments[0]!) ||
        [...protectedFiles].some((protectedPath) => protectedPath === claim.path || protectedPath.startsWith(`${claim.path}/`)))
    )
      throw new Error(`Source write targets host-owned state: ${claim.path}`);
    if (seen.has(claim.path)) throw new Error(`Duplicate source claim: ${claim.path}`);
    seen.add(claim.path);
    result.push({ path: claim.path, access: claim.access });
  }
  return result;
}
