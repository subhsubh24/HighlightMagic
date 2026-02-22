"use client";

import { FRAME_SAMPLE_INTERVAL_SECONDS } from "./constants";
import type { MediaFile } from "./types";

export interface ExtractedFrame {
  sourceFileId: string;
  sourceFileName: string;
  sourceType: "video" | "photo";
  timestamp: number;
  base64: string;
  audioEnergy?: number; // 0.0-1.0 normalized RMS energy at this timestamp
  audioOnset?: number;  // 0.0-1.0 energy delta — how much energy CHANGED (transient/beat detection)
  audioBass?: number;   // 0.0-1.0 energy ratio in bass band (20-300 Hz) — drums, bass, sub
  audioMid?: number;    // 0.0-1.0 energy ratio in voice band (300-2000 Hz) — speech, vocals, melody
  audioTreble?: number; // 0.0-1.0 energy ratio in treble band (2000-8000 Hz) — cymbals, sibilants, brightness
}

/**
 * Extract audio energy levels at given timestamps from a video.
 * Uses Web Audio API to decode the audio track and compute RMS energy.
 * Returns a Map of timestamp → normalized energy (0.0-1.0).
 * Fails gracefully (returns empty map) if audio can't be decoded.
 */
interface AudioAnalysis {
  energy: Map<number, number>;  // RMS energy per timestamp (0-1)
  onset: Map<number, number>;   // energy delta per timestamp (0-1) — transient/beat detection
  spectral: Map<number, { bass: number; mid: number; treble: number }>; // frequency band ratios
}

/**
 * Goertzel algorithm: compute energy at a single frequency bin in O(N).
 * Much faster than FFT when you only need a handful of frequencies.
 */
function goertzelEnergy(samples: Float32Array, sampleRate: number, targetFreq: number): number {
  const N = samples.length;
  const k = Math.round(targetFreq * N / sampleRate);
  if (k <= 0 || k >= N / 2) return 0;
  const coeff = 2 * Math.cos((2 * Math.PI * k) / N);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) {
    const s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Compute spectral band energy ratios at a timestamp.
 * Returns proportion of energy in bass (20-300 Hz), mid/voice (300-2000 Hz), treble (2000-8000 Hz).
 * Used to help AI distinguish speech vs music vs silence.
 */
function computeSpectralBands(
  mixedData: Float32Array,
  sampleRate: number,
  centerSample: number,
  halfWindow: number
): { bass: number; mid: number; treble: number } {
  const start = Math.max(0, centerSample - halfWindow);
  const end = Math.min(mixedData.length, centerSample + halfWindow);
  if (end - start < 64) return { bass: 0, mid: 0, treble: 0 };

  const samples = mixedData.subarray(start, end);

  // Sample representative frequencies per band using Goertzel
  const bassEnergy = goertzelEnergy(samples, sampleRate, 60)
    + goertzelEnergy(samples, sampleRate, 120)
    + goertzelEnergy(samples, sampleRate, 200);
  const midEnergy = goertzelEnergy(samples, sampleRate, 400)
    + goertzelEnergy(samples, sampleRate, 800)
    + goertzelEnergy(samples, sampleRate, 1200)
    + goertzelEnergy(samples, sampleRate, 2000);
  const trebleEnergy = goertzelEnergy(samples, sampleRate, 3000)
    + goertzelEnergy(samples, sampleRate, 5000)
    + goertzelEnergy(samples, sampleRate, 7000);

  const total = bassEnergy + midEnergy + trebleEnergy;
  if (total === 0) return { bass: 0, mid: 0, treble: 0 };

  return {
    bass: Math.round((bassEnergy / total) * 100) / 100,
    mid: Math.round((midEnergy / total) * 100) / 100,
    treble: Math.round((trebleEnergy / total) * 100) / 100,
  };
}

async function extractAudioAnalysis(
  videoUrl: string,
  timestamps: number[]
): Promise<AudioAnalysis> {
  const empty: AudioAnalysis = { energy: new Map(), onset: new Map(), spectral: new Map() };
  try {
    const response = await fetch(videoUrl);
    const arrayBuffer = await response.arrayBuffer();

    // Use webkit prefix for older Safari; resume() for iOS suspended-by-default policy
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume().catch(() => {});
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
      audioCtx.close();
      return empty;
    }

    // Average all channels for stereo/surround content
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.getChannelData(0).length;
    const mixedData = new Float32Array(length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mixedData[i] += channelData[i] / numChannels;
      }
    }

    const sampleRate = audioBuffer.sampleRate;
    const windowSamples = Math.floor(sampleRate * 0.25); // 0.25s window — tighter for transient precision

    const energyMap = new Map<number, number>();
    const spectralMap = new Map<number, { bass: number; mid: number; treble: number }>();
    const halfWindow = Math.floor(windowSamples / 2);

    for (const ts of timestamps) {
      const centerSample = Math.floor(ts * sampleRate);
      const start = Math.max(0, centerSample - halfWindow);
      const end = Math.min(length, centerSample + halfWindow);

      if (end <= start) {
        energyMap.set(ts, 0);
        continue;
      }

      let sumSquares = 0;
      for (let i = start; i < end; i++) {
        sumSquares += mixedData[i] * mixedData[i];
      }
      energyMap.set(ts, Math.sqrt(sumSquares / (end - start)));

      // Spectral band analysis — reuses the same window
      spectralMap.set(ts, computeSpectralBands(mixedData, sampleRate, centerSample, halfWindow));
    }

    // Normalize energy to 0-1
    const maxEnergy = Math.max(...energyMap.values(), 0.001);
    for (const [ts, energy] of energyMap) {
      energyMap.set(ts, Math.round((energy / maxEnergy) * 100) / 100);
    }

    // Compute onset strength: how much energy CHANGED vs. the previous timestamp.
    // High onset = transient (beat hit, impact, clap, sudden sound).
    // This is what the AI needs to find natural cut points and sync to rhythm.
    const onsetMap = new Map<number, number>();
    const sortedTs = [...timestamps].sort((a, b) => a - b);
    for (let i = 0; i < sortedTs.length; i++) {
      const ts = sortedTs[i];
      const current = energyMap.get(ts) ?? 0;
      const prev = i > 0 ? (energyMap.get(sortedTs[i - 1]) ?? 0) : 0;
      // Only positive deltas matter (onset = energy appearing, not disappearing)
      onsetMap.set(ts, Math.max(0, current - prev));
    }

    // Normalize onset to 0-1
    const maxOnset = Math.max(...onsetMap.values(), 0.001);
    for (const [ts, onset] of onsetMap) {
      onsetMap.set(ts, Math.round((onset / maxOnset) * 100) / 100);
    }

    audioCtx.close();
    return { energy: energyMap, onset: onsetMap, spectral: spectralMap };
  } catch {
    return empty;
  }
}

/**
 * Extract frames from a single video at regular intervals as base64 JPEG.
 */
export async function extractFrames(
  videoUrl: string,
  duration: number,
  onProgress?: (pct: number) => void
): Promise<{ timestamp: number; base64: string; audioEnergy?: number; audioOnset?: number; audioBass?: number; audioMid?: number; audioTreble?: number }[]> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video for frame extraction"));
  });

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 480 / video.videoHeight); // 480p — sufficient for highlight detection, halves payload vs 720p
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;

  const frames: { timestamp: number; base64: string; audioEnergy?: number; audioOnset?: number; audioBass?: number; audioMid?: number; audioTreble?: number }[] = [];
  const interval = FRAME_SAMPLE_INTERVAL_SECONDS;
  const totalFrames = Math.floor(duration / interval);

  // Build timestamps list and start audio analysis in parallel with visual extraction
  const timestamps = Array.from({ length: totalFrames + 1 }, (_, i) => i * interval);
  const audioPromise = extractAudioAnalysis(videoUrl, timestamps);

  for (let i = 0; i <= totalFrames; i++) {
    const time = i * interval;
    video.currentTime = time;

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
    frames.push({ timestamp: time, base64 });

    onProgress?.(((i + 1) / (totalFrames + 1)) * 100);
  }

  // Attach audio analysis to each frame
  const audio = await audioPromise;
  if (audio.energy.size > 0) {
    for (const frame of frames) {
      frame.audioEnergy = audio.energy.get(frame.timestamp);
      frame.audioOnset = audio.onset.get(frame.timestamp);
      const bands = audio.spectral.get(frame.timestamp);
      if (bands) {
        frame.audioBass = bands.bass;
        frame.audioMid = bands.mid;
        frame.audioTreble = bands.treble;
      }
    }
  }

  return frames;
}

/**
 * Extract frames from multiple media files (videos + photos) for multi-clip analysis.
 * Returns frames tagged with their source file ID.
 */
export async function extractFramesFromMultiple(
  mediaFiles: MediaFile[],
  onProgress?: (pct: number) => void
): Promise<ExtractedFrame[]> {
  const allFrames: ExtractedFrame[] = [];
  let completedFiles = 0;

  for (const media of mediaFiles) {
    if (media.type === "photo") {
      // For photos, just convert to base64
      const base64 = await imageFileToBase64(media.url);
      allFrames.push({
        sourceFileId: media.id,
        sourceFileName: media.name,
        sourceType: "photo",
        timestamp: 0,
        base64,
      });
    } else {
      // For videos, extract frames at intervals
      const videoFrames = await extractFrames(
        media.url,
        media.duration,
        (pct) => {
          // Map individual video progress into overall progress
          const fileProgress = (completedFiles + pct / 100) / mediaFiles.length;
          onProgress?.(fileProgress * 100);
        }
      );

      for (const frame of videoFrames) {
        allFrames.push({
          sourceFileId: media.id,
          sourceFileName: media.name,
          sourceType: "video",
          timestamp: frame.timestamp,
          base64: frame.base64,
          audioEnergy: frame.audioEnergy,
          audioOnset: frame.audioOnset,
          audioBass: frame.audioBass,
          audioMid: frame.audioMid,
          audioTreble: frame.audioTreble,
        });
      }
    }

    completedFiles++;
    onProgress?.((completedFiles / mediaFiles.length) * 100);
  }

  return allFrames;
}

/**
 * Convert an image URL (object URL) to base64 JPEG.
 */
async function imageFileToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 480 / img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
