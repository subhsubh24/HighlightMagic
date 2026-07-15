import { describe, it, expect, vi, afterEach } from "vitest";
import { POST as stemsPOST } from "@/app/api/stems/route";
import { POST as voiceoverPOST } from "@/app/api/voiceover/route";
import { _resetBuckets } from "@/lib/rate-limit";

/**
 * Track H — the pre-parse body guard must fire BEFORE req.json() (and before any paid call)
 * on the routes that previously lacked it. Asserts an over-declared Content-Length yields a
 * 413 and that the paid upstream (global fetch) is never reached.
 */
afterEach(() => {
  vi.restoreAllMocks();
  _resetBuckets();
});

function oversizedReq(url: string, bytes: number, ip: string): Request {
  // No body attached, so the runtime keeps our declared Content-Length — the guard reads it
  // and returns before req.json() is ever called.
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(bytes), "x-real-ip": ip },
  });
}

describe("Track H body guard wiring", () => {
  it("stems: 413s an over-declared body before the paid ElevenLabs call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await stemsPOST(oversizedReq("http://localhost/api/stems", 20 * 1024 * 1024, "198.51.100.10"));
    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("voiceover: 413s an over-declared body before parsing or the paid call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await voiceoverPOST(oversizedReq("http://localhost/api/voiceover", 5 * 1024 * 1024, "198.51.100.11"));
    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
