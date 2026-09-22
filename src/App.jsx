import { NavLink, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { GraduationCap, Timer, TrendingUp, ShieldCheck, CircleUserRound, Sprout, TabletSmartphone } from 'lucide-react'
import Practice from './pages/Practice.jsx'
import Exam from './pages/Exam.jsx'
import Progress from './pages/Progress.jsx'
import Manage from './pages/Manage.jsx'
import Profile from './pages/Profile.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import { getBackendUrl, api, setBackendUrl, isPhpMode, getSession } from './api.js'

function useBackend() {
  const [url, setUrl] = useState('...');
  const [ok, setOk] = useState(null);
  const [info, setInfo] = useState(null);

  const check = async (u) => {
    try {
      if (isPhpMode) {
        const h = await api.health();
        setUrl(h.backend || 'Hostinger'); setOk(true); setInfo(h);
        return;
      }
      const base = u || await getBackendUrl();
      const r = await fetch(`${base}/api/health`);
      const j = await r.json();
      setUrl(base); setOk(r.ok); setInfo(j);
      if (u) setBackendUrl(u);
    } catch (e) {
      setOk(false); setInfo({ error: String(e) });
    }
  };

  useEffect(() => {
    getBackendUrl().then((u) => { setUrl(u); check(u); });
    if (isPhpMode) return; // hosting luôn thức, khỏi poll dày
    const t = setInterval(() => check(), 8000);
    if (window.electronAPI?.onBackendReady) window.electronAPI.onBackendReady((u) => check(u));
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  const mode = isPhpMode ? 'php' : 'legacy';
  return { url, ok, info, check, mode };
}

const TABS = [
  { to: '/', label: 'Học', long: 'Học theo chuyên đề', icon: GraduationCap, end: true },
  { to: '/exam', label: 'Thi', long: 'Thi thử bấm giờ', icon: Timer },
  { to: '/progress', label: 'Tiến độ', long: 'Tiến độ học', icon: TrendingUp },
  { to: '/manage', label: 'Quản lý', long: 'Quản lý', icon: ShieldCheck, teacher: true },
  { to: '/profile', label: 'Tôi', long: 'Hồ sơ', icon: CircleUserRound },
]

export default function App() {
  const backend = useBackend();
  const [sessionTick, setSessionTick] = useState(0);
  useEffect(() => {
    const bump = () => setSessionTick((v) => v + 1);
    window.addEventListener('session-changed', bump);
    window.addEventListener('storage', bump);
    return () => { window.removeEventListener('session-changed', bump); window.removeEventListener('storage', bump) };
  }, []);
  const role = (getSession().student?.role || 'student');
  void sessionTick;
  const tabs = TABS.filter((t) => !t.teacher || role === 'teacher');
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><Sprout className="icn lg" /><span>Ôn luyện HSG<small>Học tập trung theo chuyên đề</small></span></div>
        {tabs.map((t) => {
          const Icon = t.icon;
          return <NavLink key={t.to} className="navlink" to={t.to} end={t.end}><Icon className="icn" />{t.long}</NavLink>
        })}
        <div className="sidefoot">
          <div><span className={`status-dot ${backend.ok == null ? 'wait' : backend.ok ? 'ok' : 'bad'}`} />
            {backend.ok == null ? 'Đang kết nối…' : backend.ok ? (backend.mode === 'php' ? 'Hostinger: đã kết nối' : 'Server: sẵn sàng') : 'Chưa kết nối'}</div>
          <div className="small" style={{ marginTop: 6, wordBreak: 'break-all' }}>{backend.url}</div>
          <div className="small" style={{ marginTop: 6 }}>{backend.mode === 'legacy' ? 'Tự luận tự đối chiếu đáp án' : 'MySQL Hostinger — tắt máy vẫn chạy'}</div>
        </div>
      </aside>
      <header className="topbar">
        <b><Sprout className="icn sm" />Ôn luyện HSG</b>
        <span className="row">
          <button className="topbtn" title="Cài app lên điện thoại" onClick={() => window.dispatchEvent(new Event('pwa:ask'))}><TabletSmartphone className="icn sm" />Cài app</button>
          <span className="conn"><span className={`status-dot ${backend.ok == null ? 'wait' : backend.ok ? 'ok' : 'bad'}`} /><span className="conn-txt">{backend.ok ? 'Online' : '…'}</span></span>
        </span>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Practice />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/exam" element={<Exam />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
      <InstallPrompt />
      <nav className="tabbar">
        {tabs.map((t) => {
          const Icon = t.icon;
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
