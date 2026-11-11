// normal-chat: the model's reply, read as simple markdown, as plain data (src/talk-view.js draws it). Blocks:
// paragraphs, numbered and bulleted lists, headings (drawn as a bold line), code blocks (drawn as text to copy).
// Inside a block: `code`, **bold**, *italic* and [links](https://...). Nothing else is read as markup; raw HTML is
// shown as text, never put in the page.
//   mdBlocks(text) -> [{ kind: 'p' | 'h', parts }, { kind: 'ol' | 'ul', start, items: [parts] }, { kind: 'code', text }]
//   parts: [{ t: 'text' | 'code' | 'b' | 'i', text } | { t: 'a', text, href }]
export function mdInline(s) {
  const out = []
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(?<![\p{L}\p{N}*])\*([^*\n]+)\*(?![\p{L}\p{N}*])/gu
  let at = 0
  let m
  while ((m = re.exec(s))) {
    if (m.index > at) out.push({ t: 'text', text: s.slice(at, m.index) })
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'b', text: m[2] })
    else if (m[3] !== undefined) out.push({ t: 'a', text: m[3], href: m[4] })
    else if (m[5] !== undefined) out.push({ t: 'a', text: m[5], href: m[5] })
    else out.push({ t: 'i', text: m[6] })
    at = m.index + m[0].length
  }
  if (at < s.length) out.push({ t: 'text', text: s.slice(at) })
  return out
}

export function mdBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let para = []
  let list = null
  const endPara = () => {
    if (para.length) blocks.push({ kind: 'p', parts: mdInline(para.join(' ')) })
    para = []
  }
  const endList = () => {
    if (list) blocks.push({ kind: list.kind, start: list.start, items: list.items.map(mdInline) })
    list = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^\s*(```|~~~)/)
    if (fence) {
      endPara()
      endList()
      const code = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++])
      blocks.push({ kind: 'code', text: code.join('\n').replace(/\s+$/, '') })
      continue
    }
    if (!line.trim()) {
      endPara()
      // a blank line inside a list keeps the list going when the next item follows
      if (list && !(lines[i + 1] && /^\s*(\d+[.)]|[-*+])\s+/.test(lines[i + 1]))) endList()
      continue
    }
    const h = line.match(/^\s*#{1,6}\s+(.*)$/)
    if (h) {
      endPara()
      endList()
      blocks.push({ kind: 'h', parts: mdInline(h[1].replace(/\s*#+\s*$/, '')) })
      continue
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/)
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    if (ol || ul) {
      endPara()
      const kind = ol ? 'ol' : 'ul'
      if (!list || list.kind !== kind) {
        endList()
        list = { kind, start: ol ? Number(ol[1]) : 1, items: [] }
      }
      list.items.push(ol ? ol[2] : ul[1])
      continue
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ' ' + line.trim()
      continue
    }
    endList()
    para.push(line.trim())
  }
  endPara()
  endList()
  return blocks
}

