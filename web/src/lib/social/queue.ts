/**
 * E6c — Social publishing queue (Growth Execution Engine).
 *
 * A server-side queue + provider abstraction for owned-channel posting (X / Instagram /
 * TikTok / Reddit). The Growth Agent writes drafts INTO the queue; the deployed backend
 * sends them via the owner's connected API keys/OAuth. The agent never holds secrets.
 *
 * DRY-RUN / NO-OP by default: with no channel credentials present, `publish()` does NOT post
 * — it marks the item `skipped` (dry-run) and resolves successfully. This makes the whole
 * path safe to run before any channel is connected. Durable storage uses Vercel KV when
 * configured; otherwise an in-memory list (local dev + tests).
 *
 * Storage (Redis): waitlist-style list — `social:queue` (List of JSON QueueItem).
 */

export type SocialChannel = "x" | "instagram" | "tiktok" | "reddit";

export type QueueStatus = "queued" | "sent" | "skipped" | "failed";

export interface SocialPost {
  channel: SocialChannel;
  /** Post body (<= platform limit; caller is responsible for length). */
  text: string;
  /** Optional media URL (already hosted; the queue does not upload media). */
  mediaUrl?: string;
}

export interface QueueItem extends SocialPost {
  id: string;
  status: QueueStatus;
  /** Reason a post was skipped/failed (e.g. "no-credentials"). */
  note?: string;
}

const ALL_CHANNELS: SocialChannel[] = ["x", "instagram", "tiktok", "reddit"];

function isQueueStoreConfigured(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Which channels have live credentials. Each maps to an owner-supplied env var (server-side
 * only). Until set, the channel stays dry-run. (OAuth-based channels resolve here once their
 * token env var is populated by the owner.)
 */
export function connectedChannels(): SocialChannel[] {
  const connected: SocialChannel[] = [];
  if (process.env.X_API_BEARER_TOKEN) connected.push("x");
  if (process.env.INSTAGRAM_ACCESS_TOKEN) connected.push("instagram");
  if (process.env.TIKTOK_ACCESS_TOKEN) connected.push("tiktok");
  if (process.env.REDDIT_ACCESS_TOKEN) connected.push("reddit");
  return connected;
}

export function isChannelConnected(channel: SocialChannel): boolean {
  return connectedChannels().includes(channel);
}

// ── In-memory fallback ──────────────────────────────────────────────────────────────────
let memQueue: QueueItem[] = [];

/** Enqueue a draft post. Returns the created queue item. */
export async function enqueue(post: SocialPost): Promise<QueueItem> {
  if (!ALL_CHANNELS.includes(post.channel)) {
    throw new Error("invalid channel");
  }
  const item: QueueItem = {
    id: globalThis.crypto.randomUUID(),
    channel: post.channel,
    text: post.text,
    mediaUrl: post.mediaUrl,
    status: "queued",
  };
  if (isQueueStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    await kv.rpush("social:queue", JSON.stringify(item));
  } else {
    memQueue.push(item);
  }
  return item;
}

/** List all queued items (FIFO). */
export async function listQueue(): Promise<QueueItem[]> {
  if (isQueueStoreConfigured()) {
    const { kv } = await import("@vercel/kv");
    const raw = await kv.lrange<string | QueueItem>("social:queue", 0, -1);
    return raw.map((r) => (typeof r === "string" ? (JSON.parse(r) as QueueItem) : r));
  }
  return [...memQueue];
}

/**
 * Publish one post. DRY-RUN SAFE: if the target channel has no credentials, the post is
 * NOT sent — it returns `skipped` with note "no-credentials". Real provider sends are added
 * per-channel here once the owner connects them (this scaffold intentionally ships no live
 * poster so it cannot post before a channel is deliberately wired).
 */
export async function publish(item: SocialPost): Promise<QueueItem> {
  const base: QueueItem = {
    id: globalThis.crypto.randomUUID(),
    channel: item.channel,
    text: item.text,
    mediaUrl: item.mediaUrl,
    status: "queued",
  };
  if (!isChannelConnected(item.channel)) {
    console.log(`[social:dry-run] channel=${item.channel} skipped (no-credentials)`);
    return { ...base, status: "skipped", note: "no-credentials" };
  }
  // A channel is connected but no live poster is wired yet — fail safe, never silently drop.
  console.warn(`[social] channel=${item.channel} connected but no poster wired`);
  return { ...base, status: "failed", note: "poster-not-implemented" };
}

/** Test-only: clear the in-memory queue. */
export function _resetQueueMemory(): void {
  memQueue = [];
}
