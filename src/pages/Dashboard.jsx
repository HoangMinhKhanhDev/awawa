import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, setBackendUrl, isCloudMode, isPhpMode } from '../api.js'

export default function Dashboard({ backend }) {
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState('')
  const [srvInput, setSrvInput] = useState('')

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setErr(String(e.message || e)))
  }, [])
  useEffect(() => { setSrvInput(backend.url === '...' ? '' : backend.url) }, [backend.url])

  const saveServer = async () => {
    const u = (srvInput || '').trim().replace(/\/+$/, '')
    if (!/^https?:\/\/.+/.test(u)) return alert('Địa chỉ server phải bắt đầu bằng http:// hoặc https://\nVD: http://192.168.1.10:8765')
    setBackendUrl(u)
    await backend.check(u)
    setStats(await api.stats().catch(() => null))
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ margin: '0 0 6px' }}>Ôn luyện HSG Công nghệ 🌾🐄🌲</h1>
        <div className="muted">3 đội: <b>Nông nghiệp</b> • <b>Chăn nuôi</b> • <b>Lâm nghiệp – Thủy sản</b>. Học sinh luyện theo chuyên đề, thi thử bấm giờ; giáo viên quản lý đội và xem xếp hạng.</div>
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn primary" to="/practice">Bắt đầu luyện</Link>
          <Link className="btn" to="/exam">Thi thử bấm giờ</Link>
          <Link className="btn" to="/team">Quản lý đội tuyển</Link>
          <Link className="btn" to="/import">Nhập đề mới</Link>
        </div>
        {!backend.ok && !isCloudMode && !isPhpMode && <div className="small" style={{ marginTop: 10, color: '#b45309' }}>Chưa kết nối được server. Mở web qua link ngrok https hoặc cùng WiFi thì app tự nối — nếu vẫn lỗi, nhập tay địa chỉ server ở khung bên dưới rồi bấm Lưu.</div>}
        {isCloudMode && <div className="small" style={{ marginTop: 10, color: '#15803d' }}>☁️ Đang chạy Cloud (Vercel + Supabase) — tắt máy vẫn dùng được, 1200 hồ sơ thoải mái.</div>}
        {isPhpMode && <div className="small" style={{ marginTop: 10, color: '#15803d' }}>🌐 Đang chạy trên Hostinger + MySQL — tắt máy vẫn dùng được, 1200 hồ sơ thoải mái.</div>}
        {err && <div className="small" style={{ color: '#dc2626', marginTop: 8 }}>{err}</div>}
      </div>

      {!backend.ok && !isCloudMode && !isPhpMode && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Kết nối server</h3>
          <div className="row">
            <input className="input" style={{ flex: 1, minWidth: 200 }} name="serverUrl" autoComplete="off" inputMode="url" spellCheck={false} placeholder="http://192.168.1.10:8765" value={srvInput} onChange={(e) => setSrvInput(e.target.value)} />
            <button className="btn primary" onClick={saveServer}>Lưu</button>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>Khung này chỉ hiện khi chưa nối được server. Chỉ nhập tay khi server đặt ở máy khác.</div>
        </div>
      )}

      <div className="grid c3">
        <div className="card"><div className="muted small">Tổng số câu hỏi</div><div className="kpi">{stats?.total_questions ?? '—'}</div><div className="small muted">Ngân hàng mẫu + câu nhập thêm</div></div>
        <div className="card"><div className="muted small">Lượt làm bài</div><div className="kpi">{stats?.total_attempts ?? '—'}</div><div className="small muted">Luyện chuyên đề + thi thử</div></div>
        <div className="card"><div className="muted small">Tỉ lệ đúng (trắc nghiệm)</div><div className="kpi">{stats ? `${Math.round((stats.accuracy || 0) * 100)}%` : '—'}</div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${Math.round((stats?.accuracy || 0) * 100)}%` }} /></div></div>
      </div>

      <div className="grid c2">
        <div className="card">
          <h3>Độ phủ theo môn</h3>
          {!stats ? <div className="muted small">Đang tải…</div> :
            (stats.by_subject || []).length === 0 ? <div className="muted small">Chưa có dữ liệu.</div> :
            <table className="tbl"><thead><tr><th>Môn</th><th>Số câu</th></tr></thead>
              <tbody>{stats.by_subject.map((r) => <tr key={r.subject}><td>{r.subject}</td><td>{r.count}</td></tr>)}</tbody></table>}
        </div>
        <div className="card">
          <h3>Chuyên đề cần ôn lại</h3>
          {!stats ? <div className="muted small">Đang tải…</div> :
            (stats.by_topic || []).length === 0 ? <div className="muted small">Chưa đủ dữ liệu — hãy luyện vài bộ để hệ thống gợi ý.</div> :
            (stats.weak_topics || []).length === 0 ? <div className="muted small">Đang tốt — chưa có chuyên đề nào dưới 80%. Cứ duy trì.</div> :
            (stats.weak_topics || []).slice(0, 6).map((t) => (
              <div key={t.topic} className="row" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <span>{t.topic}</span><span className="badge red">{Math.round(t.accuracy * 100)}% đúng</span>
              </div>
            ))}
          <hr className="sep" />
          <div className="small muted">Quy trình đề xuất: chọn 1 chuyên đề yếu → luyện 10–15 câu → xem lời giải → thi thử 45–90 phút → đối chiếu đáp án tự luận.</div>
        </div>
      </div>
    </div>
  )
}
