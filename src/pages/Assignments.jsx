import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconTask, IconPlus, IconPen, IconCheckCircle, IconClock, IconAward, IconArrowLeft } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'

function statusBadge(st) {
  if (st === 'graded') return <span className="badge green"><IconAward className="icn sm" />Đã chấm</span>
  if (st === 'submitted') return <span className="badge amber"><IconClock className="icn sm" />Đã nộp — chờ chấm</span>
  if (st === 'draft') return <span className="badge">Bản nháp</span>
  return <span className="badge">Chưa nộp</span>
}

export default function Assignments() {
  const { id } = useParams()
  if (id) return <AssignmentDetail />
  return <AssignmentList />
}

function AssignmentList() {
  const { toast, errMsg } = useUI()
  const rawRole = getSession().student?.role || 'student'
  const teacher = rawRole === 'teacher' || rawRole === 'admin'
  const [list, setList] = useState([])
  const [classes, setClasses] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [form, setForm] = useState({ class_id: '', subject_id: '', topic_id: '', title: '', description: '', deadline: '', questions: [{ content: '', points: 2 }, { content: '', points: 3 }, { content: '', points: 5 }] })
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  const load = () => {
    api.assignments().then(setList).catch(() => setList([]))
    if (teacher) {
      api.classes().then(setClasses).catch(() => {})
      api.subjects().then(setSubjects).catch(() => {})
    }
  }
  useEffect(load, [])

  const pickTopics = async (subjectId) => {
    setForm((f) => ({ ...f, subject_id: subjectId, topic_id: '' }))
    if (subjectId) api.topics(subjectId).then(setTopics).catch(() => setTopics([]))
    else setTopics([])
  }

  const create = async () => {
    if (busy) return
    if (!form.title.trim()) return toast('Nhập tên bài tập.', 'warn')
    if (!form.class_id) return toast('Chọn lớp.', 'warn')
    const qs = form.questions.filter((q) => q.content.trim())
    if (!qs.length) return toast('Nhập ít nhất 1 câu hỏi.', 'warn')
    setBusy(true)
    try {
      const r = await api.createAssignment({
        class_id: Number(form.class_id), topic_id: form.topic_id || null,
        title: form.title.trim(), description: form.description.trim(),
        deadline: form.deadline || null,
        questions: qs.map((q) => ({ content: q.content.trim(), points: Number(q.points) || 1 })),
      })
      setShowCreate(false)
      setForm({ class_id: form.class_id, subject_id: form.subject_id, topic_id: '', title: '', description: '', deadline: '', questions: [{ content: '', points: 2 }, { content: '', points: 3 }, { content: '', points: 5 }] })
      nav(`/assignments/${r.id}`)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }
  const totalPts = form.questions.reduce((s, q) => s + (Number(q.points) || 0), 0)

  return (
    <div className="grid">
      <div className="card">
        <div className="row spread">
          <h1 style={{ margin: 0 }}>Bài tập</h1>
          {teacher && <button className="btn primary" onClick={() => setShowCreate((v) => !v)}><IconPlus className="icn sm" />Tạo bài tập</button>}
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>{teacher ? 'Giao bài cho lớp, theo dõi nộp và chấm điểm.' : 'Bài được giáo viên giao — bấm vào để làm và nộp.'}</div>
      </div>

      {teacher && showCreate && (
        <div className="card">
          <h3>Bài tập mới</h3>
          <label className="lbl" htmlFor="as-title">Tên bài tập *</label>
          <input className="input" id="as-title" placeholder="VD: Bài tập Dao động 01" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid c3" style={{ marginTop: 8 }}>
            <div>
              <label className="lbl" htmlFor="as-class">Lớp *</label>
              <select className="select" id="as-class" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="as-subject">Môn (lọc chuyên đề)</label>
              <select className="select" id="as-subject" value={form.subject_id} onChange={(e) => pickTopics(e.target.value)}>
                <option value="">— Chọn —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="as-deadline">Hạn nộp</label>
              <input className="input" id="as-deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <label className="lbl" htmlFor="as-topic">Chuyên đề (tùy chọn)</label>
          <select className="select" id="as-topic" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
            <option value="">— Chuyên đề chung —</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="lbl" htmlFor="as-desc">Mô tả</label>
          <textarea className="textarea" id="as-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Hướng dẫn làm bài (tùy chọn)" />
          <label className="lbl">Câu hỏi * (nội dung + điểm)</label>
          {form.questions.map((q, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <span className="badge">Câu {i + 1}</span>
              <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Nội dung câu hỏi…" value={q.content} aria-label={`Nội dung câu ${i + 1}`}
                onChange={(e) => { const qs = [...form.questions]; qs[i] = { ...q, content: e.target.value }; setForm({ ...form, questions: qs }) }} />
              <input className="input" style={{ width: 78 }} type="number" min="0.5" step="0.5" title="Điểm câu này" value={q.points} aria-label={`Điểm câu ${i + 1}`}
                onChange={(e) => { const qs = [...form.questions]; qs[i] = { ...q, points: e.target.value }; setForm({ ...form, questions: qs }) }} />
            </div>
          ))}
          <div className="row">
            <button className="btn" onClick={() => setForm({ ...form, questions: [...form.questions, { content: '', points: 1 }] })}><IconPlus className="icn sm" />Thêm câu</button>
            <span className="small muted">Tổng điểm đề: {totalPts || '—'}</span>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={create} disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo bài tập'}</button>
            <button className="btn" onClick={() => setShowCreate(false)}>Hủy</button>
          </div>
        </div>
      )}

      {list.length === 0 && <div className="empty">{teacher ? 'Chưa có bài tập — bấm "Tạo bài tập".' : 'Chưa có bài tập nào được giao.'}</div>}
      {list.map((a) => (
        <div key={a.id} className="card" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => nav(`/assignments/${a.id}`)}
          onKeyDown={(e) => { if (e.key === 'Enter') nav(`/assignments/${a.id}`) }}>
          <div className="row spread">
            <div>
              <b style={{ fontSize: 16 }}>{a.title}</b>
              <div className="small muted">{a.class_name}{a.topic_name ? ` · ${a.topic_name}` : ''}{a.deadline ? ` · hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
            </div>
            <div className="row">
              {!teacher && statusBadge(a.status)}
              {teacher && <span className="badge blue"><IconPen className="icn sm" />Chấm / xem</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AssignmentDetail() {
  const { toast, errMsg } = useUI()
  const { id } = useParams()
  const rawRole = getSession().student?.role || 'student'
  const teacher = rawRole === 'teacher' || rawRole === 'admin'
  const [a, setA] = useState(null)
  const [answers, setAnswers] = useState({})
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const nav = useNavigate()

  const load = async () => {
    try {
      const r = await api.getAssignment(id)
      setA(r)
      if (r.my_submission?.answer) {
        try { setAnswers(JSON.parse(r.my_submission.answer) || {}) } catch {}
      }
    } catch (e) { setMsg(errMsg(e)) }
  }
  useEffect(() => { load() }, [id])

  const submit = async () => {
    if (saving) return
    setSaving(true); setMsg('')
    try {
      const list = (a.questions || []).map((q) => ({ idx: q.idx, text: answers[q.idx] || '' }))
      await api.submitAssignment(a.id, list)
      toast('Đã nộp bài.')
      await load()
    } catch (e) { setMsg(errMsg(e)) }
    setSaving(false)
  }

  const saveDraft = async () => {
    if (saving) return
    setSaving(true); setMsg('')
    try {
      const list = (a.questions || []).map((q) => ({ idx: q.idx, text: answers[q.idx] || '' }))
      await api.draftAssignment(a.id, list)
      toast('Đã lưu nháp.')
      await load()
    } catch (e) { setMsg(errMsg(e)) }
    setSaving(false)
  }

  if (!a) return <div className="grid"><div className="empty">{msg || 'Đang tải…'}</div></div>
  const sub = a.my_submission
  const graded = sub && sub.score != null
  const canEdit = !teacher && (!sub || !graded)
  const totalPts = (a.questions || []).reduce((s, q) => s + (Number(q.points) || 0), 0)
  let qscores = null
  try { qscores = sub?.question_scores ? (typeof sub.question_scores === 'string' ? JSON.parse(sub.question_scores) : sub.question_scores) : null } catch {}

  return (
    <div className="grid">
      <div className="card">
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav('/assignments')}><IconArrowLeft className="icn sm" />Danh sách</button>
        <div className="row spread">
          <div>
            <h1 style={{ margin: 0 }}>{a.title}</h1>
            <div className="small muted">
              {a.class_name}{a.topic_name ? ` · ${a.topic_name}` : ''}{a.deadline ? ` · hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}
              {totalPts ? ` · thang ${totalPts} điểm` : ''}
            </div>
          </div>
          {!teacher && sub && (graded
            ? <span className="badge green"><IconAward className="icn sm" />Điểm: {sub.score} / 10</span>
            : statusBadge(sub?.submitted_at ? 'submitted' : 'draft'))}
          {!teacher && !sub && statusBadge('todo')}
        </div>
        {a.description && <div className="small" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{a.description}</div>}
        {graded && sub.feedback && (
          <div className="panel" style={{ marginTop: 12 }}><IconCheckCircle className="icn" style={{ color: 'var(--leaf)' }} /> <b>Nhận xét:</b> {sub.feedback}</div>
        )}
        {teacher && (
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn primary" to={`/grading/${a.id}`}><IconPen className="icn sm" />Chấm bài tập này</Link>
          </div>
        )}
        {msg && <div className="msg err" role="alert">{msg}</div>}
      </div>

      {(a.questions || []).map((q) => (
        <div className="card" key={q.id}>
          <div className="row spread">
            <b>Câu {q.idx}{q.points ? ` — ${q.points} điểm` : ''}</b>
            {qscores && qscores[q.idx] != null && (
              <span className="badge green">Được {qscores[q.idx]} / {q.points}</span>
            )}
            {teacher && q.answer && <span className="small muted">Đáp án mẫu có sẵn</span>}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{q.content}</div>
          {teacher ? (
            q.answer && <div className="small muted">Đáp án: {q.answer}</div>
          ) : canEdit ? (
            <textarea className="textarea" value={answers[q.idx] || ''} onChange={(e) => setAnswers({ ...answers, [q.idx]: e.target.value })} placeholder="Nhập câu trả lời…" aria-label={`Câu trả lời câu ${q.idx}`} />
          ) : (
            <div className="answer-box small">
              {(() => { try { const m = JSON.parse(sub.answer || '{}'); return m[q.idx] || '(trống)' } catch { return '(trống)' } })()}
            </div>
          )}
        </div>
      ))}

      {!teacher && canEdit && (
        <div className="card">
          <div className="row">
            <button className="btn" onClick={saveDraft} disabled={saving}>Lưu nháp</button>
            <button className="btn primary" onClick={submit} disabled={saving}><IconCheckCircle className="icn sm" />{saving ? 'Đang nộp…' : sub && sub.submitted_at ? 'Nộp lại' : 'Nộp bài'}</button>
            <span className="small muted">Lưu nháp giữ bài làm dở — không mất khi thoát trang.</span>
          </div>
        </div>
      )}
      {!teacher && graded && (
        <div className="card">
          <div className="empty">Đã nộp — đã chấm. Xem chi tiết nhận xét ở trên.</div>
        </div>
      )}
      {!teacher && sub && sub.submitted_at && !graded && (
        <div className="msg warn" role="status"><IconClock className="icn sm" /> Đã nộp — đang chờ chấm.</div>
      )}
      {!teacher && sub && !sub.submitted_at && !graded && (
        <div className="msg info" role="status">Bản nháp — bấm “Nộp bài” khi hoàn thành.</div>
      )}
    </div>
  )
}
