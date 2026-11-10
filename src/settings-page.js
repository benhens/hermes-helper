// Helper's page in Hermes's Settings (Settings, then Plugins, then Helper): what Helper keeps,
// shown and edited as a short file (his words of 10 Nov 20:05: "like memory.md"; hhdesign's
// design/talk-r5 way 1; the words are hhcontent's, JSON keeps.settings_file). One text box, one
// line per kept thing with Helper's reason in brackets. Save reads every line back by fixed rules
// (src/settings-file.js, all or nothing) and asks once before it forgets anything; Undo changes
// puts the box back as stored; "Forget all of this" deletes the record after a Yes.
// It reads and writes the same stored record as Helper's conversation (storage key 'kept'), so
// the conversation sees a change the next time it is put on screen. No model, nothing sent.
// Left out: top_line_2 ("Only your name goes to your AI"), which is for a build that calls a
// model; and a link to Hermes's own Memory & Context, whose address is not in the plugin docs.
import { Button, ListRow, Textarea } from '@hermes/plugin-sdk'
import { useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { TALK_DATA } from './talk-data.js'
import { K } from './look.js'
import { cleanKept, hasKept, keptToStore } from './kept.js'
import { renderKept, saveBox } from './settings-file.js'

const SETTINGS_WORDS = TALK_DATA.keeps.settings_file
const SETTINGS_BOX_ROWS = 7

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
        write(r.stored)
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
    }
    function forgetAll() {
      ctx.storage.remove('kept')
      showStored()
      setSaid(null)
      setForget('done')
    }

    const message = said
      ? said.kind === 'ask'
        ? jsxs('div', {
            className: K.settingsAsk,
            'data-hh': 'settings-ask',
            children: [
              jsx('p', { className: K.settingsText, children: said.question }, 'q'),
              jsx(Button, { size: 'sm', onClick: () => save('yes'), 'data-hh': 'settings-yes', children: SETTINGS_WORDS.would_delete.answers[0].label }, 'yes'),
              jsx(Button, { size: 'sm', variant: 'text', onClick: () => save('no'), 'data-hh': 'settings-no', children: SETTINGS_WORDS.would_delete.answers[1].label }, 'no')
            ]
          })
        : jsx('div', { className: K.settingsMessage, role: 'status', 'data-hh': `settings-${said.kind}`, children: said.lines.map((l, i) => jsx('p', { children: l }, i)) })
      : null

    const boxRow = jsx(ListRow, {
      wide: true,
      title: SETTINGS_WORDS.top_line,
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
          ...SETTINGS_WORDS.under_box.map((l, i) => jsx('p', { className: K.settingsHint, children: l }, `u${i}`)),
          message,
          said && said.kind === 'ask'
            ? null
            : jsxs('div', {
                className: K.settingsButtons,
                children: [
                  jsx(Button, { size: 'sm', onClick: () => save(undefined), 'data-hh': 'settings-save', children: SETTINGS_WORDS.buttons[0] }, 'save'),
                  jsx(Button, { size: 'sm', variant: 'text', onClick: undo, 'data-hh': 'settings-undo', children: SETTINGS_WORDS.buttons[1] }, 'undo')
                ]
              }, 'buttons')
        ]
      })
    })

    const facts = jsxs('div', { className: K.settingsFacts, 'data-hh': 'settings-facts', children: [jsx('p', { children: SETTINGS_WORDS.also_tell }, 'tell'), ...SETTINGS_WORDS.facts.map((f, i) => jsx('p', { children: f }, i))] })

    const FA = SETTINGS_WORDS.forget_all
    const forgetRow = hasKept(stored)
      ? jsxs('div', {
          className: K.settingsForget,
          'data-hh': 'settings-forget',
          children:
            forget === 'ask'
              ? [
                  jsx('p', { className: K.settingsText, children: FA.question }, 'q'),
                  jsx('p', { className: K.settingsHint, children: FA.with_question }, 'with'),
                  jsxs('div', {
                    className: K.settingsButtons,
                    children: [
                      jsx(Button, { size: 'sm', variant: 'secondary', onClick: forgetAll, 'data-hh': 'settings-forget-yes', children: FA.answers[0].label }, 'yes'),
                      jsx(Button, { size: 'sm', variant: 'text', onClick: () => setForget(null), 'data-hh': 'settings-forget-no', children: FA.answers[1].label }, 'no')
                    ]
                  }, 'b')
                ]
              : [
                  jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setForget('ask'), 'data-hh': 'settings-forget-all', children: FA.label }, 'f'),
                  jsx('p', { className: K.settingsHint, children: FA.under }, 'u')
                ]
        })
      : forget === 'done'
        ? jsx('p', { className: K.settingsMessage, role: 'status', 'data-hh': 'settings-forgot', children: FA.after_yes })
        : null

    return jsxs('div', { className: K.settingsPage, 'data-hh': 'settings-page', children: [boxRow, facts, forgetRow] })
  }
}
