#!/usr/bin/env node
/**
 * citecheck MCP server (stdio). One tool: check_citations.
 * Calls the hosted API's free lane by default; set CITECHECK_URL to point elsewhere.
 * Paid lanes need an MPP wallet on the client side, which is out of scope for this wrapper.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const DEFAULT_URL = "https://citecheck.citecheck.workers.dev";

const ItemSchema = z.object({
  url: z.string().url().describe("The cited URL"),
  quote: z.string().max(2000).optional().describe("Verbatim text the citation is expected to contain"),
  claim: z.string().max(2000).optional().describe("The assertion this citation supports"),
});

export type CheckInput = { items: z.infer<typeof ItemSchema>[] };

export async function runCheck(input: CheckInput, baseUrl = process.env.CITECHECK_URL ?? DEFAULT_URL, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/v1/check/free`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "citecheck-mcp/0.1" },
    body: JSON.stringify({ items: input.items }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`citecheck ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as { lane: string; results: unknown[] };
}

export function summarize(results: { url: string; verdict: string; http_status?: number; archived?: { available: boolean; url?: string }; quote?: { found: boolean; score: number } }[]): string {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const head = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  const lines = results.map((r) => {
    const bits = [r.verdict.toUpperCase(), r.http_status ? `HTTP ${r.http_status}` : ""];
    if (r.quote) bits.push(`quote ${r.quote.found ? "found" : "missing"} (${r.quote.score})`);
    if (r.archived?.available) bits.push(`archive: ${r.archived.url}`);
    return `- ${r.url}: ${bits.filter(Boolean).join(", ")}`;
  });
  return `${head}\n${lines.join("\n")}`;
}

export function createServer() {
  const server = new McpServer({ name: "citecheck", version: "0.1.0" });
  server.registerTool(
    "check_citations",
    {
      title: "Check citations",
      description:
        "Verify up to 3 cited URLs: is each alive, is there a Wayback archive, and is the quoted text actually on the page. Use after producing any answer with sources. Returns a verdict per URL: verified, drift (page live but quote missing), dead, or invalid.",
      inputSchema: { items: z.array(ItemSchema).min(1).max(3) },
    },
    async ({ items }) => {
      const out = await runCheck({ items });
      const results = out.results as Parameters<typeof summarize>[0];
      return {
        content: [{ type: "text", text: summarize(results) }],
        structuredContent: { results },
      };
    },
  );
  return server;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}
