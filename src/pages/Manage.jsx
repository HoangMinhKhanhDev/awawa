import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { IconBook, IconFileUp, IconShield, IconUsers, IconWand } from '../components/icons.jsx'
import { getSession } from '../api.js'
import { isAdminRole, isStaffRole } from '../lib/roles.js'
import Bank from './Bank.jsx'
import ImportDoc from './ImportDoc.jsx'
import Permissions from './Permissions.jsx'
import School from './School.jsx'
import Studio from './Studio.jsx'
import Team from './Team.jsx'

const SUBS = ['studio', 'team', 'bank', 'import', 'school', 'permissions']

export default function Manage() {
  const s = getSession()
  const role = s.student?.role || 'student'
  const isStaff = isStaffRole(role)
  const isAdmin = isAdminRole(role)
  const isSuper = role === 'super_admin'
  const loc = useLocation()
  const seg = (loc.pathname.split('/')[2] || '')
  const allowed = SUBS.filter((x) => {
    if (x === 'school') return isAdmin
    if (x === 'permissions') return isSuper
    return true
  })

  if (!s.token || !isStaff) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Khu vực giáo viên</h1>
          <div className="empty">Chỉ tài khoản giáo viên / quản trị mới vào được. Đăng nhập ở tab Cá nhân.</div>
        </div>
      </div>
    )
  }
  if (!seg || !allowed.includes(seg)) {
    return <Navigate to={allowed.includes('team') ? '/manage/team' : '/manage/studio'} replace />
  }
  const sub = seg

  const tabs = [
    { id: 'studio', to: '/manage/studio', label: 'Studio', Icon: IconWand },
    { id: 'team', to: '/manage/team', label: 'Học sinh', Icon: IconUsers },
    { id: 'bank', to: '/manage/bank', label: 'Ngân hàng', Icon: IconBook },
    { id: 'import', to: '/manage/import', label: 'Nhập đề', Icon: IconFileUp },
    ...(isAdmin ? [{ id: 'school', to: '/manage/school', label: 'Nhà trường', Icon: IconShield }] : []),
    ...(isSuper ? [{ id: 'permissions', to: '/manage/permissions', label: 'Phân quyền', Icon: IconShield }] : []),
  ]

  return (
    <div className="grid">
      <div className="card">
        <h1>Quản lý nội dung</h1>
        <div className="small muted">
          Tạo nội dung nhanh (pipeline 4 bước) rồi mới đến ngân hàng, học sinh, nhà trường.
        </div>
        <div className="subnav" style={{ marginTop: 12 }} role="tablist" aria-label="Khu vực quản lý">
          {tabs.map(({ id, to, label, Icon }) => (
            <NavLink key={id} role="tab" aria-selected={sub === id} className={sub === id ? 'on' : ''} to={to}>
              <Icon className="icn sm" />{label}
            </NavLink>
          ))}
        </div>
      </div>
      {sub === 'studio' && <Studio />}
      {sub === 'bank' && <Bank />}
      {sub === 'import' && <ImportDoc />}
      {sub === 'team' && <Team />}
      {sub === 'school' && isAdmin && <School />}
      {sub === 'permissions' && isSuper && <Permissions />}
    </div>
  )
}
