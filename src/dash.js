// The Dashboard (dash-v1; loom2, his second Loom of 11 Nov: the page is the Dashboard, no tabs). Two parts, top to
// bottom: the top box (three tiles: bots and skills for the whole Hermes with their numbers, plugins with none) and
// Set up: a heading "SET UP {n} of {m}" over a grid of cards, one per thing to set up (content/dash-setup-list-v2.json,
// in its order, Install and Scheduled jobs left out: 9 cards). Every word comes from the team's
// content/dash-setup-list-v2.json and content/dash-words-v1.json, or from Lead's job words where the build says so
// (scripts/dash-data.mjs LOOM2_WORDS); every class from the K and D tables (src/look.js).
// loom2 (his words, 17:10 UTC: "By default no card should be shown as done, only if the person clicks Done"): nothing is
// read to decide what is done. A card is done only when the person pressed its Done button (the kept list
// setup_done_said, as before); the count counts those marks; "Start here" sits on the first card not marked.
// Activity is out (his Loom, 0:05): no chats read. Reads, all read-only, for the tiles only:
//   first   profiles.list (the bots number)
//   then    host.skills.list for each bot (the skills number)
// No AI call, no warning colours, nothing stored but the person's marks: the reads run each time the page is put on
// screen, and again when the app opens another bot.
import { host, useValue, icons, Button, Codicon, CopyButton } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, D, cx } from './look.js'
import { DASH_DATA } from './dash-data.js'
import { DASH_CSS } from './dash-css.js'
import { botRows, openBotName, makeReader } from './setup-reads.js'
import { cardStates, cardColumns, panelAfter, distinctSkills, tileWord, CARD_GAP_PX } from './dash-rules.js'

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
  check: { codicon: 'check', hermes: 'components/ui/select.tsx:113' },
  // the small down arrow after "Open" on the Next row: the steps open below (hhdesign's review of 65b108b, point 5)
  open: { codicon: 'chevron-down', hermes: 'components/ui/select.tsx:38' }
}
const cardIcon = id => DASH_ICONS[id === 'skills' ? 'skills_stop' : id]

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
// loom-fixes: the screens the tiles open (hhtech-loom-n1 2, ran from Helper's page); bots: none opens the Bots tab
export const TILE_GO = { skills: '/capabilities?tab=skills', plugins: '/capabilities?tab=plugins' }

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

// Before the cards' row is measured (and in the tests, which have no layout): this width (2 columns).
export const CARDS_WIDTH_UNMEASURED = 560
// The left side's width under which the tab takes hhdesign's narrow sizes (r5-r7: 720 px wide side at 1180, 580 at 940).
export const DASH_COMPACT_UNDER_PX = 640

const fill = (s, map) => s.replace(/\{(\w+)\}/g, (m, k) => (k in map ? String(map[k]) : m))

// The official Hermes docs: the only web address the page ever hands to the person's browser (the Dashboard's source
// tags; Helper's "Open the Quickstart").
export const HERMES_DOCS_BASE = 'https://hermes-agent.nousresearch.com/docs/'
// It must begin with that address as written, and be a web address that reads back exactly as given: one with ".."
// in its path (a way out of /docs/) reads back shorter and is refused.
export function isHermesDocsUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(HERMES_DOCS_BASE) || /[\s"'<>\\%@]/.test(url)) return false
  try {
    return new URL(url).href === url
  } catch {
    return false
  }
}
// Opens a docs page in the person's browser (the SDK's door to the OS); anything else, or a missing door, is ignored.
export function openHermesDocs(ctx, url) {
  if (!isHermesDocsUrl(url)) return
  try {
    const p = ctx.os && typeof ctx.os.openExternal === 'function' ? ctx.os.openExternal(url) : null
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {}
}

// loom2: a video's address from content/videos.json, checked again where it is used: an https:// address that reads
// back exactly as written (the build has checked it too)
export function isVideoUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://') || /[\s"'<>\\]/.test(url)) return false
  try {
    return new URL(url).href === url
  } catch {
    return false
  }
}

// loom2 point 6: the card's video at the top of the opened card (content/videos.json). With an address: the browser's
// own player, nothing loaded before Play, no Download and no Picture-in-picture, captions when given. Without: a
// quiet 16:9 box with the card's name and "Video coming soon", and no play button that does nothing.
// chat-fix: one component, so Helper's window shows the same place under a reply about a card (src/talk-view.js).
export function CardVideo({ it }) {
  return it.video && isVideoUrl(it.video.url)
    ? jsx('video', {
        className: D.video,
        'data-hh': 'video',
        src: it.video.url,
        poster: isVideoUrl(it.video.poster) ? it.video.poster : undefined,
        controls: true,
        preload: 'none',
        controlsList: 'nodownload',
        disablePictureInPicture: true,
        playsInline: true,
        'aria-label': it.name,
        children: isVideoUrl(it.video.captions) ? jsx('track', { kind: 'captions', src: it.video.captions, srcLang: 'en', label: 'English', default: true }) : null
      })
    : jsxs('div', {
        className: D.videoSoon,
        'data-hh': 'video-soon',
        children: [jsx('span', { className: D.videoName, children: it.name }, 'n'), jsx('span', { children: DASH_DATA.words.setup.video_soon }, 's')]
      })
}

export function makeDashboard(ctx) {
  const read = makeReader(ctx)

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

  // The stop the person left open (dash-v2; hhtech's run: a route button takes them to Hermes's own screen, the page
  // is built again when they come back, and the steps they were following were gone). Kept here, in the page's own
  // memory, until Hermes starts again; nothing is written anywhere. Closing the stop forgets it.
  const kept = { open: null }

  // The tab's state. The page holds it (src/page.js calls useDashboard on every draw, as it held the first build's
  // tabs), so it lives while the page is on screen. active: the Dashboard is the open tab. Each time it is opened
  // (and when the app opens another bot), everything is read again from the start: nothing that was read is kept.
  function useDashboard({ active }) {
    // the bot the app has open, as the app names it; when it gives no name (''), Hermes means its default bot
    const given = useValue(host.state.profile)
    const openBot = openBotName(given)
    const nameGiven = typeof given === 'string' && given.trim() !== ''
    const [reads, setReads] = useState({})
    useEffect(() => {
      if (!active) return undefined
      let alive = true
      setReads({})
      const put = patch => alive && setReads(r => ({ ...r, ...patch }))
      ;(async () => {
        const bots = await read(() => host.profiles.list(), DASH_READ_MS)
        if (!alive) return
        const rows = bots.ok ? botRows(bots.value) : null
        put({ bots: rows ? bots : { ok: false } })
        const skills = rows ? await Promise.all(rows.map(b => read(() => host.skills.list(b.name), DASH_READ_MS))) : null
        if (!alive) return
        put({ skills: skills || [{ ok: false }] })
      })().catch(() => {})
      return () => {
        alive = false
        // the page was left (or another bot opened): what was read goes
        setReads({})
      }
    }, [active, openBot, nameGiven])
    const [open, setOpenNow] = useState(() => kept.open)
    const setOpen = to => {
      const next = typeof to === 'function' ? to(open) : to
      kept.open = next
      setOpenNow(next)
    }
    const [cardsWidth, cardsRef] = useDashWidth()
    const stepsBox = useRef(null)
    // a card just opened: what it holds is brought into view (the page scrolls to it when it is below the fold)
    // (a card found open on coming back is brought into view the same way)
    const [reveal, setReveal] = useState(() => kept.open !== null)
    useEffect(() => {
      if (!reveal || !active) return
      const el = stepsBox.current
      if (!el) return
      setReveal(false)
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
    }, [reveal, active, open])
    const toggle = id => {
      setOpen(o => (o === id ? null : id))
      if (open !== id) setReveal(true)
    }
    // chat-fix: "Open <card> on the Dashboard" under a reply of Helper's: the card opens (it stays open on a second
    // click) and is brought into view, as after a click on the card itself
    const openCard = id => {
      if (!DASH_DATA.items.some(it => it.id === id)) return
      setOpen(id)
      setReveal(true)
    }
    // given: the app's own name for the open bot (loom-fixes: Helper's look reads the same bot, src/page.js)
    return { reads, open, setOpen, toggle, openCard, cardsWidth, cardsRef, stepsBox, given }
  }

  // The Dashboard, drawn from that state. compact: the left side is narrow (hhdesign's 940 px sizes).
  // kept: the record Helper keeps (src/kept.js; its setup_done_said is the person's marks); onMark(id, done): the person
  // pressed Done or Not done yet (src/page.js writes the kept record)
  function renderDashboard(state, { compact = false, kept = {}, onMark = () => {} } = {}) {
    const W = DASH_DATA.words
    const { reads, open, setOpen, toggle, cardsWidth, cardsRef, stepsBox } = state

    /* ---------- the top box: three tiles ---------- */
    const rows = reads.bots && reads.bots.ok ? botRows(reads.bots.value) : null
    const numbers = {
      // undefined = still reading (the waiting block); null = the read failed (no number at all)
      bots: reads.bots ? (rows ? rows.length : null) : undefined,
      skills: reads.skills ? distinctSkills(reads.skills) : undefined
    }
    // loom-fixes (Lead's points 14 and 15, hhtech-loom-n1 1 and 2): a tile with a screen of Hermes's own that lists the
    // same things is a button to that screen; the bots tile stays plain. The plugins tile has no number.
    // loom2 point 4: one plain line under each tile, what the thing is
    const tileLine = key => jsx('span', { className: D.tileLine, 'data-hh': 'tile-line', children: W.stats.lines[key] }, 'line')
    const tileWords = key =>
      key === 'plugins'
        ? [jsx('b', { className: D.tileName, 'data-hh': 'tile-name', children: W.stats.plugins_title }, 'n'), jsx('span', { className: D.tileLabel, children: W.stats.plugins_line }, 'l'), tileLine(key)]
        : [
            numbers[key] === undefined
              ? jsx('i', { className: D.wait, 'data-hh': 'wait', 'aria-hidden': true }, 'n')
              : numbers[key] === null
                ? null
                : jsx('b', { className: D.tileNum, 'data-hh': 'number', children: String(numbers[key]) }, 'n'),
            jsx('span', { className: D.tileLabel, children: tileWord(key, numbers[key], W.stats, compact) }, 'l'),
            // for a screen reader only: the number is still being read, or could not be read
            numbers[key] === undefined
              ? jsx('span', { className: K.srOnly, children: W.stats.waiting }, 'sr')
              : numbers[key] === null
                ? jsx('span', { className: K.srOnly, children: W.stats.not_known }, 'sr')
                : null,
            // a tile that opens Hermes's screen says where it goes (the plugins tile says it on screen)
            TILE_GO[key] ? jsx('span', { className: K.srOnly, children: '. ' + W.stats.plugins_line }, 'go') : null,
            tileLine(key)
          ]
    const tile = key => {
      const inner = [jsx('span', { className: D.tileIcon, children: jsx(DashIcon, { icon: DASH_ICONS[key], size: 20 }) }, 'i'), jsxs('span', { className: D.tileWords, children: tileWords(key) }, 'w')]
      if (!TILE_GO[key]) return jsxs('div', { className: D.tile, 'data-hh': `tile-${key}`, children: inner }, key)
      return jsxs('button', { type: 'button', className: cx(D.tile, D.tileBtn), 'data-hh': `tile-${key}`, 'data-to': TILE_GO[key], onClick: () => goTo(TILE_GO[key]), children: inner }, key)
    }
    const stats = jsx('section', { className: D.stats, 'data-hh': 'stats', children: ['bots', 'skills', 'plugins'].map(tile) }, 'stats')

    /* ---------- Set up: the cards (loom2) ---------- */
    const items = DASH_DATA.items
    const said = Array.isArray(kept.setup_done_said) ? kept.setup_done_said : []
    // done only by the person's own mark; the first card not marked is "Start here"
    const cards = cardStates(said, items)
    const isDone = id => cards.states[items.findIndex(it => it.id === id)] === 'done'
    // as many columns as fit with each card at least CARD_MIN_PX wide
    const columns = cardColumns(cardsWidth || CARDS_WIDTH_UNMEASURED)
    const openAt = open ? items.findIndex(it => it.id === open) : -1
    const openItem = openAt >= 0 ? items[openAt] : null

    const card = (it, i) => {
      const done = cards.states[i] === 'done'
      const start = i === cards.start
      return jsxs(
        'button',
        {
          type: 'button',
          className: cx(D.scard, done && D.done, openAt === i && D.sel),
          'aria-expanded': openAt === i,
          'aria-controls': openAt === i ? 'helper-dash-steps' : undefined,
          'data-hh': 'card',
          'data-card': it.id,
          'data-state': done ? 'done' : 'todo',
          onClick: () => toggle(it.id),
          children: [
            jsxs(
              'span',
              {
                className: D.scardTop,
                children: [
                  jsx('span', { className: D.tileIcon, children: jsx(DashIcon, { icon: cardIcon(it.id), size: 20 }) }, 'i'),
                  jsxs(
                    'span',
                    {
                      className: D.scardHead,
                      children: [
                        jsx('span', { className: D.scardName, 'data-hh': 'card-name', children: it.name }, 'n'),
                        // a marked card says Done; the first card not marked carries "Start here"; any other card: nothing
                        done
                          ? jsxs('span', { className: D.doneLine, 'data-hh': 'card-done', children: [jsx(DashIcon, { icon: DASH_ICONS.check, size: 14 }, 'c'), W.setup.state_done] }, 'd')
                          : start
                            ? jsx('span', { className: D.start, 'data-hh': 'start-here', children: W.setup.start_here }, 's')
                            : null
                      ]
                    },
                    'h'
                  )
                ]
              },
              'top'
            ),
            jsx('span', { className: D.scardWhy, 'data-hh': 'card-why', children: it.why }, 'w')
          ]
        },
        it.id
      )
    }

    // What an opened card holds, full width under its row: the steps (with their route buttons), the text to paste,
    // the Done or Not done yet button, the sources, the close button.
    let panel = null
    if (openItem) {
      const marked = isDone(openItem.id)
      panel = jsxs(
        'div',
        {
          className: D.steps,
          id: 'helper-dash-steps',
          ref: stepsBox,
          role: 'region',
          'aria-label': openItem.name,
          'data-hh': 'steps',
          'data-stop': openItem.id,
          style: { gridColumn: '1 / -1' },
          children: [
            // the pointer to the opened card: over the middle of its column
            jsx('i', { className: D.caret, style: { left: `calc(${(((openAt % columns) + 0.5) * 100) / columns}% - 7px)` }, 'aria-hidden': true }, 'caret'),
            jsx(CardVideo, { it: openItem }, 'video'),
            jsx(
              'ol',
              {
                className: D.ol,
                children: openItem.steps.map((st, k) =>
                  jsxs(
                    'li',
                    {
                      className: D.li,
                      children: [
                        jsx('span', { children: st.text }, 't'),
                        st.route
                          ? jsx('div', { className: D.route, children: jsx(Button, { variant: 'secondary', size: 'xs', 'data-hh': 'route', onClick: () => goTo(st.route.to), children: st.route.label }) }, 'r')
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
                      ...openItem.terminal.paste.map((pp, k) =>
                        jsxs(
                          'div',
                          {
                            className: D.paste,
                            children: [
                              jsx('span', { className: D.pasteFor, children: pp.for }, 'f'),
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
                                        children: pp.text.split(' ').flatMap((word, wi) => [wi ? ' ' : null, jsx('span', { className: D.word, children: pathBreak(word) }, wi)])
                                      },
                                      't'
                                    ),
                                    jsx(CopyButton, { text: pp.text, label: W.setup.copy, appearance: 'button', buttonSize: 'xs', buttonVariant: 'ghost' }, 'c')
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
            // loom2 (his words, 17:10 UTC): every card has a Done button; once marked it reads Not done yet, to take it back
            jsx(
              'div',
              {
                className: D.route,
                children: jsx(Button, {
                  variant: 'secondary',
                  size: 'xs',
                  'data-hh': 'mark',
                  'data-marked': marked,
                  onClick: () => onMark(openItem.id, !marked),
                  children: marked ? W.setup.mark_undo : W.setup.mark_done
                })
              },
              'mark'
            ),
            jsx(
              'div',
              {
                className: D.foot,
                children: openItem.sources.map(src => {
                  const url = docsHref(src.file)
                  return jsx(
                    'a',
                    {
                      className: `${K.chipLink} ${D.src}`,
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
    }
    // the cards, with the opened card's panel after the last card of its row
    const after = openAt >= 0 ? panelAfter(openAt, columns, items.length) : -1
    const grid = items.flatMap((it, i) => (i === after ? [card(it, i), panel] : [card(it, i)]))

    const setup = jsxs(
      'section',
      {
        className: D.setup,
        'data-hh': 'setup',
        children: [
          jsxs(
            'div',
            {
              className: D.head,
              children: [
                jsx('h2', { className: D.title, children: W.setup.title }, 't'),
                jsx(
                  'span',
                  {
                    className: D.count,
                    'data-hh': 'count',
                    // "{n} of {total}": the number marked done in bold
                    children: W.setup.count.split('{n}').flatMap((part, k) =>
                      k === 0 ? fill(part, { total: cards.total }) : [jsx('b', { className: D.countN, children: String(cards.done) }, 'n'), fill(part, { total: cards.total })]
                    )
                  },
                  'c'
                )
              ]
            },
            'head'
          ),
          jsx(
            'div',
            {
              className: D.cards,
              ref: cardsRef,
              'data-hh': 'cards',
              'data-columns': columns,
              style: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: `${CARD_GAP_PX}px` },
              children: grid
            },
            'cards'
          )
        ]
      },
      'setup'
    )

    return jsxs('div', {
      className: cx(D.main, compact && D.compact),
      'data-hh': 'dashboard',
      'data-compact': compact,
      children: [jsx('style', { 'data-hh': 'dash-css', children: DASH_CSS }, 'css'), stats, setup]
    })
  }

  return { useDashboard, renderDashboard }
}
