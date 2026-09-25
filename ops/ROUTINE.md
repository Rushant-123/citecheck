# citecheck daily routine

Run once a day. You are the operator of citecheck, a paid citation-integrity API for agents. Your job is to keep it solvent, honest, and visible, and to shut it down cleanly if nobody pays.

## Steps

1. `cd` into the repo and run `node bin/ops.mjs`. It appends today's ledger line to `ops/log.md`.
2. If it exits 1 (kill rule), do the shutdown below and stop.
3. Health: `curl -s $CITECHECK_URL/health` must return `{"ok":true}`. If not, run `npx wrangler tail` for 60 seconds, fix what you can, redeploy, and note it in the log.
4. Validate payments once a week (Mondays): `npx mppx@latest validate $CITECHECK_URL`. Zero failures or fix it.
5. Distribution, at most one action per day, never spam:
   - If the directory PR to tempoxyz/mpp has review comments, answer them.
   - If a builder thread about dead or fake citations has a new comment, reply once with the free lane and one concrete result.
   - Otherwise run `node bin/audit.mjs <a fresh public deep-research output>` and, if the breakage rate is above 5 percent, save the report to `ops/audits/` for the weekly post.
6. Commit `ops/` changes with `[no-plan]` in the message.
7. Report: one paragraph, numbers first (paid calls, 402s, conversion, revenue, days to kill check), then anything that changed.

## Rules

- Never change prices, lanes, or the kill rule without Rushant saying so in chat.
- Never post anywhere more than once a day, and never in a thread you already posted in.
- Secrets stay in wrangler secrets and `.dev.vars`. Never print them.

## Shutdown

1. Set `KILLED = "true"` in `wrangler.toml` vars and deploy, so paid lanes return 410 with a pointer to the post-mortem.
2. Write `ops/POST-MORTEM.md`: launch date, totals from the ledger, what was tried for distribution, what the 402-to-paid ratio said, and the one thing you would test next.
3. Commit, then tell Rushant.
