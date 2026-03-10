import type { EditedClip, ValidationFixes } from "./types";

/**
 * Apply plan-layer clip fixes from Haiku validation — pure function.
 * Merges clipUpdates into matching clips by index and removes clips at clipRemovals indices.
 * Returns a new array (immutable).
 */
export function applyClipFixes(clips: EditedClip[], fixes: ValidationFixes): EditedClip[] {
  let result = [...clips];

  // 1. Apply clipUpdates — merge partial updates into matching clips by index
  if (fixes.clipUpdates) {
    for (const { clipIndex, updates } of fixes.clipUpdates) {
      if (clipIndex >= 0 && clipIndex < result.length) {
        result[clipIndex] = { ...result[clipIndex], ...updates };
      }
    }
  }

  // 2. Apply clipRemovals — filter out clips at specified indices, then re-number order
  if (fixes.clipRemovals && fixes.clipRemovals.length > 0) {
    const removeSet = new Set(fixes.clipRemovals);
    result = result.filter((_, i) => !removeSet.has(i));
    // Re-number the order field to keep it sequential
    result = result.map((c, i) => ({ ...c, order: i }));
  }

  return result;
}
