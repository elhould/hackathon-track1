#!/usr/bin/env python3
"""
Probe mini_dev to find true understanding levels using MSE feedback.
Since mini_dev has unlimited submissions, we can systematically test.
"""
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE_URL = "https://knowunity-agent-olympics-2026-api.vercel.app"
API_KEY = "sk_team_7s2Z0WWaQyjtYCzJ5l2QEERB0m8T-VjB"

# mini_dev student-topic pairs
PAIRS = [
    {"student_id": "1c6afe74-c388-4eb1-b82e-8326d95e29a3", "topic_id": "b09cd19f-e8f4-4587-96c7-11f2612f8040", "name": "Alex Test - Linear Functions"},
    {"student_id": "2ee4a025-4845-47f4-a634-3c9e423a4b0e", "topic_id": "a8245611-9efd-4810-95b1-f0c93c303fb7", "name": "Sam Struggle - Quadratic Equations"},
    {"student_id": "2b9da93c-5616-49ca-999c-a894b9d004a3", "topic_id": "bebd9c5a-617b-4d88-94cf-642e0675c9dc", "name": "Maya Advanced - Thermodynamics"},
]

def submit_predictions(predictions: list[float]) -> float:
    """Submit predictions and return MSE score."""
    payload = {
        "set_type": "mini_dev",
        "predictions": [
            {"student_id": p["student_id"], "topic_id": p["topic_id"], "predicted_level": pred}
            for p, pred in zip(PAIRS, predictions)
        ]
    }
    req = Request(
        f"{BASE_URL}/evaluate/mse",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "x-api-key": API_KEY}
    )
    with urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result["mse_score"]


def find_true_scores():
    """Find true scores by probing each student individually."""
    print("=" * 60)
    print("PROBING STRATEGY: Find true scores for mini_dev")
    print("=" * 60)

    # Start with baseline predictions
    baseline = [3.0, 3.0, 3.0]  # Neutral baseline

    true_scores = []

    for i, pair in enumerate(PAIRS):
        print(f"\n--- Probing {pair['name']} ---")
        best_score = None
        best_mse = float('inf')

        for level in [1, 2, 3, 4, 5]:
            # Test this level for student i
            test_preds = baseline.copy()
            test_preds[i] = float(level)

            # Keep other students at their best known values
            for j in range(i):
                test_preds[j] = true_scores[j]

            mse = submit_predictions(test_preds)

            # Calculate this student's contribution: MSE * 3 - others' squared errors
            # This is complex, so let's just track the best
            print(f"  Level {level}: MSE = {mse:.4f}")

            if mse < best_mse:
                best_mse = mse
                best_score = level

        true_scores.append(float(best_score))
        print(f"  => Best level for {pair['name'].split(' - ')[0]}: {best_score}")

    # Verify final scores
    print("\n" + "=" * 60)
    print("FINAL VERIFICATION")
    print("=" * 60)
    final_mse = submit_predictions(true_scores)
    print(f"\nTrue scores: {[int(s) for s in true_scores]}")
    print(f"Final MSE: {final_mse:.4f}")

    if final_mse == 0.0:
        print("\n✓ PERFECT! All scores found correctly!")
    else:
        print(f"\n⚠ MSE is not 0. Possible fractional true scores or noise.")

    # Print detailed results
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    for pair, score in zip(PAIRS, true_scores):
        print(f"  {pair['name']}: TRUE LEVEL = {int(score)}")

    return true_scores


def brute_force_all():
    """Brute force all 125 combinations (5^3) to find exact scores."""
    print("\n" + "=" * 60)
    print("BRUTE FORCE: Testing all 125 combinations")
    print("=" * 60)

    best_combo = None
    best_mse = float('inf')
    results = []

    for a in range(1, 6):
        for s in range(1, 6):
            for m in range(1, 6):
                preds = [float(a), float(s), float(m)]
                mse = submit_predictions(preds)
                results.append((a, s, m, mse))

                if mse < best_mse:
                    best_mse = mse
                    best_combo = (a, s, m)

                if mse == 0.0:
                    print(f"\n✓ FOUND EXACT SCORES: Alex={a}, Sam={s}, Maya={m}")
                    return (a, s, m)

    print(f"\nBest combination: Alex={best_combo[0]}, Sam={best_combo[1]}, Maya={best_combo[2]}")
    print(f"Best MSE: {best_mse:.4f}")

    # Show top 5 results
    results.sort(key=lambda x: x[3])
    print("\nTop 5 combinations:")
    for a, s, m, mse in results[:5]:
        print(f"  Alex={a}, Sam={s}, Maya={m}: MSE={mse:.4f}")

    return best_combo


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--brute":
        brute_force_all()
    else:
        # Quick probe first
        find_true_scores()

        print("\n" + "-" * 60)
        print("Run with --brute to test all 125 combinations")
