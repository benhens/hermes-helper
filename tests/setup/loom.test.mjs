// loom-fixes (Lead, 11 Nov 10:10): Pēteris's Loom conversation of 11 Nov, message for message with his spelling, on the
// built page with a stand-in for Hermes, and the fixes of part A around it. Skipped when a run switches the set-up
// conversation off. His words and what was on screen: inputs/pb-words-11nov-loom-review.md and
// inputs/pb-loom-11nov-review/on-screen.md; the lines: content/helper-loom-fixes-v1.md (hhcontent).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT } from '../../src/setup-built.js'

const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
const q = s => String(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()

// Hermes as on his screen, as far as a stand-in can be: a model, its own personality text, 12 bots, no scheduled job,
// no chat app, and only Hermes's own first-run chat (so First chat is not done and is the stop he was at)
function useHost(hermes = {}) {
  const h = { model: true, soul: 'You are my calm club helper.', jobs: 0, bots: 12, platforms: {}, sessions: [{ id: 's0', source: 'local', title: 'Getting started', message_count: 4, preview: '', started_at: 1762800000, last_active: 1762800000 }], ...hermes }
  const host = {
    hermes: h,
    asks: [],
    checks: [],
    calls: [],
    request: async (method, params, ms) => {
      host.calls.push([method, params, ms])
      // loom-fixes-2 part B 1: the set-up look's one check call (a fixed text) is the stand-in's own, not one of the person's asks
      if (method === 'llm.oneshot' && params && params.instructions === 'Reply with exactly: OK') {
        host.checks.push(params)
        return { text: 'OK' }
      }
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        return { text: 'NONE' }
      }
      if (method === 'setup.runtime_check') return h.model ? { ok: true, provider: 'custom', model: 'mock-small' } : { ok: false }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'profiles.describe') return { name: params.name, soul: h.soul }
      if (method === 'cron.manage') return { count: h.jobs, jobs: [] }
      if (method === 'plugins.manage') return { plugins: [] }
      throw new Error('unexpected ' + method)
    },
    profiles: () => ({ profiles: Array.from({ length: h.bots }, (_, i) => (i === 0 ? { name: 'default', is_default: true } : { name: 'bot' + i, is_default: false })) }),
    skills: () => [],
    status: () => ({ gateway_platforms: h.platforms }),
    listPersisted: () => ({ sessions: h.sessions })
  }
  globalThis.__hhHost = host
  return host
}
async function open({ storage, hermes = {}, mode = 'ai_writes' } = {}) {
  const host = useHost(hermes)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage || fakeStorage(), timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle(12)
  return { view, timers, host, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const bubbleLine = view => bubble(view).props['data-line']
const bubbleSaid = view => q(spoken(byData(bubble(view), 'said')))
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
const oldText = n => q(text(n).replace(/^Helper said: /, ''))
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const labels = view => answers(view).map(a => q(text(a)))
async function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle(12)
  finish(view)
}
async function press(view, label) {
  const a = answers(view).find(n => q(text(n)) === label)
  if (!a) throw new Error('no pick ' + label + ' among ' + labels(view).join(' / '))
  a.props.onClick({ preventDefault() {} })
  await settle(12)
  finish(view)
}
// Helper's lines since the person's last message, in order (older ones, then the bubble)
function since(view, mark) {
  const nodes = all(helper(view), n => ['old', 'me', 'bubble'].includes(n.props['data-hh']))
  const i = nodes.findLastIndex(n => n.props['data-hh'] === 'me' && q(text(n)).endsWith(mark))
  return nodes.slice(i + 1).map(n => (n.props['data-hh'] === 'bubble' ? bubbleSaid(view) : oldText(n)))
}
const NEW4 = ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip']
const GENERAL = ['Set up Hermes', 'What Hermes can do']
// loom-fixes-2: the opening's "Want the steps?" is open and takes no offer now; Not now closes it, then "hey" gets the
// general offer as before
async function toGeneral(view) {
  if (labels(view).includes('Not now')) await press(view, 'Not now')
  await send(view, 'hey')
  assert.deepEqual(labels(view), GENERAL)
}
const REC4 = ['Show me the steps', "I've done this already", 'Something else', 'Not now']
const youAreHere = view => {
  const s = all(view.tree, n => n.props['data-hh'] === 'stop' && n.props['data-state'] === 'here')
  return s.length ? s[0].props['data-stop'] : null
}






test('the dots while Helper waits for the person\'s AI are a bubble of their own class, not hidden by the class of words not yet shown (point 8)', opt, async () => {
  const { view } = await open({ hermes: {} })
  finish(view)
  const built = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'desktop', 'plugin.js'), 'utf8')
  const dotsClass = built.match(/dotsWait: '([^']+)'/)[1]
  const waitClass = built.match(/\n {2}wait: '(hh-[^']+)'/)[1]
  assert.notEqual(dotsClass, waitClass)
  const css = built.match(/TALK_CSS = "([^\n]*)"/)[1]
  // the rule that hides words not yet shown must not reach the dots' running class
  assert.ok(css.includes(`.${waitClass}{visibility:hidden}`))
  assert.ok(!css.includes(`.${dotsClass}{visibility:hidden}`))
  assert.ok(css.includes(`.hh-dots.${dotsClass} i{animation`), 'the dots still move')
})
