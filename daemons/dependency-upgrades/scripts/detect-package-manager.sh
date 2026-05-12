#!/usr/bin/env bash
set -euo pipefail

found=()

[[ -f pnpm-lock.yaml ]] && found+=("pnpm")
[[ -f yarn.lock ]] && found+=("yarn")
[[ -f package-lock.json ]] && found+=("npm")
[[ -f bun.lock || -f bun.lockb ]] && found+=("bun")

if (( ${#found[@]} == 1 )); then
  echo "${found[0]}"
elif (( ${#found[@]} == 0 )); then
  echo "unknown" >&2
  exit 2
else
  echo "ambiguous package managers: ${found[*]}" >&2
  exit 2
fi
