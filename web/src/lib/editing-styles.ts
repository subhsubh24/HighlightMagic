/**
 * Per-genre editing style profiles.
 *
 * Each profile defines how the final highlight tape should feel —
 * transition types, pacing, camera effects — matching the conventions
 * that professional editors use for each content genre.
 */

import type { EditingTheme } from "./types";
import type { TransitionType } from "./transitions";

export interface EditingStyle {
  theme: EditingTheme;
  label: string;
  description: string;
  /** Seconds per transition (lower = faster cuts). */
  transitionDuration: number;
  /** Weighted pool of transitions to sample from. */
  transitions: TransitionType[];
  /** Ken Burns zoom intensity for photos (0 = none, 0.08 = dramatic). */
  kenBurnsIntensity: number;
  /** Scale factor for the entry "punch" when each clip starts (1.0 = none). */
  entryPunchScale: number;
  /** Duration of the entry punch in seconds. */
  entryPunchDuration: number;
}

// ── Style definitions ──

export const EDITING_STYLES: Record<EditingTheme, EditingStyle> = {
  sports: {
    theme: "sports",
    label: "Sports",
    description: "Fast cuts, flash transitions, zoom punches — NFL highlight reel energy",
    transitionDuration: 0.3,
    transitions: ["flash", "zoom_punch", "whip", "hard_flash", "glitch"],
    kenBurnsIntensity: 0.03,
    entryPunchScale: 1.04,
    entryPunchDuration: 0.12,
  },
  cooking: {
    theme: "cooking",
    label: "Cooking",
    description: "Smooth dissolves, warm tones, gentle reveals — Tasty / Bon Appétit style",
    transitionDuration: 0.8,
    transitions: ["crossfade", "light_leak", "soft_zoom", "crossfade", "light_leak"],
    kenBurnsIntensity: 0.06,
    entryPunchScale: 1.0,
    entryPunchDuration: 0,
  },
  travel: {
    theme: "travel",
    label: "Travel",
    description: "Cinematic dissolves, golden hour glows, dramatic reveals — Sam Kolder style",
    transitionDuration: 1.0,
    transitions: ["crossfade", "light_leak", "dip_to_black", "crossfade", "light_leak"],
    kenBurnsIntensity: 0.08,
    entryPunchScale: 1.01,
    entryPunchDuration: 0.2,
  },
  gaming: {
    theme: "gaming",
    label: "Gaming",
    description: "Glitch effects, RGB split, neon flashes — esports montage energy",
    transitionDuration: 0.25,
    transitions: ["glitch", "color_flash", "strobe", "zoom_punch", "glitch"],
    kenBurnsIntensity: 0.02,
    entryPunchScale: 1.05,
    entryPunchDuration: 0.1,
  },
  party: {
    theme: "party",
    label: "Party",
    description: "Colored strobes, beat-sync cuts, high energy — nightlife / festival edit",
    transitionDuration: 0.25,
    transitions: ["color_flash", "strobe", "flash", "color_flash", "glitch"],
    kenBurnsIntensity: 0.03,
    entryPunchScale: 1.03,
    entryPunchDuration: 0.1,
  },
  fitness: {
    theme: "fitness",
    label: "Fitness",
    description: "Impact zooms, power flashes, motivational cuts — workout highlight reel",
    transitionDuration: 0.3,
    transitions: ["zoom_punch", "flash", "hard_flash", "whip", "zoom_punch"],
    kenBurnsIntensity: 0.03,
    entryPunchScale: 1.04,
    entryPunchDuration: 0.12,
  },
  pets: {
    theme: "pets",
    label: "Pets",
    description: "Soft crossfades, warm glows, gentle pacing — cute animal compilation",
    transitionDuration: 0.6,
    transitions: ["crossfade", "soft_zoom", "light_leak", "crossfade", "soft_zoom"],
    kenBurnsIntensity: 0.05,
    entryPunchScale: 1.01,
    entryPunchDuration: 0.15,
  },
  vlog: {
    theme: "vlog",
    label: "Vlog",
    description: "Clean jump cuts, minimal transitions — modern YouTube vlog style",
    transitionDuration: 0.15,
    transitions: ["hard_cut", "dip_to_black", "hard_cut", "crossfade", "hard_cut"],
    kenBurnsIntensity: 0.03,
    entryPunchScale: 1.0,
    entryPunchDuration: 0,
  },
  cinematic: {
    theme: "cinematic",
    label: "Cinematic",
    description: "Film-like dissolves, subtle light leaks — default professional look",
    transitionDuration: 0.7,
    transitions: ["crossfade", "dip_to_black", "light_leak", "crossfade", "dip_to_black"],
    kenBurnsIntensity: 0.06,
    entryPunchScale: 1.01,
    entryPunchDuration: 0.2,
  },
};

// ── Helpers ──

/** Map a template ID (from the existing template system) to an editing theme. */
export function templateToTheme(templateId: string): EditingTheme {
  const map: Record<string, EditingTheme> = {
    adventure: "travel",
    foodie: "cooking",
    fitness: "fitness",
    "pet-vibes": "pets",
    travel: "travel",
    "daily-life": "vlog",
    gaming: "gaming",
    party: "party",
  };
  return map[templateId] ?? "cinematic";
}

/** Get the transition sequence for a theme, cycling through its pool. */
export function getThemeTransitions(theme: EditingTheme, count: number): TransitionType[] {
  const pool = EDITING_STYLES[theme].transitions;
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/** Get the editing style for a theme. */
export function getEditingStyle(theme: EditingTheme): EditingStyle {
  return EDITING_STYLES[theme];
}

/** All themes, for display in UI. */
export const ALL_THEMES: EditingTheme[] = [
  "sports",
  "cooking",
  "travel",
  "gaming",
  "party",
  "fitness",
  "pets",
  "vlog",
  "cinematic",
];
