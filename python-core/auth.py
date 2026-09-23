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
    if not me or (me.get("role") or "student") != "teacher":
        raise HTTPException(403, "Khu vuc giao vien.")
    return me
