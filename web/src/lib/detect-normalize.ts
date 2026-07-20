import type { ScoredFrame } from "@/actions/detect";

// ── Score normalization across batches ──

/**
 * Normalize scores so different scoring batches are comparable.
 * Each batch may have a different mean/variance due to context differences.
 * We z-score normalize within each batch-sized group (by source),
 * then rescale to [0, 1].
 *
 * Extracted from src/actions/detect.ts (a "use server" module, which may only export
 * async server actions) so this pure normalization math is unit-testable and
 * coverage-measured. Behavior is unchanged — detect.ts imports it back in.
 */
export function normalizeScoresAcrossBatches(scores: ScoredFrame[]): ScoredFrame[] {
  if (scores.length === 0) return scores;

  // Group by source (each source was batched separately)
  const bySource = new Map<string, ScoredFrame[]>();
  for (const s of scores) {
    if (!bySource.has(s.sourceFileId)) bySource.set(s.sourceFileId, []);
    bySource.get(s.sourceFileId)!.push(s);
  }

  // Z-score normalize within each source group
  const zScores = new Map<ScoredFrame, number>();
  for (const [, group] of bySource) {
    const mean = group.reduce((sum, s) => sum + s.score, 0) / group.length;
    const variance = group.reduce((sum, s) => sum + (s.score - mean) ** 2, 0) / group.length;
    const stdDev = Math.sqrt(variance);

    for (const s of group) {
      // If all scores are identical (stdDev=0), treat as average (z=0)
      zScores.set(s, stdDev > 0.001 ? (s.score - mean) / stdDev : 0);
    }
  }

  // Rescale z-scores to [0, 1] using min-max across all sources
  let minZ = Infinity, maxZ = -Infinity;
  for (const z of zScores.values()) {
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const range = maxZ - minZ;

  return scores.map((s) => ({
    ...s,
    score: Math.max(0, Math.min(1, range > 0.001 ? (zScores.get(s)! - minZ) / range : 0.5)),
  }));
}
