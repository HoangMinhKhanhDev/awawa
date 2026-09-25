import { useState } from 'react'
import { ClozeText } from './ClozeText.jsx'

const optsOf = (q) => {
  if (Array.isArray(q.options)) return q.options
  try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] }
}

export function typeLabel(qtype) {
  if (qtype === 'diem_khuyet') return ' — Điền từ'
  if (qtype === 'dung_sai') return ' — Đúng/Sai'
  if (qtype === 'tu_luan') return ' — Tự luận'
  return ''
}

const isTrue = (v) => ['DUNG', 'ĐÚNG', 'TRUE', 'T', '1', 'A'].includes(String(v || '').trim().toUpperCase())
const isFalse = (v) => ['SAI', 'FALSE', 'F', '0', 'B'].includes(String(v || '').trim().toUpperCase())

export default function ExamPaper({ questions = [], answers = {}, setAnswers = () => {}, result = null, interactive = false }) {
  const [revealed, setRevealed] = useState(() => new Set())
  if (!questions.length) return null

  const update = (id, value) => setAnswers({ ...answers, [id]: value })
  const reveal = (id) => setRevealed((current) => {
    const next = new Set(current)
    next.add(String(id))
    return next
  })
  const graded = {}
  if (Array.isArray(result?.answers)) {
    result.answers.forEach((a) => { if (a && a.question_id != null) graded[String(a.question_id)] = a.is_correct })
  }
  const showFor = (id) => !!result || (interactive && revealed.has(String(id)))

  const pick = (q, value) => {
    if (result) return
    update(q.id, value)
    if (interactive) reveal(q.id)
  }

  return questions.map((q, i) => {
    const show = showFor(q.id)
    return (
      <div className="card" key={q.id ?? i}>
        <b>Câu {i + 1}{typeLabel(q.qtype)}</b>
        {q.qtype === 'diem_khuyet' ? (
          <div style={{ margin: '8px 0' }}>
            <ClozeText
              content={q.content}
              values={Array.isArray(answers[q.id]) ? answers[q.id] : []}
              disabled={!!result}
              onChange={(bi, val) => {
                const cur = Array.isArray(answers[q.id]) ? [...answers[q.id]] : []
                cur[bi] = val
                update(q.id, cur)
              }}
            />
            {interactive && !show && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => reveal(q.id)}>Xem đáp án</button>}
            {show && (
              <div className="answer-box" style={{ marginTop: 8 }}>
                <b>Đáp án:</b> <span>{(q.correct_answer || '').split('|').join(' / ') || '—'}</span>
                {q.explanation && <><br /><b>Lời giải:</b> <span>{q.explanation}</span></>}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{q.content}</div>
            {q.image_url && <div style={{ margin: '0 0 10px' }}><img src={q.image_url} alt="minh họa" loading="lazy" /></div>}
            {q.qtype === 'trac_nghiem' ? (
              <>
                {optsOf(q).map((o, k) => {
                  const L = 'ABCD'[k]
                  const picked = (answers[q.id] || '').toUpperCase() === L
                  let cls = 'opt' + (picked ? ' picked' : '')
                  if (show) {
                    if (q.correct_answer && L === String(q.correct_answer).toUpperCase()) cls = 'opt right'
                    else if (picked) cls = graded[String(q.id)] === true ? 'opt right' : 'opt wrong'
                  }
                  return <button key={k} type="button" className={cls} disabled={!!result} aria-pressed={picked} onClick={() => pick(q, L)}><b aria-hidden="true">{L}.</b> {o}</button>
                })}
                {show && q.correct_answer && (
                  <div className="answer-box" style={{ marginTop: 8 }}>
                    <b>Đáp án đúng:</b> <span>{String(q.correct_answer).toUpperCase()}{optsOf(q)['ABCD'.indexOf(String(q.correct_answer).toUpperCase())] ? `. ${optsOf(q)['ABCD'.indexOf(String(q.correct_answer).toUpperCase())]}` : ''}</span>
                    {q.explanation && <><br /><b>Lời giải:</b> <span>{q.explanation}</span></>}
                  </div>
                )}
              </>
            ) : q.qtype === 'dung_sai' ? (
              <div className="row" style={{ marginTop: 8 }}>
                {[{ v: 'DUNG', label: 'Đúng' }, { v: 'SAI', label: 'Sai' }].map((choice) => {
                  const picked = String(answers[q.id] || '').toUpperCase() === choice.v
                  const correct = isTrue(q.correct_answer) ? choice.v === 'DUNG' : isFalse(q.correct_answer) ? choice.v === 'SAI' : false
                  let cls = 'opt' + (picked ? ' picked' : '')
                  if (show) {
                    if (q.correct_answer && correct) cls = 'opt right'
                    else if (picked) cls = graded[String(q.id)] === true ? 'opt right' : 'opt wrong'
                  }
                  return <button key={choice.v} type="button" className={cls} disabled={!!result} aria-pressed={picked} onClick={() => pick(q, choice.v)}>{choice.label}</button>
                })}
                {show && q.correct_answer && (
                  <div className="answer-box" style={{ marginTop: 8 }}>
                    <b>Đáp án đúng:</b> <span>{isTrue(q.correct_answer) ? 'Đúng' : 'Sai'}</span>
                    {q.explanation && <><br /><b>Lời giải:</b> <span>{q.explanation}</span></>}
                  </div>
                )}
              </div>
            ) : (
              <>
                <textarea className="textarea" value={answers[q.id] || ''} onChange={(e) => update(q.id, e.target.value)} placeholder="Bài làm tự luận…" />
                {interactive && !show && <button className="btn sm" style={{ marginTop: 8 }} onClick={() => reveal(q.id)}>Xem đáp án</button>}
                {show && (
                  <div className="answer-box" style={{ marginTop: 8 }}>
                    <b>Đáp án tham khảo:</b> <span>{q.correct_answer || '—'}</span>
                    {q.explanation && <><br /><b>Lời giải:</b> <span>{q.explanation}</span></>}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    )
  })
}
