// loom-fixes-2 part B 4 (Lead's answers 3 and 4 to find-v2's questions): "can it watch youtube videos" gets
// hhcontent's YouTube line, as in route2.py; the correction "Hermes is not made by OpenAI ..." gets a button
// "What Hermes is" (the label set in the build's data until hhcontent's data has one), which says the line HERMES
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turn, freshVisit, lineFor, sayLine } from '../src/talk.js'
import { TALK_DATA } from '../src/talk-data.js'

test('"can it watch youtube videos": the YouTube row (w_youtube), not the nearest rows (N2)', () => {
  for (const m of ['can it watch youtube videos', 'can it summarise a youtube video']) {
    const o = turn(m, freshVisit('open', {}, true))
    assert.deepEqual([o.kind, o.row], ['want', 'w_youtube'], m)
  }
})

test('the correction "Hermes is not made by OpenAI": a button "What Hermes is" that says what Hermes is', () => {
  const st = freshVisit('open', {}, true)
  const o = turn('is hermes made by openai?', st)
  assert.equal(o.kind, 'FB_MAKER')
  const said = lineFor(o, st)
  assert.match(said.text, /^Hermes is not made by OpenAI\. It is made by Nous Research\.$/)
  assert.deepEqual(said.next, { kind: 'line', label: 'What Hermes is', line: 'HERMES' })
  assert.equal(TALK_DATA.false_belief.lines.FB_MAKER.next.label, 'What Hermes is')
  const r = sayLine('HERMES', st)
  assert.equal(lineFor(r, st).text, TALK_DATA.fixed.HERMES.text)
})
