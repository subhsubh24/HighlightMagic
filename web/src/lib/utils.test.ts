import { describe, it, expect, vi, afterEach } from "vitest";
import { cn, formatTime, formatFileSize, uuid, haptic } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("formatTime", () => {
  it("formats 0 seconds", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(59)).toBe("0:59");
  });

  it("formats exact minutes", () => {
    expect(formatTime(60)).toBe("1:00");
    expect(formatTime(120)).toBe("2:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(125)).toBe("2:05");
  });

  it("floors fractional seconds", () => {
    expect(formatTime(90.7)).toBe("1:30");
  });
});

describe("formatFileSize", () => {
  it("formats bytes as KB", () => {
    expect(formatFileSize(512 * 1024)).toBe("512 KB");
  });

  it("formats bytes as MB", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("uses KB for values under 1 MB", () => {
    expect(formatFileSize(100 * 1024)).toBe("100 KB");
  });

  it("uses MB for values at exactly 1 MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("uuid", () => {
  it("returns a string", () => {
    expect(typeof uuid()).toBe("string");
  });

  it("generates unique values", () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
  });

  it("matches UUID v4 format", () => {
    const id = uuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

describe("haptic", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls navigator.vibrate with the given pattern when supported", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    haptic(20);
    expect(vibrate).toHaveBeenCalledWith(20);
  });

  it("defaults to a 10ms pulse", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("no-ops without throwing when navigator lacks vibrate (e.g. desktop)", () => {
    vi.stubGlobal("navigator", {});
    expect(() => haptic()).not.toThrow();
  });

  it("no-ops without throwing when navigator is undefined (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(() => haptic([10, 20, 10])).not.toThrow();
  });
});
