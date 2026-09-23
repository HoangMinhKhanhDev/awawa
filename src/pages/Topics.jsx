import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookOpen, ClipboardList, Paperclip, ArrowLeft } from 'lucide-react'
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
    if (!teacher) api.assignments().then(setAssignments).catch(() => setAssignments([]))
    else api.assignments().then(setAssignments).catch(() => setAssignments([]))
  }, [subjectId, subjects, teacher])

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
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Danh sách chuyên đề</h3>
            {(d?.topics || []).length === 0 && <div className="empty">Chưa có chuyên đề cho môn này.</div>}
            {(d?.topics || []).map((t, i) => (
              <div key={t.id} className="board-row">
                <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <b>{t.name}</b>
                  {t.description && <div className="small muted">{t.description}</div>}
                  <div className="small muted">Lớp {t.grade}</div>
                </div>
              </div>
            ))}
          </div>
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
