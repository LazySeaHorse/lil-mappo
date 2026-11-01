#!/usr/bin/env bash
# Prints src/demo/private/ as one base64 line (tar + gzip), the value of the
# DEMO_PRIVATE_BUNDLE env var for the demo deployment (see DEMO.md).

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/src/demo/private"
limit=61440

[ -d "$dir" ] || { echo "demo-pack-private: $dir does not exist" >&2; exit 1; }

bundle="$(tar -czf - -C "$dir" . | base64 | tr -d '\n')"
size=${#bundle}

echo "demo-pack-private: $size bytes" >&2
if [ "$size" -gt "$limit" ]; then
  echo "demo-pack-private: WARNING over $limit bytes; Vercel allows 64 KB of env vars in all" >&2
fi
printf '%s\n' "$bundle"
