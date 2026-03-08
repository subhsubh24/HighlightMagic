import { describe, it, expect } from "vitest";
import { VIDEO_FILTERS, ALL_FILTERS } from "./filters";

describe("VIDEO_FILTERS", () => {
  it("has a CSS string for every filter in ALL_FILTERS", () => {
    for (const name of ALL_FILTERS) {
      expect(VIDEO_FILTERS[name]).toBeDefined();
      expect(typeof VIDEO_FILTERS[name]).toBe("string");
    }
  });

  it("None filter maps to 'none'", () => {
    expect(VIDEO_FILTERS.None).toBe("none");
  });

  it("all non-None filters are non-empty CSS strings", () => {
    for (const name of ALL_FILTERS) {
      if (name === "None") continue;
      expect(VIDEO_FILTERS[name].length).toBeGreaterThan(0);
      expect(VIDEO_FILTERS[name]).not.toBe("none");
    }
  });
});

describe("ALL_FILTERS", () => {
  it("contains 11 filters", () => {
    expect(ALL_FILTERS).toHaveLength(11);
  });

  it("starts with None", () => {
    expect(ALL_FILTERS[0]).toBe("None");
  });

  it("has no duplicates", () => {
    const unique = new Set(ALL_FILTERS);
    expect(unique.size).toBe(ALL_FILTERS.length);
  });
});
