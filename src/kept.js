// The one stored record of what Helper keeps about the person (JSON keeps.storage), under the
// storage key 'kept': { name, mod, msg, svc, asked: [...], told }. Every field is optional.
// cleanKept() is how it is read back: anything unexpected is dropped, so a record edited by hand
// or written by an older build can never put something into Helper's lines that the rules would
// not keep. The page and the settings page do the reading and writing with their own storage
// calls (tests/state.test.mjs lists them); nothing here touches storage.
import { TALK_DATA } from './talk-data.js'
import { looksLikeKey } from './key-check.js'

const KEPT_DATA = TALK_DATA.keeps
const KEPT_MODS = KEPT_DATA.answers.mod.values.map(v => v.need)
const KEPT_APPS = new Set(Object.values(KEPT_DATA.answers.msg.names))
// A service is kept from the services named in keeps.answers, or from a picked answer's own service.
const KEPT_SERVICES = new Set([...Object.values(KEPT_DATA.answers.svc.names), ...TALK_DATA.topics.flatMap(t => t.question.answers.map(a => a.service).filter(Boolean))])
const KEPT_LIM = KEPT_DATA.remember.limits
const KEPT_NAME_MAX = 30
const keptPlain = (v, max) => typeof v === 'string' && v.trim() !== '' && Array.from(v).length <= max && !looksLikeKey(v)

export function cleanKept(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out = {}
  if (keptPlain(v.name, KEPT_NAME_MAX)) out.name = v.name
  if (KEPT_MODS.includes(v.mod)) out.mod = v.mod
  if (KEPT_APPS.has(v.msg)) out.msg = v.msg
  if (KEPT_SERVICES.has(v.svc)) out.svc = v.svc
  if (Array.isArray(v.asked)) {
    const asked = v.asked.filter(t => keptPlain(t, KEPT_LIM.max_chars)).slice(0, KEPT_LIM.max_things)
    if (asked.length) out.asked = asked
  }
  if (Object.keys(out).length && v.told === true) out.told = true
  return out
}

export const hasKept = kept => ['name', 'mod', 'msg', 'svc'].some(k => kept[k]) || (kept.asked || []).length > 0

// What goes to storage: the cleaned record, or null when nothing is left (then the key is removed,
// told with it, as "Forget all" does).
export function keptToStore(kept) {
  const clean = cleanKept(kept)
  return hasKept(clean) ? clean : null
}
