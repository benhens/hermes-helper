// chat-fix (Pēteris on build 11f4eda, 11 Nov 2026: a long reply filled Helper's whole window and nothing scrolled; "The
// answer is not friendly at all. It should help him step by step."; "It should show where to go and what to do").
// Over the built page with a stand-in model. What only a real window can show (the scroll position, what stays in
// view at 460 px) is measured in the app run (dev/checks/chat-fix/app-run.mjs), not here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { open, send, settle, finish, bubble, bubbleLine, olds, mine, helper } from './lib/talk-page.mjs'
import { all, text, byData, click, loadSrc, registerPlugin, fakeStorage, fakeTimers, mount } from './lib/render.mjs'
import { useHost } from './lib/talk-page.mjs'
import { aiModeSource } from './lib/mode-loader.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const mode = process.env.HELPER_AI_MODE || 'ai_writes'
const calls = host => host.asks.filter(p => !(p && p.instructions === 'Reply with exactly: OK'))
const shownText = node => text(node).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
const Q = 'How can I move from Claude to Hermes?'
const LONG = Array.from({ length: 100 }, (_, i) => `Paragraph ${i + 1} ` + 'word '.repeat(19).trim() + '.').join('\n\n')

async function named(oneshot) {
  const o = await open(mode, { host: { oneshot } })
  finish(o.view)
  send(o.view, 'Peter')
  await settle()
  return o
}
const css = () => fs.readFileSync(path.join(ROOT, 'src', 'talk.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = sel => {
  const found = [...css().matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].trim().split(',').map(s => s.trim()).includes(sel))
  return found.map(m => m[2]).join(';')
}

test('the scroll case: a 2,000-word reply is inside the part that scrolls; the bar, the character and the message box are outside it, in the window', async () => {
  assert.equal(LONG.split(/\s+/).length >= 2000, true)
  const { view } = await named(() => LONG)
  send(view, Q)
  await settle()
  assert.equal(bubbleLine(view), 'CHAT')
  const win = helper(view)
  const conv = byData(win, 'conversation')
  assert.ok(byData(conv, 'bubble'), 'the reply is in the scrolling conversation')
  assert.match(shownText(byData(conv, 'bubble')), /^Paragraph 1 word/, 'from its first line')
  for (const part of ['under', 'character', 'composer', 'win-bar']) {
    assert.ok(byData(win, part), `${part} is in the window`)
    assert.equal(byData(conv, part), null, `${part} is not in the scrolling part`)
  }
  // the order in the window: the bar, the part that scrolls, the character's row, the message box
  const kids = [win.props.children].flat(3).filter(c => c && c.props).map(c => c.props['data-hh'])
  assert.deepEqual(kids.filter(k => ['win-bar', 'conversation', 'bubble', 'busy-dots', 'under', 'composer'].includes(k)), ['win-bar', 'conversation', 'under', 'composer'])
  // the style sheet: the conversation takes the room that is left and scrolls; the window is as high as its place
  // and no part of it can be pushed out (the character's row and a bubble under the conversation never grow past it)
  assert.match(rule('.hh-conv'), /flex:1/)
  assert.match(rule('.hh-conv'), /min-height:0/)
  assert.match(rule('.hh-conv'), /overflow:hidden auto/)
  assert.match(rule('.hh-win'), /height:100%/)
  assert.match(rule('.hh-win'), /min-height:0/)
  assert.match(rule('.hh-under'), /flex:none/)
  assert.match(rule('.hh-win>.hh-bubble'), /flex:0 1 auto/)
  assert.match(rule('.hh-win>.hh-bubble'), /min-height:0/)
  assert.match(rule('.hh-win>.hh-bubble'), /overflow:hidden auto/)
})

test('a short fixed line of Helper\'s (the name question) stays in its bubble over the character, outside the scrolling part', async () => {
  const { view } = await open(mode)
  finish(view)
  assert.equal(bubbleLine(view), 'OPEN')
  assert.equal(byData(byData(helper(view), 'conversation'), 'bubble'), null)
})

test('quick replies: [[A]] [[B]] at the end of a reply are buttons under it, never text; a click sends that text as the person\'s message', async () => {
  const { view, host } = await named((p, n) => (n === 1 ? 'Happy to help. Which one do you use?\n\n[[Claude Code]] [[The Claude app]]' : 'This takes 3 short steps. Here\'s the first.'))
  send(view, Q)
  await settle()
  const b = bubble(view)
  assert.doesNotMatch(text(b), /\[\[|\]\]/, 'no brackets on screen')
  const quick = all(b, n => n.props['data-hh'] === 'quick-reply')
  assert.deepEqual(quick.map(shownText), ['Claude Code', 'The Claude app'])
  assert.ok(quick.every(q => q.type === 'button'))
  assert.equal(shownText(byData(b, 'md')), 'Happy to help. Which one do you use?')
  click(quick[0])
  await settle()
  assert.equal(mine(view).at(-1), 'Claude Code', 'shown as the person\'s message')
  assert.equal(calls(host).length, 2)
  assert.match(calls(host)[1].input, /New message from the person:\nClaude Code$/)
  assert.match(calls(host)[1].input, /Helper: Happy to help\. Which one do you use\?/)
  assert.doesNotMatch(calls(host)[1].input, /\[\[Claude/, 'the marks are not sent back as Helper\'s words')
  // once the reply is an older line its choices are gone, and still no brackets
  assert.equal(all(helper(view), n => n.props['data-hh'] === 'quick-reply').length, 0)
  assert.ok(olds(view).every(o => !/\[\[|\]\]/.test(text(o))))
})

test('at most three quick replies; a fourth is dropped', async () => {
  const { view } = await named(() => 'Pick one.\n[[One]] [[Two]] [[Three]] [[Four]]')
  send(view, Q)
  await settle()
  assert.deepEqual(all(bubble(view), n => n.props['data-hh'] === 'quick-reply').map(shownText), ['One', 'Two', 'Three'])
  assert.doesNotMatch(text(bubble(view)), /\[\[|\]\]|Four/)
})

test('[[card:skills]] at the end of a reply: the skills card\'s video place and "Open Skills on the Dashboard", which opens that card; no brackets', async () => {
  const { DASH_DATA } = await loadSrc('dash-data.js')
  const skills = DASH_DATA.items.find(it => it.id === 'skills')
  const { view } = await named(() => 'A skill is written know-how that teaches Hermes one task.\n\n[[card:skills]]')
  send(view, 'What is a skill?')
  await settle()
  const b = bubble(view)
  assert.doesNotMatch(text(b), /\[\[|\]\]|card:/)
  const place = byData(b, 'chat-card')
  assert.ok(place, 'the card place under the reply')
  assert.equal(place.props['data-card'], 'skills')
  // the video place exactly as the opened card shows it: no address yet, so the quiet box with the card's name
  const soon = byData(place, 'video-soon')
  assert.ok(soon, 'the quiet Video coming soon box')
  assert.equal(shownText(soon), `${skills.name} ${DASH_DATA.words.setup.video_soon}`.replace(/\s+/g, ' '))
  assert.equal(byData(place, 'video'), null)
  const openBtn = byData(place, 'chat-card-open')
  assert.equal(shownText(openBtn), `Open ${skills.name} on the Dashboard`)
  assert.equal(byData(view.tree, 'steps'), null, 'no card is open before the click')
  click(openBtn)
  await settle()
  const steps = byData(view.tree, 'steps')
  assert.ok(steps, 'the card is open on the Dashboard')
  assert.equal(steps.props['data-stop'], 'skills')
  // the same box as the opened card's own
  assert.equal(shownText(byData(steps, 'video-soon')), shownText(soon))
  // a second click leaves it open (it opens, it does not toggle)
  click(byData(byData(bubble(view), 'chat-card'), 'chat-card-open'))
  await settle()
  assert.equal(byData(view.tree, 'steps').props['data-stop'], 'skills')
})

test('[[card:nonsense]] shows nothing: no card place, no button, no brackets', async () => {
  const { view } = await named(() => 'Hindsight is a memory provider.\n\n[[card:nonsense]]')
  send(view, 'What is hindsight?')
  await settle()
  const b = bubble(view)
  assert.equal(shownText(byData(b, 'md')), 'Hindsight is a memory provider.')
  assert.equal(byData(b, 'chat-card'), null)
  assert.equal(byData(b, 'chat-card-open'), null)
  assert.doesNotMatch(text(b), /\[\[|\]\]|nonsense/)
})

test('a card with a video address shows the video itself in the chat, as the opened card does (nothing loaded before Play)', async () => {
  // the built page with an address put on the skills card (content/videos.json has none yet); the file is not touched
  const withVideo = src => {
    const at = src.indexOf('const DASH_DATA = ')
    const i = src.indexOf('"id": "skills"', at)
    const j = src.indexOf('"video": null', i)
    assert.ok(at > 0 && i > at && j > i, 'the skills card in the built data')
    return src.slice(0, j) + '"video": { "url": "https://example.org/skills.mp4", "poster": "", "captions": "" }' + src.slice(j + '"video": null'.length)
  }
  useHost({ oneshot: () => 'A skill teaches Hermes one task.\n\n[[card:skills]]' })
  const { Page } = await registerPlugin(fakeStorage(), fakeTimers({ hold: [12000] }), {}, src => withVideo(aiModeSource(src, mode)))
  const view = mount(Page)
  await settle()
  finish(view)
  send(view, 'Peter')
  await settle()
  send(view, 'What is a skill?')
  await settle()
  const place = byData(bubble(view), 'chat-card')
  const video = byData(place, 'video')
  assert.ok(video, 'the video')
  assert.equal(video.type, 'video')
  assert.equal(video.props.src, 'https://example.org/skills.mp4')
  assert.equal(video.props.preload, 'none')
  assert.equal(byData(place, 'video-soon'), null)
  click(byData(place, 'chat-card-open'))
  await settle()
  assert.equal(byData(byData(view.tree, 'steps'), 'video').props.src, video.props.src)
})

test('the instructions: one step at a time, the 80-word rule, quick replies, the nine cards by the Dashboard\'s own ids, and the rules kept from before', async () => {
  const { CHAT_INSTRUCTIONS, CHAT_CARDS } = await loadSrc('chat.js')
  const { DASH_DATA } = await loadSrc('dash-data.js')
  assert.match(CHAT_INSTRUCTIONS, /one step/i)
  assert.match(CHAT_INSTRUCTIONS, /at most about 80 words/)
  assert.match(CHAT_INSTRUCTIONS, /ONLY the first step/)
  assert.match(CHAT_INSTRUCTIONS, /Tell me when that's done, or tell me what you see\./)
  assert.match(CHAT_INSTRUCTIONS, /No headings, no tables/)
  assert.match(CHAT_INSTRUCTIONS, /ask which one first/)
  assert.match(CHAT_INSTRUCTIONS, /\[\[Claude Code\]\] \[\[The Claude app\]\]/)
  assert.match(CHAT_INSTRUCTIONS, /\[\[card:ID\]\]/)
  assert.deepEqual(CHAT_CARDS.map(c => c[0]), DASH_DATA.items.map(it => it.id), 'the nine ids, in the Dashboard\'s order')
  assert.equal(CHAT_CARDS.length, 9)
  for (const [id] of CHAT_CARDS) assert.match(CHAT_INSTRUCTIONS, new RegExp(`^  ${id} = `, 'm'))
  assert.match(CHAT_CARDS.find(c => c[0] === 'memory')[1], /Hindsight/)
  // kept from the first round: keys, the docs excerpts, no invented commands, Read more
  assert.match(CHAT_INSTRUCTIONS, /Never ask for an API key, password or token, and never repeat one\./)
  assert.match(CHAT_INSTRUCTIONS, /Use the doc excerpts you are given\./)
  assert.match(CHAT_INSTRUCTIONS, /Don't invent commands, settings or menu names that are not in the excerpts\./)
  assert.match(CHAT_INSTRUCTIONS, /"Read more:" with one or two links only on your first reply about a topic and on the last step/)
  assert.doesNotMatch(CHAT_INSTRUCTIONS, /numbered list/)
})

test('the last 10 lines of the conversation go with each call (not 6)', async () => {
  const { view, host } = await named((p, n) => `Reply number ${n}.`)
  for (let i = 1; i <= 7; i++) {
    send(view, `Question number ${i}?`)
    await settle()
  }
  const input = calls(host)[6].input
  const lines = input.split('Conversation so far:\n')[1].split('\n\nNew message from the person:')[0].split('\n')
  assert.equal(lines.length, 10)
  assert.equal(lines[0], 'Person: Question number 2?')
  assert.equal(lines[9], 'Helper: Reply number 6.')
})

test('chatParts: the marks leave the words; text to type keeps its brackets; any [[do:...]] is dropped silently', async () => {
  const { chatParts } = await loadSrc('chat.js')
  assert.deepEqual(chatParts('Hello.\n\n[[Yes]] [[No]]'), { text: 'Hello.', quick: ['Yes', 'No'], card: null })
  assert.deepEqual(chatParts('Which one? [[Claude Code]] [[The Claude app]]'), { text: 'Which one?', quick: ['Claude Code', 'The Claude app'], card: null })
  assert.deepEqual(chatParts('About memory.\n[[card:memory]]\n[[Tell me more]]'), { text: 'About memory.', quick: ['Tell me more'], card: 'memory' })
  assert.deepEqual(chatParts('About [[memory]] in a sentence.'), { text: 'About memory in a sentence.', quick: [], card: null })
  assert.deepEqual(chatParts('Run it.\n[[do:rm -rf /]]\n[[do:anything at all]]'), { text: 'Run it.', quick: [], card: null })
  assert.deepEqual(chatParts('[[card:Skills]] [[card:memory]]\nTwo cards named.'), { text: 'Two cards named.', quick: [], card: 'skills' })
  const code = 'Paste this:\n\n```\nif [[ -f ~/.hermes/config.yaml ]]; then echo yes; fi\n```\n\nor `[[ -d x ]]` in a line.'
  assert.equal(chatParts(code).text, code)
  assert.deepEqual(chatParts(code).quick, [])
  assert.deepEqual(chatParts(''), { text: '', quick: [], card: null })
})

test('a reply that is only marks counts as no reply: the failed-call line, never an empty bubble', async () => {
  const { view } = await named(() => '[[card:skills]]')
  send(view, 'What is a skill?')
  await settle(10)
  assert.equal(bubbleLine(view), 'CHAT_FAILED')
})
