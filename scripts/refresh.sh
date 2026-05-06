#!/usr/bin/env bash
# Refresh NRF data, merge confirmed scores into season.json,
# and (if anything changed) auto-commit + push to origin/main.
#
# Safety: refuses to commit if any file outside data/ has changed.

set -euo pipefail

cd "$(dirname "$0")/.."

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "refresh: not on main (on '$branch') — aborting" >&2
  exit 1
fi

# Refuse to start if working tree already has uncommitted changes —
# we don't want to bundle unrelated work into the auto-commit.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "refresh: working tree dirty — clean it up first" >&2
  git status --short >&2
  exit 1
fi

echo "==> pulling main..."
git pull --ff-only origin main

echo "==> scraping NRF..."
node scripts/scrape-nrf.js

echo "==> merging NRF results into season.json..."
node scripts/merge-nrf.js

# What changed?
changed="$(git status --porcelain)"
if [[ -z "$changed" ]]; then
  echo "==> nothing to commit"
  exit 0
fi

# Only data/ allowed in the auto-commit.
non_data="$(git status --porcelain | awk '{print $2}' | grep -v '^data/' || true)"
if [[ -n "$non_data" ]]; then
  echo "refresh: refusing to auto-commit — files outside data/ changed:" >&2
  echo "$non_data" >&2
  exit 1
fi

echo "==> committing data changes..."
git add data/
today="$(date +%Y-%m-%d)"
git commit -m "refresh: NRF data ${today}"

echo "==> pushing to origin/main..."
git push origin main

echo "==> done"
