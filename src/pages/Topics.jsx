import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconBook, IconTask, IconClip, IconArrowLeft, IconCheckCircle, IconCircle, IconPlus, IconPencil, IconX, IconFile } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { isStaffRole } from '../lib/roles.js'

const TABS = [
  { id: 'lesson', label: 'Bài học', icon: IconBook },
  { id: 'assign', label: 'Bài tập', icon: IconTask },
  { id: 'docs', label: 'Tài liệu', icon: IconClip },
]

function normalizeLessons(r) {
  if (Array.isArray(r)) return { lessons: r, required_total: 0, required_done: 0, topic_complete: false }
  if (r && Array.isArray(r.lessons)) return r
  return { lessons: [], required_total: 0, required_done: 0, topic_complete: false }
}

export default function Topics() {
  const { subjectId } = useParams()
  const [subjects, setSubjects] = useState([])
  const [detail, setDetail] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [tab, setTab] = useState('lesson')
  const nav = useNavigate()
  const rawRole = getSession().student?.role || 'student'
  const teacher = isStaffRole(rawRole)

  useEffect(() => { api.subjects().then(setSubjects).catch(() => {}) }, [])

  const loadDetail = async (sid) => {
    try {
      const [ts, as] = await Promise.all([
        api.topics(sid),
        api.assignments().catch(() => []),
      ])
      const subj = subjects.find((s) => s.id === sid) || { id: sid, name: sid }
      setDetail({ subject: subj, topics: ts })
      setAssignments(as || [])
    } catch {
      setDetail({ subject: { id: sid }, topics: [] })
    }
  }

  useEffect(() => {
    if (!subjectId) { setDetail(null); return }
    setTab('lesson')
    loadDetail(subjectId)
    // eslint-disable-next-line
  }, [subjectId])

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
          <TopicLessons
            topics={d?.topics || []}
            assignments={assignments}
            teacher={teacher}
            subjectId={subjectId}
            onChanged={() => loadDetail(subjectId)}
          />
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
          <MaterialsPanel subjectId={subjectId} teacher={teacher} topics={d?.topics || []} />
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

/* ---------- Thư viện học liệu (2.4) ---------- */
function MaterialsPanel({ subjectId, teacher, topics }) {
  const { toast, confirmBox, errMsg } = useUI()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ title: '', description: '', topic_id: '', file_url: '', file_type: '' })
  const [busy, setBusy] = useState(false)

  const load = () => api.materials({ subject_id: subjectId }).then(setRows).catch(() => setRows([]))
  useEffect(load, [subjectId])

  const pickFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      if (!api.uploadAnyFile) { toast('Chế độ này chưa hỗ trợ upload — dán link file.', 'warn'); setBusy(false); e.target.value = ''; return }
      const url = await api.uploadAnyFile(file)
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      setForm((f) => ({ ...f, file_url: url, file_type: ext, title: f.title || file.name.replace(/\.[^.]+$/, '') }))
      toast('Đã tải file lên.')
    } catch (err) { toast(errMsg(err), 'err') }
    setBusy(false)
    e.target.value = ''
  }

  const save = async () => {
    if (busy) return
    if (!form.title.trim()) return toast('Nhập tên tài liệu.', 'warn')
    setBusy(true)
    try {
      await api.createMaterial({ ...form, subject_id: subjectId, topic_id: form.topic_id || null })
      setForm({ title: '', description: '', topic_id: '', file_url: '', file_type: '' })
      load()
      toast('Đã thêm học liệu.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const remove = async (m) => {
    const ok = await confirmBox(`Xóa học liệu “${m.title}”?`, { danger: true, okLabel: 'Xóa' })
    if (!ok) return
    try { await api.deleteMaterial(m.id); load(); toast('Đã xóa.') } catch (e) { toast(errMsg(e), 'err') }
  }

  return (
    <div className="grid">
      {teacher && (
        <div className="card">
          <h3>Thêm học liệu</h3>
          <div className="grid c2">
            <div>
              <label className="lbl" htmlFor="mat-title" style={{ marginTop: 0 }}>Tên tài liệu *</label>
              <input className="input" id="mat-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <label className="lbl" htmlFor="mat-topic">Chuyên đề</label>
              <select className="select" id="mat-topic" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
                <option value="">— Chung —</option>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="mat-desc">Mô tả</label>
              <textarea className="textarea" id="mat-desc" style={{ minHeight: 70 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label className="lbl" htmlFor="mat-file">File (PDF/DOCX/PPTX…) hoặc dán URL</label>
              <div className="row">
                <input type="file" id="mat-file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip" onChange={pickFile} style={{ flex: 1, minWidth: 120 }} />
              </div>
              <input className="input" style={{ marginTop: 6 }} placeholder="https://… hoặc link vừa upload" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Thêm học liệu'}</button>
          </div>
        </div>
      )}
      <div className="card">
        <h3>Thư viện học liệu</h3>
        {rows.length === 0 && <div className="empty">Chưa có tài liệu cho môn này.</div>}
        {rows.map((m) => (
          <div key={m.id} className="board-row">
            <IconFile className="icn" style={{ color: 'var(--leaf)' }} />
            <div style={{ minWidth: 0 }}>
              <b>{m.title}</b>
              <div className="small muted">{m.file_type ? m.file_type.toUpperCase() : ''}{m.topic_id ? ` · ${m.topic_id}` : ''}{m.description ? ` · ${m.description}` : ''}</div>
            </div>
            <div className="row push">
              {m.file_url && <a className="btn sm" href={m.file_url} target="_blank" rel="noreferrer">Mở</a>}
              {teacher && <button className="btn danger sm" onClick={() => remove(m)}>Xóa</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TopicLessons({ topics, assignments, teacher, subjectId, onChanged }) {
  const { toast, confirmBox, errMsg } = useUI()
  const [openId, setOpenId] = useState(null)
  const [meta, setMeta] = useState({ lessons: [], required_total: 0, required_done: 0, topic_complete: false })
  const [newLesson, setNewLesson] = useState({ title: '', content: '', required: true, advanced: false })
  const [showAdd, setShowAdd] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', content: '', required: true, advanced: false })
  const [busy, setBusy] = useState(false)
  const [editingTopic, setEditingTopic] = useState(null)
  const [topicForm, setTopicForm] = useState({ name: '', description: '' })

  const lessons = meta.lessons || []

  const loadLessons = async (tid) => {
    try { setMeta(normalizeLessons(await api.lessons(tid))) } catch { setMeta({ lessons: [] }) }
  }
  useEffect(() => { if (openId) loadLessons(openId) }, [openId])

  // Offline banner: đã xem bài này lần trước → vẫn đọc được từ cache SW
  const [offlineHint, setOfflineHint] = useState(false)
  useEffect(() => {
    const on = () => setOfflineHint(true)
    const off = () => setOfflineHint(false)
    window.addEventListener('offline', on)
    window.addEventListener('online', off)
    if (!navigator.onLine) on()
    return () => { window.removeEventListener('offline', on); window.removeEventListener('online', off) }
  }, [])

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
      await api.createLesson({
        topic_id: openId, title: newLesson.title.trim(), content: newLesson.content,
        idx: lessons.length + 1, required: newLesson.required ? 1 : 0, advanced: newLesson.advanced ? 1 : 0,
      })
      setNewLesson({ title: '', content: '', required: true, advanced: false })
      setShowAdd(false)
      await loadLessons(openId)
      toast('Đã thêm bài học.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const saveEditLesson = async () => {
    if (busy || !editingLesson) return
    if (!editForm.title.trim()) { toast('Nhập tiêu đề.', 'warn'); return }
    setBusy(true)
    try {
      await api.updateLesson(editingLesson.id, {
        title: editForm.title.trim(), content: editForm.content,
        required: editForm.required ? 1 : 0, advanced: editForm.advanced ? 1 : 0,
      })
      setEditingLesson(null)
      await loadLessons(openId)
      toast('Đã lưu bài học.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const removeLesson = async (l) => {
    const ok = await confirmBox(`Xóa bài “${l.title}”? Hành động không hoàn tác.`, { danger: true, okLabel: 'Xóa' })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteLesson(l.id)
      await loadLessons(openId)
      toast('Đã xóa bài học.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const moveLesson = async (l, dir) => {
    setBusy(true)
    try { await api.moveLesson(l.id, dir); await loadLessons(openId) } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const startEditTopic = (t) => {
    setEditingTopic(t)
    setTopicForm({ name: t.name, description: t.description || '' })
  }

  const saveTopic = async () => {
    if (busy) return
    if (!topicForm.name.trim()) { toast('Nhập tên chuyên đề.', 'warn'); return }
    setBusy(true)
    try {
      await api.updateTopic(editingTopic.id, topicForm)
      setEditingTopic(null)
      onChanged?.()
      toast('Đã lưu chuyên đề.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const removeTopic = async (t) => {
    const ok = await confirmBox(`Xóa chuyên đề “${t.name}” kèm toàn bộ bài học? Không hoàn tác.`, { danger: true, okLabel: 'Xóa vĩnh viễn' })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteTopic(t.id)
      onChanged?.()
      toast('Đã xóa chuyên đề.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  if (openId) {
    const t = topics.find((x) => x.id === openId)
    const reqDone = meta.required_done ?? 0
    const reqTotal = meta.required_total ?? lessons.length
    return (
      <>
        {offlineHint && (
          <div className="msg warn" role="status">
            Bạn đang offline — bài học đã tải trước vẫn hiển thị. Nộp bài / đồng bộ sẽ chờ khi có mạng.
          </div>
        )}
        <div className="card">
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => setOpenId(null)}><IconArrowLeft className="icn sm" />Danh sách chuyên đề</button>
          <div className="row spread">
            <div>
              <h2 style={{ margin: 0 }}>{t?.name || openId}</h2>
              {t?.description && <div className="small muted">{t.description}</div>}
              <div className="small muted" style={{ marginTop: 4 }}>
                Bài học {lessons.filter((l) => l.completed).length}/{lessons.length} ·
                bắt buộc {reqDone}/{reqTotal}
                {meta.topic_complete && <span className="badge green" style={{ marginLeft: 8 }}>Chuyên đề hoàn thành</span>}
              </div>
            </div>
            {teacher && (
              <div className="row">
                <button className="btn" onClick={() => startEditTopic(t || { id: openId, name: '', description: '' })}><IconPencil className="icn sm" />Sửa CD</button>
                <button className="btn danger" onClick={() => removeTopic(t || { id: openId, name: openId })}><IconX className="icn sm" />Xóa CD</button>
              </div>
            )}
          </div>
          {teacher && (
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowAdd((v) => !v)}><IconPlus className="icn sm" />Thêm bài học</button>
          )}
          {teacher && showAdd && (
            <div className="panel" style={{ marginTop: 10 }}>
              <label className="lbl" htmlFor="nl-title" style={{ marginTop: 0 }}>Tiêu đề *</label>
              <input className="input" id="nl-title" value={newLesson.title} onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })} />
              <label className="lbl" htmlFor="nl-content">Nội dung</label>
              <textarea className="textarea" id="nl-content" value={newLesson.content} onChange={(e) => setNewLesson({ ...newLesson, content: e.target.value })} />
              <div className="row" style={{ marginTop: 8, gap: 16 }}>
                <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newLesson.required} onChange={(e) => setNewLesson({ ...newLesson, required: e.target.checked })} />
                  Bắt buộc
                </label>
                <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newLesson.advanced} onChange={(e) => setNewLesson({ ...newLesson, advanced: e.target.checked })} />
                  Nâng cao
                </label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={addLesson} disabled={busy}>Lưu bài học</button>
                <button className="btn" onClick={() => setShowAdd(false)}>Hủy</button>
              </div>
            </div>
          )}
          {teacher && editingTopic && (
            <div className="panel" style={{ marginTop: 10 }}>
              <h3>Sửa chuyên đề</h3>
              <label className="lbl" htmlFor="tp-name" style={{ marginTop: 0 }}>Tên *</label>
              <input className="input" id="tp-name" value={topicForm.name} onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })} />
              <label className="lbl" htmlFor="tp-desc">Mô tả</label>
              <textarea className="textarea" id="tp-desc" value={topicForm.description} onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" onClick={saveTopic} disabled={busy}>Lưu</button>
                <button className="btn" onClick={() => setEditingTopic(null)}>Hủy</button>
              </div>
            </div>
          )}
        </div>

        {lessons.length === 0 && <div className="empty">Chưa có bài học trong chuyên đề này.</div>}
        {lessons.map((l, i) => (
          <div key={l.id} className="card">
            <div className="row spread">
              <b>
                {String(l.idx ?? i + 1).padStart(2, '0')}. {l.title}
                {l.required !== false && <span className="badge blue" style={{ marginLeft: 6 }}>Bắt buộc</span>}
                {l.advanced && <span className="badge amber" style={{ marginLeft: 4 }}>Nâng cao</span>}
              </b>
              <div className="row">
                {teacher && (
                  <>
                    <button className="btn sm" aria-label="Lên" onClick={() => moveLesson(l, 'up')} disabled={busy || i === 0}>↑</button>
                    <button className="btn sm" aria-label="Xuống" onClick={() => moveLesson(l, 'down')} disabled={busy || i === lessons.length - 1}>↓</button>
                    <button className="btn sm" onClick={() => { setEditingLesson(l); setEditForm({ title: l.title, content: l.content || '', required: l.required !== false, advanced: !!l.advanced }) }}><IconPencil className="icn sm" /></button>
                    <button className="btn danger sm" onClick={() => removeLesson(l)}><IconX className="icn sm" /></button>
                  </>
                )}
                {!teacher && (
                  <button className={`btn ${l.completed ? 'primary' : ''}`} onClick={() => toggle(l)} disabled={busy}>
                    {l.completed ? <><IconCheckCircle className="icn sm" />Đã hoàn thành</> : <><IconCircle className="icn sm" />Đánh dấu hoàn thành</>}
                  </button>
                )}
                {l.completed && teacher && <span className="badge green">HS đã học</span>}
              </div>
            </div>
            {teacher && editingLesson?.id === l.id && (
              <div className="panel" style={{ marginTop: 10 }}>
                <label className="lbl" htmlFor={`el-${l.id}`} style={{ marginTop: 0 }}>Tiêu đề</label>
                <input className="input" id={`el-${l.id}`} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                <label className="lbl" htmlFor={`ec-${l.id}`}>Nội dung</label>
                <textarea className="textarea" id={`ec-${l.id}`} value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
                <div className="row" style={{ marginTop: 8, gap: 16 }}>
                  <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.required} onChange={(e) => setEditForm({ ...editForm, required: e.target.checked })} />
                    Bắt buộc
                  </label>
                  <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.advanced} onChange={(e) => setEditForm({ ...editForm, advanced: e.target.checked })} />
                    Nâng cao
                  </label>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn primary" onClick={saveEditLesson} disabled={busy}>Lưu</button>
                  <button className="btn" onClick={() => setEditingLesson(null)}>Hủy</button>
                </div>
              </div>
            )}
            {l.content && !editingLesson && <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>{l.content}</div>}
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
              <div className="small muted">
                {t.lesson_count != null ? `${t.lesson_count} bài` : ''}{nAssign ? ` · ${nAssign} bài tập` : ''}{t.grade ? ` · lớp ${t.grade}` : ''}
                {t.required_count ? ` · ${t.required_count} bắt buộc` : ''}
              </div>
            </div>
            <span className="small muted push">Mở →</span>
          </div>
        )
      })}
    </div>
  )
}
