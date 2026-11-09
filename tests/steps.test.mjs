// Setup steps 1-4 (B3): hhcontent's data and the code rules around it (src/steps.js).
// The data checks are build-v1.md section 6's (tests/lib/step-checks.mjs); the source paths are
// looked up in the Hermes docs when a copy is on this machine (HH_DOCS, /hermes-docs, or the team's
// Hermes checkout next to the plugin); without one that single check is skipped and says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { STEPS_DATA } from '../src/steps-data.js'
import { STEPS, LINES, isDocsUrl, stepByNumber, stepById, railLines, docsUrl, chipLabel, nextAfter, fitsGoal, isBuildRequest, handoffText, cleanAnswers, REQUEST_MAX_CHARS } from '../src/steps.js'
import { stepFindings, stepWords, words } from './lib/step-checks.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const DOCS = [process.env.HH_DOCS, '/hermes-docs', path.join(ROOT, '..', 'dev', 'hermes-src', 'website', 'docs')].find(
  p => p && fs.existsSync(path.join(p, 'index.mdx'))
)
const copy = () => JSON.parse(JSON.stringify(STEPS_DATA))

test('the plugin\'s copy of the step data is the team\'s content/steps-v1.json, unchanged', t => {
  const team = path.join(ROOT, '..', 'content', 'steps-v1.json')
  if (!fs.existsSync(team)) return t.skip('the team folder is not next to the plugin here')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'steps-v1.json'), 'utf8')), JSON.parse(fs.readFileSync(team, 'utf8')))
})

test('four steps, numbered 1 to 4, ids s1 to s4', () => {
  assert.deepEqual(STEPS.map(s => [s.number, s.id]), [[1, 's1'], [2, 's2'], [3, 's3'], [4, 's4']])
})

test('section 6 checks pass on the data: sources, option facts, word limits, counts, next_rule, slots', () => {
  assert.deepEqual(stepFindings(STEPS_DATA), [])
  for (const s of STEPS) {
    assert.ok(words(s.intro) < 120, `${s.id} intro ${words(s.intro)}`)
    assert.ok(stepWords(s) < 1500, `${s.id} total ${stepWords(s)}`)
  }
})

test('every source path exists in the Hermes docs (facts, intro sources, comparison sides)', t => {
  if (!DOCS) return t.skip('no copy of the Hermes docs on this machine (set HH_DOCS)')
  assert.deepEqual(stepFindings(STEPS_DATA, DOCS), [])
})

test('the checks bite: a doctored copy fails each rule', () => {
  const cases = [
    [d => delete d.steps[0].facts[0].source, /s1\.s1f1: no source/],
    [d => (d.steps[1].facts[2].source = 'user-guide/made-up.md'), /made-up\.md not in the docs/, true],
    [d => (d.steps[0].options[0].fact = 's2f1'), /o_tasks: points to s2f1/],
    [d => (d.steps[0].intro = 'word '.repeat(120)), /s1: intro has 120 words/],
    [d => (d.steps[2].facts[0].text = 'word '.repeat(1500)), /s3: step text has \d+ words/],
    [d => d.steps[3].facts.splice(0, 3), /s4: 2 facts/],
    [d => d.steps[1].options.push({ id: 'o_x', label: 'x', fact: 's2f1' }), /s2: 6 options/],
    [d => (d.steps[2].next_rule.o_here = 's9'), /leads to s9/],
    [d => delete d.steps[0].next_rule.o_phone, /o_phone: no next_rule/],
    [d => (d.steps[0].handoff.template = 'no slots'), /hand-over slots/],
    [d => (d.steps[1].compare.left.source = ''), /compare\.left: no source/]
  ]
  for (const [breakIt, want, needsDocs] of cases) {
    if (needsDocs && !DOCS) continue
    const d = copy()
    breakIt(d)
    const found = stepFindings(d, DOCS || null)
    assert.ok(found.some(f => want.test(f)), `${want} not found in ${JSON.stringify(found)}`)
  }
})

test('the step list: the title up to its colon, with the data\'s short line; step 1 (a question) uses the short line', () => {
  assert.deepEqual(railLines(stepByNumber(1)), { title: 'What you want Hermes to do', sub: '' })
  assert.deepEqual(railLines(stepByNumber(2)), { title: 'The brain', sub: 'What a model is, where it runs' })
  assert.deepEqual(railLines(stepByNumber(3)), { title: 'Where Hermes runs', sub: 'This computer, or one that is always on' })
  assert.deepEqual(railLines(stepByNumber(4)), { title: 'Connecting things', sub: 'Tools, skills, plugins, MCP' })
})

test('docs links: a source path gives the same live page hhcontent wrote for every fact', () => {
  for (const s of STEPS) for (const f of s.facts) assert.equal(docsUrl(f.source), f.url.split('#')[0], f.id)
  assert.equal(docsUrl('index.mdx'), 'https://hermes-agent.nousresearch.com/docs/')
  assert.equal(docsUrl('user-guide/messaging/index.md'), 'https://hermes-agent.nousresearch.com/docs/user-guide/messaging/')
  assert.equal(chipLabel('Choosing a model'), 'Hermes docs › Choosing a model')
})

test('next step comes from next_rule (code, not the model); no answer = the next in order; after step 4, done', () => {
  for (const s of STEPS) for (const o of s.options) {
    const target = s.next_rule[o.id]
    assert.equal(nextAfter(s, o.id), target === 'done' ? 'done' : stepById(target).number)
  }
  assert.equal(nextAfter(stepByNumber(1), undefined), 2)
  assert.equal(nextAfter(stepByNumber(4), undefined), 'done')
  // A rule that skips a step is followed (v1's rules all lead to the next step, so try one that doesn't).
  const skipping = { ...stepByNumber(1), next_rule: { o_tasks: 's3' } }
  assert.equal(nextAfter(skipping, 'o_tasks'), 3)
  assert.equal(nextAfter({ ...stepByNumber(2), next_rule: { o_keep: 'done' } }, 'o_keep'), 'done')
})

test('"Fits your goal": the step-1 answer tags its step-3 option; nothing before step 1 is answered', () => {
  assert.equal(fitsGoal({}, 's3'), null)
  assert.equal(fitsGoal({ s1: 'o_tasks' }, 's3'), 'o_here')
  assert.equal(fitsGoal({ s1: 'o_phone' }, 's3'), 'o_always')
  assert.equal(fitsGoal({ s1: 'o_schedule' }, 's3'), 'o_always')
  assert.equal(fitsGoal({ s1: 'o_unsure' }, 's3'), null)
  assert.equal(fitsGoal({ s1: 'o_phone' }, 's2'), null)
})

// hhcontent's 16 sentences (dev/checks/hhcontent/check-steps-v1.mjs), run on the plugin's own code.
const BUILD_CASES = [
  ['s4', 'Can you install the Gmail plugin?', true],
  ['s4', 'please install a skill for writing emails', true],
  ['s4', 'connect my gmail', true],
  ['s4', 'What is a plugin?', false],
  ['s4', "What's the difference between a skill and a plugin", false],
  ['s4', 'Which one do I need for my calendar?', false],
  ['s2', "here's my key sk-abc", true],
  ['s2', 'Can you change my model to Claude', true],
  ['s2', 'Is my ChatGPT Plus enough?', false],
  ['s2', 'what is a provider', false],
  ['s3', 'set up a server for me', true],
  ['s3', 'Do I need a server?', false],
  ['s1', 'I want it to sort my emails every morning', false],
  ['s1', 'I want help with my emails', false],
  ['s1', 'build me an app that tracks my spending', true],
  ['s1', 'explain it more simply for me', false]
]

test('build words: hhcontent\'s 16 sentences give hhcontent\'s answers', () => {
  for (const [id, words, want] of BUILD_CASES) assert.equal(isBuildRequest(stepById(id), words), want, `${id} "${words}"`)
})

test('build words: a question start skips the check, even with a build phrase inside ("what does install a plugin mean")', () => {
  assert.equal(isBuildRequest(stepById('s4'), 'What does install a plugin mean?'), false)
  assert.equal(isBuildRequest(stepById('s2'), 'Should I add my API key here?'), false)
  assert.equal(isBuildRequest(stepById('s1'), 'why would I build a bot'), false)
  // the same phrases without the question start are build requests
  assert.equal(isBuildRequest(stepById('s4'), 'install a plugin please'), true)
  assert.equal(isBuildRequest(stepById('s1'), 'I would like you to build a bot'), true)
})

test('build words: curly quotes, capitals and extra spaces don\'t hide a phrase; a word inside another word doesn\'t count', () => {
  assert.equal(isBuildRequest(stepById('s2'), 'Here’s   MY KEY'), true)
  assert.equal(isBuildRequest(stepById('s1'), 'Please  build it'), true)
  assert.equal(isBuildRequest(stepById('s1'), 'rebuild items'), false)
  // A step's own words count only on that step.
  assert.equal(isBuildRequest(stepById('s4'), 'connect my gmail'), true)
  assert.equal(isBuildRequest(stepById('s1'), 'connect my gmail'), false)
})

test('hand-over text: goal from the step-1 answer, the words cut to 300 with quotes made single, the step\'s page', () => {
  const s4 = stepById('s4')
  const t1 = handoffText(s4, { s1: 'o_phone' }, 'Please install the "Gmail" plugin')
  assert.ok(t1.startsWith('I\'m setting up Hermes. My goal: answer me from my phone in a chat app. I\'d like you to: "Please install the \'Gmail\' plugin".'))
  assert.ok(t1.endsWith('Official page: https://hermes-agent.nousresearch.com/docs/user-guide/features/plugin-catalog'))
  assert.doesNotMatch(t1, /\{\w+\}/)
  const t2 = handoffText(s4, {}, 'x'.repeat(400))
  assert.match(t2, /My goal: not chosen yet\./)
  assert.ok(t2.includes('"' + 'x'.repeat(REQUEST_MAX_CHARS) + '"'))
  assert.ok(!t2.includes('x'.repeat(REQUEST_MAX_CHARS + 1)))
  assert.equal(handoffText(stepById('s2'), { s1: 'nope' }, 'a').includes('My goal: not chosen yet.'), true)
})

test('the fixed lines are hhcontent\'s words (content/v1-strings.md part 4)', t => {
  const strings = path.join(ROOT, '..', 'content', 'v1-strings.md')
  const want = [LINES.yourAnswer, LINES.fitsGoal, LINES.afterLast, LINES.noCheckedAnswer, ...LINES.handoffLead, LINES.handoffAfter]
  if (!fs.existsSync(strings)) return t.skip('the team folder is not next to the plugin here')
  // hhcontent names one slot "{step docs_url}"; the code fills it as {docs_url}.
  const text = fs.readFileSync(strings, 'utf8').replace('{step docs_url}', '{docs_url}')
  for (const line of want) assert.ok(text.includes(line), line)
})

test('only the official docs open: every link in the data is one, and nothing else passes', () => {
  const urls = [STEPS_DATA.live_base]
  for (const s of STEPS) {
    urls.push(s.handoff.docs_url, ...s.facts.map(f => f.url), ...(s.intro_sources || []).map(x => docsUrl(x.source)))
    if (s.compare) urls.push(docsUrl(s.compare.left.source), docsUrl(s.compare.right.source))
  }
  for (const u of urls) assert.equal(isDocsUrl(u), true, u)
  for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'https://evil.example/docs/', 'https://hermes-agent.nousresearch.com.evil.example/', 'http://hermes-agent.nousresearch.com/docs/', 'https://hermes-agent.nousresearch.com/docs/x" onclick="y', null])
    assert.equal(isDocsUrl(u), false, String(u))
})

test('answers from storage: only real options of real steps', () => {
  assert.deepEqual(cleanAnswers({ s1: 'o_tasks', s2: 'o_here', s4: 'o_enough', x: 'y' }), { s1: 'o_tasks', s4: 'o_enough' })
  assert.deepEqual(cleanAnswers(null), {})
  assert.deepEqual(cleanAnswers('o_tasks'), {})
})
