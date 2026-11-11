// The one switch for Helper's AI step (talk-live row 1). Pēteris picks the way; until then the commit holds
// no_ai_step, which is what Helper did before: no call is ever made.
//   no_ai_step     Helper answers with its pre-written lines only. Nothing is sent to any AI.
//   ai_picks_line  when code is not sure, the person's own AI picks which of Helper's checked lines to show
//   ai_writes      when code is not sure, the person's own AI writes the reply from Helper's checked lines,
//                  and fixed checks (src/live-checks.js) decide whether it is shown
// It alone picks: whether a typed message can ever be sent, the "are you an AI" line, the first-time faint
// line under the first "Kept:", the settings page's second top line, and (at build) README's lines by mode.
// The build stops when the data's own switches (use_now) say otherwise (scripts/live-data.mjs).
export const AI_MODES = ['no_ai_step', 'ai_picks_line', 'ai_writes']
export const AI_MODE = 'no_ai_step'
