#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PARALLEL=4 LOG_DIR=new_logs MODEL=gpt-5.2 MODE=responses ./scripts/knu_run_dev_parallel.sh
# Optional: MAX_TURNS=10, PAIR_FILE=/tmp/dev_pairs.txt

PARALLEL="${PARALLEL:-4}"
LOG_DIR="${LOG_DIR:-new_logs}"
MODEL="${MODEL:-gpt-5.2}"
MODE="${MODE:-responses}"
SLEEP="${SLEEP:-0.2}"
MAX_TURNS="${MAX_TURNS:-}"
PAIR_FILE="${PAIR_FILE:-/tmp/dev_pairs.txt}"

mkdir -p "$LOG_DIR"

python3 scripts/knu_list_pairs.py --set-type dev > "$PAIR_FILE"

export MODEL MODE SLEEP MAX_TURNS

cat "$PAIR_FILE" | xargs -n 2 -P "$PARALLEL" bash -c '
  student="$1"
  topic="$2"
  LOG_FILE="'"$LOG_DIR"'/dev_${student}_${topic}.jsonl"
  export LOG_FILE
  extra=()
  if [[ -n "${MAX_TURNS:-}" ]]; then
    extra+=(--max-turns "$MAX_TURNS")
  fi
  ./scripts/knu_auto_chat.py \
    --set-type dev \
    --student-id "$student" \
    --topic-id "$topic" \
    --model "$MODEL" \
    --mode "$MODE" \
    --sleep "$SLEEP" \
    "${extra[@]}"
' _
