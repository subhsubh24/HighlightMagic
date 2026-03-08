import { describe, it, expect } from "vitest";

describe("kling re-exports", () => {
  it("re-exports all atlascloud animation functions", async () => {
    const kling = await import("./kling");
    expect(kling.submitPhotoAnimation).toBeDefined();
    expect(kling.checkAnimationResult).toBeDefined();
    expect(kling.pollAnimationResult).toBeDefined();
    expect(kling.generatePhotoAnimation).toBeDefined();
  });

  it("exports AnimationPollResult type shape", async () => {
    // Type-level test — verify the interface exists by constructing a value
    const result: import("./kling").AnimationPollResult = {
      status: "completed",
      videoUrl: "https://example.com/v.mp4",
    };
    expect(result.status).toBe("completed");
    expect(result.videoUrl).toBeDefined();
  });
});
