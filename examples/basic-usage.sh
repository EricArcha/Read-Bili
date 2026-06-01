#!/usr/bin/env bash
# Basic usage examples for Read-Bili
# Set your API key first: export SILICONFLOW_API_KEY="sk-xxx"

set -euo pipefail

SCRIPT="node src/bilibili_pipeline.mjs"

echo "=== Example 1: Probe (inspect metadata only) ==="
$SCRIPT probe "https://www.bilibili.com/video/BV1R6PzzAE9k"

echo ""
echo "=== Example 2: Full pipeline with BV number ==="
$SCRIPT run "BV1R6PzzAE9k" --output-dir ./output-example

echo ""
echo "=== Example 3: Short link with custom output ==="
$SCRIPT run "https://b23.tv/lsocHNd" --output-dir ./output-shortlink

echo ""
echo "All done! Check output directories for results."
