import { describe, it, expect, vi, afterEach } from "vitest";
import { POST as stemsPOST } from "@/app/api/stems/route";
import { POST as voiceoverPOST } from "@/app/api/voiceover/route";
import { POST as scorePOST } from "@/app/api/score/route";
import { POST as iosScorePOST } from "@/app/api/ios-score/route";
import { POST as planPOST } from "@/app/api/plan/route";
import { POST as iosPlanPOST } from "@/app/api/ios-plan/route";
import { POST as validatePOST } from "@/app/api/validate/route";
import { POST as iosValidatePOST } from "@/app/api/ios-validate/route";
import { VISION_BODY_LIMIT_BYTES, PLANNER_BODY_LIMIT_BYTES } from "@/lib/http/body-limit";
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

  // Track H2 — the paid VISION / PLANNING routes carry large downscaled-frame arrays;
  // an over-declared body must 413 BEFORE req.json() buffers it (the pre-parse
  // memory-exhaustion surface) and before the paid Anthropic call is ever reached.
  // The count-bounded vision routes (frames ≤1000 / clipFrames ≤MAX_FILES) use the 300MB cap.
  const OVER_VISION = VISION_BODY_LIMIT_BYTES + 1;
  const visionRoutes: Array<[string, (req: Request) => Promise<Response>, string]> = [
    ["score", scorePOST, "203.0.113.20"],
    ["ios-score", iosScorePOST, "203.0.113.21"],
    ["validate", validatePOST, "203.0.113.23"],
    ["ios-validate", iosValidatePOST, "203.0.113.24"],
  ];

  for (const [name, handler, ip] of visionRoutes) {
    it(`${name}: 413s an over-declared frame payload before req.json() or the paid call`, async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const res = await handler(oversizedReq(`http://localhost/api/${name}`, OVER_VISION, ip));
      expect(res.status).toBe(413);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  // The planner routes accept MAX_PLANNER_FRAMES (≫1000) frames, so they use the larger 2GB
  // cap — and must NOT 413 a body under it (a body at OVER_VISION would be a legit large
  // project for the planner). Assert they only 413 above the PLANNER cap.
  const OVER_PLANNER = PLANNER_BODY_LIMIT_BYTES + 1;
  const plannerRoutes: Array<[string, (req: Request) => Promise<Response>, string]> = [
    ["plan", planPOST, "203.0.113.22"],
    ["ios-plan", iosPlanPOST, "203.0.113.25"],
  ];

  for (const [name, handler, ip] of plannerRoutes) {
    it(`${name}: 413s an over-declared body above the planner cap before req.json() or the paid call`, async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const res = await handler(oversizedReq(`http://localhost/api/${name}`, OVER_PLANNER, ip));
      expect(res.status).toBe(413);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it(`${name}: does NOT 413 a large-but-legit planner body (a 300MB body the vision cap would reject)`, async () => {
      // A body that exceeds the 300MB vision cap but is under the planner cap must pass the
      // body guard — proving the planner routes weren't given the too-small vision cap. With no
      // actual body bytes it then fails at req.json() (400), so we assert only that it is NOT a 413.
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const res = await handler(
        oversizedReq(`http://localhost/api/${name}`, VISION_BODY_LIMIT_BYTES + 1, `${ip}9`)
      );
      expect(res.status).not.toBe(413);
    });
  }
});
