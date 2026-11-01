#!/usr/bin/env bash
# Vercel build for the demo branch: unpacks the private bundle (fake Supabase
# client) from DEMO_PRIVATE_BUNDLE, then runs the demo production build.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/src/demo/private"

if [ -z "${DEMO_PRIVATE_BUNDLE:-}" ]; then
  echo "demo-vercel-build: DEMO_PRIVATE_BUNDLE is not set; the demo cannot build without the private bundle (see DEMO.md)" >&2
  exit 1
fi

mkdir -p "$dir"
printf '%s' "$DEMO_PRIVATE_BUNDLE" | base64 -d | tar -xzf - -C "$dir"

cd "$root"
VITE_DEMO=1 npm run build
