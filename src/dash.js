// The Dashboard tab (dash-v1, as Pēteris picked it: design/dash-r5 way (ii), r6 Activity, r7 tiles, icons and line).
// Three parts, top to bottom: the top box (three numbers for the whole Hermes), Activity (the open bot's days with a
// chat, GitHub's grid), Set up (the path of 11 stops). Every word comes from content/dash-setup-list-v2.json
// (src/dash-data.js); every rule from src/dash-rules.js; every class from the K and D tables (src/look.js).
// No AI call, no warning colours, nothing stored: the reads run each time the tab is put on screen.
// Reads, all read-only, always naming the bot (hhtech-dash-reads.md and -reads2.md, "For builder:"):
//   first   profiles.list (the bots; the main bot is the one Hermes marks as default)
//   then    setup.runtime_check, profiles.describe, cron.manage list for the main bot; host.status();
//           host.listPersistedSessions for the bot the app has open (not in the SDK docs: feature-checked)
//   then    host.skills.list for each bot (the skills number)
//   last    plugins.manage list for the open bot (slow: up to a second)
import { host, useValue, icons, Button, Codicon, CopyButton } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, D, cx } from './look.js'
import { DASH_DATA } from './dash-data.js'
import { DASH_CSS } from './dash-css.js'
import { botRows, mainBotName, openBotName, doneFlags, makeReader } from './setup-reads.js'
import { pathStates, chatDays, activityGrid, daysSinceUsed, lastUsedLine, weeksThatFit, distinctSkills, pluginCount } from './dash-rules.js'

// Every icon on the tab is Hermes's own (design/dash-r7/notes.md, the table; docs/answers/hhtech-dash-icons.md).
// codicon: Hermes's Codicon component; tabler: Hermes's Tabler set through the SDK's `icons`. hermes: where Hermes
// shows that icon for the same thing (apps/desktop/src/..., v0.23.0); nearest: Hermes has no icon for this thing.
export const DASH_ICONS = {
  bots: { codicon: 'hubot', hermes: 'plugins/hermes-bots/roster-pane-toolbar.tsx:139' },
  skills: { codicon: 'zap', hermes: 'components/assistant-ui/reference-kinds.ts:107' },
  plugins: { codicon: 'extensions', hermes: 'app/settings/plugin-settings.tsx:67' },
  install: { codicon: 'cloud-download', hermes: 'components/update-status.tsx:389', nearest: true },
  model: { tabler: 'Box', hermes: 'app/settings/constants.ts:714' },
  first_chat: { codicon: 'robot', hermes: 'app/chat/sidebar/index.tsx:216' },
  personality: { codicon: 'edit', hermes: 'app/chat/sidebar/profile-switcher.tsx:1374' },
  chat_apps: { codicon: 'comment', hermes: 'app/chat/sidebar/index.tsx:230' },
  tools_apps: { codicon: 'symbol-misc', hermes: 'app/chat/sidebar/index.tsx:223' },
  skills_stop: { codicon: 'zap', hermes: 'components/assistant-ui/reference-kinds.ts:107' },
  memory: { tabler: 'Brain', hermes: 'app/settings/constants.ts:776' },
  scheduled_job: { codicon: 'watch', hermes: 'app/chat/sidebar/index.tsx:247' },
  second_bot: { codicon: 'hubot', hermes: 'plugins/hermes-bots/roster-pane-toolbar.tsx:139' },
  safety: { tabler: 'Lock', hermes: 'app/settings/constants.ts:756' },
  // the page's own small controls: the close mark on an opened stop, the tick of "everything is set up"
  close: { codicon: 'close', hermes: 'components/ui/sheet.tsx:76' },
  check: { codicon: 'check', hermes: 'components/ui/select.tsx:113' }
}
const stopIcon = id => DASH_ICONS[id === 'skills' ? 'skills_stop' : id]

// Icon sizes (px) at the places Hermes draws them: 16 in its sidebar and Settings rows, 14 in Settings' sub-rows
// (hhtech-dash-icons.md point 1); 20 on the tiles (hhdesign's r7 size).
const ICON_CLASS = { 14: K.icon14, 16: K.icon16, 20: K.icon20 }
function DashIcon({ icon, size }) {
  if (icon.tabler) {
    const Tabler = icons && icons[icon.tabler]
    return Tabler ? jsx(Tabler, { className: ICON_CLASS[size], 'aria-hidden': true }) : null
  }
  return jsx(Codicon, { name: icon.codicon, size, 'aria-hidden': true })
}

// How long a read may take before it counts as failed (makeReader, src/setup-reads.js).
export const DASH_READ_MS = 30000
export const DASH_SLOW_READ_MS = 60000

// The element's own width, from a ResizeObserver on our own markup (0 until measured).
// A long word with a "/" before its end (a web address) may break after its last "/" only.
function pathBreak(word) {
  const at = word.lastIndexOf('/')
  if (word.length < 24 || at <= 0 || at >= word.length - 1) return word
  return [word.slice(0, at + 1), jsx('wbr', {}, 'b'), word.slice(at + 1)]
}

function useDashWidth() {
  const [width, setWidth] = useState(0)
  const holder = useRef(null)
  if (!holder.current) {
    const box = { observer: null }
    box.ref = node => {
      if (box.observer) box.observer.disconnect()
      box.observer = null
      if (!node || typeof ResizeObserver !== 'function') return
      box.observer = new ResizeObserver(entries => {
        const e = entries[entries.length - 1]
        if (e) setWidth(old => (old === Math.round(e.contentRect.width) ? old : Math.round(e.contentRect.width)))
      })
      box.observer.observe(node)
    }
    holder.current = box
  }
  return [width, holder.current.ref]
}

// The path's shape (r5/r7 build.js setup()): 11 points across the road, high and low in turn, joined by soft curves.
export function roadShape(width, compact, here, count = DASH_DATA.items.length) {
  const A = compact ? 16 : 20
  // the name's row: one line of 16 px, or at the narrow size up to two lines of 15 px
  const NAMEH = compact ? 37 : 22
  const YOUH = compact ? 18 : 19
  const RB = compact ? 22 : 26
  const pad = compact ? 16 : 30
  const yu = here >= 0 && here % 2 === 0
  const yd = here >= 0 && here % 2 === 1
  const top = RB + NAMEH + (yu ? YOUH : 0) + 2
  const height = top + 2 * A + RB + NAMEH + (yd ? YOUH : 0) + 2
  const points = Array.from({ length: count }, (_, i) => [pad + (i * (width - 2 * pad)) / (count - 1), top + (i % 2 ? 2 * A : 0)])
  const segments = points.slice(1).map((b, i) => {
    const a = points[i]
    const dx = (b[0] - a[0]) / 2
    return `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]} ${b[0] - dx} ${b[1]} ${b[0]} ${b[1]}`
  })
  // the width a name may take at the narrow size: the room between the stops on its side, less a gap
  const nameRoom = Math.max(40, Math.floor((2 * (width - 2 * pad)) / (count - 1)) - 8)
  return { points, segments, height, nameRoom }
}
// Before the road is measured (and in the tests, which have no layout): this width.
export const ROAD_WIDTH_UNMEASURED = 560
// The left side's width under which the tab takes hhdesign's narrow sizes (r5-r7: 720 px wide side at 1180, 580 at 940).
export const DASH_COMPACT_UNDER_PX = 640
// Activity's squares: 8 px, 2 px apart; until the grid is measured, 16 weeks (the job's number).
const SQ = 8
const SQ_GAP = 2
const WEEKS_UNMEASURED = 16

const fill = (s, map) => s.replace(/\{(\w+)\}/g, (m, k) => (k in map ? String(map[k]) : m))

// The official Hermes docs: the only web address the page ever hands to the person's browser (the Dashboard's source
// tags; Helper's "Open the Quickstart").
export const HERMES_DOCS_BASE = 'https://hermes-agent.nousresearch.com/docs/'
export const isHermesDocsUrl = url => typeof url === 'string' && url.startsWith(HERMES_DOCS_BASE) && !/[\s"'<>]/.test(url)
// Opens a docs page in the person's browser (the SDK's door to the OS); anything else, or a missing door, is ignored.
export function openHermesDocs(ctx, url) {
  if (!isHermesDocsUrl(url)) return
  try {
    const p = ctx.os && typeof ctx.os.openExternal === 'function' ? ctx.os.openExternal(url) : null
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {}
}

export function makeDashboard(ctx) {
  const read = makeReader(ctx)
  const request = (method, params, ms = DASH_READ_MS) => read(() => host.request(method, params, ms), ms)

  // Opens a docs page in the person's browser (the SDK's door to the OS; only the official docs).
  const docsHref = file => HERMES_DOCS_BASE + String(file).replace(/\.(md|mdx)$/, '').replace(/(^|\/)index$/, '$1')
  const openDocs = url => openHermesDocs(ctx, url)
  // Opens one of Hermes's own places (a route hhtech ran); a missing door is ignored. Nothing is changed.
  const goTo = to => {
    try {
      if (to === 'new-chat') host.newChat()
      else host.navigate(to)
    } catch {}
  }

  // The tab's state. The page holds it (src/page.js calls useDashboard on every draw, as it held the first build's
  // tabs), so it lives while the page is on screen. active: the Dashboard is the open tab. Each time it is opened
  // (and when the app opens another bot), everything is read again from the start: nothing is kept between visits.
  function useDashboard({ active }) {
    const openBot = openBotName(useValue(host.state.profile))
    const [reads, setReads] = useState({})
    useEffect(() => {
      if (!active) return undefined
      let alive = true
      setReads({})
      const put = patch => alive && setReads(r => ({ ...r, ...patch }))
      // A host door that is missing or throws when looked at counts as missing (not every Hermes has every door).
      const door = get => {
        try {
          const fn = get()
          return typeof fn === 'function' ? fn : null
        } catch {
          return null
        }
      }
      ;(async () => {
        const bots = await read(() => host.profiles.list(), DASH_READ_MS)
        if (!alive) return
        const rows = bots.ok ? botRows(bots.value) : null
        // the main bot's three reads need its name; when the bots read failed they are not made (those stops stay
        // unknown, never another bot's answer)
        const main = mainBotName(rows)
        const notRead = Promise.resolve({ ok: false })
        put({ bots: rows ? bots : { ok: false } })
        const listSessions = door(() => host.listPersistedSessions)
        const getStatus = door(() => host.status)
        const sessions = listSessions ? read(() => listSessions(null, { profile: openBot, limit: 500 }), DASH_READ_MS) : Promise.resolve({ ok: false })
        const status = getStatus ? read(() => getStatus(), DASH_READ_MS) : Promise.resolve({ ok: false })
        const [model, soul, cron, st, ses] = await Promise.all([
          main ? request('setup.runtime_check', { profile: main }) : notRead,
          main ? request('profiles.describe', { name: main }) : notRead,
          main ? request('cron.manage', { action: 'list', profile: main, include_disabled: true }) : notRead,
          status,
          sessions
        ])
        if (!alive) return
        put({ model, soul, cron, status: st, sessions: ses, pathRead: true })
        const skills = rows ? await Promise.all(rows.map(b => read(() => host.skills.list(b.name), DASH_READ_MS))) : null
        if (!alive) return
        put({ skills: skills || [{ ok: false }] })
        const plugins = await request('plugins.manage', { action: 'list', profile: openBot }, DASH_SLOW_READ_MS)
        put({ plugins })
      })().catch(() => {})
      return () => {
        alive = false
        // the tab was left (or another bot opened): what was read goes
        setReads({})
      }
    }, [active, openBot])
    const [open, setOpen] = useState(null)
    const [roadWidth, roadRef] = useDashWidth()
    const [gridWidth, gridRef] = useDashWidth()
    const stepsBox = useRef(null)
    // a stop just opened: its steps are brought into view (at the narrow size the page scrolls to them)
    const [reveal, setReveal] = useState(false)
    useEffect(() => {
      if (!reveal) return
      setReveal(false)
      const el = stepsBox.current
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
    }, [reveal])
    const toggle = id => {
      setOpen(o => (o === id ? null : id))
      if (open !== id) setReveal(true)
    }
    return { reads, open, setOpen, toggle, roadWidth, roadRef, gridWidth, gridRef, stepsBox }
  }

  // The tab, drawn from that state. compact: the left side is narrow (hhdesign's 940 px sizes).
  function renderDashboard(state, { compact = false } = {}) {
    const W = DASH_DATA.words
    const { reads, open, setOpen, toggle, roadWidth, roadRef, gridWidth, gridRef, stepsBox } = state

    /* ---------- the top box: three tiles ---------- */
    const rows = reads.bots && reads.bots.ok ? botRows(reads.bots.value) : null
    const numbers = {
      // undefined = still reading (the waiting block); null = the read failed (no number at all)
      bots: reads.bots ? (rows ? rows.length : null) : undefined,
      skills: reads.skills ? distinctSkills(reads.skills) : undefined,
      plugins: reads.plugins ? pluginCount(reads.plugins) : undefined
    }
    const tile = key =>
      jsxs(
        'div',
        {
          className: D.tile,
          'data-hh': `tile-${key}`,
          children: [
            jsx('span', { className: D.tileIcon, children: jsx(DashIcon, { icon: DASH_ICONS[key], size: 20 }) }, 'i'),
            jsxs(
              'span',
              {
                className: D.tileWords,
                children: [
                  numbers[key] === undefined
                    ? jsx('i', { className: D.wait, 'data-hh': 'wait', 'aria-hidden': true }, 'n')
                    : numbers[key] === null
                      ? null
                      : jsx('b', { className: D.tileNum, 'data-hh': 'number', children: String(numbers[key]) }, 'n'),
                  jsx('span', { className: D.tileLabel, children: W.stats[key] }, 'l')
                ]
              },
              'w'
            )
          ]
        },
        key
      )
    const stats = jsx('section', { className: D.stats, 'data-hh': 'stats', children: ['bots', 'skills', 'plugins'].map(tile) }, 'stats')

    /* ---------- Activity: shown only when the read worked ---------- */
    let activity = null
    const ses = reads.sessions
    if (ses && ses.ok && ses.value && Array.isArray(ses.value.sessions)) {
      const today = new Date()
      const days = chatDays(ses.value.sessions)
      const weeks = gridWidth ? weeksThatFit(gridWidth - 22 - 6, SQ, SQ_GAP) : WEEKS_UNMEASURED
      const grid = activityGrid(days, today, weeks)
      const last = lastUsedLine(daysSinceUsed(days, today))
      const level = n => [D.l0, D.l1, D.l2, D.l3][n]
      activity = jsxs(
        'section',
        {
          className: cx(D.card, D.act),
          'data-hh': 'activity',
          children: [
            jsxs(
              'div',
              {
                className: D.actWords,
                children: [
                  jsx('span', { className: D.title, children: W.activity.title }, 't'),
                  last ? jsx('span', { className: D.lastUsed, 'data-hh': 'last-used', children: last }, 'lu') : null,
                  jsxs(
                    'span',
                    {
                      className: D.key,
                      'aria-hidden': true,
                      children: [
                        W.activity.less,
                        ...[0, 1, 2, 3].map(n => jsx('i', { className: cx(D.keySq, level(n), n === 0 && D.keyFirst, n === 3 && D.keyLast) }, n)),
                        W.activity.more
                      ]
                    },
                    'k'
                  )
                ]
              },
              'w'
            ),
            jsxs(
              'div',
              {
                className: D.gridWrap,
                ref: gridRef,
                'aria-hidden': true,
                children: [
                  jsx('div', { className: D.dayNames, children: W.activity.days.map((d, i) => jsx('span', { children: d }, i)) }, 'd'),
                  jsxs(
                    'div',
                    {
                      children: [
                        jsx('div', { className: D.months, children: grid.months.map(m => jsx('span', { className: D.month, style: { left: `${m.week * (SQ + SQ_GAP)}px` }, children: W.activity.months[m.month] }, m.week)) }, 'm'),
                        jsx(
                          'div',
                          {
                            className: D.grid,
                            'data-hh': 'grid',
                            'data-weeks': weeks,
                            children: grid.cells.map(c =>
                              jsx('i', { className: cx(D.sq, level(c.level), c.today && D.today), 'data-day': c.key, 'data-level': c.level, style: { gridColumn: c.week + 1, gridRow: c.day + 1 } }, c.key)
                            )
                          },
                          'g'
                        )
                      ]
                    },
                    'mg'
                  )
                ]
              },
              'gw'
            )
          ]
        },
        'activity'
      )
    }

    /* ---------- Set up: the path ---------- */
    const items = DASH_DATA.items
    const ready = !!reads.pathRead
    const flags = ready ? doneFlags(reads) : { install: true }
    const path = pathStates(ready ? flags : {}, items)
    // before the path's reads are back: every counted stop waits as not done, nobody is "here", no count
    const states = ready ? path.states : items.map(it => (it.counts ? 'todo' : 'quiet'))
    const here = ready ? path.here : -1
    const width = roadWidth || ROAD_WIDTH_UNMEASURED
    const shape = roadShape(width, compact, here)
    const stateClass = { done: D.done, todo: D.todo, unknown: D.todo, here: D.here, quiet: D.quiet }
    const stateWord = { done: W.setup.state_done, todo: W.setup.state_not_done, unknown: W.setup.state_not_known, here: W.setup.you_are_here, quiet: W.setup.state_not_counted }
    const stops = items.map((it, i) => {
      const s = states[i]
      const size = s === 'quiet' ? 14 : 16
      return jsxs(
        'button',
        {
          type: 'button',
          className: cx(D.stop, stateClass[s], i % 2 ? D.down : D.up, open === it.id && D.sel),
          style: { left: `${shape.points[i][0]}px`, top: `${shape.points[i][1]}px` },
          'aria-label': `${it.mark}: ${stateWord[s]}`,
          'aria-expanded': open === it.id,
          'aria-controls': open === it.id ? 'helper-dash-steps' : undefined,
          'data-hh': 'stop',
          'data-stop': it.id,
          'data-state': s,
          onClick: () => toggle(it.id),
          children: [
            jsx('span', { className: D.dot, children: jsx(DashIcon, { icon: stopIcon(it.id), size }) }, 'd'),
            // the name, and under it (outward from the line) "You are here"; at the narrow size a long name may take
            // two lines, no wider than the room to the next stop on its side
            jsxs(
              'span',
              {
                className: D.label,
                'aria-hidden': true,
                style: compact ? { width: `${shape.nameRoom}px` } : undefined,
                children: [
                  jsx('span', { className: D.name, children: it.mark }, 'n'),
                  s === 'here' ? jsx('span', { className: D.you, 'data-hh': 'you-are-here', children: W.setup.you_are_here }, 'y') : null
                ]
              },
              'l'
            )
          ]
        },
        it.id
      )
    })
    const road = jsxs(
      'div',
      {
        className: D.road,
        ref: roadRef,
        style: { height: `${shape.height}px` },
        'data-hh': 'road',
        children: [
          jsx(
            'svg',
            {
              className: D.lines,
              width,
              height: shape.height,
              'aria-hidden': true,
              children: shape.segments.map((d, i) => jsx('path', { d, className: D.line, 'data-hh': 'line' }, i))
            },
            'svg'
          ),
          ...stops
        ]
      },
      'road'
    )

    let under = null
    const openItem = open ? items.find(it => it.id === open) : null
    if (openItem) {
      const i = items.indexOf(openItem)
      under = jsxs(
        'div',
        {
          className: D.steps,
          id: 'helper-dash-steps',
          ref: stepsBox,
          'data-hh': 'steps',
          'data-stop': openItem.id,
          children: [
            jsx('i', { className: D.caret, style: { left: `${shape.points[i][0] - 7}px` }, 'aria-hidden': true }, 'caret'),
            jsxs(
              'div',
              {
                className: D.stepsHead,
                children: [
                  jsx('span', { className: D.stepsIcon, children: jsx(DashIcon, { icon: stopIcon(openItem.id), size: 14 }) }, 'i'),
                  jsx('h3', { className: D.stepsName, children: openItem.name }, 'n')
                ]
              },
              'head'
            ),
            jsx('p', { className: D.stepsWhy, children: openItem.why }, 'why'),
            jsx(
              'ol',
              {
                className: D.ol,
                children: openItem.steps.map((s, k) =>
                  jsxs(
                    'li',
                    {
                      className: D.li,
                      children: [
                        jsx('span', { children: s.text }, 't'),
                        s.route
                          ? jsx('div', { className: D.route, children: jsx(Button, { variant: 'secondary', size: 'xs', 'data-hh': 'route', onClick: () => goTo(s.route.to), children: s.route.label }) }, 'r')
                          : null
                      ]
                    },
                    k
                  )
                )
              },
              'ol'
            ),
            openItem.terminal
              ? jsxs(
                  'div',
                  {
                    className: D.term,
                    'data-hh': 'terminal',
                    children: [
                      jsx('p', { className: D.termWhen, children: openItem.terminal.when }, 'w'),
                      ...openItem.terminal.paste.map((p, k) =>
                        jsxs(
                          'div',
                          {
                            className: D.paste,
                            children: [
                              jsx('span', { className: D.pasteFor, children: p.for }, 'f'),
                              jsxs(
                                'div',
                                {
                                  className: `${K.bubblePaste} ${D.pasteBox}`,
                                  'data-hh': 'paste',
                                  children: [
                                    // a command breaks only at its spaces, each word kept whole (a web address broke at
                                    // its hyphen and read as two words), except that a web address may break after its last
                                    // "/" (an invisible <wbr>: copied by hand it is the same text); Copy goes under it when
                                    // there is no room beside
                                    jsx(
                                      'code',
                                      {
                                        className: `${K.mono} ${D.pasteText}`,
                                        'data-hh': 'paste-text',
                                        children: p.text.split(' ').flatMap((word, i) => [i ? ' ' : null, jsx('span', { className: D.word, children: pathBreak(word) }, i)])
                                      },
                                      't'
                                    ),
                                    jsx(CopyButton, { text: p.text, label: W.setup.copy, appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' }, 'c')
                                  ]
                                },
                                'p'
                              )
                            ]
                          },
                          k
                        )
                      )
                    ]
                  },
                  'term'
                )
              : null,
            openItem.counts ? null : jsx('p', { className: D.quietLine, 'data-hh': 'not-counted', children: W.setup.not_counted }, 'nc'),
            jsx(
              'div',
              {
                className: D.foot,
                children: openItem.sources.map(src => {
                  const url = docsHref(src.file)
                  return jsx(
                    'a',
                    {
                      className: K.chipLink,
                      href: url,
                      target: '_blank',
                      rel: 'noreferrer',
                      title: url,
                      'data-hh': 'source',
                      onClick: e => {
                        e.preventDefault()
                        openDocs(url)
                      },
                      // a middle click too goes to the web browser, never inside Hermes (as the first build's source tags)
                      onAuxClick: e => {
                        e.preventDefault()
                        openDocs(url)
                      },
                      children: fill(W.setup.source, { file: src.file, line: src.line })
                    },
                    `${src.file}:${src.line}`
                  )
                })
              },
              'foot'
            ),
            jsx(
              'div',
              {
                className: D.close,
                children: jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': W.setup.close, 'data-hh': 'close', onClick: () => setOpen(null), children: jsx(DashIcon, { icon: DASH_ICONS.close, size: 14 }) })
              },
              'x'
            )
          ]
        },
        'steps'
      )
    } else if (ready && here >= 0) {
      const it = items[here]
      under = jsxs(
        'div',
        {
          className: D.next,
          'data-hh': 'next',
          children: [
            jsxs(
              'span',
              {
                className: D.nextWords,
                children: [
                  jsxs(
                    'span',
                    {
                      className: D.nextLine,
                      children: [jsx('span', { className: D.nextLabel, children: W.setup.next }, 'l'), jsx('b', { className: D.nextName, children: it.name }, 'n')]
                    },
                    'a'
                  ),
                  jsx('span', { className: D.nextWhy, children: it.why }, 'w')
                ]
              },
              'words'
            ),
            jsx(Button, { variant: 'link', size: 'inline', 'data-hh': 'open-next', onClick: () => toggle(it.id), children: W.setup.open }, 'open')
          ]
        },
        'next'
      )
    } else if (ready && path.allDone) {
      under = jsxs(
        'div',
        {
          className: D.next,
          'data-hh': 'all-done',
          children: [jsx('span', { className: D.allDone, children: jsx(DashIcon, { icon: DASH_ICONS.check, size: 16 }) }, 'i'), jsx('span', { className: D.nextWhy, children: W.setup.all_done }, 't')]
        },
        'done'
      )
    }

    const setup = jsxs(
      'section',
      {
        className: D.card,
        'data-hh': 'setup',
        children: [
          jsxs(
            'div',
            {
              className: D.head,
              children: [
                jsx('h2', { className: D.title, children: W.setup.title }, 't'),
                ready
                  ? jsx(
                      'span',
                      {
                        className: D.count,
                        'data-hh': 'count',
                        // "{n} of {total}": the number done in bold, as r5 to r7 draw it
                        children: W.setup.count.split('{n}').flatMap((part, k) =>
                          k === 0 ? fill(part, { total: path.total }) : [jsx('b', { className: D.countN, children: String(path.done) }, 'n'), fill(part, { total: path.total })]
                        )
                      },
                      'c'
                    )
                  : null
              ]
            },
            'head'
          ),
          road,
          under
        ]
      },
      'setup'
    )

    return jsxs('div', {
      className: cx(D.main, compact && D.compact),
      'data-hh': 'dashboard',
      'data-compact': compact,
      children: [jsx('style', { 'data-hh': 'dash-css', children: DASH_CSS }, 'css'), stats, activity, setup]
    })
  }

  return { useDashboard, renderDashboard }
}
