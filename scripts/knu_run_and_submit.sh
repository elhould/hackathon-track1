#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set_type="mini_dev"
args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --set-type)
      if [ "${2:-}" = "" ]; then
        echo "Missing value for --set-type" >&2
        exit 1
      fi
      set_type="$2"
      args+=("$1" "$2")
      shift 2
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

echo "Running conversations (set_type=${set_type})..."
"$SCRIPT_DIR/knu_auto_chat.py" "${args[@]}"

echo "Submitting predictions to /evaluate/mse (set_type=${set_type})..."
"$SCRIPT_DIR/knu_submit_mse.py" --set-type "$set_type"
