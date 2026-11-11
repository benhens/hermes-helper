// loom-fixes-2 (content/helper-loom-fixes-v2.md "For builder" 6): the migrate line's docs box quotes the docs' line 15
// with hermes migrate, word for word as hhcontent's data has it (the plugin's copy is pinned in tests/lib/team-pins.mjs)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TALK_DATA } from '../src/talk-data.js'

test('MIG_APP docs box: the new quote and where (import-from-other-agents.md, line 15)', () => {
  const box = TALK_DATA.fixed.MIG_APP.docs_box
  assert.equal(box.quote, 'hermes migrate <agent> (openclaw, claude-code, codex, cursor, grok-bot, openbot) to import from one agent')
  assert.match(box.where, /import-from-other-agents\.md, line 15$/)
})
