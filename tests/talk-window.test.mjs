// Helper's conversation on the page (talk v1), rendered from the built plugin with the stand-ins
// (tests/lib/render.mjs): the opening, the bubble, the conversation so far, answers to pick and
// their keyboard rules, buttons inside the bubble, "Skip", a pasted key, and that nothing about
// the person is written anywhere. What Helper answers is tests/talk.test.mjs; the page's frame and
// narrow windows tests/page-render.test.mjs; the character tests/helper-character.test.mjs.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, spoken, byData, byLabel } from './lib/render.mjs'
import { TALK_DATA } from '../src/talk-data.js'
import { T, K } from '../src/look.js'

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

async function open({ storage = fakeStorage(), host = {} } = {}) {
  useHost(host)
  const timers = fakeTimers()
  const { Page } = await registerPlugin(storage, timers)
  const view = mount(Page)
  await settle()
  return { view, timers, storage, Page }
}

const OPEN = "Hi, I'm Helper. I can help you learn about Hermes and set it up. What's your name?"
const helper = view => byData(view.tree, 'helper')
const root = view => byData(view.tree, 'page')
const bubble = view => byData(helper(view), 'bubble')
const line = view => bubble(view).props['data-line']
const said = view => spoken(byData(bubble(view), 'said')).trim()
const conversation = view => byData(helper(view), 'conversation').props.children
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const group = view => byData(helper(view), 'answers')
const answers = view => all(helper(view), n => n.props['data-hh'] === 'answer')
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
const TOPIC_LABELS = TALK_DATA.topic_picks.map(p => p.label)

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
  assert.equal(group(view), null)
  assert.equal(byData(bubble(view), 'in-bubble'), null, 'no button in the opening')
  assert.equal(box(view).props.placeholder, 'Reply to Helper')
  assert.equal(text(skipLink(view)).trim(), 'Skip')
  assert.equal(skipLink(view).type, 'button')
  assert.equal(skipLink(view).props.className, T.skip)
})

test('the opening, played: the name, what the person does, then the line that offers the topics; "Skip" leaves with the two questions', async () => {
  const { view } = await open()
  finish(view)
  send(view, 'Peter')
  assert.equal(said(view), 'Nice to meet you, Peter. What do you do?')
  assert.equal(group(view), null, 'still nothing to pick')
  assert.ok(skipLink(view), 'Skip stays at the second question')
  assert.equal(box(view).props.placeholder, 'Reply to Helper')
  finish(view)
  send(view, 'I run a tennis club')
  assert.equal(said(view), 'Thanks, Peter. Ask me anything about Hermes, or pick one of these.')
  assert.equal(skipLink(view), null)
  finish(view)
  assert.deepEqual(labels(view), TOPIC_LABELS)
  assert.ok(labels(view).length <= 5)
  assert.equal(box(view).props.placeholder, 'Or type your question')
  // what was said before has moved up: Helper's lines small on its side, the person's on theirs
  assert.deepEqual(conversation(view).map(c => [c.props['data-hh'], c.props.className, text(c).trim()]), [
    ['old', T.old, OPEN],
    ['me', T.me, 'Peter'],
    ['old', T.old, 'Nice to meet you, Peter. What do you do?'],
    ['me', T.me, 'I run a tennis club']
  ])
})

test('"Skip" at the name question: it becomes the person\'s message, Helper says "That\'s fine" and offers the topics; no name is asked for again', async () => {
  const { view } = await open()
  click(skipLink(view))
  assert.equal(line(view), 'F3')
  assert.equal(said(view), "That's fine. Ask me anything about Hermes, or pick one of these.")
  assert.equal(skipLink(view), null)
  assert.deepEqual(conversation(view).map(c => text(c).trim()), [OPEN, 'Skip'])
  finish(view)
  assert.deepEqual(labels(view), TOPIC_LABELS)
  // and at the second question
  const second = await open()
  send(second.view, 'Peter')
  click(skipLink(second.view))
  assert.equal(line(second.view), 'F3')
})

test('answers to pick: a named group of real buttons on the person\'s side, drawn like the person\'s messages', async () => {
  const { view } = await pastOpening()
  const g = group(view)
  assert.equal(g.props.role, 'group')
  assert.equal(g.props['aria-label'], 'Answers to pick')
  assert.equal(g.props.className, T.answers)
  for (const a of answers(view)) {
    assert.equal(a.type, 'button')
    assert.equal(a.props.type, 'button')
    assert.equal(a.props.className, T.answer)
  }
  // beside the character, in the row under the bubble
  const under = byData(helper(view), 'under')
  assert.equal(under.props.children.filter(Boolean).at(-1), g)
})

test('answers wait for the line: their room is held from the first word, but they are unseen, unread and out of the Tab order until the line is said', async () => {
  const { view, timers } = await open()
  finish(view)
  send(view, 'Peter')
  finish(view)
  send(view, 'x') // the line that offers the topics starts to appear, word by word
  assert.equal(line(view), 'F2')
  assert.equal(bubble(view).props['data-said'], false)
  const waiting = group(view)
  assert.ok(waiting, 'in the tree from the first word: the room is held')
  assert.equal(waiting.props.className, `${T.answers} ${T.wait}`)
  assert.equal(waiting.props['aria-hidden'], true)
  assert.deepEqual(labels(view), TOPIC_LABELS)
  for (const a of answers(view)) assert.equal(a.props.tabIndex, -1)
  // pressing one that is not seen yet does nothing
  const before = conversation(view).length
  answers(view)[1].props.onClick({ preventDefault() {} })
  assert.equal(line(view), 'F2')
  assert.equal(conversation(view).length, before)
  // word by word to the last word: then they are there
  for (let i = 0; i < 40; i++) timers.tick()
  assert.equal(bubble(view).props['data-said'], true)
  assert.equal(group(view).props.className, T.answers)
  assert.equal(group(view).props['aria-hidden'], undefined)
  for (const a of answers(view)) assert.equal(a.props.tabIndex, 0)
})

test('a pick becomes the person\'s message and Helper answers at once; the keyboard goes back to the message box', async () => {
  const { view } = await pastOpening()
  let focused = 0
  box(view).props.ref.current = { focus: () => focused++ }
  click(answer(view, 'Phone and chat apps'))
  assert.equal(focused, 1)
  assert.equal(line(view), 'msg-q')
  assert.equal(said(view), 'Which chat app do you use most?')
  assert.deepEqual(conversation(view).slice(-2).map(c => [c.props['data-hh'], text(c).trim()]), [
    ['old', 'Thanks, Peter. Ask me anything about Hermes, or pick one of these.'],
    ['me', 'Phone and chat apps']
  ])
  // the old line's picks are gone with it: only the newest line has things to pick
  finish(view)
  assert.deepEqual(labels(view), ['Telegram', 'WhatsApp', 'Discord', 'Slack'])
  assert.equal(box(view).props.placeholder, 'Or type your own answer')
  click(answer(view, 'WhatsApp'))
  assert.equal(focused, 2)
  assert.equal(line(view), 'msg2')
  assert.equal(group(view), null, 'an answer line has nothing to pick')
  assert.equal(box(view).props.placeholder, 'Reply to Helper')
  assert.equal(conversation(view).at(-1).props['data-hh'], 'me')
  assert.equal(text(conversation(view).at(-1)).trim(), 'WhatsApp')
})

test('a pick goes by its own id, never through the key words: every answer of every question gives exactly its row', async () => {
  for (const topic of TALK_DATA.topics) {
    for (const [i, a] of topic.question.answers.entries()) {
      const { view } = await open()
      click(skipLink(view))
      finish(view)
      // the topic's pick, through "What Hermes can do" where it is held there
      const held = TALK_DATA.topic_picks.find(p => p.holds && p.holds.includes(topic.id))
      if (held) {
        pickNow(view, held.label)
        assert.equal(line(view), held.line)
      }
      pickNow(view, topic.pick.label)
      assert.equal(line(view), topic.question.id)
      finish(view)
      assert.equal(text(answers(view)[i]).trim(), a.label)
      click(answers(view)[i])
      assert.equal(line(view), a.gives, `${topic.id}: "${a.label}"`)
    }
  }
})

test('the pick that holds two topics: "What Hermes can do" gives its own line with those two to pick', async () => {
  const { view } = await pastOpening()
  click(answer(view, 'What Hermes can do'))
  assert.equal(line(view), 'C1')
  finish(view)
  assert.deepEqual(labels(view), ['Daily jobs and reminders', 'Gmail and other services'])
  assert.equal(box(view).props.placeholder, 'Or type your question')
})

test('the picked service fills the text to paste: "Notion" → "Show me what to ask" opens the text with Notion in it, with Copy; pressed again it closes', async () => {
  const { view } = await pastOpening()
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
  // the same text is on screen, not only inside the Copy button
  const shown = all(bubble(view), n => n.type === 'span' && n.props.className === K.cardPasteText)
  assert.equal(text(shown[0]), copy[0].props.text)
  assert.equal(byData(bubble(view), 'in-bubble').props.className, `${T.inBubble} ${T.inBubbleColumn}`)
  assert.equal(line(view), 'svc1', 'Helper says nothing new for it')
  click(button(view))
  assert.equal(all(bubble(view), n => n.type === 'sdk:CopyButton').length, 0)
})

test('a button in the bubble sits under a thin line, waits for the line like the answers do, and is a real button with a small arrow', async () => {
  const { view, timers } = await pastOpening()
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
  for (const [path, label, to] of cases) {
    const { view } = await pastOpening()
    for (const pick of path) pickNow(view, pick)
    finish(view)
    assert.equal(text(button(view)).trim(), label)
    click(button(view))
    assert.deepEqual(globalThis.__hhHost.navigated, [to])
    assert.equal(conversation(view).at(-1).props['data-hh'], 'me', 'pressing it says nothing in the conversation')
    // the same press when Hermes's door throws: the page stays as it is
    globalThis.__hhHost.navigateThrows = true
    const before = line(view)
    click(button(view))
    assert.equal(line(view), before)
  }
})

test('Bots: no button. In its place, under the thin line, Helper says where the tab is; it waits for the line too', async () => {
  const { view } = await pastOpening()
  click(answer(view, 'More than one Hermes'))
  pickNow(view, 'Help the first one')
  assert.equal(line(view), 'bot2')
  assert.equal(button(view), null)
  assert.equal(all(bubble(view), n => n.type === 'button').length, 0)
  const where = byData(bubble(view), 'where')
  assert.equal(where.type, 'p')
  assert.equal(where.props.className, T.where)
  assert.equal(text(where), 'In the Hermes app, "Bots" is the tab next to "Sessions", top left.')
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], true, 'not read out before the line is said')
  finish(view)
  assert.equal(byData(bubble(view), 'in-bubble').props['aria-hidden'], undefined)
  assert.equal(globalThis.__hhHost.navigated, undefined)
  // no line of the data ends in a button that says "Open Bots"
  assert.doesNotMatch(text(helper(view)), /Open Bots/)
})

test('a button that makes Helper say one more line: "How to add one" becomes the person\'s message and the next line follows', async () => {
  const { view } = await pastOpening()
  click(answer(view, 'More than one Hermes'))
  pickNow(view, 'A different kind of work')
  finish(view)
  assert.equal(text(button(view)).trim(), 'How to add one')
  click(button(view))
  assert.equal(line(view), 'bot1-next')
  assert.match(said(view), /^Open "Bots", press "\+", then "New bot"\./)
  assert.deepEqual(conversation(view).slice(-2).map(c => [c.props['data-hh'], c.props['data-line'] || text(c).trim()]), [['old', 'bot1'], ['me', 'How to add one']])
})

test('an older line keeps its button as a small link, and it still works: text to paste opens under the older line', async () => {
  const { view } = await pastOpening()
  click(answer(view, 'What Hermes remembers'))
  pickNow(view, 'Things about me')
  assert.equal(line(view), 'mem1')
  finish(view)
  send(view, 'what is a skill')
  assert.equal(line(view), 'term-skill')
  const old = conversation(view).find(c => c.props['data-line'] === 'mem1')
  const link = byData(old, 'old-link')
  assert.equal(link.type, 'button')
  assert.equal(link.props.className, T.oldLink)
  assert.equal(text(link).trim(), 'Try it')
  assert.equal(link.props['aria-expanded'], false)
  click(link)
  const again = conversation(view).find(c => c.props['data-line'] === 'mem1')
  assert.equal(byData(again, 'old-link').props['aria-expanded'], true)
  assert.equal(all(again, n => n.type === 'sdk:CopyButton')[0].props.text, 'Please save this to your memory: <one thing about you>. Then tell me what you saved.')
  assert.equal(line(view), 'term-skill', 'the bubble is not touched')
  // an older line whose button opens a screen: the small link opens it
  finish(view)
  click(byData(bubble(view), 'bubble-button'))
  send(view, 'hello there')
  const term = conversation(view).find(c => c.props['data-line'] === 'term-skill')
  globalThis.__hhHost.navigated = []
  click(byData(term, 'old-link'))
  assert.deepEqual(globalThis.__hhHost.navigated, ['/capabilities'])
})

test('text to paste that was opened stays open when its line moves up', async () => {
  const { view } = await pastOpening()
  click(answer(view, 'What Hermes remembers'))
  pickNow(view, 'What we talked about')
  finish(view)
  click(button(view))
  send(view, 'what is a plugin')
  const old = conversation(view).find(c => c.props['data-line'] === 'mem2')
  assert.equal(all(old, n => n.type === 'sdk:CopyButton').length, 1)
})

test('a request to do it: "your own Hermes can", with the person\'s own words to paste shown at once (no button to press first)', async () => {
  const { view } = await pastOpening()
  send(view, 'please install a skill for writing emails')
  assert.equal(line(view), 'H1')
  assert.equal(said(view), "I can't do that, but your own Hermes can. Paste this into a new chat with it.")
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
  assert.equal(said(view), 'That looks like a secret key, so I did not send it. Keys go in Settings, never in a chat.')
  assert.ok(!JSON.stringify(view.tree).includes(key))
  assert.ok(!JSON.stringify([...storage.data]).includes(key))
  // the message is not shown back at all: the last thing above the bubble is still Helper's
  assert.equal(conversation(view).at(-1).props['data-hh'], 'old')
  // not after leaving the page and coming back either
  view.unmount()
  const again = mount(Page)
  assert.ok(!JSON.stringify(again.tree).includes(key))
  // a key after character 500 is caught too: the check reads the whole text
  send(again, 'x'.repeat(600) + ' ' + key)
  assert.equal(byData(byData(again.tree, 'helper'), 'bubble').props['data-line'], 'K1')
  assert.ok(!JSON.stringify(again.tree).includes(key))
})

test('"Which one do you mean?": the matches to pick, at most five; the pick answers the message that led to it', async () => {
  const { view } = await pastOpening()
  send(view, 'does the memory work with claude')
  assert.equal(line(view), 'W1')
  finish(view)
  assert.deepEqual(labels(view), ['What Hermes remembers', 'Which AI to use'])
  assert.equal(box(view).props.placeholder, 'Or type your own answer')
  click(answer(view, 'Which AI to use'))
  assert.equal(line(view), 'mod2', 'Claude was in the message: the Claude line, not the question')
  assert.equal(text(conversation(view).at(-1)).trim(), 'Which AI to use')
  // more than five matches: the first five in the list's order
  send(view, 'memory model telegram schedule gmail second bot')
  finish(view)
  assert.equal(labels(view).length, 5)
})

test('a message nobody has an answer for: the fixed line and the topics again', async () => {
  const { view } = await pastOpening()
  send(view, 'what is the weather in Riga')
  assert.equal(line(view), 'N1')
  finish(view)
  assert.deepEqual(labels(view), TOPIC_LABELS)
})

test('a long message is shown back cut to 500 characters; Helper still reads all of it', async () => {
  const { view } = await pastOpening()
  send(view, 'why '.repeat(140) + 'does memory forget')
  const mine = conversation(view).at(-1)
  assert.equal(mine.props['data-hh'], 'me')
  assert.equal(Array.from(text(mine)).length, 501)
  assert.ok(text(mine).endsWith('…'))
  assert.equal(line(view), 'mem-q', 'the word after character 500 was read')
})

test('nothing about the person is written anywhere: after a whole conversation the storage holds nothing of it', async () => {
  const { view, storage } = await open()
  finish(view)
  send(view, 'Peter')
  finish(view)
  send(view, 'I run a tennis club')
  pickNow(view, 'What Hermes remembers')
  pickNow(view, 'Things about me')
  finish(view)
  click(button(view))
  send(view, 'remember that my club has six courts')
  send(view, 'please install a skill')
  assert.deepEqual([...storage.data.keys()], [], 'no key was written at all')
  assert.doesNotMatch(JSON.stringify([...storage.data]), /Peter|tennis|courts/)
  assert.deepEqual(globalThis.__hhHost.calls.filter(m => m !== 'setup.runtime_check' && m !== 'setup.status'), [], 'and nothing was sent to Hermes')
})

test('the conversation lives while the plugin is loaded (leaving the page and coming back keeps it), and is gone when Hermes starts again', async () => {
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
  assert.equal(byData(back.tree, 'conversation').props.children.length, 2)
  // Hermes starts again: the plugin is loaded anew, with the same storage
  const second = await registerPlugin(storage, fakeTimers())
  const fresh = mount(second.Page)
  await settle()
  assert.equal(byData(fresh.tree, 'bubble').props['data-line'], 'OPEN')
  assert.deepEqual(byData(fresh.tree, 'conversation').props.children, [])
  assert.doesNotMatch(text(fresh.tree), /Peter/)
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
  // one bubble only, ever: the newest sentence
  assert.equal(all(helper(view), n => n.props['data-hh'] === 'bubble').length, 1)
})

test('Helper\'s lines hold no link out of the page and no model\'s words: every line said is one of the pre-written ones', async () => {
  const { view } = await pastOpening()
  const lines = new Set([...TALK_DATA.topics.flatMap(t => [t.question.text, t.plain.text, ...t.needs.map(n => n.text)]), ...TALK_DATA.terms.map(t => t.text), ...Object.values(TALK_DATA.fixed).flatMap(f => [f.text, f.text_no_name])])
  for (const words of ['what is a skill', 'how does memory work?', 'can it read my gmail', 'tell me a joke', 'second bot for work']) {
    send(view, words)
    const now = said(view).replace('Thanks, Peter.', 'Thanks, {name}.')
    assert.ok(lines.has(now), `${words} → ${now}`)
    assert.equal(all(helper(view), n => n.type === 'a').length, 0)
  }
})
