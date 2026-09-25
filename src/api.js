import { parseTextToDrafts } from './lib/parseImport.js'

const envBaseRaw = (import.meta.env.VITE_API_BASE || '').trim()
const envBase = /^\*+$/.test(envBaseRaw) ? '' : envBaseRaw.replace(/\/+$/, '')
const webOrigin = typeof window !== 'undefined' && window.location.protocol.startsWith('http')
const PHP_BASE = envBase || (webOrigin ? '/api' : '')

export const isPhpMode = Boolean(PHP_BASE)

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
  else {
    localStorage.removeItem('sessionToken')
    if (typeof window !== 'undefined' && 'caches' in window) {
      window.caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key === 'lessons-cache' || key === 'progress-cache').map((key) => window.caches.delete(key)),
      )).catch(() => {})
    }
  }
  if (student) {
    localStorage.setItem('student', JSON.stringify(student))
    if (student.name) localStorage.setItem('studentName', student.name)
  } else {
    localStorage.removeItem('student')
    localStorage.removeItem('studentName')
  }
  try { window.dispatchEvent(new Event('session-changed')) } catch {}
}

function expireSessionOn401(status) {
  if (status === 401 && localStorage.getItem('sessionToken')) setSession('', null)
}

function sessionHeaders() {
  const t = localStorage.getItem('sessionToken')
  const schoolId = localStorage.getItem('hsg-school-id')
  const headers = t ? { 'X-Session-Token': t } : {}
  if (schoolId) headers['X-School-ID'] = schoolId
  return headers
}

async function preq(path, options = {}) {
  const headers = { ...(options.headers || {}), ...sessionHeaders() }
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isForm) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${PHP_BASE}${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout?.(30000),
  })
  if (!res.ok) {
    expireSessionOn401(res.status)
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
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null && v !== false) q.append(k, v) })
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function aiStream(path, payload, onEvent, signal) {
  const headers = { 'Content-Type': 'application/json', ...sessionHeaders() }
  const res = await fetch(`${PHP_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(payload), signal })
  if (!res.ok) {
    expireSessionOn401(res.status)
    const t = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${t.slice(0, 300)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let ev = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      try { onEvent({ event: ev, data: JSON.parse(data) }) } catch {}
    }
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
  uploadAvatar: async (fd) => {
    const r = await call('/me/avatar', { method: 'POST', body: fd })
    if (r?.student) setSession(localStorage.getItem('sessionToken'), r.student)
    return r
  },
  removeAvatar: () => call('/me/avatar', { method: 'DELETE' }),
})

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
  aiGenerate: (payload) => call('/ai/generate', { method: 'POST', body: JSON.stringify(payload) }),
  flashcards: (topic_id) => call('/flashcards' + qs({ topic_id })),
  createFlashcards: (payload) => call('/flashcards', { method: 'POST', body: JSON.stringify(payload) }),
  updateFlashcard: (id, payload) => call(`/flashcards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteFlashcard: (id) => call(`/flashcards/${id}`, { method: 'DELETE' }),
  reviewFlashcard: (id, quality) => call(`/flashcards/${id}/review`, { method: 'POST', body: JSON.stringify({ quality }) }),
  topicsTree: (subjectId) => call('/topics' + qs({ subject_id: subjectId || undefined, tree: 1 })),
  lessonBlocks: (lid) => call(`/lessons/${lid}/blocks`),
  createBlock: (lid, payload) => call(`/lessons/${lid}/blocks`, { method: 'POST', body: JSON.stringify(payload) }),
  updateBlock: (id, payload) => call(`/blocks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteBlock: (id) => call(`/blocks/${id}`, { method: 'DELETE' }),
})

export const api = {
  health: () => preq('/health'),

  // Auth + session
  ...authMethods(preq),

  // Legacy-compatible content routes
  subjects: () => preq('/subjects'),
  topics: (subjectId) => preq(`/topics${pquery({ subject_id: subjectId })}`),
  createTopic: (payload) => preq('/topics', { method: 'POST', body: JSON.stringify(payload) }),
  questions: (params = {}) => preq(`/questions${pquery({ ...params, limit: params.limit || 200 })}`),
  createQuestion: (payload) => preq('/questions', { method: 'POST', body: JSON.stringify(payload) }),
  updateQuestion: (id, payload) => preq(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteQuestion: (id) => preq(`/questions/${id}`, { method: 'DELETE' }),
  createExam: (payload) => preq('/exams', { method: 'POST', body: JSON.stringify(payload) }),
  listExams: (mode = 'shared') => preq(`/exams${pquery({ mode: mode || 'shared' })}`),
  getExam: (id, preview = false) => preq(`/exams/${id}${preview ? '?preview=1' : ''}`),
  submitExam: (id, payload) => preq(`/exams/${id}/submit`, { method: 'POST', body: JSON.stringify(payload) }),
  attempts: (params = {}) => preq(`/attempts${pquery(params)}`),
  stats: (params = {}) => preq(`/stats/overview${pquery(params)}`),
  students: (params = {}) => preq(`/students${pquery(params)}`),
  createStudent: (payload) => preq('/students', { method: 'POST', body: JSON.stringify(payload) }),
  updateStudent: (id, payload) => preq(`/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteStudent: (id) => preq(`/students/${id}`, { method: 'DELETE' }),
  leaderboard: (params = {}) => preq(`/stats/leaderboard${pquery(params)}`),
  mySubjects: () => preq('/me/subjects'),
  ...mvpMethods(preq, pquery),
  ...schoolMethods(preq, pquery),

  // School/team administration (tenant v2)
  contexts: () => preq('/v2/me/contexts'),
  createSchool: (payload) => preq('/v2/schools', { method: 'POST', body: JSON.stringify(payload) }),
  updateSchool: (schoolId, payload) => preq(`/v2/schools/${schoolId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  breakGlassGrants: () => preq('/v2/break-glass'),
  createBreakGlassGrant: (payload) => preq('/v2/break-glass', { method: 'POST', body: JSON.stringify(payload) }),
  revokeBreakGlassGrant: (grantId) => preq(`/v2/break-glass/${grantId}`, { method: 'DELETE' }),
  systemRoles: () => preq('/v2/system-roles'),
  grantSystemRole: (userId) => preq('/v2/system-roles', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  revokeSystemRole: (userId) => preq(`/v2/system-roles/${userId}`, { method: 'DELETE' }),
  schoolSubjects: (schoolId) => preq(`/v2/schools/${schoolId}/subjects`),
  createSchoolSubject: (schoolId, payload) => preq(`/v2/schools/${schoolId}/subjects`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolSubject: (schoolId, subjectId, payload) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  archiveSchoolSubject: (schoolId, subjectId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}`, { method: 'DELETE' }),
  v2SchoolYears: (schoolId) => preq(`/v2/schools/${schoolId}/years`),
  createV2SchoolYear: (schoolId, payload) => preq(`/v2/schools/${schoolId}/years`, { method: 'POST', body: JSON.stringify(payload) }),
  updateV2SchoolYear: (schoolId, yearId, payload) => preq(`/v2/schools/${schoolId}/years/${yearId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  schoolGrades: (schoolId) => preq(`/v2/schools/${schoolId}/grades`),
  createSchoolGrade: (schoolId, payload) => preq(`/v2/schools/${schoolId}/grades`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolGrade: (schoolId, gradeId, payload) => preq(`/v2/schools/${schoolId}/grades/${gradeId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  schoolClasses: (schoolId) => preq(`/v2/schools/${schoolId}/classes`),
  createSchoolClass: (schoolId, payload) => preq(`/v2/schools/${schoolId}/classes`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolClass: (schoolId, classId, payload) => preq(`/v2/schools/${schoolId}/classes/${classId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  archiveSchoolClass: (schoolId, classId) => preq(`/v2/schools/${schoolId}/classes/${classId}`, { method: 'DELETE' }),
  schoolClassMembers: (schoolId, classId) => preq(`/v2/schools/${schoolId}/classes/${classId}/members`),
  addSchoolClassMember: (schoolId, classId, userId) => preq(`/v2/schools/${schoolId}/classes/${classId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  removeSchoolClassMember: (schoolId, classId, userId) => preq(`/v2/schools/${schoolId}/classes/${classId}/members/${userId}`, { method: 'DELETE' }),
  schoolUsers: (schoolId) => preq(`/v2/schools/${schoolId}/users`),
  createSchoolUser: (schoolId, payload) => preq(`/v2/schools/${schoolId}/users`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolUser: (schoolId, userId, payload) => preq(`/v2/schools/${schoolId}/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  removeSchoolUser: (schoolId, userId) => preq(`/v2/schools/${schoolId}/users/${userId}`, { method: 'DELETE' }),
  createSchoolTeam: (schoolId, subjectId, payload) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams`, { method: 'POST', body: JSON.stringify(payload) }),
  updateSchoolTeam: (schoolId, subjectId, teamId, payload) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  archiveSchoolTeam: (schoolId, subjectId, teamId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}`, { method: 'DELETE' }),
  schoolTeamMembers: (schoolId, subjectId, teamId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}/members`),
  linkClassToTeam: (schoolId, subjectId, teamId, classId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}/classes/${classId}`, { method: 'POST', body: '{}' }),
  unlinkClassFromTeam: (schoolId, subjectId, teamId, classId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}/classes/${classId}`, { method: 'DELETE' }),
  updateTeamMember: (schoolId, subjectId, teamId, userId, payload) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}/members/${userId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  schoolTeams: (schoolId, subjectId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams`),
  allSchoolTeams: (schoolId) => preq(`/v2/schools/${schoolId}/teams`),
  team: (schoolId, subjectId, teamId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}`),
  teamModules: (schoolId, subjectId, teamId) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}/modules`),
  updateTeamModule: (schoolId, subjectId, teamId, moduleCode, payload) => preq(`/v2/schools/${schoolId}/subjects/${encodeURIComponent(subjectId)}/teams/${teamId}/modules/${encodeURIComponent(moduleCode)}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  // Import + uploads
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
  uploadAnyFile: async (file, teamId = 0, ownerType = 'upload', ownerId = '') => {
    const fd = new FormData()
    fd.append('file', file)
    if (teamId) fd.append('team_id', String(teamId))
    if (ownerType) fd.append('owner_type', ownerType)
    if (ownerId) fd.append('owner_id', String(ownerId))
    const r = await preq('/uploads', { method: 'POST', body: fd })
    if (!r || !r.url) throw new Error('Server không trả về link file.')
    return r.url
  },
  bulkQuestions: (items) => preq('/questions/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
  aiGenerate: (payload) => preq('/ai/generate', { method: 'POST', body: JSON.stringify(payload) }),
  parseQuestions: (text) => preq('/ai/generate', { method: 'POST', body: JSON.stringify({ type: 'parse', text }) }).then((r) => (Array.isArray(r?.data?.questions) ? r.data.questions : [])),
  aiGenerateStream: (payload, onEvent, signal) => aiStream('/ai/generate-stream', payload, onEvent, signal),
}

export function getBackendUrl() {
  return PHP_BASE
}

export function setBackendUrl() {
}
