# Smoke test GĐ2–5 — python -X utf8 python-core/smoke_gd.py
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(encoding="utf-8")

import deps  # noqa: E402
from database import DB  # noqa: E402


def main():
    tmp = Path(tempfile.mkdtemp()) / "t.db"
    db = DB(tmp)
    deps.db = db
    print("questions", db.count("questions"))
    lcols = [r[1] for r in db.q("PRAGMA table_info(lessons)")]
    qcols = [r[1] for r in db.q("PRAGMA table_info(questions)")]
    scols = [r[1] for r in db.q("PRAGMA table_info(submissions)")]
    ecols = [r[1] for r in db.q("PRAGMA table_info(exams)")]
    assert "required" in lcols and "advanced" in lcols, lcols
    assert "code" in qcols and "tags" in qcols, qcols
    assert "files" in scols, scols
    assert "shuffle_q" in ecols, ecols
    for t in ("grade_history", "materials", "notifications", "password_resets", "role_permissions"):
        assert db.q1(f"SELECT name FROM sqlite_master WHERE name='{t}'"), t
    print("migrations OK")
    nperm = db.count("role_permissions")
    assert nperm > 0, "role_permissions seed empty"
    print("role_permissions rows", nperm)

    # seed 1 teacher + 1 student + 1 super_admin trên DB tạm
    import auth as auth_mod
    now = __import__("datetime").datetime.now().isoformat(timespec="seconds")
    cur = db.exec(
        "INSERT INTO students (name, class_name, email, password_hash, role, active, created_at) VALUES (?,?,?,?,?,?,?)",
        ("GV Test", "12A", "gv@test.local", auth_mod.hash_pw("Gv@123456"), "teacher", 1, now))
    tid_gv = cur.lastrowid
    db.exec(
        "INSERT INTO students (name, class_name, email, password_hash, role, active, created_at) VALUES (?,?,?,?,?,?,?)",
        ("HS Test", "12A", "hs@test.local", auth_mod.hash_pw("Hs@123456"), "student", 1, now))
    hs_id = db.q1("SELECT id FROM students WHERE email='hs@test.local'")["id"]
    db.exec(
        "INSERT INTO students (name, class_name, email, password_hash, role, active, created_at) VALUES (?,?,?,?,?,?,?)",
        ("SA Test", "12A", "sa@test.local", auth_mod.hash_pw("Sup@123456"), "super_admin", 1, now))
    sa_id = db.q1("SELECT id FROM students WHERE email='sa@test.local'")["id"]
    cur_c = db.exec("INSERT INTO classes (name, join_code, created_at) VALUES (?,?,?)",
                    ("Lop smoke", "SMOKEGD", now))
    cid = cur_c.lastrowid
    db.exec("INSERT INTO class_members (class_id, user_id, joined_at) VALUES (?,?,?)",
            (cid, hs_id, now))

    from fastapi.testclient import TestClient
    from app import build_app

    app = build_app()
    client = TestClient(app)
    r = client.post("/api/auth/login", json={"login": "gv@test.local", "password": "Gv@123456"})
    print("login", r.status_code)
    tok = r.json().get("token", "")
    H = {"X-Session-Token": tok}
    role = r.json().get("student", {}).get("role", "")

    subj = client.get("/api/subjects").json()
    sid = subj[0]["id"] if subj else "ly"
    tr = client.post("/api/topics", json={"subject_id": sid, "name": "TEST-CD-GD", "grade": 12, "description": "d"}, headers=H)
    print("create topic", tr.status_code, tr.json())
    tid = tr.json().get("id") if tr.status_code == 200 else None

    if tid and role in ("teacher", "admin"):
        lr = client.post("/api/lessons", json={"topic_id": tid, "title": "B1", "content": "x", "idx": 1, "required": 1, "advanced": 0}, headers=H)
        print("create lesson", lr.status_code, lr.json())
        lid = lr.json()["id"]

        ur = client.put(f"/api/lessons/{lid}", json={"title": "B1-edit", "required": 1, "advanced": 1}, headers=H)
        print("update lesson", ur.status_code, ur.json())

        mr = client.post(f"/api/lessons/{lid}/move?direction=up", headers=H)
        print("move lesson", mr.status_code, mr.json())

        ll = client.get(f"/api/lessons?topic_id={tid}", headers=H)
        body = ll.json()
        print("lessons payload keys", sorted(body.keys()) if isinstance(body, dict) else type(body))
        assert isinstance(body, dict) and "lessons" in body

        qr = client.post("/api/questions", json={
            "subject_id": sid, "content": "Cau test tag", "options": ["a", "b"],
            "correct_answer": "A", "qtype": "trac_nghiem", "grade": 12,
            "difficulty": "van dung", "score": 1, "code": "", "tags": ["test", "gd"],
        }, headers=H)
        print("create q", qr.status_code, qr.json())
        qid = qr.json()["id"]
        dr = client.post(f"/api/questions/{qid}/duplicate", headers=H)
        print("dup q", dr.status_code, dr.json())
        assert dr.json().get("code") and dr.json()["code"] != (qr.json().get("code") or "")

        mr2 = client.post("/api/materials", json={"subject_id": sid, "title": "GV PDF", "file_url": "/x.pdf", "file_type": "pdf"}, headers=H)
        print("material", mr2.status_code, mr2.json())

        tt = client.get("/api/stats/team-timeline?days=30", headers=H)
        print("timeline", tt.status_code, list(tt.json().keys()) if tt.status_code == 200 else tt.text[:200])

        # PUT topic
        ur2 = client.put(f"/api/topics/{tid}", json={"name": "TEST-CD-GD2", "description": "dd"}, headers=H)
        print("update topic", ur2.status_code, ur2.json())

    nr = client.get("/api/notifications", headers=H)
    print("notifications", nr.status_code, list(nr.json().keys()) if nr.status_code == 200 else nr.text)

    fr = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    print("forgot", fr.status_code, fr.json())

    # --- Super admin + permission matrix (1.7) ---
    sa = client.post("/api/auth/login", json={"login": "sa@test.local", "password": "Sup@123456"})
    print("login super", sa.status_code)
    SH = {"X-Session-Token": sa.json().get("token", "")}
    pm = client.get("/api/permissions", headers=SH)
    print("permissions super", pm.status_code, "can_manage", pm.json().get("can_manage"), "keys", len(pm.json().get("perm_keys") or []))
    assert pm.status_code == 200 and pm.json().get("can_manage") is True
    up = client.put("/api/permissions", json={"role": "teacher", "perms": {"export.reports": 1, "bank.manage": 1}}, headers=SH)
    print("update perms", up.status_code, up.json())

    # teacher khong sua duoc matrix
    pmT = client.get("/api/permissions", headers=H)
    print("permissions teacher can_manage", pmT.json().get("can_manage"))
    assert pmT.json().get("can_manage") is False
    upT = client.put("/api/permissions", json={"role": "student", "perms": {"practice": 1}}, headers=H)
    print("teacher update perms (should 403)", upT.status_code)

    # --- Bulk user (1.15) ---
    bulk1 = client.post("/api/students/bulk", json={"ids": [hs_id], "action": "deactivate"}, headers=SH)
    print("bulk deactivate", bulk1.status_code, bulk1.json())
    assert bulk1.json().get("affected") == 1
    hs_active = db.q1("SELECT active FROM students WHERE id=?", (hs_id,))["active"]
    assert int(hs_active) == 0, hs_active
    bulk2 = client.post("/api/students/bulk", json={"ids": [hs_id], "action": "activate"}, headers=SH)
    print("bulk activate", bulk2.json())
    # teacher khong bulk
    bulkT = client.post("/api/students/bulk", json={"ids": [hs_id], "action": "deactivate"}, headers=H)
    print("teacher bulk (should 403)", bulkT.status_code)
    assert bulkT.status_code == 403

    # bulk set_role super only
    bulkR = client.post("/api/students/bulk", json={"ids": [hs_id], "action": "set_role", "role": "student"}, headers=SH)
    print("bulk set_role", bulkR.status_code, bulkR.json())

    exams_response = client.get("/api/exams?mode=shared", headers=SH)
    assert exams_response.status_code == 200
    exams = exams_response.json()
    if exams:
        e1 = client.get(f"/api/exams/{exams[0]['id']}", headers=SH).json()
        e2 = client.get(f"/api/exams/{exams[0]['id']}", headers=SH).json()
        ids1 = [q["id"] for q in e1.get("questions", [])]
        ids2 = [q["id"] for q in e2.get("questions", [])]
        assert all("correct_answer" not in q and "explanation" not in q for q in e1.get("questions", []))
        print("exam n", len(ids1), "shuffled", e1.get("shuffled"), "same order", ids1 == ids2)

    if tid and role in ("teacher", "admin"):
        dr2 = client.delete(f"/api/topics/{tid}", headers=H)
        print("del topic", dr2.status_code, dr2.json())

    print("SMOKE GD OK")


if __name__ == "__main__":
    main()
