import { useEffect, useState } from 'react'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { IconUsers, IconPlus, IconKey, IconSearch } from '../components/icons.jsx'

export default function Team() {
  const { toast, confirmBox, promptBox, errMsg } = useUI()
  const me = getSession().student
  const isAdmin = (me?.role || 'student') === 'admin'
  const isStaff = isAdmin || (me?.role || 'student') === 'teacher'
  const [students, setStudents] = useState([])
  const [ranking, setRanking] = useState([])
  const [classes, setClasses] = useState([])
  const [teams, setTeams] = useState([])
  const [teamFilter, setTeamFilter] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState({ name: '', class_name: '', team: '', note: '', team_id: '' })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const teamQ = teamFilter || undefined
      const [st, stats, cls, tms] = await Promise.all([
        api.students({ team: teamQ, search: search || undefined, active: statusFilter === '' ? undefined : statusFilter }),
        api.stats(),
        api.classes().catch(() => []),
        api.myTeams().catch(() => []),
      ])
      setStudents(st || [])
      setRanking(stats?.by_student || [])
      setClasses(cls || [])
      setTeams(tms || [])
      if (tms && tms.length && !teamFilter && !form.team) {
        setForm((f) => ({ ...f, team: tms[0].name || '', team_id: tms[0].id }))
      }
    } catch (e) { toast(errMsg(e), 'err') }
    setLoading(false)
  }

  // Chỉ debounce effect load (mount cũng chạy qua timeout) — tránh double-fetch
  useEffect(() => {
    const t = setTimeout(load, teamFilter || search || statusFilter ? 300 : 0)
    return () => clearTimeout(t)
  }, [teamFilter, search, statusFilter]) // eslint-disable-line

  const resetForm = () => {
    setForm({ name: '', class_name: '', team: teams[0]?.name || '', note: '', team_id: teams[0]?.id || '' })
    setEditingId(null)
  }

  const save = async () => {
    if (saving) return
    if (!form.name.trim()) return toast('Nhập tên học sinh', 'warn')
    setSaving(true)
    try {
      const payload = {
        ...form,
        team_id: form.team_id ? Number(form.team_id) : undefined,
      }
      if (editingId) await api.updateStudent(editingId, payload)
      else await api.createStudent(payload)
      resetForm()
      load()
      toast('Đã lưu học sinh.')
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const edit = (s) => {
    setEditingId(s.id)
    const match = teams.find((t) => t.name === s.team)
    setForm({
      name: s.name || '', class_name: s.class_name || '', team: s.team || '',
      note: s.note || '', team_id: match?.id || '',
    })
    window.scrollTo(0, 0)
  }

  const toggleActive = async (s) => {
    if (!isAdmin) return
    const next = s.active === 0 ? 1 : 0
    const label = next ? 'Mở khóa' : 'Khóa'
    const ok = await confirmBox(`${label} tài khoản ${s.name}?`, { danger: !next, okLabel: label })
    if (!ok) return
    try {
      await api.setStudentActive(s.id, next)
      load()
      toast('Đã cập nhật.')
    } catch (e) { toast(errMsg(e), 'err') }
  }

  const resetPassword = async (s) => {
    const npw = await promptBox(`Đặt lại mật khẩu cho ${s.name} (ít nhất 6 ký tự):`, {
      title: 'Đặt lại mật khẩu', type: 'password', minLength: 6, placeholder: 'Mật khẩu mới',
    })
    if (!npw) return
    try { await api.resetStudentPassword(s.id, npw); toast('Đã đặt lại mật khẩu.') }
    catch (e) { toast(errMsg(e), 'err') }
  }

  const removeStudent = async (s) => {
    const ok = await confirmBox(`Xóa học sinh ${s.name}?`, { danger: true, okLabel: 'Xóa' })
    if (!ok) return
    try { await api.deleteStudent(s.id); load(); toast('Đã xóa.') } catch (e) { toast(errMsg(e), 'err') }
  }

  const rankOf = (name) => ranking.findIndex((r) => r.student_name === name)
  const teamOptions = teams.length
    ? [{ id: '', name: 'Tất cả đội' }, ...teams.map((t) => ({ id: String(t.id), name: t.name }))]
    : [{ id: '', name: 'Tất cả đội' }]

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconUsers className="icn" />{isAdmin ? 'Tài khoản & đội tuyển' : 'Đội tuyển của bạn'}</h1>
        <div className="small muted">
          {isAdmin
            ? 'Toàn trường: thêm HS, gán đội, khóa/mở tài khoản, đặt lại mật khẩu.'
            : 'Chỉ hiển thị học sinh trong đội bạn phụ trách. Thêm HS sẽ vào đội của bạn.'}
        </div>
        {classes.length > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            {classes.map((c) => (
              <span key={c.id} className="badge green" style={{ fontSize: 13 }}>{c.name} · mã: <b>{c.join_code}</b></span>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <select className="select" style={{ width: 'auto' }} aria-label="Lọc đội" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {isAdmin && (
            <select className="select" style={{ maxWidth: 150 }} aria-label="Trạng thái" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Mọi trạng thái</option>
              <option value="1">Đang mở</option>
              <option value="0">Đã khóa</option>
            </select>
          )}
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Tìm tên…" aria-label="Tìm tên học sinh" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn primary" onClick={load} disabled={loading}>{loading ? 'Đang tải…' : 'Tải lại'}</button>
        </div>
        {teams.length === 0 && isStaff && !isAdmin && (
          <div className="small muted" style={{ marginTop: 8 }}>
            Bạn chưa phụ trách đội nào — nhờ quản trị phân công ở mục Nhà trường.
          </div>
        )}
      </div>

      <div className="grid c2">
        <div className="card">
          <h3>{editingId ? `Sửa HS #${editingId}` : 'Thêm học sinh'}</h3>
          <label className="lbl" htmlFor="tm-name">Họ tên *</label>
          <input className="input" id="tm-name" placeholder="VD: Nguyễn Văn A" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid c2" style={{ marginTop: 8 }}>
            <div>
              <label className="lbl" htmlFor="tm-class">Lớp</label>
              <input className="input" id="tm-class" placeholder="VD: 11A1" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="tm-team">Đội tuyển</label>
              <select className="select" id="tm-team" value={form.team_id} onChange={(e) => {
                const t = teams.find((x) => String(x.id) === e.target.value)
                setForm({ ...form, team_id: e.target.value, team: t?.name || '' })
              }}>
                <option value="">— Chọn đội —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <label className="lbl" htmlFor="tm-note" style={{ marginTop: 8 }}>Ghi chú (thế mạnh, mục tiêu…)</label>
          <input className="input" id="tm-note" placeholder="VD: mạnh IPM, cần rèn tự luận ATSH" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu…' : editingId ? 'Lưu' : <><IconPlus className="icn sm" />Thêm</>}</button>
            {editingId && <button className="btn" onClick={resetForm}>Hủy</button>}
          </div>
        </div>

        <div className="card">
          <h3>Bảng xếp hạng (tự động)</h3>
          {ranking.length === 0 ? <div className="empty">Chưa có lượt làm nào có tên.</div> : (
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
        <h3>Danh sách ({students.length})</h3>
        {students.length === 0 && !loading && (
          <div className="empty">
            {isStaff && !isAdmin ? 'Chưa có học sinh trong đội của bạn — thêm ở khung trên.' : 'Chưa có học sinh.'}
          </div>
        )}
        <table className="tbl">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Đội / Lớp</th>
              <th>Trạng thái</th>
              <th>Xếp hạng</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const ri = rankOf(s.name)
              const active = s.active === undefined || s.active === null ? 1 : s.active
              return (
                <tr key={s.id} style={active === 0 ? { opacity: 0.55 } : undefined}>
                  <td><b>{s.name}</b>{s.note && <div className="small muted">{s.note}</div>}</td>
                  <td><span className="badge">{s.team || '—'}</span><div className="small muted">{s.class_name || ''}</div></td>
                  <td>{active ? <span className="badge green">Đang mở</span> : <span className="badge red">Đã khóa</span>}</td>
                  <td>{ri >= 0 ? <span className="badge green">Hạng {ri + 1} · {Math.round(ranking[ri].accuracy * 100)}%</span> : <span className="small muted">chưa thi</span>}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => edit(s)}>Sửa</button>
                      <button className="btn sm" title="Đặt lại mật khẩu khi học sinh quên" aria-label={`Đặt lại mật khẩu ${s.name}`} onClick={() => resetPassword(s)}>
                        <IconKey className="icn sm" />MK
                      </button>
                      {isAdmin && (
                        <button className={`btn sm ${active ? 'danger' : ''}`} onClick={() => toggleActive(s)}>
                          {active ? 'Khóa' : 'Mở'}
                        </button>
                      )}
                      {isAdmin && (
                        <button className="btn danger sm" onClick={() => removeStudent(s)}>Xóa</button>
                      )}
                    </div>
                    {s.phone || s.email ? <div className="small muted">{[s.phone, s.email].filter(Boolean).join(' · ')}</div> : <div className="small muted">chưa có tài khoản</div>}
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
