#!/usr/bin/env python3
import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PROMPT_A = """You are rating a student's understanding level based on a tutoring conversation.
Use the following general rubric (applies across math/biology/physics/etc):

Level 1 (Struggling): has trouble restating the task; confuses basic terms/notation; cannot start without step-by-step help.
Level 2 (Below grade): can follow hints; partial steps; frequent mistakes; fragile understanding.
Level 3 (At grade): solves standard tasks with minor corrections; can explain simply; some errors.
Level 4 (Above grade): mostly correct and confident; can generalize/apply to new examples; rare gaps.
Level 5 (Advanced): precise vocabulary used correctly; self-initiates deeper questions; connects concepts.

Behavioral signals to weigh:
- Reasoning quality (just rules vs explanations)
- Error patterns (repeated misconceptions vs one-off slips)
- Metacognition (noticing and fixing mistakes)
- Transfer (applying to new examples without prompting)
- Engagement (curiosity, deeper questions)

Return a JSON object with:
{{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Conversation:
{transcript}
"""

PROMPT_B = """You are rating a student's understanding level based on a tutoring conversation.
Focus on correctness, consistency, and misconceptions. Ignore tone/enthusiasm.

Scoring focus:
- Are answers correct without hints?
- Are errors repeated or corrected after feedback?
- Do misconceptions persist across multiple turns?

Rubric (general across subjects):
1: cannot start; core terms/symbols misunderstood; frequent incorrect answers.
2: needs frequent hints; partial steps; repeated errors.
3: mostly correct on standard tasks; occasional mistakes.
4: correct and consistent; minor slips only.
5: consistently correct; anticipates or explains beyond the question.

Return JSON only:
{{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Conversation:
{transcript}
"""

PROMPT_C = """You are rating a student's understanding level based on a tutoring conversation.
Focus on reasoning depth, transfer, and self-correction.

Scoring focus:
- Explains "why" or links concepts, not just procedures.
- Applies ideas to new examples without prompting.
- Notices and fixes mistakes independently.

Rubric (general across subjects):
1: minimal reasoning; cannot connect steps to ideas.
2: basic reasoning with frequent confusion.
3: can explain steps in simple terms; occasional gaps.
4: clear reasoning and transfer to new examples.
5: deep conceptual understanding; asks advanced extensions.

Return JSON only:
{{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Conversation:
{transcript}
"""


def load_env_file(env_path: Path) -> dict:
    data = {}
    if not env_path.exists():
        return data
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip("'").strip('"')
    return data


def get_env(key: str, env_file: dict, default: str | None = None) -> str | None:
    return os.environ.get(key) or env_file.get(key) or default


def http_json(method: str, url: str, headers: dict, payload: dict | None = None) -> dict:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method=method, headers=headers)
    try:
        with urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"HTTP {e.code}: {body}") from e
    except URLError as e:
        raise RuntimeError(f"Network error: {e}") from e


def openai_call(
    api_key: str,
    model: str,
    messages: list[dict],
    mode: str,
    temperature: float = 0.0,
    max_tokens: int = 200,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if mode == "chat":
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        resp = http_json("POST", "https://api.openai.com/v1/chat/completions", headers, payload)
        try:
            return resp["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            raise RuntimeError(f"Unexpected OpenAI response: {resp}")

    payload = {
        "model": model,
        "input": messages,
        "temperature": temperature,
        "max_output_tokens": max_tokens,
    }
    resp = http_json("POST", "https://api.openai.com/v1/responses", headers, payload)
    text = resp.get("output_text")
    if text:
        return text.strip()
    for item in resp.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") in ("output_text", "text"):
                return content.get("text", "").strip()
    raise RuntimeError(f"Unexpected OpenAI response: {resp}")


def parse_ts(ts: str | None) -> float | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").timestamp()
    except ValueError:
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None


def pick_latest_conversations(log_file: Path) -> dict[tuple[str, str], dict]:
    latest = {}
    if not log_file.exists():
        return latest
    for idx, line in enumerate(log_file.read_text(encoding="utf-8").splitlines()):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("event") != "conversation_summary":
            continue
        student_id = entry.get("student_id")
        topic_id = entry.get("topic_id")
        if not student_id or not topic_id:
            continue
        ts_val = parse_ts(entry.get("ts"))
        key = (student_id, topic_id)
        if key in latest:
            _, existing_ts, existing_idx = latest[key]
            if ts_val is not None and existing_ts is not None:
                if ts_val <= existing_ts:
                    continue
            elif ts_val is None and existing_ts is None:
                if idx <= existing_idx:
                    continue
            elif ts_val is None and existing_ts is not None:
                continue
        latest[key] = (entry, ts_val, idx)
    return {k: v[0] for k, v in latest.items()}


def build_transcript(turns: list[dict]) -> str:
    lines = []
    for t in turns:
        role = t.get("role")
        content = t.get("content", "")
        if role == "tutor":
            lines.append(f"Tutor: {content}")
        elif role == "student":
            lines.append(f"Student: {content}")
    return "\n".join(lines)


def select_prompt(version: str) -> str:
    version = version.upper()
    if version == "A":
        return PROMPT_A
    if version == "B":
        return PROMPT_B
    if version == "C":
        return PROMPT_C
    raise ValueError("prompt version must be A, B, or C")


def score_conversation(
    openai_key: str,
    model: str,
    mode: str,
    prompt_version: str,
    student: dict,
    topic: dict,
    turns: list[dict],
) -> tuple[int, str, str]:
    prompt = select_prompt(prompt_version).format(
        name=student.get("name", "Student"),
        grade=student.get("grade_level", "?"),
        topic=topic.get("name", "Topic"),
        subject=topic.get("subject_name", "Subject"),
        transcript=build_transcript(turns),
    )
    messages = [
        {"role": "system", "content": "Return only valid JSON. No extra text."},
        {"role": "user", "content": prompt},
    ]
    raw = openai_call(openai_key, model, messages, mode, temperature=0.0, max_tokens=200)
    raw_str = raw.strip()
    level = None
    rationale = ""
    try:
        data = json.loads(raw_str)
        level_val = data.get("level")
        if isinstance(level_val, str) and level_val.isdigit():
            level_val = int(level_val)
        if isinstance(level_val, (int, float)) and 1 <= int(level_val) <= 5:
            level = int(level_val)
        rationale_val = data.get("rationale")
        if isinstance(rationale_val, str):
            rationale = rationale_val.strip()
    except json.JSONDecodeError:
        pass
    if level is None:
        for ch in raw_str:
            if ch in "12345":
                level = int(ch)
                break
    if level is None:
        level = 3
    return level, raw_str, rationale


def api_get(base_url: str, api_key: str, path: str, query: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    if query:
        url += "?" + urlencode(query)
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    return http_json("GET", url, headers)


def api_post(base_url: str, api_key: str, path: str, payload: dict) -> dict:
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    return http_json("POST", f"{base_url}{path}", headers, payload)


def required_pairs(base_url: str, api_key: str, set_type: str) -> list[tuple[str, str]]:
    students = api_get(base_url, api_key, "/students", {"set_type": set_type}).get("students", [])
    pairs = []
    for student in students:
        topics = api_get(base_url, api_key, f"/students/{student['id']}/topics").get("topics", [])
        for topic in topics:
            pairs.append((student["id"], topic["id"]))
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description="Score existing conversations with LLM only.")
    parser.add_argument("--set-type", default="mini_dev", help="mini_dev|dev|eval")
    parser.add_argument("--prompt-version", default="A", help="A|B|C")
    parser.add_argument("--model", default="gpt-5.2", help="OpenAI model name")
    parser.add_argument("--mode", default="responses", help="OpenAI API mode: responses|chat")
    parser.add_argument("--log-file", default=None, help="Path to conversations.jsonl")
    parser.add_argument("--out", default=None, help="Output JSON path")
    parser.add_argument("--submit-mse", action="store_true", help="Submit to /evaluate/mse")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")

    openai_key = get_env("OPENAI_API_KEY", env_file)
    if not openai_key:
        raise SystemExit("Missing env var: OPENAI_API_KEY")

    log_file = Path(args.log_file) if args.log_file else repo_root / "logs/conversations.jsonl"
    conversations = pick_latest_conversations(log_file)
    if not conversations:
        raise SystemExit("No conversation_summary entries found in logs.")

    base_url = get_env("BASE_URL", env_file) or ""
    team_api_key = get_env("TEAM_API_KEY", env_file) or ""
    if args.submit_mse and (not base_url or not team_api_key):
        raise SystemExit("Missing BASE_URL or TEAM_API_KEY for submit.")
    base_url = base_url.rstrip("/")

    timestamp = time.strftime("%Y%m%d_%H%M%S", time.gmtime())
    out_path = Path(args.out) if args.out else repo_root / f"logs/score_only_{args.prompt_version.lower()}_{timestamp}.json"

    predictions = []
    for (student_id, topic_id), convo in conversations.items():
        student = {"id": student_id, "name": convo.get("student_name"), "grade_level": convo.get("student_grade")}
        topic = {"id": topic_id, "name": convo.get("topic_name"), "subject_name": convo.get("subject_name")}
        turns = convo.get("turns", [])
        level, raw, rationale = score_conversation(
            openai_key, args.model, args.mode, args.prompt_version, student, topic, turns
        )
        predictions.append(
            {
                "student_id": student_id,
                "topic_id": topic_id,
                "predicted_level": level,
                "prompt_version": args.prompt_version.upper(),
                "model": args.model,
                "rationale": rationale,
                "raw": raw,
            }
        )
        print(f"{student_id} {topic_id} -> {level}", flush=True)

    output = {
        "set_type": args.set_type,
        "prompt_version": args.prompt_version.upper(),
        "model": args.model,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "predictions": predictions,
    }

    if args.submit_mse:
        required = required_pairs(base_url, team_api_key, args.set_type)
        missing = [k for k in required if not any(
            p["student_id"] == k[0] and p["topic_id"] == k[1] for p in predictions
        )]
        if missing:
            missing_str = "\n".join([f"- {s} {t}" for s, t in missing])
            raise SystemExit(
                "Missing predictions for these student/topic pairs:\n" + missing_str
            )
        payload_preds = [
            {
                "student_id": p["student_id"],
                "topic_id": p["topic_id"],
                "predicted_level": p["predicted_level"],
            }
            for p in predictions
        ]
        resp = api_post(
            base_url,
            team_api_key,
            "/evaluate/mse",
            {"set_type": args.set_type, "predictions": payload_preds},
        )
        output["mse_response"] = resp
        print(json.dumps(resp, ensure_ascii=True, indent=2), flush=True)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"Saved: {out_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
