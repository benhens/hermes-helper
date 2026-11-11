// Word by word: Helper's lines appear one word after another at a steady pace, while the
// character talks. Two small parts:
//   makeRevealClock  plain code: which words of which line are visible, moved on by one host timer
//                    that runs only while words are appearing (or waiting for the character to rise)
//   Said             one line on screen; it listens to the clock for its own line only, so the page
//                    is not drawn again for every word
// The reply itself is always a finished text (Hermes hands a model's reply over whole): this is
// our own pacing of it, not the model speaking live.
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K } from './look.js'
import { namesWhole } from './quotes.js'

// The pace: one word every 120 ms (a first number; Pēteris has not seen a pace yet).
export const WORD_MS = 120

export function wordsOf(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean)
}

// setInterval is the host's (ctx.setInterval: it returns the function that stops it).
//   show(list)      what is on screen now, in reading order: [{ key, words, fresh }]. A fresh line
//                   the clock has not met yet starts at no words and is revealed in its turn; one
//                   that is not fresh (an older line shown for the first time) is whole at once. A
//                   line that left the screen half way is whole from then on, so nothing replays.
//   shown(key, words, fresh)   how many of the line's words are visible
//   whole(key)      the line is known and fully shown
//   talking()       words are appearing right now (the character talks)
//   onChange(fn)    told when talking starts or stops and when a line becomes whole: the page's
//                   cue to draw itself again. Never told for a word in between.
//   finishAll()     a key press or a mouse press: the rest appears at once
//   holdFor(ms)     words wait this long (the character is rising); the wait is counted in ticks
//   setWhole(on)    reduce motion: every line appears whole, no timer runs
export function makeRevealClock({ setInterval: every, wordMs = WORD_MS }) {
  const lines = new Map() // key -> { total, shown }
  let order = [] // keys still being revealed, in reading order
  let stopTimer = null
  let holdTicks = 0
  let wholeAlways = false
  let wasTalking = false
  let lineDone = false // a line became whole since the page was last told
  const watchers = new Map() // key -> Set of functions
  const heard = new Set()

  const tell = key => {
    const set = watchers.get(key)
    if (set) [...set].forEach(fn => fn())
  }
  const head = () => {
    order = order.filter(key => lines.get(key).shown < lines.get(key).total)
    return order.length ? order[0] : null
  }
  const isTalking = () => holdTicks === 0 && head() !== null
  function settle() {
    const need = holdTicks > 0 || head() !== null
    if (need && !stopTimer) stopTimer = every(tick, wordMs)
    if (!need && stopTimer) {
      stopTimer()
      stopTimer = null
    }
    const now = isTalking()
    if (now !== wasTalking || lineDone) {
      wasTalking = now
      lineDone = false
      ;[...heard].forEach(fn => fn())
    }
  }
  function advance() {
    const key = head()
    if (key === null) return
    const line = lines.get(key)
    line.shown++
    if (line.shown >= line.total) lineDone = true
    tell(key)
  }
  function tick() {
    if (holdTicks > 0 && --holdTicks > 0) return
    advance()
    settle()
  }
  function complete(key) {
    const line = lines.get(key)
    if (line.shown >= line.total) return
    line.shown = line.total
    lineDone = true
    tell(key)
  }

  return {
    show(list) {
      const before = head()
      const onScreen = new Set()
      for (const { key, words, fresh } of list) {
        onScreen.add(key)
        const known = lines.get(key)
        if (!known) {
          lines.set(key, { total: words, shown: fresh && !wholeAlways ? 0 : words })
          if (fresh && !wholeAlways) order.push(key)
          else tell(key)
        } else if (known.total !== words) {
          known.total = words
          known.shown = words
          tell(key)
        }
      }
      for (const key of [...order]) if (!onScreen.has(key)) complete(key)
      // A line that has just become the next one gets its first word at once.
      const next = head()
      if (next !== null && next !== before && lines.get(next).shown === 0 && holdTicks === 0) advance()
      settle()
    },
    shown(key, words, fresh) {
      const line = lines.get(key)
      if (line) return Math.min(line.shown, words)
      return fresh && !wholeAlways ? 0 : words
    },
    whole(key) {
      const line = lines.get(key)
      return !!line && line.shown >= line.total
    },
    talking: isTalking,
    finishAll() {
      for (const key of [...order]) complete(key)
      settle()
    },
    holdFor(ms) {
      if (wholeAlways) return
      holdTicks = Math.max(holdTicks, Math.ceil(ms / wordMs))
      settle()
    },
    setWhole(on) {
      wholeAlways = !!on
      if (!wholeAlways) return
      holdTicks = 0
      for (const key of [...order]) complete(key)
      settle()
    },
    watch(key, fn) {
      if (!watchers.has(key)) watchers.set(key, new Set())
      watchers.get(key).add(fn)
      return () => {
        const set = watchers.get(key)
        if (!set) return
        set.delete(fn)
        if (!set.size) watchers.delete(key)
      }
    },
    onChange(fn) {
      heard.add(fn)
      return () => heard.delete(fn)
    }
  }
}

// Kept out of a text selection: a copied line must not come out twice.
const SPOKEN_ONCE = { userSelect: 'none' }
// Words not yet shown hold their place unseen, so the text has its final size from the first word
// and nothing jumps as words arrive.
const UNSEEN = { visibility: 'hidden' }
// A name in curly marks with no space in it is kept on one line with its marks (src/quotes.js namesWhole;
// hhdesign's review of d1ceddc, 3.1). text is already drawn by curlyQuotes.
const NAME_WHOLE = { whiteSpace: 'nowrap' }
export function keepNamesWhole(text) {
  const parts = namesWhole(text)
  if (!parts) return text
  return parts.map((p, i) => (typeof p === 'string' ? p : jsx('span', { style: NAME_WHOLE, 'data-hh': 'name-whole', children: p.whole }, `n${i}`)))
}

// One line Helper says. A screen reader gets the whole line once (Hermes's own sr-only class);
// the copy the eye sees, growing word by word, is hidden from it. A name kept whole is one word, so it is
// always wholly in the seen part or wholly in the rest.
export function Said({ clock, id, text, className, fresh = false }) {
  const words = wordsOf(text)
  const [, redraw] = useState(0)
  useEffect(() => clock.watch(id, () => redraw(n => n + 1)), [clock, id])
  const n = clock.shown(id, words.length, fresh)
  const rest = words.slice(n).join(' ')
  return jsxs('p', {
    className,
    'data-hh': 'said',
    'data-shown': n,
    'data-words': words.length,
    children: [
      jsx('span', { className: K.srOnly, style: SPOKEN_ONCE, 'data-hh': 'said-whole', children: text }, 'whole'),
      jsxs(
        'span',
        {
          'aria-hidden': true,
          'data-hh': 'said-seen',
          children: [keepNamesWhole(words.slice(0, n).join(' ')), rest ? jsx('span', { style: UNSEEN, 'data-hh': 'said-rest', children: keepNamesWhole((n ? ' ' : '') + rest) }, 'rest') : null]
        },
        'seen'
      )
    ]
  })
}
