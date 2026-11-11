// Whether the set-up conversation (content/helper-setup-chat-v1.json) is in this build. false: every offer set that
// has text_no_setup uses it with picks_no_setup, so the pick "Set up Hermes" never shows before it works (Lead, 11 Nov
// 06:25, note b). One line, as src/ai-mode.js: a test loader and the build of a "try" file swap only this line.
export const SETUP_BUILT = true
// Whether the AI step of the recommendation (the job's point 6, src/setup-rec.js) is in this build. true: the two
// answers New to Hermes and What you want go to the person's AI for that one call, and the lines that say what is sent
// (the first-time line under Kept:, the line on Helper's settings page) name them. Read only where SETUP_BUILT is true.
export const SETUP_AI_BUILT = true
