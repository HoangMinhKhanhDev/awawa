// Client API 2 chế độ (chỉ dùng database Hostinger + LAN local):
// - HOSTINGER (PHP + MySQL): khi có VITE_API_BASE, VD:
//   VITE_API_BASE=https://awawa.herbspalab.com/api
// - LEGACY (Python core FastAPI + SQLite): giữ nguyên cho chạy LAN/tunnel/Electron offline.
// Giữ nguyên chữ ký hàm để các pages không phải sửa.

import { parseTextToDrafts } from './lib/parseImport.js'

// Chế độ Hostinger (PHP + MySQL): khi có VITE_API_BASE, VD:
//   VITE_API_BASE=https://herbspalab.com/api
// Ưu tiên PHP (Hostinger), cuối cùng là Python LAN cũ.
const PHP_BASE = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '')
const PHP_TOKEN = import.meta.env.VITE_API_TOKEN || ''
export const isPhpMode = Boolean(PHP_BASE)

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

// ================= AUTH HỌC SINH (session) =================

export function getSession() {
  try {
    return {
      token: localStorage.getItem('sessionToken') || '',
      student: JSON.parse(localStorage.getItem('student') || 'null'),
    }
  } catch { return { token: '', student: null } }
}

export function setSession(token, student) {
  if (token) localStorage.setItem('sessionToken', token)
  else localStorage.removeItem('sessionToken')
  if (student) {
    localStorage.setItem('student', JSON.stringify(student))
    if (student.name) localStorage.setItem('studentName', student.name)
  } else {
    localStorage.removeItem('student')
  }
  try { window.dispatchEvent(new Event('session-changed')) } catch {}
}

function sessionHeaders() {
  const t = localStorage.getItem('sessionToken')
  return t ? { 'X-Session-Token': t } : {}
}

// call(path, options) — legacy truyền (p, o) => req('/api' + p, o), php truyền preq
const authMethods = (call) => ({
  register: async (payload) => {
    const r = await call('/auth/register', { method: 'POST', body: JSON.stringify(payload) })
    setSession(r.token, r.student)
    return r
  },
  login: async (payload) => {
    const r = await call('/auth/login', { method: 'POST', body: JSON.stringify(payload) })
    setSession(r.token, r.student)
    return r
  },
  me: () => call('/auth/me'),
  logout: async () => {
    try { await call('/auth/logout', { method: 'POST' }) } catch {}
    setSession('', null)
    return { ok: true }
  },
  updateProfile: async (payload) => {
    const r = await call('/auth/profile', { method: 'PUT', body: JSON.stringify(payload) })
    // Chỉ set lại token khi có token thật — tránh xóa token cũ khi API không trả
    const t = localStorage.getItem('sessionToken')
    setSession(t || '', r.student)
    return r
  },
  changePassword: async (payload) => {
    const r = await call('/auth/password', { method: 'PUT', body: JSON.stringify(payload) })
    if (r.token) setSession(r.token, getSession().student)
    return r
  },
  resetStudentPassword: (id, password) => call(`/students/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  setStudentActive: (id, active) => call(`/students/${id}/active`, { method: 'PUT', body: JSON.stringify({ active: active ? 1 : 0 }) }),
  bulkStudents: (payload) => call('/students/bulk', { method: 'POST', body: JSON.stringify(payload) }),
  permissions: () => call('/permissions'),
  updatePermissions: (payload) => call('/permissions', { method: 'PUT', body: JSON.stringify(payload) }),
})

// Cấu trúc nhà trường (Phase 1a) — admin: CRUD; staff: đọc
const schoolMethods = (call, qs) => ({
  schoolYears: () => call('/school-years'),
  createSchoolYear: (payload) => call('/school-years', { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolYear: (id, payload) => call(`/school-years/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSchoolYear: (id) => call(`/school-years/${id}`, { method: 'DELETE' }),
  grades: (params = {}) => call('/grades' + qs(params)),
  createGrade: (payload) => call('/grades', { method: 'POST', body: JSON.stringify(payload) }),
  updateGrade: (id, payload) => call(`/grades/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteGrade: (id) => call(`/grades/${id}`, { method: 'DELETE' }),
  teams: (params = {}) => call('/teams' + qs(params)),
  myTeams: () => call('/me/teams'),
  createTeam: (payload) => call('/teams', { method: 'POST', body: JSON.stringify(payload) }),
  updateTeam: (id, payload) => call(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTeam: (id) => call(`/teams/${id}`, { method: 'DELETE' }),
  teamMembers: (id) => call(`/teams/${id}/members`),
  addTeamMember: (id, payload) => call(`/teams/${id}/members`, { method: 'POST', body: JSON.stringify(payload) }),
  removeTeamMember: (id, uid) => call(`/teams/${id}/members/${uid}`, { method: 'DELETE' }),
})

// MVP: lop, bai tap, cham diem, tien do
// call(path, options) nhu authMethods; qs(params) => "?a=b" hoac "" cho legacy
const mvpMethods = (call, qs) => ({
  classes: () => call('/classes'),
  createClass: (payload) => call('/classes', { method: 'POST', body: JSON.stringify(payload) }),
  joinClass: (join_code) => call('/classes/join', { method: 'POST', body: JSON.stringify({ join_code }) }),
  classMembers: (id) => call(`/classes/${id}/members`),
  assignments: (params = {}) => call('/assignments' + qs(params)),
  getAssignment: (id) => call(`/assignments/${id}`),
  createAssignment: (payload) => call('/assignments', { method: 'POST', body: JSON.stringify(payload) }),
  submitAssignment: (id, answers, files = []) => call(`/assignments/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers, files }) }),
  draftAssignment: (id, answers, files = []) => call(`/assignments/${id}/draft`, { method: 'POST', body: JSON.stringify({ answers, files }) }),
  assignmentSubmissions: (id) => call(`/assignments/${id}/submissions`),
  gradeSubmission: (sid, payload) => call(`/submissions/${sid}/grade`, { method: 'PUT', body: JSON.stringify(payload) }),
  myResults: () => call('/me/results'),
  myProgress: () => call('/me/progress'),
  classOverview: () => call('/stats/class-overview'),
  lessons: (topic_id) => call('/lessons' + qs({ topic_id })),
  createLesson: (payload) => call('/lessons', { method: 'POST', body: JSON.stringify(payload) }),
  updateLesson: (id, payload) => call(`/lessons/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteLesson: (id) => call(`/lessons/${id}`, { method: 'DELETE' }),
  moveLesson: (id, direction) => call(`/lessons/${id}/move${qs({ direction })}`, { method: 'POST', body: '{}' }),
  completeLesson: (id, undo = false) => call(`/lessons/${id}/complete`, { method: 'POST', body: JSON.stringify({ undo }) }),
  gradeHistory: (sid) => call(`/submissions/${sid}/grade-history`),
  materials: (params = {}) => call('/materials' + qs(params)),
  createMaterial: (payload) => call('/materials', { method: 'POST', body: JSON.stringify(payload) }),
  deleteMaterial: (id) => call(`/materials/${id}`, { method: 'DELETE' }),
  notifications: (params = {}) => call('/notifications' + qs(params)),
  markNotificationsRead: (id = null) => call('/notifications/read', { method: 'POST', body: JSON.stringify({ id }) }),
  teamTimeline: (params = {}) => call('/stats/team-timeline' + qs(params)),
  forgotPassword: (payload) => call('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload) => call('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  updateTopic: (id, payload) => call(`/topics/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTopic: (id) => call(`/topics/${id}`, { method: 'DELETE' }),
  getQuestion: (id) => call(`/questions/${id}`),
  duplicateQuestion: (id) => call(`/questions/${id}/duplicate`, { method: 'POST', body: '{}' }),
  // AI (Agnes) — server proxy, key khong ra client
  aiGenerate: (payload) => call('/ai/generate', { method: 'POST', body: JSON.stringify(payload) }),
  // Flashcards
  flashcards: (topic_id) => call('/flashcards' + qs({ topic_id })),
  createFlashcards: (payload) => call('/flashcards', { method: 'POST', body: JSON.stringify(payload) }),
  updateFlashcard: (id, payload) => call(`/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFlashcard: (id) => call(`/flashcards/${id}`, { method: 'DELETE' }),
  reviewFlashcard: (id, quality) => call(`/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ quality }) }),
})

async function req(path, options = {}) {
  const base = await getBackendUrlLegacy()
  const extra = /ngrok/i.test(base) ? { 'ngrok-skip-browser-warning': 'true' } : {}
  // Spread options TRƯỚC headers để options.headers của caller không nuốt Content-Type/token
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...extra, ...sessionHeaders(), ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout?.(30000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${t.slice(0, 300)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.text().then((t) => JSON.parse(t))
  // Trả về text chỉ khi caller kỳ vọng (health check); còn lại cảnh báo — tránh .map crash
  const text = await res.text()
  if (path.includes('/health')) return text
  throw new Error(`API ${res.status}: Phản hồi không phải JSON (${ct || 'rỗng'}).`)
}

// Đọc text từ file .txt/.docx/.pdf ở client (dùng cho Nhập đề ở chế độ PHP).
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
  getQuestion: (id) => req(`/api/questions/${id}`),
  createQuestion: (payload) => req('/api/questions', { method: 'POST', body: JSON.stringify(payload) }),
  updateQuestion: (id, payload) => req(`/api/questions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteQuestion: (id) => req(`/api/questions/${id}`, { method: 'DELETE' }),
  duplicateQuestion: (id) => req(`/api/questions/${id}/duplicate`, { method: 'POST', body: '{}' }),
  createExam: (payload) => req('/api/exams', { method: 'POST', body: JSON.stringify(payload) }),
  listExams: (mode = 'shared') => req(`/api/exams?mode=${encodeURIComponent(mode || 'shared')}`),
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
  leaderboard: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/stats/leaderboard${s ? `?${s}` : ''}`)
  },
  ...authMethods((p, o) => req('/api' + p, o)),
  ...mvpMethods((p, o) => req('/api' + p, o), (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return s ? `?${s}` : ''
  }),
  // Endpoints mới GĐ2–5 (legacy Python)
  ...schoolMethods((p, o) => req('/api' + p, o), (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return s ? `?${s}` : ''
  }),
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
  materials: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/materials${s ? `?${s}` : ''}`)
  },
  createMaterial: (payload) => req('/api/materials', { method: 'POST', body: JSON.stringify(payload) }),
  deleteMaterial: (id) => req(`/api/materials/${id}`, { method: 'DELETE' }),
  notifications: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null && v !== false) q.append(k, v) })
    const s = q.toString()
    return req(`/api/notifications${s ? `?${s}` : ''}`)
  },
  markNotificationsRead: (id = null) => req('/api/notifications/read', { method: 'POST', body: JSON.stringify({ id }) }),
  teamTimeline: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.append(k, v) })
    const s = q.toString()
    return req(`/api/stats/team-timeline${s ? `?${s}` : ''}`)
  },
  gradeHistory: (sid) => req(`/api/submissions/${sid}/grade-history`),
  forgotPassword: (payload) => req('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload) => req('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  updateTopic: (id, payload) => req(`/api/topics/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTopic: (id) => req(`/api/topics/${id}`, { method: 'DELETE' }),
  updateLesson: (id, payload) => req(`/api/lessons/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteLesson: (id) => req(`/api/lessons/${id}`, { method: 'DELETE' }),
  moveLesson: (id, direction) => req(`/api/lessons/${id}/move?direction=${direction}`, { method: 'POST', body: '{}' }),
  bulkStudents: (payload) => req('/api/students/bulk', { method: 'POST', body: JSON.stringify(payload) }),
  permissions: () => req('/api/permissions'),
  updatePermissions: (payload) => req('/api/permissions', { method: 'PUT', body: JSON.stringify(payload) }),
  uploadAnyFile: async (file) => {
    const base = await getBackendUrlLegacy()
    const fd = new FormData()
    fd.append('file', file)
    const extra = /ngrok/i.test(base) ? { 'ngrok-skip-browser-warning': 'true' } : {}
    const res = await fetch(`${base}/api/import/upload`, { method: 'POST', headers: { ...extra, ...sessionHeaders() }, body: fd })
    if (!res.ok) throw new Error(`Upload lỗi ${res.status}`)
    const j = await res.json()
    return j.filename || file.name
  },
}

// ================= HOSTINGER (PHP + MySQL) =================
// Cùng chữ ký với 2 chế độ trên. Tách đề + đọc file làm ở client
// (parseTextToDrafts, mammoth, pdfjs) nên PHP chỉ lo lưu trữ.

async function preq(path, options = {}) {
  const headers = { ...(options.headers || {}), ...sessionHeaders() }
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (PHP_TOKEN) headers['X-Api-Token'] = PHP_TOKEN
  const res = await fetch(`${PHP_BASE}${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout?.(30000),
  })
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
  if (ct.includes('application/json')) return res.text().then((t) => JSON.parse(t))
  const text = await res.text()
  if (path.includes('/health')) return text
  throw new Error(`API ${res.status}: Phản hồi không phải JSON (${ct || 'rỗng'}).`)
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
  listExams: (mode = 'shared') => preq(`/exams${pquery({ mode: mode || 'shared' })}`),
  getExam: (id) => preq(`/exams/${id}`),
  submitExam: (id, payload) => preq(`/exams/${id}/submit`, { method: 'POST', body: JSON.stringify(payload) }),
  attempts: (params = {}) => preq(`/attempts${pquery(params)}`),
  stats: (params = {}) => preq(`/stats/overview${pquery(params)}`),
  students: (params = {}) => preq(`/students${pquery(params)}`),
  createStudent: (payload) => preq('/students', { method: 'POST', body: JSON.stringify(payload) }),
  updateStudent: (id, payload) => preq(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteStudent: (id) => preq(`/students/${id}`, { method: 'DELETE' }),
  leaderboard: (params = {}) => preq(`/stats/leaderboard${pquery(params)}`),
  setStudentActive: (id, active) => preq(`/students/${id}/active`, { method: 'PUT', body: JSON.stringify({ active: active ? 1 : 0 }) }),
  ...authMethods(preq),
  ...mvpMethods(preq, pquery),
  ...schoolMethods(preq, pquery),
  // Đè lại chữ ký mvpMethods cho legacy (req đã bọc /api) — PHP dùng preq path trần
  updateTopic: (id, payload) => preq(`/topics/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTopic: (id) => preq(`/topics/${id}`, { method: 'DELETE' }),
  getQuestion: (id) => preq(`/questions/${id}`),
  duplicateQuestion: (id) => preq(`/questions/${id}/duplicate`, { method: 'POST', body: '{}' }),
  updateLesson: (id, payload) => preq(`/lessons/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteLesson: (id) => preq(`/lessons/${id}`, { method: 'DELETE' }),
  moveLesson: (id, direction) => preq(`/lessons/${id}/move${pquery({ direction })}`, { method: 'POST', body: '{}' }),
  gradeHistory: (sid) => preq(`/submissions/${sid}/grade-history`),
  materials: (params = {}) => preq(`/materials${pquery(params)}`),
  createMaterial: (payload) => preq('/materials', { method: 'POST', body: JSON.stringify(payload) }),
  deleteMaterial: (id) => preq(`/materials/${id}`, { method: 'DELETE' }),
  notifications: (params = {}) => preq(`/notifications${pquery(params)}`),
  markNotificationsRead: (id = null) => preq('/notifications/read', { method: 'POST', body: JSON.stringify({ id }) }),
  teamTimeline: (params = {}) => preq(`/stats/team-timeline${pquery(params)}`),
  forgotPassword: (payload) => preq('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload) => preq('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
  bulkStudents: (payload) => preq('/students/bulk', { method: 'POST', body: JSON.stringify(payload) }),
  permissions: () => preq('/permissions'),
  updatePermissions: (payload) => preq('/permissions', { method: 'PUT', body: JSON.stringify(payload) }),
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
  // Upload file tự luận / học liệu (GV + HS) — mở rộng accept so với upload ảnh
  uploadAnyFile: async (file) => {
    const fd = new FormData()
    fd.append('file', file)
    const r = await preq('/uploads', { method: 'POST', body: fd })
    if (!r || !r.url) throw new Error('Server không trả về link file.')
    return r.url
  },
  bulkQuestions: (items) => preq('/questions/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
}

// ================= EXPORTS =================

export async function getBackendUrl() {
  if (PHP_BASE) return PHP_BASE
  return getBackendUrlLegacy()
}

export function setBackendUrl(url) {
  if (PHP_BASE) return
  setBackendUrlLegacy(url)
}

export const api = PHP_BASE ? phpApi : legacyApi
