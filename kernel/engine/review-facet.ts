/** Pure review projection shared with hosted knowledge surfaces. */
export function reviewFacet(
  reviewOf: readonly string[] | undefined,
  reviewedBy: readonly string[] | undefined,
): { reviewOf: string[]; reviewedBy: string[] } | undefined {
  const of = [...(reviewOf ?? [])];
  const by = [...(reviewedBy ?? [])];
  return of.length > 0 || by.length > 0 ? { reviewOf: of, reviewedBy: by } : undefined;
}
