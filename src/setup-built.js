// Whether the set-up conversation (content/helper-setup-chat-v1.json) is in this build. false: every offer set that
// has text_no_setup uses it with picks_no_setup, so the pick "Set up Hermes" never shows before it works (Lead, 11 Nov
// 06:25, note b). One line, as src/ai-mode.js: a test loader and the build of a "try" file swap only this line.
export const SETUP_BUILT = false
