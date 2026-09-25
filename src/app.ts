/** citecheck HTTP app. Two lanes: free (3 items, no stance) and paid via MPP (Tempo). */
import { Hono } from "hono";
import { Mppx, tempo } from "mppx/hono";
import { generate as generateOpenApi } from "mppx/discovery";
import { checkItem, type Fetcher, type Item, type Judge, type Result } from "./check";
import { makeJudge } from "./stance";

export type Env = {
  MPP_SECRET_KEY: string;
  /** Tempo wallet address that receives payments. */
  RECIPIENT: string;
  /** "true" to charge on Tempo testnet (pathUSD) instead of mainnet USDC.e. */
  TESTNET?: string;
  ANTHROPIC_API_KEY: string;
  LEDGER: KVNamespace;
};

export const PRICING = {
  /** USD per request, up to MAX_ITEMS URLs, liveness + archive + quote. */
  check: "0.02",
  /** USD per request, up to MAX_ITEMS URLs, adds an LLM stance verdict per claim. */
  check_stance: "0.10",
  max_items: 10,
  free_max_items: 3,
} as const;

/** USDC.e on Tempo mainnet; pathUSD on testnet. */
const CURRENCY = {
  mainnet: "0x20C000000000000000000000b9537d11c60E8b50",
  testnet: "0x20c0000000000000000000000000000000000000",
} as const;

type Deps = {
  fetch: Fetcher;
  /** Overrides the Anthropic judge (tests). When absent, one is built from ANTHROPIC_API_KEY. */
  judge?: Judge;
};

type Body = { items: Item[]; stance?: boolean };

function parseBody(raw: unknown, maxItems: number): { ok: true; body: Body } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.items)) return { ok: false, error: "items must be an array" };
  if (b.items.length === 0) return { ok: false, error: "items must not be empty" };
  if (b.items.length > maxItems) return { ok: false, error: `at most ${maxItems} items per request` };
  const items: Item[] = [];
  for (const it of b.items as unknown[]) {
    if (!it || typeof it !== "object") return { ok: false, error: "each item must be an object" };
    const o = it as Record<string, unknown>;
    if (typeof o.url !== "string" || !o.url) return { ok: false, error: "each item needs a string url" };
    const item: Item = { url: o.url };
    if (o.quote !== undefined) {
      if (typeof o.quote !== "string") return { ok: false, error: "quote must be a string" };
      item.quote = o.quote.slice(0, 2000);
    }
    if (o.claim !== undefined) {
      if (typeof o.claim !== "string") return { ok: false, error: "claim must be a string" };
      item.claim = o.claim.slice(0, 2000);
    }
    items.push(item);
  }
  return { ok: true, body: { items, stance: b.stance === true } };
}

async function bump(kv: KVNamespace, key: string, by = 1): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  for (const k of [`total:${key}`, `day:${day}:${key}`]) {
    const cur = Number((await kv.get(k)) ?? "0");
    await kv.put(k, String(cur + by));
  }
}

const LEDGER_KEYS = ["free_calls", "challenges_402", "paid_calls", "paid_stance_calls", "urls_checked", "revenue_usd_cents"] as const;

export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env }>();

  const run = async (env: Env, body: Body, withStance: boolean): Promise<Result[]> => {
    const judge = withStance ? (deps.judge ?? (env.ANTHROPIC_API_KEY ? makeJudge(env.ANTHROPIC_API_KEY) : undefined)) : undefined;
    const results = await Promise.all(body.items.map((it) => checkItem(it, { fetch: deps.fetch, judge })));
    await bump(env.LEDGER, "urls_checked", results.length);
    return results;
  };

  app.get("/", (c) => c.redirect("/llms.txt"));
  app.get("/health", (c) => c.json({ ok: true }));

  const paymentOptions = (env: Env, price: string, description: string) => {
    const testnet = env.TESTNET === "true";
    return { amount: price, currency: testnet ? CURRENCY.testnet : CURRENCY.mainnet, decimals: 6, recipient: env.RECIPIENT, description };
  };

  /** MPP discovery document (OpenAPI 3.1 with x-payment-info). Required by `mppx validate` and the directory. */
  app.get("/openapi.json", (c) => {
    const origin = new URL(c.req.url).origin;
    const mppx = Mppx.create({ methods: [tempo.charge({ testnet: c.env.TESTNET === "true" })], secretKey: c.env.MPP_SECRET_KEY, realm: new URL(origin).hostname });
    const requestBody = {
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["items"],
            properties: {
              items: {
                type: "array",
                maxItems: PRICING.max_items,
                items: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    quote: { type: "string", description: "verbatim text expected on the page" },
                    claim: { type: "string", description: "assertion this citation supports (stance lane)" },
                  },
                },
              },
            },
          },
        },
      },
    };
    const doc = generateOpenApi(
      { methods: mppx.methods, realm: mppx.realm },
      {
        info: { title: "citecheck", version: "0.1.0" },
        serviceInfo: { categories: ["ai", "data"], docs: { homepage: origin, llms: `${origin}/llms.txt`, apiReference: `${origin}/openapi.json` } },
        routes: [
          { intent: "charge", method: "POST", path: "/v1/check", options: paymentOptions(c.env, PRICING.check, "Verify up to 10 citations: liveness, archive, quote drift"), requestBody, summary: "Check citations" },
          { intent: "charge", method: "POST", path: "/v1/check/stance", options: paymentOptions(c.env, PRICING.check_stance, "Verify up to 10 citations with an LLM stance verdict per claim"), requestBody, summary: "Check citations with stance" },
        ],
      },
    );
    return c.json(doc);
  });

  app.get("/llms.txt", (c) => c.text(LLMS_TXT(new URL(c.req.url).origin)));

  app.get("/ledger", async (c) => {
    const totals: Record<string, number> = {};
    for (const k of LEDGER_KEYS) totals[k] = Number((await c.env.LEDGER.get(`total:${k}`)) ?? "0");
    return c.json({ totals, pricing: PRICING, updated: new Date().toISOString() });
  });

  app.post("/v1/check/free", async (c) => {
    const parsed = parseBody(await c.req.json().catch(() => null), PRICING.free_max_items);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const results = await run(c.env, parsed.body, false);
    await bump(c.env.LEDGER, "free_calls");
    return c.json({ lane: "free", results });
  });

  // Paid lanes. Middleware is built per request because the recipient and network come from env bindings.
  const paid = (price: string, withStance: boolean, ledgerKey: "paid_calls" | "paid_stance_calls") =>
    app.post(withStance ? "/v1/check/stance" : "/v1/check", async (c, next) => {
      const testnet = c.env.TESTNET === "true";
      const mppx = Mppx.create({
        methods: [tempo.charge({ testnet })],
        secretKey: c.env.MPP_SECRET_KEY,
      });
      const gate = mppx.charge(
        paymentOptions(c.env, price, withStance ? "citecheck: verify up to 10 citations with stance" : "citecheck: verify up to 10 citations"),
      );
      const out = await gate(c, next);
      const status = out instanceof Response ? out.status : c.res?.status;
      if (status === 402) await bump(c.env.LEDGER, "challenges_402");
      return out instanceof Response ? out : undefined;
    }, async (c) => {
      const parsed = parseBody(await c.req.json().catch(() => null), PRICING.max_items);
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const results = await run(c.env, parsed.body, withStance);
      await bump(c.env.LEDGER, ledgerKey);
      await bump(c.env.LEDGER, "revenue_usd_cents", Math.round(Number(price) * 100));
      return c.json({ lane: withStance ? "paid_stance" : "paid", results });
    });

  paid(PRICING.check, false, "paid_calls");
  paid(PRICING.check_stance, true, "paid_stance_calls");

  return app;
}

const LLMS_TXT = (origin: string) => `# citecheck

Citation integrity checks for AI agents. Send URLs plus the quote or claim each one is supposed to support.
Get back, per URL: alive or dead, archived copy on the Wayback Machine, whether the quote is actually on the page,
and (paid stance lane) whether the page supports or contradicts the claim.

Composes with any search or research API. Deterministic where possible; an LLM is used only for stance.

## Endpoints

POST ${origin}/v1/check/free      free, max ${PRICING.free_max_items} items, no stance
POST ${origin}/v1/check           $${PRICING.check} per request via MPP (Tempo), max ${PRICING.max_items} items
POST ${origin}/v1/check/stance    $${PRICING.check_stance} per request via MPP (Tempo), max ${PRICING.max_items} items, adds stance per claim
GET  ${origin}/ledger             public usage and revenue counters
GET  ${origin}/health

## Request body

{"items":[{"url":"https://...","quote":"verbatim text expected on the page","claim":"the assertion this citation supports"}]}

quote and claim are optional. quote drives the drift check; claim drives the stance check (stance lane only).

## Response

{"lane":"paid","results":[{"url":"...","status":"live|dead|unreachable|invalid","http_status":200,
 "archived":{"available":true,"url":"https://web.archive.org/..."},
 "quote":{"found":true,"score":1,"snippet":"..."},
 "stance":{"stance":"supports|contradicts|unclear","confidence":0.9,"evidence":"..."},
 "verdict":"verified|live|drift|contradicted|unclear|dead|invalid","ms":412}]}

## Paying

Unpaid requests to paid endpoints return 402 with a WWW-Authenticate: Payment challenge (MPP).
With the tempo CLI: tempo request -X POST --json '{"items":[...]}' ${origin}/v1/check
`;
