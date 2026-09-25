import { describe, expect, it } from "vitest";
import { checkItem, type Fetcher } from "../src/check";

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>): Fetcher {
  return async (input) => {
    const url = typeof input === "string" ? input : input.url;
    for (const key of Object.keys(routes)) {
      if (url.startsWith(key)) return routes[key]();
    }
    return new Response("not found", { status: 404 });
  };
}

const html = (body: string) =>
  new Response(`<html><body>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  });

const wayback = (archived: boolean) => () =>
  new Response(
    JSON.stringify(
      archived
        ? { archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/2026/x", timestamp: "20260101000000" } } }
        : { archived_snapshots: {} },
    ),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("checkItem", () => {
  it("verifies a live page whose quote is present", async () => {
    const f = fakeFetch({
      "https://example.com/a": () => html("<p>Water boils at 100 C at sea level.</p>"),
      "https://archive.org/wayback/available": wayback(true),
    });
    const r = await checkItem({ url: "https://example.com/a", quote: "water boils at 100 C" }, { fetch: f });
    expect(r.status).toBe("live");
    expect(r.http_status).toBe(200);
    expect(r.quote?.found).toBe(true);
    expect(r.archived?.available).toBe(true);
    expect(r.verdict).toBe("verified");
  });

  it("marks a dead page", async () => {
    const f = fakeFetch({
      "https://archive.org/wayback/available": wayback(false),
    });
    const r = await checkItem({ url: "https://example.com/gone", quote: "anything" }, { fetch: f });
    expect(r.status).toBe("dead");
    expect(r.http_status).toBe(404);
    expect(r.archived?.available).toBe(false);
    expect(r.verdict).toBe("dead");
  });

  it("flags drift when the page is live but the quote is missing", async () => {
    const f = fakeFetch({
      "https://example.com/b": () => html("<p>Completely different content now.</p>"),
      "https://archive.org/wayback/available": wayback(true),
    });
    const r = await checkItem({ url: "https://example.com/b", quote: "the original claim text" }, { fetch: f });
    expect(r.status).toBe("live");
    expect(r.quote?.found).toBe(false);
    expect(r.verdict).toBe("drift");
  });

  it("reports live without a verdict on the quote when no quote is given", async () => {
    const f = fakeFetch({
      "https://example.com/c": () => html("<p>hi</p>"),
      "https://archive.org/wayback/available": wayback(false),
    });
    const r = await checkItem({ url: "https://example.com/c" }, { fetch: f });
    expect(r.status).toBe("live");
    expect(r.quote).toBeUndefined();
    expect(r.verdict).toBe("live");
  });

  it("handles network errors as unreachable", async () => {
    const f: Fetcher = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await checkItem({ url: "https://example.com/d", quote: "x" }, { fetch: f });
    expect(r.status).toBe("unreachable");
    expect(r.verdict).toBe("dead");
    expect(r.error).toContain("ECONNRESET");
  });

  it("rejects non-http URLs without fetching", async () => {
    const f: Fetcher = async () => {
      throw new Error("should not fetch");
    };
    const r = await checkItem({ url: "ftp://example.com/x" }, { fetch: f });
    expect(r.status).toBe("invalid");
    expect(r.verdict).toBe("invalid");
  });

  it("uses the stance judge when a claim is given and stance is requested", async () => {
    const f = fakeFetch({
      "https://example.com/e": () => html("<p>The bridge opened in 1937 after four years of construction.</p>"),
      "https://archive.org/wayback/available": wayback(false),
    });
    const judge = async () => ({ stance: "supports" as const, confidence: 0.9, evidence: "opened in 1937" });
    const r = await checkItem(
      { url: "https://example.com/e", claim: "The bridge opened in 1937", quote: "opened in 1937" },
      { fetch: f, judge },
    );
    expect(r.stance?.stance).toBe("supports");
    expect(r.verdict).toBe("verified");
  });

  it("marks contradicted when the judge says the page contradicts the claim", async () => {
    const f = fakeFetch({
      "https://example.com/f": () => html("<p>The bridge opened in 1957.</p>"),
      "https://archive.org/wayback/available": wayback(false),
    });
    const judge = async () => ({ stance: "contradicts" as const, confidence: 0.85, evidence: "opened in 1957" });
    const r = await checkItem({ url: "https://example.com/f", claim: "The bridge opened in 1937" }, { fetch: f, judge });
    expect(r.verdict).toBe("contradicted");
  });
});
