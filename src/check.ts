/** Per-citation integrity check: liveness, archive, quote presence, optional stance. */
import { extractText, quoteMatch, type QuoteMatch } from "./text";

export type Fetcher = (input: string | Request, init?: RequestInit) => Promise<Response>;

export type Stance = {
  stance: "supports" | "contradicts" | "unclear";
  confidence: number;
  evidence: string;
};

/** Judge whether `pageText` supports `claim`. Injected so tests and the free lane never call an LLM. */
export type Judge = (claim: string, pageText: string) => Promise<Stance>;

export type Item = {
  url: string;
  /** Verbatim text the caller says is on the page. */
  quote?: string;
  /** The assertion the citation is supposed to support. Only used when a judge is provided. */
  claim?: string;
};

export type Verdict = "verified" | "live" | "drift" | "contradicted" | "unclear" | "dead" | "invalid";

export type Result = {
  url: string;
  final_url?: string;
  status: "live" | "dead" | "unreachable" | "invalid";
  http_status?: number;
  content_type?: string;
  archived?: { available: boolean; url?: string; timestamp?: string };
  quote?: QuoteMatch;
  stance?: Stance;
  verdict: Verdict;
  error?: string;
  ms: number;
};

export type CheckOptions = {
  fetch: Fetcher;
  judge?: Judge;
  timeoutMs?: number;
  /** Max characters of page text to keep. */
  maxChars?: number;
};

const UA = "citecheck/0.1 (+https://citecheck.dev; citation integrity checker)";

export async function checkItem(item: Item, opts: CheckOptions): Promise<Result> {
  const t0 = Date.now();
  const done = (r: Omit<Result, "ms" | "url">): Result => ({ url: item.url, ...r, ms: Date.now() - t0 });

  let parsed: URL;
  try {
    parsed = new URL(item.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported scheme");
  } catch (e) {
    return done({ status: "invalid", verdict: "invalid", error: `invalid url: ${(e as Error).message}` });
  }

  const [page, archived] = await Promise.all([fetchPage(item.url, opts), wayback(item.url, opts)]);

  if (page.kind === "error") {
    return done({ status: "unreachable", archived, verdict: "dead", error: page.error });
  }

  const base = {
    final_url: page.finalUrl !== item.url ? page.finalUrl : undefined,
    http_status: page.status,
    content_type: page.contentType,
    archived,
  };

  if (page.status >= 400 || page.status === 0) {
    return done({ ...base, status: "dead", verdict: "dead" });
  }

  const quote = item.quote ? quoteMatch(item.quote, page.text) : undefined;

  let stance: Stance | undefined;
  if (item.claim && opts.judge) {
    try {
      stance = await opts.judge(item.claim, focusText(page.text, quote, opts.maxChars ?? 12000));
    } catch (e) {
      stance = { stance: "unclear", confidence: 0, evidence: `judge error: ${(e as Error).message}` };
    }
  }

  return done({ ...base, status: "live", quote, stance, verdict: verdictOf(quote, stance) });
}

export function verdictOf(quote: QuoteMatch | undefined, stance: Stance | undefined): Verdict {
  if (stance?.stance === "contradicts") return "contradicted";
  if (quote && !quote.found) return "drift";
  if (stance?.stance === "unclear") return "unclear";
  if (quote?.found || stance?.stance === "supports") return "verified";
  return "live";
}

/** Center the text sent to the judge on the matched snippet, when there is one. */
function focusText(text: string, quote: QuoteMatch | undefined, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (quote?.snippet) {
    const idx = text.toLowerCase().indexOf(quote.snippet.slice(0, 40).toLowerCase());
    if (idx >= 0) {
      const start = Math.max(0, idx - Math.floor(maxChars / 2));
      return text.slice(start, start + maxChars);
    }
  }
  return text.slice(0, maxChars);
}

type Page =
  | { kind: "ok"; status: number; finalUrl: string; contentType?: string; text: string }
  | { kind: "error"; error: string };

async function fetchPage(url: string, opts: CheckOptions): Promise<Page> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await opts.fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain,*/*;q=0.8" },
      signal: ctrl.signal,
    });
    const contentType = res.headers.get("content-type") ?? undefined;
    let text = "";
    if (res.ok) {
      const raw = await res.text();
      const cap = raw.slice(0, 2_000_000);
      text = contentType?.includes("html") || /<\/?[a-z][\s\S]*>/i.test(cap.slice(0, 2000)) ? extractText(cap) : cap.replace(/\s+/g, " ").trim();
    }
    return { kind: "ok", status: res.status, finalUrl: res.url || url, contentType, text };
  } catch (e) {
    const err = e as Error;
    return { kind: "error", error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function wayback(url: string, opts: CheckOptions): Promise<Result["archived"]> {
  try {
    const res = await opts.fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      headers: { "user-agent": UA },
    });
    if (!res.ok) return { available: false };
    const body = (await res.json()) as { archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } } };
    const c = body.archived_snapshots?.closest;
    if (c?.available) return { available: true, url: c.url, timestamp: c.timestamp };
    return { available: false };
  } catch {
    return { available: false };
  }
}
