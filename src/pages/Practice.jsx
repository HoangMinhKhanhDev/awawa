import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconPlay, IconTimer, IconAward } from '../components/icons.jsx'
import { ClozeText } from '../components/ClozeText.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { filterSubjects } from '../lib/subjects.js'

const optsOf = (q) => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }

export default function Practice() {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [weak, setWeak] = useState([])
  const [cfg, setCfg] = useState({ subject_id: '', topic_id: '', grade: '', difficulty: '', limit: 10 })
  const [qs, setQs] = useState([])
  const [answers, setAnswers] = useState({})
  const [selfScore, setSelfScore] = useState({})
  const [done, setDone] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => { api.subjects().then((all) => { const s = filterSubjects(all); setSubjects(s); if (s[0]) setCfg((c) => ({ ...c, subject_id: c.subject_id || s[0].id })) }).catch(() => {}) }, [])
  useEffect(() => { if (cfg.subject_id) api.topics(cfg.subject_id).then(setTopics).catch(() => {}) }, [cfg.subject_id])
  useEffect(() => { api.stats().then((s) => setWeak(s?.weak_topics || [])).catch(() => {}) }, [])
  const me = getSession().student

  const pickWeak = (name) => {
    const t = topics.find((x) => x.name === name)
    if (t) {
      setCfg((c) => ({ ...c, topic_id: t.id }))
      document.getElementById('luyen-filter')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const start = async () => {
    if (busy) return
    setBusy(true)
    try {
      const rows = await api.questions({ subject_id: cfg.subject_id, topic_id: cfg.topic_id, grade: cfg.grade, difficulty: cfg.difficulty, limit: cfg.limit || 10 })
      if (!rows.length) { toast('Không có câu hỏi phù hợp bộ lọc.', 'warn'); setBusy(false); return }
      setQs([...rows].sort(() => Math.random() - 0.5))
      setAnswers({}); setSelfScore({}); setDone(false); setResult(null)
      window.scrollTo(0, 0)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const finish = async () => {
    if (finishing || done) return
    setFinishing(true)
    let correct = 0, totalMC = 0
    const details = qs.map((q) => {
      const a = answers[q.id]
      if (q.qtype === 'trac_nghiem') {
        const s = String(a || '').trim()
        totalMC += 1
        const ok = s.toUpperCase() === (q.correct_answer || '').trim().toUpperCase()
        if (ok) correct += 1
        return { question_id: q.id, user_answer: s, is_correct: ok }
      }
      if (q.qtype === 'diem_khuyet') {
        return { question_id: q.id, user_answer: Array.isArray(a) ? a : [], is_correct: null }
      }
      return { question_id: q.id, user_answer: String(a || '').trim(), is_correct: null, self_score: Number(selfScore[q.id] || 0) }
    })
    try {
      const r = await api.createExam({ title: 'Luyện chuyên đề', mode: 'practice', question_ids: qs.map((q) => q.id) }).then((ex) =>
        api.submitExam(ex.id, { answers: details, student_name: localStorage.getItem('studentName') || '', student_id: getSession().student?.id || null })
      )
      setResult({ ...r, correct, totalMC })
    } catch {
      setResult({ correct, totalMC, accuracy: totalMC ? correct / totalMC : 0, note: 'Đã chấm offline tại máy (chưa lưu được về core).' })
    }
    setDone(true)
    setFinishing(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className="grid">
      <div className="hero">
        <h1>Hôm nay ôn gì{me ? `, ${me.name.split(' ').slice(-1)}` : ''}?</h1>
        <p>Luyện đúng chuyên đề đang yếu — mỗi bộ 10–15 câu, xem lời giải ngay sau khi nộp.</p>
        {weak.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {weak.slice(0, 4).map((t) => (
              <button key={t.topic} className="chip" onClick={() => pickWeak(t.topic)}>
                {t.topic} · {Math.round((t.accuracy || 0) * 100)}%
              </button>
            ))}
          </div>
        )}
        <div className="hero-cta">
          <button className="btn hero-go" onClick={() => document.getElementById('luyen-filter')?.scrollIntoView({ behavior: 'smooth' })}><IconPlay className="icn sm" />Tạo bộ luyện</button>
          <Link className="btn hero-ghost" to="/exam"><IconTimer className="icn sm" />Thi thử bấm giờ</Link>
        </div>
      </div>
      <div className="card" id="luyen-filter">
        <h1>Luyện theo chuyên đề</h1>
        <div className="filter-grid">
          <select className="select" aria-label="Môn" value={cfg.subject_id} onChange={(e) => setCfg({ ...cfg, subject_id: e.target.value, topic_id: '' })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="select" aria-label="Chuyên đề" value={cfg.topic_id} onChange={(e) => setCfg({ ...cfg, topic_id: e.target.value })}><option value="">Mọi chuyên đề</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="select" aria-label="Lớp" value={cfg.grade} onChange={(e) => setCfg({ ...cfg, grade: e.target.value })}><option value="">Mọi lớp</option><option value="10">Lớp 10</option><option value="11">Lớp 11</option><option value="12">Lớp 12</option></select>
          <select className="select" aria-label="Độ khó" value={cfg.difficulty} onChange={(e) => setCfg({ ...cfg, difficulty: e.target.value })}><option value="">Mọi độ khó</option><option value="nhận biết">Nhận biết</option><option value="thông hiểu">Thông hiểu</option><option value="vận dụng">Vận dụng</option><option value="vận dụng cao">Vận dụng cao</option></select>
          <select className="select" aria-label="Số câu" value={cfg.limit} onChange={(e) => setCfg({ ...cfg, limit: Number(e.target.value) })}><option value={5}>5 câu</option><option value={10}>10 câu</option><option value={15}>15 câu</option><option value={20}>20 câu</option></select>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={start} disabled={busy}><IconPlay className="icn sm" />{busy ? 'Đang tải…' : 'Tạo bộ luyện'}</button>
          {qs.length > 0 && !done && <button className="btn" onClick={finish} disabled={finishing}>{finishing ? 'Đang nộp…' : 'Nộp bài'}</button>}
        </div>
        {result && (
          <div className="msg ok" style={{ marginTop: 12 }} role="status">
            <b><IconAward className="icn sm" /> Kết quả trắc nghiệm: {result.correct}/{result.totalMC} đúng ({Math.round((result.accuracy ?? (result.totalMC ? result.correct / result.totalMC : 0)) * 100)}%)</b>
            <div className="small muted" style={{ marginTop: 4 }}>Tự luận: tự đối chiếu đáp án bên dưới và ghi điểm tự đánh giá (thang 0–10).</div>
            {result.note && <div className="small muted">{result.note}</div>}
          </div>
        )}
      </div>

      {qs.map((q, i) => {
        const opts = optsOf(q)
        const user = answers[q.id] || ''
        const showAns = done
        return (
          <div className="card" key={q.id}>
            <div className="row spread">
              <b>Câu {i + 1}</b>
              <span><span className="badge">{q.subject_name}</span><span className="badge">{q.topic_name || 'chung'}</span><span className="badge amber">{q.difficulty}</span></span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', margin: '10px 0' }}>
              {q.qtype === 'diem_khuyet'
                ? <ClozeText content={q.content} values={Array.isArray(user) ? user : []} disabled={done}
                    onChange={(bi, val) => { const cur = Array.isArray(answers[q.id]) ? [...answers[q.id]] : []; cur[bi] = val; setAnswers({ ...answers, [q.id]: cur }) }} />
                : q.content}
            </div>
            {q.image_url && <div style={{ margin: '0 0 10px' }}><img src={q.image_url} alt="minh họa câu hỏi" loading="lazy" /></div>}
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
            {q.qtype !== 'trac_nghiem' && q.qtype !== 'diem_khuyet' && (
              <>
                <label className="lbl" htmlFor={`pa-${q.id}`}>Bài làm của bạn</label>
                <textarea className="textarea" id={`pa-${q.id}`} value={user} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Trình bày bài làm…" />
                <div className="row" style={{ marginTop: 8 }}>
                  <label className="small" htmlFor={`ps-${q.id}`}>Tự chấm (0–10):</label>
                  <input className="input" id={`ps-${q.id}`} style={{ width: 90 }} type="number" min={0} max={10} value={selfScore[q.id] ?? ''} onChange={(e) => setSelfScore({ ...selfScore, [q.id]: e.target.value })} />
                </div>
              </>
            )}
            {showAns && (
              <div className="answer-box correct" style={{ marginTop: 10 }}>
                <div className="small"><b>Đáp án:</b> <span>{q.correct_answer || '—'}</span></div>
                {q.explanation && <div className="small" style={{ marginTop: 6 }}><b>Lời giải:</b> <span>{q.explanation}</span></div>}
              </div>
            )}
          </div>
        )
      })}
      {qs.length > 0 && !done && <div><button className="btn primary" onClick={finish} disabled={finishing}>{finishing ? 'Đang nộp…' : 'Nộp bài'}</button></div>}
    </div>
  )
}
