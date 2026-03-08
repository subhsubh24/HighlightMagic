import { describe, it, expect } from "vitest";
import { TEMPLATES } from "./templates";

describe("TEMPLATES", () => {
  it("has 9 templates", () => {
    expect(TEMPLATES).toHaveLength(9);
  });

  it("each template has required fields", () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.suggestedFilter).toBeTruthy();
      expect(t.suggestedCaptionStyle).toBeTruthy();
      expect(t.suggestedMusicMood).toBeTruthy();
      expect(t.colorAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("has unique IDs", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique names", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("includes expected templates", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(names).toContain("Adventure");
    expect(names).toContain("Travel");
    expect(names).toContain("Wedding");
  });
});
