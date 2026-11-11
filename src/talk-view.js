// The parts of Helper's conversation window (design/talk-r5: option 4, the things to pick inside the
// message box), drawn from plain data. page.js holds the conversation and decides what is said;
// nothing here keeps state of its own except the box of things to pick, which measures itself.
// One thing in the conversation (an "entry"):
//   { id, who: 'you', text }
//   { id, who: 'helper', line, text,
//     answers: null | { kind, hint, items: [{ id, label }] }   things to pick, in the message box
//     next:    null | { kind: 'paste', label, text }           a button that opens text to paste
//                   | { kind: 'part', label, to }              a button that opens a Hermes screen
//                   | { kind: 'line', label, line }            a button that makes Helper say one more line
//                   | { kind: 'settings', label }              a button that opens Helper's settings page
//                   | { kind: 'forget-all', label }            a button that asks "Delete everything ...?"
//                   | { kind: 'where', line, text }            no button: in its place, where to find the screen
//     paste:   null | text        text to paste shown at once (the "your own Hermes can" line)
//     rows:    null | [text]      the list of what Helper keeps (A1)
//     hint:    null | text        a small faint line under the line (N_HINT)
//     note:    null | { text, link, first }   the faint "Kept: ..." line, above the line it belongs to
//     used:    null | { text, link, topic }   the faint "From what I keep: ..." line, the same place
//     opened:  true once a 'paste' button was pressed }
// Classes come from the T table (src/talk.css); the text to paste wears Hermes's own classes.
import { Codicon, CopyButton } from '@hermes/plugin-sdk'
import { useLayoutEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, T, cx } from './look.js'
import { Said } from './reveal.js'
import { BubbleLink } from './bubble-link.js'
import { columnsFor, linesAllowed } from './layout.js'
import { noteForgotten } from './talk.js'
import { curlyQuotes } from './quotes.js'

// The small arrow on a button: down when it opens something under itself, right when it leads on.
// (talk v2 look: once its part is open, the style sheet turns the down arrow up.)
export const nextIcon = next => (next.kind === 'paste' || next.kind === 'steps' ? 'chevron-down' : 'arrow-right')
export const ANSWERS_LABEL = 'Answers to pick'
// A button that opens something under its line, and closes it again.
const opens = next => next.kind === 'paste' || next.kind === 'steps'

// The list of what Helper keeps, one row per thing (A1). Its rows hold what the person typed: drawn as
// they are, quote marks included.
const Rows = ({ rows }) => jsx('ul', { className: T.rows, 'data-hh': 'kept-rows', children: rows.map((r, i) => jsx('li', { children: r }, i)) })
// The box "From the Hermes docs" (S1, S2): the docs page's own words, set apart from Helper's line so
// it is plainly not Helper speaking (helper-wants-v1.md 1.2), in Hermes's own quote look (hhdesign's
// notes-wants.md rule A: a 2 px line on its left, 12 px in, italic), directly under Helper's line.
const DocsBox = ({ docs, wait }) =>
  jsxs('div', {
    className: cx(T.docs, wait && T.wait),
    'aria-hidden': wait ? true : undefined,
    'data-hh': 'docs',
    children: [
      jsx('p', { className: T.docsHead, 'data-hh': 'docs-head', children: curlyQuotes(docs.head) }, 'h'),
      jsx('p', { className: T.docsWords, 'data-hh': 'docs-words', children: curlyQuotes(docs.words) }, 'w')
    ]
  })
// The clicks to add an optional skill: Hermes's own numbered list (rule B), and the faint line after them.
const Steps = ({ next }) => [
  jsx('ol', { className: T.steps, 'data-hh': 'steps', children: next.steps.map((s, i) => jsx('li', { children: curlyQuotes(s) }, i)) }, 'steps'),
  next.after ? jsx('p', { className: T.after, 'data-hh': 'steps-after', children: curlyQuotes(next.after) }, 'after') : null
]
// Text to paste inside a Helper line (notes-wants.md item 4): Hermes's own small code card with Copy at its
// top right; smaller in an older line. Drawn exactly as it will be pasted.
const BubblePaste = ({ text, old }) =>
  jsxs('div', {
    className: K.bubblePaste,
    'data-hh': 'paste',
    children: [
      jsx('span', { className: old ? K.bubblePasteTextOld : K.bubblePasteText, 'data-hh': 'paste-text', children: text }, 't'),
      jsx(CopyButton, { text, label: 'Copy', appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' }, 'c')
    ]
  })

// The faint lines that go with a Helper line: "Kept: ..." with its link, the first-time line under
// it once, and "From what I keep: ..." with Change. Small faint text on Helper's side, never a
// question; the link is the only thing to press. hhdesign draws them just above the line.
// kept: the record as it is now. A faint line whose thing is no longer kept (forgotten, or replaced
// by a newer one) keeps its words, struck through (<del>), so it no longer reads as kept; its link
// still works. The first-time line under it is about where things are kept and stays as it is.
function notesOf(entry, onNote, kept) {
  const out = []
  const words = (text, gone) => (gone ? jsx('del', { className: T.gone, 'data-hh': 'kept-gone', children: text }, 'gone') : text)
  if (entry.note) {
    const gone = noteForgotten(entry.note, kept)
    out.push(
      jsxs('p', {
        className: T.note,
        'data-hh': 'kept-note',
        'data-forgotten': gone ? 'true' : undefined,
        children: [
          words(entry.note.text, gone),
          jsx('button', { type: 'button', className: T.link, 'data-hh': 'kept-link', onClick: () => onNote(entry, 'see'), children: entry.note.link }, 'link'),
          entry.note.first ? jsx('span', { className: T.noteFirst, 'data-hh': 'kept-first', children: entry.note.first }, 'first') : null
        ]
      }, `${entry.id}-kept`)
    )
  }
  if (entry.used) {
    const gone = noteForgotten(entry.used, kept)
    out.push(
      jsxs('p', {
        className: T.note,
        'data-hh': 'used-note',
        'data-forgotten': gone ? 'true' : undefined,
        children: [words(entry.used.text, gone), jsx('button', { type: 'button', className: T.link, 'data-hh': 'used-link', onClick: () => onNote(entry, 'change'), children: entry.used.link }, 'link')]
      }, `${entry.id}-used`)
    )
  }
  return out
}

// Helper's older line, small, on its side. A button it had stays as a small underlined link; a line
// about where a screen is stays under it, and so does the docs quote. talk v2 look (hhdesign's
// notes-wants.md rule C point 3, settled by Lead): steps or text to paste opened under it close when the
// line moves up into the older lines (src/page.js), and its link stays, so one click opens them again
// here; no wall of text. Text to paste that came with the line itself (H1's) stays.
function OldLine({ entry, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  return jsxs('div', {
    className: T.old,
    'data-hh': 'old',
    'data-line': entry.line,
    children: [
      jsx('span', { className: K.srOnly, children: 'Helper said: ' }, 'who'),
      curlyQuotes(entry.text),
      entry.docs ? jsx(DocsBox, { docs: entry.docs }, 'docs') : null,
      entry.rows ? jsx(Rows, { rows: entry.rows }, 'rows') : null,
      entry.hint ? jsx('p', { className: T.where, 'data-hh': 'hint', children: curlyQuotes(entry.hint) }, 'hint') : null,
      next && next.kind === 'where' ? jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: curlyQuotes(next.text) }, 'where') : null,
      next && next.kind !== 'where'
        ? jsxs(
            'button',
            {
              type: 'button',
              className: T.oldLink,
              'data-hh': 'old-link',
              'data-kind': next.kind,
              'aria-expanded': opens(next) ? !!entry.opened : undefined,
              onClick: () => onNext(entry),
              children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
            },
            'next'
          )
        : null,
      pasteText ? jsx(BubblePaste, { text: pasteText, old: true }, 'paste') : null,
      next && next.kind === 'steps' && entry.opened ? Steps({ next }) : null
    ]
  })
}

// The conversation so far: everything said before Helper's newest sentence, and last the faint
// lines of the newest sentence. It scrolls when it is full and stays at its newest when its room
// changes (the style sheet does that: the outer box stacks from its bottom). A screen reader hears
// who said each line; the eye sees it by the side.
// Which edges of the conversation have something hidden behind them (rule C point 1), as data-fade.
function convFade(el) {
  const above = el.scrollHeight - el.clientHeight + el.scrollTop > 1
  const below = el.scrollTop < -1
  const v = above && below ? 'both' : above ? 'top' : below ? 'bottom' : ''
  if (el.dataset.fade !== v) el.dataset.fade = v
}
export function Conversation({ entries, newest, kept, onNext, onNote, scrollRef }) {
  // talk v2 look (hhdesign's notes-wants.md rule C point 1): an edge of the conversation fades out over
  // 20 px, as Hermes's own FadeScroll does, but only an edge that has something hidden behind it. The
  // conversation stacks from its bottom (column-reverse), so in Chromium its scrollTop is 0 at the newest
  // end and below 0 when scrolled up. Set on our own element, at each draw, scroll and size change.
  useLayoutEffect(() => {
    const el = scrollRef && scrollRef.current
    if (!el || !el.dataset) return
    convFade(el)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => convFade(el)) : null
    if (ro) {
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
    }
    return () => {
      if (ro) ro.disconnect()
    }
  }, [scrollRef])
  const items = []
  for (const e of entries) {
    if (e.who === 'you') items.push(jsxs('div', { className: T.me, 'data-hh': 'me', children: [jsx('span', { className: K.srOnly, children: 'You said: ' }, 'who'), e.text] }, e.id))
    else {
      items.push(...notesOf(e, onNote, kept))
      items.push(jsx(OldLine, { entry: e, onNext }, e.id))
    }
  }
  if (newest) items.push(...notesOf(newest, onNote, kept))
  return jsx('div', {
    className: T.conv,
    ref: scrollRef,
    onScroll: e => convFade(e.currentTarget),
    role: 'group',
    'aria-label': 'Conversation so far',
    'data-hh': 'conversation',
    children: jsx('div', { className: T.convIn, 'data-hh': 'conversation-lines', children: items })
  })
}

// Helper's newest sentence, in the filled bubble. The words appear one by one (src/reveal.js) and
// hold their place from the first word, so the bubble has its final size at once. The list of what
// is kept, a faint hint, a button or text to paste sit inside the bubble under a thin line; their
// room is held too, and they show (and can be reached with the keyboard) when the line is said.
//   said: every word of the line is on screen
export function Bubble({ entry, clock, fresh, said, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  const inside = []
  if (entry.rows) inside.push(jsx(Rows, { rows: entry.rows }, 'rows'))
  if (entry.hint) inside.push(jsx('p', { className: T.where, 'data-hh': 'hint', children: curlyQuotes(entry.hint) }, 'hint'))
  if (next && next.kind === 'where') inside.push(jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: curlyQuotes(next.text) }, 'where'))
  else if (next)
    inside.push(
      jsxs(
        'button',
        {
          type: 'button',
          className: T.button,
          'data-hh': 'bubble-button',
          'data-kind': next.kind,
          tabIndex: said ? 0 : -1,
          'aria-expanded': opens(next) ? !!entry.opened : undefined,
          onClick: () => said && onNext(entry),
          children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
        },
        'next'
      )
    )
  if (pasteText) inside.push(jsx(BubblePaste, { text: pasteText }, 'paste'))
  const steps = next && next.kind === 'steps' && entry.opened
  if (steps) inside.push(...Steps({ next }).filter(Boolean))
  const column = pasteText || entry.rows || entry.hint || steps
  return jsxs('div', {
    className: T.bubble,
    'data-hh': 'bubble',
    'data-line': entry.line,
    'data-said': said,
    'aria-live': 'polite',
    children: [
      jsx(Said, { clock, id: entry.key, text: curlyQuotes(entry.text), className: T.line, fresh }, entry.key),
      // rule A: the docs quote belongs to the sentence, directly under it, with no divider between them;
      // the thin divider comes after it, and only when something follows
      entry.docs ? jsx(DocsBox, { docs: entry.docs, wait: !said }, 'docs') : null,
      inside.length
        ? jsx('div', { className: cx(T.inBubble, column && T.inBubbleColumn, !said && T.wait), 'aria-hidden': said ? undefined : true, 'data-hh': 'in-bubble', children: inside }, 'in')
        : null
    ]
  })
}

// While Helper works on an answer: a small bubble with three dots, one lit, sitting on the piece
// below it. `lit` is which dot (0 to 2); the page moves it on.
export function BusyDots({ lit = 0 }) {
  return jsx('div', {
    className: cx(T.bubble, T.dots),
    'data-hh': 'busy-dots',
    role: 'status',
    'aria-label': 'Helper is working on an answer',
    children: [0, 1, 2].map(i => jsx('i', { className: i === lit ? T.dotOn : undefined }, i))
  })
}

// How many columns a list of things to pick takes (talk-r5): four are two rows of two, three or two
// are one row, so no row is ever half empty; one column when a label would wrap. talk v2 look
// (hhdesign's review of e86b410, section 3 point 1): four picks in a window 420 px or wider stay two by
// two when a label wraps to two lines inside its pick (the grid gives the other pick in its row the same
// height); only a label that would need three lines puts them in one column. Under 420 px as before.
// (columnsFor, linesAllowed and FOUR_TWO_LINES_PX live in src/layout.js, which tests can load alone.)
// A label is taller than that many lines of 19 px.
const LINE_PX = 19
const wraps = (el, lines) => [...el.querySelectorAll('[data-hh="answer-label"]')].some(s => s.getBoundingClientRect().height > LINE_PX * (lines + 0.5))

// The things to pick, inside the message box above the line where the person types. The box grows
// to its rows' height in 0.3 s (a CSS transition on an explicit height, measured from the rows),
// only once Helper's line is said, and shrinks to nothing in 0.3 s right after a pick or a send;
// the character, the bubble and the conversation above ride up and down with it. While it shrinks
// the old labels stay, so nothing jumps; the next list comes in when it has shrunk. Under reduce
// motion Hermes's own rule cuts the transition to nothing, so it changes at once.
//   answers: the newest line's things to pick (or null); open: show them now; width: of the window
export function Picks({ answers, open, onPick, width, onSettled }) {
  const rows = useRef(null)
  const [shown, setShown] = useState(open ? answers : null)
  const [height, setHeight] = useState(0)
  const [stacked, setStacked] = useState('')
  if (open && answers !== shown) setShown(answers)
  // Closed: the old labels while they shrink away, else the next list, already there at height 0
  // while its line is said, so that it can grow.
  const list = open ? answers : shown || answers
  const key = list ? list.items.map(a => a.id).join('|') + '@' + width : ''
  const cols = list ? columnsFor(list.items.length, stacked === key) : 1
  // measured after each draw, before the screen is painted: whether a label wraps, then the height
  useLayoutEffect(() => {
    const el = rows.current
    if (!el) return
    if (cols > 1 && stacked !== key && wraps(el, linesAllowed(list.items.length, width))) return setStacked(key)
    const next = open ? el.scrollHeight : 0
    if (next !== height) setHeight(next)
  })
  if (!list) return null
  return jsx('div', {
    className: T.picks,
    style: { height: `${height}px` },
    'data-hh': 'picks',
    'data-open': open,
    'aria-hidden': open ? undefined : true,
    onTransitionEnd: e => {
      if (e.target !== e.currentTarget) return
      if (!open) setShown(null)
      // talk v2 look: once the box has its new height, the conversation above shows its newest end
      // (hhdesign's notes-wants.md item 1), once per change
      if (onSettled) onSettled()
    },
    children: jsx('div', {
      className: T.answers,
      ref: rows,
      role: 'group',
      'aria-label': ANSWERS_LABEL,
      style: { '--hh-cols': cols },
      'data-hh': 'answers',
      'data-kind': list.kind,
      'data-columns': cols,
      children: list.items.map(a =>
        jsx('button', { type: 'button', className: cx(T.answer, a.more && T.more), 'data-hh': 'answer', 'data-answer': a.id, 'data-more': a.more ? true : undefined, tabIndex: open ? 0 : -1, onClick: () => open && onPick(a), children: jsx('span', { 'data-hh': 'answer-label', children: a.label }) }, a.id)
      )
    })
  })
}

// The row under the bubble: the piece between bubble and character in its cell, and the character
// on the message box's top edge. (The things to pick are in the message box since talk-r5.)
export function Under({ character }) {
  return jsxs('div', {
    className: T.under,
    'data-hh': 'under',
    children: [
      jsx('div', { className: T.linkCell, 'aria-hidden': true, 'data-hh': 'bubble-link-cell', children: jsx(BubbleLink, {}) }, 'link'),
      jsx('div', { className: T.charSpace }, 'space'),
      jsx('div', { className: T.character, 'data-hh': 'character', children: character }, 'character')
    ]
  })
}

// The edge to drag, on the window's left side. The page keeps the drag itself (where it began)
// and hands the handlers in; the keyboard moves it with the arrow keys. A drag the system cancels,
// or whose pointer is lost, ends without a new width.
export function Grip({ width, min, max, onDown, onMove, onUp, onCancel, onKey }) {
  return jsx('div', {
    className: T.grip,
    role: 'separator',
    tabIndex: 0,
    'aria-orientation': 'vertical',
    'aria-label': 'Width of Helper',
    'aria-valuenow': width,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'data-hh': 'grip',
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onCancel,
    onLostPointerCapture: onCancel,
    onKeyDown: onKey,
    children: jsx('span', { className: T.gripPill })
  })
}
