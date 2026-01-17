# Iteration Log

- 2026-01-16: Added iteration log. Reviewed conversation prompt usage (history preserved each turn; adaptation instruction present but general).
- 2026-01-16: Updated conversation system prompt with explicit adaptation rules when students are confused.
- 2026-01-16: Conversation LLM now returns JSON with tutor_message and per-turn estimated_level; estimates are logged and printed.
- 2026-01-16: Explicitly tied per-turn estimated_level to the 1–5 understanding rubric definitions.
- 2026-01-16: Switched to 5-turn diagnostic phase then 5-turn tutoring; removed per-turn numeric estimates from conversation output.
- 2026-01-16: Locked diagnostic level after turn 5 and used it for MSE predictions/logging.
- 2026-01-16: Reviewed latest conversations to refine level-inference prompt guidance.
- 2026-01-16: Tightened scoring prompt to be stricter when fundamental issues appear.
