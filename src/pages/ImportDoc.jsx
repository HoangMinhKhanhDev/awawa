import { useEffect, useState } from 'react'
import { api } from '../api.js'

// Bước 1: tải DOCX/PDF (text) hoặc dán text -> backend trích xuất
// Bước 2: xem lại / sửa từng câu (bắt buộc theo phạm vi đã chốt)
// Bước 3: lưu vào ngân hàng
export default function ImportDoc() {
  const [subjects, setSubjects] = useState([])
  const [subjectId, setSubjectId] = useState('')
  const [grade, setGrade] = useState(12)
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [drafts, setDrafts] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.subjects().then((s) => { setSubjects(s); if (s[0]) setSubjectId(s[0].id) }).catch(() => {}) }, [])

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setBusy(true)
    try {
      const r = await api.uploadImport(f)
      setRaw(r.text || '')
      setDrafts(r.drafts || [])
    } catch (err) { alert('Không đọc được file: ' + err.message + '\n(Chấp nhận .docx và PDF có lớp text; PDF scan/ảnh để giai đoạn OCR sau.)') }
    setBusy(false)
  }

  const previewText = async () => {
    if (!raw.trim()) return alert('Dán nội dung đề trước.')
    setBusy(true)
    try {
      const r = await api.previewImportText(raw)
      setDrafts(r.drafts || [])
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  const update = (i, patch) => setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)))
  const remove = (i) => setDrafts(drafts.filter((_, k) => k !== i))

  const saveAll = async () => {
    if (!subjectId) return alert('Chọn môn cho bộ đề này.')
    const items = drafts.filter((d) => d.content?.trim()).map((d) => ({
      subject_id: subjectId, topic_id: null, grade: Number(grade) || 12,
      difficulty: d.difficulty || 'vận dụng', qtype: d.qtype || 'trac_nghiem',
      content: d.content, options: d.options || [], correct_answer: d.correct_answer || '', explanation: d.explanation || '', score: 1
    }))
    if (!items.length) return alert('Không có câu hợp lệ để lưu.')
    setBusy(true)
    try {
      const r = await api.bulkQuestions(items)
      alert(`Đã lưu ${r.inserted} câu vào ngân hàng.`)
      setDrafts([]); setRaw('')
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Nhập đề từ DOCX / PDF (text)</h1>
        <div className="small muted">Phạm vi bản đầu: chỉ xử lý file có lớp chữ. PDF scan/ảnh cần OCR — để giai đoạn sau. Mọi câu nhập đều phải qua bước xem lại bên dưới trước khi lưu.</div>
        <div className="grid c3" style={{ marginTop: 10 }}>
          <div><label className="lbl">Môn</label><select className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="lbl">Lớp</label><select className="select" value={grade} onChange={(e) => setGrade(e.target.value)}><option value={10}>10</option><option value={11}>11</option><option value={12}>12</option></select></div>
          <div><label className="lbl">File (.docx / .pdf)</label><input type="file" accept=".docx,.pdf,.txt" onChange={onFile} />{fileName && <div className="small muted">{fileName}</div>}</div>
        </div>
        <label className="lbl">Hoặc dán nội dung đề</label>
        <textarea className="textarea" style={{ minHeight: 140 }} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Câu 1: …&#10;A. …&#10;B. …&#10;Đáp án: A" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy} onClick={previewText}>{busy ? 'Đang xử lý…' : 'Tách câu hỏi để xem lại'}</button>
          {drafts.length > 0 && <button className="btn primary" disabled={busy} onClick={saveAll}>Lưu {drafts.length} câu vào ngân hàng</button>}
        </div>
      </div>

      {drafts.map((d, i) => (
        <div className="card" key={i}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Câu nháp {i + 1}</b>
            <div className="row">
              <select value={d.qtype} onChange={(e) => update(i, { qtype: e.target.value })} className="select" style={{ width: 150 }}>
                <option value="trac_nghiem">Trắc nghiệm</option><option value="tu_luan">Tự luận</option><option value="dung_sai">Đúng/Sai</option>
              </select>
              <button className="btn danger" onClick={() => remove(i)}>Bỏ</button>
            </div>
          </div>
          <label className="lbl">Nội dung</label><textarea className="textarea" value={d.content} onChange={(e) => update(i, { content: e.target.value })} />
          {d.qtype === 'trac_nghiem' && (
            <div className="grid c2" style={{ marginTop: 8 }}>
              {(d.options || ['', '', '', '']).map((o, k) => (
                <input key={k} className="input" placeholder={`Phương án ${'ABCD'[k]}`} value={o} onChange={(e) => { const c = [...(d.options || ['', '', '', ''])]; c[k] = e.target.value; update(i, { options: c }) }} />
              ))}
            </div>
          )}
          <div className="grid c2" style={{ marginTop: 8 }}>
            <div><label className="lbl">Đáp án</label><input className="input" value={d.correct_answer || ''} onChange={(e) => update(i, { correct_answer: e.target.value })} /></div>
            <div><label className="lbl">Độ khó</label><select className="select" value={d.difficulty || 'vận dụng'} onChange={(e) => update(i, { difficulty: e.target.value })}><option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option></select></div>
          </div>
          <label className="lbl">Lời giải (nếu có)</label><textarea className="textarea" value={d.explanation || ''} onChange={(e) => update(i, { explanation: e.target.value })} />
        </div>
      ))}
    </div>
  )
}
