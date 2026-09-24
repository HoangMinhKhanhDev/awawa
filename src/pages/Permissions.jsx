import { useEffect, useState } from 'react'
import { IconShield, IconCheck } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { useUI } from '../components/ui.jsx'
import { isSuperRole, roleOf } from '../lib/roles.js'

const ROLE_LABEL = {
  student: 'Học sinh',
  teacher: 'Giáo viên',
  admin: 'Quản trị',
}

const ROLE_SCOPES = {
  student: ['own'],
  teacher: ['own', 'team'],
  admin: ['own', 'team', 'school'],
}

const SCOPE_LABEL = {
  own: 'Cá nhân',
  team: 'Đội',
  school: 'Trường',
  system: 'Hệ thống',
}

const PERM_LABEL = {
  'practice': 'Luyện tập',
  'exam': 'Thi thử',
  'assignments.submit': 'Nộp bài tập',
  'assignments.create': 'Tạo bài tập',
  'assignments.grade': 'Chấm bài',
  'lessons.read': 'Đọc bài học',
  'lessons.write': 'Sửa bài học',
  'bank.manage': 'Ngân hàng câu hỏi',
  'import.manage': 'Nhập đề DOCX',
  'studio.manage': 'Studio',
  'materials.read': 'Xem học liệu',
  'materials.write': 'Thêm học liệu',
  'students.view': 'Xem danh sách HS',
  'students.create': 'Thêm HS',
  'students.bulk': 'Thao tác hàng loạt',
  'students.lock': 'Khóa/mở TK',
  'students.delete': 'Xóa HS',
  'students.role': 'Đổi role',
  'progress.self': 'Tiến độ của mình',
  'progress.team': 'Thống kê đội',
  'export.reports': 'Xuất Excel/PDF',
  'school.view': 'Xem nhà trường',
  'school.manage': 'Sửa nhà trường',
  'notifications.send': 'Gửi thông báo',
  'permissions.manage': 'Sửa ma trận phân quyền',
  'users.manage_admin': 'Quản lý TK admin',
}

export default function Permissions() {
  const { toast, errMsg } = useUI()
  const me = getSession().student
  const superOk = isSuperRole(me)
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState({})
  const [scopeDraft, setScopeDraft] = useState({})
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const r = await api.permissions()
      setData(r)
      if (r.can_manage && r.matrix) {
        setDraft(JSON.parse(JSON.stringify(r.matrix)))
        const fallback = { student: 'own', teacher: 'team', admin: 'school' }
        const scopes = JSON.parse(JSON.stringify(r.scope_matrix || {}))
        for (const role of ['student', 'teacher', 'admin']) {
          for (const key of r.perm_keys || Object.keys(PERM_LABEL)) {
            if (!scopes[role]?.[key]) scopes[role] = { ...(scopes[role] || {}), [key]: fallback[role] }
          }
        }
        setScopeDraft(scopes)
      }
    } catch (e) { toast(errMsg(e), 'err') }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  if (!superOk) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Phân quyền</h1>
          <div className="empty">Chỉ super admin xem/sửa ma trận phân quyền. Role của bạn: <b>{roleOf(me)}</b></div>
          {data && (
            <div className="small muted">
              Quyền của bạn: {Object.entries(data.my_perms || {}).filter(([, v]) => v).map(([k]) => PERM_LABEL[k] || k).join(' · ') || '—'}
            </div>
          )}
        </div>
      </div>
    )
  }

  const editableRoles = ['student', 'teacher', 'admin']
  const keys = data?.perm_keys || Object.keys(PERM_LABEL)

  const toggle = (role, key) => {
    setDraft((d) => ({
      ...d,
      [role]: { ...(d[role] || {}), [key]: !(d[role] || {})[key] },
    }))
  }

  const setScope = (role, key, scope) => {
    setScopeDraft((current) => ({
      ...current,
      [role]: { ...(current[role] || {}), [key]: scope },
    }))
  }

  const saveRole = async (role) => {
    if (busy) return
    setBusy(true)
    try {
      const perms = {}
      const scopes = {}
      for (const k of keys) {
        perms[k] = draft[role]?.[k] ? 1 : 0
        scopes[k] = scopeDraft[role]?.[k] || ROLE_SCOPES[role][ROLE_SCOPES[role].length - 1]
      }
      await api.updatePermissions({ role, perms, scopes })
      toast(`Đã lưu phân quyền ${ROLE_LABEL[role] || role}.`)
      await load()
    } catch (e) { toast(errMsg(e), 'err') }
    setBusy(false)
  }

  if (!data) return <div className="grid"><div className="empty">Đang tải ma trận…</div></div>

  return (
    <div className="grid">
      <div className="card">
        <h1 className="icon-h"><IconShield className="icn" />Ma trận phân quyền</h1>
        <div className="small muted">
          Role <b>super_admin</b> luôn full quyền (không sửa được ở đây).
          Bật/tắt ô → <b>Lưu role</b> để áp dụng cho toàn hệ thống.
        </div>
        <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
          {editableRoles.map((r) => (
            <button key={r} className="btn primary" onClick={() => saveRole(r)} disabled={busy}>
              <IconCheck className="icn sm" />Lưu {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Quyền</th>
              {editableRoles.map((r) => <th key={r} style={{ width: 110, textAlign: 'center' }}>{ROLE_LABEL[r]}</th>)}
              <th style={{ width: 110, textAlign: 'center' }}>Super</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td><b>{PERM_LABEL[k] || k}</b><div className="small muted">{k}</div></td>
                {editableRoles.map((r) => (
                  <td key={r} style={{ textAlign: 'center' }}>
                    <div className="perm-cell">
                      <input
                        type="checkbox"
                        checked={!!(draft[r] || {})[k]}
                        onChange={() => toggle(r, k)}
                        aria-label={`${PERM_LABEL[k] || k} — ${ROLE_LABEL[r]}`}
                        style={{ width: 18, height: 18 }}
                      />
                      <select
                        className="select compact-select"
                        value={scopeDraft[r]?.[k] || ROLE_SCOPES[r][ROLE_SCOPES[r].length - 1]}
                        onChange={(event) => setScope(r, k, event.target.value)}
                        aria-label={`Phạm vi ${PERM_LABEL[k] || k} — ${ROLE_LABEL[r]}`}
                      >
                        {ROLE_SCOPES[r].map((scope) => <option key={scope} value={scope}>{SCOPE_LABEL[scope]}</option>)}
                      </select>
                    </div>
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}><span className="badge green">✓</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Quyền của tôi</h3>
        <div className="small muted" style={{ marginBottom: 6 }}>Role: <b>{data.my_role}</b></div>
        <div>
          {Object.entries(data.my_perms || {}).filter(([, v]) => v).map(([k]) => (
            <span key={k} className="badge green" style={{ marginRight: 4, marginBottom: 4 }}>{PERM_LABEL[k] || k}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
