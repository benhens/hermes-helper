// The helper's character: hhdesign's drawn hand (design/hermes-look-r3), inline SVG.
// One self-contained piece so it can be swapped or removed (Pēteris is still deciding whether it
// stays): the page uses it only through <Character>, in the helper panel and the hidden-helper button.
// Colours: the body is the theme accent (--ui-accent) blended into the page surface; face lines use
// the theme's main text colour. All as inline styles, so there is no stylesheet to clean up.
import { useId } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const BODY =
  'M31 73c-5.5 0-9-3.4-9-9v-10.5c-4.6-1.1-9-5.3-9.6-10.4-.5-4.3 3.4-6.9 7.1-4.6 1 .6 1.8 1.4 2.5 2.4V29c0-11 8.6-19 20-19s20 8 20 19v35c0 5.6-3.5 9-9 9z'

const SURFACE = 'var(--ui-editor-surface-background)'
const mix = pct => `color-mix(in oklab, var(--ui-accent) ${pct}%, ${SURFACE})`
const INK = { fill: 'var(--ui-text-primary)' }
const INK_LINE = { fill: 'none', stroke: 'var(--ui-text-primary)', strokeWidth: 2, strokeLinecap: 'round' }

export function Character({ size = 72, mood = 'smile', shadow = true, label = 'Helping Hand' }) {
  const gid = 'hh-g' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const mouth = mood === 'smile' ? 'M39 43.5q4.5 4 9 0' : 'M39.5 45h8'
  return jsxs('svg', {
    viewBox: '0 0 80 80',
    width: size,
    height: size,
    style: { display: 'block', flex: 'none' },
    role: label ? 'img' : undefined,
    'aria-label': label || undefined,
    'aria-hidden': label ? undefined : true,
    'data-hh-character': '',
    children: [
      jsx('defs', {
        children: jsxs('linearGradient', {
          id: gid,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
          children: [
            jsx('stop', { offset: 0, style: { stopColor: mix(62) } }),
            jsx('stop', { offset: 1, style: { stopColor: mix(80) } })
          ]
        })
      }),
      shadow ? jsx('ellipse', { cx: 42, cy: 76.5, rx: 19, ry: 2.4, style: { fill: 'var(--ui-text-primary)', opacity: 0.1 } }) : null,
      jsx('path', { d: BODY, fill: `url(#${gid})` }),
      jsx('path', { d: 'M22 50.5c1.6 1.3 2.6 1.9 4.4 2.4', style: { fill: 'none', stroke: 'var(--ui-accent)', strokeWidth: 1.6, strokeLinecap: 'round' } }),
      jsx('rect', { x: 22, y: 64, width: 40, height: 9, rx: 4.5, style: { fill: mix(30) } }),
      jsx('ellipse', { cx: 37, cy: 35, rx: 3.3, ry: 4.3, style: INK }),
      jsx('ellipse', { cx: 50, cy: 35, rx: 3.3, ry: 4.3, style: INK }),
      jsx('circle', { cx: 38.3, cy: 33.3, r: 1.1, style: { fill: SURFACE } }),
      jsx('circle', { cx: 51.3, cy: 33.3, r: 1.1, style: { fill: SURFACE } }),
      jsx('circle', { cx: 31, cy: 43.5, r: 3, style: { fill: mix(35), opacity: 0.9 } }),
      jsx('circle', { cx: 56, cy: 43.5, r: 3, style: { fill: mix(35), opacity: 0.9 } }),
      jsx('path', { d: mouth, style: INK_LINE })
    ]
  })
}
