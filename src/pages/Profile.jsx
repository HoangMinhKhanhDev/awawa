import { useEffect, useState } from 'react'
import { api, getSession, setSession } from '../api.js'

const GENDERS = ['', 'Nam', 'Nữ', 'Khác']

function errMsg(e) {
  const m = String(e?.message || e || 'Có lỗi xảy ra')
  return m.replace(/^API \d+: /, '')
}

export default function Profile() {
  const [student, setStudent] = useState(() => getSession().student)
  const [tab, setTab] = useState('login')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [login, setLogin] = useState({ login: '', password: '' })
  const [reg, setReg] = useState({ name: '', class_name: '', dob: '', gender: '', phone: '', email: '', password: '', password2: '' })
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [pw, setPw] = useState({ old_password: '', new_password: '', new_password2: '' })
  const [myStats, setMyStats] = useState(null)

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
    setForm({ name: student.name || '', class_name: student.class_name || '', dob: student.dob || '', gender: student.gender || '', phone: student.phone || '', email: student.email || '' })
    api.stats({ student_name: student.name }).then(setMyStats).catch(() => {})
  }, [student])

  const doLogin = async () => {
    if (!login.login.trim() || !login.password) return setMsg('Nhập tên đăng nhập (SĐT hoặc email) và mật khẩu.')
    setBusy(true); setMsg('')
    try {
      const r = await api.login({ login: login.login.trim(), password: login.password })
      setStudent(r.student)
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
      })
      setStudent(r.student)
      setMsg('')
    } catch (e) { setMsg(errMsg(e)) }
    setBusy(false)
  }

  const doLogout = async () => {
    await api.logout().catch(() => {})
    setStudent(null)
    setTab('login')
  }

  const saveProfile = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await api.updateProfile(form)
      setStudent(r.student)
      setEditing(false)
      setMsg('Đã lưu hồ sơ.')
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

  // ---------- Chưa có tài khoản ----------
  if (!student) {
    return (
      <div className="grid">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Hồ sơ học sinh 👤</h1>
          <div className="small muted">Đăng nhập để nộp bài đúng tên, xem tiến độ của mình. Chưa có tài khoản? Học sinh <b>tự đăng ký</b> miễn phí — cần <b>số điện thoại hoặc email</b> (1 trong 2) làm tên đăng nhập.</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className={`btn ${tab === 'login' ? 'primary' : ''}`} onClick={() => { setTab('login'); setMsg('') }}>Đăng nhập</button>
            <button className={`btn ${tab === 'register' ? 'primary' : ''}`} onClick={() => { setTab('register'); setMsg('') }}>Đăng ký</button>
          </div>
        </div>

        {tab === 'login' ? (
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
          </div>
        )}
        {msg && <div className="card"><div className="small" style={{ color: '#b91c1c' }}>{msg}</div></div>}
      </div>
    )
  }

  // ---------- Đã đăng nhập ----------
  const acc = myStats?.by_student?.[0]
  return (
    <div className="grid">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0 }}>Hồ sơ của {student.name} 👤</h1>
          <button className="btn" onClick={doLogout}>Đăng xuất</button>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Lớp {student.class_name || '—'}{student.team ? ` • Đội ${student.team}` : ''} • Tham gia từ {student.created_at ? new Date(student.created_at).toLocaleDateString('vi-VN') : '—'}
        </div>
        {acc && (
          <div className="row" style={{ marginTop: 10 }}>
            <span className="badge green">{acc.attempts} lượt làm</span>
            <span className="badge amber">{Math.round((acc.accuracy || 0) * 100)}% đúng</span>
          </div>
        )}
      </div>

      <div className="grid c2">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Thông tin cá nhân</h3>
            {!editing && <button className="btn" onClick={() => setEditing(true)}>Sửa</button>}
          </div>
          {editing ? (
            <div style={{ marginTop: 8 }}>
              <label className="lbl">Họ tên *</label>
              <input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid c2" style={{ marginTop: 8 }}>
                <div>
                  <label className="lbl">Lớp *</label>
                  <input className="input" value={form.class_name || ''} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Ngày sinh</label>
                  <input className="input" type="date" value={form.dob || ''} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                </div>
              </div>
              <div className="grid c2" style={{ marginTop: 8 }}>
                <div>
                  <label className="lbl">Giới tính</label>
                  <select className="select" value={form.gender || ''} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    {GENDERS.map((g) => <option key={g} value={g}>{g || '— Chọn —'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Số điện thoại</label>
                  <input className="input" inputMode="tel" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <label className="lbl" style={{ marginTop: 8 }}>Email</label>
              <input className="input" inputMode="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={saveProfile} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</button>
                <button className="btn" onClick={() => setEditing(false)}>Hủy</button>
              </div>
            </div>
          ) : (
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Họ tên</td><td><b>{student.name}</b></td></tr>
                <tr><td>Lớp</td><td>{student.class_name || '—'}</td></tr>
                <tr><td>Ngày sinh</td><td>{student.dob ? new Date(student.dob).toLocaleDateString('vi-VN') : '—'}</td></tr>
                <tr><td>Giới tính</td><td>{student.gender || '—'}</td></tr>
                <tr><td>SĐT</td><td>{student.phone || '—'}</td></tr>
                <tr><td>Email</td><td>{student.email || '—'}</td></tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Đổi mật khẩu</h3>
          <label className="lbl">Mật khẩu cũ *</label>
          <input className="input" type="password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} />
          <div className="grid c2" style={{ marginTop: 8 }}>
            <div>
              <label className="lbl">Mật khẩu mới *</label>
              <input className="input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Nhập lại *</label>
              <input className="input" type="password" value={pw.new_password2} onChange={(e) => setPw({ ...pw, new_password2: e.target.value })} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={savePassword} disabled={busy}>{busy ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Quên mật khẩu? Nhờ giáo viên đặt lại ở trang Đội tuyển.</div>
        </div>
      </div>
      {msg && <div className="card"><div className="small" style={{ color: msg.startsWith('Đã') ? '#15803d' : '#b91c1c' }}>{msg}</div></div>}
    </div>
  )
}
