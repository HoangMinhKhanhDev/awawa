import hashlib
import os
import re
import secrets
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from auth import (check_dob, check_email, check_gender, current_student, hash_pw,
                   new_session, norm_phone, optional_session, public_student,
                   verify_pw)
from deps import get_db
from models import LoginIn, PasswordIn, ProfileIn, RegisterIn

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
