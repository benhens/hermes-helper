// Stand-ins for react, react/jsx-runtime and @hermes/plugin-sdk, so tests/page-render.test.mjs can
// run the built desktop/plugin.js with Node alone (no React, no Hermes). jsx() returns plain
// objects; the hooks are driven by tests/lib/render.mjs. SDK components are strings, so the
// rendered tree shows which Hermes component sits where (type 'sdk:Button', ...).

export const H = { cur: null }

export const useState = init => H.cur.useState(init)
export const useRef = init => H.cur.useRef(init)
export const useEffect = (fn, deps) => H.cur.useEffect(fn, deps)
export const useId = () => H.cur.useId()

export function jsx(type, props, key) {
  return { type, props: props || {}, key: key ?? null }
}
export const jsxs = jsx
