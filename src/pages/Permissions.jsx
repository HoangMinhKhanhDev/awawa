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
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const r = await api.permissions()
      setData(r)
      if (r.can_manage && r.matrix) setDraft(JSON.parse(JSON.stringify(r.matrix)))
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

  const saveRole = async (role) => {
    if (busy) return
    setBusy(true)
    try {
      const perms = {}
      for (const k of keys) perms[k] = draft[role]?.[k] ? 1 : 0
      await api.updatePermissions({ role, perms })
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
                    <input
                      type="checkbox"
                      checked={!!(draft[r] || {})[k]}
                      onChange={() => toggle(r, k)}
                      aria-label={`${PERM_LABEL[k] || k} — ${ROLE_LABEL[r]}`}
                      style={{ width: 18, height: 18 }}
                    />
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
