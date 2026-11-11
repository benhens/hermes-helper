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
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { K, T, cx } from './look.js'
import { TALK_CSS } from './talk-css.js'
import { Character } from './character.js'
import { RISE, expressionFor, asksQuestion, makeBusy } from './expressions.js'
import { makeEyes } from './eyes.js'
import { makeRevealClock, wordsOf } from './reveal.js'
import { prefersReducedMotion, watchReducedMotion } from './motion.js'
import { readState } from './state.js'
import { checkModel, RECHECK_AFTER_MS, NO_MODEL_LINE } from './model-status.js'
import { askModel, failLines, FAIL_LINES } from './model-call.js'
import { chatCall, chatHello, chatBack, chatHoldsBack, chatParts } from './chat.js'
import { MAX_INPUT_CHARS } from './key-check.js'
import { typedAboutKept, laterVisit, turnParts, keptWords, keptWasShown, nameWithMore, pick, pickTopic, pickGroup, pickWant, pageOf, press, pressOffer, pressNear, offerSaid, offerIsSetup, hasTopicWord, skip, sayLine, change, rmPick, forgetAnswer, seeKept, askForgetAll, lineFor, openingLine, hintFor, noteLast } from './talk.js'
import { cleanKept, keptToStore } from './kept.js'
import { talkToStore, talkFromStore } from './talk-keep.js'
import { SETUP_BUILT, SETUP_AI_BUILT } from './setup-built.js'
import { recInstructions, judgeRec, askRec, askLookCheck, modelCheckSaid, modelCheckFailed } from './setup-rec.js'
import { AI_MODE } from './ai-mode.js'
import { setupTyped, setupPress, setupAfter, setupStepOpen, setupReaskWaits, setupQuestionOpen, SETUP_OWN_QUESTION, setupOpening, setupAskMove, setupRestartMove } from './setup-chat.js'
import { makeLook, LOOK_UNSEEN } from './setup-look.js'
import { liveWhyNot, askLive, liveApply, LIVE_SECONDS, SLOW_LINE, slowPlace, pickedResult } from './live-turn.js'
import { lastLines, sendable } from './live-request.js'
import { Conversation, Bubble, BusyDots, Picks, Under, Grip, setMdOpener } from './talk-view.js'
import { makeDashboard, DASH_COMPACT_UNDER_PX, openHermesDocs } from './dash.js'
import { DASH_DATA } from './dash-data.js'
import { layoutFor, clampHelperWidth, STRIP_PX, HELPER_MIN_PX, HELPER_MAX_PX, replyScrollShift } from './layout.js'

// One press of an arrow key on the edge to drag moves it this far.
const GRIP_KEY_PX = 16
// Keys that are not typing by themselves: pressing one alone does not end the word-by-word reveal.
const LONE_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']
// The longest conversation kept in page memory.
const LOG_MAX = 200

// loom2 (his Loom of 11 Nov, 1:51 "take out the learn and just have this set up"): no tabs. With only the Dashboard
// left there is no tab row: the page is the Dashboard. A stored tab ('learn', or an older name) is not read.

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
      // changes-14 (keeps.met): Helper has said hello before, stored under its own key 'met' (since last-reset, Forget
      // all removes it). Set: the window opens with BACK and asks nothing; else OPEN with "What's your name?". A kept name
      // counts as met too (src/talk.js laterVisit); met is then written.
      const metStored = readMet()
      memory = { visit: laterVisit(kept, metStored), log: [], nextId: 1, typed: '', stored: JSON.stringify(keptToStore(kept)), metStored, before: [], talkStored: 'null', forgotUpTo: 0 }
      // loom-fixes (Lead's point 17b): the conversation of earlier visits, the last 50 lines, shown above this visit's
      // (never sent to the AI: they are not in memory.log)
      memory.before = readTalk().map(e => ({ ...e, id: memory.nextId++, key: `r${memory.nextId}` }))
      memory.talkStored = JSON.stringify(talkToStore(memory.before))
      // normal-chat (Pēteris's Loom of 11 Nov): a first visit asks the name as before (OPEN); a later visit (the met mark or
      // a kept name) says one short line and waits. No set-up questions, no offers, no picks. Never sent to the model.
      memory.log = memory.visit.met ? [{ ...helperEntry(chatSaid('CHAT_BACK', chatBack(memory.visit.kept.name || null))), send: false }] : saidEntries(openingLine(memory.visit), false)
      writeKept()
    }
    return memory
  }
  // loom-fixes: the kept conversation, read back cleaned (src/talk-keep.js); a storage that fails gives none
  const readTalk = () => {
    try {
      return talkFromStore(ctx.storage.get('talk', null))
    } catch {
      return []
    }
  }
  // Written after every change of the conversation: the earlier visits' lines and this visit's, the last 50 that may be
  // kept; the key goes when none is left. Not written when nothing changed.
  const writeTalk = () => {
    // loom-fixes-2 (hhtech-loom-run fault 2): what was said up to a Forget all is never written again
    const next = talkToStore([...memory.before, ...memory.log.filter(e => !(e.id <= memory.forgotUpTo))])
    const text = JSON.stringify(next)
    if (text === memory.talkStored) return
    try {
      if (next) ctx.storage.set('talk', next)
      else ctx.storage.remove('talk')
      memory.talkStored = text
    } catch {}
  }
  // Clear chat (and Forget all on Helper's settings page): the earlier lines and this visit's go, all but what is on
  // screen now as the newest (the bubble, and the person's message while Helper works on it), so the window is never
  // left empty or showing the waiting dots for nothing. Kept answers and marks stay (hhcontent: what_clear_does).
  const clearTalk = () => {
    memory.before = []
    const last = memory.log[memory.log.length - 1]
    memory.log = last ? [last] : []
    memory.talkStored = 'stale'
    writeTalk()
  }
  // loom-fixes-2 (hhtech-loom-run fault 2: after Forget all and a restart the 6 old lines came back, because this
  // visit's lines were written back the moment Helper's page was drawn again): Forget all forgets the conversation up to
  // now, the earlier visits' lines and this visit's, in the store; the window in this visit shows only its newest line
  // (as Clear chat). Typed ("forget everything", Yes) the lines stay on screen in this visit but are not kept.
  const forgetTalk = (inWindow = true) => {
    memory.before = []
    if (inWindow) {
      const last = memory.log[memory.log.length - 1]
      memory.log = last ? [last] : []
    }
    memory.forgotUpTo = memory.nextId
    memory.talkStored = 'stale'
    writeTalk()
  }
  // The page is on screen again (Hermes draws it fresh after Settings): the record as stored now.
  const rereadKept = () => {
    const m = remembered()
    // loom-fixes: Forget all on Helper's settings page removes the kept conversation too: it goes from the window
    if (m.talkStored !== 'null' && ctx.storage.get('talk', null) === null) forgetTalk()
    // last-reset: Forget all on Helper's settings page removes the met mark too (a full reset); the name said in this
    // visit is not used again either (as after the typed Forget all), and the mark is not written again in this visit
    if (m.metStored && !readMet()) m.visit.name = null
    const kept = readKept()
    // setup-chat: the set-up answers were there and are all gone now (Helper's settings page: "Ask me the set-up
    // questions again", or each row deleted): the conversation starts the questions again (RESTART)
    // normal-chat: the set-up questions are not asked again when their answers are deleted (there are none to ask)
    for (const k of Object.keys(m.visit.kept)) delete m.visit.kept[k]
    Object.assign(m.visit.kept, kept)
    m.stored = JSON.stringify(keptToStore(kept))
  }
  // After everything the person does: the record is written when it changed, and removed whole
  // when nothing is left in it (told with it). A storage that fails is not kept from answering.
  const writeKept = () => {
    // last-reset (Lead, 11 Nov 15:41; Pēteris: "is there a way to full reset the plugin"): Forget all typed to Helper
    // (Yes) removes the met mark too, so the next visit is a first visit and asks the name again. It is not written
    // again in this visit (metStored stays true: "written once"); a later visit writes it when its opening ends.
    if (memory.visit.resetAll) {
      memory.visit.resetAll = false
      try {
        ctx.storage.remove('met')
      } catch {}
      memory.metStored = true
    }
    // changes-14: the met mark, written once when the visit has it (the opening ended, or Skip); removed only by Forget all
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
    const { offer, samePicks, ask, ...line } = said
    if (samePicks) {
      const last = [...memory.log].reverse().find(e => e.who === 'helper')
      if (last && last.answers) line.answers = last.answers
    }
    const out = [{ ...helperEntry(line), send }]
    if (offer) out.push({ ...helperEntry({ line: 'offer-' + offer.set, text: offer.text, source: null, answers: offer.answers, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null }), send: false, offer: true })
    // loom-fixes-2 (opening_talk): the opening's open question once more, as its own bubble (never sent to the AI)
    if (ask) out.push({ ...helperEntry({ line: ask.line, text: ask.text, source: null, answers: null, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null }), send: false })
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
  // loom-fixes: the look reads the bot the app has open, as the Dashboard does (live.profile, set on every draw)
  const look = makeLook(ctx, host, () => live.profile || '')

  /* ---------- normal-chat: every typed message goes to the person's own model, one call each ---------- */
  // A line of Helper's in the conversation's shape
  const chatSaid = (line, text, more = {}) => ({ line, text, source: null, answers: null, next: null, paste: null, note: null, used: null, hint: null, rows: null, docs: null, ...more })
  // Links in the model's reply open in the person's browser (the SDK's door to the OS); a missing door is ignored
  // (only an address of the official Hermes docs, by the plugin's one door to the browser: src/dash.js openHermesDocs)
  setMdOpener(url => openHermesDocs(ctx, url))
  // Kept while the plugin is loaded: the messages that wait for their call (one call at a time, in the order typed), and
  // whether a call runs. A message typed while a call runs waits here and is sent after that reply; none is dropped.
  // names: every name seen in this plugin load (the kept one and this visit's), so a Forget all on the settings page does
  // not let a name that is still in the conversation's lines through (review finding 6). Never stored.
  const chat = { queue: [], running: false, names: new Set() }
  // Helper's reply goes straight after the message it answers (a message typed meanwhile stays after it)
  const chatPut = (afterId, entry) => {
    const list = memory.log.map(e => (e.opened ? { ...e, opened: false } : e))
    const i = list.findIndex(e => e.id === afterId)
    // (review finding 2) the message is gone (Clear chat or Forget all while its call ran): its reply is dropped too
    if (i < 0) return
    memory.log = (i === list.length - 1 ? [...list, entry] : [...list.slice(0, i + 1), entry, ...list.slice(i + 1)]).slice(-LOG_MAX)
    if (live.view) {
      live.view.setLog(memory.log)
      live.view.setFocusAsk(true)
    }
  }
  // A reply's thinking text (some models write it between <think> marks) is not part of the reply
  const chatClean = text => String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim()
  const chatPump = () => {
    if (chat.running || !chat.queue.length) return
    const job = chat.queue.shift()
    const at = memory.log.findIndex(e => e.id === job.id)
    // (review finding 2) a waiting message that was cleared away is not sent
    if (at < 0) return chatPump()
    chat.running = true
    const endBusy = busy.begin()
    const v = memory.visit
    for (const n of [v.name, v.kept.name]) if (typeof n === 'string' && n.trim()) chat.names.add(n.trim())
    const names = [...chat.names]
    // the lines before this message (a reply to an earlier message is among them; a message typed later is not)
    const { chunks, ...call } = chatCall(job.text, memory.log.slice(0, at), names)
    const request = (method, params, timeout) => host.request(method, params, timeout)
    Promise.resolve()
      .then(() => askModel({ request, call, recheck: () => checkModel(request, { sleep }), sleep }))
      .catch(() => ({ ok: false, kind: 'other' }))
      .then(r => {
        // chat-fix: the reply's marks in double square brackets are taken out of its words (src/chat.js chatParts): the
        // choices and the card they name are drawn under it; a reply with no words left counts as no reply
        // (review finding 11) a choice that would start Helper's own forget or what-do-you-keep lines is no button
        const parts = chatParts(r && r.ok ? chatClean(r.text) : '')
        if (parts.text) return chatPut(job.id, { ...helperEntry(chatSaid('CHAT', parts.text, { md: true, quick: parts.quick.filter(q => !typedAboutKept(q)), card: parts.card })), send: true })
        lookAgain()
        const kind = r && !r.ok ? r.kind : 'other'
        const f = FAIL_LINES[kind] || FAIL_LINES.other
        chatPut(job.id, { ...helperEntry(chatSaid('CHAT_FAILED', failLines(kind, 'card').join(' '), { next: f.button ? { kind: 'retry', label: f.button, text: job.text } : null })), send: false })
      })
      .finally(() => {
        endBusy()
        chat.running = false
        chatPump()
      })
  }

  /* ---------- talk-live: Helper's AI step (src/live-turn.js; none at all when AI_MODE is no_ai_step) ---------- */
  // Kept while the plugin is loaded, like the conversation: the turn that waits for the person's AI (one at a
  // time), how many of Helper's calls Hermes still works on (also after the page stopped waiting for one: no new
  // call starts until it is 0, so at most one Helper call is ever in Hermes), the model status the page checked
  // last, and the mounted page's setters (null while the page is off screen: a turn that ends then still adds its
  // line to the conversation kept in memory).
  const live = { n: 0, waiting: null, inHermes: 0, calls: new Set(), status: { state: 'checking' }, view: null }
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
  // loom-fixes-2 (helper-loom-fixes-v2 point 5, one_question; hhtech-loom-run fault 1: in 8 of 20 messages an offer's
  // question and then "When you're ready: are you new to Hermes?", two questions in a row): while Q_NEW, Q_GOAL, REC or
  // a step is open and the ordinary talk answers a typed message, the answer carries no offer and no things to pick
  // (its action buttons stay), a topic's question becomes that topic's plain line, and the open question comes once
  // more as its own bubble with its answers, every time. An answer of own_question_kinds (W1, C1, C2, can-q, MIG_WHICH,
  // RM2) keeps its own question and picks; the set-up question comes back after the answer to it.
  const setupAfterSaid = (result, said, typed) => {
    if (!SETUP_BUILT || !result || ['F1', 'F2', 'F3', 'WORK_SECRET', 'WORK_LONG', 'WORK_LONG_2', 'WORK_ASK', 'K1', 'OPEN', 'OPEN_TALK'].includes(result.kind)) return [said, []]
    if (!setupQuestionOpen(memory.visit)) return [said, []]
    // (review) a pressed answer while a step is open gets the step back, as before (setup-chat-2)
    if (!typed && !setupStepOpen(memory.visit) && !setupReaskWaits(memory.visit)) return [said, []]
    // find-v2 part 5 wins where both jobs touched the same thing (Lead, 11 Nov 14:15): things to pick of the answer's
    // own (its answers, or an offer that asks about the answer: two kinds of moving, which app, which plan, the near
    // lines) keep the set-up question back until they are answered, as own_question_kinds do; only one question is on
    // screen either way. At a step only the answer's own answers count, as before.
    const ownOffer = !!(said.offer && ['move', 'mig_which', 'mig_which_2', 'pay', 'stuck', 'words', 'near'].includes(said.offer.set))
    const own = SETUP_OWN_QUESTION.includes(result.kind) || SETUP_OWN_QUESTION.includes(said.line) || !!said.answers || (!setupStepOpen(memory.visit) && ownOffer)
    const again = setupAfter(memory.visit, { picks: own })
    if (!again) return [said, []]
    let line = said
    if (result.kind === 'question' && result.topic) {
      const plain = noteLast(memory.visit, { ...result, kind: 'plain' })
      memory.visit.lastq = false
      line = lineFor(plain, memory.visit, typed, { settingsPage, keptShown: keptWasShown(memory.log) })
    }
    return [{ ...line, offer: null, answers: null }, setupEntries(again)]
  }
  // find-v2 part 1: the turn closes with no line from the AI (its 12 s, or the person moved on) after the list call
  // picked a line: that line itself, as code shows it (src/live-turn.js pickedResult), not the don't-know
  const pickedFinal = w => (w.picked && w.before ? liveApply(memory.visit, pickedResult(w.picked), w.out, w.before, w.typed) : null)
  // find-v2 part 3 (changes-13 look.model_rule): the look's seen with what Helper saw the AI do in this visit: a model
  // the settings check found set is said to answer only when one of Helper's calls got an answer in time; one that got
  // none in 12 s is model_slow, one that failed for want of a provider model_not; else "couldn't check" (seenFrom)
  // loom-fixes-2 part B 1: checked, the look's check call was made in this visit (the faint line under the look then
  // no longer says that no AI was used)
  const modelSaidOf = seen => {
    const v = memory.visit
    const out = seen && seen.model === 'ok' && v.aiSeen ? { ...seen, modelSaid: v.aiSeen } : seen
    return out && v.modelChecked ? { ...out, checked: true } : out
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
    const result = final || pickedFinal(w) || w.out
    const said = lineFor(result, memory.visit, w.typed, { settingsPage, keptShown: keptWasShown(memory.log) })
    writeKept()
    const [shown, after] = quiet ? [said, []] : setupAfterSaid(result, said, w.typed)
    memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...withSlow(shown, saidEntries(shown, w.sendHelper)), ...after].slice(-LOG_MAX)
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
  const aiFailed = (w, slow, err) => {
    const v = memory.visit
    // find-v2 part 3: what Helper saw the AI do, for the set-up conversation's model part (modelSaidOf)
    v.aiSeen = err && /no (llm )?provider|no usable credentials|provider is configured/i.test(String(err.message || err)) ? 'not' : slow ? 'slow' : v.aiSeen
    if (w.failed) return
    w.failed = true
    v.aiFails = (v.aiFails || 0) + 1
    if (v.aiFails < 2) return
    // last-reset (Lead, 11 Nov 15:41, his answer to the Builder's question 2): a slow or failed call no longer turns the
    // AI step off for the visit; two failed tries in a row only make SLOW_A owed, as before
    if (!v.slow) v.slow = slow && (live.waiting === w || w.answeredNow) ? 'due' : 'dropped'
  }
  const slowFail = w => aiFailed(w, true)
  // a message the AI answered in time (whatever it answered): the failed tries before it no longer count
  const aiAnswered = w => {
    if (!w.failed) {
      memory.visit.aiFails = 0
      memory.visit.aiSeen = 'ok'
    }
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
  // find-v2 part 5: the entries of the line just said with SLOW_A placed by slowPlace (src/live-turn.js): between a line
  // and its offer bubble, or after a line carrying its things to pick, or after it; else dropped for the visit
  const withSlow = (shown, entries) => {
    if (memory.visit.slow !== 'due') return entries
    const where = slowPlace(memory.visit, shown)
    if (!where) {
      memory.visit.slow = 'dropped'
      return entries
    }
    memory.visit.slow = 'said'
    const slow = { ...helperEntry(SLOW_LINE), send: false }
    if (where === 'between' && entries.length > 1) return [entries[0], slow, ...entries.slice(1)]
    if (where === 'carry' && entries[0].answers) return [...entries, { ...slow, answers: entries[0].answers }]
    return [...entries, slow]
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
    // The width the person dragged Helper's window to (remembered), and whether Helper is folded
    // away to its strip (not remembered: it starts open, so the greeting is seen first).
    const [helperWidth, setHelperWidth] = useState(initial.helperWidth)
    const [folded, setFolded] = useState(false)
    // loom-fixes (Lead's point 17a): Hide Helper, remembered: the window folds away to a thin strip at the page's right
    // edge with one button to bring it back; the Dashboard takes the freed width. The plugin itself stays as it is.
    const [hidden, setHidden] = useState(() => ctx.storage.get('helperHidden', false) === true)
    // Clear chat: null, or 'ask' while "Clear this chat with Helper?" shows with Yes and No
    const [clearing, setClearing] = useState(null)
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
    // dash-v1: the Dashboard's state, read again each time the page is put on screen (src/dash.js; loom2: no tabs)
    const dashboard = useDashboard({ active: true })
    live.profile = dashboard.given
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
    const fit = layoutFor({ width, height: size.height, tab: 'dashboard', helperWidth, folded: folded || hidden })

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
      if (!away && hidden) hideHelper(false)
      if (away) setFocusStrip(true)
      else setFocusAsk(true)
    }
    // loom-fixes: Hide Helper and Show Helper (remembered); the keyboard follows (to the strip's button, or to the box)
    function hideHelper(away) {
      setHidden(away)
      setClearing(null)
      try {
        if (away) ctx.storage.set('helperHidden', true)
        else ctx.storage.remove('helperHidden')
      } catch {}
      if (away) setFocusStrip(true)
      else {
        setFolded(false)
        setFocusAsk(true)
      }
    }
    // loom-fixes: Clear chat, after its Yes
    function clearChat() {
      liveClose()
      clearTalk()
      setClearing(null)
      setLog(memory.log)
      setFocusAsk(true)
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
    // chat-fix (his words on build 11f4eda: the end of a long reply was what he saw, cut off): a reply of the model is
    // the last line of the part that scrolls. When it is higher than the room, the conversation shows it from its
    // first line (src/layout.js replyScrollShift), and the person scrolls down through it.
    const scrollToNewest = () => {
      const el = helperScroll.current
      if (!el) return
      el.scrollTop = el.scrollHeight
      const reply = typeof el.querySelector === 'function' ? el.querySelector('[data-hh="bubble"]') : null
      if (!reply || typeof reply.getBoundingClientRect !== 'function') return
      const shift = replyScrollShift(reply.getBoundingClientRect().top, el.getBoundingClientRect().top)
      if (shift) el.scrollTop += shift
    }
    // (review of chat-fix 1, finding 6) before the screen is painted, so a long reply never shows its end first
    useLayoutEffect(scrollToNewest, [newestId, helperShown])
    // loom-fixes (Lead's point 17b): every change of the conversation is kept (the last 50 lines)
    useEffect(writeTalk, [log])
    // loom-fixes (Lead's point 16, his frame f-2m58s: every bubble lost its first letters for about a second while
    // Hermes's terminal strip under the page grew; not reproduced here): Helper's boxes are never shown scrolled
    // sideways. Its window, its conversation and our page are put back to their left edge at every draw and every
    // change of our page's size, and the conversation also at each of its own scrolls (src/talk-view.js).
    useEffect(() => {
      const conv = helperScroll.current
      const boxes = [conv, conv && typeof conv.closest === 'function' ? conv.closest('[data-hh=helper]') : null, conv && typeof conv.closest === 'function' ? conv.closest('[data-hh=page]') : null]
      for (const b of boxes) if (b && b.scrollLeft) b.scrollLeft = 0
    })
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
    // loom-fixes (Lead's point 12): "I've done this" / "Not done yet" on a stop the page cannot see: the same kept list as
    // the "done" of Helper's set-up conversation (setup_done_said), so Helper's settings page shows it with the other
    // kept things and Forget all clears it. Written at once; the page is drawn again.
    const [, setMarks] = useState(0)
    function markStop(id, done) {
      const list = (visit.kept.setup_done_said || []).filter(x => x !== id)
      if (done) list.push(id)
      if (list.length) visit.kept.setup_done_said = list
      else delete visit.kept.setup_done_said
      writeKept()
      setMarks(n => n + 1)
    }
    function addToLog(entries) {
      // talk v2 look (hhdesign's notes-wants.md rule C point 3, settled by Lead): only the newest line keeps
      // its opened part; the line that moves up into the older lines closes its steps or text to paste, and
      // its link stays, so one click opens them again. No wall of text.
      // loom-fixes (found in the app run: his typed "can we start from the begining" was not shown, and so not kept):
      // memory.log is written here at once, not inside React's updater, which React may run later; runSetup reads
      // memory.log straight after this call to put Helper's lines under the message
      memory.log = [...memory.log.map(e => (e.opened ? { ...e, opened: false } : e)), ...entries].slice(-LOG_MAX)
      setLog(memory.log)
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
      addToLog([shown ? { ...youEntry(shown), send: pressed ? false : may.you } : null, ...(slowDue ? withSlow(line, saidEntries(line, may.helper)) : saidEntries(line, may.helper)), ...after].filter(Boolean))
      setFocusAsk(true)
    }

    // setup-chat: one move of the set-up conversation (src/setup-chat.js): the person's side shows at once; when the
    // move needs the look, Hermes is read first (no AI call; the character shows busy meanwhile), then Helper's lines.
    function runSetup(mv, shown) {
      liveClose()
      memory.opening = null
      // (review) a move of the set-up conversation shows its own line: nothing of an earlier typed question's own picks
      // waits any more, and the step's own answers count again
      if (visit.setup) {
        visit.setup.reaskWaits = false
        visit.setup.stepHidden = false
      }
      if (shown) addToLog([{ ...youEntry(shown), send: false }])
      const finish = seen => {
        const says = mv.go(modelSaidOf(seen))
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
          // last-reset: no longer turns the AI step off for the visit
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
        // loom-fixes-2 part B 1: the one check call of this set-up conversation, then Helper's lines
        modelCheck(seen).then(() => once(seen))
      })
    }
    // loom-fixes-2 part B 1 (Lead's answer 2 to find-v2's questions): once per set-up conversation, when the settings
    // say a model is set and nothing has shown yet whether it answers, one small check call (src/setup-rec.js
    // MODEL_CHECK: a fixed text, nothing of the person's), at most 12 s: an answer is model_ok, a failure for want of a
    // provider model_not, no answer in 12 s model_slow (visit.aiSeen, read by modelSaidOf). No call with no model set
    // (model_not as before), in a build with no AI step, when the AI step is off for the visit, or while Hermes still
    // works on another call of Helper's.
    function modelCheck(seen) {
      const v = memory.visit
      // (once per visit: a set-up conversation started again in the same visit knows the answer already, aiSeen)
      if (!seen || seen.model !== 'ok' || v.aiSeen || v.modelChecked || AI_MODE === 'no_ai_step' || v.aiOff === true || live.inHermes > 0) return Promise.resolve()
      v.modelChecked = true
      return new Promise(resolve => {
        let ended = false
        const fin = said => {
          if (ended) return
          ended = true
          if (said && !v.aiSeen) v.aiSeen = said
          resolve()
        }
        const stop = ctx.setTimeout(() => fin('slow'), LIVE_SECONDS * 1000)
        live.inHermes++
        // the call is out of Hermes before Helper goes on (the recommendation's own call may follow at once)
        const back = said => {
          stop()
          live.inHermes--
          fin(said)
        }
        Promise.resolve()
          .then(() => askLookCheck((method, params, timeout) => host.request(method, params, timeout)))
          .then(
            res => back(modelCheckSaid(res)),
            err => back(modelCheckFailed(err))
          )
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
        const entries = setupOpening(visit, modelSaidOf(seen)).flatMap(setupEntries)
        writeKept()
        if (JSON.stringify(entries.map(e => [e.line, e.text])) === JSON.stringify(was)) return
        memory.log = entries
        if (live.view) live.view.setLog(memory.log)
      })
    }, [])

    // normal-chat: the name question ends with one short line, and nothing more is asked (no "What do you do?"). The
    // person's answer and everything before it is never sent to the model; the faint Kept: line of the name stays.
    function helloAfterName(result, shown, typed) {
      const said = lineFor(result, visit, typed, { settingsPage, keptShown: keptWasShown(memory.log) })
      visit.stage = 'open'
      visit.lastq = false
      visit.pending = null
      visit.met = true
      writeKept()
      const { offer, ask, samePicks, ...line } = said
      memory.log = memory.log.map(e => (e.send === false ? e : { ...e, send: false }))
      addToLog([shown ? { ...youEntry(shown), send: false } : null, { ...helperEntry({ ...line, ...chatSaid('CHAT_HELLO', chatHello(visit.name || visit.kept.name || null), { note: line.note || null }) }), send: false }].filter(Boolean))
      setFocusAsk(true)
    }
    // normal-chat: a message for the model. shown: as on screen; message: what is sent (a name given before a question in
    // the same message is cut off first); sendYou: whether the shown message may be among a later call's lines.
    function chatAsk(shown, message, sendYou) {
      // the page knows no model: no call (a failed call can make Hermes skip the provider for 60 s), the no-model line
      if (live.status && live.status.state === 'none') {
        lookAgain()
        addToLog([{ ...youEntry(shown), send: false }, { ...helperEntry(chatSaid('CHAT_NO_MODEL', NO_MODEL_LINE.split('. ')[0] + '.')), send: false }])
        return setFocusAsk(true)
      }
      const you = { ...youEntry(shown), send: sendYou }
      addToLog([you])
      chat.queue.push({ id: you.id, text: message })
      chatPump()
    }
    // The message box: Send or Enter (Shift+Enter makes a new line). A message that looks like a key or a password is
    // never shown back, kept or sent (today's line K1). While the name question is open, the name is read as before;
    // after it every message goes to the person's own model (chatAsk).
    function send() {
      const typed = draft
      if (!typed.trim()) return
      setDraft('')
      sendText(typed)
    }
    // chat-fix: a quick reply under Helper's reply is sent the same way, as the person's message
    function sendText(typed) {
      if (!String(typed).trim()) return
      const chars = Array.from(typed.trim())
      const shown = chars.length > 2000 ? chars.slice(0, 2000).join('') + '…' : chars.join('')
      if (chatHoldsBack(typed)) {
        const k = lineFor({ kind: 'K1' }, visit)
        addToLog(saidEntries({ ...k }, false))
        return setFocusAsk(true)
      }
      if (visit.stage === 'name' || visit.stage === 'work') {
        const { pre, out: result } = turnParts(typed, visit)
        if (['F1', 'F2', 'F3'].includes(result.kind)) return helloAfterName(result, shown, typed)
        // still the name question (small talk in its place, a refused name): answered as before
        if (visit.stage === 'name' || visit.stage === 'work') return answer(result, shown, typed)
        // a question in place of the name: the opening ends, and the question goes to the model
        visit.met = true
        writeKept()
        memory.log = memory.log.map(e => (e.send === false ? e : { ...e, send: false }))
        // (review finding 1) never among a later call's lines: a name the rules did not catch may be in it
        return chatAsk(shown, pre.name_taken ? nameWithMore(typed)[1] : typed, false)
      }
      // "what do you know about me", "forget my name", "forget everything": Helper's own fixed lines and Yes / No, as
      // before, never the model (review finding 3: the model could say it forgot what was never deleted)
      if (typedAboutKept(typed)) {
        const { out: result } = turnParts(typed, visit)
        if (result && /^A/.test(result.kind)) return answer(result, shown, typed)
      }
      chatAsk(shown, typed, true)
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
      if (result && result.kind === 'A-yes' && result.what === 'all') forgetTalk(false)
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
      // loom-fixes: a line kept from an earlier visit: only its text to copy opens (its other buttons are plain text)
      if (entry.restored) {
        if (next.kind !== 'paste') return
        memory.before = memory.before.map(e => (e.id === entry.id ? { ...e, opened: !e.opened } : e))
        return setLog(old => [...old])
      }
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
      // normal-chat: Try again under a failed call: the same message once more, as a new message
      if (next.kind === 'retry') {
        // the failed line loses its button; the message it answered leaves the lines (it is asked again now)
        const i = memory.log.findIndex(e => e.id === entry.id)
        const asked = i > 0 && memory.log[i - 1].who === 'you' ? memory.log[i - 1].id : null
        setLog(old => (memory.log = old.map(e => (e.id === entry.id ? { ...e, pressed: true, next: null } : e.id === asked ? { ...e, send: false } : e))))
        return chatAsk(next.text, next.text, true)
      }
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
      const r = skip(visit)
      if (r) helloAfterName(r, 'Skip', '')
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

    /* ---------- header: loom2, no tabs; the header keeps the room under Hermes's title bar ---------- */
    const header = jsx('div', { className: K.head, 'data-hh': 'header' })

    /* ---------- the page: the Dashboard ---------- */
    const panel = renderDashboard(dashboard, { compact: fit.main < DASH_COMPACT_UNDER_PX, kept: visit.kept, onMark: markStop })

    const main = jsx(
      'main',
      {
        className: K.detail,
        'data-hh': 'detail',
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
    // loom-fixes (Lead's point 17b): the lines kept from earlier visits come first, above this visit's
    const older = [...memory.before, ...(inBubble ? log.slice(0, -1) : log)]
    // The line appears word by word (src/reveal.js) unless reduce motion is on: then it is whole
    // from its first draw. said = all of it is on screen: answers and buttons wait for that.
    const fresh = !reduced
    let said = true
    if (inBubble && !inBubble.md) {
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

    // loom-fixes (Lead's point 17, his Loom 4:05): a small strip at the top of Helper's window, at its right, with
    // Hermes's own quiet icon buttons (ghost, icon size, as the Dashboard's close button): Hide Helper and Clear chat
    // (hhcontent's words, content/dash-words-v1.json helper_window). Clear chat asks first, in the same strip.
    const HW = DASH_DATA.words.helperWindow
    const quietIcon = (label, icon, onClick, hh) => jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': label, title: label, 'data-hh': hh, onClick, children: jsx(Codicon, { name: icon.codicon, size: 14, 'aria-hidden': true }) }, hh)
    const clearQuestion = HW.clear_ask.replace(/\s*\S+\s*\/\s*\S+\s*$/, '').trim()
    const winBar = jsx(
      'div',
      {
        className: T.bar,
        'data-hh': 'win-bar',
        children:
          clearing === 'ask'
            ? [
                jsx('span', { className: T.barAsk, role: 'alert', 'data-hh': 'clear-ask', children: clearQuestion }, 'q'),
                jsx(Button, { variant: 'secondary', size: 'xs', 'data-hh': 'clear-yes', onClick: clearChat, children: HW.clear_yes }, 'yes'),
                jsx(Button, { variant: 'ghost', size: 'xs', 'data-hh': 'clear-no', onClick: () => setClearing(null), children: HW.clear_no }, 'no')
              ]
            : [quietIcon(HW.clear, { codicon: 'clear-all' }, () => setClearing('ask'), 'clear-chat'), quietIcon(HW.hide, { codicon: 'layout-sidebar-right-off' }, () => hideHelper(true), 'hide-helper')]
      },
      'bar'
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
            winBar,
            // chat-fix: a reply of the model (md) is drawn inside the part that scrolls, as its last line; Helper's own
            // short lines and the waiting dots stay in the bubble over the character
            jsx(Conversation, { entries: older, newest: inBubble, kept: visit.kept, onNext: pressNext, onNote: pressNote, scrollRef: helperScroll, onCard: dashboard.openCard, reply: inBubble && inBubble.md ? jsx(Bubble, { entry: inBubble, clock, fresh, said, onNext: pressNext, onQuick: sendText, onCard: dashboard.openCard }, 'bubble') : null }, 'conversation'),
            inBubble ? (inBubble.md ? null : jsx(Bubble, { entry: inBubble, clock, fresh, said, onNext: pressNext }, 'bubble')) : jsx(BusyDots, { reduced }, 'bubble'),
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
    // loom-fixes: Helper hidden by the person: the strip holds one quiet icon button, Show Helper, and nothing else
    const strip = hidden
      ? jsx(
          'div',
          {
            className: K.stripHidden,
            style: { paddingTop: 'calc(var(--titlebar-height) + 0.75rem)' },
            'data-hh': 'helper-hidden',
            children: jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': HW.show, title: HW.show, 'data-hh': 'show-helper', ref: stripButton, onClick: () => hideHelper(false), children: jsx(Codicon, { name: 'layout-sidebar-right', size: 14, 'aria-hidden': true }) })
          },
          'strip'
        )
      : fit.helper !== 'column'
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

    // The left side: the room under the title bar, and under it the Dashboard.
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
      // loom-fixes (Lead's point 16): our page's box also wears hh-root (src/talk.css): it clips, so nothing can scroll
      // it sideways (an overflow-hidden box can still be scrolled by the browser, to keep a focused field in view)
      className: cx(K.root, T.root),
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
