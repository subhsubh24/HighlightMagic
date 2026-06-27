/**
 * Track H1 — rate-limit enforcement on the paid/expensive routes that previously had
 * no per-IP throttle (voiceover, sfx, stems, upscale, thumbnail, talking-head,
 * style-transfer, voice-clone, intro, outro, music/submit, plan, animate/submit).
 *
 * The rate-limit guard runs BEFORE body parsing and the quota gate, so a flood of
 * requests from one IP trips the 429 even with otherwise-invalid bodies — no paid-API
 * mock is needed. We assert the throttle fires and is keyed per-IP.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { _resetBuckets, PAID_RATE_LIMIT } from "@/lib/rate-limit";

import { POST as voiceover } from "@/app/api/voiceover/route";
import { POST as sfx } from "@/app/api/sfx/route";
import { POST as stems } from "@/app/api/stems/route";
import { POST as upscale } from "@/app/api/upscale/route";
import { POST as thumbnail } from "@/app/api/thumbnail/route";
import { POST as talkingHead } from "@/app/api/talking-head/route";
import { POST as styleTransfer } from "@/app/api/style-transfer/route";
import { POST as voiceClone } from "@/app/api/voice-clone/route";
import { POST as intro } from "@/app/api/intro/route";
import { POST as outro } from "@/app/api/outro/route";
import { POST as musicSubmit } from "@/app/api/music/submit/route";
import { POST as plan } from "@/app/api/plan/route";
import { POST as animateSubmit } from "@/app/api/animate/submit/route";

type Handler = (req: Request) => Promise<Response>;

const ROUTES: Array<[string, Handler]> = [
  ["voiceover", voiceover],
  ["sfx", sfx],
  ["stems", stems],
  ["upscale", upscale],
  ["thumbnail", thumbnail],
  ["talking-head", talkingHead],
  ["style-transfer", styleTransfer],
  ["voice-clone", voiceClone],
  ["intro", intro],
  ["outro", outro],
  ["music/submit", musicSubmit],
  ["plan", plan],
  ["animate/submit", animateSubmit],
];

function req(ip: string): Request {
  // Intentionally empty body — the rate-limit guard runs before validation, so we never
  // reach a paid call. We only care that the throttle counts and trips.
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "{}",
  });
}

describe("H1 rate limiting on paid/expensive routes", () => {
  beforeEach(() => _resetBuckets());

  for (const [name, handler] of ROUTES) {
    it(`${name} returns 429 after exceeding the per-IP paid limit`, async () => {
      const ip = `10.0.0.${ROUTES.findIndex(([n]) => n === name)}`;
      let saw429 = false;
      // limit + 1 requests; the request past the limit must be a 429.
      for (let i = 0; i <= PAID_RATE_LIMIT.limit; i++) {
        const res = await handler(req(ip));
        if (i === PAID_RATE_LIMIT.limit) {
          saw429 = res.status === 429;
          expect(res.headers.get("Retry-After")).toBeTruthy();
        } else {
          // Pre-limit requests must NOT be throttled (they fail validation instead).
          expect(res.status).not.toBe(429);
        }
      }
      expect(saw429).toBe(true);
    });
  }

  it("throttle is keyed per-IP (a fresh IP is not blocked by another IP's flood)", async () => {
    for (let i = 0; i < PAID_RATE_LIMIT.limit; i++) {
      await voiceover(req("172.16.0.1"));
    }
    const fresh = await voiceover(req("172.16.0.2"));
    expect(fresh.status).not.toBe(429);
  });
});
