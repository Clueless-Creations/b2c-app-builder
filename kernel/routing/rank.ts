import type { RouteCandidate } from "./types.js";

export interface RankResult {
  ordered: RouteCandidate[];
  scores: Record<string, number>;
  tied: boolean;
  tiedIds: string[];
}

export function rankEligible(eligible: readonly RouteCandidate[], ambiguityBand: number): RankResult {
  const ordered = [...eligible].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.id.localeCompare(right.id);
  });
  const scores: Record<string, number> = {};
  for (const candidate of ordered) scores[candidate.id] = candidate.score;
  const top = ordered[0];
  const tiedIds = top ? ordered.filter((candidate) => Math.abs(top.score - candidate.score) <= ambiguityBand).map((candidate) => candidate.id) : [];
  const tied = tiedIds.length > 1;
  return { ordered, scores, tied, tiedIds };
}
