#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

filtered=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prompt-version)
      shift
      if [ "$#" -gt 0 ]; then
        shift
      fi
      ;;
    --submit-mse)
      shift
      ;;
    *)
      filtered+=("$1")
      shift
      ;;
  esac
done

for v in A B C; do
  echo "Scoring prompt ${v} and submitting to /evaluate/mse..."
  "$SCRIPT_DIR/knu_score_only.py" --prompt-version "$v" --submit-mse "${filtered[@]}"
done
