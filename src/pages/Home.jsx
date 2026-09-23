import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { BookOpen, ClipboardCheck, ClipboardList, MessageSquare, PenLine, Users, Trophy, Play, CalendarClock } from 'lucide-react'
import { api, getSession } from '../api.js'

export default function Home() {
  const s = getSession()
  const me = s.student
  const isTeacher = (me?.role || 'student') === 'teacher'
  if (!s.token) return <Navigate to="/login" replace />
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
  const todo = assignments.filter((a) => a.status === 'todo' || a.status === 'draft')
  const pct = Math.round((progress?.overall_ratio ?? progress?.ratio ?? 0) * 100)
  const ct = progress?.current_topic

  return (
    <div className="grid">
      <div className="hero">
        <h1>Xin chào, {me?.name}</h1>
        <p>{classes[0] ? `${classes[0].name}` : 'Chưa vào lớp nào'}{progress?.topics_total ? ` • ${progress.topics_done}/${progress.topics_total} chuyên đề đã hoàn thành` : ''}</p>
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, opacity: 0.9 }}>
            <span>Tiến độ học tập</span><b>{pct}%</b>
          </div>
          <div className="progress" style={{ marginTop: 6, background: 'rgba(255,255,255,.25)' }}>
            <div style={{ width: `${pct}%`, background: '#fff' }} />
          </div>
          {progress?.lessons_total > 0 && (
            <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
              {progress.lessons_done}/{progress.lessons_total} bài học • {progress.completed}/{progress.assigned} bài tập đã nộp
            </div>
          )}
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
          <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><BookOpen className="icn sm" />Đang học</div>
          <div className="kpi" style={{ fontSize: 18 }}>{ct ? ct.name : (progress?.by_topic?.[0]?.topic || '—')}</div>
          {ct && <div className="small muted">Bài học {ct.done}/{ct.total}</div>}
          <Link className="small" to={ct ? `/topics/ly` : '/topics'}>Tiếp tục →</Link>
        </div>
        <div className="card">
          <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ClipboardList className="icn sm" />Bài tập</div>
          <div className="kpi">{todo.length} bài chưa làm</div>
          <Link className="small" to="/assignments">Xem bài →</Link>
        </div>
        <div className="card">
          <div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Trophy className="icn sm" />Kết quả gần nhất</div>
          <div className="kpi">{progress?.latest_score != null ? `${progress.latest_score} / 10` : '—'}</div>
          {progress?.latest_title && <div className="small muted">{progress.latest_title}</div>}
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
                <div className="small muted">
                  {a.class_name}{a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}{a.topic_name ? ` • ${a.topic_name}` : ''}
                  {a.status === 'draft' && <span className="badge amber" style={{ marginLeft: 6 }}>Bản nháp</span>}
                </div>
              </div>
              <Link className="btn primary" style={{ marginLeft: 'auto' }} to={`/assignments/${a.id}`}>{a.status === 'draft' ? 'Tiếp tục' : 'Làm'}</Link>
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
  const recent = ov?.recent_assignments || []
  const tprog = ov?.topic_progress || []
  return (
    <div className="grid">
      <div className="hero">
        <h1>Đội tuyển / Lớp HSG</h1>
        <p>Năm học 2026–2027 — theo dõi học sinh, giao bài và chấm điểm.</p>
      </div>
      <div className="grid c3">
        <div className="card"><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Users className="icn sm" />Học sinh</div><div className="kpi">{ov?.students ?? '—'}</div></div>
        <div className="card"><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ClipboardList className="icn sm" />Bài đang giao</div><div className="kpi">{String(ov?.active_assignments ?? 0).padStart(2, '0')}</div></div>
        <div className="card"><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><MessageSquare className="icn sm" />Bài chờ chấm</div><div className="kpi">{String(ov?.ungraded ?? 0).padStart(2, '0')}</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Bài tập gần đây</h3>
        {recent.length === 0 && <div className="empty">Chưa có bài tập — bấm "Tạo bài tập" ở tab Bài tập.</div>}
        {recent.map((a) => (
          <div key={a.id} className="board-row">
            <CalendarClock className="icn" style={{ color: 'var(--leaf)' }} />
            <div>
              <b>{a.title}</b>
              <div className="small muted">
                {a.class_name}{a.topic_name ? ` • ${a.topic_name}` : ''}
                {a.deadline ? ` • hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}
                {' • '}{a.submitted}/{a.total} đã nộp{a.total - a.submitted > 0 ? ` · ${a.total - a.submitted} chưa nộp` : ''}
              </div>
            </div>
            <Link className="btn" style={{ marginLeft: 'auto' }} to={`/grading/${a.id}`}>Xem bài nộp</Link>
          </div>
        ))}
      </div>

      {tprog.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Tiến độ lớp theo chuyên đề</h3>
          {tprog.map((t) => (
            <div key={t.topic} style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                <span>{t.topic}</span><b>{t.pct}%</b>
              </div>
              <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${t.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row">
          <Link className="btn primary" to="/assignments"><ClipboardList className="icn sm" />Tạo / quản lý bài tập</Link>
          <Link className="btn" to="/manage"><Users className="icn sm" />Quản lý học sinh</Link>
          <Link className="btn" to="/progress"><Trophy className="icn sm" />Xem kết quả</Link>
          <Link className="btn" to="/grading"><PenLine className="icn sm" />Chấm bài{ov?.ungraded ? ` (${ov.ungraded})` : ''}</Link>
          <Link className="btn" to="/assignments"><Play className="icn sm" />Giao bài mới</Link>
        </div>
      </div>
    </div>
  )
}
