// The look of the set-up conversation (setup-chat): Helper reads what is set up in the person's Hermes, on this
// computer, with no AI call and nothing sent anywhere. The reads are the set-up list's (content/dash-setup-list-v2.json
// items[].read), the main bot only, as hhtech ran them in the app (docs/answers/hhtech-dash-reads.md, -reads2.md):
//   host.profiles.list()                                             the bots; the main bot is the one marked default
//   setup.runtime_check { profile: main }                            a model that answers
//   profiles.describe { name: main }                                 its personality text (SOUL.md)
//   cron.manage { action: 'list', profile: main, include_disabled }  its scheduled jobs (always with profile)
// Every read ends as { ok: true, value } or { ok: false } (failed, threw, or gave no answer in LOOK_READ_MS); a failed
// read is "couldn't check" (null, or model 'unread'), never a guess. The rules that turn the answers into done or not
// done are src/setup-reads.js (the Dashboard job's), and so is makeReader (one copy, shared with src/dash.js).
import { botRows, mainBotName, openBotName, doneFlags, makeReader } from './setup-reads.js'
// loom-fixes (Lead's point 9: Helper's next thing and the Dashboard's "You are here" agree): the look reads the same bot
// as the Dashboard, the one the app has open (by the app's own name for it; with no name given, the one Hermes marks
// as default), where it read the main bot before; and it reads Chat apps and First chat as the Dashboard does
// (host.status(), host.listPersistedSessions: feature-checked; with no door the thing is not seen, as before).

export const LOOK_READ_MS = 8000
// What Helper has seen when nothing could be read (also before the first look comes back)
export const LOOK_UNSEEN = { model: 'unread', soul: null, jobs: null, bots: null }

// The reads' answers as what the set-up conversation uses (src/setup-chat.js `seen`)
export function seenFrom(reads) {
  const f = doneFlags(reads)
  const rows = reads.bots && reads.bots.ok ? botRows(reads.bots.value) : null
  const cron = reads.cron && reads.cron.ok ? reads.cron.value : null
  const jobs = cron && typeof cron === 'object' ? (Number.isInteger(cron.count) ? cron.count : Array.isArray(cron.jobs) ? cron.jobs.length : null) : null
  // chat, firstChat (loom-fixes): true, false, null (the read failed), undefined (no such read in this Hermes)
  // find-v2 (changes-13 look.model_rule): the settings check says only that a model is set, never that it answers, so
  // what is said of it is "couldn't check" until the page has seen an answer (modelSaid; src/page.js)
  const model = f.model === null ? 'unread' : f.model ? 'ok' : 'not'
  return { model, modelSaid: model === 'ok' ? 'unread' : model, soul: f.personality, jobs, bots: rows ? rows.length : null, chat: reads.status === undefined ? undefined : f.chat_apps, firstChat: f.first_chat }
}

// look() reads Hermes now and resolves with `seen`; it never rejects.
// getProfile: the name the app gives the open bot now ('' or missing: none given); src/page.js hands it in.
export function makeLook(ctx, host, getProfile = () => '') {
  const read = makeReader(ctx)
  const request = (method, params) => read(() => host.request(method, params, LOOK_READ_MS), LOOK_READ_MS)
  return async function look() {
    try {
      const bots = await read(() => host.profiles.list(), LOOK_READ_MS)
      const rows = bots.ok ? botRows(bots.value) : null
      // the bot's reads need its name: the open bot by the app's own name, else the one marked default; with neither
      // (the bots read failed and the app names none) they are not made (never another bot's answer)
      const given = getProfile()
      const main = typeof given === 'string' && given.trim() ? openBotName(given) : mainBotName(rows)
      const notRead = Promise.resolve({ ok: false })
      const door = get => {
        try {
          const fn = get()
          return typeof fn === 'function' ? fn : null
        } catch {
          return null
        }
      }
      const getStatus = door(() => host.status)
      const listSessions = door(() => host.listPersistedSessions)
      const [model, soul, cron, status, sessions] = await Promise.all([
        main ? request('setup.runtime_check', { profile: main }) : notRead,
        main ? request('profiles.describe', { name: main }) : notRead,
        main ? request('cron.manage', { action: 'list', profile: main, include_disabled: true }) : notRead,
        getStatus ? read(() => getStatus(), LOOK_READ_MS) : Promise.resolve(undefined),
        listSessions && main ? read(() => listSessions(null, { profile: main, limit: 500 }), LOOK_READ_MS) : Promise.resolve(undefined)
      ])
      return seenFrom({ bots: rows ? bots : { ok: false }, model, soul, cron, status, sessions })
    } catch {
      return { ...LOOK_UNSEEN }
    }
  }
}
