import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconArrowLeft, IconCheck, IconPen, IconClock, IconUsers, IconAward, IconHistory, IconFile } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { isStaffRole } from '../lib/roles.js'

export default function Grading() {
  const { id } = useParams()
  if (id) return <GradeOne />
  return <GradePick />
}

function GradePick() {
  const rawRole = getSession().student?.role || 'student'
  const teacher = isStaffRole(rawRole)
  const [list, setList] = useState([])
  const nav = useNavigate()
  useEffect(() => {
    if (!teacher) { nav('/info'); return }
    api.assignments().then(setList).catch(() => setList([]))
  }, [])
  if (!teacher) return null
  return (
    <div className="grid">
      <div className="card">
        <h1>Chấm bài</h1>
        <div className="small muted">Chọn bài tập để xem danh sách nộp và cho điểm từng câu.</div>
      </div>
      {list.length === 0 && <div className="empty">Chưa có bài tập nào.</div>}
      {list.map((a) => (
        <div key={a.id} className="card" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => nav(`/grading/${a.id}`)}
          onKeyDown={(e) => { if (e.key === 'Enter') nav(`/grading/${a.id}`) }}>
          <div className="row spread">
            <div>
              <b>{a.title}</b>
              <div className="small muted">{a.class_name}{a.deadline ? ` · hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
            </div>
            <IconPen className="icn" style={{ color: 'var(--leaf)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function GradeOne() {
  const { toast, errMsg } = useUI()
  const { id } = useParams()
  const rawRole = getSession().student?.role || 'student'
  const teacher = isStaffRole(rawRole)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState(null)
  const [qsForm, setQsForm] = useState({})
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(null)
  const nav = useNavigate()

  const load = async () => {
    try { setData(await api.assignmentSubmissions(id)); setErr('') } catch (e) { setErr(errMsg(e)) }
  }
  useEffect(() => {
    if (!teacher) { nav('/info'); return }
    load()
  }, [id])

  if (!teacher) return null
  if (!data) return <div className="grid"><div className="empty">{err || 'Đang tải…'}</div></div>

  const qs = data.questions || []
  const maxTotal = qs.reduce((s, q) => s + (Number(q.points) || 0), 0)

  const openGrade = (s) => {
    setOpenId(s.submission_id)
    const init = {}
    if (s.question_scores) {
      try {
        const parsed = typeof s.question_scores === 'string' ? JSON.parse(s.question_scores || '{}') : s.question_scores
        if (parsed && typeof parsed === 'object') Object.assign(init, parsed)
      } catch {}
    }
    qs.forEach((q) => { if (init[q.idx] == null) init[q.idx] = '' })
    setQsForm(init)
    setScore(s.score != null ? String(s.score) : '')
    setFeedback(s.feedback || '')
    if (s.submission_id && api.gradeHistory) {
      api.gradeHistory(s.submission_id).then(setHistory).catch(() => setHistory([]))
    } else setHistory([])
  }

  const openHist = async (sid) => {
    if (showHistory === sid) { setShowHistory(null); return }
    setShowHistory(sid)
    try { setHistory(await api.gradeHistory(sid)) } catch { setHistory([]) }
  }

  const sumPts = qs.reduce((s, q) => s + (Number(qsForm[q.idx]) || 0), 0)

  const autoScore = () => {
    if (!maxTotal) return
    setScore(String(Math.round((sumPts / maxTotal) * 10 * 10) / 10))
  }

  const save = async () => {
    if (saving) return
    const n = Number(score)
    if (score === '' || Number.isNaN(n)) { toast('Nhập điểm tổng (0–10).', 'warn'); return }
    if (n < 0 || n > 10) { toast('Điểm phải trong khoảng 0–10.', 'warn'); return }
    setSaving(true)
    try {
      const question_scores = {}
      qs.forEach((q) => { if (qsForm[q.idx] !== '' && qsForm[q.idx] != null) question_scores[q.idx] = Number(qsForm[q.idx]) })
      await api.gradeSubmission(openId, { score: n, feedback, question_scores })
      setOpenId(null)
      toast('Đã lưu điểm.')
      await load()
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  return (
    <div className="grid">
      <div className="card">
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav('/grading')}><IconArrowLeft className="icn sm" />Danh sách bài</button>
        <h1 style={{ margin: 0 }}>{data.assignment.title}</h1>
        <div className="small muted">{data.assignment.class_name}{data.assignment.deadline ? ` · hạn ${new Date(data.assignment.deadline).toLocaleDateString('vi-VN')}` : ''}{maxTotal ? ` · thang ${maxTotal} điểm nội bộ, quy về 10` : ''}</div>
      </div>

      {(data.submissions || []).map((s) => (
        <div key={s.student_id} className="card">
          <div className="row spread">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`rank${s.status === 'graded' ? ' r1' : ''}`}><IconUsers className="icn sm" /></span>
              <div>
                <b>{s.name}</b>
                <div className="small muted">{s.class_name}</div>
              </div>
            </div>
            <div className="row">
              {s.status === 'todo' && <span className="badge red">Chưa nộp</span>}
              {s.status === 'draft' && <span className="badge">Nháp (chưa nộp)</span>}
              {s.status === 'submitted' && <span className="badge amber"><IconClock className="icn sm" />Chờ chấm</span>}
              {s.status === 'graded' && <span className="badge green"><IconCheck className="icn sm" />{s.score} / 10</span>}
              {s.submission_id && s.status === 'graded' && (
                <button className="btn sm" onClick={() => openHist(s.submission_id)} title="Lịch sử sửa điểm"><IconHistory className="icn sm" /></button>
              )}
              {s.submission_id && s.status !== 'todo' && s.status !== 'draft' && (
                <button className="btn primary" onClick={() => openGrade(s)}><IconPen className="icn sm" />{s.status === 'graded' ? 'Sửa điểm' : 'Chấm'}</button>
              )}
            </div>
          </div>

          {showHistory === s.submission_id && history.length > 0 && (
            <div className="panel" style={{ marginTop: 8 }}>
              <b className="small"><IconHistory className="icn sm" /> Lịch sử chấm ({history.length})</b>
              {history.map((h) => (
                <div key={h.id} className="board-row" style={{ display: 'block', padding: '6px 4px' }}>
                  <div className="row spread">
                    <span className="small"><b>{h.score != null ? h.score : '—'}</b> / 10{h.grader_name ? ` · ${h.grader_name}` : ''}</span>
                    <span className="small muted">{h.graded_at ? new Date(h.graded_at).toLocaleString('vi-VN') : ''}</span>
                  </div>
                  {h.feedback && <div className="small muted">{h.feedback}</div>}
                </div>
              ))}
            </div>
          )}
          {showHistory === s.submission_id && history.length === 0 && (
            <div className="small muted" style={{ marginTop: 6 }}>Chưa có lần chấm trước.</div>
          )}

          {s.submission_id && openId !== s.submission_id && (s.status === 'submitted' || s.status === 'graded') && (
            <div style={{ marginTop: 10 }}>
              {qs.map((q) => (
                <div key={q.idx} className="board-row" style={{ display: 'block', padding: '8px 4px' }}>
                  <div className="small muted">Câu {q.idx}{q.points ? ` (${q.points} điểm)` : ''}: {q.content.slice(0, 80)}{q.content.length > 80 ? '…' : ''}</div>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{(s.answers && s.answers[q.idx]) || '(trống)'}</div>
                </div>
              ))}
              {Array.isArray(s.files) && s.files.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div className="small muted"><IconFile className="icn sm" /> File bài làm:</div>
                  {s.files.map((u, i) => <a key={i} className="btn sm" href={u} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>Mở file {i + 1}</a>)}
                </div>
              )}
              {s.feedback && <div className="small" style={{ marginTop: 6 }}><b>Nhận xét:</b> {s.feedback}</div>}
            </div>
          )}

          {openId === s.submission_id && (
            <div className="panel" style={{ marginTop: 12 }}>
              <h3>{s.name}</h3>
              {qs.map((q) => (
                <div key={q.idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="small muted">Câu {q.idx}{q.points ? ` — tối đa ${q.points} điểm` : ''}: {q.content}</div>
                  <div className="answer-box" style={{ marginTop: 4 }}>
                    {(s.answers && s.answers[q.idx]) || '(trống)'}
                  </div>
                  {q.answer && <div className="small muted" style={{ marginTop: 4 }}>Đáp án mẫu: {q.answer}</div>}
                  <div className="row" style={{ marginTop: 6 }}>
                    <label className="small" htmlFor={`gq-${q.idx}`}>Điểm câu này:</label>
                    <input className="input" id={`gq-${q.idx}`} style={{ width: 90 }} type="number" min="0" max={q.points || 10} step="0.5"
                      value={qsForm[q.idx] ?? ''} onChange={(e) => setQsForm({ ...qsForm, [q.idx]: e.target.value })} />
                    <span className="small muted">/ {q.points ?? '—'}</span>
                  </div>
                </div>
              ))}
              {history.length > 0 && (
                <div className="small muted" style={{ marginTop: 8 }}>
                  <IconHistory className="icn sm" /> Đã chấm {history.length} lần — gần nhất: {history[0]?.score ?? '—'}/10
                  {history[0]?.graded_at ? ` (${new Date(history[0].graded_at).toLocaleString('vi-VN')})` : ''}
                </div>
              )}
              <div className="row spread" style={{ marginTop: 10 }}>
                <b>Tổng điểm câu: {sumPts}{maxTotal ? ` / ${maxTotal}` : ''}</b>
                <button className="btn" onClick={autoScore}><IconAward className="icn sm" />Quy về thang 10</button>
              </div>
              <div className="grid c2" style={{ marginTop: 8 }}>
                <div>
                  <label className="lbl" htmlFor="g-total">Điểm tổng (0–10) *</label>
                  <input className="input" id="g-total" type="number" min="0" max="10" step="0.1" value={score} onChange={(e) => setScore(e.target.value)} />
                </div>
                <div>
                  <label className="lbl" htmlFor="g-fb">Nhận xét chung</label>
                  <input className="input" id="g-fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="VD: Cần chú ý điều kiện ban đầu." />
                </div>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu kết quả'}</button>
                <button className="btn" onClick={() => setOpenId(null)}>Đóng</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {(data.submissions || []).length === 0 && <div className="empty">Chưa có học sinh trong lớp.</div>}
      {err && <div className="msg err" role="alert">{err}</div>}
    </div>
  )
}
