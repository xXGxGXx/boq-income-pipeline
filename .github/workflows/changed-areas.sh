#!/usr/bin/env bash
# Decide which slow CI jobs this commit needs. Writes media_hub=true|false and forge=true|false to $GITHUB_OUTPUT.
# Fails open: anything unexpected (manual run, a new branch, an unknown base, a workflow edit) runs every job.
set -uo pipefail

out="${GITHUB_OUTPUT:-/dev/stdout}"
run_all() { echo "reason: $1 -> every job"; { echo "media_hub=true"; echo "forge=true"; } >> "$out"; exit 0; }

case "${EVENT:-}" in
  pull_request) base="${PR_BASE:-}"; range="${base}...HEAD" ;;   # three dots: only what the PR itself changes
  push)         base="${PUSH_BEFORE:-}"; range="${base}..HEAD" ;;
  *)            run_all "event ${EVENT:-unknown}" ;;
esac
case "$base" in ""|0000000000000000000000000000000000000000) run_all "no base commit" ;; esac
git cat-file -e "${base}^{commit}" 2>/dev/null || run_all "base ${base:0:7} not in this checkout"
files="$(git diff --name-only "$range")" || run_all "git diff failed"

echo "changed files:"; echo "$files" | sed 's/^/  /' | head -40
if grep -q '^\.github/' <<<"$files"; then run_all "workflow changed"; fi

media_hub=false; forge=false
grep -qE '^(media-hub/|\.claude/skills/media-hub-master/)' <<<"$files" && media_hub=true
grep -q '^automation-forge/' <<<"$files" && forge=true
echo "media_hub=$media_hub forge=$forge"
{ echo "media_hub=$media_hub"; echo "forge=$forge"; } >> "$out"
