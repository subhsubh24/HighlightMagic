/**
 * Audio muxing infrastructure.
 *
 * Manages a persistent AudioPipeline for the entire render session that:
 * 1. Captures original audio from each video clip as it plays
 * 2. Optionally mixes in a background music track (lowered volume)
 * 3. Outputs a combined MediaStream for the MediaRecorder
 */

import type { MusicTrack } from "./types";

/**
 * Try to load an audio file for the given music track.
 * Supports both local curated tracks (/audio/*.mp3) and AI-generated tracks (external URL).
 * Returns the AudioBuffer if found, null otherwise.
 */
export async function loadTrackAudio(
  track: MusicTrack,
  audioCtx: AudioContext,
  aiMusicUrl?: string | null,
): Promise<AudioBuffer | null> {
  // AI-generated tracks use an external URL instead of a local file
  const url = track.id === "__ai_generated__" && aiMusicUrl
    ? aiMusicUrl
    : `/audio/${track.fileName}.mp3`;

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
 * Persistent audio pipeline that lives for the entire render.
 * Mixes original clip audio + optional background music into one stream.
 */
export interface AudioPipeline {
  /** The combined MediaStream (video + mixed audio) for the MediaRecorder. */
  stream: MediaStream;
  /** Connect a video element's audio to the mix. Returns a disconnect function. */
  connectVideo(video: HTMLVideoElement): () => void;
  /** Clean up all resources. */
  cleanup(): void;
}

/** Volume for background music when clip audio is also playing (0-1). */
const MUSIC_VOLUME_WITH_CLIPS = 0.25;

/**
 * Create a persistent audio pipeline for the render session.
 * Clip audio is routed through at full volume; music is lowered to avoid
 * drowning out the original audio from the clips.
 */
export async function createAudioPipeline(
  canvasStream: MediaStream,
  track: MusicTrack | null,
  aiMusicUrl?: string | null,
): Promise<AudioPipeline> {
  // Use webkit prefix for older Safari; resume() for iOS suspended-by-default policy
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") {
    await audioCtx.resume().catch(() => {});
  }
  const dest = audioCtx.createMediaStreamDestination();

  let musicSource: AudioBufferSourceNode | null = null;

  // Load and start background music if available
  if (track) {
    try {
      const buffer = await loadTrackAudio(track, audioCtx, aiMusicUrl);
      if (buffer) {
        musicSource = audioCtx.createBufferSource();
        musicSource.buffer = buffer;
        musicSource.loop = true;
        const musicGain = audioCtx.createGain();
        musicGain.gain.value = MUSIC_VOLUME_WITH_CLIPS;
        musicSource.connect(musicGain);
        musicGain.connect(dest);
        musicSource.start(0);
      }
    } catch {
      // Music load failed — continue without it
    }
  }

  // Combine video tracks from canvas + audio tracks from our destination
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  return {
    stream: combinedStream,

    connectVideo(video: HTMLVideoElement): () => void {
      try {
        // Route the video element's audio through Web Audio API
        const source = audioCtx.createMediaElementSource(video);
        const gain = audioCtx.createGain();
        gain.gain.value = 1.0;
        source.connect(gain);
        gain.connect(dest);

        // The video must NOT be muted for MediaElementSource to capture audio,
        // but we also don't want it to play through speakers directly since
        // it's already routed through our pipeline.
        // MediaElementSource disconnects the element from the default output,
        // so the audio only goes through our pipeline — no double playback.

        return () => {
          try {
            source.disconnect();
            gain.disconnect();
          } catch {
            // Already disconnected
          }
        };
      } catch {
        // Fallback: if MediaElementSource fails (e.g. CORS), just mute
        video.muted = true;
        return () => {};
      }
    },

    cleanup() {
      try {
        if (musicSource) musicSource.stop();
      } catch { /* already stopped */ }
      audioCtx.close();
    },
  };
}
