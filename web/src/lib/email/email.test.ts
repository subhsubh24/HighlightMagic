import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  emailProvider,
  isEmailConfigured,
  sendEmail,
  buildConfirmationEmail,
  buildWelcomeEmail,
} from "./index";

describe("email abstraction (E6b)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports dry-run when no provider env is set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(emailProvider()).toBe("none");
    expect(isEmailConfigured()).toBe(false);
  });

  it("detects resend when RESEND_API_KEY is set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(emailProvider()).toBe("resend");
    expect(isEmailConfigured()).toBe(true);
  });

  it("dry-run send is a no-op that resolves ok without calling fetch", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" });
    expect(res).toMatchObject({ ok: true, dryRun: true, provider: "none" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Resend API when configured and returns the id", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })
    );
    const res = await sendEmail({ to: "A@B.com", subject: "Hi", text: "Body" });
    expect(res).toMatchObject({ ok: true, dryRun: false, provider: "resend", id: "msg_1" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.to).toBe("a@b.com"); // normalized lowercase
    expect(sent.html).toContain("Body");
  });

  it("never throws on provider failure — returns ok:false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 422 }));
    const res = await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("send_failed");
  });

  it("bounds the Resend call with an AbortSignal timeout (B6 resilience)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })
    );
    await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" });
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws on network error — returns ok:false", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    const res = await sendEmail({ to: "a@b.com", subject: "Hi", text: "Body" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("send_error");
  });

  it("builds confirmation + welcome templates with the link", () => {
    const conf = buildConfirmationEmail("https://x.app/api/waitlist/confirm?token=abc");
    expect(conf.subject).toMatch(/confirm/i);
    expect(conf.text).toContain("https://x.app/api/waitlist/confirm?token=abc");
    const welcome = buildWelcomeEmail();
    expect(welcome.subject).toMatch(/waitlist/i);
    expect(welcome.text.length).toBeGreaterThan(20);
  });
});
