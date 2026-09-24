import { useCallback, useEffect, useState } from 'react'
import { IconCalendar, IconLayers, IconUsers, IconPlus, IconSchool, IconUserPlus } from '../components/icons.jsx'
import { api, getSession, isPhpMode } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { isAdminRole } from '../lib/roles.js'
import { useSchoolScope } from '../app/school-context.jsx'

export default function School() {
  const { toast, confirmBox, errMsg } = useUI()
  const me = getSession().student
  const { school, role: schoolRole, refresh: refreshScope } = useSchoolScope()
  const isAdmin = isPhpMode ? schoolRole === 'admin' || schoolRole === 'super_admin' : isAdminRole(me)
  const [years, setYears] = useState([])
  const [grades, setGrades] = useState([])
  const [teams, setTeams] = useState([])
  const [subjects, setSubjects] = useState([])
  const [members, setMembers] = useState([])
  const [openTeam, setOpenTeam] = useState(null)
  const [yForm, setYForm] = useState({ name: '', start_date: '', end_date: '', is_current: 1 })
  const [gForm, setGForm] = useState({ name: '', code: '', school_year_id: '' })
  const [tForm, setTForm] = useState({ name: '', subject_id: '', school_year_id: '', grade_id: '', description: '' })
  const [allStudents, setAllStudents] = useState([])
  const [users, setUsers] = useState([])
  const [uForm, setUForm] = useState({ name: '', phone: '', role: 'student' })
  const [addUid, setAddUid] = useState('')
  const [addRole, setAddRole] = useState('student')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (isPhpMode && !school) return
    try {
      if (isPhpMode) {
        const [yearData, gradeData, teamData, subjectData] = await Promise.all([
          api.v2SchoolYears(school.id),
          api.schoolGrades(school.id),
          api.allSchoolTeams(school.id),
          api.schoolSubjects(school.id),
        ])
        setYears(yearData?.years || [])
        setGrades(gradeData?.grades || [])
        setTeams(teamData?.teams || [])
        setSubjects(subjectData?.subjects || [])
        if (isAdmin) {
          const userData = await api.schoolUsers(school.id).catch(() => ({ users: [] }))
          setUsers(userData?.users || [])
          setAllStudents((userData?.users || []).filter((item) => item.status === 'active'))
        }
      } else {
        const [y, g, t, s] = await Promise.all([
          api.schoolYears().catch(() => []),
          api.grades().catch(() => []),
          api.teams().catch(() => []),
          api.subjects().catch(() => []),
        ])
        setYears(y); setGrades(g); setTeams(t); setSubjects(s)
        if (isAdmin) {
          const st = await api.students().catch(() => [])
          setUsers(st)
          setAllStudents(st.filter((x) => (x.role || 'student') === 'student'))
        }
      }
    } catch (e) { toast(errMsg(e), 'err') }
  }, [errMsg, isAdmin, school, toast])

  useEffect(() => { load() }, [load, refreshScope])

  const openMembers = async (team) => {
    setOpenTeam(team)
    try {
      const m = isPhpMode ? await api.schoolTeamMembers(school.id, team.subject_id, team.id) : await api.teamMembers(team.id)
      setMembers(isPhpMode ? (m?.members || []) : m)
    } catch (e) { toast(errMsg(e), 'err'); setMembers([]) }
  }

  const saveYear = async () => {
    if (saving) return
    if (!yForm.name.trim()) { toast('Nhập tên năm học.', 'warn'); return }
    setSaving(true)
    try {
      if (isPhpMode) await api.createV2SchoolYear(school.id, { ...yForm, is_current: yForm.is_current ? 1 : 0 })
      else await api.createSchoolYear({ ...yForm, is_current: yForm.is_current ? 1 : 0 })
      setYForm({ name: '', start_date: '', end_date: '', is_current: 0 })
      toast('Đã thêm năm học.')
      load()
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveUser = async () => {
    if (saving) return
    if (!uForm.name.trim() || !uForm.phone.trim()) { toast('Nhập tên và số điện thoại.', 'warn'); return }
    setSaving(true)
    try {
      if (isPhpMode) await api.createSchoolUser(school.id, uForm)
      else await api.createStudent(uForm)
      setUForm({ name: '', phone: '', role: 'student' })
      toast('Đã thêm người dùng.')
      load()
    } catch (e) { toast(errMsg(e), 'err') } finally { setSaving(false) }
  }

  const saveGrade = async () => {
    if (saving) return
    if (!gForm.name.trim()) { toast('Nhập tên khối.', 'warn'); return }
    if (isPhpMode && !gForm.school_year_id) { toast('Chọn năm học.', 'warn'); return }
    setSaving(true)
    try {
      if (isPhpMode) await api.createSchoolGrade(school.id, gForm)
      else await api.createGrade(gForm)
      setGForm({ name: '', code: '', school_year_id: gForm.school_year_id })
      toast('Đã thêm khối.')
      load()
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const saveTeam = async () => {
    if (saving) return
    if (!tForm.name.trim()) { toast('Nhập tên đội tuyển.', 'warn'); return }
    if (isPhpMode && (!tForm.subject_id || !tForm.school_year_id || !tForm.grade_id)) { toast('Chọn môn, năm học và khối.', 'warn'); return }
    setSaving(true)
    try {
      const payload = { ...tForm, grade_id: tForm.grade_id ? Number(tForm.grade_id) : null, school_year_id: tForm.school_year_id ? Number(tForm.school_year_id) : null, subject_id: tForm.subject_id || null }
      if (isPhpMode) await api.createSchoolTeam(school.id, tForm.subject_id, payload)
      else await api.createTeam(payload)
      setTForm({ name: '', subject_id: '', school_year_id: '', grade_id: '', description: '' })
      toast('Đã thêm đội tuyển.')
      load()
    } catch (e) { toast(errMsg(e), 'err') }
    setSaving(false)
  }

  const toggleCurrent = async (y) => {
    try {
      const payload = { name: y.name, start_date: y.start_date || '', end_date: y.end_date || '', is_current: y.is_current ? 0 : 1 }
      if (isPhpMode) await api.updateV2SchoolYear(school.id, y.id, payload)
      else await api.updateSchoolYear(y.id, payload)
      load()
    } catch (e) { toast(errMsg(e), 'err') }
  }

  const addMember = async () => {
    if (!openTeam || !addUid) { toast('Chọn người.', 'warn'); return }
    try {
      if (isPhpMode) await api.updateTeamMember(school.id, openTeam.subject_id, openTeam.id, Number(addUid), { role: addRole, access: 'include' })
      else await api.addTeamMember(openTeam.id, { user_id: Number(addUid), member_role: addRole })
      setAddUid(''); setAddRole('student'); toast('Đã thêm thành viên.')
      openMembers(openTeam)
      load()
    } catch (e) { toast(errMsg(e), 'err') }
  }

  const removeMember = async (uid, name) => {
    if (!openTeam) return
    const ok = await confirmBox(`Rời đội ${name}?`, { danger: true, okLabel: 'Rời đội' })
    if (!ok) return
    try {
      if (isPhpMode) await api.updateTeamMember(school.id, openTeam.subject_id, openTeam.id, uid, { role: 'student', access: 'exclude' })
      else await api.removeTeamMember(openTeam.id, uid)
      openMembers(openTeam)
      load()
    } catch (e) { toast(errMsg(e), 'err') }
  }

  if (!isAdmin) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Cấu trúc nhà trường</h1>
          <div className="empty">Chỉ tài khoản quản trị mới chỉnh sửa năm học / khối / đội tuyển.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconSchool className="icn" />Cấu trúc nhà trường</h1>
        <div className="small muted">Năm học → Khối → Đội tuyển → Thành viên. Phase 1a — phân quyền theo đội.</div>
      </div>

      <div className="card">
        <h3 className="icon-h"><IconUsers className="icn" />Người dùng trường</h3>
        {isPhpMode ? (
          <table className="tbl">
            <thead><tr><th>Người dùng</th><th>Vai trò</th><th>Trạng thái</th><th>Đội</th></tr></thead>
            <tbody>
              {users.map((user) => <tr key={user.id}><td><b>{user.name}</b><div className="small muted">{user.phone || '—'}</div></td><td>{user.role}</td><td><span className={`badge ${user.status === 'active' ? 'green' : 'red'}`}>{user.status === 'active' ? 'Hoạt động' : 'Khóa'}</span></td><td>{user.team_count || 0}</td></tr>)}
            </tbody>
          </table>
        ) : <div className="small muted">Quản lý người dùng theo trường sẽ dùng PHP API v2 sau khi bật migration.</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Họ tên" aria-label="Họ tên người dùng" value={uForm.name} onChange={(e) => setUForm({ ...uForm, name: e.target.value })} />
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Số điện thoại" aria-label="Số điện thoại" value={uForm.phone} onChange={(e) => setUForm({ ...uForm, phone: e.target.value })} />
          <select className="select" style={{ maxWidth: 130 }} aria-label="Vai trò người dùng" value={uForm.role} onChange={(e) => setUForm({ ...uForm, role: e.target.value })}>
            <option value="student">Học sinh</option><option value="teacher">Giáo viên</option><option value="admin">Quản trị</option>
          </select>
          <button className="btn primary" onClick={saveUser} disabled={saving}><IconUserPlus className="icn sm" />Thêm</button>
        </div>
      </div>

      <div className="card">
        <h3 className="icon-h"><IconCalendar className="icn" />Năm học</h3>
        {years.map((y) => (
          <div key={y.id} className="board-row">
            <div>
              <b>{y.name}</b>
              <div className="small muted">{y.start_date || '—'} → {y.end_date || '—'}</div>
            </div>
            <span className={`badge ${y.is_current ? 'green' : ''}`}>{y.is_current ? 'Hiện hành' : 'Lưu trữ'}</span>
            {!y.is_current && <button className="btn sm" onClick={() => toggleCurrent(y)}>Đặt hiện hành</button>}
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ maxWidth: 160 }} placeholder="2027-2028" aria-label="Tên năm học" value={yForm.name} onChange={(e) => setYForm({ ...yForm, name: e.target.value })} />
          <input className="input" type="date" style={{ maxWidth: 170 }} aria-label="Ngày bắt đầu" value={yForm.start_date} onChange={(e) => setYForm({ ...yForm, start_date: e.target.value })} />
          <input className="input" type="date" style={{ maxWidth: 170 }} aria-label="Ngày kết thúc" value={yForm.end_date} onChange={(e) => setYForm({ ...yForm, end_date: e.target.value })} />
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={!!yForm.is_current} onChange={(e) => setYForm({ ...yForm, is_current: e.target.checked ? 1 : 0 })} />
            Hiện hành
          </label>
          <button className="btn primary" onClick={saveYear} disabled={saving}><IconPlus className="icn sm" />Thêm năm học</button>
        </div>
      </div>

      <div className="grid c2">
        <div className="card">
          <h3 className="icon-h"><IconLayers className="icn" />Khối lớp</h3>
          <table className="tbl">
            <thead><tr><th>Khối</th><th>Mã</th><th>Năm học</th></tr></thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g.id}><td><b>{g.name}</b></td><td>{g.code || '—'}</td><td className="small">{g.year_name || '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            {isPhpMode && <select className="select" style={{ maxWidth: 150 }} aria-label="Năm học của khối" value={gForm.school_year_id} onChange={(e) => setGForm({ ...gForm, school_year_id: e.target.value })}>
              <option value="">Năm học —</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>}
            <input className="input" style={{ flex: 1 }} placeholder="Khối 13" aria-label="Tên khối" value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} />
            <input className="input" style={{ maxWidth: 80 }} placeholder="13" aria-label="Mã khối" value={gForm.code} onChange={(e) => setGForm({ ...gForm, code: e.target.value })} />
            <button className="btn primary" aria-label="Thêm khối" onClick={saveGrade} disabled={saving}><IconPlus className="icn sm" /></button>
          </div>
        </div>

        <div className="card">
          <h3 className="icon-h"><IconUsers className="icn" />Thành viên đội đang mở</h3>
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
                  <button className="btn danger sm push" onClick={() => removeMember(m.user_id, m.name)}>Rời đội</button>
                </div>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <select className="select" style={{ flex: 1 }} aria-label="Chọn tài khoản" value={addUid} onChange={(e) => setAddUid(e.target.value)}>
                  <option value="">— Chọn tài khoản —</option>
                  {allStudents.filter((item) => addRole === 'coach' ? ['teacher', 'admin'].includes(item.role) : item.role === 'student').map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone || s.email || s.id})</option>
                  ))}
                </select>
                <select className="select" style={{ maxWidth: 140 }} aria-label="Vai trò" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                  <option value="student">Học sinh</option>
                  <option value="coach">Phụ trách</option>
                </select>
                <button className="btn primary" onClick={addMember}><IconUserPlus className="icn sm" />Thêm</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Đội tuyển ({teams.length})</h3>
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
                    <button className="btn sm" onClick={() => openMembers(t)}>Thành viên</button>
                    <button className="btn danger sm" onClick={async () => {
                      const ok = await confirmBox(`Xóa đội ${t.name}?`, { danger: true, okLabel: 'Xóa' })
                      if (!ok) return
                      try { await api.deleteTeam(t.id); if (openTeam?.id === t.id) { setOpenTeam(null); setMembers([]) } load(); toast('Đã xóa đội.') }
                      catch (e) { toast(errMsg(e), 'err') }
                    }}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Tên đội (VD: HSG Sinh học)" aria-label="Tên đội" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} />
          {isPhpMode && <select className="select" style={{ maxWidth: 150 }} aria-label="Năm học của đội" value={tForm.school_year_id} onChange={(e) => setTForm({ ...tForm, school_year_id: e.target.value })}>
            <option value="">Năm học —</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>}
          <select className="select" style={{ maxWidth: 180 }} aria-label="Môn của đội" value={tForm.subject_id} onChange={(e) => setTForm({ ...tForm, subject_id: e.target.value })}>
            <option value="">Môn —</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 140 }} aria-label="Khối của đội" value={tForm.grade_id} onChange={(e) => setTForm({ ...tForm, grade_id: e.target.value })}>
            <option value="">Khối —</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="btn primary" onClick={saveTeam} disabled={saving}><IconPlus className="icn sm" />Thêm đội</button>
        </div>
      </div>
    </div>
  )
}
