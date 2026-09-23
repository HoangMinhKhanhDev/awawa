import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { BookOpen, FileUp, Users } from 'lucide-react'
import { getSession } from '../api.js'
import Bank from './Bank.jsx'
import ImportDoc from './ImportDoc.jsx'
import Team from './Team.jsx'

const SUBS = ['team', 'bank', 'import']

export default function Manage() {
  const s = getSession()
  const loc = useLocation()
  const seg = (loc.pathname.split('/')[2] || 'team')
  const sub = SUBS.includes(seg) ? seg : 'team'
  if (!s.token || (s.student?.role || 'student') !== 'teacher') {
    return (
      <div className="grid">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Khu vực giáo viên</h1>
          <div className="empty">Chỉ tài khoản giáo viên mới vào được. Đăng nhập tài khoản giáo viên ở tab Cá nhân.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Quản lý học sinh & đề</h1>
        <div className="small muted">Thành viên lớp, ngân hàng câu hỏi, nhập đề từ file, đặt lại mật khẩu học sinh.</div>
        <div className="subnav" style={{ marginTop: 12 }}>
          <NavLink className={`btn ${sub === 'team' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/team"><Users className="icn sm" />Học sinh</NavLink>
          <NavLink className={`btn ${sub === 'bank' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/bank"><BookOpen className="icn sm" />Ngân hàng đề</NavLink>
          <NavLink className={`btn ${sub === 'import' ? 'primary' : ''}`} style={{ textDecoration: 'none' }} to="/manage/import"><FileUp className="icn sm" />Nhập đề</NavLink>
        </div>
      </div>
      {sub === 'bank' && <Bank />}
      {sub === 'import' && <ImportDoc />}
      {sub === 'team' && <Team />}
      {sub !== 'team' && sub !== 'bank' && sub !== 'import' && <Navigate to="/manage/team" replace />}
    </div>
  )
}
