// Tutor prompting system - generates AI tutor responses
// Based on the hackathon's knu_auto_chat.py system

export const TUTORING_SYSTEM_PROMPT = `You are an AI tutor in the Knowunity challenge, working with U.S. middle/high school students.

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
Your first message MUST follow this exact structure (IN ENGLISH):

---
Hi {name}! 👋 Welcome! I'm here to help you with {topic}.

**What we'll cover today:**
In this session we'll work through {topic} concepts together. I want to understand where you're at and then help you build or deepen your understanding step by step.

**Quick check-in:**
1. How comfortable do you feel with {topic}? (e.g., "never heard of it", "a little familiar", "pretty confident")
2. What have you already learned or tried about this topic?

**Let's see what you know:**
I'll ask 3 short questions to understand your starting point:

**Question 1 (Basic):** [Insert simple recall/definition question]
**Question 2 (Intermediate):** [Insert application/concept question]
**Question 3 (Advanced):** [Insert analysis/synthesis question]

Take your time! Answer what you can - it's totally okay if some are tricky. 🙂
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

===== STYLE GUIDELINES =====
- ALWAYS respond in English by default (these are U.S. students)
- Only switch languages if the student explicitly writes in another language
- Be warm, encouraging, and concise (2-4 sentences per response typically)
- Use the student's name occasionally
- Never say: "I'm grading you" or "This determines your level"
- Frame everything as collaborative learning
- Use emojis sparingly (1-2 per message max)

===== VISUAL AIDS =====
You can request educational images to help explain concepts. Use this when:
- Explaining a complex concept that benefits from visualization
- The student seems confused and a diagram would help
- Introducing a new topic where a visual overview would be useful
- During the tutoring phase (turns 6-10) to reinforce learning

To request an image, include this tag in your response:
[IMAGE: brief description of what the image should show]

Examples:
- [IMAGE: diagram showing tectonic plate boundaries and movement directions]
- [IMAGE: simple circuit with battery, resistor, and light bulb]
- [IMAGE: graph showing linear function y = 2x + 1]

Only request ONE image per turn, and only when truly helpful. The image will appear on the classroom monitor.

===== CONTEXT =====
Student: {name}, Grade {grade}
Topic: {topic} ({subject})
Turn: {turn} of {max_turns}

===== YOUR RESPONSE =====
[Your message to the student]
`;

// LLM-based prediction prompt for evaluating student understanding level
// This is called at turn 5 to lock in the predicted level
export const PREDICTION_PROMPT_TEMPLATE = `You are rating a student's understanding level based on student-only responses.
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
- Be strict: if there are fundamental errors or repeated misconceptions, do not rate above Level 2.
- If answers are vague or off-topic, count them as incorrect.

Return a JSON object with:
{
  "level": <integer 1-5>,
  "rationale": "<one short sentence>"
}

Student: {name}, grade {grade}
Topic: {topic} ({subject})

Student responses only:
{transcript}
`;

// Build the prediction prompt with student/topic context
export function buildPredictionPrompt(student, topic, messages) {
  // Build transcript of student responses only
  const transcriptLines = messages
    .filter(m => m.role === 'student')
    .map((m, i) => `Student (turn ${i + 1}): ${m.content}`);

  return PREDICTION_PROMPT_TEMPLATE
    .replace('{name}', student.name || 'Student')
    .replace('{grade}', student.grade_level || '?')
    .replace('{topic}', topic.name || 'Topic')
    .replace('{subject}', topic.subject_name || 'Subject')
    .replace('{transcript}', transcriptLines.join('\n'));
}

// Confusion markers for real-time strategy adaptation
const CONFUSION_MARKERS = [
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
];

// Quick heuristic for strategy adaptation (NOT for final level display)
function quickEstimateForStrategy(messages) {
  const hedgeMarkers = ["maybe", "i think", "i guess", "not sure", "unsure"];
  const reasonMarkers = ["because", "so that", "therefore", "since", "so", "means", "reason"];

  let score = 0;
  const studentMessages = messages
    .filter(m => m.role === 'student')
    .slice(-3);

  for (const msg of studentMessages) {
    const text = (msg.content || '').toLowerCase();

    if (CONFUSION_MARKERS.some(m => text.includes(m))) {
      score -= 2;
    }
    if (hedgeMarkers.some(m => text.includes(m))) {
      score -= 1;
    }
    if (reasonMarkers.some(m => text.includes(m))) {
      score += 1;
    }
    if (text.includes('wait') || text.includes('actually')) {
      score += 1;
    }
    if (/\d/.test(text)) {
      score += 1;
    }
  }

  if (score <= -3) return 1;
  if (score <= -1) return 2;
  if (score <= 1) return 3;
  if (score <= 3) return 4;
  return 5;
}

// Build the system prompt for a tutor response
export function buildTutorSystemPrompt(student, topic, turn, maxTurns) {
  return TUTORING_SYSTEM_PROMPT
    .replace(/{name}/g, student.name || 'Student')
    .replace(/{grade}/g, student.grade_level || '?')
    .replace(/{topic}/g, topic.name || 'Topic')
    .replace(/{subject}/g, topic.subject_name || 'Subject')
    .replace(/{turn}/g, turn.toString())
    .replace(/{max_turns}/g, maxTurns.toString());
}

// Build adaptive strategy directive based on conversation state
export function buildStrategyDirective(turn, maxTurns, phase, topic, messages) {
  if (turn === 1) {
    return (
      "Adaptive strategy: Follow the TURN 1 Opening Survey structure exactly. " +
      "Include the 3 questions labeled Basic/Intermediate/Advanced. " +
      "Do not add extra questions beyond those three."
    );
  }

  const lastStudentMsg = [...messages].reverse().find(m => m.role === 'student');
  const lastText = (lastStudentMsg?.content || '').toLowerCase();
  const isConfused = CONFUSION_MARKERS.some(m => lastText.includes(m));
  const estimatedLevel = quickEstimateForStrategy(messages);

  let guidance;

  if (phase === 'diagnostic') {
    if (isConfused) {
      guidance = (
        "If the student is confused, acknowledge it and give ONE short clarification, " +
        "then ask ONE simple check question."
      );
    } else {
      guidance = (
        "Ask at most TWO short diagnostic questions. Require a brief reason for one."
      );
    }
  } else {
    // Tutoring phase
    if (isConfused) {
      guidance = (
        "Start by resolving the confusion from the last turn in 2-3 sentences, " +
        "then ask ONE focused check question."
      );
    } else if (estimatedLevel >= 4) {
      guidance = (
        "Ask a transfer or 'why' question to probe depth. Require a 1-sentence justification."
      );
    } else {
      guidance = (
        "Give a concise explanation, then ask ONE practice question plus a short reason."
      );
    }
  }

  return (
    "Adaptive strategy: " +
    `turn=${turn}/${maxTurns}, phase=${phase}, ` +
    `topic=${topic.name || ''}, estimated_level=${estimatedLevel}. ` +
    `${guidance} Avoid long lectures and always respond to the last student message.`
  );
}

// Convert conversation messages to OpenAI format
export function buildTutorMessages(student, topic, conversationMessages, turn, maxTurns) {
  const phase = turn <= 5 ? 'diagnostic' : 'tutoring';

  const systemPrompt = buildTutorSystemPrompt(student, topic, turn, maxTurns);

  let turnDirective;
  if (turn === 1) {
    turnDirective = (
      `Turn ${turn} of ${maxTurns}. Phase: ${phase}. ` +
      "Follow the TURN 1 Opening Survey structure exactly. " +
      "Ask exactly 3 questions labeled Basic/Intermediate/Advanced."
    );
  } else {
    turnDirective = (
      `Turn ${turn} of ${maxTurns}. Phase: ${phase}. ` +
      "Diagnostic phase: ask short questions only; no teaching. " +
      "Tutoring phase: explain and teach based on the student's level."
    );
  }

  const strategyDirective = buildStrategyDirective(turn, maxTurns, phase, topic, conversationMessages);

  // Build message array for OpenAI
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: turnDirective },
    { role: 'system', content: strategyDirective },
  ];

  // Add conversation history
  for (const msg of conversationMessages) {
    if (msg.role === 'tutor') {
      messages.push({ role: 'assistant', content: msg.content });
    } else if (msg.role === 'student') {
      messages.push({ role: 'user', content: msg.content });
    }
  }

  return messages;
}
