#!/usr/bin/env python3
import argparse
import json
import os
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from knu_prompts import SELF_REPORT_QUESTION


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


def api_get(base_url: str, api_key: str, path: str, query: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    if query:
        url += "?" + urlencode(query)
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    return http_json("GET", url, headers)


def api_post(base_url: str, api_key: str, path: str, payload: dict) -> dict:
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    return http_json("POST", f"{base_url}{path}", headers, payload)


def log_event(log_file: Path, event: str, data: dict) -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {"event": event, **data}
    with log_file.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=True) + "\n")


def openai_call(
    api_key: str,
    model: str,
    messages: list[dict],
    mode: str,
    temperature: float = 0.0,
    max_tokens: int = 100,
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


def parse_level_from_text(text: str) -> int | None:
    match = re.search(r"\b([1-5])\b", text)
    if match:
        return int(match.group(1))
    return None


def llm_map_level(openai_key: str, model: str, mode: str, response_text: str) -> int:
    prompt = (
        "Map the student's self-reported understanding to a single integer 1-5.\n"
        "Return only the integer.\n\n"
        "1 = Struggling (struggles with fundamentals)\n"
        "2 = Below grade (makes frequent mistakes)\n"
        "3 = At grade (understands core concepts ok)\n"
        "4 = Above grade (has occasional gaps in understanding)\n"
        "5 = Advanced (ready for more challenging topics)\n"
        f"Student response: {response_text}"
    )
    messages = [
        {"role": "system", "content": "Return only a single digit 1-5."},
        {"role": "user", "content": prompt},
    ]
    raw = openai_call(openai_key, model, messages, mode, temperature=0.0, max_tokens=16)
    level = parse_level_from_text(raw)
    return level if level is not None else 3


def main() -> int:
    parser = argparse.ArgumentParser(description="Self-report level and submit to /evaluate/mse.")
    parser.add_argument("--set-type", default="mini_dev", help="mini_dev|dev|eval")
    parser.add_argument("--model", default="gpt-5.2", help="OpenAI model name for mapping")
    parser.add_argument("--mode", default="responses", help="OpenAI API mode: responses|chat")
    parser.add_argument("--log-file", default=None, help="Path to conversations.jsonl")
    parser.add_argument("--no-submit-mse", action="store_true", help="Do not submit to /evaluate/mse")
    parser.add_argument(
        "--no-llm-parse",
        action="store_true",
        help="Do not use LLM to map non-numeric responses",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")

    base_url = get_env("BASE_URL", env_file)
    team_api_key = get_env("TEAM_API_KEY", env_file)
    openai_key = get_env("OPENAI_API_KEY", env_file)
    if not base_url or not team_api_key:
        missing = [k for k, v in {"BASE_URL": base_url, "TEAM_API_KEY": team_api_key}.items() if not v]
        raise SystemExit(f"Missing env vars: {', '.join(missing)}")

    if not args.no_llm_parse and not openai_key:
        raise SystemExit("Missing OPENAI_API_KEY (needed for non-numeric responses).")

    base_url = base_url.rstrip("/")
    log_file = Path(args.log_file) if args.log_file else repo_root / "logs/conversations.jsonl"

    students = api_get(base_url, team_api_key, "/students", {"set_type": args.set_type}).get(
        "students", []
    )
    if not students:
        raise SystemExit(f"No students found for set_type={args.set_type}")

    predictions = []
    for student in students:
        topics = api_get(
            base_url, team_api_key, f"/students/{student['id']}/topics"
        ).get("topics", [])
        for topic in topics:
            start = api_post(
                base_url,
                team_api_key,
                "/interact/start",
                {"student_id": student["id"], "topic_id": topic["id"]},
            )
            conversation_id = start.get("conversation_id")
            log_event(
                log_file,
                "start",
                {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "response": start},
            )

            resp = api_post(
                base_url,
                team_api_key,
                "/interact",
                {"conversation_id": conversation_id, "tutor_message": SELF_REPORT_QUESTION},
            )
            log_event(
                log_file,
                "interact",
                {
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "conversation_id": conversation_id,
                    "tutor_message": SELF_REPORT_QUESTION,
                    "response": resp,
                    "model": args.model,
                    "phase": "self_report",
                },
            )

            student_response = resp.get("student_response", "")
            level = parse_level_from_text(student_response)
            if level is None:
                if args.no_llm_parse:
                    level = 3
                else:
                    level = llm_map_level(openai_key, args.model, args.mode, student_response)

            predictions.append(
                {
                    "student_id": student["id"],
                    "topic_id": topic["id"],
                    "predicted_level": level,
                }
            )

            log_event(
                log_file,
                "conversation_summary",
                {
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "student_id": student["id"],
                    "topic_id": topic["id"],
                    "conversation_id": conversation_id,
                    "turns": [
                        {"role": "tutor", "turn": 1, "phase": "self_report", "content": SELF_REPORT_QUESTION},
                        {"role": "student", "turn": 1, "phase": "self_report", "content": student_response},
                    ],
                    "prediction": {
                        "level": level,
                        "model": args.model,
                        "raw": student_response,
                        "rationale": "self_report",
                        "phase": "self_report",
                    },
                },
            )

            print(f"{student['name']} / {topic['name']}: {level}", flush=True)

    if not args.no_submit_mse:
        resp = api_post(
            base_url,
            team_api_key,
            "/evaluate/mse",
            {"set_type": args.set_type, "predictions": predictions},
        )
        print(json.dumps(resp, ensure_ascii=True, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
