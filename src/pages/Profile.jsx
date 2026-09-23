import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleUserRound, ChartLine, ClipboardList, History, KeyRound, LogOut, Pencil, Trophy, Users, PenLine, BookOpen } from 'lucide-react'
import { api, getSession, setSession } from '../api.js'

function errMsg(e) {
  const m = String(e?.message || e || 'Có lỗi xảy ra')
  return m.replace(/^API \d+: /, '')
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('vi-VN')
  } catch {
    return '—'
  }
}

function fmtDay(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

function roleLabel(role) {
  if (role === 'admin') return 'Quản trị'
  return role === 'teacher' ? 'Giáo viên' : 'Học sinh'
}

const AUTH_TABS = [
  { id: 'login', label: 'Đăng nhập' },
  { id: 'register', label: 'Đăng ký' },
]

const PROFILE_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: ChartLine },
  { id: 'results', label: 'Kết quả', icon: Trophy },
  { id: 'activity', label: 'Hoạt động', icon: History },
  { id: 'account', label: 'Tài khoản', icon: KeyRound },
]

const TEACHER_TABS = [
  { id: 'overview', label: 'Tổng quan', icon: ChartLine },
  { id: 'students', label: 'Lớp học', icon: Users },
  { id: 'account', label: 'Tài khoản', icon: KeyRound },
]

export default function Profile() {
  const [student, setStudent] = useState(() => getSession().student)
  const [authTab, setAuthTab] = useState('login')
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [login, setLogin] = useState({ login: '', password: '' })
  const [reg, setReg] = useState({ name: '', class_name: '', dob: '', gender: '', phone: '', email: '', password: '', password2: '', teacher_code: '' })
  const [pw, setPw] = useState({ old_password: '', new_password: '', new_password2: '' })
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState([])
  const [attempts, setAttempts] = useState([])
  const [classOv, setClassOv] = useState(null)
  const [students, setStudents] = useState([])
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')

  const isTeacher = (student?.role || 'student') === 'teacher' || (student?.role || 'student') === 'admin'
  const isAdmin = (student?.role || 'student') === 'admin'
  const tabs = isTeacher ? TEACHER_TABS : PROFILE_TABS

  useEffect(() => {
    const s = getSession()
    if (!s.token) return
    api.me().then((r) => {
      setSession(s.token, r.student)
      setStudent(r.student)
    }).catch(() => {
      setSession('', null)
      setStudent(null)
    })
  }, [])

  useEffect(() => {
    if (!student) return
    if (!isTeacher) {
      setProgress(null)
      setResults([])
      setAttempts([])
      setClassOv(null)
      setStudents([])
      return
    }
    let alive = true
    Promise.all([
      api.classOverview().catch(() => null),
      api.students().catch(() => []),
    ]).then(([ov, st]) => {
      if (!alive) return
      setClassOv(ov)
      setStudents((st || []).filter((s) => (s.role || 'student') !== 'teacher'))
    })
    return () => { alive = false }
    // eslint-disable-next-line
  }, [student?.id, isTeacher])

  useEffect(() => {
    if (!student || isTeacher) {
      if (isTeacher) {
        setProgress(null)
        setResults([])
        setAttempts([])
      }
      return
    }
    let alive = true
    Promise.all([
      api.myProgress().catch(() => null),
      api.myResults().catch(() => ({ results: [] })),
      api.attempts().catch(() => []),
    ]).then(([p, r, a]) => {
      if (!alive) return
      setProgress(p)
      setResults(r?.results || [])
      setAttempts(a || [])
    })
    return () => { alive = false }
    // eslint-disable-next-line
  }, [student?.id, isTeacher])

  useEffect(() => {
    if (student) setEmailDraft(student.email || '')
  }, [student?.email])

  const doLogin = async () => {
    if (!login.login.trim() || !login.password) return setMsg('Nhập tên đăng nhập (SĐT hoặc email) và mật khẩu.')
    setBusy(true); setMsg('')
    try {
      const r = await api.login({ login: login.login.trim(), password: login.password })
      setStudent(r.student)
      setTab('overview')
      setMsg('')
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }

  const doRegister = async () => {
    if (!reg.name.trim()) return setMsg('Nhập họ tên.')
    if (!reg.class_name.trim()) return setMsg('Nhập lớp.')
    if (!reg.phone.trim() && !reg.email.trim()) return setMsg('Cần số điện thoại hoặc email (ít nhất 1 trong 2).')
    if ((reg.password || '').length < 6) return setMsg('Mật khẩu ít nhất 6 ký tự.')
    if (reg.password !== reg.password2) return setMsg('Nhập lại mật khẩu chưa khớp.')
    setBusy(true); setMsg('')
    try {
      const r = await api.register({
        name: reg.name.trim(), class_name: reg.class_name.trim(),
        dob: reg.dob || '', gender: reg.gender || '',
        phone: reg.phone.trim(), email: reg.email.trim(), password: reg.password,
        teacher_code: reg.teacher_code.trim(),
      })
      setStudent(r.student)
      setTab('overview')
      setMsg('')
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }

  const doLogout = async () => {
    await api.logout().catch(() => {})
    setStudent(null)
    setAuthTab('login')
    setTab('overview')
    setMsg('')
  }

  const saveEmail = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await api.updateProfile({ email: (emailDraft || '').trim() })
      setStudent(r.student)
      setEditingEmail(false)
      setMsg('Đã cập nhật email.')
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }

  const savePassword = async () => {
    if ((pw.new_password || '').length < 6) return setMsg('Mật khẩu mới ít nhất 6 ký tự.')
    if (pw.new_password !== pw.new_password2) return setMsg('Nhập lại mật khẩu mới chưa khớp.')
    setBusy(true); setMsg('')
    try {
      await api.changePassword({ old_password: pw.old_password, new_password: pw.new_password })
      setPw({ old_password: '', new_password: '', new_password2: '' })
      setMsg('Đã đổi mật khẩu.')
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }

  const activities = useMemo(() => {
    const fromResults = results.map((r) => ({
      key: `s${r.id}`,
      date: r.graded_at || r.submitted_at,
      title: r.score != null ? `Hoàn thành ${r.title}` : `Nộp ${r.title}`,
      meta: r.topic_name || 'Chuyên đề chung',
      score: r.score ?? null,
      feedback: r.feedback || '',
      kind: 'assign',
    }))
    const fromAttempts = attempts.map((a) => ({
      key: `a${a.id}`,
      date: a.created_at,
      title: a.mode === 'exam' ? 'Thi thử bấm giờ' : 'Luyện tập',
      meta: a.total ? `${a.correct}/${a.total} câu đúng` : '',
      score: null,
      pct: a.accuracy != null ? Math.round((a.accuracy || 0) * 100) : null,
      kind: 'attempt',
    }))
    return [...fromResults, ...fromAttempts]
      .filter((x) => x.date || x.title)
      .sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))
  }, [results, attempts])

  const pct = Math.round((progress?.overall_ratio ?? progress?.ratio ?? 0) * 100)
  const pending = results.filter((r) => r.score == null).length
  const gradedCount = results.filter((r) => r.score != null).length
  const initial = (student?.name || '?').trim().charAt(0).toUpperCase()
  const loginId = student?.phone || student?.email || '—'
  const role = roleLabel(student?.role)

  // ---------- Chưa có tài khoản ----------
  if (!student) {
    return (
      <div className="grid">
        <div className="card">
          <h1 style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><CircleUserRound className="icn" />Hồ sơ học sinh</h1>
          <div className="small muted">Đăng nhập để nộp bài đúng tên, xem tiến độ của mình. Chưa có tài khoản? Học sinh <b>tự đăng ký</b> miễn phí — cần <b>số điện thoại hoặc email</b> (1 trong 2) làm tên đăng nhập.</div>
          <div className="row" style={{ marginTop: 10 }}>
            {AUTH_TABS.map((t) => (
              <button
                key={t.id}
                className={`btn ${authTab === t.id ? 'primary' : ''}`}
                onClick={() => { setAuthTab(t.id); setMsg('') }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {authTab === 'login' ? (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Đăng nhập</h3>
            <label className="lbl">SĐT hoặc email *</label>
            <input className="input" placeholder="VD: 0901234567" value={login.login} onChange={(e) => setLogin({ ...login, login: e.target.value })} />
            <label className="lbl" style={{ marginTop: 8 }}>Mật khẩu *</label>
            <input className="input" type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={doLogin} disabled={busy}>{busy ? 'Đang vào…' : 'Đăng nhập'}</button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>Quên mật khẩu? Nhờ giáo viên đặt lại ở trang Đội tuyển.</div>
          </div>
        ) : (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Đăng ký tài khoản</h3>
            <label className="lbl">Họ tên *</label>
            <input className="input" placeholder="VD: Nguyễn Văn A" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
            <div className="grid c2" style={{ marginTop: 8 }}>
              <div>
                <label className="lbl">Lớp *</label>
                <input className="input" placeholder="VD: 11A1" value={reg.class_name} onChange={(e) => setReg({ ...reg, class_name: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Ngày sinh</label>
                <input className="input" type="date" value={reg.dob} onChange={(e) => setReg({ ...reg, dob: e.target.value })} />
              </div>
            </div>
            <div className="grid c2" style={{ marginTop: 8 }}>
              <div>
                <label className="lbl">Giới tính</label>
                <select className="select" value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })}>
                  <option value="">— Chọn —</option>
                  <option>Nam</option>
                  <option>Nữ</option>
                  <option>Khác</option>
                </select>
              </div>
              <div>
                <label className="lbl">Số điện thoại</label>
                <input className="input" inputMode="tel" placeholder="VD: 0901234567" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} />
              </div>
            </div>
            <label className="lbl" style={{ marginTop: 8 }}>Email (tùy chọn — cần SĐT hoặc email)</label>
            <input className="input" inputMode="email" placeholder="VD: ban@email.com" value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} />
            <div className="grid c2" style={{ marginTop: 8 }}>
              <div>
                <label className="lbl">Mật khẩu * (≥ 6 ký tự)</label>
                <input className="input" type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Nhập lại mật khẩu *</label>
                <input className="input" type="password" value={reg.password2} onChange={(e) => setReg({ ...reg, password2: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={doRegister} disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
            </div>
            <label className="lbl" style={{ marginTop: 8 }}>Mã giáo viên (chỉ giáo viên mới có — học sinh bỏ trống)</label>
            <input className="input" autoComplete="off" value={reg.teacher_code} onChange={(e) => setReg({ ...reg, teacher_code: e.target.value })} />
          </div>
        )}
        {msg && <div className="card"><div className="small" style={{ color: '#b91c1c' }}>{msg}</div></div>}
      </div>
    )
  }

  // ---------- Đã đăng nhập ----------
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id
  return (
    <div className="grid">
      <div className="card">
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <div className="avatar" aria-hidden="true">{initial}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ margin: 0 }}>{student.name}</h1>
            <div className="small muted" style={{ marginTop: 2 }}>
              {role}
              {student.class_name ? ` · Lớp ${student.class_name}` : ''}
              {student.team ? ` · Đội ${student.team}` : ''}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="badge">{role}</span>
              {student.created_at && <span className="badge">Tham gia {fmtDate(student.created_at)}</span>}
              {!isTeacher && progress && (
                <span className="badge green">Tiến độ {pct}%</span>
              )}
              {!isTeacher && progress?.avg_score != null && (
                <span className="badge amber">Điểm TB {progress.avg_score}</span>
              )}
              {isTeacher && classOv && (
                <span className="badge green">{classOv.students ?? students.length} học sinh</span>
              )}
              {isTeacher && classOv?.ungraded > 0 && (
                <span className="badge amber">{classOv.ungraded} bài chờ chấm</span>
              )}
            </div>
          </div>
          <button className="btn" onClick={doLogout} title="Đăng xuất"><LogOut className="icn sm" />Đăng xuất</button>
        </div>
      </div>

      <div className="card" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <div className="subnav" role="tablist" aria-label="Khu vực hồ sơ">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={activeTab === t.id ? 'on' : ''}
                onClick={() => { setTab(t.id); setMsg('') }}
              >
                <Icon className="icn sm" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {msg && (
        <div className="card">
          <div className="small" style={{ color: msg.startsWith('Đã') ? '#15803d' : '#b91c1c' }}>{msg}</div>
        </div>
      )}

      {/* ---------- Tổng quan (giáo viên) ---------- */}
      {activeTab === 'overview' && isTeacher && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Tổng quan lớp</h3>
            {!classOv && students.length === 0 ? (
              <div className="muted small">Đang tải…</div>
            ) : (
              <div className="kpi-strip" style={{ marginTop: 8 }}>
                <div className="kpi-cell">
                  <div className="muted small">Học sinh</div>
                  <div className="kpi">{classOv?.students ?? students.length}</div>
                </div>
                <div className="kpi-cell">
                  <div className="muted small">Bài đang giao</div>
                  <div className="kpi">{classOv?.active_assignments ?? 0}</div>
                </div>
                <div className="kpi-cell">
                  <div className="muted small">Bài chờ chấm</div>
                  <div className="kpi">{classOv?.ungraded ?? 0}</div>
                </div>
                <div className="kpi-cell">
                  <div className="muted small">Bài tập đã tạo</div>
                  <div className="kpi">{(classOv?.recent_assignments || []).length ? '✓' : 0}</div>
                </div>
              </div>
            )}
            <div className="small muted" style={{ marginTop: 10 }}>
              Hồ sơ giáo viên tập trung vào lớp — chi tiết từng học sinh ở mục <b>Lớp học</b> hoặc trang Quản lý.
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}><ClipboardList className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Bài tập gần đây</h3>
            {(classOv?.recent_assignments || []).length === 0 ? (
              <div className="empty">Chưa có bài tập — vào tab Bài tập để tạo.</div>
            ) : (
              classOv.recent_assignments.map((a) => (
                <div key={a.id} className="board-row">
                  <div>
                    <b>{a.title}</b>
                    <div className="small muted">
                      {a.class_name}{a.topic_name ? ` · ${a.topic_name}` : ''}
                      {a.deadline ? ` · hạn ${fmtDate(a.deadline)}` : ''}
                      {' · '}{a.submitted}/{a.total} đã nộp
                    </div>
                  </div>
                  <Link className="btn" style={{ marginLeft: 'auto' }} to={`/grading/${a.id}`}>Chấm bài</Link>
                </div>
              ))
            )}
          </div>

          <div className="row">
            <Link className="btn primary" to="/manage"><Users className="icn sm" />Quản lý học sinh</Link>
            <Link className="btn" to="/assignments"><ClipboardList className="icn sm" />Giao bài</Link>
            <Link className="btn" to="/grading"><PenLine className="icn sm" />Chấm bài</Link>
            <Link className="btn" to="/topics"><BookOpen className="icn sm" />Chuyên đề</Link>
          </div>
        </>
      )}

      {/* ---------- Lớp học (giáo viên) ---------- */}
      {activeTab === 'students' && isTeacher && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}><Users className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Học sinh trong hệ thống</h3>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Xem nhanh danh sách — thao tác chi tiết (thêm/sửa/đặt lại MK) ở trang Quản lý.
          </div>
          {students.length === 0 ? (
            <div className="empty">Chưa có học sinh.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Họ tên</th><th>Lớp</th><th>Đội</th><th>Tham gia</th></tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.name}</b></td>
                    <td>{s.class_name || '—'}</td>
                    <td>{s.team || '—'}</td>
                    <td className="small">{fmtDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <Link className="btn primary" to="/manage">Mở khu quản lý</Link>
          </div>
        </div>
      )}

      {/* ---------- Tổng quan ---------- */}
      {activeTab === 'overview' && !isTeacher && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Hồ sơ học tập</h3>
            {!progress ? (
              <div className="muted small">Đang tải tiến độ…</div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                  <span>Tiến độ chương trình</span>
                  <b>{pct}%</b>
                </div>
                <div className="progress" style={{ marginTop: 6 }}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="kpi-strip" style={{ marginTop: 14 }}>
                  <div className="kpi-cell">
                    <div className="muted small">Bài đã giao</div>
                    <div className="kpi">{progress.assigned ?? 0}</div>
                  </div>
                  <div className="kpi-cell">
                    <div className="muted small">Đã hoàn thành</div>
                    <div className="kpi">{progress.completed ?? 0}</div>
                  </div>
                  <div className="kpi-cell">
                    <div className="muted small">Chưa hoàn thành</div>
                    <div className="kpi">{Math.max(0, (progress.assigned ?? 0) - (progress.completed ?? 0))}</div>
                  </div>
                  <div className="kpi-cell">
                    <div className="muted small">Điểm trung bình</div>
                    <div className="kpi">{progress.avg_score ?? '—'}</div>
                  </div>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  {progress.topics_total ? `${progress.topics_done}/${progress.topics_total} chuyên đề hoàn thành` : 'Chưa có chuyên đề'}
                  {progress.lessons_total ? ` · ${progress.lessons_done}/${progress.lessons_total} bài học` : ''}
                  {progress.current_topic ? ` · đang học: ${progress.current_topic.name}` : ''}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}><History className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Hoạt động gần đây</h3>
              <button className="btn" onClick={() => setTab('activity')}>Xem tất cả</button>
            </div>
            {activities.length === 0 ? (
              <div className="empty" style={{ marginTop: 10 }}>Chưa có hoạt động — chọn một chuyên đề để bắt đầu.</div>
            ) : (
              <div style={{ marginTop: 4 }}>
                {activities.slice(0, 5).map((a) => (
                  <ActivityRow key={a.key} item={a} />
                ))}
              </div>
            )}
          </div>

          <div className="row">
            <Link className="btn primary" to="/topics">Vào chuyên đề</Link>
            <Link className="btn" to="/assignments">Xem bài tập</Link>
            <Link className="btn" to="/results">Chi tiết kết quả</Link>
          </div>
        </>
      )}

      {/* ---------- Kết quả ---------- */}
      {activeTab === 'results' && !isTeacher && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}><Trophy className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Kết quả học tập</h3>
            <div className="kpi-strip" style={{ marginTop: 8 }}>
              <div className="kpi-cell">
                <div className="muted small">Điểm TB bài tập</div>
                <div className="kpi">{progress?.avg_score ?? '—'}</div>
              </div>
              <div className="kpi-cell">
                <div className="muted small">Tỷ lệ hoàn thành</div>
                <div className="kpi">{Math.round((progress?.ratio || 0) * 100)}%</div>
              </div>
              <div className="kpi-cell">
                <div className="muted small">Số bài đã chấm</div>
                <div className="kpi">{gradedCount}</div>
              </div>
              <div className="kpi-cell">
                <div className="muted small">Chờ chấm</div>
                <div className="kpi">{pending}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}><ChartLine className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Kết quả theo chuyên đề</h3>
            {!progress?.by_topic?.length ? (
              <div className="empty">Chưa có điểm theo chuyên đề — hoàn thành và chấm bài để thấy điểm tại đây.</div>
            ) : (
              progress.by_topic.map((t) => {
                const scorePct = Math.min(100, Math.max(0, Math.round(((t.avg || 0) / 10) * 100)))
                return (
                  <div key={t.topic} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span>{t.topic}</span>
                      <span className="board-score">
                        <b>{t.avg} / 10</b>
                        <div className="small muted">{t.n} bài</div>
                      </span>
                    </div>
                    <div className="progress" style={{ marginTop: 6 }}>
                      <div style={{ width: `${scorePct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {progress?.lessons_total > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Bài học</h3>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                <span>Đã hoàn thành</span>
                <b>{progress.lessons_done} / {progress.lessons_total}</b>
              </div>
              <div className="progress" style={{ marginTop: 6 }}>
                <div style={{ width: `${Math.round((progress.lessons_ratio || 0) * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0 }}><ClipboardList className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Lịch sử bài tập</h3>
            {results.length === 0 ? (
              <div className="empty">Chưa có bài nào được nộp.</div>
            ) : (
              results.slice(0, 30).map((r) => (
                <div key={r.id} className="board-row">
                  <div>
                    <b>{r.title}</b>
                    <div className="small muted">
                      {r.topic_name || 'Chuyên đề chung'}
                      {r.graded_at ? ` · chấm ${fmtDate(r.graded_at)}` : r.submitted_at ? ` · nộp ${fmtDate(r.submitted_at)}` : ''}
                    </div>
                    {r.feedback && <div className="small muted">“{r.feedback}”</div>}
                  </div>
                  <div className="board-score">
                    {r.score != null
                      ? <span className="badge green">{r.score} / 10</span>
                      : <span className="badge amber">Chờ chấm</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ---------- Hoạt động ---------- */}
      {activeTab === 'activity' && !isTeacher && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}><History className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Lịch sử hoạt động</h3>
          <div className="small muted" style={{ marginBottom: 6 }}>Mình đã học và làm những gì — bài tập đã nộp, lượt luyện tập và thi thử.</div>
          {activities.length === 0 ? (
            <div className="empty">Chưa có hoạt động nào. Vào Chuyên đề hoặc Bài tập để bắt đầu.</div>
          ) : (
            activities.slice(0, 50).map((a) => (
              <ActivityRow key={a.key} item={a} showFeedback />
            ))
          )}
        </div>
      )}

      {/* ---------- Tài khoản ---------- */}
      {activeTab === 'account' && (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Thông tin tài khoản</h3>
            </div>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td style={{ width: '40%' }}>Tên đăng nhập</td><td><b>{loginId}</b></td></tr>
                <tr><td>Họ và tên</td><td>{student.name}</td></tr>
                <tr><td>Lớp</td><td>{student.class_name || '—'}</td></tr>
                <tr><td>Đội tuyển</td><td>{student.team || '—'}</td></tr>
                <tr><td>Vai trò</td><td>{role}</td></tr>
                <tr><td>Ngày tham gia</td><td>{fmtDate(student.created_at)}</td></tr>
                <tr><td>Số điện thoại</td><td>{student.phone || '—'}</td></tr>
                <tr>
                  <td>Email</td>
                  <td>
                    {editingEmail ? (
                      <div className="row" style={{ gap: 8 }}>
                        <input
                          className="input"
                          style={{ maxWidth: 260 }}
                          inputMode="email"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          placeholder="ban@email.com"
                          autoFocus
                        />
                        <button className="btn primary" onClick={saveEmail} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
                        <button className="btn" onClick={() => { setEditingEmail(false); setEmailDraft(student.email || '') }}>Hủy</button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 8 }}>
                        <span>{student.email || '—'}</span>
                        <button className="btn" style={{ padding: '4px 10px', minHeight: 0 }} onClick={() => { setEditingEmail(true); setMsg('') }}>
                          <Pencil className="icn sm" />Đổi email
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {student.dob != null && student.dob !== '' && (
                  <tr><td>Ngày sinh</td><td>{fmtDate(student.dob)}</td></tr>
                )}
                {student.gender && <tr><td>Giới tính</td><td>{student.gender}</td></tr>}
              </tbody>
            </table>
            <div className="small muted" style={{ marginTop: 10 }}>
              Họ tên, lớp, đội tuyển do giáo viên quản lý — cần sửa thì liên hệ giáo viên.
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}><KeyRound className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Đổi mật khẩu</h3>
            <label className="lbl">Mật khẩu cũ *</label>
            <input className="input" type="password" autoComplete="current-password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} />
            <div className="grid c2" style={{ marginTop: 8 }}>
              <div>
                <label className="lbl">Mật khẩu mới *</label>
                <input className="input" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
              </div>
              <div>
                <label className="lbl">Nhập lại *</label>
                <input className="input" type="password" autoComplete="new-password" value={pw.new_password2} onChange={(e) => setPw({ ...pw, new_password2: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={savePassword} disabled={busy}>{busy ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
              <button className="btn danger" onClick={doLogout}><LogOut className="icn sm" />Đăng xuất</button>
            </div>
            <div className="small muted" style={{ marginTop: 8 }}>Quên mật khẩu? Nhờ giáo viên đặt lại ở trang Đội tuyển.</div>
          </div>
        </>
      )}
    </div>
  )
}

function ActivityRow({ item, showFeedback }) {
  const done = item.score != null || item.kind === 'attempt'
  return (
    <div className="board-row">
      <span
        className="rank"
        style={done
          ? { background: 'var(--ok-bg)', color: 'var(--ok-ink)', border: '1px solid var(--ok-line)' }
          : { background: 'var(--warn-bg)', color: 'var(--warn-ink)', border: '1px solid var(--warn-line)' }}
        title={done ? 'Đã hoàn thành' : 'Đã nộp'}
      >
        {done ? '✓' : '…'}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="small muted">{fmtDay(item.date)}</div>
        <b>{item.title}</b>
        {item.meta && <div className="small muted">{item.meta}</div>}
        {showFeedback && item.feedback && <div className="small muted">“{item.feedback}”</div>}
      </div>
      <div className="board-score">
        {item.score != null && <span className="badge green">Điểm {item.score}</span>}
        {item.score == null && item.pct != null && <b>{item.pct}%</b>}
        {item.score == null && item.pct == null && item.kind === 'assign' && <span className="badge amber">Chờ chấm</span>}
      </div>
    </div>
  )
}
