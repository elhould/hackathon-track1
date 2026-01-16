#!/usr/bin/env python3
import argparse
import json
import os
import time
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode


SYSTEM_PROMPT_TEMPLATE = """You are an AI tutor in the Knowunity challenge.
Goals:
- Infer the student's understanding level (1-5) from the conversation.
- Provide personalized tutoring adapted to their understanding and personality.

Understanding levels:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

Be concise and kind. Ask diagnostic questions when needed.
Do not mention that you are scoring or inferring a level.
Conversation phases:
- Turns 1-5: diagnostic only. Ask short questions to gauge understanding. Do not teach or explain yet.
- At the end of turn 5, internally lock a level and switch to tutoring.
- Turns 6-10: teach and tutor based on the student's demonstrated level.
Adaptation rules:
- If the student expresses confusion or says they do not understand, pause and step back to a simpler explanation.
- Acknowledge the confusion, reframe with simpler language, and avoid introducing new notation until they confirm.
- Ask 1 short check question to verify the prerequisite before moving on.
- If the student answers confidently and correctly, increase difficulty slightly.
- Always respond to what the student just said; do not continue with a prior equation if they are stuck.

Student: {name}, grade {grade}
Topic: {topic} ({subject})
"""

PREDICTION_PROMPT_TEMPLATE = """You are rating a student's understanding level based on a tutoring conversation.
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


def normalize(text: str) -> str:
    return text.strip()


def load_env_file(env_path: Path) -> dict:
    data = {}
    if not env_path.exists():
        return data
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        data[key] = value
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
    temperature: float = 0.7,
    max_tokens: int = 300,
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


def log_event(log_file: Path, event: str, data: dict) -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"event": event, **data}
    log_file.write_text("", encoding="utf-8") if not log_file.exists() else None
    with log_file.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=True) + "\n")


def api_get(base_url: str, api_key: str, path: str, query: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    if query:
        url += "?" + urlencode(query)
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }
    return http_json("GET", url, headers)


def api_post(base_url: str, api_key: str, path: str, payload: dict) -> dict:
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }
    return http_json("POST", f"{base_url}{path}", headers, payload)


def build_system_prompt(student: dict, topic: dict) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        name=student.get("name", "Student"),
        grade=student.get("grade_level", "?"),
        topic=topic.get("name", "Topic"),
        subject=topic.get("subject_name", "Subject"),
    )


def predict_level(
    openai_key: str,
    model: str,
    mode: str,
    student: dict,
    topic: dict,
    turns: list[dict],
) -> tuple[int, str, str]:
    transcript_lines = []
    for entry in turns:
        role = entry.get("role", "").capitalize()
        content = entry.get("content", "")
        transcript_lines.append(f"{role}: {content}")

    prompt = PREDICTION_PROMPT_TEMPLATE.format(
        name=student.get("name", "Student"),
        grade=student.get("grade_level", "?"),
        topic=topic.get("name", "Topic"),
        subject=topic.get("subject_name", "Subject"),
        transcript="\n".join(transcript_lines),
    )
    messages = [
        {"role": "system", "content": "Return only valid JSON. No extra text."},
        {"role": "user", "content": prompt},
    ]
    raw = openai_call(
        openai_key,
        model,
        messages,
        mode,
        temperature=0.0,
        max_tokens=200,
    )
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
        match = re.search(r"\b([1-5])\b", raw_str)
        if match:
            level = int(match.group(1))
    if level is None:
        level = 3
    return level, raw_str, rationale


def run_conversation(
    base_url: str,
    api_key: str,
    openai_key: str,
    model: str,
    mode: str,
    log_file: Path,
    student: dict,
    topic: dict,
    sleep_s: float,
    turn_cap: int | None,
) -> dict:
    start = api_post(
        base_url,
        api_key,
        "/interact/start",
        {"student_id": student["id"], "topic_id": topic["id"]},
    )
    log_event(
        log_file,
        "start",
        {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "response": start},
    )

    conversation_id = start.get("conversation_id")
    max_turns = start.get("max_turns", 10)
    if turn_cap is not None:
        max_turns = min(max_turns, turn_cap)

    print(
        f"\nConversation started: {student.get('name')} / {topic.get('name')} "
        f"(id={conversation_id}, max_turns={max_turns})",
        flush=True,
    )

    system_prompt = build_system_prompt(student, topic)
    messages = [{"role": "system", "content": system_prompt}]
    turns: list[dict] = []
    locked_prediction: dict | None = None

    for turn in range(1, max_turns + 1):
        phase = "diagnostic" if turn <= 5 else "tutoring"
        turn_directive = (
            f"Turn {turn} of {max_turns}. Phase: {phase}. "
            "Diagnostic phase: ask short questions only; no teaching. "
            "Tutoring phase: explain and teach based on the student's level."
        )
        call_messages = [messages[0], {"role": "system", "content": turn_directive}] + messages[1:]
        tutor_message = openai_call(openai_key, model, call_messages, mode)
        messages.append({"role": "assistant", "content": tutor_message})
        turns.append(
            {
                "role": "tutor",
                "turn": turn,
                "phase": phase,
                "content": tutor_message,
            }
        )

        print(f"Turn {turn} tutor: {normalize(tutor_message)}", flush=True)

        resp = api_post(
            base_url,
            api_key,
            "/interact",
            {"conversation_id": conversation_id, "tutor_message": tutor_message},
        )
        log_event(
            log_file,
            "interact",
            {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "conversation_id": conversation_id,
                "tutor_message": tutor_message,
                "phase": phase,
                "response": resp,
                "model": model,
            },
        )

        student_response = resp.get("student_response", "")
        if student_response:
            print(f"Turn {turn} student: {normalize(student_response)}", flush=True)
            messages.append({"role": "user", "content": student_response})
            turns.append(
                {"role": "student", "turn": turn, "phase": phase, "content": student_response}
            )

        if turn == 5 and locked_prediction is None:
            diagnostic_turns = [t for t in turns if t.get("phase") == "diagnostic"]
            level, raw, rationale = predict_level(
                openai_key, model, mode, student, topic, diagnostic_turns
            )
            locked_prediction = {
                "level": level,
                "model": model,
                "raw": raw,
                "rationale": rationale,
                "phase": "diagnostic",
            }
            print(f"Locked diagnostic level: {level}", flush=True)
            log_event(
                log_file,
                "locked_prediction",
                {
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "student_id": student["id"],
                    "topic_id": topic["id"],
                    "conversation_id": conversation_id,
                    "prediction": locked_prediction,
                },
            )

        if resp.get("is_complete") is True:
            print("Conversation complete (server signaled max turns).", flush=True)
            break

        if sleep_s > 0:
            time.sleep(sleep_s)

    if locked_prediction is None:
        diagnostic_turns = [t for t in turns if t.get("phase") == "diagnostic"]
        level, raw, rationale = predict_level(
            openai_key, model, mode, student, topic, diagnostic_turns or turns
        )
        locked_prediction = {
            "level": level,
            "model": model,
            "raw": raw,
            "rationale": rationale,
            "phase": "diagnostic",
        }
        print(f"Locked diagnostic level: {level}", flush=True)

    log_event(
        log_file,
        "conversation_summary",
        {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "student_id": student["id"],
            "topic_id": topic["id"],
            "conversation_id": conversation_id,
            "turns": turns,
            "prediction": locked_prediction,
        },
    )

    return {
        "student_id": student["id"],
        "topic_id": topic["id"],
        "predicted_level": locked_prediction["level"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-run tutor conversations for mini_dev.")
    parser.add_argument("--set-type", default="mini_dev", help="mini_dev|dev|eval")
    parser.add_argument("--model", default="gpt-5.2", help="OpenAI model name")
    parser.add_argument("--mode", default="responses", help="OpenAI API mode: responses|chat")
    parser.add_argument("--sleep", type=float, default=0.2, help="Sleep between turns (seconds)")
    parser.add_argument("--max-turns", type=int, default=None, help="Cap turns per conversation")
    parser.add_argument(
        "--submit-mse",
        action="store_true",
        help="Submit predictions to /evaluate/mse after conversations finish",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")

    base_url = get_env("BASE_URL", env_file)
    team_api_key = get_env("TEAM_API_KEY", env_file)
    openai_api_key = get_env("OPENAI_API_KEY", env_file)
    log_file = Path(get_env("LOG_FILE", env_file, str(repo_root / "logs/conversations.jsonl")))

    if not base_url or not team_api_key or not openai_api_key:
        missing = [k for k, v in {
            "BASE_URL": base_url,
            "TEAM_API_KEY": team_api_key,
            "OPENAI_API_KEY": openai_api_key,
        }.items() if not v]
        raise SystemExit(f"Missing env vars: {', '.join(missing)}")

    base_url = base_url.rstrip("/")

    print(
        f"Running auto-chat: set={args.set_type}, model={args.model}, mode={args.mode}",
        flush=True,
    )

    students_resp = api_get(base_url, team_api_key, "/students", {"set_type": args.set_type})
    students = students_resp.get("students", [])
    if not students:
        raise SystemExit(f"No students found for set_type={args.set_type}")

    predictions: list[dict] = []

    for student in students:
        topics_resp = api_get(base_url, team_api_key, f"/students/{student['id']}/topics")
        topics = topics_resp.get("topics", [])
        if not topics:
            continue
        for topic in topics:
            pred = run_conversation(
                base_url,
                team_api_key,
                openai_api_key,
                args.model,
                args.mode,
                log_file,
                student,
                topic,
                args.sleep,
                args.max_turns,
            )
            predictions.append(pred)

    if args.submit_mse:
        if not predictions:
            raise SystemExit("No predictions generated; nothing to submit.")
        print("Submitting predictions to /evaluate/mse...", flush=True)
        resp = api_post(
            base_url,
            team_api_key,
            "/evaluate/mse",
            {"set_type": args.set_type, "predictions": predictions},
        )
        print(json.dumps(resp, ensure_ascii=True, indent=2), flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
