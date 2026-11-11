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
const line = view => bubble(view).props['data-line']
const said = view => spoken(byData(bubble(view), 'said')).trim()
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
  send(opened.view, 'I run a tennis club')
  finish(opened.view)
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

test('the opening, played: the name, with the faint "Kept: Peter." line and its first-time line under it (changes-15), what the person does, then "Ask me anything" with nothing to pick', async () => {
  const { view } = await open()
  finish(view)
  send(view, 'Peter')
  assert.equal(said(view), 'Nice to meet you, Peter. What do you do?')
  assert.equal(group(view), null, 'still nothing to pick')
  assert.ok(skipLink(view), 'Skip stays at the second question')
  // changes-15: the name is kept as soon as it is given: last above the bubble, the faint line about what was
  // kept, with its link and, this once, where it is kept (the no-model wording: there is no AI step)
  const note = conversation(view).at(-1)
  assert.equal(note.props['data-hh'], 'kept-note')
  assert.equal(note.props.className, T.note)
  assert.equal(text(note.props.children[0]), 'Kept: Peter.')
  const link = byData(note, 'kept-link')
  assert.equal(link.type, 'button')
  assert.equal(link.props.className, T.link)
  assert.equal(text(link), 'See what I keep')
  assert.equal(text(byData(note, 'kept-first')), FIRST_TIME) // talk-live: the line of this build's AI mode
  assert.equal(TALK_DATA.keeps.tell.first_time_if_no_model_call, 'I keep this in the Hermes app on this computer. Nothing you type to me goes to any AI or anyone. Never tell me passwords.')
  finish(view)
  send(view, 'I run a tennis club')
  assert.equal(line(view), 'F2')
  assert.equal(said(view), 'Thanks, Peter. Ask me anything about Hermes.')
  assert.equal(skipLink(view), null)
  // talk-live-2 (live-v2 changes-4): what the person does is kept, with its own faint line; the first-time line was
  // told under F1, so not again; in a build with an AI step, the line that the AI is told it, once
  const workNote = conversation(view).at(-1)
  assert.equal(workNote.props['data-hh'], 'kept-note')
  assert.equal(text(workNote.props.children[0]), 'Kept: I run a tennis club.')
  assert.equal(byData(workNote, 'kept-first'), null, 'the first-time line was told once, under F1')
  if (WORK_TOLD) assert.equal(text(byData(workNote, 'kept-work-told')), WORK_TOLD)
  else assert.equal(byData(workNote, 'kept-work-told'), null)
  finish(view)
  // talk v2 (changes-7): no topics after the greeting
  assert.equal(picks(view), null)
  assert.equal(box(view).props.placeholder, 'Reply to Helper')
  // what was said before has moved up: Helper's lines small on its side, the person's on theirs
  assert.deepEqual(lines(view).map(c => [c.props['data-hh'], c.props.className, words(c)]), [
    ['old', T.old, OPEN],
    ['me', T.me, 'Peter'],
    ['old', T.old, 'Nice to meet you, Peter. What do you do?'],
    ['me', T.me, 'I run a tennis club']
  ])
  assert.equal(notes(view).length, 2)
  // the first-time line comes once only
  send(view, 'remember that my club has six courts')
  assert.equal(line(view), 'RM1')
  assert.equal(text(notes(view).at(-1).props.children[0]), 'Kept: my club has six courts.')
  assert.equal(byData(notes(view).at(-1), 'kept-first'), null)
})

test('"Skip" at the name question: it becomes the person\'s message, Helper says "That\'s fine", nothing to pick; no name is asked for again', async () => {
  const { view } = await open()
  click(skipLink(view))
  assert.equal(line(view), 'F3')
  assert.equal(said(view), 'That’s fine. Ask me anything about Hermes.')
  assert.equal(skipLink(view), null)
  assert.deepEqual(lines(view).map(c => words(c)), [OPEN, 'Skip'])
  finish(view)
  assert.equal(picks(view), null)
  // and at the second question
  const second = await open()
  send(second.view, 'Peter')
  click(skipLink(second.view))
  assert.equal(line(second.view), 'F3')
})

test('the topics only when asked: "what can I ask" gives line TP with the four topics, in the message box', async () => {
  const { view } = await pastOpening()
  send(view, 'what can I ask')
  assert.equal(line(view), 'TP')
  assert.equal(said(view), 'You can ask me how Hermes works and how to set it up. Pick one, or type your own question.')
  finish(view)
  assert.deepEqual(labels(view), TOPIC_LABELS)
  assert.equal(labels(view).length, 4)
  assert.equal(box(view).props.placeholder, 'Or type your question')
  for (const asked of ['help', 'what should I ask?', 'Hey Helper, what do you know?']) {
    send(view, asked)
    assert.equal(line(view), 'TP', asked)
  }
})

test('things to pick: a named group of real buttons inside the message box, above the line where one types, in full even rows', async () => {
  const { view } = await atTopics()
  const g = group(view)
  assert.equal(g.props.role, 'group')
  assert.equal(g.props['aria-label'], 'Answers to pick')
  assert.equal(g.props.className, T.answers)
  for (const a of answers(view)) {
    assert.equal(a.type, 'button')
    assert.equal(a.props.type, 'button')
    assert.equal(a.props.className, T.answer)
  }
  // inside the message box, before the line where one types; none beside the character any more
  const surface = composer(view).props.children
  assert.ok(all(surface, n => n === picks(view)).length === 1, 'in the message box')
  assert.equal(all(byData(helper(view), 'under'), n => n.props['data-hh'] === 'answer').length, 0)
  const kids = surface.props.children.filter(Boolean)
  assert.ok(kids.indexOf(picks(view)) < kids.findIndex(k => all(k, n => n.type === 'sdk:Textarea').length), 'above the line where one types')
  assert.equal(picks(view).props.className, T.picks)
  // four: two rows of two
  assert.equal(g.props['data-columns'], 2)
  assert.equal(g.props.style['--hh-cols'], 2)
  // three: one row ("Which one do you mean?" with three topics)
  send(view, 'memory model telegram')
  finish(view)
  assert.equal(labels(view).length, 3)
  assert.equal(group(view).props['data-columns'], 3)
  // two: one row
  send(view, 'does the memory work with claude')
  finish(view)
  assert.equal(labels(view).length, 2)
  assert.equal(group(view).props['data-columns'], 2)
})

test('the box of things to pick grows only once the line is said and shrinks after a pick: unseen, unread and out of the Tab order until then', async () => {
  const { view, timers } = await pastOpening()
  send(view, 'what can I ask') // the line that offers the topics starts to appear, word by word
  assert.equal(line(view), 'TP')
  assert.equal(bubble(view).props['data-said'], false)
  const waiting = picks(view)
  assert.ok(waiting, 'in the tree from the first word, at height 0, so that it can grow')
  assert.equal(waiting.props['data-open'], false)
  assert.equal(waiting.props['aria-hidden'], true)
  assert.equal(waiting.props.style.height, '0px')
  for (const a of answers(view)) assert.equal(a.props.tabIndex, -1)
  // pressing one that is not seen yet does nothing
  const before = conversation(view).length
  answers(view)[1].props.onClick({ preventDefault() {} })
  assert.equal(line(view), 'TP')
  assert.equal(conversation(view).length, before)
  // word by word to the last word: then they are there
  for (let i = 0; i < 40; i++) timers.tick()
  assert.equal(bubble(view).props['data-said'], true)
  assert.equal(picks(view).props['data-open'], true)
  assert.equal(picks(view).props['aria-hidden'], undefined)
  for (const a of answers(view)) assert.equal(a.props.tabIndex, 0)
  // a pick that leads to a new list: the box closes at once, the new labels wait at height 0 for
  // their line. (Keeping the old labels while it shrinks is the component's own state, which these
  // stand-ins do not keep for an inner component: that part is checked in the running app, row 7.)
  click(answer(view, 'Phone and chat apps'))
  assert.equal(line(view), 'msg-q')
  assert.equal(picks(view).props['data-open'], false)
  assert.equal(picks(view).props.style.height, '0px')
  for (const a of answers(view)) assert.equal(a.props.tabIndex, -1)
  finish(view)
  assert.equal(picks(view).props['data-open'], true)
  assert.deepEqual(labels(view), ['Telegram', 'WhatsApp', 'Discord', 'Slack'])
  // a pick that leads to a line with nothing to pick: nothing open
  click(answer(view, 'WhatsApp'))
  assert.ok(!picks(view) || picks(view).props['data-open'] === false)
  shrunk(view)
  // the grow and shrink is the style sheet's, 0.3 s on the height (cut to nothing under reduce motion)
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'talk.css'), 'utf8'), /\.hh-picks\{transition:height \.3s ease-in-out\}/)
})

test('a pick becomes the person\'s message and Helper answers at once; the keyboard goes back to the message box', async () => {
  const { view } = await atTopics()
  let focused = 0
  box(view).props.ref.current = { focus: () => focused++ }
  click(answer(view, 'Phone and chat apps'))
  assert.equal(focused, 1)
  assert.equal(line(view), 'msg-q')
  assert.equal(said(view), 'Which chat app do you use most?')
  assert.deepEqual(lines(view).slice(-2).map(c => [c.props['data-hh'], words(c)]), [
    ['old', 'You can ask me how Hermes works and how to set it up. Pick one, or type your own question.'],
    ['me', 'Phone and chat apps']
  ])
  // only the newest line has things to pick
  finish(view)
  assert.deepEqual(labels(view), ['Telegram', 'WhatsApp', 'Discord', 'Slack'])
  assert.equal(box(view).props.placeholder, 'Or type your own answer')
  click(answer(view, 'WhatsApp'))
  assert.equal(focused, 2)
  assert.equal(line(view), 'msg2')
  shrunk(view)
  assert.equal(group(view), null, 'an answer line has nothing to pick')
  assert.equal(box(view).props.placeholder, 'Reply to Helper')
  assert.equal(lines(view).at(-1).props['data-hh'], 'me')
  assert.equal(words(lines(view).at(-1)), 'WhatsApp')
})

test('answers to pick only under the questions that carry them: an open question has none, and is answered by typing', async () => {
  // the team's own list (answers.when_shown), read from the data file: the build keeps only the code's part
  const raw = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'content', 'helper-talk-v2.json'), 'utf8'))
  const carry = raw.answers.when_shown.questions
  for (const topic of TALK_DATA.topics) {
    const { view } = await atTopics()
    const held = TALK_DATA.topic_picks.find(p => p.holds && p.holds.includes(topic.id))
    if (held) pickNow(view, held.label)
    // changes-14: the topic use is reached by typing only ("usage" alone asks use-q)
    if (topic.typed_only) send(view, 'usage')
    else pickNow(view, topic.pick.label)
    assert.equal(line(view), topic.question.id)
    finish(view)
    assert.equal(labels(view).length, topic.question.answers.length, topic.id)
    const key = Object.keys(carry).find(q => q.startsWith(topic.question.id + ' '))
    // use-q is not in that list: changes-14 says its four answers sit under it like the other picked answers
    assert.equal(labels(view).length > 0, topic.typed_only ? true : carry[key], `${topic.id}: ${key}`)
  }
})

test('a pick goes by its own id, never through the key words: every answer of every question gives exactly its row', async () => {
  let checked = 0
  for (const topic of TALK_DATA.topics) {
    for (const [i, a] of topic.question.answers.entries()) {
      const { view } = await atTopics()
      // the topic's pick, through "What Hermes can do" where it is held there
      const held = TALK_DATA.topic_picks.find(p => p.holds && p.holds.includes(topic.id))
      if (held) {
        pickNow(view, held.label)
        assert.equal(line(view), held.line)
      }
      // changes-14: the topic use is reached by typing only ("usage" alone asks use-q)
      if (topic.typed_only) send(view, 'usage')
      else pickNow(view, topic.pick.label)
      assert.equal(line(view), topic.question.id)
      finish(view)
      assert.equal(text(answers(view)[i]).trim(), a.label)
      click(answers(view)[i])
      // changes-6 fix 6: Gmail has its own line, CN1; changes-16: Google Calendar CN2 (tests/talk-wants.test.mjs)
      const own = a.service && WANTS_DATA.service_lines[a.service]
      assert.equal(line(view), own ? own.line : a.gives, `${topic.id}: "${a.label}"`)
      checked++
    }
  }
  // changes-14: use-q's four answers join the twelve
  assert.equal(checked, 16)
})

test('the pick that holds four: "What Hermes can do" gives its own line with the wants first; "Web, files, pictures and voice" asks what you want Hermes to do, with the four groups', async () => {
  const { view } = await atTopics()
  click(answer(view, 'What Hermes can do'))
  assert.equal(line(view), 'C1')
  assert.equal(said(view), 'Hermes can work with the web, files and pictures. It can do jobs on a schedule and use services like Gmail. Pick one.')
  finish(view)
  assert.deepEqual(labels(view), ['Web, files, pictures and voice', 'Daily jobs and reminders', 'Gmail and other services', 'More than one Hermes'])
  assert.equal(box(view).props.placeholder, 'Or type your question')
  click(answer(view, 'Web, files, pictures and voice'))
  assert.equal(line(view), 'can-q')
  assert.equal(said(view), 'What do you want Hermes to do?')
  finish(view)
  assert.deepEqual(labels(view), ['Search and use the web', 'Files and my computer', 'Pictures and video', 'Voice and sound'])
  assert.equal(group(view).props['data-columns'], 2)
  assert.equal(box(view).props.placeholder, 'Or type your own answer')
})

test('the picked service fills the text to paste: "Notion" → "Show me what to ask" opens the text with Notion in it, with Copy; pressed again it closes', async () => {
  const { view } = await atTopics()
  click(answer(view, 'What Hermes can do'))
  pickNow(view, 'Gmail and other services')
  pickNow(view, 'Notion')
  assert.equal(line(view), 'svc1')
  finish(view)
  const b = button(view)
  assert.equal(text(b).trim(), 'Show me what to ask')
  assert.equal(b.props.className, T.button)
  assert.equal(b.props['aria-expanded'], false)
  assert.equal(all(b, n => n.type === 'sdk:Codicon')[0].props.name, 'chevron-down')
  assert.equal(all(bubble(view), n => n.type === 'sdk:CopyButton').length, 0)
  click(b)
  assert.equal(button(view).props['aria-expanded'], true)
  const copy = all(bubble(view), n => n.type === 'sdk:CopyButton')
  assert.equal(copy.length, 1)
  assert.equal(copy[0].props.text, 'Please connect Notion. If there is a ready-made MCP for it, add that. Ask me before you change anything.')
  // talk v2 look: inside the bubble, Hermes's own small code card (notes-wants.md item 4), the words
  // exactly as they will be pasted
  const shown = all(bubble(view), n => n.type === 'span' && n.props.className === K.bubblePasteText)
  assert.equal(text(shown[0]), copy[0].props.text)
  assert.equal(byData(bubble(view), 'paste').props.className, K.bubblePaste)
  assert.equal(byData(bubble(view), 'in-bubble').props.className, `${T.inBubble} ${T.inBubbleColumn}`)
  assert.equal(line(view), 'svc1', 'Helper says nothing new for it')
  click(button(view))
  assert.equal(all(bubble(view), n => n.type === 'sdk:CopyButton').length, 0)
})

test('a button in the bubble sits under a thin line, waits for the line like the answers do, and is a real button with a small arrow', async () => {
  const { view, timers } = await atTopics()
  click(answer(view, 'Phone and chat apps'))
  pickNow(view, 'Telegram')
  assert.equal(line(view), 'msg1')
  const held = byData(bubble(view), 'in-bubble')
  assert.equal(held.props.className, `${T.inBubble} ${T.wait}`)
  assert.equal(held.props['aria-hidden'], true)
  assert.equal(button(view).props.tabIndex, -1)
  button(view).props.onClick({ preventDefault() {} })
  assert.equal(globalThis.__hhHost.navigated, undefined, 'a button that is not seen yet does nothing')
  for (let i = 0; i < 40; i++) timers.tick()
  assert.equal(byData(bubble(view), 'in-bubble').props.className, T.inBubble)
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], undefined)
  const b = button(view)
  assert.equal(b.type, 'button')
  assert.equal(b.props.tabIndex, 0)
  assert.equal(text(b).trim(), 'Open Messaging')
  assert.equal(all(b, n => n.type === 'sdk:Codicon')[0].props.name, 'arrow-right')
  assert.equal(b.props['aria-expanded'], undefined)
})

test('"Open Messaging", "Open Model" and "Open Capabilities" open Hermes\'s own screens; a door that fails breaks nothing', async () => {
  const cases = [
    [['Phone and chat apps', 'Telegram'], 'Open Messaging', '/messaging'],
    [['Which AI to use', 'ChatGPT'], 'Open Model', '/settings?tab=config:model'],
    [['What Hermes can do', 'Gmail and other services', 'Is it safe to connect?'], 'Open Capabilities', '/capabilities']
  ]
  for (const [route, label, to] of cases) {
    const { view } = await atTopics()
    for (const p of route) pickNow(view, p)
    finish(view)
    assert.equal(text(button(view)).trim(), label)
    click(button(view))
    assert.deepEqual(globalThis.__hhHost.navigated, [to])
    assert.equal(lines(view).at(-1).props['data-hh'], 'me', 'pressing it says nothing in the conversation')
    globalThis.__hhHost.navigateThrows = true
    const before = line(view)
    click(button(view))
    assert.equal(line(view), before)
  }
})

test('Bots: no button. In its place, under the thin line, Helper says where the tab is; it waits for the line too', async () => {
  const { view } = await atTopics()
  click(answer(view, 'What Hermes can do'))
  pickNow(view, 'More than one Hermes')
  assert.equal(line(view), 'bot-q')
  send(view, 'help the first one')
  assert.equal(line(view), 'bot0')
  assert.equal(button(view), null)
  assert.equal(all(bubble(view), n => n.type === 'button').length, 0)
  const where = byData(bubble(view), 'where')
  assert.equal(where.type, 'p')
  assert.equal(where.props.className, T.where)
  // talk v2 look, point 4: drawn with curly quote marks; the data keeps its straight ones
  assert.equal(text(where), 'In the Hermes app, “Bots” is the tab next to “Sessions”, top left.')
  assert.equal(TALK_DATA.parts.bots.where_line.text, 'In the Hermes app, "Bots" is the tab next to "Sessions", top left.')
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], true, 'not read out before the line is said')
  finish(view)
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], undefined)
  assert.equal(globalThis.__hhHost.navigated, undefined)
  assert.doesNotMatch(text(helper(view)), /Open Bots/)
})

test('a button that makes Helper say one more line: "How to add one" becomes the person\'s message and the next line follows', async () => {
  const { view } = await pastOpening()
  send(view, 'second bot for work')
  assert.equal(line(view), 'bot1')
  finish(view)
  assert.equal(text(button(view)).trim(), 'How to add one')
  click(button(view))
  assert.equal(line(view), 'bot1-next')
  assert.match(said(view), /^Open “Bots”, press “\+”, then “New bot”\./)
  assert.deepEqual(lines(view).slice(-2).map(c => [c.props['data-hh'], c.props['data-line'] || words(c)]), [['old', 'bot1'], ['me', 'How to add one']])
})

test('an older line keeps its button as a small link, and it still works: text to paste opens under the older line', async () => {
  const { view } = await atTopics()
  click(answer(view, 'What Hermes remembers'))
  assert.equal(line(view), 'mem-q')
  send(view, 'things about me')
  assert.equal(line(view), 'mem1')
  finish(view)
  send(view, 'what is a skill')
  assert.equal(line(view), 'term-skill')
  const old = lines(view).find(c => c.props['data-line'] === 'mem1')
  const link = byData(old, 'old-link')
  assert.equal(link.type, 'button')
  assert.equal(link.props.className, T.oldLink)
  assert.equal(text(link).trim(), 'Try it')
  assert.equal(link.props['aria-expanded'], false)
  click(link)
  const again = lines(view).find(c => c.props['data-line'] === 'mem1')
  assert.equal(byData(again, 'old-link').props['aria-expanded'], true)
  assert.equal(all(again, n => n.type === 'sdk:CopyButton')[0].props.text, 'Please save this to your memory: <one thing about you>. Then tell me what you saved.')
  assert.equal(line(view), 'term-skill', 'the bubble is not touched')
  finish(view)
  click(byData(bubble(view), 'bubble-button'))
  send(view, 'hello there')
  const term = lines(view).find(c => c.props['data-line'] === 'term-skill')
  globalThis.__hhHost.navigated = []
  click(byData(term, 'old-link'))
  assert.deepEqual(globalThis.__hhHost.navigated, ['/capabilities'])
})

test('talk v2 look (rule C point 3, settled by Lead): text to paste that was opened closes when its line moves up; its link stays, and one click opens it again under the older line', async () => {
  const { view } = await atTopics()
  click(answer(view, 'What Hermes remembers'))
  send(view, 'what we talked about')
  assert.equal(line(view), 'mem2')
  finish(view)
  click(button(view))
  assert.equal(all(bubble(view), n => n.type === 'sdk:CopyButton').length, 1, 'open in the newest bubble')
  send(view, 'what is a plugin')
  const old = () => lines(view).find(c => c.props['data-line'] === 'mem2')
  assert.equal(all(old(), n => n.type === 'sdk:CopyButton').length, 0, 'closed once the line moved up')
  const link = byData(old(), 'old-link')
  assert.equal(link.props['aria-expanded'], false)
  click(link)
  assert.equal(all(old(), n => n.type === 'sdk:CopyButton').length, 1, 'one click opens it again')
  assert.equal(byData(old(), 'old-link').props['aria-expanded'], true)
  assert.equal(byData(old(), 'paste-text').props.className, K.bubblePasteTextOld)
  // and it closes again when the next line comes
  send(view, 'what is a skill')
  assert.equal(all(old(), n => n.type === 'sdk:CopyButton').length, 0)
})

test('a request to do it: "your own Hermes can", with the person\'s own words to paste shown at once (no button to press first)', async () => {
  const { view } = await pastOpening()
  send(view, 'please install a skill for writing emails')
  assert.equal(line(view), 'H1')
  assert.equal(said(view), 'I can’t do that, but your own Hermes can. Paste this into a new chat with it.')
  assert.equal(button(view), null)
  const copy = all(bubble(view), n => n.type === 'sdk:CopyButton')
  assert.equal(copy.length, 1)
  assert.equal(copy[0].props.text, 'I asked for this: "please install a skill for writing emails". Please do it for me. Ask me before you change anything.')
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], true, 'it waits for the line like a button')
  finish(view)
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], undefined)
})

test('a pasted key: Helper\'s fixed line, the box empties, and the key is nowhere on the page, in the conversation or in storage', async () => {
  const { view, storage, Page } = await pastOpening()
  const key = 'sk-or-v1-' + 'f3a9'.repeat(12)
  send(view, `my key is ${key}`)
  assert.equal(box(view).props.value, '')
  assert.equal(line(view), 'K1')
  assert.equal(said(view), 'That looks like a secret key. I did not keep it. Keys go in Settings, never in a chat.')
  assert.ok(!JSON.stringify(view.tree).includes(key))
  assert.ok(!JSON.stringify([...storage.data]).includes(key))
  assert.equal(lines(view).at(-1).props['data-hh'], 'old')
  // "remember that" with a key in it: the key line, nothing kept
  send(view, `remember that my key is ${key}`)
  assert.equal(line(view), 'K1')
  assert.ok(!JSON.stringify([...storage.data]).includes(key))
  view.unmount()
  const again = mount(Page)
  assert.ok(!JSON.stringify(again.tree).includes(key))
  send(again, 'x'.repeat(600) + ' ' + key)
  assert.equal(byData(byData(again.tree, 'helper'), 'bubble').props['data-line'], 'K1')
  assert.ok(!JSON.stringify(again.tree).includes(key))
})

test('"Which one do you mean?": the matches to pick, at most four; the pick answers the message that led to it', async () => {
  const { view } = await pastOpening()
  send(view, 'does the memory work with claude')
  assert.equal(line(view), 'W1')
  finish(view)
  assert.deepEqual(labels(view), ['What Hermes remembers', 'Which AI to use'])
  assert.equal(box(view).props.placeholder, 'Or type your own answer')
  click(answer(view, 'Which AI to use'))
  assert.equal(line(view), 'mod2', 'Claude was in the message: the Claude line, not the question')
  assert.equal(words(lines(view).at(-1)), 'Which AI to use')
  send(view, 'memory model telegram schedule gmail second bot')
  finish(view)
  assert.deepEqual(labels(view), ['What Hermes remembers', 'Which AI to use', 'Phone and chat apps', 'Daily jobs and reminders'])
})

test('a message nobody has an answer for: the fixed line and, small under it, the hint (N_HINT); no topics', async () => {
  const { view } = await pastOpening()
  send(view, 'what is the weather in Riga')
  await settle() // talk-live: in an AI mode the line comes after the (failing) call; with no AI step at once
  assert.equal(line(view), 'N1')
  finish(view)
  assert.equal(picks(view), null)
  const hint = byData(bubble(view), 'hint')
  assert.equal(hint.type, 'p')
  assert.equal(hint.props.className, T.where)
  assert.equal(text(hint), curlyQuotes(TALK_DATA.fixed.N_HINT.text))
  assert.equal(text(hint), 'To see what I can help with, type “what can I ask you”.')
})

test('a long message is shown back cut to 500 characters; Helper still reads all of it', async () => {
  const { view } = await pastOpening()
  send(view, 'why '.repeat(140) + 'does memory forget')
  const mine = lines(view).at(-1)
  assert.equal(mine.props['data-hh'], 'me')
  assert.equal(Array.from(words(mine)).length, 501)
  assert.ok(text(mine).endsWith('…'))
  assert.equal(line(view), 'mem-q', 'the word after character 500 was read')
})

test('what is kept about the person: one stored record ("kept") by fixed rules, what they do (live-v2 changes-4) but never the conversation; nothing is sent', async () => {
  const { view, storage } = await open()
  finish(view)
  send(view, 'Peter')
  finish(view)
  send(view, 'I run a tennis club')
  askTopics(view)
  pickNow(view, 'Phone and chat apps')
  pickNow(view, 'WhatsApp')
  send(view, 'remember that my club has six courts')
  send(view, 'please install a skill')
  send(view, 'what is a skill')
  assert.deepEqual([...storage.data.keys()].sort(), ['kept', 'met'], 'the record and the met mark (changes-14), nothing else')
  assert.equal(storage.data.get('met'), true)
  assert.deepEqual(storage.data.get('kept'), { name: 'Peter', work: 'I run a tennis club', msg: 'WhatsApp', asked: ['my club has six courts'], told: true, told_work: true })
  assert.doesNotMatch(JSON.stringify([...storage.data]), /install|skill/)
  assert.deepEqual(globalThis.__hhHost.calls.filter(m => m !== 'setup.runtime_check' && m !== 'setup.status'), [], 'and nothing was sent to Hermes')
})

test('no AI step: the conversation\'s code reaches no model and no request; the built file has no model call in the conversation', () => {
  const src = f => fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', f), 'utf8')
  for (const f of ['talk.js', 'talk-view.js', 'kept.js', 'settings-file.js', 'settings-page.js']) {
    assert.doesNotMatch(src(f), /request\(|askModel|model-call|turnWithModel|fetch\(|XMLHttpRequest|WebSocket|rest\(|socket\(/, f)
  }
  // page.js uses the model check only for "Your setup" (the setup cards), never in the conversation
  const page = src('page.js')
  assert.doesNotMatch(page, /turnWithModel|askModel|model-call/)
  const built = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'desktop', 'plugin.js'), 'utf8')
  assert.doesNotMatch(built, /turnWithModel|talk\.model|model_hint/)
})

test('the conversation lives while the plugin is loaded; when Hermes starts again it is gone, but the kept name is not: a later visit opens with BACK and asks no name (changes-14/15)', async () => {
  useHost()
  const storage = fakeStorage()
  const first = await registerPlugin(storage, fakeTimers())
  const view = mount(first.Page)
  await settle()
  finish(view)
  send(view, 'Peter')
  view.unmount()
  const back = mount(first.Page)
  await settle()
  assert.equal(spoken(byData(byData(back.tree, 'bubble'), 'said')).trim(), 'Nice to meet you, Peter. What do you do?')
  // the opening line, the name and the faint "Kept: Peter." line
  assert.equal(byData(back.tree, 'conversation-lines').props.children.length, 3)
  // changes-15: the name and met are written as soon as the name is given
  assert.deepEqual(storage.data.get('kept'), { name: 'Peter', told: true })
  assert.equal(storage.data.get('met'), true)
  finish(back)
  send(back, 'I run a tennis club')
  // talk-live-2 (live-v2 changes-4): what the person does is kept, and outlives the restart below
  assert.deepEqual(storage.data.get('kept'), { name: 'Peter', told: true, work: 'I run a tennis club', told_work: true })
  // Hermes starts again: the plugin is loaded anew, with the same storage
  const second = await registerPlugin(storage, fakeTimers())
  const fresh = mount(second.Page)
  await settle()
  assert.equal(byData(fresh.tree, 'bubble').props['data-line'], 'BACK')
  finish(fresh)
  assert.equal(spoken(byData(byData(fresh.tree, 'bubble'), 'said')).trim(), 'Hi again, Peter. What would you like Hermes to help you with?')
  assert.deepEqual(byData(fresh.tree, 'conversation-lines').props.children, [])
  assert.equal(byData(fresh.tree, 'skip'), null, 'no question to skip')
  assert.doesNotMatch(text(fresh.tree), /tennis|your name/, 'Helper does not say on a later visit what it remembers (not decided)')
  send(fresh, 'what do you know about me')
  assert.equal(byData(fresh.tree, 'bubble').props['data-line'], 'A1')
  assert.deepEqual(all(byData(fresh.tree, 'kept-rows'), n => n.type === 'li').map(n => text(n)), ['Your name: Peter', 'What you do: I run a tennis club'])
})

test('his complaint (changes-14): Skip on the first visit is remembered; after Hermes starts again Helper asks no name, then "hey" and "he" get their own lines', async () => {
  useHost()
  const storage = fakeStorage()
  const first = await registerPlugin(storage, fakeTimers())
  const view = mount(first.Page)
  await settle()
  assert.equal(byData(view.tree, 'bubble').props['data-line'], 'OPEN')
  finish(view)
  click(skipLink(view))
  assert.equal(line(view), 'F3')
  assert.equal(storage.data.get('met'), true, 'Skip writes the met mark')
  assert.equal(storage.data.has('kept'), false, 'and nothing about the person')
  // Hermes starts again, twice: never the name question
  for (let i = 0; i < 2; i++) {
    const again = await registerPlugin(storage, fakeTimers())
    const v = mount(again.Page)
    await settle()
    assert.equal(byData(v.tree, 'bubble').props['data-line'], 'BACK')
    finish(v)
    assert.equal(said(v), 'Hi again. What would you like Hermes to help you with?')
    assert.equal(skipLink(v), null)
    send(v, 'hey')
    assert.equal(line(v), 'HELLO_SAME', 'a hello right after BACK: the same-greeting line')
    send(v, 'he')
    assert.equal(line(v), 'CUT')
    assert.equal(said(v), TALK_DATA.fixed.CUT.text)
    v.unmount()
  }
  // Forget all on the settings page side (the record removed): met stays, still no name question
  storage.data.delete('kept')
  const third = await registerPlugin(storage, fakeTimers())
  const v3 = mount(third.Page)
  await settle()
  assert.equal(byData(v3.tree, 'bubble').props['data-line'], 'BACK')
})

test('"See what I keep" opens Helper\'s settings page; "what do you know about me" lists what is kept with "Open Helper settings" and the way there by hand', async () => {
  const { view } = await pastOpening()
  click(byData(notes(view).at(-1), 'kept-link'))
  assert.deepEqual(globalThis.__hhHost.navigated, [SETTINGS_HREF])
  assert.equal(line(view), 'F2', 'Helper says nothing for it')
  send(view, 'what do you know about me')
  assert.equal(line(view), 'A1')
  assert.equal(said(view), 'This is all I keep about you.')
  assert.deepEqual(all(byData(bubble(view), 'kept-rows'), n => n.type === 'li').map(n => text(n)), ['Your name: Peter', 'What you do: I run a tennis club'])
  assert.equal(text(byData(bubble(view), 'hint')), 'By hand: open “Settings”, then “Plugins”, then “Helper”.')
  finish(view)
  assert.equal(text(button(view)).trim(), 'Open Helper settings')
  click(button(view))
  assert.deepEqual(globalThis.__hhHost.navigated, [SETTINGS_HREF, SETTINGS_HREF])
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

test('"forget my name": Yes and No to pick in the message box; Yes forgets it in storage, No keeps it', async () => {
  for (const [i, kept] of [[0, null], [1, 'Peter']]) {
    const { view, storage } = await pastOpening()
    send(view, 'forget my name')
    assert.equal(line(view), 'A2-name')
    assert.equal(said(view), 'Delete your name?')
    finish(view)
    assert.deepEqual(labels(view), ['Yes, delete it', 'No'])
    click(answers(view)[i])
    assert.equal(line(view), i === 0 ? 'A-yes' : 'A-no')
    assert.equal((storage.data.get('kept') || {}).name || null, kept)
  }
})

test('"From what I keep: ... Change": a kept answer is used, and Change asks the question again', async () => {
  const { view, storage } = await atTopics()
  pickNow(view, 'Which AI to use')
  pickNow(view, 'ChatGPT')
  assert.equal(line(view), 'mod1')
  assert.equal(storage.data.get('kept').mod, 'mod1')
  askTopics(view)
  pickNow(view, 'Which AI to use')
  assert.equal(line(view), 'mod1', 'not asked again')
  const used = notes(view).at(-1)
  assert.equal(used.props['data-hh'], 'used-note')
  assert.equal(text(used.props.children[0]), 'From what I keep: you pay for ChatGPT.')
  click(byData(used, 'used-link'))
  assert.equal(line(view), 'mod-q')
  assert.equal(words(lines(view).at(-1)), 'Change')
})

test('the conversation so far is a named, scrolling part of its own, kept at its newest; the bubble is not inside it', async () => {
  const { view } = await pastOpening()
  const conv = byData(helper(view), 'conversation')
  assert.equal(conv.props.className, T.conv)
  assert.equal(conv.props.role, 'group')
  assert.equal(conv.props['aria-label'], 'Conversation so far')
  assert.equal(all(conv, n => n.props['data-hh'] === 'bubble').length, 0)
  const el = { scrollTop: 0, scrollHeight: 900 }
  conv.props.ref.current = el
  send(view, 'what is a skill')
  assert.equal(el.scrollTop, 900)
  assert.equal(all(helper(view), n => n.props['data-hh'] === 'bubble').length, 1)
})

test('Helper\'s lines hold no link out of the page and no model\'s words: every line said is one of the pre-written ones', async () => {
  const { view } = await pastOpening()
  const W = WANTS_DATA
  const pre = new Set([
    ...TALK_DATA.topics.flatMap(t => [t.question.text, t.plain.text, ...t.needs.map(n => n.text)]),
    ...TALK_DATA.terms.map(t => t.text),
    ...Object.values(TALK_DATA.fixed).flatMap(f => [f.text, f.text_no_name]),
    ...W.rows.map(r => r.text),
    ...Object.values(W.fixed).map(f => f.text),
    W.question.text,
    // skill lines v1: "It teaches Hermes to {say}", or the old sentence (text_fixed) when a skill has no say
    ...W.skills.map(s => {
      const f = s.kind === 'optional' ? W.fixed.S2 : W.fixed.S1
      return s.say != null ? f.text.replace('{name}', s.name).replace('{say}', s.say) : f.text_fixed.replace('{name}', s.name)
    })
  ])
  for (const w of ['what is a skill', 'how does memory work?', 'can it read my gmail', 'tell me a joke', 'second bot for work', 'what can I ask', 'can it read pdfs', 'can it edit my videos', 'is there a github skill', 'what does the dspy skill do', 'is there a skill called sdlc-review']) {
    send(view, w)
    await settle() // talk-live: as above
    const now = said(view).replace('Thanks, Peter.', 'Thanks, {name}.')
    // (drawn with curly quote marks: talk v2 look, point 4)
    assert.ok(pre.has(now) || [...pre].some(p => curlyQuotes(p) === now), `${w} → ${now}`)
    assert.equal(all(helper(view), n => n.type === 'a').length, 0)
  }
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

test('a pasted key at "What\'s your name?": Helper\'s line about keys, and "Skip" is still there, because the question is still open', async () => {
  const key = 'sk-or-v1-' + 'f3a9'.repeat(12)
  const { view } = await open()
  finish(view)
  send(view, key)
  assert.equal(line(view), 'K1')
  assert.ok(skipLink(view), 'Skip stays: the name question is still the open one')
  click(skipLink(view))
  assert.equal(line(view), 'F3')
  assert.equal(skipLink(view), null)
  const second = await open()
  send(second.view, key)
  send(second.view, 'Peter')
  assert.equal(line(second.view), 'F1')
  assert.ok(skipLink(second.view), 'the second question is open now')
})

test('a long conversation: it holds the newest 200 entries, and each new line still brings the newest into view', async () => {
  const { view } = await pastOpening()
  const el = { scrollTop: 0, scrollHeight: 900 }
  byData(helper(view), 'conversation').props.ref.current = el
  for (let i = 0; i < 104; i++) send(view, 'what is a skill')
  const full = conversation(view).length
  assert.equal(full, 199, 'the newest 200: 199 above the bubble')
  el.scrollTop = 0
  el.scrollHeight = 5000
  send(view, 'what is a plugin')
  assert.equal(conversation(view).length, full, 'full: the two oldest went')
  assert.equal(el.scrollTop, 5000)
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

test('a group: "Here is what I have checked for that", its rows to pick; over four, three and "More", which shows the next ones the same way', async () => {
  const { view } = await atWants()
  pickNow(view, 'Search and use the web')
  assert.equal(line(view), 'G1')
  assert.equal(said(view), 'Here is what I have checked for that. Pick one, or type your own.')
  finish(view)
  assert.deepEqual(labels(view), ['Search the web', 'Use a website for me', 'Post on X for me', 'More'])
  const before = lines(view).length
  click(answer(view, 'More'))
  // "More" says nothing new and is not the person's message: the next ones take the picks' place
  assert.equal(line(view), 'G1')
  assert.equal(lines(view).length, before)
  assert.deepEqual(labels(view), ['Read Reddit', 'Find research papers', 'Find places and routes', 'More'])
  click(answer(view, 'More'))
  assert.deepEqual(labels(view), ['Check stock prices', 'Watch a price for me'])
  assert.equal(group(view).props['data-columns'], 2)
  // a group of four (changes-16 added "Turn voice notes into text" to voice): two by two, no More
  const second = await atWants()
  pickNow(second.view, 'Voice and sound')
  finish(second.view)
  assert.deepEqual(labels(second.view), ['Talk to it out loud', 'Read answers out loud', 'Turn voice notes into text', 'Write a song'])
})

test('a row picked: the person\'s message is its label, Helper says the row\'s own line, and "Show me what to ask" opens the text to paste', async () => {
  const { view } = await atWants()
  pickNow(view, 'Files and my computer')
  pickNow(view, 'Read my documents')
  assert.equal(line(view), 'w_docs')
  assert.equal(said(view), 'Hermes can read Word, Excel and PDF files. This is built in. Scanned pages come out empty.')
  assert.equal(words(lines(view).at(-1)), 'Read my documents')
  finish(view)
  assert.equal(text(button(view)).trim(), 'Show me what to ask')
  click(button(view))
  const copy = all(bubble(view), n => n.type === 'sdk:CopyButton')
  assert.equal(copy[0].props.text, 'Please read this file and tell me what is in it: <where the file is>. If you cannot read part of it, say which part.')
  assert.equal(docsBox(view), null, 'a hand-written row shows no docs box')
})

test('an optional skill\'s row: "Show me how to add it" opens the app\'s clicks, "Show more" among them, then that it works from the next new chat; no command anywhere', async () => {
  const { view } = await atWants()
  pickNow(view, 'Search and use the web')
  finish(view)
  click(answer(view, 'More'))
  pickNow(view, 'Read Reddit')
  assert.equal(line(view), 'w_reddit')
  finish(view)
  const b = button(view)
  assert.equal(text(b).trim(), 'Show me how to add it')
  assert.equal(b.props['data-kind'], 'steps')
  assert.equal(b.props['aria-expanded'], false)
  assert.equal(stepsList(view), null)
  click(b)
  assert.equal(button(view).props['aria-expanded'], true)
  const items = all(stepsList(view), n => n.type === 'li').map(n => text(n).trim())
  assert.deepEqual(items, [
    'In the Hermes app, click "Capabilities", then the "Skills" tab.',
    'Click "Source", then pick "Optional".',
    'Find the card "reddit-reading". If it is not there, scroll down and click "Show more". Do it again until you see it.',
    'Click the card, then click "Install".'
  ].map(curlyQuotes))
  assert.equal(stepsList(view).type, 'ol')
  assert.equal(text(byData(bubble(view), 'steps-after')).trim(), 'It works from your next new chat, not this one.')
  assert.doesNotMatch(text(bubble(view)), /hermes skills install/)
  assert.equal(all(bubble(view), n => n.type === 'sdk:CopyButton').length, 0, 'nothing to paste: the person clicks')
  click(button(view))
  assert.equal(stepsList(view), null, 'pressed again it closes')
})

test('a skill by its name: Helper\'s fixed line, and under it a box headed "From the Hermes docs" with the page\'s own words; an optional one also has the clicks', async () => {
  const { view } = await pastOpening()
  send(view, 'is there a github skill')
  assert.equal(line(view), 'S1')
  // skill lines v1 (content/helper-skill-lines-v1.md section 2, its own examples, word for word)
  assert.equal(said(view), curlyQuotes('Hermes comes with a skill called "github". It teaches Hermes to work with GitHub: issues, pull requests, reviews and code folders.'))
  finish(view)
  const box1 = docsBox(view)
  assert.equal(box1.props.className, T.docs)
  assert.equal(text(byData(box1, 'docs-head')).trim(), 'From the Hermes docs')
  assert.equal(text(byData(box1, 'docs-words')).trim(), 'GitHub via gh CLI: PRs, issues, reviews, repos, auth.')
  assert.equal(button(view), null, 'a built-in skill has no button')
  // a skill with no plain words (say is null) keeps the old sentence, text_fixed
  send(view, 'is there a skill called sdlc-review')
  assert.equal(line(view), 'S1')
  assert.equal(said(view), curlyQuotes('Hermes comes with a skill called "sdlc-review". Skills are written steps that teach Hermes one task. The docs say this.'))
  finish(view)
  assert.equal(text(byData(docsBox(view), 'docs-words')).trim(), 'Review Kanban handoffs and route verified outcomes.')
  send(view, 'what does the dspy skill do')
  assert.equal(line(view), 'S2')
  assert.equal(said(view), curlyQuotes('The skill "dspy" must be added first. It teaches Hermes to build AI programs that improve their own instructions by themselves.'))
  finish(view)
  assert.ok(docsBox(view))
  click(button(view))
  assert.match(all(stepsList(view), n => n.type === 'li').map(n => text(n)).join(' '), /Find the card “dspy”\. If it is not there, scroll down and click “Show more”\./)
  // the older line keeps its docs box, small
  send(view, 'thanks')
  const older = lines(view).filter(c => c.props['data-hh'] === 'old').at(-1)
  assert.equal(older.props['data-line'], 'S2')
  assert.ok(byData(older, 'docs'))
})

test('the near miss: "can it edit my videos" gets "I don\'t know that one. These are the nearest things I have checked." with that group\'s rows to pick', async () => {
  const { view } = await pastOpening()
  send(view, 'can it edit my videos')
  assert.equal(line(view), 'N2')
  assert.equal(said(view), 'I don’t know that one. These are the nearest things I have checked.')
  finish(view)
  assert.deepEqual(labels(view), ['Make pictures', 'Look at my pictures', 'Make a video from text', 'More'])
  pickNow(view, 'Make a video from text')
  assert.equal(line(view), 'w_video')
})

test('two rows match a typed message: "Which one do you mean?" with their labels; the pick gives that row', async () => {
  const { view } = await pastOpening()
  send(view, 'can it make a pdf from my word documents')
  assert.equal(line(view), 'W1')
  finish(view)
  assert.ok(labels(view).length >= 2 && labels(view).length <= 4, labels(view).join(' | '))
  const first = labels(view)[0]
  const row = WANTS_DATA.rows.find(r => r.label === first)
  pickNow(view, first)
  assert.equal(line(view), row.id)
})

test('Gmail picked under "Which service": the Connectors line (CN1) in place of the service line, and Gmail is still kept', async () => {
  const { view, storage } = await atTopics()
  pickNow(view, 'What Hermes can do')
  pickNow(view, 'Gmail and other services')
  pickNow(view, 'Gmail')
  assert.equal(line(view), 'CN1')
  assert.equal(said(view), curlyQuotes('The Hermes app links apps such as Gmail through its "Connectors" page. Click "Capabilities", then the "Connectors" tab.'))
  assert.equal(storage.get('kept').svc, 'Gmail')
})

/* ---------- the fixes from hhtech's newcomer run of e86b410 (talk v2 fixes) ---------- */
const ANNA = () => ({ name: 'Anna', mod: 'mod1', msg: 'Telegram', told: true })
const keptNotes = view => conversation(view).filter(c => c.props['data-hh'] === 'kept-note')
// A faint line marked as forgotten: its words struck through (a <del>), the link still there.
const forgotten = note => note.props['data-forgotten'] === 'true' && !!byData(note, 'kept-gone')
const yesLabel = TALK_DATA.keeps.typed.forget_one.answers.find(a => a.gives === 'yes').label

test('after "Forget all", the older "Kept: ..." lines above are marked as forgotten (struck through), and "what do you know about me" says nothing is kept; a line still kept is not marked', async () => {
  const { view, storage } = await pastOpening()
  send(view, 'remember that my club has six courts')
  finish(view)
  // talk-live-2: the three lines are the name, what the person does (live-v2 changes-4) and the thing to remember
  assert.deepEqual(keptNotes(view).map(forgotten), [false, false, false], 'nothing forgotten yet')
  // one thing forgotten: only its line is marked
  send(view, 'forget my name')
  finish(view)
  click(answer(view, yesLabel))
  finish(view)
  assert.deepEqual(keptNotes(view).map(n => [text(n.props.children[0]), forgotten(n)]), [['Kept: Peter.', true], ['Kept: I run a tennis club.', false], ['Kept: my club has six courts.', false]])
  // everything forgotten
  send(view, 'forget everything')
  finish(view)
  click(answer(view, TALK_DATA.keeps.tell.see.delete_all.answers.find(a => a.gives === 'yes').label))
  assert.equal(storage.data.has('kept'), false)
  send(view, 'what do you know about me')
  // helper-builder-qs-v1.md point 3: the conversation shows "Kept:" lines, so it says they were deleted
  assert.equal(said(view), TALK_DATA.keeps.tell.see.see_line_deleted)
  assert.equal(said(view), 'Everything I kept about you is deleted. I only remember that we have met.')
  const old = keptNotes(view)
  assert.deepEqual(old.map(forgotten), [true, true, true])
  // the words are still there to read, struck through; the link still works
  assert.equal(byData(old[0], 'kept-gone').type, 'del')
  assert.equal(byData(old[0], 'kept-gone').props.className, T.gone)
  assert.equal(text(byData(old[0], 'kept-gone')), 'Kept: Peter.')
  assert.ok(byData(old[0], 'kept-link'))
  // the first-time line under the first one is about where things are kept, still true: not struck
  assert.equal(byData(byData(old[0], 'kept-gone'), 'kept-first'), null)
  assert.ok(byData(old[0], 'kept-first'))
})

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

test('a chat app typed after a different pick: the newest replaces the kept one, the old "Kept: you use Telegram." is marked, the new "Kept: you use WhatsApp." is not', async () => {
  const { view, storage } = await atTopics()
  pickNow(view, 'Phone and chat apps')
  pickNow(view, 'Telegram')
  assert.equal(storage.data.get('kept').msg, 'Telegram')
  send(view, 'my chat app is WhatsApp')
  assert.equal(line(view), 'msg2')
  assert.equal(storage.data.get('kept').msg, 'WhatsApp')
  finish(view)
  assert.deepEqual(keptNotes(view).map(n => [text(n.props.children[0]), forgotten(n)]), [
    ['Kept: Peter.', false],
    ['Kept: I run a tennis club.', false], // talk-live-2: live-v2 changes-4
    ['Kept: you use Telegram.', true],
    ['Kept: you use WhatsApp.', false]
  ])
  // a question about another app changes nothing
  send(view, 'does it work with discord')
  assert.equal(storage.data.get('kept').msg, 'WhatsApp')
})

test('a "From what I keep: ..." line whose answer was forgotten is marked the same way', async () => {
  const { view } = await open({ storage: fakeStorage({ kept: ANNA() }) })
  finish(view)
  send(view, 'which AI should I use')
  finish(view)
  const used = () => conversation(view).filter(c => c.props['data-hh'] === 'used-note')
  assert.equal(text(used()[0].props.children[0]), 'From what I keep: you pay for ChatGPT.')
  assert.equal(used()[0].props['data-forgotten'], undefined)
  send(view, 'forget everything')
  finish(view)
  click(answer(view, TALK_DATA.keeps.tell.see.delete_all.answers.find(a => a.gives === 'yes').label))
  assert.equal(used()[0].props['data-forgotten'], 'true')
  assert.equal(text(byData(used()[0], 'kept-gone')), 'From what I keep: you pay for ChatGPT.')
})

test('a later visit (the name question skipped), then the name typed anyway: "Hi again, Anna."; "my name is Bea" is kept in its place; nothing about the old name is said', async () => {
  const { view, storage } = await open({ storage: fakeStorage({ kept: ANNA() }) })
  // changes-14: the window opens with BACK, by the kept name, and asks nothing
  assert.equal(line(view), 'BACK')
  finish(view)
  assert.equal(said(view), 'Hi again, Anna. What would you like Hermes to help you with?')
  send(view, 'Anna')
  assert.equal(line(view), 'NAME_AGAIN')
  assert.equal(said(view), 'Hi again, Anna. Ask me anything about Hermes.')
  assert.deepEqual(storage.data.get('kept'), ANNA())
  finish(view)
  send(view, 'my name is Bea')
  assert.equal(line(view), 'NAME_NEW')
  assert.equal(said(view), 'Thanks, Bea. Ask me anything about Hermes.')
  finish(view)
  assert.equal(text(keptNotes(view).at(-1).props.children[0]), 'Kept: Bea.')
  assert.equal(storage.data.get('kept').name, 'Bea')
})

test('hhtech\'s ten typed messages and "my chat app is WhatsApp" in the window, with his kept record: the line he wanted for each, the skill-and-plugin picks in the message box', async () => {
  const { view, storage } = await open({ storage: fakeStorage({ kept: ANNA() }) })
  const ten = [
    ['how do I connect telegram', 'msg1'], ['what is a model', 'mod0'], ['can hermes check my email every morning', 'sch5'],
    ['which AI should I use', 'mod1'], ['how much does it cost', 'COST'], ['whats the difference between a skill and a plugin', 'W2'],
    ['can you install the github plugin for me', 'H1'], ['my bot forgets everything', 'mem3'], ['what is soul.md', 'term-soul'],
    ['should I run it on my laptop or a server', 'WHERE']
  ]
  for (const [typed, want] of ten) {
    finish(view)
    send(view, typed)
    assert.equal(line(view), want, typed)
    if (want === 'W2') {
      finish(view)
      assert.deepEqual(labels(view), ['Skills', 'Plugins'])
    }
  }
  assert.equal(said(view), 'Both work. Hermes answers and runs jobs only while its computer is on. For any time, use a computer that stays on.')
  assert.deepEqual(storage.data.get('kept'), ANNA(), 'the ten changed nothing kept')
  finish(view)
  send(view, 'my chat app is WhatsApp')
  assert.equal(storage.data.get('kept').msg, 'WhatsApp')
  finish(view)
  send(view, 'what do you know about me')
  assert.ok(all(byData(bubble(view), 'kept-rows'), n => n.type === 'li').map(n => text(n)).includes('Your chat app: WhatsApp'))
})

test('W2 (skill and plugin compared): a pick in the message box becomes the person\'s message and gives that term\'s line', async () => {
  const { view } = await pastOpening()
  send(view, 'whats the difference between a skill and a plugin')
  assert.equal(line(view), 'W2')
  pickNow(view, 'Plugins')
  assert.equal(line(view), 'term-plugin')
  assert.equal(words(lines(view).at(-1)), 'Plugins')
})
