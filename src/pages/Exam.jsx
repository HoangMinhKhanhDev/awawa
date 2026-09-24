import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { IconTimer, IconTrophy, IconPlay } from '../components/icons.jsx'
import { ClozeText } from '../components/ClozeText.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'

function fmt(s) { const m = Math.floor(s / 60), r = s % 60; return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` }
const optsOf = (q) => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }

export default function Exam() {
  const { toast, errMsg } = useUI()
  const loc = useLocation()
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [sharedExams, setSharedExams] = useState([])
  const [cfg, setCfg] = useState({ subject_id: '', minutes: 45, limit: 20, title: 'Đề thi thử' })
  const [exam, setExam] = useState(null)
  const [qs, setQs] = useState([])
  const [answers, setAnswers] = useState({})
  const [left, setLeft] = useState(0)
  const [result, setResult] = useState(null)
  const [studentName, setStudentName] = useState(localStorage.getItem('studentName') || '')
  const [exits, setExits] = useState(0)
  const [busy, setBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const timer = useRef(null)
  const focusRef = useRef({ inside: true, exits: 0, log: [] })
  const handlersRef = useRef(null)
  const submittedRef = useRef(false)

  // Share link từ Studio: #/exam?shared=<id> (HashRouter → useLocation().search)
  const sharedId = new URLSearchParams(loc.search).get('shared') || ''

  useEffect(() => {
    api.subjects().then((s) => {
      setSubjects(s)
      const cn = s.find((x) => x.id === 'cn-nong') || s.find((x) => x.id.startsWith('cn-')) || s[0]
      if (cn) setCfg((c) => ({ ...c, subject_id: c.subject_id || cn.id }))
    }).catch(() => {})
    api.students().then(setStudents).catch(() => {})
    api.listExams('shared').then(setSharedExams).catch(() => setSharedExams([]))
  }, [])

  // Focus tracking — handlers stable qua ref để removeEventListener khớp identity
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

  const detachFocus = useCallback(() => {
    const h = handlersRef.current
    if (!h) return
    document.removeEventListener('visibilitychange', h.vis)
    window.removeEventListener('blur', h.blur)
    window.removeEventListener('focus', h.focus)
    window.removeEventListener('pagehide', h.blur)
    handlersRef.current = null
  }, [])

  const attachFocus = useCallback(() => {
    detachFocus()
    focusRef.current = { inside: !document.hidden, exits: 0, log: [{ ev: 'start', at: stamp() }] }
    setExits(0)
    const h = {
      vis: () => { if (document.hidden) markLeave(); else markEnter() },
      blur: () => markLeave(),
      focus: () => markEnter(),
    }
    handlersRef.current = h
    document.addEventListener('visibilitychange', h.vis)
    window.addEventListener('blur', h.blur)
    window.addEventListener('focus', h.focus)
    window.addEventListener('pagehide', h.blur)
  }, [detachFocus]) // eslint-disable-line

  useEffect(() => () => { clearInterval(timer.current); detachFocus() }, [detachFocus])

  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    clearInterval(timer.current)
    detachFocus()
    const f = focusRef.current
    const details = qs.map((q) => {
      const a = answers[q.id]
      if (q.qtype === 'trac_nghiem') {
        const ok = String(a || '').trim().toUpperCase() === (q.correct_answer || '').trim().toUpperCase()
        return { question_id: q.id, user_answer: String(a || '').trim(), is_correct: ok }
      }
      if (q.qtype === 'diem_khuyet') {
        const ua = Array.isArray(a) ? a : []
        return { question_id: q.id, user_answer: ua, is_correct: null }
      }
      return { question_id: q.id, user_answer: String(a || '').trim(), is_correct: null }
    })
    const payload = { answers: details, student_name: studentName, student_id: getSession().student?.id || null, focus_exits: f.exits, focus_log: f.log }
    let prevBest = 0
    let hadPrev = false
    if (getSession().token) {
      try {
        const prev = await api.attempts({ mode: 'exam' })
        hadPrev = (prev || []).length > 0
        prevBest = (prev || []).reduce((m, a) => Math.max(m, a.accuracy || 0), 0)
      } catch {}
    }
    try {
      const r = await api.submitExam(exam.id, payload)
      setResult({ ...r, auto, record: hadPrev && (r.accuracy || 0) > prevBest })
    } catch {
      const c = details.filter((d) => d.is_correct).length
      const mc = details.filter((d) => d.is_correct != null).length
      setResult({ correct: c, total: mc, accuracy: mc ? c / mc : 0, auto, focus_exits: f.exits, note: 'Chưa lưu được về server.' })
    }
    setSubmitting(false)
    window.scrollTo(0, 0)
  }, [qs, answers, studentName, exam, detachFocus])

  const beginTimer = (minutes) => {
    attachFocus()
    submittedRef.current = false
    const total = (minutes || 45) * 60
    setLeft(total)
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) return 0
        return v - 1
      })
    }, 1000)
  }

  // Detect hết giờ Ở NGOÀI updater (side-effect thuần → không double-submit)
  useEffect(() => {
    if (exam && !result && left === 0 && qs.length > 0) {
      clearInterval(timer.current)
      submit(true)
    }
    // eslint-disable-next-line
  }, [left, exam, result])

  const startShared = async (ex) => {
    if (busy) return
    setBusy(true)
    if (!studentName.trim() && getSession().student?.name) {
      setStudentName(getSession().student.name)
    }
    const name = studentName.trim() || getSession().student?.name || ''
    localStorage.setItem('studentName', name)
    try {
      const full = await api.getExam(ex.id)
      if (!full.questions?.length) { toast('Đề trống hoặc lỗi tải.', 'err'); setBusy(false); return }
      setExam(full)
      setQs(full.questions)
      setAnswers({}); setResult(null)
      beginTimer(full.duration_min || ex.duration_min || 45)
      window.scrollTo(0, 0)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const start = async () => {
    if (busy) return
    if (!studentName.trim()) { toast('Nhập tên học sinh trước khi bắt đầu.', 'warn'); return }
    setBusy(true)
    try {
      const rows = await api.questions({ subject_id: cfg.subject_id, limit: cfg.limit })
      if (!rows.length) { toast('Chưa có câu hỏi cho môn này.', 'warn'); setBusy(false); return }
      localStorage.setItem('studentName', studentName.trim())
      const ex = await api.createExam({ title: cfg.title, mode: 'exam', duration_min: cfg.minutes, question_ids: rows.map((q) => q.id) }).catch(() => ({ id: Date.now(), title: cfg.title }))
      setExam(ex); setQs(rows); setAnswers({}); setResult(null)
      beginTimer(cfg.minutes)
      window.scrollTo(0, 0)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  // Auto-open shared exam khi có ?shared=
  const autoTried = useRef('')
  useEffect(() => {
    if (!sharedId || autoTried.current === sharedId || !sharedExams.length) return
    autoTried.current = sharedId
    const ex = sharedExams.find((x) => String(x.id) === String(sharedId))
    if (ex) startShared(ex)
    // eslint-disable-next-line
  }, [sharedId, sharedExams])

  return (
    <div className="grid">
      <div className="card">
        <h1>Thi thử bấm giờ</h1>
        {!exam ? (
          <>
            {sharedExams.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <h3>Đề giáo viên giao ({sharedExams.length})</h3>
                <div className="small muted" style={{ marginBottom: 6 }}>Chọn đề → bấm giờ · chấm tự động trắc nghiệm.</div>
                {sharedExams.map((ex) => (
                  <div key={ex.id} className="board-row">
                    <div>
                      <b>#{ex.id} {ex.title}</b>
                      <div className="small muted">{ex.n_questions} câu · {ex.duration_min} phút</div>
                    </div>
                    <button className="btn primary push" disabled={busy} onClick={() => startShared(ex)}>Làm đề này</button>
                  </div>
                ))}
                <hr className="sep" />
              </div>
            )}
            <h3>Tự luyện / thi ngẫu nhiên</h3>
            <div className="grid c3">
              <div>
                <label className="lbl" htmlFor="exam-name">Tên học sinh (chọn đúng tên trong đội để được xếp hạng)</label>
                <input className="input" id="exam-name" name="studentName" autoComplete="name" list="exam-students" placeholder="VD: Nguyễn Văn A…" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
                <datalist id="exam-students">{students.map((s) => <option key={s.id} value={s.name}>{s.team} • {s.class_name}</option>)}</datalist>
              </div>
              <div>
                <label className="lbl" htmlFor="exam-subject">Môn</label>
                <select className="select" id="exam-subject" value={cfg.subject_id} onChange={(e) => setCfg({ ...cfg, subject_id: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </div>
              <div>
                <label className="lbl" htmlFor="exam-minutes">Thời gian (phút)</label>
                <select className="select" id="exam-minutes" value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: Number(e.target.value) })}><option value={15}>15</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option><option value={120}>120</option></select>
              </div>
            </div>
            <div className="grid c2" style={{ marginTop: 8 }}>
              <div>
                <label className="lbl" htmlFor="exam-limit">Số câu</label>
                <select className="select" id="exam-limit" value={cfg.limit} onChange={(e) => setCfg({ ...cfg, limit: Number(e.target.value) })}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={40}>40</option></select>
              </div>
              <div>
                <label className="lbl" htmlFor="exam-title">Tiêu đề đề</label>
                <input className="input" id="exam-title" name="examTitle" autoComplete="off" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={start} disabled={busy}><IconPlay className="icn sm" />{busy ? 'Đang chuẩn bị…' : 'Bắt đầu làm bài'}</button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Trắc nghiệm chấm tự động. Tự luận tự đối chiếu đáp án sau khi nộp. Trong lúc làm bài, app ghi lại <b>số lần rời khỏi app</b> (chuyển tab/ứng dụng khác, tắt màn hình) để giáo viên đối chiếu.
            </div>
          </>
        ) : (
          <div className="row spread">
            <div><b>{exam.title || cfg.title}</b><div className="small muted">{qs.length} câu · {result ? 'Đã nộp' : 'Đang làm'}{studentName && ` · ${studentName}`}</div></div>
            {!result && <div className="timer" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><IconTimer className="icn sm" />{fmt(left)}</div>}
            {!result && <span className={`badge ${exits > 0 ? 'red' : 'green'}`}>Rời app: {exits} lần</span>}
            {!result && <button className="btn primary" onClick={() => submit(false)} disabled={submitting}>{submitting ? 'Đang nộp…' : 'Nộp bài'}</button>}
            {result && <button className="btn" onClick={() => { setExam(null); setResult(null); setQs([]); submittedRef.current = false }}>Làm đề khác</button>}
          </div>
        )}
        {result && result.record && <div className="record" style={{ marginTop: 10 }}><IconTrophy className="icn" />Kỷ lục mới! Vượt thành tích thi thử tốt nhất của bạn.</div>}
        {result && (
          <div className="msg info" style={{ marginTop: 12, fontSize: 14 }} role="status">
            <b>Kết quả trắc nghiệm: {result.correct}/{result.total ?? result.totalMC ?? qs.length} đúng ({Math.round((result.accuracy || 0) * 100)}%)</b>
            {result.auto && <span className="small"> · Tự nộp do hết giờ</span>}
            <div className="small" style={{ marginTop: 4 }}>
              Số lần rời app trong lúc làm bài: <b>{result.focus_exits ?? exits}</b>
              {(result.focus_exits ?? exits) > 0 && <span style={{ color: 'var(--warn-ink)' }}> — giáo viên sẽ thấy con số này trong lịch sử.</span>}
            </div>
            {result.note && <div className="small" style={{ marginTop: 4 }}>{result.note}</div>}
          </div>
        )}
      </div>

      {exam && qs.map((q, i) => (
        <div className="card" key={q.id}>
          <b>Câu {i + 1}{q.qtype === 'diem_khuyet' ? ' — Điền từ' : ''}</b>
          {q.qtype === 'diem_khuyet' ? (
            <div style={{ margin: '8px 0' }}>
              <ClozeText
                content={q.content}
                values={Array.isArray(answers[q.id]) ? answers[q.id] : []}
                disabled={!!result}
                onChange={(bi, val) => {
                  const cur = Array.isArray(answers[q.id]) ? [...answers[q.id]] : []
                  cur[bi] = val
                  setAnswers({ ...answers, [q.id]: cur })
                }}
              />
              {result && (
                <div className="answer-box" style={{ marginTop: 8 }}>
                  <b>Đáp án:</b> <span>{(q.correct_answer || '').split('|').join(' / ')}</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{q.content}</div>
              {q.image_url && <div style={{ margin: '0 0 10px' }}><img src={q.image_url} alt="minh họa" loading="lazy" /></div>}
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
                  {result && (
                    <div className="answer-box" style={{ marginTop: 8 }}>
                      <b>Đáp án tham khảo:</b> <span>{q.correct_answer}</span>
                      {q.explanation && <><br /><b>Lời giải:</b> <span>{q.explanation}</span></>}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
