// setup-chat-2 (Lead, 11 Nov 08:50; content/helper-setup-chat-v1-changes-1.md "For builder"; docs/answers/
// hhtech-setup-run.md). On the files as committed (SETUP_BUILT true, SETUP_AI_BUILT false); skipped when a run
// switches the set-up conversation off.
//   1. SETUP_AI_BUILT false: the recommendation is the written sentence only, no call; the first-time line, the
//      Settings line and README point 11 name only What you do (changes-1's keys)
//   2. a question typed while a step is open: the answer, then STEP_BACK with the step's own answers
//   3. the returning lines (BACK_REC with the why, BACK_SEEN then BACK_NEXT), "I've done this already" on a thing
//      Helper can see is not done (ALREADY_SEEABLE, ALREADY_COUNT), NOT_SEEN for a second bot, Scheduled jobs in 3 steps
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT, SETUP_AI_BUILT } from '../../src/setup-built.js'
import { AI_MODE } from '../../src/ai-mode.js'
import { SETUP_DATA } from '../../src/setup-data.js'
import { readmeForMode } from '../../scripts/live-data.mjs'
import { aiModeOf, setupAiOf } from '../../scripts/build.mjs'
import { person, NOTHING } from './sim.mjs'
import { setupPress } from '../../src/setup-chat.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const LIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'dash-setup-list-v2.json'), 'utf8'))
const LIVE = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'helper-talk-live-v2.json'), 'utf8'))
const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }
const lines = l => l.map(x => [x.line, x.text])
const REC4 = ['Show me the steps', "I've done this already", 'Something else', 'Not now']
const item = id => LIST.items.find(i => i.id === id)
const stepsOf = id => item(id).steps.map(s => s.text)

/* ---------- 1: the recommendation is the written sentence only ---------- */
test('the committed build: the set-up conversation is in, its AI step is not (Lead\'s decision, hhtech-setup-run)', opt, () => {
  assert.equal(SETUP_BUILT, true)
  assert.equal(SETUP_AI_BUILT, false)
  assert.equal(setupAiOf(), false, 'the build reads the same from the file')
})

/* ---------- 3: Scheduled jobs in 3 steps ---------- */
test('Scheduled jobs has the list\'s 3 steps (changes-1), word for word, and the last one gets the last step\'s answers', opt, () => {
  assert.deepEqual(stepsOf('scheduled_job'), [
    'In a chat, ask in plain words, like: Every morning at 9, send me a short news summary.',
    'Check: open Scheduled jobs. The job Hermes made is there.',
    'No job? Make one by hand: click New cron, type a name and the job, then Create cron.'
  ])
  assert.deepEqual(SETUP_DATA.items.scheduled_job.steps, stepsOf('scheduled_job'))
  const p = person()
  p.skip()
  p.press('I know it well').press('Do things at set times').press('Show me the steps')
  assert.equal(p.last().text, 'Step 1 of 3: In a chat, ask in plain words, like: Every morning at 9, send me a short news summary.')
  p.press('Done')
  assert.equal(p.last().text, 'Step 2 of 3: Check: open Scheduled jobs. The job Hermes made is there.')
  assert.deepEqual(p.labels(), ['Done', "I'm stuck", 'Stop for now'])
  p.press('Done')
  assert.equal(p.last().text, 'Step 3 of 3: No job? Make one by hand: click New cron, type a name and the job, then Create cron.')
  assert.deepEqual(p.labels(), ['It worked', "It didn't work", 'Stop for now'])
})

/* ---------- 2: a question typed while a step is open ---------- */
test('a question typed at a step: answered as before, then "Back to step N of M" with the step\'s own answers; Done goes on', opt, () => {
  const p = person()
  p.type('Peter').type('I run a tennis club')
  p.press("I've used it a bit").press('Talk to it from my phone').press('Show me the steps')
  const steps = stepsOf('chat_apps')
  assert.equal(p.last().text, `Step 1 of 5: ${steps[0]}`)
  p.said()
  p.type('what is a skill?')
  let s = p.said()
  assert.equal(s[0].line, 'term-skill', 'the question is answered as before')
  assert.deepEqual(lines(s.slice(-1)), [['STEP_BACK', `Back to step 1 of 5: ${steps[0]}`]])
  assert.equal(s.at(-1).text, 'Back to step 1 of 5: Click Messaging in the left list.', 'hhcontent\'s example, word for word')
  assert.deepEqual(p.labels(), ['Done', "I'm stuck", 'Stop for now'])
  p.press('Done')
  assert.equal(p.last().text, `Step 2 of 5: ${steps[1]}`, 'Done goes on to the next step')
  // again at the next step: every time, not once
  p.said()
  p.type('what is a plugin?')
  s = p.said()
  assert.deepEqual(lines(s.slice(-1)), [['STEP_BACK', `Back to step 2 of 5: ${steps[1]}`]])
  // typed "done" after it still goes on
  p.type('done')
  assert.equal(p.last().text, `Step 3 of 5: ${steps[2]}`)
  // on the last step: the last step's answers
  p.press('Done').press('Done')
  p.said()
  p.type('what is memory?')
  s = p.said()
  assert.deepEqual(lines(s.slice(-1)), [['STEP_BACK', `Back to step 5 of 5: ${steps[4]}`]])
  assert.deepEqual(p.labels(), ['It worked', "It didn't work", 'Stop for now'])
  p.press('It worked')
  assert.ok(p.log.some(x => x.line === 'DONE_SAID'), 'It worked under STEP_BACK works as on the step')
})

test('no "Back to step" after I\'m stuck (its own answers) or after Stop for now', opt, () => {
  const p = person()
  p.skip()
  p.press('I know it well').press('Talk to it from my phone').press('Show me the steps').press("I'm stuck")
  p.said()
  p.type('what is a skill?')
  assert.equal(p.said().some(x => x.line === 'STEP_BACK'), false, 'after I\'m stuck')
  const q = person()
  q.skip()
  q.press('I know it well').press('Talk to it from my phone').press('Show me the steps').press('Stop for now')
  q.said()
  q.type('what is a skill?')
  assert.equal(q.said().some(x => x.line === 'STEP_BACK'), false, 'after Stop for now')
})

/* ---------- 3: the returning lines ---------- */
const KEPT = { name: 'Peter', setup_new: 'new', setup_goal: 'send reminders to my members about training', setup_goal_id: 'schedule', setup_done_said: ['first_chat'], setup_current: 'personality' }
test('returning, nothing seen done: "Next on your list: ..." with the thing\'s why sentence, and the four answers (BACK_REC)', opt, () => {
  let p = person(NOTHING(), { kept: { ...KEPT, setup_current: 'scheduled_job' }, met: true }).opening()
  assert.deepEqual(lines(p.log), [['BACK_REC', 'Hi again, Peter. Next on your list: Scheduled jobs. Hermes does a job for you at set times, like every morning. Want the steps?']])
  assert.deepEqual(p.labels(), REC4)
  p = person(NOTHING(), { kept: { setup_current: 'memory' }, met: true }).opening()
  assert.deepEqual(lines(p.log), [['BACK_REC', `Hi again. Next on your list: Memory. ${item('memory').why} Want the steps?`]])
  assert.equal(p.log.some(x => /Last time we picked/.test(x.text)), false)
})

test('returning, something else seen done: BACK_SEEN names it, then BACK_NEXT with the thing kept and its four answers', opt, () => {
  // hhcontent's example: 1 scheduled job made, Not now on the personality last time
  let p = person({ model: 'ok', soul: false, jobs: 1, bots: 1 }, { kept: { ...KEPT }, met: true }).opening()
  assert.deepEqual(lines(p.log), [
    ['BACK_SEEN', 'Hi again, Peter. I can see you have 1 scheduled job.'],
    ['BACK_NEXT', 'Next on your list: Its personality. A short text that tells your Hermes who it is and how to talk. Want the steps?']
  ])
  assert.deepEqual(p.labels(), REC4)
  assert.equal(p.st.kept.setup_current, 'personality')
  p.press('Show me the steps')
  assert.equal(p.last().text, `Step 1 of 5: ${stepsOf('personality')[0]}`)
  // two or more jobs; no name
  p = person({ model: 'ok', soul: false, jobs: 3, bots: 1 }, { kept: { ...KEPT, name: undefined }, met: true }).opening()
  assert.equal(p.log[0].text, 'Hi again. I can see you have 3 scheduled jobs.')
  // the goal's thing first: wants bots, has 2 bots and a job
  p = person({ model: 'ok', soul: false, jobs: 1, bots: 2 }, { kept: { ...KEPT, setup_goal_id: 'bots', setup_goal: 'Several bots, one per job', setup_current: 'chat_apps' }, met: true }).opening()
  assert.equal(p.log[0].text, 'Hi again, Peter. I can see you have 2 bots.')
  assert.equal(p.log[1].line, 'BACK_NEXT')
  // else the order scheduled_job, personality, second_bot
  p = person({ model: 'ok', soul: true, jobs: 0, bots: 2 }, { kept: { ...KEPT, setup_current: 'chat_apps', setup_goal_id: 'phone' }, met: true }).opening()
  assert.equal(p.log[0].text, 'Hi again, Peter. I can see your Hermes has its own personality text.')
  // a read that failed is not seen done
  p = person({ model: 'ok', soul: null, jobs: null, bots: null }, { kept: { ...KEPT }, met: true }).opening()
  assert.deepEqual(p.log.map(x => x.line), ['BACK_REC'])
})

test('returning, the thing kept is now seen done: BACK_DONE as before, never BACK_SEEN as well', opt, () => {
  const p = person({ model: 'ok', soul: true, jobs: 2, bots: 1 }, { kept: { ...KEPT }, met: true }).opening()
  assert.deepEqual(p.log.map(x => x.line), ['BACK_DONE', 'REC'])
  assert.equal(p.log[0].text, 'Hi again, Peter. I can see it now. Your Hermes has its own personality text.')
})

/* ---------- 3: "I've done this already" on a thing Helper can see ---------- */
function atRec(reads, goal = 'Not sure yet') {
  const p = person(reads)
  p.skip()
  p.press('I know it well').press(goal)
  p.said()
  return p
}
test('"I\'ve done this already", and a fresh read does not see it: "I can\'t see that yet." with the look\'s sentence; nothing kept yet', opt, () => {
  const p = atRec(NOTHING())
  assert.match(p.last().text, /Next: Its personality\./)
  const looks = p.looks.length
  p.press("I've done this already")
  assert.equal(p.looks.length, looks + 1, 'a fresh read first')
  assert.deepEqual(lines(p.said()), [['ALREADY_SEEABLE', "I can't see that yet. Its personality text is still the starter one."]])
  assert.deepEqual(p.labels(), ['Show me the steps', 'I did it on another bot', 'Count it as done', 'Not now'])
  assert.equal(p.st.kept.setup_done_said, undefined, 'nothing kept yet')
  assert.equal(p.st.kept.setup_current, 'personality')
  p.press('Count it as done')
  const s = p.said()
  assert.deepEqual(s[0].line, 'ALREADY_COUNT')
  assert.equal(s[0].text, "Fine. I'll count it as done.")
  assert.equal(s[1].line, 'REC')
  assert.deepEqual(p.st.kept.setup_done_said, ['personality'])
  assert.notEqual(p.st.kept.setup_current, 'personality')
})

test('under "I can\'t see that yet": I did it on another bot, Show me the steps, Not now; typed labels too', opt, () => {
  let p = atRec(NOTHING())
  p.press("I've done this already").press('I did it on another bot')
  let s = p.said()
  assert.deepEqual(lines(s.slice(1, 2)), [['DONE_SAID', "Good. I can't see that one, so I'll take your word."]])
  assert.equal(s.at(-1).line, 'REC')
  assert.deepEqual(p.st.kept.setup_done_said, ['personality'])
  p = atRec(NOTHING())
  p.press("I've done this already").press('Show me the steps')
  assert.equal(p.last().text, `Step 1 of 5: ${stepsOf('personality')[0]}`)
  p = atRec(NOTHING())
  p.press("I've done this already").press('Not now')
  assert.ok(p.log.some(x => x.line === 'NOT_NOW'))
  assert.equal(p.st.kept.setup_current, 'personality', 'the place is kept')
  p = atRec(NOTHING())
  p.press("I've done this already")
  p.said()
  p.type('count it as done')
  assert.equal(p.said()[0].line, 'ALREADY_COUNT')
})

test('"I\'ve done this already" and the fresh read sees it now: "I can see it now", then the next thing', opt, () => {
  const p = atRec(NOTHING())
  p.reads.soul = true
  p.press("I've done this already")
  const s = p.said()
  assert.deepEqual(lines(s.slice(0, 1)), [['DONE_SEEN', 'I can see it now. Your Hermes has its own personality text.']])
  assert.equal(s[1].line, 'REC')
  assert.equal(p.st.kept.setup_done_said, undefined, 'seen, so not kept as said')
})

test('"I\'ve done this already" on Scheduled jobs and on A second bot: the look\'s own sentence; for a bot no "another bot"', opt, () => {
  let p = atRec(NOTHING(), 'Do things at set times')
  p.press("I've done this already")
  assert.equal(p.said()[0].text, "I can't see that yet. You have no scheduled jobs yet.")
  assert.deepEqual(p.labels(), ['Show me the steps', 'I did it on another bot', 'Count it as done', 'Not now'])
  p = atRec(NOTHING(), 'Several bots, one per job')
  assert.match(p.last().text, /Next: A second bot\./)
  p.press("I've done this already")
  assert.equal(p.said()[0].text, "I can't see that yet. You have one bot so far.")
  assert.deepEqual(p.labels(), ['Show me the steps', 'Count it as done', 'Not now'])
  p.press('Count it as done')
  assert.deepEqual(p.st.kept.setup_done_said, ['second_bot'])
})

test('"I\'ve done this already" and the fresh read fails: Helper says so and takes the person\'s word (as after It worked)', opt, () => {
  const p = atRec(NOTHING())
  p.reads.soul = null
  p.press("I've done this already")
  const s = p.said()
  assert.equal(s[0].text, "I couldn't read that part this time. Good. I can't see that one, so I'll take your word.")
  assert.deepEqual(p.st.kept.setup_done_said, ['personality'])
})

test('"I\'ve done this already" on a thing Helper cannot see: "Good. I\'ll remember that you did it." as before', opt, () => {
  const p = atRec(NOTHING(), 'Talk to it from my phone')
  p.press("I've done this already")
  assert.deepEqual(lines(p.said().slice(0, 1)), [['DONE_SAID', "Good. I can't see that one, so I'll take your word."]])
  assert.deepEqual(p.st.kept.setup_done_said, ['chat_apps'])
})

test('"It worked" on A second bot that is not seen: "You have one bot so far." with Show me the steps and Not now (NOT_SEEN for a bot)', opt, () => {
  const p = atRec(NOTHING(), 'Several bots, one per job')
  p.press('Show me the steps')
  for (let i = 0; i < 4; i++) p.press('Done')
  p.said()
  p.press('It worked')
  assert.deepEqual(lines(p.said()), [['NOT_SEEN', "I can't see it yet. You have one bot so far."]])
  assert.deepEqual(p.labels(), ['Show me the steps', 'Not now'])
  p.press('Not now')
  assert.ok(p.log.some(x => x.line === 'NOT_NOW'))
  // the other things keep the main-bot line
  const q = atRec(NOTHING(), 'Do things at set times')
  q.press('Show me the steps').press('Done').press('Done')
  q.said()
  q.press('It worked')
  assert.deepEqual(lines(q.said()), [['NOT_SEEN', "I can't see it yet. I only look at your main bot."]])
  assert.deepEqual(q.labels(), ['Show me the steps', 'I did it on another bot', 'Not now'])
})

/* ---------- on the page ---------- */
function useHost(hermes = {}, reply = () => 'NONE') {
  const h = { model: true, soul: '', jobs: 0, bots: 1, ...hermes }
  const host = {
    hermes: h,
    asks: [],
    calls: [],
    request: async (method, params, ms) => {
      host.calls.push([method, params, ms])
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        return { text: reply(params) }
      }
      if (method === 'setup.runtime_check') return { ok: true, provider: 'custom', model: 'mock-small' }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'profiles.describe') return { name: params.name, soul: h.soul }
      if (method === 'cron.manage') return { count: h.jobs, jobs: Array.from({ length: h.jobs }, (_, i) => ({ id: 'j' + i })), scoped: params.profile }
      throw new Error('unexpected ' + method)
    },
    profiles: () => ({ profiles: Array.from({ length: h.bots }, (_, i) => (i === 0 ? { name: 'default', is_default: true } : { name: 'bot' + i, is_default: false })) })
  }
  globalThis.__hhHost = host
  return host
}
async function open({ storage = fakeStorage(), hermes = {}, mode = AI_MODE, reply } = {}) {
  const host = useHost(hermes, reply)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle()
  return { view, timers, host, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const bubbleLine = view => bubble(view).props['data-line']
const bubbleSaid = view => spoken(byData(bubble(view), 'said')).trim().replace(/’/g, "'")
const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const labels = view => answers(view).map(a => text(a).trim().replace(/’/g, "'"))
async function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle()
  finish(view)
}
async function press(view, label) {
  const a = answers(view).find(n => text(n).trim().replace(/’/g, "'") === label)
  if (!a) throw new Error('no pick ' + label + ' among ' + labels(view).join(' / '))
  a.props.onClick({ preventDefault() {} })
  await settle()
  finish(view)
}

for (const mode of ['ai_writes', 'ai_picks_line', 'no_ai_step']) {
  test(`on the page (${mode}): the recommendation is the written sentence at once, no AI call for it, and the lines say only What you do goes to the AI`, opt, async () => {
    // a stand-in AI that would give a good sentence: it is never asked
    const { view, host } = await open({ mode, reply: () => "You're new and want Hermes to help run your tennis club. First make sure it answers you well, with a First chat: one small question." })
    finish(view)
    await send(view, 'Peter')
    await send(view, 'I run a tennis club')
    await press(view, "Yes, I'm new")
    await send(view, 'send reminders to my members about training')
    assert.equal(bubbleLine(view), 'REC')
    assert.equal(bubbleSaid(view), "You're new, so first check that Hermes answers you. Next: First chat. Ask Hermes one small thing, to see that it works. Want the steps?")
    assert.equal(host.asks.length, 0, 'no call for the recommendation')
    assert.equal(byData(helper(view), 'busy-dots'), null, 'no dots')
    const whole = text(helper(view)).replace(/’/g, "'")
    const workTold = LIVE.lines_by_mode.first_time_grey.work_told[mode]
    if (workTold) assert.equal(whole.split(workTold).length - 1, 1, 'the work_told line, once, under the Kept: of what you do')
    assert.doesNotMatch(whole, /Your AI also gets/, 'not the line that names the three')
    await press(view, "I've done this already")
    assert.equal(host.asks.length, 0)
  })
}

test('Helper\'s settings page says only What you do goes to the AI (changes-1\'s settings_top_line_2_work_only)', opt, async () => {
  useHost()
  const reg = await registerPlugin(fakeStorage({ kept: { name: 'Peter', work: 'I run a tennis club', setup_new: 'new' } }), fakeTimers(), {}, src => aiModeSource(src, 'ai_writes'))
  const v = mount(reg.settingsPages[0].render().type)
  await settle()
  const line = all(v.tree, n => n.type === 'sdk:ListRow')[0].props.description
  assert.equal(line, 'Only What you do goes to your AI. Only when Helper asks it for help.')
  assert.equal(line, LIVE.lines_by_mode.settings_top_line_2_work_only.ai_writes)
})

test('README point 11 is changes-1\'s readme_point_11_work_only for the committed mode, and names no set-up line', opt, () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const p11 = readme.split('\n').find(l => l.startsWith('11. '))
  assert.equal(p11, LIVE.lines_by_mode.readme_point_11_work_only[aiModeOf()])
  assert.doesNotMatch(p11, /whether you are new to Hermes|When Helper recommends where to start/)
  assert.equal(readmeForMode(readme, LIVE, aiModeOf(), false), readme, 'README is as the build writes it')
  assert.match(readmeForMode(readme, LIVE, 'ai_writes', true), /whether you are new to Hermes/, 'a build with the AI step on names the three again')
})

test('conversation (a) on the page with a typed question at a step and Not now; Hermes started again: BACK_SEEN, then BACK_NEXT', opt, async () => {
  const storage = fakeStorage()
  const { view, host } = await open({ storage })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, "Yes, I'm new")
  await send(view, 'send reminders to my members about training')
  await press(view, 'Show me the steps')
  await press(view, 'Done')
  assert.match(bubbleSaid(view), /^Step 2 of 5: /)
  await send(view, 'what is a skill?')
  const old = olds(view).map(n => n.props['data-line'])
  assert.equal(old.at(-1), 'term-skill', 'the question was answered, just before: ' + old.join(' '))
  assert.equal(bubbleLine(view), 'STEP_BACK')
  assert.equal(bubbleSaid(view), `Back to step 2 of 5: ${stepsOf('first_chat')[1]}`)
  assert.deepEqual(labels(view), ['Done', "I'm stuck", 'Stop for now'])
  await press(view, 'Done')
  assert.equal(bubbleSaid(view), `Step 3 of 5: ${stepsOf('first_chat')[2]}`)
  await press(view, 'Done')
  await press(view, 'Done')
  await press(view, 'It worked')
  assert.match(bubbleSaid(view), /Next: Scheduled jobs\./)
  await press(view, 'Show me the steps')
  host.hermes.jobs = 1 // the job made in Hermes
  await press(view, 'Done')
  await press(view, 'Done')
  await press(view, 'It worked')
  assert.match(text(helper(view)), /I can see it now\. You have 1 scheduled job\./)
  assert.match(bubbleSaid(view), /Next: Its personality\./)
  await press(view, 'Not now')
  assert.equal(host.asks.length, 0)
  const again = await open({ storage, hermes: { jobs: 1 } })
  finish(again.view)
  assert.equal(bubbleLine(again.view), 'BACK_NEXT')
  assert.equal(bubbleSaid(again.view), 'Next on your list: Its personality. A short text that tells your Hermes who it is and how to talk. Want the steps?')
  assert.equal(olds(again.view).at(-1).props['data-line'], 'BACK_SEEN')
  assert.match(text(olds(again.view).at(-1)), /Hi again, Peter\. I can see you have 1 scheduled job\./)
  assert.deepEqual(labels(again.view), REC4)
  assert.equal(again.host.asks.length, 0)
})

test('a question at a step that goes to the person\'s AI (ai_writes): after its answer, "Back to step" all the same', opt, async () => {
  const { view, host } = await open({ mode: 'ai_writes', reply: () => 'NONE' })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, "I've used it a bit")
  await press(view, 'Talk to it from my phone')
  await press(view, 'Show me the steps')
  assert.match(bubbleSaid(view), /^Step 1 of 5: /)
  await send(view, 'can it fly a kite')
  await settle()
  finish(view)
  assert.equal(host.asks.length, 1, 'the typed question went to the AI (the recommendation did not)')
  assert.equal(bubbleLine(view), 'STEP_BACK')
  assert.equal(bubbleSaid(view), `Back to step 1 of 5: ${stepsOf('chat_apps')[0]}`)
  assert.deepEqual(labels(view), ['Done', "I'm stuck", 'Stop for now'])
  await press(view, 'Done')
  assert.equal(bubbleSaid(view), `Step 2 of 5: ${stepsOf('chat_apps')[1]}`)
})

/* ---------- after the review ---------- */
function atStep(goal = 'Talk to it from my phone') {
  const p = person()
  p.skip()
  p.press('I know it well').press(goal).press('Show me the steps')
  p.said()
  return p
}
test('at a step, an answer with things of its own to pick keeps them (no "Back to step" yet); "yes" then answers that, not the step', opt, () => {
  for (const typed of ['forget everything', 'help']) {
    const p = atStep()
    p.type(typed)
    const s = p.said()
    assert.equal(s.some(x => x.line === 'STEP_BACK'), false, typed)
    assert.ok(p.labels().length >= 2 && !p.labels().includes('Done'), typed + ': its own picks stay: ' + JSON.stringify(p.labels()))
  }
  const p = atStep()
  p.type('forget everything')
  p.said()
  p.type('yes')
  const s = p.said()
  assert.equal(s.some(x => x.line === 'STEP'), false, '"yes" did not move the step on')
  assert.equal(s.at(-1).line, 'STEP_BACK', 'after the answer to that, the step comes back')
  assert.match(s.at(-1).text, /^Back to step 1 of 5: /)
  // the step's own labels still count while the question stands
  const q = atStep()
  q.type('help')
  q.type('Done')
  assert.match(q.last().text, /^Step 2 of 5: /)
})

test('at a step, an answer that carries an offer: the step comes back in place of the offer', opt, () => {
  const p = atStep()
  p.type('hello')
  const s = p.said()
  assert.equal(s.some(x => x.line.startsWith('offer-')), false, 'no offer bubble: ' + s.map(x => x.line).join(' '))
  assert.equal(s.at(-1).line, 'STEP_BACK')
  // away from the steps the same answer still carries its offer
  const q = person()
  q.type('Peter').type('I run a tennis club')
  q.press('I know it well').press('Not sure yet').press('Not now')
  q.said()
  q.type('hello')
  assert.ok(q.said().some(x => x.line.startsWith('offer-')))
})

test('typed answers under the second-bot lines go by their own labels; yes and no under "I can\'t see that yet"', opt, () => {
  let p = atRec(NOTHING(), 'Several bots, one per job')
  p.press("I've done this already")
  p.type('count it as done')
  assert.ok(p.log.some(x => x.line === 'ALREADY_COUNT'), 'Count it as done typed is the second of three')
  p = atRec(NOTHING(), 'Several bots, one per job')
  p.press("I've done this already")
  p.type('not now')
  assert.ok(p.log.some(x => x.line === 'NOT_NOW'))
  p = atRec(NOTHING(), 'Several bots, one per job')
  p.press('Show me the steps')
  for (let i = 0; i < 4; i++) p.press('Done')
  p.press('It worked')
  p.type('Not now')
  assert.ok(p.log.some(x => x.line === 'NOT_NOW'), 'Not now typed under the second-bot NOT_SEEN is its second of two')
  assert.equal(setupPress('notseen:otherbot', p.st), null, 'no other-bot answer for a bot')
  p = atRec(NOTHING())
  p.press("I've done this already")
  p.type('yes')
  assert.match(p.last().text, /^Step 1 of 5: /)
  p = atRec(NOTHING())
  p.press("I've done this already")
  p.type('no')
  assert.ok(p.log.some(x => x.line === 'NOT_NOW'))
})

test('BACK_SEEN: Scheduled jobs before the personality when the goal is neither; with nothing kept as current, it stands in place of the plain Hi again', opt, () => {
  let p = person({ model: 'ok', soul: true, jobs: 1, bots: 1 }, { kept: { ...KEPT, setup_goal_id: 'phone', setup_goal: 'Talk to it from my phone', setup_current: 'chat_apps' }, met: true }).opening()
  assert.equal(p.log[0].text, 'Hi again, Peter. I can see you have 1 scheduled job.')
  // the row "Next to set up" deleted in Settings: nothing current, a job seen
  const { setup_current, ...noCurrent } = KEPT
  p = person({ model: 'ok', soul: false, jobs: 1, bots: 1 }, { kept: { ...noCurrent }, met: true }).opening()
  assert.deepEqual(p.log.map(x => x.line), ['BACK_SEEN', 'REC'])
  assert.equal(p.log[0].text, 'Hi again, Peter. I can see you have 1 scheduled job.')
  // nothing seen done: the plain Hi again, as before
  p = person(NOTHING(), { kept: { ...noCurrent }, met: true }).opening()
  assert.deepEqual(p.log.map(x => x.line), ['BACK', 'REC'])
})

test('"What did you look at?" pressed while a step is open: the six lines, and the step\'s answers stay under them', opt, () => {
  const p = atStep()
  p.button('What did you look at?')
  assert.equal(p.last().line, 'LOOK_LIST')
  assert.deepEqual(p.labels(), ['Done', "I'm stuck", 'Stop for now'])
  p.press('Done')
  assert.match(p.last().text, /^Step 2 of 5: /)
})

test('on the page: at a step, "help" keeps its topics; picked through to an answer with nothing to pick, then the step comes back', opt, async () => {
  const { view } = await open({ mode: 'no_ai_step' })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, 'I know it well')
  await press(view, 'Talk to it from my phone')
  await press(view, 'Show me the steps')
  await send(view, 'help')
  assert.equal(bubbleLine(view), 'TP')
  const seen = []
  // each answer that asks its own question keeps its picks; the first one with none brings the step back
  for (let i = 0; i < 5 && bubbleLine(view) !== 'STEP_BACK'; i++) {
    assert.ok(!labels(view).includes('Done'), labels(view).join(' / '))
    seen.push(bubbleLine(view))
    await press(view, labels(view)[0])
  }
  assert.ok(seen.length >= 1, seen.join(' '))
  assert.equal(bubbleLine(view), 'STEP_BACK', seen.join(' '))
  assert.deepEqual(labels(view), ['Done', "I'm stuck", 'Stop for now'])
})

test('on the page: a step answer typed while the AI still works on a question gets no "Back to step" in front of it', opt, async () => {
  let release
  const { view, host } = await open({ mode: 'ai_writes', reply: () => 'NONE' })
  host.request = (orig => async (m, p, ms) => (m === 'llm.oneshot' ? (host.asks.push(p), new Promise(r => (release = r))) : orig(m, p, ms)))(host.request)
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, 'I know it well')
  await press(view, 'Talk to it from my phone')
  await press(view, 'Show me the steps')
  await send(view, 'can it fly a kite')
  assert.equal(host.asks.length, 1, 'the question waits for the AI')
  await send(view, 'stop for now')
  const lines = olds(view).map(n => n.props['data-line']).concat(bubbleLine(view))
  assert.equal(lines.includes('STEP_BACK'), false, lines.join(' '))
  assert.ok(lines.includes('NOT_NOW'), lines.join(' '))
  if (release) release({ text: 'NONE' })
  await settle()
})

test('on the page: at a step, "hello" gets its line and then the step, with no offer bubble between them', opt, async () => {
  const { view } = await open({ mode: 'no_ai_step' })
  finish(view)
  await send(view, 'Peter')
  await send(view, 'I run a tennis club')
  await press(view, 'I know it well')
  await press(view, 'Talk to it from my phone')
  await press(view, 'Show me the steps')
  await send(view, 'hello')
  const lines = olds(view).map(n => n.props['data-line'])
  assert.equal(bubbleLine(view), 'STEP_BACK')
  assert.equal(lines.at(-1), 'HELLO', lines.join(' '))
  assert.equal(lines.slice(lines.lastIndexOf('STEP')).some(l => l.startsWith('offer-')), false, lines.join(' '))
})
