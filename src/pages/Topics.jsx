import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookOpen, ClipboardList, Paperclip, ArrowLeft, CheckCircle2, Circle } from 'lucide-react'
import { api, getSession } from '../api.js'

const TABS = [
  { id: 'lesson', label: 'Bài học', icon: BookOpen },
  { id: 'assign', label: 'Bài tập', icon: ClipboardList },
  { id: 'docs', label: 'Tài liệu', icon: Paperclip },
]

export default function Topics() {
  const { subjectId } = useParams()
  const [subjects, setSubjects] = useState([])
  const [detail, setDetail] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [tab, setTab] = useState('lesson')
  const nav = useNavigate()
  const teacher = (getSession().student?.role || 'student') === 'teacher'

  useEffect(() => { api.subjects().then(setSubjects).catch(() => {}) }, [])

  useEffect(() => {
    if (!subjectId) { setDetail(null); return }
    setTab('lesson')
    api.topics(subjectId).then((ts) => {
      const subj = subjects.find((s) => s.id === subjectId) || { id: subjectId, name: subjectId }
      setDetail({ subject: subj, topics: ts })
    }).catch(() => setDetail({ subject: { id: subjectId }, topics: [] }))
    api.assignments().then(setAssignments).catch(() => setAssignments([]))
  }, [subjectId, subjects])

  if (subjectId) {
    const d = detail
    return (
      <div className="grid">
        <div className="card">
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav('/topics')}><ArrowLeft className="icn sm" />Tất cả môn</button>
          <h1 style={{ margin: '0 0 4px' }}>{(d?.subject?.name || subjectId).toUpperCase()}</h1>
          <div className="subnav" style={{ marginTop: 10 }}>
            {TABS.map((t) => {
              const Icon = t.icon
              return <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><Icon className="icn sm" />{t.label}</button>
            })}
          </div>
        </div>

        {tab === 'lesson' && (
          <TopicLessons topics={d?.topics || []} assignments={assignments} teacher={teacher} />
        )}

        {tab === 'assign' && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Bài tập của môn này</h3>
            {(() => {
              const topicIds = new Set((d?.topics || []).map((t) => t.id))
              const list = assignments.filter((a) => topicIds.has(a.topic_id))
              if (!list.length) return <div className="empty">Chưa có bài tập nào được giao cho môn này.</div>
              return list.map((a) => (
                <div key={a.id} className="board-row">
                  <ClipboardList className="icn" style={{ color: 'var(--leaf)' }} />
                  <div>
                    <b>{a.title}</b>
                    <div className="small muted">{a.topic_name || 'Chuyên đề chung'}{a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
                  </div>
                  <Link className="btn" style={{ marginLeft: 'auto' }} to={`/assignments/${a.id}`}>Mở</Link>
                </div>
              ))
            })()}
          </div>
        )}

        {tab === 'docs' && (
          <div className="card">
            <div className="empty">Tài liệu sẽ hiển thị ở đây — giáo viên có thể bổ sung sau.</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Chuyên đề</h1>
        <div className="small muted">Chọn môn → danh sách chuyên đề → bài học, bài tập, tài liệu.</div>
      </div>
      <div className="grid c2">
        {subjects.map((s) => (
          <div key={s.id} className="card" style={{ cursor: 'pointer' }} onClick={() => nav(`/topics/${s.id}`)}>
            <h3 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><BookOpen className="icn" />{s.name}</h3>
            <div className="small muted" style={{ marginTop: 4 }}>Mở danh sách chuyên đề →</div>
          </div>
        ))}
        {subjects.length === 0 && <div className="empty">Đang tải danh sách môn…</div>}
      </div>
    </div>
  )
}

function TopicLessons({ topics, assignments, teacher }) {
  const [openId, setOpenId] = useState(null)
  const [lessons, setLessons] = useState([])
  const [msg, setMsg] = useState('')
  const [newLesson, setNewLesson] = useState({ title: '', content: '' })
  const [showAdd, setShowAdd] = useState(false)

  const loadLessons = async (tid) => {
    try { setLessons(await api.lessons(tid)) } catch { setLessons([]) }
  }
  useEffect(() => { if (openId) loadLessons(openId); setMsg('') }, [openId])

  const toggle = async (l) => {
    setMsg('')
    try {
      await api.completeLesson(l.id, l.completed)
      await loadLessons(openId)
    } catch (e) { setMsg(String(e.message || e)) }
  }

  const addLesson = async () => {
    if (!newLesson.title.trim()) return setMsg('Nhập tiêu đề bài học.')
    try {
      await api.createLesson({ topic_id: openId, title: newLesson.title.trim(), content: newLesson.content, idx: lessons.length + 1 })
      setNewLesson({ title: '', content: '' })
      setShowAdd(false)
      await loadLessons(openId)
    } catch (e) { setMsg(String(e.message || e)) }
  }

  if (openId) {
    const t = topics.find((x) => x.id === openId)
    const doneN = lessons.filter((l) => l.completed).length
    return (
      <>
        <div className="card">
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => setOpenId(null)}><ArrowLeft className="icn sm" />Danh sách chuyên đề</button>
          <h2 style={{ margin: 0 }}>{(t?.name || openId).toUpperCase()}</h2>
          {t?.description && <div className="small muted">{t.description}</div>}
          <div className="small muted" style={{ marginTop: 4 }}>Bài học {doneN}/{lessons.length} hoàn thành</div>
          {teacher && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowAdd((v) => !v)}>+ Thêm bài học</button>
          )}
          {teacher && showAdd && (
            <div style={{ marginTop: 10, background: 'var(--leaf-soft)', borderRadius: 12, padding: 12 }}>
              <label className="lbl" style={{ marginTop: 0 }}>Tiêu đề *</label>
              <input className="input" value={newLesson.title} onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })} />
              <label className="lbl">Nội dung</label>
              <textarea className="textarea" value={newLesson.content} onChange={(e) => setNewLesson({ ...newLesson, content: e.target.value })} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={addLesson}>Lưu bài học</button>
                <button className="btn" onClick={() => setShowAdd(false)}>Hủy</button>
              </div>
            </div>
          )}
          {msg && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{msg}</div>}
        </div>

        {lessons.length === 0 && <div className="empty">Chưa có bài học trong chuyên đề này.</div>}
        {lessons.map((l) => (
          <div key={l.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{String(l.idx).padStart(2, '0')}. {l.title}</b>
              {!teacher && (
                <button className={`btn ${l.completed ? 'primary' : ''}`} onClick={() => toggle(l)}>
                  {l.completed ? <><CheckCircle2 className="icn sm" />Đã hoàn thành</> : <><Circle className="icn sm" />Đánh dấu hoàn thành</>}
                </button>
              )}
              {l.completed && teacher && <span className="badge green">HS đã học</span>}
            </div>
            {l.content && <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>{l.content}</div>}
          </div>
        ))}
      </>
    )
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Danh sách chuyên đề</h3>
      {topics.length === 0 && <div className="empty">Chưa có chuyên đề cho môn này.</div>}
      {topics.map((t, i) => {
        const nAssign = assignments.filter((a) => a.topic_id === t.id).length
        return (
          <div key={t.id} className="board-row" style={{ cursor: 'pointer' }} onClick={() => setOpenId(t.id)}>
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <b>{t.name}</b>
              {t.description && <div className="small muted">{t.description}</div>}
              <div className="small muted">{nAssign ? `${nAssign} bài tập` : ''}{t.grade ? ` • lớp ${t.grade}` : ''}</div>
            </div>
            <span className="small muted" style={{ marginLeft: 'auto' }}>Mở →</span>
          </div>
        )
      })}
    </div>
  )
}
