// The Helper page: header with two text tabs, step list, open step, and Helper's conversation
// window on the right.
// B1 = the page shell; B2 = the "Your setup" cards; B3a = the native pass and narrow windows
// (src/layout.js); B3 = Setup steps 1-4 from hhcontent's data (src/steps.js); talk v1 = Helper's
// conversation window: the newest sentence in a bubble above the character, the conversation so
// far above it; talk v2 = design/talk-r5 (option 4: the things to pick inside the message box,
// shown only sometimes), what Helper keeps (src/kept.js) and Helper's settings page
// (src/settings-page.js). What Helper says is decided by code (src/talk.js) from hhcontent's
// pre-written lines; there is no AI step.
// Look: the left side wears Hermes's own UI kit components and the class strings its own screens
// use (K in src/look.js). Helper's window has the one style sheet of our own (src/talk.css, the T
// table), put into a <style> element inside our own page.
import { host, Button, Codicon, RowButton, Textarea, Tip, PRIMARY_ICON_BTN, composerInputBacking, composerSurfaceRing } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, T, cx } from './look.js'
import { TALK_CSS } from './talk-css.js'
import { Character } from './character.js'
import { RISE, expressionFor, asksQuestion, makeBusy } from './expressions.js'
import { makeEyes } from './eyes.js'
import { makeRevealClock, wordsOf } from './reveal.js'
import { prefersReducedMotion, watchReducedMotion } from './motion.js'
import { readState } from './state.js'
import { checkModel, RECHECK_AFTER_MS } from './model-status.js'
import { MAX_INPUT_CHARS } from './key-check.js'
import { STEPS, LATER_STEPS, VERSION_LINE, LINES, stepByNumber, railLines, docsUrl, isDocsUrl, chipLabel, nextAfter, fitsGoal } from './steps.js'
import { laterVisit, turnParts, keptWords, keptWasShown, nameWithMore, pick, pickTopic, pickGroup, pickWant, pageOf, press, pressOffer, offerSaid, offerIsSetup, hasTopicWord, skip, sayLine, change, rmPick, forgetAnswer, seeKept, askForgetAll, lineFor, openingLine, hintFor } from './talk.js'
import { cleanKept, keptToStore } from './kept.js'
import { SETUP_BUILT } from './setup-built.js'
import { setupTyped, setupPress, setupAfter, setupOpening, setupAskMove, setupRestartMove } from './setup-chat.js'
import { makeLook, LOOK_UNSEEN } from './setup-look.js'
import { liveWhyNot, askLive, liveApply, LIVE_SECONDS, SLOW_LINE, slowFollows } from './live-turn.js'
import { lastLines, sendable } from './live-request.js'
import { Conversation, Bubble, BusyDots, Picks, Under, Grip } from './talk-view.js'
import { makeSetupCards, renderYourSetup } from './setup-tab.js'
import { layoutFor, clampHelperWidth, RAIL_PX, RAIL_NUMBERS_PX, STRIP_PX, HELPER_MIN_PX, HELPER_MAX_PX } from './layout.js'

// Column widths (layout only; every colour, font and line comes from Hermes's classes).
const RAIL_WIDTH = `${RAIL_PX}px`
const RAIL_NUMBERS_WIDTH = `${RAIL_NUMBERS_PX}px`
// One press of an arrow key on the edge to drag moves it this far.
const GRIP_KEY_PX = 16
// Keys that are not typing by themselves: pressing one alone does not end the word-by-word reveal.
const LONE_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']
// The longest conversation kept in page memory.
const LOG_MAX = 200

export const TABS = [
  { id: 'setup', label: 'Setup' },
  { id: 'yours', label: 'Your setup' }
]

// Our own page's size, from a ResizeObserver on our own element (never Hermes's markup). The ref
// function is made once, so React doesn't detach and re-attach it on every render; React calls it
// with null on unmount, which stops the observer. 0 until measured, which layoutFor() reads as
// wide and high.
function useOwnSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const holder = useRef(null)
  if (!holder.current) {
    const box = { observer: null }
    box.ref = node => {
      if (box.observer) box.observer.disconnect()
      box.observer = null
      if (!node || typeof ResizeObserver !== 'function') return
      box.observer = new ResizeObserver(entries => {
        const entry = entries[entries.length - 1]
        if (!entry) return
        const next = { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }
        setSize(old => (old.width === next.width && old.height === next.height ? old : next))
      })
      box.observer.observe(node)
    }
    holder.current = box
  }
  return [size, holder.current.ref]
}

// opts.settingsPage: Helper's page in Hermes's Settings was registered (src/main.js); then "See what
// I keep" and "Open Helper settings" open it. opts.pluginId: whose settings page that is.
export function makePage(ctx, opts = {}) {
  const settingsPage = !!opts.settingsPage
  // The documented address of a plugin's settings page (desktop-plugin-sdk.md, "Deep link"),
  // written out here rather than imported, so the plugin still loads on a Hermes too old to have it.
  const settingsHref = `/settings?tab=plugins&plugin=${encodeURIComponent(opts.pluginId || 'helper')}`
  // Kept while the plugin is loaded, shared by every mount of the page:
  // busy = how many model calls are running (the character shows busy while it is above 0);
  // clock = which words of Helper's lines are visible (a line is revealed once, then stays whole).
  const busy = makeBusy()
  const clock = makeRevealClock({ setInterval: (fn, ms) => ctx.setInterval(fn, ms) })
  const useSetupCards = makeSetupCards(ctx, { busy })
  const sleep = ms => new Promise(resolve => ctx.setTimeout(resolve, ms))
  // Last successful model check (ok or none), shared by every mount of the page while the plugin
  // is loaded. A failed check is not kept, so the next open asks again.
  let lastCheck = null
  // What Helper keeps about the person: one record in storage under 'kept' (src/kept.js), read
  // back cleaned. The settings page writes the same record, so it is read again every time the
  // page is put on screen.
  const readKept = () => cleanKept(ctx.storage.get('kept', null))
  // changes-14: the met mark, true or nothing
  const readMet = () => {
    try {
      return ctx.storage.get('met', false) === true
    } catch {
      return false
    }
  }
  // The conversation, kept while the plugin is loaded (leaving the page and coming back keeps
  // it). Nothing of it is written anywhere: it is gone when Hermes restarts. visit = what Helper
  // knows in this visit (src/talk.js), its `kept` the stored record; log = what was said, each
  // entry with an id; typed = the message that led to "Which one do you mean?", kept only while
  // that line is the newest; stored = the record as last written or read.
  let memory = null
  const remembered = () => {
    if (!memory) {
      const kept = readKept()
      // changes-14 (keeps.met): Helper has said hello before, stored under its own key 'met' (no Forget removes
      // it). Set: the window opens with BACK and asks nothing; else OPEN with "What's your name?". A kept name
      // counts as met too (src/talk.js laterVisit); met is then written, so it outlives a Forget all.
      const metStored = readMet()
      memory = { visit: laterVisit(kept, metStored), log: [], nextId: 1, typed: '', stored: JSON.stringify(keptToStore(kept)), metStored }
      memory.log = saidEntries(openingLine(memory.visit), true)
      // setup-chat: a later visit opens with the set-up conversation's returning line (BACK_REC, BACK_Q ...). It is said
      // at once from what is kept, as if nothing could be read; the page then reads Hermes (the look) and, when the
      // person has done nothing yet and the reads change the line (the thing is now done: BACK_DONE), says that instead.
      // What the first, unread line would keep is not kept.
      if (SETUP_BUILT && memory.visit.met) {
        const before = JSON.stringify(memory.visit.kept)
        memory.log = setupOpening(memory.visit, LOOK_UNSEEN).flatMap(setupEntries)
        memory.opening = { kept: before, ids: memory.log.map(e => e.id) }
        for (const k of Object.keys(memory.visit.kept)) delete memory.visit.kept[k]
        Object.assign(memory.visit.kept, JSON.parse(before))
      }
      writeKept()
    }
    return memory
  }
  // The page is on screen again (Hermes draws it fresh after Settings): the record as stored now.
  const rereadKept = () => {
    const m = remembered()
    const kept = readKept()
    // setup-chat: the set-up answers were there and are all gone now (Helper's settings page: "Ask me the set-up
    // questions again", or each row deleted): the conversation starts the questions again (RESTART)
    const had = k => ['setup_new', 'setup_goal', 'setup_current'].some(x => k[x])
    if (SETUP_BUILT && had(m.visit.kept) && !had(kept)) m.setupRestart = true
    for (const k of Object.keys(m.visit.kept)) delete m.visit.kept[k]
    Object.assign(m.visit.kept, kept)
    m.stored = JSON.stringify(keptToStore(kept))
  }
  // After everything the person does: the record is written when it changed, and removed whole
  // when nothing is left in it (told with it). A storage that fails is not kept from answering.
  const writeKept = () => {
    // changes-14: the met mark, written once when the visit has it (the opening ended, or Skip); never removed
    if (memory.visit.met && !memory.metStored) {
      try {
        ctx.storage.set('met', true)
        memory.metStored = true
      } catch {}
    }
    const next = keptToStore(memory.visit.kept)
    const text = JSON.stringify(next)
    if (text === memory.stored) return
    try {
      if (next) ctx.storage.set('kept', next)
      else ctx.storage.remove('kept')
      memory.stored = text
    } catch {}
  }
  const helperEntry = said => {
    const id = memory.nextId++
    return { id, key: `h${id}`, who: 'helper', opened: false, ...said }
  }
  const youEntry = text => ({ id: memory.nextId++, who: 'you', text })
  // offer-t1: what Helper says for one result, as the entries of the conversation: its line and, when the line carries
  // an offer, a second bubble with the offer's question, whose things to pick show in the message box as every other
  // pick. send: whether the line may ever be sent to the AI; the offer's question never is. ask-fix-t1 (PICK_FIRST):
  // the things to pick of the line before stay under it.
  const saidEntries = (said, send) => {
    const { offer, samePicks, ...line } = said
    if (samePicks) {
      const last = [...memory.log].reverse().find(e => e.who === 'helper')
      if (last && last.answers) line.answers = last.answers
    }
    const out = [{ ...helperEntry(line), send }]
    if (offer) out.push({ ...helperEntry({ line: 'offer-' + offer.set, text: offer.text, source: null, answers: offer.answers, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null }), send: false, offer: true })
    return out
  }

  // setup-chat: one line of the set-up conversation (src/setup-chat.js) as the entries of the conversation. Nothing
  // of the set-up conversation is ever among the lines sent to the AI (send: false). A line that ends with an offer
  // (NOT_NOW, ALL_DONE, BACK) gets the offer's bubble under it.
  const setupEntries = s => {
    const { setupOffer, rec, pasteLabel, ...line } = s
    const out = [{ ...helperEntry(line), send: false }]
    if (setupOffer) {
      const offer = offerSaid(setupOffer, memory.visit)
      out.push({ ...helperEntry({ line: 'offer-' + offer.set, text: offer.text, source: null, answers: offer.answers, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null }), send: false, offer: true })
    }
    return out
  }
  // The look: Helper reads what is set up, on this computer (src/setup-look.js). No AI call, nothing sent.
  const look = makeLook(ctx, host)

  /* ---------- talk-live: Helper's AI step (src/live-turn.js; none at all when AI_MODE is no_ai_step) ---------- */
  // Kept while the plugin is loaded, like the conversation: the turn that waits for the person's AI (one at a
  // time), how many of Helper's calls Hermes still works on (also after the page stopped waiting for one: no new
  // call starts until it is 0, so at most one Helper call is ever in Hermes), the model status the page checked
  // last, and the mounted page's setters (null while the page is off screen: a turn that ends then still adds its
  // line to the conversation kept in memory).
  const live = { n: 0, waiting: null, inHermes: 0, status: { state: 'checking' }, view: null }
  // The values a line sent to the AI must not hold (input.never_sent, name_check): the kept name and this
  // visit's name, the kept answers in Helper's words and as stored, and what the person asked Helper to keep.
  const keptValues = () => {
    const v = memory.visit
    const out = [v.name, v.kept.name]
    for (const [k, x] of Object.entries(v.kept)) {
      if (k === 'told' || k === 'name') continue
      if (k === 'asked') out.push(...(Array.isArray(x) ? x : []))
      else if (typeof x === 'string') out.push(x, keptWords(k, x))
    }
    return out.filter(s => typeof s === 'string' && s.trim())
  }
  // setup-chat: after the ordinary talk answered a message typed in place of an answer to Q_NEW or Q_GOAL, the line
  // that asks that question again, once (SETUP_REASK, SETUP_REASK_GOAL); not after the lines that ask it themselves
  const setupReask = result => {
    if (!SETUP_BUILT || !result || ['F1', 'F2', 'F3', 'WORK_SECRET', 'WORK_LONG', 'WORK_LONG_2', 'WORK_ASK', 'K1', 'OPEN'].includes(result.kind)) return []
    const again = setupAfter(memory.visit)
    return again ? setupEntries(again) : []
  }
  // The waiting turn ends: with the AI's line (final) or its no-AI line. Only once, and only if it still waits.
  const liveFinish = (w, final) => {
    if (live.waiting !== w) return
    live.waiting = null
    w.stopTimer()
    w.endBusy()
    const result = final || w.out
    const said = lineFor(result, memory.visit, w.typed, { settingsPage, keptShown: keptWasShown(memory.log) })
    writeKept()
    memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...saidEntries(said, w.sendHelper), ...slowAfter(said), ...setupReask(result)].slice(-LOG_MAX)
    if (live.view) {
      live.view.setLog(memory.log)
      live.view.setFocusAsk(true)
    }
  }
  // live-v2 changes-5: the visit's first AI call (w.firstTurn: the first message that went to the AI, its one or two
  // calls) gave no answer in 12 s or gave no_reply text: the AI step is off for the rest of the visit and SLOW_A is owed,
  // once. A later message whose call fails so only turns the AI step off.
  // setup-chat (hhtech-live-run2, For builder 2; Lead's points 15 and 16): SLOW_A is owed to the written answer that
  // replaced the slow one, so it shows right after that answer or not at all in this visit: when the turn was already
  // closed (the person moved on before the 12 s) it is dropped, never hung under a later, unrelated line.
  const slowFail = w => {
    memory.visit.aiOff = true
    if (w.firstTurn && !memory.visit.slow) memory.visit.slow = live.waiting === w ? 'due' : 'dropped'
  }
  // The entry of SLOW_A right after the line just said, when it is owed and may follow that line (src/live-turn.js
  // slowFollows); it is then said for this visit. It is never sent to the AI (no call follows it in this visit).
  // Called only for the written answer of the turn that failed (liveFinish): when SLOW_A may not follow that answer (a
  // don't-know line, a question, things to pick or an offer, a paste box), it is dropped for this visit.
  const slowAfter = said => {
    if (memory.visit.slow !== 'due') return []
    if (!slowFollows(memory.visit, said)) {
      memory.visit.slow = 'dropped'
      return []
    }
    memory.visit.slow = 'said'
    return [{ ...helperEntry(SLOW_LINE), send: false }]
  }
  // Something the person does while a turn waits (a new message, Skip, a button that makes Helper speak): the
  // waiting message gets its no-AI line at once (content/helper-talk-live-v2.json order.fallback.one_at_a_time).
  const liveClose = () => {
    if (live.waiting) liveFinish(live.waiting, null)
  }
  // Opens a docs page in the person's browser (the SDK's OS door; false when unavailable).
  const openDocs = url => {
    if (!isDocsUrl(url)) return
    try {
      const done = ctx.os && typeof ctx.os.openExternal === 'function' ? ctx.os.openExternal(url) : null
      if (done && typeof done.catch === 'function') done.catch(() => {})
    } catch {}
  }

  function useModelStatus() {
    const fresh = lastCheck && Date.now() - lastCheck.at < RECHECK_AFTER_MS
    const [status, setStatus] = useState(() => (fresh ? lastCheck.result : { state: 'checking' }))
    const running = useRef(false)
    const mounted = useRef(true)

    async function run() {
      if (running.current) return
      running.current = true
      setStatus({ state: 'checking' })
      let result = { state: 'error' }
      try {
        result = await checkModel((method, params, timeout) => host.request(method, params, timeout), { sleep })
      } catch {
        result = { state: 'error' }
      } finally {
        running.current = false
      }
      lastCheck = result.state === 'error' ? null : { result, at: Date.now() }
      if (mounted.current) setStatus(result)
    }

    useEffect(() => {
      mounted.current = true
      if (!fresh) run()
      return () => {
        mounted.current = false
      }
    }, [])

    return [status, run]
  }

  return function HelperPage() {
    const [initial] = useState(() => readState((k, d) => ctx.storage.get(k, d)))
    const [tab, setTab] = useState(initial.tab)
    const [step, setStep] = useState(initial.step)
    const [answers, setAnswers] = useState(initial.answers)
    // The width the person dragged Helper's window to (remembered), and whether Helper is folded
    // away to its strip (not remembered: it starts open, so the greeting is seen first).
    const [helperWidth, setHelperWidth] = useState(initial.helperWidth)
    const [folded, setFolded] = useState(false)
    // Put on screen (again): the stored record may have changed on Helper's settings page.
    useState(rereadKept)
    const [log, setLog] = useState(() => remembered().log)
    // The person's "reduce motion" setting, watched for changes. With it on the character neither
    // moves nor rises, and every line appears whole: a new line is never "fresh" (say(), below),
    // and a line that is appearing when the setting is switched on shows its rest at once (here;
    // declared before the effects that make words wait or appear).
    const [reduced, setReduced] = useState(prefersReducedMotion)
    useEffect(() => watchReducedMotion(setReduced), [])
    useEffect(() => {
      clock.setWhole(reduced)
    }, [reduced])
    // How many model calls are running. And the clock's cue: the page is drawn again when talking
    // starts or stops and when a line becomes whole, never for a single word.
    const [calls, setCalls] = useState(() => busy.count())
    const [, setSaidChange] = useState(0)
    useEffect(() => {
      // Caught up first, in case it changed between the draw and this moment.
      if (busy.count() !== calls) setCalls(busy.count())
      const offBusy = busy.subscribe(setCalls)
      const offClock = clock.onChange(() => setSaidChange(n => n + 1))
      return () => {
        offBusy()
        offClock()
      }
    }, [])
    const revealing = clock.talking()
    // The eyes: one tracker per open page; our own outer box hands it the cursor and the focus.
    const eyes = useRef(null)
    if (!eyes.current) eyes.current = makeEyes({ setTimeout: (fn, ms) => ctx.setTimeout(fn, ms) })
    useEffect(() => () => eyes.current.stop(), [])
    // True once the character has come up after the helper opened (see the effect below).
    const risen = useRef(false)
    const [draft, setDraft] = useState('')
    const [focusAsk, setFocusAsk] = useState(false)
    const [focusStrip, setFocusStrip] = useState(false)
    const [size, measureRef] = useOwnSize()
    const width = size.width
    const [modelStatus, recheck] = useModelStatus()
    // talk-live: the AI step reads the model status this page checked, and ends a waiting turn on this page
    live.status = modelStatus
    // (review) the page drawn last holds the view; a page that leaves lets go only of its own
    const mineView = useRef(null)
    mineView.current = { setLog, setFocusAsk }
    live.view = mineView.current
    useEffect(
      () => () => {
        if (live.view === mineView.current) live.view = null
      },
      []
    )
    const setup = useSetupCards({ active: tab === 'yours', launchModel: modelStatus, recheckLaunch: recheck })
    const askBox = useRef(null)
    // The conversation's scrolling area: kept at the bottom, where the newest words are.
    const helperScroll = useRef(null)
    const stripButton = useRef(null)
    // Where a drag of Helper's edge began: { x, width }.
    const drag = useRef(null)
    // One ref function per tab, made once (like useOwnSize's), kept with the tab buttons.
    const tabRefs = useRef(null)
    if (!tabRefs.current) {
      const els = {}
      tabRefs.current = { els, set: Object.fromEntries(TABS.map(t => [t.id, el => (els[t.id] = el)])) }
    }

    const fit = layoutFor({ width, height: size.height, tab, helperWidth, folded })

    const keep = (key, setter) => value => {
      setter(value)
      ctx.storage.set(key, value)
    }
    const saveTab = keep('tab', setTab)
    const saveStep = keep('step', setStep)

    // The message box takes the keyboard when asked to (a pick, "Ask about this step", Helper
    // opened from its strip); a request that finds no box is dropped, so it can't steal focus later.
    useEffect(() => {
      if (!focusAsk) return
      if (askBox.current) askBox.current.focus()
      setFocusAsk(false)
    }, [focusAsk])

    // "More" pressed: its button is gone, so the keyboard goes to the first of the next picks (in the
    // same message box), not to the page.
    const [focusPick, setFocusPick] = useState(false)
    useEffect(() => {
      if (!focusPick) return
      const box = askBox.current && askBox.current.closest('[data-hh=composer]')
      const first = box && box.querySelector('[data-hh=answer]')
      if (first) first.focus()
      else if (askBox.current) askBox.current.focus()
      setFocusPick(false)
    }, [focusPick])

    // Folding Helper away hands the keyboard back to the strip.
    useEffect(() => {
      if (!focusStrip) return
      if (stripButton.current) stripButton.current.focus()
      setFocusStrip(false)
    }, [focusStrip])

    // The window got wide enough for both sides: a folded Helper comes back as its column. Only a
    // change of width does this, so the one place that folds Helper (foldHelper) stays in charge.
    useEffect(() => {
      if (folded && !fit.narrow) setFolded(false)
    }, [width])

    const currentStep = stepByNumber(step) || STEPS[0]
    const helperShown = fit.helper !== 'strip'

    // Puts Helper away or brings it back, with the keyboard following (to the strip, or to the
    // message box). The strip, Escape and "Ask about this step" all go through it; only the
    // unfolding by a wider window (the effect above) sets the state itself, and moves no focus.
    function foldHelper(away) {
      setFolded(away)
      if (away) setFocusStrip(true)
      else setFocusAsk(true)
    }

    // Helper comes on screen (the page opens with it, or the person opens it from the strip): the
    // character rises from behind the message box, once, and Helper's words wait until it is up.
    // Not on a tab change. `risen` keeps a later redraw from asking for the rising again.
    // Declared before the effect that hands the clock its lines, so the wait is in place first.
    useEffect(() => {
      if (!helperShown) return
      if (reduced) {
        risen.current = true
        // forgotten when the helper leaves the screen, so that it rises on its next opening if
        // reduce motion has been switched off by then
        return () => {
          risen.current = false
        }
      }
      clock.holdFor(RISE.wordsWaitMs)
      const stop = ctx.setTimeout(() => {
        risen.current = true
      }, RISE.ms)
      return () => {
        stop()
        risen.current = false
      }
    }, [helperShown])

    // What Helper is saying on screen right now (filled while the bubble is drawn below); after
    // every draw the clock hears it and reveals what is new, word by word.
    const saidNow = []
    useEffect(() => {
      clock.show(helperShown ? saidNow : [])
    })

    // (Whether the eyes follow the cursor is the drawing's own rule: not while busy, never under
    // reduce motion. src/character.js.)
    const busyNow = calls > 0

    // Something new was said, or Helper came back: show the newest of the conversation so far.
    // (By the newest entry's id, not the count: the count stops changing once the log is full.
    // The style sheet keeps it at its newest when the window or the message box changes size.)
    const newestId = log.length ? log[log.length - 1].id : 0
    const scrollToNewest = () => {
      const el = helperScroll.current
      if (el) el.scrollTop = el.scrollHeight
    }
    useEffect(scrollToNewest, [newestId, helperShown])
    // talk v2 look, point 9 (hhdesign's notes-wants.md item 1): the person's newest message must stay whole
    // above the bubble. When the bubble's height changes after its line is said (steps or text to paste
    // opened or closed under it), the conversation goes to its newest end, once per change: a
    // ResizeObserver on our own bubble, made once for each bubble element. A change of the bubble's width
    // (the window resized) is left alone; the style sheet keeps the newest end in place then.
    const bubbleWatch = useRef({ node: null, ro: null, last: null })
    useEffect(() => {
      const w = bubbleWatch.current
      const conv = helperScroll.current
      const node = conv && conv.parentNode ? conv.parentNode.querySelector(':scope > [data-hh="bubble"]') : null
      if (node === w.node) return
      if (w.ro) w.ro.disconnect()
      Object.assign(w, { node, ro: null, last: null })
      if (!node || typeof ResizeObserver !== 'function') return
      w.ro = new ResizeObserver(() => {
        const r = node.getBoundingClientRect()
        if (w.last && r.width === w.last.width && r.height !== w.last.height && node.dataset.said === 'true') scrollToNewest()
        w.last = { width: r.width, height: r.height }
      })
      w.ro.observe(node)
    })
    useEffect(() => () => bubbleWatch.current.ro && bubbleWatch.current.ro.disconnect(), [])

    /* ---------- the conversation: what the person does, what Helper says back ---------- */
    const visit = remembered().visit
    function addToLog(entries) {
      // talk v2 look (hhdesign's notes-wants.md rule C point 3, settled by Lead): only the newest line keeps
      // its opened part; the line that moves up into the older lines closes its steps or text to paste, and
      // its link stays, so one click opens them again. No wall of text.
      setLog(old => (memory.log = [...old.map(e => (e.opened ? { ...e, opened: false } : e)), ...entries].slice(-LOG_MAX)))
    }
    // Helper's answer to something the person did. shown: the person's side of it, as their message.
    // What Helper keeps is written straight after (src/kept.js), so storage never lags the lines.
    // pressed: shown is the label of a button or pick the person pressed, not their words: never sent to the AI as
    // "Person: ..." (hhtech-live-run: "Person: Skip")
    function answer(result, shown, typed = '', pressed = false) {
      if (!result) return
      // live-v2 changes-2: the conversation shows that something was kept (src/talk.js keptWasShown)
      const said = lineFor(result, visit, typed, { settingsPage, keptShown: keptWasShown(memory.log) })
      writeKept()
      // talk-live: each line notes whether it may ever be sent to the AI (src/live-request.js sendable)
      const may = sendable(result)
      addToLog([shown ? { ...youEntry(shown), send: pressed ? false : may.you } : null, ...saidEntries(said, may.helper), ...(typed ? setupReask(result) : [])].filter(Boolean))
      setFocusAsk(true)
    }

    // setup-chat: one move of the set-up conversation (src/setup-chat.js): the person's side shows at once; when the
    // move needs the look, Hermes is read first (no AI call; the character shows busy meanwhile), then Helper's lines.
    function runSetup(mv, shown) {
      liveClose()
      const n = (memory.setupTurn = (memory.setupTurn || 0) + 1)
      memory.opening = null
      if (shown) addToLog([{ ...youEntry(shown), send: false }])
      const finish = seen => {
        if (memory.setupTurn !== n) return // the person did something else meanwhile
        const says = mv.go(seen)
        writeKept()
        const entries = says.flatMap(setupEntries)
        memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...entries].slice(-LOG_MAX)
        if (live.view) {
          live.view.setLog(memory.log)
          live.view.setFocusAsk(true)
        }
      }
      if (!mv.look) return finish(memory.seen || LOOK_UNSEEN)
      const end = busy.begin()
      look().then(seen => {
        end()
        memory.seen = seen
        finish(seen)
      })
    }
    // setup-chat: "Ask me the set-up questions again" was pressed on Helper's settings page (see rereadKept)
    useEffect(() => {
      if (!memory.setupRestart) return
      memory.setupRestart = false
      runSetup(setupRestartMove(visit), null)
    }, [])
    // setup-chat: the opening of a later visit, once the look has come back (see remembered())
    useEffect(() => {
      const o = memory.opening
      if (!SETUP_BUILT || !o || o.started) return
      o.started = true
      look().then(seen => {
        memory.seen = seen
        if (memory.opening !== o) return
        memory.opening = null
        // only while the opening lines are still all there is
        if (memory.log.length !== o.ids.length || memory.log.some((e, i) => e.id !== o.ids[i])) return
        const was = memory.log.map(e => [e.line, e.text])
        for (const k of Object.keys(visit.kept)) delete visit.kept[k]
        Object.assign(visit.kept, JSON.parse(o.kept))
        visit.setup = undefined
        visit.lastOffer = null
        const entries = setupOpening(visit, seen).flatMap(setupEntries)
        writeKept()
        if (JSON.stringify(entries.map(e => [e.line, e.text])) === JSON.stringify(was)) return
        memory.log = entries
        if (live.view) live.view.setLog(memory.log)
      })
    }, [])

    // The message box: Send or Enter (Shift+Enter makes a new line). Code decides the answer
    // (src/talk.js): a pasted key first, on the full text. A key is never shown back or kept.
    // talk-live: with an AI step (src/ai-mode.js), a message code is not sure of may go to the person's AI
    // (src/live-turn.js liveWhyNot says when not); then the message shows at once, Helper's bubble is the three
    // dots until the AI's line or, at the latest after 12 s, the no-AI line comes. With no_ai_step nothing is sent.
    function send() {
      const typed = draft
      if (!typed.trim()) return
      setDraft('')
      liveClose()
      // setup-chat: an answer to the set-up conversation's open question, a step word, "what should I set up first",
      // "start again": taken by its fixed rules, with no AI call
      if (SETUP_BUILT) {
        const mv = setupTyped(typed, visit, hasTopicWord)
        if (mv) {
          const cs = Array.from(typed.trim())
          return runSetup(mv, cs.length > MAX_INPUT_CHARS ? cs.slice(0, MAX_INPUT_CHARS).join('') + '…' : cs.join(''))
        }
      }
      const before = { last: visit.last, lastKey: visit.lastKey, liveRows: visit.liveRows || null, lastAnswer: visit.lastAnswer || null, lastAnswerKey: visit.lastAnswerKey || null, lastOffer: visit.lastOffer || null, lastTopic: visit.lastTopic || null }
      // Helper's last line for the checks c18 and c23: its line, not the offer's question under it
      const lastHelper = [...memory.log].reverse().find(e => e.who === 'helper' && !e.offer)
      const lines = lastLines(memory.log, keptValues())
      const { pre, out: result } = turnParts(typed, visit)
      // Kept only while "Which one do you mean?" (or W2, skill and plugin compared) is open, for the
      // pick that answers it. A message
      // with a key in it never gets that line, so a key is never kept here.
      memory.typed = result.kind === 'W1' || result.kind === 'W2' ? typed : ''
      const chars = Array.from(typed.trim())
      const shown = chars.length > MAX_INPUT_CHARS ? chars.slice(0, MAX_INPUT_CHARS).join('') + '…' : chars.join('')
      // hhtech-weak-ai: visit.aiOff, set below when a call gave no answer in 12 s or gave thinking text
      const why = liveWhyNot({ pre, text: typed, status: live.status, inHermes: live.inHermes, off: visit.aiOff === true })
      if (why) return answer(result, result.kind === 'K1' ? null : shown, typed)
      // a name given in the same message is cut off: only the part after it is sent (Lead's answer 4)
      const message = pre.name_taken ? nameWithMore(typed)[1] : typed
      const may = sendable(result)
      writeKept()
      // live-v2 changes-5: whether this is the visit's first message that goes to the AI (only its failure owes SLOW_A)
      const firstTurn = !visit.aiTried
      visit.aiTried = true
      const w = { n: ++live.n, out: result, typed, sendHelper: may.helper, endBusy: busy.begin(), stopTimer: () => {}, firstTurn }
      live.waiting = w
      addToLog([{ ...youEntry(shown), send: may.you }])
      const started = Date.now()
      // no answer in 12 s: the written line, and (changes-5 no_reply's "the same as no answer in 12 s") no more calls in
      // this visit
      w.stopTimer = ctx.setTimeout(() => {
        slowFail(w)
        liveFinish(w, null)
      }, LIVE_SECONDS * 1000)
      // Helper's calls, counted while Hermes works on them (host.request keeps its 90 s limit)
      // hhtech-weak-ai: a call with no answer 12 s after it started turns the AI step off for the rest of this visit
      // (also when the person moved on before), since a slow or thinking model is held by each abandoned call for minutes
      const request = (method, params, timeout) => {
        live.inHermes++
        let ended = false
        const stopWatch = ctx.setTimeout(() => {
          if (!ended) slowFail(w)
        }, LIVE_SECONDS * 1000)
        let p
        try {
          p = Promise.resolve(host.request(method, params, timeout))
        } catch (err) {
          p = Promise.reject(err)
        }
        // setup-chat (hhtech-live-run section 6 point 1, live-run2 and ask-run: with no AI that answers Helper's calls,
        // every message still tried one, each failing at once): a call that fails makes no AI answer for this visit, so
        // no further call is tried and no dots show. Why the model check let them through is NOT found: the page already
        // makes no call unless setup.runtime_check said ok (liveWhyNot), so in hhtech's home D that check must have
        // said ok while llm.oneshot had no provider; what it answered there is in no record the Builder can read.
        // So the first call of a visit is still tried (dots once); asked of Lead in the report.
        return p
          .catch(err => {
            visit.aiOff = true
            throw err
          })
          .finally(() => {
            ended = true
            stopWatch()
            live.inHermes--
          })
      }
      // live-v2 changes-4: what the person does, as kept, for the work line (src/live-request.js checks it again)
      askLive({ text: typed, message, pre, out: result, before, lines, lastLine: lastHelper ? lastHelper.text : '', request, msLeft: () => LIVE_SECONDS * 1000 - (Date.now() - started), alive: () => live.waiting === w, work: visit.kept.work || null, names: [visit.name, visit.kept.name] })
        .then(got => {
          // hhtech-weak-ai, changes-5 no_reply: thinking text from any call turns the AI step off for the rest of this
          // visit, also when it comes after the 12 s; from the visit's first call it owes SLOW_A
          if (got && got.thinking) slowFail(w)
          if (live.waiting !== w) return
          liveFinish(w, liveApply(visit, got, result, before, typed))
        })
        .catch(() => liveFinish(w, null))
    }

    // Something picked in the message box: it becomes the person's message, and Helper answers at
    // once. The pick goes by its id, never through the key words: an answer to a topic question, a
    // topic under "Which one do you mean?", a topic, "You, Helper" / "My Hermes", Yes / No under
    // a delete question, a group of the wants or one of its rows. "More" is not a message: the next
    // ones take the picks' place under the same line.
    function pickAnswer(item) {
      if (item.more) {
        const items = pageOf(item.more)
        setFocusPick(true)
        return setLog(old => (memory.log = old.map((e, i) => (i === old.length - 1 && e.answers ? { ...e, answers: { ...e.answers, items } } : e))))
      }
      // setup-chat: an answer of the set-up conversation, or the pick "Set up Hermes" under an offer
      if (item.setup || (SETUP_BUILT && item.offer && offerIsSetup(item.offer))) {
        const mv = item.setup ? setupPress(item.setup, visit) : setupAskMove(visit)
        return mv ? runSetup(mv, item.label) : undefined
      }
      liveClose()
      let result
      if (item.answer) result = pick(item.answer[0], item.answer[1], visit)
      else if (item.which) result = press(item.which, memory.typed, visit)
      else if (item.rm) result = rmPick(item.rm, visit)
      else if (item.forget) result = forgetAnswer(item.forget[0], item.forget[1], visit)
      else if (item.group) result = pickGroup(item.group, visit)
      else if (item.want) result = pickWant(item.want, visit)
      else if (item.offer) result = pressOffer(item.offer, visit) // offer-t1: a thing picked under an offer, by its id
      else result = pickTopic(item.topic, visit)
      answer(result, item.label, '', true)
    }

    // Opens one of Hermes's own screens (a missing door is ignored).
    function go(to) {
      try {
        host.navigate(to)
      } catch {}
    }

    // A button in a Helper line: text to paste opens under it (and closes again); a part opens
    // Hermes's own screen; a line makes Helper say one more pre-written line; "Open Helper
    // settings" opens Helper's page in Settings; "Delete all of it" asks first.
    function pressNext(entry) {
      const next = entry.next
      if (!next) return
      if (next.kind === 'paste' || next.kind === 'steps') return setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, opened: !e.opened } : e))))
      if (next.kind === 'line' || next.kind === 'forget-all') {
        liveClose()
        const result = next.kind === 'line' ? sayLine(next.line, visit) : askForgetAll(visit)
        if (!result) return
        // talk-live-3: the button is done; its older line draws the label as plain faint text (src/talk-view.js)
        setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, pressed: true } : e))))
        return answer(result, next.label, '', true)
      }
      if (next.kind === 'settings') return go(settingsHref)
      // setup-chat: "What did you look at?" under the look line; "Open the Quickstart" (the docs page, in the browser)
      if (next.kind === 'setup') {
        const mv = setupPress(next.setup, visit)
        if (!mv) return
        setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, pressed: true } : e))))
        return runSetup(mv, next.label)
      }
      if (next.kind === 'docs') return openDocs(next.url)
      if (next.kind === 'part') go(next.to)
    }

    // The links in the faint lines: "See what I keep" opens Helper's settings page (or, where that
    // page cannot open, shows the list in the conversation); "Change" asks the question again.
    function pressNote(entry, which) {
      if (which === 'change' && entry.used) {
        liveClose()
        return answer(change(entry.used.topic, visit), entry.used.link, '', true)
      }
      if (which !== 'see' || !entry.note) return
      if (settingsPage) return go(settingsHref)
      liveClose()
      answer(seeKept(visit), entry.note.link, '', true)
    }

    // Skip, at "What's your name?" and "What do you do?".
    function skipOpening() {
      liveClose()
      answer(skip(visit), 'Skip', '', true)
    }

    // Picking an answer on a step: saved. Helper stays silent: its lines come from the conversation only.
    function choose(option) {
      if (answers[currentStep.id] === option.id) return
      const next = { ...answers, [currentStep.id]: option.id }
      setAnswers(next)
      ctx.storage.set('answers', next)
    }

    // "I understand, next step": the step's next_rule picks the next step (code, not the model).
    // After the last step it opens Your setup.
    function finishStep() {
      const to = nextAfter(currentStep, answers[currentStep.id])
      if (to !== 'done') return saveStep(to)
      saveTab('yours')
    }

    // "Ask about this step": the keyboard goes to the message box; a folded Helper opens first.
    function askAboutStep() {
      foldHelper(false)
    }

    /* ---------- Helper's edge to drag: between 360 and 600 px, remembered ---------- */
    // The drag starts from the width on screen (in a squeezed window that is less than the
    // remembered one). Only a drag that moved the edge is saved; a press without a move, a drag
    // the system cancelled and a lost pointer leave the remembered width as it was.
    function gripDown(e) {
      if (e.button !== undefined && e.button !== 0) return
      e.preventDefault()
      drag.current = { x: e.clientX, width: fit.helperPx, before: helperWidth, moved: false }
      if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId !== undefined) e.currentTarget.setPointerCapture(e.pointerId)
    }
    const dragged = e => clampHelperWidth(drag.current.width + (drag.current.x - e.clientX))
    function gripMove(e) {
      if (!drag.current || typeof e.clientX !== 'number') return
      // The edge is on the left: moving it left makes Helper wider.
      if (e.clientX !== drag.current.x) drag.current.moved = true
      if (drag.current.moved) setHelperWidth(dragged(e))
    }
    function gripUp(e) {
      if (!drag.current) return
      const d = drag.current
      drag.current = null
      if (typeof e.clientX !== 'number' || (!d.moved && e.clientX === d.x)) return setHelperWidth(d.before)
      const final = clampHelperWidth(d.width + (d.x - e.clientX))
      setHelperWidth(final)
      ctx.storage.set('helperWidth', final)
    }
    function gripCancel() {
      if (!drag.current) return
      const d = drag.current
      drag.current = null
      setHelperWidth(d.before)
    }
    // Arrow keys move the edge 16 px; Home is the narrowest and End the widest (the least and the
    // most of the value the edge reports). A key that would change nothing on screen (wider, in a
    // window that already squeezes Helper) is left alone, so it cannot change the remembered width
    // unseen.
    function gripKey(e) {
      const to = { ArrowLeft: fit.helperPx + GRIP_KEY_PX, ArrowRight: fit.helperPx - GRIP_KEY_PX, Home: HELPER_MIN_PX, End: HELPER_MAX_PX }[e.key]
      if (to === undefined) return
      e.preventDefault()
      const final = clampHelperWidth(to)
      const squeezed = fit.helperPx < clampHelperWidth(helperWidth)
      if (final === fit.helperPx || (squeezed && final > fit.helperPx)) return
      setHelperWidth(final)
      ctx.storage.set('helperWidth', final)
    }

    /* ---------- header: the two text tabs ---------- */
    // Arrow keys move between the tabs, Home and End go to the first and last (DESIGN.md,
    // Keyboard: one entry point at the selected tab; WAI-ARIA tabs pattern).
    function onTabKey(e, index) {
      const last = TABS.length - 1
      const to = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key]
      if (to === undefined) return
      e.preventDefault()
      const next = TABS[to].id
      saveTab(next)
      const el = tabRefs.current.els[next]
      if (el) el.focus()
    }

    const tabRow = jsx('div', {
      className: K.tabs,
      role: 'tablist',
      'aria-label': 'Helper',
      'data-hh': 'tabs',
      children: TABS.map((t, i) => {
        const on = tab === t.id
        return jsx(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `hh-tab-${t.id}`,
            'aria-selected': on,
            'aria-controls': 'hh-tabpanel',
            tabIndex: on ? 0 : -1,
            'data-active': on,
            className: cx(K.textTab, on ? K.textTabOn : K.textTabIdle),
            ref: tabRefs.current.set[t.id],
            onClick: () => saveTab(t.id),
            onKeyDown: e => onTabKey(e, i),
            children: jsx('span', { className: on ? K.textTabLabelOn : K.textTabLabel, children: t.label })
          },
          t.id
        )
      })
    })

    const header = jsx('div', { className: K.head, 'data-hh': 'header', children: tabRow })

    /* ---------- step list (numbers only when the window is narrow) ---------- */
    const numbersOnly = fit.rail === 'numbers'
    const stepRow = s => {
      const on = s.number === step
      const rail = railLines(s)
      const number = jsx('span', { className: on ? K.rowNumberOn : K.rowNumber, children: s.number }, 'n')
      const button = jsxs(RowButton, {
        className: numbersOnly ? K.rowButtonNumbers : K.rowButton,
        'aria-current': on ? 'step' : undefined,
        'aria-label': numbersOnly ? `Step ${s.number}: ${s.title}` : undefined,
        onClick: () => saveStep(s.number),
        children: numbersOnly
          ? [number]
          : [
              number,
              jsxs(
                'span',
                {
                  className: K.rowText,
                  children: [
                    jsx('span', { className: K.rowTitle, children: rail.title }),
                    rail.sub ? jsx('span', { className: K.rowSub, children: jsx('span', { className: K.truncate, children: rail.sub }) }) : null
                  ]
                },
                't'
              )
            ]
      })
      return jsx(
        'div',
        {
          className: cx(K.row, on ? K.rowActive : K.rowIdle),
          children: numbersOnly ? jsx(Tip, { label: `Step ${s.number}: ${s.title}`, children: button }) : button
        },
        s.number
      )
    }

    // Steps that come later: not buttons. With numbers only, the number carries its title for
    // screen readers (role img + label) and as a tip on hover.
    const laterRow = s => {
      const inner = jsxs('div', {
        className: numbersOnly ? K.rowButtonNumbers : K.rowButton,
        role: numbersOnly ? 'img' : undefined,
        'aria-label': numbersOnly ? `Step ${s.number}: ${s.title}, comes later` : undefined,
        children: [
          jsx('span', { className: K.rowNumber, children: s.number }, 'n'),
          numbersOnly ? null : jsx('span', { className: K.rowText, children: jsx('span', { className: K.rowTitleOff, children: s.title }) }, 't')
        ]
      })
      return jsx(
        'div',
        {
          className: cx(K.row, K.rowIdle),
          'aria-disabled': true,
          children: numbersOnly ? jsx(Tip, { label: `Step ${s.number}: ${s.title}, comes later`, children: inner }) : inner
        },
        s.number
      )
    }

    const rail = jsxs(
      'nav',
      {
        className: K.rail,
        style: { width: numbersOnly ? RAIL_NUMBERS_WIDTH : RAIL_WIDTH },
        'aria-label': 'Steps',
        'data-hh': 'steps',
        'data-numbers-only': numbersOnly,
        children: [
          jsxs('div', {
            className: K.railScroll,
            children: [
              numbersOnly ? null : jsx('div', { className: cx(K.sectionLabel, K.sectionLabelPad), children: 'Steps' }),
              jsx('div', { className: K.rowList, children: STEPS.map(stepRow) }),
              jsx('div', { className: cx(K.sectionLabel, numbersOnly ? K.sectionLabelPad : K.sectionLabelGap), children: numbersOnly ? null : 'After these' }),
              jsx('div', { className: K.rowList, children: LATER_STEPS.map(laterRow) })
            ]
          }),
          numbersOnly ? null : jsx('div', { className: K.railFoot, children: VERSION_LINE })
        ]
      },
      'rail'
    )

    /* ---------- open step ---------- */
    // One primary button per screen (hhdesign fix 6): "I understand, next step"; the rest are secondary.
    const stepActions = jsxs(
      'div',
      {
        className: K.actions,
        children: [
          jsx(Button, { size: 'sm', onClick: finishStep, children: 'I understand, next step' }),
          jsx(Button, { variant: 'secondary', size: 'sm', onClick: askAboutStep, children: 'Ask about this step' })
        ]
      },
      'actions'
    )

    // A source tag that opens its docs page: "Hermes docs › {section}" (v1-strings part 5).
    const sourceLink = (url, label, key) =>
      jsx(
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
          onAuxClick: e => {
            e.preventDefault()
            openDocs(url)
          },
          children: label
        },
        key
      )
    const factSource = f => sourceLink(f.url || docsUrl(f.source), chipLabel(f.section), f.id || f.source + f.section)

    // The open step is wide enough for two columns (the comparison, and the answer cards).
    const wideStep = fit.columns === 2
    const here = currentStep
    const picked = answers[here.id]
    const fits = fitsGoal(answers, here.id)
    const introSources = []
    for (const src of here.intro_sources || []) {
      const key = `${src.source}#${src.section}`
      if (!introSources.some(x => x.key === key)) introSources.push({ key, url: docsUrl(src.source), label: chipLabel(src.section) })
    }

    const stepView = [
      jsxs(
        'header',
        {
          children: [
            jsx('div', { className: K.sectionLabel, children: `Step ${here.number} of ${STEPS.length}` }),
            jsx('h3', { className: K.stepTitle, children: here.title }),
            jsx('p', { className: K.prose, 'data-hh': 'intro', children: here.intro })
          ]
        },
        'head'
      ),
      introSources.length
        ? jsxs(
            'div',
            {
              className: K.chips,
              'data-hh': 'intro-sources',
              children: [jsx('span', { className: K.chipsLabel, children: 'Source' }, 'l'), ...introSources.map(x => sourceLink(x.url, x.label, x.key))]
            },
            'intro-sources'
          )
        : null,
      here.compare
        ? jsx(
            'dl',
            {
              className: cx(K.pairGrid, wideStep && K.twoColumns),
              'data-hh': 'compare',
              'data-columns': fit.columns,
              children: ['left', 'right'].map(side => {
                const c = here.compare[side]
                return jsxs(
                  'div',
                  {
                    className: K.pairSide,
                    children: [jsx('dt', { className: K.pairTitle, children: c.title }), jsx('dd', { className: K.caption, children: c.text }), factSource(c)]
                  },
                  side
                )
              })
            },
            'compare'
          )
        : null,
      jsx(
        'ul',
        {
          className: K.factList,
          'data-hh': 'facts',
          children: here.facts.map(f =>
            jsxs('li', { className: K.fact, 'data-fact': f.id, children: [jsx('p', { className: K.factText, children: f.text }), factSource(f)] }, f.id)
          )
        },
        'facts'
      ),
      jsxs(
        'div',
        {
          className: K.scaffold,
          'data-hh': 'video',
          children: [
            jsx('span', { className: K.scaffoldGlyph, children: jsx(Codicon, { name: 'play-circle', size: '0.875rem' }) }),
            jsx('span', { children: LINES.videoLater })
          ]
        },
        'video'
      ),
      jsxs(
        'section',
        {
          children: [
            jsx('div', { className: K.question, children: here.question }),
            jsx('div', {
              className: cx(K.choices, wideStep && K.twoColumns),
              role: 'group',
              'aria-label': here.question,
              'data-hh': 'choices',
              'data-columns': fit.columns,
              children: here.options.map(o =>
                jsxs(
                  'button',
                  {
                    type: 'button',
                    'aria-pressed': picked === o.id,
                    className: cx(K.choice, picked === o.id ? K.choiceOn : K.choiceOff),
                    'data-option': o.id,
                    onClick: () => choose(o),
                    children: [
                      jsxs('span', {
                        className: K.choiceText,
                        children: [jsx('span', { className: K.choiceLabel, children: o.label }), o.hint ? jsx('span', { className: K.choiceSub, children: o.hint }) : null]
                      }, 't'),
                      fits === o.id ? jsx('span', { className: K.fitTag, 'data-hh': 'fits-goal', children: LINES.fitsGoal }, 'fit') : null
                    ]
                  },
                  o.id
                )
              )
            })
          ]
        },
        'question'
      ),
      stepActions
    ]

    const yoursView = renderYourSetup(setup, {
      openStep: n => {
        saveStep(n)
        saveTab('setup')
      },
      cardColumns: fit.cardColumns
    })

    const main = jsx(
      'main',
      {
        className: K.detail,
        'data-hh': 'detail',
        // The tabs' panel (the tabs point here with aria-controls).
        role: 'tabpanel',
        id: 'hh-tabpanel',
        'aria-labelledby': `hh-tab-${tab}`,
        children: jsx('div', { className: K.detailScroll, children: jsxs('div', { className: tab === 'setup' ? K.detailInner : K.detailInnerWide, children: tab === 'setup' ? stepView : yoursView }) })
      },
      'main'
    )

    /* ---------- Helper's conversation window (design/talk-r5: option 4, the things to pick in the message box) ---------- */
    // The newest thing said is Helper's: it is in the bubble, and everything before it is the
    // conversation so far. (While Helper works on an answer the newest thing is the person's
    // message; then the bubble is the three dots.)
    const newest = log[log.length - 1]
    const inBubble = newest && newest.who === 'helper' ? newest : null
    const older = inBubble ? log.slice(0, -1) : log
    // The line appears word by word (src/reveal.js) unless reduce motion is on: then it is whole
    // from its first draw. said = all of it is on screen: answers and buttons wait for that.
    const fresh = !reduced
    let said = true
    if (inBubble) {
      const words = wordsOf(inBubble.text).length
      saidNow.push({ key: inBubble.key, words, fresh, text: inBubble.text })
      said = clock.shown(inBubble.key, words, fresh) >= words
    }
    // Which expression the character shows (src/expressions.js). Asking: Helper's newest line
    // ends with a question mark and all of it is on screen.
    const question = !!inBubble && said && asksQuestion(inBubble.text)
    const expression = expressionFor({ revealing, busy: busyNow, question })
    const toPick = inBubble && inBubble.answers && inBubble.answers.items.length ? inBubble.answers : null
    // "Skip" shows while one of the opening's two questions is still open (the visit's stage, not
    // the newest line: a pasted key at "What's your name?" gets its own line and Skip stays).
    const openingOpen = visit.stage === 'name' || visit.stage === 'work'

    // The character sits on the message box's top edge (placed by src/talk.css). It rises when
    // Helper comes on screen.
    const character = jsx(Character, { size: fit.characterPx, expression, rising: !risen.current, reduced, eyes: eyes.current })

    // A rounded box that grows as you type, and a round send button on its right, like Hermes's
    // own composer. It works without a model: picks and key words need none.
    const composer = jsx(
      'form',
      {
        onSubmit: e => {
          e.preventDefault()
          send()
        },
        'data-hh': 'composer',
        children: jsxs('div', {
          className: cx(K.composerSurface, composerSurfaceRing),
          children: [
            jsx('div', { 'aria-hidden': true, className: composerInputBacking }, 'backing'),
            // the things to pick (talk-r5, option 4): above the line where the person types
            jsx(Picks, { answers: toPick, open: !!toPick && said, onPick: pickAnswer, width: fit.helperPx, onSettled: scrollToNewest }, 'picks'),
            jsxs(
              'div',
              {
                className: K.composerRow,
                children: [
                  jsx(
                    'div',
                    {
                      className: K.composerInputCell,
                      children: jsx(Textarea, {
                        ref: askBox,
                        rows: 1,
                        className: K.composerInput,
                        value: draft,
                        // The whole text is kept: the pasted-key check reads all of it (src/key-check.js).
                        onChange: e => setDraft(e.target.value),
                        onKeyDown: e => {
                          if (e.key !== 'Enter' || e.shiftKey || (e.nativeEvent && e.nativeEvent.isComposing)) return
                          e.preventDefault()
                          send()
                        },
                        placeholder: hintFor(inBubble),
                        'aria-label': 'Message to Helper'
                      })
                    },
                    'input'
                  ),
                  openingOpen ? jsx('button', { type: 'button', className: T.skip, 'data-hh': 'skip', onClick: skipOpening, children: 'Skip' }, 'skip') : null,
                  jsx(
                    Button,
                    {
                      'aria-label': 'Send',
                      className: cx(PRIMARY_ICON_BTN, K.composerSend),
                      disabled: !draft.trim(),
                      type: 'submit',
                      children: jsx(Codicon, { name: 'arrow-up', size: '0.875rem' })
                    },
                    'send'
                  )
                ]
              },
              'row'
            )
          ]
        })
      },
      'composer'
    )

    let helperArea = null
    if (helperShown) {
      const over = fit.helper === 'over'
      helperArea = jsxs(
        'div',
        {
          className: cx(T.win, fit.tight && T.winTight, fit.small && T.winSmall, over && T.winOver),
          // Over a narrow page it leaves the strip free, and keeps its fill under Hermes's
          // see-through look (data-glass-opaque is Hermes's own switch for that).
          style: over ? { width: `${fit.helperPx}px`, right: `${STRIP_PX}px` } : { width: `${fit.helperPx}px` },
          role: 'complementary',
          'aria-label': 'Helper',
          'data-hh': 'helper',
          'data-over': over,
          'data-glass-opaque': over ? '' : undefined,
          // Escape folds the helper that lies over the page (as Hermes's own overlays do).
          onKeyDown: over
            ? e => {
                if (e.key !== 'Escape') return
                e.preventDefault()
                foldHelper(true)
              }
            : undefined,
          children: [
            fit.grip ? jsx(Grip, { width: fit.helperPx, min: HELPER_MIN_PX, max: HELPER_MAX_PX, onDown: gripDown, onMove: gripMove, onUp: gripUp, onCancel: gripCancel, onKey: gripKey }, 'grip') : null,
            jsx(Conversation, { entries: older, newest: inBubble, kept: visit.kept, onNext: pressNext, onNote: pressNote, scrollRef: helperScroll }, 'conversation'),
            inBubble ? jsx(Bubble, { entry: inBubble, clock, fresh, said, onNext: pressNext }, 'bubble') : jsx(BusyDots, { reduced }, 'bubble'),
            jsx(Under, { character }, 'under'),
            composer
          ]
        },
        'helper'
      )
    }

    // The "Helper" strip at the page's right edge, written down it, in a window too narrow for
    // both sides: it folds Helper away and brings it back. It stays clear of Hermes's title-bar
    // band, where Hermes's own window buttons float.
    const strip =
      fit.helper !== 'column'
        ? jsxs(
            'button',
            {
              type: 'button',
              className: K.strip,
              style: { paddingTop: 'calc(var(--titlebar-height) + 0.75rem)' },
              'aria-label': folded ? 'Show the helper' : 'Hide the helper',
              'aria-expanded': !folded,
              'data-hh': 'helper-strip',
              ref: stripButton,
              onClick: () => foldHelper(!folded),
              children: [jsx(Codicon, { name: folded ? 'chevron-left' : 'chevron-right', size: '0.875rem' }, 'icon'), jsx('span', { className: K.stripLabel, children: 'Helper' }, 'label')]
            },
            'strip'
          )
        : null

    // The left side: the tabs, and under them the step list and the open step (or Your setup).
    const left = jsxs(
      'div',
      {
        className: K.left,
        'data-hh': 'left',
        children: [header, jsx('div', { className: K.body, 'data-hh': 'body', children: tab === 'setup' ? [rail, main] : [main] }, 'body')]
      },
      'left'
    )
    return jsxs('div', {
      className: K.root,
      ref: measureRef,
      'data-hh': 'page',
      // The measured size, for the real-app checks (dev/checks/talk-v1).
      'data-width': width,
      'data-height': size.height,
      // The eyes (src/eyes.js) hear the cursor, the keyboard's focus and scrolling from this box
      // only, never from the Hermes window: so they follow only while the cursor is over our page.
      onPointerMove: e => eyes.current.pointerMove(e.clientX, e.clientY),
      onPointerLeave: () => eyes.current.pointerLeave(),
      onFocus: e => eyes.current.focus(e.target),
      onBlur: e => {
        if (!e.relatedTarget || !e.currentTarget || !e.currentTarget.contains(e.relatedTarget)) eyes.current.blur()
      },
      onScrollCapture: () => eyes.current.scroll(),
      // The person types or presses the mouse while words are still appearing: the rest appears at once.
      onKeyDownCapture: e => {
        if (!LONE_KEYS.includes(e.key)) clock.finishAll()
      },
      onPointerDownCapture: () => clock.finishAll(),
      // Our one style sheet (src/talk.css) lives inside our own page, so it leaves with the page.
      children: [jsx('style', { 'data-hh': 'talk-css', children: TALK_CSS }, 'css'), left, strip, helperArea]
    })
  }
}
