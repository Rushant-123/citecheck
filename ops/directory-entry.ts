// Entry for tempoxyz/mpp `schemas/services.ts`. Replace SERVICE_URL after deploy.
// PR template: https://github.com/tempoxyz/mpp/blob/main/.github/PULL_REQUEST_TEMPLATE/service.md
// Then: pnpm generate:discovery && pnpm check:types && pnpm build

const SERVICE_URL = "https://citecheck.citecheck.workers.dev";

export const citecheck = {
  id: "citecheck",
  name: "citecheck",
  url: SERVICE_URL,
  serviceUrl: SERVICE_URL,
  description:
    "Citation integrity checks for agents: is each cited URL alive, archived, and does it still contain the quoted text; optional support/contradict verdict per claim. Composes with any search API.",
  categories: ["ai", "data"],
  integration: "first-party",
  tags: ["citations", "verification", "fact-check", "hallucination", "provenance", "research"],
  docs: {
    homepage: SERVICE_URL,
    llmsTxt: `${SERVICE_URL}/llms.txt`,
    apiReference: `${SERVICE_URL}/openapi.json`,
  },
  provider: "citecheck",
  realm: "citecheck.citecheck.workers.dev",
  intent: "charge",
  payments: ["TEMPO_PAYMENT"],
  endpoints: [
    { route: "POST /v1/check", desc: "Verify up to 10 citations: liveness, Wayback archive, quote drift", amount: "20000" },
    { route: "POST /v1/check/stance", desc: "Same, plus an LLM support/contradict verdict per claim", amount: "100000" },
  ],
};
