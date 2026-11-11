// Quote marks (talk v2 look, point 4; hhdesign's review of e86b410, point 4): in a line Helper or its settings
// page shows as words to read, a pair of straight double quotes is drawn as curly ones (“Bots”). Done where the
// line is drawn, never in the data. Never used on text to paste, the settings text box, anything the person
// typed (their messages, a kept thing in the list or a faint "Kept: ..." line, the line quoted back on the
// settings page), or anything that is matched or stored; tests/talk-look.test.mjs checks those four.
// A quote mark with no partner stays straight.
// Apostrophes (hhdesign's review of d1ceddc, section 3 point 3): in the same step, a straight ' between two
// letters is drawn as ’ (I’m, What’s, Helper’s), with the same four exceptions.
// asTyped: the person's own words filled into the line (a name such as O'Neil, lineFor's asTyped): left as typed.
const curlPart = s => s.replace(/"([^"\n]*)"/g, '\u201c$1\u201d').replace(/(\p{L})'(?=\p{L})/gu, '$1\u2019')
const typedRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function curlyQuotes(text, asTyped = []) {
  if (typeof text !== 'string') return text
  const keep = (Array.isArray(asTyped) ? asTyped : []).filter(s => typeof s === 'string' && /['"]/.test(s) && text.includes(s))
  if (!keep.length) return curlPart(text)
  let out = ''
  let at = 0
  for (const m of text.matchAll(new RegExp(keep.map(typedRe).join('|'), 'g'))) {
    out += curlPart(text.slice(at, m.index)) + m[0]
    at = m.index + m[0].length
  }
  return out + curlPart(text.slice(at))
}

// A name in curly marks with no space in it (a skill such as “email-inbox-triage”) is kept on one line with its
// marks (hhdesign's review of d1ceddc, section 3 point 1: it broke at its hyphen and read as two words), unless
// it is longer than NAME_WHOLE_MAX characters: then it may be wider than the bubble's text width at 360 px, and
// it breaks as before. The longest of the 186 skill names has 31 characters; its width in the app: see
// docs/build/talk-v2-c18-report.md. src/talk-view.js draws each { whole } part in a span with white-space:nowrap.
export const NAME_WHOLE_MAX = 31
const QUOTED_NAME = /\u201c([^\u201c\u201d\s]+)\u201d/g
// text already drawn by curlyQuotes -> null when no name in it is kept whole, else its parts in order: strings,
// and { whole: '“name”' } for each name kept whole
export function namesWhole(text) {
  if (typeof text !== 'string' || !text.includes('\u201c')) return null
  const parts = []
  let at = 0
  for (const m of text.matchAll(QUOTED_NAME)) {
    if (Array.from(m[1]).length > NAME_WHOLE_MAX) continue
    if (m.index > at) parts.push(text.slice(at, m.index))
    parts.push({ whole: m[0] })
    at = m.index + m[0].length
  }
  if (!parts.length) return null
  if (at < text.length) parts.push(text.slice(at))
  return parts
}

// Text the person is to type (talk-live-3; Lead's call on question 5 of the c18 report, 11 Nov 05:08): in a line that
// says "type" (the word, any case), a /command (a slash and letters, after a space or at the start, before a space, an
// end mark or the end) and a phrase in quote marks (straight or curly). src/reveal.js draws each in the paste box's
// code style (a quoted phrase keeps its marks, outside it), and its word-by-word pace takes a quoted phrase as one
// word (TYPED_PHRASE).
// A line that does not say "type" has none: "click “New session”" names a button, and "/home" may be a folder.
//   typedParts(text, typeLine) -> null, or the parts in order: strings (a phrase's quote marks among them), and
//   { typed: '/usage' } for each piece to type
//   typeLine: whether the whole line says "type" (a part of a line, as Said draws it, is judged by its whole line)
export const TYPE_WORD = /\btype\b/i
export const TYPED_PHRASE = /(["\u201c])([^"\u201c\u201d\n]+)(["\u201d])/g
const TYPED_RX = /(^|\s)(\/[a-z][a-z-]*)(?=$|[\s.,;:!?])|(["\u201c])([^"\u201c\u201d\n]+)(["\u201d])/g
export function typedParts(text, typeLine = TYPE_WORD.test(String(text))) {
  if (typeof text !== 'string' || !typeLine) return null
  const parts = []
  let at = 0
  for (const m of text.matchAll(TYPED_RX)) {
    const start = m[2] ? m.index + m[1].length : m.index
    if (start > at) parts.push(text.slice(at, start))
    // review: a quoted phrase keeps its quote marks, drawn outside the code style, so every reader still sees and
    // hears where it starts and ends
    if (m[2]) parts.push({ typed: m[2] })
    else parts.push(m[3], { typed: m[4] }, m[5])
    at = m.index + m[0].length
  }
  if (!parts.length) return null
  if (at < text.length) parts.push(text.slice(at))
  // neighbouring strings (a phrase's marks and the words beside them) as one
  return parts.reduce((out, p) => (typeof p === 'string' && typeof out[out.length - 1] === 'string' ? (out[out.length - 1] += p, out) : (out.push(p), out)), [])
}
