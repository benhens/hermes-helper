// A tiny renderer for the built plugin: loads desktop/plugin.js with the fakes in tests/fakes/,
// renders the page to a plain tree, runs its effects, and lets a test click things.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { H } from '../fakes/react.mjs'
import { aiModeSource } from './mode-loader.mjs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const FAKES = path.join(ROOT, 'tests', 'fakes')

let loads = 0
// change: an optional function that edits the built source before it is loaded (a test copy, e.g.
// tests/lib/picked-greeting.mjs). The file on disk is never touched.
export async function loadPlugin(change = null) {
  const reactUrl = pathToFileURL(path.join(FAKES, 'react.mjs')).href
  const sdkUrl = pathToFileURL(path.join(FAKES, 'sdk.mjs')).href
  const built = fs.readFileSync(path.join(ROOT, 'desktop', 'plugin.js'), 'utf8')
  // talk-live: HELPER_AI_MODE (scripts/test-modes.mjs) sets the switch in the copy that is loaded
  const moded = process.env.HELPER_AI_MODE ? aiModeSource(built, process.env.HELPER_AI_MODE) : built
  const src = (change ? change(moded) : moded)
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
  return { data, get: (k, d) => (data.has(k) ? data.get(k) : d), set: (k, v) => data.set(k, v), remove: k => data.delete(k) }
}

// The host's timers (ctx.setTimeout / ctx.setInterval), faked. A short wait (under 30 s: the 1 s
// countdown steps, the 5 s "still checking" wait) runs on the next turn of the event loop, so it
// passes at once. A long one (the 30 s read limits) waits until the test calls timers.fireLong().
// setInterval never fires by itself: timers.tick() fires every live interval once.
// Every delay is recorded in timers.delays.
// talk-live: hold: delays that also wait, until timers.fire(ms) (the AI step's 12 s).
export function fakeTimers({ hold = [] } = {}) {
  const delays = []
  const intervals = new Set()
  const long = new Set()
  const held = new Set()
  return {
    delays,
    intervals,
    long,
    held,
    fire(ms) {
      for (const e of [...held]) {
        if (e.ms !== ms) continue
        held.delete(e)
        e.run()
      }
    },
    setTimeout(fn, ms) {
      delays.push(ms)
      let live = true
      if (hold.includes(ms)) {
        const entry = { ms, run: () => live && fn() }
        held.add(entry)
        return () => {
          live = false
          held.delete(entry)
        }
      }
      if (ms >= 30000) {
        const entry = () => live && fn()
        long.add(entry)
        return () => {
          live = false
          long.delete(entry)
        }
      }
      setImmediate(() => live && fn())
      return () => (live = false)
    },
    fireLong() {
      for (const e of [...long]) {
        long.delete(e)
        e()
      }
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
// extra: more ctx doors (e.g. os) for a test; { registerSettingsPage: undefined } is a Hermes too
// old to have plugin settings pages. change: see loadPlugin. settingsPages: what was registered there.
export async function registerPlugin(storage = fakeStorage(), timers = fakeTimers(), extra = {}, change = null) {
  const plugin = await loadPlugin(change)
  const contributions = []
  const settingsPages = []
  const ctx = {
    storage,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    registerMany: list => contributions.push(...list),
    registerSettingsPage: p => settingsPages.push(p),
    register: c => contributions.push(c),
    ...extra
  }
  plugin.register(ctx)
  const page = contributions.find(c => c.area === 'routes')
  return { plugin, contributions, settingsPages, storage, timers, ctx, Page: page.render().type }
}

// One src file that imports React, loaded with the stand-ins (its own ./ imports stay real files).
export async function loadSrc(name) {
  const reactUrl = pathToFileURL(path.join(FAKES, 'react.mjs')).href
  const srcDir = path.join(ROOT, 'src')
  const src = fs
    .readFileSync(path.join(srcDir, name), 'utf8')
    .replace("from 'react/jsx-runtime'", `from '${reactUrl}'`)
    .replace("from 'react'", `from '${reactUrl}'`)
    .replace(/from '\.\/([\w-]+\.js)'/g, (m, f) => `from '${pathToFileURL(path.join(srcDir, f)).href}'`)
  const file = path.join(os.tmpdir(), `hh-src-test-${process.pid}-${loads++}-${name}`.replace(/\.js$/, '.mjs'))
  fs.writeFileSync(file, src)
  try {
    return await import(pathToFileURL(file).href)
  } finally {
    fs.unlinkSync(file)
  }
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
  // True while the effects of one draw are running. As in React, a state change made by an effect
  // is drawn after all effects of that draw have run, not in the middle of them.
  let flushing = false
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
        if (rendering || flushing) dirty = true
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
      if (!prev || !deps || !same(prev.deps, deps)) pending.push({ k, fn })
      slots[k] = { deps, cleanup: prev ? prev.cleanup : undefined }
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
      // As React does: an effect whose inputs changed first runs the cleanup its last run returned.
      flushing = true
      try {
        for (const { k, fn } of run) {
          const slot = slots[k]
          if (typeof slot.cleanup === 'function') slot.cleanup()
          const cleanup = fn()
          slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
        }
      } finally {
        flushing = false
      }
    } while (dirty)
  }

  render()
  // Leaving the page: every effect's cleanup runs.
  view.unmount = () => {
    for (const slot of slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup()
  }
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

// A name kept whole (src/reveal.js keepNamesWhole) is an inline span inside a line's words: on screen it joins
// the text around it with no space, so it is joined that way here too.
const inlineWhole = x => x != null && typeof x === 'object' && !Array.isArray(x) && x.props && x.props['data-hh'] === 'name-whole'
const joinAll = (nodes, f) => nodes.reduce((out, x, i) => out + (i && !inlineWhole(x) && !inlineWhole(nodes[i - 1]) ? ' ' : '') + f(x), '')
export function text(node) {
  if (node == null) return ''
  if (Array.isArray(node)) return joinAll(node, text)
  if (typeof node !== 'object') return String(node)
  return text(node.props.children)
}

// What a screen reader is given: the text without anything marked aria-hidden. A line Helper says
// is in the tree twice (src/reveal.js): whole for screen readers, and word by word for the eye,
// which is aria-hidden. So spoken() holds each line once.
export function spoken(node) {
  if (node == null) return ''
  if (Array.isArray(node)) return joinAll(node, spoken)
  if (typeof node !== 'object') return String(node)
  if (node.props['aria-hidden'] === true) return ''
  return spoken(node.props.children)
}

export const byData = (tree, name) => all(tree, n => n.props['data-hh'] === name)[0] || null
export const byLabel = (tree, label) =>
  all(tree, n => n.props['aria-label'] === label || (n.type === 'sdk:Button' && text(n).trim() === label))[0] || null

export function click(node) {
  if (!node) throw new Error('nothing to click')
  node.props.onClick({ preventDefault() {} })
}
