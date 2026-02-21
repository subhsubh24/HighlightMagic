/**
 * Audio muxing infrastructure.
 *
 * When music audio files are available (in /public/audio/), this module
 * loads the track, syncs it with the canvas video stream, and combines
 * both into the final exported MediaStream.
 *
 * Currently acts as a pass-through since audio files are not yet bundled.
 * When audio files are added, place them at:
 *   /public/audio/{fileName}.mp3
 * The fileName corresponds to MusicTrack.fileName in music.ts.
 */

import type { MusicTrack } from "./types";

/**
 * Try to load an audio file for the given music track.
 * Returns the AudioBuffer if found, null otherwise.
 */
export async function loadTrackAudio(
  track: MusicTrack,
  audioCtx: AudioContext
): Promise<AudioBuffer | null> {
  const url = `/audio/${track.fileName}.mp3`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    // Audio file not available yet
    return null;
  }
}

/**
 * Create a MediaStream that combines video (from canvas) and audio (from track).
 * If no audio is available, returns the video-only stream.
 */
export async function createMuxedStream(
  canvasStream: MediaStream,
  track: MusicTrack | null,
  totalDurationSec: number
): Promise<{ stream: MediaStream; cleanup: () => void }> {
  if (!track) {
    return { stream: canvasStream, cleanup: () => {} };
  }

  try {
    const audioCtx = new AudioContext();
    const buffer = await loadTrackAudio(track, audioCtx);

    if (!buffer) {
      // No audio file available — return video-only
      return { stream: canvasStream, cleanup: () => audioCtx.close() };
    }

    // Create audio source that plays the track
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true; // Loop if track is shorter than the tape

    // Create a destination that outputs to a MediaStream
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.start(0);

    // Combine video + audio tracks into one MediaStream
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const cleanup = () => {
      source.stop();
      audioCtx.close();
    };

    return { stream: combinedStream, cleanup };
  } catch {
    return { stream: canvasStream, cleanup: () => {} };
  }
}
