#!/usr/bin/env bash
# A keyless CLI pipeline: search -> metadata -> transcript window -> summary.
#
# Everything here runs WITHOUT an API key: the video used (Karpathy's "Intro
# to Large Language Models", zjkBMFhNj_g) is permanently cached, and keyless
# search is allowed (rate-limited per IP). Requires jq.
#
# Usage:  ./cli-pipeline.sh
#         YTS="node ../cli/dist/cli.js" ./cli-pipeline.sh   # run from source

set -euo pipefail

YTS=${YTS:-"npx @youtubesearch/cli"}
VIDEO="zjkBMFhNj_g"

echo "== 1. Search (keyless, --json + jq: id | title) =="
$YTS search "karpathy intro to large language models" --limit 3 --json |
  jq -r '.videos[] | "\(.youtube_id)  \(.title)"'

echo
echo "== 2. Chapters (find the Tool Use chapter) =="
$YTS video "$VIDEO" --json |
  jq -r '.chapters[] | select(.title | test("Tool Use")) | "\(.start_s)s  \(.title)"'

echo
echo "== 3. Transcript window: the Tool Use chapter (27:43-33:32) =="
$YTS transcript "$VIDEO" --start 1663 --end 2012 --max-tokens 800

echo
echo "== 4. Structured summary (selected sections) =="
$YTS summary "$VIDEO" --sections executive_summary,key_points
