import { describe, it, expect } from "vitest";
import {
  MUSIC_TRACKS,
  FREE_TRACKS,
  PREMIUM_TRACKS,
  getTracksForMood,
  getAvailableTracks,
  getSuggestedTrackForTemplate,
} from "./music";
import { TEMPLATES } from "./templates";

describe("MUSIC_TRACKS", () => {
  it("has 14 tracks", () => {
    expect(MUSIC_TRACKS).toHaveLength(14);
  });

  it("each track has required fields", () => {
    for (const t of MUSIC_TRACKS) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.fileName).toBeTruthy();
      expect(t.bpm).toBeGreaterThan(0);
      expect(t.durationSeconds).toBeGreaterThan(0);
      expect(typeof t.isPremium).toBe("boolean");
    }
  });

  it("has unique IDs", () => {
    const ids = MUSIC_TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("FREE_TRACKS / PREMIUM_TRACKS", () => {
  it("free + premium = total", () => {
    expect(FREE_TRACKS.length + PREMIUM_TRACKS.length).toBe(MUSIC_TRACKS.length);
  });

  it("has 5 free tracks", () => {
    expect(FREE_TRACKS).toHaveLength(5);
  });

  it("all free tracks have isPremium = false", () => {
    for (const t of FREE_TRACKS) {
      expect(t.isPremium).toBe(false);
    }
  });

  it("all premium tracks have isPremium = true", () => {
    for (const t of PREMIUM_TRACKS) {
      expect(t.isPremium).toBe(true);
    }
  });
});

describe("getTracksForMood", () => {
  it("returns only tracks matching the mood", () => {
    const chill = getTracksForMood("Chill");
    expect(chill.length).toBeGreaterThan(0);
    for (const t of chill) {
      expect(t.mood).toBe("Chill");
    }
  });

  it("returns empty array for unknown mood", () => {
    expect(getTracksForMood("NonExistent" as never)).toHaveLength(0);
  });
});

describe("getAvailableTracks", () => {
  it("returns all tracks for pro users", () => {
    expect(getAvailableTracks(true)).toHaveLength(MUSIC_TRACKS.length);
  });

  it("returns only free tracks for non-pro users", () => {
    expect(getAvailableTracks(false)).toHaveLength(FREE_TRACKS.length);
  });
});

describe("getSuggestedTrackForTemplate", () => {
  it("returns a track for templates with matching moods", () => {
    const adventure = TEMPLATES.find((t) => t.id === "adventure")!;
    const suggested = getSuggestedTrackForTemplate(adventure);
    expect(suggested).toBeDefined();
    expect(suggested!.mood).toBe(adventure.suggestedMusicMood);
  });
});
