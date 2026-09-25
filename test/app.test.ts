import { describe, expect, it } from "vitest";
import { createApp, type Env } from "../src/app";
import type { Fetcher } from "../src/check";

const okPage: Fetcher = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://archive.org/")) {
    return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 });
  }
  return new Response("<html><body>Water boils at 100 C at sea level.</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
};

class MemKV {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.store.set(k, v);
  }
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    MPP_SECRET_KEY: "test-secret-key-that-is-at-least-32-bytes-long!!",
    RECIPIENT: "0x0000000000000000000000000000000000000001",
    TESTNET: "true",
    ANTHROPIC_API_KEY: "",
    LEDGER: new MemKV() as unknown as KVNamespace,
    ...overrides,
  };
}

const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, e = env()) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, e);

describe("app", () => {
  it("serves llms.txt with pricing and endpoints", async () => {
    const app = createApp({ fetch: okPage });
    const res = await app.request("/llms.txt", {}, env());
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("/v1/check");
    expect(text).toContain("/v1/check/free");
  });

  it("serves an OpenAPI discovery document with payment info on paid routes", async () => {
    const app = createApp({ fetch: okPage });
    const res = await app.request("http://citecheck.test/openapi.json", {}, env());
    expect(res.status).toBe(200);
    const doc = (await res.json()) as any;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths["/v1/check"].post["x-payment-info"]).toBeTruthy();
    expect(doc.paths["/v1/check/stance"].post["x-payment-info"]).toBeTruthy();
    expect(doc["x-service-info"].docs.llms).toBe("http://citecheck.test/llms.txt");
  });

  it("free lane checks up to 3 items without payment", async () => {
    const app = createApp({ fetch: okPage });
    const res = await post(app, "/v1/check/free", {
      items: [{ url: "https://example.com/a", quote: "boils at 100 C" }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.results[0].verdict).toBe("verified");
    expect(body.lane).toBe("free");
  });

  it("free lane rejects more than 3 items", async () => {
    const app = createApp({ fetch: okPage });
    const items = [1, 2, 3, 4].map((i) => ({ url: `https://example.com/${i}` }));
    const res = await post(app, "/v1/check/free", { items });
    expect(res.status).toBe(400);
  });

  it("free lane never runs stance", async () => {
    const app = createApp({ fetch: okPage, judge: async () => ({ stance: "supports", confidence: 1, evidence: "" }) });
    const res = await post(app, "/v1/check/free", {
      items: [{ url: "https://example.com/a", claim: "water boils at 100 C" }],
      stance: true,
    });
    const body = (await res.json()) as any;
    expect(body.results[0].stance).toBeUndefined();
  });

  it("paid lane returns 402 with a Payment challenge when unpaid", async () => {
    const app = createApp({ fetch: okPage });
    const res = await post(app, "/v1/check", { items: [{ url: "https://example.com/a" }] });
    expect(res.status).toBe(402);
    expect(res.headers.get("www-authenticate") ?? "").toMatch(/payment/i);
  });

  it("validates the body shape", async () => {
    const app = createApp({ fetch: okPage });
    const res = await post(app, "/v1/check/free", { items: "nope" });
    expect(res.status).toBe(400);
  });

  it("records free calls in the ledger", async () => {
    const app = createApp({ fetch: okPage });
    const e = env();
    await post(app, "/v1/check/free", { items: [{ url: "https://example.com/a" }] }, e);
    const res = await app.request("/ledger", {}, e);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.totals.free_calls).toBe(1);
    expect(body.totals.challenges_402).toBe(0);
  });

  it("records 402 challenges in the ledger", async () => {
    const app = createApp({ fetch: okPage });
    const e = env();
    await post(app, "/v1/check", { items: [{ url: "https://example.com/a" }] }, e);
    const res = await app.request("/ledger", {}, e);
    const body = (await res.json()) as any;
    expect(body.totals.challenges_402).toBe(1);
  });
});
