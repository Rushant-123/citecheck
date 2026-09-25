# citecheck

Citation integrity checks for AI agents, sold per call.

Send URLs plus the quote or claim each one is supposed to support. Get back, per URL: alive or dead, archived copy on the Wayback Machine, whether the quote is actually on the page, and (stance lane) whether the page supports or contradicts the claim. Deterministic where possible. One Haiku call per claim (via OpenRouter) on the stance lane only.

## Why this and not "another research API"

Exa, Tavily, Parallel, Perplexity, Linkup and Tako already sell keyless cited search at about $0.01 a call. The complaint builders actually voice is different: citations that are dead, fake, or no longer say what the agent claimed. citecheck composes with any of those providers instead of competing with them.

## Lanes and prices

| Route | Price | Limit | What runs |
|---|---|---|---|
| `POST /v1/check/free` | free | 3 items | liveness, archive, quote drift |
| `POST /v1/check` | $0.02 per request | 10 items | same |
| `POST /v1/check/stance` | $0.10 per request | 10 items | adds stance per claim (Haiku) |

Payment is MPP (Machine Payments Protocol) on Tempo, USDC.e on mainnet. Unpaid requests return a 402 with a `WWW-Authenticate: Payment` challenge. `GET /openapi.json` is the discovery document, `GET /llms.txt` the agent-facing docs, `GET /ledger` the public counters.

## Unit economics

- Base lane: fetches only. Cost is Workers CPU, effectively zero. Price $0.002 per URL.
- Stance lane: one Haiku 4.5 call per claim, about 3k input tokens, under $0.004. Price $0.01 per URL.

## Run locally

```
npm install
cp .dev.vars.example .dev.vars   # fill MPP_SECRET_KEY (32+ bytes) and OPENROUTER_API_KEY
npm test
npm run dev                       # http://localhost:8787
npx mppx@latest validate http://localhost:8787
```

## Deploy

```
npx wrangler login
npx wrangler kv namespace create LEDGER      # paste the id into wrangler.toml
npx wrangler secret put MPP_SECRET_KEY
npx wrangler secret put OPENROUTER_API_KEY
# set RECIPIENT in wrangler.toml to the Tempo wallet address, TESTNET = "false"
npm run deploy
npx mppx@latest validate https://<worker-url>
```

## Demand test (14 days from deploy)

Signal is paying wallets and repeat callers, not listings. Counters live at `/ledger`.

1. Deploy on mainnet, validate, and make one paid call from a second wallet.
2. Directory PR: https://github.com/tempoxyz/mpp/pull/1012 (open). MPPScan: registered, https://www.mppscan.com/server/724eb637032ea5e47a46aecba83ae5b8f0e7b958ae90df4a63fd0dc1e7721707 and https://tryponcho.com/m/citecheck.citecheck.workers.dev
3. Post `llms.txt` where deep-research and content-agent builders already complain about dead citations.
4. Kill rule: zero paid calls from strangers in 14 days means stop serving and write the post-mortem into this README.

## Layout

- `src/text.ts` HTML to text, normalization, LCS quote matcher
- `src/check.ts` per-URL check, verdict rules
- `src/stance.ts` Haiku judge via OpenRouter
- `src/app.ts` Hono app, lanes, ledger, discovery
- `test/` 26 vitest tests, no network
