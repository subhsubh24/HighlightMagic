import { describe, it, expect } from "vitest";
import {
  checkDailySpendCeiling,
  recordDailyExport,
  DAILY_EXPORT_CAP,
  checkDailyGenerationCeiling,
  recordDailyGeneration,
  enforceGenerationCeiling,
  DAILY_GENERATION_CAP,
} from "./spend-ceiling";

function uniqueUser(): string {
  return `user-${Math.random().toString(36).slice(2)}`;
}

describe("checkDailySpendCeiling", () => {
  it("allows first-time user", () => {
    const result = checkDailySpendCeiling(uniqueUser());
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(0);
    expect(result.cap).toBe(DAILY_EXPORT_CAP);
  });

  it("allows user below the cap", () => {
    const userId = uniqueUser();
    for (let i = 0; i < 3; i++) recordDailyExport(userId);
    const result = checkDailySpendCeiling(userId);
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(3);
  });

  it("blocks user at the cap", () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) recordDailyExport(userId);
    const result = checkDailySpendCeiling(userId);
    expect(result.allowed).toBe(false);
    expect(result.usage).toBe(DAILY_EXPORT_CAP);
  });

  it("uses independent windows for different users", () => {
    const userA = uniqueUser();
    const userB = uniqueUser();
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) recordDailyExport(userA);
    expect(checkDailySpendCeiling(userA).allowed).toBe(false);
    expect(checkDailySpendCeiling(userB).allowed).toBe(true);
  });
});

describe("recordDailyExport", () => {
  it("increments usage on successive calls", () => {
    const userId = uniqueUser();
    recordDailyExport(userId);
    recordDailyExport(userId);
    const result = checkDailySpendCeiling(userId);
    expect(result.usage).toBe(2);
  });

  it("does not throw for new users", () => {
    expect(() => recordDailyExport(uniqueUser())).not.toThrow();
  });
});

describe("checkDailyGenerationCeiling", () => {
  it("allows a first-time user with the generation cap", () => {
    const result = checkDailyGenerationCeiling(uniqueUser());
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(0);
    expect(result.cap).toBe(DAILY_GENERATION_CAP);
  });

  it("blocks a user at the generation cap", () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) recordDailyGeneration(userId);
    const result = checkDailyGenerationCeiling(userId);
    expect(result.allowed).toBe(false);
    expect(result.usage).toBe(DAILY_GENERATION_CAP);
  });

  it("is independent from the export ceiling (separate counters)", () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_EXPORT_CAP; i++) recordDailyExport(userId);
    // Exports maxed, but generations untouched.
    expect(checkDailySpendCeiling(userId).allowed).toBe(false);
    expect(checkDailyGenerationCeiling(userId).allowed).toBe(true);
    expect(checkDailyGenerationCeiling(userId).usage).toBe(0);
  });
});

describe("enforceGenerationCeiling", () => {
  it("returns null and records a call while under the cap", () => {
    const userId = uniqueUser();
    const blocked = enforceGenerationCeiling(userId);
    expect(blocked).toBeNull();
    expect(checkDailyGenerationCeiling(userId).usage).toBe(1);
  });

  it("counts at admission across repeated calls", () => {
    const userId = uniqueUser();
    enforceGenerationCeiling(userId);
    enforceGenerationCeiling(userId);
    enforceGenerationCeiling(userId);
    expect(checkDailyGenerationCeiling(userId).usage).toBe(3);
  });

  it("returns a 429 Response once the cap is reached", async () => {
    const userId = uniqueUser();
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) {
      expect(enforceGenerationCeiling(userId)).toBeNull();
    }
    const blocked = enforceGenerationCeiling(userId);
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
    const body = await blocked?.json();
    expect(body.error).toMatch(/daily generation limit/i);
  });

  it("isolates the cap per user", () => {
    const userA = uniqueUser();
    const userB = uniqueUser();
    for (let i = 0; i < DAILY_GENERATION_CAP; i++) enforceGenerationCeiling(userA);
    expect(enforceGenerationCeiling(userA)).toBeInstanceOf(Response);
    expect(enforceGenerationCeiling(userB)).toBeNull();
  });
});
