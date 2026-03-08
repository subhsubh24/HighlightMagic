import { describe, it, expect } from "vitest";
import { lookupSfxLibrary, cacheSfxResult } from "./sfx-library";

describe("lookupSfxLibrary", () => {
  it("returns null when no CDN URLs are configured", () => {
    // Library entries all have url: null by default
    expect(lookupSfxLibrary("whoosh")).toBeNull();
    expect(lookupSfxLibrary("impact")).toBeNull();
  });

  it("returns null for unrecognized prompts", () => {
    expect(lookupSfxLibrary("random noise xyz")).toBeNull();
  });
});

describe("cacheSfxResult", () => {
  it("caches a result and returns it on lookup", () => {
    cacheSfxResult("custom whoosh effect", "https://cdn.example.com/whoosh.mp3", 1.5);
    const result = lookupSfxLibrary("custom whoosh effect");
    expect(result).toEqual({
      url: "https://cdn.example.com/whoosh.mp3",
      duration: 1.5,
    });
  });

  it("is case-insensitive", () => {
    cacheSfxResult("BIG BOOM", "https://cdn.example.com/boom.mp3", 2.0);
    const result = lookupSfxLibrary("big boom");
    expect(result).toEqual({
      url: "https://cdn.example.com/boom.mp3",
      duration: 2.0,
    });
  });
});
