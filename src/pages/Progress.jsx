import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconTrophy, IconCap, IconTimer, IconTable, IconFileUp, IconChart } from '../components/icons.jsx'
import { api, getSession } from '../api.js'
import { exportCsv, printPdf } from '../lib/export.js'
import { isStaffRole } from '../lib/roles.js'

export default function Progress() {
  const [stats, setStats] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [board, setBoard] = useState([])
  const [mode, setMode] = useState('exam')
  const [team, setTeam] = useState('')
  const [teams, setTeams] = useState([])
  const [timeline, setTimeline] = useState(null)
  const me = getSession().student
  const isStaff = isStaffRole(me)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.stats().catch(() => null),
      api.attempts().catch(() => []),
      api.myTeams?.().catch(() => []) || Promise.resolve([]),
      isStaff && api.teamTimeline ? api.teamTimeline({ days: 30 }).catch(() => null) : Promise.resolve(null),
    ]).then(([st, at, tms, tl]) => {
      if (!alive) return
      setStats(st); setAttempts(at || []); setTeams(tms || []); setTimeline(tl)
    })
    return () => { alive = false }
  }, []) // eslint-disable-line

  useEffect(() => {
    let alive = true
    api.leaderboard({ mode, team: team || undefined }).then((r) => alive && setBoard(r.board || [])).catch(() => alive && setBoard([]))
    return () => { alive = false }
  }, [mode, team])

  const myId = me?.id
  const pct = (x) => `${Math.round((x || 0) * 100)}%`

  const boardHeaders = ['#', 'Họ tên', 'Lớp', 'Đội', 'Lượt', 'Cao nhất', 'TB']
  const boardRows = board.map((r) => [r.rank, r.name, r.class_name || '', r.team || '', r.attempts, pct(r.best), pct(r.avg)])

  const doExcel = () => exportCsv(`bang-xep-hang-${mode}-${team || 'tat-ca'}`, boardHeaders, boardRows)
  const doPdf = () => printPdf(`Bảng xếp hạng — ${mode === 'exam' ? 'Thi thử' : 'Luyện tập'}${team ? ` · ${team}` : ''}`, boardHeaders, boardRows,
    `Chỉ tính lượt thi của tài khoản đăng nhập. Xuất bởi Ôn luyện HSG.`)

  const tlRows = (timeline?.attempts || []).map((t) => [t.day, t.n, Math.round((t.avg_acc || 0) * 100) + '%', t.c, t.t])
  const doTlExcel = () => exportCsv('xu-huong-doi-30ngay', ['Ngày', 'Lượt thi', 'ĐTB %', 'Đúng', 'Tổng'], tlRows)
  const doTlPdf = () => printPdf('Xu hướng đội tuyển 30 ngày', ['Ngày', 'Lượt thi', 'ĐTB %', 'Đúng', 'Tổng'], tlRows)

  return (
    <div className="grid">
      <div className="card">
        <h1>Tiến độ học</h1>
        {!me && <div className="small muted">Đăng nhập ở tab Cá nhân để lưu tiến độ và lên bảng xếp hạng. <Link to="/profile">Đăng nhập</Link></div>}
        {stats && (
          <div className="kpi-strip" style={{ marginTop: 12 }}>
            <div className="kpi-cell"><div className="muted small">{me ? 'Lượt làm của bạn' : 'Lượt làm'}</div><div className="kpi">{stats.total_attempts}</div></div>
            <div className="kpi-cell"><div className="muted small">Tỉ lệ đúng</div><div className="kpi">{pct(stats.accuracy)}</div></div>
            <div className="kpi-cell"><div className="muted small">Câu trong ngân hàng</div><div className="kpi">{stats.total_questions}</div></div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row spread">
          <h3 className="icon-h" style={{ margin: 0 }}><IconTrophy className="icn" />Bảng xếp hạng</h3>
          <div className="row">
            <div className="subnav" role="tablist" aria-label="Chế độ xếp hạng">
              <button role="tab" aria-selected={mode === 'exam'} className={mode === 'exam' ? 'on' : ''} onClick={() => setMode('exam')}>Thi thử</button>
              <button role="tab" aria-selected={mode === 'practice'} className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>Luyện tập</button>
            </div>
            <select className="select" style={{ width: 'auto' }} aria-label="Lọc theo đội" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">Tất cả đội</option>
              {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            {isStaff && (
              <>
                <button className="btn sm" onClick={doExcel} title="Xuất Excel"><IconFileUp className="icn sm" />Excel</button>
                <button className="btn sm" onClick={doPdf} title="In / Lưu PDF"><IconTable className="icn sm" />PDF</button>
              </>
            )}
          </div>
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>Chỉ tính lượt thi của tài khoản đăng nhập · xếp theo % cao nhất.</div>
        {board.length === 0 ? (
          <div className="empty" style={{ marginTop: 10 }}>Chưa có ai lên bảng — thi một lượt để giành hạng 1.</div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {board.map((r) => (
              <div key={r.student_id} className={`board-row${r.student_id === myId ? ' me' : ''}`}>
                <span className={`rank${r.rank <= 3 ? ` r${r.rank}` : ''}`}>{r.rank}</span>
                <div>
                  <b>{r.name}</b>
                  <div className="small muted">{r.class_name || ''}{r.team ? ` · ${r.team}` : ''} · {r.attempts} lượt</div>
                </div>
                <div className="board-score">
                  <b>{pct(r.best)}</b>
                  <div className="small muted">TB {pct(r.avg)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isStaff && timeline && (
        <div className="card">
          <div className="row spread">
            <h3 className="icon-h" style={{ margin: 0 }}><IconChart className="icn" />Xu hướng đội tuyển 30 ngày</h3>
            <div className="row">
              <button className="btn sm" onClick={doTlExcel}><IconFileUp className="icn sm" />Excel</button>
              <button className="btn sm" onClick={doTlPdf}><IconTable className="icn sm" />PDF</button>
            </div>
          </div>
          {(timeline.attempts || []).length === 0 ? (
            <div className="empty">Chưa có lượt thi trong 30 ngày qua.</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {(timeline.attempts || []).slice(-14).map((t) => {
                const w = Math.round((t.avg_acc || 0) * 100)
                return (
                  <div key={t.day} className="board-row" style={{ display: 'block', padding: '8px 4px' }}>
                    <div className="row spread small">
                      <span>{t.day}</span>
                      <span className="muted">{t.n} lượt · {w}% TB · {t.c}/{t.t} đúng</span>
                    </div>
                    <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${w}%` }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid c2">
        <div className="card">
          <h3>Chuyên đề cần ôn lại</h3>
          {!stats ? <div className="empty">Đang tải…</div> :
            (stats.weak_topics || []).length === 0 ? <div className="empty">Đang tốt — chưa có chuyên đề nào dưới 80%. Cứ duy trì.</div> :
            (stats.weak_topics || []).map((t) => (
              <div key={t.topic} className="board-row" style={{ display: 'block', padding: '10px 4px' }}>
                <div className="row spread"><span>{t.topic}</span><span className="badge red">{pct(t.accuracy)} đúng</span></div>
                <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${Math.round((t.accuracy || 0) * 100)}%` }} /></div>
              </div>
            ))}
          <hr className="sep" />
          <div className="small muted"><IconCap className="icn sm" /> Chọn 1 chuyên đề yếu → luyện 10–15 câu → xem lời giải → thi thử 45–90 phút.</div>
        </div>
        <div className="card">
          <h3 className="icon-h"><IconTimer className="icn" />Lịch sử làm bài{me ? ' của bạn' : ''}</h3>
          {attempts.length === 0 ? <div className="empty">{me ? 'Chưa có lượt nào — vào tab Học làm một bộ.' : 'Đăng nhập để xem lịch sử của bạn.'}</div> :
            <table className="tbl"><thead><tr><th>Thời gian</th><th>Chế độ</th><th>Kết quả</th></tr></thead>
              <tbody>{attempts.slice(0, 30).map((a) => (
                <tr key={a.id}><td className="small">{a.created_at ? new Date(a.created_at).toLocaleString('vi-VN') : '—'}</td><td>{a.mode === 'exam' ? 'Thi thử' : 'Luyện tập'}</td><td>{a.total ? `${a.correct}/${a.total} (${pct(a.accuracy)})` : '—'}</td></tr>
              ))}</tbody></table>}
        </div>
      </div>
    </div>
  )
}
