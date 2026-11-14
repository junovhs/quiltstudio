#!/bin/sh
# Build and deploy to Cloudflare Pages after each commit on main.
# Runs in the background; output goes to .wrangler/deploy.log
cd "$(git rev-parse --show-toplevel)" || exit 0
[ "$(git symbolic-ref --short -q HEAD)" = "main" ] || exit 0
mkdir -p .wrangler
(
  echo "=== $(date) $(git rev-parse --short HEAD)"
  npm run deploy -- --commit-hash="$(git rev-parse HEAD)" --commit-message="$(git log -1 --format=%s)" 2>&1 \
    && command -v notify-send >/dev/null && notify-send "QuiltStudio deployed" "https://quiltstudio-34v.pages.dev"
) >> .wrangler/deploy.log 2>&1 &
echo "autodeploy: deploying to Cloudflare Pages in the background (log: .wrangler/deploy.log)"
