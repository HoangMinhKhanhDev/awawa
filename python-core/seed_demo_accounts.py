# Seed tài khoản demo: 1 giáo viên + 1 học sinh clone (kèm dữ liệu học tập mẫu).
# Chạy: python -X utf8 python-core/seed_demo_accounts.py
import hashlib
import json
import secrets
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = Path(__file__).resolve().parent / "data" / "app.db"


def hash_pw(pw: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"pbkdf2$100000${salt}${dk.hex()}"


def days_ago(n: int) -> str:
    return (datetime.now() - timedelta(days=n)).isoformat(timespec="seconds")


def main():
    import sqlite3

    if not DB_PATH.exists():
        print(f"Không thấy DB: {DB_PATH} — hãy chạy server 1 lần trước.")
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    cur = db.cursor()

    # Đảm bảo schema Phase 1a có sẵn khi seed chạy độc lập
    cols = {r[1] for r in cur.execute("PRAGMA table_info(students)").fetchall()}
    if "active" not in cols:
        cur.execute("ALTER TABLE students ADD COLUMN active INTEGER DEFAULT 1")
    for ddl in (
        """CREATE TABLE IF NOT EXISTS school_years (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
          start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
          is_current INTEGER DEFAULT 0, created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS grades (
          id INTEGER PRIMARY KEY AUTOINCREMENT, school_year_id INTEGER,
          name TEXT NOT NULL, code TEXT DEFAULT '', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY AUTOINCREMENT, school_year_id INTEGER,
          grade_id INTEGER, subject_id TEXT, name TEXT NOT NULL,
          description TEXT DEFAULT '', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS team_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL, member_role TEXT DEFAULT 'student',
          joined_at TEXT, left_at TEXT,
          UNIQUE (team_id, user_id, member_role))""",
    ):
        cur.execute(ddl)
    db.commit()

    # --- Lấy class mặc định ---
    cl = cur.execute("SELECT id FROM classes ORDER BY id LIMIT 1").fetchone()
    if not cl:
        cur.execute("INSERT INTO classes (name, join_code, created_at) VALUES (?,?,?)",
                    ("Lớp bồi dưỡng HSG", "HSG2026", days_ago(30)))
        class_id = cur.lastrowid
    else:
        class_id = cl["id"]

    # --- Giáo viên demo ---
    t_login = "0900000001"
    t_email = "giaovien@hsg.local"
    t_pw = "Gv@123456"
    existing_t = cur.execute(
        "SELECT id FROM students WHERE phone=? OR email=?", (t_login, t_email)
    ).fetchone()
    if existing_t:
        teacher_id = existing_t["id"]
        cur.execute("UPDATE students SET role='teacher', password_hash=?, name=? WHERE id=?",
                    (hash_pw(t_pw), "Cô Trần Thị Giảng", teacher_id))
        print("Đã cập nhật giáo viên demo.")
    else:
        cur.execute(
            """INSERT INTO students (name, class_name, team, note, dob, gender, phone, email,
               password_hash, role, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            ("Cô Trần Thị Giảng", "GV", "Ban HSG", "Tài khoản demo giáo viên",
             "1990-05-12", "Nữ", t_login, t_email, hash_pw(t_pw), "teacher", days_ago(40)),
        )
        teacher_id = cur.lastrowid
        print("Đã tạo giáo viên demo.")

    # --- Học sinh clone ---
    s_login = "0911111111"
    s_email = "nguyenvana@hsg.local"
    s_pw = "Hs@123456"
    existing_s = cur.execute(
        "SELECT id FROM students WHERE phone=? OR email=?", (s_login, s_email)
    ).fetchone()
    if existing_s:
        student_id = existing_s["id"]
        cur.execute(
            """UPDATE students SET name=?, class_name=?, team=?, role='student',
               password_hash=?, email=?, phone=? WHERE id=?""",
            ("Nguyễn Văn A", "11A1", "HSG Vật lý", hash_pw(s_pw), s_email, s_login, student_id),
        )
        print("Đã cập nhật học sinh clone.")
    else:
        cur.execute(
            """INSERT INTO students (name, class_name, team, note, dob, gender, phone, email,
               password_hash, role, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            ("Nguyễn Văn A", "11A1", "HSG Vật lý", "Học sinh clone demo",
             "2010-09-09", "Nam", s_login, s_email, hash_pw(s_pw), "student", days_ago(20)),
        )
        student_id = cur.lastrowid
        print("Đã tạo học sinh clone.")

    # Vào lớp
    cur.execute(
        "INSERT OR IGNORE INTO class_members (class_id, user_id, joined_at) VALUES (?,?,?)",
        (class_id, student_id, days_ago(18)),
    )

    # --- Bài tập mẫu (nếu chưa có) ---
    topics = [
        ("ly-dao-dong", "Bài tập Dao động 01"),
        ("ly-dao-dong", "Bài tập Dao động 02"),
        ("ly-dao-dong", "Bài tập Dao động 03"),
        ("ly-dien", "Bài tập Sóng cơ"),
        ("ly-dien", "Bài tập Điện xoay chiều"),
        ("toan-hamso", "Bài tập Nhiệt 01"),
        ("toan-hamso", "Bài tập Nhiệt 02"),
    ]
    assignment_ids = []
    for topic_id, title in topics:
        row = cur.execute(
            "SELECT id FROM assignments WHERE class_id=? AND title=?", (class_id, title)
        ).fetchone()
        if row:
            assignment_ids.append(row["id"])
        else:
            cur.execute(
                """INSERT INTO assignments (class_id, topic_id, title, description, deadline,
                   created_by, created_at) VALUES (?,?,?,?,?,?,?)""",
                (class_id, topic_id, title, "Bài tập mẫu cho demo Profile.", None,
                 teacher_id, days_ago(14)),
            )
            assignment_ids.append(cur.lastrowid)
    print(f"Đã giao {len(assignment_ids)} bài tập.")

    # --- Nộp bài + điểm ---
    # (assignment_index, score or None, days_ago_submitted, feedback)
    submissions = [
        (0, 9.0, 12, "Rất tốt — nắm chắc dao động điều hòa."),
        (1, 8.0, 10, "Đúng phần lớn, chú ý biên độ."),
        (2, 8.5, 6, "Bài clean, trình bày rõ."),
        (3, 8.2, 5, "Sóng cơ ổn, cần chắc phương trình sóng."),
        (4, 7.6, 4, "Điện còn lẫn pha — luyện thêm."),
        (5, 6.8, 3, "Nhiệt yếu — cần củng cố định luật nóng chảy."),
        (6, None, 1, ""),  # chờ chấm
    ]
    for idx, score, dsub, fb in submissions:
        if idx >= len(assignment_ids):
            break
        aid = assignment_ids[idx]
        existing = cur.execute(
            "SELECT id FROM submissions WHERE assignment_id=? AND student_id=?",
            (aid, student_id),
        ).fetchone()
        if existing:
            cur.execute(
                """UPDATE submissions SET score=?, feedback=?, submitted_at=?, graded_at=?
                   WHERE id=?""",
                (score, fb, days_ago(dsub), days_ago(max(0, dsub - 1)) if score is not None else None,
                 existing["id"]),
            )
        else:
            cur.execute(
                """INSERT INTO submissions (assignment_id, student_id, answer, score, feedback,
                   submitted_at, graded_at) VALUES (?,?,?,?,?,?,?)""",
                (aid, student_id, json.dumps(["demo"]), score, fb, days_ago(dsub),
                 days_ago(max(0, dsub - 1)) if score is not None else None),
            )
    print("Đã seed submissions.")

    # --- Attempts (luyện tập / thi thử) ---
    if cur.execute("SELECT COUNT(*) c FROM attempts WHERE student_id=?", (student_id,)).fetchone()["c"] == 0:
        samples = [
            ("practice", 11, 12, 12),
            ("exam", 9, 10, 8),
            ("practice", 8, 10, 6),
            ("exam", 7, 10, 4),
        ]
        for mode, correct, total, d in samples:
            cur.execute(
                """INSERT INTO attempts (exam_id, mode, correct, total, accuracy, detail,
                   student_name, student_id, focus_exits, focus_log, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (None, mode, correct, total, round(correct / total, 4),
                 json.dumps([]), "Nguyễn Văn A", student_id, 0, json.dumps([]), days_ago(d)),
            )
        print("Đã seed attempts.")

    # --- Admin demo ---
    a_login = "0900000000"
    a_email = "admin@hsg.local"
    a_pw = "Adm@123456"
    existing_a = cur.execute(
        "SELECT id FROM students WHERE phone=? OR email=?", (a_login, a_email)
    ).fetchone()
    if existing_a:
        admin_id = existing_a["id"]
        cur.execute(
            "UPDATE students SET role='admin', active=1, password_hash=?, name=? WHERE id=?",
            (hash_pw(a_pw), "Quản trị Trường", admin_id),
        )
        print("Đã cập nhật admin demo.")
    else:
        cur.execute(
            """INSERT INTO students (name, class_name, team, note, dob, gender, phone, email,
               password_hash, role, active, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("Quản trị Trường", "ADMIN", "", "Tài khoản admin demo",
             "1985-01-01", "Khác", a_login, a_email, hash_pw(a_pw), "admin", 1, days_ago(45)),
        )
        admin_id = cur.lastrowid
        print("Đã tạo admin demo.")

    # --- Super admin demo (1.7) ---
    sa_login = "0900000009"
    sa_email = "super@hsg.local"
    sa_pw = "Sup@123456"
    existing_sa = cur.execute(
        "SELECT id FROM students WHERE phone=? OR email=?", (sa_login, sa_email)
    ).fetchone()
    if existing_sa:
        super_id = existing_sa["id"]
        cur.execute(
            "UPDATE students SET role='super_admin', active=1, password_hash=?, name=? WHERE id=?",
            (hash_pw(sa_pw), "Super Admin", super_id),
        )
        print("Đã cập nhật super admin demo.")
    else:
        cur.execute(
            """INSERT INTO students (name, class_name, team, note, dob, gender, phone, email,
               password_hash, role, active, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("Super Admin", "ADMIN", "", "Super admin demo — sửa ma trận phân quyền",
             "1980-01-01", "Khác", sa_login, sa_email, hash_pw(sa_pw), "super_admin", 1, days_ago(50)),
        )
        super_id = cur.lastrowid
        print("Đã tạo super admin demo.")

    # --- Cấu trúc nhà trường ---
    now = days_ago(0)
    y = cur.execute("SELECT id FROM school_years WHERE is_current=1 LIMIT 1").fetchone()
    if not y:
        yid = None
    else:
        yid = y["id"]
    if yid is None:
        cur.execute(
            "INSERT INTO school_years (name, start_date, end_date, is_current, created_at) VALUES (?,?,?,?,?)",
            ("2026-2027", "2026-09-01", "2027-05-31", 1, now),
        )
        yid = cur.lastrowid
    grades = [("Khối 10", "10"), ("Khối 11", "11"), ("Khối 12", "12")]
    grade_ids = {}
    for gname, gcode in grades:
        row = cur.execute(
            "SELECT id FROM grades WHERE school_year_id=? AND code=?", (yid, gcode)
        ).fetchone()
        if row:
            grade_ids[gcode] = row["id"]
        else:
            cur.execute(
                "INSERT INTO grades (school_year_id, name, code, created_at) VALUES (?,?,?,?)",
                (yid, gname, gcode, now),
            )
            grade_ids[gcode] = cur.lastrowid

    teams_def = [
        ("HSG Vật lý", "ly"),
        ("Nông nghiệp", "cn-nong"),
        ("Chăn nuôi", "cn-chan"),
        ("Lâm nghiệp – Thủy sản", "cn-lamthuy"),
    ]
    team_ids = {}
    for tname, subj in teams_def:
        row = cur.execute(
            "SELECT id FROM teams WHERE school_year_id=? AND name=?", (yid, tname)
        ).fetchone()
        if row:
            team_ids[tname] = row["id"]
        else:
            cur.execute(
                "INSERT INTO teams (school_year_id, grade_id, subject_id, name, created_at) VALUES (?,?,?,?,?)",
                (yid, grade_ids.get("11"), subj, tname, now),
            )
            team_ids[tname] = cur.lastrowid

    # Coach: giáo viên demo phụ trách HSG Vật lý + 3 đội CN
    for tname in team_ids:
        cur.execute(
            """INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at, left_at)
               VALUES (?,?, 'coach', ?, NULL)""",
            (team_ids[tname], teacher_id, now),
        )

    # HS clone vào HSG Vật lý
    if "HSG Vật lý" in team_ids:
        cur.execute(
            """INSERT OR IGNORE INTO team_members (team_id, user_id, member_role, joined_at, left_at)
               VALUES (?,?, 'student', ?, NULL)""",
            (team_ids["HSG Vật lý"], student_id, now),
        )
        cur.execute("UPDATE students SET team=?, active=1 WHERE id=?",
                    ("HSG Vật lý", student_id))
        cur.execute("UPDATE students SET active=1 WHERE id=?", (teacher_id,))
    print("Đã seed cấu trúc nhà trường + phân quyền đội.")

    db.commit()
    db.close()

    print("\n=== TÀI KHOẢN DEMO ===")
    print("SUPER ADMIN (sửa ma trận phân quyền):")
    print(f"  Đăng nhập : {sa_login}")
    print(f"  hoặc email: {sa_email}")
    print(f"  Mật khẩu  : {sa_pw}")
    print("ADMIN (bản quản trị):")
    print(f"  Đăng nhập : {a_login}")
    print(f"  hoặc email: {a_email}")
    print(f"  Mật khẩu  : {a_pw}")
    print("GIÁO VIÊN (bản giáo viên):")
    print(f"  Đăng nhập : {t_login}")
    print(f"  hoặc email: {t_email}")
    print(f"  Mật khẩu  : {t_pw}")
    print("HỌC SINH clone (bản học sinh):")
    print(f"  Đăng nhập : {s_login}")
    print(f"  hoặc email: {s_email}")
    print(f"  Mật khẩu  : {s_pw}")
    print("  Lớp 11A1 · Đội HSG Vật lý · mã lớp HSG2026")


if __name__ == "__main__":
    main()
