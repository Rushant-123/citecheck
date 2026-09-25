#!/usr/bin/env bash
# Converts MPP Credits into USDC.e in your own Tempo wallet by paying citecheck's own 10-cent stance
# challenge with credits N times. Run it yourself: it moves your money. Usage: bin/credits-to-tokens.sh 10
set -euo pipefail
N="${1:-1}"; T="$HOME/.tempo/bin/tempo"; H="$(mktemp)"
for i in $(seq 1 "$N"); do
  "$T" request --dry-run -D "$H" -X POST --json '{"items":[{"url":"https://example.com"}]}' https://citecheck.citecheck.workers.dev/v1/check/stance >/dev/null 2>&1 || true
  "$T" wallet transfer --credits --mpp-challenge-file "$H" --format yaml | grep -E "tx_hash|amount_cents" | tr '\n' ' '; echo " (pass $i/$N)"
done
"$T" wallet whoami --format yaml | grep -E "available" | head -1
"$T" wallet whoami --credits --format yaml | grep balance | head -1
