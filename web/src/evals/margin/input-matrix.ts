/**
 * Margin cost-per-outcome eval — INPUT MATRIX for the `highlightmagic-tape` workflow.
 *
 * This is a REAL, representative input matrix that the eval runner drives through the
 * REAL metered path (scorer → planner → validator) so Margin accumulates a genuine
 * STATISTICAL distribution of cost-per-outcome for HighlightMagic — not a single happy
 * path.
 *
 * The matrix is the cross-product of:
 *   - 5 CONTENT TYPES:   sports, cooking, gaming, travel, music
 *   - 10 STRUCTURAL VARIANTS: each a distinct score CURVE + length + hook strength +
 *     difficulty (+ single/multi source), including deliberately WEAK and HARD cases.
 *
 * = 50 cases. Every case carries a realistic frame-score profile (the same shape the real
 * vision scorer emits) with content-appropriate labels, so the planner receives genuinely
 * varied input and the validator genuinely passes the good ones and flags the weak ones.
 *
 * HONESTY: the score profiles are synthetic-but-representative (the same technique as
 * detect.eval.ts, which feeds the real planner synthetic golden scores). The variety —
 * strong vs weak hooks, tight vs monotonous pacing, front- vs back-loaded energy — is what
 * makes the OUTCOME distribution real: a monotonous or back-loaded tape genuinely draws more
 * validator issues than a well-structured one. Documented gaps: the scorer runs on a small
 * fixed real-pixel fixture set (variety lives in the planner/validator inputs), and the
 * validator runs text-only by default (no per-case real frames) — see the runner header.
 */

export type ContentType = "sports" | "cooking" | "gaming" | "travel" | "music";
export type HookStrength = "strong" | "moderate" | "weak";
export type Difficulty = "easy" | "medium" | "hard";
export type LengthClass = "short" | "medium" | "long";
export type BeatKind = "hook" | "hero" | "reaction" | "filler" | "closer";

export interface EvalFrameScore {
  sourceFileId: string;
  sourceType: "video" | "photo";
  timestamp: number;
  score: number;
  label: string;
  narrativeRole?: string;
}

export interface EvalSource {
  id: string;
  name: string;
  type: "video" | "photo";
}

export interface EvalCase {
  id: string;
  contentType: ContentType;
  variant: string;
  description: string;
  templateHint: string;
  hookStrength: HookStrength;
  difficulty: Difficulty;
  lengthClass: LengthClass;
  durationSec: number;
  sources: EvalSource[];
  scores: EvalFrameScore[];
}

// ── Per-content-type vocabulary: realistic frame labels by narrative role ──
interface Vocab {
  templateHint: string;
  fileBase: string;
  hook: string[];
  hero: string[];
  reaction: string[];
  filler: string[];
  closer: string[];
}

const VOCAB: Record<ContentType, Vocab> = {
  sports: {
    templateHint: "sports",
    fileBase: "game",
    hook: ["tip-off explosion", "fast-break dunk", "opening buzzer sprint"],
    hero: ["three-pointer swish", "defensive block", "no-look assist", "steal and score"],
    reaction: ["bench erupts", "crowd on its feet", "player flex"],
    filler: ["dribbling upcourt", "walking to line", "timeout huddle", "inbound pass"],
    closer: ["buzzer-beater winner", "final whistle celebration"],
  },
  cooking: {
    templateHint: "cooking",
    fileBase: "recipe",
    hook: ["dramatic pan flambe", "sizzling sear close-up", "knife-skills flurry"],
    hero: ["the perfect flip", "sauce emulsifies", "cheese pull", "golden crust reveal"],
    reaction: ["chef tastes and nods", "satisfied smile", "steam rising"],
    filler: ["mise en place", "measuring flour", "stirring pot", "wiping the board"],
    closer: ["final plating drizzle", "first bite reaction"],
  },
  gaming: {
    templateHint: "gaming",
    fileBase: "montage",
    hook: ["insane no-scope", "first-blood ace start", "clutch 1v3 open"],
    hero: ["headshot streak", "clutch defuse", "multi-kill spree", "perfect combo"],
    reaction: ["streamer freakout", "chat explodes", "teammate scream"],
    filler: ["lobby wait", "walking to site", "reloading in cover", "buy phase"],
    closer: ["victory royale screen", "MVP reveal"],
  },
  travel: {
    templateHint: "travel",
    fileBase: "trip",
    hook: ["drone sweep over cliffs", "sunrise over the ridge", "first vista reveal"],
    hero: ["street-market color", "waterfall plunge", "old-town rooftops", "local dance"],
    reaction: ["traveler gasps", "shared laugh with locals", "awe at the view"],
    filler: ["train window blur", "packing the bag", "walking a lane", "map check"],
    closer: ["sunset drone pull-back", "goodbye wave at the gate"],
  },
  music: {
    templateHint: "music",
    fileBase: "set",
    hook: ["the beat drops", "intro riff hits", "lights blast on"],
    hero: ["guitar solo peak", "crowd singalong", "key change surge", "drummer fill"],
    reaction: ["crowd hands up", "fan tears of joy", "band shares a grin"],
    filler: ["soundcheck tuning", "crowd filing in", "stage fog builds", "amp adjust"],
    closer: ["encore fireworks", "final chord and blackout"],
  },
};

// ── A structural variant: a curve of beats (fractional position + role + score) ──
interface Beat {
  frac: number; // 0..1 position along the timeline
  score: number; // 0..1 salience the scorer would assign
  kind: BeatKind;
}

interface Variant {
  key: string;
  lengthClass: LengthClass;
  durationSec: number;
  hookStrength: HookStrength;
  difficulty: Difficulty;
  sourceCount: number;
  beats: Beat[];
}

const B = (frac: number, score: number, kind: BeatKind): Beat => ({ frac, score, kind });

// 10 genuinely-different structures. Weak/hard cases (V3, V4, V5, V8) are intentional: a
// good grader must FAIL these more than the clean ones — never always-pass.
const VARIANTS: Variant[] = [
  {
    key: "strong-hook-medium", lengthClass: "medium", durationSec: 50,
    hookStrength: "strong", difficulty: "easy", sourceCount: 1,
    beats: [B(0.05, 0.92, "hook"), B(0.12, 0.55, "filler"), B(0.22, 0.8, "hero"),
      B(0.33, 0.45, "filler"), B(0.45, 0.85, "hero"), B(0.55, 0.5, "reaction"),
      B(0.66, 0.78, "hero"), B(0.75, 0.4, "filler"), B(0.85, 0.7, "reaction"),
      B(0.96, 0.9, "closer")],
  },
  {
    key: "strong-hook-long", lengthClass: "long", durationSec: 110,
    hookStrength: "strong", difficulty: "medium", sourceCount: 2,
    beats: [B(0.03, 0.9, "hook"), B(0.1, 0.4, "filler"), B(0.18, 0.75, "hero"),
      B(0.26, 0.42, "filler"), B(0.34, 0.5, "filler"), B(0.42, 0.82, "hero"),
      B(0.5, 0.38, "filler"), B(0.58, 0.6, "reaction"), B(0.66, 0.8, "hero"),
      B(0.74, 0.44, "filler"), B(0.82, 0.72, "hero"), B(0.9, 0.5, "reaction"),
      B(0.97, 0.88, "closer")],
  },
  {
    key: "weak-hook-flat", lengthClass: "medium", durationSec: 45,
    hookStrength: "weak", difficulty: "hard", sourceCount: 1,
    beats: [B(0.05, 0.42, "filler"), B(0.16, 0.38, "filler"), B(0.28, 0.47, "filler"),
      B(0.4, 0.4, "filler"), B(0.52, 0.5, "reaction"), B(0.63, 0.43, "filler"),
      B(0.74, 0.46, "filler"), B(0.85, 0.41, "filler"), B(0.96, 0.5, "closer")],
  },
  {
    key: "monotonous", lengthClass: "medium", durationSec: 55,
    hookStrength: "moderate", difficulty: "hard", sourceCount: 1,
    beats: [B(0.05, 0.61, "hero"), B(0.16, 0.6, "hero"), B(0.27, 0.62, "hero"),
      B(0.38, 0.6, "hero"), B(0.49, 0.61, "hero"), B(0.6, 0.6, "hero"),
      B(0.71, 0.62, "hero"), B(0.82, 0.6, "hero"), B(0.93, 0.61, "hero")],
  },
  {
    key: "back-loaded", lengthClass: "medium", durationSec: 60,
    hookStrength: "weak", difficulty: "hard", sourceCount: 1,
    beats: [B(0.05, 0.35, "filler"), B(0.16, 0.4, "filler"), B(0.28, 0.45, "filler"),
      B(0.4, 0.5, "reaction"), B(0.52, 0.55, "hero"), B(0.63, 0.62, "hero"),
      B(0.74, 0.75, "hero"), B(0.85, 0.85, "hero"), B(0.96, 0.95, "closer")],
  },
  {
    key: "sparse-short", lengthClass: "short", durationSec: 22,
    hookStrength: "moderate", difficulty: "medium", sourceCount: 1,
    beats: [B(0.08, 0.7, "hook"), B(0.3, 0.55, "filler"), B(0.5, 0.82, "hero"),
      B(0.72, 0.5, "reaction"), B(0.94, 0.75, "closer")],
  },
  {
    key: "bimodal", lengthClass: "medium", durationSec: 65,
    hookStrength: "strong", difficulty: "easy", sourceCount: 2,
    beats: [B(0.04, 0.9, "hook"), B(0.14, 0.5, "filler"), B(0.24, 0.6, "reaction"),
      B(0.34, 0.4, "filler"), B(0.46, 0.55, "filler"), B(0.56, 0.88, "hero"),
      B(0.66, 0.6, "reaction"), B(0.78, 0.45, "filler"), B(0.88, 0.7, "hero"),
      B(0.97, 0.86, "closer")],
  },
  {
    key: "noisy-lowstructure", lengthClass: "medium", durationSec: 58,
    hookStrength: "weak", difficulty: "hard", sourceCount: 1,
    beats: [B(0.05, 0.55, "filler"), B(0.15, 0.3, "filler"), B(0.25, 0.62, "hero"),
      B(0.35, 0.35, "filler"), B(0.45, 0.58, "reaction"), B(0.55, 0.32, "filler"),
      B(0.65, 0.6, "hero"), B(0.75, 0.38, "filler"), B(0.85, 0.52, "reaction"),
      B(0.95, 0.45, "closer")],
  },
  {
    key: "build-up-climax", lengthClass: "medium", durationSec: 70,
    hookStrength: "moderate", difficulty: "easy", sourceCount: 1,
    beats: [B(0.05, 0.45, "filler"), B(0.16, 0.55, "reaction"), B(0.27, 0.62, "hero"),
      B(0.38, 0.68, "hero"), B(0.49, 0.74, "hero"), B(0.6, 0.82, "hero"),
      B(0.71, 0.9, "hero"), B(0.82, 0.6, "reaction"), B(0.93, 0.8, "closer")],
  },
  {
    key: "front-loaded-decline", lengthClass: "long", durationSec: 95,
    hookStrength: "strong", difficulty: "medium", sourceCount: 1,
    beats: [B(0.04, 0.93, "hook"), B(0.14, 0.8, "hero"), B(0.24, 0.72, "hero"),
      B(0.34, 0.6, "reaction"), B(0.44, 0.55, "filler"), B(0.54, 0.48, "filler"),
      B(0.64, 0.44, "filler"), B(0.74, 0.4, "filler"), B(0.84, 0.38, "filler"),
      B(0.95, 0.5, "closer")],
  },
];

const CONTENT_TYPES: ContentType[] = ["sports", "cooking", "gaming", "travel", "music"];

/** Deterministic label picker so a case's labels are stable across runs. */
function pickLabel(pool: string[], seed: number): string {
  return pool[seed % pool.length];
}

function buildCase(contentType: ContentType, variant: Variant): EvalCase {
  const vocab = VOCAB[contentType];
  const sources: EvalSource[] = Array.from({ length: variant.sourceCount }, (_, s) => ({
    id: `${contentType}-${variant.key}-src${s + 1}`,
    name: `${vocab.fileBase}-${contentType}-${s + 1}.mp4`,
    type: "video" as const,
  }));

  const scores: EvalFrameScore[] = variant.beats.map((beat, i) => {
    const source = sources[i % sources.length];
    const pool = vocab[beat.kind];
    const role =
      beat.kind === "hook" ? "HOOK"
        : beat.kind === "hero" ? "HERO"
          : beat.kind === "reaction" ? "REACTION"
            : beat.kind === "closer" ? "CLOSER"
              : "RHYTHM";
    return {
      sourceFileId: source.id,
      sourceType: source.type,
      timestamp: Math.round(beat.frac * variant.durationSec),
      score: Math.round(beat.score * 100) / 100,
      label: pickLabel(pool, i + contentType.length),
      narrativeRole: role,
    };
  });

  return {
    id: `${contentType}__${variant.key}`,
    contentType,
    variant: variant.key,
    description:
      `${contentType} / ${variant.key}: ${variant.lengthClass} (~${variant.durationSec}s), ` +
      `${variant.hookStrength} hook, ${variant.difficulty} difficulty, ` +
      `${variant.sourceCount} source(s), ${variant.beats.length} scored frames.`,
    templateHint: vocab.templateHint,
    hookStrength: variant.hookStrength,
    difficulty: variant.difficulty,
    lengthClass: variant.lengthClass,
    durationSec: variant.durationSec,
    sources,
    scores,
  };
}

/** The full 50-case input matrix (5 content types × 10 structural variants). */
export const INPUT_MATRIX: EvalCase[] = CONTENT_TYPES.flatMap((ct) =>
  VARIANTS.map((v) => buildCase(ct, v)),
);

/** Selection config for a run: bound the matrix by content type / difficulty / limit. */
export interface SelectConfig {
  limit?: number;
  contentType?: ContentType;
  difficulty?: Difficulty;
}

/** Deterministically select a slice of the matrix for a cost-capped run. */
export function selectCases(cfg: SelectConfig = {}): EvalCase[] {
  let cases = INPUT_MATRIX;
  if (cfg.contentType) cases = cases.filter((c) => c.contentType === cfg.contentType);
  if (cfg.difficulty) cases = cases.filter((c) => c.difficulty === cfg.difficulty);
  if (cfg.limit != null && cfg.limit >= 0) cases = cases.slice(0, cfg.limit);
  return cases;
}
