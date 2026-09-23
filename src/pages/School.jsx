import { useEffect, useState } from 'react'
import { CalendarRange, Layers, Users, UserPlus, ShieldCheck } from 'lucide-react'
import { api, getSession } from '../api.js'

function errMsg(e) {
  return String(e?.message || e || 'Có lỗi').replace(/^API \d+: /, '')
}

export default function School() {
  const me = getSession().student
  const isAdmin = (me?.role || 'student') === 'admin'
  const [years, setYears] = useState([])
  const [grades, setGrades] = useState([])
  const [teams, setTeams] = useState([])
  const [subjects, setSubjects] = useState([])
  const [members, setMembers] = useState([])
  const [openTeam, setOpenTeam] = useState(null)
  const [msg, setMsg] = useState('')
  const [yForm, setYForm] = useState({ name: '', start_date: '', end_date: '', is_current: 1 })
  const [gForm, setGForm] = useState({ name: '', code: '' })
  const [tForm, setTForm] = useState({ name: '', subject_id: '', grade_id: '', description: '' })
  const [allStudents, setAllStudents] = useState([])
  const [addUid, setAddUid] = useState('')
  const [addRole, setAddRole] = useState('student')

  const load = async () => {
    setMsg('')
    try {
      const [y, g, t, s] = await Promise.all([
        api.schoolYears().catch(() => []),
        api.grades().catch(() => []),
        api.teams().catch(() => []),
        api.subjects().catch(() => []),
      ])
      setYears(y); setGrades(g); setTeams(t); setSubjects(s)
      if (isAdmin) {
        const st = await api.students().catch(() => [])
        setAllStudents(st.filter((x) => (x.role || 'student') === 'student'))
      }
    } catch (e) { setMsg(errMsg(e)) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const openMembers = async (team) => {
    setOpenTeam(team)
    try {
      const m = await api.teamMembers(team.id)
      setMembers(m)
    } catch (e) { setMsg(errMsg(e)); setMembers([]) }
  }

  const saveYear = async () => {
    if (!yForm.name.trim()) return setMsg('Nhập tên năm học.')
    try {
      await api.createSchoolYear({ ...yForm, is_current: yForm.is_current ? 1 : 0 })
      setYForm({ name: '', start_date: '', end_date: '', is_current: 0 })
      setMsg('Đã thêm năm học.')
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const saveGrade = async () => {
    if (!gForm.name.trim()) return setMsg('Nhập tên khối.')
    try {
      await api.createGrade(gForm)
      setGForm({ name: '', code: '' })
      setMsg('Đã thêm khối.')
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const saveTeam = async () => {
    if (!tForm.name.trim()) return setMsg('Nhập tên đội tuyển.')
    try {
      await api.createTeam({
        ...tForm,
        grade_id: tForm.grade_id ? Number(tForm.grade_id) : null,
        subject_id: tForm.subject_id || null,
      })
      setTForm({ name: '', subject_id: '', grade_id: '', description: '' })
      setMsg('Đã thêm đội tuyển.')
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const toggleCurrent = async (y) => {
    try {
      await api.updateSchoolYear(y.id, {
        name: y.name, start_date: y.start_date || '', end_date: y.end_date || '',
        is_current: y.is_current ? 0 : 1,
      })
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const addMember = async () => {
    if (!openTeam || !addUid) return setMsg('Chọn người.')
    try {
      await api.addTeamMember(openTeam.id, { user_id: Number(addUid), member_role: addRole })
      setAddUid(''); setAddRole('student'); setMsg('Đã thêm thành viên.')
      openMembers(openTeam)
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  const removeMember = async (uid, name) => {
    if (!openTeam) return
    if (!confirm(`Rời đội ${name}?`)) return
    try {
      await api.removeTeamMember(openTeam.id, uid)
      openMembers(openTeam)
      load()
    } catch (e) { setMsg(errMsg(e)) }
  }

  if (!isAdmin) {
    return (
      <div className="grid">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Cấu trúc nhà trường</h1>
          <div className="empty">Chỉ tài khoản quản trị mới chỉnh sửa năm học / khối / đội tuyển.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
          <ShieldCheck className="icn" />Cấu trúc nhà trường
        </h1>
        <div className="small muted">Năm học → Khối → Đội tuyển → Thành viên. Phase 1a — phân quyền theo đội.</div>
        {msg && <div className="small" style={{ color: msg.startsWith('Đã') ? '#15803d' : '#b91c1c', marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}><CalendarRange className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Năm học</h3>
        {years.map((y) => (
          <div key={y.id} className="board-row">
            <div>
              <b>{y.name}</b>
              <div className="small muted">{y.start_date || '—'} → {y.end_date || '—'}</div>
            </div>
            <span className={`badge ${y.is_current ? 'green' : ''}`}>{y.is_current ? 'Hiện hành' : 'Lưu trữ'}</span>
            {!y.is_current && <button className="btn" onClick={() => toggleCurrent(y)}>Đặt hiện hành</button>}
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ maxWidth: 160 }} placeholder="2027-2028" value={yForm.name} onChange={(e) => setYForm({ ...yForm, name: e.target.value })} />
          <input className="input" type="date" style={{ maxWidth: 170 }} value={yForm.start_date} onChange={(e) => setYForm({ ...yForm, start_date: e.target.value })} />
          <input className="input" type="date" style={{ maxWidth: 170 }} value={yForm.end_date} onChange={(e) => setYForm({ ...yForm, end_date: e.target.value })} />
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={!!yForm.is_current} onChange={(e) => setYForm({ ...yForm, is_current: e.target.checked ? 1 : 0 })} />
            Hiện hành
          </label>
          <button className="btn primary" onClick={saveYear}>+ Thêm năm học</button>
        </div>
      </div>

      <div className="grid c2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}><Layers className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Khối lớp</h3>
          <table className="tbl">
            <thead><tr><th>Khối</th><th>Mã</th><th>Năm học</th></tr></thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id}><td><b>{g.name}</b></td><td>{g.code || '—'}</td><td className="small">{g.year_name || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="input" style={{ flex: 1 }} placeholder="Khối 13" value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} />
            <input className="input" style={{ maxWidth: 80 }} placeholder="13" value={gForm.code} onChange={(e) => setGForm({ ...gForm, code: e.target.value })} />
            <button className="btn primary" onClick={saveGrade}>+</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}><Users className="icn" style={{ verticalAlign: 'middle', marginRight: 6 }} />Thành viên đội đang mở</h3>
          {!openTeam ? (
            <div className="empty">Chọn một đội ở danh sách bên dưới để quản lý thành viên.</div>
          ) : (
            <>
              <div className="small muted" style={{ marginBottom: 8 }}>Đội <b>{openTeam.name}</b> · {openTeam.student_count ?? '—'} HS</div>
              {members.map((m) => (
                <div key={m.user_id + m.member_role} className="board-row">
                  <div>
                    <b>{m.name}</b>
                    <div className="small muted">{m.member_role === 'coach' ? 'Phụ trách' : 'Học sinh'}{m.class_name ? ` · ${m.class_name}` : ''}</div>
                  </div>
                  {m.active === 0 && <span className="badge red">Đã khóa</span>}
                  <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => removeMember(m.user_id, m.name)}>Rời đội</button>
                </div>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <select className="select" style={{ flex: 1 }} value={addUid} onChange={(e) => setAddUid(e.target.value)}>
                  <option value="">— Chọn tài khoản —</option>
                  {allStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone || s.email || s.id})</option>
                  ))}
                </select>
                <select className="select" style={{ maxWidth: 140 }} value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                  <option value="student">Học sinh</option>
                  <option value="coach">Phụ trách</option>
                </select>
                <button className="btn primary" onClick={addMember}><UserPlus className="icn sm" />Thêm</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Đội tuyển ({teams.length})</h3>
        <table className="tbl">
          <thead>
            <tr><th>Tên</th><th>Môn</th><th>Khối</th><th>HS</th><th>Coach</th><th></th></tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td><b>{t.name}</b>{t.description && <div className="small muted">{t.description}</div>}</td>
                <td>{t.subject_name || t.subject_id || '—'}</td>
                <td>{t.grade_name || '—'}</td>
                <td>{t.student_count ?? 0}</td>
                <td>{t.coach_count ?? 0}</td>
                <td>
                  <div className="row">
                    <button className="btn" onClick={() => openMembers(t)}>Thành viên</button>
                    <button className="btn danger" onClick={async () => {
                      if (!confirm(`Xóa đội ${t.name}?`)) return
                      try { await api.deleteTeam(t.id); if (openTeam?.id === t.id) { setOpenTeam(null); setMembers([]) } load() }
                      catch (e) { setMsg(errMsg(e)) }
                    }}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Tên đội (VD: HSG Sinh học)" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} />
          <select className="select" style={{ maxWidth: 180 }} value={tForm.subject_id} onChange={(e) => setTForm({ ...tForm, subject_id: e.target.value })}>
            <option value="">Môn —</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 140 }} value={tForm.grade_id} onChange={(e) => setTForm({ ...tForm, grade_id: e.target.value })}>
            <option value="">Khối —</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="btn primary" onClick={saveTeam}>+ Thêm đội</button>
        </div>
      </div>
    </div>
  )
}
