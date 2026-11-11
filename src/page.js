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
import { host, Button, Codicon, Textarea, PRIMARY_ICON_BTN, composerInputBacking, composerSurfaceRing } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, T, cx, TAB_LOOK, TAB_LOOKS } from './look.js'
import { TALK_CSS } from './talk-css.js'
import { Character } from './character.js'
import { RISE, expressionFor, asksQuestion, makeBusy } from './expressions.js'
import { makeEyes } from './eyes.js'
import { makeRevealClock, wordsOf } from './reveal.js'
import { prefersReducedMotion, watchReducedMotion } from './motion.js'
import { readState, TAB_IDS } from './state.js'
import { checkModel, RECHECK_AFTER_MS } from './model-status.js'
import { MAX_INPUT_CHARS } from './key-check.js'
import { laterVisit, turnParts, keptWords, keptWasShown, nameWithMore, pick, pickTopic, pickGroup, pickWant, pageOf, press, pressOffer, pressNear, offerSaid, offerIsSetup, hasTopicWord, skip, sayLine, change, rmPick, forgetAnswer, seeKept, askForgetAll, lineFor, openingLine, hintFor } from './talk.js'
import { cleanKept, keptToStore } from './kept.js'
import { SETUP_BUILT, SETUP_AI_BUILT } from './setup-built.js'
import { recInstructions, judgeRec, askRec } from './setup-rec.js'
import { AI_MODE } from './ai-mode.js'
import { setupTyped, setupPress, setupAfter, setupStepOpen, setupOpening, setupAskMove, setupRestartMove } from './setup-chat.js'
import { makeLook, LOOK_UNSEEN } from './setup-look.js'
import { liveWhyNot, askLive, liveApply, LIVE_SECONDS, SLOW_LINE, slowFollows } from './live-turn.js'
import { lastLines, sendable } from './live-request.js'
import { Conversation, Bubble, BusyDots, Picks, Under, Grip } from './talk-view.js'
import { makeDashboard, DASH_COMPACT_UNDER_PX, openHermesDocs } from './dash.js'
import { DASH_DATA } from './dash-data.js'
import { layoutFor, clampHelperWidth, STRIP_PX, HELPER_MIN_PX, HELPER_MAX_PX } from './layout.js'

// One press of an arrow key on the edge to drag moves it this far.
const GRIP_KEY_PX = 16
// Keys that are not typing by themselves: pressing one alone does not end the word-by-word reveal.
const LONE_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']
// The longest conversation kept in page memory.
const LOG_MAX = 200

// dash-v1: three tabs, Dashboard, Learn, My setup (Pēteris's pick, 11 Nov 2026); their names from the Dashboard's
// data (content/dash-setup-list-v2.json page_words). Only Dashboard is built: Learn and My setup show one quiet line.
export const TABS = TAB_IDS.map(id => ({ id, label: DASH_DATA.words.tabs[id] }))

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
  const { useDashboard, renderDashboard } = makeDashboard(ctx)
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
    const { setupOffer, rec, recBy, pasteLabel, ...line } = s
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
  // setup-chat-2 (changes-1 STEP_BACK): while a step is open, after every answer of the ordinary talk, typed or picked,
  // the step again with its own answers ("Back to step 2 of 5: ..."), in place of that answer's offer; an answer with
  // things of its own to pick keeps them, and the step comes back after the answer to those (src/setup-chat.js).
  // Returns [the answer's line as it is to be shown, the entries after it].
  const setupAfterSaid = (result, said, typed) => {
    if (!SETUP_BUILT || !result || ['F1', 'F2', 'F3', 'WORK_SECRET', 'WORK_LONG', 'WORK_LONG_2', 'WORK_ASK', 'K1', 'OPEN'].includes(result.kind)) return [said, []]
    const step = setupStepOpen(memory.visit)
    if (!step && !typed) return [said, []]
    const again = setupAfter(memory.visit, { picks: !!said.answers })
    if (!again) return [said, []]
    return [again.line === 'STEP_BACK' ? { ...said, offer: null } : said, setupEntries(again)]
  }
  // The waiting turn ends: with the AI's line (final) or its no-AI line. Only once, and only if it still waits.
  // quiet (setup-chat-2): the person did something else meanwhile (liveClose), so no set-up line follows this answer:
  // what they did next is answered at once and brings its own (a step answer typed then must not get "Back to step"
  // in front of it)
  const liveFinish = (w, final, quiet = false) => {
    if (live.waiting !== w) return
    live.waiting = null
    w.stopTimer()
    w.endBusy()
    const result = final || w.out
    const said = lineFor(result, memory.visit, w.typed, { settingsPage, keptShown: keptWasShown(memory.log) })
    writeKept()
    const [shown, after] = quiet ? [said, []] : setupAfterSaid(result, said, w.typed)
    memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...saidEntries(shown, w.sendHelper), ...slowAfter(said), ...after].slice(-LOG_MAX)
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
  // find-v1 part 3 (Lead, 11 Nov; hhtech ask-run 2 and find-run section 9), in place of "the first slow or failed call
  // ends the AI for the visit": a message whose try at the AI was slow (no answer in 12 s, thinking text) or failed (the
  // call threw) is one failed try (aiFailed, once per message). A message the AI answered in time puts the count back
  // to 0. Two failed tries in a row turn the AI step off for the rest of the visit (visit.aiOff), and when that second
  // one was slow SLOW_A is owed to its answer: it shows right after that answer or, when it may not follow it, not at
  // all (Lead's points 15 and 16 stand). A try that failed without being slow owes no line: Helper has no checked words
  // for "your AI gave an error".
  const aiFailed = (w, slow) => {
    const v = memory.visit
    if (w.failed) return
    w.failed = true
    v.aiFails = (v.aiFails || 0) + 1
    if (v.aiFails < 2) return
    v.aiOff = true
    if (!v.slow) v.slow = slow && (live.waiting === w || w.answeredNow) ? 'due' : 'dropped'
  }
  const slowFail = w => aiFailed(w, true)
  // a message the AI answered in time (whatever it answered): the failed tries before it no longer count
  const aiAnswered = w => {
    if (!w.failed) memory.visit.aiFails = 0
  }
  // The model is looked for again (setup.runtime_check, no model call): right after a try that failed, so the next
  // message knows whether a model is there now (ask-run 2 run D: Hermes switched its free model on after the failed
  // try), and at each message that could not be asked because the page knows no model. Never two looks at once (the
  // look itself returns when one is running).
  const lookAgain = () => {
    if (live.recheck) live.recheck()
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
    if (live.waiting) liveFinish(live.waiting, null, true)
    // setup-chat: a move of the set-up conversation that still waits for the look is answered at once from what was
    // read last (or as "couldn't check"), and a recommendation that still waits for the AI's sentence gets its
    // written one at once: every message is answered, in order, before the next thing the person does
    if (memory && memory.lookWait) memory.lookWait()
    if (memory && memory.recWait) memory.recWait(null)
  }
  function useModelStatus() {
    const fresh = lastCheck && Date.now() - lastCheck.at < RECHECK_AFTER_MS
    const [status, setStatus] = useState(() => (fresh ? lastCheck.result : { state: 'checking' }))
    const running = useRef(false)
    const mounted = useRef(true)

    // quiet (find-v1 part 3, the look made again for Helper's AI step): the page keeps showing what it knew until the
    // answer is there, with no "checking" in between
    async function run(quiet = false) {
      if (running.current) return
      running.current = true
      if (quiet !== true) setStatus({ state: 'checking' })
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
    const [modelStatus, recheckModel] = useModelStatus()
    live.recheck = () => recheckModel(true)
    // dash-v1: the Dashboard's state, read again each time its tab is opened (src/dash.js)
    const dashboard = useDashboard({ active: tab === 'dashboard' })
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

    // The message box takes the keyboard when asked to (a pick, Helper
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

    const helperShown = fit.helper !== 'strip'

    // Puts Helper away or brings it back, with the keyboard following (to the strip, or to the
    // message box). The strip and Escape go through it; only the
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
    // slowDue (find-v1 part 3): this answer is the one a second slow try was answered with (see send): SLOW_A after it
    function answer(result, shown, typed = '', pressed = false, slowDue = false) {
      if (!result) return
      // live-v2 changes-2: the conversation shows that something was kept (src/talk.js keptWasShown)
      const said = lineFor(result, visit, typed, { settingsPage, keptShown: keptWasShown(memory.log) })
      writeKept()
      // talk-live: each line notes whether it may ever be sent to the AI (src/live-request.js sendable)
      const may = sendable(result)
      const [line, after] = setupAfterSaid(result, said, typed)
      addToLog([shown ? { ...youEntry(shown), send: pressed ? false : may.you } : null, ...saidEntries(line, may.helper), ...(slowDue ? slowAfter(said) : []), ...after].filter(Boolean))
      setFocusAsk(true)
    }

    // setup-chat: one move of the set-up conversation (src/setup-chat.js): the person's side shows at once; when the
    // move needs the look, Hermes is read first (no AI call; the character shows busy meanwhile), then Helper's lines.
    function runSetup(mv, shown) {
      liveClose()
      memory.opening = null
      if (shown) addToLog([{ ...youEntry(shown), send: false }])
      const finish = seen => {
        const says = mv.go(seen)
        writeKept()
        const put = list => {
          memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...list.flatMap(setupEntries)].slice(-LOG_MAX)
          if (live.view) {
            live.view.setLog(memory.log)
            live.view.setFocusAsk(true)
          }
        }
        // setup-chat point 6: only the recommendation's sentence may be the AI's. One call, at most 12 s (the dots
        // show meanwhile: the person's message is still the newest line); the reply stands only when it passes
        // no_reply, c26, the name check and s1 to s8 (src/setup-rec.js); else the written sentence, and nothing says
        // so. No call: with no AI step, with no model ready, after a call failed in this visit, or while Hermes
        // still works on an earlier call of Helper's.
        // (only where the AI writes, ai_writes: with ai_picks_line the AI only ever picks one of Helper's lines)
        const i = SETUP_AI_BUILT && AI_MODE === 'ai_writes' && shown ? says.findIndex(s => s.rec) : -1
        if (i < 0 || visit.aiOff === true || !live.status || live.status.state !== 'ok' || live.inHermes > 0) return put(says)
        const names = [visit.name, visit.kept.name]
        const instructions = recInstructions(says[i].rec, visit.kept, seen, names)
        const first = !visit.aiTried
        visit.aiTried = true
        // find-v1 part 3: a slow or failed call here is one failed try, as for a typed message (two in a row end the AI
        // for the visit). The slow-AI line may not follow a line with things to pick, so it is never owed here.
        let counted = false // (review) once for this call: slow at 12 s and failing later is one failed try
        const off = () => {
          if (counted) return
          counted = true
          visit.aiFails = (visit.aiFails || 0) + 1
          if (visit.aiFails < 2) return
          visit.aiOff = true
          if (!visit.slow) visit.slow = 'dropped'
        }
        let ended = false
        const endBusy = busy.begin()
        const end = text => {
          if (ended) return
          ended = true
          endBusy()
          memory.recWait = null
          put(says.map((s, k) => (k === i && text ? { ...s, text: text + s.text.slice(s.text.lastIndexOf(' Want the steps?')), recBy: 'ai' } : s)))
        }
        // find-v1: past its 12 s and still in Hermes, this call is a stuck one, as a typed message's call is: a typed
        // message that cannot be asked because of it is the second slow try. The watch runs on when the person
        // moved on before the 12 s (end() no longer stops it; it is stopped when the call comes back)
        let recStuck = false
        const stop = ctx.setTimeout(() => {
          recStuck = true
          live.stuck = (live.stuck || 0) + 1
          off()
          end(null)
        }, LIVE_SECONDS * 1000)
        memory.recWait = end
        live.inHermes++
        Promise.resolve()
          .then(() => askRec((method, params, timeout) => host.request(method, params, timeout), instructions))
          .then(
            res => {
              const j = judgeRec(res && res.text, says[i].rec.item, names, instructions)
              if (j.noReply) off()
              else if (!ended && !counted) visit.aiFails = 0
              end(j.text || null)
            },
            () => {
              off()
              end(null)
            }
          )
          .finally(() => {
            stop()
            if (recStuck) live.stuck--
            live.inHermes--
          })
      }
      if (!mv.look) return finish(memory.seen || LOOK_UNSEEN)
      const endLook = busy.begin()
      let looked = false
      const once = seen => {
        if (looked) return
        looked = true
        memory.lookWait = null
        endLook()
        finish(seen)
      }
      // the person does something else before the reads are back (see liveClose)
      memory.lookWait = () => once(memory.seen || LOOK_UNSEEN)
      look().then(seen => {
        memory.seen = seen
        once(seen)
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
      // find-v1: the person's own typed messages of this visit, for check c12 (a name they typed themselves); never
      // stored, never sent
      visit.typedSaid = [...(visit.typedSaid || []), typed]
      const { pre, out: result } = turnParts(typed, visit)
      // Kept only while "Which one do you mean?" (or W2, skill and plugin compared) is open, for the
      // pick that answers it. A message
      // with a key in it never gets that line, so a key is never kept here.
      memory.typed = result.kind === 'W1' || result.kind === 'W2' ? typed : ''
      const chars = Array.from(typed.trim())
      const shown = chars.length > MAX_INPUT_CHARS ? chars.slice(0, MAX_INPUT_CHARS).join('') + '…' : chars.join('')
      // hhtech-weak-ai: visit.aiOff, set below when a call gave no answer in 12 s or gave thinking text
      const why = liveWhyNot({ pre, text: typed, status: live.status, inHermes: live.inHermes, off: visit.aiOff === true })
      // find-v1 part 3: the page knows no model: no call and no dots, and the model is looked for again for a later message
      if (why === 'model not ready') lookAgain()
      // find-v1 part 3: this message cannot be asked because an earlier call of Helper's has been in Hermes for over 12 s:
      // that is a second slow try (the first was that call's own message)
      let stuckNow = false
      if (why === 'Hermes still works on a call' && live.stuck > 0) {
        aiFailed({ answeredNow: true }, true)
        stuckNow = true
      }
      if (why) return answer(result, result.kind === 'K1' ? null : shown, typed, false, stuckNow)
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
        let stuck = false
        const stopWatch = ctx.setTimeout(() => {
          if (ended) return
          slowFail(w)
          // find-v1 part 3: this call is still in Hermes 12 s after it started (see send: a message that meets it)
          stuck = true
          live.stuck = (live.stuck || 0) + 1
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
        // So the first call of a visit is still tried (dots once). Lead (setup-chat-2): it stays so; hhtech found that
        // setup.runtime_check answers the same in a home where the call works and in one where it fails, so it cannot
        // gate the call.
        return p
          .catch(err => {
            // find-v1 part 3: a call that failed is one failed try, and the model is looked for again
            aiFailed(w, false)
            lookAgain()
            throw err
          })
          .finally(() => {
            ended = true
            stopWatch()
            if (stuck) live.stuck--
            live.inHermes--
          })
      }
      // live-v2 changes-4: what the person does, as kept, for the work line (src/live-request.js checks it again)
      askLive({ text: typed, message, pre, out: result, before, lines, lastLine: lastHelper ? lastHelper.text : '', request, msLeft: () => LIVE_SECONDS * 1000 - (Date.now() - started), alive: () => live.waiting === w, work: visit.kept.work || null, names: [visit.name, visit.kept.name], typed: visit.typedSaid })
        .then(got => {
          // hhtech-weak-ai, changes-5 no_reply: thinking text from any call turns the AI step off for the rest of this
          // visit, also when it comes after the 12 s; from the visit's first call it owes SLOW_A
          // find-v1 (Builder, review): so is a list call that came back too late for the writer to start
          if (got && (got.thinking || got.fallback === 'no time for the second call')) slowFail(w)
          else aiAnswered(w)
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
      else if (item.near) result = pressNear(item.near, visit) // breadth-t1: a line picked under the near offer
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
      if (next.kind === 'docs') return openHermesDocs(ctx, next.url)
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

    // the tab names' look: one value in src/look.js (TAB_LOOK)
    const tabLook = TAB_LOOKS[TAB_LOOK]
    const tabRow = jsx('div', {
      className: K.tabs,
      role: 'tablist',
      'aria-label': DASH_DATA.words.tabListLabel,
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
            className: cx(tabLook.tab, on ? tabLook.on : tabLook.idle),
            ref: tabRefs.current.set[t.id],
            onClick: () => saveTab(t.id),
            onKeyDown: e => onTabKey(e, i),
            children: jsx('span', { className: on ? tabLook.labelOn : tabLook.label, children: t.label })
          },
          t.id
        )
      })
    })

    const header = jsx('div', { className: K.head, 'data-hh': 'header', children: tabRow })

    /* ---------- the tab's panel: the Dashboard, or one quiet line for a tab not built yet ---------- */
    const panel =
      tab === 'dashboard'
        ? renderDashboard(dashboard, { compact: fit.main < DASH_COMPACT_UNDER_PX })
        : jsx('p', { className: K.notBuilt, 'data-hh': 'not-built', children: DASH_DATA.words.notBuilt }, 'not-built')

    const main = jsx(
      'main',
      {
        className: K.detail,
        'data-hh': 'detail',
        // The tabs' panel (the tabs point here with aria-controls).
        role: 'tabpanel',
        id: 'hh-tabpanel',
        'aria-labelledby': `hh-tab-${tab}`,
        children: jsx('div', { className: K.detailScroll, 'data-hh': 'scroll', children: panel })
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

    // The left side: the tabs, and under them the open tab.
    const left = jsxs(
      'div',
      {
        className: K.left,
        'data-hh': 'left',
        children: [header, jsx('div', { className: K.body, 'data-hh': 'body', children: [main] }, 'body')]
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
