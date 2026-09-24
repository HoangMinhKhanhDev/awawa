import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { IconEye, IconEyeOff, IconLogin, IconMail, IconKey } from '../components/icons.jsx'
import { api } from '../api.js'
import { useUI } from '../components/ui.jsx'

export default function Login() {
  const { toast, errMsg } = useUI()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('login') // login | forgot | reset
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetForm, setResetForm] = useState({ email: '', code: '', new_password: '' })
  const [sentMsg, setSentMsg] = useState('')
  const nav = useNavigate()

  const submit = async (e) => {
    e?.preventDefault()
    if (busy) return
    if (!login.trim() || !password) { toast('Nhập tài khoản và mật khẩu.', 'warn'); return }
    setBusy(true)
    try {
      await api.login({ login: login.trim(), password })
      toast('Đăng nhập thành công.')
      nav('/')
    } catch (err) { toast(errMsg(err), 'err') }
    setBusy(false)
  }

  const sendForgot = async () => {
    if (busy) return
    if (!forgotEmail.includes('@')) { toast('Nhập email hợp lệ.', 'warn'); return }
    setBusy(true)
    try {
      const r = await api.forgotPassword({ email: forgotEmail.trim() })
      setSentMsg(r.message || 'Đã gửi.')
      setResetForm((f) => ({ ...f, email: forgotEmail.trim() }))
      setMode('reset')
      toast(r.message || 'Đã gửi mã.')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  const doReset = async () => {
    if (busy) return
    if (!resetForm.code.trim()) { toast('Nhập mã xác nhận.', 'warn'); return }
    if (resetForm.new_password.length < 6) { toast('Mật khẩu mới ít nhất 6 ký tự.', 'warn'); return }
    setBusy(true)
    try {
      await api.resetPassword(resetForm)
      toast('Đặt lại mật khẩu thành công — hãy đăng nhập.')
      setMode('login')
      setLogin(resetForm.email)
      setPassword('')
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  if (mode === 'forgot') {
    return (
      <div className="grid" style={{ maxWidth: 440, margin: '0 auto' }}>
        <div className="card">
          <h2 className="icon-h" style={{ marginTop: 0 }}><IconMail className="icn" />Quên mật khẩu</h2>
          <div className="small muted">Nhập email đã đăng ký — hệ thống gửi mã đặt lại (cần cấu hình SMTP).</div>
          <label className="lbl" htmlFor="fp-email" style={{ marginTop: 12 }}>Email</label>
          <input className="input" id="fp-email" type="email" autoComplete="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="ban@truong.edu.vn" />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={sendForgot} disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi mã'}</button>
            <button className="btn" onClick={() => setMode('login')}>Quay lại</button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'reset') {
    return (
      <div className="grid" style={{ maxWidth: 440, margin: '0 auto' }}>
        <div className="card">
          <h2 className="icon-h" style={{ marginTop: 0 }}><IconKey className="icn" />Nhập mã & mật khẩu mới</h2>
          {sentMsg && <div className="msg info" role="status">{sentMsg}</div>}
          <label className="lbl" htmlFor="rp-email" style={{ marginTop: 12 }}>Email</label>
          <input className="input" id="rp-email" type="email" value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} />
          <label className="lbl" htmlFor="rp-code">Mã xác nhận</label>
          <input className="input" id="rp-code" value={resetForm.code} onChange={(e) => setResetForm({ ...resetForm, code: e.target.value.toUpperCase() })} placeholder="6 ký tự" />
          <label className="lbl" htmlFor="rp-pw">Mật khẩu mới</label>
          <input className="input" id="rp-pw" type="password" autoComplete="new-password" value={resetForm.new_password} onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={doReset} disabled={busy}>{busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}</button>
            <button className="btn" onClick={() => setMode('login')}>Hủy</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid" style={{ maxWidth: 440, margin: '0 auto' }}>
      <form className="card" onSubmit={submit}>
        <label className="lbl" htmlFor="login-id" style={{ marginTop: 0 }}>Email / Tài khoản</label>
        <input className="input" id="login-id" autoComplete="username" placeholder="SĐT hoặc email" value={login} onChange={(e) => setLogin(e.target.value)} />
        <label className="lbl" htmlFor="login-pw">Mật khẩu</label>
        <div style={{ position: 'relative' }}>
          <input className="input" id="login-pw" style={{ paddingRight: 44 }} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow((v) => !v)}
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', padding: 8 }}>
            {show ? <IconEyeOff className="icn sm" /> : <IconEye className="icn sm" />}
          </button>
        </div>
        <button className="btn primary" style={{ width: '100%', marginTop: 16, minHeight: 46 }} disabled={busy} type="submit">
          <IconLogin className="icn sm" />{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <div className="small muted" style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" className="btn sm" onClick={() => setMode('forgot')} style={{ border: 0, background: 'none', textDecoration: 'underline', color: 'var(--muted)' }}>
            Quên mật khẩu?
          </button>
          {' '}· hoặc nhờ giáo viên đặt lại
        </div>
        <div className="small" style={{ textAlign: 'center', marginTop: 8 }}>
          Chưa có tài khoản? <Link to="/profile">Đăng ký</Link>
        </div>
      </form>
    </div>
  )
}
