import { describe, it, expect } from "vitest";
import {
  goertzelEnergy,
  computeSpectralBands,
  extractAudioAnalysisFromBuffer,
  prescanAudioOnsetsFromBuffer,
  frameDifference,
  ONSET_PEAK_THRESHOLD,
  SCENE_CHANGE_THRESHOLD,
  type DecodedAudio,
} from "./frame-extractor";

const makeFrame = (values: number[]): ImageData =>
  ({ data: new Uint8ClampedArray(values) } as unknown as ImageData);

describe("frameDifference", () => {
  it("returns 0 for identical frames", () => {
    const data = Array(192).fill(100);
    expect(frameDifference(makeFrame(data), makeFrame(data))).toBe(0);
  });

  it("returns 1.0 for maximally different frames (all 0 vs all 255)", () => {
    const a = makeFrame(Array(192).fill(0));
    const b = makeFrame(Array(192).fill(255));
    expect(frameDifference(a, b)).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for empty frames", () => {
    expect(frameDifference(makeFrame([]), makeFrame([]))).toBe(0);
  });

  it("uses the minimum length when frames differ in size", () => {
    const a = makeFrame(Array(192).fill(0));
    const b = makeFrame(Array(256).fill(255));
    // Only the first 192 bytes are compared — max difference
    expect(frameDifference(a, b)).toBeCloseTo(1.0, 5);
  });

  it("returns a value in [0,1] for partial difference", () => {
    // First 64 bytes differ, rest are the same
    const a = makeFrame([...Array(64).fill(0), ...Array(128).fill(128)]);
    const b = makeFrame([...Array(64).fill(255), ...Array(128).fill(128)]);
    const diff = frameDifference(a, b);
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThanOrEqual(1);
    expect(diff).toBeGreaterThan(0);
  });
});

describe("goertzelEnergy", () => {
  it("returns 0 for empty samples", () => {
    expect(goertzelEnergy(new Float32Array(0), 44100, 440)).toBe(0);
  });

  it("returns 0 when targetFreq is 0 (k = 0)", () => {
    expect(goertzelEnergy(new Float32Array(10), 44100, 0)).toBe(0);
  });

  it("returns 0 when k exceeds Nyquist (k >= N/2)", () => {
    // N=10, sampleRate=100, freq=60 → k = round(60*10/100) = 6 >= 5
    expect(goertzelEnergy(new Float32Array(10), 100, 60)).toBe(0);
  });

  it("returns 0 for all-zero samples", () => {
    expect(goertzelEnergy(new Float32Array(1024), 44100, 440)).toBe(0);
  });

  it("returns positive value for a sine wave at the target frequency", () => {
    const N = 1024;
    const sampleRate = 44100;
    const samples = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    }
    expect(goertzelEnergy(samples, sampleRate, 440)).toBeGreaterThan(0);
  });

  it("returns higher energy at resonant frequency than off-frequency", () => {
    const N = 1024;
    const sampleRate = 44100;
    const samples = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    }
    const onFreq = goertzelEnergy(samples, sampleRate, 440);
    const offFreq = goertzelEnergy(samples, sampleRate, 1000);
    expect(onFreq).toBeGreaterThan(offFreq);
  });
});

describe("computeSpectralBands", () => {
  it("returns zeros when effective window is fewer than 64 samples", () => {
    const data = new Float32Array(10);
    // centerSample=5, halfWindow=5 → start=0, end=10 → end-start=10 < 64
    expect(computeSpectralBands(data, 44100, 5, 5)).toEqual({ bass: 0, mid: 0, treble: 0 });
  });

  it("returns zeros when window is clamped to less than 64 samples", () => {
    const data = new Float32Array(200);
    // centerSample=0, halfWindow=20 → start=0, end=20 → 20 < 64
    expect(computeSpectralBands(data, 44100, 0, 20)).toEqual({ bass: 0, mid: 0, treble: 0 });
  });

  it("returns zeros for all-silence audio (zero total energy)", () => {
    const data = new Float32Array(1024);
    expect(computeSpectralBands(data, 44100, 512, 512)).toEqual({ bass: 0, mid: 0, treble: 0 });
  });

  it("returns band values in [0, 1] for real audio", () => {
    const N = 44100;
    const data = new Float32Array(N);
    for (let i = 0; i < N; i++) data[i] = (i % 7) / 7 - 0.5;
    const result = computeSpectralBands(data, 44100, N / 2, 512);
    expect(result.bass).toBeGreaterThanOrEqual(0);
    expect(result.bass).toBeLessThanOrEqual(1);
    expect(result.mid).toBeGreaterThanOrEqual(0);
    expect(result.mid).toBeLessThanOrEqual(1);
    expect(result.treble).toBeGreaterThanOrEqual(0);
    expect(result.treble).toBeLessThanOrEqual(1);
  });

  it("returns band ratios that sum to approximately 1.0 for non-silent audio", () => {
    const N = 44100;
    const data = new Float32Array(N);
    for (let i = 0; i < N; i++) data[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.5;
    const result = computeSpectralBands(data, 44100, N / 2, 1024);
    // Sum may not be exactly 1.0 due to rounding, but should be close
    if (result.bass + result.mid + result.treble > 0) {
      expect(result.bass + result.mid + result.treble).toBeCloseTo(1.0, 1);
    }
  });
});

describe("extractAudioAnalysisFromBuffer", () => {
  const sampleRate = 44100;

  it("returns empty maps for empty timestamps", () => {
    const decoded: DecodedAudio = { mixedData: new Float32Array(44100), sampleRate, length: 44100 };
    const result = extractAudioAnalysisFromBuffer(decoded, []);
    expect(result.energy.size).toBe(0);
    expect(result.onset.size).toBe(0);
    expect(result.spectral.size).toBe(0);
  });

  it("normalizes a single nonzero timestamp to energy 1.0", () => {
    const mixedData = new Float32Array(44100).fill(0.5);
    const decoded: DecodedAudio = { mixedData, sampleRate, length: 44100 };
    const result = extractAudioAnalysisFromBuffer(decoded, [0.5]);
    expect(result.energy.get(0.5)).toBe(1.0);
  });

  it("returns zero energy for all-silence audio", () => {
    const decoded: DecodedAudio = { mixedData: new Float32Array(44100), sampleRate, length: 44100 };
    const result = extractAudioAnalysisFromBuffer(decoded, [0.5]);
    expect(result.energy.get(0.5)).toBe(0);
  });

  it("onset for a single nonzero timestamp equals 1.0 (vs implicit silence predecessor)", () => {
    const mixedData = new Float32Array(44100).fill(0.5);
    const decoded: DecodedAudio = { mixedData, sampleRate, length: 44100 };
    const result = extractAudioAnalysisFromBuffer(decoded, [0.5]);
    // First timestamp compares against implicit 0 — with nonzero energy this is the max onset
    expect(result.onset.get(0.5)).toBe(1.0);
  });

  it("detects positive onset when energy increases between timestamps", () => {
    const mixedData = new Float32Array(88200); // 2s at 44100 Hz
    mixedData.fill(0.5, 44100, 88200); // silence → loud at 1.0s
    const decoded: DecodedAudio = { mixedData, sampleRate, length: 88200 };
    const result = extractAudioAnalysisFromBuffer(decoded, [0.25, 1.5]);
    expect(result.onset.get(0.25)).toBe(0);
    expect(result.onset.get(1.5)).toBeGreaterThan(0);
  });

  it("populates spectral map for all provided timestamps", () => {
    const mixedData = new Float32Array(44100).fill(0.5);
    const decoded: DecodedAudio = { mixedData, sampleRate, length: 44100 };
    const result = extractAudioAnalysisFromBuffer(decoded, [0.25, 0.5, 0.75]);
    expect(result.spectral.size).toBe(3);
    for (const ts of [0.25, 0.5, 0.75]) {
      const bands = result.spectral.get(ts);
      expect(bands).toBeDefined();
      expect(typeof bands?.bass).toBe("number");
      expect(typeof bands?.mid).toBe("number");
      expect(typeof bands?.treble).toBe("number");
    }
  });

  it("all energy values are in [0,1] after normalization", () => {
    const mixedData = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) mixedData[i] = Math.random() * 2 - 1;
    const decoded: DecodedAudio = { mixedData, sampleRate, length: 44100 };
    const result = extractAudioAnalysisFromBuffer(decoded, [0.1, 0.3, 0.5, 0.7, 0.9]);
    for (const v of result.energy.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("prescanAudioOnsetsFromBuffer", () => {
  it("returns empty array for all-silence audio", () => {
    const decoded: DecodedAudio = { mixedData: new Float32Array(44100), sampleRate: 44100, length: 44100 };
    expect(prescanAudioOnsetsFromBuffer(decoded, 1.0)).toEqual([]);
  });

  it("returns empty array for zero duration", () => {
    const decoded: DecodedAudio = { mixedData: new Float32Array(100), sampleRate: 44100, length: 100 };
    expect(prescanAudioOnsetsFromBuffer(decoded, 0)).toEqual([]);
  });

  it("detects an onset when energy sharply increases", () => {
    const sampleRate = 1000;
    const length = 2000;
    const mixedData = new Float32Array(length);
    mixedData.fill(1.0, 1000, 1500); // silence then loud at t=1.0s
    const decoded: DecodedAudio = { mixedData, sampleRate, length };
    const onsets = prescanAudioOnsetsFromBuffer(decoded, 2.0);
    expect(onsets.length).toBeGreaterThan(0);
    expect(onsets.some((t) => t >= 0.9 && t <= 1.2)).toBe(true);
  });

  it("applies ONSET_PEAK_THRESHOLD filtering (constant signal has no onsets)", () => {
    // Constant nonzero signal: all deltas are 0, so none pass the threshold
    const decoded: DecodedAudio = {
      mixedData: new Float32Array(44100).fill(0.5),
      sampleRate: 44100,
      length: 44100,
    };
    expect(prescanAudioOnsetsFromBuffer(decoded, 1.0)).toEqual([]);
  });
});

describe("constants", () => {
  it("ONSET_PEAK_THRESHOLD is 0.45", () => {
    expect(ONSET_PEAK_THRESHOLD).toBe(0.45);
  });

  it("SCENE_CHANGE_THRESHOLD is 0.12", () => {
    expect(SCENE_CHANGE_THRESHOLD).toBe(0.12);
  });
});
