// find-v2 part 2 (Lead, 11 Nov 11:40; hhtech ask-run 3, For builder 1): no empty name, ever. hhcontent's wording from
// live-v2 changes-13: one fixed sentence above the near picks ("Do you want one of these instead?", near.template),
// short pick labels (pick_label, else the title), and a part or paste button with a blank label counts as no button
// (small_talk.how_that.label_empty_rule): HOW_PART and HOW_PASTE are never said for it.
// A test over every line and every offer the page can build: no “” and no ", ," or "or ?" in what is shown.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TALK_DATA } from '../src/talk-data.js'
import { turnParts, freshVisit, lineFor, TITLED, FACTS, nearOffer, PARTS } from '../src/talk.js'
import { curlyQuotes } from '../src/quotes.js'

const visit = () => freshVisit('open', {}, true)
const BAD = [/\u201c\u201d/, /""/, /, ,/, /\bor \?/, /about ,/, /\{[a-z0-9_]+\}/i, /“\s*”/]
const bad = s => BAD.find(r => r.test(curlyQuotes(String(s))))

test('the sentence above near picks is hhcontent\'s fixed one, for one, two and three picks', () => {
  assert.equal(TALK_DATA.near.template, 'Do you want one of these instead?')
  for (const n of [1, 2, 3]) {
    const out = { kind: 'N1', near_lines: TITLED.slice(10, 10 + n).map(t => ({ gives: t.gives, title: t.title })) }
    nearOffer(out, visit())
    assert.equal(out.offer.text, 'Do you want one of these instead?')
  }
})

test('near picks show pick_label where a line has one, else its title (d_yolo: "YOLO mode: no approval questions")', () => {
  const st = visit()
  const r = lineFor(turnParts('how do i turn on yolo stuff for the zebra', st).out, st, '')
  const y = TITLED.find(t => t.gives.kind === 'fact' && t.gives.need === 'd_yolo')
  assert.equal(y.label, 'YOLO mode: no approval questions')
  const out = { kind: 'N1', near_lines: [{ gives: y.gives, title: y.title }] }
  nearOffer(out, visit())
  assert.deepEqual(out.offer.labels, ['YOLO mode: no approval questions'])
  void r
})

test('every titled line as a near pick, three at a time: the sentence and every label have no empty place', () => {
  for (let i = 0; i < TITLED.length; i += 3) {
    const out = { kind: 'N1', near_lines: TITLED.slice(i, i + 3).map(t => ({ gives: t.gives, title: t.title })) }
    const st = visit()
    nearOffer(out, st)
    const said = lineFor({ ...out, kind: 'N1' }, st, '')
    assert.equal(bad(said.offer.text), undefined, said.offer.text)
    for (const it of said.offer.answers.items) assert.ok(it.label && it.label.trim() && !bad(it.label), JSON.stringify(it))
  }
})

test('every line the page can build from the data, and HOW_PART / HOW_PASTE for every button: no “”, no ", ,", no "or ?"', () => {
  let n = 0
  for (const t of TITLED) {
    const st = visit()
    // what a line that holds things needs on its result (src/talk.js givesOf)
    const g = t.gives.kind === 'W2' ? { ...t.gives, buttons: TALK_DATA.w1_pairs.find(p => p.line === 'W2').terms } : t.gives.kind === 'C1' ? { ...t.gives, buttons: TALK_DATA.topic_picks.find(p => p.gives === 'can').holds } : { ...t.gives }
    const s = lineFor(g, st, '')
    n++
    assert.equal(bad(s.text), undefined, `${s.line}: ${s.text}`)
    if (s.offer) assert.equal(bad(s.offer.text), undefined, s.offer.text)
    const nx = s.next
    if (nx && (nx.kind === 'part' || nx.kind === 'paste')) {
      const kind = nx.kind === 'part' ? 'HOW_PART' : 'HOW_PASTE'
      // the button as the data holds it (howThat hands lineFor the data's next, not the drawn one)
      const raw = nx.kind === 'paste' ? { kind: 'paste', label: nx.label, paste_text: nx.text } : { kind: 'part', label: nx.label, part: Object.keys(PARTS).find(k => PARTS[k].to === nx.to) }
      const h = lineFor({ kind, label: nx.label, button: raw }, visit(), '')
      n++
      assert.equal(bad(h.text), undefined, `${kind} after ${s.line}: ${h.text}`)
      assert.ok(nx.label && nx.label.trim(), `${s.line}: a button with no label`)
    }
  }
  for (const [id, set] of Object.entries(TALK_DATA.offers.sets)) for (const k of ['text', 'text_no_setup']) if (set[k]) assert.equal(bad(set[k]), undefined, `${id}.${k}`)
  assert.ok(n > 250, `${n} lines`)
})

test('a part button with a blank label is no button: "where do i do that" after it gives no HOW_PART (label_empty_rule)', () => {
  const was = FACTS.d_provider.next.label
  try {
    FACTS.d_provider.next.label = '  '
    const st = visit()
    turnParts('it says no provider configured', st)
    const { out } = turnParts('where do i do that', st)
    assert.notEqual(out.kind, 'HOW_PART')
    assert.equal(bad(lineFor(out, st, 'where do i do that').text), undefined)
  } finally {
    FACTS.d_provider.next.label = was
  }
  const st = visit()
  turnParts('it says no provider configured', st)
  assert.equal(turnParts('where do i do that', st).out.kind, 'HOW_PART', 'control: with its label it is HOW_PART')
})

test('the bite: an empty label in HOW_PART would be caught by the check', () => {
  assert.ok(bad(lineFor({ kind: 'HOW_PART', label: '', button: { kind: 'part', label: '', to: '/x' } }, visit(), '').text))
})
