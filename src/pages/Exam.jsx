import { useEffect, useRef, useState } from 'react'
import { api, getSession } from '../api.js'

function fmt(s) { const m = Math.floor(s / 60), r = s % 60; return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` }

export default function Exam() {
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [cfg, setCfg] = useState({ subject_id: '', minutes: 45, limit: 20, title: 'Đề thi thử' })
  const [exam, setExam] = useState(null)
  const [qs, setQs] = useState([])
  const [answers, setAnswers] = useState({})
  const [left, setLeft] = useState(0)
  const [result, setResult] = useState(null)
  const [studentName, setStudentName] = useState(localStorage.getItem('studentName') || '')
  const [exits, setExits] = useState(0)
  const timer = useRef(null)
  const focusRef = useRef({ inside: true, exits: 0, log: [] })

  useEffect(() => {
    api.subjects().then((s) => {
      setSubjects(s)
      // Ưu tiên môn Công nghệ nếu đã có seed mới
      const cn = s.find((x) => x.id === 'cn-nong') || s.find((x) => x.id.startsWith('cn-')) || s[0]
      if (cn) setCfg((c) => ({ ...c, subject_id: c.subject_id || cn.id }))
    }).catch(() => {})
    api.students().then(setStudents).catch(() => {})
  }, [])
  useEffect(() => () => { clearInterval(timer.current); detachFocus() }, [])

  const stamp = () => new Date().toISOString()
  const markLeave = () => {
    const f = focusRef.current
    if (!f.inside) return
    f.inside = false
    f.exits += 1
    f.log.push({ ev: 'exit', at: stamp() })
    if (f.log.length > 200) f.log = f.log.slice(-200)
    setExits(f.exits)
  }
  const markEnter = () => {
    const f = focusRef.current
    if (f.inside) return
    f.inside = true
    f.log.push({ ev: 'enter', at: stamp() })
  }
  const attachFocus = () => {
    detachFocus()
    focusRef.current = { inside: !document.hidden, exits: 0, log: [{ ev: 'start', at: stamp() }] }
    setExits(0)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onBlur)
  }
  const onVis = () => { if (document.hidden) markLeave(); else markEnter() }
  const onBlur = () => markLeave()
  const onFocus = () => markEnter()
  const detachFocus = () => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('pagehide', onBlur)
  }

  const start = async () => {
    const rows = await api.questions({ subject_id: cfg.subject_id, limit: cfg.limit })
    if (!rows.length) return alert('Chưa có câu hỏi cho môn này.')
    localStorage.setItem('studentName', studentName)
    const ex = await api.createExam({ title: cfg.title, mode: 'exam', duration_min: cfg.minutes, question_ids: rows.map((q) => q.id) }).catch(() => ({ id: Date.now(), title: cfg.title }))
    setExam(ex); setQs(rows); setAnswers({}); setResult(null)
    attachFocus()
    const total = (cfg.minutes || 45) * 60
    setLeft(total)
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) { clearInterval(timer.current); submit(true); return 0 }
        return v - 1
      })
    }, 1000)
  }

  const submit = async (auto = false) => {
    clearInterval(timer.current)
    detachFocus()
    const f = focusRef.current
    const details = qs.map((q) => {
      const a = (answers[q.id] || '').trim()
      if (q.qtype === 'trac_nghiem') {
        const ok = a.toUpperCase() === (q.correct_answer || '').trim().toUpperCase()
        return { question_id: q.id, user_answer: a, is_correct: ok }
      }
      return { question_id: q.id, user_answer: a, is_correct: null }
    })
    const payload = { answers: details, student_name: studentName, student_id: getSession().student?.id || null, focus_exits: f.exits, focus_log: f.log }
    try {
      const r = await api.submitExam(exam.id, payload)
      setResult({ ...r, auto })
    } catch {
      const c = details.filter((d) => d.is_correct).length
      const mc = details.filter((d) => d.is_correct != null).length
      setResult({ correct: c, total: mc, accuracy: mc ? c / mc : 0, auto, focus_exits: f.exits, note: 'Chưa lưu được về server.' })
    }
    window.scrollTo(0, 0)
  }

  const optsOf = (q) => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Thi thử bấm giờ</h1>
        {!exam ? (
          <>
            <div className="grid c3">
              <div><label className="lbl">Tên học sinh (chọn đúng tên trong đội để được xếp hạng)</label><input className="input" name="studentName" autoComplete="name" list="exam-students" placeholder="VD: Nguyễn Văn A…" value={studentName} onChange={(e) => setStudentName(e.target.value)} /><datalist id="exam-students">{students.map((s) => <option key={s.id} value={s.name}>{s.team} • {s.class_name}</option>)}</datalist></div>
              <div><label className="lbl">Môn</label><select className="select" value={cfg.subject_id} onChange={(e) => setCfg({ ...cfg, subject_id: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="lbl">Thời gian (phút)</label><select className="select" value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: Number(e.target.value) })}><option value={15}>15</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option><option value={120}>120</option></select></div>
            </div>
            <div className="grid c2" style={{ marginTop: 8 }}>
              <div><label className="lbl">Số câu</label><select className="select" value={cfg.limit} onChange={(e) => setCfg({ ...cfg, limit: Number(e.target.value) })}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={40}>40</option></select></div>
              <div><label className="lbl">Tiêu đề đề</label><input className="input" name="examTitle" autoComplete="off" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} /></div>
            </div>
            <div className="row" style={{ marginTop: 10 }}><button className="btn primary" onClick={start}>Bắt đầu làm bài</button></div>
            <div className="small muted" style={{ marginTop: 8 }}>Trắc nghiệm chấm tự động. Tự luận tự đối chiếu đáp án sau khi nộp. Trong lúc làm bài, app ghi lại <b>số lần rời khỏi app</b> (chuyển tab/ứng dụng khác, tắt màn hình) để giáo viên đối chiếu.</div>
          </>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div><b>{exam.title || cfg.title}</b><div className="small muted">{qs.length} câu • {result ? 'Đã nộp' : 'Đang làm'}{studentName && ` • ${studentName}`}</div></div>
            {!result && <div className="timer">⏱ {fmt(left)}</div>}
            {!result && <span className={`badge ${exits > 0 ? 'red' : 'green'}`}>Rời app: {exits} lần</span>}
            {!result && <button className="btn primary" onClick={() => submit(false)}>Nộp bài</button>}
            {result && <button className="btn" onClick={() => { setExam(null); setResult(null); setQs([]) }}>Làm đề khác</button>}
          </div>
        )}
        {result && <div className="card" style={{ marginTop: 10, background: '#eff6ff' }}><b>Kết quả trắc nghiệm: {result.correct}/{result.total ?? result.totalMC ?? qs.length} đúng ({Math.round((result.accuracy || 0) * 100)}%)</b>{result.auto && <span className="small"> • Tự nộp do hết giờ</span>}<div className="small" style={{ marginTop: 4 }}>Số lần rời app trong lúc làm bài: <b>{result.focus_exits ?? exits}</b>{(result.focus_exits ?? exits) > 0 && <span style={{ color: '#b45309' }}> — giáo viên sẽ thấy con số này trong lịch sử.</span>}</div></div>}
      </div>

      {exam && qs.map((q, i) => (
        <div className="card" key={q.id}>
          <b>Câu {i + 1}</b>
          <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{q.content}</div>
          {q.image_url && <div style={{ margin: '0 0 10px' }}><img src={q.image_url} alt="minh họa" style={{ maxWidth: '100%', borderRadius: 10 }} loading="lazy" /></div>}
          {q.qtype === 'trac_nghiem' ? optsOf(q).map((o, k) => {
            const L = 'ABCD'[k]
            const picked = (answers[q.id] || '').toUpperCase() === L
            let cls = 'opt' + (picked ? ' picked' : '')
            if (result) {
              if (L === (q.correct_answer || '').toUpperCase()) cls = 'opt right'
              else if (picked) cls = 'opt wrong'
            }
            return <button key={k} type="button" className={cls} disabled={!!result} aria-pressed={picked} onClick={() => !result && setAnswers({ ...answers, [q.id]: L })}><b aria-hidden="true">{L}.</b> {o}</button>
          }) : (
            <>
              <textarea className="textarea" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Bài làm tự luận…" />
              {result && <div className="small" style={{ marginTop: 8, background: '#f8fafc', padding: 8, borderRadius: 8 }}><b>Đáp án tham khảo:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{q.correct_answer}</span>{q.explanation && <><br /><b>Lời giải:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{q.explanation}</span></>}</div>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
