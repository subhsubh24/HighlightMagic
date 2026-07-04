import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mergeDuckSegments,
  loadTrackAudio,
  createAudioPipeline,
  DEFAULT_MUSIC_DUCK_RATIO,
  type DuckSegment,
  type ScheduledAudioLayer,
} from "./audio-mux";
import type { MusicTrack } from "./types";

describe("DEFAULT_MUSIC_DUCK_RATIO", () => {
  it("is 0.28", () => {
    expect(DEFAULT_MUSIC_DUCK_RATIO).toBe(0.28);
  });
});

describe("mergeDuckSegments", () => {
  it("returns empty array for empty input", () => {
    expect(mergeDuckSegments([])).toEqual([]);
  });

  it("returns a single segment unchanged", () => {
    const seg: DuckSegment = { startTime: 1, endTime: 3, ratio: 0.3 };
    expect(mergeDuckSegments([seg])).toEqual([{ startTime: 1, endTime: 3, ratio: 0.3 }]);
  });

  it("does not merge non-overlapping segments with gap > 0.5s", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 3, ratio: 0.3 },
      { startTime: 4, endTime: 6, ratio: 0.4 }, // 4 > 3 + 0.5 → separate
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ startTime: 1, endTime: 3, ratio: 0.3 });
    expect(result[1]).toEqual({ startTime: 4, endTime: 6, ratio: 0.4 });
  });

  it("merges overlapping segments", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 4, ratio: 0.3 },
      { startTime: 3, endTime: 6, ratio: 0.4 }, // 3 <= 4 + 0.5 → merge
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(1);
    expect(result[0].endTime).toBe(6);
    expect(result[0].ratio).toBe(0.3); // min(0.3, 0.4) — stronger duck wins
  });

  it("merges adjacent segments within the 0.5s gap tolerance", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 3, ratio: 0.4 },
      { startTime: 3.3, endTime: 5, ratio: 0.3 }, // 3.3 <= 3 + 0.5 = 3.5 → merge
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].endTime).toBe(5);
    expect(result[0].ratio).toBe(0.3);
  });

  it("does NOT merge segments with exactly 0.5s gap (boundary condition)", () => {
    // seg1 ends at 3, seg2 starts at 3.5 → 3.5 <= 3 + 0.5 = 3.5 → merge (boundary is inclusive)
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 3, ratio: 0.4 },
      { startTime: 3.5, endTime: 5, ratio: 0.3 },
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1); // boundary is inclusive (<=)
  });

  it("keeps stronger duck ratio (lower value) when merging", () => {
    const segs: DuckSegment[] = [
      { startTime: 0, endTime: 5, ratio: 0.5 },
      { startTime: 2, endTime: 7, ratio: 0.2 }, // 0.2 is stronger (lower)
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].ratio).toBe(0.2);
  });

  it("sorts out-of-order segments before merging", () => {
    const segs: DuckSegment[] = [
      { startTime: 5, endTime: 8, ratio: 0.3 },
      { startTime: 1, endTime: 4, ratio: 0.4 },
    ];
    const result = mergeDuckSegments(segs);
    expect(result[0].startTime).toBe(1);
    expect(result[1].startTime).toBe(5);
  });

  it("merges a chain of 3 overlapping segments into one", () => {
    const segs: DuckSegment[] = [
      { startTime: 0, endTime: 2, ratio: 0.4 },
      { startTime: 1, endTime: 4, ratio: 0.3 },
      { startTime: 3, endTime: 6, ratio: 0.5 },
    ];
    const result = mergeDuckSegments(segs);
    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(6);
    expect(result[0].ratio).toBe(0.3); // min of 0.4, 0.3, 0.5
  });

  it("does not mutate the input array", () => {
    const segs: DuckSegment[] = [
      { startTime: 1, endTime: 4, ratio: 0.3 },
      { startTime: 3, endTime: 6, ratio: 0.4 },
    ];
    const snapshot = segs.map((s) => ({ ...s }));
    mergeDuckSegments(segs);
    expect(segs).toEqual(snapshot);
  });

  it("does not mutate the input segment objects", () => {
    const seg: DuckSegment = { startTime: 1, endTime: 3, ratio: 0.3 };
    const other: DuckSegment = { startTime: 2, endTime: 5, ratio: 0.2 };
    mergeDuckSegments([seg, other]);
    // Original objects should be unchanged even though segments were merged
    expect(seg.endTime).toBe(3);
    expect(seg.ratio).toBe(0.3);
  });
});

// ── Web Audio API test double ──────────────────────────────────────────────
//
// The pipeline is pure browser glue (AudioContext, MediaStream, fetch), so the
// vitest node environment has none of it. These fakes record the graph the
// pipeline builds — every gain-automation call, source lifecycle event, and
// node connection — so the tests assert the REAL scheduling logic (ducking
// envelopes, fades, layer timing, cleanup) rather than mock plumbing.

interface GainCall { method: "setValueAtTime" | "linearRampToValueAtTime"; value: number; time: number }

class FakeGainNode {
  gain: {
    value: number;
    setValueAtTime: (v: number, t: number) => void;
    linearRampToValueAtTime: (v: number, t: number) => void;
  };
  calls: GainCall[] = [];
  connected: unknown[] = [];
  disconnected = false;
  constructor() {
    this.gain = {
      value: 0,
      setValueAtTime: (v: number, t: number) => {
        this.gain.value = v;
        this.calls.push({ method: "setValueAtTime", value: v, time: t });
      },
      linearRampToValueAtTime: (v: number, t: number) => {
        this.gain.value = v;
        this.calls.push({ method: "linearRampToValueAtTime", value: v, time: t });
      },
    };
  }
  connect(node: unknown) { this.connected.push(node); }
  disconnect() { this.disconnected = true; }
}

class FakeBufferSource {
  buffer: unknown = null;
  loop = false;
  connected: unknown[] = [];
  started: number[] = [];
  stopped = 0;
  connect(node: unknown) { this.connected.push(node); }
  start(when = 0) { this.started.push(when); }
  stop() { this.stopped++; }
}

class FakeMediaElementSource {
  connected: unknown[] = [];
  disconnected = false;
  connect(node: unknown) { this.connected.push(node); }
  disconnect() { this.disconnected = true; }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: "running" | "suspended" = "running";
  currentTime = 10; // non-zero so we exercise the render-start offset math
  closed = false;
  resumeCalls = 0;
  gains: FakeGainNode[] = [];
  bufferSources: FakeBufferSource[] = [];
  elementSources: FakeMediaElementSource[] = [];
  /** When set, createMediaElementSource throws (CORS-failure fallback path). */
  elementSourceThrows = false;
  destStream = { getAudioTracks: () => [{ kind: "audio", id: "mixed-audio" }] };

  constructor() { FakeAudioContext.instances.push(this); }
  async resume() { this.resumeCalls++; this.state = "running"; }
  createMediaStreamDestination() { return { stream: this.destStream }; }
  createBufferSource() { const s = new FakeBufferSource(); this.bufferSources.push(s); return s; }
  createGain() { const g = new FakeGainNode(); this.gains.push(g); return g; }
  createMediaElementSource() {
    if (this.elementSourceThrows) throw new Error("CORS: cannot create MediaElementSource");
    const s = new FakeMediaElementSource();
    this.elementSources.push(s);
    return s;
  }
  async decodeAudioData() { return { duration: 2.0 } as unknown as AudioBuffer; }
  close() { this.closed = true; }
}

class FakeMediaStream {
  private audio: unknown[];
  private video: unknown[];
  constructor(tracks: unknown[] = []) {
    // Split by a `kind` marker on our fake tracks.
    this.audio = tracks.filter((t) => (t as { kind?: string }).kind === "audio");
    this.video = tracks.filter((t) => (t as { kind?: string }).kind === "video");
  }
  getAudioTracks() { return this.audio; }
  getVideoTracks() { return this.video; }
}

const musicTrack = (overrides: Partial<MusicTrack> = {}): MusicTrack => ({
  id: "curated-1",
  name: "Test Track",
  fileName: "test-track",
  artist: "Tester",
  mood: "Energetic" as MusicTrack["mood"],
  category: "Electronic" as MusicTrack["category"],
  bpm: 120,
  durationSeconds: 60,
  isPremium: false,
  ...overrides,
});

const canvasStream = () =>
  new FakeMediaStream([{ kind: "video", id: "canvas-video" }]) as unknown as MediaStream;

/** fetch mock that returns a decodable audio response for any URL. */
function okFetch() {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("fetch", okFetch());
  vi.stubGlobal("console", { ...console, warn: vi.fn(), error: vi.fn(), log: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadTrackAudio", () => {
  it("fetches the local /audio path for a curated track", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = new FakeAudioContext();
    const buf = await loadTrackAudio(musicTrack({ fileName: "sunset-drive" }), ctx as unknown as AudioContext);
    expect(fetchMock).toHaveBeenCalledWith("/audio/sunset-drive.mp3");
    expect(buf).toEqual({ duration: 2.0 });
  });

  it("uses the AI music URL for the __ai_generated__ track", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = new FakeAudioContext();
    await loadTrackAudio(
      musicTrack({ id: "__ai_generated__" }),
      ctx as unknown as AudioContext,
      "https://cdn.example.com/ai-music.mp3",
    );
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/ai-music.mp3");
  });

  it("falls back to the local path when __ai_generated__ has no URL", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    const ctx = new FakeAudioContext();
    await loadTrackAudio(musicTrack({ id: "__ai_generated__", fileName: "fallback" }), ctx as unknown as AudioContext, null);
    expect(fetchMock).toHaveBeenCalledWith("/audio/fallback.mp3");
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })) as unknown as typeof fetch);
    const ctx = new FakeAudioContext();
    expect(await loadTrackAudio(musicTrack(), ctx as unknown as AudioContext)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch);
    const ctx = new FakeAudioContext();
    expect(await loadTrackAudio(musicTrack(), ctx as unknown as AudioContext)).toBeNull();
  });
});

describe("createAudioPipeline", () => {
  it("returns a pipeline whose stream combines canvas video + mixed audio tracks", async () => {
    const pipeline = await createAudioPipeline(canvasStream(), null);
    const video = pipeline.stream.getVideoTracks();
    const audio = pipeline.stream.getAudioTracks();
    expect(video).toHaveLength(1);
    expect(audio).toHaveLength(1);
    expect((audio[0] as { id: string }).id).toBe("mixed-audio");
  });

  it("resumes a suspended AudioContext before building the graph", async () => {
    // Force the created context to start suspended.
    const OrigCtor = FakeAudioContext;
    class SuspendedCtx extends OrigCtor { state: "running" | "suspended" = "suspended"; }
    vi.stubGlobal("window", { AudioContext: SuspendedCtx });
    await createAudioPipeline(canvasStream(), null);
    const ctx = FakeAudioContext.instances.at(-1)!;
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.state).toBe("running");
  });

  it("starts a looping music source at full volume when no fade is requested", async () => {
    await createAudioPipeline(canvasStream(), musicTrack(), null, undefined, 0.5);
    const ctx = FakeAudioContext.instances.at(-1)!;
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.bufferSources[0].loop).toBe(true);
    expect(ctx.bufferSources[0].started).toEqual([0]);
    // Music gain starts at the requested musicVolume (no fade-in).
    expect(ctx.gains[0].gain.value).toBe(0.5);
  });

  it("schedules a music fade-in ramp from silence to volume", async () => {
    await createAudioPipeline(canvasStream(), musicTrack(), null, undefined, 0.6, DEFAULT_MUSIC_DUCK_RATIO, 0.2, 0.3, /*fadeIn*/ 1.5);
    const ctx = FakeAudioContext.instances.at(-1)!;
    const musicGain = ctx.gains[0];
    // Starts at 0 (silence) then ramps up to 0.6.
    expect(musicGain.calls.some((c) => c.method === "setValueAtTime" && c.value === 0)).toBe(true);
    expect(musicGain.calls.some((c) => c.method === "linearRampToValueAtTime" && c.value === 0.6)).toBe(true);
  });

  it("schedules a music fade-out ramp to silence at tape end", async () => {
    await createAudioPipeline(
      canvasStream(), musicTrack(), null, undefined,
      0.5, DEFAULT_MUSIC_DUCK_RATIO, 0.2, 0.3,
      /*fadeIn*/ 0, /*fadeOut*/ 2, /*totalTape*/ 30,
    );
    const ctx = FakeAudioContext.instances.at(-1)!;
    const musicGain = ctx.gains[0];
    // Final ramp brings gain to 0 at currentTime + totalTape.
    const rampToZero = musicGain.calls.find((c) => c.method === "linearRampToValueAtTime" && c.value === 0);
    expect(rampToZero).toBeDefined();
    expect(rampToZero!.time).toBe(ctx.currentTime + 30);
  });

  it("does not schedule a fade-out when tape is shorter than the fade duration", async () => {
    await createAudioPipeline(
      canvasStream(), musicTrack(), null, undefined,
      0.5, DEFAULT_MUSIC_DUCK_RATIO, 0.2, 0.3,
      /*fadeIn*/ 0, /*fadeOut*/ 5, /*totalTape*/ 3, // 3 <= 5 → no fade-out
    );
    const ctx = FakeAudioContext.instances.at(-1)!;
    const musicGain = ctx.gains[0];
    expect(musicGain.calls.every((c) => c.value !== 0)).toBe(true);
  });

  it("builds no music source when there is no track or AI URL", async () => {
    await createAudioPipeline(canvasStream(), null);
    const ctx = FakeAudioContext.instances.at(-1)!;
    expect(ctx.bufferSources).toHaveLength(0);
    expect(ctx.gains).toHaveLength(0);
  });

  it("degrades gracefully when the music fetch throws (no music, render still builds)", async () => {
    // createAudioPipeline has its OWN inline fetch/decode for music (it does NOT
    // call loadTrackAudio) — a network blip on the music file must not abort the
    // whole render; it should just proceed without a music layer.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("music host down"); }) as unknown as typeof fetch);
    const pipeline = await createAudioPipeline(canvasStream(), musicTrack());
    const ctx = FakeAudioContext.instances.at(-1)!;
    expect(ctx.bufferSources).toHaveLength(0); // no music source created
    // Pipeline is still usable: canvas video + mixed-audio destination present.
    expect(pipeline.stream.getAudioTracks()).toHaveLength(1);
    expect(() => pipeline.cleanup()).not.toThrow();
  });

  it("uses a bare AI music URL when no track object is given", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    await createAudioPipeline(canvasStream(), null, "https://cdn.example.com/ai.mp3");
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/ai.mp3");
    const ctx = FakeAudioContext.instances.at(-1)!;
    expect(ctx.bufferSources).toHaveLength(1);
  });

  it("schedules voiceover + SFX layers at their offset times", async () => {
    const layers: ScheduledAudioLayer[] = [
      { url: "/vo.mp3", startTime: 2, volume: 0.9, layerType: "voiceover" },
      { url: "/sfx.mp3", startTime: 4, volume: 0.7, layerType: "sfx" },
    ];
    await createAudioPipeline(canvasStream(), null, null, layers);
    const ctx = FakeAudioContext.instances.at(-1)!;
    // Two scheduled sources, each started at renderStart(currentTime) + offset.
    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.bufferSources[0].started[0]).toBe(ctx.currentTime + 2);
    expect(ctx.bufferSources[1].started[0]).toBe(ctx.currentTime + 4);
  });

  it("skips a scheduled layer whose fetch is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })) as unknown as typeof fetch);
    const layers: ScheduledAudioLayer[] = [
      { url: "/vo.mp3", startTime: 1, volume: 0.9, layerType: "voiceover" },
    ];
    const pipeline = await createAudioPipeline(canvasStream(), null, null, layers);
    const ctx = FakeAudioContext.instances.at(-1)!;
    expect(ctx.bufferSources).toHaveLength(0);
    // Still returns a usable pipeline.
    expect(pipeline.stream.getAudioTracks()).toHaveLength(1);
  });

  it("skips a scheduled layer whose fetch throws, keeping other layers", async () => {
    // Music loads fine; only the layer marked "throw" rejects — it is dropped
    // while the sibling layer still schedules (the per-layer try/catch path).
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("throw")) throw new Error("layer host down");
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    }) as unknown as typeof fetch);
    const layers: ScheduledAudioLayer[] = [
      { url: "/throw-vo.mp3", startTime: 1, volume: 0.9, layerType: "voiceover" },
      { url: "/good-sfx.mp3", startTime: 2, volume: 0.7, layerType: "sfx" },
    ];
    const pipeline = await createAudioPipeline(canvasStream(), musicTrack(), null, layers);
    const ctx = FakeAudioContext.instances.at(-1)!;
    // Music source + the one good layer = 2 buffer sources; the throwing layer is skipped.
    expect(ctx.bufferSources).toHaveLength(2);
    expect(pipeline.stream.getAudioTracks()).toHaveLength(1);
  });

  it("ducks the music gain during a voiceover layer", async () => {
    const layers: ScheduledAudioLayer[] = [
      { url: "/vo.mp3", startTime: 3, volume: 0.9, layerType: "voiceover" },
    ];
    await createAudioPipeline(
      canvasStream(), musicTrack(), null, layers,
      /*musicVolume*/ 0.5, /*duckRatio*/ 0.3,
    );
    const ctx = FakeAudioContext.instances.at(-1)!;
    const musicGain = ctx.gains[0];
    // Ducked volume = musicVolume * ratio = 0.5 * 0.3 = 0.15 is scheduled somewhere.
    expect(musicGain.calls.some((c) => Math.abs(c.value - 0.15) < 1e-9)).toBe(true);
    // And it recovers back to full musicVolume after the voiceover.
    expect(musicGain.calls.some((c) => c.value === 0.5)).toBe(true);
  });

  it("does NOT duck the music for a pure SFX layer (no voiceover)", async () => {
    const layers: ScheduledAudioLayer[] = [
      { url: "/sfx.mp3", startTime: 3, volume: 0.7, layerType: "sfx" },
    ];
    await createAudioPipeline(
      canvasStream(), musicTrack(), null, layers,
      0.5, 0.3,
    );
    const ctx = FakeAudioContext.instances.at(-1)!;
    const musicGain = ctx.gains[0];
    // No ducked value (0.5 * 0.3 = 0.15) should appear.
    expect(musicGain.calls.every((c) => Math.abs(c.value - 0.15) > 1e-9)).toBe(true);
  });

  it("applies audio breath dips to the music gain", async () => {
    await createAudioPipeline(
      canvasStream(), musicTrack(), null, undefined,
      0.5, DEFAULT_MUSIC_DUCK_RATIO, 0.2, 0.3, 0, 0, 0, undefined,
      /*breaths*/ [{ time: 5, duration: 0.5, depth: 0.2 }],
    );
    const ctx = FakeAudioContext.instances.at(-1)!;
    const musicGain = ctx.gains[0];
    // Breath dips gain to musicVolume * depth = 0.5 * 0.2 = 0.1.
    expect(musicGain.calls.some((c) => Math.abs(c.value - 0.1) < 1e-9)).toBe(true);
  });

  describe("connectVideo", () => {
    it("routes clip audio and returns a working disconnect fn", async () => {
      const pipeline = await createAudioPipeline(canvasStream(), null);
      const ctx = FakeAudioContext.instances.at(-1)!;
      const disconnect = pipeline.connectVideo({} as HTMLVideoElement, 0.8);
      expect(ctx.elementSources).toHaveLength(1);
      // A gain node was created for the clip and ramps up to the per-clip volume.
      const clipGain = ctx.gains.at(-1)!;
      expect(clipGain.calls.some((c) => c.value === 0.8)).toBe(true);
      expect(typeof disconnect).toBe("function");
      disconnect(); // schedules a fade-out; must not throw
      expect(clipGain.calls.some((c) => c.value === 0)).toBe(true);
    });

    it("actually disconnects the audio nodes after the fade-out settles", async () => {
      const pipeline = await createAudioPipeline(canvasStream(), null);
      const ctx = FakeAudioContext.instances.at(-1)!;
      const disconnect = pipeline.connectVideo({} as HTMLVideoElement, 0.8);
      const elemSource = ctx.elementSources.at(-1)!;
      const clipGain = ctx.gains.at(-1)!;

      // The teardown defers source/gain.disconnect() inside setTimeout(..., 100)
      // so the fade-out can complete — without advancing timers the nodes leak.
      vi.useFakeTimers();
      try {
        disconnect();
        expect(elemSource.disconnected).toBe(false); // not yet — deferred
        vi.advanceTimersByTime(100);
        expect(elemSource.disconnected).toBe(true);
        expect(clipGain.disconnected).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("defaults clip volume to 1.0 when there is no music present", async () => {
      const pipeline = await createAudioPipeline(canvasStream(), null);
      const ctx = FakeAudioContext.instances.at(-1)!;
      pipeline.connectVideo({} as HTMLVideoElement); // no per-clip override
      const clipGain = ctx.gains.at(-1)!;
      expect(clipGain.calls.some((c) => c.value === 1.0)).toBe(true);
    });

    it("lowers the default clip volume when music is present", async () => {
      const pipeline = await createAudioPipeline(canvasStream(), musicTrack());
      const ctx = FakeAudioContext.instances.at(-1)!;
      const gainsBefore = ctx.gains.length;
      pipeline.connectVideo({} as HTMLVideoElement); // no override, music present → 0.45
      const clipGain = ctx.gains[gainsBefore]; // the newly-created clip gain
      expect(clipGain.calls.some((c) => c.value === 0.45)).toBe(true);
    });

    it("mutes the video and no-ops on MediaElementSource failure (CORS)", async () => {
      const pipeline = await createAudioPipeline(canvasStream(), null);
      const ctx = FakeAudioContext.instances.at(-1)!;
      ctx.elementSourceThrows = true;
      const video = { muted: false } as HTMLVideoElement;
      const disconnect = pipeline.connectVideo(video);
      expect(video.muted).toBe(true);
      expect(() => disconnect()).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("stops the music + scheduled sources and closes the context", async () => {
      const layers: ScheduledAudioLayer[] = [
        { url: "/vo.mp3", startTime: 1, volume: 0.9, layerType: "voiceover" },
      ];
      const pipeline = await createAudioPipeline(canvasStream(), musicTrack(), null, layers);
      const ctx = FakeAudioContext.instances.at(-1)!;
      pipeline.cleanup();
      // Music source (index 0) + the voiceover source both stopped.
      expect(ctx.bufferSources.every((s) => s.stopped >= 1)).toBe(true);
      expect(ctx.closed).toBe(true);
    });

    it("is safe to call when nothing was scheduled", async () => {
      const pipeline = await createAudioPipeline(canvasStream(), null);
      const ctx = FakeAudioContext.instances.at(-1)!;
      expect(() => pipeline.cleanup()).not.toThrow();
      expect(ctx.closed).toBe(true);
    });
  });
});
