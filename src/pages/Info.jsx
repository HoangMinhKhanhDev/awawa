import { useEffect, useState } from 'react'
import { IconTrophy, IconMessage, IconCheck } from '../components/icons.jsx'
import { api } from '../api.js'
import { useUI } from '../components/ui.jsx'

function score10(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? (n <= 1 ? (n * 10).toFixed(1) : n.toFixed(1)) : '—'
}

export default function Info() {
  const { toast, errMsg } = useUI()
  const [board, setBoard] = useState([])
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [boardData, notifData] = await Promise.all([
        api.leaderboard({ limit: 50 }).catch(() => []),
        api.notifications().catch(() => ({ items: [], unread: 0 })),
      ])
      setBoard(Array.isArray(boardData) ? boardData : (Array.isArray(boardData?.board) ? boardData.board : []))
      setItems(Array.isArray(notifData?.items) ? notifData.items : [])
      setUnread(Number(notifData?.unread || 0))
    } catch (error) {
      toast(errMsg(error), 'err')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = async () => {
    try {
      await api.markNotificationsRead(null)
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })))
      setUnread(0)
      toast('Đã đánh dấu tất cả là đã đọc.')
    } catch (error) {
      toast(errMsg(error), 'err')
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconTrophy className="icn" />Thông tin</h1>
        <div className="small muted">Bảng xếp hạng học sinh và thông báo từ giáo viên.</div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Bảng xếp hạng</h3>
        {loading && <div className="skeleton-line" />}
        {!loading && board.length === 0 && <div className="empty">Chưa có dữ liệu xếp hạng.</div>}
        {board.length > 0 && (
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Học sinh</th><th>Điểm thi</th><th>Điểm bài tập</th><th>Lượt</th></tr>
            </thead>
            <tbody>
              {board.map((row, index) => (
                <tr key={row.id || `${row.name}-${index}`}>
                  <td><b>{index + 1}</b></td>
                  <td><b>{row.name}</b>{row.class_name ? <div className="small muted">{row.class_name}</div> : null}</td>
                  <td>{score10(row.best)}</td>
                  <td>{score10(row.assign_avg)}</td>
                  <td>{row.n ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row spread" style={{ marginBottom: 10 }}>
          <h3 className="icon-h" style={{ margin: 0 }}><IconMessage className="icn" />Thông báo {unread > 0 && <span className="badge amber">{unread} mới</span>}</h3>
          {unread > 0 && <button className="btn sm" onClick={markAllRead}><IconCheck className="icn sm" />Đã đọc tất cả</button>}
        </div>
        {items.length === 0 && <div className="empty">Chưa có thông báo nào.</div>}
        {items.map((item) => (
          <div key={item.id} className="board-row">
            <IconMessage className="icn" style={{ color: item.read_at ? 'var(--muted)' : 'var(--accent)' }} />
            <div>
              <b>{item.title}</b>
              <div className="small muted">{item.body}</div>
              <div className="small muted">{item.created_at}</div>
            </div>
            {!item.read_at && <span className="badge amber push">Mới</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
