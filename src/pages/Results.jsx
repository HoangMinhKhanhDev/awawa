import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconTrophy, IconTask, IconChart } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { isStaffRole } from '../lib/roles.js'

export default function Results() {
  const s = getSession()
  const isTeacher = isStaffRole(s.student?.role || 'student')
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (!s.token || isTeacher) return
    let alive = true
    api.myProgress().then((r) => alive && setProgress(r)).catch(() => {})
    api.myResults().then((r) => alive && setResults(r.results || [])).catch(() => {})
    return () => { alive = false }
  }, []) // eslint-disable-line

  if (!s.token) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Kết quả</h1>
          <div className="empty">Đăng nhập để xem điểm và tiến độ của bạn. <Link to="/login">Đăng nhập</Link></div>
        </div>
      </div>
    )
  }
  if (isTeacher) {
    return (
      <div className="grid">
        <div className="card">
          <h1>Kết quả</h1>
          <div className="small muted">Giáo viên xem tổng quan ở Thống kê, chấm bài ở Chấm bài.</div>
          <div className="row" style={{ marginTop: 10 }}>
            <Link className="btn primary" to="/progress"><IconChart className="icn sm" />Thống kê</Link>
            <Link className="btn" to="/grading"><IconTask className="icn sm" />Chấm bài</Link>
          </div>
        </div>
      </div>
    )
  }

  const pct = Math.round((progress?.overall_ratio ?? progress?.ratio ?? 0) * 100)
  return (
    <div className="grid">
      <div className="card">
        <h1>Tiến độ của {s.student?.name}</h1>
        <div className="kpi-strip" style={{ marginTop: 8 }}>
          <div className="kpi-cell"><div className="muted small">Bài đã giao</div><div className="kpi">{progress?.assigned ?? 0}</div></div>
          <div className="kpi-cell"><div className="muted small">Đã hoàn thành</div><div className="kpi">{progress?.completed ?? 0}</div></div>
          <div className="kpi-cell"><div className="muted small">Tỷ lệ hoàn thành</div><div className="kpi">{Math.round((progress?.ratio || 0) * 100)}%</div></div>
          <div className="kpi-cell"><div className="muted small">Điểm trung bình</div><div className="kpi">{progress?.avg_score ?? '—'}</div></div>
        </div>
        <div className="progress" style={{ marginTop: 12 }}><div style={{ width: `${pct}%` }} /></div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Tiến độ tổng {pct}%
          {progress?.topics_total ? ` · ${progress.topics_done}/${progress.topics_total} chuyên đề hoàn thành` : ''}
          {progress?.lessons_total ? ` · ${progress.lessons_done}/${progress.lessons_total} bài học` : ''}
        </div>
      </div>

      {progress?.lessons_total > 0 && (
        <div className="card">
          <h3>Bài học</h3>
          <div className="row spread" style={{ fontSize: 14 }}>
            <span>Đã hoàn thành</span><b>{progress.lessons_done} / {progress.lessons_total}</b>
          </div>
          <div className="progress" style={{ marginTop: 6 }}>
            <div style={{ width: `${Math.round((progress.lessons_ratio || 0) * 100)}%` }} />
          </div>
        </div>
      )}

      {progress?.by_topic?.length > 0 && (
        <div className="card">
          <h3 className="icon-h"><IconChart className="icn" />Điểm theo chuyên đề</h3>
          {progress.by_topic.map((t) => (
            <div key={t.topic} className="board-row">
              <span>{t.topic}</span>
              <div className="board-score"><b>{t.avg} / 10</b><div className="small muted">{t.n} bài</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3 className="icon-h"><IconTask className="icn" />Lịch sử bài tập</h3>
        {results.length === 0 && <div className="empty">Chưa có bài nào được chấm điểm.</div>}
        {results.map((r) => (
          <div key={r.id} className="board-row">
            <div>
              <b>{r.title}</b>
              <div className="small muted">{r.topic_name || 'Chuyên đề chung'}{r.graded_at ? ` · chấm ${new Date(r.graded_at).toLocaleDateString('vi-VN')}` : ''}</div>
              {r.feedback && <div className="small muted">“{r.feedback}”</div>}
            </div>
            <div className="board-score">
              {r.score != null
                ? <span className="badge green"><IconTrophy className="icn sm" />{r.score} / 10</span>
                : <span className="badge amber">Chờ chấm</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
