import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  IconBook, IconTask, IconUser, IconMessage, IconPen, IconUsers,
  IconCalendar, IconWand, IconChart, IconCheckCircle,
} from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { isStaffRole } from '../lib/roles.js'
import { filterSubjects } from '../lib/subjects.js'

export default function Home() {
  const s = getSession()
  const me = s.student
  const isTeacher = isStaffRole(me?.role || 'student')
  if (!s.token) return <Navigate to="/login" replace />
  return isTeacher ? <TeacherHome /> : <StudentHome me={me} />
}

function Donut({ value, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)))
  const r = 42
  const c = 2 * Math.PI * r
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut" role="img" aria-label={`${label} ${pct}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="var(--accent)" strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="donut-label"><b>{pct}%</b><span>{label}</span></div>
    </div>
  )
}

function Bars({ items, max = 10, suffix = '' }) {
  if (!items.length) return <div className="empty">Chưa có dữ liệu.</div>
  return (
    <div className="bars">
      {items.map((item) => {
        const width = Math.max(2, Math.min(100, (Number(item.value) / max) * 100))
        return (
          <div className="bar-row" key={item.label}>
            <span className="bar-label">{item.label}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
            <b className="bar-value">{item.value}{suffix}</b>
          </div>
        )
      })}
    </div>
  )
}

function Sparkline({ points }) {
  if (points.length < 2) return <div className="empty">Chưa đủ dữ liệu để vẽ.</div>
  const values = points.map((p) => Number(p.value) || 0)
  const max = Math.max(...values, 10)
  const stepX = 100 / (values.length - 1)
  const coords = values.map((v, i) => `${(i * stepX).toFixed(2)},${(100 - (v / max) * 100).toFixed(2)}`).join(' ')
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sparkline" role="img" aria-label="Điểm gần đây">
      <polyline points={coords} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function StudentHome({ me }) {
  const [classes, setClasses] = useState([])
  const [progress, setProgress] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [subjects, setSubjects] = useState([])

  const load = () => {
    api.classes().then(setClasses).catch(() => setClasses([]))
    api.myProgress().then(setProgress).catch(() => setProgress(null))
    api.assignments().then(setAssignments).catch(() => setAssignments([]))
    api.mySubjects()
      .then((rows) => {
        const kept = filterSubjects(rows)
        if (kept.length) setSubjects(kept)
        else throw new Error('empty')
      })
      .catch(() => api.subjects()
        .then((all) => setSubjects(filterSubjects(all)))
        .catch(() => setSubjects([])))
  }
  useEffect(load, [])

  const todo = assignments.filter((a) => a.status === 'todo' || a.status === 'draft')
  const submitted = assignments.filter((a) => a.status === 'submitted' || a.status === 'graded')
  const graded = assignments.filter((a) => a.status === 'graded')
  const pct = Math.round((progress?.overall_ratio ?? progress?.ratio ?? 0) * 100)
  const topicBars = (progress?.by_topic || []).slice(0, 6).map((t) => ({ label: t.topic, value: t.avg ?? 0 }))
  const timeline = (progress?.timeline || []).slice().reverse().map((t) => ({ label: t.day, value: t.avg_score ?? 0 }))

  return (
    <div className="grid">
      <div className="hero">
        <h1>Xin chào, {me?.name}</h1>
        <p>{classes[0] ? `${classes[0].name}` : 'Chưa vào lớp nào'}{progress?.topics_total ? ` · ${progress.topics_done}/${progress.topics_total} chuyên đề đã hoàn thành` : ''}</p>
        <div style={{ marginTop: 14 }}>
          <div className="row spread" style={{ fontSize: 13, opacity: 0.9 }}>
            <span>Tiến độ học tập</span><b>{pct}%</b>
          </div>
          <div className="progress" style={{ marginTop: 6 }}>
            <div style={{ width: `${pct}%` }} />
          </div>
          {progress?.lessons_total > 0 && (
            <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
              {progress.lessons_done}/{progress.lessons_total} bài học · {progress.completed}/{progress.assigned} bài tập đã nộp
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Môn học</h3>
          <Link className="small" to="/topics">Tất cả →</Link>
        </div>
        {subjects.length === 0 ? (
          <div className="empty">Chưa có môn học.</div>
        ) : (
          <div className="subject-grid">
            <Link
              className="subject-tile subject-tile-green"
              to={isStaffRole(me?.role || 'student') ? `/manage/studio?subject=${subjects[0].id}` : `/topics/${subjects[0].id}`}
            >
              <IconBook className="icn lg" />
              <span>Công nghệ</span>
            </Link>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Thống kê của tôi</h3>
        <div className="chart-grid">
          <div className="chart-box">
            <div className="kicker">Tiến độ tổng</div>
            <Donut value={pct} label="hoàn thành" />
          </div>
          <div className="chart-box">
            <div className="kicker">Điểm trung bình theo chuyên đề</div>
            <Bars items={topicBars} max={10} suffix="" />
          </div>
          <div className="chart-box">
            <div className="kicker">Trạng thái bài tập</div>
            <Bars
              items={[
                { label: 'Chưa làm', value: todo.length },
                { label: 'Đã nộp', value: submitted.length },
                { label: 'Đã chấm', value: graded.length },
              ]}
              max={Math.max(1, assignments.length)}
            />
          </div>
          <div className="chart-box">
            <div className="kicker">Điểm gần đây</div>
            <Sparkline points={timeline} />
            {progress?.latest_score != null && (
              <div className="small muted" style={{ marginTop: 6 }}>Mới nhất: <b>{progress.latest_score}/10</b>{progress.latest_title ? ` · ${progress.latest_title}` : ''}</div>
            )}
          </div>
        </div>
      </div>

      {todo.length > 0 && (
        <div className="card">
          <h3>Bài tập chưa nộp</h3>
          {todo.slice(0, 5).map((a) => (
            <div key={a.id} className="board-row">
              <IconCheckCircle className="icn" style={{ color: 'var(--leaf)' }} />
              <div>
                <b>{a.title}</b>
                <div className="small muted">
                  {a.class_name}{a.deadline ? ` · hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}{a.topic_name ? ` · ${a.topic_name}` : ''}
                  {a.status === 'draft' && <span className="badge amber" style={{ marginLeft: 6 }}>Bản nháp</span>}
                </div>
              </div>
              <Link className="btn primary push" to={`/assignments/${a.id}`}>{a.status === 'draft' ? 'Tiếp tục' : 'Làm'}</Link>
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
        <div className="card"><div className="kicker"><IconUsers className="icn sm" />Học sinh</div><div className="kpi">{ov?.students ?? '—'}</div></div>
        <div className="card"><div className="kicker"><IconTask className="icn sm" />Bài đang giao</div><div className="kpi">{String(ov?.active_assignments ?? 0).padStart(2, '0')}</div></div>
        <div className="card"><div className="kicker"><IconMessage className="icn sm" />Bài chờ chấm</div><div className="kpi">{String(ov?.ungraded ?? 0).padStart(2, '0')}</div></div>
      </div>

      <div className="card">
        <h3>Bài tập gần đây</h3>
        {recent.length === 0 && <div className="empty">Chưa có bài tập — bấm "Tạo bài tập" ở tab Bài tập.</div>}
        {recent.map((a) => (
          <div key={a.id} className="board-row">
            <IconCalendar className="icn" style={{ color: 'var(--leaf)' }} />
            <div>
              <b>{a.title}</b>
              <div className="small muted">
                {a.class_name}{a.topic_name ? ` · ${a.topic_name}` : ''}
                {a.deadline ? ` · hạn ${new Date(a.deadline).toLocaleDateString('vi-VN')}` : ''}
                {' · '}{a.submitted}/{a.total} đã nộp{a.total - a.submitted > 0 ? ` · ${a.total - a.submitted} chưa nộp` : ''}
              </div>
            </div>
            <Link className="btn push" to={`/grading/${a.id}`}>Xem bài nộp</Link>
          </div>
        ))}
      </div>

      {tprog.length > 0 && (
        <div className="card">
          <h3>Tiến độ lớp theo chuyên đề</h3>
          {tprog.map((t) => (
            <div key={t.topic} className="board-row" style={{ display: 'block', padding: '10px 6px' }}>
              <div className="row spread" style={{ fontSize: 14 }}>
                <span>{t.topic}</span><b>{t.pct}%</b>
              </div>
              <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${t.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row">
          <Link className="btn primary" to="/manage/studio"><IconWand className="icn sm" />Studio tạo nội dung</Link>
          <Link className="btn" to="/assignments"><IconTask className="icn sm" />Bài tập</Link>
          <Link className="btn" to="/manage/team"><IconUsers className="icn sm" />Quản lý HS</Link>
          <Link className="btn" to="/grading"><IconPen className="icn sm" />Chấm bài{ov?.ungraded ? ` (${ov.ungraded})` : ''}</Link>
          <Link className="btn" to="/progress"><IconChart className="icn sm" />Thống kê</Link>
          <Link className="btn" to="/profile"><IconUser className="icn sm" />Hồ sơ</Link>
        </div>
      </div>
    </div>
  )
}
