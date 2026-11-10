// The parts of Helper's conversation window (design/talk-r3, version 1 of the speech bubble),
// drawn from plain data. page.js holds the conversation and decides what is said; nothing here
// keeps state, so each part can be drawn and tested alone.
// One thing in the conversation (an "entry"):
//   { id, who: 'you', text }
//   { id, who: 'helper', line, text,
//     answers: null | { kind, hint, items: [{ id, label }] }   answers to pick under the line
//     next:    null | { kind: 'paste', label, text }           a button that opens text to paste
//                   | { kind: 'part', label, to }              a button that opens a Hermes screen
//                   | { kind: 'line', label, line }            a button that makes Helper say one more line
//                   | { kind: 'where', line, text }            no button: in its place, where to find the screen
//     paste:   null | text        text to paste shown at once (the "your own Hermes can" line)
//     opened:  true once a 'paste' button was pressed }
// Classes come from the T table (src/talk.css); the text to paste wears Hermes's own classes.
import { Codicon } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { T, cx } from './look.js'
import { Said } from './reveal.js'
import { BubbleLink } from './bubble-link.js'
import { PasteBox } from './setup-tab.js'

// The small arrow on a button: down when it opens text under itself, right when it leads on.
export const nextIcon = next => (next.kind === 'paste' ? 'chevron-down' : 'arrow-right')
export const ANSWERS_LABEL = 'Answers to pick'

// Helper's older line, small, on its side. A button it had stays as a small underlined link; text
// to paste that was opened stays open; a line about where a screen is stays under it.
function OldLine({ entry, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  return jsxs('div', {
    className: T.old,
    'data-hh': 'old',
    'data-line': entry.line,
    children: [
      entry.text,
      next && next.kind === 'where' ? jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: next.text }, 'where') : null,
      next && next.kind !== 'where'
        ? jsxs(
            'button',
            {
              type: 'button',
              className: T.oldLink,
              'data-hh': 'old-link',
              'aria-expanded': next.kind === 'paste' ? !!entry.opened : undefined,
              onClick: () => onNext(entry),
              children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
            },
            'next'
          )
        : null,
      pasteText ? jsx(PasteBox, { text: pasteText, label: 'Copy' }, 'paste') : null
    ]
  })
}

// The conversation so far: everything said before Helper's newest sentence. It scrolls when full.
export function Conversation({ entries, onNext, scrollRef }) {
  return jsx('div', {
    className: T.conv,
    ref: scrollRef,
    role: 'group',
    'aria-label': 'Conversation so far',
    'data-hh': 'conversation',
    children: entries.map(e =>
      e.who === 'you' ? jsx('div', { className: T.me, 'data-hh': 'me', children: e.text }, e.id) : jsx(OldLine, { entry: e, onNext }, e.id)
    )
  })
}

// Helper's newest sentence, in the filled bubble. The words appear one by one (src/reveal.js) and
// hold their place from the first word, so the bubble has its final size at once. A button or text
// to paste sits inside the bubble under a thin line; its room is held too, and it shows (and can
// be reached with the keyboard) when the line has been said.
//   said: every word of the line is on screen
export function Bubble({ entry, clock, fresh, said, onNext }) {
  const next = entry.next
  const pasteText = entry.paste || (next && next.kind === 'paste' && entry.opened ? next.text : null)
  const inside = []
  if (next && next.kind === 'where') inside.push(jsx('p', { className: T.where, 'data-hh': 'where', 'data-line': next.line, children: next.text }, 'where'))
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
          'aria-expanded': next.kind === 'paste' ? !!entry.opened : undefined,
          onClick: () => said && onNext(entry),
          children: [next.label, jsx(Codicon, { name: nextIcon(next) }, 'icon')]
        },
        'next'
      )
    )
  if (pasteText) inside.push(jsx(PasteBox, { text: pasteText, label: 'Copy' }, 'paste'))
  return jsxs('div', {
    className: T.bubble,
    'data-hh': 'bubble',
    'data-line': entry.line,
    'data-said': said,
    'aria-live': 'polite',
    children: [
      jsx(Said, { clock, id: entry.key, text: entry.text, className: T.line, fresh }, entry.key),
      inside.length
        ? jsx('div', { className: cx(T.inBubble, pasteText && T.inBubbleColumn, !said && T.wait), 'aria-hidden': said ? undefined : true, 'data-hh': 'in-bubble', children: inside }, 'in')
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

// The answers to pick, on the person's side beside the character, drawn like the person's own
// messages. Real buttons in a named group. Their room is held from the line's first word; until
// the line has been said they are unseen and out of the keyboard's way.
function Answers({ answers, said, onPick }) {
  return jsx('div', {
    className: cx(T.answers, !said && T.wait),
    role: 'group',
    'aria-label': ANSWERS_LABEL,
    'aria-hidden': said ? undefined : true,
    'data-hh': 'answers',
    'data-kind': answers.kind,
    children: answers.items.map(a =>
      jsx('button', { type: 'button', className: T.answer, 'data-hh': 'answer', 'data-answer': a.id, tabIndex: said ? 0 : -1, onClick: () => said && onPick(a), children: a.label }, a.id)
    )
  })
}

// The row under the bubble: the piece between bubble and character in its cell, the character on
// the message box's top edge, and the answers beside it.
export function Under({ character, answers, said, onPick }) {
  return jsxs('div', {
    className: T.under,
    'data-hh': 'under',
    children: [
      jsx('div', { className: T.linkCell, 'aria-hidden': true, 'data-hh': 'bubble-link-cell', children: jsx(BubbleLink, {}) }, 'link'),
      jsx('div', { className: T.charSpace }, 'space'),
      jsx('div', { className: T.character, 'data-hh': 'character', children: character }, 'character'),
      answers && answers.items.length ? jsx(Answers, { answers, said, onPick }, 'answers') : null
    ]
  })
}

// The edge to drag, on the window's left side. The page keeps the drag itself (where it began)
// and hands the four handlers in; the keyboard moves it with the arrow keys.
export function Grip({ width, min, max, onDown, onMove, onUp, onKey }) {
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
    onPointerCancel: onUp,
    onKeyDown: onKey,
    children: jsx('span', { className: T.gripPill })
  })
}
