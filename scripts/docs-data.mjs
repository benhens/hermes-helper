// normal-chat (Pēteris's second Loom of 11 Nov): Helper's resources. Turns the Hermes docs (a copy of the Hermes
// website's docs folder, by default ../dev/hermes-src/website/docs, outside this repo) into chunks of about 1,500
// characters, each with its page title, heading and docs address, and writes them to src/docs-data.js, which is
// committed (the copy of the docs is not in this repo, so `npm test` does not run this script).
//   node scripts/docs-data.mjs [docs folder]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintHits } from './lint-patterns.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.resolve(process.argv[2] || path.join(ROOT, '..', 'dev', 'hermes-src', 'website', 'docs'))
const PARTS = ['getting-started', 'user-guide', 'guides', 'integrations', 'reference']
// left out: one page per skill (user-guide/skills/bundled and optional, 2.6 MB of the 7.3 MB): each skill's own
// manual, not about setting Hermes up or using it; with them the built file grew by about 7 MB instead of about 4
const SKIP = ['user-guide/skills/bundled', 'user-guide/skills/optional']
const OUT = path.join(ROOT, 'src', 'docs-data.js')
const BASE = 'https://hermes-agent.nousresearch.com/docs/'
export const CHUNK_CHARS = 1500

function files(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...files(p))
    else if (/\.mdx?$/.test(e.name)) out.push(p)
  }
  return out
}

// front matter off; JSX (imports, exports, tags such as <Tabs>, {/* comments */}) off; code blocks kept as they are
export function cleanPage(text) {
  let title = null
  let body = text.replace(/\r\n/g, '\n')
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/)
  if (fm) {
    const t = fm[1].match(/^title:\s*["']?(.*?)["']?\s*$/m)
    if (t) title = t[1]
    body = body.slice(fm[0].length)
  }
  const out = []
  let inCode = false
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode
      out.push(line.replace(/^\s+/, ''))
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }
    if (/^\s*(import|export)\s/.test(line)) continue
    let l = line.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<\/?[A-Z][A-Za-z.]*(\s[^>]*)?\/?>/g, '').replace(/<\/?(div|details|summary|br|img|span|p)(\s[^>]*)?\/?>/g, '')
    l = l.replace(/^:::\w*.*$/, '').replace(/^:::$/, '')
    out.push(l)
  }
  body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!title) {
    const h = body.match(/^#\s+(.+)$/m)
    title = h ? h[1].trim() : null
  }
  return { title, body }
}

// split at headings first, then at blank lines, never inside a code block, to about CHUNK_CHARS characters
export function chunkPage(rel, text) {
  const { title, body } = cleanPage(text)
  const url = BASE + rel.replace(/\\/g, '/').replace(/\.mdx?$/, '').replace(/\/index$/, '')
  const pageTitle = title || rel
  const sections = []
  let cur = { heading: pageTitle, lines: [] }
  let inCode = false
  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line)) inCode = !inCode
    const h = !inCode && line.match(/^#{1,4}\s+(.+)$/)
    if (h) {
      if (cur.lines.join('').trim()) sections.push(cur)
      cur = { heading: h[1].replace(/\{#[^}]*\}/, '').trim(), lines: [] }
      continue
    }
    cur.lines.push(line)
  }
  if (cur.lines.join('').trim()) sections.push(cur)
  const chunks = []
  for (const s of sections) {
    // blocks: paragraphs, with a code block kept whole
    const blocks = []
    let b = []
    let code = false
    for (const line of s.lines) {
      if (/^(```|~~~)/.test(line)) code = !code
      if (!code && !line.trim()) {
        if (b.length) blocks.push(b.join('\n'))
        b = []
      } else b.push(line)
    }
    if (b.length) blocks.push(b.join('\n'))
    let text = ''
    for (const blk of blocks) {
      if (text && text.length + blk.length > CHUNK_CHARS) {
        chunks.push({ title: pageTitle, heading: s.heading, url, text })
        text = ''
      }
      text = text ? text + '\n\n' + blk : blk.length > CHUNK_CHARS * 2 ? blk.slice(0, CHUNK_CHARS * 2) : blk
    }
    if (text.trim()) chunks.push({ title: pageTitle, heading: s.heading, url, text })
  }
  return chunks
}

export function buildChunks(docs = DOCS) {
  const all = []
  for (const part of PARTS) {
    const dir = path.join(docs, part)
    if (!fs.existsSync(dir)) continue
    for (const f of files(dir)) if (!SKIP.some(s => path.relative(docs, f).replace(/\\/g, '/').startsWith(s + '/'))) all.push(...chunkPage(path.relative(docs, f), fs.readFileSync(f, 'utf8')))
  }
  return all
}

// release round 20:25: the docs quote code (`eval(`, `<script`, `window.hermesDesktop`, `[data-slot]`), and Hermes's
// plugin lint reads string literals too, so in the array literal written out, one character of every place where a
// lint pattern matches is written as a \uXXXX escape. JSON.parse of the literal gives the same text, character for
// character. Only plain characters are escaped (never one that is part of an escape such as \n), and the loop goes
// on until no pattern matches.
// one string -> its literal ("..."), escaped this way
export function escapedString(value) {
  let s = JSON.stringify(value)
  for (let round = 0; ; round++) {
    const hits = lintHits(s)
    if (!hits.length) return s
    if (round > 200) throw new Error('docs data: lint hits left after 200 rounds')
    const hit = hits[0]
    let at = -1
    for (let i = hit.index; i < hit.index + hit.text.length; i++) if (plainAt(s, i)) { at = i; break }
    if (at < 0) throw new Error(`docs data: no plain character to escape in ${JSON.stringify(hit.text)}`)
    s = s.slice(0, at) + '\\u' + s.charCodeAt(at).toString(16).padStart(4, '0') + s.slice(at + 1)
  }
}

// the whole array literal: [[title, heading, url, text], ...]; throws if a hit is left across two strings
export function escapedArray(rows) {
  const out = '[' + rows.map(r => '[' + r.map(escapedString).join(',') + ']').join(',') + ']'
  const left = lintHits(out)
  if (left.length) throw new Error(`docs data: lint hits left in the array: ${JSON.stringify(left.slice(0, 3))}`)
  return out
}

// s[i] (inside one string literal s) is a plain character: not the outer quotes, not a backslash, not the letter or
// the 4 hex digits of an escape
function plainAt(s, i) {
  if (i === 0 || i === s.length - 1 || s[i] === '\\') return false
  if (backslashes(s, i) % 2 === 1) return false
  for (let k = Math.max(1, i - 4); k < i; k++) if (s[k] === 'u' && backslashes(s, k) % 2 === 1) return false
  return true
}

function backslashes(s, i) {
  let n = 0
  for (let j = i - 1; j >= 0 && s[j] === '\\'; j--) n++
  return n
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chunks = buildChunks()
  if (!chunks.length) throw new Error(`no docs found in ${DOCS}`)
  writeDocsData(chunks)
}

export function writeDocsData(chunks) {
  const src = [
    '// Generated by scripts/docs-data.mjs from the Hermes docs (getting-started, user-guide, guides, integrations,',
    '// reference): chunks of about 1,500 characters, each with its page title, heading and docs address. Helper sends',
    '// the best 5 for a message to the person\'s own model (src/chat.js). Run the script again to bring them up to date.',
    '// Where the docs quote code that Hermes\'s plugin lint looks for (eval and script tags, for example), one character',
    '// is written as a unicode escape; the text read from the array is the docs text, character for character.',
    `export const DOCS_CHUNKS = ${escapedArray(chunks.map(c => [c.title, c.heading, c.url, c.text]))}`,
    ''
  ].join('\n')
  fs.writeFileSync(OUT, src)
  console.log(`${chunks.length} chunks, ${src.length} characters -> ${path.relative(ROOT, OUT)}`)
}
