// loom-fixes (Lead's point 17b, Lead's reading of his \"chat logs\"): the conversation with Helper is still there on the
// next visit. The last TALK_KEEP_MAX lines are kept in the plugin's storage on the person's computer (ctx.storage, key
// 'talk'), shown again above the new visit's lines. Pure code: no React, no Hermes; src/page.js does the storage calls.
// What a kept line holds: who said it, its words, its line id, the docs box, a text to copy with its label, a list of
// rows; never its things to pick, its faint \"Kept:\" note or anything only that moment had. Lead's rule for a line shown
// again after a restart: its buttons are plain faint text (OldLine draws them so when restored), its text to copy
// stays copyable.
// Never kept: a line the secrets rule refuses (the person's message, or Helper's line or its text to copy, that looks
// like a key or a secret: src/key-check.js, src/secret-rule.js). A pasted key is never shown in the first place (K1).
// Kept lines are never sent to the AI: they are not in the visit's log (src/live-request.js reads only that).
import { looksLikeKey } from './key-check.js'
import { looksSecret } from './secret-rule.js'

export const TALK_KEEP_MAX = 50
const TALK_TEXT_MAX = 2000
const talkStr = (v, max = TALK_TEXT_MAX) => (typeof v === 'string' && v.trim() && Array.from(v).length <= max ? v : null)
const talkUnsafe = s => typeof s === 'string' && (looksLikeKey(s) || looksSecret(s))

// One line of the conversation as it is kept, or null when it may not be kept.
export function talkKeepOne(e) {
  if (!e || (e.who !== 'you' && e.who !== 'helper')) return null
  const text = talkStr(e.text)
  if (!text || talkUnsafe(text)) return null
  if (e.who === 'you') return { who: 'you', text }
  // an offer's question is not kept: its picks were in the message box, and without them it would ask for nothing
  // (Decided myself, in the report)
  if (typeof e.line === 'string' && e.line.startsWith('offer-')) return null
  // loom-fixes-2 (Lead's answer): the slow-AI line belongs to its moment, not to the kept conversation
  if (e.line === 'SLOW_A') return null
  const out = { who: 'helper', text, line: talkStr(e.line, 120) || 'kept' }
  const n = e.next
  if (n && typeof n === 'object' && typeof n.label === 'string') {
    if (n.kind === 'paste' && talkStr(n.text) && !talkUnsafe(n.text)) out.next = { kind: 'paste', label: n.label, text: n.text }
    else if (n.kind === 'where' && talkStr(n.text)) out.next = { kind: 'where', text: n.text, line: talkStr(n.line, 120) || '' }
    else if (n.kind !== 'paste') out.next = { kind: talkStr(n.kind, 40) || 'line', label: n.label }
  }
  if (talkStr(e.paste) && !talkUnsafe(e.paste)) out.paste = e.paste
  if (e.docs && talkStr(e.docs.words)) out.docs = { head: talkStr(e.docs.head, 120) || '', words: e.docs.words, ...(talkStr(e.docs.where, 300) ? { where: e.docs.where } : {}) }
  if (Array.isArray(e.rows)) {
    const rows = e.rows.filter(r => talkStr(r, 300) && !talkUnsafe(r))
    if (rows.length) out.rows = rows
  }
  if (talkStr(e.hint, 300)) out.hint = e.hint
  return out
}

// The lines to store: the last TALK_KEEP_MAX of those that may be kept, or null when none. Nothing is stored until
// the person has said something (a page only opened stores nothing; Helper's opening line comes again anyway).
export function talkToStore(lines) {
  const kept = (Array.isArray(lines) ? lines : []).map(talkKeepOne).filter(Boolean).slice(-TALK_KEEP_MAX)
  return kept.some(e => e.who === 'you') ? kept : null
}

// The stored lines read back: anything unexpected is dropped (a record edited by hand or by an older build); each is
// marked restored, so its buttons are drawn as plain faint text.
export function talkFromStore(v) {
  if (!Array.isArray(v)) return []
  return v
    .map(talkKeepOne)
    .filter(Boolean)
    .slice(-TALK_KEEP_MAX)
    .map(e => ({ ...e, restored: true }))
}
