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
 * Groups by source file, splits into MAX_FRAMES_PER_BATCH chunks.
 */
export function buildFrameBatches<T extends BatchableFrame>(frames: T[]): T[][] {
  const framesBySource = new Map<string, T[]>();
  for (const f of frames) {
    if (!framesBySource.has(f.sourceFileId)) framesBySource.set(f.sourceFileId, []);
    framesBySource.get(f.sourceFileId)!.push(f);
  }

  const batches: T[][] = [];
  for (const [, sourceFrames] of framesBySource) {
    for (let i = 0; i < sourceFrames.length; i += MAX_FRAMES_PER_BATCH) {
      batches.push(sourceFrames.slice(i, i + MAX_FRAMES_PER_BATCH));
    }
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
