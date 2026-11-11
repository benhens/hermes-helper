// Helper's page in Hermes's Settings (Settings, then Plugins, then Helper): what Helper keeps,
// shown and edited as a short file (his words of 10 Nov 20:05: "like memory.md"; hhdesign's
// design/talk-r5 way 1; the words are hhcontent's, JSON keeps.settings_file). One text box, one
// line per kept thing with Helper's reason in brackets. Save reads every line back by fixed rules
// (src/settings-file.js, all or nothing) and asks once before it forgets anything; Undo changes
// puts the box back as stored; "Forget all of this" deletes the record after a Yes.
// It reads and writes the same stored record as Helper's conversation (storage key 'kept'), so
// the conversation sees a change the next time it is put on screen. No model, nothing sent.
// talk-live: in a build with an AI step (src/ai-mode.js) the row has a second top line, "Nothing on this page is
// sent to any AI." (lines_by_mode.settings_top_line_2); with no AI step none. Left out: a link to Hermes's own
// Memory & Context, whose address is not in the plugin docs.
import { Button, ListRow, Textarea } from '@hermes/plugin-sdk'
import { useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { TALK_DATA } from './talk-data.js'
import { AI_MODE } from './ai-mode.js'
import { SETUP_BUILT, SETUP_AI_BUILT } from './setup-built.js'
import { setupRows, SETUP_ROW_KEYS, SETUP_ASKED_KEYS, SETUP_ALL_KEYS } from './setup-chat.js'
import { LIVE_DATA } from './live-data.js'
import { K } from './look.js'
import { cleanKept, hasKept, keptToStore } from './kept.js'
import { renderKept, saveBox } from './settings-file.js'
import { curlyQuotes } from './quotes.js'

const SETTINGS_WORDS = TALK_DATA.keeps.settings_file
// live changes-6: when the set-up conversation's two answers go to the AI too (its AI step, SETUP_AI_BUILT) the line
// names the three rows; else only what the person does is sent, and the line says that (setup-chat changes-1:
// settings_top_line_2_work_only)
export const SETTINGS_TOP_LINE_2 = LIVE_DATA.lines_by_mode[SETUP_BUILT && SETUP_AI_BUILT ? 'settings_top_line_2' : 'settings_top_line_2_work_only'][AI_MODE]
const SETTINGS_BOX_ROWS = 7
// The quote around a line that cannot be read ("{line}"): the line is shown in its own chip without it.
const SETTINGS_QUOTE = SETTINGS_WORDS.read.messages.quote.split('{line}')

export function makeSettingsPage(ctx) {
  const read = () => cleanKept(ctx.storage.get('kept', null))
  const write = rec => {
    const next = keptToStore(rec)
    if (next) ctx.storage.set('kept', next)
    else ctx.storage.remove('kept')
  }

  return function HelperSettings() {
    const [stored, setStored] = useState(read)
    const [box, setBox] = useState(() => renderKept(stored))
    // What shows under the box: null, { kind: 'saved' | 'refused', lines }, or { kind: 'ask', question }
    const [said, setSaid] = useState(null)
    // "Forget all of this": null, 'ask' (the question shows) or 'done'
    const [forget, setForget] = useState(null)
    // the box differs from what is stored
    const changed = box !== renderKept(stored)

    // After a write: read it back and draw the box again from storage, with Helper's reasons.
    function showStored() {
      const back = read()
      setStored(back)
      setBox(renderKept(back))
      return back
    }
    function save(answer) {
      const r = saveBox(stored, box, answer)
      if (r.result === 'saved') {
        // setup-chat: the box holds the name, what you do and the kept answers; the set-up conversation's rows are not
        // in it, so a save of the box leaves them as they are
        write({ ...r.stored, ...Object.fromEntries(SETUP_ALL_KEYS.filter(k => stored[k] !== undefined).map(k => [k, stored[k]])) })
        showStored()
        setSaid({ kind: 'saved', lines: r.message })
      } else if (r.result === 'refused') setSaid({ kind: 'refused', lines: r.message })
      else if (r.result === 'ask') setSaid({ kind: 'ask', question: r.question })
      else setSaid(null) // No: nothing saved, the box stays as typed
      setForget(null)
    }
    function undo() {
      showStored()
      setSaid(null)
      setForget(null)
    }
    function forgetAll() {
      ctx.storage.remove('kept')
      // loom-fixes (Lead's point 17b): the kept conversation with Helper goes with it
      ctx.storage.remove('talk')
      // last-reset (Lead, 11 Nov 15:41): a full reset: the met mark goes too, so after a restart Helper greets as on a
      // first visit and asks the name again. What stays is the page's layout (tab, helperWidth, helperHidden).
      ctx.storage.remove('met')
      showStored()
      setSaid(null)
      setForget('done')
    }

    // After Save (hhdesign's review of e86b410, section 3 point 3): a refusal in three rows. Row 1, the line's
    // number, in the page's own text (the one that catches the eye; no warning colour, no icon); row 2, the line itself as
    // the box holds it, with no quote marks, small mono in a chip that wraps anywhere; row 3, the fix, in the
    // caption size. A secret: row 1 only, the line is never shown again. The words are the data's
    // (keeps.settings_file.read.messages and why), so they are the same as settings_read.py's.
    const refusalRows = lines => {
      const [first, quoted, fix] = lines
      const [pre, post] = SETTINGS_QUOTE
      const line = quoted != null && quoted.startsWith(pre) && quoted.endsWith(post) ? quoted.slice(pre.length, quoted.length - post.length) : quoted
      return [
        jsx('p', { className: K.settingsText, 'data-hh': 'refused-first', children: curlyQuotes(first) }, 'first'),
        line != null ? jsx('code', { className: K.settingsRefusedLine, 'data-hh': 'refused-line', children: line }, 'line') : null,
        fix != null ? jsx('p', { className: K.settingsRefusedFix, 'data-hh': 'refused-fix', children: curlyQuotes(fix) }, 'fix') : null
      ]
    }
    const message = said
      ? said.kind === 'ask'
        ? jsxs('div', {
            className: K.settingsAsk,
            'data-hh': 'settings-ask',
            children: [
              // read out when it comes; the keyboard goes to No, the answer that changes nothing
              jsx('p', { className: K.settingsText, role: 'status', children: curlyQuotes(said.question) }, 'q'),
              jsx(Button, { size: 'sm', onClick: () => save('yes'), 'data-hh': 'settings-yes', children: SETTINGS_WORDS.would_delete.answers[0].label }, 'yes'),
              jsx(Button, { size: 'sm', variant: 'text', autoFocus: true, onClick: () => save('no'), 'data-hh': 'settings-no', children: SETTINGS_WORDS.would_delete.answers[1].label }, 'no')
            ]
          })
        : said.kind === 'refused'
          ? jsx('div', { className: K.settingsRefused, role: 'status', 'data-hh': 'settings-refused', children: refusalRows(said.lines) })
          : jsx('div', { className: K.settingsMessage, role: 'status', 'data-hh': `settings-${said.kind}`, children: said.lines.map((l, i) => jsx('p', { children: curlyQuotes(l) }, i)) })
      : null

    const boxRow = jsx(ListRow, {
      wide: true,
      title: curlyQuotes(SETTINGS_WORDS.top_line),
      description: SETTINGS_TOP_LINE_2 ? curlyQuotes(SETTINGS_TOP_LINE_2) : undefined,
      below: jsxs('div', {
        className: K.settingsBelow,
        children: [
          jsx(Textarea, {
            className: K.settingsBox,
            rows: SETTINGS_BOX_ROWS,
            spellCheck: false,
            value: box,
            placeholder: SETTINGS_WORDS.empty,
            'aria-label': SETTINGS_WORDS.top_line,
            'data-hh': 'settings-box',
            onChange: e => {
              setBox(e.target.value)
              // the forget question goes away when the text is changed while it shows
              if (said && said.kind !== 'refused') setSaid(null)
            },
            // Esc inside the box must not close Settings and lose what was typed
            // (docs/answers/hhtech-hours-r2.md section 2: Hermes closes Settings on Esc)
            onKeyDown: e => {
              if (e.key === 'Escape') e.stopPropagation()
            }
          }, 'box'),
          ...SETTINGS_WORDS.under_box.map((l, i) => jsx('p', { className: K.settingsHint, children: curlyQuotes(l) }, `u${i}`)),
          // the message after Save and the buttons: 8 px above the message (the column's gap), 4 px under it
          jsxs('div', {
            className: K.settingsSaveGroup,
            children: [
              message,
              said && said.kind === 'ask'
                ? null
                : jsxs('div', {
                    className: K.settingsButtons,
                    children: [
                      // as Hermes's own plugin settings form: Save and Undo wait for a change
                      jsx(Button, { size: 'sm', disabled: !changed, onClick: () => save(undefined), 'data-hh': 'settings-save', children: SETTINGS_WORDS.buttons[0] }, 'save'),
                      jsx(Button, { size: 'sm', variant: 'text', disabled: !changed, onClick: undo, 'data-hh': 'settings-undo', children: SETTINGS_WORDS.buttons[1] }, 'undo')
                    ]
                  }, 'buttons')
            ]
          }, 'save-group')
        ]
      })
    })

    // setup-chat (content/helper-setup-chat-v1.json keeps): the four rows the set-up conversation keeps, each with
    // Delete, and the button "Ask me the set-up questions again". (The data also names a Change on each row; it is
    // not built: Delete, or the button, and the conversation asks again.) The two labels are the data's own words
    // (keeps.settings_page).
    const dropKeys = keys => {
      const next = { ...read() }
      for (const k of keys) delete next[k]
      write(next)
      showStored()
      setSaid(null)
    }
    const rows = SETUP_BUILT ? setupRows(stored) : []
    const setupBlock = rows.length
      ? jsxs('div', {
          className: K.settingsRule,
          'data-hh': 'settings-setup',
          children: [
            ...rows.map(([key, name, shows]) =>
              jsx(ListRow, { title: curlyQuotes(name), description: curlyQuotes(shows), action: jsx(Button, { size: 'sm', variant: 'text', onClick: () => dropKeys(SETUP_ROW_KEYS[key]), 'aria-label': `Delete: ${name}`, 'data-hh': 'settings-setup-delete', 'data-key': key, children: 'Delete' }, 'd') }, key)
            ),
            stored.setup_new || stored.setup_goal || stored.setup_current
              ? jsx('div', { className: K.settingsButtons, children: jsx(Button, { size: 'sm', onClick: () => dropKeys(SETUP_ASKED_KEYS), 'data-hh': 'settings-setup-again', children: 'Ask me the set-up questions again' }, 'again') }, 'again')
              : null
          ]
        })
      : null

    const facts = jsxs('div', { className: K.settingsFacts, 'data-hh': 'settings-facts', children: [jsx('p', { children: curlyQuotes(SETTINGS_WORDS.also_tell) }, 'tell'), ...SETTINGS_WORDS.facts.map((f, i) => jsx('p', { children: curlyQuotes(f) }, i))] })

    // "Forget all of this" (hhdesign's review of e86b410, section 1 point 1): under a thin divider, one of
    // Hermes's own settings rows (ListRow: the title, its one faint line under it, the action on the right as
    // Hermes's underlined bold text action, textStrong), not a filled button. The Yes / No question keeps its
    // place under the row. Hermes's own memory row stays out: its address is not in the plugin docs.
    const FA = SETTINGS_WORDS.forget_all
    // last-reset (hhtech-final-run, For builder 2): the row shows whenever anything of the person is stored, also when
    // only the conversation (talk) or the met mark is there and nothing is kept yet. Read at each drawing: Forget all
    // draws the page again (showStored), and the done line then takes the row's place.
    const anyStored = () => {
      try {
        return ctx.storage.get('talk', null) != null || ctx.storage.get('met', false) === true
      } catch {
        return false
      }
    }
    const forgetRow = hasKept(stored) || anyStored()
      ? jsxs('div', {
          className: K.settingsRule,
          'data-hh': 'settings-forget',
          children: [
            jsx(ListRow, {
              title: curlyQuotes(FA.label),
              description: curlyQuotes(FA.under),
              action: jsx(Button, { size: 'sm', variant: 'textStrong', onClick: () => setForget('ask'), 'aria-label': FA.label, 'data-hh': 'settings-forget-all', children: FA.action }, 'f')
            }, 'row'),
            forget === 'ask'
              ? jsxs('div', {
                  className: K.settingsForgetAsk,
                  'data-hh': 'settings-forget-ask',
                  children: [
                    jsx('p', { className: K.settingsText, role: 'status', children: curlyQuotes(FA.question) }, 'q'),
                    // (FA.with_question, "What was already sent to your AI cannot be taken back.", is
                    // left out: in this build nothing is ever sent to an AI)
                    jsxs('div', {
                      className: K.settingsButtons,
                      children: [
                        jsx(Button, { size: 'sm', variant: 'secondary', onClick: forgetAll, 'data-hh': 'settings-forget-yes', children: FA.answers[0].label }, 'yes'),
                        jsx(Button, { size: 'sm', variant: 'text', autoFocus: true, onClick: () => setForget(null), 'data-hh': 'settings-forget-no', children: FA.answers[1].label }, 'no')
                      ]
                    }, 'b')
                  ]
                }, 'ask')
              : null
          ]
        })
      : forget === 'done'
        ? jsx('div', { className: K.settingsRule, 'data-hh': 'settings-forget', children: jsx('p', { className: K.settingsMessage, role: 'status', 'data-hh': 'settings-forgot', children: curlyQuotes(FA.after_yes) }) })
        : null

    return jsxs('div', { className: K.settingsPage, 'data-hh': 'settings-page', children: [boxRow, setupBlock, facts, forgetRow] })
  }
}
