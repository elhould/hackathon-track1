#!/usr/bin/env python3
import argparse
import json
import math
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from knu_prompts import get_rejudge_prompt


_PRINT_LOCK = threading.Lock()


def safe_print(message: str) -> None:
    with _PRINT_LOCK:
        print(message, flush=True)


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
    max_tokens: int = 250,
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


def api_get(base_url: str, api_key: str, path: str, query: dict | None = None) -> dict:
    url = f"{base_url}{path}"
    if query:
        url += "?" + urlencode(query)
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    return http_json("GET", url, headers)


def api_post(base_url: str, api_key: str, path: str, payload: dict) -> dict:
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    return http_json("POST", f"{base_url}{path}", headers, payload)


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


def pick_latest_conversations(path: Path) -> dict[tuple[str, str], dict]:
    latest = {}
    for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
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
        if t.get("phase") != "diagnostic":
            continue
        role = t.get("role")
        content = t.get("content", "")
        if role == "tutor":
            lines.append(f"Tutor: {content}")
        elif role == "student":
            lines.append(f"Student: {content}")
    return "\n".join(lines)


def parse_rejudge(raw: str, current_level: int) -> tuple[bool, int, str]:
    raw_str = raw.strip()
    agree = True
    final_level = current_level
    reasoning = ""
    try:
        data = json.loads(raw_str)
        if isinstance(data, dict):
            agree_val = data.get("agree")
            if isinstance(agree_val, bool):
                agree = agree_val
            level_val = data.get("final_level")
            if isinstance(level_val, str) and level_val.isdigit():
                level_val = int(level_val)
            if isinstance(level_val, (int, float)) and 1 <= int(level_val) <= 5:
                final_level = int(level_val)
            reasoning_val = data.get("reasoning")
            if isinstance(reasoning_val, str):
                reasoning = reasoning_val.strip()
    except json.JSONDecodeError:
        pass
    return agree, final_level, reasoning


def required_pairs(base_url: str, api_key: str, set_type: str) -> list[tuple[str, str]]:
    students = api_get(base_url, api_key, "/students", {"set_type": set_type}).get("students", [])
    pairs = []
    for student in students:
        topics = api_get(base_url, api_key, f"/students/{student['id']}/topics").get("topics", [])
        for topic in topics:
            pairs.append((student["id"], topic["id"]))
    return pairs


def round_half_up(value: float) -> int:
    return int(value + 0.5)


def rejudge_pair(
    openai_key: str,
    models: list[str],
    mode: str,
    prompt_template: str,
    rounding_mode: str,
    student_id: str,
    topic_id: str,
    convo: dict,
) -> tuple[dict | None, dict | None, str | None]:
    pred = convo.get("prediction", {})
    current_level = pred.get("level")
    if not isinstance(current_level, (int, float)):
        return None, None, None
    current_level = int(current_level)
    transcript = build_transcript(convo.get("turns", []))
    prompt = prompt_template.format(current_level=current_level, transcript=transcript)
    messages = [
        {"role": "system", "content": "Return only valid JSON. No extra text."},
        {"role": "user", "content": prompt},
    ]

    model_votes = []
    for model in models:
        raw = openai_call(openai_key, model, messages, mode)
        agree, final_level, reasoning = parse_rejudge(raw, current_level)
        model_votes.append(
            {
                "model": model,
                "agree": agree,
                "level": final_level,
                "reasoning": reasoning,
                "raw": raw,
            }
        )

    avg_level = sum(v["level"] for v in model_votes) / len(model_votes)
    if rounding_mode == "up":
        final_level = math.ceil(avg_level)
    elif rounding_mode == "down":
        final_level = math.floor(avg_level)
    else:
        final_level = round_half_up(avg_level)
    if final_level < 1:
        final_level = 1
    if final_level > 5:
        final_level = 5

    reasoning_pick = min(
        model_votes, key=lambda v: abs(v["level"] - avg_level)
    ).get("reasoning", "")

    result = {
        "student_id": student_id,
        "topic_id": topic_id,
        "current_level": current_level,
        "avg_level": avg_level,
        "final_level": final_level,
        "model_votes": model_votes,
        "reasoning": reasoning_pick,
    }
    prediction = {"student_id": student_id, "topic_id": topic_id, "predicted_level": final_level}

    levels = ",".join(str(v["level"]) for v in model_votes)
    line = f"{student_id} {topic_id}: [{levels}] avg={avg_level:.2f} -> {final_level}"
    return result, prediction, line


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rejudge dev conversations with an ensemble of models and average the result."
    )
    parser.add_argument("--input", default="dev_conversations.jsonl", help="Input JSONL path")
    parser.add_argument("--set-type", default="dev", help="mini_dev|dev|eval")
    parser.add_argument("--prompt-version", default="A", help="A|B|C|D|E")
    parser.add_argument(
        "--models",
        default="gpt-5.2,gpt-4o-mini,gpt-4.1-mini",
        help="Comma-separated model list",
    )
    parser.add_argument("--mode", default="responses", help="OpenAI API mode: responses|chat")
    parser.add_argument(
        "--rounding",
        default="nearest",
        choices=["nearest", "up", "down"],
        help="How to round average level: nearest (default), up, or down",
    )
    parser.add_argument("--out", default=None, help="Output JSON path")
    parser.add_argument("--submit-mse", action="store_true", help="Submit to /evaluate/mse")
    parser.add_argument(
        "--max-parallel",
        type=int,
        default=10,
        help="Max parallel rejudge requests",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")
    openai_key = get_env("OPENAI_API_KEY", env_file)
    if not openai_key:
        raise SystemExit("Missing OPENAI_API_KEY")

    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    base_url = get_env("BASE_URL", env_file) or ""
    team_api_key = get_env("TEAM_API_KEY", env_file) or ""
    if args.submit_mse and (not base_url or not team_api_key):
        raise SystemExit("Missing BASE_URL or TEAM_API_KEY for submit.")
    base_url = base_url.rstrip("/")

    conversations = pick_latest_conversations(input_path)
    if not conversations:
        raise SystemExit("No conversation_summary entries found.")

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    if len(models) < 2:
        raise SystemExit("Provide at least 2 models for ensemble.")

    results = []
    predictions = []
    prompt_template = get_rejudge_prompt(args.prompt_version)
    items = list(conversations.items())
    max_parallel = args.max_parallel if args.max_parallel > 0 else 1
    worker_count = min(max_parallel, len(items))
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        future_map = {
            executor.submit(
                rejudge_pair,
                openai_key,
                models,
                args.mode,
                prompt_template,
                args.rounding,
                student_id,
                topic_id,
                convo,
            ): (student_id, topic_id)
            for (student_id, topic_id), convo in items
        }
        for future in as_completed(future_map):
            try:
                result, prediction, line = future.result()
            except Exception as exc:
                student_id, topic_id = future_map[future]
                raise RuntimeError(
                    f"Rejudge failed for {student_id} {topic_id}: {exc}"
                ) from exc
            if result is None or prediction is None:
                continue
            results.append(result)
            predictions.append(prediction)
            if line:
                safe_print(line)

    output = {
        "set_type": args.set_type,
        "prompt_version": args.prompt_version.upper(),
        "models": models,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "results": results,
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
        resp = api_post(
            base_url,
            team_api_key,
            "/evaluate/mse",
            {"set_type": args.set_type, "predictions": predictions},
        )
        output["mse_response"] = resp
        safe_print(json.dumps(resp, ensure_ascii=True, indent=2))

    timestamp = time.strftime("%Y%m%d_%H%M%S", time.gmtime())
    out_path = (
        Path(args.out)
        if args.out
        else repo_root
        / f"logs/dev_rejudge_ensemble_{args.prompt_version.lower()}_{timestamp}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=True, indent=2), encoding="utf-8")
    safe_print(f"Saved: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
