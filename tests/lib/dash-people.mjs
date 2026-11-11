// dash-v1: the reads of the three made-up people (docs/answers/hhtech-dash-reads2.md, as hhtech saw them in the app),
// for tests/dash-rules.test.mjs and tests/dash-page.test.mjs.
import { STARTER_SOULS } from '../../src/setup-reads.js'

const ok = value => ({ ok: true, value })
const bots = n => ok({ profiles: Array.from({ length: n }, (_, i) => (i === 0 ? { name: 'default', is_default: true } : { name: `bot${i}`, is_default: false })) })

// the reads of the three made-up people
export const PEOPLE = {
  just_installed: {
    bots: bots(1),
    model: ok({ ok: true, provider: 'nous', model: null, free_tier_route: true }),
    soul: ok({ soul: STARTER_SOULS[0] }),
    status: ok({ gateway_running: true, gateway_platforms: {} }),
    cron: ok({ count: 0, jobs: [], scoped: 'default' })
  },
  half: {
    bots: bots(3),
    model: ok({ ok: true, provider: 'custom', model: 'mock-small' }),
    soul: ok({ soul: STARTER_SOULS[1].replace(/\n/g, '\r\n') }),
    status: ok({ gateway_running: true, gateway_platforms: {} }),
    cron: ok({ count: 1, jobs: [{ id: 'j1', name: 'Morning note (paused)', enabled: false }], scoped: 'default' })
  },
  all: {
    bots: bots(30),
    model: ok({ ok: true, provider: 'custom', model: 'mock-small' }),
    soul: ok({ soul: 'You are my calm helper. Speak plainly and keep answers short.\n' }),
    status: ok({ gateway_running: true, gateway_platforms: { telegram: { state: 'fatal', error_code: 'adapter_unavailable', needs_attention: true } } }),
    cron: ok({ count: 1, jobs: [{ id: 'j2', name: 'Morning note', enabled: true }], scoped: 'default' })
  }
}
