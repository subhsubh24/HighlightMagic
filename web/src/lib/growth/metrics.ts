/**
 * E6d — Growth metrics / analytics pull (Growth Execution Engine).
 *
 * Server-computed funnel aggregates the daily Growth Agent pulls each run (via
 * /api/growth/stats, protected by GROWTH_AGENT_SECRET) to populate GROWTH_STATUS with REAL
 * numbers instead of null. Returns ONLY aggregate counts/rates — never raw emails or PII.
 *
 * Honest by construction: every number comes from a connected datastore (Vercel KV) or is
 * reported as 0 in dry-run mode. Nothing is invented. `awaiting_connect` reflects whether
 * any channel is actually wired, so the dashboard can tell prepared-content from live demand.
 */

import { getWaitlistCounts, isWaitlistStoreConfigured } from "./waitlist-store";
import { emailProvider, isEmailConfigured } from "../email";

export interface GrowthMetrics {
  /** ISO date the snapshot was computed (caller stamps; omitted here to stay deterministic). */
  source: "kv" | "dry-run";
  /** Channels with live credentials connected. */
  channels_connected: string[];
  /** True until at least one channel is connected — content is staged, not yet live. */
  awaiting_connect: boolean;
  funnel: {
    /** Distinct emails that submitted the waitlist form. */
    waitlist_signups: number;
    /** Emails that completed double-opt-in. */
    waitlist_confirmed: number;
    /** confirmed / signups, rounded to 3 dp; null when no signups yet. */
    confirm_rate: number | null;
  };
  email: {
    provider: string;
    connected: boolean;
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Compute the current growth snapshot from connected datastores. Pure read; never writes.
 */
export async function getGrowthMetrics(): Promise<GrowthMetrics> {
  const storeLive = isWaitlistStoreConfigured();
  const counts = await getWaitlistCounts();

  const channels: string[] = [];
  if (isEmailConfigured()) channels.push("email");
  if (storeLive) channels.push("waitlist-store");

  return {
    source: storeLive ? "kv" : "dry-run",
    channels_connected: channels,
    awaiting_connect: channels.length === 0,
    funnel: {
      waitlist_signups: counts.signups,
      waitlist_confirmed: counts.confirmed,
      confirm_rate: counts.signups > 0 ? round3(counts.confirmed / counts.signups) : null,
    },
    email: {
      provider: emailProvider(),
      connected: isEmailConfigured(),
    },
  };
}
