// Client API 2 chế độ:
// - CLOUD (Vercel + Supabase): khi có VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
//   Mọi logic chạy thẳng tới Supabase, không cần server Python.
// - LEGACY (Python core FastAPI): giữ nguyên như cũ cho chạy LAN/tunnel.
// Giữ nguyên chữ ký hàm để các pages không phải sửa.

import { supabase, SUPABASE_MODE } from './lib/supabase.js'
import { parseTextToDrafts } from './lib/parseImport.js'

export const isCloudMode = SUPABASE_MODE

// Chế độ Hostinger (PHP + MySQL): khi có VITE_API_BASE, VD:
//   VITE_API_BASE=https://herbspalab.com/api
// Ưu tiên Supabase trước, rồi tới PHP, cuối cùng là Python LAN cũ.
const PHP_BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '')
const PHP_TOKEN = import.meta.env.VITE_API_TOKEN || ''
export const isPhpMode = !SUPABASE_MODE && Boolean(PHP_BASE)

// ================= LEGACY (Python core) =================

let cachedBase = null

const isLoop = (u) => /localhost|127\.0\.0\.1/.test(u || '')

function sameOrigin() {
  try {
    if (window.location.protocol.startsWith('http') && window.location.host) {
      return `${window.location.protocol}//${window.location.host}`
    }
  } catch {}
  return null
}

async function getBackendUrlLegacy() {
  if (cachedBase) return cachedBase
  try {
    if (window.electronAPI?.getBackendUrl) {
      cachedBase = await window.electronAPI.getBackendUrl()
      return cachedBase
    }
  } catch {}
  const origin = sameOrigin()
  const stored = localStorage.getItem('backendUrl')
  if (stored) {
    if (isLoop(stored) && origin && !isLoop(origin)) {
      cachedBase = origin
      localStorage.setItem('backendUrl', cachedBase)
      return cachedBase
    }
    cachedBase = stored
    return cachedBase
  }
  cachedBase = origin || 'http://127.0.0.1:8765'
  return cachedBase
}

function setBackendUrlLegacy(url) {
  cachedBase = url
  localStorage.setItem('backendUrl', url)
}

async function req(path, options = {}) {
  const base = await getBackendUrlLegacy()
  const extra = /ngrok/i.test(base) ? { 'ngrok-skip-browser-warning': 'true' } : {}
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...extra, ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${t.slice(0, 300)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

const legacyApi = {
  health: () => req('/api/health'),
  subjects: () => req('/api/subjects'),
  topics: (subjectId) => req(`/api/topics${subjectId ? `?subject_id=${subjectId}` : ''}`),
  createTopic: (payload) => req('/api/topics', { method: 'POST', body: JSON.stringify(payload) }),
  questions: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/questions${s ? `?${s}` : ''}`)
  },
  createQuestion: (payload) => req('/api/questions', { method: 'POST', body: JSON.stringify(payload) }),
  updateQuestion: (id, payload) => req(`/api/questions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteQuestion: (id) => req(`/api/questions/${id}`, { method: 'DELETE' }),
  createExam: (payload) => req('/api/exams', { method: 'POST', body: JSON.stringify(payload) }),
  getExam: (id) => req(`/api/exams/${id}`),
  submitExam: (id, payload) => req(`/api/exams/${id}/submit`, { method: 'POST', body: JSON.stringify(payload) }),
  attempts: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/attempts${s ? `?${s}` : ''}`)
  },
  stats: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/stats/overview${s ? `?${s}` : ''}`)
  },
  students: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/students${s ? `?${s}` : ''}`)
  },
  createStudent: (payload) => req('/api/students', { method: 'POST', body: JSON.stringify(payload) }),
  updateStudent: (id, payload) => req(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteStudent: (id) => req(`/api/students/${id}`, { method: 'DELETE' }),
  previewImportText: (text) => req('/api/import/preview-text', { method: 'POST', body: JSON.stringify({ text }) }),
  uploadImport: async (file) => {
    const base = await getBackendUrlLegacy()
    const fd = new FormData()
    fd.append('file', file)
    const extra = /ngrok/i.test(base) ? { 'ngrok-skip-browser-warning': 'true' } : {}
    const res = await fetch(`${base}/api/import/upload`, { method: 'POST', headers: extra, body: fd })
    if (!res.ok) throw new Error(`Upload lỗi ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return res.json()
  },
  bulkQuestions: (items) => req('/api/questions/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
}

// ================= CLOUD (Supabase) =================

function sbThrow(error, fallback) {
  if (error) throw new Error(error.message || fallback || 'Lỗi Supabase')
}

// Cache tên môn/chuyên đề để gắn subject_name/topic_name như bản cũ
let subjectMap = null
let topicMap = null

async function getMaps() {
  if (subjectMap && topicMap) return { subjectMap, topicMap }
  const sb = supabase()
  const [s, t] = await Promise.all([
    sb.from('subjects').select('id,name'),
    sb.from('topics').select('id,name'),
  ])
  sbThrow(s.error, 'Không tải được danh sách môn')
  sbThrow(t.error, 'Không tải được chuyên đề')
  subjectMap = Object.fromEntries((s.data || []).map((r) => [r.id, r.name]))
  topicMap = Object.fromEntries((t.data || []).map((r) => [r.id, r.name]))
  return { subjectMap, topicMap }
}

function mapQuestion(r, maps) {
  return {
    id: r.id,
    subject_id: r.subject_id,
    subject_name: maps?.subjectMap?.[r.subject_id] ?? r.subject_id,
    topic_id: r.topic_id,
    topic_name: r.topic_id ? (maps?.topicMap?.[r.topic_id] ?? null) : null,
    grade: r.grade,
    difficulty: r.difficulty,
    qtype: r.qtype,
    content: r.content,
    // Giữ dạng chuỗi JSON như bản Python để các pages JSON.parse không phải sửa
    options: JSON.stringify(r.options ?? []),
    correct_answer: r.correct_answer ?? '',
    explanation: r.explanation ?? '',
    score: r.score ?? 1,
    source: r.source ?? '',
    image_url: r.image_url ?? '',
  }
}

function mapAttempt(r) {
  return {
    id: r.id,
    exam_id: r.exam_id,
    mode: r.mode,
    correct: r.correct ?? 0,
    total: r.total ?? 0,
    accuracy: r.accuracy ?? 0,
    detail: Array.isArray(r.detail) ? r.detail : [],
    student_name: r.student_name ?? '',
    focus_exits: r.focus_exits ?? 0,
    focus_log: Array.isArray(r.focus_log) ? r.focus_log : [],
    created_at: r.created_at,
  }
}

async function extractFileText(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.txt')) {
    const buf = await file.arrayBuffer()
    for (const enc of ['utf-8', 'windows-1258', 'iso-8859-1']) {
      try {
        return new TextDecoder(enc, { fatal: true }).decode(buf)
      } catch {}
    }
    return new TextDecoder('utf-8').decode(buf)
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth')
    const buf = await file.arrayBuffer()
    const out = await mammoth.extractRawText({ arrayBuffer: buf })
    return out.value || ''
  }
  if (name.endsWith('.pdf')) {
    const [pdfjs, workerUrl] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => m.default),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const buf = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
    const pages = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const tc = await page.getTextContent()
      pages.push(tc.items.map((it) => it.str).join(' '))
    }
    const full = pages.join('\n').trim()
    if (full.length < 20) {
      throw new Error('PDF không có lớp chữ (có thể là file scan). Hãy dùng file DOCX/PDF text hoặc dán nội dung.')
    }
    return full
  }
  throw new Error('Định dạng chưa hỗ trợ. Hãy dùng .docx, .pdf (có text) hoặc .txt.')
}

const cloudApi = {
  health: async () => {
    const sb = supabase()
    const { count, error } = await sb.from('questions').select('id', { count: 'exact', head: true })
    sbThrow(error, 'Không kết nối được Supabase')
    return { status: 'ok', backend: 'supabase', time: new Date().toISOString(), total_questions: count ?? 0 }
  },

  subjects: async () => {
    const { data, error } = await supabase().from('subjects').select('*').order('name')
    sbThrow(error, 'Không tải được môn học')
    subjectMap = Object.fromEntries((data || []).map((r) => [r.id, r.name]))
    return data || []
  },

  topics: async (subjectId) => {
    let q = supabase().from('topics').select('*').order('name')
    if (subjectId) q = q.eq('subject_id', subjectId)
    const { data, error } = await q
    sbThrow(error, 'Không tải được chuyên đề')
    return data || []
  },

  createTopic: async (payload) => {
    const sb = supabase()
    const name = (payload.name || '').trim()
    if (!name) throw new Error('Thiếu tên chuyên đề')
    let tid = (payload.id || '').trim() || 't-' + Math.random().toString(16).slice(2, 10)
    const chk = await sb.from('topics').select('id').eq('id', tid).limit(1)
    if ((chk.data || []).length) tid = 't-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(36)
    const { data, error } = await sb
      .from('topics')
      .insert({ id: tid, subject_id: payload.subject_id, name: name.slice(0, 200), grade: Number(payload.grade) || 12 })
      .select('id')
      .single()
    sbThrow(error, 'Không tạo được chuyên đề (kiểm tra mã/môn)')
    topicMap = null
    return { id: data.id }
  },

  questions: async (params = {}) => {
    const maps = await getMaps()
    let q = supabase().from('questions').select('*').order('id', { ascending: false })
    if (params.subject_id) q = q.eq('subject_id', params.subject_id)
    if (params.topic_id) q = q.eq('topic_id', params.topic_id)
    if (params.grade !== '' && params.grade != null) q = q.eq('grade', Number(params.grade))
    if (params.difficulty) q = q.eq('difficulty', params.difficulty)
    if (params.qtype) q = q.eq('qtype', params.qtype)
    if (params.search) q = q.ilike('content', `%${params.search}%`)
    q = q.limit(Math.max(1, Math.min(Number(params.limit) || 200, 500)))
    const { data, error } = await q
    sbThrow(error, 'Không tải được câu hỏi')
    return (data || []).map((r) => mapQuestion(r, maps))
  },

  createQuestion: async (payload) => {
    const { data, error } = await supabase()
      .from('questions')
      .insert({
        subject_id: payload.subject_id,
        topic_id: payload.topic_id || null,
        grade: Number(payload.grade) || 12,
        difficulty: payload.difficulty || 'vận dụng',
        qtype: payload.qtype || 'trac_nghiem',
        content: (payload.content || '').trim(),
        options: payload.options || [],
        correct_answer: (payload.correct_answer || '').trim(),
        explanation: payload.explanation || '',
        score: Number(payload.score) || 1,
        source: 'thủ công',
        image_url: (payload.image_url || '').trim().slice(0, 2000),
      })
      .select('id')
      .single()
    sbThrow(error, 'Không lưu được câu hỏi')
    return { id: data.id }
  },

  updateQuestion: async (id, payload) => {
    const { error } = await supabase()
      .from('questions')
      .update({
        subject_id: payload.subject_id,
        topic_id: payload.topic_id || null,
        grade: Number(payload.grade) || 12,
        difficulty: payload.difficulty,
        qtype: payload.qtype,
        content: (payload.content || '').trim(),
        options: payload.options || [],
        correct_answer: (payload.correct_answer || '').trim(),
        explanation: payload.explanation || '',
        score: Number(payload.score) || 1,
        image_url: (payload.image_url || '').trim().slice(0, 2000),
      })
      .eq('id', id)
    sbThrow(error, 'Không cập nhật được câu hỏi')
    return { ok: true }
  },

  deleteQuestion: async (id) => {
    const { error } = await supabase().from('questions').delete().eq('id', id)
    sbThrow(error, 'Không xóa được câu hỏi')
    return { ok: true }
  },

  uploadQuestionImage: async (file) => {
    const sb = supabase()
    const safe = (file.name || 'anh').replace(/[^\w.\-àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/gi, '_')
    const path = `${Date.now()}-${safe}`.slice(0, 120)
    const { error } = await sb.storage.from('question-images').upload(path, file)
    sbThrow(error, 'Upload ảnh thất bại')
    return sb.storage.from('question-images').getPublicUrl(path).data.publicUrl
  },

  createExam: async (payload) => {
    const { data, error } = await supabase()
      .from('exams')
      .insert({
        title: payload.title || 'Đề',
        mode: payload.mode || 'practice',
        duration_min: Number(payload.duration_min) || 45,
        question_ids: payload.question_ids || [],
      })
      .select('id,title,mode')
      .single()
    sbThrow(error, 'Không tạo được đề')
    return data
  },

  getExam: async (id) => {
    const sb = supabase()
    const { data: ex, error } = await sb.from('exams').select('*').eq('id', id).single()
    sbThrow(error, 'Không tìm thấy đề')
    const maps = await getMaps()
    let qs = []
    const ids = Array.isArray(ex.question_ids) ? ex.question_ids : []
    if (ids.length) {
      const { data, error: e2 } = await sb.from('questions').select('*').in('id', ids)
      sbThrow(e2, 'Không tải được câu hỏi của đề')
      const byId = Object.fromEntries((data || []).map((r) => [r.id, r]))
      qs = ids.map((qid) => byId[qid]).filter(Boolean).map((r) => mapQuestion(r, maps))
    }
    return { id: ex.id, title: ex.title, mode: ex.mode, questions: qs }
  },

  submitExam: async (id, payload) => {
    const sb = supabase()
    const answers = payload.answers || []
    const qids = [...new Set(answers.map((a) => a.question_id).filter(Boolean))]
    let byId = {}
    if (qids.length) {
      const { data, error } = await sb.from('questions').select('id,qtype,correct_answer').in('id', qids)
      sbThrow(error, 'Không chấm được bài')
      byId = Object.fromEntries((data || []).map((r) => [r.id, r]))
    }
    let correct = 0
    let total = 0
    const details = answers.map((a) => {
      const qr = byId[a.question_id]
      if (!qr) return { ...a, is_correct: null }
      if (qr.qtype === 'trac_nghiem') {
        total += 1
        const ok =
          String(a.user_answer || '').trim().toUpperCase() === String(qr.correct_answer || '').trim().toUpperCase() &&
          String(a.user_answer || '').trim() !== ''
        if (ok) correct += 1
        return { ...a, is_correct: ok }
      }
      return { ...a, is_correct: null }
    })
    const acc = total ? correct / total : 0
    // exam id fallback (Date.now khi offline): không có trong bảng exams → để null cho khỏi vỡ FK
    let examId = null
    let mode = 'practice'
    if (Number.isFinite(Number(id)) && Number(id) < 1e12) {
      const { data: ex } = await sb.from('exams').select('id,mode').eq('id', id).single()
      if (ex) {
        examId = ex.id
        mode = ex.mode
      }
    }
    const focusLog = Array.isArray(payload.focus_log) ? payload.focus_log.slice(0, 200) : []
    const { data, error } = await sb
      .from('attempts')
      .insert({
        exam_id: examId,
        mode,
        correct,
        total,
        accuracy: acc,
        detail: details,
        student_name: (payload.student_name || '').trim().slice(0, 100),
        focus_exits: Math.max(0, Number(payload.focus_exits) || 0),
        focus_log: focusLog,
      })
      .select('id')
      .single()
    sbThrow(error, 'Không lưu được bài nộp')
    return { attempt_id: data.id, correct, total, accuracy: acc, focus_exits: Math.max(0, Number(payload.focus_exits) || 0) }
  },

  attempts: async (params = {}) => {
    let q = supabase().from('attempts').select('*').order('id', { ascending: false }).limit(200)
    if (params.student_name) q = q.eq('student_name', params.student_name)
    if (params.mode) q = q.eq('mode', params.mode)
    const { data, error } = await q
    sbThrow(error, 'Không tải được lịch sử')
    return (data || []).map(mapAttempt)
  },

  stats: async (params = {}) => {
    const sb = supabase()
    const { count: totalQ } = await sb.from('questions').select('id', { count: 'exact', head: true })
    let aq = sb.from('attempts').select('correct,total,student_name').limit(5000)
    if (params.student_name) aq = aq.eq('student_name', params.student_name)
    const { data: arows, error: ae } = await aq
    sbThrow(ae, 'Không tải được thống kê')
    const list = arows || []
    const c = list.reduce((s, r) => s + (r.correct || 0), 0)
    const t = list.reduce((s, r) => s + (r.total || 0), 0)

    // Độ phủ theo môn
    const [{ data: subjects }, { data: qsubs }] = await Promise.all([
      sb.from('subjects').select('id,name'),
      sb.from('questions').select('subject_id').limit(5000),
    ])
    const counts = {}
    for (const r of qsubs || []) counts[r.subject_id] = (counts[r.subject_id] || 0) + 1
    const bySubject = (subjects || [])
      .map((s) => ({ subject: s.name, count: counts[s.id] || 0 }))
      .sort((a, b) => b.count - a.count)

    // Theo chuyên đề + xếp hạng: gom từ attempts mới nhất
    const { data: det } = await sb
      .from('attempts')
      .select('detail,student_name,correct,total,accuracy,created_at')
      .order('id', { ascending: false })
      .limit(params.student_name ? 2000 : 500)
    const rows = params.student_name ? (det || []).filter((r) => r.student_name === params.student_name) : det || []

    const needQ = new Set()
    for (const a of rows) {
      for (const d of Array.isArray(a.detail) ? a.detail : []) {
        if (d && d.question_id != null) needQ.add(d.question_id)
      }
    }
    const qTopic = {}
    const ids = [...needQ]
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      if (!chunk.length) break
      const { data } = await sb.from('questions').select('id,topic_id').in('id', chunk)
      for (const r of data || []) qTopic[r.id] = r.topic_id
    }
    const { data: topics } = await sb.from('topics').select('id,name')
    const tName = Object.fromEntries((topics || []).map((x) => [x.id, x.name]))
    const tstat = {}
    for (const a of rows) {
      for (const d of Array.isArray(a.detail) ? a.detail : []) {
        if (!d || d.is_correct == null) continue
        const tid = qTopic[d.question_id]
        if (!tid) continue
        const nm = tName[tid] || tid
        const s = (tstat[nm] = tstat[nm] || { topic: nm, done: 0, total: 0 })
        s.total += 1
        if (d.is_correct) s.done += 1
      }
    }
    const byTopic = Object.values(tstat)
      .map((v) => ({ ...v, accuracy: v.total ? v.done / v.total : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy)
    const weak = byTopic.filter((x) => x.accuracy < 0.8).slice(0, 6)

    // Xếp hạng toàn đội (không lọc theo tên)
    let byStudent = []
    if (!params.student_name) {
      const { data: all } = await sb
        .from('attempts')
        .select('student_name,correct,total,accuracy,created_at')
        .order('id', { ascending: false })
        .limit(2000)
      const agg = {}
      for (const r of all || []) {
        if (!r.student_name) continue
        const g = (agg[r.student_name] = agg[r.student_name] || { student_name: r.student_name, attempts: 0, correct: 0, total: 0, last_at: r.created_at })
        g.attempts += 1
        g.correct += r.correct || 0
        g.total += r.total || 0
        if (r.created_at > g.last_at) g.last_at = r.created_at
      }
      byStudent = Object.values(agg)
        .map((g) => ({ ...g, accuracy: g.total ? g.correct / g.total : 0 }))
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 100)
    }

    return {
      total_questions: totalQ ?? 0,
      total_attempts: list.length,
      accuracy: t ? c / t : 0,
      by_subject: bySubject,
      by_topic: byTopic,
      weak_topics: weak,
      by_student: byStudent,
    }
  },

  students: async (params = {}) => {
    let q = supabase().from('students').select('*').order('team').order('name').limit(500)
    if (params.team) q = q.eq('team', params.team)
    if (params.search) q = q.ilike('name', `%${params.search}%`)
    const { data, error } = await q
    sbThrow(error, 'Không tải được danh sách đội')
    return data || []
  },

  createStudent: async (payload) => {
    if (!(payload.name || '').trim()) throw new Error('Thiếu tên học sinh')
    const { data, error } = await supabase()
      .from('students')
      .insert({
        name: payload.name.trim().slice(0, 100),
        class_name: (payload.class_name || '').trim().slice(0, 50),
        team: (payload.team || '').trim().slice(0, 50),
        note: (payload.note || '').trim().slice(0, 500),
      })
      .select('id')
      .single()
    sbThrow(error, 'Không thêm được học sinh')
    return { id: data.id }
  },

  updateStudent: async (id, payload) => {
    const { error } = await supabase()
      .from('students')
      .update({
        name: (payload.name || '').trim().slice(0, 100),
        class_name: (payload.class_name || '').trim().slice(0, 50),
        team: (payload.team || '').trim().slice(0, 50),
        note: (payload.note || '').trim().slice(0, 500),
      })
      .eq('id', id)
    sbThrow(error, 'Không cập nhật được học sinh')
    return { ok: true }
  },

  deleteStudent: async (id) => {
    const { error } = await supabase().from('students').delete().eq('id', id)
    sbThrow(error, 'Không xóa được học sinh')
    return { ok: true }
  },

  previewImportText: async (text) => ({ text, drafts: parseTextToDrafts(text) }),

  uploadImport: async (file) => {
    const text = await extractFileText(file)
    return { filename: file.name, text: text.slice(0, 50000), drafts: parseTextToDrafts(text) }
  },

  bulkQuestions: async (items) => {
    const rows = (items || [])
      .filter((d) => (d.content || '').trim() && d.subject_id)
      .map((d) => ({
        subject_id: d.subject_id,
        topic_id: d.topic_id || null,
        grade: Number(d.grade) || 12,
        difficulty: d.difficulty || 'vận dụng',
        qtype: d.qtype || 'trac_nghiem',
        content: d.content.trim(),
        options: d.options || [],
        correct_answer: (d.correct_answer || '').trim(),
        explanation: d.explanation || '',
        score: Number(d.score) || 1,
        source: 'nhập đề',
        image_url: typeof d.image_url === 'string' ? d.image_url.trim().slice(0, 2000) : '',
      }))
    if (!rows.length) return { inserted: 0 }
    // Chèn theo lô 100 để tránh request quá lớn
    let inserted = 0
    for (let i = 0; i < rows.length; i += 100) {
      const { data, error } = await supabase().from('questions').insert(rows.slice(i, i + 100)).select('id')
      sbThrow(error, 'Lưu thất bại ở lô ' + (i / 100 + 1))
      inserted += (data || []).length
    }
    return { inserted }
  },
}

// ================= HOSTINGER (PHP + MySQL) =================
// Cùng chữ ký với 2 chế độ trên. Tách đề + đọc file làm ở client
// (parseTextToDrafts, mammoth, pdfjs) nên PHP chỉ lo lưu trữ.

async function preq(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (PHP_TOKEN) headers['X-Api-Token'] = PHP_TOKEN
  const res = await fetch(`${PHP_BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    let msg = t.slice(0, 300)
    try {
      const je = JSON.parse(t)
      if (je && je.error) msg = je.error
    } catch {}
    throw new Error(`API ${res.status}: ${msg}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

function pquery(params = {}) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

const phpApi = {
  health: () => preq('/health'),
  subjects: () => preq('/subjects'),
  topics: (subjectId) => preq(`/topics${subjectId ? `?subject_id=${subjectId}` : ''}`),
  createTopic: (payload) => preq('/topics', { method: 'POST', body: JSON.stringify(payload) }),
  questions: (params = {}) => preq(`/questions${pquery({ ...params, limit: params.limit || 200 })}`),
  createQuestion: (payload) => preq('/questions', { method: 'POST', body: JSON.stringify(payload) }),
  updateQuestion: (id, payload) => preq(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteQuestion: (id) => preq(`/questions/${id}`, { method: 'DELETE' }),
  createExam: (payload) => preq('/exams', { method: 'POST', body: JSON.stringify(payload) }),
  getExam: (id) => preq(`/exams/${id}`),
  submitExam: (id, payload) => preq(`/exams/${id}/submit`, { method: 'POST', body: JSON.stringify(payload) }),
  attempts: (params = {}) => preq(`/attempts${pquery(params)}`),
  stats: (params = {}) => preq(`/stats/overview${pquery(params)}`),
  students: (params = {}) => preq(`/students${pquery(params)}`),
  createStudent: (payload) => preq('/students', { method: 'POST', body: JSON.stringify(payload) }),
  updateStudent: (id, payload) => preq(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteStudent: (id) => preq(`/students/${id}`, { method: 'DELETE' }),
  previewImportText: async (text) => ({ text, drafts: parseTextToDrafts(text) }),
  uploadImport: async (file) => {
    const text = await extractFileText(file)
    return { filename: file.name, text: text.slice(0, 50000), drafts: parseTextToDrafts(text) }
  },
  uploadQuestionImage: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await preq('/uploads', { method: 'POST', body: fd })
    if (!r || !r.url) throw new Error('Server không trả về link ảnh.')
    return r.url
  },
  bulkQuestions: (items) => preq('/questions/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
}

// ================= EXPORTS =================

export async function getBackendUrl() {
  if (SUPABASE_MODE) return 'supabase-cloud'
  if (PHP_BASE) return PHP_BASE
  return getBackendUrlLegacy()
}

export function setBackendUrl(url) {
  if (SUPABASE_MODE || PHP_BASE) return
  setBackendUrlLegacy(url)
}

export const api = SUPABASE_MODE ? cloudApi : PHP_BASE ? phpApi : legacyApi
