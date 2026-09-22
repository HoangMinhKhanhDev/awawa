import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'

export default function Progress() {
  const [stats, setStats] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [students, setStudents] = useState([])
  const [filter, setFilter] = useState('')

  const load = async (name = filter) => {
    try {
      const [st, at, studs] = await Promise.all([
        api.stats(name ? { student_name: name } : {}),
        api.attempts(name ? { student_name: name } : {}),
        api.students().catch(() => []),
      ])
      setStats(st); setAttempts(at); setStudents(studs || [])
    } catch {}
  }

  useEffect(() => { load('') }, [])

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Tiến độ học {filter && <span className="badge"> {filter}</span>}</h1>
        <div className="row">
          <input
            className="input" style={{ flex: 1, minWidth: 180 }} list="student-list"
            placeholder="Lọc theo học sinh — gõ tên hoặc để trống xem toàn đội…"
            value={filter} onChange={(e) => setFilter(e.target.value)}
          />
          <datalist id="student-list">
            {students.map((s) => <option key={s.id} value={s.name}>{s.team} • {s.class_name}</option>)}
          </datalist>
          <button className="btn primary" onClick={() => load()}>Xem</button>
          {filter && <button className="btn" onClick={() => { setFilter(''); load('') }}>Xóa lọc</button>}
          <Link className="btn" to="/team">Quản lý đội</Link>
        </div>
        {!stats ? <div className="muted" style={{ marginTop: 8 }}>Đang tải…</div> : (
          <div className="grid c3" style={{ marginTop: 12 }}>
            <div><div className="muted small">Lượt làm{filter ? ` của ${filter}` : ''}</div><div className="kpi">{stats.total_attempts}</div></div>
            <div><div className="muted small">Tỉ lệ đúng</div><div className="kpi">{Math.round((stats.accuracy || 0) * 100)}%</div></div>
            <div><div className="muted small">Số câu trong ngân hàng</div><div className="kpi">{stats.total_questions}</div></div>
          </div>
        )}
      </div>

      {!filter && stats?.by_student?.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Xếp hạng toàn đội</h3>
          <table className="tbl">
            <thead><tr><th>#</th><th>Học sinh</th><th>Lượt</th><th>Kết quả</th><th>Lần cuối</th></tr></thead>
            <tbody>
              {stats.by_student.slice(0, 20).map((r, i) => (
                <tr key={r.student_name}>
                  <td>{i + 1}</td>
                  <td><button className="btn" style={{ padding: '2px 8px' }} onClick={() => { setFilter(r.student_name); load(r.student_name) }}><b>{r.student_name}</b></button></td>
                  <td>{r.attempts}</td>
                  <td>{r.correct}/{r.total} ({Math.round((r.accuracy || 0) * 100)}%)</td>
                  <td className="small">{r.last_at ? new Date(r.last_at).toLocaleString('vi-VN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted" style={{ marginTop: 6 }}>Bấm tên để xem chi tiết từng em (chuyên đề yếu + lịch sử).</div>
        </div>
      )}

      <div className="grid c2">
        <div className="card">
          <h3>Theo chuyên đề{filter ? ` — ${filter}` : ''}</h3>
          {!stats?.by_topic?.length ? <div className="muted small">Chưa có dữ liệu.</div> :
            stats.by_topic.map((t) => (
              <div key={t.topic} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><span>{t.topic}</span><b>{Math.round(t.accuracy * 100)}%</b></div>
                <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${Math.round(t.accuracy * 100)}%` }} /></div>
                <div className="small muted">{t.done}/{t.total} lượt đúng</div>
              </div>
            ))}
        </div>
        <div className="card">
          <h3>Lịch sử làm bài{filter ? ` — ${filter}` : ''}</h3>
          {attempts.length === 0 ? <div className="muted small">Chưa có lượt nào.</div> :
            <table className="tbl"><thead><tr><th>Thời gian</th><th>Học sinh</th><th>Chế độ</th><th>Kết quả</th><th>Rời app</th></tr></thead>
              <tbody>{attempts.slice(0, 30).map((a) => (
                <tr key={a.id}><td className="small">{new Date(a.created_at).toLocaleString('vi-VN')}</td><td>{a.student_name || '—'}</td><td>{a.mode === 'exam' ? 'Thi thử' : 'Luyện tập'}</td><td>{a.total ? `${a.correct}/${a.total} (${Math.round((a.accuracy || 0) * 100)}%)` : '—'}</td><td>{a.mode === 'exam' ? (<span className={`badge ${(a.focus_exits || 0) > 0 ? 'red' : 'green'}`}>{a.focus_exits || 0} lần</span>) : '—'}</td></tr>
              ))}</tbody></table>}
        </div>
      </div>
    </div>
  )
}
