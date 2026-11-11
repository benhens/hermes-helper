// setup-chat (Lead, 11 Nov): the set-up conversation on the page, on the built file as committed (SETUP_BUILT true),
// with a stand-in for Hermes. Skipped when a run switches the set-up conversation off.
//   2. the look: the list's reads, main bot only, at Q_GOAL's answer, after "It worked" and on the opening of a later
//      visit; no AI call; the faint line and the button "What did you look at?"; a read that fails says "couldn't"
//   4. the steps with their three answers; 5. what is kept, and the returning line after Hermes starts again
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource, setupBuiltSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT } from '../../src/setup-built.js'

const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
// Hermes as the page sees it. hermes: { model, soul, jobs, bots } can be changed while the test runs.
function useHost(hermes = {}) {
  const h = { model: true, soul: '', jobs: 0, bots: 1, fail: [], ...hermes }
  const host = {
    hermes: h,
    asks: [],
    calls: [],
    request: async (method, params) => {
      host.calls.push([method, params])
      if (h.fail.includes(method)) throw new Error('read failed: ' + method)
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        return { text: 'NONE' }
      }
      if (method === 'setup.runtime_check') return h.model ? { ok: true, provider: 'custom', model: 'mock-small' } : { ok: false, error: 'No usable credentials found' }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'profiles.describe') return { name: params.name, soul: h.soul }
      if (method === 'cron.manage') return { count: h.jobs, jobs: Array.from({ length: h.jobs }, (_, i) => ({ id: 'j' + i })), scoped: params.profile }
      throw new Error('unexpected ' + method)
    },
    profiles: () => {
      if (h.fail.includes('profiles.list')) throw new Error('read failed: profiles.list')
      return { profiles: Array.from({ length: h.bots }, (_, i) => (i === 0 ? { name: 'default', is_default: true } : { name: 'bot' + i, is_default: false })) }
    }
  }
  globalThis.__hhHost = host
  return host
}
async function open({ storage = fakeStorage(), hermes = {}, mode = 'ai_writes', change = null } = {}) {
  const host = useHost(hermes)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => (change || (x => x))(aiModeSource(src, mode)))
  const view = mount(Page)
  await settle()
  return { view, timers, host, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const bubbleLine = view => bubble(view).props['data-line']
const bubbleSaid = view => spoken(byData(bubble(view), 'said')).trim()
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
const oldText = n => text(n).replace(/^Helper said: /, '').replace(/\s+/g, ' ').trim()
const mine = view => all(helper(view), n => n.props['data-hh'] === 'me').map(n => text(n).replace(/^You said: /, '').trim())
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const labels = view => answers(view).map(a => text(a).trim())
async function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle()
  finish(view)
}
async function press(view, label) {
  const a = answers(view).find(n => text(n).trim() === label)
  if (!a) throw new Error('no pick ' + label + ' among ' + labels(view).join(' / '))
  a.props.onClick({ preventDefault() {} })
  await settle()
  finish(view)
}
const READS = ['cron.manage', 'profiles.describe', 'setup.runtime_check']
const lookCalls = host => host.calls.filter(([m, p]) => (m === 'setup.runtime_check' && p && p.profile) || m === 'profiles.describe' || m === 'cron.manage')
const REC4 = ['Show me the steps', "I've done this already", 'Something else', 'Not now']

test('conversation (a) on the page: the two questions, the look by itself, First chat\'s steps, It worked, the next thing, Not now; Hermes started again: the returning line', opt, async () => {
  const { view, host, storage } = await open()
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  assert.equal(bubbleLine(view), 'F2')
  assert.equal(bubbleSaid(view), 'Thanks, Peter. I’ll help you set up Hermes for that. Are you new to Hermes?')
  assert.deepEqual(labels(view).map(l => l.replace(/’/g, "'")), ["Yes, I'm new", "I've used it a bit", 'I know it well', 'Skip'])
  assert.equal(lookCalls(host).length, 0, 'nothing read yet')
  await press(view, labels(view)[0])
  assert.equal(mine(view).at(-1).replace(/’/g, "'"), "Yes, I'm new")
  assert.equal(bubbleLine(view), 'Q_GOAL')
  assert.equal(bubbleSaid(view), 'Do you want jobs at set times, phone chats, or something else?')
  assert.match(text(helper(view)).replace(/’/g, "'"), /Kept: new to Hermes: Yes, I'm new\./, 'the faint Kept: line')
  await send(view, 'send reminders to my members about training')
  // the look: by itself, the main bot's three reads after the list of bots, and no AI call
  assert.deepEqual(lookCalls(host).map(([m]) => m).sort(), READS)
  for (const [m, p] of lookCalls(host)) assert.equal(m === 'profiles.describe' ? p.name : p.profile, 'default', m + ' for the main bot')
  assert.deepEqual(lookCalls(host).find(([m]) => m === 'cron.manage')[1], { action: 'list', profile: 'default', include_disabled: true })
  const seen = olds(view).at(-1)
  assert.equal(seen.props['data-line'], 'SEEN')
  assert.match(oldText(seen), /^I looked at your Hermes\. You have a model, the AI that thinks, and it answers\. You have no scheduled jobs yet\./)
  assert.match(text(helper(view)), /Kept: send reminders to my members about training\./)
  assert.equal(text(byData(seen, 'hint')), 'Read from your Hermes on this computer. Nothing was sent, and no AI was used.')
  assert.match(text(seen), /What did you look at\?/)
  assert.equal(bubbleLine(view), 'REC')
  assert.equal(bubbleSaid(view), 'You’re new, so first check that Hermes answers you. Next: First chat. Ask Hermes one small thing, to see that it works. Want the steps?')
  assert.deepEqual(labels(view).map(l => l.replace(/’/g, "'")), REC4)
  await press(view, 'Show me the steps')
  for (let n = 1; n <= 5; n++) {
    assert.equal(bubbleLine(view), 'STEP')
    assert.match(bubbleSaid(view), new RegExp(`^Step ${n} of 5: `))
    assert.deepEqual(labels(view).map(l => l.replace(/’/g, "'")), n < 5 ? ['Done', "I'm stuck", 'Stop for now'] : ['It worked', "It didn't work", 'Stop for now'])
    if (n < 5) await press(view, 'Done')
  }
  const before = lookCalls(host).length
  await press(view, 'It worked')
  assert.equal(lookCalls(host).length, before + 3, '"It worked" reads again')
  assert.equal(oldText(olds(view).at(-1)).replace(/’/g, "'"), "Good. I'll remember that you did it.")
  assert.equal(bubbleSaid(view), 'You want Hermes to do things at set times. Next: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?')
  await press(view, 'Not now')
  assert.equal(oldText(olds(view).at(-1)).replace(/’/g, "'"), "That's fine. I'll keep your place.")
  assert.equal(bubbleLine(view), 'offer-general_2')
  assert.deepEqual(labels(view), ['Which AI to use', 'Phone and chat apps'])
  // the AI was asked only for the two recommendation sentences (it answered NONE here, so the written ones show);
  // the questions, the look, the choice and the steps used no AI, and nothing was written to Hermes
  assert.equal(host.asks.length, 2, 'one call for each recommendation, none for anything else')
  for (const p of host.asks) assert.match(p.instructions, /^You are Helper, inside the Hermes app\. Write one short message that recommends the next thing to set up\./)
  assert.deepEqual([...new Set(host.calls.map(([m]) => m))].sort(), ['cron.manage', 'llm.oneshot', 'profiles.describe', 'setup.runtime_check'])
  // kept between visits
  const kept = storage.data.get('kept')
  assert.deepEqual([kept.name, kept.work, kept.setup_new, kept.setup_goal, kept.setup_goal_id, kept.setup_done_said, kept.setup_current], ['Peter', 'I run a tennis club', 'new', 'send reminders to my members about training', 'schedule', ['first_chat'], 'scheduled_job'])
  // Hermes closed and opened
  const again = await open({ storage })
  finish(again.view)
  assert.equal(bubbleLine(again.view), 'BACK_REC')
  assert.equal(bubbleSaid(again.view), 'Hi again, Peter. Last time we picked Scheduled jobs. Want to go on?')
  assert.deepEqual(labels(again.view).map(l => l.replace(/’/g, "'")), REC4)
  assert.equal(lookCalls(again.host).length, 3, 'the opening of a later visit reads Hermes once')
  assert.equal(again.host.asks.length, 0, 'and asks no AI')
})

test('a later visit, and the thing picked last time is now done in Hermes: Helper reads first and says "I can see it now", then the next thing', opt, async () => {
  const storage = fakeStorage({ met: true, kept: { name: 'Peter', setup_new: 'new', setup_goal: 'Do things at set times', setup_goal_id: 'schedule', setup_done_said: ['first_chat'], setup_current: 'scheduled_job' } })
  const { view } = await open({ storage, hermes: { jobs: 1 } })
  finish(view)
  assert.equal(olds(view).at(-1).props['data-line'], 'BACK_DONE')
  assert.equal(oldText(olds(view).at(-1)), 'Hi again, Peter. I can see it now. You have 1 scheduled job.')
  assert.equal(bubbleLine(view), 'REC')
  assert.match(bubbleSaid(view), /Next: Its personality\./)
  assert.equal(storage.data.get('kept').setup_current, 'personality')
  assert.equal(all(helper(view), n => n.props['data-line'] === 'BACK_REC').length, 0, 'the line said before the reads came back is gone')
})

test('"What did you look at?" under the look line: the six short lines; the button is then done', opt, async () => {
  const { view, host } = await open({ hermes: { bots: 3 } })
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  assert.equal(bubbleLine(view), 'F3')
  await press(view, 'Skip')
  await press(view, 'Not sure yet')
  const seen = olds(view).find(n => n.props['data-line'] === 'SEEN')
  const link = all(seen, n => n.props.onClick && /What did you look at\?/.test(text(n)))[0]
  assert.ok(link, 'the button is on the look line, also once it has moved up')
  const reads = lookCalls(host).length
  link.props.onClick({ preventDefault() {} })
  await settle()
  finish(view)
  assert.equal(bubbleLine(view), 'LOOK_LIST')
  assert.deepEqual(all(byData(bubble(view), 'kept-rows'), n => n.type === 'li').map(n => text(n).replace(/’/g, "'")), ['Hermes installed: yes', 'A model that answers: yes', 'Its own personality text: no', 'Scheduled jobs: 0', 'Bots: 3', "I can't see: first chat, chat apps, tools, memory, safety."])
  assert.equal(lookCalls(host).length, reads, 'no new read')
})

test('a read that fails: "I couldn\'t check", never a guess; the conversation goes on', opt, async () => {
  const { view } = await open({ hermes: { fail: ['profiles.list'] } })
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  await press(view, 'Do things at set times')
  const seen = olds(view).find(n => n.props['data-line'] === 'SEEN')
  assert.match(oldText(seen).replace(/’/g, "'"), /^I looked at your Hermes\. I couldn't check your model this time\. I couldn't read that part this time\./)
  assert.equal(bubbleLine(view), 'REC')
  assert.match(bubbleSaid(view), /Next: Scheduled jobs\./)
})

test('no model that answers: the model first (R1), whatever the answers', opt, async () => {
  const { view } = await open({ hermes: { model: false } })
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  await press(view, 'Several bots, one per job')
  assert.match(oldText(olds(view).find(n => n.props['data-line'] === 'SEEN')), /You have no model that answers yet \(the AI that thinks\)\. You have one bot so far\./)
  assert.equal(bubbleSaid(view), 'Hermes needs a model before anything else. Next: A model. The AI that does the thinking. Your app may already have a free one. Want the steps?')
})

test('the pick "Set up Hermes" under an offer, and "where do I start" typed, bring the recommendation back', opt, async () => {
  const { view, host } = await open()
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  await press(view, 'Not sure yet')
  await press(view, 'Not now')
  await send(view, 'can it fly a plane')
  assert.equal(bubbleLine(view), 'offer-dont_know')
  assert.deepEqual(labels(view), ['What Hermes is', 'Set up Hermes'])
  await press(view, 'Set up Hermes')
  assert.equal(mine(view).at(-1), 'Set up Hermes')
  assert.equal(bubbleLine(view), 'REC')
  assert.match(bubbleSaid(view), /Next: Its personality\./)
  await press(view, 'Not now')
  await send(view, 'where do I start')
  assert.equal(bubbleLine(view), 'REC')
  for (const p of host.asks) assert.doesNotMatch(p.input, /Set up Hermes|Not now|I know it well/, 'nothing of the set-up conversation is sent to the AI')
})

test('an ordinary question in the middle is answered as before, and the set-up conversation is still there after it', opt, async () => {
  const { view } = await open({ mode: 'no_ai_step' })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await send(view, "what's a skill?")
  assert.equal(olds(view).at(-1).props['data-line'], 'term-skill')
  assert.equal(bubbleLine(view), 'SETUP_REASK')
  assert.equal(labels(view).length, 4)
  await press(view, labels(view)[1])
  assert.equal(bubbleLine(view), 'Q_GOAL')
})

test('with the switch off (the first file), the same page has no set-up conversation and no pick "Set up Hermes"', opt, async () => {
  const { view, host } = await open({ change: src => setupBuiltSource(src, 'false') })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  assert.equal(olds(view).at(-1).props['data-line'], 'F2')
  assert.equal(oldText(olds(view).at(-1)), 'Thanks, Peter.')
  assert.deepEqual(labels(view), ['What Hermes can do', 'Which AI to use'])
  assert.equal(lookCalls(host).length, 0)
})
