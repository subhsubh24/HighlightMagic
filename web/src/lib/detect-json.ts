/**
 * LLM scoring-JSON parsing — robustness-critical helpers for the detection pipeline.
 *
 * The frame scorer and planner ask Claude for JSON, but LLM output is untrusted: it can
 * wrap the JSON in prose, emit trailing commas, leave control characters or unescaped quotes
 * inside strings, or truncate. These two pure functions recover a usable structure from that
 * mess so a single malformed response does not tank an export.
 *
 * Extracted from src/actions/detect.ts (a "use server" module, which may only export async
 * server actions) so the parsing logic is unit-testable and coverage-measured. Behavior is
 * unchanged — detect.ts imports these back in.
 */

// ── JSON extraction helpers ──

/**
 * Extract the outermost balanced JSON object or array from a string.
 * Unlike greedy regex `\{[\s\S]*\}`, this correctly handles cases where
 * the LLM writes prose after the JSON (e.g., "Here is the JSON: {...} Let me know if...").
 * The greedy regex would capture everything from first `{` to last `}` including the prose.
 */
export function extractBalancedJSON(text: string, opener: "{" | "["): string | null {
  const closer = opener === "{" ? "}" : "]";
  const startIdx = text.indexOf(opener);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return text.slice(startIdx, i + 1);
    }
  }
  // Unbalanced — fall back to greedy regex as last resort
  const fallbackPattern = opener === "{" ? /\{[\s\S]*\}/ : /\[[\s\S]*\]/;
  const m = text.match(fallbackPattern);
  return m ? m[0] : null;
}

// ── JSON parsing helpers ──

/**
 * Safely parse a JSON array string from an AI response.
 * AI models sometimes produce invalid JSON with:
 * - Trailing commas before ] or }
 * - Unescaped control characters (newlines, tabs) inside strings
 * - Unescaped quotes inside string values
 *
 * This function attempts progressively aggressive sanitization.
 */
export function safeParseJSONArray(raw: string): unknown {
  // Attempt 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }

  // Attempt 2: fix trailing commas and control characters
  let sanitized = raw
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1")
    // Replace unescaped newlines/tabs inside strings with spaces
    .replace(/(?<=":[ ]*"[^"]*)\n/g, " ")
    .replace(/(?<=":[ ]*"[^"]*)\t/g, " ");

  try {
    return JSON.parse(sanitized);
  } catch {
    // fall through
  }

  // Attempt 3: extract individual objects and rebuild array
  // This handles cases where the label contains unescaped quotes
  try {
    const objects: unknown[] = [];
    // Match each object boundary by looking for {"index": patterns
    const objRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*([\d.]+)\s*,\s*"role"\s*:\s*"([^"]*?)"\s*,\s*"label"\s*:\s*"([\s\S]*?)"\s*\}/g;
    let match: RegExpExecArray | null;
    while ((match = objRegex.exec(sanitized)) !== null) {
      objects.push({
        index: parseInt(match[1]),
        score: parseFloat(match[2]),
        role: match[3],
        label: match[4].replace(/"/g, "'").replace(/\n/g, " "),
      });
    }
    // Try alternate key order: index, score, label, role
    if (objects.length === 0) {
      const altRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"score"\s*:\s*([\d.]+)\s*,\s*"label"\s*:\s*"([\s\S]*?)"\s*,\s*"role"\s*:\s*"([^"]*?)"\s*\}/g;
      while ((match = altRegex.exec(sanitized)) !== null) {
        objects.push({
          index: parseInt(match[1]),
          score: parseFloat(match[2]),
          label: match[3].replace(/"/g, "'").replace(/\n/g, " "),
          role: match[4],
        });
      }
    }
    if (objects.length > 0) {
      console.warn(`Scoring: recovered ${objects.length} frames via regex extraction after JSON.parse failure`);
      return objects;
    }
  } catch {
    // fall through
  }

  // Final attempt: strip everything outside [] and retry
  try {
    const bracketMatch = extractBalancedJSON(sanitized, "[");
    if (bracketMatch) {
      sanitized = bracketMatch
        .replace(/,\s*\]/g, "]")
        .replace(/,\s*\}/g, "}");
      return JSON.parse(sanitized);
    }
  } catch {
    // fall through
  }

  throw new SyntaxError(`Failed to parse scoring JSON after all sanitization attempts: ${raw.slice(0, 200)}`);
}
