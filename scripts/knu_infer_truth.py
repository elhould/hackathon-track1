#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
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


def fetch_pairs(base_url: str, api_key: str, set_type: str) -> list[dict]:
    students = api_get(base_url, api_key, "/students", {"set_type": set_type}).get("students", [])
    pairs = []
    for student in students:
        topics = api_get(base_url, api_key, f"/students/{student['id']}/topics").get("topics", [])
        for topic in topics:
            pairs.append({"student": student, "topic": topic})
    return pairs


def mse_for_predictions(
    base_url: str,
    api_key: str,
    set_type: str,
    pairs: list[dict],
    base_level: float,
    override_index: int | None,
    override_level: float,
) -> float:
    preds = []
    for idx, pair in enumerate(pairs):
        level = override_level if override_index == idx else base_level
        preds.append(
            {
                "student_id": pair["student"]["id"],
                "topic_id": pair["topic"]["id"],
                "predicted_level": float(level),
            }
        )
    resp = api_post(
        base_url,
        api_key,
        "/evaluate/mse",
        {"set_type": set_type, "predictions": preds},
    )
    return float(resp["mse_score"])


def infer_level_from_delta(delta: float, base: int, alt: int) -> tuple[int, dict[int, float]]:
    # Compute expected delta for each possible true level and pick the closest.
    expected = {}
    for t in range(1, 6):
        expected[t] = (alt - t) ** 2 - (base - t) ** 2
    inferred = min(expected.keys(), key=lambda k: abs(expected[k] - delta))
    return inferred, expected


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Infer true understanding levels using controlled MSE probes."
    )
    parser.add_argument("--set-type", default="mini_dev", help="mini_dev|dev|eval")
    parser.add_argument("--base", type=int, default=1, help="Base prediction level (default: 1)")
    parser.add_argument("--alt", type=int, default=5, help="Alternate level for probe (default: 5)")
    parser.add_argument("--force", action="store_true", help="Allow non-mini_dev sets")
    parser.add_argument(
        "--out",
        default="logs/inferred_levels.json",
        help="Output path for inferred levels JSON",
    )
    args = parser.parse_args()

    if args.set_type != "mini_dev" and not args.force:
        raise SystemExit("Refusing to run on dev/eval without --force (submission limits).")

    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")
    base_url = get_env("BASE_URL", env_file)
    team_api_key = get_env("TEAM_API_KEY", env_file)
    if not base_url or not team_api_key:
        missing = [k for k, v in {"BASE_URL": base_url, "TEAM_API_KEY": team_api_key}.items() if not v]
        raise SystemExit(f"Missing env vars: {', '.join(missing)}")

    base_url = base_url.rstrip("/")
    pairs = fetch_pairs(base_url, team_api_key, args.set_type)
    if not pairs:
        raise SystemExit(f"No student/topic pairs found for set_type={args.set_type}")

    n = len(pairs)
    mse0 = mse_for_predictions(
        base_url, team_api_key, args.set_type, pairs, args.base, None, args.alt
    )
    sse0 = mse0 * n

    results = []
    for idx, pair in enumerate(pairs):
        msei = mse_for_predictions(
            base_url, team_api_key, args.set_type, pairs, args.base, idx, args.alt
        )
        ssei = msei * n
        delta = ssei - sse0
        inferred, expected = infer_level_from_delta(delta, args.base, args.alt)
        results.append(
            {
                "student_id": pair["student"]["id"],
                "student_name": pair["student"].get("name"),
                "topic_id": pair["topic"]["id"],
                "topic_name": pair["topic"].get("name"),
                "subject_name": pair["topic"].get("subject_name"),
                "inferred_level": inferred,
                "delta": delta,
                "expected_deltas": expected,
            }
        )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, ensure_ascii=True, indent=2), encoding="utf-8")

    print(json.dumps({"set_type": args.set_type, "results": results}, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
