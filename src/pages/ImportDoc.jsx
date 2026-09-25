import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { IconFileUp, IconPlus, IconUpload } from '../components/icons.jsx'
import { filterSubjects } from '../lib/subjects.js'

export default function ImportDoc() {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [subjectId, setSubjectId] = useState('')
  const [grade, setGrade] = useState(12)
  const [raw, setRaw] = useState('')
  const [fileName, setFileName] = useState('')
  const [drafts, setDrafts] = useState([])
  const [busy, setBusy] = useState(false)
  const [savedN, setSavedN] = useState(0)

  useEffect(() => { api.subjects().then((all) => { const s = filterSubjects(all); setSubjects(s); if (s[0]) setSubjectId(s[0].id) }).catch(() => {}) }, [])

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setBusy(true)
    try {
      const r = await api.uploadImport(f)
      setRaw(r.text || '')
      setDrafts(r.drafts || [])
      toast(`Đã đọc ${(r.drafts || []).length} câu nháp.`)
    } catch (err) {
      toast('Không đọc được file: ' + errMsg(err) + ' (Chấp nhận .docx và PDF có lớp text.)', 'err')
    }
    setBusy(false)
    e.target.value = '' // cho phép chọn lại cùng file
  }

  const previewText = async () => {
    if (busy) return
    if (!raw.trim()) { toast('Dán nội dung đề trước.', 'warn'); return }
    setBusy(true)
    try {
      const r = await api.previewImportText(raw)
      setDrafts(r.drafts || [])
      toast(`Tách được ${(r.drafts || []).length} câu.`)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const update = (i, patch) => setDrafts(drafts.map((d, k) => (k === i ? { ...d, ...patch } : d)))
  const remove = (i) => setDrafts(drafts.filter((_, k) => k !== i))

  const saveAll = async () => {
    if (busy) return
    if (!subjectId) { toast('Chọn môn cho bộ đề này.', 'warn'); return }
    const items = drafts.filter((d) => d.content?.trim()).map((d) => ({
      subject_id: subjectId, topic_id: null, grade: Number(grade) || 12,
      difficulty: d.difficulty || 'vận dụng', qtype: d.qtype || 'trac_nghiem',
      content: d.content, options: d.options || [],
      correct_answer: d.qtype === 'trac_nghiem' ? (d.correct_answer || '').trim().toUpperCase() : (d.correct_answer || ''),
      explanation: d.explanation || '', score: 1
    }))
    if (!items.length) { toast('Không có câu hợp lệ để lưu.', 'warn'); return }
    setBusy(true)
    try {
      const r = await api.bulkQuestions(items)
      setSavedN(r.inserted || 0)
      toast(`Đã lưu ${r.inserted} câu vào ngân hàng.`)
      setDrafts([]); setRaw('')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconFileUp className="icn" />Nhập đề từ DOCX / PDF (text)</h1>
        <div className="small muted">Phạm vi bản đầu: chỉ xử lý file có lớp chữ. PDF scan/ảnh cần OCR — để giai đoạn sau. Mọi câu nhập đều phải qua bước xem lại bên dưới trước khi lưu.</div>
        <div className="grid c3" style={{ marginTop: 10 }}>
          <div><label className="lbl" htmlFor="im-subject">Môn</label><select className="select" id="im-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="lbl" htmlFor="im-grade">Lớp</label><select className="select" id="im-grade" value={grade} onChange={(e) => setGrade(e.target.value)}><option value={10}>10</option><option value={11}>11</option><option value={12}>12</option></select></div>
          <div><label className="lbl" htmlFor="im-file">File (.docx / .pdf)</label><input type="file" id="im-file" accept=".docx,.pdf,.txt" onChange={onFile} />{fileName && <div className="small muted">{fileName}</div>}</div>
        </div>
        <label className="lbl" htmlFor="im-raw">Hoặc dán nội dung đề</label>
        <textarea className="textarea" id="im-raw" style={{ minHeight: 140 }} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Câu 1: …&#10;A. …&#10;B. …&#10;Đáp án: A" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={busy} onClick={previewText}><IconUpload className="icn sm" />{busy ? 'Đang xử lý…' : 'Tách câu hỏi để xem lại'}</button>
          {drafts.length > 0 && <button className="btn" disabled={busy} onClick={saveAll}><IconPlus className="icn sm" />Lưu {drafts.length} câu vào ngân hàng</button>}
          {savedN > 0 && (
            <Link className="btn" to="/manage/studio">Đã lưu {savedN} câu → mở Studio tạo đề / bài tập →</Link>
          )}
        </div>
      </div>

      {drafts.map((d, i) => (
        <div className="card" key={`${i}-${(d.content || '').slice(0, 20)}`}>
          <div className="row spread">
            <b>Câu nháp {i + 1}</b>
            <div className="row">
              <select value={d.qtype} onChange={(e) => update(i, { qtype: e.target.value })} className="select" style={{ width: 150 }} aria-label={`Loại câu ${i + 1}`}>
                <option value="trac_nghiem">Trắc nghiệm</option><option value="tu_luan">Tự luận</option><option value="dung_sai">Đúng/Sai</option>
              </select>
              <button className="btn danger sm" onClick={() => remove(i)}>Bỏ</button>
            </div>
          </div>
          <label className="lbl" htmlFor={`id-c-${i}`}>Nội dung</label>
          <textarea className="textarea" id={`id-c-${i}`} value={d.content} onChange={(e) => update(i, { content: e.target.value })} />
          {d.qtype === 'trac_nghiem' && (
            <div className="grid c2" style={{ marginTop: 8 }}>
              {(d.options || ['', '', '', '']).map((o, k) => (
                <input key={k} className="input" placeholder={`Phương án ${'ABCD'[k]}`} value={o} aria-label={`Phương án ${'ABCD'[k]} câu ${i + 1}`} onChange={(e) => { const c = [...(d.options || ['', '', '', ''])]; c[k] = e.target.value; update(i, { options: c }) }} />
              ))}
            </div>
          )}
          <div className="grid c2" style={{ marginTop: 8 }}>
            <div><label className="lbl" htmlFor={`id-a-${i}`}>Đáp án</label><input className="input" id={`id-a-${i}`} value={d.correct_answer || ''} onChange={(e) => update(i, { correct_answer: e.target.value })} /></div>
            <div><label className="lbl" htmlFor={`id-d-${i}`}>Độ khó</label><select className="select" id={`id-d-${i}`} value={d.difficulty || 'vận dụng'} onChange={(e) => update(i, { difficulty: e.target.value })}><option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option></select></div>
          </div>
          <label className="lbl" htmlFor={`id-e-${i}`}>Lời giải (nếu có)</label><textarea className="textarea" id={`id-e-${i}`} value={d.explanation || ''} onChange={(e) => update(i, { explanation: e.target.value })} />
        </div>
      ))}
    </div>
  )
}
