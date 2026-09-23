import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { IconEye, IconEyeOff, IconLogin } from '../components/icons.jsx'
import { api } from '../api.js'
import { useUI } from '../components/ui.jsx'

export default function Login() {
  const { toast, errMsg } = useUI()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
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
          Quên mật khẩu? Nhờ giáo viên đặt lại ở trang Đội tuyển.
        </div>
        <div className="small" style={{ textAlign: 'center', marginTop: 8 }}>
          Chưa có tài khoản? <Link to="/profile">Đăng ký</Link>
        </div>
      </form>
    </div>
  )
}
