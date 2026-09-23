import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClipboardList, Plus, PenLine, CheckCircle2, Clock, Award, ArrowLeft } from 'lucide-react'
import { api, getSession } from '../api.js'

function statusBadge(st) {
  if (st === 'graded') return <span className="badge green"><Award className="icn sm" />Đã chấm</span>
  if (st === 'submitted') return <span className="badge amber"><Clock className="icn sm" />Đã nộp — chờ chấm</span>
  return <span className="badge">Chưa nộp</span>
}

export default function Assignments() {
  const { id } = useParams()
  if (id) return <AssignmentDetail />
  return <AssignmentList />
}

function AssignmentList() {
  const teacher = (getSession().student?.role || 'student') === 'teacher'
  const [list, setList] = useState([])
  const [classes, setClasses] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [form, setForm] = useState({ class_id: '', subject_id: '', topic_id: '', title: '', description: '', deadline: '', questions: ['', '', ''] })
  const [msg, setMsg] = useState('')
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
    setMsg('')
    if (!form.title.trim()) return setMsg('Nhập tên bài tập.')
    if (!form.class_id) return setMsg('Chọn lớp.')
    const qs = form.questions.map((c) => c.trim()).filter(Boolean)
    if (!qs.length) return setMsg('Nhập ít nhất 1 câu hỏi.')
    try {
      const r = await api.createAssignment({
        class_id: Number(form.class_id), topic_id: form.topic_id || null,
        title: form.title.trim(), description: form.description.trim(),
        deadline: form.deadline || null, questions: qs.map((content) => ({ content })),
      })
      setShowCreate(false)
      setForm({ class_id: form.class_id, topic_id: '', title: '', description: '', deadline: '', questions: ['', '', ''] })
      nav(`/assignments/${r.id}`)
    } catch (e) { setMsg(String(e.message || e)) }
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0 }}>Bài tập</h1>
          {teacher && <button className="btn primary" onClick={() => setShowCreate((v) => !v)}><Plus className="icn sm" />Tạo bài tập</button>}
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>{teacher ? 'Giao bài cho lớp, theo dõi nộp và chấm điểm.' : 'Bài được giáo viên giao — bấm vào để làm và nộp.'}</div>
      </div>

      {teacher && showCreate && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bài tập mới</h3>
          <label className="lbl">Tên bài tập *</label>
          <input className="input" placeholder="VD: Bài tập Dao động 01" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid c3" style={{ marginTop: 8 }}>
            <div>
              <label className="lbl">Lớp *</label>
              <select className="select" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
                <option value="">— Chọn —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Môn (lọc chuyên đề)</label>
              <select className="select" value={form.subject_id} onChange={(e) => pickTopics(e.target.value)}>
                <option value="">— Chọn —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Hạn nộp</label>
              <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <label className="lbl">Chuyên đề (tùy chọn)</label>
          <select className="select" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
            <option value="">— Chuyên đề chung —</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label className="lbl">Mô tả</label>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Hướng dẫn làm bài (tùy chọn)" />
          <label className="lbl">Câu hỏi * (1 câu 1 dòng)</label>
          {form.questions.map((q, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <span className="badge">Câu {i + 1}</span>
              <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => { const qs = [...form.questions]; qs[i] = e.target.value; setForm({ ...form, questions: qs }) }} />
            </div>
          ))}
          <button className="btn" onClick={() => setForm({ ...form, questions: [...form.questions, ''] })}>+ Thêm câu</button>
          {msg && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{msg}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={create}>Tạo bài tập</button>
            <button className="btn" onClick={() => setShowCreate(false)}>Hủy</button>
          </div>
        </div>
      )}

      {list.length === 0 && <div className="empty">{teacher ? 'Chưa có bài tập — bấm "Tạo bài tập".' : 'Chưa có bài tập nào được giao.'}</div>}
      {list.map((a) => (
        <div key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => nav(`/assignments/${a.id}`)}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b style={{ fontSize: 16 }}>{a.title}</b>
              <div className="small muted">{a.class_name}{a.topic_name ? ` • ${a.topic_name}` : ''}{a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
            </div>
            <div className="row">
              {!teacher && statusBadge(a.status)}
              {teacher && <span className="badge"><PenLine className="icn sm" />Chấm / xem</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AssignmentDetail() {
  const { id } = useParams()
  const teacher = (getSession().student?.role || 'student') === 'teacher'
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
    } catch (e) { setMsg(String(e.message || e)) }
  }
  useEffect(() => { load() }, [id])

  const submit = async () => {
    setSaving(true); setMsg('')
    try {
      const list = (a.questions || []).map((q) => ({ idx: q.idx, text: answers[q.idx] || '' }))
      await api.submitAssignment(a.id, list)
      await load()
    } catch (e) { setMsg(String(e.message || e)) }
    setSaving(false)
  }

  if (!a) return <div className="grid"><div className="empty">{msg || 'Đang tải…'}</div></div>
  const sub = a.my_submission
  const graded = sub && sub.score != null
  const canEdit = !teacher && (!sub || !graded)

  return (
    <div className="grid">
      <div className="card">
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav('/assignments')}><ArrowLeft className="icn sm" />Danh sách</button>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0 }}>{a.title}</h1>
            <div className="small muted">{a.class_name}{a.topic_name ? ` • ${a.topic_name}` : ''}{a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
          </div>
          {!teacher && sub && (graded
            ? <span className="badge green"><Award className="icn sm" />Điểm: {sub.score} / 10</span>
            : statusBadge('submitted'))}
        </div>
        {a.description && <div className="small" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{a.description}</div>}
        {graded && sub.feedback && (
          <div className="record" style={{ marginTop: 12, background: 'var(--leaf-deep)' }}><CheckCircle2 className="icn" />Nhận xét: {sub.feedback}</div>
        )}
        {teacher && (
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn primary" to={`/grading/${a.id}`}><PenLine className="icn sm" />Chấm bài tập này</Link>
          </div>
        )}
      </div>

      {(a.questions || []).map((q) => (
        <div className="card" key={q.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Câu {q.idx}</b>
            {teacher && q.answer && <span className="small muted">Đáp án mẫu có sẵn</span>}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{q.content}</div>
          {teacher ? (
            q.answer && <div className="small muted">Đáp án: {q.answer}</div>
          ) : canEdit ? (
            <textarea className="textarea" value={answers[q.idx] || ''} onChange={(e) => setAnswers({ ...answers, [q.idx]: e.target.value })} placeholder="Nhập câu trả lời…" />
          ) : (
            <div style={{ background: 'var(--line-soft)', borderRadius: 10, padding: 10, whiteSpace: 'pre-wrap' }} className="small">
              {(() => { try { const m = JSON.parse(sub.answer || '{}'); return m[q.idx] || '(trống)' } catch { return '(trống)' } })()}
            </div>
          )}
        </div>
      ))}

      {!teacher && canEdit && (
        <div className="card">
          <div className="row">
            <button className="btn primary" onClick={submit} disabled={saving}><CheckCircle2 className="icn sm" />{saving ? 'Đang nộp…' : sub ? 'Nộp lại' : 'Nộp bài'}</button>
            {sub && <span className="small muted">Nộp lại được cho tới khi được chấm.</span>}
          </div>
          {msg && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{msg}</div>}
        </div>
      )}
      {!teacher && graded && (
        <div className="card">
          <div className="empty">Đã nộp — đã chấm. Xem chi tiết nhận xét ở trên.</div>
        </div>
      )}
      {!teacher && sub && !graded && (
        <div className="card">
          <div className="badge amber" style={{ fontSize: 14, padding: '6px 14px' }}><Clock className="icn sm" />Đã nộp — đang chờ chấm</div>
        </div>
      )}
      {!teacher && !sub && <ClipboardList className="hidden" />}
    </div>
  )
}
