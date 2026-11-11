// The set-up conversation (setup-chat; content/helper-setup-chat-v1.json, the content team's): after "What do you
// do?" Helper asks two questions (Q_NEW, Q_GOAL), looks at what is set up, recommends one thing by a fixed rule
// (R1 to R5), gives its steps one at a time, and picks up where it left off on the next visit.
// Pure code: no React, no Hermes, no AI. What Hermes holds is read by src/setup-look.js and handed in as `seen`:
//   seen = { model: 'ok' | 'not' | 'unread', soul: true | false | null, jobs: number | null, bots: number | null }
//   (null = that read failed: Helper then says it couldn't read it, never a guess)
// Every word said here is the team's (src/setup-data.js, made by the build from its two files).
// What is kept between visits (the visit's kept record, src/kept.js): setup_new (the Q_NEW answer id), setup_goal (the
// label or the typed text) with setup_goal_id, setup_done_said (the things the person said are done), setup_current
// (the thing last recommended). Not kept: Skip, Not sure yet, what the look saw, Something else.
import { SETUP_DATA } from './setup-data.js'
import { TALK_DATA } from './talk-data.js'
import { talkNorm, whichOf, startsWith, smallTalk, freshVisit } from './talk.js'
import { workOk, workSqueeze } from './kept.js'
import { looksLikeKey } from './key-check.js'
import { LIVE_DATA } from './live-data.js'
import { AI_MODE } from './ai-mode.js'
import { SETUP_AI_BUILT } from './setup-built.js'
import { hereStop } from './setup-reads.js'
import { DASH_DATA } from './dash-data.js'
// the path's stops in order (the Dashboard's), for the one "You are here" rule
const SU_PATH_OF = () => DASH_DATA.items.map(it => it.id)

const SU = SETUP_DATA
const SU_L = SU.lines
const SU_P = SU.look.parts
export const SETUP_ITEMS = SU.items
const SU_Q_NEW = SU.questions.Q_NEW
const SU_Q_GOAL = SU.questions.Q_GOAL
const suFill = (text, slots) => text.replace(/\{([a-z_]+)\}/g, (m, k) => (slots[k] !== undefined ? slots[k] : m))

/* ---------- the rule (hhcontent's build.py, choose) ---------- */
// model: ok | not | unread; isNew: new | some | well | skip; goal: schedule | phone | bots | unsure;
// done: the ids done (seen by a read, said by the person, or Something else in this visit). Returns [item, rule].
export function choose(model, isNew, goal, done) {
  const has = id => (done instanceof Set ? done.has(id) : done.includes(id))
  if (model === 'not') return ['model', 'R1']
  if ((isNew === 'new' || isNew === 'skip') && !has('first_chat')) return ['first_chat', 'R2']
  const g = SU.goal_item[goal]
  if (g && !has(g)) return [g, 'R3']
  for (const it of SU.rule_order) {
    if (it === 'first_chat' && (isNew === 'some' || isNew === 'well')) continue
    if (!has(it)) return [it, 'R4']
  }
  return [null, 'R5']
}
const suReasonId = (rule, isNew, goal) => (rule === 'R1' ? 'R1' : rule === 'R2' ? (isNew === 'new' ? 'R2_new' : 'R2_skip') : rule === 'R3' ? 'R3_' + goal : 'R4')
// The written recommendation, without "Want the steps?" (build.py rec_text)
export const recText = (item, rule, isNew, goal) => suFill(SU_L.REC.text, { reason: SU.reasons[suReasonId(rule, isNew, goal)], card: SU.items[item].name, why: SU.items[item].why }).replace(/ Want the steps\?$/, '')
const SU_REC_TAIL = SU_L.REC.text.match(/ (Want the steps\?)$/)[1]

/* ---------- the look, as words ---------- */
const suJobsPart = n => (n === null ? SU_P.read_failed : n === 0 ? SU_P.scheduled_job_not : suFill(n === 1 ? SU_P.scheduled_job_done : SU_P.scheduled_job_done_plural, { n }))
const suBotsPart = n => (n === null ? SU_P.read_failed : n < 2 ? SU_P.second_bot_not : suFill(SU_P.second_bot_done, { n }))
const suSoulPart = s => (s === null ? SU_P.read_failed : s ? SU_P.personality_done : SU_P.personality_not)
const suModelPart = m => ({ ok: SU_P.model_ok, not: SU_P.model_not, unread: SU_P.model_unread, slow: SU_P.model_slow })[m]
// find-v2 (live-v2 changes-13 look.model_rule; Lead, 11 Nov 11:40): what is said of the model. seen.model is what the
// check of the settings found (ok, not, unread) and still drives the recommendation; seen.modelSaid, when the page
// gives one, is what Helper saw the AI do: ok only when an answer came (src/page.js modelSaidOf). build.py's own lines
// (no modelSaid) are said as before.
const suModelSaid = seen => suModelPart(seen.modelSaid || seen.model)
// SEEN: "I looked at your Hermes." + the model part + the goal part (build.py seen_line)
export function seenLine(seen, goal) {
  const g = SU.goal_item[goal] || 'personality'
  const part = g === 'chat_apps' ? SU_P.chat_apps_cannot : g === 'scheduled_job' ? suJobsPart(seen.jobs) : g === 'second_bot' ? suBotsPart(seen.bots) : suSoulPart(seen.soul)
  return [SU_P.LOOK_OPEN, suModelSaid(seen), part].join(' ')
}
// What a read says about one thing: true (done), false (not done), null (the read failed), undefined (cannot be seen)
export function seenDone(item, seen) {
  if (item === 'model') return seen.model === 'unread' ? null : seen.model === 'ok'
  if (item === 'scheduled_job') return seen.jobs === null ? null : seen.jobs >= 1
  if (item === 'second_bot') return seen.bots === null ? null : seen.bots >= 2
  if (item === 'personality') return seen.soul
  // loom-fixes: Chat apps and First chat as the Dashboard reads them (src/setup-look.js); undefined: not read here
  if (item === 'chat_apps') return seen.chat
  if (item === 'first_chat') return seen.firstChat
  return undefined
}
// the things the look can see done: the data's four, and since loom-fixes Chat apps and First chat. Only the data's
// four have words for "I can see it now" (look.parts), so only they are said as seen; the other two count as done.
const SU_SEEN_ALSO = ['chat_apps', 'first_chat']
const suSaysSeen = item => SU.seeable.includes(item)
// "I can see it now. {seen_part}" (build.py seen_part)
const suSeenPart = (item, seen) => (item === 'scheduled_job' ? suJobsPart(seen.jobs) : item === 'second_bot' ? suBotsPart(seen.bots) : item === 'personality' ? SU_P.personality_done : suModelSaid({ ...seen, model: 'ok' }))
// The six lines behind "What did you look at?"
export function lookList(seen) {
  const yn = v => (v === null ? "couldn't check" : v ? 'yes' : 'no')
  const n = v => (v === null ? "couldn't check" : String(v))
  const [a, b, c, d, e, f] = SU.look.list
  return [a, b.replace(/\{[^}]*\}/, seen.model === 'unread' ? "couldn't check" : seen.model === 'ok' ? 'yes' : 'no'), c.replace(/\{[^}]*\}/, yn(seen.soul)), d.replace('{n}', n(seen.jobs)), e.replace('{n}', n(seen.bots)), f]
}
// The things done: seen by a read, said by the person (kept), Something else in this visit
export function doneSet(st, seen) {
  const done = new Set([...(st.kept.setup_done_said || []), ...((st.setup && st.setup.other) || [])])
  for (const it of [...SU.seeable, ...SU_SEEN_ALSO]) if (seenDone(it, seen) === true) done.add(it)
  return done
}

/* ---------- what Helper says, in the page's shape ---------- */
const SU_HINT = TALK_DATA.answers.hint_under_question
const suSaid = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null, ...more })
// things to pick: [action, label]; the page hands the action back to setupPress
const suPicks = pairs => ({ kind: 'setup', hint: SU_HINT, items: pairs.map(([action, label]) => ({ id: 'setup-' + action, label, setup: action })) })
const suNEW_PICKS = () => suPicks(SU_Q_NEW.answers.map(a => ['new:' + a.id, a.label]))
const suGOAL_PICKS = () => suPicks(SU_Q_GOAL.answers.map(a => ['goal:' + a.id, a.label]))
const suREC_PICKS = labels => suPicks(['rec:steps', 'rec:already', 'rec:other', 'rec:notnow'].map((a, i) => [a, labels[i]]))
const suNamed = (line, name, slots = {}) => (name ? suFill(line.text, { ...slots, name }) : suFill(line.text_no_name, slots))
const suOf = st => (st.setup = st.setup || { stage: null, item: null, step: 0, other: [], reasked: {}, asked: {} })
// the faint "Kept: ..." line under a line (the page strikes it when the thing is no longer kept)
// live changes-6 (lines_by_mode.first_time_grey.setup_told): under the first Kept: line of what goes to the AI (what
// you do, new to Hermes, what you want), once: "Your AI also gets ...". Only in a build that sends them.
const SU_TOLD = SETUP_AI_BUILT ? LIVE_DATA.lines_by_mode.setup_told[AI_MODE] : null
const suKeptNote = (st, key, words, value) => {
  const told = SU_TOLD && !st.kept.told_work ? { workTold: SU_TOLD } : {}
  if (told.workTold) st.kept.told_work = true
  return { text: words, link: TALK_DATA.keeps.tell.link.words, first: null, items: [[key, value]], ...told }
}
const SU_KEPT_LINE = Object.fromEntries(SU.keeps.map(k => [k.key, k.kept_line]))

/* ---------- the lines that open it ---------- */
// F2, F3, WORK_SECRET, WORK_LONG_2 with the set-up conversation built: the team's new text and the Q_NEW answers
// (src/talk.js lineFor calls this for those four)
export function openQNew(kind, st) {
  const s = suOf(st)
  s.stage = 'new'
  s.asked.new = true
  return { text: kind === 'F2' ? suNamed(SU_L.F2, st.name || st.kept.name || null) : SU_L[kind].text, answers: suNEW_PICKS() }
}

/* ---------- typed answers ---------- */
const suFlat = text => talkNorm(text).replace(/[ ?!.,]+$/, '')
const suInList = (t, list) => whichOf(t, list).length > 0
function suTypedNew(text) {
  const t = suFlat(text)
  for (const k of SU_Q_NEW.typed.order) if (suInList(t, SU_Q_NEW.typed.lists[k])) return k
  return 'skip'
}
function suTypedGoal(text) {
  const t = suFlat(text)
  for (const k of SU_Q_GOAL.typed.order) if (suInList(t, SU_Q_GOAL.typed.lists[k])) return k
  return 'unsure'
}
export const isRestart = text => suInList(suFlat(text), SU.restart_phrases)
// loom-fixes (helper-setup-chat-v1.json typed_answer; route2.py setup_typed): a message typed at Q_NEW or Q_GOAL is
// kept as the answer only when it reads as one. Not an answer, never kept: a question (a question mark, or one of
// question_starts at the start), a request to Helper (request_starts at the start, or request_words anywhere), or
// small talk (the talk data's small-talk kinds the rule names, read as in a fresh visit). Restart words come first
// (setupTyped). His "can we start from the begining" was kept as his goal (Loom 1:56).
const SU_TA = SU.typed_answer
export function notAnAnswer(text) {
  const t = suFlat(text)
  if (String(text).includes('?')) return true
  if (startsWith(t, SU_TA.question_starts) || startsWith(t, SU_TA.request_starts) || suInList(t, SU_TA.request_words)) return true
  return SU_TA.small_talk_kinds.includes(smallTalk(text, freshVisit('open')))
}
export const isSetupAsk = text => suInList(suFlat(text), SU.ask_phrases)
const suLabelOf = (answers, text) => answers.findIndex(a => suFlat(a) === suFlat(text))
const SU_STEP_NEXT = ['next', 'done', 'what next', 'ok', 'okay', 'did it', 'yes', 'now what']
const SU_REC_YES = ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'show me', 'steps', 'go on', 'please']
const SU_UNSURE = ['skip', 'not sure', 'not sure yet', "i'm not sure", 'im not sure', "i don't know", 'i dont know', "don't know", 'dont know', 'no idea', 'nothing']
const SU_REC_NO = ['no', 'not now', 'later', 'stop', 'nope']

/* ---------- the moves ---------- */
// Each move is { look: whether the page must read Hermes first, go(seen) -> the lines Helper says }.
// seen may be null when look is false.
const suMove = (look, go) => ({ look, go })

function suRecommend(st, seen, lead = []) {
  const s = suOf(st)
  const isNew = st.kept.setup_new || 'skip'
  const goal = st.kept.setup_goal_id || s.goal || 'unsure'
  const [item, rule] = choose(seen.model, isNew, goal, doneSet(st, seen))
  if (!item) {
    s.stage = null
    s.item = null
    delete st.kept.setup_current
    return [...lead, suSaid('ALL_DONE', SU_L.ALL_DONE.text, { setupOffer: SU_L.ALL_DONE.offer })]
  }
  s.stage = 'rec'
  s.item = item
  s.rule = rule
  st.kept.setup_current = item
  // rec: what the AI step may reword (src/setup-rec.js): the written text stands unless a checked reply replaces it
  return [...lead, suSaid('REC', recText(item, rule, isNew, goal) + ' ' + SU_REC_TAIL, { answers: suREC_PICKS(SU_L.REC.answers), rec: { item, rule, isNew, goal } })]
}
// the open step's three answers (the last step's on the last step)
function suStepPicks(st) {
  const s = suOf(st)
  const last = s.step === SU.items[s.item].steps.length - 1
  const labels = last ? SU_L.STEP.last_step_answers : SU_L.STEP.answers
  const acts = last ? ['step:worked', 'step:stuck', 'step:stop'] : ['step:done', 'step:stuck', 'step:stop']
  return suPicks(acts.map((a, i) => [a, labels[i]]))
}
const suStepSlots = s => ({ n: s.step + 1, total: SU.items[s.item].steps.length, step: SU.items[s.item].steps[s.step] })
function suStepLine(st) {
  const s = suOf(st)
  s.stage = 'step'
  s.stepHidden = false
  return suSaid('STEP', suFill(SU_L.STEP.text, suStepSlots(s)), { answers: suStepPicks(st) })
}
function suNotNow(st) {
  suOf(st).stage = null
  return [suSaid('NOT_NOW', SU_L.NOT_NOW.text, { setupOffer: SU_L.NOT_NOW.offer })]
}
function suSaidDone(st, item) {
  const list = st.kept.setup_done_said || []
  if (!list.includes(item)) st.kept.setup_done_said = [...list, item]
}
// "It worked" (or "Done, it works now"): Helper reads again
function suWorked(st, seen) {
  const s = suOf(st)
  const item = s.item
  const d = suSaysSeen(item) ? seenDone(item, seen) : undefined
  if (d === undefined) {
    suSaidDone(st, item)
    return suRecommend(st, seen, [suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
  }
  if (d === true) return suRecommend(st, seen, [suSaid('DONE_SEEN', suFill(SU_L.DONE_SEEN.text, { seen_part: suSeenPart(item, seen) }))])
  if (d === null) {
    // the read failed: Helper says so and takes the person's word, never a guess (Decided myself, in the report)
    suSaidDone(st, item)
    return suRecommend(st, seen, [suSaid('READ_FAILED', SU_P.read_failed + ' ' + SU_L.DONE_SAID.text)])
  }
  s.stage = 'notseen'
  return [suSaid('NOT_SEEN', ...suNotSeenWords(item))]
}
// setup-chat-2 (changes-1 NOT_SEEN): bots are counted across the whole Hermes, so for A second bot "I only look at your
// main bot" and "I did it on another bot" are untrue: its own line and two answers
const suNotSeenActs = item => (item === 'second_bot' ? ['notseen:steps', 'notseen:notnow'] : ['notseen:steps', 'notseen:otherbot', 'notseen:notnow'])
const suNotSeenLabels = item => (item === 'second_bot' ? SU_L.NOT_SEEN.answers_second_bot : SU_L.NOT_SEEN.answers)
const suNotSeenWords = item => [item === 'second_bot' ? SU_L.NOT_SEEN.text_second_bot : SU_L.NOT_SEEN.text, { answers: suPicks(suNotSeenActs(item).map((a, i) => [a, suNotSeenLabels(item)[i]])) }]

// setup-chat-2 (changes-1 ALREADY_SEEABLE): "I've done this already". Helper has just read again (the move's look). A
// thing it cannot see: kept as said done (DONE_SAID). Seen done now: DONE_SEEN, not kept as said. The read failed:
// Helper says so and takes the person's word (as after It worked). Not seen: "I can't see that yet." with the look's
// own sentence and four answers (three for A second bot); nothing is kept until one of them says so.
const suAlreadyActs = item => (item === 'second_bot' ? ['already:steps', 'already:count', 'already:notnow'] : ['already:steps', 'already:otherbot', 'already:count', 'already:notnow'])
const suAlreadyLabels = item => (item === 'second_bot' ? SU_L.ALREADY_SEEABLE.answers_second_bot : SU_L.ALREADY_SEEABLE.answers)
function suAlready(st, seen) {
  const s = suOf(st)
  const item = s.item
  const d = SU.seeable.includes(item) ? seenDone(item, seen) : undefined
  if (d === true) return suRecommend(st, seen, [suSaid('DONE_SEEN', suFill(SU_L.DONE_SEEN.text, { seen_part: suSeenPart(item, seen) }))])
  if (d === undefined || d === null) {
    suSaidDone(st, item)
    return suRecommend(st, seen, [d === null ? suSaid('READ_FAILED', SU_P.read_failed + ' ' + SU_L.DONE_SAID.text) : suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
  }
  s.stage = 'already'
  return [suSaid('ALREADY_SEEABLE', suFill(SU_L.ALREADY_SEEABLE.text, { not_part: SU_L.ALREADY_SEEABLE.not_part[item] }), { answers: suPicks(suAlreadyActs(item).map((a, i) => [a, suAlreadyLabels(item)[i]])) })]
}
function suStuck(st) {
  const s = suOf(st)
  s.stage = 'stuck'
  const answers = suPicks(['stuck:works', 'stuck:stop'].map((a, i) => [a, SU_L.STUCK.answers[i]]))
  // its own Hermes cannot answer yet: the docs page instead, opened in the person's browser
  if (s.item === 'model') return [suSaid('STUCK_MODEL', SU_L.STUCK_MODEL.text, { answers, next: { kind: 'docs', label: SU_L.STUCK_MODEL.button, url: SU_L.STUCK_MODEL.url } })]
  const text = suFill(SU_L.STUCK.paste, { card: SU.items[s.item].name, step: SU.items[s.item].steps[s.step] })
  // the text to paste, open at once in its box (as the slow-AI line's)
  return [suSaid('STUCK', SU_L.STUCK.text, { answers, paste: text, pasteLabel: SU_L.STUCK.paste_label })]
}
function suAnswerNew(st, id) {
  const s = suOf(st)
  const a = SU_Q_NEW.answers.find(x => x.id === id)
  let note = null
  if (a.kept_as) {
    st.kept.setup_new = id
    note = suKeptNote(st, 'setup_new', suFill(SU_KEPT_LINE.setup_new, { label: a.label }), id)
  } else delete st.kept.setup_new
  s.newAnswered = true
  s.stage = 'goal'
  s.asked.goal = true
  return [suSaid('Q_GOAL', SU_L.Q_GOAL.text, { answers: suGOAL_PICKS(), note })]
}
function suAnswerGoal(st, id, typed, seen) {
  const s = suOf(st)
  const a = SU_Q_GOAL.answers.find(x => x.id === id)
  const text = typed ? workSqueeze(typed) : a.kept_as
  let note = null
  s.goal = id
  if (text && (!typed || workOk(text))) {
    st.kept.setup_goal = text
    st.kept.setup_goal_id = id
    note = suKeptNote(st, 'setup_goal', SU_KEPT_LINE.setup_goal.replace(/\{[^}]*\}/, text), text)
  } else {
    delete st.kept.setup_goal
    delete st.kept.setup_goal_id
  }
  s.seen = seen
  // under the look line: the Kept: line, the faint line, and the button "What did you look at?"
  const look = suSaid('SEEN', seenLine(seen, id), { note, hint: SU.look.under.faint, next: { kind: 'setup', label: SU.look.under.button, setup: 'lookwhat' } })
  return suRecommend(st, seen, [look])
}
function suRestart(st) {
  const s = suOf(st)
  for (const k of ['setup_new', 'setup_goal', 'setup_goal_id', 'setup_current']) delete st.kept[k]
  Object.assign(s, { stage: 'new', item: null, step: 0, goal: null, newAnswered: false, asked: { new: true }, reasked: {} })
  // loom-fixes (the data's RESTART.then): "Sure, let's start again." and then the first question as its own bubble
  return [suSaid('RESTART', SU_L.RESTART.text), suSaid('Q_NEW', SU_Q_NEW.text, { answers: suNEW_PICKS() })]
}
// loom-fixes (helper-loom-fixes-v1 point 6, FROM_KEPT): Set up Hermes picked (or asked for) while the answer to Q_NEW or
// Q_GOAL is kept: one line on what Helper goes on from, with Go on | Answer again. Only the kept parts are said; a typed
// goal is said in the words of its kind (unsure: "you are not sure yet what you want"), never as the person typed it.
const SU_FK = SU_L.FROM_KEPT
function suFromKept(st) {
  const k = st.kept
  const a = SU_FK.new_said[k.setup_new] || ''
  const b = k.setup_goal_id ? SU_FK.goal_said[k.setup_goal_id] || '' : ''
  if (!a && !b) return null
  const s = suOf(st)
  s.stage = 'fromkept'
  return suMove(false, () => [suSaid('FROM_KEPT', suFill(SU_FK.text, { new_said: a, and: a && b ? SU_FK.and : '', goal_said: b }), { answers: suFromKeptPicks() })])
}
const suFromKeptPicks = () => suPicks(['fromkept:go', 'fromkept:again'].map((x, i) => [x, SU_FK.answers[i]]))
// "what should I set up first": the question not answered yet first, else the look and the recommendation
function suAsk(st) {
  const s = suOf(st)
  if (!st.kept.setup_new && !s.newAnswered) {
    s.stage = 'new'
    s.asked.new = true
    return suMove(false, () => [suSaid('Q_NEW', SU_Q_NEW.text, { answers: suNEW_PICKS() })])
  }
  if (!st.kept.setup_goal_id && !s.goal) {
    s.stage = 'goal'
    s.asked.goal = true
    return suMove(false, () => [suSaid('Q_GOAL', SU_L.Q_GOAL.text, { answers: suGOAL_PICKS() })])
  }
  return suMove(true, seen => {
    s.seen = seen
    const look = suSaid('SEEN', seenLine(seen, st.kept.setup_goal_id || s.goal || 'unsure'), { hint: SU.look.under.faint, next: { kind: 'setup', label: SU.look.under.button, setup: 'lookwhat' } })
    return suRecommend(st, seen, [look])
  })
}

// The things to pick of the set-up conversation's open line, by its stage (null: none is open)
function suOpenPicks(st) {
  const s = suOf(st)
  if (s.stage === 'rec') return suREC_PICKS(SU_L.REC.answers)
  if (s.stage === 'step') return suStepPicks(st)
  if (s.stage === 'stuck') return suPicks(['stuck:works', 'stuck:stop'].map((a, i) => [a, SU_L.STUCK.answers[i]]))
  if (s.stage === 'notseen') return suNotSeenWords(s.item)[1].answers
  if (s.stage === 'already') return suPicks(suAlreadyActs(s.item).map((a, i) => [a, suAlreadyLabels(s.item)[i]]))
  if (s.stage === 'new') return suNEW_PICKS()
  if (s.stage === 'goal') return suGOAL_PICKS()
  if (s.stage === 'fromkept') return suFromKeptPicks()
  return null
}
// A thing picked, or a button pressed: its action. Returns a move, or null when the action is not for this stage.
export function setupPress(action, st) {
  const s = suOf(st)
  const [kind, id] = action.split(':')
  // "What did you look at?": the six short lines, under the look's own opening sentence (Decided myself: the data has
  // no sentence for above the list)
  // While a recommendation waits for its answer, its four answers stay under the list, so the person is not left
  // with nothing to pick.
  // setup-chat-2: the same for any open line of the set-up conversation (a step, "I can't see that yet", ...)
  if (action === 'lookwhat') return s.seen ? suMove(false, () => [suSaid('LOOK_LIST', SU_P.LOOK_OPEN, { rows: lookList(s.seen), hint: SU.look.under.faint, answers: suOpenPicks(st) })]) : null
  if (kind === 'new' && s.stage === 'new') return suMove(false, () => suAnswerNew(st, id))
  // loom-fixes: Go on is the next question not answered yet, or the look and the written recommendation; Answer again
  // starts the questions again
  if (kind === 'fromkept' && s.stage === 'fromkept') {
    s.stage = null
    return id === 'again' ? suMove(false, () => suRestart(st)) : suAsk(st)
  }
  if (kind === 'goal' && s.stage === 'goal') return suMove(true, seen => suAnswerGoal(st, id, null, seen))
  if (kind === 'rec' && s.stage === 'rec') {
    if (id === 'steps') return suMove(false, () => ((s.step = 0), [suStepLine(st)]))
    if (id === 'notnow') return suMove(false, () => suNotNow(st))
    if (id === 'other')
      return suMove(true, seen => {
        s.other.push(s.item)
        return suRecommend(st, seen, [suSaid('SOMETHING_ELSE', SU_L.SOMETHING_ELSE.text)])
      })
    if (id === 'already') return suMove(true, seen => suAlready(st, seen))
  }
  if (kind === 'already' && s.stage === 'already') {
    if (id === 'steps') return suMove(false, () => ((s.step = 0), [suStepLine(st)]))
    if (id === 'notnow') return suMove(false, () => suNotNow(st))
    if ((id === 'otherbot' && s.item !== 'second_bot') || id === 'count')
      return suMove(true, seen => {
        suSaidDone(st, s.item)
        return suRecommend(st, seen, [id === 'count' ? suSaid('ALREADY_COUNT', SU_L.ALREADY_COUNT.text) : suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
      })
  }
  if (kind === 'step' && s.stage === 'step') {
    if (id === 'done') return suMove(false, () => ((s.step += 1), [suStepLine(st)]))
    if (id === 'worked') return suMove(true, seen => suWorked(st, seen))
    if (id === 'stuck') return suMove(false, () => suStuck(st))
    if (id === 'stop') return suMove(false, () => suNotNow(st))
  }
  if (kind === 'stuck' && s.stage === 'stuck') {
    if (id === 'works') return suMove(true, seen => suWorked(st, seen))
    if (id === 'stop') return suMove(false, () => suNotNow(st))
  }
  if (kind === 'notseen' && s.stage === 'notseen') {
    if (id === 'steps') return suMove(false, () => ((s.step = 0), [suStepLine(st)]))
    if (id === 'notnow') return suMove(false, () => suNotNow(st))
    if (id === 'otherbot' && s.item !== 'second_bot')
      return suMove(true, seen => {
        suSaidDone(st, s.item)
        return suRecommend(st, seen, [suSaid('DONE_SAID', SU_L.DONE_SAID.text)])
      })
  }
  return null
}

// A typed message. Returns a move when the set-up conversation takes it, else null (the ordinary talk answers it;
// the page then calls setupAfter for the line that asks the open question again, once).
// hasTopicWord: the message holds a key word of a topic or a Hermes term (src/talk.js)
export function setupTyped(text, st, hasTopicWord = () => false) {
  const s = suOf(st)
  const t = suFlat(text)
  if (!t || looksLikeKey(text)) return null
  // loom-fixes: the restart list now holds everyday words ("reset", "redo"), so anywhere in the message only while the
  // set-up conversation has a line open; with none open, only the restart words alone ("how do I reset my key" is a
  // question about Hermes, not a restart) (Decided myself, in the report)
  if (s.stage ? isRestart(text) : SU.restart_phrases.includes(t)) return suMove(false, () => suRestart(st))
  const question = text.includes('?')
  if (s.stage === 'new') {
    const i = suLabelOf(SU_Q_NEW.answers.map(a => a.label), text)
    if (i >= 0) return suMove(false, () => suAnswerNew(st, SU_Q_NEW.answers[i].id))
    if (isSetupAsk(text)) return suAsk(st)
    if (question || hasTopicWord(text) || notAnAnswer(text)) return null
    return suMove(false, () => suAnswerNew(st, suTypedNew(text)))
  }
  if (s.stage === 'goal') {
    const i = suLabelOf(SU_Q_GOAL.answers.map(a => a.label), text)
    if (i >= 0) return suMove(true, seen => suAnswerGoal(st, SU_Q_GOAL.answers[i].id, null, seen))
    if (isSetupAsk(text)) return suAsk(st)
    if (question || notAnAnswer(text)) return null
    // typed in place of "Not sure yet": nothing is kept (Decided myself: the data lists no such words)
    if (SU_UNSURE.includes(t)) return suMove(true, seen => suAnswerGoal(st, 'unsure', null, seen))
    return suMove(true, seen => suAnswerGoal(st, suTypedGoal(text), text, seen))
  }
  if (s.stage === 'rec') {
    const i = suLabelOf(SU_L.REC.answers, text)
    const act = i >= 0 ? ['rec:steps', 'rec:already', 'rec:other', 'rec:notnow'][i] : SU_REC_YES.includes(t) ? 'rec:steps' : SU_REC_NO.includes(t) ? 'rec:notnow' : null
    if (act) return setupPress(act, st)
  }
  if (s.stage === 'step') {
    const last = s.step === SU.items[s.item].steps.length - 1
    const labels = last ? SU_L.STEP.last_step_answers : SU_L.STEP.answers
    // the answers of either kind of step count, typed at any step: "It worked" at a step before the last is Done
    const i = Math.max(suLabelOf(labels, text), suLabelOf(last ? SU_L.STEP.answers : SU_L.STEP.last_step_answers, text))
    // setup-chat-2: while an answer of the ordinary talk with its own things to pick stands under the step (a delete
    // question's Yes | No), "yes", "ok" and the like answer that, not the step: only the step's own labels count
    const act = i >= 0 ? [last ? 'step:worked' : 'step:done', 'step:stuck', 'step:stop'][i] : SU_STEP_NEXT.includes(t) && !s.stepHidden ? (last ? 'step:worked' : 'step:done') : null
    if (act) return setupPress(act, st)
  }
  if (s.stage === 'stuck') {
    const i = suLabelOf(SU_L.STUCK.answers, text)
    if (i >= 0) return setupPress(['stuck:works', 'stuck:stop'][i], st)
  }
  if (s.stage === 'notseen') {
    const i = suLabelOf(suNotSeenLabels(s.item), text)
    if (i >= 0) return setupPress(suNotSeenActs(s.item)[i], st)
  }
  if (s.stage === 'fromkept') {
    const i = suLabelOf(SU_FK.answers, text)
    if (i >= 0) return setupPress(['fromkept:go', 'fromkept:again'][i], st)
  }
  if (s.stage === 'already') {
    const i = suLabelOf(suAlreadyLabels(s.item), text)
    if (i >= 0) return setupPress(suAlreadyActs(s.item)[i], st)
    // as at the recommendation: yes is the steps, no is Not now
    if (SU_REC_YES.includes(t)) return setupPress('already:steps', st)
    if (SU_REC_NO.includes(t)) return setupPress('already:notnow', st)
  }
  if (isSetupAsk(text) && !hasTopicWord(text)) return suAsk(st)
  return null
}

// After the ordinary talk answered a question typed in place of an answer to SU_Q_NEW or Q_GOAL: the line that asks
// again, once for each question; else null. picks: the answer has things of its own to pick (setup-chat-2, below).
export function setupAfter(st, { picks = false } = {}) {
  const s = suOf(st)
  if (s.stage === 'new' && !s.reasked.new) {
    s.reasked.new = true
    return suSaid('SETUP_REASK', SU_L.SETUP_REASK.text, { answers: suNEW_PICKS() })
  }
  if (s.stage === 'goal' && !s.reasked.goal) {
    s.reasked.goal = true
    return suSaid('SETUP_REASK_GOAL', SU_L.SETUP_REASK_GOAL.text, { answers: suGOAL_PICKS() })
  }
  // setup-chat-2 (changes-1 STEP_BACK; hhtech-setup-run 1.1: the step was gone after a typed question): while a step is
  // open, after every answer, the step again with its own answers, so Done goes on to the next step. Not after I'm
  // stuck or Stop for now (the stage is then another). An answer with things of its own to pick (a delete question's
  // Yes | No, "Which one do you mean?", the topics under "help") keeps them: the step comes back after the answer to
  // that (the page calls this after picked answers too while a step is open), and meanwhile only the step's own labels
  // typed count as its answers (stepHidden).
  if (s.stage === 'step' && s.item && SU.items[s.item]) {
    s.stepHidden = picks
    return picks ? null : suSaid('STEP_BACK', suFill(SU_L.STEP_BACK.text, suStepSlots(s)), { answers: suStepPicks(st) })
  }
  return null
}
// setup-chat-2: whether a step of the set-up conversation is the open line
export const setupStepOpen = st => !!(st.setup && st.setup.stage === 'step')

// setup-chat-2 (changes-1 BACK_SEEN): the one thing a return visit names as seen done: the goal's thing if it is, else
// the first seen done in the order the data's BACK_SEEN gives (scheduled_job, personality, second_bot). What is there
// now, not what changed since (Helper keeps nothing of what it read). null: nothing seen done.
const SU_BACK_ORDER = ['scheduled_job', 'personality', 'second_bot']
function suBackPart(st, seen) {
  const goal = SU.goal_item[st.kept.setup_goal_id]
  const item = [goal, ...SU_BACK_ORDER].find(it => it && SU_BACK_ORDER.includes(it) && seenDone(it, seen) === true)
  const P = SU_L.BACK_SEEN.parts
  if (item === 'scheduled_job') return suFill(seen.jobs === 1 ? P.scheduled_job : P.scheduled_job_plural, { n: seen.jobs })
  if (item === 'second_bot') return suFill(P.second_bot, { n: seen.bots })
  if (item === 'personality') return P.personality
  return null
}
// The opening of a later visit (met is true), after Helper has read Hermes. Returns the lines.
export function setupOpening(st, seen) {
  const s = suOf(st)
  const name = st.kept.name || null
  const cur = st.kept.setup_current
  s.seen = seen
  // loom-fixes: the stop kept as current is done now in a way Helper has no "I can see it" words for (seen as Chat apps
  // or First chat, or said done on the Dashboard): it is current no more, and the visit opens as with none kept
  if (cur && SU.items[cur] && doneSet(st, seen).has(cur) && !(suSaysSeen(cur) && seenDone(cur, seen) === true)) {
    delete st.kept.setup_current
    return setupOpening(st, seen)
  }
  if (cur && SU.items[cur]) {
    s.item = cur
    if (seenDone(cur, seen) === true) return suRecommend(st, seen, [suSaid('BACK_DONE', suNamed(SU_L.BACK_DONE, name, { seen_part: suSeenPart(cur, seen) }))])
    s.stage = 'rec'
    // loom-fixes (here_rule, one rule with the Dashboard: src/setup-reads.js hereStop): the stop named is the Dashboard's
    // "You are here"; with the stop kept as current not done, that is this stop
    const done = doneSet(st, seen)
    const card = hereStop(SU_PATH_OF(), id => (done.has(id) ? true : seenDone(id, seen) === null ? null : false), cur) || cur
    const slots = { card: SU.items[card].name, why: SU.items[card].why }
    // setup-chat-2 (changes-1): something else Helper can see is done now: say that, then where we stopped
    const part = suBackPart(st, seen)
    if (part) return [suSaid('BACK_SEEN', suNamed(SU_L.BACK_SEEN, name, { back_part: part })), suSaid('BACK_NEXT', suFill(SU_L.BACK_NEXT.text, slots), { answers: suREC_PICKS(SU_L.BACK_NEXT.answers) })]
    return [suSaid('BACK_REC', suNamed(SU_L.BACK_REC, name, slots), { answers: suREC_PICKS(SU_L.BACK_REC.answers) })]
  }
  if (!st.kept.setup_new) {
    s.stage = 'new'
    s.asked.new = true
    return [suSaid('BACK_Q', suNamed(SU_L.BACK_Q, name), { answers: suNEW_PICKS() })]
  }
  if (!st.kept.setup_goal_id) {
    // SU_Q_NEW answered, SU_Q_GOAL never shown: "Q_GOAL with the Hi again opening" (the data's BACK_Q note)
    s.stage = 'goal'
    s.asked.goal = true
    return [suSaid('BACK', suNamed(SU_L.BACK, name)), suSaid('Q_GOAL', SU_L.Q_GOAL.text, { answers: suGOAL_PICKS() })]
  }
  // setup-chat-2 (changes-1 BACK_SEEN: "Then BACK_NEXT ..., or REC for a new item, or ALL_DONE"): with nothing kept as
  // current (all done before, or its row deleted in Settings), a thing seen done is named in place of the plain BACK
  const part = suBackPart(st, seen)
  if (part) return suRecommend(st, seen, [suSaid('BACK_SEEN', suNamed(SU_L.BACK_SEEN, name, { back_part: part }))])
  const back = suSaid('BACK', suNamed(SU_L.BACK, name))
  const lines = suRecommend(st, seen, [back])
  // everything done: the old BACK alone, with its offer (the data's BACK: "Unchanged, for R5 (all done) only")
  if (lines.at(-1).line === 'ALL_DONE') return [{ ...back, setupOffer: SU_L.BACK.offer }]
  return lines
}
// "start again" from Helper's settings page (the button "Ask me the set-up questions again"): the same as typed
export const setupRestartMove = st => suMove(false, () => suRestart(st))
// The four rows of what the set-up conversation keeps, for Helper's settings page: [key, the row's name, what it shows]
export function setupRows(kept) {
  const name = Object.fromEntries(SU.keeps.map(k => [k.key, k.row]))
  const rows = []
  const a = SU_Q_NEW.answers.find(x => x.id === kept.setup_new)
  if (a) rows.push(['setup_new', name.setup_new, a.label])
  if (kept.setup_goal) rows.push(['setup_goal', name.setup_goal, kept.setup_goal])
  const said = (kept.setup_done_said || []).filter(id => SU.items[id])
  if (said.length) rows.push(['setup_done_said', name.setup_done_said, said.map(id => SU.items[id].name).join(', ')])
  if (kept.setup_current && SU.items[kept.setup_current]) rows.push(['setup_current', name.setup_current, SU.items[kept.setup_current].name])
  return rows
}
// The stored keys behind each row, and the ones "Ask me the set-up questions again" clears (the things said done stay)
export const SETUP_ROW_KEYS = { setup_new: ['setup_new'], setup_goal: ['setup_goal', 'setup_goal_id'], setup_done_said: ['setup_done_said'], setup_current: ['setup_current'] }
export const SETUP_ASKED_KEYS = ['setup_new', 'setup_goal', 'setup_goal_id', 'setup_current']
export const SETUP_ALL_KEYS = [...SETUP_ASKED_KEYS, 'setup_done_said']
// The pick "Set up Hermes" under an offer (offers.things.setup): with an answer kept, FROM_KEPT (loom-fixes); else the
// question not answered yet
export const setupAskMove = st => suFromKept(st) || suAsk(st)
// Whether a later visit opens with the set-up conversation (always, once it is built)
export const SETUP_UNSEEN = { model: 'unread', soul: null, jobs: null, bots: null }
