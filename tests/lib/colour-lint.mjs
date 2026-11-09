// Colour, font and shadow lint (build-v1.md section 4): the plugin may only use the person's
// Hermes theme. Finds hex colours, colour functions and CSS named colours outside var(...).
// `transparent` and `currentColor` are allowed: they carry no colour of their own.

export const NAMED_COLOURS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
  'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
  'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
  'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
  'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
  'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
  'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
  'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
  'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace ' +
  'olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred ' +
  'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
  'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey ' +
  'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow ' +
  'yellowgreen'
).split(' ')

// var(--name) and var(--name, fallback): the whole call is the theme's, so it is removed before
// scanning. Nested parentheses in fallbacks are handled one level deep, which is all CSS needs here.
function stripVars(text) {
  return text.replace(/var\(\s*--[\w-]+\s*(?:,(?:[^()]|\([^()]*\))*)?\)/g, 'VAR')
}

export function colourFindings(text) {
  const found = []
  const lines = stripVars(text).split('\n')
  lines.forEach((line, i) => {
    const at = i + 1
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) found.push({ line: at, what: m[0] })
    for (const m of line.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) found.push({ line: at, what: m[0] })
    for (const m of line.matchAll(/(?<![\w-])([a-z]+)(?![\w-])/gi)) {
      if (NAMED_COLOURS.includes(m[1].toLowerCase())) found.push({ line: at, what: m[1] })
    }
  })
  return found
}

// Tailwind classes that name a fixed palette colour instead of a theme token (bg-amber-500,
// text-white, ...). Hermes's own Badge uses a few of these; the page must not.
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
export function paletteClassFindings(classes) {
  const re = new RegExp(`(?:^|[\\s:!])(?:[\\w-]+-)?(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/\\d+)?(?=\\s|$)`, 'g')
  return [...classes.matchAll(re)].map(m => m[0].trim())
}

// Font and shadow rules: every font-family is a Hermes variable, no @font-face, no url() (no
// bundled fonts or images), and every box-shadow / text-shadow is a Hermes shadow token or a
// hairline drawn in a Hermes colour.
export function styleFindings(css) {
  const found = []
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
    if (!/^var\(--(font|dt-font)-[\w-]+\)$/.test(m[1].trim())) found.push(`font-family: ${m[1].trim()}`)
  }
  for (const m of css.matchAll(/(?<![\w-])font\s*:\s*([^;}]+)/g)) {
    if (m[1].trim() === 'inherit') continue
    if (!/var\(--(font|dt-font)-[\w-]+\)\s*$/.test(m[1].trim())) found.push(`font: ${m[1].trim()}`)
  }
  if (/@font-face/.test(css)) found.push('@font-face')
  if (/url\(\s*['"]?(?!#)/.test(css)) found.push('url(')
  for (const m of css.matchAll(/(box-shadow|text-shadow)\s*:\s*([^;}]+)/g)) {
    const v = m[2].trim()
    const ok = v === 'none' || /^var\(--shadow-[\w-]+\)$/.test(v) || /^inset 0 0 0 [\d.]+px var\(--ui-[\w-]+\)$/.test(v)
    if (!ok) found.push(`${m[1]}: ${v}`)
  }
  return found
}
