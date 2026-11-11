// setup-chat (Lead, 11 Nov): the set-up conversation on the page, on the built file as committed (SETUP_BUILT true),
// with a stand-in for Hermes. Skipped when a run switches the set-up conversation off.
//   2. the look: the list's reads, main bot only, at Q_GOAL's answer, after "It worked" and on the opening of a later
//      visit; no AI call; the faint line and the button "What did you look at?"; a read that fails says "couldn't"
//   4. the steps with their three answers; 5. what is kept, and the returning line after Hermes starts again
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource, setupBuiltSource, setupAiSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT } from '../../src/setup-built.js'
import { LOOK_READ_MS } from '../../src/setup-look.js'

const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
// Hermes as the page sees it. hermes: { model, soul, jobs, bots } can be changed while the test runs.
function useHost(hermes = {}) {
  const h = { model: true, soul: '', jobs: 0, bots: 1, fail: [], ...hermes }
  const host = {
    hermes: h,
    asks: [],
    calls: [],
    request: async (method, params, ms) => {
      host.calls.push([method, params, ms])
      if (h.fail.includes(method)) throw new Error('read failed: ' + method)
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        if (h.oneshot) return { text: await h.oneshot(params, host.asks.length) }
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
// dash-v2 (the page now opens on the Dashboard, which makes read-only reads of its own when it opens): the look's
// reads are the ones made with the look's own time limit (LOOK_READ_MS; the Dashboard's wait 30 s). The counts
// below are unchanged.
const lookCalls = host => host.calls.filter(([m, p, ms]) => ms === LOOK_READ_MS && ((m === 'setup.runtime_check' && p && p.profile) || m === 'profiles.describe' || m === 'cron.manage'))
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
  // in all, each of these was asked twice: once by the Dashboard when the page opened, once by the look
  for (const m of READS) assert.equal(host.calls.filter(([x, p]) => x === m && p && (p.profile || p.name)).length, 2, m)
  for (const [m, p] of lookCalls(host)) assert.equal(m === 'profiles.describe' ? p.name : p.profile, 'default', m + ' for the main bot')
  assert.deepEqual(lookCalls(host).find(([m]) => m === 'cron.manage')[1], { action: 'list', profile: 'default', include_disabled: true })
  const seen = olds(view).at(-1)
  assert.equal(seen.props['data-line'], 'SEEN')
  // find-v2 part 3: no call of Helper's has answered in this visit, so the model part is "couldn't check"
  assert.match(oldText(seen), /^I looked at your Hermes\. I couldn[’']t check your model this time\. You have no scheduled jobs yet\./)
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
  assert.equal(oldText(olds(view).at(-1)).replace(/’/g, "'"), "Good. I can't see that one, so I'll take your word.")
  assert.equal(bubbleSaid(view), 'You want Hermes to do things at set times. Next: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?')
  await press(view, 'Not now')
  assert.equal(oldText(olds(view).at(-1)).replace(/’/g, "'"), "That's fine. I'll keep your place.")
  assert.equal(bubbleLine(view), 'offer-general_2')
  assert.deepEqual(labels(view), ['Which AI to use', 'Phone and chat apps'])
  // setup-chat-2 (SETUP_AI_BUILT false, Lead from hhtech-setup-run): no AI call at all, the recommendations too are
  // written; the questions, the look, the choice and the steps used no AI, and nothing was written to Hermes
  assert.equal(host.asks.length, 0, 'no call, also for the recommendations')
  // (dash-v2: plugins.manage is the Dashboard's read of the plugins list when the page opened, only ever action 'list')
  // (loom-fixes: no plugins read any more)
  assert.deepEqual([...new Set(host.calls.map(([m]) => m))].sort(), ['cron.manage', 'profiles.describe', 'setup.runtime_check'])
  for (const [m, p] of host.calls) if (m === 'plugins.manage' || m === 'cron.manage') assert.equal(p.action, 'list', m)
  // kept between visits
  const kept = storage.data.get('kept')
  assert.deepEqual([kept.name, kept.work, kept.setup_new, kept.setup_goal, kept.setup_goal_id, kept.setup_done_said, kept.setup_current], ['Peter', 'I run a tennis club', 'new', 'send reminders to my members about training', 'schedule', ['first_chat'], 'scheduled_job'])
  // Hermes closed and opened
  const again = await open({ storage })
  finish(again.view)
  assert.equal(bubbleLine(again.view), 'BACK_REC')
  assert.equal(bubbleSaid(again.view), 'Hi again, Peter. Next on your list: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?')
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
  // (loom-fixes: the look reads the bot the app names, as the Dashboard does, so a failed list of bots alone no longer
  // stops the bot's own reads; here those reads fail)
  const { view } = await open({ hermes: { fail: ['setup.runtime_check', 'cron.manage'] } })
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
  assert.match(oldText(olds(view).find(n => n.props['data-line'] === 'SEEN')), /You have no model set up yet, the AI that thinks\. You have one bot so far\./)
  assert.equal(bubbleSaid(view), 'Hermes needs a model before anything else. Next: A model. The AI that does the thinking. Your app may already have a free one. Want the steps?')
})

// dash-v2: the Dashboard reads the bot the app has open. loom-fixes (Lead's point 9: Helper's next thing and the
// Dashboard's "You are here" agree): Helper's look reads that same bot now, never another
test('another bot open in the app: the look reads the open bot, the same as the Dashboard, never the main one', opt, async () => {
  const host = useHost({ bots: 2 })
  host.profile = 'bot1'
  const { Page } = await registerPlugin(fakeStorage(), fakeTimers({ hold: [12000] }), {}, src => aiModeSource(src, 'ai_writes'))
  const view = mount(Page)
  await settle()
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  await press(view, 'Several bots, one per job')
  assert.deepEqual(lookCalls(host).map(([m]) => m).sort(), READS)
  for (const [m, p] of lookCalls(host)) assert.equal(m === 'profiles.describe' ? p.name : p.profile, 'bot1', m + ' for the open bot')
  // and the Dashboard, on the same page, read the open bot too
  const dashReads = host.calls.filter(([m, p, ms]) => ms !== LOOK_READ_MS && p && (p.profile || p.name))
  assert.ok(dashReads.length >= 3)
  for (const [m, p] of dashReads) assert.equal(p.profile || p.name, 'bot1', m + ' for the open bot')
})

// dash-v2 (the two branches joined): the docs door is one for the whole page now (src/dash.js openHermesDocs)
test('no model, "I\'m stuck": the button "Open the Quickstart" hands that docs page to the person\'s browser, never anything inside Hermes', opt, async () => {
  const opened = []
  const host = useHost({ model: false })
  const { Page } = await registerPlugin(fakeStorage(), fakeTimers({ hold: [12000] }), { os: { openExternal: u => opened.push(u) } }, src => aiModeSource(src, 'ai_writes'))
  const view = mount(Page)
  await settle()
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  await press(view, 'Several bots, one per job')
  await press(view, 'Show me the steps')
  await press(view, labels(view).find(l => /stuck/.test(l)))
  assert.equal(bubbleLine(view), 'STUCK_MODEL')
  const button = byData(bubble(view), 'bubble-button')
  assert.equal(text(button).trim(), 'Open the Quickstart')
  button.props.onClick({ preventDefault() {} })
  assert.deepEqual(opened, ['https://hermes-agent.nousresearch.com/docs/getting-started/quickstart'])
  assert.equal(host.navigated, undefined)
})

test('the pick "Set up Hermes" under an offer, and "where do I start" typed, bring the recommendation back', opt, async () => {
  const { view, host } = await open()
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  await press(view, 'Not sure yet')
  await press(view, 'Not now')
  // find-v1 (Lead, 11 Nov): under a don't-know with nothing near, always the four starting things; "Set up Hermes" is
  // under the general offer (after thanks)
  await send(view, 'can it fly a plane')
  assert.equal(bubbleLine(view), 'offer-start_four')
  assert.deepEqual(labels(view), ['What Hermes can do', 'Which AI to use', 'Phone and chat apps', 'What Hermes remembers'])
  await send(view, 'thanks')
  assert.deepEqual(labels(view), ['Set up Hermes', 'What Hermes can do'])
  await press(view, 'Set up Hermes')
  assert.equal(mine(view).at(-1), 'Set up Hermes')
  // loom-fixes (point 4): an answer is kept (I know it well), so first the line on what Helper goes on from
  assert.equal(bubbleLine(view), 'FROM_KEPT')
  await press(view, 'Go on')
  assert.equal(bubbleLine(view), 'REC')
  assert.match(bubbleSaid(view), /Next: Its personality\./)
  await press(view, 'Not now')
  await send(view, 'where do I start')
  assert.equal(bubbleLine(view), 'REC')
  // neither what the person pressed in it, nor Helper's own lines of it, are among the lines sent with a later message
  // (the line that opens it, F2 or F3, is the ordinary talk's and may be sent as Helper's lines always could)
  const live = host.asks.filter(p => /newest message/.test(p.input))
  assert.ok(live.length >= 1, 'a later message did go to the AI')
  for (const p of live) assert.doesNotMatch(p.input.replace(/’/g, "'"), /Set up Hermes|Not now|I know it well|keep your place|Want the steps|I looked at your Hermes|Do you want jobs/, 'nothing of the set-up conversation after its opening line is sent to the AI')
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

test('the person types again before the reads are back: the first message is answered at once ("couldn\'t check", never a guess), then the second, in order', opt, async () => {
  const { view, host } = await open({ mode: 'no_ai_step' })
  finish(view)
  byData(view.tree, 'skip').props.onClick({ preventDefault() {} })
  finish(view)
  await press(view, 'I know it well')
  // the reads never come back
  host.profiles = () => new Promise(() => {})
  answers(view).find(n => text(n).trim() === 'Do things at set times').props.onClick({ preventDefault() {} })
  finish(view)
  assert.equal(all(helper(view), n => n.props['data-line'] === 'SEEN').length, 0, 'still waiting for the look')
  box(view).props.onChange({ target: { value: "what's a skill?" } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle()
  finish(view)
  const lines = all(helper(view), n => n.props['data-hh'] === 'old' || n.props['data-hh'] === 'bubble').map(n => n.props['data-line'])
  assert.ok(lines.indexOf('SEEN') >= 0 && lines.indexOf('SEEN') < lines.indexOf('REC') && lines.indexOf('REC') < lines.lastIndexOf('term-skill'), lines.join(' '))
  const seen = olds(view).find(n => n.props['data-line'] === 'SEEN')
  assert.match(oldText(seen).replace(/’/g, "'"), /I couldn't check your model this time\. I couldn't read that part this time\./)
  assert.deepEqual(mine(view).slice(-2).map(x => x.replace(/’/g, "'")), ['Do things at set times', "what's a skill?"])
})

// find-v1 (review): the recommendation's call that is slow (12 s) and then fails is ONE failed try, not two
// loom-fixes (find-v1 joined with setup-chat-2): the committed build has the recommendation's AI step off
// (SETUP_AI_BUILT false), so these three tests switch it on in the copy they load, as tests/setup/setup-rec.test.mjs does
const AI_REC = src => setupAiSource(src, 'true')
test('a recommendation call that gives no answer in 12 s and then fails counts once: the next question still asks the AI', opt, async () => {
  let fail = null
  const { view, host, timers } = await open({ hermes: { oneshot: (p, n) => (n === 1 ? new Promise((_, no) => (fail = no)) : 'NONE') }, change: AI_REC })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, labels(view)[0])
  await send(view, 'send reminders to my members about training')
  assert.equal(host.asks.length, 1, 'the recommendation call')
  timers.fire(12000)
  await settle()
  fail(new Error('gone'))
  await settle()
  finish(view)
  await press(view, 'Not now')
  await send(view, 'what is the weather in Riga')
  assert.equal(host.asks.length, 2, 'one failed try does not end the AI for the visit')
})

// find-v1 (app run with a stand-in that never answers): the recommendation's call is still in Hermes after its 12 s
// and a typed question meets it: that is the second slow try, as when a typed message's own call is the stuck one.
// The answer comes at once, with no dots; the slow-AI line after it, once; no call after that
test('a recommendation call that never answers, then a question that cannot be asked because of it: two slow tries, the slow-AI line once after the answer', opt, async () => {
  const { view, host, timers } = await open({ hermes: { oneshot: () => new Promise(() => {}) }, change: AI_REC })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, labels(view)[0])
  await send(view, 'send reminders to my members about training')
  assert.equal(host.asks.length, 1, 'the recommendation call')
  timers.fire(12000)
  await settle()
  finish(view)
  await press(view, 'Not now')
  const lines = () => [...olds(view).map(n => n.props['data-line']), bubbleLine(view)]
  await send(view, "How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens")
  assert.equal(lines().filter(l => l === 'SLOW_A').length, 0, 'code answered that one: nothing owed yet')
  await send(view, 'what do you mean?')
  assert.equal(host.asks.length, 1, 'no second call: Hermes still works on the first')
  assert.deepEqual(lines().slice(-2), ['use0', 'SLOW_A'])
  await send(view, 'what is the weather in Riga')
  await send(view, 'what do you mean?')
  assert.equal(host.asks.length, 1)
  assert.equal(lines().filter(l => l === 'SLOW_A').length, 1, 'said once')
})

// the same when the person moved on before the 12 s were over (as in the app run): the watch on the call runs on
test('the person moved on before the recommendation call\'s 12 s, and the call never answers: a question after the 12 s is the second slow try', opt, async () => {
  const { view, host, timers } = await open({ hermes: { oneshot: () => new Promise(() => {}) }, change: AI_REC })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, labels(view)[0])
  await send(view, 'send reminders to my members about training')
  assert.equal(host.asks.length, 1, 'the recommendation call')
  // the dots show and there is nothing to pick: the person types on
  await send(view, "How can I make it so I use less usage? Whenever I ask a question it doesn't take as many tokens")
  timers.fire(12000)
  await settle()
  finish(view)
  const lines = () => [...olds(view).map(n => n.props['data-line']), bubbleLine(view)]
  await send(view, 'what do you mean?')
  assert.equal(host.asks.length, 1)
  assert.deepEqual(lines().slice(-2), ['use0', 'SLOW_A'])
})

// find-v2 part 3 (Lead, 11 Nov 11:40; hhtech ask-run 3 point 2): "You have a model, the AI that thinks, and it answered my
// check." only when Helper saw the AI answer in this visit. setup.runtime_check alone says only that a model is set (it
// said ok in hhtech's run D, where every call failed with "No LLM provider configured"), so with nothing answered yet
// the model part is model_unread; none set up: model_not; a call with no answer in time: model_slow (changes-13 words).
const SEEN_OF = view => oldText(olds(view).find(n => n.props['data-line'] === 'SEEN')).replace(/’/g, "'")
async function toSeen(view, typed = 'send reminders to my members about training') {
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, 'I know it well')
  await send(view, typed)
}
test('find-v2: no AI set up (the model check says no): "You have no model set up yet", never "it answered my check"', opt, async () => {
  const { view } = await open({ hermes: { model: false } })
  await toSeen(view)
  assert.match(SEEN_OF(view), /^I looked at your Hermes\. You have no model set up yet, the AI that thinks\./)
  assert.doesNotMatch(SEEN_OF(view), /answered my check/)
})
test('find-v2: a model is set but nothing has answered yet (run D: the check says ok): "I couldn\'t check your model this time."', opt, async () => {
  const { view } = await open()
  await toSeen(view)
  assert.match(SEEN_OF(view), /^I looked at your Hermes\. I couldn't check your model this time\./)
})
test('find-v2: a call failed with "No LLM provider configured": model_not; one that answered: model_ok; one with no answer in 12 s: model_slow', opt, async () => {
  const cases = [
    [() => { throw new Error('No LLM provider configured for task=helping_hand provider=auto. Run: hermes setup') }, /You have no model set up yet, the AI that thinks\./],
    [() => 'Hermes can keep notes.\nUSED: mem0', /You have a model, the AI that thinks, and it answered my check\./],
    [() => new Promise(() => {}), /You have a model, but it did not answer my check in time\./]
  ]
  for (const [oneshot, want] of cases) {
    const { view, timers } = await open({ hermes: { oneshot } })
    finish(view)
    await send(view, 'Peter')
    await send(view, 'I run a tennis club')
    // a question typed at "Are you new to Hermes?" is answered (its AI call), then the set-up questions go on
    await send(view, 'can it fly a kite')
    timers.fire(12000)
    await settle()
    finish(view)
    await press(view, 'Skip')
    await press(view, 'Not sure yet')
    const seen = olds(view).concat(bubble(view) ? [bubble(view)] : []).map(n => text(n).replace(/’/g, "'")).find(t => /I looked at your Hermes/.test(t))
    assert.ok(seen, 'a SEEN line')
    assert.match(seen, want)
  }
})

// find-v2 part 5 (5) (Lead's answer 5 to find-v1's questions; find-v1 fault 8): a typed question wins over the set-up
// conversation's question too, and the set-up question is offered again after the answer. "How can I migrate?" at
// "Do you want jobs at set times, phone chats, or something else?": the two kinds of moving with their two picks (not
// the set-up question in their place); the person's pick is answered; then the set-up question again.
test('find-v2: "How can I migrate?" typed at the set-up conversation\'s goal question: the moving line and its picks; after the pick, the goal question again', opt, async () => {
  const { view } = await open()
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, 'Skip')
  assert.equal(bubbleLine(view), 'Q_GOAL')
  await send(view, 'How can I migrate?')
  const lines = () => [...olds(view).map(n => n.props['data-line']), bubbleLine(view)]
  assert.ok(lines().includes('MIG'), lines().join(' '))
  assert.deepEqual(labels(view), ['From another AI app', 'To another computer'], 'the moving picks show, not the set-up question in their place')
  assert.ok(!mine(view).length || !mine(view).at(-1).startsWith('Kept'), 'nothing kept')
  await press(view, 'To another computer')
  assert.ok(lines().includes('MIG_PC'), lines().join(' '))
  assert.ok(lines().slice(-3).some(l => /^SETUP_REASK_GOAL|^Q_GOAL/.test(l)), 'the goal question is offered again: ' + lines().join(' '))
  assert.ok(labels(view).length >= 2, 'with its picks: ' + labels(view).join(' / '))
})
