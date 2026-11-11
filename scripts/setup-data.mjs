// setup-chat: the content team's data for the set-up conversation (a copy of content/helper-setup-chat-v1.json) and the
// set-up list (a copy of content/dash-setup-list-v2.json: the things, their names, why sentences and steps) become
// src/setup-data.js. Checked first (with any problem the build stops and nothing is written), then cut down to the
// fields src/setup-chat.js reads. Nothing here is written by the Builder: every word Helper says in the set-up
// conversation is the team's.

// the lines src/setup-chat.js says, and the slots each must hold
export const SETUP_LINES = {
  F2: ['{name}'], F3: [], WORK_SECRET: [], WORK_LONG_2: [], Q_GOAL: [], SETUP_REASK: [], SETUP_REASK_GOAL: [],
  REC: ['{reason}', '{card}', '{why}'], STEP: ['{n}', '{total}', '{step}'], STUCK: [], STUCK_MODEL: [], DONE_SEEN: ['{seen_part}'],
  NOT_SEEN: [], DONE_SAID: [], SOMETHING_ELSE: [], NOT_NOW: [], ALL_DONE: [],
  BACK_DONE: ['{name}', '{seen_part}'], BACK_REC: ['{name}', '{card}', '{why}'], BACK_Q: ['{name}'], BACK: ['{name}'], RESTART: [],
  // setup-chat-2 (setup-chat changes-1): the returning line when something else is seen done and the line after it, the
  // line of "I can't see that yet" and of "Count it as done", and the line back to the step after a typed question
  BACK_SEEN: ['{name}', '{back_part}'], BACK_NEXT: ['{card}', '{why}'], ALREADY_SEEABLE: ['{not_part}'], ALREADY_COUNT: [], STEP_BACK: ['{n}', '{total}', '{step}'],
  // loom-fixes (helper-loom-fixes-v1 point 6): Set up Hermes with answers already kept
  FROM_KEPT: ['{new_said}', '{and}', '{goal_said}']
}
// setup-chat-2: BACK_SEEN's parts, one for each thing Helper can see done
export const BACK_SEEN_PARTS = { scheduled_job: ['{n}'], scheduled_job_plural: ['{n}'], personality: [], second_bot: ['{n}'] }
export const SETUP_PARTS = ['LOOK_OPEN', 'model_ok', 'model_not', 'model_unread', 'model_slow', 'scheduled_job_done', 'scheduled_job_done_plural', 'scheduled_job_not', 'second_bot_done', 'second_bot_not', 'personality_done', 'personality_not', 'chat_apps_cannot', 'read_failed']
const REASONS = ['R1', 'R2_new', 'R2_skip', 'R3_schedule', 'R3_phone', 'R3_bots', 'R4']

export function setupProblems(setup, list) {
  const problems = []
  const bad = m => problems.push(m)
  const items = Object.fromEntries(((list && list.items) || []).map(i => [i.id, i]))
  const max = (setup.limits || {}).answers_max || 4
  const order = setup.rule_order || []
  if (!order.length) bad('rule_order is empty')
  for (const id of ['model', ...order]) {
    const it = items[id]
    if (!it) {
      bad(`${id}: not an item of the set-up list`)
      continue
    }
    if (!it.card_name || !it.why) bad(`${id}: the list has no card_name or why for it`)
    if (!Array.isArray(it.steps) || !it.steps.length || it.steps.some(s => !s || typeof s.text !== 'string' || !s.text.trim())) bad(`${id}: the list has no steps for it, or a step without text`)
  }
  for (const [goal, item] of Object.entries(setup.goal_item || {})) if (item !== null && !order.includes(item)) bad(`goal_item ${goal}: ${item} is not in rule_order`)
  for (const s of setup.seeable || []) if (!order.includes(s)) bad(`seeable ${s} is not in rule_order`)
  const qs = Object.fromEntries((setup.questions || []).map(q => [q.id, q]))
  for (const id of ['Q_NEW', 'Q_GOAL']) {
    const q = qs[id]
    if (!q || !q.text) {
      bad(`${id}: no such question`)
      continue
    }
    if (!Array.isArray(q.answers) || q.answers.length < 2 || q.answers.length > max) bad(`${id}: ${q.answers ? q.answers.length : 0} answers (2 to ${max})`)
    for (const a of q.answers || []) if (!a.id || !a.label) bad(`${id}: an answer without id or label`)
    const typed = q.typed || {}
    for (const k of typed.order || []) {
      if (!Array.isArray(typed[k]) || !typed[k].length) bad(`${id}: typed list ${k} is missing or empty`)
      if (!(q.answers || []).some(a => a.id === k)) bad(`${id}: typed list ${k} is not an answer`)
    }
  }
  if (qs.Q_NEW && JSON.stringify(qs.Q_NEW.answers.map(a => a.id)) !== JSON.stringify(['new', 'some', 'well', 'skip'])) bad('Q_NEW: the answers are not new, some, well, skip')
  if (qs.Q_GOAL && JSON.stringify(qs.Q_GOAL.answers.map(a => a.id)) !== JSON.stringify(Object.keys(setup.goal_item || {}))) bad('Q_GOAL: the answers are not the goals of goal_item, in its order')
  const lines = setup.lines || {}
  for (const [id, slots] of Object.entries(SETUP_LINES)) {
    const l = lines[id]
    if (!l || typeof l.text !== 'string' || !l.text.trim()) {
      bad(`line ${id}: missing`)
      continue
    }
    for (const s of slots) if (!l.text.includes(s)) bad(`line ${id}: no ${s} in its text`)
    if (slots.includes('{name}') && (typeof l.text_no_name !== 'string' || l.text_no_name.includes('{name}'))) bad(`line ${id}: no text_no_name`)
    if (Array.isArray(l.answers) && (l.answers.length < 2 || l.answers.length > max)) bad(`line ${id}: ${l.answers.length} answers`)
  }
  for (const [id, n] of [['REC', 4], ['BACK_REC', 4], ['BACK_NEXT', 4], ['ALREADY_SEEABLE', 4], ['STEP', 3], ['NOT_SEEN', 3], ['STUCK', 2]]) if (lines[id] && (!Array.isArray(lines[id].answers) || lines[id].answers.length !== n)) bad(`line ${id}: its ${n} answers are missing`)
  // setup-chat-2: what changes-1 gives these lines besides their text
  for (const [part, slots] of Object.entries(BACK_SEEN_PARTS)) {
    const t = ((lines.BACK_SEEN || {}).parts || {})[part]
    if (typeof t !== 'string' || !t.trim() || slots.some(s => !t.includes(s))) bad(`line BACK_SEEN: no part ${part}${slots.length ? ' with ' + slots.join(' ') : ''}`)
  }
  for (const it of setup.seeable || []) {
    const ref = (((lines.ALREADY_SEEABLE || {}).not_part) || {})[it]
    if (typeof ref !== 'string' || !/^look\.parts\./.test(ref) || typeof ((setup.look || {}).parts || {})[ref.slice('look.parts.'.length)] !== 'string') bad(`line ALREADY_SEEABLE: no not_part for ${it} among look.parts`)
  }
  if (lines.ALREADY_SEEABLE && (!Array.isArray(lines.ALREADY_SEEABLE.answers_second_bot) || lines.ALREADY_SEEABLE.answers_second_bot.length !== 3)) bad('line ALREADY_SEEABLE: its 3 answers_second_bot are missing')
  if (lines.NOT_SEEN && (typeof lines.NOT_SEEN.text_second_bot !== 'string' || !lines.NOT_SEEN.text_second_bot.trim() || !Array.isArray(lines.NOT_SEEN.answers_second_bot) || lines.NOT_SEEN.answers_second_bot.length !== 2)) bad('line NOT_SEEN: no text_second_bot with its 2 answers_second_bot')
  if (lines.STEP && (!Array.isArray(lines.STEP.last_step_answers) || lines.STEP.last_step_answers.length !== 3)) bad('line STEP: no last_step_answers')
  if (lines.STUCK && (!lines.STUCK.paste || !lines.STUCK.paste.includes('{card}') || !lines.STUCK.paste.includes('{step}') || !lines.STUCK.paste_label)) bad('line STUCK: no paste text with {card} and {step}, or no paste_label')
  if (lines.STUCK_MODEL && (!lines.STUCK_MODEL.button || !/^https:\/\//.test(lines.STUCK_MODEL.url || ''))) bad('line STUCK_MODEL: no button or web address')
  const look = setup.look || {}
  for (const p of SETUP_PARTS) if (typeof (look.parts || {})[p] !== 'string') bad(`look.parts.${p}: missing`)
  if (!look.under || !look.under.grey || !look.under.button) bad('look.under: no grey line or button')
  if (!look.look_list || !Array.isArray(look.look_list.lines) || look.look_list.lines.length !== 6) bad('look.look_list.lines: not 6 lines')
  for (const r of REASONS) if (typeof (setup.reasons || {})[r] !== 'string') bad(`reasons.${r}: missing`)
  if (!Array.isArray(setup.restart_phrases) || !setup.restart_phrases.length) bad('restart_phrases: empty')
  if (!setup.setup_ask || !Array.isArray(setup.setup_ask.phrases) || !setup.setup_ask.phrases.length) bad('setup_ask.phrases: empty')
  const rows = ((setup.keeps || {}).rows || []).map(r => r.key)
  if (JSON.stringify(rows) !== JSON.stringify(['setup_new', 'setup_goal', 'setup_done_said', 'setup_current'])) bad('keeps.rows: not the four rows setup_new, setup_goal, setup_done_said, setup_current')
  const ai = setup.ai || {}
  if (typeof ai.instructions !== 'string' || !ai.instructions.includes('{card}')) bad('ai.instructions: missing')
  for (const id of ['model', ...order]) if (!Array.isArray((ai.aliases || {})[id]) || !ai.aliases[id].length) bad(`ai.aliases.${id}: missing`)
  return problems
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))

// one line, cut to the fields the code reads; changes-1's not_part names look.parts, so the code gets their words
function slimLine(setup, id) {
  const l = setup.lines[id]
  const out = pick(l, ['text', 'text_no_name', 'answers', 'answers_second_bot', 'text_second_bot', 'last_step_answers', 'paste_label', 'paste', 'button', 'url', 'offer', 'parts', 'new_said', 'goal_said', 'and'])
  // STEP_BACK's answers are a note ("the step's own"), not a list: the code gives it STEP's
  if (out.answers !== undefined && !Array.isArray(out.answers)) delete out.answers
  if (l.not_part) out.not_part = Object.fromEntries(Object.entries(l.not_part).map(([k, ref]) => [k, setup.look.parts[ref.slice('look.parts.'.length)]]))
  return out
}

export function slimSetupData(setup, list) {
  const items = Object.fromEntries(list.items.map(i => [i.id, i]))
  const qs = Object.fromEntries(setup.questions.map(q => [q.id, q]))
  const question = q => ({
    text: q.text,
    answers: q.answers.map(a => pick(a, ['id', 'label', 'kept_as', 'item'])),
    typed: { order: q.typed.order, lists: Object.fromEntries(q.typed.order.map(k => [k, q.typed[k]])) }
  })
  return {
    questions: { Q_NEW: question(qs.Q_NEW), Q_GOAL: question(qs.Q_GOAL) },
    look: { parts: pick(setup.look.parts, SETUP_PARTS), under: { faint: setup.look.under.grey, button: setup.look.under.button }, list: setup.look.look_list.lines },
    rule_order: setup.rule_order,
    goal_item: setup.goal_item,
    seeable: setup.seeable,
    reasons: setup.reasons,
    lines: Object.fromEntries(Object.keys(SETUP_LINES).map(id => [id, slimLine(setup, id)])),
    restart_phrases: setup.restart_phrases,
    // loom-fixes (helper-loom-fixes-v1 point 2): a message typed at Q_NEW or Q_GOAL is kept only when it reads as an answer
    typed_answer: pick(setup.typed_answer, ['question_starts', 'request_starts', 'request_words', 'small_talk_kinds']),
    ask_phrases: setup.setup_ask.phrases,
    keeps: setup.keeps.rows.map(r => ({ key: r.key, row: r.settings_row, kept_line: /^Kept:/.test(r.grey_kept_line) ? r.grey_kept_line : null })),
    ai: {
      instructions: setup.ai.instructions,
      aliases: setup.ai.aliases,
      later_names: setup.ai.later_names,
      max_words: setup.limits.ai_words,
      max_sentences: setup.limits.ai_sentences
    },
    // the things of the set-up list the rule can choose: name, why sentence and steps, word for word
    items: Object.fromEntries(['model', ...setup.rule_order].map(id => [id, { name: items[id].card_name, why: items[id].why, steps: items[id].steps.map(s => s.text) }]))
  }
}
