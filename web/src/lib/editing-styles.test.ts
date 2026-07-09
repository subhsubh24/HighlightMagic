import { describe, it, expect } from "vitest";
import {
  EDITING_STYLES,
  ALL_THEMES,
  templateToTheme,
  getThemeTransitions,
  getEditingStyle,
} from "./editing-styles";

describe("EDITING_STYLES", () => {
  it("has a style for every theme in ALL_THEMES", () => {
    for (const theme of ALL_THEMES) {
      expect(EDITING_STYLES[theme]).toBeDefined();
      expect(EDITING_STYLES[theme].theme).toBe(theme);
    }
  });

  it("each style has valid transition durations", () => {
    for (const theme of ALL_THEMES) {
      const style = EDITING_STYLES[theme];
      expect(style.transitionDuration).toBeGreaterThan(0);
      expect(style.transitionDuration).toBeLessThanOrEqual(2);
    }
  });

  it("each style has at least one transition", () => {
    for (const theme of ALL_THEMES) {
      expect(EDITING_STYLES[theme].transitions.length).toBeGreaterThan(0);
    }
  });
});

describe("ALL_THEMES", () => {
  it("contains 10 themes", () => {
    expect(ALL_THEMES).toHaveLength(10);
  });

  it("has no duplicates", () => {
    expect(new Set(ALL_THEMES).size).toBe(ALL_THEMES.length);
  });
});

describe("templateToTheme", () => {
  it("maps known template IDs to themes", () => {
    expect(templateToTheme("adventure")).toBe("travel");
    expect(templateToTheme("foodie")).toBe("cooking");
    expect(templateToTheme("gaming")).toBe("gaming");
    expect(templateToTheme("wedding")).toBe("wedding");
    expect(templateToTheme("pet-vibes")).toBe("pets");
  });

  it("returns cinematic for unknown template IDs", () => {
    expect(templateToTheme("nonexistent")).toBe("cinematic");
    expect(templateToTheme("")).toBe("cinematic");
  });
});

describe("getThemeTransitions", () => {
  it("returns the requested number of transitions", () => {
    const result = getThemeTransitions("sports", 5);
    expect(result).toHaveLength(5);
  });

  it("avoids consecutive duplicate transitions", () => {
    const result = getThemeTransitions("sports", 10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).not.toBe(result[i - 1]);
    }
  });

  it("returns empty array for count 0", () => {
    expect(getThemeTransitions("cinematic", 0)).toHaveLength(0);
  });

  it("enforces the pattern-interrupt for every theme even when the pool wraps around", () => {
    // Several theme pools start and end with the SAME transition (e.g. the vlog
    // pool is [hard_cut, dip_to_black, hard_cut, crossfade, hard_cut]). Requesting
    // more transitions than the pool length forces a wrap where pool[i % len]
    // collides with the previous pick — the branch the sports/10 case never hits.
    // The no-consecutive-duplicate guarantee must still hold for all of them.
    for (const theme of ALL_THEMES) {
      const result = getThemeTransitions(theme, 12);
      expect(result).toHaveLength(12);
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).not.toBe(result[i - 1]);
      }
    }
  });

  it("substitutes a different transition when the wrap-around candidate repeats", () => {
    // The vlog pool ends and begins with "hard_cut", so index 5 (pool[0]) would
    // repeat result[4] (pool[4]) — exercising the alternate-selection fallback.
    const result = getThemeTransitions("vlog", 6);
    expect(result[5]).not.toBe(result[4]);
    expect(result[5]).not.toBe("hard_cut");
  });
});

describe("getEditingStyle", () => {
  it("returns the correct style for a theme", () => {
    const style = getEditingStyle("sports");
    expect(style.theme).toBe("sports");
    expect(style.label).toBe("Sports");
  });
});
