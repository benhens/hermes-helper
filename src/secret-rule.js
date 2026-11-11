// Does a text look like it holds a secret? hhcontent's changes-12 rule (with changes-13's data lines), ported
// rule for rule from dev/checks/hhcontent-talk-v2/secret_rule.py (looks_secret), fixed rules, no model. The
// lists come from the talk data (keeps.remember.refuse; the rule in plain words: refuse.rule_12).
// Used by "remember that ..." (src/talk.js, after the K1 check, before the "too long" check) and by every line
// of the settings box (src/settings-file.js: the whole line and the part after its first colon). Names keep
// the old word list (refuse.words), not this rule.
// tests/secret-rule.test.mjs puts refuse_tests.py's cases, three sets of made-up secrets and a few thousand
// random strings to both and compares each result.
//   looksSecret(text)  null (not a secret by these rules) or the Python's reason, such as "secret word and a value"
// Python's idea of a letter is \p{L} here, of a digit \p{N} (Lead: "a letter and a digit must be \p{L} and \p{N}");
// Python's str.isdigit() differs on a few signs that are numbers but not digits (½, Ⅳ): the port counts them,
// the Python does not (a test lists it).
// The build joins every src file into one scope, so every name here starts with SR_ or sr.
import { TALK_DATA } from './talk-data.js'
import { KEY_PATTERNS } from './key-check.js'

const SR_RF = TALK_DATA.keeps.remember.refuse
const SR_V = SR_RF.value
const SR_WR = SR_RF.word_run

// Python's whitespace (str.split, str.strip, \s on text): JavaScript's \s without U+FEFF, with U+001C to U+001F
// and U+0085.
const SR_WS = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const SR_WS_RUN = new RegExp(`[${SR_WS}]+`, 'gu')
const SR_WS_EDGE = new RegExp(`^[${SR_WS}]+|[${SR_WS}]+$`, 'gu')
const srSplit = s => s.split(SR_WS_RUN).filter(Boolean)
const srStrip = s => s.replace(SR_WS_EDGE, '')

// A pattern from the data, written for Python's re, as a JavaScript RegExp with the u flag: \d is any decimal
// digit and \s Python's whitespace, as in Python on text. Exported for the tests (every pattern must compile).
export function pyRegExp(pattern, flags = '') {
  let out = ''
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') {
      const n = pattern[++i]
      if (n === 'd') out += '\\p{Nd}'
      else if (n === 's') out += inClass ? SR_WS : `[${SR_WS}]`
      else out += '\\' + n
    } else {
      if (c === '[' && !inClass) inClass = true
      else if (c === ']' && inClass) inClass = false
      out += c
    }
  }
  return new RegExp(out, 'u' + flags)
}

const srEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const srChars = s => Array.from(s)
// Strips any of the signs in `set` from both ends (Python's str.strip(set)).
function srStripSet(s, set) {
  const a = srChars(s)
  let i = 0
  let j = a.length
  while (i < j && set.includes(a[i])) i++
  while (j > i && set.includes(a[j - 1])) j--
  return a.slice(i, j).join('')
}

// taken off both ends of a token before it is compared with a word (step 2)
const SR_EDGE = '"\'()[]{},.;!?'
const srLow = s => srStrip(s.toLowerCase().replace(/\u2018/g, "'").replace(/\u2019/g, "'").replace(SR_WS_RUN, ' '))
// step 2: ':' followed by a space (or the end) and '=' become tokens of their own
const SR_COLON = new RegExp(`:(?=[${SR_WS}]|$)`, 'gu')
const srTokens = s => srSplit(s.replace(SR_COLON, ' : ').split('=').join(' = '))
const srBare = tok => srStripSet(tok, SR_EDGE).toLowerCase()

// one letter added, missing, changed, or two neighbours swapped
function srOneOff(x, y) {
  if (x === y) return true
  let a = srChars(x)
  let b = srChars(y)
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const d = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d.push(i)
    return d.length === 1 || (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]])
  }
  if (a.length > b.length) [a, b] = [b, a]
  const short = a.join('')
  for (let i = 0; i < b.length; i++) if (b.slice(0, i).concat(b.slice(i + 1)).join('') === short) return true
  return false
}

const SR_NOT_VALUES = SR_V.not_values.map(p => pyRegExp(p))
const SR_LETTER = /\p{L}/u
const SR_DIGIT = /\p{N}/u
// step 3: a value is one run with no spaces that has enough digits, or letters with digits, or a sign
function srIsValue(tok) {
  const t = srStripSet(tok, '"\'(),.;')
  const a = srChars(t)
  if (a.length < SR_V.min_chars) return false
  if (SR_NOT_VALUES.some(re => re.test(t))) return false
  const digits = a.filter(c => SR_DIGIT.test(c)).length
  const letters = a.filter(c => SR_LETTER.test(c)).length
  return (
    digits >= SR_V.digits_alone ||
    (letters > 0 && digits >= SR_V.digits_with_letters && a.length >= SR_V.min_chars_with_letters) ||
    (a.some(c => SR_V.signs.includes(c)) && (letters > 0 || digits > 0))
  )
}

// positions just after each whole-word match of any of the words (multi-word words too)
function srFind(words, toks) {
  const b = toks.map(srBare)
  const out = []
  for (const w of words) {
    const ws = srSplit(w)
    const k = ws.length
    for (let i = 0; i < b.length - k + 1; i++) if (ws.every((x, n) => b[i + n] === x)) out.push(i + k)
  }
  return out
}
const srFindTypo = toks => toks.flatMap((t, i) => (srChars(srBare(t)).length >= SR_RF.typo_min_letters && SR_RF.typo_words.some(w => srOneOff(srBare(t), w)) ? [i + 1] : []))

const SR_DIGITS_RUN = pyRegExp(SR_RF.digits_pattern)
const SR_PHRASES = SR_RF.not_secret_phrases.map(p => new RegExp('(?<![a-z0-9])' + srEscape(p) + '(?![a-z0-9])', 'gu'))
const SR_WORD = pyRegExp(`^(?:${SR_WR.word})$`)
const SR_LINKS = new Set([...SR_RF.link_words, ':', '='])

export function looksSecret(text) {
  if (KEY_PATTERNS.some(re => re.test(text))) return 'key pattern'
  if (SR_DIGITS_RUN.test(text)) return 'long number'
  let t = ' ' + srLow(text) + ' '
  for (const re of SR_PHRASES) t = t.replace(re, ' ~ ') // step 1
  const toksCut = srTokens(t)
  const toks = srTokens(text)
  const hasValue = toks.some(srIsValue)
  const strong = srFind(SR_RF.secret_words, toksCut).concat(srFindTypo(toksCut))
  if (strong.length && hasValue) return 'secret word and a value' // step 4
  // step 5: a secret word, then within a few words 'is' or ':' and something that is not a description
  for (const end of strong) {
    for (let j = end; j < Math.min(end + SR_RF.link_within + 1, toksCut.length); j++) {
      if (SR_LINKS.has(srBare(toksCut[j])) || toksCut[j] === ':' || toksCut[j] === '=') {
        if (j + 1 < toksCut.length && !SR_RF.after_link_not_value.includes(srBare(toksCut[j + 1]))) return 'secret word, is, and a word'
        break
      }
    }
  }
  if (srFind(SR_RF.maybe_words, toksCut).length && hasValue) return 'maybe word and a value' // step 6
  // step 7: a short label, 'is' or ':', one value at the end
  for (let j = 1; j <= Math.min(SR_RF.shape.max_label_words, toks.length - 1); j++) {
    if ((toks[j] === ':' || toks[j] === '=' || SR_RF.link_words.includes(srBare(toks[j]))) && j === toks.length - 2 && srIsValue(toks[toks.length - 1])) return 'label, is, and a value'
  }
  // step 8: many plain words in a row (recovery words)
  let run = 0
  for (const x of toks) {
    const x2 = srStripSet(x, ',.;')
    if (SR_WORD.test(x2) && !SR_WR.not_these.includes(x2.toLowerCase())) {
      run += 1
      if (run >= SR_WR.min_words) return 'many plain words in a row'
    } else run = 0
  }
  return null
}
