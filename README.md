# Knowunity Hackathon CLI Scripts

These scripts help you run manual and automated conversations against the
Student Simulation API, log full transcripts, generate understanding level
predictions, and submit to the `/evaluate/mse` endpoint.

## Setup

Create a `.env` file in the repo root with:

```
BASE_URL=...
TEAM_API_KEY=...
OPENAI_API_KEY=...
```

Optional:

```
LOG_FILE=logs/conversations.jsonl
```

## Scripts

### `scripts/knu_api.sh`

Manual CLI helper to list students/topics and run a chat by hand.

Examples:

```
./scripts/knu_api.sh list-students mini_dev
./scripts/knu_api.sh student-topics <student_id>
./scripts/knu_api.sh start <student_id> <topic_id>
./scripts/knu_api.sh interact <conversation_id> "Explain how you would solve x^2 - 5x + 6 = 0"
./scripts/knu_api.sh chat
```

Notes:
- Reads `BASE_URL` and `TEAM_API_KEY` from `.env`.
- Logs every `start` and `interact` to `logs/conversations.jsonl` (JSONL format).

### `scripts/knu_auto_chat.py`

Automates conversations for a set, generates tutor messages with GPT, and
produces a predicted understanding level after each conversation.

Examples:

```
./scripts/knu_auto_chat.py
./scripts/knu_auto_chat.py --set-type mini_dev --model gpt-5.2 --mode responses
./scripts/knu_auto_chat.py --max-turns 6
```

Notes:
- Reads `BASE_URL`, `TEAM_API_KEY`, `OPENAI_API_KEY` from `.env`.
- Writes a `conversation_summary` entry with the full transcript and prediction
  to `logs/conversations.jsonl`.
- Use `--mode chat` if your account does not support the responses API.

### `scripts/knu_submit_mse.py`

Submits the latest predictions (per student/topic pair) from
`logs/conversations.jsonl` to `/evaluate/mse`.

Examples:

```
./scripts/knu_submit_mse.py --set-type mini_dev
./scripts/knu_submit_mse.py --set-type mini_dev --dry-run
```

Notes:
- Picks the most recent `conversation_summary` per student/topic pair.
- Fails if any required pair is missing.

### `scripts/knu_run_and_submit.sh`

One-shot flow: run conversations, then submit predictions.

Examples:

```
./scripts/knu_run_and_submit.sh --set-type mini_dev --model gpt-5.2 --mode responses
```

## Logs

All scripts append to `logs/conversations.jsonl` (JSON Lines). Each line is a
JSON object with `event` types like `start`, `interact`, or
`conversation_summary`.
