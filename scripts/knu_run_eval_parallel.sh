#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PARALLEL=4 LOG_DIR=eval_logs MODEL=gpt-5.2 MODE=responses ./scripts/knu_run_eval_parallel.sh
# Optional: SLEEP=0.2 MAX_TURNS=10 PROMPT_VERSION=A PAIR_FILE=/tmp/eval_pairs.txt
# Note: set SSL_CERT_FILE if your Python SSL setup requires it.

PARALLEL="${PARALLEL:-4}"
LOG_DIR="${LOG_DIR:-eval_logs}"
MODEL="${MODEL:-gpt-5.2}"
MODE="${MODE:-responses}"
SLEEP="${SLEEP:-0.2}"
MAX_TURNS="${MAX_TURNS:-}"
PROMPT_VERSION="${PROMPT_VERSION:-A}"
PAIR_FILE="${PAIR_FILE:-/tmp/eval_pairs.txt}"
SKIP_LIST="${SKIP_LIST:-0}"

mkdir -p "$LOG_DIR"

if [[ "$SKIP_LIST" != "1" ]]; then
  python3 scripts/knu_list_pairs.py --set-type eval > "$PAIR_FILE"
fi

export MODEL MODE SLEEP MAX_TURNS

cat "$PAIR_FILE" | xargs -n 2 -P "$PARALLEL" bash -c '
  student="$1"
  topic="$2"
  LOG_FILE="'"$LOG_DIR"'/eval_${student}_${topic}.jsonl"
  export LOG_FILE
  extra=()
  if [[ -n "${MAX_TURNS:-}" ]]; then
    extra+=(--max-turns "$MAX_TURNS")
  fi
  ./scripts/knu_auto_chat.py \
    --set-type eval \
    --student-id "$student" \
    --topic-id "$topic" \
    --model "$MODEL" \
    --mode "$MODE" \
    --sleep "$SLEEP" \
    "${extra[@]}"
' _

./scripts/knu_score_only.py \
  --set-type eval \
  --prompt-version "$PROMPT_VERSION" \
  --model "$MODEL" \
  --mode "$MODE" \
  --log-dir "$LOG_DIR" \
  --diagnostic-only \
  --out "$LOG_DIR/score_only_strict.json" \
  --submit-mse
