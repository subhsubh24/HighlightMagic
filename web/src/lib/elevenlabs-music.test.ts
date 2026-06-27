/**
 * elevenlabs-music tests — focus on the duration CLAMP (a cost-control lever: ElevenLabs Music
 * is billed by length) and on graceful handling of empty/error responses. fetch is mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateMusic } from "./elevenlabs-music";

const realKey = process.env.ELEVENLABS_API_KEY;

function mockFetchOnce(res: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(res);
}

/** Pull the JSON body sent to the mocked fetch. */
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

describe("generateMusic", () => {
  it("clamps an over-long duration down to the 300s ceiling", async () => {
    const spy = mockFetchOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await generateMusic("epic build", 999_999_999);
    expect(sentBody(spy).music_length_ms).toBe(300_000);
  });

  it("clamps a too-short duration up to the 3s floor", async () => {
    const spy = mockFetchOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await generateMusic("short sting", 100);
    expect(sentBody(spy).music_length_ms).toBe(3_000);
  });

  it("falls back to the default length for a non-finite duration", async () => {
    const spy = mockFetchOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await generateMusic("ambient", Number.NaN);
    expect(sentBody(spy).music_length_ms).toBe(60_000);
  });

  it("returns a base64 data URI on success", async () => {
    mockFetchOnce(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
    const result = await generateMusic("lofi", 30_000);
    expect(result.status).toBe("completed");
    expect(result.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });

  it("fails gracefully on an empty audio response", async () => {
    mockFetchOnce(new Response(new Uint8Array([]), { status: 200 }));
    const result = await generateMusic("lofi", 30_000);
    expect(result.status).toBe("failed");
  });

  it("fails gracefully on an API error status", async () => {
    mockFetchOnce(new Response("server error", { status: 500 }));
    const result = await generateMusic("lofi", 30_000);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
  });
});
