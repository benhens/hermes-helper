// The Setup steps and the helper panel on the page (B3), rendered from the built plugin with the
// stand-ins (tests/lib/render.mjs): what each step shows, what picking and finishing do, the chat
// log, the message box's code-only answers, and the character's pose for each page state.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { STEPS, LINES, stepById } from '../src/steps.js'
import { KEY_LINE } from '../src/key-check.js'
import { CANT_CHECK_LINE, NO_MODEL_LINE } from '../src/model-status.js'
import { K } from '../src/look.js'

let opened
function useHost({ runtime = { ok: true, model: 'mock-small' } } = {}) {
  globalThis.__hhHost = {
    request: async method => {
      const answer = { 'setup.runtime_check': runtime, 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      if (answer instanceof Error) throw answer
      return answer
    }
  }
}

async function open(storage = fakeStorage(), host = {}, { settleFirst = true } = {}) {
  useHost(host)
  opened = []
  const os = { openExternal: url => (opened.push(url), Promise.resolve(true)) }
  const { Page, storage: s } = await registerPlugin(storage, undefined, { os })
  const view = mount(Page)
  if (settleFirst) await settle()
  return { view, storage: s }
}

const helper = view => byData(view.tree, 'helper')
const detail = view => byData(view.tree, 'detail')
const pose = view => all(helper(view), n => n.props['data-pose'])[0].props['data-pose']
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const option = (view, id) => all(detail(view), n => n.props['data-option'] === id)[0]
const type = (view, words) => box(view).props.onChange({ target: { value: words } })
const enter = (view, extra = {}) => box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {}, ...extra })
const newest = view => byData(helper(view), 'say')

beforeEach(() => {
  delete globalThis.__hhHost
})

test('step 1: title, intro, its sources, five facts each with a docs link, the video line, the question and four answer cards', async () => {
  const { view } = await open()
  const s1 = stepById('s1')
  const d = detail(view)
  assert.equal(text(all(d, n => n.type === 'h3')[0]).trim(), s1.title)
  assert.equal(text(byData(d, 'intro')).trim(), s1.intro)
  assert.match(text(d), /Step 1 of 4/)
  const facts = all(byData(d, 'facts'), n => n.type === 'li')
  assert.equal(facts.length, 5)
  facts.forEach((li, i) => {
    assert.ok(text(li).includes(s1.facts[i].text))
    const link = all(li, n => n.type === 'a')[0]
    assert.equal(link.props.href, s1.facts[i].url)
    assert.equal(text(link).trim(), `Hermes docs › ${s1.facts[i].section}`)
  })
  assert.equal(all(byData(d, 'intro-sources'), n => n.type === 'a').length, 3)
  assert.equal(text(byData(d, 'video')).trim(), LINES.videoLater)
  assert.equal(byData(d, 'compare'), null, 'step 1 has no comparison')
  const cards = all(byData(d, 'choices'), n => n.props['data-option'])
  assert.deepEqual(cards.map(c => c.props['data-option']), s1.options.map(o => o.id))
  cards.forEach((c, i) => assert.equal(text(c).replace(/\s+/g, ' ').trim(), `${s1.options[i].label} ${s1.options[i].hint}`))
  assert.ok(cards.every(c => c.props['aria-pressed'] === false))
})

test('step 2: the comparison in two columns, each side with its source', async () => {
  const { view } = await open(fakeStorage({ step: 2 }))
  const cmp = byData(detail(view), 'compare')
  const sides = cmp.props.children
  assert.equal(sides.length, 2)
  assert.match(text(sides[0]), /On a provider's computers/)
  assert.match(text(sides[1]), /On this computer/)
  for (const s of sides) assert.equal(all(s, n => n.type === 'a').length, 1)
  assert.equal(all(byData(detail(view), 'choices'), n => n.props['data-option']).length, 5)
})

test('every step 1-4 opens from the step list and shows its own text', async () => {
  const { view, storage } = await open()
  const rows = all(byData(view.tree, 'steps'), n => n.type === 'sdk:RowButton')
  assert.equal(rows.length, 4)
  for (const s of STEPS) {
    click(all(byData(view.tree, 'steps'), n => n.type === 'sdk:RowButton')[s.number - 1])
    assert.equal(text(all(detail(view), n => n.type === 'h3')[0]).trim(), s.title)
    assert.equal(storage.data.get('step'), s.number)
    assert.match(text(helper(view)), new RegExp(`On step ${s.number}: `))
  }
})

test('a source link opens its docs page in the browser (ctx.os), not inside Hermes', async () => {
  const { view } = await open()
  const link = all(byData(detail(view), 'facts'), n => n.type === 'a')[1]
  let prevented = false
  link.props.onClick({ preventDefault: () => (prevented = true) })
  assert.equal(prevented, true)
  assert.deepEqual(opened, ['https://hermes-agent.nousresearch.com/docs/user-guide/features/tools'])
})

test('picking an answer: the card is pressed, the pick is saved, and the helper says "Your answer" with its fact', async () => {
  const { view, storage } = await open(fakeStorage({ step: 2 }))
  click(option(view, 'o_local'))
  assert.equal(option(view, 'o_local').props['aria-pressed'], true)
  assert.ok(option(view, 'o_local').props.className.split(' ').includes(K.choiceOn.split(' ')[0]))
  assert.deepEqual(storage.data.get('answers'), { s2: 'o_local' })
  const said = text(newest(view))
  assert.match(said, /Your answer: Run a model on this computer/)
  assert.ok(said.includes(stepById('s2').facts[3].text))
  // picking the same card again says nothing new
  click(option(view, 'o_local'))
  all(helper(view), n => n.type === 'sdk:Switch')[0].props.onCheckedChange(true)
  assert.equal(all(byData(helper(view), 'chatlog'), n => n.props['data-kind'] === 'answer').length, 1)
  // another card: pressed instead, saved, said
  click(option(view, 'o_key'))
  assert.equal(option(view, 'o_local').props['aria-pressed'], false)
  assert.deepEqual(storage.data.get('answers'), { s2: 'o_key' })
  assert.equal(all(byData(helper(view), 'chatlog'), n => n.props['data-kind'] === 'answer').length, 2)
})

test('"I understand, next step" goes where next_rule says; after step 4 the helper says so once and offers Your setup', async () => {
  const { view, storage } = await open(fakeStorage({ step: 1 }))
  click(option(view, 'o_phone'))
  const next = () => all(detail(view), n => n.type === 'sdk:Button' && text(n).trim() === 'I understand, next step')[0]
  click(next())
  assert.equal(storage.data.get('step'), 2)
  click(next())
  click(next())
  assert.equal(storage.data.get('step'), 4)
  click(next())
  assert.equal(storage.data.get('step'), 4)
  assert.match(text(newest(view)), /That's the first four steps\. Your setup shows what you have now\./)
  click(next())
  // only one "done" line in the log
  const sw = all(helper(view), n => n.type === 'sdk:Switch')[0]
  sw.props.onCheckedChange(true)
  assert.equal(all(byData(helper(view), 'chatlog'), n => n.props['data-kind'] === 'done').length, 1)
  click(all(helper(view), n => n.type === 'sdk:Button' && text(n).trim() === 'Your setup')[0])
  assert.equal(storage.data.get('tab'), 'yours')
})

test('"Fits your goal": after "Answer me from my phone" on step 1, step 3 tags "A computer that is always on"', async () => {
  const { view } = await open(fakeStorage({ step: 3, answers: { s1: 'o_phone' } }))
  const tags = all(detail(view), n => n.props['data-hh'] === 'fits-goal')
  assert.equal(tags.length, 1)
  assert.equal(text(tags[0]).trim(), 'Fits your goal')
  assert.ok(byData(option(view, 'o_always'), 'fits-goal'))
})

test('chat log off: only the newest thing the helper said, as plain text; on: the whole back-and-forth, newest at the bottom', async () => {
  const { view, storage } = await open(fakeStorage({ step: 2 }))
  assert.equal(text(newest(view)).trim(), LINES.greeting)
  click(option(view, 'o_key'))
  type(view, 'What is a provider?')
  enter(view)
  assert.match(text(newest(view)), /I don't have a checked answer for that yet/)
  assert.doesNotMatch(text(newest(view)), /What is a provider\?/)
  all(helper(view), n => n.type === 'sdk:Switch')[0].props.onCheckedChange(true)
  assert.equal(storage.data.get('chatlog'), true)
  const items = all(byData(helper(view), 'chatlog'), n => n.type === 'li')
  assert.deepEqual(items.map(i => i.props['data-who'] + ':' + i.props['data-kind']), ['helper:greeting', 'helper:answer', 'you:typed', 'helper:no-answer'])
  assert.equal(text(items[2]).replace(/\s+/g, ' ').trim(), 'You What is a provider?')
  assert.match(text(items[0]), /^\s*Helper/)
  assert.equal(byData(helper(view), 'say'), null)
})

test('the chat log survives leaving the page and coming back (kept while the plugin is loaded)', async () => {
  useHost()
  const { Page } = await registerPlugin(fakeStorage({ step: 2, chatlog: true }), undefined, { os: { openExternal: () => Promise.resolve(true) } })
  const first = mount(Page)
  await settle()
  click(all(byData(first.tree, 'detail'), n => n.props['data-option'] === 'o_keep')[0])
  const second = mount(Page)
  await settle()
  assert.equal(all(byData(second.tree, 'chatlog'), n => n.type === 'li').length, 2)
})

test('message box: Send is off while the box is empty; Enter sends, Shift+Enter doesn\'t; the box empties after sending', async () => {
  const { view } = await open()
  const send = () => byLabel(helper(view), 'Send')
  assert.equal(send().props.disabled, true)
  type(view, 'hello')
  assert.equal(send().props.disabled, false)
  enter(view, { shiftKey: true })
  assert.equal(box(view).props.value, 'hello')
  enter(view)
  assert.equal(box(view).props.value, '')
  type(view, 'and again')
  byData(helper(view), 'composer').props.onSubmit({ preventDefault() {} })
  assert.equal(box(view).props.value, '')
})

test('a pasted key: hhcontent\'s line, the box empties, and the key is nowhere on the page or in the log', async () => {
  const { view } = await open(fakeStorage({ step: 2, chatlog: true }))
  const key = 'sk-or-v1-' + 'f3a9'.repeat(12)
  type(view, `my key is ${key}`)
  enter(view)
  assert.equal(box(view).props.value, '')
  assert.ok(text(helper(view)).includes(KEY_LINE))
  assert.ok(!JSON.stringify(view.tree).includes(key))
})

test('build words: the hand-over text, filled by code, in a box with Copy', async () => {
  const { view } = await open(fakeStorage({ step: 4, answers: { s1: 'o_schedule' } }))
  type(view, 'please install a skill for writing emails')
  enter(view)
  const said = newest(view)
  assert.match(text(said), /I don't do that here\. I help you understand and decide; your own Hermes does the doing\./)
  assert.match(text(said), /When it's done, come back and check it under Your setup\./)
  const copy = all(said, n => n.type === 'sdk:CopyButton')[0]
  assert.ok(copy, 'a Copy button')
  assert.match(copy.props.text, /^I'm setting up Hermes\. My goal: do jobs on its own on a schedule\. I'd like you to: "please install a skill for writing emails"\./)
  // the same text is on screen, in the paste box (its mono text line), not only inside the button
  const shownText = all(said, n => n.type === 'span' && n.props.className === K.cardPasteText)
  assert.equal(shownText.length, 1)
  assert.equal(text(shownText[0]), copy.props.text)
})

test('the check failed, then the person acts: the newest thing said shows (a pasted key\'s warning is not hidden)', async () => {
  const { view } = await open(fakeStorage({ step: 2 }), { runtime: new Error('timed out') })
  assert.equal(newest(view).props['data-kind'], 'error')
  type(view, 'my key is sk-' + 'Ab12'.repeat(8))
  enter(view)
  assert.equal(newest(view).props['data-kind'], 'key')
  assert.ok(text(newest(view)).includes(KEY_LINE))
  // in the log, the check's line sits where it appeared, before the key warning
  all(helper(view), n => n.type === 'sdk:Switch')[0].props.onCheckedChange(true)
  const kinds = all(byData(helper(view), 'chatlog'), n => n.type === 'li').map(i => i.props['data-kind'])
  assert.deepEqual(kinds, ['greeting', 'error', 'key'])
  assert.equal(byData(helper(view), 'chatlog').props['aria-live'], 'polite')
})

test('over 500 characters with Chat log off: the cut note and the reply both show', async () => {
  const { view } = await open(fakeStorage({ step: 2 }))
  type(view, 'why '.repeat(140))
  enter(view)
  const said = text(newest(view))
  assert.match(said, /Your message was long, so I read only the first 500 characters\./)
  assert.match(said, /I don't have a checked answer for that yet/)
  assert.doesNotMatch(said, /why why/, 'the person\'s own words are not in the helper\'s view')
})

test('the done line comes once, even after other messages', async () => {
  const { view } = await open(fakeStorage({ step: 4, chatlog: true }))
  const next = () => all(detail(view), n => n.type === 'sdk:Button' && text(n).trim() === 'I understand, next step')[0]
  click(next())
  type(view, 'what is MCP')
  enter(view)
  click(next())
  assert.equal(all(byData(helper(view), 'chatlog'), n => n.props['data-kind'] === 'done').length, 1)
})

test('links: the no-answer link and the intro sources open in the browser too; middle-click as well; nothing outside the docs opens', async () => {
  const { view } = await open(fakeStorage({ step: 3 }))
  type(view, 'What is a VPS?')
  enter(view)
  const link = all(newest(view), n => n.type === 'a')[0]
  assert.equal(link.props.href, stepById('s3').handoff.docs_url)
  link.props.onClick({ preventDefault() {} })
  const intro = all(byData(detail(view), 'intro-sources'), n => n.type === 'a')[0]
  intro.props.onAuxClick({ preventDefault() {} })
  assert.deepEqual(opened, [stepById('s3').handoff.docs_url, 'https://hermes-agent.nousresearch.com/docs/user-guide/desktop'])
})

test('no model: the box is greyed and sends nothing; the fixed no-model line is the newest thing said', async () => {
  const { view } = await open(fakeStorage(), { runtime: { ok: false } })
  assert.equal(box(view).props.disabled, true)
  assert.equal(byLabel(helper(view), 'Send').props.disabled, true)
  assert.ok(text(newest(view)).includes(NO_MODEL_LINE))
  assert.equal(newest(view).props['data-kind'], 'no-model')
})

test('poses: waving when the helper opens, then idle; jumping when a step is finished; failed when the check fails', async () => {
  const { view } = await open(fakeStorage(), {}, { settleFirst: false })
  assert.equal(pose(view), 'waving')
  await settle()
  assert.equal(pose(view), 'idle')
  click(all(detail(view), n => n.type === 'sdk:Button' && text(n).trim() === 'I understand, next step')[0])
  assert.equal(pose(view), 'jumping')
  await settle()
  assert.equal(pose(view), 'idle')
  // hide, then show again: it waves again
  click(byLabel(helper(view), 'Hide the helper'))
  click(byData(view.tree, 'helper-hidden'))
  assert.equal(pose(view), 'waving')

  const failed = await open(fakeStorage(), { runtime: new Error('timed out') })
  assert.equal(pose(failed.view), 'failed')
  assert.ok(text(newest(failed.view)).includes(CANT_CHECK_LINE))
  assert.equal(newest(failed.view).props['data-kind'], 'error')
})

test('the helper\'s words stay scrolled to the newest at the bottom (new words, Chat log switched on)', async () => {
  const { view } = await open(fakeStorage({ step: 2 }))
  const body = byData(helper(view), 'helper-body')
  const el = { scrollTop: 0, scrollHeight: 900 }
  body.props.ref.current = el
  type(view, 'What is a provider?')
  enter(view)
  assert.equal(el.scrollTop, 900)
  el.scrollTop = 0
  el.scrollHeight = 1400
  all(helper(view), n => n.type === 'sdk:Switch')[0].props.onCheckedChange(true)
  assert.equal(el.scrollTop, 1400)
})

test('"On step N" names the step by its short title, as in the sketch ("On step 2: The brain")', async () => {
  const { view } = await open(fakeStorage({ step: 2 }))
  assert.match(text(all(helper(view), n => n.props.role === 'status')[0]), /^\s*On step 2: The brain\s*$/)
})
