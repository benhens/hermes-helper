// The code checks on the step data from build-v1.md section 6, as one function, so a test can run
// them on the real data and on a doctored copy (to prove they bite).
//   - every fact has a source path, and the path exists under the docs folder (when one is given)
//   - every option points to a real fact of its own step
//   - the intro is under 120 words; all the text of a step is under 1,500 words
//   - 3 to 5 facts, 2 to 5 options; next_rule covers every option and leads to a step or "done";
//     the hand-over template has exactly the three slots code fills
// Word counting is hhcontent's (dev/checks/hhcontent/check-steps-v1.mjs): runs of non-space.
import fs from 'node:fs'
import path from 'node:path'

export const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length

// Everything the person can read in a step (hhcontent's list).
export function stepWords(st) {
  const texts = [
    st.title,
    st.intro,
    st.question,
    ...st.facts.map(f => f.text),
    ...st.options.flatMap(o => [o.label, o.hint || '']),
    ...(st.compare ? ['left', 'right'].flatMap(s => [st.compare[s].title, st.compare[s].text]) : []),
    st.handoff.template
  ]
  return texts.reduce((a, t) => a + words(t), 0)
}

export function stepFindings(data, docsRoot = null) {
  const out = []
  const bad = (where, what) => out.push(`${where}: ${what}`)
  const ids = new Set(data.steps.map(s => s.id))
  const sourceOk = (where, src) => {
    if (!src || typeof src.source !== 'string' || !src.source) return bad(where, 'no source')
    if (docsRoot && !fs.existsSync(path.join(docsRoot, src.source))) bad(where, `source ${src.source} not in the docs`)
  }
  for (const st of data.steps) {
    const W = st.id
    if (words(st.intro) >= 120) bad(W, `intro has ${words(st.intro)} words`)
    const total = stepWords(st)
    if (total >= 1500) bad(W, `step text has ${total} words`)
    if (st.facts.length < 3 || st.facts.length > 5) bad(W, `${st.facts.length} facts`)
    if (st.options.length < 2 || st.options.length > 5) bad(W, `${st.options.length} options`)
    const factIds = new Set(st.facts.map(f => f.id))
    for (const f of st.facts) {
      sourceOk(`${W}.${f.id}`, f)
      if (!f.text) bad(`${W}.${f.id}`, 'no text')
    }
    for (const s of st.intro_sources || []) sourceOk(`${W}.intro`, s)
    if (st.compare) for (const side of ['left', 'right']) sourceOk(`${W}.compare.${side}`, st.compare[side])
    for (const o of st.options) {
      if (!factIds.has(o.fact)) bad(`${W}.${o.id}`, `points to ${o.fact}, not a fact of ${W}`)
      if (!(o.id in st.next_rule)) bad(`${W}.${o.id}`, 'no next_rule')
    }
    for (const [k, v] of Object.entries(st.next_rule)) {
      if (!st.options.some(o => o.id === k)) bad(W, `next_rule ${k} is not an option`)
      if (v !== 'done' && !ids.has(v)) bad(W, `next_rule ${k} leads to ${v}, not a step`)
    }
    const slots = [...st.handoff.template.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
    if (slots.join() !== ['docs_url', 'goal', 'request'].join()) bad(W, `hand-over slots ${slots.join()}`)
    if (st.video !== null) bad(W, 'video is not null')
  }
  return out
}
