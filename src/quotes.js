// Quote marks (talk v2 look, point 4; hhdesign's review of e86b410, point 4): in a line Helper or its settings
// page shows as words to read, a pair of straight double quotes is drawn as curly ones (“Bots”). Done where the
// line is drawn, never in the data. Never used on text to paste, the settings text box, anything the person
// typed (their messages, a kept thing in the list or a faint "Kept: ..." line, the line quoted back on the
// settings page), or anything that is matched or stored; tests/talk-look.test.mjs checks those four.
// A quote mark with no partner stays straight.
// Apostrophes (hhdesign's review of d1ceddc, section 3 point 3): in the same step, a straight ' between two
// letters is drawn as ’ (I’m, What’s, Helper’s), with the same four exceptions.
export function curlyQuotes(text) {
  return typeof text === 'string' ? text.replace(/"([^"\n]*)"/g, '\u201c$1\u201d').replace(/(\p{L})'(?=\p{L})/gu, '$1\u2019') : text
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
