// Helper's settings page as a short file (content/helper-settings-edit-v1.md; JSON
// keeps.settings_file): the box Helper writes from the stored record, and how a box the person
// edited is read back on Save. Ported from hhcontent's settings_read.py, rule for rule; no model.
// tests/settings-file.test.mjs runs every case of hhcontent's tests.json and the Builder's own
// boxes through both, and the results must be the same.
//   renderKept(record)            the box text: one line per kept thing, with Helper's reasons
//   readBox(box)                  { result: 'read', record } or { result: 'refused', line, why, message }
//   saveBox(stored, box, answer)  steps 14 and 15: { result: 'saved' | 'refused' | 'ask' | 'not_saved', ... }
//                                 answer: undefined (not asked yet), 'yes' or 'no'
// Nothing here touches storage: the page writes `stored` when the result is 'saved'.
import { TALK_DATA } from './talk-data.js'
import { looksSecret } from './secret-rule.js'

const KEEPS_DATA = TALK_DATA.keeps
const FILE_SF = KEEPS_DATA.settings_file
const FILE_R = FILE_SF.read
const FILE_M = FILE_R.messages
const FILE_WHY = FILE_SF.why
const FILE_BL = FILE_SF.box_lines
const FILE_LIM = KEEPS_DATA.remember.limits
const FILE_MOD_IN = { chatgpt: 'mod1', claude: 'mod2', neither: 'mod4', free: 'mod3' }
const FILE_MOD_OUT = Object.fromEntries(Object.entries(FILE_BL.mod.values).map(([word, need]) => [need, word]))
function fileNamesOf(topic) {
  const n = { ...KEEPS_DATA.answers[topic].names }
  for (const v of Object.values(n)) n[v.toLowerCase()] = v
  return n
}
const FILE_NAMES = { msg: fileNamesOf('msg'), svc: fileNamesOf('svc') }
const FILE_LABEL_OF = Object.fromEntries(Object.entries(FILE_R.labels).flatMap(([key, labels]) => labels.map(l => [l, key])))
const FILE_SINGLE = ['name', 'mod', 'msg', 'svc']
// Python's [^\W\d_]: a letter (and the few number signs that are not digits).
const FILE_LETTER = /[\p{L}\p{Nl}\p{No}]/u
const FILE_NAME_CHARS = /^(?:[\p{L}\p{Nl}\p{No}]|[ '.-])+$/u
const fileSqueeze = s => s.replace(/\s+/g, ' ').trim()
const fileLen = s => Array.from(s).length

// changes-12: read step 4, the secret rule (src/secret-rule.js, keeps.remember.refuse.rule_12) on the whole line
// and on the part after its first colon (settings_read.py secret()).
function fileSecret(line) {
  const at = line.indexOf(':')
  return looksSecret(line) !== null || (at >= 0 && looksSecret(line.slice(at + 1)) !== null)
}

// write_rules: one line per kept thing, in Helper's order; Remember lines in the order kept.
export function renderKept(rec) {
  const out = []
  for (const key of FILE_SF.order) {
    if (key === 'asked') for (const t of rec.asked || []) out.push(`${FILE_BL.asked.label}: ${t} (${FILE_BL.asked.reason})`)
    else if (rec[key]) out.push(`${FILE_BL[key].label}: ${key === 'mod' ? FILE_MOD_OUT[rec[key]] : rec[key]} (${FILE_BL[key].reason})`)
  }
  return out.join('\n')
}

function fileRefuse(n, why, line, fill = {}) {
  let q = line.trim()
  q = fileLen(q) <= FILE_R.quote_max_chars ? q : Array.from(q).slice(0, FILE_R.quote_max_chars).join('').trimEnd() + '...'
  let w = FILE_WHY[why]
  for (const [k, v] of Object.entries(fill)) w = w.split(`{${k}}`).join(v)
  return { result: 'refused', line: n, why, message: [FILE_M.cannot_read.replace('{n}', String(n)), FILE_M.quote.replace('{line}', q), w] }
}

// Steps 1 to 13: all or nothing; the first line that fails stops the reading.
export function readBox(box) {
  if (fileLen(box) > FILE_R.max_box_chars) return { result: 'refused', line: null, why: 'too_much', message: [FILE_M.too_much] }
  const rec = {}
  const asked = []
  const lines = box.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1
    const line = lines[i].replace(/\r/g, '')
    if (!line.trim()) continue
    if (fileSecret(line)) return { result: 'refused', line: n, why: 'secret', message: [FILE_M.secret_line.replace('{n}', String(n))] }
    const body = line.replace(/^\s*[-*\u2022]\s*/, '')
    const at = body.indexOf(':')
    if (at < 0) return fileRefuse(n, 'no_label', line)
    const key = FILE_LABEL_OF[fileSqueeze(body.slice(0, at).toLowerCase())]
    if (!key) return fileRefuse(n, 'no_label', line)
    let val = fileSqueeze(body.slice(at + 1))
    if (key === 'asked') {
      const reason = '(' + FILE_BL.asked.reason + ')'
      if (val.toLowerCase().endsWith(reason.toLowerCase())) val = val.slice(0, val.length - reason.length).trim()
      else if (val.endsWith(')') && val.includes('(')) return fileRefuse(n, 'remember_bracket', line)
    } else val = val.replace(/\s*\([^()]*\)\s*$/, '').trim()
    if (!val) return fileRefuse(n, 'empty', line)
    if (FILE_SINGLE.includes(key) && key in rec) return fileRefuse(n, 'twice', line, { label: FILE_BL[key].label })
    if (key === 'name') {
      if (fileLen(val) > 30 || !FILE_NAME_CHARS.test(val) || !FILE_LETTER.test(val)) return fileRefuse(n, 'name_value', line)
      rec.name = val
    } else if (key === 'mod') {
      const m = FILE_MOD_IN[val.toLowerCase().replace(/ /g, '')]
      if (!m) return fileRefuse(n, 'mod_value', line)
      rec.mod = m
    } else if (key === 'msg' || key === 'svc') {
      const v = FILE_NAMES[key][val.toLowerCase()]
      if (!v) return fileRefuse(n, key + '_value', line)
      rec[key] = v
    } else {
      const words = val.split(/\s+/).filter(Boolean).length
      if (words < FILE_LIM.min_words) return fileRefuse(n, 'remember_short', line)
      if (words > FILE_LIM.max_words || fileLen(val) > FILE_LIM.max_chars) return fileRefuse(n, 'remember_long', line)
      if (asked.some(a => a.toLowerCase() === val.toLowerCase())) return fileRefuse(n, 'same_twice', line)
      if (asked.length >= FILE_LIM.max_things) return fileRefuse(n, 'too_many', line)
      asked.push(val)
    }
  }
  if (asked.length) rec.asked = asked
  return { result: 'read', record: rec }
}

// How many kept things Save would forget: the single ones gone, and Remember lines fewer than before.
export function forgetCount(old, next) {
  const n = FILE_SINGLE.filter(k => old[k] && !next[k]).length
  return n + Math.max(0, (old.asked || []).length - (next.asked || []).length)
}

// Steps 14 and 15. The forget question comes first when Save would forget something; No saves
// nothing and leaves the box as typed. A record with no values is removed whole (told too).
export function saveBox(stored, box, answer) {
  const r = readBox(box)
  if (r.result === 'refused') return { ...r, stored, box }
  const next = r.record
  const n = forgetCount(stored, next)
  if (n && answer == null) {
    const question = n === 1 ? FILE_SF.would_delete.question_one : FILE_SF.would_delete.question.replace('{n}', String(n))
    return { result: 'ask', question, count: n, stored, box }
  }
  if (n && answer === 'no') return { result: 'not_saved', stored, box }
  let kept = {}
  if ([...FILE_SINGLE, 'asked'].some(k => next[k])) {
    kept = { ...next }
    if (stored.told) kept.told = true
  }
  return { result: 'saved', message: [FILE_M.saved], stored: kept, box: renderKept(kept) }
}
