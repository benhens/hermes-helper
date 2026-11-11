// setup-chat point 6: the AI step of the recommendation. Only the recommendation sentence is the AI's, one call; the
// reply stands only when it passes no_reply, c26, the name check and s1 to s8; else the written line.
// The expected fails are hhcontent's build.py ai_check's own (tests/fixtures/setup-rule.json, dump_setup.py).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from '../lib/render.mjs'
import { aiModeSource, setupAiSource } from '../lib/mode-loader.mjs'
import { SETUP_BUILT, SETUP_AI_BUILT } from '../../src/setup-built.js'
import { recFlags, judgeRec, recInstructions, REC_INPUT } from '../../src/setup-rec.js'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'setup-rule.json'), 'utf8'))
const SETUP_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'helper-setup-chat-v1.json'), 'utf8'))
const opt = { skip: !SETUP_BUILT && 'the set-up conversation is switched off in this run' }

test('s1 to s8 and the name check: the same fails as build.py\'s ai_check for every case of the fixture', opt, () => {
  assert.ok(FIX.ai.length >= 130)
  const seen = new Set()
  for (const c of FIX.ai) {
    assert.deepEqual(recFlags(c.reply, c.item), c.fails, `${c.item}: ${c.reply}`)
    assert.deepEqual(recFlags(c.reply, c.item, 'Peter'), c.fails_named_peter, `${c.item}, named Peter: ${c.reply}`)
    c.fails_named_peter.forEach(f => seen.add(f))
  }
  assert.deepEqual([...seen].sort(), ['name', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'], 'every check fails somewhere in the fixture')
  assert.ok(FIX.ai.some(c => !c.fails.length), 'and some replies pass')
})

test('the data\'s own bad reply fails s2, s3, s4, s6 and s7, and its good replies pass', opt, () => {
  const bad = SETUP_JSON.conversations.a_ai_bad_reply_example
  assert.deepEqual(recFlags(bad.reply, bad.item), bad.fails)
  assert.deepEqual(recFlags('Reminders about training fit a Scheduled job: Hermes does the job at set times, like every morning.', 'scheduled_job'), [])
  assert.deepEqual(recFlags("You're new and want Hermes to help run your tennis club. First make sure it answers you well, with a First chat: one small question.", 'first_chat'), [])
})

test('the whole reading: thinking text or nothing is no reply; the name, a note word or a failed check gives the written line; a good reply is shown', opt, () => {
  const good = 'Reminders about training fit a Scheduled job: Hermes does the job at set times, like every morning.'
  assert.deepEqual(judgeRec(good, 'scheduled_job', ['Peter']), { text: good })
  // the team's no_reply: a reply that starts with <think> is no reply (checks_c5.no_reply.starts), also when an answer follows
  assert.deepEqual(judgeRec('<think>the person is new</think>\n' + good, 'scheduled_job', ['Peter']), { noReply: true })
  assert.deepEqual(judgeRec('', 'scheduled_job'), { noReply: true })
  assert.deepEqual(judgeRec(null, 'scheduled_job'), { noReply: true })
  assert.deepEqual(judgeRec('Thinking Process:\n\n1.  **Analyze the Request:**', 'scheduled_job'), { noReply: true })
  assert.equal(judgeRec('Peter, a Scheduled job fits your club.', 'scheduled_job', ['Peter']).fail, 'name')
  assert.equal(judgeRec('A Scheduled job fits your club. Want the steps?', 'scheduled_job').fail, 's5')
  assert.equal(judgeRec('Click Scheduled jobs to add a Scheduled job.', 'scheduled_job').fail, 's3')
  assert.equal(judgeRec('A Scheduled job fits.\nUSED: none', 'scheduled_job').text, 'A Scheduled job fits.', 'a USED line is cut, as in the live answers')
})

const KEPT = { name: 'Peter', work: 'I run a tennis club', setup_new: 'new', setup_goal: 'send reminders to my members about training', setup_goal_id: 'schedule' }
const SEEN = { model: 'ok', soul: false, jobs: 0, bots: 1 }
test('what is handed: what you do, what they want, new or not, the look, the thing and the reason; never the name, never the steps', opt, () => {
  const t = recInstructions({ item: 'first_chat', rule: 'R2', isNew: 'new', goal: 'schedule' }, KEPT, SEEN, ['Peter'])
  assert.equal(t.split('\n').slice(-6).join('\n'), [
    'About them: I run a tennis club',
    'What they want: send reminders to my members about training',
    "New to Hermes: Yes, I'm new",
    'What I can see: You have a model, the AI that thinks, and it answers. You have no scheduled jobs yet.',
    'The thing: First chat: Ask Hermes one small thing, to see that it works.',
    "The reason: You're new, so first check that Hermes answers you."
  ].join('\n'))
  assert.match(t, /^You are Helper, inside the Hermes app\. Write one short message that recommends the next thing to set up\.\nRules:\n1\. Recommend only this: First chat\. Use that name exactly\./)
  assert.doesNotMatch(t, /\{[a-z]/i, 'no slot left unfilled')
  assert.doesNotMatch(t, /Peter/)
  assert.doesNotMatch(t, /New session|Ctrl\+N/, 'no step of the thing')
  // nothing kept: (not told)
  const none = recInstructions({ item: 'first_chat', rule: 'R2', isNew: 'skip', goal: 'unsure' }, {}, SEEN, [])
  assert.match(none, /\nAbout them: \(not told\)\nWhat they want: \(not told\)\nNew to Hermes: \(not told\)\n/)
  // a kept text that holds the name, or no longer passes the keep rule, is not sent
  const named = recInstructions({ item: 'first_chat', rule: 'R2', isNew: 'new', goal: 'unsure' }, { ...KEPT, work: "I run Peter's tennis club", setup_goal: 'my password is hunter2hunter2 ok' }, SEEN, ['Peter'])
  assert.match(named, /\nAbout them: \(not told\)\nWhat they want: \(not told\)\n/)
})

/* ---------- on the page ---------- */
function useHost(reply) {
  const host = {
    asks: [],
    request: async (method, params) => {
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        const a = await reply(params, host.asks.length)
        if (a instanceof Error) throw a
        return { text: a }
      }
      if (method === 'setup.runtime_check') return { ok: true, model: 'mock-small' }
      if (method === 'setup.status') return { provider_configured: false }
      if (method === 'profiles.describe') return { soul: '' }
      if (method === 'cron.manage') return { count: 0, jobs: [] }
      throw new Error('unexpected ' + method)
    },
    profiles: () => ({ profiles: [{ name: 'default', is_default: true }] })
  }
  globalThis.__hhHost = host
  return host
}
// setup-chat-2: the committed build has the AI step off (SETUP_AI_BUILT false, Lead from hhtech-setup-run); these tests
// keep it working for a later build by switching it on in the copy that is loaded, unless a test says otherwise
async function open(reply, { mode = 'ai_writes', change = src => setupAiSource(src, 'true'), storage = fakeStorage() } = {}) {
  const host = useHost(reply)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => change(aiModeSource(src, mode)))
  const view = mount(Page)
  await settle()
  return { view, host, timers, storage }
}
const helper = view => byData(view.tree, 'helper')
const bubble = view => byData(helper(view), 'bubble')
const dots = view => byData(helper(view), 'busy-dots')
const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
const said = view => spoken(byData(bubble(view), 'said')).trim().replace(/’/g, "'")
async function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  await settle()
  finish(view)
}
async function press(view, label) {
  const a = answers(view).find(n => text(n).trim().replace(/’/g, "'") === label)
  if (!a) throw new Error('no pick ' + label)
  a.props.onClick({ preventDefault() {} })
  await settle()
  finish(view)
}
async function toRec(reply, options) {
  const o = await open(reply, options)
  finish(o.view)
  await send(o.view, 'Peter')
  await send(o.view, 'I run a tennis club')
  await press(o.view, "Yes, I'm new")
  await send(o.view, 'send reminders to my members about training')
  return o
}
const AI_1 = "You're new and want Hermes to help run your tennis club. First make sure it answers you well, with a First chat: one small question."
const WRITTEN_1 = "You're new, so first check that Hermes answers you. Next: First chat. Ask Hermes one small thing, to see that it works. Want the steps?"

test('a good reply takes the place of the written sentence; "Want the steps?" and the four answers are written; one call, with what is handed and no name', opt, async () => {
  const { view, host } = await toRec(() => AI_1)
  assert.equal(SETUP_AI_BUILT, false, 'off as committed; switched on in the copy loaded here')
  assert.equal(bubble(view).props['data-line'], 'REC')
  assert.equal(said(view), AI_1 + ' Want the steps?')
  assert.deepEqual(answers(view).map(a => text(a).trim().replace(/’/g, "'")), ['Show me the steps', "I've done this already", 'Something else', 'Not now'])
  assert.equal(host.asks.length, 1, 'one call')
  const p = host.asks[0]
  assert.equal(p.input, REC_INPUT)
  assert.equal(p.max_tokens, 120)
  assert.match(p.instructions, /\nAbout them: I run a tennis club\nWhat they want: send reminders to my members about training\nNew to Hermes: Yes, I'm new\n/)
  assert.doesNotMatch(JSON.stringify(p), /Peter/)
  // the look line before it is the written one, untouched
  const seen = all(helper(view), n => n.props['data-line'] === 'SEEN')[0]
  assert.match(text(seen), /I looked at your Hermes\./)
})

for (const [name, reply] of [
  ['the data\'s bad reply (s2, s3, s4, s6, s7)', 'Great idea! I can set up a Scheduled job for you on Telegram. Click Scheduled jobs and type your reminder.'],
  ['a reply with the name', 'Peter, a First chat is the place to begin.'],
  ['a reply that names another thing', 'Start with a First chat, then a Scheduled job.'],
  ['a question', 'Shall we begin with a First chat?'],
  ['NONE', 'NONE']
]) {
  test(`${name}: the written sentence is shown, and nothing says the AI failed`, opt, async () => {
    const { view, host } = await toRec(() => reply)
    assert.equal(said(view), WRITTEN_1)
    assert.equal(host.asks.length, 1)
    assert.equal(all(helper(view), n => n.props['data-line'] === 'SLOW_A').length, 0)
  })
}

test('the AI never answers: the dots, then at 12 s the written sentence; the AI step is off for the visit, and no slow-AI line hangs under the recommendation', opt, async () => {
  const { view, host, timers } = await toRec(() => new Promise(() => {}))
  assert.ok(dots(view), 'the dots while Helper waits')
  assert.equal(all(helper(view), n => n.props['data-line'] === 'REC').length, 0)
  timers.fire(12000)
  await settle()
  finish(view)
  assert.equal(dots(view), null)
  assert.equal(said(view), WRITTEN_1)
  await press(view, "I've done this already")
  assert.equal(host.asks.length, 1, 'no second call in this visit')
  assert.match(said(view), /^You want Hermes to do things at set times\. Next: Scheduled jobs\./)
  assert.equal(all(helper(view), n => n.props['data-line'] === 'SLOW_A').length, 0)
})

// find-v1 part 3: one failed try no longer ends the AI for the visit; two in a row do
test('the call fails at once (no AI set up for Helper\'s calls): the written sentence each time; after two failed tries in a row no further call', opt, async () => {
  const { view, host } = await toRec(() => new Error('No LLM provider configured for task=helping_hand'))
  assert.equal(said(view), WRITTEN_1)
  await press(view, 'Something else')
  assert.equal(host.asks.length, 2, 'tried once more')
  await press(view, 'Something else')
  assert.equal(host.asks.length, 2, 'two in a row: off for the visit')
})

test('the person presses on while the AI is still writing: the written sentence shows at once and their press is taken', opt, async () => {
  let release
  const { view, host } = await toRec(() => new Promise(r => (release = r)))
  assert.ok(dots(view))
  await send(view, "what's a skill?")
  const lines = all(helper(view), n => n.props['data-line']).map(n => n.props['data-line'])
  assert.ok(lines.includes('REC'), 'the written recommendation was put in first')
  assert.equal(bubble(view).props['data-line'], 'term-skill')
  release(AI_1)
  await settle()
  assert.equal(all(helper(view), n => n.props['data-line'] === 'REC').length, 1, 'the late reply adds nothing')
  assert.equal(host.asks.length, 1)
})

test('no AI step for it: with no_ai_step, with ai_picks_line (the AI only picks lines there), and with the switch SETUP_AI_BUILT off: no call, the written sentence', opt, async () => {
  for (const options of [{ mode: 'no_ai_step' }, { mode: 'ai_picks_line' }, { change: src => setupAiSource(src, 'false') }]) {
    const { view, host } = await toRec(() => AI_1, options)
    assert.equal(said(view), WRITTEN_1, JSON.stringify(Object.keys(options)))
    assert.equal(host.asks.length, 0)
  }
})

test('the lines that say what is sent name the three rows, as the data words them (the first-time line under Kept:, the settings line)', opt, async () => {
  const { view } = await toRec(() => AI_1)
  const all3 = "Your AI also gets what you do, what you want and if you're new. It gets them only when I ask it for help."
  const whole = text(helper(view)).replace(/’/g, "'")
  assert.equal(whole.split(all3).length - 1, 1, 'once, under the first Kept: line of the three')
  assert.doesNotMatch(whole, /I also tell your AI what you do when I ask it for help\./, 'the older line, true only while one thing was sent, is not said')
})

// Helper's settings page, on the built file: the line under the title says what goes to the AI, truthfully for the build
async function settingsLine(change) {
  useHost(() => 'NONE')
  const reg = await registerPlugin(fakeStorage({ kept: { name: 'Peter', work: 'I run a tennis club' } }), fakeTimers(), {}, src => change(aiModeSource(src, 'ai_writes')))
  const view = mount(reg.settingsPages[0].render().type)
  await settle()
  return all(view.tree, n => n.type === 'sdk:ListRow')[0].props.description
}
test('the settings page\'s line about what goes to the AI: the three rows when the recommendation asks the AI; only What you do when it does not', opt, async () => {
  assert.equal(await settingsLine(src => setupAiSource(src, 'true')), 'These go to your AI: What you do, New to Hermes, What you want. Only when Helper asks it for help.')
  // setup-chat-2: changes-1's settings_top_line_2_work_only, in place of was_c6 (a 17-word sentence)
  assert.equal(await settingsLine(x => x), 'Only What you do goes to your AI. Only when Helper asks it for help.')
  assert.equal(await settingsLine(src => setupAiSource(src, 'false')), 'Only What you do goes to your AI. Only when Helper asks it for help.')
})
