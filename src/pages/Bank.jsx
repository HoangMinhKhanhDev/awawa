import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { IconPlus, IconSearch, IconShield, IconEye, IconLayers } from '../components/icons.jsx'

export default function Bank() {
  const { toast, confirmBox, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [f, setF] = useState({ subject_id: '', topic_id: '', grade: '', difficulty: '', qtype: '', search: '', tag: '', code: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ subject_id: '', topic_id: '', grade: 12, difficulty: 'vận dụng', qtype: 'trac_nghiem', content: '', options: ['', '', '', ''], correct_answer: '', explanation: '', score: 1, image_url: '', code: '', tags: [] })
  const [tagsText, setTagsText] = useState('')
  const [preview, setPreview] = useState(null)
  const [newTopic, setNewTopic] = useState('')
  const [saving, setSaving] = useState(false)

  const loadSubjects = async () => setSubjects(await api.subjects().catch(() => []))
  const loadTopics = async (sid) => setTopics(await api.topics(sid || undefined).catch(() => []))
  const load = async () => {
    setLoading(true)
    try { setRows(await api.questions({ ...f, limit: 200 })) } catch (e) { toast(errMsg(e), 'err') }
    setLoading(false)
  }

  useEffect(() => { loadSubjects(); loadTopics(''); load() }, [])
  useEffect(() => { loadTopics(f.subject_id) }, [f.subject_id])

  const openNew = () => {
    setEditing('new')
    setTagsText('')
    setForm({ subject_id: subjects[0]?.id || '', topic_id: '', grade: 12, difficulty: 'vận dụng', qtype: 'trac_nghiem', content: '', options: ['', '', '', ''], correct_answer: '', explanation: '', score: 1, image_url: '', code: '', tags: [] })
  }
  const openEdit = (q) => {
    setEditing(q.id)
    let opts = ['', '', '', '']
    try { const p = JSON.parse(q.options || '[]'); if (Array.isArray(p) && p.length) opts = [...p, '', '', '', ''].slice(0, 4) } catch {}
    const tags = Array.isArray(q.tags) ? q.tags : []
    setTagsText(tags.join(', '))
    setForm({ subject_id: q.subject_id, topic_id: q.topic_id || '', grade: q.grade || 12, difficulty: q.difficulty || 'vận dụng', qtype: q.qtype || 'trac_nghiem', content: q.content || '', options: opts, correct_answer: q.correct_answer || '', explanation: q.explanation || '', score: q.score || 1, image_url: q.image_url || '', code: q.code || '', tags })
  }
  const createTopicInline = async () => {
    if (saving) return
    if (!form.subject_id) return toast('Chọn môn trước', 'warn')
    if (!newTopic.trim()) return toast('Nhập tên chuyên đề mới', 'warn')
    setSaving(true)
    try {
      const r = await api.createTopic({ subject_id: form.subject_id, name: newTopic.trim(), grade: Number(form.grade) || 12 })
      await loadTopics(form.subject_id)
      setForm({ ...form, topic_id: r.id })
      setNewTopic('')
      toast('Đã tạo chuyên đề.')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }
  const save = async () => {
    if (saving) return
    if (!form.subject_id) return toast('Chọn môn', 'warn')
    if (!form.content.trim()) return toast('Nhập nội dung câu hỏi', 'warn')
    if (form.qtype === 'trac_nghiem') {
      const ans = (form.correct_answer || '').trim().toUpperCase()
      if (!'ABCD'.includes(ans)) return toast('Đáp án phải là A/B/C/D.', 'warn')
      if (form.options.filter((o) => o.trim()).length < 2) return toast('Cần ít nhất 2 phương án.', 'warn')
    }
    const payload = {
      ...form,
      topic_id: form.topic_id || null,
      options: form.qtype === 'trac_nghiem' ? form.options : [],
      correct_answer: form.qtype === 'trac_nghiem' ? (form.correct_answer || '').trim().toUpperCase() : form.correct_answer,
      code: (form.code || '').trim(),
      tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    }
    setSaving(true)
    try {
      if (editing === 'new') await api.createQuestion(payload)
      else await api.updateQuestion(editing, payload)
      setEditing(null); load(); toast('Đã lưu câu hỏi.')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const removeQ = async (q) => {
    const ok = await confirmBox(`Xóa câu #${q.id}? Hành động không hoàn tác.`, { danger: true, okLabel: 'Xóa' })
    if (!ok) return
    try { await api.deleteQuestion(q.id); load(); toast('Đã xóa.') } catch (e) { toast(errMsg(e), 'err') }
  }

  const duplicateQ = async (q) => {
    try {
      const r = await api.duplicateQuestion(q.id)
      toast(`Đã nhân bản → ${r.code || `#${r.id}`}.`)
      load()
    } catch (e) { toast(errMsg(e), 'err') }
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconShield className="icn" />Ngân hàng câu hỏi</h1>
        <div className="filter-grid">
          <select className="select" aria-label="Môn" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })}><option value="">Tất cả môn</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="select" aria-label="Chuyên đề" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })}><option value="">Tất cả chuyên đề</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="select" aria-label="Lớp" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option value="">Mọi lớp</option><option value="10">Lớp 10</option><option value="11">Lớp 11</option><option value="12">Lớp 12</option></select>
          <select className="select" aria-label="Độ khó" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="">Mọi độ khó</option><option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option></select>
          <select className="select" aria-label="Loại" value={f.qtype} onChange={(e) => setF({ ...f, qtype: e.target.value })}><option value="">Mọi loại</option><option value="trac_nghiem">Trắc nghiệm</option><option value="tu_luan">Tự luận</option><option value="dung_sai">Đúng/Sai</option></select>
          <input className="input" aria-label="Tìm nội dung" placeholder="Tìm nội dung…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
          <input className="input" aria-label="Mã câu" placeholder="Mã câu (Q12…)…" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          <input className="input" aria-label="Tag" placeholder="Tag (phương, cơ…)…" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={load} disabled={loading}>{loading ? 'Đang tải…' : <><IconSearch className="icn sm" />Lọc</>}</button>
          <button className="btn" onClick={openNew}><IconPlus className="icn sm" />Thêm câu hỏi</button>
          <span className="muted small">{rows.length} câu</span>
        </div>
      </div>

      {editing && (
        <div className="card">
          <h3>{editing === 'new' ? 'Thêm câu hỏi' : `Sửa câu #${editing}`}</h3>
          <div className="grid c2">
            <div>
              <label className="lbl" htmlFor="bk-subject">Môn</label>
              <select className="select" id="bk-subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <label className="lbl" htmlFor="bk-topic">Chuyên đề</label>
              <select className="select" id="bk-topic" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}><option value="">—</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <div className="row" style={{ marginTop: 6 }}>
                <input className="input" style={{ flex: 1 }} placeholder="Thêm chuyên đề mới…" aria-label="Chuyên đề mới" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
                <button className="btn" onClick={createTopicInline} disabled={saving}>+ Chuyên đề</button>
              </div>
              <div className="grid c3" style={{ marginTop: 8 }}>
                <div><label className="lbl" htmlFor="bk-grade">Lớp</label><select className="select" id="bk-grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}><option value={10}>10</option><option value={11}>11</option><option value={12}>12</option></select></div>
                <div><label className="lbl" htmlFor="bk-diff">Độ khó</label><select className="select" id="bk-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option></select></div>
                <div><label className="lbl" htmlFor="bk-type">Loại</label><select className="select" id="bk-type" value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}><option value="trac_nghiem">Trắc nghiệm</option><option value="tu_luan">Tự luận</option><option value="dung_sai">Đúng/Sai</option></select></div>
              </div>
            </div>
            <div>
              <label className="lbl" htmlFor="bk-content">Nội dung</label><textarea className="textarea" id="bk-content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <label className="lbl" htmlFor="bk-img">Ảnh minh họa (URL, tùy chọn)</label>
              <input className="input" id="bk-img" placeholder="https://… hoặc /uploads/…" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              {form.image_url && <img src={form.image_url} alt="minh họa" style={{ borderRadius: 8, marginTop: 6 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />}
              {api.uploadQuestionImage && (
                <div className="row" style={{ marginTop: 6 }}>
                  <input type="file" accept="image/*" aria-label="Tải ảnh lên" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (!api.uploadQuestionImage) { toast('Chế độ LAN chưa hỗ trợ upload ảnh — hãy dán link ảnh.', 'warn'); e.target.value = ''; return }
                    try {
                      const url = await api.uploadQuestionImage(file)
                      setForm((prev) => ({ ...prev, image_url: url }))
                      toast('Đã tải ảnh lên.')
                    } catch (err) { toast('Upload ảnh lỗi: ' + errMsg(err), 'err') }
                    e.target.value = ''
                  }} />
                  <span className="small muted">Tải ảnh lên server thay vì dán link</span>
                </div>
              )}
              {form.qtype === 'trac_nghiem' && (<>
                <label className="lbl">Các phương án (A–D)</label>
                {form.options.map((o, i) => <input key={i} className="input" style={{ marginBottom: 6 }} placeholder={`Phương án ${'ABCD'[i]}`} value={o} aria-label={`Phương án ${'ABCD'[i]}`} onChange={(e) => { const c = [...form.options]; c[i] = e.target.value; setForm({ ...form, options: c }) }} />)}
                <label className="lbl" htmlFor="bk-ans">Đáp án đúng (A/B/C/D)</label>
                <input className="input" id="bk-ans" style={{ maxWidth: 80 }} value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value.toUpperCase().slice(0, 1) })} />
              </>)}
              {form.qtype !== 'trac_nghiem' && (<><label className="lbl" htmlFor="bk-ans2">Đáp án / hướng chấm tham khảo</label><textarea className="textarea" id="bk-ans2" value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value })} /></>)}
              <label className="lbl" htmlFor="bk-exp">Lời giải chi tiết</label><textarea className="textarea" id="bk-exp" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
              <div className="grid c2" style={{ marginTop: 8 }}>
                <div>
                  <label className="lbl" htmlFor="bk-code">Mã câu (để trống = tự tạo)</label>
                  <input className="input" id="bk-code" placeholder="VD: Q101" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <label className="lbl" htmlFor="bk-tags">Tags (cách nhau dấu phẩy)</label>
                  <input className="input" id="bk-tags" placeholder="phương, dao động" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
            <button className="btn" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </div>
      )}

      <div className="card">
        <table className="tbl"><thead><tr><th style={{ width: 70 }}>Mã</th><th>Câu hỏi</th><th style={{ width: 220 }}>Phân loại</th><th style={{ width: 170 }}></th></tr></thead>
          <tbody>{rows.map((q) => (
            <tr key={q.id}>
              <td><b>{q.code || `#${q.id}`}</b></td>
              <td>
                <div style={{ whiteSpace: 'pre-wrap' }}>{q.content}</div>
                {q.image_url && <div style={{ marginTop: 6 }}><img src={q.image_url} alt="" style={{ maxWidth: 220, borderRadius: 8 }} loading="lazy" /></div>}
                <div className="small muted" style={{ marginTop: 4 }}>ĐA: {q.correct_answer || '—'}</div>
                {Array.isArray(q.tags) && q.tags.length > 0 && (
                  <div style={{ marginTop: 4 }}>{q.tags.map((t) => <span key={t} className="badge blue" style={{ marginRight: 4 }}>{t}</span>)}</div>
                )}
              </td>
              <td><span className="badge">{q.subject_name}</span><span className="badge">{q.topic_name || 'chung'}</span><div className="small muted" style={{ marginTop: 4 }}>Lớp {q.grade} · {q.difficulty} · {q.qtype}</div></td>
              <td>
                <div className="row">
                  <button className="btn sm" onClick={() => setPreview(q)} title="Xem trước"><IconEye className="icn sm" /></button>
                  <button className="btn sm" onClick={() => openEdit(q)}>Sửa</button>
                  <button className="btn sm" onClick={() => duplicateQ(q)} title="Nhân bản"><IconLayers className="icn sm" /></button>
                  <button className="btn danger sm" onClick={() => removeQ(q)}>Xóa</button>
                </div>
              </td>
            </tr>
          ))}</tbody></table>
        {rows.length === 0 && !loading && <div className="empty" style={{ marginTop: 8 }}>Chưa có câu hỏi phù hợp. Hãy nhập đề ở mục “Nhập đề” hoặc thêm thủ công.</div>}
      </div>

      {preview && (
        <div className="card">
          <div className="row spread">
            <h3>Xem trước · {preview.code || `#${preview.id}`}</h3>
            <button className="btn" onClick={() => setPreview(null)}>Đóng</button>
          </div>
          <div className="small muted">{preview.subject_name} · {preview.topic_name || 'chung'} · lớp {preview.grade} · {preview.difficulty}</div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{preview.content}</div>
          {preview.image_url && <img src={preview.image_url} alt="" style={{ maxWidth: 320, borderRadius: 8, marginTop: 8 }} />}
          {preview.qtype === 'trac_nghiem' && (
            <div style={{ marginTop: 10 }}>
              {(() => { try { return JSON.parse(preview.options || '[]') } catch { return [] } })().map((o, i) => (
                <div key={i} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 8, background: 'ABCD'[i] === (preview.correct_answer || '').toUpperCase() ? 'var(--ok-bg)' : 'var(--line-soft)' }}>
                  <b>{'ABCD'[i]}.</b> {o}
                </div>
              ))}
            </div>
          )}
          {preview.explanation && <div className="panel" style={{ marginTop: 10 }}><b>Lời giải:</b> {preview.explanation}</div>}
          {Array.isArray(preview.tags) && preview.tags.length > 0 && (
            <div style={{ marginTop: 8 }}>{preview.tags.map((t) => <span key={t} className="badge blue" style={{ marginRight: 4 }}>{t}</span>)}</div>
          )}
        </div>
      )}
    </div>
  )
}
