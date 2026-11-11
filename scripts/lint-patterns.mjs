// release round 20:25: the patterns of Hermes's desktop-surface lint (hermes_cli/plugin_validate_desktop.py,
// Hermes v0.23.x: _FORBIDDEN, _REVIEW and the comment stripping _COMMENT), written for JavaScript. Used by
// scripts/docs-data.mjs (it escapes one character of every hit inside the docs text) and by
// tests/lint-surface.test.mjs (it fails on any hit in desktop/plugin.js).
// Python's re reads \w and \b with Unicode letters and digits; JavaScript's are ASCII only, so each pattern is
// rewritten below with W = [\p{L}\p{N}_] and the 'u' flag, to find what the Python lint finds.
const W = '\\p{L}\\p{N}_'
function py(src, flags = 'u') {
  const out = src
    .replace(/\\b/g, `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`)
    // \w inside a character class, then on its own
    .replace(/\[([^\]]*?)\\w/g, (m, a) => `[${a}${W}`)
    .replace(/\\w/g, `[${W}]`)
  return new RegExp(out, 'g' + flags)
}

export const REFUSED = [
  ['dynamic code evaluation', py(String.raw`(?<![\w$.])eval\(|\bnew\s+Function\(`)],
  ['dynamic import outside the SDK', py(String.raw`\bimport\(\s*(?!['"](?:@hermes/plugin-sdk|react)(?:/[\w/-]*)?['"]\s*\))`)],
  ['remote import outside the SDK', py(String.raw`\bimport\s+(?:[^;'"]*?\bfrom\s*)?['"][a-zA-Z][\w+.-]*:`)],
  ['script injection', py(String.raw`createElement\(\s*['"]script['"]\s*\)|<script\b`)],
  ['app DOM reach', py(String.raw`\bdocument\.(?:querySelector(?:All)?|getElementsBy\w+|getElementById)\(\s*[` + '`' + String.raw`'"][^` + '`' + String.raw`'"]*\[data-(?:slot|tour|sidebar|testid)\b`)],
  ['app DOM reach', py(String.raw`\.observe\(\s*document\.body\s*,\s*\{[^}]*\b(?:childList|subtree)\b`)],
  ['preview guest reach', py(String.raw`\b(?:querySelector(?:All)?|closest|getElementsByTagName|createElement)\(\s*[` + '`' + String.raw`'"]webview\b`)]
]

export const REVIEW = [
  ['raw bridge window.hermesDesktop', py(String.raw`\b(?:window|globalThis|self)\s*(?:\?\.|\.)\s*hermesDesktop\b`)],
  ['app markup selector', py(String.raw`\[data-(?:slot|tour|sidebar|testid|tree-[\w-]+|pane-host|titlebar-cluster)\b`)]
]

export const ALL = [...REFUSED, ...REVIEW]

// _COMMENT: string literals are matched first and kept; block and line comments become their newlines
const COMMENT = py(String.raw`("(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'|` + '`' + String.raw`(?:[^` + '`' + String.raw`\\]|\\[\s\S])*` + '`' + String.raw`)|/\*[\s\S]*?\*/|(?<![:\w])//[^\n]*`)

export function stripComments(source) {
  return source.replace(COMMENT, (m, str) => str || '\n'.repeat((m.match(/\n/g) || []).length))
}

// every hit of every pattern: [{ rule, line, index, text }]
export function lintHits(source, patterns = ALL) {
  const stripped = stripComments(source)
  const hits = []
  for (const [rule, re] of patterns) {
    re.lastIndex = 0
    for (const m of stripped.matchAll(re)) hits.push({ rule, index: m.index, text: m[0], line: stripped.slice(0, m.index).split('\n').length })
  }
  return hits.sort((a, b) => a.index - b.index)
}
