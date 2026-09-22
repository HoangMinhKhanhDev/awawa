import { NavLink, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Bank from './pages/Bank.jsx'
import Practice from './pages/Practice.jsx'
import Exam from './pages/Exam.jsx'
import Progress from './pages/Progress.jsx'
import ImportDoc from './pages/ImportDoc.jsx'
import Team from './pages/Team.jsx'
import Profile from './pages/Profile.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import { getBackendUrl, api, setBackendUrl, isPhpMode } from './api.js'

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
  { to: '/', label: 'Chính', icon: '🏠' },
  { to: '/bank', label: 'Câu hỏi', icon: '📚' },
  { to: '/practice', label: 'Luyện', icon: '✏️' },
  { to: '/exam', label: 'Thi', icon: '⏱' },
  { to: '/team', label: 'Đội', icon: '👥' },
  { to: '/profile', label: 'Hồ sơ', icon: '👤' },
  { to: '/progress', label: 'Tiến độ', icon: '📈' },
  { to: '/import', label: 'Nhập đề', icon: '📥' }
]

export default function App() {
  const backend = useBackend();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Ôn luyện HSG<small>Học tập trung theo chuyên đề</small></div>
        <NavLink className="navlink" to="/">Tổng quan</NavLink>
        <NavLink className="navlink" to="/bank">Ngân hàng câu hỏi</NavLink>
        <NavLink className="navlink" to="/practice">Luyện theo chuyên đề</NavLink>
        <NavLink className="navlink" to="/exam">Thi thử bấm giờ</NavLink>
        <NavLink className="navlink" to="/team">Đội tuyển</NavLink>
        <NavLink className="navlink" to="/profile">Hồ sơ</NavLink>
        <NavLink className="navlink" to="/progress">Tiến độ học</NavLink>
        <NavLink className="navlink" to="/import">Nhập đề DOCX / PDF</NavLink>
        <div className="sidefoot">
          <div><span className={`status-dot ${backend.ok == null ? 'wait' : backend.ok ? 'ok' : 'bad'}`} />
            {backend.ok == null ? 'Đang kết nối…' : backend.ok ? (backend.mode === 'php' ? 'Hostinger: đã kết nối' : 'Server: sẵn sàng') : 'Chưa kết nối'}</div>
          <div className="small" style={{ marginTop: 6, wordBreak: 'break-all' }}>{backend.url}</div>
          <div className="small" style={{ marginTop: 6 }}>{backend.mode === 'legacy' ? 'Tự luận tự đối chiếu đáp án' : 'MySQL Hostinger — tắt máy vẫn chạy'}</div>
        </div>
      </aside>
      <header className="topbar">
        <b>Ôn luyện HSG</b>
        <span className="row">
          <button className="topbtn" title="Cài app lên điện thoại" onClick={() => window.dispatchEvent(new Event('pwa:ask'))}>📲 Cài app</button>
          <span className="conn"><span className={`status-dot ${backend.ok == null ? 'wait' : backend.ok ? 'ok' : 'bad'}`} /><span className="conn-txt">{backend.ok ? 'Online' : '…'}</span></span>
        </span>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard backend={backend} />} />
          <Route path="/bank" element={<Bank />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/exam" element={<Exam />} />
          <Route path="/team" element={<Team />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/import" element={<ImportDoc />} />
        </Routes>
      </main>
      <InstallPrompt />
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            <span className="tab-ico">{t.icon}</span>
            <span className="tab-lbl">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
