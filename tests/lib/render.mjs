// A tiny renderer for the built plugin: loads desktop/plugin.js with the fakes in tests/fakes/,
// renders the page to a plain tree, runs its effects, and lets a test click things.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { H } from '../fakes/react.mjs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FAKES = path.join(ROOT, 'tests', 'fakes')

let loads = 0
export async function loadPlugin() {
  const reactUrl = pathToFileURL(path.join(FAKES, 'react.mjs')).href
  const sdkUrl = pathToFileURL(path.join(FAKES, 'sdk.mjs')).href
  const src = fs
    .readFileSync(path.join(ROOT, 'desktop', 'plugin.js'), 'utf8')
    .replace("from '@hermes/plugin-sdk'", `from '${sdkUrl}'`)
    .replace("from 'react/jsx-runtime'", `from '${reactUrl}'`)
    .replace("from 'react'", `from '${reactUrl}'`)
  const file = path.join(os.tmpdir(), `hh-plugin-test-${process.pid}-${loads++}.mjs`)
  fs.writeFileSync(file, src)
  try {
    return (await import(pathToFileURL(file).href)).default
  } finally {
    fs.unlinkSync(file)
  }
}

export function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return { data, get: (k, d) => (data.has(k) ? data.get(k) : d), set: (k, v) => data.set(k, v) }
}

// The host's timers (ctx.setTimeout / ctx.setInterval), faked. setTimeout runs on the next turn of
// the event loop whatever the delay (the delay is recorded), so waits of 5 s or 60 s pass at once.
// setInterval never fires by itself: a test calls timers.tick() to fire every live interval once.
export function fakeTimers() {
  const delays = []
  const intervals = new Set()
  return {
    delays,
    intervals,
    setTimeout(fn, ms) {
      delays.push(ms)
      let live = true
      setImmediate(() => live && fn())
      return () => (live = false)
    },
    setInterval(fn, ms) {
      const entry = { fn, ms }
      intervals.add(entry)
      return () => intervals.delete(entry)
    },
    tick() {
      for (const e of [...intervals]) e.fn()
    }
  }
}

// Registers the plugin with a fake ctx; returns its contributions and the page component.
export async function registerPlugin(storage = fakeStorage(), timers = fakeTimers()) {
  const plugin = await loadPlugin()
  const contributions = []
  plugin.register({
    storage,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    registerMany: list => contributions.push(...list),
    register: c => contributions.push(c)
  })
  const page = contributions.find(c => c.area === 'routes')
  return { plugin, contributions, storage, timers, Page: page.render().type }
}

const throwaway = {
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useRef: init => ({ current: init }),
  useEffect: () => {},
  useId: () => ':r1:'
}

export function mount(Component) {
  const slots = []
  let i = 0
  let pending = []
  let rendering = false
  let dirty = false
  const view = { tree: null }

  const same = (a, b) => a && b && a.length === b.length && a.every((v, k) => Object.is(v, b[k]))
  const hooks = {
    useState(init) {
      const k = i++
      if (!(k in slots)) slots[k] = { value: typeof init === 'function' ? init() : init }
      const slot = slots[k]
      const set = v => {
        slot.value = typeof v === 'function' ? v(slot.value) : v
        if (rendering) dirty = true
        else render()
      }
      return [slot.value, set]
    },
    useRef(init) {
      const k = i++
      if (!(k in slots)) slots[k] = { current: init }
      return slots[k]
    },
    useEffect(fn, deps) {
      const k = i++
      const prev = slots[k]
      if (!prev || !deps || !same(prev.deps, deps)) pending.push(fn)
      slots[k] = { deps }
    },
    useId: () => ':r0:'
  }

  function expand(el) {
    if (el == null || el === false || el === true) return null
    if (Array.isArray(el)) return el.map(expand)
    if (typeof el !== 'object') return el
    if (typeof el.type === 'function') {
      const outer = H.cur
      H.cur = throwaway
      try {
        return expand(el.type(el.props))
      } finally {
        H.cur = outer
      }
    }
    return { type: el.type, key: el.key, props: { ...el.props, children: expand(el.props.children) } }
  }

  function render() {
    do {
      dirty = false
      rendering = true
      i = 0
      pending = []
      H.cur = hooks
      const out = Component({})
      H.cur = throwaway
      view.tree = expand(out)
      rendering = false
      const run = pending
      pending = []
      for (const fn of run) fn()
    } while (dirty)
  }

  render()
  return view
}

export const settle = async (turns = 5) => {
  for (let k = 0; k < turns; k++) await new Promise(r => setImmediate(r))
}

export function all(node, pred, out = []) {
  if (Array.isArray(node)) node.forEach(n => all(n, pred, out))
  else if (node && typeof node === 'object') {
    if (pred(node)) out.push(node)
    all(node.props.children, pred, out)
  }
  return out
}

export function text(node) {
  if (node == null) return ''
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node !== 'object') return String(node)
  return text(node.props.children)
}

export const byData = (tree, name) => all(tree, n => n.props['data-hh'] === name)[0] || null
export const byLabel = (tree, label) =>
  all(tree, n => n.props['aria-label'] === label || (n.type === 'sdk:Button' && text(n).trim() === label))[0] || null

export function click(node) {
  if (!node) throw new Error('nothing to click')
  node.props.onClick({ preventDefault() {} })
}
