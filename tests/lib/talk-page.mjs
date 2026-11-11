// find-v1: the built page with a stand-in for the person's AI, for tests that type into Helper's window (the helpers
// tests/offers-page.test.mjs has, in one place). oneshot(params, n): the reply to the n-th llm.oneshot call (a text, an
// Error to throw, or a promise that never settles for an AI that does not answer); check: what setup.runtime_check
// gives (a function may change it from call to call).
import { registerPlugin, fakeStorage, fakeTimers, mount, settle, all, text, byData, spoken } from './render.mjs'
import { aiModeSource } from './mode-loader.mjs'

export function useHost({ oneshot = () => 'NONE', check = { ok: true, model: 'mock-small' } } = {}) {
  const host = {
    asks: [],
    checks: 0,
    request: async (method, params) => {
      if (method === 'llm.oneshot') {
        host.asks.push(params)
        const a = await oneshot(params, host.asks.length)
        if (a instanceof Error) throw a
        return { text: a }
      }
      if (method === 'setup.runtime_check') {
        host.checks++
        const c = typeof check === 'function' ? check(host.checks) : check
        if (c instanceof Error) throw c
        return c
      }
      const answer = { 'setup.status': { provider_configured: false } }[method]
      if (!answer) throw new Error('unexpected ' + method)
      return answer
    }
  }
  globalThis.__hhHost = host
  return host
}
export async function open(mode, { storage = fakeStorage(), host = {} } = {}) {
  const h = useHost(host)
  const timers = fakeTimers({ hold: [12000] })
  const { Page } = await registerPlugin(storage, timers, {}, src => aiModeSource(src, mode))
  const view = mount(Page)
  await settle()
  return { view, timers, host: h, storage }
}
export const helper = view => byData(view.tree, 'helper')
export const bubble = view => byData(helper(view), 'bubble')
export const bubbleLine = view => bubble(view).props['data-line']
export const bubbleSaid = view => spoken(byData(bubble(view), 'said')).trim()
export const olds = view => all(helper(view), n => n.props['data-hh'] === 'old')
export const oldLines = view => olds(view).map(n => n.props['data-line'])
export const mine = view => all(helper(view), n => n.props['data-hh'] === 'me').map(n => text(n).replace(/^You said: /, '').trim())
export const dots = view => byData(helper(view), 'busy-dots')
export const box = view => all(view.tree, n => n.type === 'sdk:Textarea')[0]
export const finish = view => byData(view.tree, 'page').props.onPointerDownCapture({})
export const answers = view => all(view.tree, n => n.props['data-hh'] === 'answer')
export const labels = view => answers(view).map(a => text(a).trim())
export function send(view, words) {
  box(view).props.onChange({ target: { value: words } })
  box(view).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} })
  finish(view)
}
export function press(view, label) {
  const a = answers(view).find(n => text(n).trim() === label)
  if (!a) throw new Error('no pick ' + label + ' among ' + labels(view).join(' / '))
  a.props.onClick({ preventDefault() {} })
  finish(view)
}
export async function pastOpening(mode, options) {
  const o = await open(mode, options)
  finish(o.view)
  send(o.view, 'Peter')
  send(o.view, 'I run a tennis club')
  return o
}
export { settle, fakeStorage }
// every line of Helper's on screen, oldest first (the speech bubble last), and the newest that is no offer bubble
export const allLines = view => [...oldLines(view), bubble(view) ? bubbleLine(view) : null].filter(Boolean)
export const answerLine = view => allLines(view).filter(l => !String(l).startsWith('offer-')).at(-1)
export const count = (view, id) => allLines(view).filter(l => l === id).length
export const never = () => new Promise(() => {})
export function deferred() {
  let resolve
  let reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
