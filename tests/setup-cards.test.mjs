// "Your setup" card rules (build-v1.md section 8): every status each card can show is reached here
// from the answer Hermes would give, and the words are the fixed ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  STATUS, PASSES, cardTitle, gatewayCard, modelCard, answersCard, soulCard, skillsCard, memoryCard, rememberCard,
  DEFAULT_SOULS, isDefaultSoul, answerPasses, ANSWER_CALL, MODEL_LINES, SOUL_LINES
} from '../src/setup-cards.js'
import { CANT_CHECK_LINE } from '../src/model-status.js'

const statuses = list => list.map(c => c.status)

test('status words: the five from the job plus the skills count and "Checking"', () => {
  assert.deepEqual(STATUS, {
    works: 'Works',
    fix: 'Needs a fix',
    notset: 'Not set up yet',
    unchecked: 'Not checked yet',
    cant: "Can't check right now",
    count: 'Just a count, no pass or fail',
    checking: 'Checking'
  })
})

test('card 1, Hermes is connected: "open" = Works, anything else = Needs a fix', () => {
  assert.equal(gatewayCard('open').status, 'works')
  for (const s of ['connecting', 'idle', 'closed', '', undefined]) assert.equal(gatewayCard(s).status, 'fix', String(s))
})

test('card 2, A model is connected: Works (with and without a name), Not set up yet, Needs a fix, Can\'t check, Checking', () => {
  const named = modelCard({ state: 'ok', name: 'mock-small' })
  assert.equal(named.status, 'works')
  assert.equal(named.value, 'mock-small')
  assert.deepEqual(named.lines, ['Your Hermes has a model: mock-small. The model is the AI that does the thinking.'])
  assert.deepEqual(modelCard({ state: 'ok', name: '' }).lines, [MODEL_LINES.worksNoName])
  const notset = modelCard({ state: 'none', configured: false })
  assert.equal(notset.status, 'notset')
  assert.deepEqual(notset.action, { kind: 'step', step: 2, label: 'Open step 2' })
  assert.equal(modelCard({ state: 'none', configured: true }).status, 'fix')
  assert.equal(modelCard({ state: 'none', configured: null }).status, 'fix') // "any other ok false"
  assert.equal(modelCard({ state: 'none', configured: true }).action.step, 2)
  const cant = modelCard({ state: 'error' })
  assert.equal(cant.status, 'cant')
  assert.deepEqual(cant.lines, [CANT_CHECK_LINE])
  assert.equal(cant.action.kind, 'recheck')
  assert.equal(modelCard(null).status, 'checking')
  assert.equal(modelCard({ state: 'checking' }).status, 'checking')
})

test('card 3, The model answers: Not checked yet before the press, then Works / Needs a fix / Not set up yet', () => {
  const ok = { state: 'ok', name: 'mock-small' }
  const idle = answersCard(undefined, ok)
  assert.equal(idle.status, 'unchecked')
  assert.deepEqual(idle.action, { kind: 'ask', label: 'Check', disabled: false })
  // No working model: the button can't be pressed (never call llm.oneshot to "test" for a model).
  for (const m of [{ state: 'none', configured: false }, { state: 'error' }, { state: 'checking' }, null]) {
    const c = answersCard(undefined, m)
    assert.equal(c.status, 'unchecked')
    assert.equal(c.action.disabled, true, JSON.stringify(m))
  }
  assert.deepEqual(answersCard({ phase: 'calling', waited: 12 }, ok), { status: 'checking', lines: ['Waiting for your model, 12 s'] })
  assert.deepEqual(answersCard({ phase: 'countdown', left: 45 }, ok).lines, ["Your model isn't ready to answer yet. I'll try again in 45 seconds."])
  const works = answersCard({ phase: 'done', result: { ok: true, text: 'OK', ms: 1234 } }, ok)
  assert.equal(works.status, 'works')
  assert.deepEqual(works.lines, ['mock-small answered a short test in 1.2 seconds.'])
  assert.equal(answersCard({ phase: 'done', result: { ok: true, text: 'OK', ms: 300 } }, { state: 'ok', name: '' }).lines[0], 'Your model answered a short test in 0.3 seconds.')
  // After a result, the button works only while card 2 still says ok.
  for (const kind of ['other', 'key']) {
    assert.equal(answersCard({ phase: 'done', result: { ok: false, kind } }, ok).action.disabled, false)
    assert.equal(answersCard({ phase: 'done', result: { ok: false, kind } }, { state: 'none', configured: true }).action.disabled, true)
  }
  assert.equal(answersCard({ phase: 'done', result: { ok: true, text: 'OK', ms: 1 } }, { state: 'error' }).action.disabled, true)
  // Never a lowercase start: "Your model answered ...".
  assert.match(answersCard({ phase: 'done', result: { ok: true, text: 'OK', ms: 1 } }, { state: 'ok', name: '' }).lines[0], /^Your model answered/)
  const wrong = answersCard({ phase: 'done', result: { ok: true, text: 'Hello there', ms: 10 } }, ok)
  assert.equal(wrong.status, 'fix')
  assert.equal(wrong.action.label, 'Try again')
  for (const [kind, first] of [
    ['key', "The service that runs your model didn't accept your key or sign-in."],
    ['connection', "Hermes couldn't reach your model."],
    ['other', "Your model didn't answer this time. Press Try again."]
  ]) {
    const c = answersCard({ phase: 'done', result: { ok: false, kind } }, ok)
    assert.equal(c.status, 'fix', kind)
    assert.equal(c.lines[0], first)
    assert.equal(c.action.label, 'Try again')
  }
  const gone = answersCard({ phase: 'done', result: { ok: false, kind: 'no_model' } }, ok)
  assert.equal(gone.status, 'fix') // card 3 has only Works / Needs a fix / Not checked yet
  assert.deepEqual(gone.lines, [MODEL_LINES.notset])
  assert.equal(gone.action.step, 2)
  const broken = answersCard({ phase: 'done', result: { ok: false, kind: 'model_broken' } }, ok)
  assert.equal(broken.status, 'fix')
  assert.deepEqual(broken.lines, [MODEL_LINES.fix])
})

test('card 3 pass rule: the reply contains the word OK', () => {
  for (const t of ['OK', 'OK.', 'ok', ' Ok!', 'Sure: OK', '"OK"', 'OK\n']) assert.ok(answerPasses(t), t)
  for (const t of ['', 'token', 'Hello', 'BOOK', 'okay', null, undefined]) assert.ok(!answerPasses(t), String(t))
  assert.equal(ANSWER_CALL.instructions, 'Reply with exactly: OK')
})

test('card 4, SOUL.md: Hermes\'s default = Not set up yet, own text = Works, empty = Not set up yet, failed read = Can\'t check', () => {
  assert.equal(soulCard({ ok: true, value: { soul: DEFAULT_SOULS[0] } }).status, 'notset')
  assert.equal(soulCard({ ok: true, value: { soul: '\uFEFF\r\n  ' + DEFAULT_SOULS[0].replace(/\n/g, '\r\n') + '\n\n' } }).status, 'notset')
  assert.equal(soulCard({ ok: true, value: { soul: '' } }).status, 'notset')
  assert.equal(soulCard({ ok: true, value: { soul: '  \n ' } }).status, 'notset')
  assert.deepEqual(soulCard({ ok: true, value: { soul: '' } }).lines, [SOUL_LINES.notset])
  const own = soulCard({ ok: true, value: { soul: 'You are Ziggy. Answer in Latvian, briefly.' } })
  assert.equal(own.status, 'works')
  assert.deepEqual(own.lines, [SOUL_LINES.works])
  // One changed character in the default is the person's own text.
  assert.equal(soulCard({ ok: true, value: { soul: DEFAULT_SOULS[0] + ' Be kind.' } }).status, 'works')
  // A failed read is never "Not set up yet".
  for (const read of [{ ok: false }, { ok: true, value: {} }, { ok: true, value: { soul: null } }, { ok: true, value: null }]) {
    const c = soulCard(read)
    assert.equal(c.status, 'cant', JSON.stringify(read))
    assert.deepEqual(c.lines, [CANT_CHECK_LINE])
    assert.equal(c.action.label, 'Check again')
  }
  assert.equal(soulCard(null).status, 'checking')
})

test('card 4: the default texts are a byte-exact copy of Hermes\'s (hermes_cli/default_soul.py)', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'hermes-default-souls.json'), 'utf8'))
  assert.equal(fixture.texts.length, 5)
  assert.deepEqual(DEFAULT_SOULS, fixture.texts)
  for (const t of fixture.texts) assert.ok(isDefaultSoul(t))
  assert.equal(DEFAULT_SOULS[0].length, 663) // hhtech: "fresh homes: 663 chars"
})

test('card 5, Skills: a count of the switched-on skills, no pass or fail; a failed read = Can\'t check', () => {
  const c = skillsCard({ ok: true, value: [{ name: 'a', enabled: true }, { name: 'b', enabled: false }, { name: 'c', enabled: true }] })
  assert.equal(c.status, 'count')
  assert.equal(c.value, '2 switched on')
  assert.match(c.lines[0], /^2 skills are on\. A skill is written know-how/)
  assert.match(skillsCard({ ok: true, value: [{ enabled: true }] }).lines[0], /^1 skill is on\./)
  assert.match(skillsCard({ ok: true, value: [] }).lines[0], /^No skills are on\./)
  assert.equal(skillsCard({ ok: true, value: [] }).status, 'count')
  assert.equal(skillsCard({ ok: false }).status, 'cant')
  assert.equal(skillsCard({ ok: true, value: { not: 'a list' } }).status, 'cant')
  assert.equal(skillsCard(null).status, 'checking')
  assert.equal(PASSES.skills, null)
})

test('card 6, Memory: on = Works, off = Needs a fix with text to paste, missing or failed = Can\'t check', () => {
  assert.equal(memoryCard({ ok: true, value: [{ name: 'web', enabled: false }, { name: 'memory', enabled: true }] }).status, 'works')
  const off = memoryCard({ ok: true, value: [{ name: 'memory', enabled: false }] })
  assert.equal(off.status, 'fix')
  assert.equal(off.handoff.text, 'Please switch my memory on and tell me how to check it worked.')
  assert.equal(memoryCard({ ok: true, value: [{ name: 'web', enabled: true }] }).status, 'cant')
  assert.equal(memoryCard({ ok: false }).status, 'cant')
  assert.equal(memoryCard(null).status, 'checking')
})

test('card 7, Does it really remember: Not checked yet until the person answers; It said 7Q4 = Works; It didn\'t = Needs a fix with three reasons', () => {
  assert.equal(rememberCard(undefined).status, 'unchecked')
  assert.equal(rememberCard('yes').status, 'works')
  const no = rememberCard('no')
  assert.equal(no.status, 'fix')
  assert.equal(no.reasons.length, 3)
  assert.match(no.reasons[1], /\/memory pending, then \/memory approve all/)
})

test('every status in the job is reachable somewhere', () => {
  const all = new Set(
    statuses([
      gatewayCard('open'), gatewayCard('x'),
      modelCard({ state: 'none', configured: false }), modelCard({ state: 'error' }),
      answersCard(undefined, { state: 'ok' })
    ])
  )
  for (const s of ['works', 'fix', 'notset', 'unchecked', 'cant']) assert.ok(all.has(s), s)
})

test('titles: "for {bot}" only on per-bot cards and only with more than one bot', () => {
  assert.equal(cardTitle('model', 'work', 1), 'A model is connected')
  assert.equal(cardTitle('model', 'work', 2), 'A model is connected for work')
  assert.equal(cardTitle('soul', 'work', 2), 'Personality file (SOUL.md) for work')
  assert.equal(cardTitle('gateway', 'work', 2), 'Hermes is connected')
})

test('Passes when: one fixed rule per card (skills has none, it is a count)', () => {
  for (const id of ['gateway', 'model', 'answers', 'soul', 'memory', 'remember']) assert.match(PASSES[id], /^Passes when: /, id)
  assert.match(PASSES.answers, /90\u00a0s\. Uses a little of your credit\.$/)
})
