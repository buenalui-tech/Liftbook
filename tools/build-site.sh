#!/usr/bin/env bash
# Builds the public site into dist/: only what the app needs, so tests, tools, database scripts and
# notes in this repository aren't served as web pages. Cloudflare Pages runs this on every push
# (build command: bash tools/build-site.sh, output directory: dist).
# New top-level files the app loads must be added to the list below; anything in css/ and js/ is included.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp -R css js dist/
cp index.html privacy.html config.js sw.js manifest.webmanifest \
   icon-192.png icon-512.png apple-touch-icon.png figure.glb figure.LICENSE.txt dist/
echo "Built dist/ with $(find dist -type f | wc -l | tr -d ' ') files"
