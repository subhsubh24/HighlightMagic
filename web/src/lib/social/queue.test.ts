import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { kv } from "@vercel/kv";
import {
  enqueue,
  listQueue,
  publish,
  connectedChannels,
  isChannelConnected,
  _resetQueueMemory,
} from "./queue";

// The queue dynamically `import("@vercel/kv")` only when KV_REST_API_URL/TOKEN are set, so the
// mock stays inert for the in-memory tests below (which never set those env vars).
vi.mock("@vercel/kv", () => ({
  kv: { rpush: vi.fn(), lrange: vi.fn() },
}));

describe("social publishing queue (E6c)", () => {
  beforeEach(() => {
    _resetQueueMemory();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports no connected channels by default", () => {
    expect(connectedChannels()).toEqual([]);
    expect(isChannelConnected("x")).toBe(false);
  });

  it("detects a channel once its credential env is set", () => {
    vi.stubEnv("X_API_BEARER_TOKEN", "tok");
    expect(connectedChannels()).toContain("x");
    expect(isChannelConnected("x")).toBe(true);
  });

  it("maps each channel to its OWN credential env (no cross-wiring)", () => {
    // Each channel resolves via a distinct env var; a mutation that pushes the
    // wrong channel key (e.g. INSTAGRAM_ACCESS_TOKEN -> "x") would route a
    // post to the wrong poster. Assert the per-channel mapping one branch at a
    // time so each of the instagram/tiktok/reddit arms is pinned independently.
    for (const [envVar, channel] of [
      ["INSTAGRAM_ACCESS_TOKEN", "instagram"],
      ["TIKTOK_ACCESS_TOKEN", "tiktok"],
      ["REDDIT_ACCESS_TOKEN", "reddit"],
    ] as const) {
      vi.stubEnv(envVar, "tok");
      expect(connectedChannels()).toEqual([channel]);
      expect(isChannelConnected(channel)).toBe(true);
      // the other channels stay dry-run — only this one credential is set
      expect(isChannelConnected("x")).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  it("enqueues drafts FIFO with a queued status", async () => {
    const a = await enqueue({ channel: "x", text: "hello" });
    await enqueue({ channel: "reddit", text: "world" });
    expect(a.status).toBe("queued");
    const q = await listQueue();
    expect(q.map((i) => i.text)).toEqual(["hello", "world"]);
  });

  it("rejects an invalid channel", async () => {
    // @ts-expect-error testing runtime guard
    await expect(enqueue({ channel: "myspace", text: "x" })).rejects.toThrow(/invalid channel/);
  });

  it("publish is dry-run (skipped) when the channel has no credentials", async () => {
    const res = await publish({ channel: "tiktok", text: "post" });
    expect(res.status).toBe("skipped");
    expect(res.note).toBe("no-credentials");
  });

  it("publish fails safe (never silently posts) when a channel is connected but no poster wired", async () => {
    vi.stubEnv("X_API_BEARER_TOKEN", "tok");
    const res = await publish({ channel: "x", text: "post" });
    expect(res.status).toBe("failed");
    expect(res.note).toBe("poster-not-implemented");
  });
});

describe("social publishing queue — durable KV store path (E6c)", () => {
  beforeEach(() => {
    _resetQueueMemory();
    vi.unstubAllEnvs();
    vi.mocked(kv.rpush).mockReset();
    vi.mocked(kv.lrange).mockReset();
    // isQueueStoreConfigured() requires BOTH env vars — flips enqueue/listQueue onto the KV branch.
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.com");
    vi.stubEnv("KV_REST_API_TOKEN", "tok");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enqueue rpushes a serialized item to the KV list instead of the in-memory queue", async () => {
    const item = await enqueue({ channel: "x", text: "hello", mediaUrl: "https://cdn/x.png" });
    expect(kv.rpush).toHaveBeenCalledTimes(1);
    const [key, payload] = vi.mocked(kv.rpush).mock.calls[0];
    expect(key).toBe("social:queue");
    // The stored payload is the JSON of the returned item (round-trips id/status/mediaUrl).
    expect(JSON.parse(payload as string)).toEqual(item);
    expect(item).toMatchObject({
      channel: "x",
      text: "hello",
      mediaUrl: "https://cdn/x.png",
      status: "queued",
    });
  });

  it("listQueue reads the KV list and deserializes both raw-string and pre-parsed object rows", async () => {
    const stringRow = JSON.stringify({
      id: "a",
      channel: "x" as const,
      text: "from-json",
      status: "queued" as const,
    });
    const objectRow = {
      id: "b",
      channel: "reddit" as const,
      text: "already-object",
      status: "sent" as const,
    };
    vi.mocked(kv.lrange).mockResolvedValue([stringRow, objectRow]);

    const q = await listQueue();

    expect(kv.lrange).toHaveBeenCalledWith("social:queue", 0, -1);
    // string row parsed, object row passed through unchanged — both branches of line 88.
    expect(q).toEqual([
      { id: "a", channel: "x", text: "from-json", status: "queued" },
      objectRow,
    ]);
  });
});
