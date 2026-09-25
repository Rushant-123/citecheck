/** Deterministic text utilities: HTML to text, normalization, quote matching. No network, no LLM. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#?\w+);/g, (m, name: string) => {
    if (name in ENTITIES) return ENTITIES[name];
    if (name.startsWith("#x") || name.startsWith("#X")) {
      const code = parseInt(name.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    if (name.startsWith("#")) {
      const code = parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

/** Strip scripts, styles and tags; collapse whitespace. Good enough for quote matching, not for rendering. */
export function extractText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withoutTags = withoutBlocks.replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/** Lowercase, fold typographic punctuation, strip everything that is not a letter, digit or space. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type QuoteMatch = {
  /** true when score >= FOUND_THRESHOLD */
  found: boolean;
  /** 0..1, 1 = exact (after normalization) */
  score: number;
  /** the best-matching window of the original page text, when any */
  snippet?: string;
};

export const FOUND_THRESHOLD = 0.8;

/**
 * Does `quote` appear in `text`?
 * Exact normalized containment scores 1. Otherwise slide a window of the
 * quote's word length over the page and score by the fraction of quote words
 * present in the window, in order (LCS over tokens). Cheap and deterministic.
 */
export function quoteMatch(quote: string, text: string): QuoteMatch {
  const q = normalize(quote);
  if (!q) return { found: false, score: 0 };
  const t = normalize(text);
  if (!t) return { found: false, score: 0 };

  const exactIdx = t.indexOf(q);
  if (exactIdx >= 0) {
    return { found: true, score: 1, snippet: snippetAround(text, quote, exactIdx, t) };
  }

  const qw = q.split(" ");
  const tw = t.split(" ");
  if (tw.length === 0) return { found: false, score: 0 };

  const win = Math.min(Math.max(qw.length, 3), tw.length);
  let best = 0;
  let bestAt = 0;
  // Sliding window; a slightly larger window helps when the page inserts a word or two.
  const wide = Math.min(Math.ceil(win * 1.3) + 1, tw.length);
  for (let i = 0; i + win <= tw.length; i++) {
    const s = lcsRatio(qw, tw.slice(i, i + wide));
    if (s > best) {
      best = s;
      bestAt = i;
      if (best === 1) break;
    }
  }
  const snippet = best > 0.3 ? tw.slice(bestAt, bestAt + wide).join(" ") : undefined;
  return { found: best >= FOUND_THRESHOLD, score: round(best), snippet };
}

/** Longest common subsequence of tokens, divided by quote length. */
function lcsRatio(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n] / m;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Best-effort: return the original-cased region of the page around the match. */
function snippetAround(original: string, quote: string, normIdx: number, normText: string): string {
  // Approximate: normalized and original share roughly the same character offsets ratio.
  const ratio = original.length / Math.max(normText.length, 1);
  const start = Math.max(0, Math.floor(normIdx * ratio) - 40);
  const end = Math.min(original.length, start + quote.length + 120);
  const raw = original.slice(start, end).replace(/\s+/g, " ").trim();
  // Prefer an exact-cased hit when it exists.
  const direct = original.toLowerCase().indexOf(quote.toLowerCase());
  if (direct >= 0) {
    const s = Math.max(0, direct - 40);
    return original.slice(s, direct + quote.length + 40).replace(/\s+/g, " ").trim();
  }
  return raw;
}
