// Chat round 20:12 (Pēteris, 11 Nov 2026, from hhtech's run on b0f8155: docs/answers/hhtech-chat-fix-check.md,
// "What still isn't right"). Over the built page with a stand-in model, and chatParts on its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { open, send, settle, finish, bubble } from './lib/talk-page.mjs'
import { all, text, byData, loadSrc } from './lib/render.mjs'

const mode = process.env.HELPER_AI_MODE || 'ai_writes'
const shownText = node => text(node).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()

async function named(oneshot, host = {}) {
  const o = await open(mode, { host: { oneshot, ...host } })
  finish(o.view)
  send(o.view, 'Peter')
  await settle()
  return o
}

// ---- point 1: choices always become buttons ----
test('1: a run of two or three marks is choices wherever it stands; it leaves no trace in the words', async () => {
  const { chatParts } = await loadSrc('chat.js')
  // hhtech's run 1, as the model wrote it: the choices in the middle, before "Read more"
  const run1 = 'Do you mean moving your Claude Code setup, or bringing over a conversation from Claude Code? [[Claude Code setup]] [[A conversation]] Read more: [Import from other agents](https://hermes-agent.nousresearch.com/docs/guides/import)'
  const p = chatParts(run1)
  assert.deepEqual(p.quick, ['Claude Code setup', 'A conversation'])
  assert.equal(p.text, 'Do you mean moving your Claude Code setup, or bringing over a conversation from Claude Code? Read more: [Import from other agents](https://hermes-agent.nousresearch.com/docs/guides/import)')
  // on a line of its own before "Read more", at the end of a sentence, after "Read more", at a line's start
  assert.deepEqual(chatParts('Which one?\n[[A]] [[B]] [[C]]\nRead more: x').quick, ['A', 'B', 'C'])
  assert.equal(chatParts('Which one?\n[[A]] [[B]] [[C]]\nRead more: x').text, 'Which one?\nRead more: x')
  assert.deepEqual(chatParts('Which one? [[A]] [[B]]\n\nRead more: x'), { text: 'Which one?\n\nRead more: x', quick: ['A', 'B'], card: null })
  assert.deepEqual(chatParts('Which one?\n\nRead more: x [[A]] [[B]]'), { text: 'Which one?\n\nRead more: x', quick: ['A', 'B'], card: null })
  assert.deepEqual(chatParts('[[A]] [[B]] which one?\nRead more: x'), { text: 'which one?\nRead more: x', quick: ['A', 'B'], card: null })
  // a single mark inside a sentence stays words, as before
  assert.deepEqual(chatParts('Open [[Settings]] and then Model.\nRead more: x'), { text: 'Open Settings and then Model.\nRead more: x', quick: [], card: null })
  // a run inside `code` is text to type
  assert.deepEqual(chatParts('Type `[[A]] [[B]]` there.').quick, [])
})

test('1: on the page, choices in the middle of the reply are buttons under it, and not in its words', async () => {
  const { view } = await named(() => 'Do you mean your Claude Code setup, or a conversation? [[Claude Code setup]] [[A conversation]] Read more: the docs.')
  send(view, 'How can I move from Claude to Hermes?')
  await settle()
  const b = bubble(view)
  assert.deepEqual(all(b, n => n.props['data-hh'] === 'quick-reply').map(shownText), ['Claude Code setup', 'A conversation'])
  assert.equal(shownText(byData(b, 'md')), 'Do you mean your Claude Code setup, or a conversation? Read more: the docs.')
  assert.doesNotMatch(text(byData(b, 'md')), /\[\[|\]\]|A conversation/)
})

test('1: the instructions put the choices on the last line, after "Read more"', async () => {
  const { CHAT_INSTRUCTIONS } = await loadSrc('chat.js')
  assert.match(CHAT_INSTRUCTIONS, /on the very last line of the reply, after the "Read more:" line/)
})

// ---- points 4, 5, 6: the instructions ----
test('4: "What is X?": what it is, what it needs, where it is (each card\'s place line with its id), then the first step only if asked; installs as text for their own bot', async () => {
  const { CHAT_INSTRUCTIONS, CHAT_CARDS } = await loadSrc('chat.js')
  const { DASH_DATA } = await loadSrc('dash-data.js')
  assert.match(CHAT_INSTRUCTIONS, /For "What is X\?", in this order: first what it is, in one or two plain sentences\. Then what it needs, if the excerpts say it needs an account, a key or money\. Then where it is in the app, naming the place to click/)
  assert.match(CHAT_INSTRUCTIONS, /Only if the person then asks how, give the first step\. Never open a "What is" answer with a terminal command, and never count the steps before giving one\./)
  assert.match(CHAT_INSTRUCTIONS, /An install is given as text the person pastes to their own bot in a chat, never as "type this in your terminal", unless it is the Do it for me action/)
  for (const [id] of CHAT_CARDS) {
    const first = DASH_DATA.items.find(x => x.id === id).steps[0].text
    assert.ok(CHAT_INSTRUCTIONS.includes(`  ${id} = `) && CHAT_INSTRUCTIONS.includes(`Place: ${first}`), id)
  }
  assert.match(CHAT_INSTRUCTIONS, /skills = [^\n]*Place: Click Capabilities in the left list, then Skills/)
})

test('5: a card only for its own subject; [[card:memory]] is the built-in memory, a memory provider such as Hindsight gets no card', async () => {
  const { CHAT_INSTRUCTIONS } = await loadSrc('chat.js')
  assert.match(CHAT_INSTRUCTIONS, /Add a card only when your reply is about that card's own subject/)
  assert.match(CHAT_INSTRUCTIONS, /\[\[card:memory\]\] is for Hermes's built-in memory, so a reply about a memory provider such as Hindsight carries no card/)
  assert.match(CHAT_INSTRUCTIONS, /memory = Hermes's built-in memory: what it remembers between chats \(not memory providers such as Hindsight\)/)
})

test('6: only choices the docs cover: for Claude, Claude Code setup and a Claude Code conversation; the Claude app is not covered', async () => {
  const { CHAT_INSTRUCTIONS } = await loadSrc('chat.js')
  assert.match(CHAT_INSTRUCTIONS, /Offer only choices the doc excerpts can answer\. For Claude, that is Claude Code's setup and a Claude Code conversation, never "The Claude app"\. If the person asks about the Claude app, say the docs cover Claude Code only\./)
  assert.doesNotMatch(CHAT_INSTRUCTIONS, /\[\[The Claude app\]\]/)
})
