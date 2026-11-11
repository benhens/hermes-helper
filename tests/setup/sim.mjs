// setup-chat tests: one person talking to Helper with no page: the ordinary talk (src/talk.js) and the set-up
// conversation (src/setup-chat.js) joined as src/page.js joins them, with the reads handed in by the test.
import { freshVisit, laterVisit, turnParts, lineFor, skip, hasTopicWord, offerSaid } from '../../src/talk.js'
import { setupTyped, setupPress, setupAfter, setupOpening } from '../../src/setup-chat.js'

export const NOTHING = () => ({ model: 'ok', soul: false, jobs: 0, bots: 1 })
// reads: what Hermes holds now (the test changes it to play what the person did in Hermes)
export function person(reads = NOTHING(), { kept = null, met = false } = {}) {
  const st = kept || met ? laterVisit(kept || {}, met) : freshVisit('name')
  const log = []
  const looks = []
  const look = () => (looks.push({ ...reads }), { ...reads })
  const add = s => {
    const { setupOffer, ...line } = s
    log.push(line)
    if (setupOffer) {
      const o = offerSaid(setupOffer, st)
      log.push({ line: 'offer-' + o.set, text: o.text, answers: o.answers })
    }
  }
  const run = mv => mv.go(mv.look ? look() : looks.at(-1) || null).forEach(add)
  const p = {
    st,
    reads,
    log,
    looks,
    // Helper's lines since the last call of said()
    mark: 0,
    said() {
      const out = log.slice(p.mark)
      p.mark = log.length
      return out
    },
    last: () => log.at(-1),
    labels: () => (log.at(-1).answers ? log.at(-1).answers.items.map(i => i.label) : null),
    opening() {
      setupOpening(st, look()).forEach(add)
      return p
    },
    type(text) {
      const mv = setupTyped(text, st, hasTopicWord)
      if (mv) return run(mv), p
      const { out } = turnParts(text, st)
      const s = lineFor(out, st, text)
      const { offer, ...line } = s
      // as src/page.js setupAfterSaid: the set-up line after the answer (setup-chat-2: while a step is open, the step
      // again in place of the answer's offer, unless the answer has things of its own to pick)
      const again = ['F1', 'F2', 'F3', 'WORK_SECRET', 'WORK_LONG', 'WORK_LONG_2', 'WORK_ASK', 'K1', 'OPEN'].includes(out.kind) ? null : setupAfter(st, { picks: !!line.answers })
      log.push(line)
      if (offer && !(again && again.line === 'STEP_BACK')) log.push({ line: 'offer-' + offer.set, text: offer.text, answers: offer.answers })
      if (again) add(again)
      return p
    },
    skip() {
      log.push(lineFor(skip(st), st))
      return p
    },
    // press a thing to pick under Helper's newest line, by its label
    press(label) {
      const item = (log.at(-1).answers ? log.at(-1).answers.items : []).find(i => i.label === label)
      if (!item) throw new Error(`no pick "${label}" under [${log.at(-1).line}] ${log.at(-1).text}: ${JSON.stringify(p.labels())}`)
      if (!item.setup) throw new Error(`"${label}" is not a pick of the set-up conversation`)
      const mv = setupPress(item.setup, st)
      if (!mv) throw new Error(`"${label}" did nothing`)
      return run(mv), p
    },
    button(label) {
      const e = [...log].reverse().find(l => l.next && l.next.label === label)
      if (!e) throw new Error('no button ' + label)
      return run(setupPress(e.next.setup, st)), p
    }
  }
  return p
}
