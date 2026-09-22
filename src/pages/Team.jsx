import { useEffect, useState } from 'react'
import { api } from '../api.js'

const TEAMS = [
  { id: '', label: 'Tất cả đội' },
  { id: 'Nông nghiệp', label: '🌾 Nông nghiệp' },
  { id: 'Chăn nuôi', label: '🐄 Chăn nuôi' },
  { id: 'Lâm nghiệp – Thủy sản', label: '🌲 Lâm – Thủy sản' },
]

export default function Team() {
  const [students, setStudents] = useState([])
  const [ranking, setRanking] = useState([])
  const [teamFilter, setTeamFilter] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', class_name: '', team: 'Nông nghiệp', note: '' })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [st, stats] = await Promise.all([
        api.students({ team: teamFilter || undefined, search: search || undefined }),
        api.stats(),
      ])
      setStudents(st || [])
      setRanking(stats?.by_student || [])
    } catch (e) {
      alert(e.message)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [teamFilter, search])

  const resetForm = () => {
    setForm({ name: '', class_name: '', team: 'Nông nghiệp', note: '' })
    setEditingId(null)
  }

  const save = async () => {
    if (!form.name.trim()) return alert('Nhập tên học sinh')
    try {
      if (editingId) await api.updateStudent(editingId, form)
      else await api.createStudent(form)
      resetForm()
      load()
    } catch (e) { alert(e.message) }
  }

  const edit = (s) => {
    setEditingId(s.id)
    setForm({ name: s.name || '', class_name: s.class_name || '', team: s.team || 'Nông nghiệp', note: s.note || '' })
    window.scrollTo(0, 0)
  }

  const rankOf = (name) => ranking.findIndex((r) => r.student_name === name)

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Đội tuyển HSG Công nghệ</h1>
        <div className="small muted">
          Dành cho <b>giáo viên + quản lý đội</b>: thêm học sinh theo 3 đội
          (Nông nghiệp / Chăn nuôi / Lâm – Thủy sản), theo dõi lượt làm và xếp hạng.
          Học sinh khi vào mục <b>Thi thử</b> chỉ cần gõ đúng tên như ở đây để được thống kê.
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <select className="select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Tìm tên…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn primary" onClick={load} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</button>
        </div>
      </div>

      <div className="grid c2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? `Sửa HS #${editingId}` : 'Thêm học sinh vào đội'}</h3>
          <label className="lbl">Họ tên *</label>
          <input className="input" placeholder="VD: Nguyễn Văn A" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid c2" style={{ marginTop: 8 }}>
            <div>
              <label className="lbl">Lớp</label>
              <input className="input" placeholder="VD: 11A1" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
            </div>
            <div>
              <label className="lbl">Đội tuyển</label>
              <select className="select" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
                <option>Nông nghiệp</option>
                <option>Chăn nuôi</option>
                <option>Lâm nghiệp – Thủy sản</option>
              </select>
            </div>
          </div>
          <label className="lbl" style={{ marginTop: 8 }}>Ghi chú (thế mạnh, mục tiêu…)</label>
          <input className="input" placeholder="VD: mạnh IPM, cần rèn tự luận ATSH" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={save}>{editingId ? 'Lưu' : '+ Thêm'}</button>
            {editingId && <button className="btn" onClick={resetForm}>Hủy</button>}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Mẹo HSG Công nghệ: chia đội theo đúng 3 mạch đề — mỗi đội luyện sâu chuyên đề của mình,
            thi thử chung để so sánh.
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bảng xếp hạng (tự động)</h3>
          {ranking.length === 0 ? <div className="muted small">Chưa có lượt làm nào có tên.</div> : (
            <table className="tbl">
              <thead><tr><th>#</th><th>Học sinh</th><th>Lượt</th><th>Tỉ lệ đúng</th></tr></thead>
              <tbody>
                {ranking.slice(0, 15).map((r, i) => (
                  <tr key={r.student_name}>
                    <td>{i + 1}</td>
                    <td><b>{r.student_name}</b><div className="small muted">{r.correct}/{r.total} câu đúng</div></td>
                    <td>{r.attempts}</td>
                    <td><span className={`badge ${r.accuracy >= 0.8 ? 'green' : r.accuracy >= 0.5 ? 'amber' : 'red'}`}>{Math.round(r.accuracy * 100)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Danh sách đội ({students.length})</h3>
        {students.length === 0 && !loading && <div className="muted small">Chưa có học sinh. Thêm ở khung trên.</div>}
        <table className="tbl">
          <thead><tr><th>Họ tên</th><th>Đội / Lớp</th><th>Xếp hạng</th><th style={{ width: 160 }}></th></tr></thead>
          <tbody>
            {students.map((s) => {
              const ri = rankOf(s.name)
              return (
                <tr key={s.id}>
                  <td><b>{s.name}</b>{s.note && <div className="small muted">{s.note}</div>}</td>
                  <td><span className="badge">{s.team || '—'}</span><div className="small muted">{s.class_name || ''}</div></td>
                  <td>{ri >= 0 ? <span className="badge green">Hạng {ri + 1} • {Math.round(ranking[ri].accuracy * 100)}%</span> : <span className="small muted">chưa thi</span>}</td>
                  <td>
                    <div className="row">
                      <button className="btn" onClick={() => edit(s)}>Sửa</button>
                      <button className="btn" title="Đặt lại mật khẩu khi học sinh quên" onClick={async () => {
                        const npw = prompt(`Đặt lại mật khẩu cho ${s.name} (ít nhất 6 ký tự):`)
                        if (!npw) return
                        try { await api.resetStudentPassword(s.id, npw); alert('Đã đặt lại mật khẩu.') }
                        catch (e) { alert(e.message) }
                      }}>🔑 MK</button>
                      <button className="btn danger" onClick={async () => { if (confirm(`Xóa ${s.name}?`)) { await api.deleteStudent(s.id); load() } }}>Xóa</button>
                    </div>
                    {s.phone || s.email ? <div className="small muted">{[s.phone, s.email].filter(Boolean).join(' • ')}</div> : <div className="small muted">chưa có tài khoản</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
