import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  IconBook, IconTask, IconFileUp, IconLayers, IconChecks,
  IconTimer, IconUpload, IconWand, IconPlus, IconX,
  IconPlay, IconTrophy, IconCheckCircle, IconFile,
} from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { parseTextToDrafts } from '../lib/parseImport.js'
import { useUI } from '../components/ui.jsx'
import { isStaffRole } from '../lib/roles.js'
import { filterSubjects } from '../lib/subjects.js'
import ExamPaper from '../components/ExamPaper.jsx'

const optsOf = (q) => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }

const TABS = [
  { id: 'pipeline', label: 'AI + DOCX' },
  { id: 'ai', label: 'Sinh nội dung' },
  { id: 'import', label: 'Nhập tay' },
  { id: 'lesson', label: 'Bài học' },
  { id: 'exam', label: 'Đề thi' },
  { id: 'assign', label: 'Giao bài' },
]

export default function Studio() {
  const rawRole = getSession().student?.role || 'student'
  const isStaff = isStaffRole(rawRole)
  const [step, setStep] = useState('ai')
  const nav = useNavigate()
  const loc = useLocation()
  const initialSubject = new URLSearchParams(loc.search).get('subject') || ''

  if (!isStaff) {
    return (
      <div className="studio-page">
        <div className="studio-empty">
          <h1>Chỉ giáo viên và quản trị soạn ở đây.</h1>
          <p>Đăng nhập tài khoản được cấp quyền ở tab Cá nhân.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="studio-page">
      <header className="studio-head">
        <div className="studio-title">
          <h1>Soạn bài</h1>
          <p>Sinh bằng AI rồi duyệt, hoặc nhập tay. Chạy song song được — không theo thứ tự bắt buộc.</p>
        </div>
        <nav className="segment" aria-label="Chức năng soạn">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={step === t.id}
              className={step === t.id ? 'on' : ''} onClick={() => setStep(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {step === 'pipeline' && <StepPipeline initialSubject={initialSubject} />}
      {step === 'ai' && <StepAI goTab={setStep} initialSubject={initialSubject} />}
      {step === 'import' && <StepImport onNext={() => setStep('lesson')} />}
      {step === 'lesson' && <StepLesson onNext={() => setStep('exam')} />}
      {step === 'exam' && <StepExam onNext={() => setStep('assign')} />}
      {step === 'assign' && <StepAssign nav={nav} />}

      <footer className="studio-foot">
        <Link className="btn" to="/manage/bank"><IconChecks className="icn sm" />Ngân hàng câu hỏi</Link>
        <Link className="btn" to="/manage/import"><IconUpload className="icn sm" />Nhập DOCX / PDF</Link>
      </footer>
    </div>
  )
}

/* ---------- Sinh nội dung (stream) ---------- */
const AI_TYPES = [
  { id: 'questions', label: 'Câu hỏi', hint: 'lưu vào ngân hàng' },
  { id: 'cloze', label: 'Điền từ', hint: 'câu có ô trống' },
  { id: 'lesson', label: 'Bài học', hint: 'lý thuyết' },
  { id: 'exam', label: 'Đề thi', hint: 'công bố cho lớp' },
  { id: 'flashcards', label: 'Thẻ nhớ', hint: 'lật trước / sau' },
]
const AI_MODELS = [
  { id: 'agnes-2.5-flash', label: 'Sâu (2.5)' },
  { id: 'agnes-2.0-flash', label: 'Cân bằng (2.0)' },
  { id: 'agnes-1.5-flash', label: 'Nhanh (1.5)' },
]

function StepAI({ goTab, initialSubject = '' }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [form, setForm] = useState({
    type: 'questions', model: 'agnes-2.5-flash',
    subject: '', subject_id: '', topic: '', topic_id: '',
    count: 5, difficulty: 'vận dụng', qtype: 'trac_nghiem', prompt: '',
  })
  // phase: idle | streaming | done | error
  const [phase, setPhase] = useState('idle')
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewMeta, setPreviewMeta] = useState(null)
  const [saving, setSaving] = useState(false)
  const abortRef = useRef(null)
  const rawRef = useRef('')

  useEffect(() => {
    api.subjects().then((rows) => {
      const kept = filterSubjects(rows)
      setSubjects(kept)
      const chosen = kept.find((s) => s.id === initialSubject) || kept[0]
      if (chosen) pickSubject(chosen.id)
    }).catch(() => {})
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubject])

  const pickSubject = async (sid) => {
    const s = subjects.find((x) => x.id === sid)
    setForm((f) => ({ ...f, subject_id: sid, topic_id: '', subject: s?.name || '' }))
    if (sid) api.topics(sid).then(setTopics).catch(() => setTopics([]))
    else setTopics([])
  }

  const pickTopic = (tid) => {
    const t = topics.find((x) => x.id === tid)
    setForm((f) => ({ ...f, topic_id: tid, topic: t?.name || f.topic }))
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const generate = async () => {
    if (!form.topic.trim() && !form.prompt.trim()) {
      return toast('Gõ chủ đề trước, rồi bấm Soạn.', 'warn')
    }
    setPreview(null); setPreviewMeta(null)
    setRaw(''); rawRef.current = ''
    setPhase('streaming')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let gotResult = false
    let gotError = false
    try {
      await api.aiGenerateStream({
        type: form.type, model: form.model,
        topic: form.topic, subject: form.subject,
        count: Number(form.count) || 5,
        difficulty: form.difficulty, qtype: form.qtype,
        prompt: form.prompt,
      }, ({ event, data }) => {
        if (event === 'delta') {
          rawRef.current += data.text || ''
          setRaw(rawRef.current)
        } else if (event === 'result') {
          gotResult = true
          setPreview(data.data)
          setPreviewMeta({ model: data.model, type: data.type })
          setPhase('done')
          toast('Xong — xem bên phải rồi bấm Lưu.')
        } else if (event === 'error') {
          gotError = true
          setPhase('error')
          toast(data.message || 'AI gặp lỗi.', 'err')
        }
      }, ctrl.signal)
      if (!gotResult && !gotError) {
        setPhase('error')
        toast('Kết nối ngắt trước khi AI xong. Bấm Soạn lại.', 'err')
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        setPhase('idle')
        toast('Đã dừng.')
      } else {
        setPhase('error')
        toast(errMsg(e), 'err')
      }
    }
  }

  // ---------- SAVE ----------
  const bankFrom = (qtype) => (preview?.questions || []).map((q) => ({
    subject_id: form.subject_id, topic_id: form.topic_id || null,
    grade: 12, difficulty: form.difficulty, qtype: q.qtype || qtype,
    content: q.content, options: q.options || [],
    correct_answer: q.correct_answer || '', explanation: q.explanation || '',
    score: 1, source: 'ai',
  })).filter((q) => q.content && q.subject_id)

  const saveQuestions = async (qt) => {
    const qs = bankFrom(qt)
    if (!qs.length) return toast('Cần chọn môn và câu hỏi hợp lệ.', 'warn')
    setSaving(true)
    try {
      const r = await api.bulkQuestions(qs)
      toast(`Đã lưu ${r.inserted ?? qs.length} câu vào ngân hàng.`)
      setPreview(null); setPhase('idle'); setRaw(''); goTab('import')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveLesson = async () => {
    if (!form.topic_id) return toast('Chọn chuyên đề để gắn bài học.', 'warn')
    if (!preview?.content && !preview?.title) return toast('Chưa có nội dung.', 'warn')
    setSaving(true)
    try {
      await api.createLesson({ topic_id: form.topic_id, title: preview.title || form.topic, content: preview.content || '' })
      toast('Đã lưu bài học.')
      setPreview(null); setPhase('idle'); goTab('lesson')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveFlashcards = async () => {
    if (!form.topic_id) return toast('Chọn chuyên đề để gắn thẻ nhớ.', 'warn')
    const cards = (preview?.cards || []).filter((c) => c.front)
    if (!cards.length) return toast('Không có thẻ hợp lệ.', 'warn')
    setSaving(true)
    try {
      const r = await api.createFlashcards({ topic_id: form.topic_id, cards })
      toast(`Đã lưu ${r.inserted} thẻ.`)
      setPreview(null); setPhase('idle')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveExam = async () => {
    if (!form.subject_id) return toast('Chọn môn.', 'warn')
    const qs = bankFrom(null).map((q) => {
      const type = q.qtype === 'dung_sai' ? 'dung_sai' : 'trac_nghiem'
      const options = type === 'dung_sai'
        ? (Array.isArray(q.options) && q.options.length ? q.options : ['Đúng', 'Sai'])
        : (q.options || [])
      return { ...q, qtype: type, options }
    })
    if (!qs.length) return toast('Không có câu hỏi.', 'warn')
    setSaving(true)
    try {
      const ids = []
      for (const q of qs) {
        const r = await api.createQuestion(q)
        if (r?.id) ids.push(r.id)
      }
      await api.createExam({
        title: preview?.title || `Đề ${form.topic}`, mode: 'shared',
        duration_min: 45, question_ids: ids,
      })
      toast(`Đã công bố đề ${ids.length} câu.`)
      setPreview(null); setPhase('idle'); goTab('exam')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const t = form.type
  const streaming = phase === 'streaming'
  const hasSubjects = subjects.length > 0
  const statusText =
    phase === 'streaming' ? 'đang viết…' :
    phase === 'done' ? 'đã xong' :
    phase === 'error' ? 'dừng vì lỗi' : ''

  return (
    <div className="workbench">
      {/* ——— cột trái: bảng nhập ——— */}
      <div className="bench-form">
        <fieldset className="bench-fieldset">
          <legend>Loại nội dung</legend>
          <div className="kind-row" role="radiogroup" aria-label="Loại nội dung">
            {AI_TYPES.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={t === x.id}
                className={`kind${t === x.id ? ' on' : ''}`}
                onClick={() => { setForm({ ...form, type: x.id }); setPreview(null) }}>
                <span className="kind-name">{x.label}</span>
                <span className="kind-hint">{x.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="bench-fieldset">
          <legend>Gắn vào</legend>
          <div className="bench-row3">
            <label className="bench-label">
              <span>Môn</span>
              <select className="select" value={form.subject_id} onChange={(e) => pickSubject(e.target.value)}>
                <option value="">chọn…</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="bench-label">
              <span>Chuyên đề</span>
              <select className="select" value={form.topic_id} onChange={(e) => pickTopic(e.target.value)}>
                <option value="">—</option>
                {topics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="bench-label">
              <span>Số</span>
              <input className="input" type="number" min="1" max="30" value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })} />
            </label>
          </div>
        </fieldset>

        <fieldset className="bench-fieldset">
          <legend>Đề bài</legend>
          <input className="input bench-topic" value={form.topic}
            placeholder="Dao động điều hòa, họ Ankyl, bảo vệ rừng…"
            onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <div className="bench-row2">
            {(t === 'questions' || t === 'exam') && (
              <label className="bench-label">
                <span>Độ khó</span>
                <select className="select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                  <option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option>
                </select>
              </label>
            )}
            {t === 'questions' && (
              <label className="bench-label">
                <span>Dạng câu</span>
                <select className="select" value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
                  <option value="trac_nghiem">Trắc nghiệm</option>
                  <option value="tu_luan">Tự luận</option>
                  <option value="diem_khuyet">Điền từ</option>
                </select>
              </label>
            )}
            <label className="bench-label">
              <span>Mô hình</span>
              <select className="select" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
          <label className="bench-label" style={{ marginTop: 10 }}>
            <span>Yêu cầu thêm (không bắt buộc)</span>
            <textarea className="textarea" style={{ minHeight: 56 }}
              placeholder="VD: ưu tiên ví dụ nông nghiệp, 4 phương án…"
              value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
          </label>
        </fieldset>

        <div className="bench-actions">
          {!streaming ? (
            <button className="btn primary bench-go" onClick={generate} disabled={!hasSubjects}>
              <IconWand className="icn sm" />Soạn
            </button>
          ) : (
            <button className="btn danger bench-go" onClick={stop}>
              <IconX className="icn sm" />Dừng
            </button>
          )}
          {!hasSubjects && <span className="bench-note">Chưa có môn học trong hệ thống.</span>}
        </div>
      </div>

      {/* ——— cột phải: khung soạn (stream + duyệt) ——— */}
      <div className="bench-canvas" aria-live="polite">
        <div className="canvas-bar">
          <span className={`canvas-dot${streaming ? ' live' : phase === 'done' ? ' ok' : phase === 'error' ? ' bad' : ''}`} />
          <span className="canvas-status">
            {statusText || 'khung soạn'}
          </span>
          {streaming && <span className="canvas-meta">{raw.length.toLocaleString('vi-VN')} ký tự</span>}
          {previewMeta && phase === 'done' && <span className="canvas-meta">{previewMeta.model}</span>}
        </div>

        {phase === 'idle' && !preview && (
          <div className="canvas-empty">
            Chưa có bản nháp.<br />
            Chọn loại bên trái, gõ đề bài, bấm <b>Soạn</b>.
          </div>
        )}

        {(streaming || (phase !== 'done' && raw)) && !preview && (
          <pre className="canvas-draft">{raw}{streaming && <span className="caret" aria-hidden="true" />}</pre>
        )}

        {phase === 'error' && !preview && raw && (
          <pre className="canvas-draft muted">{raw}</pre>
        )}

        {preview && (
          <div className="canvas-result">
            <div className="result-head">
              <h3>Duyệt trước khi lưu</h3>
              <div className="row">
                <button className="btn" onClick={() => { setPreview(null); setPhase('idle'); generate() }} disabled={streaming}>Soạn lại</button>
                <button className="btn" onClick={() => { setPreview(null); setPhase('idle'); setRaw(''); rawRef.current = '' }}>Bỏ</button>
              </div>
            </div>

            {preview.cards && (
              <div className="result-body">
                {preview.cards.filter((c) => c.front).map((c, i) => (
                  <div key={i} className="flip-row">
                    <span className="flip-n">{i + 1}</span>
                    <div>
                      <div className="flip-front">{c.front}</div>
                      <div className="flip-back">{c.back}</div>
                    </div>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={saveFlashcards} disabled={saving}>
                    {saving ? 'Đang lưu…' : `Lưu ${preview.cards.length} thẻ`}
                  </button>
                </div>
              </div>
            )}

            {preview.content && !preview.questions && !preview.cards && (
              <div className="result-body">
                <b className="lesson-title">{preview.title || form.topic}</b>
                <div className="lesson-body">{preview.content}</div>
                <div className="row" style={{ marginTop: 14 }}>
                  <button className="btn primary" onClick={saveLesson} disabled={saving}>
                    {saving ? 'Đang lưu…' : 'Lưu bài học'}
                  </button>
                </div>
              </div>
            )}

            {(preview.questions || preview.title) && !preview.cards && !preview.content && (
              <div className="result-body">
                {preview.title && <div className="exam-title">{preview.title}</div>}
                <table className="tbl result-tbl">
                  <thead><tr><th style={{ width: 36 }}>#</th><th>Câu hỏi</th><th style={{ width: '32%' }}>Đáp án</th></tr></thead>
                  <tbody>
                    {(preview.questions || []).map((q, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{q.content}</td>
                        <td className="small">
                          {q.options?.length
                            ? <>{q.options.join(' · ')}{q.correct_answer ? <> → <b>{q.correct_answer}</b></> : null}</>
                            : <b>{q.correct_answer}</b>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row" style={{ marginTop: 14 }}>
                  {t === 'exam' ? (
                    <button className="btn primary" onClick={saveExam} disabled={saving}>
                      {saving ? 'Đang lưu…' : 'Công bố đề'}
                    </button>
                  ) : t === 'cloze' || form.qtype === 'diem_khuyet' ? (
                    <button className="btn primary" onClick={() => saveQuestions('diem_khuyet')} disabled={saving}>
                      {saving ? 'Đang lưu…' : 'Lưu câu điền từ'}
                    </button>
                  ) : (
                    <button className="btn primary" onClick={() => saveQuestions(form.qtype)} disabled={saving}>
                      {saving ? 'Đang lưu…' : `Lưu ${(preview.questions || []).length} câu`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {!preview.cards && !preview.questions && !preview.content && !preview.title && (
              <pre className="canvas-draft">{JSON.stringify(preview, null, 2).slice(0, 2400)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Bước 1: nhập / thêm câu nhanh ---------- */
function StepImport({ onNext }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [form, setForm] = useState({ subject_id: '', topic_id: '', content: '', options: ['', '', '', ''], correct_answer: '', explanation: '', difficulty: 'vận dụng', qtype: 'trac_nghiem', grade: 12 })
  const [topics, setTopics] = useState([])
  const [saved, setSaved] = useState(0)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.subjects().then((all) => { const s = filterSubjects(all); setSubjects(s); if (s[0]) setForm((f) => ({ ...f, subject_id: f.subject_id || s[0].id })) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (form.subject_id) api.topics(form.subject_id).then(setTopics).catch(() => setTopics([]))
    else setTopics([])
  }, [form.subject_id])

  const saveOne = async () => {
    if (busy) return
    if (!form.subject_id || !form.content.trim()) return toast('Chọn môn và nhập nội dung.', 'warn')
    if (form.qtype === 'trac_nghiem') {
      const ans = (form.correct_answer || '').trim().toUpperCase()
      if (!'ABCD'.includes(ans)) return toast('Trắc nghiệm cần đáp án A/B/C/D.', 'warn')
      if (form.options.filter((o) => o.trim()).length < 2) return toast('Cần ít nhất 2 phương án.', 'warn')
    }
    setBusy(true)
    try {
      await api.createQuestion({
        ...form,
        topic_id: form.topic_id || null,
        options: form.qtype === 'trac_nghiem' ? form.options : [],
        correct_answer: form.qtype === 'trac_nghiem' ? (form.correct_answer || '').trim().toUpperCase() : form.correct_answer,
        score: 1,
      })
      setSaved((n) => n + 1)
      setForm((f) => ({ ...f, content: '', options: ['', '', '', ''], correct_answer: '', explanation: '' }))
      toast('Đã lưu 1 câu vào ngân hàng.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const saveBulk = async () => {
    if (busy) return
    if (!form.subject_id || !bulk.trim()) return toast('Dán câu hỏi trước.', 'warn')
    setBusy(true)
    try {
      const drafts = parseTextToDrafts(bulk)
      if (!drafts.length) { toast('Không tách được câu — dùng định dạng “Câu 1: … A. … Đáp án: A”.', 'warn'); setBusy(false); return }
      const items = drafts
        .filter((d) => {
          if (d.qtype === 'tu_luan') return !!d.content?.trim()
          const a = (d.correct_answer || '').trim().toUpperCase()
          return !!d.content?.trim() && 'ABCD'.includes(a) && (d.options || []).filter(Boolean).length >= 2
        })
        .map((d) => ({
          subject_id: form.subject_id, topic_id: form.topic_id || null,
          grade: Number(form.grade) || 12, difficulty: d.difficulty || 'vận dụng',
          qtype: d.qtype || 'trac_nghiem', content: d.content,
          options: d.options || [], correct_answer: (d.correct_answer || '').trim().toUpperCase(),
          explanation: d.explanation || '', score: 1,
        }))
      if (!items.length) { toast('Không có câu hợp lệ (TN cần đáp án A–D).', 'warn'); setBusy(false); return }
      const r = await api.bulkQuestions(items)
      setSaved((n) => n + (r.inserted || 0))
      setBulk('')
      toast(`Đã lưu ${r.inserted} câu.`)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  return (
    <>
      <div className="card">
        <h3 className="icon-h"><IconFile className="icn" />Bước 1 — Nạp câu hỏi vào ngân hàng</h3>
        <div className="small muted">Nhập từng câu, hoặc dán nhiều câu 1 lần (định dạng Câu 1 / A. / Đáp án). File DOCX/PDF: dùng <Link to="/manage/import">Nhập đề</Link>.</div>
        <div className="grid c3" style={{ marginTop: 10 }}>
          <div>
            <label className="lbl" htmlFor="si-subject">Môn *</label>
            <select className="select" id="si-subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value, topic_id: '' })}>
              <option value="">— Chọn —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="si-topic">Chuyên đề</label>
            <select className="select" id="si-topic" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
              <option value="">— Chung —</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="si-grade">Lớp</label>
            <select className="select" id="si-grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}>
              <option value={10}>10</option><option value={11}>11</option><option value={12}>12</option>
            </select>
          </div>
        </div>

        <label className="lbl" htmlFor="si-content">Nội dung câu *</label>
        <textarea className="textarea" id="si-content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="VD: Một con lắc đơn có chu kỳ T. Tần số góc ω bằng?" />

        {form.qtype === 'trac_nghiem' && (
          <>
            <label className="lbl">Phương án A–D</label>
            {form.options.map((o, i) => (
              <input key={i} className="input" style={{ marginBottom: 6 }} placeholder={`Phương án ${'ABCD'[i]}`} value={o}
                onChange={(e) => { const c = [...form.options]; c[i] = e.target.value; setForm({ ...form, options: c }) }} />
            ))}
            <label className="lbl" htmlFor="si-answer">Đáp án (A/B/C/D) *</label>
            <input className="input" id="si-answer" style={{ maxWidth: 100 }} value={form.correct_answer}
              onChange={(e) => setForm({ ...form, correct_answer: e.target.value.toUpperCase().slice(0, 1) })} />
          </>
        )}
        <div className="grid c3" style={{ marginTop: 6 }}>
          <div>
            <label className="lbl" htmlFor="si-diff">Độ khó</label>
            <select className="select" id="si-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="si-type">Loại</label>
            <select className="select" id="si-type" value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
              <option value="trac_nghiem">Trắc nghiệm</option>
              <option value="tu_luan">Tự luận</option>
              <option value="dung_sai">Đúng/Sai</option>
            </select>
          </div>
        </div>
        <label className="lbl" htmlFor="si-exp">Lời giải (tùy chọn)</label>
        <textarea className="textarea" id="si-exp" style={{ minHeight: 60 }} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={saveOne} disabled={busy}><IconPlus className="icn sm" />{busy ? 'Đang lưu…' : 'Lưu 1 câu'}</button>
          {saved > 0 && (
            <button className="btn" onClick={onNext}>
              Tiếp bước 2 — Bài học <span className="badge green" style={{ marginLeft: 6 }}>{saved} câu</span>
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Dán nhiều câu 1 lần</h3>
        <div className="small muted">Mỗi câu cách nhau dòng trống hoặc đánh số “Câu n:”.</div>
        <textarea className="textarea" style={{ minHeight: 120, marginTop: 8 }} value={bulk} onChange={(e) => setBulk(e.target.value)}
          placeholder={'Câu 1: …\nA. …\nB. …\nC. …\nD. …\nĐáp án: A\n\nCâu 2: …\nĐáp án: B'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={saveBulk} disabled={!bulk.trim() || busy}>Tách & lưu vào ngân hàng</button>
          <Link className="btn" to="/manage/import">Hoặc tải file DOCX/PDF →</Link>
        </div>
      </div>
    </>
  )
}

/* ---------- Bước 2: bài học ---------- */
function StepLesson({ onNext }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [form, setForm] = useState({ subject_id: '', topic_id: '', newTopic: '', title: '', content: '' })
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.subjects().then((all) => { const s = filterSubjects(all); setSubjects(s); if (s[0]) setForm((f) => ({ ...f, subject_id: f.subject_id || s[0].id })) }).catch(() => {})
  }, [])
  useEffect(() => {
    if (form.subject_id) api.topics(form.subject_id).then(setTopics).catch(() => setTopics([]))
    else setTopics([])
  }, [form.subject_id])

  const ensureTopic = async () => {
    if (form.topic_id) return form.topic_id
    if (!form.newTopic.trim()) return null
    const r = await api.createTopic({
      subject_id: form.subject_id, name: form.newTopic.trim(),
      grade: Number(form.grade) || 12,
    })
    return r.id
  }

  const save = async () => {
    if (busy) return
    if (!form.subject_id) return toast('Chọn môn.', 'warn')
    if (!form.title.trim()) return toast('Nhập tiêu đề bài học.', 'warn')
    setBusy(true)
    try {
      const tid = await ensureTopic()
      if (!tid) { toast('Chọn chuyên đề hoặc nhập tên chuyên đề mới.', 'warn'); setBusy(false); return }
      const list = await api.lessons(tid)
      await api.createLesson({
        topic_id: tid, title: form.title.trim(), content: form.content, idx: (list || []).length + 1,
      })
      setDone(true)
      toast('Đã tạo bài học.')
      setForm((f) => ({ ...f, title: '', content: '', newTopic: '' }))
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  return (
    <div className="card">
      <h3 className="icon-h"><IconBook className="icn" />Bước 2 — Bài học / tài liệu</h3>
      <div className="small muted">Nội dung lý thuyết, công thức, ví dụ — HS đánh dấu hoàn thành ở tab Chuyên đề.</div>
      <div className="grid c3" style={{ marginTop: 10 }}>
        <div>
          <label className="lbl" htmlFor="sl-subject">Môn *</label>
          <select className="select" id="sl-subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value, topic_id: '' })}>
            <option value="">— Chọn —</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="sl-topic">Chuyên đề</label>
          <select className="select" id="sl-topic" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
            <option value="">— Chọn hoặc tạo mới —</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="sl-new">…hoặc chuyên đề mới</label>
          <input className="input" id="sl-new" placeholder="VD: Dao động cơ" value={form.newTopic} onChange={(e) => setForm({ ...form, newTopic: e.target.value })} />
        </div>
      </div>
      <label className="lbl" htmlFor="sl-title">Tiêu đề bài học *</label>
      <input className="input" id="sl-title" placeholder="VD: Đại cương dao động điều hòa" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label className="lbl" htmlFor="sl-content">Nội dung</label>
      <textarea className="textarea" id="sl-content" style={{ minHeight: 140 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
        placeholder="Lý thuyết, công thức, ví dụ mẫu… (xuống dòng tự do)" />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={save} disabled={busy}><IconPlus className="icn sm" />{busy ? 'Đang lưu…' : 'Tạo bài học'}</button>
        <button className="btn" onClick={onNext}>Tiếp bước 3 — Đề thi →</button>
        <Link className="btn" to="/topics">Xem ở Chuyên đề</Link>
      </div>
      {done && <div className="small muted" style={{ marginTop: 6 }}>Có thể tạo thêm bài học cùng chuyên đề, hoặc sang bước đề thi.</div>}
    </div>
  )
}

/* ---------- Bước 3: đề thi từ ngân hàng ---------- */
function StepExam({ onNext }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [filter, setFilter] = useState({ subject_id: '', topic_id: '', difficulty: '', qtype: '', limit: 40 })
  const [bank, setBank] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [cfg, setCfg] = useState({ title: 'Đề kiểm tra', minutes: 45 })
  const [shared, setShared] = useState([])
  const [lastId, setLastId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [bankBusy, setBankBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.subjects().then((all) => { if (alive) { const s = filterSubjects(all); setSubjects(s); if (s[0]) setFilter((f) => ({ ...f, subject_id: f.subject_id || s[0].id })) } }).catch(() => {})
    api.listExams('shared').then((r) => alive && setShared(r)).catch(() => alive && setShared([]))
    return () => { alive = false }
  }, [])
  useEffect(() => {
    let alive = true
    if (filter.subject_id) api.topics(filter.subject_id).then((r) => alive && setTopics(r)).catch(() => alive && setTopics([]))
    else setTopics([])
    return () => { alive = false }
  }, [filter.subject_id])

  const loadBank = async () => {
    if (bankBusy) return
    setBankBusy(true)
    try {
      const rows = await api.questions({ ...filter, limit: filter.limit || 40 })
      setBank(rows)
      setPicked(new Set(rows.map((q) => q.id)))
    } catch (e) { toast(errMsg(e), 'err') }
    setBankBusy(false)
  }
  useEffect(() => { if (filter.subject_id) loadBank() }, [filter.subject_id, filter.topic_id, filter.difficulty]) // eslint-disable-line

  const toggle = (id) => {
    const n = new Set(picked)
    if (n.has(id)) n.delete(id); else n.add(id)
    setPicked(n)
  }

  const publish = async () => {
    if (busy) return
    if (!cfg.title.trim()) return toast('Nhập tên đề.', 'warn')
    if (!picked.size) return toast('Chọn ít nhất 1 câu.', 'warn')
    setBusy(true)
    try {
      const ids = [...picked]
      const r = await api.createExam({
        title: cfg.title.trim(), mode: 'shared',
        duration_min: Number(cfg.minutes) || 45,
        question_ids: ids,
      })
      setLastId(r.id)
      toast(`Đã đăng đề #${r.id} — HS mở Thi thử → danh sách đề giáo viên.`)
      const list = await api.listExams('shared').catch(() => [])
      setShared(list)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const shareLink = lastId ? `${window.location.origin}/exam?shared=${lastId}` : ''
  const previewLink = lastId ? `/exam?shared=${lastId}&preview=1` : ''

  return (
    <>
      <div className="card">
        <h3 className="icon-h"><IconTimer className="icn" />Bước 3 — Chốt đề thi từ ngân hàng</h3>
        <div className="small muted">Lọc câu → tích câu muốn thi → đặt tên/thời gian → đăng. HS vào <b>Thi thử</b> làm đề này (bấm giờ, chấm tự động TN).</div>
        <div className="filter-grid" style={{ marginTop: 10 }}>
          <select className="select" aria-label="Môn" value={filter.subject_id} onChange={(e) => setFilter({ ...filter, subject_id: e.target.value, topic_id: '' })}>
            <option value="">Tất cả môn</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="select" aria-label="Chuyên đề" value={filter.topic_id} onChange={(e) => setFilter({ ...filter, topic_id: e.target.value })}>
            <option value="">Tất cả CD</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="select" aria-label="Độ khó" value={filter.difficulty} onChange={(e) => setFilter({ ...filter, difficulty: e.target.value })}>
            <option value="">Mọi độ khó</option>
            <option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option>
          </select>
          <button className="btn" onClick={loadBank} disabled={bankBusy}>{bankBusy ? 'Đang tải…' : 'Tải câu'}</button>
        </div>
        <div className="grid c3" style={{ marginTop: 10 }}>
          <div>
            <label className="lbl" htmlFor="se-title">Tên đề *</label>
            <input className="input" id="se-title" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
          </div>
          <div>
            <label className="lbl" htmlFor="se-min">Thời gian (phút)</label>
            <select className="select" id="se-min" value={cfg.minutes} onChange={(e) => setCfg({ ...cfg, minutes: Number(e.target.value) })}>
              <option value={15}>15</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option>
            </select>
          </div>
          <div>
            <label className="lbl">Đã chọn</label>
            <div className="kpi" style={{ fontSize: 22 }}>{picked.size} / {bank.length}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setPicked(new Set(bank.map((q) => q.id)))}>Chọn tất cả</button>
          <button className="btn" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
          <button className="btn primary" onClick={publish} disabled={!picked.size || busy}>
            <IconTrophy className="icn sm" />{busy ? 'Đang đăng…' : `Đăng đề thi (${picked.size} câu)`}
          </button>
        </div>
        {shareLink && (
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} readOnly value={shareLink} aria-label="Link chia sẻ đề"
              onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(shareLink); toast('Đã copy link.') }}>Copy link</button>
            <Link className="btn primary" to={previewLink}><IconPlay className="icn sm" />Xem trước</Link>
            <button className="btn" onClick={onNext}>Bước 4 — Bài tập →</button>
          </div>
        )}
        {!shareLink && picked.size > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={onNext}>Sang bước 4 — Bài tập →</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="icon-h"><IconLayers className="icn" />Câu trong bộ lọc ({bank.length})</h3>
        {bank.length === 0 && <div className="empty">Chưa có câu — sang bước 1 nạp hoặc chọn môn khác.</div>}
        <div className="scrollbox" style={{ maxHeight: 360 }}>
          {bank.map((q, i) => (
            <label key={q.id} className="board-row clickable">
              <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} style={{ width: 18, height: 18 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="small muted">Câu {i + 1} · #{q.id} · {q.difficulty}</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{String(q.content).slice(0, 160)}{String(q.content).length > 160 ? '…' : ''}</div>
              </div>
              <span className="badge">{q.topic_name || 'chung'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Đề đã đăng ({shared.length})</h3>
        {shared.length === 0 && <div className="empty">Chưa có đề shared — tích câu rồi bấm Đăng đề thi.</div>}
        {shared.map((ex) => (
          <div key={ex.id} className="board-row">
            <IconTimer className="icn" style={{ color: 'var(--leaf)' }} />
            <div>
              <b>#{ex.id} {ex.title}</b>
              <div className="small muted">{ex.n_questions} câu · {ex.duration_min} phút · {ex.created_at ? new Date(ex.created_at).toLocaleDateString('vi-VN') : ''}</div>
            </div>
            <span className="badge green">Đang mở</span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- Bước 4: bài tập ---------- */
function StepAssign({ nav }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [classes, setClasses] = useState([])
  const [bank, setBank] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [form, setForm] = useState({
    class_id: '', subject_id: '', topic_id: '', title: '', description: '', deadline: '',
    questions: [{ content: '', points: 2 }],
    useBank: false, bankPoints: 5,
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
        api.subjects().then(filterSubjects).catch(() => []),
      api.classes().catch(() => []),
    ]).then(([s, c]) => {
      setSubjects(s); setClasses(c)
      if (s[0]) setForm((f) => ({ ...f, subject_id: f.subject_id || s[0].id }))
      if (c[0]) setForm((f) => ({ ...f, class_id: f.class_id || c[0].id }))
    })
  }, [])
  useEffect(() => {
    let alive = true
    if (form.subject_id) {
      api.topics(form.subject_id).then((r) => alive && setTopics(r)).catch(() => alive && setTopics([]))
      api.questions({ subject_id: form.subject_id, limit: 50 }).then((r) => alive && setBank(r)).catch(() => alive && setBank([]))
    } else { setTopics([]); setBank([]) }
    return () => { alive = false }
  }, [form.subject_id])

  const toggle = (id) => {
    const n = new Set(picked)
    if (n.has(id)) n.delete(id); else n.add(id)
    setPicked(n)
  }

  const create = async () => {
    if (busy) return
    if (!form.title.trim()) return toast('Nhập tên bài tập.', 'warn')
    if (!form.class_id) return toast('Chọn lớp.', 'warn')
    let qs = form.questions.filter((q) => q.content.trim())
      .map((q) => ({ content: q.content.trim(), points: Number(q.points) || 1 }))
    if (form.useBank && picked.size) {
      const fromBank = bank.filter((q) => picked.has(q.id)).map((q) => ({
        content: `${q.content}${q.qtype === 'trac_nghiem' ? `\n(${optsOf(q).map((o, i) => `${'ABCD'[i]}. ${o}`).join('  ')})` : ''}`,
        points: Number(form.bankPoints) || 5,
        answer: q.correct_answer || '',
      }))
      qs = [...fromBank, ...qs]
    }
    if (!qs.length) return toast('Cần ít nhất 1 câu (gõ tay hoặc chọn từ ngân hàng).', 'warn')
    setBusy(true)
    try {
      const r = await api.createAssignment({
        class_id: Number(form.class_id), topic_id: form.topic_id || null,
        title: form.title.trim(), description: form.description.trim(),
        deadline: form.deadline || null, questions: qs,
      })
      toast('Đã giao — mở trang bài để chấm.')
      nav(`/assignments/${r.id}`)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const totalManual = form.questions.reduce((s, q) => s + (Number(q.points) || 0), 0)
  const totalBank = form.useBank ? picked.size * (Number(form.bankPoints) || 5) : 0

  return (
    <div className="card">
      <h3 className="icon-h"><IconTask className="icn" />Bước 4 — Giao bài tập</h3>
      <div className="small muted">Chọn câu từ ngân hàng (chấm tham khảo đáp án) +/hoặc gõ câu tự luận. HS làm ở tab Bài tập.</div>
      <div className="grid c4" style={{ marginTop: 10 }}>
        <div>
          <label className="lbl" htmlFor="sa-title">Tên bài *</label>
          <input className="input" id="sa-title" placeholder="VD: BT Dao động 01" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="lbl" htmlFor="sa-class">Lớp *</label>
          <select className="select" id="sa-class" value={form.class_id} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
            <option value="">— Chọn —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="sa-subject">Môn</label>
          <select className="select" id="sa-subject" value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value, topic_id: '' })}>
            <option value="">—</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor="sa-deadline">Hạn</label>
          <input className="input" id="sa-deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </div>
      </div>
      <label className="lbl" htmlFor="sa-topic">Chuyên đề</label>
      <select className="select" id="sa-topic" value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })}>
        <option value="">— Chung —</option>
        {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label className="lbl" htmlFor="sa-desc">Mô tả / hướng dẫn</label>
      <textarea className="textarea" id="sa-desc" style={{ minHeight: 60 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

      <div className="row spread" style={{ marginTop: 12 }}>
        <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.useBank} onChange={(e) => setForm({ ...form, useBank: e.target.checked })} />
          <b>Chọn câu từ ngân hàng ({picked.size} đã tích)</b>
        </label>
        <div className="row">
          <span className="small muted">Điểm/câu bank</span>
          <input className="input" style={{ width: 70 }} type="number" min="1" value={form.bankPoints} aria-label="Điểm mỗi câu ngân hàng"
            onChange={(e) => setForm({ ...form, bankPoints: e.target.value })} />
        </div>
      </div>

      {form.useBank && (
        <div className="scrollbox sm" style={{ marginTop: 10 }}>
          {bank.length === 0 && <div className="small muted" style={{ padding: 8 }}>Không có câu cho môn này.</div>}
          {bank.map((q) => (
            <label key={q.id} className="board-row clickable" style={{ padding: '6px 4px' }}>
              <input type="checkbox" checked={picked.has(q.id)} onChange={() => toggle(q.id)} />
              <div className="small" style={{ flex: 1, minWidth: 0 }}>{String(q.content).slice(0, 120)}</div>
              <span className="badge">{q.difficulty}</span>
            </label>
          ))}
        </div>
      )}

      <label className="lbl">Câu gõ tay (tự luận / diễn đạt)</label>
      {form.questions.map((q, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <span className="badge">{i + 1}</span>
          <input className="input" style={{ flex: 1 }} placeholder="Nội dung câu…" value={q.content} aria-label={`Nội dung câu ${i + 1}`}
            onChange={(e) => { const qs = [...form.questions]; qs[i] = { ...q, content: e.target.value }; setForm({ ...form, questions: qs }) }} />
          <input className="input" style={{ width: 70 }} type="number" min="0.5" step="0.5" value={q.points} aria-label={`Điểm câu ${i + 1}`}
            onChange={(e) => { const qs = [...form.questions]; qs[i] = { ...q, points: e.target.value }; setForm({ ...form, questions: qs }) }} />
          <button className="btn danger sm" aria-label={`Xóa câu ${i + 1}`} onClick={() => setForm({ ...form, questions: form.questions.filter((_, k) => k !== i) })}>×</button>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => setForm({ ...form, questions: [...form.questions, { content: '', points: 1 }] })}>
          <IconPlus className="icn sm" />Thêm câu tay
        </button>
        <span className="small muted">Tổng điểm ≈ {totalBank + totalManual}</span>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={create} disabled={busy}><IconCheckCircle className="icn sm" />{busy ? 'Đang giao…' : 'Giao bài tập'}</button>
        <Link className="btn" to="/assignments">Danh sách bài tập</Link>
        <Link className="btn" to="/manage/import"><IconFileUp className="icn sm" />Nhập thêm file</Link>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Gợi ý pipeline: <IconPlay className="icn sm" /> nạp câu (bước 1) → bài học (bước 2) → đề thi (bước 3) → hoặc giao bài tập ngay ở đây.
      </div>
    </div>
  )
}

/* ---------- AI + DOCX pipeline ---------- */
function StepPipeline({ initialSubject = '' }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Gửi file DOCX (hoặc PDF/TXT) để tôi tách câu hỏi và phân loại: trắc nghiệm, đúng/sai, điền từ, tự luận.' },
  ])
  const [file, setFile] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    api.subjects().then((rows) => {
      const kept = filterSubjects(rows)
      setSubjects(kept)
      const chosen = kept.find((s) => s.id === initialSubject) || kept[0]
      if (chosen) setSubjectId(chosen.id)
    }).catch(() => {})
  }, [initialSubject])

  useEffect(() => {
    if (!subjectId) { setTopics([]); return }
    api.topics(subjectId).then((rows) => setTopics(Array.isArray(rows) ? rows : [])).catch(() => setTopics([]))
  }, [subjectId])

  const counts = questions.reduce((acc, q) => {
    acc[q.qtype] = (acc[q.qtype] || 0) + 1
    return acc
  }, {})

  const run = async () => {
    if (!file) { toast('Chọn file DOCX/PDF/TXT trước.', 'warn'); return }
    if (!subjectId) { toast('Chọn môn trước.', 'warn'); return }
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', text: `Đã gửi: ${file.name}${prompt ? ` — ${prompt}` : ''}` }])
    try {
      const result = await api.uploadImport(file)
      let raw = []
      try { raw = await api.parseQuestions(result?.text || '') } catch { raw = [] }
      if (!raw.length) raw = result?.drafts || []
      const drafts = raw.map((q, i) => {
        const opts = Array.isArray(q.options) ? q.options : []
        const optsLower = opts.map((o) => String(o).trim().toLowerCase())
        const isTf = optsLower.length === 2 && optsLower.some((o) => o.includes('đúng')) && optsLower.some((o) => o.includes('sai'))
        let qtype = q.qtype
        if (!['trac_nghiem', 'dung_sai', 'diem_khuyet', 'tu_luan'].includes(qtype)) {
          if (isTf) qtype = 'dung_sai'
          else if (opts.length >= 2) qtype = 'trac_nghiem'
          else if (/___|\{\{[^}]+\}\}/.test(String(q.content || ''))) qtype = 'diem_khuyet'
          else qtype = 'tu_luan'
        }
        let correct = String(q.correct_answer || '').trim()
        if (qtype === 'dung_sai') {
          const c = correct.toUpperCase()
          correct = ['DUNG', 'ĐÚNG', 'TRUE', 'T', 'A'].includes(c) ? 'DUNG' : ['SAI', 'FALSE', 'F', 'B'].includes(c) ? 'SAI' : ''
        } else if (qtype === 'trac_nghiem') {
          if (!/^[A-D]$/i.test(correct)) {
            const idx = opts.findIndex((o) => String(o).trim().toLowerCase() === correct.toLowerCase())
            if (idx >= 0) correct = 'ABCD'[idx]
            else if (/^[1-4]$/.test(correct)) correct = 'ABCD'[Number(correct) - 1]
            else correct = ''
          } else {
            correct = correct.toUpperCase()
          }
        }
        return {
          id: `draft-${Date.now()}-${i}`,
          subject_id: subjectId,
          topic_id: topicId || null,
          grade: 12,
          difficulty: q.difficulty || 'vận dụng',
          qtype,
          content: q.content,
          options: qtype === 'dung_sai' ? ['Đúng', 'Sai'] : opts,
          correct_answer: correct,
          explanation: q.explanation || '',
          score: 1,
          source: 'ai',
        }
      })
      setQuestions(drafts)
      setAnswers({})
      const summary = Object.entries(drafts.reduce((acc, q) => { acc[q.qtype] = (acc[q.qtype] || 0) + 1; return acc }, {}))
        .map(([type, n]) => `${n} ${type}`).join(', ')
      const missing = drafts.filter((q) => q.qtype !== 'tu_luan' && !q.correct_answer).length
      const answerNote = missing ? ` Còn ${missing} câu thiếu đáp án — bổ sung trước khi đăng đề.` : ' Tất cả câu đều có đáp án để chấm điểm.'
      setMessages((m) => [...m, { role: 'assistant', text: drafts.length ? `Đã tách ${drafts.length} câu: ${summary}.${answerNote} Xem trước bên phải.` : 'Không tách được câu nào. Kiểm tra lại định dạng file.' }])
      if (!drafts.length) toast('Không tách được câu hỏi.', 'warn')
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: 'Lỗi đọc file: ' + errMsg(e) }])
      toast(errMsg(e), 'err')
    }
    setBusy(false)
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const saveBank = async () => {
    if (!questions.length) return
    setBusy(true)
    try {
      const payload = questions.map(({ id: _id, ...rest }) => rest)
      const r = await api.bulkQuestions(payload)
      toast(`Đã lưu ${r.inserted ?? payload.length} câu vào ngân hàng.`)
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const publish = async () => {
    if (!questions.length) return
    setBusy(true)
    try {
      const ids = []
      for (const { id: _id, ...q } of questions) {
        const r = await api.createQuestion(q)
        if (r?.id) ids.push(r.id)
      }
      const exam = await api.createExam({
        title: prompt || `Đề ${subjects.find((s) => s.id === subjectId)?.name || ''}`,
        mode: 'shared', duration_min: 45, question_ids: ids,
      })
      toast(`Đã đăng đề #${exam.id} (${ids.length} câu).`)
      setMessages((m) => [...m, { role: 'assistant', text: `Đã đăng đề #${exam.id}. Học sinh vào môn → tab Đề thi để làm.` }])
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  return (
    <div className="pipeline">
      <div className="pipeline-chat">
        <div className="chat-log">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>
          ))}
        </div>
        <div className="chat-compose">
          <div className="grid c2">
            <select className="select" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId('') }}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Tất cả chuyên đề</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <input className="input" style={{ marginTop: 8 }} placeholder="Ghi chú cho AI (không bắt buộc)…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <input ref={fileRef} className="input" style={{ marginTop: 8 }} type="file" accept=".docx,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={run} disabled={busy}><IconWand className="icn sm" />{busy ? 'Đang xử lý…' : 'Gửi cho AI'}</button>
            {questions.length > 0 && <button className="btn" onClick={saveBank} disabled={busy}>Lưu ngân hàng</button>}
            {questions.length > 0 && <button className="btn" onClick={publish} disabled={busy}>Đăng đề thi</button>}
          </div>
        </div>
      </div>
      <div className="pipeline-preview">
        <div className="row spread" style={{ marginBottom: 8 }}>
          <b>Xem trước đề</b>
          <span className="badge">{questions.length} câu{counts.trac_nghiem ? ` · ${counts.trac_nghiem} TN` : ''}{counts.dung_sai ? ` · ${counts.dung_sai} Đ/S` : ''}{counts.diem_khuyet ? ` · ${counts.diem_khuyet} điền từ` : ''}{counts.tu_luan ? ` · ${counts.tu_luan} tự luận` : ''}</span>
        </div>
        {questions.length === 0 ? (
          <div className="empty">Gửi file để xem trước đề tại đây — hiển thị giống môi trường thi của học sinh.</div>
        ) : (
          <ExamPaper questions={questions} answers={answers} setAnswers={setAnswers} interactive />
        )}
      </div>
    </div>
  )
}
