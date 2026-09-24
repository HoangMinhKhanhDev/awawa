import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconBook, IconTask, IconClip, IconArrowLeft, IconCheckCircle, IconCircle, IconPlus, IconPencil, IconX, IconFile, IconLayers, IconPlay } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { isStaffRole } from '../lib/roles.js'

const TABS = [
  { id: 'lesson', label: 'Bài học', icon: IconBook },
  { id: 'assign', label: 'Bài tập', icon: IconTask },
  { id: 'cards', label: 'Flashcard', icon: IconLayers },
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

        {tab === 'cards' && (
          <FlashcardPanel topics={d?.topics || []} teacher={teacher} />
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
  const [newLesson, setNewLesson] = useState({ title: '', content: '', required: true, advanced: false, status: 'published' })
  const [showAdd, setShowAdd] = useState(false)
  const [editingLesson, setEditingLesson] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', content: '', required: true, advanced: false, status: 'published' })
  const [busy, setBusy] = useState(false)
  const [editingTopic, setEditingTopic] = useState(null)
  const [topicForm, setTopicForm] = useState({ name: '', description: '', parent_id: '', position: '', status: 'published' })

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
        status: newLesson.status || 'published',
      })
      setNewLesson({ title: '', content: '', required: true, advanced: false, status: 'published' })
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
        status: editForm.status || 'published',
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

  const togglePublish = async (l) => {
    if (busy) return
    setBusy(true)
    try {
      await api.updateLesson(l.id, { status: (l.status || 'published') === 'published' ? 'draft' : 'published' })
      await loadLessons(openId)
      toast('Đã cập nhật trạng thái.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const startEditTopic = (t) => {
    setEditingTopic(t)
    setTopicForm({ name: t.name, description: t.description || '', parent_id: t.parent_id || '', position: t.position ?? '', status: t.status || 'published' })
  }

  const statusBadge = (st) => {
    if (st === 'published' || !st) return null
    const label = st === 'draft' ? 'Bản nháp' : st === 'review' ? 'Chờ duyệt' : 'Lưu trữ'
    return <span className="badge amber" style={{ marginLeft: 6 }}>{label}</span>
  }

  const saveTopic = async () => {
    if (busy) return
    if (!topicForm.name.trim()) { toast('Nhập tên chuyên đề.', 'warn'); return }
    setBusy(true)
    try {
      await api.updateTopic(editingTopic.id, {
        name: topicForm.name.trim(),
        description: topicForm.description,
        parent_id: topicForm.parent_id || null,
        position: topicForm.position === '' ? undefined : Number(topicForm.position),
        status: topicForm.status || 'published',
      })
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
                <label className="row small" style={{ gap: 6 }}>
                  Trạng thái:
                  <select className="select" style={{ width: 'auto' }} value={newLesson.status} onChange={(e) => setNewLesson({ ...newLesson, status: e.target.value })}>
                    <option value="published">Xuất bản</option>
                    <option value="draft">Bản nháp</option>
                    <option value="review">Chờ duyệt</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
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
              <div className="grid c3" style={{ marginTop: 8 }}>
                <div>
                  <label className="lbl">Chuyên đề cha</label>
                  <select className="select" value={topicForm.parent_id || ''} onChange={(e) => setTopicForm({ ...topicForm, parent_id: e.target.value })}>
                    <option value="">— Gốc —</option>
                    {topics.filter((x) => x.id !== editingTopic.id).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Vị trí</label>
                  <input className="input" type="number" min="0" value={topicForm.position} onChange={(e) => setTopicForm({ ...topicForm, position: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Trạng thái</label>
                  <select className="select" value={topicForm.status || 'published'} onChange={(e) => setTopicForm({ ...topicForm, status: e.target.value })}>
                    <option value="published">Xuất bản</option>
                    <option value="draft">Bản nháp</option>
                    <option value="review">Chờ duyệt</option>
                    <option value="archived">Lưu trữ</option>
                  </select>
                </div>
              </div>
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
                {teacher && statusBadge(l.status)}
              </b>
              <div className="row">
                {teacher && (
                  <>
                    <button className="btn sm" aria-label="Lên" onClick={() => moveLesson(l, 'up')} disabled={busy || i === 0}>↑</button>
                    <button className="btn sm" aria-label="Xuống" onClick={() => moveLesson(l, 'down')} disabled={busy || i === lessons.length - 1}>↓</button>
                    <button className="btn sm" title={(l.status || 'published') === 'published' ? 'Chuyển về nháp' : 'Xuất bản'}
                      onClick={() => togglePublish(l)} disabled={busy}>
                      {(l.status || 'published') === 'published' ? 'Gỡ xuống' : 'Xuất bản'}
                    </button>
                    <button className="btn sm" onClick={() => { setEditingLesson(l); setEditForm({ title: l.title, content: l.content || '', required: l.required !== false, advanced: !!l.advanced, status: l.status || 'published' }) }}><IconPencil className="icn sm" /></button>
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
                  <label className="row small" style={{ gap: 6 }}>
                    Trạng thái:
                    <select className="select" style={{ width: 'auto' }} value={editForm.status || 'published'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="published">Xuất bản</option>
                      <option value="draft">Bản nháp</option>
                      <option value="review">Chờ duyệt</option>
                      <option value="archived">Lưu trữ</option>
                    </select>
                  </label>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn primary" onClick={saveEditLesson} disabled={busy}>Lưu</button>
                  <button className="btn" onClick={() => setEditingLesson(null)}>Hủy</button>
                </div>
              </div>
            )}
            {l.content && !editingLesson && (!Array.isArray(l.blocks) || l.blocks.length === 0) && <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>{l.content}</div>}
            <LessonBlocks lesson={l} teacher={teacher} onChanged={() => loadLessons(openId)} />
          </div>
        ))}
      </>
    )
  }

  const ordered = sortTopicTree(topics)
  return (
    <div className="card">
      <h3>Danh sách chuyên đề</h3>
      {topics.length === 0 && <div className="empty">Chưa có chuyên đề cho môn này.</div>}
      {ordered.map((t, i) => {
        const nAssign = assignments.filter((a) => a.topic_id === t.id).length
        const depth = topicDepth(topics, t)
        return (
          <div key={t.id} className="board-row clickable" role="button" tabIndex={0}
            style={depth ? { marginLeft: depth * 22 } : undefined}
            onClick={() => setOpenId(t.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(t.id) } }}>
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <b>{depth ? '└ ' : ''}{t.name}{teacher && statusBadge(t.status)}</b>
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

function topicDepth(topics, t) {
  let d = 0
  let cur = t
  const seen = new Set()
  while (cur?.parent_id && !seen.has(cur.id) && d < 8) {
    seen.add(cur.id)
    cur = topics.find((x) => x.id === cur.parent_id)
    if (cur) d++
    else break
  }
  return d
}

function sortTopicTree(topics) {
  const byParent = new Map()
  for (const t of topics) {
    const k = t.parent_id || '__root__'
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(t)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => ((a.position ?? 0) - (b.position ?? 0)) || String(a.name || '').localeCompare(String(b.name || ''), 'vi'))
  }
  const out = []
  const walk = (pid, guard = 0) => {
    if (guard > 9) return
    for (const t of byParent.get(pid) || []) {
      out.push(t)
      walk(t.id, guard + 1)
    }
  }
  walk('__root__')
  // Orphan (cha không tồn tại trong list) → gắn cuối để không mất
  for (const t of topics) {
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/* ---------- BLOCKS của bài học (M5: text/image/table/note/example/fill_blank/question/attachment) ---------- */
const BLOCK_TYPE_LABELS = {
  text: 'Văn bản',
  image: 'Hình ảnh',
  table: 'Bảng',
  note: 'Ghi chú',
  example: 'Ví dụ',
  fill_blank: 'Điền khuyết',
  question: 'Câu hỏi',
  attachment: 'Tệp đính kèm',
}
const BLOCK_TYPES = Object.keys(BLOCK_TYPE_LABELS)

const looksLikeUrl = (s) => /^(https?:\/\/|\/|data:image\/)/i.test((s || '').trim())

function BlockContent({ b }) {
  const c = b.content || ''
  if (b.type === 'image' && looksLikeUrl(c)) {
    return (
      <div style={{ marginTop: 6 }}>
        <img src={c.trim()} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} loading="lazy" />
      </div>
    )
  }
  if (b.type === 'attachment' && looksLikeUrl(c)) {
    return (
      <div style={{ marginTop: 6 }}>
        <a className="btn sm" href={c.trim()} target="_blank" rel="noreferrer">Mở tệp đính kèm</a>
      </div>
    )
  }
  if (b.type === 'table') {
    return <pre style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, overflowX: 'auto', background: 'var(--line-soft)', borderRadius: 8, padding: 10, whiteSpace: 'pre-wrap' }}>{c}</pre>
  }
  return <div style={{ whiteSpace: 'pre-wrap', marginTop: 6, fontSize: 14, lineHeight: 1.65 }}>{c}</div>
}

function LessonBlocks({ lesson, teacher, onChanged }) {
  const { toast, confirmBox, errMsg } = useUI()
  const [rows, setRows] = useState(Array.isArray(lesson.blocks) ? lesson.blocks : [])
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ type: 'text', content: '', position: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ type: 'text', content: '', position: '' })

  const reloadRows = async () => {
    try {
      const r = await api.lessonBlocks(lesson.id)
      setRows(Array.isArray(r) ? r : [])
    } catch {}
  }

  useEffect(() => {
    let alive = true
    if (Array.isArray(lesson.blocks) && lesson.blocks.length) {
      setRows(lesson.blocks)
      return () => { alive = false }
    }
    api.lessonBlocks(lesson.id).then((r) => { if (alive) setRows(Array.isArray(r) ? r : []) }).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line
  }, [lesson.id, lesson.blocks])

  const ordered = [...rows].sort((a, b) => ((a.position ?? 0) - (b.position ?? 0)) || ((a.id ?? 0) - (b.id ?? 0)))

  const add = async () => {
    if (busy) return
    if (!form.content.trim()) { toast('Nhập nội dung block.', 'warn'); return }
    setBusy(true)
    try {
      await api.createBlock(lesson.id, {
        type: form.type || 'text',
        content: form.content,
        position: form.position === '' ? undefined : Number(form.position),
      })
      setForm({ type: 'text', content: '', position: '' })
      setShowAdd(false)
      await reloadRows()
      await onChanged?.()
      toast('Đã thêm block.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const startEdit = (b) => {
    setEditingId(b.id)
    setEditForm({ type: b.type || 'text', content: b.content || '', position: b.position ?? '' })
  }

  const saveEdit = async () => {
    if (busy || editingId == null) return
    if (!editForm.content.trim()) { toast('Nhập nội dung block.', 'warn'); return }
    setBusy(true)
    try {
      await api.updateBlock(editingId, {
        type: editForm.type || 'text',
        content: editForm.content,
        position: editForm.position === '' ? undefined : Number(editForm.position),
      })
      setEditingId(null)
      await reloadRows()
      await onChanged?.()
      toast('Đã lưu block.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const remove = async (b) => {
    const ok = await confirmBox('Xóa block này? Không hoàn tác.', { danger: true, okLabel: 'Xóa' })
    if (!ok) return
    setBusy(true)
    try {
      await api.deleteBlock(b.id)
      await reloadRows()
      await onChanged?.()
      toast('Đã xóa block.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const move = async (b, dir) => {
    if (busy) return
    const i = ordered.findIndex((x) => x.id === b.id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ordered.length) return
    setBusy(true)
    try {
      const a = ordered[i]
      const c = ordered[j]
      const pa = a.position ?? (i + 1)
      const pc = c.position ?? (j + 1)
      await api.updateBlock(a.id, { position: pc })
      await api.updateBlock(c.id, { position: pa })
      await reloadRows()
      await onChanged?.()
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
      <div className="row spread">
        <span className="small muted">Nội dung chi tiết{ordered.length ? ` (${ordered.length})` : ''}</span>
        {teacher && (
          <button className="btn sm" onClick={() => setShowAdd((v) => !v)}><IconPlus className="icn sm" />Thêm block</button>
        )}
      </div>
      {teacher && showAdd && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="grid c2">
            <div>
              <label className="lbl" style={{ marginTop: 0 }}>Loại block</label>
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>)}
              </select>
              <label className="lbl">Vị trí (để trống = cuối)</label>
              <input className="input" type="number" min="1" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div>
              <label className="lbl" style={{ marginTop: 0 }}>Nội dung *</label>
              <textarea className="textarea" style={{ minHeight: 90 }} value={form.content}
                placeholder="Văn bản / link ảnh / link tệp…"
                onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary sm" onClick={add} disabled={busy}>Lưu block</button>
            <button className="btn sm" onClick={() => setShowAdd(false)}>Hủy</button>
          </div>
        </div>
      )}
      {ordered.length === 0 && <div className="small muted" style={{ marginTop: 6 }}>Chưa có nội dung chi tiết.</div>}
      {ordered.map((b, i) => (
        <div key={b.id} className="panel" style={{ marginTop: 8 }}>
          <div className="row spread">
            <span className="badge">{BLOCK_TYPE_LABELS[b.type] || b.type}{b.position != null ? ` · #${b.position}` : ''}</span>
            {teacher && (
              <div className="row">
                <button className="btn sm" aria-label="Lên" onClick={() => move(b, 'up')} disabled={busy || i === 0}>↑</button>
                <button className="btn sm" aria-label="Xuống" onClick={() => move(b, 'down')} disabled={busy || i === ordered.length - 1}>↓</button>
                <button className="btn sm" onClick={() => startEdit(b)}><IconPencil className="icn sm" /></button>
                <button className="btn danger sm" onClick={() => remove(b)}><IconX className="icn sm" /></button>
              </div>
            )}
          </div>
          {teacher && editingId === b.id ? (
            <div style={{ marginTop: 8 }}>
              <div className="grid c2">
                <div>
                  <label className="lbl" style={{ marginTop: 0 }}>Loại block</label>
                  <select className="select" value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                    {BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_TYPE_LABELS[t]}</option>)}
                  </select>
                  <label className="lbl">Vị trí</label>
                  <input className="input" type="number" min="1" value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} />
                </div>
                <div>
                  <label className="lbl" style={{ marginTop: 0 }}>Nội dung *</label>
                  <textarea className="textarea" style={{ minHeight: 90 }} value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
                </div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary sm" onClick={saveEdit} disabled={busy}>Lưu</button>
                <button className="btn sm" onClick={() => setEditingId(null)}>Hủy</button>
              </div>
            </div>
          ) : (
            <BlockContent b={b} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------- FLASHCARD: GV quan ly + HS hoc (Leitner don gian) ---------- */
function FlashcardPanel({ topics, teacher }) {
  const { toast, errMsg, confirmBox } = useUI()
  const [openId, setOpenId] = useState(null)
  const [cards, setCards] = useState([])
  const [flip, setFlip] = useState(false)
  const [idx, setIdx] = useState(0)
  const [learning, setLearning] = useState(false)
  const [newCard, setNewCard] = useState({ front: '', back: '' })
  const [saving, setSaving] = useState(false)

  const load = async (tid) => {
    try { setCards(await api.flashcards(tid)) } catch { setCards([]) }
    setIdx(0); setFlip(false)
  }
  useEffect(() => { if (openId) load(openId); /* eslint-disable-next-line */ }, [openId])

  const review = async (quality) => {
    const c = cards[idx]
    if (!c) return
    try {
      const r = await api.reviewFlashcard(c.id, quality)
      setCards((cs) => cs.map((x) => x.id === c.id ? { ...x, box: r.box } : x))
      setFlip(false)
      if (idx + 1 < cards.length) setIdx(idx + 1)
      else { setLearning(false); toast('Xong vòng học! 🎉') }
    } catch (e) { toast(errMsg(e), 'err') }
  }

  const addOne = async () => {
    if (!newCard.front.trim()) return toast('Nhập mặt trước.', 'warn')
    setSaving(true)
    try {
      await api.createFlashcards({ topic_id: openId, cards: [{ front: newCard.front, back: newCard.back }] })
      setNewCard({ front: '', back: '' })
      await load(openId)
      toast('Đã thêm thẻ.')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const del = async (id) => {
    if (!(await confirmBox('Xóa thẻ này?'))) return
    try { await api.deleteFlashcard(id); await load(openId) } catch (e) { toast(errMsg(e), 'err') }
  }

  if (!openId) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Flashcard theo chuyên đề</h3>
        <div className="small muted" style={{ marginBottom: 8 }}>
          {teacher ? 'Chọn CĐ để xem/thêm thẻ (sinh nhiều thẻ bằng Studio → AI).' : 'Chọn CĐ để học thẻ lật trước/sau.'}
        </div>
        {topics.length === 0 && <div className="empty">Chưa có chuyên đề.</div>}
        {topics.map((t, i) => (
          <div key={t.id} className="board-row clickable" role="button" tabIndex={0}
            onClick={() => setOpenId(t.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(t.id) }}>
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <b>{t.name}</b>
            <span className="small muted push">Mở →</span>
          </div>
        ))}
      </div>
    )
  }

  const t = topics.find((x) => x.id === openId)
  const c = cards[idx]
  const mastered = cards.filter((x) => (x.box || 0) >= 3).length

  if (learning && c) {
    return (
      <div className="grid">
        <div className="card">
          <div className="row spread">
            <button className="btn" onClick={() => { setLearning(false); setFlip(false) }}><IconArrowLeft className="icn sm" />Thoát</button>
            <span className="badge">{idx + 1}/{cards.length} · Đã nhớ {mastered}</span>
          </div>
          <div style={{ marginTop: 14, minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: flip ? 'var(--leaf-soft)' : 'var(--line-soft)', borderRadius: 14, padding: 20, cursor: 'pointer', textAlign: 'center' }}
            onClick={() => setFlip((v) => !v)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setFlip((v) => !v) }}>
            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>{flip ? 'Mặt sau' : 'Mặt trước — bấm để lật'}</div>
              <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'pre-wrap' }}>
                {flip ? (c.back || '(trống)') : c.front}
              </div>
            </div>
          </div>
          {flip && (
            <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
              <button className="btn danger" onClick={() => review(0)}>Chưa nhớ</button>
              <button className="btn" onClick={() => review(1)}>Mơ mơ</button>
              <button className="btn primary" onClick={() => review(2)}>Nhớ ✓</button>
            </div>
          )}
          <div className="small muted" style={{ marginTop: 10, textAlign: 'center' }}>
            Ô nhớ: {Array.from({ length: 4 }, (_, i) => (c.box || 0) > i ? '●' : '○').join(' ')} · Lật thẻ rồi chấm độ nhớ
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="row spread">
          <button className="btn" onClick={() => setOpenId(null)}><IconArrowLeft className="icn sm" />Danh sách CĐ</button>
          {cards.length > 0 && !teacher && (
            <button className="btn primary" onClick={() => { setIdx(0); setFlip(false); setLearning(true) }}>
              <IconPlay className="icn sm" />Học {cards.length} thẻ
            </button>
          )}
        </div>
        <h2 style={{ margin: '10px 0 4px' }}>{t?.name || openId}</h2>
        <div className="small muted">{cards.length} thẻ · {mastered} đã nhớ (ô 3–4)</div>
      </div>

      {teacher && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Thêm thẻ thủ công</h3>
          <label className="lbl">Mặt trước *</label>
          <input className="input" value={newCard.front} onChange={(e) => setNewCard({ ...newCard, front: e.target.value })}
            placeholder="VD: Dao động điều hòa là gì?" />
          <label className="lbl">Mặt sau</label>
          <input className="input" value={newCard.back} onChange={(e) => setNewCard({ ...newCard, back: e.target.value })}
            placeholder="VD: Chuyển động lặp..." />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={addOne} disabled={saving}><IconPlus className="icn sm" />Thêm</button>
            <Link className="btn" to="/manage/studio">Sinh hàng loạt bằng AI →</Link>
          </div>
        </div>
      )}

      {cards.length === 0 && <div className="empty">Chưa có thẻ ở CĐ này.</div>}
      {cards.map((x, i) => (
        <div key={x.id} className="card">
          <div className="row spread">
            <b>{i + 1}. {x.front}</b>
            <div className="row">
              <span className="badge">{Array.from({ length: 4 }, (_, k) => (x.box || 0) > k ? '●' : '○').join('')}</span>
              {teacher && <button className="btn danger" onClick={() => del(x.id)}><IconX className="icn sm" /></button>}
            </div>
          </div>
          <div className="small muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{x.back}</div>
        </div>
      ))}
    </div>
  )
}
