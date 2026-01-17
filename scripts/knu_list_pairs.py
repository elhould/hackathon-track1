#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError


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
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }
    return http_json("GET", url, headers)


def main() -> int:
    parser = argparse.ArgumentParser(description="List student/topic pairs for a set.")
    parser.add_argument("--set-type", default="dev", help="mini_dev|dev|eval")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")

    base_url = get_env("BASE_URL", env_file)
    team_api_key = get_env("TEAM_API_KEY", env_file)

    if not base_url or not team_api_key:
        missing = [k for k, v in {
            "BASE_URL": base_url,
            "TEAM_API_KEY": team_api_key,
        }.items() if not v]
        raise SystemExit(f"Missing env vars: {', '.join(missing)}")

    base_url = base_url.rstrip("/")
    students_resp = api_get(base_url, team_api_key, "/students", {"set_type": args.set_type})
    students = students_resp.get("students", [])
    if not students:
        raise SystemExit(f"No students found for set_type={args.set_type}")

    for student in students:
        topics_resp = api_get(base_url, team_api_key, f"/students/{student['id']}/topics")
        topics = topics_resp.get("topics", [])
        for topic in topics:
            print(f"{student['id']} {topic['id']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
