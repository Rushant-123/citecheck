import { createApp } from "./app";

/** Cloudflare Worker entry. Real fetch, real judge (built from ANTHROPIC_API_KEY per request). */
const app = createApp({ fetch: (input, init) => fetch(input, init) });

export default app;
