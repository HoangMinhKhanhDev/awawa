import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, Request

from deps import get_db


def hash_pw(pw: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode(), 100000)
    return f"pbkdf2$100000${salt}${dk.hex()}"
def verify_pw(pw: str, h: str) -> bool:
    try:
        _, it, salt, hexd = (h or "").split("$")
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode(), int(it))
        return secrets.compare_digest(dk.hex(), hexd)
    except Exception:
        return False
def public_student(r) -> dict:
    d = dict(r)
    d.pop("password_hash", None)
    return d
def norm_phone(p) -> str:
    return re.sub(r"[^\d+]", "", (p or "").strip())[:20]
def check_email(e: str) -> str:
    e = (e or "").strip()[:190]
    if e == "":
        return ""
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e):
        raise HTTPException(400, "Email khong hop le.")
    return e
def check_dob(d) -> Optional[str]:
    d = (d or "").strip()
    if d == "":
        return None
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", d):
        raise HTTPException(400, "Ngay sinh phai dang YYYY-MM-DD.")
    try:
        t = datetime.strptime(d, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Ngay sinh khong hop le.")
    if t > datetime.now():
        raise HTTPException(400, "Ngay sinh khong hop le.")
    return d
def check_gender(g: str) -> str:
    g = (g or "").strip()
    if g == "":
        return ""
    if g not in ("Nam", "Nu", "Khac", "Nữ", "Khác"):
        raise HTTPException(400, "Gioi tinh phai la Nam, Nu hoac Khac.")
    return {"Nữ": "Nu", "Khác": "Khac"}.get(g, g)
def new_session(student_id: int) -> str:
    tok = secrets.token_hex(32)
    exp = (datetime.now() + timedelta(days=30)).isoformat(timespec="seconds")
    get_db().exec("INSERT INTO sessions (token_hash, student_id, expires_at, created_at) VALUES (?,?,?,?)",
            (hashlib.sha256(tok.encode()).hexdigest(), student_id, exp,
             datetime.now().isoformat(timespec="seconds")))
    return tok
def current_student(request: Request) -> dict:
    tok = request.headers.get("x-session-token", "")
    if not re.fullmatch(r"[a-f0-9]{64}", tok or ""):
        raise HTTPException(401, "Chua dang nhap.")
    h = hashlib.sha256(tok.encode()).hexdigest()
    s = get_db().q1("SELECT s.expires_at, st.* FROM sessions s JOIN students st ON st.id=s.student_id WHERE s.token_hash=?", (h,))
    if not s:
        raise HTTPException(401, "Phien dang nhap het han.")
    try:
        expired = datetime.fromisoformat(s["expires_at"]) < datetime.now()
    except Exception:
        expired = True
    if expired:
        get_db().exec("DELETE FROM sessions WHERE token_hash=?", (h,))
        raise HTTPException(401, "Phien dang nhap het han.")
    d = public_student(s)
    d.pop("expires_at", None)
    return d
def optional_session(request: Request):
    tok = request.headers.get("x-session-token", "")
    if not re.fullmatch(r"[a-f0-9]{64}", tok or ""):
        return None
    h = hashlib.sha256(tok.encode()).hexdigest()
    s = get_db().q1("SELECT s.expires_at, st.* FROM sessions s JOIN students st ON st.id=s.student_id WHERE s.token_hash=?", (h,))
    if not s:
        return None
    try:
        expired = datetime.fromisoformat(s["expires_at"]) < datetime.now()
    except Exception:
        expired = True
    if expired:
        return None
    d = public_student(s)
    d.pop("expires_at", None)
    return d
def require_teacher(request: Request) -> dict:
    me = optional_session(request)
    if not me or (me.get("role") or "student") not in ("teacher", "admin", "super_admin"):
        raise HTTPException(403, "Khu vuc giao vien.")
    return me


def require_admin(request: Request) -> dict:
    me = optional_session(request)
    if not me or (me.get("role") or "student") not in ("admin", "super_admin"):
        raise HTTPException(403, "Khu vuc quan tri.")
    return me


def require_super_admin(request: Request) -> dict:
    me = optional_session(request)
    if not me or (me.get("role") or "student") != "super_admin":
        raise HTTPException(403, "Chi super admin moi duoc thuc hien.")
    return me


def is_admin(me) -> bool:
    return bool(me and (me.get("role") or "student") in ("admin", "super_admin"))


def is_super_admin(me) -> bool:
    return bool(me and (me.get("role") or "student") == "super_admin")


def is_staff(me) -> bool:
    return bool(me and (me.get("role") or "student") in ("teacher", "admin", "super_admin"))


def role_of(me) -> str:
    if not me:
        return "guest"
    r = me.get("role") or "student"
    if r not in ("student", "teacher", "admin", "super_admin"):
        return "student"
    return r


def has_perm(me, perm_key: str) -> bool:
    """Doc permission matrix theo role — super_admin luon True."""
    if not me:
        return False
    r = role_of(me)
    if r == "super_admin":
        return True
    row = get_db().q1(
        "SELECT allowed FROM role_permissions WHERE role=? AND perm_key=?",
        (r, perm_key))
    if row is None:
        # Chua seed role nay → fallback theo role mac dinh an toan
        return r in ("admin", "teacher") and perm_key.endswith((".view", ".read", ".self", ".manage"))
    return bool(row["allowed"])


def require_perm(request: Request, perm_key: str) -> dict:
    me = optional_session(request)
    if not me:
        raise HTTPException(401, "Chua dang nhap.")
    if not has_perm(me, perm_key):
        raise HTTPException(403, f"Ban khong co quyen: {perm_key}")
    return me


def teacher_coached_team_ids(user_id: int) -> list:
    rows = get_db().q(
        "SELECT team_id FROM team_members WHERE user_id=? AND member_role='coach' AND (left_at IS NULL OR left_at='')",
        (user_id,))
    return [r["team_id"] for r in rows]
