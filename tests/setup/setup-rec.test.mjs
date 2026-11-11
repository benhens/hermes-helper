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
    'What I can see: You have a model, the AI that thinks, and it answered my check. You have no scheduled jobs yet.',
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
    checks: [],
    request: async (method, params) => {
      // loom-fixes-2 part B 1: the set-up look's one check call (a fixed text) is the stand-in's own, not one of the person's asks
      if (method === 'llm.oneshot' && params && params.instructions === 'Reply with exactly: OK') {
        host.checks.push(params)
        return { text: 'OK' }
      }
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
