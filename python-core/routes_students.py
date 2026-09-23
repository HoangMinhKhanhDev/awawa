from datetime import datetime

from fastapi import APIRouter, Request
from typing import Optional

from auth import (hash_pw, is_admin, is_staff, optional_session,
                  require_teacher, teacher_coached_team_ids)
from deps import get_db
from models import ActiveIn, ResetIn, StudentIn

router = APIRouter()


def public_row(r):
    d = dict(r)
    d.pop("password_hash", None)
    return d


@router.get("/api/students")
def list_students(team: Optional[str] = None, search: Optional[str] = None,
                  active: Optional[int] = None, request: Request = None):
    me = optional_session(request) if request is not None else None
    db = get_db()
    join = ""
    where = ["1=1"]
    params = []
    # Chưa đăng nhập: không lộ danh sách
    if not me:
        return []
    role = (me.get("role") or "student")

    # Học sinh thường: chỉ xem chính mình. Staff mới xem danh sách.
    if role not in ("teacher", "admin"):
        where.append("s.id=?")
        params.append(me["id"])
    # Teacher chỉ thấy HS trong đội mình phụ trách; admin thấy tất
    elif role == "teacher":
        tids = teacher_coached_team_ids(me["id"])
        if not tids:
            return []
        marks = ",".join("?" * len(tids))
        join = (" JOIN team_members tm ON tm.user_id=s.id AND tm.member_role='student'"
                " AND (tm.left_at IS NULL OR tm.left_at='')")
        where.append(f"tm.team_id IN ({marks})")
        params.extend(tids)
    elif not me:
        # anonymous list (legacy) — giữ truy cập cũ cho trang công khai
        pass

    if team:
        where.append("s.team=?")
        params.append(team)
    if search:
        where.append("s.name LIKE ?")
        params.append(f"%{search}%")
    if active is not None and active != "":
        where.append("s.active=?")
        params.append(int(active))

    sql = f"SELECT DISTINCT s.* FROM students s{join} WHERE {' AND '.join(where)} ORDER BY s.team, s.name LIMIT 500"
    rows = db.q(sql, tuple(params))
    out = []
    for r in rows:
        d = public_row(r)
        if "active" not in d or d.get("active") is None:
            d["active"] = 1
        out.append(d)
    return out


@router.post("/api/students")
def create_student(payload: StudentIn, request: Request):
    me = require_teacher(request)
    if not payload.name.strip():
        from fastapi import HTTPException
        raise HTTPException(400, "Thieu ten hoc sinh")
    now = datetime.now().isoformat(timespec="seconds")
    team_name = (payload.team or "").strip()[:50]
    # Teacher mặc định vào đội mình phụ trách nếu chưa chọn
    tid = payload.team_id
    if not is_admin(me) and not tid:
        my = teacher_coached_team_ids(me["id"])
        tid = my[0] if my else None
    if tid:
        t = get_db().q1("SELECT name FROM teams WHERE id=?", (tid,))
        if t:
            team_name = t["name"]
    cur = get_db().exec(
        "INSERT INTO students (name, class_name, team, note, role, active, created_at) VALUES (?,?,?,?,?,?,?)",
        (payload.name.strip()[:100], (payload.class_name or "").strip()[:50],
         team_name, (payload.note or "").strip()[:500], "student", 1, now))
    sid = cur.lastrowid
    if tid:
        get_db().exec(
            """INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at, left_at)
               VALUES (?,?, 'student', ?, NULL)""",
            (tid, sid, now))
    return {"id": sid}


@router.put("/api/students/{sid}")
def update_student(sid: int, payload: StudentIn, request: Request):
    require_teacher(request)
    from fastapi import HTTPException
    r = get_db().q1("SELECT * FROM students WHERE id=?", (sid,))
    if not r:
        raise HTTPException(404, "Khong tim thay hoc sinh")
    get_db().exec(
        "UPDATE students SET name=?, class_name=?, team=?, note=? WHERE id=?",
        (payload.name.strip()[:100], (payload.class_name or "").strip()[:50],
         (payload.team or "").strip()[:50], (payload.note or "").strip()[:500], sid))
    if payload.team_id:
        now = datetime.now().isoformat(timespec="seconds")
        t = get_db().q1("SELECT name FROM teams WHERE id=?", (payload.team_id,))
        if t:
            get_db().exec("UPDATE students SET team=? WHERE id=?", (t["name"], sid))
            get_db().exec(
                """INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at, left_at)
                   VALUES (?,?, 'student', ?, NULL)""",
                (payload.team_id, sid, now))
    if payload.active is not None:
        # admin hoặc tự khóa mình thì chặn — chỉ admin đổi active người khác
        me = optional_session(request)
        if is_admin(me) or sid == (me or {}).get("id"):
            if not (me and me.get("id") == sid and int(payload.active) == 0):
                get_db().exec("UPDATE students SET active=? WHERE id=?", (1 if payload.active else 0, sid))
    return {"ok": True}


@router.put("/api/students/{sid}/active")
def set_active(sid: int, payload: ActiveIn, request: Request):
    require_admin_check = is_admin(optional_session(request))
    from fastapi import HTTPException
    if not require_admin_check:
        raise HTTPException(403, "Chi admin duoc khoa/mo tai khoan.")
    me = optional_session(request)
    if me and me.get("id") == sid and not payload.active:
        raise HTTPException(400, "Khong the khoa tai khoan cua minh.")
    if not get_db().q1("SELECT 1 FROM students WHERE id=?", (sid,)):
        raise HTTPException(404, "Khong tim thay.")
    val = 1 if payload.active else 0
    get_db().exec("UPDATE students SET active=? WHERE id=?", (val, sid))
    if not val:
        get_db().exec("DELETE FROM sessions WHERE student_id=?", (sid,))
    return {"ok": True, "active": val}


@router.delete("/api/students/{sid}")
def delete_student(sid: int, request: Request):
    require_teacher(request)
    get_db().exec("DELETE FROM team_members WHERE user_id=?", (sid,))
    get_db().exec("DELETE FROM students WHERE id=?", (sid,))
    return {"ok": True}


@router.put("/api/students/{sid}/reset-password")
def reset_password(sid: int, payload: ResetIn, request: Request):
    require_teacher(request)
    from fastapi import HTTPException
    if not get_db().q1("SELECT 1 FROM students WHERE id=?", (sid,)):
        raise HTTPException(404, "Khong tim thay hoc sinh")
    if len(payload.password or "") < 6:
        raise HTTPException(400, "Mat khau moi it nhat 6 ky tu.")
    get_db().exec("UPDATE students SET password_hash=? WHERE id=?", (hash_pw(payload.password), sid))
    get_db().exec("DELETE FROM sessions WHERE student_id=?", (sid,))
    return {"ok": True}
