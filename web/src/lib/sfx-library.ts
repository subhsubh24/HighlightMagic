/**
 * Pre-generated SFX library — common transition sounds served from CDN.
 *
 * The AI planner frequently requests the same ~20 transition SFX (whoosh,
 * impact, riser, etc.). Instead of generating them from scratch via ElevenLabs
 * every time (~$0.05-0.10 each), we fuzzy-match against a pre-generated library.
 *
 * This saves ~80% of SFX API costs and returns results instantly.
 *
 * To populate the library: run SFX generation once per entry, upload the
 * resulting MP3s to your CDN, and add URLs below. Until CDN URLs are
 * configured, this module falls back to in-memory caching of generated results.
 */

interface SfxEntry {
  /** Keywords that trigger this entry (matched against the prompt) */
  keywords: string[];
  /** CDN URL or base64 data URI of the pre-generated audio */
  url: string | null;
  /** Duration in seconds */
  duration: number;
}

/**
 * Pre-generated SFX entries.
 *
 * Set `url` to a CDN URL (e.g., "https://cdn.highlightmagic.com/sfx/whoosh-fast.mp3")
 * once you've uploaded the pre-generated audio files. Leave as null to skip
 * (the library will still help via the runtime cache).
 */
const LIBRARY: SfxEntry[] = [
  // ── Transitions ──
  { keywords: ["whoosh", "fast whoosh", "transition whoosh", "swipe"], url: null, duration: 1.0 },
  { keywords: ["slow whoosh", "soft whoosh", "gentle whoosh"], url: null, duration: 1.5 },
  { keywords: ["impact", "hit", "punch", "slam"], url: null, duration: 0.8 },
  { keywords: ["bass drop", "bass hit", "sub drop"], url: null, duration: 1.2 },
  { keywords: ["riser", "tension riser", "build up", "swell"], url: null, duration: 2.0 },
  { keywords: ["reverse riser", "downsweep", "descending"], url: null, duration: 1.5 },
  { keywords: ["glitch", "digital glitch", "electronic glitch"], url: null, duration: 0.5 },
  { keywords: ["flash", "camera flash", "bright flash"], url: null, duration: 0.4 },

  // ── Atmosphere ──
  { keywords: ["crowd cheer", "crowd roar", "audience cheer", "stadium"], url: null, duration: 3.0 },
  { keywords: ["crowd gasp", "audience gasp", "surprise crowd"], url: null, duration: 1.5 },
  { keywords: ["applause", "clapping"], url: null, duration: 3.0 },
  { keywords: ["record scratch", "vinyl scratch"], url: null, duration: 1.0 },
  { keywords: ["cinematic boom", "epic boom", "dramatic boom"], url: null, duration: 2.0 },
  { keywords: ["sparkle", "shimmer", "magic sparkle", "twinkle"], url: null, duration: 1.0 },
  { keywords: ["camera shutter", "shutter click", "photo snap"], url: null, duration: 0.3 },

  // ── Notifications / accents ──
  { keywords: ["ding", "notification", "bell", "chime"], url: null, duration: 0.5 },
  { keywords: ["pop", "bubble pop", "cork pop"], url: null, duration: 0.3 },
  { keywords: ["click", "button click", "tap"], url: null, duration: 0.2 },
  { keywords: ["success", "achievement", "level up"], url: null, duration: 1.0 },
  { keywords: ["countdown", "beep", "timer beep"], url: null, duration: 0.5 },

  // ── Sports ──
  { keywords: ["whistle", "referee whistle", "sports whistle"], url: null, duration: 1.0 },
  { keywords: ["buzzer", "game buzzer", "horn"], url: null, duration: 1.5 },
];

/**
 * Runtime cache for generated SFX — populated after first generation.
 * Maps normalized keywords to base64 data URIs.
 */
const runtimeCache = new Map<string, { url: string; duration: number }>();

/**
 * Try to match a prompt against the SFX library.
 * Uses keyword overlap scoring — higher overlap = better match.
 *
 * Returns the pre-generated audio URL + duration, or null on no match.
 */
export function lookupSfxLibrary(prompt: string): { url: string; duration: number } | null {
  const promptLower = prompt.toLowerCase();

  // Check runtime cache first (exact prompt match)
  const cached = runtimeCache.get(promptLower);
  if (cached) return cached;

  // Fuzzy match against library
  let bestEntry: SfxEntry | null = null;
  let bestScore = 0;

  for (const entry of LIBRARY) {
    if (!entry.url) continue; // No CDN URL configured yet

    let score = 0;
    for (const kw of entry.keywords) {
      if (promptLower.includes(kw)) {
        // Longer keyword matches are worth more
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  // Require at least 4 characters of keyword match to avoid false positives
  if (bestEntry && bestScore >= 4) {
    return { url: bestEntry.url!, duration: bestEntry.duration };
  }

  return null;
}

/**
 * Store a generated SFX result in the runtime cache for future lookups.
 * Called after a successful ElevenLabs API generation.
 */
export function cacheSfxResult(prompt: string, url: string, duration: number): void {
  runtimeCache.set(prompt.toLowerCase(), { url, duration });
}
