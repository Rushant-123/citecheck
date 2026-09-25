#!/usr/bin/env bash
# Local daily operator, run by launchd (ai.citecheck.daily). Replaces the cloud routine, whose sandbox
# cannot reach workers.dev. Appends the ledger line, then lets claude -p handle the judgment calls.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p ops/runs
stamp="$(date -u +%Y-%m-%dT%H-%MZ)"
log="ops/runs/$stamp.md"

{
  echo "# citecheck daily run $stamp"
  echo
  echo '## ops.mjs'
  node bin/ops.mjs 2>&1
  rc=$?
  echo
  echo "exit=$rc"
} > "$log"

# Summarise and decide with claude -p (headless). Never posts; never spends. Output appended to the run log.
claude -p --model claude-sonnet-5 --allowedTools "Bash(curl:*),Bash(node bin/ops.mjs*),Read,Write" \
  "$(cat ops/ROUTINE.md)

Today's ops.mjs output is in $log (read it first). Steps 3 to 5 of the routine are what you may do now; skip distribution (step 5) unless ops/DISTRIBUTION_OK exists. Do not commit. Finish with the one-paragraph report." >> "$log" 2>&1

git add ops >/dev/null 2>&1
git -c user.name="citecheck-ops" -c user.email="subs@saasden.club" commit -q -m "ops: daily run $stamp [no-plan]" >/dev/null 2>&1 || true
git -c credential.helper='!gh auth git-credential' push -q >/dev/null 2>&1 || true
