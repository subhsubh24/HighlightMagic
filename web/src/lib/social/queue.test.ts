import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enqueue,
  listQueue,
  publish,
  connectedChannels,
  isChannelConnected,
  _resetQueueMemory,
} from "./queue";

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
