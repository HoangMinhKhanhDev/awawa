import React from 'react'

// Tach content cloze: ...___... va ...{{tu}}... -> mang [{text}|{blank:true,idx}]
export function splitCloze(content) {
  const parts = []
  const re = /(\{\{[^}]+\}\}|_{3,})/g
  let last = 0
  let m
  const src = String(content || '')
  let idx = 0
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) })
    parts.push({ blank: true, idx })
    idx++
    last = m.index + m[0].length
  }
  if (last < src.length) parts.push({ text: src.slice(last) })
  return { parts, blanks: idx }
}

// values: array string theo thu tu blank. onChange(i, val)
export function ClozeText({ content, values = [], onChange, disabled }) {
  const { parts } = splitCloze(content)
  let bi = -1
  return (
    <span style={{ whiteSpace: 'pre-wrap', lineHeight: 2 }}>
      {parts.map((p, i) => {
        if (!p.blank) return <span key={i}>{p.text}</span>
        bi += 1
        const my = bi
        return (
          <input
            key={i}
            className="input cloze-blank"
            style={{ display: 'inline-block', width: Math.max(90, 20 + String(values[my] || '').length * 10), minWidth: 90, margin: '0 4px', padding: '4px 8px', textAlign: 'center' }}
            value={values[my] || ''}
            disabled={disabled}
            aria-label={`Ô trống ${my + 1}`}
            onChange={(e) => onChange && onChange(my, e.target.value)}
          />
        )
      })}
    </span>
  )
}

export default ClozeText
