// loom-fixes-2 part B 2 (hhtech ask-run 4, For builder 3): "window" in "context window" or "contex window", and
// "windows" for an app's windows, never picks the Windows line (as the line or as a near pick); a question about
// Windows the system still does. Builder's rule (src/talk.js namesWindowsOs); route2.py has none.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { turnParts, freshVisit, namesWindowsOs } from '../src/talk.js'

const said = text => {
  const st = freshVisit('open', {}, true)
  const { out } = turnParts(text, st)
  return { need: out.need || null, near: out.offer && out.offer.picks ? out.offer.picks.map(p => (p && p.need) || p) : [] }
}

test('a context window, a typo of it, or an app\'s windows: no Windows line, and not among the near picks', () => {
  for (const m of ['whats a contex window', 'contex window', 'what is a context window', 'how big is the contex window?', 'can i open two windows', 'the app window is gone', 'can hermes have several windows open']) {
    const r = said(m)
    assert.notEqual(r.need, 'd_windows', m)
    assert.ok(!r.near.includes('d_windows'), `${m}: ${JSON.stringify(r.near)}`)
  }
})

test('a question about Windows the system still gets the Windows line', () => {
  for (const m of ['does it run on windows', 'windows', 'does hermes work on windows 11', 'can i use it on a windows pc', 'Windows?', 'does hermes run on both windows and mac', 'is there a hermes windows app']) assert.equal(said(m).need, 'd_windows', m)
  assert.equal(namesWindowsOs('is there a windows version'), true)
  assert.equal(namesWindowsOs('contex window'), false)
  assert.equal(namesWindowsOs('two windows'), false)
})

// (review) the opening's small talk twice: the line and the question again each time, never "Sorry, I have nothing
// more on that." with the name question gone (Builder's rule: OPEN_TALK is kept out of no_repeat)
import { turn as turn2, lineFor as lineFor2 } from '../src/talk.js'
test('"hey", "hey" at What\'s your name?: Hi. and the name question both times; the stage stays', () => {
  const st = freshVisit('name')
  for (const t of ['hey', 'hey', 'thanks']) {
    const l = lineFor2(turn2(t, st), st)
    assert.equal(l.ask && l.ask.text, "What's your name?", t)
    assert.equal(st.stage, 'name')
  }
})
