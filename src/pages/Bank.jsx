import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Bank() {
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [f, setF] = useState({ subject_id: '', topic_id: '', grade: '', difficulty: '', qtype: '', search: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ subject_id: '', topic_id: '', grade: 12, difficulty: 'vận dụng', qtype: 'trac_nghiem', content: '', options: ['', '', '', ''], correct_answer: '', explanation: '', score: 1, image_url: '' })
  const [newTopic, setNewTopic] = useState('')

  const loadSubjects = async () => setSubjects(await api.subjects().catch(() => []))
  const loadTopics = async (sid) => setTopics(await api.topics(sid || undefined).catch(() => []))
  const load = async () => {
    setLoading(true)
    try { setRows(await api.questions({ ...f, limit: 200 })) } catch (e) { alert(e.message) }
    setLoading(false)
  }

  useEffect(() => { loadSubjects(); loadTopics(''); load() }, [])
  useEffect(() => { loadTopics(f.subject_id) }, [f.subject_id])

  const openNew = () => {
    setEditing('new')
    setForm({ subject_id: subjects[0]?.id || '', topic_id: '', grade: 12, difficulty: 'vận dụng', qtype: 'trac_nghiem', content: '', options: ['', '', '', ''], correct_answer: '', explanation: '', score: 1, image_url: '' })
  }
  const openEdit = (q) => {
    setEditing(q.id)
    let opts = ['', '', '', '']
    try { const p = JSON.parse(q.options || '[]'); if (Array.isArray(p) && p.length) opts = [...p, '', '', '', ''].slice(0, 4) } catch {}
    setForm({ subject_id: q.subject_id, topic_id: q.topic_id || '', grade: q.grade || 12, difficulty: q.difficulty || 'vận dụng', qtype: q.qtype || 'trac_nghiem', content: q.content || '', options: opts, correct_answer: q.correct_answer || '', explanation: q.explanation || '', score: q.score || 1, image_url: q.image_url || '' })
  }
  const createTopicInline = async () => {
    if (!form.subject_id) return alert('Chọn môn trước')
    if (!newTopic.trim()) return alert('Nhập tên chuyên đề mới')
    try {
      const r = await api.createTopic({ subject_id: form.subject_id, name: newTopic.trim(), grade: Number(form.grade) || 12 })
      await loadTopics(form.subject_id)
      setForm({ ...form, topic_id: r.id })
      setNewTopic('')
    } catch (e) { alert(e.message) }
  }
  const save = async () => {
    if (!form.subject_id) return alert('Chọn môn')
    if (!form.content.trim()) return alert('Nhập nội dung câu hỏi')
    const payload = { ...form, topic_id: form.topic_id || null, options: form.qtype === 'trac_nghiem' ? form.options : [] }
    try {
      if (editing === 'new') await api.createQuestion(payload)
      else await api.updateQuestion(editing, payload)
      setEditing(null); load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Ngân hàng câu hỏi</h1>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 8 }}>
          <select className="select" value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })}><option value="">Tất cả môn</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="select" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })}><option value="">Tất cả chuyên đề</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="select" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}><option value="">Mọi lớp</option><option value="10">Lớp 10</option><option value="11">Lớp 11</option><option value="12">Lớp 12</option></select>
          <select className="select" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="">Mọi độ khó</option><option value="nhận biết">Nhận biết</option><option value="thông hiểu">Thông hiểu</option><option value="vận dụng">Vận dụng</option><option value="vận dụng cao">Vận dụng cao</option></select>
          <select className="select" value={f.qtype} onChange={(e) => setF({ ...f, qtype: e.target.value })}><option value="">Mọi loại</option><option value="trac_nghiem">Trắc nghiệm</option><option value="tu_luan">Tự luận</option><option value="dung_sai">Đúng/Sai</option></select>
          <input className="input" placeholder="Tìm nội dung…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={load} disabled={loading}>{loading ? 'Đang tải…' : 'Lọc'}</button>
          <button className="btn" onClick={openNew}>+ Thêm câu hỏi</button>
          <span className="muted small">{rows.length} câu</span>
        </div>
      </div>

      {editing && (
        <div className="card">
          <h3>{editing === 'new' ? 'Thêm câu hỏi' : `Sửa câu #${editing}`}</h3>
          <div className="grid c2">
            <div>
              <label className="lbl">Môn</label>
              <select className="select" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <label className="lbl">Chuyên đề</label>
              <select className="select" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}><option value="">—</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <div className="row" style={{ marginTop: 6 }}>
                <input className="input" style={{ flex: 1 }} placeholder="Thêm chuyên đề mới…" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
                <button className="btn" onClick={createTopicInline}>+ Chuyên đề</button>
              </div>
              <div className="grid c3" style={{ marginTop: 8 }}>
                <div><label className="lbl">Lớp</label><select className="select" value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}><option value={10}>10</option><option value={11}>11</option><option value={12}>12</option></select></div>
                <div><label className="lbl">Độ khó</label><select className="select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option></select></div>
                <div><label className="lbl">Loại</label><select className="select" value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}><option value="trac_nghiem">Trắc nghiệm</option><option value="tu_luan">Tự luận</option><option value="dung_sai">Đúng/Sai</option></select></div>
              </div>
            </div>
            <div>
              <label className="lbl">Nội dung</label><textarea className="textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <label className="lbl">Ảnh minh họa (URL, tùy chọn — rất hữu ích cho Công nghệ: sơ đồ, cây/con, bệnh…)</label>
              <input className="input" placeholder="https://… hoặc /uploads/… (để trống nếu không có)" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              {form.image_url && <img src={form.image_url} alt="minh họa" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 6 }} onError={(e) => { e.currentTarget.style.display = 'none' }} />}
              {api.uploadQuestionImage && (
                <div className="row" style={{ marginTop: 6 }}>
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (!api.uploadQuestionImage) return alert('Chế độ LAN chưa hỗ trợ upload ảnh lên server — hãy dán link ảnh.')
                    try {
                      const url = await api.uploadQuestionImage(f)
                      setForm((prev) => ({ ...prev, image_url: url }))
                    } catch (err) { alert('Upload ảnh lỗi: ' + err.message) }
                    e.target.value = ''
                  }} />
                  <span className="small muted">Tải ảnh lên server thay vì dán link</span>
                </div>
              )}
              {form.qtype === 'trac_nghiem' && (<>
                <label className="lbl">Các phương án (A–D)</label>
                {form.options.map((o, i) => <input key={i} className="input" style={{ marginBottom: 6 }} placeholder={`Phương án ${'ABCD'[i]}`} value={o} onChange={(e) => { const c = [...form.options]; c[i] = e.target.value; setForm({ ...form, options: c }) }} />)}
                <label className="lbl">Đáp án đúng (A/B/C/D)</label><input className="input" value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value.toUpperCase() })} />
              </>)}
              {form.qtype !== 'trac_nghiem' && (<><label className="lbl">Đáp án / hướng chấm tham khảo</label><textarea className="textarea" value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value })} /></>)}
              <label className="lbl">Lời giải chi tiết</label><textarea className="textarea" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={save}>Lưu</button>
            <button className="btn" onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </div>
      )}

      <div className="card">
        <table className="tbl"><thead><tr><th style={{ width: 46 }}>ID</th><th>Câu hỏi</th><th style={{ width: 220 }}>Phân loại</th><th style={{ width: 130 }}></th></tr></thead>
          <tbody>{rows.map((q) => (
            <tr key={q.id}>
              <td>#{q.id}</td>
              <td><div style={{ whiteSpace: 'pre-wrap' }}>{q.content}</div>{q.image_url && <div style={{ marginTop: 6 }}><img src={q.image_url} alt="" style={{ maxWidth: 220, borderRadius: 6 }} loading="lazy" /></div>}<div className="small muted" style={{ marginTop: 4 }}>ĐA: {q.correct_answer || '—'}</div></td>
              <td><span className="badge">{q.subject_name}</span><span className="badge">{q.topic_name || 'chung'}</span><div className="small muted" style={{ marginTop: 4 }}>Lớp {q.grade} • {q.difficulty} • {q.qtype}</div></td>
              <td><div className="row"><button className="btn" onClick={() => openEdit(q)}>Sửa</button><button className="btn danger" onClick={async () => { if (confirm(`Xóa câu #${q.id}?`)) { await api.deleteQuestion(q.id); load() } }}>Xóa</button></div></td>
            </tr>
          ))}</tbody></table>
        {rows.length === 0 && !loading && <div className="muted small" style={{ marginTop: 8 }}>Chưa có câu hỏi phù hợp. Hãy nhập đề ở mục “Nhập đề” hoặc thêm thủ công.</div>}
      </div>
    </div>
  )
}
