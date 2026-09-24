"""Cấu trúc nhà trường: năm học → khối → đội tuyển → thành viên (Phase 1a)."""
from datetime import datetime

from fastapi import APIRouter, Request

from auth import is_admin, require_admin, require_teacher, optional_session
from deps import get_db
from models import (ActiveIn, GradeYearIn, SchoolYearIn, TeamIn, TeamMemberIn)

router = APIRouter()


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _current_year_id():
    db = get_db()
    r = db.q1("SELECT id FROM school_years WHERE is_current=1 ORDER BY id LIMIT 1")
    if r:
        return r["id"]
    r = db.q1("SELECT id FROM school_years ORDER BY id LIMIT 1")
    return r["id"] if r else None


# ---------------- YEARS ----------------
@router.get("/api/school-years")
def list_years():
    return [dict(r) for r in get_db().q("SELECT * FROM school_years ORDER BY is_current DESC, name DESC")]


@router.post("/api/school-years")
def create_year(payload: SchoolYearIn, request: Request):
    require_admin(request)
    name = (payload.name or "").strip()[:50]
    if not name:
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu ten nam hoc.")
    cur = get_db().exec(
        "INSERT INTO school_years (name, start_date, end_date, is_current, created_at) VALUES (?,?,?,?,?)",
        (name, payload.start_date or "", payload.end_date or "",
         1 if payload.is_current else 0, _now()))
    if payload.is_current:
        get_db().exec("UPDATE school_years SET is_current=0 WHERE id<>?", (cur.lastrowid,))
    return {"id": cur.lastrowid}


@router.put("/api/school-years/{sid}")
def update_year(sid: int, payload: SchoolYearIn, request: Request):
    require_admin(request)
    from fastapi import HTTPException
    if not get_db().q1("SELECT 1 FROM school_years WHERE id=?", (sid,)):
        raise HTTPException(404, "Khong tim thay nam hoc.")
    name = (payload.name or "").strip()[:50]
    if not name:
        raise HTTPException(400, "Thieu ten nam hoc.")
    if payload.is_current:
        get_db().exec("UPDATE school_years SET is_current=0")
    get_db().exec(
        "UPDATE school_years SET name=?, start_date=?, end_date=?, is_current=? WHERE id=?",
        (name, payload.start_date or "", payload.end_date or "",
         1 if payload.is_current else 0, sid))
    return {"ok": True}


@router.delete("/api/school-years/{sid}")
def delete_year(sid: int, request: Request):
    require_admin(request)
    get_db().exec("DELETE FROM school_years WHERE id=?", (sid,))
    return {"ok": True}


# ---------------- GRADES ----------------
@router.get("/api/grades")
def list_grades(school_year_id: int = None):
    sql = """SELECT g.*, y.name year_name FROM grades g
             LEFT JOIN school_years y ON y.id=g.school_year_id"""
    params = ()
    if school_year_id:
        sql += " WHERE g.school_year_id=?"
        params = (school_year_id,)
    sql += " ORDER BY g.code, g.name"
    return [dict(r) for r in get_db().q(sql, params)]


@router.post("/api/grades")
def create_grade(payload: GradeYearIn, request: Request):
    require_admin(request)
    from fastapi import HTTPException
    name = (payload.name or "").strip()[:80]
    if not name:
        raise HTTPException(400, "Thieu ten khoi lop.")
    yid = payload.school_year_id or _current_year_id()
    cur = get_db().exec(
        "INSERT INTO grades (school_year_id, name, code, created_at) VALUES (?,?,?,?)",
        (yid, name, (payload.code or "").strip()[:20], _now()))
    return {"id": cur.lastrowid}


@router.put("/api/grades/{gid}")
def update_grade(gid: int, payload: GradeYearIn, request: Request):
    require_admin(request)
    get_db().exec("UPDATE grades SET name=?, code=? WHERE id=?",
                  ((payload.name or "").strip()[:80], (payload.code or "").strip()[:20], gid))
    return {"ok": True}


@router.delete("/api/grades/{gid}")
def delete_grade(gid: int, request: Request):
    require_admin(request)
    get_db().exec("DELETE FROM grades WHERE id=?", (gid,))
    return {"ok": True}


# ---------------- TEAMS ----------------
@router.get("/api/teams")
def list_teams(request: Request, school_year_id: int = None, mine: int = 0):
    db = get_db()
    me = optional_session(request)
    sql = """SELECT t.*, y.name year_name, g.name grade_name, s.name subject_name,
                    (SELECT COUNT(*) FROM team_members tm
                     WHERE tm.team_id=t.id AND tm.member_role='student'
                       AND (tm.left_at IS NULL OR tm.left_at='')) student_count,
                    (SELECT COUNT(*) FROM team_members tm
                     WHERE tm.team_id=t.id AND tm.member_role='coach'
                       AND (tm.left_at IS NULL OR tm.left_at='')) coach_count
             FROM teams t
             LEFT JOIN school_years y ON y.id=t.school_year_id
             LEFT JOIN grades g ON g.id=t.grade_id
             LEFT JOIN subjects s ON s.id=t.subject_id"""
    params = ()
    if school_year_id:
        sql += " WHERE t.school_year_id=?"
        params = (school_year_id,)
    sql += " ORDER BY t.name"
    rows = [dict(r) for r in db.q(sql, params)]
    if mine and me and not is_admin(me):
        from auth import teacher_coached_team_ids
        ids = set(teacher_coached_team_ids(me["id"]))
        rows = [r for r in rows if r["id"] in ids]
    return rows


@router.post("/api/teams")
def create_team(payload: TeamIn, request: Request):
    require_admin(request)
    from fastapi import HTTPException
    name = (payload.name or "").strip()[:120]
    if not name:
        raise HTTPException(400, "Thieu ten doi tuyen.")
    yid = payload.school_year_id or _current_year_id()
    cur = get_db().exec(
        "INSERT INTO teams (school_year_id, grade_id, subject_id, name, description, created_at) VALUES (?,?,?,?,?,?)",
        (yid, payload.grade_id, (payload.subject_id or "").strip() or None,
         name, (payload.description or "").strip()[:500], _now()))
    return {"id": cur.lastrowid}


@router.put("/api/teams/{tid}")
def update_team(tid: int, payload: TeamIn, request: Request):
    require_admin(request)
    from fastapi import HTTPException
    if not get_db().q1("SELECT 1 FROM teams WHERE id=?", (tid,)):
        raise HTTPException(404, "Khong tim thay doi tuyen.")
    get_db().exec(
        "UPDATE teams SET name=?, subject_id=?, grade_id=?, description=? WHERE id=?",
        ((payload.name or "").strip()[:120], (payload.subject_id or "").strip() or None,
         payload.grade_id, (payload.description or "").strip()[:500], tid))
    return {"ok": True}


@router.delete("/api/teams/{tid}")
def delete_team(tid: int, request: Request):
    require_admin(request)
    get_db().exec("DELETE FROM team_members WHERE team_id=?", (tid,))
    get_db().exec("DELETE FROM teams WHERE id=?", (tid,))
    return {"ok": True}


# ---------------- TEAM MEMBERS ----------------
@router.get("/api/teams/{tid}/members")
def team_members(tid: int, request: Request):
    require_teacher(request)
    rows = get_db().q(
        """SELECT tm.id mid, tm.user_id, tm.member_role, tm.joined_at, tm.left_at,
                  s.name, s.class_name, s.phone, s.email, s.role, s.active
           FROM team_members tm JOIN students s ON s.id=tm.user_id
           WHERE tm.team_id=? ORDER BY tm.member_role DESC, s.name""",
        (tid,))
    return [dict(r) for r in rows]


@router.post("/api/teams/{tid}/members")
def add_member(tid: int, payload: TeamMemberIn, request: Request):
    me = require_teacher(request)
    from fastapi import HTTPException
    if not get_db().q1("SELECT 1 FROM teams WHERE id=?", (tid,)):
        raise HTTPException(404, "Khong tim thay doi tuyen.")
    uid = int(payload.user_id or 0)
    role = (payload.member_role or "student").strip()
    if role not in ("student", "coach"):
        role = "student"
    if not get_db().q1("SELECT 1 FROM students WHERE id=?", (uid,)):
        raise HTTPException(404, "Khong tim thay nguoi dung.")
    if not is_admin(me):
        from auth import teacher_coached_team_ids
        if tid not in teacher_coached_team_ids(me["id"]):
            raise HTTPException(403, "Ban khong phu trach doi nay.")
        if role == "coach":
            raise HTTPException(403, "Chi admin duoc phan cong coach.")
    get_db().exec(
        "UPDATE team_members SET left_at=NULL WHERE team_id=? AND user_id=? AND member_role=?",
        (tid, uid, role))
    get_db().exec(
        """INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at, left_at)
           VALUES (?,?,?,?,NULL)""",
        (tid, uid, role, _now()))
    if role == "student":
        t = get_db().q1("SELECT name FROM teams WHERE id=?", (tid,))
        if t:
            get_db().exec("UPDATE students SET team=? WHERE id=?", (t["name"], uid))
    return {"ok": True}


@router.delete("/api/teams/{tid}/members/{uid}")
def remove_member(tid: int, uid: int, request: Request):
    me = require_teacher(request)
    if not is_admin(me):
        from auth import teacher_coached_team_ids
        if tid not in teacher_coached_team_ids(me["id"]):
            from fastapi import HTTPException
            raise HTTPException(403, "Ban khong phu trach doi nay.")
    get_db().exec(
        "UPDATE team_members SET left_at=? WHERE team_id=? AND user_id=? AND left_at IS NULL",
        (_now(), tid, uid))
    return {"ok": True}


@router.get("/api/me/teams")
def my_teams(request: Request):
    me = optional_session(request)
    if not me:
        return []
    from auth import teacher_coached_team_ids
    if is_admin(me):
        return [dict(r) for r in get_db().q(
            """SELECT t.*, (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id
                 AND tm.member_role='student' AND (tm.left_at IS NULL OR tm.left_at='')) student_count
               FROM teams t ORDER BY t.name""")]
    ids = teacher_coached_team_ids(me["id"])
    if not ids:
        return []
    marks = ",".join("?" * len(ids))
    return [dict(r) for r in get_db().q(
        f"""SELECT t.*, (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id=t.id
              AND tm.member_role='student' AND (tm.left_at IS NULL OR tm.left_at='')) student_count
            FROM teams t WHERE t.id IN ({marks}) ORDER BY t.name""", tuple(ids))]
