import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, PenLine, Clock, Users } from 'lucide-react'
import { api, getSession } from '../api.js'

export default function Grading() {
  const { id } = useParams()
  if (id) return <GradeOne />
  return <GradePick />
}

function GradePick() {
  const teacher = (getSession().student?.role || 'student') === 'teacher'
  const [list, setList] = useState([])
  const nav = useNavigate()
  useEffect(() => {
    if (!teacher) { nav('/results'); return }
    api.assignments().then(setList).catch(() => setList([]))
  }, [])
  if (!teacher) return null
  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Chấm bài</h1>
        <div className="small muted">Chọn bài tập để xem danh sách nộp và cho điểm.</div>
      </div>
      {list.length === 0 && <div className="empty">Chưa có bài tập nào.</div>}
      {list.map((a) => (
        <div key={a.id} className="card" style={{ cursor: 'pointer' }} onClick={() => nav(`/grading/${a.id}`)}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b>{a.title}</b>
              <div className="small muted">{a.class_name}{a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
            </div>
            <PenLine className="icn" style={{ color: 'var(--leaf)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function GradeOne() {
  const { id } = useParams()
  const teacher = (getSession().student?.role || 'student') === 'teacher'
  const [data, setData] = useState(null)
  const [msg, setMsg] = useState('')
  const [openId, setOpenId] = useState(null)
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const nav = useNavigate()

  const load = async () => {
    try { setData(await api.assignmentSubmissions(id)) } catch (e) { setMsg(String(e.message || e)) }
  }
  useEffect(() => {
    if (!teacher) { nav('/results'); return }
    load()
  }, [id])

  if (!teacher) return null
  if (!data) return <div className="grid"><div className="empty">{msg || 'Đang tải…'}</div></div>

  const openGrade = (s) => {
    setOpenId(s.submission_id)
    setScore(s.score != null ? String(s.score) : '')
    setFeedback(s.feedback || '')
  }

  const save = async () => {
    try {
      await api.gradeSubmission(openId, { score: Number(score), feedback })
      setOpenId(null)
      await load()
    } catch (e) { setMsg(String(e.message || e)) }
  }

  const qs = data.questions || []

  return (
    <div className="grid">
      <div className="card">
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav('/grading')}><ArrowLeft className="icn sm" />Danh sách bài</button>
        <h1 style={{ margin: 0 }}>{data.assignment.title}</h1>
        <div className="small muted">{data.assignment.class_name}{data.assignment.deadline ? ` • hạn ${new Date(data.assignment.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
      </div>

      {(data.submissions || []).map((s) => (
        <div key={s.student_id} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`rank${s.status === 'graded' ? ' r1' : ''}`}><Users className="icn sm" /></span>
              <div>
                <b>{s.name}</b>
                <div className="small muted">{s.class_name}</div>
              </div>
            </div>
            <div className="row">
              {s.status === 'todo' && <span className="badge red">Chưa nộp</span>}
              {s.status === 'submitted' && <span className="badge amber"><Clock className="icn sm" />Chờ chấm</span>}
              {s.status === 'graded' && <span className="badge green"><Check className="icn sm" />{s.score} / 10</span>}
              {s.submission_id && <button className="btn primary" onClick={() => openGrade(s)}><PenLine className="icn sm" />{s.status === 'graded' ? 'Sửa điểm' : 'Chấm'}</button>}
            </div>
          </div>

          {s.submission_id && openId !== s.submission_id && (
            <div style={{ marginTop: 10 }}>
              {qs.map((q) => (
                <div key={q.idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="small muted">Câu {q.idx}: {q.content.slice(0, 80)}{q.content.length > 80 ? '…' : ''}</div>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{(s.answers && s.answers[q.idx]) || '(trống)'}</div>
                </div>
              ))}
              {s.feedback && <div className="small" style={{ marginTop: 6 }}><b>Nhận xét:</b> {s.feedback}</div>}
            </div>
          )}

          {openId === s.submission_id && (
            <div style={{ marginTop: 12, background: 'var(--leaf-soft)', borderRadius: 12, padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>{s.name}</h3>
              {qs.map((q) => (
                <div key={q.idx} style={{ padding: '8px 0' }}>
                  <div className="small muted">Câu {q.idx}: {q.content}</div>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4, background: '#fff', borderRadius: 8, padding: 8, border: '1px solid var(--line)' }}>{(s.answers && s.answers[q.idx]) || '(trống)'}</div>
                  <div className="small muted">Đáp án mẫu: {q.answer || '—'}</div>
                </div>
              ))}
              <div className="grid c2" style={{ marginTop: 8 }}>
                <div>
                  <label className="lbl">Điểm (0–10) *</label>
                  <input className="input" type="number" min="0" max="10" step="0.5" value={score} onChange={(e) => setScore(e.target.value)} />
                </div>
                <div>
                  <label className="lbl">Nhận xét</label>
                  <input className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="VD: Cần chú ý điều kiện ban đầu." />
                </div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={save}>Lưu điểm</button>
                <button className="btn" onClick={() => setOpenId(null)}>Đóng</button>
              </div>
              {msg && <div className="small" style={{ color: '#b91c1c', marginTop: 6 }}>{msg}</div>}
            </div>
          )}
        </div>
      ))}
      {(data.submissions || []).length === 0 && <div className="empty">Chưa có học sinh trong lớp.</div>}
    </div>
  )
}
