#!/usr/bin/env python3
import argparse
import json
import os
import time
from pathlib import Path
import re
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode

# Fix SSL certificate verification on macOS
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

# Numpy for structured prediction (with fallback)
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print("Warning: numpy not available. Structured prediction will use simplified math.", flush=True)

# Calibration offset for fine-tuning predictions (tune based on MSE results)
CALIBRATION_OFFSET = 0.0


class StudentResponseAnalyzer:
    """Extracts concrete behavioral indicators from student responses."""

    @staticmethod
    def extract_confidence(response: str) -> float:
        """Detect confidence vs uncertainty in student language."""
        uncertainty = [
            "i think", "maybe", "i guess", "not sure", "confused",
            "i'm not sure", "i am not sure", "i'm kinda", "i'm kind of"
        ]
        confidence = [
            "definitely", "absolutely", "clearly", "obviously",
            "i know", "for sure", "without a doubt"
        ]
        text = response.lower()
        u = sum(1 for p in uncertainty if p in text)
        c = sum(1 for p in confidence if p in text)
        if c > u:
            return 4.5
        if u > 0:
            return 2.0
        return 3.0

    @staticmethod
    def extract_reasoning(response: str) -> float:
        """Count reasoning cues (because, therefore, etc.)."""
        cues = ["because", "since", "therefore", "so that", "which means", "this implies", "thus"]
        count = sum(1 for c in cues if c in response.lower())
        if count == 0:
            return 1.5
        if count == 1:
            return 2.5
        if count == 2:
            return 3.5
        if count == 3:
            return 4.5
        return 5.0

    @staticmethod
    def extract_engagement(response: str) -> float:
        """Measure response length and question-asking."""
        if not response or len(response.strip()) < 5:
            return 1.0
        words = response.split()
        if len(words) < 5:
            return 2.0
        if "?" in response:
            return 4.5
        return 3.0

    @staticmethod
    def extract_recovery(response: str) -> float:
        """Detect self-correction attempts."""
        cues = ["wait", "actually", "i meant", "let me fix", "i realized", "oh, no", "sorry, that"]
        text = response.lower()
        if any(c in text for c in cues):
            return 4.5
        return 3.0

    @staticmethod
    def extract_correctness_heuristic(response: str) -> float:
        """Heuristic correctness score when no ground truth is available."""
        if not response or len(response.strip()) < 5:
            return 1.5
        good = ["so", "then", "therefore", "equals", "means", "implies"]
        bad = ["no idea", "don't know", "idk", "lost", "confused"]
        g = sum(1 for w in good if w in response.lower())
        b = sum(1 for w in bad if w in response.lower())
        if b > 0:
            return 2.0
        if g >= 2:
            return 4.0
        return 3.0

    @staticmethod
    def analyze_response(response: str, turn_number: int) -> dict:
        """Combine all signals into structured analysis."""
        return {
            "turn": turn_number,
            "confidence": StudentResponseAnalyzer.extract_confidence(response),
            "correctness": StudentResponseAnalyzer.extract_correctness_heuristic(response),
            "reasoning": StudentResponseAnalyzer.extract_reasoning(response),
            "recovery": StudentResponseAnalyzer.extract_recovery(response),
            "engagement": StudentResponseAnalyzer.extract_engagement(response),
            "length": len(response.split()),
        }


class StructuredPredictor:
    """Predicts understanding level using weighted factors from student analyses."""

    @staticmethod
    def predict_level(analyses: list[dict]) -> tuple[float, str]:
        """
        Multi-factor prediction model.
        Returns (level, rationale) where level is 1.0-5.0 with 0.5 precision.
        """
        if not analyses:
            return 3.0, "No analysis data; defaulting to level 3.0"

        if HAS_NUMPY:
            # Use numpy for efficient array operations
            conf = np.array([a["confidence"] for a in analyses], dtype=float)
            corr = np.array([a["correctness"] for a in analyses], dtype=float)
            reas = np.array([a["reasoning"] for a in analyses], dtype=float)
            engag = np.array([a["engagement"] for a in analyses], dtype=float)

            # Factor 1: average performance (correctness + reasoning + confidence)
            avg_score = (corr * 0.4 + reas * 0.3 + conf * 0.3).mean()
            factor1 = avg_score * 0.35

            # Factor 2: ceiling performance (best answer)
            ceiling = corr.max()
            factor2 = (ceiling / 5.0) * 5.0 * 0.25

            # Factor 3: floor performance (worst answer)
            floor = corr.min()
            factor3 = (floor / 5.0) * 5.0 * 0.15

            # Factor 4: trend over time (improvement/decline)
            mid = max(1, len(analyses) // 2)
            early = corr[:mid].mean()
            late = corr[mid:].mean()
            trend = late - early
            factor4 = (3.0 + trend) * 0.15

            # Factor 5: engagement
            avg_eng = engag.mean()
            factor5 = avg_eng * 0.10
        else:
            # Fallback without numpy (pure Python)
            conf_vals = [a["confidence"] for a in analyses]
            corr_vals = [a["correctness"] for a in analyses]
            reas_vals = [a["reasoning"] for a in analyses]
            engag_vals = [a["engagement"] for a in analyses]

            # Simple averaging
            avg_conf = sum(conf_vals) / len(conf_vals)
            avg_corr = sum(corr_vals) / len(corr_vals)
            avg_reas = sum(reas_vals) / len(reas_vals)
            avg_engag = sum(engag_vals) / len(engag_vals)

            avg_score = avg_corr * 0.4 + avg_reas * 0.3 + avg_conf * 0.3
            factor1 = avg_score * 0.35

            ceiling = max(corr_vals)
            factor2 = (ceiling / 5.0) * 5.0 * 0.25

            floor = min(corr_vals)
            factor3 = (floor / 5.0) * 5.0 * 0.15

            mid = max(1, len(analyses) // 2)
            early = sum(corr_vals[:mid]) / len(corr_vals[:mid])
            late = sum(corr_vals[mid:]) / len(corr_vals[mid:])
            trend = late - early
            factor4 = (3.0 + trend) * 0.15

            avg_eng = avg_engag
            factor5 = avg_eng * 0.10

        # Combine factors
        level = factor1 + factor2 + factor3 + factor4 + factor5

        # Apply calibration offset
        from math import isfinite
        if isfinite(CALIBRATION_OFFSET) and CALIBRATION_OFFSET != 0.0:
            level = level + CALIBRATION_OFFSET

        # Clamp to valid range and round to 0.5 precision
        level = max(1.0, min(5.0, level))
        level = round(level * 2) / 2.0

        rationale = (
            f"avg_score={avg_score:.2f}, ceiling={ceiling:.1f}, floor={floor:.1f}, "
            f"trend={trend:+.2f}, engagement={avg_eng:.2f} → level={level:.1f}"
        )
        return level, rationale





SUPERVISOR_PROMPT = """You are a Pedagogical Supervisor for an AI Tutor.
Your checking the quality of the Tutor's response before it is sent to the student.

## CRITERIA FOR APPROVAL
1. **Accuracy**: Is the math/science correct?
2. **Level Appropriateness**:
    - Level 1-2: Simple, step-by-step, encouraging.
    - Level 3: Balanced explanation and practice.
    - Level 4-5: Minimal hand-holding, challenging.
3. **No Answer-Giving**: The Tutor must NOT give the final answer unless the student has earned it. It must use scaffolding (hints, questions).
4. **Level Verification**:
   - Does the student's actual reasoning level match the 'Assigned Student Level' provided below?
   - If the student seems clearly HIGHER than the assigned level, REJECT and say "Student understanding is higher than Level X".
   - If the student seems clearly LOWER than the assigned level, REJECT and say "Student is struggling more than Level X".
# 4) INTERACTION STRATEGY
- **Turn 1 (Diagnostic)**: Ask a question that requires applying the concept, not just reciting it.
- **Turns 2+ (Adaptive)**:
    - If student is struggling: Simplify, break it down (Level 1-2).
    - If student is accurate: **PROBE DEEPER**. Do not just accept a correct answer.
      - Ask "Why does that work?" or "What would happen if we changed X?" (Level 4/5 Check).
      - **CRITICAL**: You CANNOT classify a student as Level 4 or 5 unless they have successfully answered a "Probing Question" that tests deep understanding or transfer.
- **Tone**: Encouraging but professional. Do NOT give away the answer. Use hints.

# 5) LOCKING & RE-EVALUATION ONLY)
## OUTPUT FORMAT (JSON ONLY)
Return a single JSON object:
{
  "status": "approve" | "reject",
  "feedback": "Explain why it was rejected and how to fix it." (only if rejected)
}
"""

def verify_and_refine_response(
    openai_key, model, history, proposed_response, student, topic, current_level
):
    """
    Uses a 2nd LLM call to verify the proposed response.
    Returns (final_response, was_rejected).
    """
    # Create supervisor context
    transcript = ""
    for m in history:
        role = m.get("role", "unknown")
        content = m.get("content", "")
        if role == "system":
            continue  # Skip system prompts in transcript
        transcript += f"{role.upper()}: {content}\n"
    
    transcript += f"TUTOR (PROPOSED): {proposed_response}\n"

    supervisor_messages = [
        {"role": "system", "content": SUPERVISOR_PROMPT},
        {
            "role": "user", 
            "content": (
                f"Student ID: {student['id']}\n"
                f"Topic ID: {topic['id']}\n"
                f"Assigned Student Level: {current_level}\n\n"
                f"TRANSCRIPT:\n{transcript}"
            )
        }
    ]

    try:
        # Call Supervisor
        # We use a separate simple call here
        import json
        client = Request(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openai_key}",
            },
            data=json.dumps({
                "model": model,  # Use same model or stronger
                "messages": supervisor_messages,
                "temperature": 0.0,
                "response_format": {"type": "json_object"}
            }).encode("utf-8"),
            method="POST"
        )
        
        with urlopen(client, timeout=10, context=SSL_CONTEXT) as resp:
            body = resp.read().decode("utf-8")
            result = json.loads(body)["choices"][0]["message"]["content"]
            decision = json.loads(result)

        if decision.get("status") == "reject":
            # REJECTION: We need to refine.
            # We return specific feedback to the MAIN loop to retry.
            return decision.get("feedback"), True
        
        # APPROVAL
        return proposed_response, False

    except Exception as e:
        print(f"Supervisor Error (bypassing): {e}")
        return proposed_response, False


SYSTEM_PROMPT_TEMPLATE = """You are an AI tutor in the Knowunity challenge.

## GOALS
- Diagnose the student's understanding level (1-5) in Turn 1
- Lock that level and teach accordingly
- Only adjust level UP if student explicitly demonstrates mastery

## UNDERSTANDING LEVELS
1 = Struggling: Cannot restate task; confuses basic terms; needs step-by-step guidance
2 = Below grade: Frequent mistakes; can follow hints but doesn't apply independently
3 = At grade: Solves standard tasks but needs guidance on details; core concepts mostly understood.
4 = Above grade: Solves tasks independently; minor slips are self-corrected; clear reasoning.
5 = Advanced: Deep understanding; connects concepts; rigorous vocabulary; any errors are subtle/nuanced.

## CONVERSATION STRATEGY

### Turn 1: RAPID DIAGNOSIS
- Ask ONE diagnostic question to assess their starting level
- Observe their answer for: terminology, reasoning quality, confidence
- Keep your response SHORT (1-2 sentences max)
- Internally lock their level based on this first response

### Turns 2-10: LEVEL-LOCKED TUTORING
**Teach strictly according to the diagnosed level. Do NOT change level unless student explicitly says "I know this well" or demonstrates clear mastery unprompted.**

**IF LEVEL 1-2 (Struggling/Below Grade):**
- Use very simple, clear language
- Break every concept into tiny steps
- Give concrete, worked examples
- Ask frequent comprehension checks ("Does that make sense?")
- Provide thorough explanation BEFORE asking them to try
- Be patient with repeated mistakes

**IF LEVEL 3 (At Grade):**
- Balance explanation with practice
- Give concise explanations (2-3 sentences)
- Ask them to try examples with hints ready
- Acknowledge mistakes quickly and guide to correction
- Use encouraging, supportive tone
- Gradually increase difficulty

**IF LEVEL 4-5 (Above Grade/Advanced):**
- Give minimal explanation - let them reason
- Present challenging examples immediately
- Ask probing questions to extend thinking
- Let them self-correct when possible
- Encourage deeper exploration and connections
- Move quickly through material

## LEVEL ADJUSTMENT RULE
**CRITICAL**: The level is "locked" after Turn 1, but you must be responsive to clear evidence.

**Adjust UP one level if:**
- Student explicitly says "I already know this" or "This is too easy"
- Student spontaneously explains advanced concepts without prompting

**Adjust DOWN one level if:**
- Student explicitly says "I don't understand this at all" or "I have no idea"
- Student explicitly says "This is too hard" or "I'm completely lost"

If these signals occur, seamlessly shift your teaching style to the new level immediately.
Otherwise, maintain the locked level. If they struggle without explicit statements, provide more support within the current level.


## RESPONSE RULES
✓ Always respond to what the student just said
✓ Acknowledge partial correctness before correcting
✓ Keep responses concise (2-4 sentences typically)
✓ Move learning forward every turn
✓ If student is confused: give more support, don't change level
✓ If student is correct: praise briefly, then continue at current level

## FORBIDDEN
✗ Do NOT mention levels or scoring
✗ Do NOT give long lectures without student engagement
✗ Do NOT delay correction beyond one turn
✗ Do NOT answer with just "Ok" or "Yes"
✗ Do NOT ignore student questions
✗ Do NOT keep re-assessing the level every turn

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
- If there are glaring fundamental issues (basic symbols/notation or task meaning), be stricter and lean lower.

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
        with urlopen(req, timeout=60, context=SSL_CONTEXT) as resp:
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
    student_analyses: list[dict],
) -> tuple[float, str, str]:
    """
    Predict understanding level using GPT-based analysis.
    Returns (level, raw_model_output, rationale) where level is 1.0-5.0.
    """
    # Build transcript for GPT analysis
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
        if isinstance(level_val, str) and level_val.replace(".", "").isdigit():
            level_val = float(level_val)
        if isinstance(level_val, (int, float)) and 1 <= level_val <= 5:
            level = float(level_val)
        rationale_val = data.get("rationale")
        if isinstance(rationale_val, str):
            rationale = rationale_val.strip()
    except json.JSONDecodeError:
        pass
    
    if level is None:
        match = re.search(r"\b([1-5](?:\.\d)?)\b", raw_str)
        if match:
            level = float(match.group(1))
    
    if level is None:
        level = 3.0
    
    # Note: student_analyses are still collected for future tuning/ensemble
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
    
    # Initialize analyzer for student responses
    analyzer = StudentResponseAnalyzer()
    student_analyses: list[dict] = []

    for turn in range(1, max_turns + 1):
        phase = "diagnostic" if turn <= 5 else "tutoring"
        if phase == "diagnostic":
            turn_directive = (
                f"Turn {turn} of {max_turns}. Phase: diagnostic. "
                "Ask ONE short, targeted question to reveal the student's understanding. "
                "Do NOT teach or give full solutions yet. Focus on probing their thinking."
            )
        else:
            turn_directive = (
                f"Turn {turn} of {max_turns}. Phase: tutoring. "
                "Give a concise explanation or guided example adapted to the student's inferred level, "
                "then ask ONE short follow-up question to check understanding."
            )

        call_messages = [messages[0], {"role": "system", "content": turn_directive}] + messages[1:]
        tutor_message = openai_call(openai_key, model, call_messages, mode)

        # --- REAL-TIME SUPERVISOR CHECK ---
        # Determine current level for verification
        current_level_val = "Unknown (Diagnostic Phase)"
        if locked_prediction:
            current_level_val = str(locked_prediction.get("prediction", {}).get("level", "Unknown"))
        
        feedback, was_rejected = verify_and_refine_response(
            openai_key, model, messages, tutor_message, student, topic, current_level_val
        )
        if was_rejected:
            print(f"  [Supervisor REJECTED]: {feedback}", flush=True)
            # Retry ONCE with feedback
            retry_directive = (
                f"Your previous response was REJECTED by the supervisor.\n"
                f"FEEDBACK: {feedback}\n"
                f"Please generate a revised response adhering to this feedback."
            )
            # We append the rejection to the history temporarily for the retry
            # But we don't save it to the permanent history
            retry_messages = call_messages + [
                {"role": "assistant", "content": tutor_message},
                {"role": "system", "content": retry_directive}
            ]
            tutor_message = openai_call(openai_key, model, retry_messages, mode)
            print(f"  [Tutor REVISED]: {normalize(tutor_message)}", flush=True)
        # ----------------------------------
        
        # Fallback for trivial responses
        tutor_message = tutor_message.strip()

        if len(tutor_message) < 10:
            if phase == "diagnostic":
                tutor_message = (
                    "To understand you better, can you explain how you currently think about this topic?"
                )
            else:
                tutor_message = (
                    "Let me walk you through a clear example step by step, then I'll ask you to try a similar one."
                )
        
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
            
            # Analyze student response
            analysis = analyzer.analyze_response(student_response, turn)
            student_analyses.append(analysis)

        # Initial lock at Turn 1
        if turn == 1 and locked_prediction is None:
            diagnostic_turns = [t for t in turns if t.get("phase") == "diagnostic"]
            level, raw, rationale = predict_level(
                openai_key, model, mode, student, topic, diagnostic_turns, student_analyses
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

        # Dynamic re-evaluation for Turns > 1
        elif turn > 1 and locked_prediction is not None:
            # Check for strong signals in the latest analysis
            last_analysis = student_analyses[-1]
            conf = last_analysis.get("confidence", 3.0)
            recov = last_analysis.get("recovery", 3.0)
            
            # Heuristic: strong confidence (4.5) or explicit confusion (2.0 on confidence/correctness)
            # You can tune these thresholds.
            strong_signal = False
            if conf >= 4.5:
                strong_signal = True  # Student is very confident
            elif conf <= 2.0:
                strong_signal = True  # Student is explicitly uncertain/confused
            
            if strong_signal:
                # Re-predict using all history so far
                level, raw, rationale = predict_level(
                    openai_key, model, mode, student, topic, turns, student_analyses
                )
                
                # If the new level is different from the locked level, update it
                current_level = locked_prediction["level"]
                if abs(level - current_level) >= 0.5:
                    print(f"Re-evaluating level due to strong signal at turn {turn}. Old: {current_level}, New: {level}", flush=True)
                    locked_prediction = {
                        "level": level,
                        "model": model,
                        "raw": raw,
                        "rationale": f"Re-evaluated at turn {turn}: {rationale}",
                        "phase": phase,
                    }
                    log_event(
                        log_file,
                        "prediction_update",
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
            openai_key, model, mode, student, topic, diagnostic_turns or turns, student_analyses
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
            "student_analyses": student_analyses,
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
    parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Number of parallel workers for conversations (default: 10)"
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

    import concurrent.futures

    # Collect all tasks first
    tasks = []
    for student in students:
        topics_resp = api_get(base_url, team_api_key, f"/students/{student['id']}/topics")
        topics = topics_resp.get("topics", [])
        if not topics:
            continue
        for topic in topics:
            tasks.append((student, topic))

    predictions: list[dict] = []
    
    # Process in parallel
    workers = args.workers if hasattr(args, "workers") else 10
    print(f"Starting {len(tasks)} conversations with {workers} workers...", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_task = {
            executor.submit(
                run_conversation,
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
            ): (student, topic)
            for student, topic in tasks
        }
        
        for future in concurrent.futures.as_completed(future_to_task):
            student_task, topic_task = future_to_task[future]
            try:
                pred = future.result()
                predictions.append(pred)
            except Exception as exc:
                print(f"Conversation generated an exception for student {student_task.get('name')}: {exc}", flush=True)

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
