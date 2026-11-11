// The one stored record of what Helper keeps about the person (JSON keeps.storage), under the
// storage key 'kept': { name, work, mod, msg, svc, asked: [...], told, told_work } (live-v2 changes-4: work, what the
// person does, and told_work, the line that the AI is told it was shown). Every field is optional.
// cleanKept() is how it is read back: anything unexpected is dropped, so a record edited by hand
// or written by an older build can never put something into Helper's lines that the rules would
// not keep. The page and the settings page do the reading and writing with their own storage
// calls (tests/state.test.mjs lists them); nothing here touches storage.
import { TALK_DATA } from './talk-data.js'
import { SETUP_DATA } from './setup-data.js'
import { looksLikeKey } from './key-check.js'
import { looksSecret } from './secret-rule.js'

const KEPT_DATA = TALK_DATA.keeps
const KEPT_MODS = KEPT_DATA.answers.mod.values.map(v => v.need)
const KEPT_APPS = new Set(Object.values(KEPT_DATA.answers.msg.names))
// A service is kept from the services named in keeps.answers, or from a picked answer's own service.
const KEPT_SERVICES = new Set([...Object.values(KEPT_DATA.answers.svc.names), ...TALK_DATA.topics.flatMap(t => t.question.answers.map(a => a.service).filter(Boolean))])
const KEPT_LIM = KEPT_DATA.remember.limits
const KEPT_NAME_MAX = 30
// live-v2 changes-4 (keeps.work.limits): what the person does, as kept: 1 to 12 words, at most 80 characters, no
// question mark, no key, and (unless the caller checked it already) nothing that looks secret. The same rule for the
// keep in the conversation, the stored record, the settings page and the guard before it is sent (input.work_line).
const KEPT_WORK = KEPT_DATA.work.limits
export const workSqueeze = s => String(s).replace(/\s+/g, ' ').trim()
export function workOk(v, { withSecretRule = true } = {}) {
  if (typeof v !== 'string' || !v.trim()) return false
  const words = v.trim().split(/\s+/).length
  if (words < KEPT_WORK.min_words || words > KEPT_WORK.max_words || Array.from(v).length > KEPT_WORK.max_chars) return false
  if (v.includes('?') || looksLikeKey(v)) return false
  return !withSecretRule || !looksSecret(v)
}
const keptPlain = (v, max) => typeof v === 'string' && v.trim() !== '' && Array.from(v).length <= max && !looksLikeKey(v)

const KEPT_SETUP_NEW = SETUP_DATA.questions.Q_NEW.answers.filter(a => a.kept_as).map(a => a.id)
const KEPT_SETUP_GOALS = SETUP_DATA.questions.Q_GOAL.answers.map(a => a.id)
const KEPT_SETUP_ITEMS = SETUP_DATA.rule_order

export function cleanKept(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out = {}
  if (keptPlain(v.name, KEPT_NAME_MAX)) out.name = v.name
  if (workOk(v.work)) out.work = v.work
  if (KEPT_MODS.includes(v.mod)) out.mod = v.mod
  if (KEPT_APPS.has(v.msg)) out.msg = v.msg
  if (KEPT_SERVICES.has(v.svc)) out.svc = v.svc
  if (Array.isArray(v.asked)) {
    const asked = v.asked.filter(t => keptPlain(t, KEPT_LIM.max_chars)).slice(0, KEPT_LIM.max_things)
    if (asked.length) out.asked = asked
  }
  // setup-chat (content/helper-setup-chat-v1.json keeps.rows): the Q_NEW answer, what the person wants (a picked label
  // or a typed text that passes the What you do rule) with its goal, the things said done, the thing recommended last
  if (KEPT_SETUP_NEW.includes(v.setup_new)) out.setup_new = v.setup_new
  if (KEPT_SETUP_GOALS.includes(v.setup_goal_id) && workOk(v.setup_goal)) {
    out.setup_goal = v.setup_goal
    out.setup_goal_id = v.setup_goal_id
  }
  if (Array.isArray(v.setup_done_said)) {
    const said = [...new Set(v.setup_done_said.filter(x => KEPT_SETUP_ITEMS.includes(x)))]
    if (said.length) out.setup_done_said = said
  }
  if (KEPT_SETUP_ITEMS.includes(v.setup_current) || v.setup_current === 'model') out.setup_current = v.setup_current
  if (Object.keys(out).length && v.told === true) out.told = true
  if ((out.work || out.setup_new || out.setup_goal) && v.told_work === true) out.told_work = true
  return out
}

export const hasKept = kept => ['name', 'work', 'mod', 'msg', 'svc', 'setup_new', 'setup_goal', 'setup_current'].some(k => kept[k]) || (kept.asked || []).length > 0 || (kept.setup_done_said || []).length > 0

// What goes to storage: the cleaned record, or null when nothing is left (then the key is removed,
// told with it, as "Forget all" does).
export function keptToStore(kept) {
  const clean = cleanKept(kept)
  return hasKept(clean) ? clean : null
}
