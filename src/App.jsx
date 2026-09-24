import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  IconHome, IconBook, IconTask, IconChart, IconUser, IconCap, IconTimer,
  IconShield, IconUsers, IconPen, IconTable, IconSprout, IconWand,
  IconFileUp, IconMoon, IconSun, IconSchool,
} from './components/icons.jsx'
import { UIProvider } from './components/ui.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import NotificationsBell from './components/NotificationsBell.jsx'
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
    getBackendUrl().then((u) => { setUrl(u); check(u) }).catch(() => setOk(false))
    if (isPhpMode) return
    const t = setInterval(() => check(), 8000)
    if (window.electronAPI?.onBackendReady) window.electronAPI.onBackendReady((u) => check(u))
    return () => clearInterval(t)
    // eslint-disable-next-line
  }, [])

  const mode = isPhpMode ? 'php' : 'legacy'
  return { url, ok, check, mode }
}

// Nav theo vai trò
const studentTabs = [
  { to: '/', label: 'Trang chủ', long: 'Trang chủ', icon: IconHome, end: true },
  { to: '/topics', label: 'Học tập', long: 'Chuyên đề', icon: IconBook },
  { to: '/assignments', label: 'Bài tập', long: 'Bài tập', icon: IconTask },
  { to: '/results', label: 'Kết quả', long: 'Kết quả', icon: IconChart },
  { to: '/profile', label: 'Cá nhân', long: 'Hồ sơ', icon: IconUser },
]
const teacherTabs = [
  { to: '/', label: 'Tổng quan', long: 'Tổng quan', icon: IconHome, end: true },
  { to: '/manage/studio', label: 'Studio', long: 'Studio', icon: IconWand },
  { to: '/manage/team', label: 'Học sinh', long: 'Học sinh', icon: IconUsers },
  { to: '/topics', label: 'Chuyên đề', long: 'Chuyên đề', icon: IconBook },
  { to: '/assignments', label: 'Bài tập', long: 'Bài tập', icon: IconTask },
  { to: '/grading', label: 'Chấm bài', long: 'Chấm bài', icon: IconPen },
  { to: '/progress', label: 'Thống kê', long: 'Thống kê', icon: IconTable },
  { to: '/profile', label: 'Cá nhân', long: 'Hồ sơ', icon: IconUser },
]
const studentMobile = studentTabs
const teacherMobile = teacherTabs.filter((t) =>
  t.to === '/' || t.to === '/manage/studio' || t.to === '/grading' || t.to === '/profile' || t.to === '/assignments')

const THEME_KEY = 'hsg-theme'
function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  } catch { return 'light' }
}

function AppInner() {
  const backend = useBackend()
  const [, setTick] = useState(0)
  const [theme, setTheme] = useState(getTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#101816' : '#1e56d6')
  }, [theme])

  useEffect(() => {
    const bump = () => setTick((v) => v + 1)
    window.addEventListener('session-changed', bump)
    window.addEventListener('storage', bump)
    return () => { window.removeEventListener('session-changed', bump); window.removeEventListener('storage', bump) }
  }, [])

  const s = getSession()
  const role = s.student?.role || 'student'
  const isStaff = role === 'teacher' || role === 'admin' || role === 'super_admin'
  const isAdmin = role === 'admin' || role === 'super_admin'
  const isSuper = role === 'super_admin'
  const desktopTabs = isStaff ? teacherTabs : studentTabs
  const mobileTabs = isStaff ? teacherMobile : studentMobile

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><IconSprout className="icn lg" /><span>Ôn luyện HSG<small>Lớp bồi dưỡng HSG</small></span></div>
        <nav aria-label="Điều hướng chính" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {desktopTabs.map((t) => {
            const Icon = t.icon
            return <NavLink key={t.to} className="navlink" to={t.to} end={t.end}><Icon className="icn" />{t.long}</NavLink>
          })}
          <div className="nav-extra">
            <NavLink className="navlink small" to="/practice"><IconCap className="icn sm" />Luyện nhanh</NavLink>
            <NavLink className="navlink small" to="/exam"><IconTimer className="icn sm" />Thi thử bấm giờ</NavLink>
            {isStaff && <NavLink className="navlink small" to="/manage/bank"><IconShield className="icn sm" />Ngân hàng đề</NavLink>}
            {isStaff && <NavLink className="navlink small" to="/manage/import"><IconFileUp className="icn sm" />Nhập đề DOCX</NavLink>}
            {isAdmin && <NavLink className="navlink small" to="/manage/school"><IconSchool className="icn sm" />Nhà trường</NavLink>}
            {isSuper && <NavLink className="navlink small" to="/manage/permissions"><IconShield className="icn sm" />Phân quyền</NavLink>}
          </div>
        </nav>
        <div className="sidefoot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="theme-toggle"
              aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
              title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? <IconSun className="icn sm" /> : <IconMoon className="icn sm" />}
            </button>
            <span>{theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}</span>
          </div>
        </div>
      </aside>
      <header className="topbar">
        <b><IconSprout className="icn sm" />Ôn luyện HSG</b>
        <span className="row">
          <NotificationsBell />
          <button
            className="theme-toggle"
            aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
            title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <IconSun className="icn sm" /> : <IconMoon className="icn sm" />}
          </button>
          {/* Cài app → Hồ sơ · Tài khoản; bỏ chấm đỏ + "…" kết nối khỏi topbar */}
        </span>
      </header>
      <main className="main">
        <ErrorBoundary>
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
        </ErrorBoundary>
      </main>
      <InstallPrompt />
      <nav className="tabbar" aria-label="Điều hướng chính (điện thoại)">
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

export default function App() {
  return (
    <UIProvider>
      <AppInner />
    </UIProvider>
  )
}

function okClass(ok) {
  return ok == null ? 'wait' : ok ? 'ok' : 'bad'
}
