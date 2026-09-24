import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useSchoolScope } from '../app/school-context.jsx'
import { useUI } from '../components/ui.jsx'
import {
  IconBook, IconChart, IconFile, IconLayers, IconPen, IconShield, IconSprout,
  IconTask, IconTimer, IconUsers, IconWand,
} from '../components/icons.jsx'

const modulePresentation = {
  topic_library: { icon: IconBook, path: '/topics', staffPath: '/manage/studio' },
  lesson_library: { icon: IconBook, path: '/topics', staffPath: '/manage/studio' },
  assignment_management: { icon: IconTask, path: '/assignments' },
  exam_management: { icon: IconTimer, path: '/exam' },
  progress_tracking: { icon: IconChart, path: '/progress' },
  material_library: { icon: IconFile, path: '/topics', staffPath: '/manage/studio' },
  question_bank: { icon: IconShield, path: '/topics', staffPath: '/manage/bank' },
  team_management: { icon: IconUsers, path: '/manage/team' },
  school_management: { icon: IconSprout, path: '/manage/school' },
  studio_tools: { icon: IconWand, path: '/manage/studio' },
  grading_tools: { icon: IconPen, path: '/grading' },
}

export default function Workspace() {
  const { status, error, school, team, role, refresh, selectBySlug } = useSchoolScope()
  const { schoolSlug, teamSlug } = useParams()
  const { toast, errMsg } = useUI()
  const [data, setData] = useState({ team: null, modules: [], classes: [] })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [savingModule, setSavingModule] = useState('')
  const canManage = role === 'admin' || role === 'super_admin'

  const load = useCallback(async () => {
    if (status !== 'ready' || !school || !team) return
    setLoading(true)
    setLoadError('')
    try {
      const [teamData, moduleData, classData] = await Promise.all([
        api.team(school.id, team.subject_id, team.id),
        api.teamModules(school.id, team.subject_id, team.id),
        canManage ? api.schoolClasses(school.id) : Promise.resolve({ classes: [] }),
      ])
      setData({
        team: teamData,
        modules: Array.isArray(moduleData?.modules) ? moduleData.modules : [],
        classes: Array.isArray(classData?.classes) ? classData.classes : [],
      })
    } catch (requestError) {
      setLoadError(requestError?.message || 'Không tải được đội tuyển.')
    } finally {
      setLoading(false)
    }
  }, [canManage, school, status, team])

  useEffect(() => {
    if (schoolSlug && selectBySlug) selectBySlug(schoolSlug, teamSlug)
  }, [schoolSlug, teamSlug, selectBySlug])

  useEffect(() => {
    load()
  }, [load])

  const visibleModules = useMemo(() => data.modules.filter((module) => module.available !== false), [data.modules])

  const toggleClass = async (classroom) => {
    if (!canManage || savingModule) return
    setSavingModule(`class-${classroom.id}`)
    const linked = classroom.linked_team_ids?.includes(Number(team.id))
    try {
      if (linked) await api.unlinkClassFromTeam(school.id, team.subject_id, team.id, classroom.id)
      else await api.linkClassToTeam(school.id, team.subject_id, team.id, classroom.id)
      setData((current) => ({
        ...current,
        classes: current.classes.map((item) => item.id === classroom.id
          ? { ...item, linked_team_ids: linked ? item.linked_team_ids.filter((id) => id !== team.id) : [...(item.linked_team_ids || []), Number(team.id)] }
          : item),
      }))
      toast(linked ? `Đã bỏ ${classroom.name} khỏi đội.` : `Đã đồng bộ ${classroom.name} vào đội.`)
    } catch (requestError) {
      toast(errMsg(requestError), 'err')
    } finally {
      setSavingModule('')
    }
  }

  const toggleModule = async (module) => {
    if (!canManage || savingModule) return
    setSavingModule(module.code)
    try {
      const updated = await api.updateTeamModule(school.id, team.subject_id, team.id, module.code, { enabled: !module.enabled })
      setData((current) => ({
        ...current,
        modules: current.modules.map((item) => item.code === updated.code ? updated : item),
      }))
      toast(updated.enabled ? `Đã bật ${updated.name}.` : `Đã tắt ${updated.name}.`)
    } catch (requestError) {
      toast(errMsg(requestError), 'err')
    } finally {
      setSavingModule('')
    }
  }

  if (status === 'anonymous') return <div className="card"><h1>Đội tuyển</h1><div className="empty">Đăng nhập để chọn trường và đội.</div></div>
  if (status === 'legacy') return <div className="card"><h1>Đội tuyển</h1><div className="empty">Phạm vi School–Team mới được bật sau khi chạy migration PHP/MySQL.</div></div>
  if (status === 'error') return <div className="card"><h1>Đội tuyển</h1><div className="empty">{error}</div><button className="btn" onClick={refresh}>Thử lại</button></div>
  if (!school) return <div className="card"><h1>Đội tuyển</h1><div className="empty">Tài khoản chưa được gán vào trường.</div></div>
  if (!team) return <div className="card"><h1>{school.name}</h1><div className="empty">Trường chưa có đội tuyển được phân công.</div></div>

  const teamData = data.team?.team
  return (
    <div className="workspace-page">
      <section className="workspace-head">
        <div>
          <div className="small muted">{school.name} · {team.subject_name}</div>
          <h1>{team.name}</h1>
          <p>{team.description || 'Không gian học tập riêng của đội tuyển.'}</p>
        </div>
        <div className="workspace-counts" aria-label="Thành viên đội tuyển">
          <div><b>{teamData?.student_count ?? '—'}</b><span>Học sinh</span></div>
          <div><b>{teamData?.coach_count ?? '—'}</b><span>Giáo viên</span></div>
        </div>
      </section>

      {loading && <div className="card"><div className="skeleton-line" /></div>}
      {loadError && <div className="card"><div className="empty">{loadError}</div><button className="btn" onClick={load}>Thử lại</button></div>}

      {!loading && !loadError && (
        <section className="workspace-modules" aria-labelledby="workspace-modules-title">
          <div className="workspace-section-head">
            <div>
              <h2 id="workspace-modules-title">Bảng chức năng</h2>
              <div className="small muted">{canManage ? 'Bật hoặc tắt module cho đội này.' : 'Các chức năng đội tuyển đang mở.'}</div>
            </div>
            <span className="badge">{visibleModules.filter((module) => module.enabled).length} đang bật</span>
          </div>
          <div className="module-board">
            {visibleModules.map((module, index) => {
              const presentation = modulePresentation[module.code] || { icon: IconLayers }
              const Icon = presentation.icon
              const target = canManage && presentation.staffPath ? presentation.staffPath : presentation.path
              return (
                <article key={module.code} className={`module-tile${module.enabled ? '' : ' disabled'}`}>
                  <span className="module-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="module-icon"><Icon className="icn lg" /></div>
                  <div className="module-copy">
                    <b>{module.name}</b>
                    <span>{module.description || 'Chức năng của đội tuyển.'}</span>
                  </div>
                  {canManage ? (
                    <label className="module-switch">
                      <input
                        type="checkbox"
                        checked={!!module.enabled}
                        disabled={savingModule === module.code}
                        onChange={() => toggleModule(module)}
                      />
                      <span>{module.enabled ? 'Đang bật' : 'Đang tắt'}</span>
                    </label>
                  ) : module.enabled ? (
                    <Link className="btn sm" to={target || '#'}>Mở</Link>
                  ) : (
                    <span className="badge">Tạm ẩn</span>
                  )}
                </article>
              )
            })}
          </div>
          {visibleModules.length === 0 && <div className="empty">Đội tuyển chưa có module khả dụng.</div>}
        </section>
      )}

      {canManage && !loading && !loadError && (
        <section className="workspace-modules" aria-labelledby="workspace-classes-title">
          <div className="workspace-section-head">
            <div>
              <h2 id="workspace-classes-title">Lớp đồng bộ</h2>
              <div className="small muted">Lớp liên kết tự đồng bộ học sinh; override thủ công vẫn được giữ.</div>
            </div>
            <span className="badge">{data.classes.filter((item) => item.linked_team_ids?.includes(Number(team.id))).length} lớp</span>
          </div>
          <div className="class-sync-list">
            {data.classes.map((classroom) => {
              const linked = classroom.linked_team_ids?.includes(Number(team.id))
              return (
                <label key={classroom.id} className="class-sync-row">
                  <span><b>{classroom.name}</b><small>{classroom.team_count || 0} đội đang dùng</small></span>
                  <input
                    type="checkbox"
                    checked={!!linked}
                    disabled={savingModule === `class-${classroom.id}`}
                    onChange={() => toggleClass(classroom)}
                  />
                </label>
              )
            })}
          </div>
          {data.classes.length === 0 && <div className="empty">Trường chưa có lớp để liên kết.</div>}
        </section>
      )}
    </div>
  )
}
