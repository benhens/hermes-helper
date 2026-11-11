// The look of the set-up conversation (setup-chat): Helper reads what is set up in the person's Hermes, on this
// computer, with no AI call and nothing sent anywhere. The reads are the set-up list's (content/dash-setup-list-v2.json
// items[].read), the main bot only, as hhtech ran them in the app (docs/answers/hhtech-dash-reads.md, -reads2.md):
//   host.profiles.list()                                             the bots; the main bot is the one marked default
//   setup.runtime_check { profile: main }                            a model that answers
//   profiles.describe { name: main }                                 its personality text (SOUL.md)
//   cron.manage { action: 'list', profile: main, include_disabled }  its scheduled jobs (always with profile)
// Every read ends as { ok: true, value } or { ok: false } (failed, threw, or gave no answer in LOOK_READ_MS); a failed
// read is "couldn't check" (null, or model 'unread'), never a guess. The rules that turn the answers into done or not
// done are src/setup-reads.js (the Dashboard job's). makeReader below is src/dash.js's of job/dash-v1, unchanged.
import { botRows, mainBotName, doneFlags } from './setup-reads.js'

export const LOOK_READ_MS = 8000
// What Helper has seen when nothing could be read (also before the first look comes back)
export const LOOK_UNSEEN = { model: 'unread', soul: null, jobs: null, bots: null }

function makeReader(ctx) {
  return (fn, ms) =>
    new Promise(resolve => {
      let done = false
      const end = r => {
        if (done) return
        done = true
        stop()
        resolve(r)
      }
      const stop = ctx.setTimeout(() => end({ ok: false }), ms)
      Promise.resolve()
        .then(fn)
        .then(
          value => end({ ok: true, value }),
          () => end({ ok: false })
        )
    })
}

// The reads' answers as what the set-up conversation uses (src/setup-chat.js `seen`)
export function seenFrom(reads) {
  const f = doneFlags(reads)
  const rows = reads.bots && reads.bots.ok ? botRows(reads.bots.value) : null
  const cron = reads.cron && reads.cron.ok ? reads.cron.value : null
  const jobs = cron && typeof cron === 'object' ? (Number.isInteger(cron.count) ? cron.count : Array.isArray(cron.jobs) ? cron.jobs.length : null) : null
  return { model: f.model === null ? 'unread' : f.model ? 'ok' : 'not', soul: f.personality, jobs, bots: rows ? rows.length : null }
}

// look() reads Hermes now and resolves with `seen`; it never rejects.
export function makeLook(ctx, host) {
  const read = makeReader(ctx)
  const request = (method, params) => read(() => host.request(method, params, LOOK_READ_MS), LOOK_READ_MS)
  return async function look() {
    try {
      const bots = await read(() => host.profiles.list(), LOOK_READ_MS)
      const rows = bots.ok ? botRows(bots.value) : null
      // the main bot's three reads need its name; when the bots read failed they are not made (never another bot's answer)
      const main = mainBotName(rows)
      const notRead = Promise.resolve({ ok: false })
      const [model, soul, cron] = await Promise.all([
        main ? request('setup.runtime_check', { profile: main }) : notRead,
        main ? request('profiles.describe', { name: main }) : notRead,
        main ? request('cron.manage', { action: 'list', profile: main, include_disabled: true }) : notRead
      ])
      return seenFrom({ bots: rows ? bots : { ok: false }, model, soul, cron })
    } catch {
      return { ...LOOK_UNSEEN }
    }
  }
}
