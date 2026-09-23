from fastapi import APIRouter, Request
from typing import Optional

from auth import hash_pw, require_teacher
from deps import get_db
from models import ResetIn, StudentIn

router = APIRouter()


@router.get("/api/students")
def list_students(team: Optional[str] = None, search: Optional[str] = None):
    sql = "SELECT * FROM students WHERE 1=1"
    params = []
    if team:
        sql += " AND team=?"; params.append(team)
    if search:
        sql += " AND name LIKE ?"; params.append(f"%{search}%")
    sql += " ORDER BY team, name LIMIT 500"
    return [public_student(r) for r in get_db().q(sql, tuple(params))]


@router.post("/api/students")
def create_student(payload: StudentIn, request: Request):
    require_teacher(request)
    if not payload.name.strip():
        raise HTTPException(400, "Thiáº¿u tÃªn há»c sinh")
    now = datetime.now().isoformat(timespec="seconds")
    cur = get_db().exec("INSERT INTO students (name, class_name, team, note, created_at) VALUES (?,?,?,?,?)",
                  (payload.name.strip()[:100], (payload.class_name or "").strip()[:50],
                   (payload.team or "").strip()[:50], (payload.note or "").strip()[:500], now))
    return {"id": cur.lastrowid}


@router.put("/api/students/{sid}")
def update_student(sid: int, payload: StudentIn, request: Request):
    require_teacher(request)
    r = get_db().q1("SELECT * FROM students WHERE id=?", (sid,))
    if not r: raise HTTPException(404, "KhÃ´ng tÃ¬m tháº¥y há»c sinh")
    get_db().exec("UPDATE students SET name=?, class_name=?, team=?, note=? WHERE id=?",
            (payload.name.strip()[:100], (payload.class_name or "").strip()[:50],
             (payload.team or "").strip()[:50], (payload.note or "").strip()[:500], sid))
    return {"ok": True}


@router.delete("/api/students/{sid}")
def delete_student(sid: int, request: Request):
    require_teacher(request)
    get_db().exec("DELETE FROM students WHERE id=?", (sid,))
    return {"ok": True}


@router.put("/api/students/{sid}/reset-password")
def reset_password(sid: int, payload: ResetIn, request: Request):
    require_teacher(request)
    if not get_db().q1("SELECT 1 FROM students WHERE id=?", (sid,)):
        raise HTTPException(404, "Khong tim thay hoc sinh")
    if len(payload.password or "") < 6:
        raise HTTPException(400, "Mat khau moi it nhat 6 ky tu.")
    get_db().exec("UPDATE students SET password_hash=? WHERE id=?", (hash_pw(payload.password), sid))
    get_db().exec("DELETE FROM sessions WHERE student_id=?", (sid,))
    return {"ok": True}
