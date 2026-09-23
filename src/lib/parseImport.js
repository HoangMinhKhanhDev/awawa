// Port của parse_text_to_drafts bên python-core/files.py sang JS,
// để mục "Nhập đề" chạy hoàn toàn trên trình duyệt (không cần server).
// Giữ nguyên quy ước: Câu 1: … / A. … / Đáp án: A / Lời giải: …

const OPT = /^\s*([A-Da-d])[.)\:\-–]\s*(.+)$/
const ANSWER_RE = /(?:đáp\s*án|dap\s*an|answer|key)\s*[:\-–]?\s*([A-Da-d])/i
const SPLIT_SRC = '(?:^|\\n)\\s*(Câu\\s+\\d+\\s*[.:–\\-)]?)'
const SPLIT = new RegExp(SPLIT_SRC, 'i')
const HEAD_STRIP = /^(Câu\s+\d+\s*[.:–\-)]?)\s*/i
const EXPL_RE = /(lời\s*giải|hướng\s*dẫn|giải\s*thích|solution)\s*[:\-–]?/i

export function parseTextToDrafts(input) {
  const text = (input || '').replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const parts = text.split(new RegExp(SPLIT_SRC, 'i'))
  let chunks = []
  if (parts.length >= 3) {
    for (let i = 1; i < parts.length; i += 2) {
      const head = (parts[i] || '').trim()
      const body = parts[i + 1] || ''
      chunks.push((head + ' ' + body.trim()).trim())
    }
  } else {
    chunks = text.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean)
  }

  const drafts = []
  for (const ch of chunks) {
    const lines = ch.split('\n').map((ln) => ln.trimEnd())
    const options = []
    const contentLines = []
    let answer = ''
    let inExpl = false
    const explLines = []

    for (const ln of lines) {
      if (EXPL_RE.test(ln)) {
        inExpl = true
        explLines.push(ln.replace(EXPL_RE, '').trim())
        continue
      }
      if (inExpl) {
        explLines.push(ln)
        continue
      }
      const m = ln.trim().match(OPT)
      if (m) {
        options.push(m[2].trim())
        const am = ln.match(ANSWER_RE)
        if (am && !answer) answer = am[1].toUpperCase()
        continue
      }
      const am = ln.match(ANSWER_RE)
      if (am && !answer) {
        answer = am[1].toUpperCase()
        const rest = ln.replace(ANSWER_RE, '').trim().replace(/^[\s:–-]+/, '').trim()
        if (rest) contentLines.push(rest)
        continue
      }
      contentLines.push(ln)
    }

    let content = contentLines.join('\n').trim()
    content = content.replace(HEAD_STRIP, '').trim()
    const explanation = explLines.join('\n').trim()
    if (!content) continue

    if (options.length >= 2) {
      drafts.push({
        content: content.slice(0, 2000),
        options: [...options, '', '', '', ''].slice(0, 4),
        correct_answer: answer,
        explanation,
        qtype: 'trac_nghiem',
        difficulty: 'vận dụng',
      })
    } else {
      drafts.push({
        content: content.slice(0, 2000),
        options: [],
        correct_answer: answer,
        explanation,
        qtype: 'tu_luan',
        difficulty: 'vận dụng',
      })
    }
  }
  return drafts
}
