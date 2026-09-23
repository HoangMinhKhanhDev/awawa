import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { IconBook, IconFileUp, IconShield, IconUsers, IconWand } from '../components/icons.jsx'
import { getSession } from '../api.js'
import Bank from './Bank.jsx'
import ImportDoc from './ImportDoc.jsx'
import School from './School.jsx'
import Studio from './Studio.jsx'
import Team from './Team.jsx'

const SUBS = ['studio', 'team', 'bank', 'import', 'school']

export default function Manage() {
  const s = getSession()
  const role = s.student?.role || 'student'
  const isStaff = role === 'teacher' || role === 'admin'
  const isAdmin = role === 'admin'
  const loc = useLocation()
  const seg = (loc.pathname.split('/')[2] || '')
  const allowed = isAdmin ? SUBS : SUBS.filter((x) => x !== 'school')

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
  // seg rỗng (đang ở /manage) hoặc không hợp lệ → redirect ngay, không mount nhầm Studio
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
    </div>
  )
}
