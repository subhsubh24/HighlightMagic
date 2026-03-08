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

/** A scheduled audio layer (voiceover, SFX) to mix into the render. */
export interface ScheduledAudioLayer {
  url: string;
  startTime: number;   // seconds from render start
  volume: number;      // 0-1
}

/** Ducking ratio — when voiceover plays, music drops to this fraction of its normal volume. */
const MUSIC_DUCK_RATIO = 0.3;

/**
 * Create a persistent audio pipeline for the render session.
 * Clip audio is routed through at full volume; music is lowered to avoid
 * drowning out the original audio from the clips.
 * @param musicVolume AI-decided music volume (0-1), defaults to 0.5
 */
export async function createAudioPipeline(
  canvasStream: MediaStream,
  track: MusicTrack | null,
  aiMusicUrl?: string | null,
  scheduledLayers?: ScheduledAudioLayer[],
  musicVolume: number = 0.5,
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
  // Either from a curated track object or directly from AI music URL
  const musicUrl = track
    ? (track.id === "__ai_generated__" && aiMusicUrl ? aiMusicUrl : `/audio/${track.fileName}.mp3`)
    : aiMusicUrl || null;

  let musicGainNode: GainNode | null = null;

  if (musicUrl) {
    try {
      const response = await fetch(musicUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        musicSource = audioCtx.createBufferSource();
        musicSource.buffer = buffer;
        musicSource.loop = true;
        musicGainNode = audioCtx.createGain();
        musicGainNode.gain.value = musicVolume;
        musicSource.connect(musicGainNode);
        musicGainNode.connect(dest);
        musicSource.start(0);
      }
    } catch {
      // Music load failed — continue without it
    }
  }

  // Schedule voiceover / SFX layers at their designated times
  const scheduledSources: AudioBufferSourceNode[] = [];
  // Track voiceover timing for auto-ducking music
  const voiceovers: { startTime: number; duration: number }[] = [];

  if (scheduledLayers && scheduledLayers.length > 0) {
    for (const layer of scheduledLayers) {
      try {
        const response = await fetch(layer.url);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.value = layer.volume;
        source.connect(gain);
        gain.connect(dest);
        source.start(Math.max(0, layer.startTime));
        scheduledSources.push(source);

        // If this is a voiceover layer (volume 1.0), record timing for ducking
        if (layer.volume === 1.0) {
          voiceovers.push({ startTime: layer.startTime, duration: buffer.duration });
        }
      } catch {
        // Skip failed layer
      }
    }
  }

  // Auto-duck music during voiceover — matches TapePreviewPlayer behavior
  if (musicGainNode && voiceovers.length > 0) {
    for (const vo of voiceovers) {
      const voEnd = vo.startTime + vo.duration;
      const duckedVolume = musicVolume * MUSIC_DUCK_RATIO;
      musicGainNode.gain.linearRampToValueAtTime(musicVolume, Math.max(0, vo.startTime - 0.2));
      musicGainNode.gain.linearRampToValueAtTime(duckedVolume, vo.startTime);
      musicGainNode.gain.linearRampToValueAtTime(duckedVolume, voEnd);
      musicGainNode.gain.linearRampToValueAtTime(musicVolume, voEnd + 0.3);
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
      for (const s of scheduledSources) {
        try { s.stop(); } catch { /* already stopped */ }
      }
      audioCtx.close();
    },
  };
}
