// Chuông thông báo trên topbar — giao bài / hạn nộp (5.1).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconMessage } from './icons.jsx'
import { api, getSession } from '../api.js'

export default function NotificationsBell() {
  const s = getSession()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)

  const load = async () => {
    if (!s.token) { setItems([]); setUnread(0); return }
    try {
      const r = await api.notifications()
      setItems(r.items || [])
      setUnread(r.unread || 0)
    } catch { /* offline / chưa login */ }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 45000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [s.token]) // eslint-disable-line

  if (!s.token) return null

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0 && api.markNotificationsRead) {
      try {
        await api.markNotificationsRead(null)
        setUnread(0)
        setItems((list) => list.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
      } catch {}
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="theme-toggle"
        aria-label={unread ? `${unread} thông báo chưa đọc` : 'Thông báo'}
        title="Thông báo"
        onClick={toggle}
        style={{ position: 'relative' }}
      >
        <IconMessage className="icn sm" />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 999,
            background: '#e11d48', color: '#fff', fontSize: 10, lineHeight: '16px', padding: '0 4px',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="card" style={{
          position: 'absolute', right: 0, top: 40, width: 320, maxHeight: 380, overflow: 'auto',
          zIndex: 50, boxShadow: '0 12px 40px rgba(0,0,0,.18)',
        }}>
          <div className="row spread"><b>Thông báo</b><button className="btn sm" onClick={() => setOpen(false)}>Đóng</button></div>
          {items.length === 0 && <div className="empty">Chưa có thông báo.</div>}
          {items.map((n) => (
            <Link
              key={n.id}
              to={n.link || '/'}
              className="board-row clickable"
              onClick={() => setOpen(false)}
              style={{ textDecoration: 'none', color: 'inherit', display: 'block', opacity: n.read_at ? 0.7 : 1 }}
            >
              <b className="small">{n.title}</b>
              {n.body && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>}
              <div className="small muted">{n.created_at ? new Date(n.created_at).toLocaleString('vi-VN') : ''}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
