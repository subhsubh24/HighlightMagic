import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/validate/route";
import { consumeExport } from "@/lib/entitlement";
import { FREE_EXPORT_LIMIT } from "@/lib/constants";

function req(body: unknown): Request {
  return new Request("http://localhost/api/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const clip = { id: "c1", captionText: "Great shot", durationSec: 3 };

describe("POST /api/validate — quota gate", () => {
  const realKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  });

  it("returns 402 when userId is supplied and quota is exceeded", async () => {
    const userId = "validate-gate-quota-user";
    for (let i = 0; i < FREE_EXPORT_LIMIT; i++) await consumeExport({ userId });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await POST(req({ userId, clips: [clip], plan: {} }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.remaining).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("omits gate and fails open when userId is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req({ clips: [clip], plan: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });
});
