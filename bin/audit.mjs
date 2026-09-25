#!/usr/bin/env node
/**
 * Citation audit: extract every http(s) URL from a document (file path or URL) and run them
 * through citecheck's free lane in batches of 3. Prints a breakage report.
 *
 *   node bin/audit.mjs <file-or-url> [--api http://localhost:8787] [--max 60]
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const api = (args.includes("--api") ? args[args.indexOf("--api") + 1] : process.env.CITECHECK_URL) ?? "http://localhost:8787";
const max = Number(args.includes("--max") ? args[args.indexOf("--max") + 1] : 60);
if (!src) {
  console.error("usage: audit.mjs <file-or-url> [--api URL] [--max N]");
  process.exit(2);
}

const text = /^https?:\/\//.test(src) ? await (await fetch(src, { headers: { "user-agent": "citecheck-audit/0.1" } })).text() : readFileSync(src, "utf8");

const urlRe = /https?:\/\/[^\s<>"'()\]\[]+/g;
const seen = new Set();
const urls = [];
for (const m of text.matchAll(urlRe)) {
  let u = m[0].replace(/[.,;:!?]+$/, "");
  if (/^https?:\/\/(www\.)?(w3\.org|schema\.org|fonts\.|cdn\.|ajax\.)/.test(u)) continue;
  if (/\.(css|js|png|jpe?g|gif|svg|ico|woff2?)(\?|$)/i.test(u)) continue;
  if (seen.has(u)) continue;
  seen.add(u);
  urls.push(u);
  if (urls.length >= max) break;
}

console.error(`source: ${src}\nunique urls: ${urls.length} (cap ${max})\napi: ${api}\n`);
const results = [];
for (let i = 0; i < urls.length; i += 3) {
  const items = urls.slice(i, i + 3).map((url) => ({ url }));
  const res = await fetch(`${api}/v1/check/free`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
  if (!res.ok) {
    console.error(`batch ${i / 3 + 1} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  const body = await res.json();
  results.push(...body.results);
  process.stderr.write(`\rchecked ${results.length}/${urls.length}`);
}
process.stderr.write("\n\n");

const counts = {};
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
const dead = results.filter((r) => r.verdict === "dead" || r.verdict === "invalid");
const archivedDead = dead.filter((r) => r.archived?.available).length;

console.log(`# Citation audit\n`);
console.log(`Source: ${src}`);
console.log(`URLs checked: ${results.length}`);
console.log(`Verdicts: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
console.log(`Broken: ${dead.length} (${results.length ? Math.round((100 * dead.length) / results.length) : 0}%), of which ${archivedDead} recoverable from the Wayback Machine\n`);
if (dead.length) {
  console.log(`## Broken links\n`);
  for (const r of dead) console.log(`- ${r.url} (${r.status}${r.http_status ? " " + r.http_status : ""}${r.archived?.available ? ", archive: " + r.archived.url : ""})`);
}
