import { describe, it, expect } from "vitest";
import { isValidUserId, MAX_USER_ID_CHARS } from "./user-id";

describe("isValidUserId (H2 input bound)", () => {
  it("accepts a normal anonymous UUID", () => {
    expect(isValidUserId("6F9619FF-8B86-D011-B42D-00CF4FC964FF")).toBe(true);
  });

  it("accepts a value exactly at the length ceiling", () => {
    expect(isValidUserId("a".repeat(MAX_USER_ID_CHARS))).toBe(true);
  });

  it("rejects an over-long userId (would mint a pathological KV key)", () => {
    expect(isValidUserId("a".repeat(MAX_USER_ID_CHARS + 1))).toBe(false);
    expect(isValidUserId("x".repeat(1_000_000))).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isValidUserId("")).toBe(false);
    expect(isValidUserId(undefined)).toBe(false);
    expect(isValidUserId(null)).toBe(false);
    expect(isValidUserId(123)).toBe(false);
    expect(isValidUserId({})).toBe(false);
  });
});
