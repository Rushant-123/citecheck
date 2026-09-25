#!/usr/bin/env node
/**
 * Ops check, run by the scheduled routine. Reads the public ledger, appends a line to ops/log.md,
 * and exits non-zero when the kill rule has fired so the routine knows to stop serving.
 *
 *   node bin/ops.mjs [--api https://citecheck.rushant.workers.dev] [--launch 2026-09-26] [--kill-days 14]
 */
import { appendFileSync, readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const api = opt("--api", process.env.CITECHECK_URL ?? "https://citecheck.rushant.workers.dev");
const launch = new Date(opt("--launch", existsSync("ops/LAUNCH") ? readFileSync("ops/LAUNCH", "utf8").trim() : new Date().toISOString().slice(0, 10)));
const killDays = Number(opt("--kill-days", 14));

const res = await fetch(`${api}/ledger`);
if (!res.ok) {
  console.error(`ledger unreachable: ${res.status}`);
  process.exit(3);
}
const { totals } = await res.json();
const days = Math.floor((Date.now() - launch.getTime()) / 86400000);
const paid = (totals.paid_calls ?? 0) + (totals.paid_stance_calls ?? 0);
const conv = totals.challenges_402 ? Math.round((100 * paid) / totals.challenges_402) : 0;
const line = `| ${new Date().toISOString().slice(0, 16)} | day ${days} | free ${totals.free_calls} | 402s ${totals.challenges_402} | paid ${paid} | conv ${conv}% | urls ${totals.urls_checked} | revenue $${((totals.revenue_usd_cents ?? 0) / 100).toFixed(2)} |`;
if (!existsSync("ops/log.md")) appendFileSync("ops/log.md", "# Ops log\n\n| when | day | free | 402s | paid | conv | urls | revenue |\n|---|---|---|---|---|---|---|---|\n");
appendFileSync("ops/log.md", line + "\n");
console.log(line);

if (days >= killDays && paid === 0) {
  console.log(`KILL RULE FIRED: day ${days} >= ${killDays} with zero paid calls. Stop serving and write the post-mortem.`);
  process.exit(1);
}
console.log(`status: alive (${killDays - days} days until kill check${paid > 0 ? ", has revenue" : ""})`);
