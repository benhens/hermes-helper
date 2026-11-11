// chat-fix part 3, "Do it for me" (his words: "Is it possible for the helper to do it and do something on his behalf?").
// Hermes lets a plugin run Hermes's own commands with host.request('cli.exec', { argv }). Helper uses it for one fixed
// action, importing a setup from another agent: a preview first (never touches the disk), then, on a second click, the
// import. Over the built page with a stand-in for the model and a stand-in for cli.exec that answers with what the
// real commands printed in Hermes v0.23.0 (tests/fixtures/import-agent/, paths made neutral).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { open, send, settle, finish, bubble, bubbleLine, helper } from './lib/talk-page.mjs'
import { all, text, byData, click, loadSrc } from './lib/render.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const mode = process.env.HELPER_AI_MODE || 'ai_writes'
const fixture = name => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'import-agent', name + '.txt'), 'utf8')
const calls = host => host.asks.filter(p => !(p && p.instructions === 'Reply with exactly: OK'))
const shownText = node => text(node).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
const REPLY = agent => `Hermes can bring your setup over. Press the button and I'll show you a preview first.\n\n[[do:import ${agent}]]`
const OK = name => ({ blocked: false, code: 0, output: fixture(name) })

// the page after the name, with a model that answers `reply` and a cli.exec that answers exec(params, n)
async function page(reply, exec = () => OK('dry')) {
  const o = await open(mode, { host: { oneshot: typeof reply === 'function' ? reply : () => reply } })
  const real = o.host.request
  o.host.exec = []
  o.host.request = async (method, params, timeout) => {
    if (method !== 'cli.exec') return real(method, params, timeout)
    o.host.exec.push(params)
    const r = await exec(params, o.host.exec.length)
    if (r instanceof Error) throw r
    return r
  }
  finish(o.view)
  send(o.view, 'Peter')
  await settle()
  send(o.view, 'How can I move from Claude Code to Hermes?')
  await settle()
  return o
}
const act = view => byData(bubble(view), 'act')
const button = view => byData(act(view), 'act-button')
const argvs = host => host.exec.map(p => p.argv.join(' '))

test('the model asks with [[do:import claude-code]]: a button "Do it for me" and one line that says exactly what it runs; nothing runs without a click; no brackets', async () => {
  const { view, host } = await page(REPLY('claude-code'))
  assert.equal(bubbleLine(view), 'CHAT')
  assert.doesNotMatch(text(bubble(view)), /\[\[|\]\]|do:import/)
  assert.equal(act(view).props['data-state'], 'offer')
  assert.equal(shownText(button(view)), 'Do it for me')
  assert.equal(shownText(byData(act(view), 'act-line')), 'I can do this step for you. It runs hermes import-agent claude-code --dry-run: a preview of what would come over from Claude Code. Nothing is changed.')
  await settle(10)
  assert.deepEqual(host.exec, [], 'no command has run')
})

test('a click runs the preview only (--dry-run); it is shown in plain words; the import needs a second click and runs with --yes', async () => {
  const { view, host } = await page(REPLY('claude-code'), (p, n) => (n === 1 ? OK('dry') : OK('yes')))
  click(button(view))
  await settle(10)
  assert.deepEqual(argvs(host), ['import-agent claude-code --dry-run'])
  assert.deepEqual(host.exec[0], { argv: ['import-agent', 'claude-code', '--dry-run'], timeout: 240 })
  assert.equal(act(view).props['data-state'], 'preview')
  assert.equal(shownText(byData(act(view), 'act-line')), 'Here is what would come over from Claude Code. Nothing is changed yet.')
  assert.deepEqual(all(byData(act(view), 'act-rows'), n => n.type === 'li').map(shownText), ['Your instructions (CLAUDE.md), as memory notes'])
  assert.equal(shownText(byData(act(view), 'act-skipped')), '5 other things had nothing to bring over.')
  assert.equal(shownText(byData(act(view), 'act-next')), '“Import it” runs hermes import-agent claude-code --yes.')
  assert.doesNotMatch(text(act(view)), /\/Users\/peter|MEMORY\.md/, 'no path of the person\'s disk in Helper\'s words')
  assert.equal(shownText(button(view)), 'Import it')
  await settle(10)
  assert.equal(host.exec.length, 1, 'the import has not run')
  click(button(view))
  await settle(10)
  assert.deepEqual(argvs(host), ['import-agent claude-code --dry-run', 'import-agent claude-code --yes'])
  assert.equal(act(view).props['data-state'], 'done')
  assert.equal(shownText(byData(act(view), 'act-line')), 'Done. Your Claude Code setup is in Hermes now.')
  assert.equal(shownText(byData(act(view), 'act-summary')), 'Hermes says: 1 imported, 5 skipped.')
  assert.equal(button(view), null, 'no button left')
})

test('the argv sent for each step, for each of the four agents; no other agent and no other step has a command', async () => {
  const { chatActionArgv, chatActionTyped, CHAT_AGENTS } = await loadSrc('chat.js')
  assert.deepEqual(Object.keys(CHAT_AGENTS), ['claude-code', 'codex', 'cursor', 'openclaw'])
  for (const agent of Object.keys(CHAT_AGENTS)) {
    assert.deepEqual(chatActionArgv('preview', agent), ['import-agent', agent, '--dry-run'])
    assert.deepEqual(chatActionArgv('import', agent), ['import-agent', agent, '--yes'])
    assert.deepEqual(chatActionArgv('plugin', agent), ['plugins', 'install', 'agent-importers', '--enable'])
    assert.equal(chatActionTyped('import', agent), `hermes import-agent ${agent}`)
    assert.equal(chatActionTyped('plugin', agent), 'hermes plugins install agent-importers')
  }
  for (const bad of ['grok-bot', 'openbot', 'nonsense', '', 'claude-code --overwrite', '__proto__', 'constructor']) assert.equal(chatActionArgv('preview', bad), null, bad)
  for (const step of ['', 'sync', 'cleanup', 'toString']) assert.equal(chatActionArgv(step, 'codex'), null, step)
  // on the page, for another agent
  const { view, host } = await page(REPLY('cursor'))
  click(button(view))
  await settle(10)
  assert.deepEqual(argvs(host), ['import-agent cursor --dry-run'])
})

test('an unknown action shows no button and runs nothing: any other [[do:...]] is dropped silently', async () => {
  const { chatParts, chatAction } = await loadSrc('chat.js')
  for (const what of ['rm -rf /', 'import grok-bot', 'import claude-code --overwrite', 'import claude-code; rm -rf /', 'import', 'import  ', 'plugins install x', 'import claude-code codex', 'IMPORT __proto__']) {
    assert.equal(chatAction(what), null, what)
    assert.deepEqual(chatParts(`Sure.\n[[do:${what}]]`), { text: 'Sure.', quick: [], card: null }, what)
  }
  assert.deepEqual(chatParts('Sure.\n[[do:import Claude-Code]]').act, { kind: 'import', agent: 'claude-code', state: 'offer' })
  // a mark inside text to type, or one that forms when another is taken out, is no action
  assert.equal(chatParts('Write `[[do:import codex]]`.').act, undefined)
  assert.equal(chatParts('Sure.\n[[do:imp[[do:x]]ort codex]]').act, undefined)
  const { view, host } = await page('Sure, I will delete that.\n\n[[do:rm -rf /]]')
  assert.equal(act(view), null)
  assert.equal(all(helper(view), n => n.props['data-hh'] === 'act-button').length, 0)
  assert.doesNotMatch(text(bubble(view)), /\[\[|\]\]|rm -rf/)
  await settle(10)
  assert.deepEqual(host.exec, [])
})

test('Hermes without its import add-on: installing it is the first step, shown and confirmed the same way; then the preview follows', async () => {
  const missing = { blocked: false, code: 2, output: fixture('no-plugin') }
  const { view, host } = await page(REPLY('claude-code'), (p, n) => (n === 1 ? missing : n === 2 ? { blocked: false, code: 0, output: '✓ Plugin agent-importers enabled.' } : OK('dry')))
  click(button(view))
  await settle(10)
  assert.equal(act(view).props['data-state'], 'plugin')
  assert.equal(shownText(byData(act(view), 'act-line')), 'Hermes needs its import add-on first (the agent-importers plugin, from Nous Research). Installing it runs hermes plugins install agent-importers --enable. Then I show you the preview.')
  assert.equal(shownText(button(view)), 'Install it')
  await settle(10)
  assert.deepEqual(argvs(host), ['import-agent claude-code --dry-run'], 'nothing is installed without a click')
  click(button(view))
  await settle(10)
  assert.deepEqual(argvs(host), ['import-agent claude-code --dry-run', 'plugins install agent-importers --enable', 'import-agent claude-code --dry-run'])
  assert.equal(act(view).props['data-state'], 'preview')
  assert.equal(shownText(button(view)), 'Import it')
  assert.ok(!argvs(host).some(a => a.includes('--yes')), 'the import itself still waits for its click')
})

test('a failed run shows the last lines of its output in plain words and the step to do by hand', async () => {
  const { view, host } = await page(REPLY('claude-code'), () => ({ blocked: false, code: 1, output: fixture('dry-none') }))
  click(button(view))
  await settle(10)
  assert.equal(act(view).props['data-state'], 'failed')
  assert.equal(shownText(byData(act(view), 'act-line')), "That didn't work. Hermes said:")
  const said = text(byData(act(view), 'act-output'))
  assert.match(said, /✗ Agent directory not found: \/Users\/peter\/\.claude/)
  assert.match(said, /Specify a custom path: hermes import-agent claude-code --source \/path\/to\/\.claude/)
  assert.doesNotMatch(said, /[┌│└─]{2}|☤/, 'no drawn box')
  assert.equal(shownText(byData(act(view), 'act-by-hand')), 'You can do this step by hand: open a terminal and paste this.')
  assert.equal(shownText(byData(byData(act(view), 'paste'), 'paste-text')), 'hermes import-agent claude-code --dry-run')
  assert.equal(button(view), null)
  assert.equal(host.exec.length, 1)
})

test('a failed import (after the preview) gives the import to do by hand; a blocked command shows Hermes\'s hint; a Hermes without that door fails plainly', async () => {
  const a = await page(REPLY('codex'), (p, n) => (n === 1 ? OK('dry') : { blocked: false, code: 1, output: 'line 1\n\u001b[31m✗ Could not write config.yaml\u001b[0m\n' }))
  click(button(a.view))
  await settle(10)
  click(button(a.view))
  await settle(10)
  assert.equal(act(a.view).props['data-state'], 'failed')
  assert.equal(text(byData(act(a.view), 'act-output')), 'line 1\n✗ Could not write config.yaml', 'colour codes are taken out')
  assert.equal(shownText(byData(byData(act(a.view), 'paste'), 'paste-text')), 'hermes import-agent codex')
  const b = await page(REPLY('claude-code'), () => ({ blocked: true, hint: 'not here', code: -1, output: '' }))
  click(button(b.view))
  await settle(10)
  assert.equal(act(b.view).props['data-state'], 'failed')
  assert.equal(text(byData(act(b.view), 'act-output')), 'not here')
  const c = await page(REPLY('claude-code'), () => new Error('unknown method cli.exec'))
  click(button(c.view))
  await settle(10)
  assert.equal(act(c.view).props['data-state'], 'failed')
  assert.equal(shownText(byData(act(c.view), 'act-line')), "That didn't work: Hermes could not run the command here.")
  assert.equal(byData(act(c.view), 'act-output'), null)
  assert.equal(shownText(byData(byData(act(c.view), 'paste'), 'paste-text')), 'hermes import-agent claude-code --dry-run')
})

test('a preview with nothing to bring over has no Import button', async () => {
  const none = fixture('dry').replace(/  ✓ Would import:\n.*\n/, '').replace('1 would import', '0 would import')
  const { view, host } = await page(REPLY('claude-code'), () => ({ blocked: false, code: 0, output: none }))
  click(button(view))
  await settle(10)
  assert.equal(act(view).props['data-state'], 'preview')
  assert.equal(shownText(byData(act(view), 'act-line')), 'Hermes found nothing to bring over from Claude Code. Nothing is changed.')
  assert.equal(button(view), null)
  assert.equal(host.exec.length, 1)
})

test('while a command runs the button is gone, so a second click cannot start it twice', async () => {
  let release
  const gate = new Promise(r => (release = r))
  const { view, host } = await page(REPLY('claude-code'), async () => {
    await gate
    return OK('dry')
  })
  click(button(view))
  await settle()
  assert.equal(act(view).props['data-state'], 'running')
  assert.equal(button(view), null)
  assert.equal(shownText(byData(act(view), 'act-line')), 'Working on it…')
  release()
  await settle(10)
  assert.equal(act(view).props['data-state'], 'preview')
  assert.equal(host.exec.length, 1)
})

test('the model is told that the step was run, in a fixed phrase; the command\'s output (paths on the person\'s disk) is never sent', async () => {
  const { view, host } = await page((p, n) => (n === 1 ? REPLY('claude-code') : 'Great, that is step 1 done.'), (p, n) => (n === 1 ? OK('dry') : OK('yes')))
  click(button(view))
  await settle(10)
  click(button(view))
  await settle(10)
  send(view, 'done, what now?')
  await settle()
  const input = calls(host).at(-1).input
  assert.match(input, /Helper: Hermes can bring your setup over\. .* \(Helper ran the import for the person; it is done\.\)/)
  assert.doesNotMatch(input, /\/Users\/peter|MEMORY\.md|Would import|Summary:/)
})

test('the instructions tell the model about Do it for me: the four agents, only for that step, otherwise by hand', async () => {
  const { CHAT_INSTRUCTIONS } = await loadSrc('chat.js')
  assert.match(CHAT_INSTRUCTIONS, /\[\[do:import AGENT\]\] on its own line, where AGENT is one of claude-code, codex, cursor, openclaw/)
  assert.match(CHAT_INSTRUCTIONS, /For every other step, give the step to do by hand, and never write \[\[do:\.\.\.\]\] for anything else\./)
  assert.match(CHAT_INSTRUCTIONS, /changes nothing until they press "Import it"/)
})
