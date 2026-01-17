#!/usr/bin/env python3
import json
import os
from pathlib import Path
from collections import defaultdict
import argparse
from typing import List, Dict, Any

try:
    from openai import OpenAI
except ImportError:
    print("Please install openai: pip install openai")
    exit(1)

# --- Configuration ---
RUBRIC_PROMPT = """
You are an expert pedagogical analyst and quality assurance agent.
Your goal is to determine the single most accurate understanding level (1-5) for the student based on the ENTIRE conversation history.

## RUBRIC (Use strictly)
1 = Struggling: Cannot restate task; confuses basic terms; needs step-by-step guidance.
2 = Below Grade: Frequent mistakes; can follow hints but doesn't apply independently.
3 = At Grade: Core concepts OK; solves standard tasks with minor corrections; can explain simply.
4 = Above Grade: Mostly correct on first attempt; can apply to new examples; rare gaps.
5 = Advanced: Precise vocabulary; self-initiates deeper questions; connects concepts; near-perfect execution.

## STRATEGY
- Ignore "polite" AI compliments. Look for student EVIDENCE.
- If student improved significantly, weight the FINAL state higher.
- If student revealed hidden gaps later, downgrade them.

## OUTPUT FORMAT (JSON ONLY)
Return a single JSON object with these fields:
{
  "verified_level": float,  // 1.0 to 5.0 (steps of 0.5 allowed)
  "reasoning": "string explanation referencing specific turns",
  "tutor_performance": "string critique of how the tutor did"
}
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

def parse_logs(log_file: Path) -> Dict[str, Dict[str, Any]]:
    conversations = defaultdict(lambda: {"turns": [], "meta": {}, "prediction": None})
    
    with open(log_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            
            # Identify conversation ID
            # It might meet deep inside 'response' or at top level
            cid = event.get("conversation_id")
            if not cid and "response" in event:
                cid = event["response"].get("conversation_id")
            
            if not cid:
                continue
                
            # Store Metadata from start event
            if event.get("event") == "start":
                resp = event.get("response", {})
                conversations[cid]["meta"] = {
                    "student_id": resp.get("student_id"),
                    "topic_id": resp.get("topic_id")
                }
            
            # Store Turns
            # We look for "conversation_summary" which has the full turns list usually?
            # actually knu_auto_chat writes 'interact' events for each turn.
            # AND it writes 'conversation_summary' at the end. 
            # Let's trust 'conversation_summary' if present, otherwise reconstruct?
            # The prompt implies we might need to reconstruct if summary isn't perfect.
            # But looking at logs, 'conversation_summary' has 'turns'. Let's use that if available.
            
            if event.get("event") == "conversation_summary":
                conversations[cid]["turns"] = event.get("turns", [])
                prediction = event.get("prediction", {})
                conversations[cid]["prediction"] = prediction
                # Ensure meta is set if missed (sometimes start event isn't there in partial logs)
                if not conversations[cid]["meta"].get("student_id"):
                     conversations[cid]["meta"]["student_id"] = event.get("student_id")
                     conversations[cid]["meta"]["topic_id"] = event.get("topic_id")

    return conversations

def verify_conversation(client: OpenAI, turns: List[dict], model: str = "gpt-4o") -> dict:
    # reconstructing transcript
    transcript = "TRANSCRIPT:\n"
    for t in turns:
        role = t.get("role", "unknown")
        content = t.get("content", "")
        turn_num = t.get("turn", "?")
        transcript += f"[Turn {turn_num}] {role.upper()}: {content}\n\n"
        
    messages = [
        {"role": "system", "content": RUBRIC_PROMPT},
        {"role": "user", "content": transcript}
    ]
    
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        content = completion.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print(f"Error calling LLM: {e}")
        return {"verified_level": 0.0, "reasoning": f"Error: {e}", "tutor_performance": "N/A"}

def main():
    parser = argparse.ArgumentParser(description="Verify conversation levels with 2nd classifier.")
    parser.add_argument("--logs", default="logs/conversations.jsonl", help="Path to log file")
    parser.add_argument("--out", default="logs/verified_levels.json", help="Path to output json")
    parser.add_argument("--model", default="gpt-4o", help="Verification model to use")
    args = parser.parse_args()
    
    repo_root = Path(__file__).resolve().parents[1]
    env_file = load_env_file(repo_root / ".env")
    api_key = get_env("OPENAI_API_KEY", env_file)
    
    if not api_key:
        print("Error: OPENAI_API_KEY not found in .env or environment")
        return

    client = OpenAI(api_key=api_key)
    
    log_path = Path(args.logs)
    if not log_path.is_absolute():
        log_path = repo_root / args.logs
        
    print(f"Reading logs from {log_path}...")
    conversations = parse_logs(log_path)
    
    results = []
    
    print(f"Found {len(conversations)} conversations. Verifying...")
    
    for cid, data in conversations.items():
        turns = data["turns"]
        # Only verify completed conversations (those with summary)
        if not turns:
            continue
            
        print(f"Verifying {cid[:8]}...", end="", flush=True)
        
        verification = verify_conversation(client, turns, args.model)
        
        orig_pred = data["prediction"] or {}
        orig_level = orig_pred.get("level")
        verified_level = verification.get("verified_level")
        
        # Calculate discrepancy
        if orig_level is None:
             match = False # Can't match if missing
        else:
             match = abs(float(orig_level) - float(verified_level)) < 0.1
        
        result_entry = {
            "conversation_id": cid,
            "student_id": data["meta"].get("student_id"),
            "topic_id": data["meta"].get("topic_id"),
            "original_level": orig_level,
            "verified_level": verified_level,
            "match": match,
            "original_rationale": orig_pred.get("rationale"),
            "verified_reasoning": verification.get("reasoning"),
            "tutor_performance": verification.get("tutor_performance")
        }
        results.append(result_entry)
        print(f" Done. Orig: {orig_level} -> Veri: {verified_level} ({'MATCH' if match else 'DIFF'})")
        
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = repo_root / args.out
        
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
        
    print(f"\nVerification complete. Results saved to {out_path}")

if __name__ == "__main__":
    main()
