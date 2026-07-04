import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as experimentPOST } from "@/app/api/growth/experiment/route";
import { _resetBuckets } from "@/lib/rate-limit";
import { _resetExperimentMemory, getExperimentResults } from "@/lib/growth/experiments";

function req(body: unknown, ip = "203.0.113.1") {
  return new NextRequest("http://localhost/api/growth/experiment", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("E8 — experiment recording beacon", () => {
  beforeEach(() => {
    _resetBuckets();
    _resetExperimentMemory();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("records a valid exposure and returns ok, incrementing the aggregate counter", async () => {
    const res = await experimentPOST(
      req({ experimentId: "landing-headline", variant: "control", event: "exposure" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const [result] = await getExperimentResults();
    const control = result.variants.find((v) => v.variant === "control")!;
    expect(control.exposures).toBe(1);
  });

  it("rejects an unregistered experiment with 400 and mints no counter", async () => {
    const res = await experimentPOST(
      req({ experimentId: "forged", variant: "control", event: "exposure" }, "203.0.113.2")
    );
    expect(res.status).toBe(400);
    const [result] = await getExperimentResults();
    expect(result.variants.every((v) => v.exposures === 0)).toBe(true);
  });

  it("rejects an unknown variant with 400", async () => {
    const res = await experimentPOST(
      req({ experimentId: "landing-headline", variant: "hacker", event: "exposure" }, "203.0.113.3")
    );
    expect(res.status).toBe(400);
  });

  it("rejects a bad event kind with 400", async () => {
    const res = await experimentPOST(
      req({ experimentId: "landing-headline", variant: "control", event: "click" }, "203.0.113.4")
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const bad = new NextRequest("http://localhost/api/growth/experiment", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" },
      body: "{not json",
    });
    const res = await experimentPOST(bad);
    expect(res.status).toBe(400);
  });

  it("rate-limits a public flood from one IP (H1)", async () => {
    const ip = "203.0.113.9";
    let last = 200;
    for (let i = 0; i < 8; i++) {
      const r = await experimentPOST(
        req({ experimentId: "landing-headline", variant: "control", event: "exposure" }, ip)
      );
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
