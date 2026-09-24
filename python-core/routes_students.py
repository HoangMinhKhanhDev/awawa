from datetime import datetime

from fastapi import APIRouter, Request
from typing import Optional

from auth import (hash_pw, has_perm, is_admin, is_staff, is_super_admin,
                  optional_session, require_admin, require_perm,
                  require_super_admin, require_teacher, role_of,
                  teacher_coached_team_ids)
from deps import get_db
from models import ActiveIn, BulkStudentsIn, PermUpdateIn, ResetIn, RoleIn, StudentIn

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
    if role not in ("teacher", "admin", "super_admin"):
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


# ---------------- BULK USER (1.15) ----------------
@router.post("/api/students/bulk")
def bulk_students(payload: BulkStudentsIn, request: Request):
    """Khóa/mở/xóa/đổi role hàng loạt. admin = bulk; super_admin thêm set_role."""
    from fastapi import HTTPException
    me = optional_session(request)
    if not me or not has_perm(me, "students.bulk"):
        raise HTTPException(403, "Ban khong co quyen bulk user.")
    ids = [int(i) for i in (payload.ids or []) if str(i).isdigit() or isinstance(i, int)]
    ids = [int(i) for i in ids]
    if not ids:
        raise HTTPException(400, "Chua chon tai khoan.")
    if len(ids) > 200:
        raise HTTPException(400, "Toi da 200 tai khoan / lan.")
    action = (payload.action or "").strip()
    db = get_db()
    now = datetime.now().isoformat(timespec="seconds")
    affected = 0
    skipped = []

    if action == "activate":
        for sid in ids:
            if sid == me.get("id"):
                skipped.append(sid); continue
            if not db.q1("SELECT 1 FROM students WHERE id=?", (sid,)):
                skipped.append(sid); continue
            db.exec("UPDATE students SET active=1 WHERE id=?", (sid,))
            affected += 1
    elif action == "deactivate":
        for sid in ids:
            if sid == me.get("id"):
                skipped.append(sid); continue
            if not db.q1("SELECT 1 FROM students WHERE id=?", (sid,)):
                skipped.append(sid); continue
            db.exec("UPDATE students SET active=0 WHERE id=?", (sid,))
            db.exec("DELETE FROM sessions WHERE student_id=?", (sid,))
            affected += 1
    elif action == "delete":
        if not has_perm(me, "students.delete"):
            raise HTTPException(403, "Ban khong co quyen xoa.")
        for sid in ids:
            if sid == me.get("id"):
                skipped.append(sid); continue
            if not db.q1("SELECT 1 FROM students WHERE id=?", (sid,)):
                skipped.append(sid); continue
            db.exec("DELETE FROM team_members WHERE user_id=?", (sid,))
            db.exec("DELETE FROM sessions WHERE student_id=?", (sid,))
            db.exec("DELETE FROM lesson_completions WHERE student_id=?", (sid,))
            db.exec("DELETE FROM notifications WHERE user_id=?", (sid,))
            db.exec("DELETE FROM class_members WHERE user_id=?", (sid,))
            db.exec("DELETE FROM students WHERE id=?", (sid,))
            affected += 1
    elif action == "set_role":
        if not has_perm(me, "students.role"):
            raise HTTPException(403, "Chi super admin duoc doi role.")
        new_role = (payload.role or "").strip()
        if new_role not in ("student", "teacher", "admin"):
            raise HTTPException(400, "Role chi hop le: student/teacher/admin.")
        for sid in ids:
            if sid == me.get("id"):
                skipped.append(sid); continue
            if not db.q1("SELECT 1 FROM students WHERE id=?", (sid,)):
                skipped.append(sid); continue
            db.exec("UPDATE students SET role=? WHERE id=?", (new_role, sid))
            db.exec("DELETE FROM sessions WHERE student_id=?", (sid,))
            affected += 1
    else:
        raise HTTPException(400, f"Action khong ho tro: {action}")

    return {"ok": True, "action": action, "affected": affected, "skipped": skipped, "at": now}


# ---------------- PERMISSION MATRIX (1.7) ----------------
@router.get("/api/permissions")
def list_permissions(request: Request):
    """GV/AD đọc perm của chính mình; super_admin đọc full matrix."""
    me = optional_session(request)
    if not me:
        from fastapi import HTTPException
        raise HTTPException(401, "Chua dang nhap.")
    db = get_db()
    r = role_of(me)
    rows = db.q("SELECT role, perm_key, allowed FROM role_permissions ORDER BY role, perm_key")
    matrix = {}
    for row in rows:
        matrix.setdefault(row["role"], {})[row["perm_key"]] = bool(row["allowed"])
    my_perms = matrix.get(r, {})
    return {
        "my_role": r,
        "my_perms": my_perms,
        "can_manage": is_super_admin(me),
        "matrix": matrix if is_super_admin(me) else {},
        "roles": ["student", "teacher", "admin", "super_admin"],
        "perm_keys": sorted({row["perm_key"] for row in rows}),
    }


@router.put("/api/permissions")
def update_permissions(payload: PermUpdateIn, request: Request):
    from fastapi import HTTPException
    require_super_admin(request)
    role = (payload.role or "").strip()
    if role not in ("student", "teacher", "admin"):
        raise HTTPException(400, "Khong duoc sua super_admin.")
    perms = payload.perms or {}
    if not isinstance(perms, dict):
        raise HTTPException(400, "perms phai la object.")
    db = get_db()
    changed = 0
    for key, val in perms.items():
        key = str(key)[:64]
        allowed = 1 if val else 0
        db.exec(
            """INSERT INTO role_permissions (role, perm_key, allowed) VALUES (?,?,?)
               ON CONFLICT(role, perm_key) DO UPDATE SET allowed=excluded.allowed""",
            (role, key, allowed))
        changed += 1
    return {"ok": True, "role": role, "changed": changed}
