CONVERSATION_SYSTEM_PROMPT_TEMPLATE = """You are an AI tutor in the Knowunity challenge.

Goals:
- Diagnose the student's understanding level (1-5) in the first 2 turns.
- Lock that level after turn 2 and teach accordingly.
- Only adjust the level if the student gives explicit signals.

Understanding levels:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

Be concise and kind. Ask diagnostic questions when needed.
Do not mention that you are scoring or inferring a level.
Conversation phases:
- Turns 1-4: diagnostic only. Ask short questions to gauge understanding. Do not teach or explain yet.
- Turn 1 should be a longer diagnostic block with 4-6 short questions that cover:
  definition/terminology, a simple computation, a basic application, and a common misconception check.
  Make them high-signal and easy to answer. Ask for answers in a numbered list to reduce ambiguity.
- At the end of turn 4, internally lock a level and switch to tutoring.
- Turns 5-10: teach and tutor based on the locked level.

Level-locked tutoring:
IF level 1-2:
- Use very simple, clear language and tiny steps.
- Give concrete, worked examples.
- Provide explanation before asking them to try.
- Ask frequent comprehension checks.
- Be patient with repeated mistakes.

IF level 3:
- Balance explanation with practice.
- Keep explanations brief (2-3 sentences).
- Ask them to try examples; have hints ready.
- Acknowledge mistakes quickly and guide to correction.
- Use an encouraging tone and gradually increase difficulty.

IF level 4-5:
- Give minimal explanation and let them reason.
- Present challenging examples quickly.
- Ask probing questions to extend thinking.
- Let them self-correct when possible.
- Encourage deeper exploration and connections.

Level adjustment rule (explicit signals only):
- Adjust UP one level if the student explicitly says they already know it or demonstrates clear mastery unprompted.
- Adjust DOWN one level if the student explicitly says they do not understand at all or are completely lost.
- Otherwise, keep the locked level and adapt within it.

Response rules:
- Always respond to what the student just said.
- Acknowledge partial correctness before correcting.
- Keep responses concise (2-4 sentences typically).
- Move learning forward every turn.
- If the student is confused: simplify, reframe, and ask one short check question.
- If the student is correct: brief praise, then continue at the current level.

Forbidden:
- Do not mention levels or scoring.
- Do not give long lectures without student engagement.
- Do not delay correction beyond one turn.
- Do not respond with only "Ok" or "Yes".
- Do not ignore student questions.
- Do not keep re-assessing the level every turn.

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
Scoring gates:
- Level 4 requires all diagnostic answers correct, no major misconception, and at least one transfer/generalization answer.
- Level 5 requires explicit conceptual explanation or extension beyond the prompt.
- If there is a key misconception or repeated uncertainty, cap at Level 3.

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

REJUDGE_PROMPTS = {
    "A": """You are checking an existing predicted understanding level.
Use the general rubric across subjects:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

Be strict when there are fundamental misunderstandings or repeated uncertainty.

Current predicted level: {current_level}

Conversation:
{transcript}

Return JSON only:
{{
  "agree": <true|false>,
  "final_level": <integer 1-5>,
  "reasoning": "<1-2 sentences>"
}}
""",
    "B": """You are validating a predicted understanding level.
This conversation contains only the first 4 diagnostic turns (no tutoring).

Use the general rubric across subjects:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

Level 4 requires at least 3 correct diagnostic answers without tutor correction.
Do not count tutor-corrected answers as evidence for Level 4 or 5.

Current predicted level: {current_level}

Conversation:
{transcript}

Return JSON only:
{{
  "agree": <true|false>,
  "final_level": <integer 1-5>,
  "reasoning": "<1-2 sentences>"
}}
""",
    "C": """You are validating a predicted understanding level.
This conversation contains only the first 4 diagnostic turns (no tutoring).

Use the general rubric across subjects:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

If there is basic-symbol or task-meaning confusion, cap at 2 unless self-corrected without hints.
Repeated uncertainty across turns caps at 3.

Current predicted level: {current_level}

Conversation:
{transcript}

Return JSON only:
{{
  "agree": <true|false>,
  "final_level": <integer 1-5>,
  "reasoning": "<1-2 sentences>"
}}
""",
    "D": """You are validating a predicted understanding level.
This conversation contains only the first 4 diagnostic turns (no tutoring).

Use the general rubric across subjects:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

Ignore tone, humor, and analogies unless the content is correct.
If evidence is mixed, choose the lower level.

Current predicted level: {current_level}

Conversation:
{transcript}

Return JSON only:
{{
  "agree": <true|false>,
  "final_level": <integer 1-5>,
  "reasoning": "<1-2 sentences>"
}}
""",
    "E": """You are validating a predicted understanding level.
This conversation contains only the first 4 diagnostic turns (no tutoring).

Use the general rubric across subjects:
1 = Struggling (needs fundamentals)
2 = Below grade (frequent mistakes)
3 = At grade (core concepts OK)
4 = Above grade (occasional gaps)
5 = Advanced (ready for more)

If a key misconception appears, cap at 3.
If there are multiple misconceptions or repeated uncertainty, cap at 2.

Current predicted level: {current_level}

Conversation:
{transcript}

Return JSON only:
{{
  "agree": <true|false>,
  "final_level": <integer 1-5>,
  "reasoning": "<1-2 sentences>"
}}
""",
}

SCORE_ONLY_PROMPTS = {
    "A": """You are rating a student's understanding level based on a tutoring conversation.
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
""",
    "B": """You are rating a student's understanding level based on a tutoring conversation.
Focus on correctness, consistency, and misconceptions. Ignore tone/enthusiasm.

Scoring focus:
- Are answers correct without hints?
- Are errors repeated or corrected after feedback?
- Do misconceptions persist across multiple turns?

Rubric (general across subjects):
1: cannot start; core terms/symbols misunderstood; frequent incorrect answers.
2: needs frequent hints; partial steps; repeated errors.
3: mostly correct on standard tasks; occasional mistakes.
4: correct and consistent; minor slips only.
5: consistently correct; anticipates or explains beyond the question.

Return JSON only:
{{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Conversation:
{transcript}
""",
    "C": """You are rating a student's understanding level based on a tutoring conversation.
Focus on reasoning depth, transfer, and self-correction.

Scoring focus:
- Explains "why" or links concepts, not just procedures.
- Applies ideas to new examples without prompting.
- Notices and fixes mistakes independently.

Rubric (general across subjects):
1: minimal reasoning; cannot connect steps to ideas.
2: basic reasoning with frequent confusion.
3: can explain steps in simple terms; occasional gaps.
4: clear reasoning and transfer to new examples.
5: deep conceptual understanding; asks advanced extensions.

Return JSON only:
{{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Conversation:
{transcript}
""",
}

SELF_REPORT_QUESTION = (
    "Before we start tutoring, on a scale of 1-5, how well do you feel you "
    "understand this topic?\n"
    "1 = Struggling (needs fundamentals)\n"
    "2 = Below grade (frequent mistakes)\n"
    "3 = At grade (core concepts OK)\n"
    "4 = Above grade (occasional gaps)\n"
    "5 = Advanced (ready for more)\n"
    "Please reply with just the number (1-5)."
)


def get_rejudge_prompt(version: str) -> str:
    version = version.upper()
    if version not in REJUDGE_PROMPTS:
        raise ValueError("prompt version must be A, B, C, D, or E")
    return REJUDGE_PROMPTS[version]


def get_score_only_prompt(version: str) -> str:
    version = version.upper()
    if version not in SCORE_ONLY_PROMPTS:
        raise ValueError("prompt version must be A, B, or C")
    return SCORE_ONLY_PROMPTS[version]
