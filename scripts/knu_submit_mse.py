#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


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


def required_pairs(base_url: str, api_key: str, set_type: str) -> list[tuple[str, str]]:
    students = api_get(base_url, api_key, "/students", {"set_type": set_type}).get("students", [])
    pairs: list[tuple[str, str]] = []
    for student in students:
        topics = api_get(base_url, api_key, f"/students/{student['id']}/topics").get("topics", [])
        for topic in topics:
            pairs.append((student["id"], topic["id"]))
    return pairs


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


def load_predictions(log_file: Path) -> dict[tuple[str, str], float]:
    predictions: dict[tuple[str, str], tuple[float, float | None, int]] = {}
    if not log_file.exists():
        return {}
    with log_file.open("r", encoding="utf-8") as fh:
        for idx, line in enumerate(fh):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("event") != "conversation_summary":
                continue
            student_id = entry.get("student_id")
            topic_id = entry.get("topic_id")
            pred = entry.get("prediction", {}).get("level")
            if not student_id or not topic_id or pred is None:
                continue
            try:
                pred_value = float(pred)
            except (TypeError, ValueError):
                continue
            ts_val = parse_ts(entry.get("ts"))
            key = (student_id, topic_id)
            if key in predictions:
                _, existing_ts, existing_idx = predictions[key]
                if ts_val is not None and existing_ts is not None:
                    if ts_val <= existing_ts:
                        continue
                elif ts_val is None and existing_ts is None:
                    if idx <= existing_idx:
                        continue
                elif ts_val is None and existing_ts is not None:
                    continue
            predictions[key] = (pred_value, ts_val, idx)
    return {k: v[0] for k, v in predictions.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Submit MSE predictions from conversations.jsonl")
    parser.add_argument("--set-type", default="mini_dev", help="mini_dev|dev|eval")
    parser.add_argument(
        "--log-file",
        default=None,
        help="Path to conversations.jsonl (default: logs/conversations.jsonl)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print payload without submitting")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")

    base_url = get_env("BASE_URL", env_file)
    team_api_key = get_env("TEAM_API_KEY", env_file)
    if not base_url or not team_api_key:
        missing = [k for k, v in {"BASE_URL": base_url, "TEAM_API_KEY": team_api_key}.items() if not v]
        raise SystemExit(f"Missing env vars: {', '.join(missing)}")

    base_url = base_url.rstrip("/")
    log_file = Path(args.log_file) if args.log_file else repo_root / "logs/conversations.jsonl"

    preds = load_predictions(log_file)
    required = required_pairs(base_url, team_api_key, args.set_type)

    payload_preds = []
    missing = []
    for student_id, topic_id in required:
        key = (student_id, topic_id)
        if key not in preds:
            missing.append(key)
            continue
        payload_preds.append(
            {"student_id": student_id, "topic_id": topic_id, "predicted_level": preds[key]}
        )

    if missing:
        missing_str = "\n".join([f"- {s} {t}" for s, t in missing])
        raise SystemExit(
            "Missing predictions for these student/topic pairs:\n" + missing_str
        )

    payload = {"set_type": args.set_type, "predictions": payload_preds}
    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=True, indent=2))
        return 0

    resp = api_post(base_url, team_api_key, "/evaluate/mse", payload)
    print(json.dumps(resp, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
