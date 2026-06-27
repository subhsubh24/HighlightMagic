import { describe, it, expect, vi, afterEach } from "vitest";
import { trackEvent } from "./analytics";

describe("analytics.trackEvent (E5/G2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a no-op when window is undefined (SSR-safe, never throws)", () => {
    // Node test env: window is already undefined.
    expect(() => trackEvent("waitlist_signup")).not.toThrow();
  });

  it("is a no-op when window exists but Plausible is absent", () => {
    vi.stubGlobal("window", {});
    expect(() => trackEvent("cta_click", { source: "hero" })).not.toThrow();
  });

  it("calls plausible with the event name and cleaned props", () => {
    const plausible = vi.fn();
    vi.stubGlobal("window", { plausible });
    trackEvent("cta_click", { source: "hero" });
    expect(plausible).toHaveBeenCalledWith("cta_click", { props: { source: "hero" } });
  });

  it("filters out undefined prop values before sending", () => {
    const plausible = vi.fn();
    vi.stubGlobal("window", { plausible });
    trackEvent("faq_open", { question: "Q1", source: undefined });
    expect(plausible).toHaveBeenCalledWith("faq_open", { props: { question: "Q1" } });
  });

  it("sends no props object when props are absent", () => {
    const plausible = vi.fn();
    vi.stubGlobal("window", { plausible });
    trackEvent("pricing_view");
    expect(plausible).toHaveBeenCalledWith("pricing_view", undefined);
  });

  it("strips all-undefined props down to an empty props object", () => {
    const plausible = vi.fn();
    vi.stubGlobal("window", { plausible });
    trackEvent("cta_click", { source: undefined });
    // props was provided (truthy) but every value filtered out → empty props object.
    expect(plausible).toHaveBeenCalledWith("cta_click", { props: {} });
  });

  it("does not throw when window.plausible is not a function", () => {
    vi.stubGlobal("window", { plausible: "not-a-fn" });
    expect(() => trackEvent("waitlist_signup")).not.toThrow();
  });
});
