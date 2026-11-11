// last-reset 4 (Lead, 11 Nov 15:41; hhtech-final-run "For builder" 3, the no-AI half): "whats a contex window" is about
// a context window, not the app's window: its near picks are never "Closing the app window" or "Bringing the app window
// back". The same words about the app's own window still find those lines (control).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearLines, freshVisit } from '../src/talk.js'

const APP_WINDOW = ['Closing the app window while Hermes runs', 'Bringing the app window back']
const titles = t => nearLines(t, freshVisit('open')).map(n => n.title)

test('4. a context window (also misspelt, or "token window") is not near the app window lines', () => {
  for (const t of ['whats a contex window', 'what is a context window', 'whats the context window', 'how big is the token window', 'what is a context windows']) {
    const got = titles(t)
    assert.deepEqual(got.filter(x => APP_WINDOW.includes(x)), [], `${t}: ${got.join(' / ')}`)
  }
})

test('4. control: a message about the app\'s own window still has those lines near', () => {
  for (const t of ['the app window is gone', 'how do i get the window back']) {
    assert.ok(titles(t).some(x => APP_WINDOW.includes(x)), `${t}: ${titles(t).join(' / ')}`)
  }
})
