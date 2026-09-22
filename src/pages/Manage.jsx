import { useState } from 'react'
import { BookOpen, FileUp, Users } from 'lucide-react'
import { getSession } from '../api.js'
import Bank from './Bank.jsx'
import ImportDoc from './ImportDoc.jsx'
import Team from './Team.jsx'

const SUBS = [
  { id: 'bank', label: 'Ngân hàng đề', icon: BookOpen },
  { id: 'import', label: 'Nhập đề', icon: FileUp },
  { id: 'team', label: 'Đội tuyển', icon: Users },
]

export default function Manage() {
  const s = getSession()
  const [sub, setSub] = useState('bank')
  if (!s.token || (s.student?.role || 'student') !== 'teacher') {
    return (
      <div className="grid">
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Khu vực giáo viên</h1>
          <div className="empty">Chỉ tài khoản giáo viên mới vào được. Đăng nhập tài khoản giáo viên ở tab Tôi.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="grid">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Quản lý</h1>
        <div className="small muted">Ra đề, nhập đề từ file, quản lý đội tuyển và đặt lại mật khẩu học sinh.</div>
        <div className="subnav" style={{ marginTop: 12 }}>
          {SUBS.map((t) => {
            const Icon = t.icon
            return (
              <button key={t.id} className={sub === t.id ? 'on' : ''} onClick={() => setSub(t.id)}>
                <Icon className="icn sm" />{t.label}
              </button>
            )
          })}
        </div>
      </div>
      {sub === 'bank' && <Bank />}
      {sub === 'import' && <ImportDoc />}
      {sub === 'team' && <Team />}
    </div>
  )
}
