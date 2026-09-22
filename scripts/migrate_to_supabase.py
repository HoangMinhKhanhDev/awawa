"""Chuyển dữ liệu từ SQLite local (python-core/data/app.db) lên Supabase.

Chỉ dùng thư viện chuẩn Python (sqlite3, json, urllib) — không cần pip.

Cách dùng (chạy trên máy bạn, key service_role CHỈ dùng ở đây, không đưa lên web):
    python scripts/migrate_to_supabase.py --db python-core/data/app.db --url https://xyzcompany.supabase.co --key SERVICE_ROLE_KEY

An toàn chạy lại nhiều lần: subjects/topics upsert theo id, các bảng còn lại
bỏ qua bản ghi đã có cùng id.
"""
import argparse
import json
import sqlite3
import sys
import urllib.request
import urllib.error


def rest(url, key, table, rows, upsert=False):
    if not rows:
        return 0
    endpoint = f"{url}/rest/v1/{table}"
    if upsert:
        endpoint += "?on_conflict=id"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal" if upsert else "return=minimal",
    }
    done = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i:i + 100]
        req = urllib.request.Request(
            endpoint, data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"),
            headers=headers, method="POST",
        )
        try:
            with urllib.request.urlopen(req) as res:
                if res.status in (200, 201, 204):
                    done += len(chunk)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")[:500]
            print(f"[lỗi] {table} lô {i // 100 + 1}: HTTP {e.code}: {body}")
        except Exception as e:
            print(f"[lỗi] {table} lô {i // 100 + 1}: {e}")
    return done


def cloud_ids(base, key, table, idcol="id"):
    """Tập id đã có trên cloud để bỏ qua khi đẩy lại."""
    try:
        req = urllib.request.Request(
            f"{base}/rest/v1/{table}?select={idcol}&limit=5000",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(req) as res:
            return {r[idcol] for r in json.loads(res.read().decode("utf-8"))}
    except Exception as e:
        print(f"[cảnh báo] không đọc được {table} trên cloud: {e}; sẽ đẩy toàn bộ")
        return set()


def rows_of(conn, sql):
    conn.row_factory = sqlite3.Row
    return [dict(r) for r in conn.execute(sql).fetchall()]


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    try:
        p = json.loads(v)
        return p if isinstance(p, list) else []
    except Exception:
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="python-core/data/app.db")
    ap.add_argument("--url", required=True, help="Supabase project URL")
    ap.add_argument("--key", required=True, help="service_role key (chỉ chạy local)")
    args = ap.parse_args()

    base = args.url.rstrip("/")
    try:
        conn = sqlite3.connect(args.db)
    except Exception as e:
        print(f"Không mở được DB {args.db}: {e}")
        sys.exit(1)

    # DB cũ có thể chưa có cột image_url
    qcols = {r[1] for r in conn.execute("PRAGMA table_info(questions)").fetchall()}

    subjects = rows_of(conn, "SELECT id, name, code FROM subjects")
    print(f"subjects: {rest(base, args.key, 'subjects', subjects, upsert=True)}")

    topics = rows_of(conn, "SELECT id, subject_id, name, grade FROM topics")
    print(f"topics: {rest(base, args.key, 'topics', topics, upsert=True)}")

    have_q = cloud_ids(base, args.key, "questions")
    questions = []
    for r in rows_of(conn, "SELECT * FROM questions"):
        if r["id"] in have_q:
            continue
        questions.append({
            "id": r["id"], "subject_id": r["subject_id"], "topic_id": r["topic_id"],
            "grade": r["grade"], "difficulty": r["difficulty"], "qtype": r["qtype"],
            "content": r["content"], "options": as_list(r["options"]),
            "correct_answer": r["correct_answer"] or "", "explanation": r["explanation"] or "",
            "score": r["score"] or 1, "source": r.get("source") or "mẫu",
            "image_url": (r.get("image_url") or "") if "image_url" in qcols else "",
        })
    print(f"questions: {rest(base, args.key, 'questions', questions)}")

    try:
        all_students = rows_of(conn, "SELECT id, name, class_name, team, note FROM students")
    except sqlite3.OperationalError:
        all_students = []
    have_s = cloud_ids(base, args.key, "students")
    students = [{
        "id": r["id"], "name": r["name"], "class_name": r.get("class_name") or "",
        "team": r.get("team") or "", "note": r.get("note") or "",
    } for r in all_students if r["id"] not in have_s]
    print(f"students: {rest(base, args.key, 'students', students)}")

    have_e = cloud_ids(base, args.key, "exams")
    exams = [{
        "id": r["id"], "title": r["title"], "mode": r["mode"],
        "duration_min": r["duration_min"], "question_ids": as_list(r["question_ids"]),
    } for r in rows_of(conn, "SELECT * FROM exams") if r["id"] not in have_e]
    print(f"exams: {rest(base, args.key, 'exams', exams)}")

    have_a = cloud_ids(base, args.key, "attempts")
    attempts = [{
        "id": r["id"], "exam_id": r["exam_id"], "mode": r["mode"],
        "correct": r["correct"] or 0, "total": r["total"] or 0,
        "accuracy": r["accuracy"] or 0, "detail": as_list(r["detail"]),
        "student_name": r.get("student_name") or "",
        "focus_exits": r.get("focus_exits") or 0,
        "focus_log": as_list(r.get("focus_log")),
    } for r in rows_of(conn, "SELECT * FROM attempts") if r["id"] not in have_a]
    print(f"attempts: {rest(base, args.key, 'attempts', attempts)}")

    conn.close()
    print("XONG.")


if __name__ == "__main__":
    main()
