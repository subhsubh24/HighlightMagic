/**
 * elevenlabs-sfx tests — focus on the duration CLAMP (cost control) and graceful empty/error
 * handling. fetch is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSoundEffect } from "./elevenlabs-sfx";

const realKey = process.env.ELEVENLABS_API_KEY;

function mockFetchOnce(res: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(res);
}
function sentBody(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const init = spy.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  vi.restoreAllMocks();
});
afterEach(() => {
  if (realKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = realKey;
});

describe("generateSoundEffect", () => {
  it("clamps an over-long duration to the 10s ceiling (seconds in the request body)", async () => {
    const spy = mockFetchOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await generateSoundEffect("whoosh", 999_999);
    expect(sentBody(spy).duration_seconds).toBe(10); // 10_000ms / 1000
  });

  it("clamps a too-short duration up to the 0.5s floor", async () => {
    const spy = mockFetchOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await generateSoundEffect("tick", 10);
    expect(sentBody(spy).duration_seconds).toBe(0.5); // 500ms / 1000
  });

  it("returns a base64 data URI on success", async () => {
    mockFetchOnce(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
    const result = await generateSoundEffect("impact", 2_000);
    expect(result.status).toBe("completed");
    expect(result.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("fails gracefully on an empty audio response", async () => {
    mockFetchOnce(new Response(new Uint8Array([]), { status: 200 }));
    const result = await generateSoundEffect("impact", 2_000);
    expect(result.status).toBe("failed");
  });

  it("fails gracefully on an API error status", async () => {
    mockFetchOnce(new Response("bad", { status: 422 }));
    const result = await generateSoundEffect("impact", 2_000);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("422");
  });
});
