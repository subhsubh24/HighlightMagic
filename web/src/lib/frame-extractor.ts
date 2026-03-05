"use client";

import { FRAME_SAMPLE_INTERVAL_SECONDS } from "./constants";
import type { MediaFile } from "./types";

/** Adaptive sampling: bonus frames within ±RADIUS of interest points at DENSITY intervals. */
const ADAPTIVE_RADIUS_S = 0.5;    // sample ±0.5s around each interest point
const ADAPTIVE_DENSITY_S = 0.25;  // 4fps in interest regions
/** Audio pre-scan resolution for finding onset peaks. */
const AUDIO_PRESCAN_INTERVAL_S = 0.1; // 10Hz — 100ms resolution
/** Minimum onset value to qualify as an interest point (after normalization). */
const ONSET_PEAK_THRESHOLD = 0.45;
/** Minimum pixel difference ratio to qualify as a visual scene change. */
const SCENE_CHANGE_THRESHOLD = 0.12;
/** Target max height for extracted frames — 480p balances quality with API cost.
 * Well within Claude Vision's sweet spot (200px–1568px per edge). */
const FRAME_TARGET_HEIGHT = 480;
/** Minimum dimension — below this, Claude Vision accuracy degrades per API docs. */
const FRAME_MIN_DIMENSION = 200;

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

/** Decoded audio data shared between prescan and full analysis to avoid double fetch+decode. */
interface DecodedAudio {
  mixedData: Float32Array;
  sampleRate: number;
  length: number;
}

async function decodeVideoAudio(videoUrl: string): Promise<DecodedAudio | null> {
  try {
    const response = await fetch(videoUrl);
    const arrayBuffer = await response.arrayBuffer();

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
      audioCtx.close();
      return null;
    }

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
    audioCtx.close();
    return { mixedData, sampleRate, length };
  } catch {
    return null;
  }
}

function extractAudioAnalysisFromBuffer(
  decoded: DecodedAudio,
  timestamps: number[]
): AudioAnalysis {
  const { mixedData, sampleRate, length } = decoded;
  const windowSamples = Math.floor(sampleRate * 0.25); // 0.25s window — tighter for transient precision
  const halfWindow = Math.floor(windowSamples / 2);

  const energyMap = new Map<number, number>();
  const spectralMap = new Map<number, { bass: number; mid: number; treble: number }>();

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

    spectralMap.set(ts, computeSpectralBands(mixedData, sampleRate, centerSample, halfWindow));
  }

  // Normalize energy to 0-1
  const maxEnergy = Math.max(...energyMap.values(), 0.001);
  for (const [ts, energy] of energyMap) {
    energyMap.set(ts, Math.round((energy / maxEnergy) * 100) / 100);
  }

  // Compute onset strength
  const onsetMap = new Map<number, number>();
  const sortedTs = [...timestamps].sort((a, b) => a - b);
  for (let i = 0; i < sortedTs.length; i++) {
    const ts = sortedTs[i];
    const current = energyMap.get(ts) ?? 0;
    const prev = i > 0 ? (energyMap.get(sortedTs[i - 1]) ?? 0) : 0;
    onsetMap.set(ts, Math.max(0, current - prev));
  }

  // Normalize onset to 0-1
  const maxOnset = Math.max(...onsetMap.values(), 0.001);
  for (const [ts, onset] of onsetMap) {
    onsetMap.set(ts, Math.round((onset / maxOnset) * 100) / 100);
  }

  return { energy: energyMap, onset: onsetMap, spectral: spectralMap };
}

function prescanAudioOnsetsFromBuffer(
  decoded: DecodedAudio,
  duration: number
): number[] {
  const { mixedData, sampleRate, length } = decoded;
  const windowSamples = Math.floor(sampleRate * 0.1); // 100ms window
  const halfWindow = Math.floor(windowSamples / 2);

  const energies: { ts: number; rms: number }[] = [];
  const totalSteps = Math.floor(duration / AUDIO_PRESCAN_INTERVAL_S);
  for (let i = 0; i <= totalSteps; i++) {
    const ts = i * AUDIO_PRESCAN_INTERVAL_S;
    const center = Math.floor(ts * sampleRate);
    const start = Math.max(0, center - halfWindow);
    const end = Math.min(length, center + halfWindow);
    if (end <= start) { energies.push({ ts, rms: 0 }); continue; }
    let sum = 0;
    for (let j = start; j < end; j++) sum += mixedData[j] * mixedData[j];
    energies.push({ ts, rms: Math.sqrt(sum / (end - start)) });
  }

  const maxRms = Math.max(...energies.map((e) => e.rms), 0.001);
  for (const e of energies) e.rms /= maxRms;

  const onsets: { ts: number; onset: number }[] = [];
  for (let i = 0; i < energies.length; i++) {
    const delta = i > 0 ? Math.max(0, energies[i].rms - energies[i - 1].rms) : 0;
    onsets.push({ ts: energies[i].ts, onset: delta });
  }
  const maxOnset = Math.max(...onsets.map((o) => o.onset), 0.001);
  for (const o of onsets) o.onset /= maxOnset;

  return onsets
    .filter((o) => o.onset >= ONSET_PEAK_THRESHOLD)
    .map((o) => o.ts);
}

/**
 * Compute average pixel difference between two ImageData arrays.
 * Returns 0-1 ratio (0 = identical, 1 = completely different).
 * Downsampled for speed — checks every 16th pixel.
 */
function frameDifference(a: ImageData, b: ImageData): number {
  const data1 = a.data;
  const data2 = b.data;
  const len = Math.min(data1.length, data2.length);
  let totalDiff = 0;
  let sampled = 0;
  // Sample every 16th pixel (every 64th byte in RGBA)
  for (let i = 0; i < len; i += 64) {
    totalDiff += Math.abs(data1[i] - data2[i]);       // R
    totalDiff += Math.abs(data1[i + 1] - data2[i + 1]); // G
    totalDiff += Math.abs(data1[i + 2] - data2[i + 2]); // B
    sampled += 3;
  }
  return sampled > 0 ? totalDiff / (sampled * 255) : 0;
}

type FrameResult = { timestamp: number; base64: string; audioEnergy?: number; audioOnset?: number; audioBass?: number; audioMid?: number; audioTreble?: number };

/**
 * Extract frames from a single video using adaptive sampling.
 *
 * Two-pass approach:
 * 1. Pre-scan audio at 100ms resolution → find onset peaks (beats, impacts, speech starts)
 * 2. Extract visual frames at 1fps + compute scene change scores between consecutive frames
 * 3. Identify interest points: audio onset peaks ∪ visual scene changes
 * 4. Go back and extract bonus frames at 4fps (250ms) around each interest point
 * 5. Merge, deduplicate, and run full audio analysis on all final timestamps
 *
 * Result: peak moments get 4x sampling density while calm sections stay at 1fps.
 */
export async function extractFrames(
  videoUrl: string,
  duration: number,
  onProgress?: (pct: number) => void
): Promise<FrameResult[]> {
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
  const scale = Math.min(1, FRAME_TARGET_HEIGHT / video.videoHeight);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d")!;

  // Verify frame dimensions are in Claude Vision's optimal range
  if (canvas.width < FRAME_MIN_DIMENSION || canvas.height < FRAME_MIN_DIMENSION) {
    console.warn(
      `Frame extraction: source resolution too low (${canvas.width}×${canvas.height}px). ` +
      `Claude Vision accuracy may degrade below ${FRAME_MIN_DIMENSION}px.`
    );
  }

  const interval = FRAME_SAMPLE_INTERVAL_SECONDS;
  const totalBaseFrames = Math.floor(duration / interval);

  // ── Decode audio once — shared between prescan and full analysis ──
  const decodedAudioPromise = decodeVideoAudio(videoUrl);

  // ── Pass 2: Extract base frames at 1fps + detect visual scene changes ──
  const baseFrames: FrameResult[] = [];
  const sceneChangeTimestamps: number[] = [];
  let prevImageData: ImageData | null = null;

  for (let i = 0; i <= totalBaseFrames; i++) {
    const time = i * interval;
    video.currentTime = time;
    await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Scene change detection: compare with previous frame
    const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (prevImageData) {
      const diff = frameDifference(prevImageData, currentImageData);
      if (diff >= SCENE_CHANGE_THRESHOLD) {
        // Scene change detected between (time - interval) and time
        // The actual change is somewhere in between — mark the midpoint
        sceneChangeTimestamps.push(time - interval / 2);
      }
    }
    prevImageData = currentImageData;

    const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    baseFrames.push({ timestamp: time, base64 });

    // Progress: base extraction = 0-60% of total
    onProgress?.(((i + 1) / (totalBaseFrames + 1)) * 60);
  }

  // ── Collect interest points ──
  const decodedAudio = await decodedAudioPromise;
  const onsetPeaks = decodedAudio ? prescanAudioOnsetsFromBuffer(decodedAudio, duration) : [];
  const interestPoints = new Set<number>();

  // Audio onset peaks
  for (const ts of onsetPeaks) {
    interestPoints.add(ts);
  }
  // Visual scene changes
  for (const ts of sceneChangeTimestamps) {
    interestPoints.add(ts);
  }

  // ── Pass 3: Extract bonus frames around interest points ──
  // Compute bonus timestamps: ±0.5s at 250ms intervals, skip any that overlap with base frames
  const baseTimestampSet = new Set(baseFrames.map((f) => Math.round(f.timestamp * 1000)));
  const bonusTimestamps: number[] = [];

  for (const peak of interestPoints) {
    const start = Math.max(0, peak - ADAPTIVE_RADIUS_S);
    const end = Math.min(duration, peak + ADAPTIVE_RADIUS_S);
    for (let t = start; t <= end; t += ADAPTIVE_DENSITY_S) {
      const rounded = Math.round(t * 1000);
      // Skip if we already have a frame within 100ms of this timestamp
      if (!baseTimestampSet.has(rounded)) {
        const tooClose = bonusTimestamps.some((bt) => Math.abs(bt - t) < 0.1);
        if (!tooClose) {
          bonusTimestamps.push(Math.round(t * 1000) / 1000);
        }
      }
    }
  }

  // Sort bonus timestamps chronologically for sequential seeking (faster)
  bonusTimestamps.sort((a, b) => a - b);

  const bonusFrames: FrameResult[] = [];
  for (let i = 0; i < bonusTimestamps.length; i++) {
    const time = bonusTimestamps[i];
    video.currentTime = time;
    await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    bonusFrames.push({ timestamp: time, base64 });

    // Progress: bonus extraction = 60-80% of total
    onProgress?.(60 + ((i + 1) / Math.max(1, bonusTimestamps.length)) * 20);
  }

  // ── Merge and deduplicate ──
  const allFrames = [...baseFrames, ...bonusFrames].sort((a, b) => a.timestamp - b.timestamp);

  if (bonusFrames.length > 0) {
    console.log(`Adaptive sampling: ${baseFrames.length} base + ${bonusFrames.length} bonus frames (${onsetPeaks.length} audio peaks, ${sceneChangeTimestamps.length} scene changes)`);
  }

  // ── Full audio analysis on all final timestamps (reuses decoded buffer) ──
  const allTimestamps = allFrames.map((f) => f.timestamp);
  const emptyAudio: AudioAnalysis = { energy: new Map(), onset: new Map(), spectral: new Map() };
  const audio = decodedAudio ? extractAudioAnalysisFromBuffer(decodedAudio, allTimestamps) : emptyAudio;

  // Progress: audio analysis = 80-100%
  onProgress?.(90);

  if (audio.energy.size > 0) {
    for (const frame of allFrames) {
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

  onProgress?.(100);
  return allFrames;
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
      const scale = Math.min(1, FRAME_TARGET_HEIGHT / img.height);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      if (canvas.width < FRAME_MIN_DIMENSION || canvas.height < FRAME_MIN_DIMENSION) {
        console.warn(
          `Photo frame: source resolution too low (${canvas.width}×${canvas.height}px). ` +
          `Claude Vision accuracy may degrade below ${FRAME_MIN_DIMENSION}px.`
        );
      }
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}
