import { describe, it, expect } from "vitest";
import { checkDailySpendCeiling, recordDailyExport, DAILY_EXPORT_CAP } from "./spend-ceiling";

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
