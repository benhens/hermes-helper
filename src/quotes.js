// Quote marks (talk v2 look, point 4; hhdesign's review of e86b410, point 4): in a line Helper or its settings
// page shows as words to read, a pair of straight double quotes is drawn as curly ones (“Bots”). Done where the
// line is drawn, never in the data. Never used on text to paste, the settings text box, anything the person
// typed (their messages, a kept thing in the list or a faint "Kept: ..." line, the line quoted back on the
// settings page), or anything that is matched or stored; tests/quotes.test.mjs checks those four.
// A quote mark with no partner stays straight.
export function curlyQuotes(text) {
  return typeof text === 'string' ? text.replace(/"([^"\n]*)"/g, '\u201c$1\u201d') : text
}
