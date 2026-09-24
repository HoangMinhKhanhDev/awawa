import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request

from auth import (check_dob, check_email, check_gender, current_student, hash_pw,
                   new_session, norm_phone, optional_session, public_student,
                   verify_pw)
from deps import get_db
from models import ForgotIn, LoginIn, PasswordIn, ProfileIn, RegisterIn, ResetPasswordIn

router = APIRouter()


@router.post("/api/auth/register")
def auth_register(payload: RegisterIn):
    name = (payload.name or "").strip()[:100]
    cls = (payload.class_name or "").strip()[:50]
    if not name:
        raise HTTPException(400, "Thieu ho ten.")
    if not cls:
        raise HTTPException(400, "Thieu lop.")
    if len(payload.password or "") < 6:
        raise HTTPException(400, "Mat khau it nhat 6 ky tu.")
    phone = norm_phone(payload.phone)
    email = check_email(payload.email)
    if phone == "" and email == "":
        raise HTTPException(400, "Can so dien thoai hoac email (it nhat 1 trong 2).")
    if phone != "" and get_db().q1("SELECT 1 FROM students WHERE phone=?", (phone,)):
        raise HTTPException(400, "So dien thoai da duoc dung.")
    if email != "" and get_db().q1("SELECT 1 FROM students WHERE email=?", (email,)):
        raise HTTPException(400, "Email da duoc dung.")
    dob = check_dob(payload.dob)
    gender = check_gender(payload.gender or "")
    role = "student"
    tc = (payload.teacher_code or "").strip()
    if tc != "":
        expect = os.getenv("TEACHER_CODE", "")
        if expect == "" or not secrets.compare_digest(expect, tc):
            raise HTTPException(400, "Ma giao vien khong dung.")
        role = "teacher"
    now = datetime.now().isoformat(timespec="seconds")
    cur = get_db().exec("INSERT INTO students (name, class_name, dob, gender, phone, email, password_hash, role, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (name, cls, dob, gender, phone or None, email or None, hash_pw(payload.password), role, 1, now))
    sid = cur.lastrowid
    tok = new_session(sid)
    return {"token": tok, "student": public_student(get_db().q1("SELECT * FROM students WHERE id=?", (sid,)))}


@router.post("/api/auth/login")
def auth_login(payload: LoginIn):
    login = (payload.login or "").strip()
    if login == "" or (payload.password or "") == "":
        raise HTTPException(400, "Thieu ten dang nhap hoac mat khau.")
    get_db().exec("DELETE FROM sessions WHERE expires_at < ?", (datetime.now().isoformat(timespec="seconds"),))
    phone = norm_phone(login)
    st = get_db().q1("SELECT * FROM students WHERE phone=? OR email=?", (phone, login))
    if not st or not st["password_hash"] or not verify_pw(payload.password, st["password_hash"]):
        raise HTTPException(401, "Sai ten dang nhap hoac mat khau.")
    if st["active"] is not None and int(st["active"]) == 0:
        raise HTTPException(403, "Tai khoan da bi khoa. Lien he giao vien/quan tri.")
    tok = new_session(st["id"])
    return {"token": tok, "student": public_student(get_db().q1("SELECT * FROM students WHERE id=?", (st["id"],)))}


@router.get("/api/auth/me")
def auth_me(request: Request):
    return {"student": current_student(request)}


@router.post("/api/auth/logout")
def auth_logout(request: Request):
    tok = request.headers.get("x-session-token", "")
    if re.fullmatch(r"[a-f0-9]{64}", tok or ""):
        get_db().exec("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(tok.encode()).hexdigest(),))
    return {"ok": True}


@router.put("/api/auth/profile")
def auth_profile(payload: ProfileIn, request: Request):
    me = current_student(request)
    name = (payload.name if payload.name is not None else me["name"] or "").strip()[:100]
    cls = (payload.class_name if payload.class_name is not None else me["class_name"] or "").strip()[:50]
    if not name:
        raise HTTPException(400, "Thieu ho ten.")
    if not cls:
        raise HTTPException(400, "Thieu lop.")
    phone = norm_phone(payload.phone if payload.phone is not None else me.get("phone") or "")
    email = check_email(payload.email if payload.email is not None else me.get("email") or "")
    if phone == "" and email == "":
        raise HTTPException(400, "Can so dien thoai hoac email (it nhat 1 trong 2).")
    if phone != "" and get_db().q1("SELECT 1 FROM students WHERE phone=? AND id<>?", (phone, me["id"])):
        raise HTTPException(400, "So dien thoai da duoc dung.")
    if email != "" and get_db().q1("SELECT 1 FROM students WHERE email=? AND id<>?", (email, me["id"])):
        raise HTTPException(400, "Email da duoc dung.")
    dob = check_dob(payload.dob if payload.dob is not None else me.get("dob") or "")
    gender = check_gender(payload.gender if payload.gender is not None else me.get("gender") or "")
    get_db().exec("UPDATE students SET name=?, class_name=?, dob=?, gender=?, phone=?, email=? WHERE id=?",
            (name, cls, dob, gender, phone or None, email or None, me["id"]))
    return {"student": public_student(get_db().q1("SELECT * FROM students WHERE id=?", (me["id"],)))}


@router.put("/api/auth/password")
def auth_password(payload: PasswordIn, request: Request):
    me = current_student(request)
    full = get_db().q1("SELECT * FROM students WHERE id=?", (me["id"],))
    if not full["password_hash"] or not verify_pw(payload.old_password or "", full["password_hash"]):
        raise HTTPException(401, "Mat khau cu khong dung.")
    if len(payload.new_password or "") < 6:
        raise HTTPException(400, "Mat khau moi it nhat 6 ky tu.")
    get_db().exec("UPDATE students SET password_hash=? WHERE id=?", (hash_pw(payload.new_password), me["id"]))
    get_db().exec("DELETE FROM sessions WHERE student_id=?", (me["id"],))
    return {"ok": True, "token": new_session(me["id"])}


def _send_reset_email(to_addr: str, code: str) -> bool:
    """Gui ma dat lai mat khau qua SMTP — tra False neu chua cau hinh."""
    host = os.getenv("SMTP_HOST", "").strip()
    if not host:
        return False
    port = int(os.getenv("SMTP_PORT", "587") or 587)
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", user or "no-reply@localhost").strip()
    use_ssl = os.getenv("SMTP_SSL", "0").strip() in ("1", "true", "yes")
    msg = (
        f"From: {sender}\r\nTo: {to_addr}\r\n"
        f"Subject: [OnLuyen HSG] Ma dat lai mat khau\r\n"
        f"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        f"Ma dat lai mat khau cua ban la: {code}\r\n"
        f"Ma co hieu luc 15 phut. Neu khong yeu cau, hay bo qua email nay.\r\n"
    )
    try:
        if use_ssl:
            import smtplib
            with smtplib.SMTP_SSL(host, port, timeout=15) as s:
                if user:
                    s.login(user, password)
                s.sendmail(sender, [to_addr], msg.encode("utf-8"))
        else:
            import smtplib
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls()
                if user:
                    s.login(user, password)
                s.sendmail(sender, [to_addr], msg.encode("utf-8"))
        return True
    except Exception:
        return False


@router.post("/api/auth/forgot-password")
def auth_forgot(payload: ForgotIn):
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Nhap email hop le.")
    st = get_db().q1("SELECT id, email FROM students WHERE LOWER(email)=?", (email,))
    # Luon tra ve thanh cong de khong lo chuong ten email
    if not st:
        return {"ok": True, "sent": False, "message": "Neu email ton tai, chung toi da gui ma."}
    code = secrets.token_hex(4).upper()[:6]
    now = datetime.now()
    expires = (now + timedelta(minutes=15)).isoformat(timespec="seconds")
    get_db().exec(
        "INSERT INTO password_resets (student_id, code, expires_at, created_at) VALUES (?,?,?,?)",
        (st["id"], code, expires, now.isoformat(timespec="seconds")))
    sent = _send_reset_email(st["email"], code)
    return {"ok": True, "sent": sent,
            "message": "Da gui ma qua email." if sent else "Chua cau hinh SMTP — lien he giao vien dat lai mat khau."}


@router.post("/api/auth/reset-password")
def auth_reset_password(payload: ResetPasswordIn):
    email = (payload.email or "").strip().lower()
    code = (payload.code or "").strip().upper()
    new_pw = payload.new_password or ""
    if len(new_pw) < 6:
        raise HTTPException(400, "Mat khau moi it nhat 6 ky tu.")
    st = get_db().q1("SELECT id FROM students WHERE LOWER(email)=?", (email,))
    if not st or not code:
        raise HTTPException(400, "Ma khong dung hoac het han.")
    row = get_db().q1(
        """SELECT * FROM password_resets WHERE student_id=? AND code=? AND used_at IS NULL
           ORDER BY id DESC LIMIT 1""",
        (st["id"], code,))
    if not row:
        raise HTTPException(400, "Ma khong dung hoac da dung.")
    try:
        if datetime.fromisoformat(row["expires_at"]) < datetime.now():
            raise HTTPException(400, "Ma da het han.")
    except HTTPException:
        raise
    except Exception:
        pass
    get_db().exec("UPDATE password_resets SET used_at=? WHERE id=?",
                  (datetime.now().isoformat(timespec="seconds"), row["id"]))
    get_db().exec("UPDATE students SET password_hash=? WHERE id=?", (hash_pw(new_pw), st["id"]))
    get_db().exec("DELETE FROM sessions WHERE student_id=?", (st["id"],))
    return {"ok": True}
