import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../app/session-context.jsx'
import { fallbackPath, getManageRouteDescriptors } from '../app/routeRegistry.jsx'

export default function Manage() {
  const { token, isStaff, isAdmin, isSuper } = useSession()
  const loc = useLocation()
  const seg = (loc.pathname.split('/')[2] || '')
  const allowed = getManageRouteDescriptors({ isStaff, isAdmin, isSuper })

  if (!token || !isStaff) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Khu vực giáo viên</h1>
          <div className="empty">Chỉ tài khoản giáo viên / quản trị mới vào được. Đăng nhập ở tab Cá nhân.</div>
        </div>
      </div>
    )
  }

  const descriptor = allowed.find((entry) => entry.id === seg)
  if (!descriptor) {
    const fallback = allowed.find((entry) => entry.fallback) || allowed[0]
    return <Navigate to={fallback?.path || fallbackPath} replace />
  }

  const Content = descriptor.component

  return (
    <div className="grid">
      <div className="card">
        <h1>Quản lý nội dung</h1>
        <div className="small muted">
          Tạo nội dung nhanh (pipeline 4 bước) rồi mới đến ngân hàng, học sinh, nhà trường.
        </div>
        <div className="subnav" style={{ marginTop: 12 }} role="tablist" aria-label="Khu vực quản lý">
          {allowed.map(({ id, path, label, icon: Icon }) => (
            <NavLink key={id} role="tab" aria-selected={descriptor.id === id} className={descriptor.id === id ? 'on' : ''} to={path}>
              <Icon className="icn sm" />{label}
            </NavLink>
          ))}
        </div>
      </div>
      <Content />
    </div>
  )
}
