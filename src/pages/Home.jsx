import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, ClipboardCheck, ClipboardList, MessageSquare, PenLine, Users, Trophy, Play } from 'lucide-react'
import { api, getSession } from '../api.js'

export default function Home() {
  const s = getSession()
  const me = s.student
  const isTeacher = (me?.role || 'student') === 'teacher'
  const nav = useNavigate()

  if (!s.token) {
    return (
      <div className="grid">
        <div className="hero">
          <h1>Lớp bồi dưỡng HSG</h1>
          <p>Đăng nhập để học, làm bài tập được giao và xem kết quả của riêng bạn.</p>
          <div className="hero-cta">
            <button className="btn hero-go" onClick={() => nav('/profile')}><Play className="icn sm" />Đăng nhập / Đăng ký</button>
          </div>
        </div>
      </div>
    )
  }
  return isTeacher ? <TeacherHome /> : <StudentHome me={me} />
}

function StudentHome({ me }) {
  const [classes, setClasses] = useState([])
  const [progress, setProgress] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => {
    api.classes().then(setClasses).catch(() => setClasses([]))
    api.myProgress().then(setProgress).catch(() => setProgress(null))
    api.assignments().then(setAssignments).catch(() => setAssignments([]))
  }
  useEffect(load, [])

  const join = async () => {
    setMsg('')
    try {
      await api.joinClass(joinCode.trim())
      setJoinCode('')
      load()
    } catch (e) { setMsg(String(e.message || e)) }
  }

  const inClass = classes.length > 0
  const todo = assignments.filter((a) => a.status === 'todo')
  const firstName = (me?.name || '').split(' ').slice(-1)[0] || me?.name || ''
  const pct = Math.round((progress?.ratio || 0) * 100)

  return (
    <div className="grid">
      <div className="hero">
        <h1>Xin chào, {me?.name}</h1>
        <p>{classes[0] ? `${classes[0].name} • ${classes.length} lớp` : 'Chưa vào lớp nào'}</p>
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, opacity: 0.9 }}>
            <span>Tiến độ học tập</span><b>{pct}%</b>
          </div>
          <div className="progress" style={{ marginTop: 6, background: 'rgba(255,255,255,.25)' }}>
            <div style={{ width: `${pct}%`, background: '#fff' }} />
          </div>
        </div>
      </div>

      {!inClass && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Vào lớp</h3>
          <div className="row">
            <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Nhập mã lớp (VD: HSG2026)" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
            <button className="btn primary" onClick={join}>Vào lớp</button>
          </div>
          {msg && <div className="small" style={{ color: '#b91c1c', marginTop: 8 }}>{msg}</div>}
          <div className="small muted" style={{ marginTop: 8 }}>Nhận mã lớp từ giáo viên để vào lớp và nhận bài tập.</div>
        </div>
      )}

      <div className="grid c3">
        <div className="card">
          <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><BookOpen className="icn sm" />Bài học hiện tại</div>
          <div className="kpi" style={{ fontSize: 18 }}>{progress?.by_topic?.[0]?.topic || '—'}</div>
          <Link className="small" to="/topics">Mở chuyên đề →</Link>
        </div>
        <div className="card">
          <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ClipboardList className="icn sm" />Bài tập cần làm</div>
          <div className="kpi">{todo.length} bài</div>
          <Link className="small" to="/assignments">Làm bài →</Link>
        </div>
        <div className="card">
          <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Trophy className="icn sm" />Kết quả gần nhất</div>
          <div className="kpi">{progress?.latest_score != null ? `${progress.latest_score} / 10` : '—'}</div>
          <Link className="small" to="/results">Xem tất cả →</Link>
        </div>
      </div>

      {todo.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Bài tập chưa nộp</h3>
          {todo.slice(0, 5).map((a) => (
            <div key={a.id} className="board-row">
              <ClipboardCheck className="icn" style={{ color: 'var(--leaf)' }} />
              <div>
                <b>{a.title}</b>
                <div className="small muted">{a.class_name}{a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}{a.topic_name ? ` • ${a.topic_name}` : ''}</div>
              </div>
              <Link className="btn primary" style={{ marginLeft: 'auto' }} to={`/assignments/${a.id}`}>Làm</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeacherHome() {
  const [ov, setOv] = useState(null)
  useEffect(() => { api.classOverview().then(setOv).catch(() => {}) }, [])
  return (
    <div className="grid">
      <div className="hero">
        <h1>Tổng quan lớp</h1>
        <p>Lớp bồi dưỡng HSG — theo dõi học sinh, giao bài và chấm điểm.</p>
      </div>
      <div className="grid c3">
        <div className="card"><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Users className="icn sm" />Học sinh</div><div className="kpi">{ov?.students ?? '—'}</div></div>
        <div className="card"><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ClipboardList className="icn sm" />Bài tập đang giao</div><div className="kpi">{String(ov?.active_assignments ?? 0).padStart(2, '0')}</div></div>
        <div className="card"><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><MessageSquare className="icn sm" />Bài chưa chấm</div><div className="kpi">{String(ov?.ungraded ?? 0).padStart(2, '0')}</div></div>
      </div>
      <div className="card">
        <div className="row">
          <Link className="btn primary" to="/assignments"><ClipboardList className="icn sm" />Quản lý bài tập</Link>
          <Link className="btn" to="/manage"><Users className="icn sm" />Quản lý học sinh</Link>
          <Link className="btn" to="/progress"><Trophy className="icn sm" />Xem kết quả</Link>
          <Link className="btn" to="/grading"><PenLine className="icn sm" />Chấm bài{ov?.ungraded ? ` (${ov.ungraded})` : ''}</Link>
        </div>
      </div>
    </div>
  )
}
