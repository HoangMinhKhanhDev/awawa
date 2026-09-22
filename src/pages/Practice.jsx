import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Practice() {
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [cfg, setCfg] = useState({ subject_id: '', topic_id: '', grade: '', difficulty: '', limit: 10 })
  const [qs, setQs] = useState([])
  const [answers, setAnswers] = useState({})
  const [selfScore, setSelfScore] = useState({})
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => { api.subjects().then((s) => { setSubjects(s); if (s[0]) setCfg((c) => ({ ...c, subject_id: c.subject_id || s[0].id })) }).catch(() => {}) }, [])
  useEffect(() => { if (cfg.subject_id) api.topics(cfg.subject_id).then(setTopics).catch(() => {}) }, [cfg.subject_id])

  const start = async () => {
    const rows = await api.questions({ subject_id: cfg.subject_id, topic_id: cfg.topic_id, grade: cfg.grade, difficulty: cfg.difficulty, limit: cfg.limit || 10 })
    if (!rows.length) return alert('Không có câu hỏi phù hợp bộ lọc.')
    // xáo trộn nhẹ
    setQs([...rows].sort(() => Math.random() - 0.5))
    setAnswers({}); setSelfScore({}); setDone(false); setResult(null)
    window.scrollTo(0, 0)
  }

  const finish = async () => {
    // chấm trắc nghiệm tại client để phản hồi nhanh, đồng thời lưu attempt về backend
    let correct = 0, totalMC = 0
    const details = qs.map((q) => {
      const a = (answers[q.id] || '').trim()
      if (q.qtype === 'trac_nghiem') {
        totalMC += 1
        const ok = a.toUpperCase() === (q.correct_answer || '').trim().toUpperCase()
        if (ok) correct += 1
        return { question_id: q.id, user_answer: a, is_correct: ok }
      }
      return { question_id: q.id, user_answer: a, is_correct: null, self_score: Number(selfScore[q.id] || 0) }
    })
    try {
      const r = await api.createExam({ title: 'Luyện chuyên đề', mode: 'practice', question_ids: qs.map((q) => q.id) }).then((ex) =>
        api.submitExam(ex.id, { answers: details, student_name: localStorage.getItem('studentName') || '' })
      )
      setResult({ ...r, correct, totalMC })
    } catch {
      setResult({ correct, totalMC, accuracy: totalMC ? correct / totalMC : 0, note: 'Đã chấm offline tại máy (chưa lưu được về core).' })
    }
    setDone(true)
    window.scrollTo(0, 0)
  }

  const optsOf = (q) => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Luyện theo chuyên đề</h1>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8 }}>
          <select className="select" value={cfg.subject_id} onChange={(e) => setCfg({ ...cfg, subject_id: e.target.value, topic_id: '' })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="select" value={cfg.topic_id} onChange={(e) => setCfg({ ...cfg, topic_id: e.target.value })}><option value="">Mọi chuyên đề</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="select" value={cfg.grade} onChange={(e) => setCfg({ ...cfg, grade: e.target.value })}><option value="">Mọi lớp</option><option value="10">Lớp 10</option><option value="11">Lớp 11</option><option value="12">Lớp 12</option></select>
          <select className="select" value={cfg.difficulty} onChange={(e) => setCfg({ ...cfg, difficulty: e.target.value })}><option value="">Mọi độ khó</option><option value="nhận biết">Nhận biết</option><option value="thông hiểu">Thông hiểu</option><option value="vận dụng">Vận dụng</option><option value="vận dụng cao">Vận dụng cao</option></select>
          <select className="select" value={cfg.limit} onChange={(e) => setCfg({ ...cfg, limit: Number(e.target.value) })}><option value={5}>5 câu</option><option value={10}>10 câu</option><option value={15}>15 câu</option><option value={20}>20 câu</option></select>
        </div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={start}>Tạo bộ luyện</button>{qs.length > 0 && !done && <button className="btn" onClick={finish}>Nộp bài</button>}</div>
        {result && <div className="card" style={{ marginTop: 12, background: '#f0fdf4' }}><b>Kết quả trắc nghiệm: {result.correct}/{result.totalMC} đúng ({Math.round((result.accuracy ?? (result.totalMC ? result.correct / result.totalMC : 0)) * 100)}%)</b><div className="small muted">Tự luận: tự đối chiếu đáp án bên dưới và ghi điểm tự đánh giá (thang 0–10).</div></div>}
      </div>

      {qs.map((q, i) => {
        const opts = optsOf(q)
        const user = answers[q.id] || ''
        const showAns = done
        return (
          <div className="card" key={q.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>Câu {i + 1}</b>
              <span><span className="badge">{q.subject_name}</span><span className="badge">{q.topic_name || 'chung'}</span><span className="badge amber">{q.difficulty}</span></span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', margin: '10px 0' }}>{q.content}</div>
            {q.image_url && <div style={{ margin: '0 0 10px' }}><img src={q.image_url} alt="minh họa câu hỏi" style={{ maxWidth: '100%', borderRadius: 10 }} loading="lazy" /></div>}
            {q.qtype === 'trac_nghiem' && opts.map((o, k) => {
              const letter = 'ABCD'[k]
              const picked = user.toUpperCase() === letter
              let cls = 'opt' + (picked ? ' picked' : '')
              if (showAns) {
                if (letter === (q.correct_answer || '').toUpperCase()) cls = 'opt right'
                else if (picked) cls = 'opt wrong'
              }
              return <button key={k} type="button" className={cls} disabled={done} aria-pressed={picked} onClick={() => !done && setAnswers({ ...answers, [q.id]: letter })}><b aria-hidden="true">{letter}.</b> {o}</button>
            })}
            {q.qtype !== 'trac_nghiem' && (
              <>
                <label className="lbl">Bài làm của bạn</label>
                <textarea className="textarea" value={user} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Trình bày bài làm…" />
                <div className="row" style={{ marginTop: 8 }}>
                  <label className="small">Tự chấm (0–10):</label>
                  <input className="input" style={{ width: 90 }} type="number" min={0} max={10} aria-label="Điểm tự chấm từ 0 đến 10" value={selfScore[q.id] ?? ''} onChange={(e) => setSelfScore({ ...selfScore, [q.id]: e.target.value })} />
                </div>
              </>
            )}
            {showAns && (
              <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 }}>
                <div className="small"><b>Đáp án:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{q.correct_answer || '—'}</span></div>
                {q.explanation && <div className="small" style={{ marginTop: 6 }}><b>Lời giải:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{q.explanation}</span></div>}
              </div>
            )}
          </div>
        )
      })}
      {qs.length > 0 && !done && <div><button className="btn primary" onClick={finish}>Nộp bài</button></div>}
    </div>
  )
}
