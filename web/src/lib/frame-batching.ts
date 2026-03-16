/**
 * Pure utilities for batching frames. Shared between client and server —
 * NOT a "use server" file, so these can be imported anywhere.
 */

import { MAX_FRAMES_PER_BATCH } from "@/lib/constants";

/** Minimal frame info needed for batching (no base64). */
interface BatchableFrame {
  sourceFileId: string;
  sourceFileName: string;
  sourceType: "video" | "photo";
}

/** Serializable source file info (Maps can't cross the server action boundary). */
export type SourceFileInfo = {
  id: string;
  name: string;
  type: "video" | "photo";
  frameCount: number;
};

/**
 * Build frame batches from all frames.
 * Videos: groups by source file, splits into MAX_FRAMES_PER_BATCH chunks.
 * Photos: packs single-frame sources together (35 photos per batch instead of
 * 100 individual API calls). This also helps Haiku detect similar/duplicate
 * photos since it can compare them within the same batch.
 */
export function buildFrameBatches<T extends BatchableFrame>(frames: T[]): T[][] {
  const framesBySource = new Map<string, T[]>();
  for (const f of frames) {
    if (!framesBySource.has(f.sourceFileId)) framesBySource.set(f.sourceFileId, []);
    framesBySource.get(f.sourceFileId)!.push(f);
  }

  const batches: T[][] = [];
  const singleFrameSources: T[] = []; // Photos — pack together for efficiency

  for (const [, sourceFrames] of framesBySource) {
    if (sourceFrames.length === 1 && sourceFrames[0].sourceType === "photo") {
      singleFrameSources.push(sourceFrames[0]);
    } else {
      // Videos (multi-frame): batch by source as before
      for (let i = 0; i < sourceFrames.length; i += MAX_FRAMES_PER_BATCH) {
        batches.push(sourceFrames.slice(i, i + MAX_FRAMES_PER_BATCH));
      }
    }
  }

  // Pack photos into batches of MAX_FRAMES_PER_BATCH (e.g. 100 photos → 3 batches)
  for (let i = 0; i < singleFrameSources.length; i += MAX_FRAMES_PER_BATCH) {
    batches.push(singleFrameSources.slice(i, i + MAX_FRAMES_PER_BATCH));
  }

  return batches;
}

/**
 * Build source file info list from frames. Call ONCE on the client,
 * then pass the lightweight list to each scoreSingleBatch call.
 */
export function buildSourceFileList(frames: BatchableFrame[]): SourceFileInfo[] {
  const map = new Map<string, SourceFileInfo>();
  for (const f of frames) {
    if (!map.has(f.sourceFileId)) {
      map.set(f.sourceFileId, { id: f.sourceFileId, name: f.sourceFileName, type: f.sourceType, frameCount: 0 });
    }
    map.get(f.sourceFileId)!.frameCount++;
  }
  return Array.from(map.values());
}
