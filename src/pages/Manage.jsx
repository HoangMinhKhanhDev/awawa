import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { BookOpen, FileUp, ShieldCheck, Users } from 'lucide-react'
import { getSession } from '../api.js'
import Bank from './Bank.jsx'
import ImportDoc from './ImportDoc.jsx'
import School from './School.jsx'
import Team from './Team.jsx'

const SUBS = ['team', 'bank', 'import', 'school']

export default function Manage() {
  const s = getSession()
  const role = s.student?.role || 'student'
  const isStaff = role === 'teacher' || role === 'admin'
  const isAdmin = role === 'admin'
  const loc = useLocation()
  const seg = (loc.pathname.split('/')[2] || 'team')
  const allowed = isAdmin ? SUBS : SUBS.filter((x) => x !== 'school')
  const sub = allowed.includes(seg) ? seg : 'team'
  if (!s.token || !isStaff) {
    return (
      <div className="grid">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Khu vực giáo viên</h1>
          <div className="empty">Chỉ tài khoản giáo viên / quản trị mới vào được. Đăng nhập ở tab Cá nhân.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Quản lý học sinh & đề</h1>
        <div className="small muted">
          {isAdmin
            ? 'Cấu trúc nhà trường, thành viên đội, tài khoản (khoá/mở), ngân hàng câu hỏi.'
            : 'Đội bạn phụ trách, tài khoản học sinh, ngân hàng câu hỏi, nhập đề.'}
        </div>
        <div className="subnav" style={{ marginTop: 12 }}>
          <NavLink className={`btn ${sub === 'team' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/team"><Users className="icn sm" />Học sinh</NavLink>
          <NavLink className={`btn ${sub === 'bank' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/bank"><BookOpen className="icn sm" />Ngân hàng đề</NavLink>
          <NavLink className={`btn ${sub === 'import' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/import"><FileUp className="icn sm" />Nhập đề</NavLink>
          {isAdmin && (
            <NavLink className={`btn ${sub === 'school' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/school">
              <ShieldCheck className="icn sm" />Nhà trường
            </NavLink>
          )}
        </div>
      </div>
      {sub === 'bank' && <Bank />}
      {sub === 'import' && <ImportDoc />}
      {sub === 'team' && <Team />}
      {sub === 'school' && isAdmin && <School />}
      {!allowed.includes(seg) && <Navigate to="/manage/team" replace />}
      {sub === 'school' && !isAdmin && <Navigate to="/manage/team" replace />}
    </div>
  )
}
