// The one switch for Helper's AI step (talk-live row 1). talk-live-2 (Lead, 11 Nov 2026 04:40, from Pēteris's words of
// 03:45 to 03:58: "Of course there needs to be an AI behind"): the commit holds ai_writes. Code still answers first,
// as built; only what code is not sure of goes to the person's AI.
//   no_ai_step     Helper answers with its pre-written lines only. Nothing is sent to any AI.
//   ai_picks_line  when code is not sure, the person's own AI picks which of Helper's checked lines to show
//   ai_writes      when code is not sure, the person's own AI writes the reply from Helper's checked lines,
//                  and fixed checks (src/live-checks.js) decide whether it is shown
// It alone picks: whether a typed message can ever be sent, the "are you an AI" line, the first-time faint
// line under the first "Kept:", the settings page's second top line, and (at build) README's lines by mode.
// The build stops when the data's own switches (use_now) say otherwise (scripts/live-data.mjs).
export const AI_MODES = ['no_ai_step', 'ai_picks_line', 'ai_writes']
export const AI_MODE = 'ai_writes'
