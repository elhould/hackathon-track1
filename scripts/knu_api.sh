#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

BASE_URL="${BASE_URL:-}"
TEAM_API_KEY="${TEAM_API_KEY:-}"

if [ -z "$BASE_URL" ] || [ -z "$TEAM_API_KEY" ]; then
  echo "Missing BASE_URL or TEAM_API_KEY. Set them in .env or env." >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"

LOG_FILE="${LOG_FILE:-$ROOT_DIR/logs/conversations.jsonl}"

json_pretty() {
  if command -v jq >/dev/null 2>&1; then
    jq
  else
    cat
  fi
}

json_encode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' "$1"
import json,sys
print(json.dumps(sys.argv[1]))
PY
  elif command -v jq >/dev/null 2>&1; then
    jq -Rrs @json <<<"$1"
  else
    echo "Need python3 or jq to encode JSON." >&2
    exit 1
  fi
}

json_get() {
  local key="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json,sys
key=sys.argv[1]
data=json.load(sys.stdin)
val=data.get(key, "")
if isinstance(val, bool):
  print("true" if val else "false")
elif val is None:
  print("")
else:
  print(val)
' "$key"
  else
    jq -r --arg k "$key" '.[$k] // empty'
  fi
}

log_append() {
  local line="$1"
  local log_dir
  log_dir="$(dirname "$LOG_FILE")"
  mkdir -p "$log_dir"
  printf '%s\n' "$line" >> "$LOG_FILE"
}

log_event() {
  local event="$1"
  local response="$2"
  local student_id="${3:-}"
  local topic_id="${4:-}"
  local conversation_id="${5:-}"
  local tutor_message="${6:-}"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  local line
  if command -v python3 >/dev/null 2>&1; then
    line="$(python3 -c 'import json,sys
event,ts,student_id,topic_id,conversation_id,tutor_message=sys.argv[1:7]
resp_raw=sys.stdin.read().strip()
data={"ts": ts, "event": event}
if student_id: data["student_id"]=student_id
if topic_id: data["topic_id"]=topic_id
if conversation_id: data["conversation_id"]=conversation_id
if tutor_message: data["tutor_message"]=tutor_message
if resp_raw:
  try:
    data["response"]=json.loads(resp_raw)
  except json.JSONDecodeError:
    data["response_raw"]=resp_raw
print(json.dumps(data, ensure_ascii=True))
' "$event" "$ts" "$student_id" "$topic_id" "$conversation_id" "$tutor_message" <<<"$response")"
  else
    line="$(jq -cn \
      --arg ts "$ts" \
      --arg event "$event" \
      --arg student_id "$student_id" \
      --arg topic_id "$topic_id" \
      --arg conversation_id "$conversation_id" \
      --arg tutor_message "$tutor_message" \
      --arg resp_raw "$response" \
      '
      (if $student_id|length>0 then {student_id:$student_id} else {} end) as $s |
      (if $topic_id|length>0 then {topic_id:$topic_id} else {} end) as $t |
      (if $conversation_id|length>0 then {conversation_id:$conversation_id} else {} end) as $c |
      (if $tutor_message|length>0 then {tutor_message:$tutor_message} else {} end) as $m |
      {ts:$ts,event:$event} + $s + $t + $c + $m +
      (try ($resp_raw|fromjson) catch null) as $resp |
      if $resp == null then {response_raw:$resp_raw} else {response:$resp} end
      '
    )"
  fi

  log_append "$line"
}

request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    curl -sS -X "$method" "$BASE_URL$path" \
      -H "x-api-key: $TEAM_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -sS -X "$method" "$BASE_URL$path" \
      -H "x-api-key: $TEAM_API_KEY"
  fi
}

usage() {
  cat <<'EOF'
Usage: ./scripts/knu_api.sh <command> [args]

Commands:
  list-students [set_type]      List students (set_type: mini_dev|dev|eval)
  student-topics <student_id>   List topics for a student
  list-subjects                 List subjects
  list-topics [subject_id]      List topics (optionally filtered by subject)
  start <student_id> <topic_id> Start a conversation
  interact <conversation_id> <message...>
  chat                          Interactive flow (mini_dev)
  health                        Health check

Environment:
  LOG_FILE                       Optional override for log file path
EOF
}

cmd_list_students() {
  local set_type="${1:-}"
  local path="/students"
  if [ -n "$set_type" ]; then
    path="$path?set_type=$set_type"
  fi
  request GET "$path" | json_pretty
}

cmd_student_topics() {
  local student_id="${1:-}"
  [ -n "$student_id" ] || { echo "student_id required" >&2; exit 1; }
  request GET "/students/$student_id/topics" | json_pretty
}

cmd_list_subjects() {
  request GET "/subjects" | json_pretty
}

cmd_list_topics() {
  local subject_id="${1:-}"
  local path="/topics"
  if [ -n "$subject_id" ]; then
    path="$path?subject_id=$subject_id"
  fi
  request GET "$path" | json_pretty
}

cmd_start() {
  local student_id="${1:-}"
  local topic_id="${2:-}"
  [ -n "$student_id" ] || { echo "student_id required" >&2; exit 1; }
  [ -n "$topic_id" ] || { echo "topic_id required" >&2; exit 1; }
  local payload
  payload="{\"student_id\":\"$student_id\",\"topic_id\":\"$topic_id\"}"
  local resp
  resp="$(request POST "/interact/start" "$payload")"
  log_event "start" "$resp" "$student_id" "$topic_id"
  echo "$resp" | json_pretty
}

cmd_interact() {
  local conversation_id="${1:-}"
  shift || true
  local message="${*:-}"
  [ -n "$conversation_id" ] || { echo "conversation_id required" >&2; exit 1; }
  [ -n "$message" ] || { echo "message required" >&2; exit 1; }
  local msg_json payload
  msg_json="$(json_encode "$message")"
  payload="{\"conversation_id\":\"$conversation_id\",\"tutor_message\":$msg_json}"
  local resp
  resp="$(request POST "/interact" "$payload")"
  log_event "interact" "$resp" "" "" "$conversation_id" "$message"
  echo "$resp" | json_pretty
}

cmd_chat() {
  echo "Listing mini_dev students..."
  request GET "/students?set_type=mini_dev" | json_pretty
  printf "\nStudent ID: "
  read -r student_id
  [ -n "$student_id" ] || { echo "student_id required" >&2; exit 1; }

  echo "Topics for student..."
  request GET "/students/$student_id/topics" | json_pretty
  printf "\nTopic ID: "
  read -r topic_id
  [ -n "$topic_id" ] || { echo "topic_id required" >&2; exit 1; }

  echo "Starting conversation..."
  start_resp="$(request POST "/interact/start" "{\"student_id\":\"$student_id\",\"topic_id\":\"$topic_id\"}")"
  echo "$start_resp" | json_pretty
  log_event "start" "$start_resp" "$student_id" "$topic_id"
  conversation_id="$(json_get "conversation_id" <<<"$start_resp")"
  [ -n "$conversation_id" ] || { echo "Could not parse conversation_id" >&2; exit 1; }

  echo "Type a message to the student. Empty line to quit."
  while true; do
    printf "You: "
    read -r message
    [ -n "$message" ] || break
    msg_json="$(json_encode "$message")"
    payload="{\"conversation_id\":\"$conversation_id\",\"tutor_message\":$msg_json}"
    reply="$(request POST "/interact" "$payload")"
    echo "$reply" | json_pretty
    log_event "interact" "$reply" "" "" "$conversation_id" "$message"
    is_complete="$(json_get "is_complete" <<<"$reply")"
    if [ "$is_complete" = "true" ]; then
      echo "Conversation complete."
      break
    fi
  done
}

cmd_health() {
  request GET "/health" | json_pretty
}

case "${1:-}" in
  list-students) shift; cmd_list_students "$@";;
  student-topics) shift; cmd_student_topics "$@";;
  list-subjects) shift; cmd_list_subjects "$@";;
  list-topics) shift; cmd_list_topics "$@";;
  start) shift; cmd_start "$@";;
  interact) shift; cmd_interact "$@";;
  chat) shift; cmd_chat "$@";;
  health) shift; cmd_health "$@";;
  -h|--help|help|"") usage;;
  *) echo "Unknown command: $1" >&2; usage; exit 1;;
esac
