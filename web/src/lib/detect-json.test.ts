import { describe, it, expect, vi, afterEach } from "vitest";
import { extractBalancedJSON, safeParseJSONArray } from "./detect-json";

/**
 * These two helpers recover usable JSON from untrusted LLM output on the core detection
 * path. A single malformed scorer/planner response would otherwise tank an export, so the
 * recovery behavior is locked here against regression.
 */

describe("extractBalancedJSON", () => {
  it("extracts a plain object", () => {
    expect(extractBalancedJSON('{"a":1}', "{")).toBe('{"a":1}');
  });

  it("extracts a plain array", () => {
    expect(extractBalancedJSON("[1,2,3]", "[")).toBe("[1,2,3]");
  });

  it("returns null when the opener is absent", () => {
    expect(extractBalancedJSON("no json here", "{")).toBeNull();
    expect(extractBalancedJSON("no json here", "[")).toBeNull();
  });

  it("strips trailing prose after the JSON (the greedy-regex failure case)", () => {
    const s = 'Here is the JSON: {"clips":3} Let me know if you need changes!';
    expect(extractBalancedJSON(s, "{")).toBe('{"clips":3}');
  });

  it("strips leading prose before the JSON", () => {
    const s = 'Sure! [{"index":0}]';
    expect(extractBalancedJSON(s, "[")).toBe('[{"index":0}]');
  });

  it("balances nested structures rather than stopping at the first closer", () => {
    const s = '{"a":{"b":{"c":1}},"d":2} trailing';
    expect(extractBalancedJSON(s, "{")).toBe('{"a":{"b":{"c":1}},"d":2}');
  });

  it("ignores closers that appear inside string values", () => {
    const s = '{"label":"a } b ] c"} tail';
    expect(extractBalancedJSON(s, "{")).toBe('{"label":"a } b ] c"}');
  });

  it("ignores openers that appear inside string values", () => {
    const s = '{"label":"nested { and [ chars","score":9}';
    expect(extractBalancedJSON(s, "{")).toBe(s);
  });

  it("treats an escaped quote as literal, not a string boundary", () => {
    const s = '{"label":"she said \\"hi\\" }","ok":true} rest';
    expect(extractBalancedJSON(s, "{")).toBe('{"label":"she said \\"hi\\" }","ok":true}');
  });

  it("treats an escaped backslash before a quote correctly (quote still closes the string)", () => {
    // "path\\" ends the string; the following } closes the object.
    const s = '{"path":"c:\\\\"}';
    const out = extractBalancedJSON(s, "{");
    expect(out).toBe(s);
    expect(JSON.parse(out as string)).toEqual({ path: "c:\\" });
  });

  it("falls back to greedy regex when the structure is unbalanced (never closes)", () => {
    // depth never returns to 0, so the balanced scan fails and the greedy regex captures.
    const s = 'prefix {"a":1, "b": {"c":2} suffix';
    expect(extractBalancedJSON(s, "{")).toBe('{"a":1, "b": {"c":2} suffix'.match(/\{[\s\S]*\}/)?.[0]);
  });

  it("extracts the array while ignoring bracket chars inside strings", () => {
    const s = '[{"label":"drop ] here"},{"label":"[bracket"}] done';
    expect(extractBalancedJSON(s, "[")).toBe('[{"label":"drop ] here"},{"label":"[bracket"}]');
  });
});

describe("safeParseJSONArray", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses valid JSON directly (attempt 1)", () => {
    expect(safeParseJSONArray('[{"index":0,"score":9}]')).toEqual([{ index: 0, score: 9 }]);
  });

  it("recovers from a trailing comma before ] (attempt 2)", () => {
    expect(safeParseJSONArray('[{"index":0,"score":9},]')).toEqual([{ index: 0, score: 9 }]);
  });

  it("recovers from a trailing comma before } (attempt 2)", () => {
    expect(safeParseJSONArray('[{"index":0,"score":9,}]')).toEqual([{ index: 0, score: 9 }]);
  });

  it("replaces an unescaped newline inside a string value (attempt 2)", () => {
    const raw = '[{"index":0,"score":9,"role":"HOOK","label":"line one\nline two"}]';
    const out = safeParseJSONArray(raw) as Array<{ label: string }>;
    expect(out[0].label).toBe("line one line two");
  });

  it("recovers frames via regex extraction when a label has unescaped quotes (attempt 3, role-first)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The unescaped inner quote breaks JSON.parse and the sanitizer; attempt 3 salvages the fields.
    const raw = '[{"index":2,"score":8.5,"role":"HERO","label":"the "big" moment"}]';
    const out = safeParseJSONArray(raw) as Array<{ index: number; score: number; role: string; label: string }>;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ index: 2, score: 8.5, role: "HERO" });
    // inner double-quotes are downgraded to single quotes during recovery
    expect(out[0].label).toBe("the 'big' moment");
  });

  it("recovers frames via the alternate key order (index, score, label, role)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = '[{"index":1,"score":7,"label":"a "q" b","role":"REACTION"}]';
    const out = safeParseJSONArray(raw) as Array<{ index: number; role: string; label: string }>;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ index: 1, role: "REACTION" });
    expect(out[0].label).toBe("a 'q' b");
  });

  it("recovers a well-formed frame object wrapped in prose (attempt 3 regex path)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Prose prefix fails attempt 1/2; the object matches objRegex so attempt 3 salvages it.
    const raw = 'Here are the scores: [{"index":0,"score":9,"role":"HOOK","label":"ok"}] — hope this helps';
    const out = safeParseJSONArray(raw) as Array<{ index: number }>;
    expect(out).toEqual([{ index: 0, score: 9, role: "HOOK", label: "ok" }]);
    expect(console.warn).toHaveBeenCalled(); // the regex-recovery path logs a warning
  });

  it("recovers a non-frame array via the final bracket-strip attempt", () => {
    // Fails attempt 1 (prose prefix) and attempt 2 (still has the prefix); attempt 3's frame
    // regexes match zero objects (no index/score/role/label shape), so recovery reaches the
    // final extractBalancedJSON bracket-strip — the last fallback, otherwise untested.
    const raw = "noise before [1, 2, 3,] and trailing junk";
    const out = safeParseJSONArray(raw);
    expect(out).toEqual([1, 2, 3]);
  });

  it("throws a SyntaxError when nothing is salvageable, truncating the offending input", () => {
    const raw = "totally not json at all " + "x".repeat(500); // 524 chars
    expect(() => safeParseJSONArray(raw)).toThrow(SyntaxError);
    try {
      safeParseJSONArray(raw);
    } catch (e) {
      // error message embeds only the first 200 chars of the raw input (no unbounded leak)
      const msg = (e as Error).message;
      expect(msg).toContain("Failed to parse scoring JSON");
      expect(msg).toContain(raw.slice(0, 200));
      expect(msg).not.toContain(raw.slice(200)); // the tail is dropped
      expect(msg.length).toBeLessThan(raw.length); // strictly shorter than the full input
    }
  });

  it("parses a plain (non-frame) array unchanged", () => {
    expect(safeParseJSONArray("[1,2,3]")).toEqual([1, 2, 3]);
  });
});
