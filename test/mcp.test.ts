import { describe, expect, it } from "vitest";
import { runCheck, summarize } from "../mcp/server";

describe("mcp wrapper", () => {
  it("posts items to the free lane and returns parsed results", async () => {
    let captured: { url: string; body: string } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      captured = { url, body: String(init?.body) };
      return new Response(JSON.stringify({ lane: "free", results: [{ url: "https://a", verdict: "verified" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await runCheck({ items: [{ url: "https://a", quote: "x" }] }, "https://api.test/", fetchImpl);
    expect(captured?.url).toBe("https://api.test/v1/check/free");
    expect(JSON.parse(captured!.body).items[0].quote).toBe("x");
    expect(out.results).toHaveLength(1);
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 400 })) as unknown as typeof fetch;
    await expect(runCheck({ items: [{ url: "https://a" }] }, "https://api.test", fetchImpl)).rejects.toThrow(/400/);
  });

  it("summarizes verdict counts and per-url lines", () => {
    const s = summarize([
      { url: "https://a", verdict: "verified", http_status: 200, quote: { found: true, score: 1 } },
      { url: "https://b", verdict: "dead", http_status: 404, archived: { available: true, url: "https://web.archive.org/x" } },
    ]);
    expect(s.split("\n")[0]).toContain("1 verified");
    expect(s.split("\n")[0]).toContain("1 dead");
    expect(s).toContain("archive: https://web.archive.org/x");
    expect(s).toContain("quote found (1)");
  });
});
