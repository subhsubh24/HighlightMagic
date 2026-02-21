import type { MusicTrack, TrackMood, HighlightTemplate } from "./types";

// ── 14 tracks ported from iOS MusicLibrary ──

export const MUSIC_TRACKS: MusicTrack[] = [
  // Free tier
  { id: "summer-vibes", name: "Summer Vibes", fileName: "summer_vibes", artist: "Royalty Free", mood: "Upbeat", category: "Lifestyle", bpm: 120, durationSeconds: 60, isPremium: false },
  { id: "golden-hour", name: "Golden Hour", fileName: "golden_hour", artist: "Royalty Free", mood: "Chill", category: "Lifestyle", bpm: 90, durationSeconds: 60, isPremium: false },
  { id: "peak-moment", name: "Peak Moment", fileName: "peak_moment", artist: "Royalty Free", mood: "Epic", category: "Adventure", bpm: 140, durationSeconds: 60, isPremium: false },
  { id: "happy-days", name: "Happy Days", fileName: "happy_days", artist: "Royalty Free", mood: "Fun", category: "General", bpm: 110, durationSeconds: 60, isPremium: false },
  { id: "power-up", name: "Power Up", fileName: "power_up", artist: "Royalty Free", mood: "Energetic", category: "Sports", bpm: 150, durationSeconds: 60, isPremium: false },
  // Premium tier
  { id: "neon-nights", name: "Neon Nights", fileName: "neon_nights", artist: "Royalty Free", mood: "Energetic", category: "Party", bpm: 128, durationSeconds: 60, isPremium: true },
  { id: "ocean-breeze", name: "Ocean Breeze", fileName: "ocean_breeze", artist: "Royalty Free", mood: "Chill", category: "Lifestyle", bpm: 85, durationSeconds: 60, isPremium: true },
  { id: "victory-lap", name: "Victory Lap", fileName: "victory_lap", artist: "Royalty Free", mood: "Epic", category: "Sports", bpm: 145, durationSeconds: 60, isPremium: true },
  { id: "silly-walk", name: "Silly Walk", fileName: "silly_walk", artist: "Royalty Free", mood: "Funny", category: "General", bpm: 100, durationSeconds: 60, isPremium: true },
  { id: "campfire-stories", name: "Campfire Stories", fileName: "campfire_stories", artist: "Royalty Free", mood: "Chill", category: "Adventure", bpm: 80, durationSeconds: 60, isPremium: true },
  { id: "dance-floor", name: "Dance Floor", fileName: "dance_floor", artist: "Royalty Free", mood: "Energetic", category: "Party", bpm: 130, durationSeconds: 60, isPremium: true },
  { id: "cinematic-rise", name: "Cinematic Rise", fileName: "cinematic_rise", artist: "Royalty Free", mood: "Dramatic", category: "Cinematic", bpm: 100, durationSeconds: 60, isPremium: true },
  { id: "morning-run", name: "Morning Run", fileName: "morning_run", artist: "Royalty Free", mood: "Upbeat", category: "Sports", bpm: 135, durationSeconds: 60, isPremium: true },
  { id: "cozy-afternoon", name: "Cozy Afternoon", fileName: "cozy_afternoon", artist: "Royalty Free", mood: "Chill", category: "Lifestyle", bpm: 75, durationSeconds: 60, isPremium: true },
];

export const FREE_TRACKS = MUSIC_TRACKS.filter((t) => !t.isPremium);
export const PREMIUM_TRACKS = MUSIC_TRACKS.filter((t) => t.isPremium);

export function getTracksForMood(mood: TrackMood): MusicTrack[] {
  return MUSIC_TRACKS.filter((t) => t.mood === mood);
}

export function getAvailableTracks(isPro: boolean): MusicTrack[] {
  return isPro ? MUSIC_TRACKS : FREE_TRACKS;
}

export function getSuggestedTrack(prompt: string): MusicTrack | undefined {
  const lower = prompt.toLowerCase();
  const moodMap: [string[], TrackMood][] = [
    [["epic", "summit", "peak", "mountain"], "Epic"],
    [["chill", "relax", "sunset"], "Chill"],
    [["fun", "funny", "party"], "Fun"],
    [["workout", "gym", "run"], "Energetic"],
    [["cinematic", "dramatic", "movie"], "Dramatic"],
  ];
  for (const [keywords, mood] of moodMap) {
    if (keywords.some((k) => lower.includes(k))) {
      return MUSIC_TRACKS.find((t) => t.mood === mood);
    }
  }
  return MUSIC_TRACKS.find((t) => t.mood === "Upbeat");
}

export function getSuggestedTrackForTemplate(template: HighlightTemplate): MusicTrack | undefined {
  return MUSIC_TRACKS.find((t) => t.mood === template.suggestedMusicMood);
}
