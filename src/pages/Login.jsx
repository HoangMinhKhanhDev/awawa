import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Sprout } from 'lucide-react'
import { api } from '../api.js'

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const nav = useNavigate()

  const submit = async (e) => {
    e?.preventDefault()
    if (!login.trim() || !password) return setMsg('Nhập tài khoản và mật khẩu.')
    setBusy(true); setMsg('')
    try {
      await api.login({ login: login.trim(), password })
      nav('/')
    } catch (err) { setMsg(String(err.message || err)) }
    setBusy(false)
  }

  return (
    <div className="grid" style={{ maxWidth: 440, margin: '0 auto' }}>
      <div className="hero" style={{ textAlign: 'center' }}>
        <Sprout className="icn lg" style={{ margin: '0 auto 6px' }} />
        <h1>Hệ thống bồi dưỡng HSG</h1>
        <p>Vật lý 11 — đăng nhập để học, làm bài và xem kết quả.</p>
      </div>
      <form className="card" onSubmit={submit}>
        <label className="lbl" style={{ marginTop: 0 }}>Email / Tài khoản</label>
        <input className="input" autoComplete="username" placeholder="SĐT hoặc email" value={login} onChange={(e) => setLogin(e.target.value)} />
        <label className="lbl">Mật khẩu</label>
        <div style={{ position: 'relative' }}>
          <input className="input" style={{ paddingRight: 42 }} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow((v) => !v)}
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', padding: 6 }}>
            {show ? <EyeOff className="icn sm" /> : <Eye className="icn sm" />}
          </button>
        </div>
        {msg && <div className="small" style={{ color: '#b91c1c', marginTop: 10 }}>{msg}</div>}
        <button className="btn primary" style={{ width: '100%', marginTop: 16, minHeight: 46 }} disabled={busy} type="submit">
          <LogIn className="icn sm" />{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
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
