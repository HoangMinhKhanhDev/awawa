import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { House, BookOpen, ClipboardList, ChartLine, CircleUserRound, GraduationCap, Timer, ShieldCheck, Users, PenLine, Table2, Sprout, TabletSmartphone } from 'lucide-react'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Topics from './pages/Topics.jsx'
import Assignments from './pages/Assignments.jsx'
import Results from './pages/Results.jsx'
import Grading from './pages/Grading.jsx'
import Profile from './pages/Profile.jsx'
import Practice from './pages/Practice.jsx'
import Exam from './pages/Exam.jsx'
import Progress from './pages/Progress.jsx'
import Manage from './pages/Manage.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import { getBackendUrl, api, setBackendUrl, isPhpMode, getSession } from './api.js'

function useBackend() {
  const [url, setUrl] = useState('...')
  const [ok, setOk] = useState(null)

  const check = async (u) => {
    try {
      if (isPhpMode) {
        const h = await api.health()
        setUrl(h.backend || 'Hostinger'); setOk(true)
        return
      }
      const base = u || await getBackendUrl()
      const r = await fetch(`${base}/api/health`)
      setUrl(base); setOk(r.ok)
      if (u) setBackendUrl(u)
    } catch {
      setOk(false)
    }
  }

  useEffect(() => {
    getBackendUrl().then((u) => { setUrl(u); check(u) })
    if (isPhpMode) return
    const t = setInterval(() => check(), 8000)
    if (window.electronAPI?.onBackendReady) window.electronAPI.onBackendReady((u) => check(u))
    return () => clearInterval(t)
    // eslint-disable-next-line
  }, [])

  const mode = isPhpMode ? 'php' : 'legacy'
  return { url, ok, check, mode }
}

// Nav theo vai trò (spec MVP)
const studentTabs = [
  { to: '/', label: 'Trang chủ', long: 'Trang chủ', icon: House, end: true },
  { to: '/topics', label: 'Học tập', long: 'Chuyên đề', icon: BookOpen },
  { to: '/assignments', label: 'Bài tập', long: 'Bài tập', icon: ClipboardList },
  { to: '/results', label: 'Kết quả', long: 'Kết quả', icon: ChartLine },
  { to: '/profile', label: 'Cá nhân', long: 'Hồ sơ', icon: CircleUserRound },
]
const teacherTabs = [
  { to: '/', label: 'Tổng quan', long: 'Tổng quan', icon: House, end: true },
  { to: '/manage', label: 'Học sinh', long: 'Quản lý học sinh', icon: Users },
  { to: '/topics', label: 'Chuyên đề', long: 'Chuyên đề', icon: BookOpen },
  { to: '/assignments', label: 'Bài tập', long: 'Bài tập', icon: ClipboardList },
  { to: '/grading', label: 'Chấm bài', long: 'Chấm bài', icon: PenLine },
  { to: '/progress', label: 'Thống kê', long: 'Thống kê', icon: Table2 },
]
// Mobile tối đa 5: GV gộp Học sinh + Thống kê vào Tổng quan menu? Spec mobile 5 mục — GV mượn layout HS, đổi nhãn
const studentMobile = studentTabs
const teacherMobile = teacherTabs.filter((t) => t.to !== '/topics' && t.to !== '/progress')
  .concat([{ to: '/progress', label: 'Thống kê', long: 'Thống kê', icon: Table2 }])

export default function App() {
  const backend = useBackend()
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((v) => v + 1)
    window.addEventListener('session-changed', bump)
    window.addEventListener('storage', bump)
    return () => { window.removeEventListener('session-changed', bump); window.removeEventListener('storage', bump) }
  }, [])

  const s = getSession()
  const role = s.student?.role || 'student'
  const desktopTabs = role === 'teacher' ? teacherTabs : studentTabs
  const mobileTabs = role === 'teacher' ? teacherMobile : studentMobile

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><Sprout className="icn lg" /><span>Ôn luyện HSG<small>Lớp bồi dưỡng HSG</small></span></div>
        {desktopTabs.map((t) => {
          const Icon = t.icon
          return <NavLink key={t.to} className="navlink" to={t.to} end={t.end}><Icon className="icn" />{t.long}</NavLink>
        })}
        <div className="nav-extra">
          <NavLink className="navlink small" to="/practice"><GraduationCap className="icn sm" />Luyện nhanh</NavLink>
          <NavLink className="navlink small" to="/exam"><Timer className="icn sm" />Thi thử bấm giờ</NavLink>
          {role === 'teacher' && <NavLink className="navlink small" to="/manage/bank"><ShieldCheck className="icn sm" />Ngân hàng đề</NavLink>}
        </div>
        <div className="sidefoot">
          <div><span className={`status-dot ${okClass(backend.ok)}`} />
            {backend.ok == null ? 'Đang kết nối…' : backend.ok ? (backend.mode === 'php' ? 'Hostinger: đã kết nối' : 'Server: sẵn sàng') : 'Chưa kết nối'}</div>
          <div className="small" style={{ marginTop: 6, wordBreak: 'break-all' }}>{backend.url}</div>
        </div>
      </aside>
      <header className="topbar">
        <b><Sprout className="icn sm" />Ôn luyện HSG</b>
        <span className="row">
          <button className="topbtn" title="Cài app lên điện thoại" onClick={() => window.dispatchEvent(new Event('pwa:ask'))}><TabletSmartphone className="icn sm" />Cài app</button>
          <span className="conn"><span className={`status-dot ${okClass(backend.ok)}`} /><span className="conn-txt">{backend.ok ? 'Online' : '…'}</span></span>
        </span>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/topics/:subjectId" element={<Topics />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/assignments/:id" element={<Assignments />} />
          <Route path="/results" element={<Results />} />
          <Route path="/grading" element={<Grading />} />
          <Route path="/grading/:id" element={<Grading />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/exam" element={<Exam />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/manage/*" element={<Manage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <InstallPrompt />
      <nav className="tabbar">
        {mobileTabs.map((t) => {
          const Icon = t.icon
          return (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
              <Icon className="icn" />
              <span className="tab-lbl">{t.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

function okClass(ok) {
  return ok == null ? 'wait' : ok ? 'ok' : 'bad'
}
