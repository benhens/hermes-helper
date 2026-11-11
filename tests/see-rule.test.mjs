// live-v2 changes-2 point 2 (keeps.tell.see.see_line_deleted_when): with nothing kept, the list starts with
// "Everything I kept about you is deleted. ..." when this conversation shows a "Kept:" or "From what I keep:" line,
// a kept row in the list, or the "Done." line of a delete; else "I keep nothing about you yet.". Never the met mark.
// The nine cases are hhcontent's see_rule.py (dev/checks/hhcontent-live-v2-changes-2, sha256 70e58c96...), as
// conversation entries the page keeps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keptWasShown, lineFor, laterVisit, freshVisit } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'

const SEE = TALK_DATA.keeps.tell.see
const DONE_ALL = SEE.delete_all.after_yes
const DONE_ONE = TALK_DATA.keeps.typed.forget_one.after_yes
const BACK = { who: 'helper', line: 'BACK', text: 'Hi again. What would you like Hermes to help you with?' }
const kept = { who: 'helper', line: 'F1', text: 'Nice to meet you, Peter. What do you do?', note: { text: 'Kept: Peter.' } }
const you = { who: 'you', text: 'what do you know about me' }
const list = { who: 'helper', line: 'A1', text: SEE.see_line, rows: [['name', 'Peter']] }
const helper = text => ({ who: 'helper', text })
const CASES = [
  ['first visit: name kept (Kept: shown), Delete all, Yes, ask again', [kept, you, list, helper(DONE_ALL), you], 'deleted'],
  ['later visit: BACK, list shown, Delete all, Yes, ask again', [BACK, you, list, helper(DONE_ALL), you], 'deleted'],
  ['later visit: BACK, only the Done line', [BACK, helper(DONE_ALL)], 'deleted'],
  ['later visit: BACK, list shown, then Forget all of this on the settings page, ask again', [BACK, list, you], 'deleted'],
  ['later visit: forget one thing, Yes, nothing left, ask', [BACK, helper(DONE_ONE), you], 'deleted'],
  ['first visit: nothing ever kept, ask', [helper("That's fine. Ask me anything about Hermes."), you], 'nothing'],
  ['later visit: nothing kept, nothing shown in this visit (the gap hhcontent names)', [BACK, you], 'nothing'],
  ['later visit: the list shown with nothing kept is no kept row', [BACK, { who: 'helper', line: 'A1-none', text: SEE.see_line_nothing, rows: null }, you], 'nothing']
]

test('the list\'s first line with nothing kept: hhcontent\'s see_rule.py cases, on any visit', () => {
  for (const [name, log, want] of CASES) {
    for (const st of [freshVisit(), laterVisit({}, true)]) {
      const said = lineFor({ kind: 'A1' }, st, '', { keptShown: keptWasShown(log) })
      assert.equal(said.text, want === 'deleted' ? SEE.see_line_deleted : SEE.see_line_nothing, name)
    }
  }
  // something kept: the list itself (see_rule.py's ninth case)
  const st = laterVisit({ name: 'Peter' }, true)
  assert.equal(lineFor({ kind: 'A1' }, st, '', { keptShown: false }).text, SEE.see_line)
  assert.equal(SEE.see_line_deleted, 'Everything I kept about you is deleted. I only remember that we have met.')
})
