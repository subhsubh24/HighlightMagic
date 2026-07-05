// ── Constants ported from iOS Constants.swift ──

export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes
export const MAX_UPLOAD_SIZE_MB = 500;
export const MAX_FILES = 100; // max clips/photos per project
export const MAX_TOTAL_DURATION_SECONDS = 1800; // 30 min total across all clips
export const PHOTO_DISPLAY_DURATION = 3.2; // seconds a photo shows in the final edit — slightly off-round for human feel
export const FREE_EXPORT_LIMIT = 5;

/**
 * StoreKit product IDs for the Pro subscription (must match iOS SubscriptionProduct).
 * Used server-side to confirm a verified App Store transaction actually grants Pro.
 */
export const PRO_PRODUCT_IDS = ["pro.monthly", "pro.yearly"] as const;

/**
 * Consumable "export credit pack" StoreKit products (ROADMAP F/business-case lever b).
 *
 * A free user who hits the monthly {@link FREE_EXPORT_LIMIT} can buy a one-off credit pack
 * instead of committing to a subscription — each pack grants N extra exports that never expire.
 * This directly couples revenue to per-export COGS and captures users who won't subscribe.
 *
 * The map is the SERVER-SIDE source of truth for how many credits each product grants; a
 * verified consumable transaction for one of these product IDs adds that many credits. The
 * matching StoreKit consumable products + their prices are configured by the owner in App Store
 * Connect at submission (see REMAINING_STEPS.md) — pricing lives there, credit COUNT lives here.
 */
export const CREDIT_PACK_PRODUCTS: Readonly<Record<string, number>> = {
  "credits.small": 10,
  "credits.medium": 30,
  "credits.large": 100,
} as const;

export const MAX_CLIP_DURATION = 60;
export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;
export const EXPORT_FRAME_RATE = 30;
export const TRANSITION_DURATION = 0.28; // seconds — fallback only, AI overrides per-clip
export const WATERMARK_TEXT = "Highlight Magic";
export const WATERMARK_OPACITY = 0.38;

export const FRAME_SAMPLE_INTERVAL_SECONDS = 1; // Extract 1 frame per second — miss nothing
export const MAX_FRAMES_PER_BATCH = 35; // 35 frames/batch — fewer waves at higher concurrency, ~same per-call time
export const MAX_BASE_FRAMES_PER_VIDEO = 120; // Cap base frames per video — 1fps up to 2 min, then adaptively slower; prevents runaway API cost on long videos

// Upper bound on the frames/scores arrays the planner routes (/api/plan, /api/ios-plan) accept.
// A legitimate project has at most MAX_FILES clips × MAX_BASE_FRAMES_PER_VIDEO base frames; the scored
// frames are serialized into the Sonnet planner prompt, so an oversized array would inflate paid token
// cost unbounded within a single ceiling-counted call. Bound both arrays server-side BEFORE the paid
// call (Track H2), the same way photoAnimations is already capped.
export const MAX_PLANNER_FRAMES = MAX_FILES * MAX_BASE_FRAMES_PER_VIDEO; // 100 × 120 = 12,000

// ── Viral features ──
export const LOOP_CROSSFADE_DURATION = 0.47; // seconds of crossfade for seamless loop — slightly off-round
export const EXPORT_BITRATE = 12_000_000; // 12 Mbps (optimized for platform compression)
export const BEAT_SYNC_TOLERANCE_MS = 47; // max ms off-beat before snapping

export const IOS_APP_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL ??
  "https://apps.apple.com/app/highlight-magic/id0000000000";
