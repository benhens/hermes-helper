// The Setup steps on the page (the left side), rendered from the built plugin with the stand-ins
// (tests/lib/render.mjs): what each step shows, what picking and finishing do. Since talk v1
// nothing on the left makes Helper speak. (Helper's conversation: tests/talk-window.test.mjs; the
// character on the page: tests/helper-character.test.mjs.)
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, mount, settle, all, text, byData, byLabel, click } from './lib/render.mjs'
import { STEPS, LINES, stepById } from '../src/steps.js'
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
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const option = (view, id) => all(detail(view), n => n.props['data-option'] === id)[0]
const type = (view, words) => box(view).props.onChange({ target: { value: words } })
const enter = (view, extra = {}) => box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {}, ...extra })
const bubble = view => byData(helper(view), 'bubble')

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
    // the old "On step N" line is gone with the helper's header row
    assert.doesNotMatch(text(helper(view)), /On step \d/)
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

test('picking an answer: the card is pressed and the pick is saved; Helper says nothing about it (its lines come from the conversation only)', async () => {
  const { view, storage } = await open(fakeStorage({ step: 2 }))
  const before = bubble(view).props['data-line']
  click(option(view, 'o_local'))
  assert.equal(option(view, 'o_local').props['aria-pressed'], true)
  assert.ok(option(view, 'o_local').props.className.split(' ').includes(K.choiceOn.split(' ')[0]))
  assert.deepEqual(storage.data.get('answers'), { s2: 'o_local' })
  assert.equal(bubble(view).props['data-line'], before)
  assert.equal(all(byData(helper(view), 'conversation'), n => ['old', 'me'].includes(n.props['data-hh'])).length, 0)
  assert.doesNotMatch(text(helper(view)), /Your answer/)
  // another card: pressed instead, saved
  click(option(view, 'o_key'))
  assert.equal(option(view, 'o_local').props['aria-pressed'], false)
  assert.deepEqual(storage.data.get('answers'), { s2: 'o_key' })
})

test('"I understand, next step" goes where next_rule says; after step 4 it opens Your setup, and Helper stays silent', async () => {
  const { view, storage } = await open(fakeStorage({ step: 1 }))
  click(option(view, 'o_phone'))
  const next = () => all(detail(view), n => n.type === 'sdk:Button' && text(n).trim() === 'I understand, next step')[0]
  click(next())
  assert.equal(storage.data.get('step'), 2)
  click(next())
  click(next())
  assert.equal(storage.data.get('step'), 4)
  assert.equal(storage.data.get('tab'), undefined)
  click(next())
  assert.equal(storage.data.get('step'), 4)
  assert.equal(storage.data.get('tab'), 'yours')
  assert.equal(byData(view.tree, 'steps'), null, 'Your setup is open')
  assert.doesNotMatch(text(helper(view)), /first four steps/)
  assert.equal(bubble(view).props['data-line'], 'OPEN')
})

test('"Fits your goal": after "Answer me from my phone" on step 1, step 3 tags "A computer that is always on"', async () => {
  const { view } = await open(fakeStorage({ step: 3, answers: { s1: 'o_phone' } }))
  const tags = all(detail(view), n => n.props['data-hh'] === 'fits-goal')
  assert.equal(tags.length, 1)
  assert.equal(text(tags[0]).trim(), 'Fits your goal')
  assert.ok(byData(option(view, 'o_always'), 'fits-goal'))
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
  // spaces only: nothing is sent
  const said = all(helper(view), n => n.props['data-hh'] === 'me').length
  type(view, '   ')
  assert.equal(send().props.disabled, true)
  enter(view)
  assert.equal(all(helper(view), n => n.props['data-hh'] === 'me').length, said)
})

test('links: the intro sources open in the browser too; middle-click as well; nothing outside the docs opens', async () => {
  const { view } = await open(fakeStorage({ step: 3 }))
  const intro = all(byData(detail(view), 'intro-sources'), n => n.type === 'a')[0]
  intro.props.onAuxClick({ preventDefault() {} })
  assert.deepEqual(opened, ['https://hermes-agent.nousresearch.com/docs/user-guide/desktop'])
  // Helper's own lines hold no link at all: a line's button is the only way out of the bubble
  assert.equal(all(helper(view), n => n.type === 'a').length, 0)
})

test('"Ask about this step" stays on every step, with or without a model, and puts the keyboard in the message box', async () => {
  for (const runtime of [{ ok: true, model: 'm' }, { ok: false }, new Error('down')]) {
    const { view } = await open(fakeStorage({ step: 2 }), { runtime })
    let focused = 0
    box(view).props.ref.current = { focus: () => focused++ }
    click(byLabel(view.tree, 'Ask about this step'))
    assert.equal(focused, 1, JSON.stringify(runtime))
  }
})
