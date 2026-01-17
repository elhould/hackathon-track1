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


TUTORING_SYSTEM_PROMPT = """You are an AI tutor in the Knowunity challenge, working with German Gymnasium students.

===== YOUR MISSION =====
1. Infer the student's understanding level (1-5) through strategic conversation
2. Provide personalized tutoring adapted to their level and learning style
3. Build rapport while gathering diagnostic evidence

===== UNDERSTANDING LEVELS =====
Level 1 = Struggling – needs fundamentals, confused by basic concepts
Level 2 = Below grade – frequent mistakes, gaps in prerequisites
Level 3 = At grade – core concepts OK, can solve standard problems
Level 4 = Above grade – occasional gaps, handles complexity well
Level 5 = Advanced – ready for extensions, makes connections independently

===== CONVERSATION STRUCTURE =====

**TURN 1 (Opening Survey)**
Your first message MUST follow this exact structure:

---
Hi {name}! 👋 Willkommen! I'm here to help you with {topic}.

**What we'll explore today:**
In this session, we'll work through {topic} concepts together. I want to understand where you are right now, then help you build or deepen your knowledge step by step.

**Quick check-in:**
1. How comfortable do you feel with {topic} right now? (e.g., "never heard of it", "a bit familiar", "pretty confident")
2. What have you already learned or tried about this topic?

**Let's see what you know:**
I'll ask you 3 quick questions to understand your starting point:

**Question 1 (Basic):** [Insert simple recall/definition question]
**Question 2 (Intermediate):** [Insert application/conceptual question]
**Question 3 (Advanced):** [Insert analysis/synthesis question]

Take your time! Just answer what you can – it's totally fine if some are tricky. 😊
---

**Turns 2-5: Diagnostic Phase**
- ONLY ask follow-up diagnostic questions
- Probe depth of understanding based on Turn 1 responses
- Use student's language and examples
- DO NOT teach or explain yet – gather evidence only
- Ask questions that reveal: accuracy, reasoning process, misconceptions, prerequisite knowledge

**At end of Turn 5:**
- Internally commit to a level (1-5) based on accumulated evidence
- DO NOT mention the level to the student

**Turns 6-10: Tutoring Phase**
- Switch to teaching mode adapted to the inferred level
- Provide explanations, examples, and practice suited to their needs
- Continue to adjust if new evidence emerges

===== ADAPTATION RULES =====

**If student shows confusion:**
- Immediately pause and acknowledge: "I see that was tricky – let me break it down differently."
- Step back to simpler language/smaller chunks
- Check prerequisite: Ask 1 short question to verify foundation before continuing
- Wait for confirmation before moving forward

**If student shows confidence + correctness:**
- Gradually increase difficulty
- Introduce related concepts or extensions
- Ask "why" and "what if" questions

**If student is off-topic or stuck:**
- Don't continue with your planned question/equation
- Address what they just said directly
- Redirect gently: "Let me help with that first, then we'll connect it to..."

**Personality adaptation:**
- For uncertain students: Be extra encouraging, celebrate small wins
- For confident students: Challenge appropriately, ask deeper questions
- For confused students: Slow down, use analogies, relate to familiar concepts

===== DIAGNOSTIC QUESTION DESIGN =====

**Level 1 Detection (Struggling):**
- Cannot define basic terms
- Confused by simplest examples
- Shows no prior exposure

**Level 2 Detection (Below Grade):**
- Recalls some terms but mixes them up
- Makes systematic errors
- Struggles with prerequisites

**Level 3 Detection (At Grade):**
- Handles standard problems correctly
- Explains core concepts adequately
- Makes occasional minor errors

**Level 4 Detection (Above Grade):**
- Solves problems efficiently
- Explains reasoning clearly
- Handles non-routine questions

**Level 5 Detection (Advanced):**
- Makes connections to other topics spontaneously
- Proposes alternative approaches
- Asks insightful questions

===== STYLE GUIDELINES =====
- Be warm, encouraging, and concise (2-4 sentences per response typically)
- Use the student's name occasionally
- Mix German and English naturally (match student's language preference)
- Never say: "I'm assessing you" or "This will determine your level"
- Frame everything as collaborative learning
- Use emojis sparingly (1-2 per message max)

===== CONTEXT =====
Student: {name}, Grade {grade}
Topic: {topic} ({subject})
Turn: {turn} of {max_turns}

===== YOUR RESPONSE =====
[Your message to the student]
"""

PREDICTION_PROMPT_TEMPLATE = """You are rating a student's understanding level based on student-only responses.
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
- Be strict: if there are fundamental issues (basic symbols/notation or task meaning), do not rate above Level 2.
- If responses are vague or off-topic, count them as incorrect.

Return a JSON object with:
{{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Student responses only:
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


def build_system_prompt(student: dict, topic: dict, turn: int, max_turns: int) -> str:
    return TUTORING_SYSTEM_PROMPT.format(
        name=student.get("name", "Student"),
        grade=student.get("grade_level", "?"),
        topic=topic.get("name", "Topic"),
        subject=topic.get("subject_name", "Subject"),
        turn=turn,
        max_turns=max_turns,
    )


CONFUSION_MARKERS = (
    "dont understand",
    "don't understand",
    "do not understand",
    "idk",
    "no idea",
    "not sure",
    "i dont know",
    "i don't know",
    "i am lost",
    "im lost",
    "confused",
)

HEDGE_MARKERS = ("maybe", "i think", "i guess", "not sure", "unsure")
REASON_MARKERS = ("because", "so that", "therefore", "since", "so", "means", "reason")


def estimate_level(turns: list[dict]) -> int:
    score = 0
    recent = [t for t in turns if t.get("role") == "student"][-3:]
    for t in recent:
        text = (t.get("content") or "").lower()
        if any(m in text for m in CONFUSION_MARKERS):
            score -= 2
        if any(m in text for m in HEDGE_MARKERS):
            score -= 1
        if any(m in text for m in REASON_MARKERS):
            score += 1
        if "wait" in text or "actually" in text:
            score += 1  # self-correction signal
        if any(ch.isdigit() for ch in text):
            score += 1  # uses numeric detail
    if score <= -3:
        return 1
    if score <= -1:
        return 2
    if score <= 1:
        return 3
    if score <= 3:
        return 4
    return 5


def build_strategy_directive(
    turn: int,
    max_turns: int,
    phase: str,
    topic: dict,
    turns: list[dict],
) -> str:
    if turn == 1:
        return (
            "Adaptive strategy: Follow the TURN 1 Opening Survey structure exactly. "
            "Include the 3 questions labeled Basic/Intermediate/Advanced. "
            "Do not add extra questions beyond those three."
        )
    last_student = next((t for t in reversed(turns) if t.get("role") == "student"), None)
    last_text = (last_student.get("content") if last_student else "") or ""
    last_text_l = last_text.lower()
    confusion = any(m in last_text_l for m in CONFUSION_MARKERS)
    estimated_level = estimate_level(turns)

    if phase == "diagnostic":
        if confusion:
            guidance = (
                "If the student is confused, acknowledge it and give ONE short clarification, "
                "then ask ONE simple check question."
            )
        else:
            guidance = (
                "Ask at most TWO short diagnostic questions. Require a brief reason for one."
            )
    else:
        if confusion:
            guidance = (
                "Start by resolving the confusion from the last turn in 2-3 sentences, "
                "then ask ONE focused check question."
            )
        elif estimated_level >= 4:
            guidance = (
                "Ask a transfer or 'why' question to probe depth. Require a 1-sentence justification."
            )
        else:
            guidance = (
                "Give a concise explanation, then ask ONE practice question plus a short reason."
            )

    return (
        "Adaptive strategy: "
        f"turn={turn}/{max_turns}, phase={phase}, "
        f"topic={topic.get('name','')}, estimated_level={estimated_level}. "
        f"{guidance} Avoid long lectures and always respond to the last student message."
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
        if entry.get("role") != "student":
            continue
        content = entry.get("content", "")
        turn_no = entry.get("turn", "?")
        transcript_lines.append(f"Student (turn {turn_no}): {content}")

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

    system_prompt = build_system_prompt(student, topic, 1, max_turns)
    messages = [{"role": "system", "content": system_prompt}]
    turns: list[dict] = []
    locked_prediction: dict | None = None

    for turn in range(1, max_turns + 1):
        messages[0]["content"] = build_system_prompt(student, topic, turn, max_turns)
        phase = "diagnostic" if turn <= 5 else "tutoring"
        if turn == 1:
            turn_directive = (
                f"Turn {turn} of {max_turns}. Phase: {phase}. "
                "Follow the TURN 1 Opening Survey structure exactly. "
                "Ask exactly 3 questions labeled Basic/Intermediate/Advanced."
            )
        else:
            turn_directive = (
                f"Turn {turn} of {max_turns}. Phase: {phase}. "
                "Diagnostic phase: ask short questions only; no teaching. "
                "Tutoring phase: explain and teach based on the student's level."
            )
        strategy_directive = build_strategy_directive(
            turn=turn,
            max_turns=max_turns,
            phase=phase,
            topic=topic,
            turns=turns,
        )
        call_messages = [
            messages[0],
            {"role": "system", "content": turn_directive},
            {"role": "system", "content": strategy_directive},
        ] + messages[1:]
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
    parser.add_argument("--student-id", default=None, help="Run only this student_id")
    parser.add_argument("--topic-id", default=None, help="Run only this topic_id")
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
        if args.student_id and student.get("id") != args.student_id:
            continue
        topics_resp = api_get(base_url, team_api_key, f"/students/{student['id']}/topics")
        topics = topics_resp.get("topics", [])
        if not topics:
            continue
        for topic in topics:
            if args.topic_id and topic.get("id") != args.topic_id:
                continue
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

    if (args.student_id or args.topic_id) and not predictions:
        raise SystemExit("No conversations matched the given --student-id/--topic-id filters.")

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
