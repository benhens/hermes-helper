// Helper's conversation on the page (talk v2: design/talk-r5, option 4), rendered from the built
// plugin with the stand-ins (tests/lib/render.mjs): the opening, the bubble, the conversation so
// far, the things to pick inside the message box and their keyboard rules, buttons inside the
// bubble, "Skip", a pasted key, what Helper keeps (one stored record, the faint "Kept: ..." line,
// "See what I keep", "Change", a later visit, forgetting) and that nothing is sent anywhere.
// What Helper answers is tests/talk.test.mjs (compared with route2.py); the page's frame and
// narrow windows tests/page-render.test.mjs; the character tests/helper-character.test.mjs;
// Helper's settings page tests/settings-page.test.mjs.
// Builder, 10 Nov 2026 (talk v2: rewritten from the talk v1 tests; the topics now show only when
// the person asks what they can ask, so the tests reach a topic through "what can I ask").
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData } from './lib/render.mjs'
import { TALK_DATA } from '../src/talk-data.js'
import { WANTS_DATA } from '../src/wants-data.js'
import { T, K } from '../src/look.js'
import { curlyQuotes } from '../src/quotes.js'
import { FIRST_TIME, WORK_TOLD } from '../src/talk.js'

function useHost({ runtime = { ok: true, model: 'mock-small' } } = {}) {
  const calls = []
  globalThis.__hhHost = {
    calls,
    request: async method => {
      calls.push(method)
      const answer = { 'setup.runtime_check': runtime, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      if (answer instanceof Error) throw answer
      return answer
    }
  }
}

// extra: { registerSettingsPage: undefined } is a Hermes without plugin settings pages
async function open({ storage = fakeStorage(), host = {}, extra = {} } = {}) {
  useHost(host)
  const timers = fakeTimers()
  const { Page } = await registerPlugin(storage, timers, extra)
  const view = mount(Page)
  await settle()
  return { view, timers, storage, Page }
}

// as drawn: curly apostrophes (d1ceddc review 3.3, src/quotes.js)
const OPEN = 'Hi, I’m Helper. I can help you learn about Hermes and set it up. What’s your name?'
const helper = view => byData(view.tree, 'helper')
const root = view => byData(view.tree, 'page')
const bubble = view => byData(helper(view), 'bubble')
// setup-chat (offer-t1, changes-8): a line that carries an offer is followed by a second bubble with the offer's
// question. line() and said() below still mean Helper's line for the message: when the bubble holds an offer, the
// line just above it. offerLine() and offerSaid() read the offer bubble itself (tests/offers-page.test.mjs has its cases).
const offerUp = view => !!bubble(view) && String(bubble(view).props['data-line']).startsWith('offer-')
const lastOld = view => all(helper(view), n => n.props['data-hh'] === 'old').at(-1)
const offerLine = view => (offerUp(view) ? bubble(view).props['data-line'] : null)
const offerSaid = view => (offerUp(view) ? spoken(byData(bubble(view), 'said')).trim() : null)
const line = view => (offerUp(view) ? lastOld(view).props['data-line'] : bubble(view).props['data-line'])
const said = view => (offerUp(view) ? text(lastOld(view)).replace(/^Helper said: /, '').replace(/\s+/g, ' ').trim() : spoken(byData(bubble(view), 'said')).trim())
// Everything above the bubble: older lines, the person's messages and the faint lines.
const conversation = view => byData(helper(view), 'conversation-lines').props.children
// Only the older lines and the person's messages.
const lines = view => conversation(view).filter(c => c.props['data-hh'] === 'old' || c.props['data-hh'] === 'me')
const notes = view => conversation(view).filter(c => c.props['data-hh'] === 'kept-note' || c.props['data-hh'] === 'used-note')
// What is on screen in an older line or a message, without the words only a screen reader hears.
const words = node => text(node).replace(/^(?:You|Helper) said: /, '').trim()
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const composer = view => byData(view.tree, 'composer')
// The things to pick live in the message box (talk-r5), not in Helper's window.
const picks = view => byData(view.tree, 'picks')
const group = view => byData(view.tree, 'answers')
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const labels = view => answers(view).map(a => text(a).trim())
const answer = (view, label) => answers(view).find(a => text(a).trim() === label)
const button = view => byData(bubble(view), 'bubble-button')
const skipLink = view => byData(view.tree, 'skip')
const click = node => {
  if (!node) throw new Error('nothing to click')
  node.props.onClick({ preventDefault() {} })
}
// The person presses the mouse somewhere on the page: a line that is still appearing shows whole.
const finish = view => root(view).props.onPointerDownCapture({})
function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
}
// Says the line out, then picks.
const pickNow = (view, label) => {
  finish(view)
  click(answer(view, label))
}
// The box of things to pick has shrunk away (the end of its 0.3 s transition).
const shrunk = view => {
  const p = picks(view)
  if (p) p.props.onTransitionEnd({ target: p, currentTarget: p })
}
// Asks what one can ask: the topics, said out.
const askTopics = view => {
  send(view, 'what can I ask')
  finish(view)
}
// Past the opening: name, what the person does.
async function pastOpening(options) {
  const opened = await open(options)
  finish(opened.view)
  send(opened.view, 'Peter')
  finish(opened.view)
  // normal-chat: no "What do you do?" any more: the opening ends with the name
  return opened
}
// Past the opening, then the topics.
async function atTopics(options) {
  const opened = await pastOpening(options)
  askTopics(opened.view)
  return opened
}
const TOPIC_LABELS = TALK_DATA.topic_picks.map(p => p.label)
const SETTINGS_HREF = '/settings?tab=plugins&plugin=helper'

beforeEach(() => {
  delete globalThis.__hhHost
  delete globalThis.ResizeObserver
  delete globalThis.matchMedia
})

test('the opening: the greeting in the bubble, nothing above it, nothing to pick, "Reply to Helper" in the message box, "Skip" beside Send', async () => {
  const { view } = await open()
  assert.equal(line(view), 'OPEN')
  assert.equal(said(view), OPEN)
  assert.equal(bubble(view).props.className, T.bubble)
  assert.deepEqual(conversation(view), [])
  assert.equal(picks(view), null)
  assert.equal(group(view), null)
  assert.equal(byData(bubble(view), 'in-bubble'), null, 'no button in the opening')
  assert.equal(box(view).props.placeholder, 'Reply to Helper')
  assert.equal(text(skipLink(view)).trim(), 'Skip')
  assert.equal(skipLink(view).type, 'button')
  assert.equal(skipLink(view).props.className, T.skip)
})



























test('on a Hermes without plugin settings pages: "See what I keep" shows the list in the conversation, with "Delete all of it" that asks first', async () => {
  const { view, storage } = await pastOpening({ extra: { registerSettingsPage: undefined } })
  click(byData(notes(view).at(-1), 'kept-link'))
  assert.equal(globalThis.__hhHost.navigated, undefined)
  assert.equal(line(view), 'A1')
  assert.equal(words(lines(view).at(-1)), 'See what I keep')
  assert.equal(byData(bubble(view), 'hint'), null)
  finish(view)
  assert.equal(text(button(view)).trim(), 'Delete all of it')
  click(button(view))
  assert.equal(line(view), 'A4')
  finish(view)
  assert.deepEqual(labels(view), TALK_DATA.keeps.tell.see.delete_all.answers.map(a => a.label))
  assert.ok(storage.data.has('kept'), 'nothing deleted before the Yes')
  click(answer(view, TALK_DATA.keeps.tell.see.delete_all.answers[0].label))
  assert.equal(line(view), 'A-yes')
  assert.equal(storage.data.has('kept'), false, 'the record is removed whole')
})





test('a screen reader hears who said each line of the conversation so far: "Helper said:" or "You said:" before the words, unseen on screen', async () => {
  const { view } = await pastOpening()
  const [first, mine] = lines(view)
  const who = n => n.props.children[0]
  assert.equal(who(first).type, 'span')
  assert.equal(who(first).props.className, K.srOnly)
  assert.equal(text(who(first)), 'Helper said: ')
  assert.equal(words(first), OPEN)
  assert.equal(who(mine).type, 'span')
  assert.equal(who(mine).props.className, K.srOnly)
  assert.equal(text(who(mine)), 'You said: ')
  assert.equal(words(mine), 'Peter')
  assert.doesNotMatch(text(bubble(view)), /said: /)
})



/* ---------- the wants (talk v2 row 5) ---------- */
// To "What do you want Hermes to do?": the topics, "What Hermes can do", "Web, files, pictures and voice".
async function atWants() {
  const opened = await atTopics()
  pickNow(opened.view, 'What Hermes can do')
  pickNow(opened.view, 'Web, files, pictures and voice')
  finish(opened.view)
  return opened
}
const docsBox = view => byData(bubble(view), 'docs')
const stepsList = view => byData(bubble(view), 'steps')








/* ---------- the fixes from hhtech's newcomer run of e86b410 (talk v2 fixes) ---------- */
const ANNA = () => ({ name: 'Anna', mod: 'mod1', msg: 'Telegram', told: true })
const keptNotes = view => conversation(view).filter(c => c.props['data-hh'] === 'kept-note')
// A faint line marked as forgotten: its words struck through (a <del>), the link still there.
const forgotten = note => note.props['data-forgotten'] === 'true' && !!byData(note, 'kept-gone')
const yesLabel = TALK_DATA.keeps.typed.forget_one.answers.find(a => a.gives === 'yes').label


test('forgotten on Helper\'s settings page: back in the conversation, the "Kept:" line of what was deleted is marked too', async () => {
  useHost()
  const storage = fakeStorage()
  const { Page } = await registerPlugin(storage, fakeTimers())
  const view = mount(Page)
  await settle()
  finish(view)
  send(view, 'Peter')
  finish(view)
  send(view, 'I run a tennis club')
  finish(view)
  assert.equal(forgotten(keptNotes(view)[0]), false)
  // the settings page's "Forget all of this" removes the record; Hermes draws the page fresh after Settings
  view.unmount()
  storage.remove('kept')
  const back = mount(Page)
  await settle()
  assert.equal(forgotten(byData(back.tree, 'conversation-lines').props.children.find(c => c.props['data-hh'] === 'kept-note')), true)
})





