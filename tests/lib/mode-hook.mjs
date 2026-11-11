// talk-live (Lead's answer 6): every test runs in all three AI modes. With HELPER_AI_MODE set, this hook (loaded
// with --import, see scripts/test-modes.mjs) makes src/ai-mode.js say that mode, and tests/lib/render.mjs does the
// same to the built file it loads. The files on disk are never changed.
import { register } from 'node:module'
register('./mode-loader.mjs', import.meta.url)
