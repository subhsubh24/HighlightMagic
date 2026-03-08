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
  /** Layer type — used for auto-ducking detection (voiceover triggers music duck) */
  layerType?: "voiceover" | "sfx";
}

/** Default ducking ratio — when voiceover plays, music drops to this fraction of its normal volume. */
const DEFAULT_MUSIC_DUCK_RATIO = 0.3;

/**
 * Create a persistent audio pipeline for the render session.
 * Clip audio is routed through at full volume; music is lowered to avoid
 * drowning out the original audio from the clips.
 * @param musicVolume AI-decided music volume (0-1), defaults to 0.5
 * @param musicDuckRatio AI-decided ducking ratio during voiceover (0.1-0.6), defaults to 0.3
 */
export async function createAudioPipeline(
  canvasStream: MediaStream,
  track: MusicTrack | null,
  aiMusicUrl?: string | null,
  scheduledLayers?: ScheduledAudioLayer[],
  musicVolume: number = 0.5,
  musicDuckRatio: number = DEFAULT_MUSIC_DUCK_RATIO,
): Promise<AudioPipeline> {
  // Use webkit prefix for older Safari; resume() for iOS suspended-by-default policy
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") {
    await audioCtx.resume().catch((e) => console.warn("[Audio] AudioContext resume failed:", e));
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
    } catch (e) {
      console.error("[Audio] Music load failed:", musicUrl, e);
    }
  }

  // Schedule voiceover / SFX layers at their designated times
  const scheduledSources: AudioBufferSourceNode[] = [];
  // Track voiceover timing for auto-ducking music
  const voiceovers: { startTime: number; duration: number }[] = [];

  if (scheduledLayers && scheduledLayers.length > 0) {
    // Capture the current AudioContext time as the render start reference.
    // layer.startTime is relative to render start, so offset by audioCtx.currentTime
    // to account for any delay spent loading/decoding the music buffer above.
    const renderStartTime = audioCtx.currentTime;
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
        source.start(renderStartTime + Math.max(0, layer.startTime));
        scheduledSources.push(source);

        // If this is a voiceover layer, record timing for auto-ducking music
        if (layer.layerType === "voiceover") {
          voiceovers.push({ startTime: layer.startTime, duration: buffer.duration });
        }
      } catch (e) {
        console.error(`[Audio] Scheduled layer failed (${layer.layerType ?? "unknown"}):`, layer.url, e);
      }
    }
  }

  // Auto-duck music during voiceover — matches TapePreviewPlayer behavior
  // Sort by start time and merge overlapping/adjacent segments to avoid conflicting ramps
  if (musicGainNode && voiceovers.length > 0) {
    const sorted = [...voiceovers].sort((a, b) => a.startTime - b.startTime);
    const merged: { startTime: number; endTime: number }[] = [];
    for (const vo of sorted) {
      const voEnd = vo.startTime + vo.duration;
      const last = merged[merged.length - 1];
      // Merge if overlapping or within 0.5s gap (avoids rapid duck/unduck)
      if (last && vo.startTime <= last.endTime + 0.5) {
        last.endTime = Math.max(last.endTime, voEnd);
      } else {
        merged.push({ startTime: vo.startTime, endTime: voEnd });
      }
    }
    const duckedVolume = musicVolume * musicDuckRatio;
    for (const seg of merged) {
      const duckStart = Math.max(0, seg.startTime - 0.2);
      musicGainNode.gain.setValueAtTime(musicVolume, duckStart);
      musicGainNode.gain.linearRampToValueAtTime(duckedVolume, seg.startTime);
      musicGainNode.gain.setValueAtTime(duckedVolume, seg.endTime);
      musicGainNode.gain.linearRampToValueAtTime(musicVolume, seg.endTime + 0.3);
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
      } catch (e) {
        console.warn("[Audio] MediaElementSource failed (CORS?), muting video:", e);
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
