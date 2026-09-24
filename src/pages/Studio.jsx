import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  IconBook, IconTask, IconFileUp, IconFile, IconLayers, IconChecks,
  IconPlay, IconPlus, IconTimer, IconTrophy, IconUpload, IconWand, IconCheckCircle,
} from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { parseTextToDrafts } from '../lib/parseImport.js'
import { useUI } from '../components/ui.jsx'
import { isStaffRole } from '../lib/roles.js'

const optsOf = (q) => { try { const p = JSON.parse(q.options || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } }

const STEPS = [
  { id: 'ai', label: 'AI tạo nội dung', icon: IconWand },
  { id: 'import', label: 'Nhập câu hỏi', icon: IconFileUp },
  { id: 'lesson', label: 'Bài học', icon: IconBook },
  { id: 'exam', label: 'Đề thi', icon: IconTimer },
  { id: 'assign', label: 'Bài tập', icon: IconTask },
]

export default function Studio() {
  const rawRole = getSession().student?.role || 'student'
  const isStaff = isStaffRole(rawRole)
  const [step, setStep] = useState('ai')
  const nav = useNavigate()

  if (!isStaff) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Studio nội dung</h1>
          <div className="empty">Chỉ giáo viên / quản trị dùng pipeline tạo tài liệu & đề thi.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconWand className="icn" />Studio tạo nội dung</h1>
        <div className="small muted">
          Bắt đầu với <b>AI</b> để sinh câu hỏi / bài học / đề / flashcard / cloze, duyệt rồi lưu.
          Hoặc nhập tay ở các tab sau.
        </div>
        <div className="subnav" style={{ marginTop: 12 }} role="tablist" aria-label="Chức năng Studio">
          {STEPS.map((s) => {
            const Icon = s.icon
            return (
              <button key={s.id} role="tab" aria-selected={step === s.id} className={step === s.id ? 'on' : ''} onClick={() => setStep(s.id)}>
                <Icon className="icn sm" />{s.label}
              </button>
            )
          })}
        </div>
      </div>

      {step === 'ai' && <StepAI goManual={setStep} />}
      {step === 'import' && <StepImport onNext={() => setStep('lesson')} />}
      {step === 'lesson' && <StepLesson onNext={() => setStep('exam')} />}
      {step === 'exam' && <StepExam onNext={() => setStep('assign')} />}
      {step === 'assign' && <StepAssign nav={nav} />}

      <div className="card">
        <div className="row spread">
          <div className="small muted">Pipeline không chặn bước — nhảy bất kỳ đâu cũng được.</div>
          <div className="row">
            <Link className="btn" to="/manage/bank"><IconChecks className="icn sm" />Mở ngân hàng</Link>
            <Link className="btn" to="/manage/import"><IconUpload className="icn sm" />Nhập DOCX/PDF</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Tab AI: sinh noi dung bang Agnes AI ---------- */
const AI_TYPES = [
  { id: 'questions', label: 'Câu hỏi trắc nghiệm', hint: 'Lưu vào ngân hàng' },
  { id: 'cloze', label: 'Điền từ (cloze)', hint: 'Câu có ___ / {{từ}}' },
  { id: 'lesson', label: 'Bài học', hint: 'Nội dung lý thuyết' },
  { id: 'exam', label: 'Đề thi', hint: ' publish đề shared' },
  { id: 'flashcards', label: 'Flashcard', hint: 'Thẻ lật trước/sau' },
]
const AI_MODELS = [
  { id: 'agnes-2.5-flash', label: 'agnes-2.5-flash (khuyên dùng)' },
  { id: 'agnes-2.0-flash', label: 'agnes-2.0-flash (cân bằng)' },
  { id: 'agnes-1.5-flash', label: 'agnes-1.5-flash (nhanh)' },
]

function StepAI({ goManual }) {
  const { toast, errMsg } = useUI()
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [form, setForm] = useState({
    type: 'questions', model: 'agnes-2.5-flash',
    subject: '', subject_id: '', topic: '', topic_id: '',
    count: 5, difficulty: 'vận dụng', qtype: 'trac_nghiem', prompt: '',
  })
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.subjects().then(setSubjects).catch(() => {})
  }, [])

  const pickSubject = async (sid) => {
    setForm((f) => ({ ...f, subject_id: sid, topic_id: '' }))
    const s = subjects.find((x) => x.id === sid)
    setForm((f) => ({ ...f, subject: s?.name || '' }))
    if (sid) api.topics(sid).then(setTopics).catch(() => setTopics([]))
    else setTopics([])
  }

  const pickTopic = (tid) => {
    const t = topics.find((x) => x.id === tid)
    setForm((f) => ({ ...f, topic_id: tid, topic: t?.name || f.topic }))
  }

  const generate = async () => {
    if (!form.topic.trim() && !form.prompt.trim()) {
      return toast('Nhập chủ đề hoặc yêu cầu thêm.', 'warn')
    }
    setBusy(true); setPreview(null)
    try {
      const r = await api.aiGenerate({
        type: form.type, model: form.model,
        topic: form.topic, subject: form.subject,
        count: Number(form.count) || 5,
        difficulty: form.difficulty, qtype: form.qtype,
        prompt: form.prompt,
      })
      setPreview(r.data)
      toast('AI đã sinh — kiểm tra preview rồi bấm Lưu.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  // ---------- SAVE handlers ----------
  const saveQuestions = async () => {
    const qs = (preview?.questions || []).map((q) => ({
      subject_id: form.subject_id, topic_id: form.topic_id || null,
      grade: 12, difficulty: form.difficulty,
      qtype: q.qtype || form.qtype,
      content: q.content, options: q.options || [],
      correct_answer: q.correct_answer || '', explanation: q.explanation || '',
      score: 1, source: 'ai',
    })).filter((q) => q.content && q.subject_id)
    if (!qs.length) return toast('Cần chọn môn + câu hỏi hợp lệ.', 'warn')
    setSaving(true)
    try {
      const r = await api.bulkQuestions(qs)
      toast(`Đã lưu ${r.inserted ?? qs.length} câu vào ngân hàng.`)
      setPreview(null); goManual('bank')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveCloze = async () => {
    // diem_khuyet van luu vao bank questions
    const qs = (preview?.questions || []).map((q) => ({
      subject_id: form.subject_id, topic_id: form.topic_id || null,
      grade: 12, difficulty: 'nhận biết', qtype: 'diem_khuyet',
      content: q.content, options: [],
      correct_answer: q.correct_answer || '', explanation: '',
      score: 1, source: 'ai',
    })).filter((q) => q.content && q.subject_id)
    if (!qs.length) return toast('Cần chọn môn + câu hỏi hợp lệ.', 'warn')
    setSaving(true)
    try {
      const r = await api.bulkQuestions(qs)
      toast(`Đã lưu ${r.inserted ?? qs.length} câu cloze.`)
      setPreview(null); goManual('bank')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveLesson = async () => {
    if (!form.topic_id) return toast('Chọn chuyên đề để gắn bài học.', 'warn')
    if (!preview?.content && !preview?.title) return toast('Chưa có nội dung.', 'warn')
    setSaving(true)
    try {
      await api.createLesson({
        topic_id: form.topic_id,
        title: preview.title || form.topic,
        content: preview.content || '',
      })
      toast('Đã lưu bài học.')
      setPreview(null); goManual('lesson')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveFlashcards = async () => {
    if (!form.topic_id) return toast('Chọn chuyên đề để gắn flashcard.', 'warn')
    const cards = (preview?.cards || []).filter((c) => c.front)
    if (!cards.length) return toast('Không có thẻ hợp lệ.', 'warn')
    setSaving(true)
    try {
      const r = await api.createFlashcards({ topic_id: form.topic_id, cards })
      toast(`Đã lưu ${r.inserted} thẻ flashcard.`)
      setPreview(null)
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveExam = async () => {
    if (!form.subject_id) return toast('Chọn môn.', 'warn')
    const qs = (preview?.questions || []).map((q) => ({
      subject_id: form.subject_id, topic_id: form.topic_id || null,
      grade: 12, difficulty: form.difficulty, qtype: 'trac_nghiem',
      content: q.content, options: q.options || [],
      correct_answer: q.correct_answer || '', explanation: q.explanation || '',
      score: 1, source: 'ai',
    })).filter((q) => q.content)
    if (!qs.length) return toast('Không có câu hỏi.', 'warn')
    setSaving(true)
    try {
      const ids = []
      for (const q of qs) {
        const r = await api.createQuestion(q)
        if (r?.id) ids.push(r.id)
      }
      await api.createExam({
        title: preview.title || `Đề ${form.topic || 'AI'}`,
        mode: 'shared', duration_min: 45, question_ids: ids,
      })
      toast(`Đã publish đề ${ids.length} câu (shared).`)
      setPreview(null); goManual('exam')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const t = form.type
  const hasSubjects = subjects.length > 0

  return (
    <div className="grid">
      <div className="card">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>🤖 Sinh nội dung bằng AI</h3>
          <span className="badge">Agnes AI · OpenAI-compatible</span>
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>
          Chọn loại nội dung → mô tả chủ đề → AI trả JSON → bạn duyệt preview rồi Lưu.
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <select className="select" style={{ flex: 1, minWidth: 160 }} value={t}
            onChange={(e) => { setForm({ ...form, type: e.target.value }); setPreview(null) }}>
            {AI_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label} — {x.hint}</option>)}
          </select>
          <select className="select" style={{ flex: 1, minWidth: 160 }} value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div className="grid c3" style={{ marginTop: 8 }}>
          <div>
            <label className="lbl">Môn *</label>
            <select className="select" value={form.subject_id} onChange={(e) => pickSubject(e.target.value)}>
              <option value="">— Chọn —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Chuyên đề (gắn khi lưu)</label>
            <select className="select" value={form.topic_id} onChange={(e) => pickTopic(e.target.value)}>
              <option value="">— Chọn —</option>
              {topics.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Số lượng</label>
            <input className="input" type="number" min="1" max="30" value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </div>
        </div>

        <label className="lbl">Chủ đề / đề bài *</label>
        <input className="input" placeholder="VD: Dao động điều hòa, họ Ankyl…" value={form.topic}
          onChange={(e) => setForm({ ...form, topic: e.target.value })} />

        {(t === 'questions' || t === 'exam') && (
          <div className="grid c2" style={{ marginTop: 8 }}>
            <div>
              <label className="lbl">Độ khó</label>
              <select className="select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option>nhận biết</option><option>thông hiểu</option><option>vận dụng</option><option>vận dụng cao</option>
              </select>
            </div>
            {t === 'questions' && (
              <div>
                <label className="lbl">Loại câu</label>
                <select className="select" value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
                  <option value="trac_nghiem">Trắc nghiệm</option>
                  <option value="tu_luan">Tự luận</option>
                  <option value="diem_khuyet">Điền từ (cloze)</option>
                </select>
              </div>
            )}
          </div>
        )}

        <label className="lbl">Yêu cầu thêm (tùy chọn)</label>
        <textarea className="textarea" style={{ minHeight: 60 }} placeholder="VD: ưu tiên ví dụ thực tế nông nghiệp, 4 phương án…" value={form.prompt}
          onChange={(e) => setForm({ ...form, prompt: e.target.value })} />

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={generate} disabled={busy || !hasSubjects}>
            <IconWand className="icn sm" />{busy ? 'AI đang suy nghĩ…' : 'Sinh nội dung'}
          </button>
          {!hasSubjects && <span className="small muted">Chưa có môn học — kiểm tra seed.</span>}
        </div>
      </div>

      {preview && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Xem trước — kiểm tra rồi Lưu</h3>

          {/* flashcards */}
          {(preview.cards || preview.front) && (
            <div>
              {(preview.cards || [preview]).map((c, i) => (
                <div key={i} className="board-row">
                  <b>F{i + 1}</b>
                  <div style={{ flex: 1 }}>
                    <div>{c.front}</div>
                    <div className="small muted">{c.back}</div>
                  </div>
                </div>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={saveFlashcards} disabled={saving}>
                  {saving ? 'Đang lưu…' : `Lưu ${preview.cards?.length || 0} thẻ`}
                </button>
                <button className="btn" onClick={() => setPreview(null)}>Bỏ qua</button>
              </div>
            </div>
          )}

          {/* lesson */}
          {(preview.content && !preview.questions && !preview.cards) && (
            <div>
              <b>{preview.title || form.topic}</b>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 14, lineHeight: 1.65 }}>{preview.content}</div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={saveLesson} disabled={saving}>
                  {saving ? 'Đang lưu…' : 'Lưu bài học'}
                </button>
                <button className="btn" onClick={() => setPreview(null)}>Bỏ qua</button>
              </div>
            </div>
          )}

          {/* questions / exam / cloze */}
          {(preview.questions || preview.title) && !preview.cards && !preview.content && (
            <div>
              {preview.title && <div className="small muted">Đề: <b>{preview.title}</b></div>}
              <table className="tbl" style={{ marginTop: 8 }}>
                <thead><tr><th>#</th><th>Câu hỏi</th><th>Đáp án</th></tr></thead>
                <tbody>
                  {(preview.questions || []).map((q, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{q.content}</td>
                      <td className="small">
                        {q.options ? (q.options.join(' · ') + (q.correct_answer ? ` → ${q.correct_answer}` : '')) : q.correct_answer}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 10 }}>
                {t === 'exam' ? (
                  <button className="btn primary" onClick={saveExam} disabled={saving}>
                    {saving ? 'Đang lưu…' : 'Lưu đề thi (shared)'}
                  </button>
                ) : t === 'cloze' || form.qtype === 'diem_khuyet' ? (
                  <button className="btn primary" onClick={saveCloze} disabled={saving}>
                    {saving ? 'Đang lưu…' : 'Lưu cloze vào ngân hàng'}
                  </button>
                ) : (
                  <button className="btn primary" onClick={saveQuestions} disabled={saving}>
                    {saving ? 'Đang lưu…' : `Lưu ${(preview.questions || []).length} câu vào ngân hàng`}
                  </button>
                )}
                <button className="btn" onClick={() => setPreview(null)}>Bỏ qua</button>
                <button className="btn" onClick={generate} disabled={busy}>Sinh lại</button>
              </div>
            </div>
          )}

          {/* fallback weird shape */}
          {!preview.cards && !preview.questions && !preview.content && !preview.title && (
            <pre className="code">{JSON.stringify(preview, null, 2).slice(0, 2000)}</pre>
          )}
        </div>
      )}
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
    api.subjects().then((s) => { setSubjects(s); if (s[0]) setForm((f) => ({ ...f, subject_id: f.subject_id || s[0].id })) }).catch(() => {})
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
    api.subjects().then((s) => { setSubjects(s); if (s[0]) setForm((f) => ({ ...f, subject_id: f.subject_id || s[0].id })) }).catch(() => {})
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
    api.subjects().then((s) => { if (alive) { setSubjects(s); if (s[0]) setFilter((f) => ({ ...f, subject_id: f.subject_id || s[0].id })) } }).catch(() => {})
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

  // HashRouter: phải kèm #/exam?shared=… mới vào đúng trang Thi thử
  const shareLink = lastId
    ? `${window.location.origin}${window.location.pathname}#/exam?shared=${lastId}`
    : ''

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
      api.subjects().catch(() => []),
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
