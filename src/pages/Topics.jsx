import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconBook, IconTask, IconClip, IconArrowLeft, IconCheckCircle, IconCircle, IconPlus } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'

const TABS = [
  { id: 'lesson', label: 'Bài học', icon: IconBook },
  { id: 'assign', label: 'Bài tập', icon: IconTask },
  { id: 'docs', label: 'Tài liệu', icon: IconClip },
]

export default function Topics() {
  const { subjectId } = useParams()
  const [subjects, setSubjects] = useState([])
  const [detail, setDetail] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [tab, setTab] = useState('lesson')
  const nav = useNavigate()
  const rawRole = getSession().student?.role || 'student'
  const teacher = rawRole === 'teacher' || rawRole === 'admin'

  useEffect(() => { api.subjects().then(setSubjects).catch(() => {}) }, [])

  useEffect(() => {
    if (!subjectId) { setDetail(null); return }
    setTab('lesson')
    let alive = true
    api.topics(subjectId).then((ts) => {
      if (!alive) return
      const subj = subjects.find((s) => s.id === subjectId) || { id: subjectId, name: subjectId }
      setDetail({ subject: subj, topics: ts })
    }).catch(() => { if (alive) setDetail({ subject: { id: subjectId }, topics: [] }) })
    api.assignments().then((r) => alive && setAssignments(r)).catch(() => alive && setAssignments([]))
    return () => { alive = false }
  }, [subjectId]) // eslint-disable-line -- chỉ refetch khi đổi môn; subjects chỉ dùng để hiển thị tên

  if (subjectId) {
    const d = detail
    return (
      <div className="grid">
        <div className="card">
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav('/topics')}><IconArrowLeft className="icn sm" />Tất cả môn</button>
          <h1 style={{ margin: '0 0 4px' }}>{d?.subject?.name || subjectId}</h1>
          <div className="subnav" style={{ marginTop: 10 }} role="tablist" aria-label="Nội dung môn">
            {TABS.map((t) => {
              const Icon = t.icon
              return <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><Icon className="icn sm" />{t.label}</button>
            })}
          </div>
        </div>

        {tab === 'lesson' && (
          <TopicLessons topics={d?.topics || []} assignments={assignments} teacher={teacher} />
        )}

        {tab === 'assign' && (
          <div className="card">
            <h3>Bài tập của môn này</h3>
            {(() => {
              const topicIds = new Set((d?.topics || []).map((t) => t.id))
              const list = assignments.filter((a) => topicIds.has(a.topic_id))
              if (!list.length) return <div className="empty">Chưa có bài tập nào được giao cho môn này.</div>
              return list.map((a) => (
                <div key={a.id} className="board-row">
                  <IconTask className="icn" style={{ color: 'var(--leaf)' }} />
                  <div>
                    <b>{a.title}</b>
                    <div className="small muted">{a.topic_name || 'Chuyên đề chung'}{a.deadline ? ` · hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}</div>
                  </div>
                  <Link className="btn push" to={`/assignments/${a.id}`}>Mở</Link>
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
        <h1>Chuyên đề</h1>
        <div className="small muted">Chọn môn → danh sách chuyên đề → bài học, bài tập, tài liệu.</div>
      </div>
      <div className="grid c2">
        {subjects.map((s) => (
          <Link key={s.id} className="card" to={`/topics/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3 className="icon-h" style={{ margin: 0 }}><IconBook className="icn" />{s.name}</h3>
            <div className="small muted" style={{ marginTop: 4 }}>Mở danh sách chuyên đề →</div>
          </Link>
        ))}
        {subjects.length === 0 && <div className="empty">Đang tải danh sách môn…</div>}
      </div>
    </div>
  )
}

function TopicLessons({ topics, assignments, teacher }) {
  const { toast, errMsg } = useUI()
  const [openId, setOpenId] = useState(null)
  const [lessons, setLessons] = useState([])
  const [newLesson, setNewLesson] = useState({ title: '', content: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadLessons = async (tid) => {
    try { setLessons(await api.lessons(tid)) } catch { setLessons([]) }
  }
  useEffect(() => { if (openId) loadLessons(openId) }, [openId])

  const toggle = async (l) => {
    if (busy) return
    setBusy(true)
    try {
      await api.completeLesson(l.id, l.completed)
      await loadLessons(openId)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const addLesson = async () => {
    if (busy) return
    if (!newLesson.title.trim()) { toast('Nhập tiêu đề bài học.', 'warn'); return }
    setBusy(true)
    try {
      await api.createLesson({ topic_id: openId, title: newLesson.title.trim(), content: newLesson.content, idx: lessons.length + 1 })
      setNewLesson({ title: '', content: '' })
      setShowAdd(false)
      await loadLessons(openId)
      toast('Đã thêm bài học.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  if (openId) {
    const t = topics.find((x) => x.id === openId)
    const doneN = lessons.filter((l) => l.completed).length
    return (
      <>
        <div className="card">
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => setOpenId(null)}><IconArrowLeft className="icn sm" />Danh sách chuyên đề</button>
          <h2 style={{ margin: 0 }}>{t?.name || openId}</h2>
          {t?.description && <div className="small muted">{t.description}</div>}
          <div className="small muted" style={{ marginTop: 4 }}>Bài học {doneN}/{lessons.length} hoàn thành</div>
          {teacher && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowAdd((v) => !v)}><IconPlus className="icn sm" />Thêm bài học</button>
          )}
          {teacher && showAdd && (
            <div className="panel" style={{ marginTop: 10 }}>
              <label className="lbl" htmlFor="nl-title" style={{ marginTop: 0 }}>Tiêu đề *</label>
              <input className="input" id="nl-title" value={newLesson.title} onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })} />
              <label className="lbl" htmlFor="nl-content">Nội dung</label>
              <textarea className="textarea" id="nl-content" value={newLesson.content} onChange={(e) => setNewLesson({ ...newLesson, content: e.target.value })} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={addLesson} disabled={busy}>Lưu bài học</button>
                <button className="btn" onClick={() => setShowAdd(false)}>Hủy</button>
              </div>
            </div>
          )}
        </div>

        {lessons.length === 0 && <div className="empty">Chưa có bài học trong chuyên đề này.</div>}
        {lessons.map((l) => (
          <div key={l.id} className="card">
            <div className="row spread">
              <b>{String(l.idx).padStart(2, '0')}. {l.title}</b>
              {!teacher && (
                <button className={`btn ${l.completed ? 'primary' : ''}`} onClick={() => toggle(l)} disabled={busy}>
                  {l.completed ? <><IconCheckCircle className="icn sm" />Đã hoàn thành</> : <><IconCircle className="icn sm" />Đánh dấu hoàn thành</>}
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
      <h3>Danh sách chuyên đề</h3>
      {topics.length === 0 && <div className="empty">Chưa có chuyên đề cho môn này.</div>}
      {topics.map((t, i) => {
        const nAssign = assignments.filter((a) => a.topic_id === t.id).length
        return (
          <div key={t.id} className="board-row clickable" role="button" tabIndex={0}
            onClick={() => setOpenId(t.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(t.id) } }}>
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <b>{t.name}</b>
              {t.description && <div className="small muted">{t.description}</div>}
              <div className="small muted">{nAssign ? `${nAssign} bài tập` : ''}{t.grade ? ` · lớp ${t.grade}` : ''}</div>
            </div>
            <span className="small muted push">Mở →</span>
          </div>
        )
      })}
    </div>
  )
}
